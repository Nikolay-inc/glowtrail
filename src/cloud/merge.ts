// Облачное сохранение и слияние с локальным. Без сети и Supabase — чистые функции, покрыты тестами.
// В облако уходят профиль и прогресс; лог событий остаётся на устройстве (это аналитика плейтеста).

import { SAVE_VERSION, type Profile, type Progress, type SaveData } from '../save/SaveService';

export interface CloudPayload {
  version: number;
  profile: Profile;
  progress: Progress;
}

export function toCloudPayload(save: SaveData): CloudPayload {
  return { version: SAVE_VERSION, profile: { ...save.profile }, progress: { ...save.progress } };
}

function maxRecord(a: Record<number, number>, b: Record<number, number>): Record<number, number> {
  const out: Record<number, number> = { ...a };
  for (const [k, v] of Object.entries(b)) out[Number(k)] = Math.max(out[Number(k)] ?? 0, v ?? 0);
  return out;
}

/**
 * Сливает облачное сохранение аккаунта с локальным (например, гость поиграл, потом вошёл).
 * Прогресс никогда не теряется: звёзды, открытые уровни и попытки — максимум из двух.
 * Личность аккаунта (playerId, имя, аватарка) — из облака, если там уже задано.
 */
export function mergeSaves(local: SaveData, cloud: CloudPayload | null): SaveData {
  if (!cloud) return local;
  const lp = local.progress;
  const cp = cloud.progress;
  const skipped: Record<number, boolean> = { ...cp.skipped, ...lp.skipped };
  const stars = maxRecord(lp.stars, cp.stars);
  // Пройденный уровень больше не «пропущен».
  for (const id of Object.keys(skipped)) if (stars[Number(id)]) delete skipped[Number(id)];
  const progress: Progress = {
    unlocked: Math.max(lp.unlocked, cp.unlocked),
    stars,
    attempts: maxRecord(lp.attempts, cp.attempts),
    lossStreak: { ...lp.lossStreak }, // серия поражений — про текущую игру на этом устройстве
    skipped,
    muted: lp.muted, // звук — настройка устройства
  };

  const l = local.profile;
  const c = cloud.profile;
  const later = (l.lastPlayDay ?? '') >= (c.lastPlayDay ?? '') ? l : c;
  const profile: Profile = {
    playerId: c.playerId || l.playerId,
    name: c.name ?? l.name,
    avatar: c.name !== null || c.nameAsked ? c.avatar : l.avatar,
    createdAt: c.createdAt < l.createdAt ? c.createdAt : l.createdAt,
    nameAsked: l.nameAsked || c.nameAsked,
    authPrompted: l.authPrompted || c.authPrompted,
    tutorialDone: l.tutorialDone || c.tutorialDone,
    tipsSeen: [...new Set([...l.tipsSeen, ...c.tipsSeen])],
    hintsUsed: Math.max(l.hintsUsed, c.hintsUsed),
    lastPlayDay: later.lastPlayDay,
    dayStreak: later.dayStreak,
    bestDayStreak: Math.max(l.bestDayStreak, c.bestDayStreak),
  };
  return { ...local, profile, progress };
}

/** Есть ли у гостя что терять (чтобы предложить войти и не потерять прогресс). */
export function hasProgress(save: SaveData): boolean {
  return Object.keys(save.progress.stars).length > 0 || save.profile.name !== null;
}
