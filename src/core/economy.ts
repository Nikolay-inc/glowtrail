// Экономика и мета-игра: две валюты, деревня (районы, уровни построек, улицы, украшения, уют — логика действий
// в src/core/village.ts, данные — src/core/villageData.ts), задания жителей (src/core/quests.ts), прокачка
// способностей, гардероб, ежедневная награда, подсказки. Чистая логика без Phaser и без хранилища — состояние передаётся явно, проверяется тестами
// и симуляцией (npm run sim-economy).
//
// Монеты копятся (заработано − потрачено). Свет не хранится отдельно: он считается из лучших результатов
// уровней (1 звезда = 2 света, 1 светлячок = 1 свет) минус цена восстановленных объектов деревни —
// поэтому переигровка добавляет только разницу, а слияние с облаком не может «удвоить» свет.

import { defaultQuests, mergeQuests, normalizeQuests, type QuestState } from './questState';
import { BONUS, bonusesOf, BUILDINGS, buildingDef, costOf, discounted, districtBuildings, DECOR_SLOTS, STREETS_PER_DISTRICT, decorVariants, type Bonuses, type BuildingDef, type DistrictId, type Reward } from './villageData';
import { defaultWardrobe, grantItem, itemBaseCost, itemById, mergeWardrobe, normalizeWardrobe, wardrobeFromSkins, wear, type Cost, type WardrobeState } from './wardrobe';

export type { Reward, DistrictId } from './villageData';
export type { Cost, Currency } from './wardrobe';

// ---------------------------------------------------------------------------
// Состояние

export type UpgradeId = 'stash' | 'rotate' | 'lantern';

export interface Economy {
  /** Монет заработано и потрачено за всё время (баланс = разница; при слиянии берём максимум каждого). */
  coinsEarned: number;
  coinsSpent: number;
  /** За сколько звёзд уровня уже выданы монеты (нет записи — уровень ещё ни разу не пройден). */
  paidStars: Record<string, number>;
  /** За сколько светлячков уровня уже выданы монеты моста. */
  paidFireflies: Record<string, number>;
  /** Уровни построек всех районов: id → 1 восстановлена, 2 улучшена, 3 расцвет (нет записи — заброшена). */
  buildings: Record<string, number>;
  /** Улицы: «район:номер» → шаг 1 гравий, 2 брусчатка, 3 мощёная с фонарями (нет записи — тропинка). */
  streets: Record<string, number>;
  /** Украшения: купленные варианты «район:слот:вариант» и что стоит в слоте («район:слот» → вариант). */
  decor: { owned: string[]; placed: Record<string, number> };
  /** Сколько наград уюта уже получено. */
  cozyClaimed: number;
  /** Свет, полученный сверх уровней (задания жителей, уют). */
  lightBonus: number;
  /** Свет, потраченный на вещи гардероба и украшения (постройки считаются по их уровням). */
  lightShop: number;
  /** Задания жителей (src/core/quests.ts). */
  quests: QuestState;
  /** Уровни прокачки (0 — базовый). rotate: 0 — способность ещё не открыта. */
  upgrades: Record<UpgradeId, number>;
  /** Подсказки: купленные/подаренные и бесплатные на сегодня. */
  hints: { bank: number; freeDay: string; freeUsed: number };
  /** Гардероб Lumo и стили поля (src/core/wardrobe.ts). */
  wardrobe: WardrobeState;
  /** Ежедневная награда: последний день получения и номер дня в календаре (1–7). */
  daily: { lastDay: string; streak: number };
  /** Ежедневный сундук фонарной площади: последний день и сколько всего открыто. */
  chest: { lastDay: string; count: number };
  /** Часовня: сколько бесплатных «+3 плитки» использовано и в какой день. */
  chapel: { day: string; used: number };
  /** Повторы уровней без улучшения за день: награда убывает 6 → 3 → 1 → 0, сброс раз в сутки. */
  replays: { day: string; counts: Record<string, number> };
}

/** Монеты за повтор уровня без улучшения: 1-й, 2-й, 3-й, дальше — за день. */
export const REPLAY_COINS: readonly number[] = [6, 3, 1, 0];

/** Сколько монет даст следующий повтор уровня без улучшения сегодня. */
export function replayCoinsNext(e: Economy, levelId: string, today: string): number {
  const n = e.replays.day === today ? (e.replays.counts[levelId] ?? 0) : 0;
  return REPLAY_COINS[Math.min(n, REPLAY_COINS.length - 1)];
}

/** Повтор без улучшения: начислить убывающую награду (только если уровень уже пройден). */
export function applyReplay(e: Economy, levelId: string, today: string): { economy: Economy; coins: number } {
  if (e.paidStars[levelId] === undefined) return { economy: e, coins: 0 };
  const c = replayCoinsNext(e, levelId, today);
  const counts = e.replays.day === today ? { ...e.replays.counts } : {};
  counts[levelId] = (counts[levelId] ?? 0) + 1;
  return { economy: { ...e, coinsEarned: e.coinsEarned + c, replays: { day: today, counts } }, coins: c };
}

export const FREE_HINTS_PER_DAY = 3;
/** Подсказок в запасе у нового игрока. */
export const START_HINTS = 3;
export const HINT_PRICE = 30;

export function defaultEconomy(): Economy {
  return {
    coinsEarned: 0,
    coinsSpent: 0,
    paidStars: {},
    paidFireflies: {},
    buildings: {},
    streets: {},
    decor: { owned: [], placed: {} },
    cozyClaimed: 0,
    lightBonus: 0,
    lightShop: 0,
    quests: defaultQuests(),
    upgrades: { stash: 0, rotate: 0, lantern: 0 },
    hints: { bank: START_HINTS, freeDay: '', freeUsed: 0 },
    wardrobe: defaultWardrobe(),
    daily: { lastDay: '', streak: 0 },
    chest: { lastDay: '', count: 0 },
    chapel: { day: '', used: 0 },
    replays: { day: '', counts: {} },
  };
}

export const coins = (e: Economy) => e.coinsEarned - e.coinsSpent;

// ---------------------------------------------------------------------------
// Монеты и свет за уровень

/** Монеты за победу: первое прохождение — 10 + 5 за звезду, переигровка — 5 за каждую новую звезду. */
export function coinsForWin(paid: number | undefined, stars: number): number {
  if (paid === undefined) return 10 + 5 * stars;
  return 5 * Math.max(0, stars - paid);
}

/** Свет уровня по лучшему результату: 2 за звезду и 1 за светлячка. */
export const lightOfLevel = (stars: number, fireflies: number) => 2 * stars + fireflies;

type Best = { stars: Record<string, number>; fireflies: Record<string, number> };

/** Свет за лучшие результаты всех уровней (без бонуса колодца). */
export function lightEarned(best: Best): number {
  let sum = 0;
  for (const v of Object.values(best.stars)) sum += 2 * (v ?? 0);
  for (const v of Object.values(best.fireflies)) sum += v ?? 0;
  return sum;
}

/** Бонус колодца: +N света за каждый уровень на 3 звезды (считается из прогресса — переигровка не «удваивает»). */
export function wellLight(e: Economy, best: Best): number {
  const per = villageBonuses(e).lightPer3Star;
  return per ? per * Object.values(best.stars).filter((v) => v >= 3).length : 0;
}

/** Свет, потраченный на постройки: восстановление (ур. 1) и расцвет (ур. 3). */
export function lightSpent(e: Economy): number {
  let sum = 0;
  for (const [id, lv] of Object.entries(e.buildings)) {
    if (!buildingDef(id) || lv < 1) continue;
    sum += costOf(id, 1).light + (lv >= 3 ? costOf(id, 3).light : 0);
  }
  return sum + e.lightShop;
}
export const lightBalance = (e: Economy, best: Best) => lightEarned(best) + wellLight(e, best) + e.lightBonus - lightSpent(e);

/**
 * Победа: начислить монеты. Мельница — +N% к монетам за уровень, мост — монеты за новых светлячков
 * (сверх лучшего результата). Возвращает новое состояние, монеты за уровень и бонус построек.
 */
export function applyWin(e: Economy, levelId: string, stars: number, fireflies = 0): { economy: Economy; coins: number; bonus: number } {
  const paid = e.paidStars[levelId];
  const base = coinsForWin(paid, stars);
  const b = villageBonuses(e);
  const mill = base > 0 ? Math.round((base * b.coinMultPct) / 100) : 0;
  const paidFf = e.paidFireflies[levelId] ?? 0;
  const newFf = Math.max(0, fireflies - paidFf);
  const bridge = b.coinsPerFirefly * newFf;
  const bonus = mill + bridge;
  return {
    economy: {
      ...e,
      coinsEarned: e.coinsEarned + base + bonus,
      paidStars: { ...e.paidStars, [levelId]: Math.max(paid ?? 0, stars) },
      paidFireflies: b.coinsPerFirefly && newFf ? { ...e.paidFireflies, [levelId]: fireflies } : e.paidFireflies,
    },
    coins: base,
    bonus,
  };
}

// ---------------------------------------------------------------------------
// Деревня: постройки трёх уровней в районах

export type BuildingId = 'well' | 'bakery' | 'workshop' | 'mill' | 'bridge' | 'garden' | 'chapel' | 'square' | 'lumo' | 'lighthouse';

export interface VillageObject {
  id: string;
  /** Цена восстановления в свете. Порядок восстановления в районе — по цене. */
  cost: number;
  reward: Reward;
}

const asObject = (b: BuildingDef): VillageObject => ({ id: b.id, cost: costOf(b.id, 1).light, reward: b.reward });

/** Постройки района (по порядку восстановления). VILLAGE — долина (первый район). */
export const districtObjects = (d: DistrictId): VillageObject[] => districtBuildings(d).map(asObject);
export const VILLAGE: readonly VillageObject[] = districtObjects('valley');
export const villageById = (id: string) => {
  const b = buildingDef(id);
  return b ? asObject(b) : undefined;
};
export const VILLAGE_TOTAL = VILLAGE.reduce((s, v) => s + v.cost, 0);

/** Уровень постройки: 0 — заброшена, 1 — восстановлена, 2 — улучшена, 3 — расцвет. */
export const buildingLevel = (e: Economy, id: string) => Math.min(3, e.buildings[id] ?? 0);
export const isRestored = (e: Economy, id: string) => buildingLevel(e, id) > 0;
/** Значение бонуса постройки на её текущем уровне (или на уровне level). */
export const bonusValue = (e: Economy, id: string, level = buildingLevel(e, id)) => (level > 0 && BONUS[id] ? BONUS[id].values[Math.min(3, level) - 1] : 0);

export type VillageBonuses = Bonuses & { dailyChest: boolean };

/** Все действующие бонусы построек (одинаковые складываются). */
export function villageBonuses(e: Economy): VillageBonuses {
  const b = bonusesOf(e.buildings);
  return { ...b, dailyChest: b.chestTier > 0 };
}

/** Постройки с действующим бонусом — для списка «Бонусы деревни». */
export const activeBonuses = (e: Economy) => BUILDINGS.filter((v) => buildingLevel(e, v.id) > 0 && BONUS[v.id]).map((v) => ({ id: v.id, value: bonusValue(e, v.id), level: buildingLevel(e, v.id) }));

/** Следующая постройка района для восстановления (по порядку) или null — район восстановлен. */
export function nextInDistrict(e: Economy, d: DistrictId): VillageObject | null {
  const b = districtBuildings(d).find((x) => !isRestored(e, x.id));
  return b ? asObject(b) : null;
}
export const nextVillageObject = (e: Economy) => nextInDistrict(e, 'valley');

export type RestoreError = 'restored' | 'notNext' | 'notEnoughLight';

/** Восстановить постройку: только следующую по порядку в районе и только если хватает света. Награда — сразу. */
export function restore(e: Economy, id: string, light: number): { economy: Economy; reward: Reward } | RestoreError {
  const def = buildingDef(id);
  if (!def) return 'notNext';
  if (isRestored(e, id)) return 'restored';
  const next = nextInDistrict(e, def.district);
  if (!next || next.id !== id) return 'notNext';
  if (light < next.cost) return 'notEnoughLight';
  let out: Economy = { ...e, buildings: { ...e.buildings, [id]: 1 } };
  out = grant(out, def.reward);
  return { economy: out, reward: def.reward };
}

export type UpgradeBuildingError = 'notRestored' | 'maxed' | 'notEnoughCoins' | 'notEnoughLight';

/** Цена следующего уровня постройки (2 — монеты, 3 — монеты и свет) или null — уже расцвет / не восстановлена. */
export function nextLevelCost(e: Economy, id: string): { level: 2 | 3; coins: number; light: number } | null {
  const lv = buildingLevel(e, id);
  if (lv < 1 || lv >= 3) return null;
  const level = (lv + 1) as 2 | 3;
  const c = costOf(id, level);
  return { level, coins: c.coins, light: c.light };
}

/** Улучшить постройку (ур. 2) или довести до расцвета (ур. 3). */
export function upgradeBuilding(e: Economy, id: string, light: number): Economy | UpgradeBuildingError {
  const lv = buildingLevel(e, id);
  if (lv < 1) return 'notRestored';
  const c = nextLevelCost(e, id);
  if (!c) return 'maxed';
  if (coins(e) < c.coins) return 'notEnoughCoins';
  if (light < c.light) return 'notEnoughLight';
  return { ...e, coinsSpent: e.coinsSpent + c.coins, buildings: { ...e.buildings, [id]: c.level } };
}

/** Выдать награду (объект деревни, ежедневная награда, сундук). */
export function grant(e: Economy, r: Reward | { hints: number } | { light: number }): Economy {
  if ('coins' in r) return { ...e, coinsEarned: e.coinsEarned + r.coins };
  if ('light' in r) return { ...e, lightBonus: e.lightBonus + r.light };
  if ('hints' in r) return { ...e, hints: { ...e.hints, bank: e.hints.bank + r.hints } };
  if ('item' in r) return { ...e, wardrobe: grantItem(e.wardrobe, r.item) };
  // Способность «Поворот плитки»: первый уровень — 1 заряд за уровень.
  return { ...e, upgrades: { ...e.upgrades, rotate: Math.max(1, e.upgrades.rotate) } };
}

// ---------------------------------------------------------------------------
// Сундук фонарной площади (раз в день) и часовня

/** Можно ли сегодня открыть сундук. */
export const chestReady = (e: Economy, today: string) => villageBonuses(e).dailyChest && e.chest.lastDay !== today;

/** Вещи из сундуков (source 'chest') по порядку: каждый 4-й сундук — вещь, которой ещё нет. */
export function openChest(e: Economy, today: string): { economy: Economy; coins: number; item: string | null } | null {
  if (!chestReady(e, today)) return null;
  const count = e.chest.count + 1;
  // Монеты 20–40 детерминированно от номера сундука; улучшенная площадь — больше (× 1 / 1,5 / 2).
  const tier = Math.max(1, villageBonuses(e).chestTier);
  const c = Math.round((20 + ((count * 37) % 21)) * (1 + (tier - 1) * 0.5));
  let out: Economy = { ...e, chest: { lastDay: today, count }, coinsEarned: e.coinsEarned + c };
  let item: string | null = null;
  if (count % 4 === 0) {
    item = CHEST_ITEMS().find((id) => !out.wardrobe.owned.includes(id)) ?? null;
    if (item) out = grant(out, { item });
  }
  return { economy: out, coins: c, item };
}

const CHEST_ITEMS = () => ['staff-crook', 'face-monocle', 'road-ember', 'acc-wings', 'trail-fireflies'].filter((id) => itemById(id));

/** Часовня: бесплатный «+3 плитки» ещё раз за попытку — столько раз в день, сколько даёт уровень часовни. */
export const chapelLeft = (e: Economy, today: string) => Math.max(0, villageBonuses(e).dailyPlus3 - (e.chapel.day === today ? e.chapel.used : 0));
export const chapelReady = (e: Economy, today: string) => chapelLeft(e, today) > 0;
export const useChapel = (e: Economy, today: string): Economy => ({ ...e, chapel: { day: today, used: (e.chapel.day === today ? e.chapel.used : 0) + 1 } });

// ---------------------------------------------------------------------------
// Прокачка способностей (монеты)

export interface UpgradeDef {
  id: UpgradeId;
  /** Что даёт каждый уровень (индекс = уровень прокачки). */
  values: number[];
  /** Цена перехода на уровень i+1 (prices[i]); null — этот уровень не покупается (rotate 1 — из деревни). */
  prices: (number | null)[];
}

export const UPGRADES: Record<UpgradeId, UpgradeDef> = {
  stash: { id: 'stash', values: [1, 2], prices: [300] },
  rotate: { id: 'rotate', values: [0, 1, 2, 3], prices: [null, 115, 420] },
  lantern: { id: 'lantern', values: [2, 3, 4, 5], prices: [45, 160, 380] },
};

export const upgradeValue = (e: Economy, id: UpgradeId) => UPGRADES[id].values[e.upgrades[id]];
/** Цена следующего уровня; null — дальше некуда или уровень не покупается за монеты. */
export function upgradePrice(e: Economy, id: UpgradeId): number | null {
  return UPGRADES[id].prices[e.upgrades[id]] ?? null;
}

export type BuyError = 'maxed' | 'locked' | 'notEnoughCoins' | 'owned' | 'special';

export function buyUpgrade(e: Economy, id: UpgradeId): Economy | BuyError {
  const lvl = e.upgrades[id];
  if (lvl >= UPGRADES[id].values.length - 1) return 'maxed';
  const price = UPGRADES[id].prices[lvl];
  if (price === null) return 'locked';
  if (coins(e) < price) return 'notEnoughCoins';
  return { ...e, coinsSpent: e.coinsSpent + price, upgrades: { ...e.upgrades, [id]: lvl + 1 } };
}

// ---------------------------------------------------------------------------
// Гардероб: покупка вещей за монеты, надевание

/** Скидка на цену в любой валюте: монеты — кратно 5, свет — до целого (не меньше 1). */
export const discountCost = (c: Cost, pct: number): Cost => (pct <= 0 ? c : c.currency === 'coins' ? { ...c, amount: discounted(c.amount, pct) } : { ...c, amount: Math.max(1, Math.round((c.amount * (100 - pct)) / 100)) });

/** Цена вещи (монеты или свет) с учётом скидки дома Lumo. */
export const itemCost = (e: Economy, id: string): Cost => discountCost(itemBaseCost(id), villageBonuses(e).wardrobeDiscountPct);

/** Заплатить монетами или светом (свет — из баланса light, посчитанного снаружи). */
export function pay(e: Economy, c: Cost, light: number): Economy | 'notEnoughCoins' | 'notEnoughLight' {
  if (c.currency === 'coins') return coins(e) < c.amount ? 'notEnoughCoins' : { ...e, coinsSpent: e.coinsSpent + c.amount };
  return light < c.amount ? 'notEnoughLight' : { ...e, lightShop: e.lightShop + c.amount };
}

/** Купить вещь (обычные и часть редких — за свет, остальные — за монеты; вещи из деревни, заданий, сундуков, награды дня не продаются). */
export function buyItem(e: Economy, id: string, light = 0): Economy | BuyError | 'notEnoughLight' {
  const it = itemById(id);
  if (!it) return 'locked';
  if (e.wardrobe.owned.includes(id)) return 'owned';
  if (it.source === 'special') return 'special';
  if (it.source !== 'coins') return 'locked';
  const paid = pay(e, itemCost(e, id), light);
  if (typeof paid === 'string') return paid;
  return { ...paid, wardrobe: grantItem(paid.wardrobe, id) };
}

export function equip(e: Economy, id: string, color?: number): Economy {
  return { ...e, wardrobe: wear(e.wardrobe, id, color) };
}

// ---------------------------------------------------------------------------
// Ежедневная награда: календарь на 7 дней

export type DailyReward = { coins: number } | { hints: number } | { item: string; orCoins: number };

export const DAILY: readonly DailyReward[] = [
  { coins: 25 },
  { hints: 1 },
  { coins: 40 },
  { hints: 2 },
  { coins: 60 },
  { hints: 3 },
  { item: 'outfit-poncho', orCoins: 150 },
];

/** Разница в днях между двумя датами YYYY-MM-DD. */
function dayDiff(a: string, b: string): number {
  const t = (s: string) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
  return Math.round((t(b) - t(a)) / 86_400_000);
}

/** Какой день календаря (1–7) будет сегодня; null — сегодня награда уже получена. */
export function dailyDay(e: Economy, today: string): number | null {
  if (e.daily.lastDay === today) return null;
  // Пропустил день — серия начинается заново; после 7-го дня — снова с 1-го.
  if (!e.daily.lastDay || dayDiff(e.daily.lastDay, today) !== 1) return 1;
  return (e.daily.streak % 7) + 1;
}

export function claimDaily(e: Economy, today: string): { economy: Economy; day: number; reward: DailyReward } | null {
  const day = dailyDay(e, today);
  if (day === null) return null;
  const reward = DAILY[day - 1];
  let out: Economy = { ...e, daily: { lastDay: today, streak: day } };
  if ('item' in reward) out = out.wardrobe.owned.includes(reward.item) ? grant(out, { coins: reward.orCoins }) : grant(out, { item: reward.item });
  else out = grant(out, reward);
  return { economy: out, day, reward };
}

// ---------------------------------------------------------------------------
// Подсказки: 3 бесплатные в день + запас (покупка за монеты, награды, «за рекламу»)

/** Бесплатных подсказок в день: 3 + бонус дома пекаря. */
export const freeHintsPerDay = (e: Economy) => FREE_HINTS_PER_DAY + villageBonuses(e).extraFreeHints;

export function freeHintsLeft(e: Economy, today: string): number {
  const n = freeHintsPerDay(e);
  return e.hints.freeDay === today ? Math.max(0, n - e.hints.freeUsed) : n;
}

export const hintsAvailable = (e: Economy, today: string) => freeHintsLeft(e, today) + e.hints.bank;

/** Потратить подсказку: сначала бесплатные на сегодня, потом из запаса. null — подсказок нет. */
export function useHint(e: Economy, today: string): Economy | null {
  if (freeHintsLeft(e, today) > 0) {
    const used = e.hints.freeDay === today ? e.hints.freeUsed + 1 : 1;
    return { ...e, hints: { ...e.hints, freeDay: today, freeUsed: used } };
  }
  if (e.hints.bank > 0) return { ...e, hints: { ...e.hints, bank: e.hints.bank - 1 } };
  return null;
}

export function buyHint(e: Economy): Economy | BuyError {
  if (coins(e) < HINT_PRICE) return 'notEnoughCoins';
  return { ...e, coinsSpent: e.coinsSpent + HINT_PRICE, hints: { ...e.hints, bank: e.hints.bank + 1 } };
}

// ---------------------------------------------------------------------------
// Нормализация и слияние (сохранение, облако)

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (v: unknown, d = 0) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : d);
const str = (v: unknown, d = '') => (typeof v === 'string' ? v : d);

const DISTRICT_IDS = new Set<string>(['valley', 'forest', 'mountain']);
function validStreet(k: string): boolean {
  const [d, i] = k.split(':');
  return DISTRICT_IDS.has(d) && /^\d+$/.test(i ?? '') && +i < STREETS_PER_DISTRICT;
}
function validDecor(k: string): boolean {
  const [d, slot, v] = k.split(':');
  return DISTRICT_IDS.has(d) && /^\d+$/.test(slot ?? '') && /^\d+$/.test(v ?? '') && +slot < DECOR_SLOTS && +v < decorVariants(+slot);
}

export function normalizeEconomy(raw: unknown): Economy {
  const e = defaultEconomy();
  if (!isObj(raw)) return e;
  e.coinsEarned = num(raw.coinsEarned);
  e.coinsSpent = Math.min(num(raw.coinsSpent), e.coinsEarned);
  if (isObj(raw.paidStars)) for (const [k, v] of Object.entries(raw.paidStars)) e.paidStars[k] = Math.min(3, num(v));
  if (isObj(raw.paidFireflies)) for (const [k, v] of Object.entries(raw.paidFireflies)) e.paidFireflies[k] = num(v);
  // Постройки: v7 — уровни; v6 и раньше — список восстановленных (уровень 1).
  if (isObj(raw.buildings)) {
    for (const [k, v] of Object.entries(raw.buildings)) if (buildingDef(k) && num(v) > 0) e.buildings[k] = Math.min(3, num(v));
  } else if (Array.isArray(raw.village)) {
    for (const id of raw.village) if (typeof id === 'string' && buildingDef(id)) e.buildings[id] = 1;
  }
  if (isObj(raw.streets)) for (const [k, v] of Object.entries(raw.streets)) if (validStreet(k) && num(v) > 0) e.streets[k] = Math.min(3, num(v));
  if (isObj(raw.decor)) {
    const owned = Array.isArray(raw.decor.owned) ? raw.decor.owned.filter((x): x is string => typeof x === 'string' && validDecor(x)) : [];
    e.decor.owned = [...new Set(owned)];
    if (isObj(raw.decor.placed)) {
      for (const [k, v] of Object.entries(raw.decor.placed)) if (typeof v === 'number' && e.decor.owned.includes(`${k}:${v}`)) e.decor.placed[k] = v;
    }
  }
  e.cozyClaimed = num(raw.cozyClaimed);
  e.lightBonus = num(raw.lightBonus);
  e.lightShop = num(raw.lightShop);
  e.quests = normalizeQuests(raw.quests);
  if (isObj(raw.upgrades)) {
    for (const id of Object.keys(UPGRADES) as UpgradeId[]) e.upgrades[id] = Math.min(UPGRADES[id].values.length - 1, num(raw.upgrades[id]));
  }
  if (isObj(raw.hints)) e.hints = { bank: num(raw.hints.bank, START_HINTS), freeDay: str(raw.hints.freeDay), freeUsed: num(raw.hints.freeUsed) };
  // Гардероб; сохранение v5 — старые скины (костюмы, формы фонаря, дорога, арка) переносятся в гардероб.
  if (isObj(raw.wardrobe)) e.wardrobe = normalizeWardrobe(raw.wardrobe);
  else if (isObj(raw.skins)) {
    const owned = Array.isArray(raw.skins.owned) ? raw.skins.owned.filter((x): x is string => typeof x === 'string') : [];
    const equipped = isObj(raw.skins.equipped) ? Object.fromEntries(Object.entries(raw.skins.equipped).map(([k, v]) => [k, str(v)])) : {};
    e.wardrobe = wardrobeFromSkins(owned, equipped);
  }
  if (isObj(raw.daily)) e.daily = { lastDay: str(raw.daily.lastDay), streak: Math.min(7, num(raw.daily.streak)) };
  if (isObj(raw.chest)) e.chest = { lastDay: str(raw.chest.lastDay), count: num(raw.chest.count) };
  if (isObj(raw.chapel)) e.chapel = { day: str(raw.chapel.day), used: num(raw.chapel.used) };
  else if (typeof raw.chapelDay === 'string' && raw.chapelDay) e.chapel = { day: raw.chapelDay, used: 1 };
  if (isObj(raw.replays) && isObj(raw.replays.counts)) {
    const counts: Record<string, number> = {};
    for (const [k, v] of Object.entries(raw.replays.counts)) counts[k] = num(v);
    e.replays = { day: str(raw.replays.day), counts };
  }
  return e;
}

/** Слияние двух устройств: счётчики — максимум, купленное и восстановленное — объединение. */
export function mergeEconomy(local: Economy, cloud: Economy | null): Economy {
  if (!cloud) return local;
  const maxRec = (a: Record<string, number>, b: Record<string, number>) => {
    const out = { ...b };
    for (const [k, v] of Object.entries(a)) out[k] = Math.max(out[k] ?? 0, v);
    return out;
  };
  const decorOwned = [...new Set([...local.decor.owned, ...cloud.decor.owned])];
  const paidStars: Record<string, number> = { ...cloud.paidStars };
  for (const [k, v] of Object.entries(local.paidStars)) paidStars[k] = Math.max(paidStars[k] ?? 0, v);
  const paidFireflies: Record<string, number> = { ...cloud.paidFireflies };
  for (const [k, v] of Object.entries(local.paidFireflies)) paidFireflies[k] = Math.max(paidFireflies[k] ?? 0, v);
  const upgrades = { ...local.upgrades };
  for (const id of Object.keys(upgrades) as UpgradeId[]) upgrades[id] = Math.max(local.upgrades[id], cloud.upgrades[id]);
  const laterHints = local.hints.freeDay >= cloud.hints.freeDay ? local.hints : cloud.hints;
  const laterDaily = local.daily.lastDay >= cloud.daily.lastDay ? local.daily : cloud.daily;
  const coinsEarned = Math.max(local.coinsEarned, cloud.coinsEarned);
  return {
    coinsEarned,
    coinsSpent: Math.min(coinsEarned, Math.max(local.coinsSpent, cloud.coinsSpent)),
    paidStars,
    paidFireflies,
    buildings: maxRec(local.buildings, cloud.buildings),
    streets: maxRec(local.streets, cloud.streets),
    // Что стоит в слотах — как на этом устройстве (купленное — объединение).
    decor: { owned: decorOwned, placed: { ...cloud.decor.placed, ...local.decor.placed } },
    cozyClaimed: Math.max(local.cozyClaimed, cloud.cozyClaimed),
    lightBonus: Math.max(local.lightBonus, cloud.lightBonus),
    lightShop: Math.max(local.lightShop, cloud.lightShop),
    quests: mergeQuests(local.quests, cloud.quests),
    upgrades,
    hints: { bank: Math.max(local.hints.bank, cloud.hints.bank), freeDay: laterHints.freeDay, freeUsed: laterHints.freeUsed },
    wardrobe: mergeWardrobe(local.wardrobe, cloud.wardrobe),
    daily: laterDaily,
    chest: local.chest.lastDay >= cloud.chest.lastDay ? { ...local.chest, count: Math.max(local.chest.count, cloud.chest.count) } : { ...cloud.chest, count: Math.max(local.chest.count, cloud.chest.count) },
    chapel: local.chapel.day > cloud.chapel.day ? local.chapel : cloud.chapel.day > local.chapel.day ? cloud.chapel : { day: local.chapel.day, used: Math.max(local.chapel.used, cloud.chapel.used) },
    replays: local.replays.day >= cloud.replays.day ? local.replays : cloud.replays,
  };
}

/**
 * Экономика для сохранения старой версии (до валют): монеты за уже пройденные уровни выдаются задним числом,
 * костюмы, открытые звёздами, остаются у игрока.
 */
export function economyFromProgress(stars: Record<string, number>, avatar: number): Economy {
  let e = defaultEconomy();
  for (const [id, n] of Object.entries(stars)) if (n > 0) e = applyWin(e, id, n).economy;
  const total = Object.values(stars).reduce((a, b) => a + b, 0);
  // Раньше аватарки открывались звёздами (10/20/25) — уже открытые остаются (как вещи гардероба).
  const owned = ['costume-0', 'costume-1', 'costume-2', 'costume-3'];
  for (const [id, need] of [['costume-4', 10], ['costume-5', 20], ['costume-6', 25]] as const) if (total >= need) owned.push(id);
  const costume = `costume-${avatar}`;
  e.wardrobe = wardrobeFromSkins(owned, { costume: owned.includes(costume) ? costume : 'costume-0' });
  return e;
}
