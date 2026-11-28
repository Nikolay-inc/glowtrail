// Покупки и реклама в сохранении (Р4): что куплено, какие транзакции уже начислены, счётчики роликов и
// межуровневой рекламы, показы стартового набора. Чистые функции без Phaser и без SDK — покрыты тестами.
// Правила частоты (когда можно показать ролик, межуровневую рекламу, стартовый набор) — src/monetization/rules.ts.

/** Счётчики рекламы — по дню (местное время YYYY-MM-DD) и время последних показов (мс с 1970). */
export interface AdCounters {
  /** День, к которому относятся счётчики rewarded. */
  day: string;
  /** Сколько наград за ролики получено сегодня (на все места вместе). */
  rewarded: number;
  /** Когда последний раз досмотрели ролик (для паузы перед межуровневой рекламой). */
  lastRewardedAt: number;
  /** Когда последний раз показали межуровневую рекламу. */
  lastInterstitialAt: number;
  /** Сколько уровней пройдено после последней межуровневой рекламы. */
  winsSince: number;
}

export interface ShopState {
  /** «Без рекламы» куплено (отдельно или в стартовом наборе). */
  noAds: boolean;
  /** Стартовый набор куплен. */
  starter: boolean;
  /** Обработанные транзакции (id стора): потребляемые начисляются один раз. Слияние — объединение. */
  tx: string[];
  /** Стартовый набор: сколько раз предлагали и в какой день последний раз. */
  starterOffer: { shown: number; lastDay: string };
  /** «Почти!» за день — второе за день предлагает стартовый набор. */
  almost: { day: string; count: number };
  /** Бесплатный «+3 плитки» на сегодня использован (дальше — за ролик). */
  plus3Day: string;
  ads: AdCounters;
}

export const defaultShop = (): ShopState => ({
  noAds: false,
  starter: false,
  tx: [],
  starterOffer: { shown: 0, lastDay: '' },
  almost: { day: '', count: 0 },
  plus3Day: '',
  ads: { day: '', rewarded: 0, lastRewardedAt: 0, lastInterstitialAt: 0, winsSince: 0 },
});

/** Сколько транзакций помним (на всякий случай — сохранение не должно расти без конца). */
export const MAX_TX = 500;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);
const str = (v: unknown) => (typeof v === 'string' ? v : '');

export function normalizeShop(raw: unknown): ShopState {
  const s = defaultShop();
  if (!isObj(raw)) return s;
  s.noAds = raw.noAds === true;
  s.starter = raw.starter === true;
  if (s.starter) s.noAds = true;
  if (Array.isArray(raw.tx)) s.tx = [...new Set(raw.tx.filter((x): x is string => typeof x === 'string' && x.length > 0 && x.length <= 200))].slice(-MAX_TX);
  if (isObj(raw.starterOffer)) s.starterOffer = { shown: num(raw.starterOffer.shown), lastDay: str(raw.starterOffer.lastDay) };
  if (isObj(raw.almost)) s.almost = { day: str(raw.almost.day), count: num(raw.almost.count) };
  s.plus3Day = str(raw.plus3Day);
  if (isObj(raw.ads)) {
    s.ads = {
      day: str(raw.ads.day),
      rewarded: num(raw.ads.rewarded),
      lastRewardedAt: num(raw.ads.lastRewardedAt),
      lastInterstitialAt: num(raw.ads.lastInterstitialAt),
      winsSince: num(raw.ads.winsSince),
    };
  }
  return s;
}

/**
 * Слияние двух устройств: купленное — «или», транзакции — объединение (поэтому одна покупка не начислится дважды),
 * счётчики дня — по более позднему дню (в один день — максимум), времена показов — последние.
 */
export function mergeShop(a: ShopState, b: ShopState): ShopState {
  const day = a.ads.day === b.ads.day ? a.ads.day : a.ads.day > b.ads.day ? a.ads.day : b.ads.day;
  const rewardedOf = (x: ShopState) => (x.ads.day === day ? x.ads.rewarded : 0);
  const later = <T extends { day: string; count: number }>(x: T, y: T) => (x.day === y.day ? { ...x, count: Math.max(x.count, y.count) } : x.day > y.day ? x : y);
  return {
    noAds: a.noAds || b.noAds || a.starter || b.starter,
    starter: a.starter || b.starter,
    tx: [...new Set([...a.tx, ...b.tx])].slice(-MAX_TX),
    starterOffer: { shown: Math.max(a.starterOffer.shown, b.starterOffer.shown), lastDay: a.starterOffer.lastDay > b.starterOffer.lastDay ? a.starterOffer.lastDay : b.starterOffer.lastDay },
    almost: later(a.almost, b.almost),
    plus3Day: a.plus3Day > b.plus3Day ? a.plus3Day : b.plus3Day,
    ads: {
      day,
      rewarded: Math.max(rewardedOf(a), rewardedOf(b)),
      lastRewardedAt: Math.max(a.ads.lastRewardedAt, b.ads.lastRewardedAt),
      lastInterstitialAt: Math.max(a.ads.lastInterstitialAt, b.ads.lastInterstitialAt),
      winsSince: Math.max(a.ads.winsSince, b.ads.winsSince),
    },
  };
}

// ---------------------------------------------------------------------------
// Товары: что даёт каждая покупка

export type ProductKey = 'noads' | 'starter' | 'hints_10' | 'hints_30' | 'coins_s' | 'coins_l';

export interface ProductGrant {
  noAds?: boolean;
  starter?: boolean;
  hints?: number;
  coins?: number;
  item?: string;
}

/** Вещь гардероба, которая есть только в стартовом наборе. */
export const STARTER_ITEM = 'trail-aurora';

export const PRODUCT_GRANTS: Record<ProductKey, ProductGrant> = {
  noads: { noAds: true },
  starter: { starter: true, noAds: true, hints: 20, coins: 500, item: STARTER_ITEM },
  hints_10: { hints: 10 },
  hints_30: { hints: 30 },
  coins_s: { coins: 800 },
  coins_l: { coins: 2500 },
};

/** Потребляемые (можно покупать снова; начисляются по транзакции) и непотребляемые (навсегда, восстанавливаются). */
export const CONSUMABLE: Record<ProductKey, boolean> = { noads: false, starter: false, hints_10: true, hints_30: true, coins_s: true, coins_l: true };

export const PRODUCT_KEYS: readonly ProductKey[] = ['starter', 'noads', 'hints_10', 'hints_30', 'coins_s', 'coins_l'];

/**
 * Покупка или восстановление по транзакции: что начислить сейчас. Повторная транзакция — ничего (null).
 * Покупка (`purchase`) — всё содержимое товара. Восстановление (`restore`: «Восстановить покупки», новая установка,
 * вход в аккаунт) — только то, что навсегда: «Без рекламы» и вещь набора; монеты и подсказки уже получены при покупке
 * (иначе переустановка давала бы их снова), потребляемые только запоминаются. Непотребляемое, которое уже есть, —
 * ничего, но транзакция запоминается. Возвращает новое состояние магазина и то, что выдать в экономику.
 */
export function applyTransaction(s: ShopState, key: ProductKey, txId: string, mode: 'purchase' | 'restore' = 'purchase'): { shop: ShopState; grant: ProductGrant } | null {
  if (!txId || s.tx.includes(txId)) return null;
  const g = PRODUCT_GRANTS[key];
  const tx = [...s.tx, txId].slice(-MAX_TX);
  if (key === 'starter' && s.starter) return { shop: { ...s, tx }, grant: {} };
  if (key === 'noads' && s.noAds) return { shop: { ...s, tx }, grant: {} };
  const shop: ShopState = { ...s, tx, noAds: s.noAds || !!g.noAds, starter: s.starter || !!g.starter };
  if (mode === 'restore') return { shop, grant: g.item ? { item: g.item } : {} };
  const grant: ProductGrant = { ...g };
  delete grant.noAds;
  delete grant.starter;
  return { shop, grant };
}

/**
 * Право «без рекламы» пришло из стора (восстановление, вход в аккаунт на новом устройстве) без транзакции,
 * которую мы видим: включаем флаг. Стартовый набор при восстановлении отдаёт и вещь (монеты и подсказки —
 * только при покупке, их уже получили на первом устройстве).
 */
export function applyEntitlements(s: ShopState, owned: { noAds: boolean; starter: boolean }): ShopState {
  return { ...s, noAds: s.noAds || owned.noAds || owned.starter, starter: s.starter || owned.starter };
}
