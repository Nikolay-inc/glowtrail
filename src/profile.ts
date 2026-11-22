// Профиль игрока поверх SaveService: имя, аватарка, серия дней, счётчик подсказок и сводка для экрана «Профиль».

import { isAvatarUnlocked } from './core/avatars';
import { SaveService, type Profile, type Progress } from './save/SaveService';

export const DEFAULT_NAME = 'Путник';
export const NAME_MAX = 16;
/** После прохождения какого уровня спрашиваем имя. */
export const ASK_NAME_AFTER_LEVEL = 3;

export function getProfile(): Profile {
  return SaveService.load().profile;
}

export function displayName(p: Profile = getProfile()): string {
  return p.name ?? DEFAULT_NAME;
}

/** Обрезает пробелы и управляющие символы, ограничивает длину. Пустое имя → null («Путник»). */
export function sanitizeName(raw: string): string | null {
  const clean = [...raw.replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim()].slice(0, NAME_MAX).join('').trim();
  return clean ? clean : null;
}

export function setName(raw: string) {
  SaveService.update((d) => {
    d.profile.name = sanitizeName(raw);
    d.profile.nameAsked = true;
  });
}

export function skipName() {
  SaveService.update((d) => {
    d.profile.nameAsked = true;
  });
}

export function totalStars(progress: Progress = SaveService.load().progress): number {
  return Object.values(progress.stars).reduce((s, n) => s + (n ?? 0), 0);
}

export function levelsPassed(progress: Progress = SaveService.load().progress): number {
  return Object.values(progress.stars).filter((n) => n > 0).length;
}

/** Выбирает аватарку, если она открыта. Возвращает true при успехе. */
export function setAvatar(id: number): boolean {
  if (!isAvatarUnlocked(id, totalStars())) return false;
  SaveService.update((d) => {
    d.profile.avatar = id;
  });
  return true;
}

export function countHint() {
  SaveService.update((d) => {
    d.profile.hintsUsed += 1;
  });
}

/** Нужно ли показать окно «Как тебя зовут?» после победы на этом уровне. */
export function shouldAskName(levelId: number): boolean {
  const p = getProfile();
  return !p.nameAsked && levelId >= ASK_NAME_AFTER_LEVEL;
}

/** Дата YYYY-MM-DD по местному времени. */
export function localDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000);
}

/** Отмечает день игры: вчера играл — серия +1, сегодня уже отмечен — без изменений, пропуск — серия с 1. */
export function recordPlayDay(now: Date = new Date()): Profile {
  const today = localDay(now);
  return SaveService.update((d) => {
    const p = d.profile;
    if (p.lastPlayDay === today) return;
    const gap = p.lastPlayDay ? daysBetween(p.lastPlayDay, today) : Infinity;
    p.dayStreak = gap === 1 ? p.dayStreak + 1 : 1;
    p.bestDayStreak = Math.max(p.bestDayStreak, p.dayStreak);
    p.lastPlayDay = today;
  }).profile;
}
