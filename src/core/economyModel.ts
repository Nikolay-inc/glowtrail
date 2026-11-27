// Экономика на три главы (1–30 «Долина», 31–60 «Туманный лес», 61–90 «Горный город») — данные и симуляция
// без отрисовки (npm run sim-economy, тесты). Доходы: монеты и свет за уровни (звёзды, светлячки), улучшение
// результата при перепрохождении, повтор без улучшения (6 → 3 → 1 → 0 монет за уровень в день), задания жителей,
// награда дня, сундук площади, бонусы построек, уровни уюта. Расходы: постройки (3 уровня), украшения, улицы,
// улучшения способностей, гардероб. Уровни экономика не блокирует никогда: в модели (и в игре) проход уровня
// ни от чего не зависит, покупки только ускоряют и украшают.
//
// Главы 2–3 моделируются по плану: уровней ещё нет, рейтинг и светлячки — из «пилы» мира 1 со сдвигом сложности.

import { DAILY, UPGRADES, type UpgradeId } from './economy';
import {
  bonusesOf,
  BUILDINGS,
  buildingCost,
  CHALLENGE_STREET_COINS,
  CHEST_AVG_COINS,
  COZY,
  COZY_REWARDS,
  COZY_STEP,
  DAILY_QUESTS,
  DECOR_PRICES,
  DECOR_SLOTS,
  decorPrice,
  decorVariants,
  DISTRICT_BUILDINGS,
  DISTRICT_COIN_MULT,
  streetPrice,
  STREETS_PER_DISTRICT,
  WEEKLY_QUEST,
  type BuildingCost,
  type DistrictId,
} from './villageData';
import { CHEST_ITEMS, COZY_ITEMS, isLumoPart, itemBaseCost, QUEST_ITEMS, WARDROBE } from './wardrobe';

// Цены, бонусы, уют и задания — общие с игрой (src/core/villageData.ts).
export {
  buildingCost,
  CHEST_AVG_COINS,
  COZY,
  COZY_REWARDS,
  COZY_STEP,
  DAILY_QUESTS,
  DECOR_LIGHT,
  DECOR_PRICES,
  DECOR_SLOTS,
  decorPrice,
  decorVariants,
  DISTRICT_BUILDINGS,
  L1_LIGHT,
  L2_COINS_BASE,
  L2_MULT,
  STREET_PRICES,
  streetPrice,
  STREETS_PER_DISTRICT,
  WEEKLY_QUEST,
  type BuildingCost,
  type CozyReward,
  type DistrictId,
} from './villageData';

// ---------------------------------------------------------------------------
// Главы и районы

export interface Chapter {
  id: 1 | 2 | 3;
  district: DistrictId;
  /** Номера уровней (включительно). */
  from: number;
  to: number;
  /** Множитель монет за уровни, задания и цен в монетах (цены растут вместе с доходом). */
  coinMult: number;
}

export const CHAPTERS: readonly Chapter[] = [
  { id: 1, district: 'valley', from: 1, to: 30, coinMult: DISTRICT_COIN_MULT.valley },
  { id: 2, district: 'forest', from: 31, to: 60, coinMult: DISTRICT_COIN_MULT.forest },
  { id: 3, district: 'mountain', from: 61, to: 90, coinMult: DISTRICT_COIN_MULT.mountain },
];

/** Повтор уровня без улучшения: монеты за 1-й, 2-й, 3-й, 4-й+ повтор этого уровня за день (× coinMult). */
export const REPLAY_COINS: readonly number[] = [6, 3, 1, 0];

/** Вещи гардероба за монеты (цены — src/core/wardrobe.ts, середины по редкости — RARITY_PRICE). */
export const WARDROBE_COIN_ITEMS = WARDROBE.filter((w) => w.source === 'coins').map((w) => ({ id: w.id, price: w.price, rarity: w.rarity, ...itemBaseCost(w.id) }));

/** Улучшения способностей — в порядке, в котором их обычно берут. */
export const ABILITY_ORDER: readonly { id: UpgradeId; level: number }[] = [
  { id: 'lantern', level: 1 },
  { id: 'rotate', level: 2 },
  { id: 'lantern', level: 2 },
  { id: 'stash', level: 1 },
  { id: 'lantern', level: 3 },
  { id: 'rotate', level: 3 },
];
export const abilityPrice = (a: { id: UpgradeId; level: number }) => UPGRADES[a.id].prices[a.level - 1] ?? 0;

// ---------------------------------------------------------------------------
// Уровни для модели

export interface ModelLevel {
  num: number;
  chapter: 1 | 2 | 3;
  rating: number;
  fireflies: number;
  infinite: boolean;
}

/** «Пила» десятка: 1–3 лёгкие, 4–7 средние, 8 передышка, 9 сложнее, 10 испытание. */
const SAW = [2.2, 2.4, 2.6, 3.2, 3.6, 4, 4.4, 2.6, 5, 6];

/** Уровни глав 2–3 по плану (рейтинг растёт на 0,5 за главу и на 0,25 за десяток), светлячки — на ~40% уровней, как в «Долине». */
export function plannedLevels(chapter: 2 | 3): ModelLevel[] {
  const out: ModelLevel[] = [];
  for (let k = 0; k < 30; k++) {
    const tens = Math.floor(k / 10);
    const rating = Math.min(8, SAW[k % 10] + 0.5 * (chapter - 1) + 0.25 * tens);
    // Светлячки — как в «Долине»: примерно на 40% уровней, по 2–4 (больше — на испытаниях).
    const ff = chapter === 2 ? [2, 0, 2, 0, 0, 0, 2, 0, 0, 4][k % 10] : [2, 0, 2, 0, 0, 0, 3, 0, 0, 4][k % 10];
    out.push({ num: (chapter - 1) * 30 + k + 1, chapter, rating, fireflies: ff, infinite: false });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Профили игроков

export interface Profile {
  id: 'weak' | 'average' | 'strong';
  /** Средние звёзды и доля светлячков за первое прохождение. */
  stars: number;
  fireflies: number;
  /** Потолок при перепрохождении (сколько звёзд реально добирает). */
  maxStars: number;
  /** Время уровня относительно среднего. */
  speed: number;
}

export const PROFILES: readonly Profile[] = [
  { id: 'weak', stars: 1.8, fireflies: 0.4, maxStars: 2.6, speed: 1.25 },
  { id: 'average', stars: 2.4, fireflies: 0.65, maxStars: 2.9, speed: 1 },
  { id: 'strong', stars: 2.9, fireflies: 0.9, maxStars: 3, speed: 0.85 },
];

/** Минут в день на новые уровни; плюс extra — перепрохождения и задания (0 или 15). */
export const NEW_LEVEL_MINUTES = 20;

/** Ожидаемое время уровня с поражениями (рейтинг 2 ≈ 1,5 мин, 6 ≈ 4 мин). */
export function levelMinutes(l: ModelLevel, p: Profile): number {
  const base = l.infinite ? 0.7 : 0.6 + l.rating * 0.4;
  const lose = Math.min(0.5, Math.max(0.03, (l.rating - 2) * 0.1 + (p.id === 'weak' ? 0.08 : p.id === 'strong' ? -0.04 : 0)));
  return base * p.speed * (1 + (0.6 * lose) / (1 - lose));
}

/**
 * Звёзды по уровням главы со средним p.stars: сложные уровни получают меньше, округление — с переносом ошибки
 * (детерминированно, средний итог совпадает с профилем).
 */
export function starsFor(levels: ModelLevel[], mean: number): number[] {
  const avgR = levels.reduce((s, l) => s + l.rating, 0) / levels.length;
  let err = 0;
  return levels.map((l) => {
    const want = Math.max(1, Math.min(3, mean + (avgR - l.rating) * 0.22)) + err;
    const s = Math.max(1, Math.min(3, Math.round(want)));
    err = want - s;
    return s;
  });
}

// ---------------------------------------------------------------------------
// Симуляция

export type GoalKind = 'L1' | 'L2' | 'L3' | 'decor' | 'street' | 'ability' | 'wardrobe' | 'cozy' | 'quest' | 'improve';

export interface SimEvent {
  /** Минута игры (всего) и минута внутри главы. */
  t: number;
  tChapter: number;
  day: number;
  chapter: number;
  level: number;
  kind: GoalKind;
  what: string;
}

export interface ChapterSummary {
  chapter: number;
  /** Минута (общая), когда пройден последний уровень главы. */
  doneAt: number;
  days: number;
  l1: number;
  l2: number;
  /** Доля построек и первых улучшений района (из 20) к концу главы. */
  share: number;
  l3: number;
  /** Слотов района с украшением (из 24) и купленных вариантов (всех районов, из всех). */
  decorSlots: number;
  decorBought: number;
  decorTotal: number;
  streets: number;
  streetsTotal: number;
  /** Вещи гардероба Lumo (части, не стили поля): куплено и получено наградами (всего к концу главы). */
  wardrobeBought: number;
  wardrobeRewards: number;
  /** Стили поля (фонари, дороги, арки): куплено и получено наградами (всего к концу главы). */
  fieldBought: number;
  fieldRewards: number;
  /** Бесплатные расцветы за испытания: получено и использовано (всего к концу главы). */
  bloomsEarned: number;
  bloomsUsed: number;
  abilities: number;
  /**
   * Самый длинный промежуток между целями в первый час главы и их число. Промежуток, внутри которого не закончился
   * ни один уровень (один длинный уровень-испытание — сам по себе цель), не считается.
   */
  maxGapFirstHour: number;
  /** То же без исключения длинных уровней (для справки). */
  maxGapRaw: number;
  goalsFirstHour: number;
  coinsLeft: number;
  /** Свет, оставшийся в конце главы. */
  lightLeft: number;
  /** Когда (минута главы) восстановлена каждая постройка. */
  l1At: number[];
  l2At: number[];
}

export interface SimResult {
  profile: Profile['id'];
  extra: number;
  chapters: ChapterSummary[];
  events: SimEvent[];
  /** Минута первой покупки вещи гардероба (null — не было). */
  firstItemAt: number | null;
  /** Сколько дней «добирания» (только перепрохождения и задания по extra мин) после главы 3 до покупки всего. */
  tailDays: number | null;
  /**
   * Вехи «добирания» (день после главы 3, 0 — уже к концу главы 3): все постройки на 3-м уровне, все улицы,
   * по украшению в каждом слоте, все варианты украшений, весь гардероб, способности.
   */
  milestones: { buildings: number | null; streets: number | null; decorOne: number | null; decor: number | null; wardrobe: number | null; abilities: number | null };
  /** Минут перепрохождений и заданий всего — за всю игру (вместе с хвостом). */
  extraMinutesTotal: number;
  /** Самые долгие ожидания следующей цели у игрока (минуты) — где «впритык». */
  waits: { chapter: number; level: number; minutes: number; waitingFor: string }[];
}

interface District {
  level: number[];
  /** Купленные варианты по слотам (номера). */
  decor: number[][];
  streets: number[];
}

/**
 * Уровни трёх глав: настоящие уровни из списка (глава 1 — «Долина», глава 2 — «Туманный лес», если они
 * переданы), остальные главы — по плану (plannedLevels).
 */
export function chapterLevels(levels: ModelLevel[]): ModelLevel[][] {
  const real = (c: 1 | 2 | 3) => levels.filter((l) => l.chapter === c);
  const ch2 = real(2);
  return [real(1), ch2.length >= 30 ? ch2.slice(0, 30) : plannedLevels(2), plannedLevels(3)];
}

/** Вещи «за монеты» с ценой в своей валюте (обычные и половина редких — свет). */
export const SHOP_ITEMS = WARDROBE.filter((w) => w.source === 'coins').map((w) => ({ id: w.id, rarity: w.rarity, lumo: isLumoPart(w.id), ...itemBaseCost(w.id) }));
const CHEST_LIST = [...CHEST_ITEMS];
const QUEST_LIST = QUEST_ITEMS.filter((id) => WARDROBE.some((w) => w.id === id));
const COZY_LIST = [...COZY_ITEMS];

/**
 * Полная симуляция трёх глав для профиля; extra — минут перепрохождений и заданий в день.
 * levels — настоящие уровни игры (глава 1 и, если есть, глава 2); недостающие главы — по плану.
 */
export function simulate3(levels: ModelLevel[], p: Profile, extra: number, opts: { tailMaxDays?: number } = {}): SimResult {
  const all = chapterLevels(levels);
  let coins = 0;
  let light = 0;
  let t = 0;
  let day = 1;
  let dayNew = 0;
  let calendar = 0;
  let cozy = 0;
  let cozyPaid = 0;
  let chests = 0;
  let extraTotal = 0;
  let firstItemAt: number | null = null;
  let itemDay = -99;
  const events: SimEvent[] = [];
  const waits: SimResult['waits'] = [];
  const mk = (): District => ({ level: Array(10).fill(0), decor: Array.from({ length: DECOR_SLOTS }, () => []), streets: Array(STREETS_PER_DISTRICT).fill(0) });
  /** Самый дешёвый некупленный вариант слота в валюте cur. */
  const nextVariant = (d: DistrictId, k: number, cur: 'coins' | 'light') => {
    let bestV = -1;
    for (let v = 0; v < decorVariants(k); v++) {
      if (dist[d].decor[k].includes(v)) continue;
      const c = decorPrice(d, v);
      if (c.currency === cur && (bestV < 0 || c.amount < decorPrice(d, bestV).amount)) bestV = v;
    }
    return bestV;
  };
  const dist: Record<DistrictId, District> = { valley: mk(), forest: mk(), mountain: mk() };
  let abilities = 0;
  const owned = new Set<string>();
  let rewardsLumo = 0;
  let rewardsField = 0;
  let bloomsEarned = 0;
  let bloomsUsed = 0;
  let boughtLumo = 0;
  let boughtField = 0;
  const best: { stars: number; ff: number; total: number; ch: number }[] = [];
  const open: DistrictId[] = [];
  let chapterIdx = 0;
  let chapterStart = 0;
  let curLevel = 0;
  let lastGoal = 0;
  const chapters: ChapterSummary[] = [];

  // Бонусы построек по их уровням — те же таблицы, что в игре (villageData BONUS).
  const bon = () => {
    const lv: Record<string, number> = {};
    for (const d of ['valley', 'forest', 'mountain'] as const) DISTRICT_BUILDINGS[d].forEach((id, i) => (lv[id] = dist[d].level[i]));
    return bonusesOf(lv);
  };
  const coinMult = () => CHAPTERS[chapterIdx].coinMult;
  const goal = (kind: GoalKind, what: string) => {
    const gap = t - lastGoal;
    if (gap > 4) waits.push({ chapter: chapterIdx + 1, level: curLevel, minutes: Math.round(gap * 10) / 10, waitingFor: what });
    lastGoal = t;
    events.push({ t: Math.round(t * 10) / 10, tChapter: Math.round((t - chapterStart) * 10) / 10, day, chapter: chapterIdx + 1, level: curLevel, kind, what });
  };
  /** Вещь получена наградой (части Lumo считаем в «гардероб»). */
  const reward = (id: string | undefined) => {
    if (!id || owned.has(id)) return false;
    owned.add(id);
    if (isLumoPart(id)) rewardsLumo++;
    else rewardsField++;
    return true;
  };
  const firstFree = (list: string[]) => list.find((id) => !owned.has(id));
  /** Бесплатный шаг самой простой улицы в открытых районах. */
  const freeStreet = () => {
    let bestS: { d: DistrictId; i: number } | null = null;
    for (const d of open) dist[d].streets.forEach((st, i) => st < 3 && (!bestS || st < dist[bestS.d].streets[bestS.i]) && (bestS = { d, i }));
    if (!bestS) return false;
    const b = bestS as { d: DistrictId; i: number };
    dist[b.d].streets[b.i]++;
    cozy += COZY.street;
    return true;
  };
  const openChest = () => {
    chests++;
    coins += Math.round(CHEST_AVG_COINS * (1 + (Math.max(1, bon().chestTier) - 1) * 0.5));
    if (chests % 4 === 0) reward(firstFree(CHEST_LIST));
  };
  const addCozy = (n: number) => {
    cozy += n;
    while (cozy >= (cozyPaid + 1) * COZY_STEP) {
      const r = COZY_REWARDS[cozyPaid % COZY_REWARDS.length];
      cozyPaid++;
      goal('cozy', `cozy ${cozyPaid}`);
      if ('coins' in r) coins += Math.round(r.coins * coinMult());
      else if ('light' in r) light += r.light;
      else if ('item' in r) {
        if (!reward(firstFree(COZY_LIST))) coins += 100;
      } else if ('street' in r) {
        if (!freeStreet()) coins += 100;
      } else openChest();
    }
  };

  /** Новый день: награда дня, сундук площади. */
  const newDay = () => {
    day++;
    dayNew = 0;
    const r = DAILY[calendar % 7];
    calendar++;
    if ('coins' in r) coins += r.coins;
    else if ('item' in r && !reward(r.item)) coins += r.orCoins;
    if (bon().chestTier) openChest();
  };

  /** Купить в слот k вариант v. */
  const buyDecor = (d: DistrictId, k: number, v: number) => {
    dist[d].decor[k].push(v);
    addCozy(COZY.decor);
    goal('decor', `${d}:${k + 1}.${v + 1}`);
  };
  /** Следующая вещь за свет / за монеты (дешёвые сначала): части Lumo и стили поля по очереди, Lumo — первой. */
  const nextItem = (cur: 'coins' | 'light', late = false) => {
    // В «добирании» стиль поля — на каждые три части Lumo.
    const field = boughtField < boughtLumo / (late ? 3 : 1);
    return SHOP_ITEMS.filter((w) => w.currency === cur && !owned.has(w.id)).sort((a, b) => Number(a.lumo === field) - Number(b.lumo === field) || a.amount - b.amount)[0];
  };
  const buyItem = (w: (typeof SHOP_ITEMS)[number]) => {
    owned.add(w.id);
    if (w.lumo) boughtLumo++;
    else boughtField++;
    if (firstItemAt === null) firstItemAt = t;
    itemDay = day;
    goal('wardrobe', w.id);
  };
  /** Свет, который держим на расцвет (когда есть постройки на 2-м уровне). */
  const l3Reserve = () => {
    let r = 0;
    for (const d of open) dist[d].level.forEach((lv, i) => lv === 2 && (r = Math.max(r, buildingCost(d, i, 3).light)));
    return r;
  };

  /** Расцвет в подарок за испытание: игрок выбирает самую дорогую по расцвету постройку на 2-м уровне. */
  const useBlooms = () => {
    while (bloomsUsed < bloomsEarned) {
      let pickB: { d: DistrictId; i: number; c: number } | null = null;
      for (const d of open) dist[d].level.forEach((lv, i) => {
        const c = buildingCost(d, i, 3).coins;
        if (lv === 2 && (!pickB || c > pickB.c)) pickB = { d, i, c };
      });
      if (!pickB) return;
      const b = pickB as { d: DistrictId; i: number };
      dist[b.d].level[b.i] = 3;
      bloomsUsed++;
      addCozy(COZY.building[2]);
      goal('L3', `${b.d}:${DISTRICT_BUILDINGS[b.d][b.i]}+gift`);
    }
  };

  /** Покупки между уровнями: постройка за свет, трата лишнего света, одна покупка за монеты. */
  const spend = (late: boolean) => {
    useBlooms();
    // Свет: следующая постройка района по порядку (сначала текущий район).
    let nextL1 = 0;
    for (const d of open) {
      const i = dist[d].level.indexOf(0);
      if (i < 0) continue;
      const c = buildingCost(d, i, 1);
      if (light >= c.light) {
        light -= c.light;
        dist[d].level[i] = 1;
        const def = BUILDINGS.find((b) => b.id === DISTRICT_BUILDINGS[d][i]);
        if (def && 'item' in def.reward) reward(def.reward.item);
        addCozy(COZY.building[0]);
        goal('L1', `${d}:${DISTRICT_BUILDINGS[d][i]}`);
        // Следующая постройка района — на неё и копим.
        const j = dist[d].level.indexOf(0);
        if (j >= 0) nextL1 = buildingCost(d, j, 1).light;
      } else nextL1 = c.light;
      break;
    }
    // Лишний свет: сверх того, что копится на следующую постройку (и на расцвет в «добирании»).
    // Первая вещь — как можно раньше (дешёвая обычная за свет); дальше не больше одной вещи в день,
    // остальное — украшения за свет в текущем районе.
    const reserve = nextL1 + (late ? l3Reserve() : 0);
    const li = nextItem('light');
    if (li && firstItemAt === null && light >= li.amount && t >= 4) {
      light -= li.amount;
      buyItem(li);
    } else {
      for (let guard = 0; guard < 4; guard++) {
        const spare = light - reserve;
        const item = nextItem('light', late);
        // Вещь: в «добирании» — не чаще раза в день, в обычной игре — раз в 6 дней (свет идёт и на украшения).
        if (item && day - itemDay >= (late ? 1 : 6) && spare >= item.amount) {
          light -= item.amount;
          buyItem(item);
          continue;
        }
        // Украшение за свет: самый дешёвый световой вариант в слотах открытых районов (сначала пустые слоты текущего района).
        let opt: { d: DistrictId; k: number; v: number; c: number; empty: boolean } | null = null;
        for (const d of open) {
          dist[d].decor.forEach((vs, k) => {
            const v = nextVariant(d, k, 'light');
            if (v < 0) return;
            const c = decorPrice(d, v).amount;
            const empty = vs.length === 0;
            const o0 = opt as { c: number; empty: boolean } | null;
            if (!o0 || Number(empty) > Number(o0.empty) || (empty === o0.empty && c < o0.c)) opt = { d, k, v, c, empty };
          });
          if (opt) break;
        }
        const o = opt as { d: DistrictId; k: number; v: number; c: number } | null;
        if (o && spare >= o.c) {
          light -= o.c;
          buyDecor(o.d, o.k, o.v);
          continue;
        }
        break;
      }
    }
    // Монеты: улучшение уже восстановленной постройки или способность (копит на то, что дешевле).
    let target: { price: number; buy: () => void } | null = null;
    for (const d of open) {
      dist[d].level.forEach((lv, i) => {
        if (lv !== 1) return;
        const c = buildingCost(d, i, 2).coins;
        if (!target || c < target.price) target = { price: c, buy: () => ((dist[d].level[i] = 2), addCozy(COZY.building[1]), goal('L2', `${d}:${DISTRICT_BUILDINGS[d][i]}`)) };
      });
    }
    if (abilities < ABILITY_ORDER.length) {
      const a = ABILITY_ORDER[abilities];
      const price = abilityPrice(a);
      const tg = target as { price: number } | null;
      if ((a.id !== 'rotate' || bon().rotateCharges > 0) && (!tg || price < tg.price)) target = { price, buy: () => (abilities++, goal('ability', `${a.id}→${a.level}`)) };
    }
    let budget = coins;
    const tgt = target as { price: number; buy: () => void } | null;
    if (tgt) {
      if (coins >= tgt.price) {
        coins -= tgt.price;
        tgt.buy();
        return;
      }
      // Копит на цель, но позволяет себе мелочь: в обычной игре — только если давно не было ничего нового
      // (не дороже пятой части цели: первое украшение в слот), в «добирании» — не дороже трети.
      if (!late && t - lastGoal < 1.2) return;
      budget = Math.min(coins, Math.max(DECOR_PRICES[0], Math.floor(tgt.price / (late ? 3 : 5))));
    }
    // Варианты покупки: tier 0 — расцвет, 1 — улицы и первое украшение в пустой слот, 2 — остальное.
    const options: { tier: number; price: number; light?: number; buy: () => void }[] = [];
    for (const d of late ? open : open.slice(0, 1)) {
      const k = dist[d].decor.findIndex((vs) => vs.length === 0);
      if (k >= 0) options.push({ tier: 1, price: decorPrice(d, 0).amount, buy: () => buyDecor(d, k, 0) });
      if (!late) continue;
      const i = dist[d].level.indexOf(2);
      if (i >= 0) {
        const c = buildingCost(d, i, 3);
        options.push({ tier: 0, price: c.coins, light: c.light, buy: () => ((dist[d].level[i] = 3), addCozy(COZY.building[2]), goal('L3', `${d}:${DISTRICT_BUILDINGS[d][i]}`)) });
      }
      const s2 = dist[d].streets.findIndex((x) => x < 3);
      if (s2 >= 0) options.push({ tier: 1, price: streetPrice(d, dist[d].streets[s2]), buy: () => (dist[d].streets[s2]++, addCozy(COZY.street), goal('street', `${d}:${s2 + 1}→${dist[d].streets[s2]}`)) });
      const kc = dist[d].decor.findIndex((vs, slot) => vs.length > 0 && nextVariant(d, slot, 'coins') >= 0);
      if (kc >= 0) {
        const v = nextVariant(d, kc, 'coins');
        options.push({ tier: 2, price: decorPrice(d, v).amount, buy: () => buyDecor(d, kc, v) });
      }
    }
    if (late) {
      const ci = nextItem('coins', true);
      if (ci) options.push({ tier: 2, price: ci.amount, buy: () => buyItem(ci) });
    }
    options.sort((a, b) => a.tier - b.tier || a.price - b.price);
    const o = options.find((x) => budget >= x.price && light >= (x.light ?? 0)) ?? null;
    // Не перескакивать через уровень приоритета: пока есть доступный по свету расцвет — копить на него.
    const top = options[0];
    if (o && (!late || !top || o.tier <= top.tier || light < (top.light ?? 0))) {
      coins -= o.price;
      light -= o.light ?? 0;
      o.buy();
    }
  };

  /** Прохождение уровня (первое или повтор); возвращает минуты. */
  const levelEnds: number[] = [];
  const play = (idx: number, l: ModelLevel, stars: number, ff: number) => {
    const m = levelMinutes(l, p);
    t += m;
    levelEnds.push(t);
    const b = best[idx];
    const mult = CHAPTERS[l.chapter - 1].coinMult;
    const b0 = bon();
    const millPct = b0.coinMultPct;
    if (!b) {
      const c = Math.round((10 + 5 * stars) * mult);
      coins += c + Math.round((c * millPct) / 100) + b0.coinsPerFirefly * ff;
      light += 2 * stars + ff + (stars === 3 ? b0.lightPer3Star : 0);
      best[idx] = { stars, ff, total: l.fireflies, ch: l.chapter };
      return { m, improved: true };
    }
    const ds = Math.max(0, stars - b.stars);
    const df = Math.max(0, ff - b.ff);
    if (ds || df) {
      const c = Math.round(5 * ds * mult);
      coins += c + Math.round((c * millPct) / 100) + b0.coinsPerFirefly * df;
      light += 2 * ds + df + (stars === 3 && b.stars < 3 ? b0.lightPer3Star : 0);
      best[idx] = { ...b, stars: Math.max(b.stars, stars), ff: Math.max(b.ff, ff) };
      return { m, improved: true };
    }
    return { m, improved: false };
  };

  /** Перепрохождения и задания: extra минут — сначала улучшения (до потолка профиля), потом повторы разных уровней. */
  const replayRound = (minutes: number) => {
    if (minutes <= 0) return;
    extraTotal += minutes;
    let left = minutes;
    // Задания жителей: 3 в день (выполняются заодно с перепрохождениями), неделя — каждый 7-й день.
    let quests = 0;
    const questTick = () => {
      while (quests < DAILY_QUESTS.length && minutes - left >= ((quests + 1) * minutes) / DAILY_QUESTS.length - 0.01) {
        const q = DAILY_QUESTS[quests++];
        if ('coins' in q) coins += Math.round(q.coins * coinMult());
        else light += q.light;
        light += bon().questLight;
        goal('quest', `quest ${quests}`);
      }
    };
    if (day % 7 === 0) {
      coins += Math.round(WEEKLY_QUEST.coins * coinMult() * (1 + bon().weeklyPct / 100)) + CHEST_AVG_COINS;
      if (!reward(firstFree(QUEST_LIST))) reward(firstFree(CHEST_LIST));
      if (WEEKLY_QUEST.street) freeStreet();
    }
    const played = new Set<number>();
    const maxS = Math.floor(p.maxStars + 0.5);
    const order = best.map((b, i) => ({ b, i })).filter((x) => x.b);
    order.sort((a, z) => (z.b ? 3 - z.b.stars + z.b.total - z.b.ff : 0) - (a.b ? 3 - a.b.stars + a.b.total - a.b.ff : 0));
    for (const { b, i } of order) {
      if (left <= 0) break;
      const l = all[b.ch - 1][i - (b.ch - 1) * 30];
      const canStars = b.stars < maxS;
      const canFf = b.ff < Math.round(b.total * Math.min(1, p.fireflies + 0.3));
      if (!canStars && !canFf) continue;
      const r = play(i, l, canStars ? b.stars + 1 : b.stars, canFf ? Math.min(b.total, b.ff + 1) : b.ff);
      left -= r.m;
      if (r.improved) goal('improve', `level ${l.num}`);
      played.add(i);
      questTick();
      spend(true);
    }
    for (const { b, i } of order) {
      if (left <= 0) break;
      if (played.has(i)) continue;
      const l = all[b.ch - 1][i - (b.ch - 1) * 30];
      left -= play(i, l, b.stars, b.ff).m;
      coins += Math.round(REPLAY_COINS[0] * CHAPTERS[b.ch - 1].coinMult);
      questTick();
      spend(true);
    }
    t += Math.max(0, left);
    questTick();
  };

  // Награда первого дня.
  coins += (DAILY[0] as { coins: number }).coins;
  calendar = 1;
  for (let c = 0; c < 3; c++) {
    chapterIdx = c;
    chapterStart = t;
    lastGoal = t;
    open.unshift(CHAPTERS[c].district);
    const levels = all[c];
    const stars = starsFor(levels, p.stars);
    let ffErr = 0;
    const startDay = day;
    levels.forEach((l, k) => {
      curLevel = l.num;
      const wantFf = l.fireflies * p.fireflies + ffErr;
      const ff = Math.min(l.fireflies, Math.max(0, Math.round(wantFf)));
      ffErr = wantFf - ff;
      const r = play(c * 30 + k, l, stars[k], ff);
      dayNew += r.m;
      // Испытание (10, 20, 30 главы): шаг улицы сразу и расцвет постройки на выбор.
      if ((k + 1) % 10 === 0) {
        if (!freeStreet()) coins += CHALLENGE_STREET_COINS;
        bloomsEarned++;
      }
      spend(false);
      if (dayNew >= NEW_LEVEL_MINUTES) {
        replayRound(extra);
        newDay();
      }
    });
    const d = dist[CHAPTERS[c].district];
    const ev = events.filter((e) => e.chapter === c + 1 && e.tChapter <= 60);
    const times = [...new Set(ev.map((e) => e.tChapter))];
    const gaps = times.map((x, i) => x - (i ? times[i - 1] : 0));
    const idle = times.map((x, i) => {
      const a = chapterStart + (i ? times[i - 1] : 0) + 0.05;
      const b = chapterStart + x - 0.05;
      return levelEnds.some((le) => le > a && le < b) ? gaps[i] : 0;
    });
    const allDecor = (['valley', 'forest', 'mountain'] as const).reduce((sum, dd) => sum + dist[dd].decor.reduce((x, y) => x + y.length, 0), 0);
    chapters.push({
      chapter: c + 1,
      doneAt: Math.round(t),
      days: day - startDay + 1,
      l1: d.level.filter((x) => x >= 1).length,
      l2: d.level.filter((x) => x >= 2).length,
      share: (d.level.filter((x) => x >= 1).length + d.level.filter((x) => x >= 2).length) / 20,
      l3: d.level.filter((x) => x >= 3).length,
      decorSlots: d.decor.filter((x) => x.length > 0).length,
      decorBought: allDecor,
      decorTotal: (c + 1) * Array.from({ length: DECOR_SLOTS }, (_, i) => decorVariants(i)).reduce((sum, x) => sum + x, 0),
      streets: d.streets.reduce((sum, x) => sum + x, 0),
      streetsTotal: STREETS_PER_DISTRICT * 3,
      wardrobeBought: boughtLumo,
      wardrobeRewards: rewardsLumo,
      fieldBought: boughtField,
      fieldRewards: rewardsField,
      bloomsEarned,
      bloomsUsed,
      abilities,
      maxGapFirstHour: Math.round(Math.max(0, ...idle) * 10) / 10,
      maxGapRaw: Math.round(Math.max(0, ...gaps) * 10) / 10,
      goalsFirstHour: times.length,
      coinsLeft: coins,
      lightLeft: light,
      l1At: DISTRICT_BUILDINGS[CHAPTERS[c].district].map((id) => events.find((e) => e.kind === 'L1' && e.what.endsWith(`:${id}`))?.tChapter ?? -1),
      l2At: DISTRICT_BUILDINGS[CHAPTERS[c].district].map((id) => events.find((e) => e.kind === 'L2' && e.what.endsWith(`:${id}`))?.tChapter ?? -1),
    });
  }
  // Хвост: после главы 3 — только перепрохождения и задания, пока не куплено всё (или не вышел лимит дней).
  const shopLeft = () => SHOP_ITEMS.some((w) => !owned.has(w.id));
  const everything = () => open.every((d) => dist[d].level.every((x) => x === 3) && dist[d].streets.every((x) => x === 3) && dist[d].decor.every((x, i) => x.length === decorVariants(i))) && !shopLeft() && abilities === ABILITY_ORDER.length;
  let tailDays: number | null = null;
  const ms: SimResult['milestones'] = { buildings: null, streets: null, decorOne: null, decor: null, wardrobe: null, abilities: null };
  const mark = (k: number) => {
    if (ms.buildings === null && open.every((d) => dist[d].level.every((x) => x === 3))) ms.buildings = k;
    if (ms.streets === null && open.every((d) => dist[d].streets.every((x) => x === 3))) ms.streets = k;
    if (ms.decorOne === null && open.every((d) => dist[d].decor.every((x) => x.length > 0))) ms.decorOne = k;
    if (ms.decor === null && open.every((d) => dist[d].decor.every((x, i) => x.length === decorVariants(i)))) ms.decor = k;
    if (ms.wardrobe === null && !shopLeft()) ms.wardrobe = k;
    if (ms.abilities === null && abilities === ABILITY_ORDER.length) ms.abilities = k;
  };
  mark(0);
  if (extra > 0) {
    const maxDays = opts.tailMaxDays ?? 400;
    for (let k = 1; k <= maxDays; k++) {
      newDay();
      replayRound(extra);
      for (let n = 0; n < 6; n++) spend(true);
      mark(k);
      if (everything()) {
        tailDays = k;
        break;
      }
    }
  }
  return { profile: p.id, extra, chapters, events, firstItemAt, tailDays, milestones: ms, extraMinutesTotal: Math.round(extraTotal), waits: waits.sort((a, b) => b.minutes - a.minutes) };
}

/** Итоговые суммы цен (для таблицы): постройки района по уровням, украшения (монеты / свет), улицы. */
export function priceTotals() {
  return CHAPTERS.map((c) => {
    const d = c.district;
    const lv = (n: 1 | 2 | 3) => DISTRICT_BUILDINGS[d].map((_, i) => buildingCost(d, i, n));
    const sum = (a: BuildingCost[], k: keyof BuildingCost) => a.reduce((s, x) => s + x[k], 0);
    let decorCoins = 0;
    let decorLight = 0;
    for (let i = 0; i < DECOR_SLOTS; i++) {
      for (let v = 0; v < decorVariants(i); v++) {
        const pr = decorPrice(d, v);
        if (pr.currency === 'light') decorLight += pr.amount;
        else decorCoins += pr.amount;
      }
    }
    const streets = STREETS_PER_DISTRICT * [0, 1, 2].reduce((s, k) => s + streetPrice(d, k), 0);
    return { chapter: c.id, district: d, l1Light: sum(lv(1), 'light'), l2Coins: sum(lv(2), 'coins'), l3Coins: sum(lv(3), 'coins'), l3Light: sum(lv(3), 'light'), decorCoins, decorLight, streets };
  });
}

export const abilitiesTotal = () => ABILITY_ORDER.reduce((s, a) => s + abilityPrice(a), 0);
/** Гардероб «за монеты»: сколько монет и сколько света стоит всё. */
export const wardrobeTotal = () => ({
  coins: SHOP_ITEMS.filter((w) => w.currency === 'coins').reduce((s, w) => s + w.amount, 0),
  light: SHOP_ITEMS.filter((w) => w.currency === 'light').reduce((s, w) => s + w.amount, 0),
});
