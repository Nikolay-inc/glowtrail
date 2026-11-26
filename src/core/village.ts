// «Деревня 2.0» — действия поверх экономики (чистые функции): районы, улицы, украшения в слотах, уют.
// Восстановление и улучшение построек — src/core/economy.ts (restore, upgradeBuilding), данные — villageData.ts.

import { buildingLevel, coins, grant, type Economy } from './economy';
import {
  BUILDINGS,
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
import { grantItem, WARDROBE } from './wardrobe';

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
/** Цена варианта со скидкой дома лесника. */
export const decorCost = (e: Economy, d: DistrictId, variant: number) => discounted(decorPrice(d, variant), bonusesOf(e.buildings).decorDiscountPct);

/** Купить вариант (и сразу поставить) или поставить уже купленный. */
export function placeDecor(e: Economy, d: DistrictId, slot: number, variant: number): { economy: Economy; bought: number } | VillageBuyError {
  if (slot < 0 || slot >= DECOR_SLOTS || variant < 0 || variant >= decorVariants(slot)) return 'bad';
  const placed = { ...e.decor.placed, [slotKey(d, slot)]: variant };
  if (decorOwned(e, d, slot, variant)) return { economy: { ...e, decor: { ...e.decor, placed } }, bought: 0 };
  const price = decorCost(e, d, variant);
  if (coins(e) < price) return 'notEnoughCoins';
  return { economy: { ...e, coinsSpent: e.coinsSpent + price, decor: { owned: [...e.decor.owned, decorKey(d, slot, variant)], placed } }, bought: price };
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
const cozyItems = () => WARDROBE.filter((w) => w.source === 'cozy').map((w) => w.id);
const CHEST_ITEMS = ['staff-crook', 'face-monocle', 'road-ember', 'acc-wings', 'trail-fireflies'];

export type CozyGrant = { coins: number; light: number; item: string | null; chest: boolean };

/** Забрать следующую награду уюта; монеты — × глава (по открытым районам). */
export function claimCozy(e: Economy, mult: number): { economy: Economy; got: CozyGrant } | null {
  const c = cozyLevel(e);
  if (c.pending <= 0) return null;
  const r = cozyRewardAt(e.cozyClaimed);
  let out: Economy = { ...e, cozyClaimed: e.cozyClaimed + 1 };
  const got: CozyGrant = { coins: 0, light: 0, item: null, chest: false };
  if ('coins' in r) got.coins = Math.round((r.coins * mult) / 5) * 5;
  else if ('light' in r) got.light = r.light;
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
