// Прогресс и лог событий поверх SaveService (сейчас localStorage, позже — облако).

import { SaveService, type LogEvent, type Progress } from './save/SaveService';

export type { EventType, LogEvent, Progress } from './save/SaveService';

export function loadProgress(): Progress {
  return SaveService.load().progress;
}

export function saveProgress(p: Progress) {
  SaveService.update((d) => {
    d.progress = p;
  });
}

export function loadLog(): LogEvent[] {
  return SaveService.load().log;
}

export function logEvent(e: Omit<LogEvent, 't'>) {
  SaveService.update((d) => {
    d.log.push({ t: new Date().toISOString(), ...e });
  });
}

export function resetAll() {
  SaveService.reset();
}

/** Отмечает начало попытки и возвращает её номер. */
export function startAttempt(level: number): number {
  let attempt = 0;
  SaveService.update((d) => {
    attempt = (d.progress.attempts[level] ?? 0) + 1;
    d.progress.attempts[level] = attempt;
  });
  logEvent({ ev: 'start', level, attempt });
  return attempt;
}

/** Победа: звёзды, открытие следующего уровня, сброс серии поражений. */
export function recordWin(level: number, stars: number, totalLevels: number) {
  SaveService.update(({ progress: p }) => {
    p.stars[level] = Math.max(p.stars[level] ?? 0, stars);
    p.unlocked = Math.min(totalLevels, Math.max(p.unlocked, level + 1));
    p.lossStreak[level] = 0;
  });
}

/** Поражение: увеличивает серию и возвращает её. */
export function recordLoss(level: number): number {
  let streak = 0;
  SaveService.update(({ progress: p }) => {
    streak = (p.lossStreak[level] ?? 0) + 1;
    p.lossStreak[level] = streak;
  });
  return streak;
}

export function lossStreak(level: number): number {
  return loadProgress().lossStreak[level] ?? 0;
}

/** Пропуск уровня: отмечаем и открываем следующий. Пропущенный уровень остаётся доступным. */
export function recordSkip(level: number, totalLevels: number) {
  SaveService.update(({ progress: p }) => {
    p.skipped[level] = true;
    p.unlocked = Math.min(totalLevels, Math.max(p.unlocked, level + 1));
  });
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
      [e.t, e.ev, e.level && `ур${e.level}`, e.attempt && `#${e.attempt}`, e.ms !== undefined && fmtTime(e.ms), e.stars !== undefined && `${e.stars}★`, e.moves !== undefined && `ходов ${e.moves}`, e.tilesLeft !== undefined && `осталось ${e.tilesLeft}`, e.undos ? `отмен ${e.undos}` : e.undo && 'отмена', e.streak !== undefined && `серия ${e.streak}`, e.added !== undefined && `+${e.added} плит.`, e.rollback && `откат ${e.rollback}`]
        .filter(Boolean)
        .join(' '),
    ),
  ];
  return lines.join('\n');
}

export { fmtTime };
