// SaveService — единая точка сохранения игры: load/save и версия формата.
// Сейчас данные лежат в localStorage; чтобы перейти на облако, достаточно подменить бэкенд
// (setBackend) на реализацию с тем же интерфейсом — остальной код игры не меняется.

export const SAVE_VERSION = 4;
export const SAVE_KEY = 'glowtrail.save';
/** Старый формат (до SaveService): прогресс и лог лежали в двух ключах. */
export const LEGACY_KEYS = { progress: 'glowtrail.progress.v1', log: 'glowtrail.log.v1' } as const;
export const MAX_LOG = 2000;

/** Все записи прогресса — по постоянному id уровня («valley-07»), а не по номеру. */
export interface Progress {
  /** Открытые уровни (id). Первый уровень открыт всегда. */
  unlocked: string[];
  /** Лучшие звёзды по уровням. */
  stars: Record<string, number>;
  /** Сколько раз начинали каждый уровень. */
  attempts: Record<string, number>;
  /** Поражений подряд на уровне (сбрасывается победой). */
  lossStreak: Record<string, number>;
  /** Пропущенные уровни. */
  skipped: Record<string, boolean>;
  /** Лучший сбор светлячков на уровне. */
  fireflies: Record<string, number>;
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

export type EventType = 'session' | 'start' | 'win' | 'lose' | 'abandon' | 'hint_used' | 'extra_tiles' | 'auto_ease' | 'level_skipped' | 'signup' | 'login' | 'logout' | 'auth_prompt' | 'tutorial_step' | 'tip_shown' | 'drag_place' | 'tap_place' | 'door_locked_attempt' | 'fireflies_collected';

export interface LogEvent {
  /** Время события, ISO. */
  t: string;
  ev: EventType;
  /** id уровня («valley-07»); в старых записях был номер — миграция переводит его в id. */
  level?: string;
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
  /** Светлячков собрано и всего на уровне (fireflies_collected). */
  fireflies?: number;
  firefliesTotal?: number;
  /** Метрики уровня на старте попытки: рейтинг сложности 1–10, доля тупиковых ходов, решений. */
  rating?: number;
  trap?: number;
  roads?: number;
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

/** Первый уровень игры — открыт всегда. */
export const FIRST_LEVEL_ID = 'valley-01';

export const defaultProgress = (): Progress => ({ unlocked: [FIRST_LEVEL_ID], stars: {}, attempts: {}, lossStreak: {}, skipped: {}, fireflies: {}, muted: false, vibration: true });

/**
 * До версии 4 уровни хранились по номеру 1, 2, 3… Это уровни первого мира «Долина» — они остались на своих местах,
 * поэтому номер N превращается в id «valley-NN».
 */
export function legacyLevelId(n: number): string {
  return `valley-${String(n).padStart(2, '0')}`;
}

/** Ключ уровня из записи любого формата: номер (старый) → id, строка-id остаётся как есть. */
function levelKey(k: string | number): string | null {
  const s = String(k);
  if (/^\d+$/.test(s)) return Number(s) >= 1 ? legacyLevelId(Number(s)) : null;
  return /^[a-z]+-\d+$/.test(s) ? s : null;
}

function remapRecord<T>(raw: Record<string, unknown>, ok: (v: unknown) => v is T, combine: (a: T, b: T) => T): Record<string, T> {
  const out: Record<string, T> = {};
  for (const [k, v] of Object.entries(raw)) {
    const key = levelKey(k);
    if (!key || !ok(v)) continue;
    out[key] = key in out ? combine(out[key], v) : v;
  }
  return out;
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isBool = (v: unknown): v is boolean => typeof v === 'boolean';

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
export function normalizeProgress(raw: unknown): Progress {
  const p = defaultProgress();
  if (!isObj(raw)) return p;
  // Открытые уровни: старый формат — номер последнего открытого, новый — список id.
  const unlocked = new Set<string>([FIRST_LEVEL_ID]);
  if (typeof raw.unlocked === 'number' && raw.unlocked >= 1) {
    for (let n = 1; n <= Math.floor(raw.unlocked); n++) unlocked.add(legacyLevelId(n));
  } else if (Array.isArray(raw.unlocked)) {
    for (const v of raw.unlocked) {
      const key = typeof v === 'string' || typeof v === 'number' ? levelKey(v) : null;
      if (key) unlocked.add(key);
    }
  }
  p.unlocked = [...unlocked];
  // Записи по уровням: ключи-номера (старый формат, в том числе из облака старой версии) переводим в id.
  if (isObj(raw.stars)) p.stars = remapRecord(raw.stars, isNum, Math.max);
  if (isObj(raw.attempts)) p.attempts = remapRecord(raw.attempts, isNum, Math.max);
  if (isObj(raw.lossStreak)) p.lossStreak = remapRecord(raw.lossStreak, isNum, Math.max);
  if (isObj(raw.skipped)) p.skipped = remapRecord(raw.skipped, isBool, (a, b) => a || b);
  if (isObj(raw.fireflies)) p.fireflies = remapRecord(raw.fireflies, isNum, Math.max);
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
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((e): e is LogEvent => isObj(e) && typeof e.ev === 'string')
    .slice(-MAX_LOG)
    .map((e) => {
      // Старые записи: номер уровня → id.
      if (e.level === undefined || typeof e.level === 'string') return e;
      const key = levelKey(e.level as unknown as number);
      const { level: _old, ...rest } = e;
      return key ? { ...rest, level: key } : rest;
    });
}

/**
 * Миграция: из сырых данных любой версии делает SaveData текущей версии.
 * v1 — два ключа localStorage (glowtrail.progress.v1 и glowtrail.log.v1), без поля version.
 * v2 — один объект { version: 2, progress, log }.
 * v3 — добавлен раздел profile (playerId, имя, аватарка, серия дней, подсказки).
 * v4 — прогресс и лог по id уровня («valley-07») вместо номера; открытые уровни — список id; светлячки.
 * Шаги идут цепочкой: v1 → v2 → v3 → v4, поэтому любое старое сохранение доходит до текущей версии.
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
  if ((data.version as number) < 4) {
    // v3 → v4: номера уровней 1…10 → id первого мира «valley-01»…«valley-10» (уровни остались на местах).
    data = { ...data, version: 4, progress: normalizeProgress(data.progress), log: normalizeLog(data.log) };
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
