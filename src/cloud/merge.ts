// Облачное сохранение и слияние с локальным. Без сети и Supabase — чистые функции, покрыты тестами.
// В облако уходят профиль и прогресс; лог событий остаётся на устройстве (это аналитика плейтеста).

import { avatarIndex } from '../core/wardrobe';
import { normalizeProgress, SAVE_VERSION, type Profile, type Progress, type SaveData } from '../save/SaveService';
import { economyFromProgress, mergeEconomy, normalizeEconomy, type Economy } from '../core/economy';

export interface CloudPayload {
  version: number;
  profile: Profile;
  progress: Progress;
  /** Валюты, деревня, прокачка, скины (с версии 5; у старых облачных сохранений нет). */
  economy?: Economy;
}

export function toCloudPayload(save: SaveData): CloudPayload {
  return { version: SAVE_VERSION, profile: { ...save.profile }, progress: { ...save.progress }, economy: JSON.parse(JSON.stringify(save.economy)) };
}

function maxRecord(a: Record<string, number>, b: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = { ...a };
  for (const [k, v] of Object.entries(b)) out[k] = Math.max(out[k] ?? 0, v ?? 0);
  return out;
}

/**
 * Сливает облачное сохранение аккаунта с локальным (например, гость поиграл, потом вошёл).
 * Прогресс никогда не теряется: звёзды, открытые уровни и попытки — максимум из двух.
 * Личность аккаунта (playerId, имя, аватарка) — из облака, если там уже задано.
 */
export function mergeSaves(local: SaveData, cloud: CloudPayload | null): SaveData {
  if (!cloud) return local;
  const lp = normalizeProgress(local.progress);
  // В облаке может лежать сохранение старой версии (уровни по номерам) — приводим к текущему формату.
  const cp = normalizeProgress(cloud.progress);
  const skipped: Record<string, boolean> = { ...cp.skipped, ...lp.skipped };
  const stars = maxRecord(lp.stars, cp.stars);
  // Пройденный уровень больше не «пропущен».
  for (const id of Object.keys(skipped)) if (stars[id]) delete skipped[id];
  const progress: Progress = {
    unlocked: [...new Set([...lp.unlocked, ...cp.unlocked])],
    stars,
    fireflies: maxRecord(lp.fireflies, cp.fireflies),
    attempts: maxRecord(lp.attempts, cp.attempts),
    lossStreak: { ...lp.lossStreak }, // серия поражений — про текущую игру на этом устройстве
    skipped,
    muted: lp.muted, // звук — настройка устройства
    music: lp.music, // музыка — тоже
    vibration: lp.vibration, // вибрация — тоже
    language: lp.language, // язык — тоже
    analytics: lp.analytics, // согласие на статистику — выбор на этом устройстве
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
  // Экономика: облако старой версии без раздела — монеты за его звёзды начисляем как при миграции.
  const cloudEconomy = cloud.economy ? normalizeEconomy(cloud.economy) : economyFromProgress(cp.stars, c.avatar);
  const economy = mergeEconomy(normalizeEconomy(local.economy), cloudEconomy);
  // Аватарка профиля (личность аккаунта) — цвет обычного плаща; иначе — по надетому образу.
  const look = economy.wardrobe.look;
  if (look.outfit === 'outfit-cloak' && profile.avatar >= 0 && profile.avatar <= 3) economy.wardrobe = { ...economy.wardrobe, look: { ...look, color: profile.avatar } };
  else profile.avatar = avatarIndex(look);
  return { ...local, profile, progress, economy };
}

/** Есть ли у гостя что терять (чтобы предложить войти и не потерять прогресс). */
export function hasProgress(save: SaveData): boolean {
  return Object.keys(save.progress.stars).length > 0 || save.profile.name !== null;
}
