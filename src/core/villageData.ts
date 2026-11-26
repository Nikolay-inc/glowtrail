// Данные «Деревни 2.0» без логики и без зависимостей: районы и их постройки, цены трёх уровней построек,
// бонусы по уровням, улицы, украшения, уют, задания жителей. Отсюда же берёт цены модель экономики
// (src/core/economyModel.ts, npm run sim-economy) — игра и симуляция считают по одним таблицам.

// ---------------------------------------------------------------------------
// Районы

export type DistrictId = 'valley' | 'forest' | 'mountain';
export const DISTRICTS: readonly DistrictId[] = ['valley', 'forest', 'mountain'];

/** Множитель монет главы: цены в монетах района растут вместе с доходом главы. */
export const DISTRICT_COIN_MULT: Record<DistrictId, number> = { valley: 1, forest: 1.25, mountain: 1.5 };

/** Награда за восстановление постройки (один раз). */
export type Reward = { coins: number } | { item: string } | { ability: 'rotate' };

export interface BuildingDef {
  id: string;
  district: DistrictId;
  /** Порядковый номер в районе (порядок восстановления). */
  index: number;
  reward: Reward;
}

/** Постройки районов по порядку восстановления. Названия, истории, бонусы — i18n `building.<id>.*`, `bonus.<id>`. */
const REWARDS: Record<DistrictId, readonly [string, Reward][]> = {
  valley: [
    ['well', { coins: 30 }],
    ['bakery', { coins: 40 }],
    ['workshop', { ability: 'rotate' }],
    ['mill', { item: 'road-planks' }],
    ['bridge', { coins: 60 }],
    ['garden', { item: 'arch-flowers' }],
    ['chapel', { coins: 80 }],
    ['square', { item: 'lamp-star' }],
    ['lumo', { item: 'outfit-star-robe' }],
    ['lighthouse', { coins: 150 }],
  ],
  forest: [
    ['herbalist', { item: 'hat-wreath' }],
    ['observatory', { coins: 60 }],
    ['owl-post', { item: 'acc-keys' }],
    ['mushroom-farm', { coins: 70 }],
    ['sawmill', { item: 'outfit-apron' }],
    ['lamp-workshop', { coins: 80 }],
    ['teahouse', { item: 'pet-firefly' }],
    ['forester', { coins: 90 }],
    ['swing-bridge', { coins: 100 }],
    ['glow-lake', { coins: 200 }],
  ],
  // Горный город — пока только структура: силуэты «скоро», не открывается.
  mountain: [
    ['mine', { coins: 60 }],
    ['forge', { coins: 70 }],
    ['cable-car', { coins: 80 }],
    ['crystal-cave', { coins: 90 }],
    ['goat-farm', { coins: 90 }],
    ['bell-tower', { coins: 100 }],
    ['hot-springs', { coins: 110 }],
    ['stone-bridge', { coins: 120 }],
    ['star-temple', { coins: 140 }],
    ['summit-beacon', { coins: 220 }],
  ],
};

export const BUILDINGS: readonly BuildingDef[] = DISTRICTS.flatMap((d) => REWARDS[d].map(([id, reward], index) => ({ id, district: d, index, reward })));
export const buildingDef = (id: string) => BUILDINGS.find((b) => b.id === id);
export const districtBuildings = (d: DistrictId) => BUILDINGS.filter((b) => b.district === d);
export const DISTRICT_BUILDINGS: Record<DistrictId, readonly string[]> = {
  valley: districtBuildings('valley').map((b) => b.id),
  forest: districtBuildings('forest').map((b) => b.id),
  mountain: districtBuildings('mountain').map((b) => b.id),
};

// ---------------------------------------------------------------------------
// Цены уровней построек

/** Уровень 1 «восстановить» — свет. Сумма ≈ свет среднего игрока за главу (2,4 звезды, 65% светлячков). */
export const L1_LIGHT: Record<DistrictId, readonly number[]> = {
  valley: [8, 10, 10, 11, 12, 14, 15, 16, 17, 19],
  forest: [9, 10, 11, 12, 13, 14, 15, 16, 17, 19],
  mountain: [10, 11, 12, 13, 14, 15, 16, 17, 18, 19],
};
/** Уровень 2 «улучшить» — монеты (долина × 1,1; лес × 1,45; горы × 1,8 — бонусы построек растут с уровнями). */
export const L2_MULT: Record<DistrictId, number> = { valley: 1, forest: 1.45, mountain: 1.8 };
export const L2_COINS_BASE: readonly number[] = [45, 60, 70, 75, 85, 95, 105, 110, 120, 140];

export interface BuildingCost {
  light: number;
  coins: number;
}

/** Цена уровня постройки (1 — восстановить, 2 — улучшить, 3 — расцвет). */
export function buildingCost(d: DistrictId, index: number, level: 1 | 2 | 3): BuildingCost {
  const l1 = L1_LIGHT[d][index];
  const l2 = Math.round((L2_COINS_BASE[index] * L2_MULT[d]) / 5) * 5;
  if (level === 1) return { light: l1, coins: 0 };
  if (level === 2) return { light: 0, coins: l2 };
  // Расцвет: вдвое дороже улучшения и немного света (свет — из улучшенных результатов, заданий, уюта).
  return { light: Math.round(l1 * 0.35), coins: l2 * 2 };
}

export const costOf = (id: string, level: 1 | 2 | 3): BuildingCost => {
  const b = buildingDef(id)!;
  return buildingCost(b.district, b.index, level);
};

// ---------------------------------------------------------------------------
// Бонусы построек по уровням (индекс = уровень − 1). Одинаковые виды бонусов складываются.

export type BonusKind =
  | 'lightPer3Star' // +свет за каждый уровень на 3 звезды
  | 'extraFreeHints' // +бесплатных подсказок в день
  | 'rotateCharges' // «Поворот плитки»: заряды (ур. 1 открывает способность)
  | 'coinMultPct' // +% монет за уровни
  | 'coinsPerFirefly' // монет за нового светлячка
  | 'brightFireflies' // светлячки на поле ярче
  | 'dailyPlus3' // бесплатных «+3 плитки» в день
  | 'chestTier' // сундук дня (ступень: больше монет)
  | 'wardrobeDiscountPct' // скидка на гардероб
  | 'preview' // «Фонарик»: плиток видно наперёд
  | 'nightLight' // ночные уровни светлее
  | 'questRerolls' // заменить задание жителя (раз в день)
  | 'questLight' // +свет за каждое выполненное задание
  | 'streetDiscountPct' // скидка на улицы
  | 'decorDiscountPct' // скидка на украшения
  | 'weeklyPct'; // +% к награде большого задания недели

export const BONUS: Record<string, { kind: BonusKind; values: readonly [number, number, number] }> = {
  well: { kind: 'lightPer3Star', values: [1, 2, 3] },
  bakery: { kind: 'extraFreeHints', values: [1, 2, 3] },
  workshop: { kind: 'rotateCharges', values: [1, 2, 3] },
  mill: { kind: 'coinMultPct', values: [10, 15, 20] },
  bridge: { kind: 'coinsPerFirefly', values: [5, 7, 10] },
  garden: { kind: 'brightFireflies', values: [1, 2, 3] },
  chapel: { kind: 'dailyPlus3', values: [1, 2, 3] },
  square: { kind: 'chestTier', values: [1, 2, 3] },
  lumo: { kind: 'wardrobeDiscountPct', values: [5, 10, 15] },
  lighthouse: { kind: 'preview', values: [1, 2, 3] },
  herbalist: { kind: 'extraFreeHints', values: [1, 1, 2] },
  observatory: { kind: 'nightLight', values: [1, 2, 3] },
  'owl-post': { kind: 'questRerolls', values: [1, 2, 3] },
  'mushroom-farm': { kind: 'questLight', values: [1, 2, 3] },
  sawmill: { kind: 'streetDiscountPct', values: [10, 15, 20] },
  'lamp-workshop': { kind: 'coinsPerFirefly', values: [2, 3, 5] },
  teahouse: { kind: 'coinMultPct', values: [5, 8, 10] },
  forester: { kind: 'decorDiscountPct', values: [10, 15, 20] },
  'swing-bridge': { kind: 'lightPer3Star', values: [1, 1, 2] },
  'glow-lake': { kind: 'weeklyPct', values: [20, 35, 50] },
};

export type Bonuses = Record<BonusKind, number>;

/** Сумма бонусов по уровням построек (id → уровень 0–3). Скидки — не больше 50%. */
export function bonusesOf(levels: Record<string, number>): Bonuses {
  const out = Object.fromEntries(Object.values(BONUS).map((b) => [b.kind, 0])) as Bonuses;
  for (const [id, lv] of Object.entries(levels)) {
    const b = BONUS[id];
    if (b && lv > 0) out[b.kind] += b.values[Math.min(3, lv) - 1];
  }
  for (const k of ['wardrobeDiscountPct', 'streetDiscountPct', 'decorDiscountPct'] as const) out[k] = Math.min(50, out[k]);
  return out;
}

/** Цена со скидкой (кратно 5, не меньше 5). */
export const discounted = (price: number, pct: number) => (pct > 0 ? Math.max(5, Math.round((price * (100 - pct)) / 100 / 5) * 5) : price);

// ---------------------------------------------------------------------------
// Улицы и украшения

/** Улицы района: тропинка (0) → гравий (1) → брусчатка (2) → мощёная с фонарями (3). */
export const STREETS_PER_DISTRICT = 4;
export const STREET_PRICES: readonly number[] = [40, 70, 110];
export const streetPrice = (d: DistrictId, step: number) => Math.round((STREET_PRICES[step] * DISTRICT_COIN_MULT[d]) / 5) * 5;

/**
 * Украшения: слотов на район, вариантов в слоте (3–5), цена варианта; покупка один раз, смена бесплатна.
 * Варианты 2 и 4 — за свет (свет не копится без дела), остальные — за монеты.
 */
export const DECOR_SLOTS = 24;
export const DECOR_PRICES: readonly number[] = [15, 30, 55, 85, 120];
export const DECOR_LIGHT: readonly (number | null)[] = [null, 6, null, 12, null];
export type DecorType = 'bench' | 'flowers' | 'lamp' | 'tree' | 'sign' | 'cart' | 'statue' | 'birdhouse';
export const DECOR_TYPE_ORDER: readonly DecorType[] = ['bench', 'flowers', 'lamp', 'tree', 'sign', 'cart', 'statue', 'birdhouse'];
export const decorType = (slot: number): DecorType => DECOR_TYPE_ORDER[slot % DECOR_TYPE_ORDER.length];
/** Сколько вариантов в слоте (3, 4 или 5 — по кругу). */
export const decorVariants = (slot: number) => [3, 4, 3, 5, 4][slot % 5];
export type Currency = 'coins' | 'light';
export interface Cost {
  currency: Currency;
  amount: number;
}
/** Цена варианта: первый — всегда 15 монет (мелкая радость между целями), варианты 2 и 4 — свет, остальные — монеты × глава. */
export function decorPrice(d: DistrictId, variant: number): Cost {
  const light = DECOR_LIGHT[variant];
  if (light) return { currency: 'light', amount: light };
  return { currency: 'coins', amount: variant === 0 ? DECOR_PRICES[0] : Math.round((DECOR_PRICES[variant] * DISTRICT_COIN_MULT[d]) / 5) * 5 };
}

// ---------------------------------------------------------------------------
// Уют: очки за уровни построек, украшения и улицы; каждые COZY_STEP очков — награда по кругу

export const COZY = { building: [5, 5, 10], decor: 1, street: 4 } as const;
export const COZY_STEP = 30;
/** street — бесплатный шаг улицы (самой простой улицы в открытых районах). */
export type CozyReward = { coins: number } | { light: number } | { item: true } | { chest: true } | { street: true };
export const COZY_REWARDS: readonly CozyReward[] = [{ coins: 60 }, { light: 6 }, { item: true }, { street: true }, { chest: true }, { light: 8 }];

// ---------------------------------------------------------------------------
// Задания жителей: 3 в день (монеты, монеты, свет) и большое на неделю (монеты + сундук + шаг улицы)

export const DAILY_QUESTS: readonly ({ coins: number } | { light: number })[] = [{ coins: 25 }, { coins: 35 }, { light: 4 }];
export const WEEKLY_QUEST = { coins: 200, chest: true, street: true } as const;

/** Сундук: монеты 20–40 (в среднем 30), каждый 4-й — вещь гардероба. */
export const CHEST_AVG_COINS = 30;
