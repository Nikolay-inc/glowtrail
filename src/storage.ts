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
  muted: boolean;
}

export type EventType = 'session' | 'start' | 'win' | 'lose' | 'abandon';

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

const defaultProgress = (): Progress => ({ unlocked: 1, stars: {}, attempts: {}, muted: false });

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

export function recordWin(level: number, stars: number, totalLevels: number) {
  const p = loadProgress();
  p.stars[level] = Math.max(p.stars[level] ?? 0, stars);
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
    'Ур | попыток | побед | пораж. | бросил | звёзды | время | 1-я победа',
    ...rows.map(
      (r) =>
        `${String(r.level).padStart(2)} | ${String(r.attempts).padStart(7)} | ${String(r.wins).padStart(5)} | ${String(r.losses).padStart(6)} | ${String(r.abandons).padStart(6)} | ${'★'.repeat(r.bestStars).padEnd(6)} | ${fmtTime(r.timeMs).padStart(5)} | ${r.firstWinAttempt ? `попытка ${r.firstWinAttempt}` : '—'}`,
    ),
    '',
    'Лог событий:',
    ...log.map((e) =>
      [e.t, e.ev, e.level && `ур${e.level}`, e.attempt && `#${e.attempt}`, e.ms !== undefined && fmtTime(e.ms), e.stars !== undefined && `${e.stars}★`, e.moves !== undefined && `ходов ${e.moves}`, e.tilesLeft !== undefined && `осталось ${e.tilesLeft}`, e.undo && 'отмена']
        .filter(Boolean)
        .join(' '),
    ),
  ];
  return lines.join('\n');
}

export { fmtTime };
