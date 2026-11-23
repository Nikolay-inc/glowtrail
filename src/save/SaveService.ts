// SaveService — единая точка сохранения игры: load/save и версия формата.
// Сейчас данные лежат в localStorage; чтобы перейти на облако, достаточно подменить бэкенд
// (setBackend) на реализацию с тем же интерфейсом — остальной код игры не меняется.

export const SAVE_VERSION = 3;
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
  /** Вибрация (настройка устройства, в облако не уходит). */
  vibration: boolean;
}

/**
 * Профиль игрока. Локальный, но готов к привязке облачного аккаунта: playerId — постоянный
 * случайный UUID, по нему профиль потом свяжется с аккаунтом на сервере.
 */
export interface Profile {
  playerId: string;
  /** Имя, которое ввёл игрок; null — не задано (показываем «Путник»). */
  name: string | null;
  /** Номер аватарки (0–7). */
  avatar: number;
  createdAt: string;
  /** Окно «Как тебя зовут?» уже показывали. */
  nameAsked: boolean;
  /** Предложение войти или зарегистрироваться уже показывали (после первой победы). */
  authPrompted: boolean;
  /** Обучение (вступление и уровни 1–3) пройдено. */
  tutorialDone: boolean;
  /** Какие подсказки Lumo уже показывали (каждая — один раз). */
  tipsSeen: string[];
  /** Сколько раз игрок пользовался подсказкой. */
  hintsUsed: number;
  /** Последний день игры (YYYY-MM-DD по местному времени). */
  lastPlayDay: string | null;
  /** Серия дней подряд. */
  dayStreak: number;
  bestDayStreak: number;
}

export type EventType = 'session' | 'start' | 'win' | 'lose' | 'abandon' | 'hint_used' | 'extra_tiles' | 'auto_ease' | 'level_skipped' | 'signup' | 'login' | 'logout' | 'auth_prompt' | 'tutorial_step' | 'tip_shown' | 'drag_place' | 'tap_place' | 'door_locked_attempt';

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
  /** Шаг обучения (tutorial_step). */
  step?: string;
  /** Какая подсказка показана (tip_shown). */
  tip?: string;
  /** Серия поражений подряд на момент события. */
  streak?: number;
  /** Сколько плиток добавлено (extra_tiles, auto_ease). */
  added?: number;
  /** На сколько ходов откатились (hint_used, extra_tiles). */
  rollback?: number;
}

export interface SaveData {
  version: number;
  profile: Profile;
  progress: Progress;
  log: LogEvent[];
}

/** Хранилище «ключ → строка». localStorage сейчас, облако потом. */
export interface SaveBackend {
  read(key: string): string | null;
  write(key: string, value: string): void;
  remove(key: string): void;
  /** Дописать отложенные записи на диск (приложение уходит в фон). */
  flush?(): Promise<void>;
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

export const defaultProgress = (): Progress => ({ unlocked: 1, stars: {}, attempts: {}, lossStreak: {}, skipped: {}, muted: false, vibration: true });

/** Случайный UUID v4 (crypto.randomUUID, если есть). */
export function newPlayerId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  } catch {
    /* нет crypto — ниже запасной вариант */
  }
  const hex = (n: number) => Array.from({ length: n }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  return `${hex(8)}-${hex(4)}-4${hex(3)}-${'89ab'[Math.floor(Math.random() * 4)]}${hex(3)}-${hex(12)}`;
}

export const defaultProfile = (): Profile => ({
  playerId: newPlayerId(),
  name: null,
  avatar: 0,
  createdAt: new Date().toISOString(),
  nameAsked: false,
  authPrompted: false,
  tutorialDone: false,
  tipsSeen: [],
  hintsUsed: 0,
  lastPlayDay: null,
  dayStreak: 0,
  bestDayStreak: 0,
});

export const emptySave = (): SaveData => ({ version: SAVE_VERSION, profile: defaultProfile(), progress: defaultProgress(), log: [] });

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
  if (typeof raw.vibration === 'boolean') p.vibration = raw.vibration;
  return p;
}

function normalizeProfile(raw: unknown): Profile {
  const p = defaultProfile();
  if (!isObj(raw)) return p;
  if (typeof raw.playerId === 'string' && raw.playerId.length >= 8) p.playerId = raw.playerId;
  if (typeof raw.name === 'string' && raw.name.trim()) p.name = raw.name.trim().slice(0, 16);
  if (typeof raw.avatar === 'number' && raw.avatar >= 0 && raw.avatar < 8) p.avatar = Math.floor(raw.avatar);
  if (typeof raw.createdAt === 'string') p.createdAt = raw.createdAt;
  if (typeof raw.nameAsked === 'boolean') p.nameAsked = raw.nameAsked;
  if (typeof raw.authPrompted === 'boolean') p.authPrompted = raw.authPrompted;
  if (typeof raw.tutorialDone === 'boolean') p.tutorialDone = raw.tutorialDone;
  if (Array.isArray(raw.tipsSeen)) p.tipsSeen = [...new Set(raw.tipsSeen.filter((x): x is string => typeof x === 'string'))];
  for (const key of ['hintsUsed', 'dayStreak', 'bestDayStreak'] as const) {
    if (typeof raw[key] === 'number' && raw[key] >= 0) p[key] = Math.floor(raw[key] as number);
  }
  if (typeof raw.lastPlayDay === 'string') p.lastPlayDay = raw.lastPlayDay;
  return p;
}

function normalizeLog(raw: unknown): LogEvent[] {
  return Array.isArray(raw) ? raw.filter((e): e is LogEvent => isObj(e) && typeof e.ev === 'string').slice(-MAX_LOG) : [];
}

/**
 * Миграция: из сырых данных любой версии делает SaveData текущей версии.
 * v1 — два ключа localStorage (glowtrail.progress.v1 и glowtrail.log.v1), без поля version.
 * v2 — один объект { version: 2, progress, log }.
 * v3 — добавлен раздел profile (playerId, имя, аватарка, серия дней, подсказки).
 * Шаги идут цепочкой: v1 → v2 → v3, поэтому любое старое сохранение доходит до текущей версии.
 */
export function migrate(raw: unknown, legacy?: { progress: unknown; log: unknown }): SaveData {
  let data: Record<string, unknown> | null = null;
  if (isObj(raw) && typeof raw.version === 'number') data = { ...raw };
  else if (legacy && (legacy.progress !== null || legacy.log !== null)) {
    // v1 → v2: два ключа собираем в один объект.
    data = { version: 2, progress: legacy.progress, log: legacy.log };
  }
  if (!data) return emptySave();
  if ((data.version as number) < 3) {
    // v2 → v3: появляется профиль. Число использованных подсказок восстанавливаем по логу.
    const log = normalizeLog(data.log);
    data = { ...data, version: 3, profile: { ...defaultProfile(), hintsUsed: log.filter((e) => e.ev === 'hint_used').length } };
  }
  return {
    version: SAVE_VERSION,
    profile: normalizeProfile(data.profile),
    progress: normalizeProgress(data.progress),
    log: normalizeLog(data.log),
  };
}

class SaveServiceImpl {
  private backend: SaveBackend = localStorageBackend;
  private cache: SaveData | null = null;
  private listeners = new Set<(data: SaveData) => void>();

  /** Подписка на каждое сохранение (облачная синхронизация). Возвращает функцию отписки. */
  subscribe(fn: (data: SaveData) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Заменить сохранение целиком (после слияния с облаком, выхода из аккаунта). */
  replace(data: SaveData) {
    this.save(migrate(JSON.parse(JSON.stringify(data))));
  }

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
      // Сохранение старой версии — сразу пересохраняем в новом формате (playerId должен быть постоянным).
      if (!isObj(raw) || raw.version !== SAVE_VERSION) this.write(data);
    } else {
      const legacy = { progress: parse(this.backend.read(LEGACY_KEYS.progress)), log: parse(this.backend.read(LEGACY_KEYS.log)) };
      data = migrate(null, legacy);
      // Старые ключи не удаляем: если что-то пойдёт не так, данные не пропадут.
      this.write(data); // и для нового игрока: playerId создаётся один раз и сразу сохраняется
    }
    this.cache = data;
    return data;
  }

  save(data: SaveData) {
    const d = { ...data, version: SAVE_VERSION, log: data.log.slice(-MAX_LOG) };
    this.cache = d;
    this.write(d);
    for (const fn of this.listeners) fn(d);
  }

  /** Изменить сохранение функцией и записать. */
  update(fn: (data: SaveData) => void): SaveData {
    const d = structuredCloneSafe(this.load());
    fn(d);
    this.save(d);
    return d;
  }

  /** Дописать сохранение на диск сейчас (перед уходом приложения в фон). */
  flush(): Promise<void> {
    return this.backend.flush?.() ?? Promise.resolve();
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
