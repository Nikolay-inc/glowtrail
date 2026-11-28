// Правила рекламы и покупок без SDK и без Phaser (покрыты тестами): когда можно предложить ролик, когда показать
// межуровневую рекламу, «+3 плитки» (бесплатно раз в день → часовня → ролик), когда предложить стартовый набор.
// Числа — из Remote Config (src/analytics/remoteConfig.ts), значения по умолчанию — там же.

import type { RemoteValues } from '../analytics/remoteConfig';
import type { ShopState } from '../core/shop';

/** Места роликов по выбору игрока. */
export type RewardedPlace = 'hint' | 'plus3' | 'double_coins' | 'daily_double';
export const REWARDED_PLACES: readonly RewardedPlace[] = ['hint', 'plus3', 'double_coins', 'daily_double'];

export interface AdSettings {
  enabled: boolean;
  rewardedCap: number;
  fromLevel: number;
  everyN: number;
  minGapMs: number;
  graceMs: number;
}

export function adSettings(r: Pick<RemoteValues, 'ads_enabled' | 'ads_rewarded_daily_cap' | 'ads_interstitial_from_level' | 'ads_interstitial_every_n_levels' | 'ads_interstitial_min_gap_sec' | 'ads_session_grace_sec'>): AdSettings {
  return {
    enabled: r.ads_enabled,
    rewardedCap: Math.floor(r.ads_rewarded_daily_cap),
    fromLevel: Math.max(1, Math.floor(r.ads_interstitial_from_level)),
    everyN: Math.max(1, Math.floor(r.ads_interstitial_every_n_levels)),
    minGapMs: r.ads_interstitial_min_gap_sec * 1000,
    graceMs: r.ads_session_grace_sec * 1000,
  };
}

/** После досмотренного ролика межуровневой рекламы нет столько времени. */
export const AFTER_REWARDED_MS = 120_000;

// ---------------------------------------------------------------------------
// Ролики по выбору игрока: общий дневной лимит

/** Сколько роликов с наградой ещё можно сегодня (на все места вместе). */
export function rewardedLeft(shop: ShopState, today: string, cap: number): number {
  const used = shop.ads.day === today ? shop.ads.rewarded : 0;
  return Math.max(0, cap - used);
}

export interface RewardedCtx {
  shop: ShopState;
  today: string;
  now: number;
  settings: AdSettings;
  /** Реклама вообще есть на этой платформе (в веб-версии — нет). */
  supported: boolean;
  /** До какого времени кнопки спрятаны после неудачной загрузки. */
  retryAt: number;
}

/** Показывать ли кнопку «… за ролик»: реклама включена и есть на платформе, лимит не исчерпан, не ждём после ошибки. */
export function rewardedAvailable(c: RewardedCtx): boolean {
  return c.supported && c.settings.enabled && c.now >= c.retryAt && rewardedLeft(c.shop, c.today, c.settings.rewardedCap) > 0;
}

/** Ролик досмотрен — награда выдана: +1 к дневному счётчику, время (пауза перед межуровневой рекламой). */
export function recordRewarded(shop: ShopState, today: string, now: number): ShopState {
  const rewarded = (shop.ads.day === today ? shop.ads.rewarded : 0) + 1;
  return { ...shop, ads: { ...shop.ads, day: today, rewarded, lastRewardedAt: now } };
}

// ---------------------------------------------------------------------------
// Межуровневая реклама

export interface InterstitialCtx {
  shop: ShopState;
  settings: AdSettings;
  supported: boolean;
  /** Номер пройденного уровня (сквозной). */
  levelNum: number;
  /** Чем закончился уровень: межуровневая — только после победы. */
  result: 'win' | 'lose' | 'skip';
  /** Обучение (уровни 1–3 первого прохождения, «Пройти обучение заново»). */
  tutorial: boolean;
  /** Пройденный или следующий уровень — знакомство с новой механикой. */
  intro: boolean;
  now: number;
  /** Начало сессии (запуск или возврат из фона после долгого перерыва). */
  sessionStart: number;
}

export type InterstitialReason = 'ok' | 'disabled' | 'unsupported' | 'noads' | 'tutorial' | 'not_win' | 'early_level' | 'intro' | 'grace' | 'gap' | 'after_rewarded' | 'every_n';

/** Показать ли межуровневую рекламу по нажатию «Дальше» / «На карту» в окне победы — и почему нет. */
export function interstitialDecision(c: InterstitialCtx): InterstitialReason {
  const s = c.settings;
  if (!s.enabled) return 'disabled';
  if (!c.supported) return 'unsupported';
  if (c.shop.noAds || c.shop.starter) return 'noads';
  if (c.tutorial) return 'tutorial';
  if (c.result !== 'win') return 'not_win';
  if (c.levelNum < s.fromLevel) return 'early_level';
  if (c.intro) return 'intro';
  if (c.now - c.sessionStart < s.graceMs) return 'grace';
  if (c.shop.ads.lastInterstitialAt && c.now - c.shop.ads.lastInterstitialAt < s.minGapMs) return 'gap';
  if (c.shop.ads.lastRewardedAt && c.now - c.shop.ads.lastRewardedAt < AFTER_REWARDED_MS) return 'after_rewarded';
  if (c.shop.ads.winsSince < s.everyN) return 'every_n';
  return 'ok';
}

/** Победа: счётчик «пройдено после межуровневой» растёт (уровни до ads_interstitial_from_level и обучение не считаются). */
export function recordWinForAds(shop: ShopState, levelNum: number, settings: AdSettings, tutorial: boolean): ShopState {
  if (tutorial || levelNum < settings.fromLevel) return shop;
  return { ...shop, ads: { ...shop.ads, winsSince: shop.ads.winsSince + 1 } };
}

/** Межуровневая показана: счётчик уровней с нуля, время показа. */
export function recordInterstitial(shop: ShopState, now: number): ShopState {
  return { ...shop, ads: { ...shop.ads, winsSince: 0, lastInterstitialAt: now } };
}

// ---------------------------------------------------------------------------
// «+3 плитки» на экране «Почти!»

export type Plus3Offer = 'free' | 'chapel' | 'ad' | null;

/**
 * Как предложить «+3 плитки»: первый раз за попытку — бесплатно (раз в день), потом бесплатный от часовни,
 * потом за ролик (если ролик доступен). Второй раз за попытку — только от часовни, как раньше.
 */
export function plus3Offer(c: { usedInAttempt: number; chapelUsedInAttempt: boolean; freeToday: boolean; chapelLeft: number; adReady: boolean }): Plus3Offer {
  if (c.usedInAttempt === 0) {
    if (c.freeToday) return 'free';
    if (c.chapelLeft > 0) return 'chapel';
    return c.adReady ? 'ad' : null;
  }
  if (c.usedInAttempt === 1 && !c.chapelUsedInAttempt && c.chapelLeft > 0) return 'chapel';
  return null;
}

export const freePlus3Today = (shop: ShopState, today: string) => shop.plus3Day !== today;
export const useFreePlus3 = (shop: ShopState, today: string): ShopState => ({ ...shop, plus3Day: today });

// ---------------------------------------------------------------------------
// Стартовый набор

export const STARTER = { fromLevel: 20, almostPerDay: 2, gapDays: 3, maxShows: 3 } as const;

function dayDiff(a: string, b: string): number {
  const t = (x: string) => Date.UTC(+x.slice(0, 4), +x.slice(5, 7) - 1, +x.slice(8, 10));
  return Math.round((t(b) - t(a)) / 86_400_000);
}

/** Набор вообще можно купить: не куплен и «Без рекламы» ещё нет (иначе его не показываем). */
export const starterVisible = (shop: ShopState) => !shop.starter && !shop.noAds;

/**
 * Предложить стартовый набор: после победы на уровне 20 и дальше или после второго «Почти!» за день;
 * не чаще раза в 3 дня, всего не больше 3 раз; не показываем, если набор или «Без рекламы» уже куплены
 * и если покупок на платформе нет.
 */
export function starterOfferDue(c: { shop: ShopState; today: string; trigger: 'win' | 'almost'; levelNum: number; storeAvailable: boolean }): boolean {
  const s = c.shop;
  if (!c.storeAvailable || !starterVisible(s)) return false;
  if (s.starterOffer.shown >= STARTER.maxShows) return false;
  if (s.starterOffer.lastDay && dayDiff(s.starterOffer.lastDay, c.today) < STARTER.gapDays) return false;
  if (c.trigger === 'win') return c.levelNum >= STARTER.fromLevel;
  return s.almost.day === c.today && s.almost.count === STARTER.almostPerDay;
}

export const recordStarterOffer = (shop: ShopState, today: string): ShopState => ({ ...shop, starterOffer: { shown: shop.starterOffer.shown + 1, lastDay: today } });

/** Экран «Почти!» показан: счётчик за день. */
export const recordAlmost = (shop: ShopState, today: string): ShopState => ({ ...shop, almost: { day: today, count: (shop.almost.day === today ? shop.almost.count : 0) + 1 } });

// ---------------------------------------------------------------------------
// Согласие: решение об анонимной статистике из формы UMP (IAB TCF v2)

/**
 * Статистика из строки согласий TCF: «да», если игрок разрешил хранение на устройстве (цель 1) и измерение
 * эффективности контента (цель 8) — ближайшее к «анонимной статистике»; «нет» — если хотя бы одно не разрешено.
 * GDPR не действует или строки нет (форма не показывалась) — null: решаем как раньше (свой экран согласия в ЕС).
 */
export function analyticsFromTcf(purposeConsents: string, gdprApplies: number): 'yes' | 'no' | null {
  if (gdprApplies !== 1 || !/^[01]+$/.test(purposeConsents)) return null;
  return purposeConsents[0] === '1' && purposeConsents[7] === '1' ? 'yes' : 'no';
}
