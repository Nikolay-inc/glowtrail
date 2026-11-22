// SaveService — единая точка сохранения игры: load/save и версия формата.
// Сейчас данные лежат в localStorage; чтобы перейти на облако, достаточно подменить бэкенд
// (setBackend) на реализацию с тем же интерфейсом — остальной код игры не меняется.

export const SAVE_VERSION = 2;
export const SAVE_KEY = 'glowtrail.save';
/** Старый формат (до SaveService): прогресс и лог лежали в двух ключах. */
export const LEGACY_KEYS = { progress: 'glowtrail.progress.v1', log: 'glowtrail.log.v1' } as const;
export const MAX_LOG = 2000;

export interface Progress {
  /** Номер максимального открытого уровня. */
  unlocked: number;
  /** Лучшие звёзды по уровням. */
  stars: Record<number, number>;
  /** Сколько раз начинали каждый уровень. */
  attempts: Record<number, number>;
  /** Поражений подряд на уровне (сбрасывается победой). */
  lossStreak: Record<number, number>;
  /** Пропущенные уровни. */
  skipped: Record<number, boolean>;
  muted: boolean;
}

export type EventType = 'session' | 'start' | 'win' | 'lose' | 'abandon' | 'hint_used' | 'extra_tiles' | 'auto_ease' | 'level_skipped';

export interface LogEvent {
  /** Время события, ISO. */
  t: string;
  ev: EventType;
  level?: number;
  attempt?: number;
  /** Длительность попытки, мс. */
  ms?: number;
  moves?: number;
  stars?: number;
  tilesLeft?: number;
  /** Сколько раз отменяли ход за попытку. */
  undos?: number;
  /** Устаревшее поле старого формата: была ли отмена. */
  undo?: boolean;
  /** Серия поражений подряд на момент события. */
  streak?: number;
  /** Сколько плиток добавлено (extra_tiles, auto_ease). */
  added?: number;
  /** На сколько ходов откатились (hint_used, extra_tiles). */
  rollback?: number;
}

export interface SaveData {
  version: number;
  progress: Progress;
  log: LogEvent[];
}

/** Хранилище «ключ → строка». localStorage сейчас, облако потом. */
export interface SaveBackend {
  read(key: string): string | null;
  write(key: string, value: string): void;
  remove(key: string): void;
}

/** localStorage; если он недоступен (приватный режим), игра работает без сохранения. */
export const localStorageBackend: SaveBackend = {
  read(key) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  write(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* хранилище недоступно — молча продолжаем */
    }
  },
  remove(key) {
    try {
      localStorage.removeItem(key);
    } catch {
      /* ничего */
    }
  },
};

/** Хранилище в памяти — для тестов. */
export function memoryBackend(initial: Record<string, string> = {}): SaveBackend & { dump(): Record<string, string> } {
  const mem = new Map(Object.entries(initial));
  return {
    read: (k) => mem.get(k) ?? null,
    write: (k, v) => void mem.set(k, v),
    remove: (k) => void mem.delete(k),
    dump: () => Object.fromEntries(mem),
  };
}

export const defaultProgress = (): Progress => ({ unlocked: 1, stars: {}, attempts: {}, lossStreak: {}, skipped: {}, muted: false });

export const emptySave = (): SaveData => ({ version: SAVE_VERSION, progress: defaultProgress(), log: [] });

function parse(raw: string | null): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Приводит прогресс любого известного формата к текущему (лишние поля, например подсказки v1, отбрасываются). */
function normalizeProgress(raw: unknown): Progress {
  const p = defaultProgress();
  if (!isObj(raw)) return p;
  if (typeof raw.unlocked === 'number' && raw.unlocked >= 1) p.unlocked = Math.floor(raw.unlocked);
  for (const key of ['stars', 'attempts', 'lossStreak', 'skipped'] as const) {
    if (isObj(raw[key])) (p as unknown as Record<string, unknown>)[key] = { ...(raw[key] as object) };
  }
  if (typeof raw.muted === 'boolean') p.muted = raw.muted;
  return p;
}

function normalizeLog(raw: unknown): LogEvent[] {
  return Array.isArray(raw) ? raw.filter((e): e is LogEvent => isObj(e) && typeof e.ev === 'string').slice(-MAX_LOG) : [];
}

/**
 * Миграция: из сырых данных любой версии делает SaveData текущей версии.
 * v1 — два ключа localStorage (glowtrail.progress.v1 и glowtrail.log.v1), без поля version.
 * v2 — один объект { version: 2, progress, log }.
 */
export function migrate(raw: unknown, legacy?: { progress: unknown; log: unknown }): SaveData {
  if (isObj(raw) && typeof raw.version === 'number') {
    // Будущие версии: здесь добавятся шаги «vN → vN+1».
    return { version: SAVE_VERSION, progress: normalizeProgress(raw.progress), log: normalizeLog(raw.log) };
  }
  if (legacy && (legacy.progress !== null || legacy.log !== null)) {
    return { version: SAVE_VERSION, progress: normalizeProgress(legacy.progress), log: normalizeLog(legacy.log) };
  }
  return emptySave();
}

class SaveServiceImpl {
  private backend: SaveBackend = localStorageBackend;
  private cache: SaveData | null = null;

  /** Подменить хранилище (облако, тесты). Сбрасывает кэш. */
  setBackend(backend: SaveBackend) {
    this.backend = backend;
    this.cache = null;
  }

  /** Загружает сохранение (из кэша, если уже загружено). Старый формат мигрирует и сразу пересохраняет. */
  load(): SaveData {
    if (this.cache) return this.cache;
    const raw = parse(this.backend.read(SAVE_KEY));
    let data: SaveData;
    if (raw !== null) {
      data = migrate(raw);
    } else {
      const legacy = { progress: parse(this.backend.read(LEGACY_KEYS.progress)), log: parse(this.backend.read(LEGACY_KEYS.log)) };
      data = migrate(null, legacy);
      // Старые ключи не удаляем: если что-то пойдёт не так, данные не пропадут.
      if (legacy.progress !== null || legacy.log !== null) this.write(data);
    }
    this.cache = data;
    return data;
  }

  save(data: SaveData) {
    const d = { ...data, version: SAVE_VERSION, log: data.log.slice(-MAX_LOG) };
    this.cache = d;
    this.write(d);
  }

  /** Изменить сохранение функцией и записать. */
  update(fn: (data: SaveData) => void): SaveData {
    const d = structuredCloneSafe(this.load());
    fn(d);
    this.save(d);
    return d;
  }

  /** Стереть всё (кнопка «Сбросить всё»). */
  reset() {
    this.backend.remove(SAVE_KEY);
    this.backend.remove(LEGACY_KEYS.progress);
    this.backend.remove(LEGACY_KEYS.log);
    this.cache = null;
  }

  private write(d: SaveData) {
    this.backend.write(SAVE_KEY, JSON.stringify(d));
  }
}

function structuredCloneSafe<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}

export const SaveService = new SaveServiceImpl();
