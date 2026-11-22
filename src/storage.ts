// Прогресс и лог событий в localStorage. Если хранилище недоступно (приватный режим),
// игра продолжает работать, просто ничего не запоминает.

const PROGRESS_KEY = 'glowtrail.progress.v1';
const LOG_KEY = 'glowtrail.log.v1';
const MAX_LOG = 2000;

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
  /** Сколько подсказок осталось. */
  hints: number;
  muted: boolean;
}

export const START_HINTS = 3;

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
  undo?: boolean;
  /** Серия поражений подряд на момент события. */
  streak?: number;
  /** Сколько плиток добавлено (extra_tiles, auto_ease). */
  added?: number;
  /** На сколько ходов откатились (hint_used, extra_tiles). */
  rollback?: number;
  /** Сколько подсказок осталось после использования. */
  hintsLeft?: number;
}

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
}

function readArray<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key);
    const v = raw ? JSON.parse(raw) : [];
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* хранилище недоступно — молча продолжаем */
  }
}

const defaultProgress = (): Progress => ({ unlocked: 1, stars: {}, attempts: {}, lossStreak: {}, skipped: {}, hints: START_HINTS, muted: false });

export function loadProgress(): Progress {
  return read(PROGRESS_KEY, defaultProgress());
}

export function saveProgress(p: Progress) {
  write(PROGRESS_KEY, p);
}

export function loadLog(): LogEvent[] {
  return readArray<LogEvent>(LOG_KEY);
}

export function logEvent(e: Omit<LogEvent, 't'>) {
  const log = loadLog();
  log.push({ t: new Date().toISOString(), ...e });
  write(LOG_KEY, log.slice(-MAX_LOG));
}

export function resetAll() {
  try {
    localStorage.removeItem(PROGRESS_KEY);
    localStorage.removeItem(LOG_KEY);
  } catch {
    /* ничего */
  }
}

/** Отмечает начало попытки и возвращает её номер. */
export function startAttempt(level: number): number {
  const p = loadProgress();
  const attempt = (p.attempts[level] ?? 0) + 1;
  p.attempts[level] = attempt;
  saveProgress(p);
  logEvent({ ev: 'start', level, attempt });
  return attempt;
}

/** Победа: звёзды, открытие следующего уровня, сброс серии поражений, +1 подсказка за первое прохождение. */
export function recordWin(level: number, stars: number, totalLevels: number): { hintAwarded: boolean } {
  const p = loadProgress();
  const firstWin = !p.stars[level];
  p.stars[level] = Math.max(p.stars[level] ?? 0, stars);
  p.unlocked = Math.min(totalLevels, Math.max(p.unlocked, level + 1));
  p.lossStreak[level] = 0;
  if (firstWin) p.hints += 1;
  saveProgress(p);
  return { hintAwarded: firstWin };
}

/** Поражение: увеличивает серию и возвращает её. */
export function recordLoss(level: number): number {
  const p = loadProgress();
  const streak = (p.lossStreak[level] ?? 0) + 1;
  p.lossStreak[level] = streak;
  saveProgress(p);
  return streak;
}

export function lossStreak(level: number): number {
  return loadProgress().lossStreak[level] ?? 0;
}

/** Тратит подсказку. Возвращает остаток или -1, если подсказок нет. */
export function useHint(): number {
  const p = loadProgress();
  if (p.hints <= 0) return -1;
  p.hints -= 1;
  saveProgress(p);
  return p.hints;
}

export function hintsLeft(): number {
  return loadProgress().hints;
}

/** Пропуск уровня: отмечаем и открываем следующий. Пропущенный уровень остаётся доступным. */
export function recordSkip(level: number, totalLevels: number) {
  const p = loadProgress();
  p.skipped[level] = true;
  p.unlocked = Math.min(totalLevels, Math.max(p.unlocked, level + 1));
  saveProgress(p);
}

// ---------------------------------------------------------------------------
// Сводка для экрана «Статистика»

export interface LevelSummary {
  level: number;
  attempts: number;
  wins: number;
  losses: number;
  abandons: number;
  bestStars: number;
  /** Суммарное время на уровне, мс. */
  timeMs: number;
  /** С какой попытки впервые пройден. */
  firstWinAttempt: number | null;
  hints: number;
  extras: number;
  eased: number;
  skipped: boolean;
}

export function summarize(log: LogEvent[], levelCount: number): LevelSummary[] {
  const rows: LevelSummary[] = [];
  for (let id = 1; id <= levelCount; id++) {
    const ev = log.filter((e) => e.level === id);
    const wins = ev.filter((e) => e.ev === 'win');
    rows.push({
      level: id,
      attempts: ev.filter((e) => e.ev === 'start').length,
      wins: wins.length,
      losses: ev.filter((e) => e.ev === 'lose').length,
      abandons: ev.filter((e) => e.ev === 'abandon').length,
      bestStars: Math.max(0, ...wins.map((e) => e.stars ?? 0)),
      timeMs: ev.reduce((s, e) => s + (e.ms ?? 0), 0),
      firstWinAttempt: wins.length ? (wins[0].attempt ?? null) : null,
      hints: ev.filter((e) => e.ev === 'hint_used').length,
      extras: ev.filter((e) => e.ev === 'extra_tiles').length,
      eased: ev.filter((e) => e.ev === 'auto_ease').length,
      skipped: ev.some((e) => e.ev === 'level_skipped'),
    });
  }
  return rows;
}

const fmtTime = (ms: number) => {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/** Текст, который игрок копирует и присылает после плейтеста. */
export function statsText(levelCount: number): string {
  const log = loadLog();
  const rows = summarize(log, levelCount);
  const passed = rows.filter((r) => r.wins > 0).length;
  const totalMs = rows.reduce((s, r) => s + r.timeMs, 0);
  const sessions = log.filter((e) => e.ev === 'session').length;
  const lines = [
    'Glowtrail — статистика',
    `Пройдено уровней: ${passed} из ${levelCount}`,
    `Время в уровнях: ${fmtTime(totalMs)}, сессий: ${sessions}`,
    `Первый запуск: ${log[0]?.t ?? '—'}`,
    `Устройство: ${typeof navigator !== 'undefined' ? navigator.userAgent : '—'}`,
    '',
    'Ур | попыток | побед | пораж. | бросил | звёзды | время | подск. | +3 | облегч. | 1-я победа',
    ...rows.map(
      (r) =>
        `${String(r.level).padStart(2)} | ${String(r.attempts).padStart(7)} | ${String(r.wins).padStart(5)} | ${String(r.losses).padStart(6)} | ${String(r.abandons).padStart(6)} | ${'★'.repeat(r.bestStars).padEnd(6)} | ${fmtTime(r.timeMs).padStart(5)} | ${String(r.hints).padStart(6)} | ${String(r.extras).padStart(2)} | ${String(r.eased).padStart(7)} | ${r.firstWinAttempt ? `попытка ${r.firstWinAttempt}` : r.skipped ? 'пропущен' : '—'}`,
    ),
    '',
    'Лог событий:',
    ...log.map((e) =>
      [e.t, e.ev, e.level && `ур${e.level}`, e.attempt && `#${e.attempt}`, e.ms !== undefined && fmtTime(e.ms), e.stars !== undefined && `${e.stars}★`, e.moves !== undefined && `ходов ${e.moves}`, e.tilesLeft !== undefined && `осталось ${e.tilesLeft}`, e.undo && 'отмена', e.streak !== undefined && `серия ${e.streak}`, e.added !== undefined && `+${e.added} плит.`, e.rollback && `откат ${e.rollback}`, e.hintsLeft !== undefined && `подсказок ${e.hintsLeft}`]
        .filter(Boolean)
        .join(' '),
    ),
  ];
  return lines.join('\n');
}

export { fmtTime };
