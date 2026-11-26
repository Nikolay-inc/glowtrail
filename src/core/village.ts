// «Деревня 2.0» — действия поверх экономики (чистые функции): районы, улицы, украшения в слотах, уют.
// Восстановление и улучшение построек — src/core/economy.ts (restore, upgradeBuilding), данные — villageData.ts.

export { CHALLENGE_STREET_COINS } from './villageData';
import { buildingLevel, coins, discountCost, grant, pay, type Cost, type Economy } from './economy';
import {
  BUILDINGS,
  CHALLENGE_STREET_COINS,
  COZY,
  COZY_REWARDS,
  COZY_STEP,
  DECOR_SLOTS,
  DISTRICT_COIN_MULT,
  bonusesOf,
  decorPrice,
  decorVariants,
  discounted,
  streetPrice,
  STREETS_PER_DISTRICT,
  type CozyReward,
  type DistrictId,
} from './villageData';
import { CHEST_ITEMS, COZY_ITEMS, grantItem, itemById } from './wardrobe';

// ---------------------------------------------------------------------------
// Улицы

export const streetKey = (d: DistrictId, i: number) => `${d}:${i}`;
export const streetStep = (e: Economy, d: DistrictId, i: number) => Math.min(3, e.streets[streetKey(d, i)] ?? 0);

/** Цена следующего шага улицы (со скидкой лесопилки) или null — улица уже мощёная. */
export function streetNextPrice(e: Economy, d: DistrictId, i: number): number | null {
  const s = streetStep(e, d, i);
  if (s >= 3) return null;
  return discounted(streetPrice(d, s), bonusesOf(e.buildings).streetDiscountPct);
}

export type VillageBuyError = 'maxed' | 'notEnoughCoins' | 'bad';

export function upgradeStreet(e: Economy, d: DistrictId, i: number): Economy | VillageBuyError {
  if (i < 0 || i >= STREETS_PER_DISTRICT) return 'bad';
  const price = streetNextPrice(e, d, i);
  if (price === null) return 'maxed';
  if (coins(e) < price) return 'notEnoughCoins';
  return { ...e, coinsSpent: e.coinsSpent + price, streets: { ...e.streets, [streetKey(d, i)]: streetStep(e, d, i) + 1 } };
}

// ---------------------------------------------------------------------------
// Украшения: в каждом слоте 3–5 вариантов, покупка один раз, смена и снятие бесплатно

export const decorKey = (d: DistrictId, slot: number, variant: number) => `${d}:${slot}:${variant}`;
export const slotKey = (d: DistrictId, slot: number) => `${d}:${slot}`;
export const decorOwned = (e: Economy, d: DistrictId, slot: number, variant: number) => e.decor.owned.includes(decorKey(d, slot, variant));
/** Что стоит в слоте: номер варианта или −1 (пусто). */
export const decorPlaced = (e: Economy, d: DistrictId, slot: number) => e.decor.placed[slotKey(d, slot)] ?? -1;
/** Цена варианта (монеты или свет) со скидкой дома лесника. */
export const decorCost = (e: Economy, d: DistrictId, variant: number): Cost => discountCost(decorPrice(d, variant), bonusesOf(e.buildings).decorDiscountPct);

/** Купить вариант (и сразу поставить) или поставить уже купленный; light — баланс света. */
export function placeDecor(e: Economy, d: DistrictId, slot: number, variant: number, light = 0): { economy: Economy; bought: Cost | null } | VillageBuyError | 'notEnoughLight' {
  if (slot < 0 || slot >= DECOR_SLOTS || variant < 0 || variant >= decorVariants(slot)) return 'bad';
  const placed = { ...e.decor.placed, [slotKey(d, slot)]: variant };
  if (decorOwned(e, d, slot, variant)) return { economy: { ...e, decor: { ...e.decor, placed } }, bought: null };
  const price = decorCost(e, d, variant);
  const paid = pay(e, price, light);
  if (typeof paid === 'string') return paid;
  return { economy: { ...paid, decor: { owned: [...paid.decor.owned, decorKey(d, slot, variant)], placed } }, bought: price };
}

/** Бесплатный шаг улицы (награда уюта и задания недели): самая простая улица в открытых районах. */
export function grantStreetStep(e: Economy, open: readonly DistrictId[]): { economy: Economy; street: string | null } {
  let best: { key: string; step: number } | null = null;
  for (const d of open) {
    for (let i = 0; i < STREETS_PER_DISTRICT; i++) {
      const step = streetStep(e, d, i);
      if (step < 3 && (!best || step < best.step)) best = { key: streetKey(d, i), step };
    }
  }
  if (!best) return { economy: e, street: null };
  return { economy: { ...e, streets: { ...e.streets, [best.key]: best.step + 1 } }, street: best.key };
}

/** Убрать украшение из слота (купленное остаётся). */
export function clearDecor(e: Economy, d: DistrictId, slot: number): Economy {
  const placed = { ...e.decor.placed };
  delete placed[slotKey(d, slot)];
  return { ...e, decor: { ...e.decor, placed } };
}

// ---------------------------------------------------------------------------
// Уют и уровень деревни

/** Очки уюта: уровни построек (5 / +5 / +10), купленные украшения (по 1), шаги улиц (по 4). */
export function cozyPoints(e: Economy): number {
  let p = 0;
  for (const b of BUILDINGS) {
    const lv = buildingLevel(e, b.id);
    for (let k = 0; k < lv; k++) p += COZY.building[k];
  }
  p += e.decor.owned.length * COZY.decor;
  for (const v of Object.values(e.streets)) p += Math.min(3, v) * COZY.street;
  return p;
}

/** Уровень деревни (с 1) и прогресс до следующей награды. */
export function cozyLevel(e: Economy): { level: number; points: number; into: number; step: number; pending: number } {
  const points = cozyPoints(e);
  const reached = Math.floor(points / COZY_STEP);
  return { level: reached + 1, points, into: points - reached * COZY_STEP, step: COZY_STEP, pending: Math.max(0, reached - e.cozyClaimed) };
}

/** Какая награда уюта следующая (n — номер, с 0). */
export const cozyRewardAt = (n: number): CozyReward => COZY_REWARDS[n % COZY_REWARDS.length];

/** Вещи «за уют» по порядку. */
const cozyItems = () => COZY_ITEMS.filter((id) => itemById(id));

export type CozyGrant = { coins: number; light: number; item: string | null; chest: boolean; street: string | null };

/** Забрать следующую награду уюта; монеты — × глава (по открытым районам); шаг улицы — в открытых районах. */
export function claimCozy(e: Economy, mult: number, open: readonly DistrictId[] = ['valley']): { economy: Economy; got: CozyGrant } | null {
  const c = cozyLevel(e);
  if (c.pending <= 0) return null;
  const r = cozyRewardAt(e.cozyClaimed);
  let out: Economy = { ...e, cozyClaimed: e.cozyClaimed + 1 };
  const got: CozyGrant = { coins: 0, light: 0, item: null, chest: false, street: null };
  if ('coins' in r) got.coins = Math.round((r.coins * mult) / 5) * 5;
  else if ('light' in r) got.light = r.light;
  else if ('street' in r) {
    const s = grantStreetStep(out, open);
    out = s.economy;
    got.street = s.street;
    if (!s.street) got.coins = 100;
  }
  else if ('item' in r) {
    got.item = cozyItems().find((id) => !out.wardrobe.owned.includes(id)) ?? null;
    if (!got.item) got.coins = 100;
  } else {
    got.chest = true;
    got.coins = 30;
    got.item = CHEST_ITEMS.find((id) => !out.wardrobe.owned.includes(id)) ?? null;
  }
  if (got.item) out = { ...out, wardrobe: grantItem(out.wardrobe, got.item) };
  if (got.coins) out = grant(out, { coins: got.coins });
  if (got.light) out = grant(out, { light: got.light });
  return { economy: out, got };
}

/** Множитель монет по самому дальнему открытому району. */
export const chapterMult = (open: readonly DistrictId[]) => Math.max(...open.map((d) => DISTRICT_COIN_MULT[d]));

// ---------------------------------------------------------------------------
// Награды испытаний (уровни 10, 20, 30 каждой главы): шаг улицы — сразу, расцвет постройки — на выбор игрока


export type ChallengeGrant = { economy: Economy; street: string | null; coins: number };

/** Победа на испытании: выдать награду один раз (шаг улицы и один ожидающий расцвет). null — уже выдана. */
export function earnChallenge(e: Economy, levelId: string, open: readonly DistrictId[]): ChallengeGrant | null {
  if (e.challenges.earned.includes(levelId)) return null;
  let out: Economy = { ...e, challenges: { ...e.challenges, earned: [...e.challenges.earned, levelId] } };
  const st = grantStreetStep(out, open);
  out = st.economy;
  const coins = st.street ? 0 : CHALLENGE_STREET_COINS;
  if (coins) out = grant(out, { coins });
  return { economy: out, street: st.street, coins };
}

/** Испытания, за которые расцвет ещё не выбран (по порядку получения). */
export const bloomsPending = (e: Economy): string[] => e.challenges.earned.filter((id) => !(id in e.challenges.bloomed));

/** Постройки, которые можно довести до расцвета подарком: на 2-м уровне в открытых районах. */
export const bloomCandidates = (e: Economy, open: readonly DistrictId[]): string[] => BUILDINGS.filter((b) => open.includes(b.district) && buildingLevel(e, b.id) === 2).map((b) => b.id);

/** Бесплатный расцвет выбранной постройки (тратит самый ранний ожидающий подарок). */
export function freeBloom(e: Economy, buildingId: string): Economy | 'none' | 'notLevel2' {
  const pending = bloomsPending(e);
  if (!pending.length) return 'none';
  if (buildingLevel(e, buildingId) !== 2) return 'notLevel2';
  return { ...e, buildings: { ...e.buildings, [buildingId]: 3 }, challenges: { ...e.challenges, bloomed: { ...e.challenges.bloomed, [pending[0]]: buildingId } } };
}
