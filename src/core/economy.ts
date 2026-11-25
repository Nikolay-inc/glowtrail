// Экономика и мета-игра: две валюты, деревня в долине, прокачка способностей, скины, ежедневная награда,
// подсказки. Чистая логика без Phaser и без хранилища — состояние передаётся явно, проверяется тестами
// и симуляцией (npm run sim-economy).
//
// Монеты копятся (заработано − потрачено). Свет не хранится отдельно: он считается из лучших результатов
// уровней (1 звезда = 2 света, 1 светлячок = 1 свет) минус цена восстановленных объектов деревни —
// поэтому переигровка добавляет только разницу, а слияние с облаком не может «удвоить» свет.

// ---------------------------------------------------------------------------
// Состояние

export type UpgradeId = 'stash' | 'rotate' | 'lantern';
export type SkinKind = 'costume' | 'lantern' | 'road' | 'arch';

export interface Economy {
  /** Монет заработано и потрачено за всё время (баланс = разница; при слиянии берём максимум каждого). */
  coinsEarned: number;
  coinsSpent: number;
  /** За сколько звёзд уровня уже выданы монеты (нет записи — уровень ещё ни разу не пройден). */
  paidStars: Record<string, number>;
  /** Восстановленные объекты деревни (id). */
  village: string[];
  /** Уровни прокачки (0 — базовый). rotate: 0 — способность ещё не открыта. */
  upgrades: Record<UpgradeId, number>;
  /** Подсказки: купленные/подаренные и бесплатные на сегодня. */
  hints: { bank: number; freeDay: string; freeUsed: number };
  skins: { owned: string[]; equipped: Record<SkinKind, string> };
  /** Ежедневная награда: последний день получения и номер дня в календаре (1–7). */
  daily: { lastDay: string; streak: number };
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
    village: [],
    upgrades: { stash: 0, rotate: 0, lantern: 0 },
    hints: { bank: START_HINTS, freeDay: '', freeUsed: 0 },
    skins: { owned: SKINS.filter((s) => s.price === 0 && !s.source && !s.special).map((s) => s.id), equipped: { costume: 'costume-0', lantern: 'lantern-default', road: 'road-glow', arch: 'arch-portal' } },
    daily: { lastDay: '', streak: 0 },
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

/** Весь заработанный свет (по лучшим результатам всех уровней). */
export function lightEarned(best: { stars: Record<string, number>; fireflies: Record<string, number> }): number {
  let sum = 0;
  for (const v of Object.values(best.stars)) sum += 2 * (v ?? 0);
  for (const v of Object.values(best.fireflies)) sum += v ?? 0;
  return sum;
}

export const lightSpent = (e: Economy) => e.village.reduce((s, id) => s + (villageById(id)?.cost ?? 0), 0);
export const lightBalance = (e: Economy, best: Parameters<typeof lightEarned>[0]) => lightEarned(best) - lightSpent(e);

/** Победа: начислить монеты. Возвращает новое состояние и сколько монет начислено. */
export function applyWin(e: Economy, levelId: string, stars: number): { economy: Economy; coins: number } {
  const paid = e.paidStars[levelId];
  const c = coinsForWin(paid, stars);
  return {
    economy: { ...e, coinsEarned: e.coinsEarned + c, paidStars: { ...e.paidStars, [levelId]: Math.max(paid ?? 0, stars) } },
    coins: c,
  };
}

// ---------------------------------------------------------------------------
// Деревня в долине

export type Reward = { coins: number } | { skin: string } | { ability: 'rotate' };

export interface VillageObject {
  id: string;
  name: string;
  /** Цена в свете. Порядок восстановления — по цене. */
  cost: number;
  reward: Reward;
}

/** Десять объектов деревни по возрастанию цены (сумма ≈ свет, который типичный игрок собирает за мир 1). */
export const VILLAGE: readonly VillageObject[] = [
  { id: 'well', name: 'Колодец', cost: 10, reward: { coins: 30 } },
  { id: 'bakery', name: 'Дом пекаря', cost: 12, reward: { coins: 40 } },
  { id: 'workshop', name: 'Мастерская', cost: 12, reward: { ability: 'rotate' } },
  { id: 'mill', name: 'Мельница', cost: 12, reward: { skin: 'road-planks' } },
  { id: 'bridge', name: 'Мост', cost: 16, reward: { coins: 60 } },
  { id: 'garden', name: 'Сад', cost: 20, reward: { skin: 'arch-flowers' } },
  { id: 'chapel', name: 'Часовня', cost: 20, reward: { coins: 80 } },
  { id: 'square', name: 'Фонарная площадь', cost: 20, reward: { skin: 'lantern-star' } },
  { id: 'lumo', name: 'Дом Lumo', cost: 22, reward: { skin: 'costume-6' } },
  { id: 'lighthouse', name: 'Маяк', cost: 24, reward: { coins: 150 } },
];

export const villageById = (id: string) => VILLAGE.find((v) => v.id === id);
export const VILLAGE_TOTAL = VILLAGE.reduce((s, v) => s + v.cost, 0);

/** Следующий объект для восстановления (по цене) или null — деревня восстановлена. */
export function nextVillageObject(e: Economy): VillageObject | null {
  return VILLAGE.find((v) => !e.village.includes(v.id)) ?? null;
}

export type RestoreError = 'restored' | 'notNext' | 'notEnoughLight';

/** Восстановить объект: только следующий по порядку и только если хватает света. Награда выдаётся сразу. */
export function restore(e: Economy, id: string, light: number): { economy: Economy; reward: Reward } | RestoreError {
  if (e.village.includes(id)) return 'restored';
  const next = nextVillageObject(e);
  if (!next || next.id !== id) return 'notNext';
  if (light < next.cost) return 'notEnoughLight';
  let out: Economy = { ...e, village: [...e.village, id] };
  out = grant(out, next.reward);
  return { economy: out, reward: next.reward };
}

/** Выдать награду (объект деревни, ежедневная награда). */
export function grant(e: Economy, r: Reward | { hints: number }): Economy {
  if ('coins' in r) return { ...e, coinsEarned: e.coinsEarned + r.coins };
  if ('hints' in r) return { ...e, hints: { ...e.hints, bank: e.hints.bank + r.hints } };
  if ('skin' in r) return e.skins.owned.includes(r.skin) ? e : { ...e, skins: { ...e.skins, owned: [...e.skins.owned, r.skin] } };
  // Способность «Поворот плитки»: первый уровень — 1 заряд за уровень.
  return { ...e, upgrades: { ...e.upgrades, rotate: Math.max(1, e.upgrades.rotate) } };
}

// ---------------------------------------------------------------------------
// Прокачка способностей (монеты)

export interface UpgradeDef {
  id: UpgradeId;
  name: string;
  /** Что даёт каждый уровень (индекс = уровень прокачки). */
  values: number[];
  /** Цена перехода на уровень i+1 (prices[i]); null — этот уровень не покупается (rotate 1 — из деревни). */
  prices: (number | null)[];
  unit: string;
}

export const UPGRADES: Record<UpgradeId, UpgradeDef> = {
  stash: { id: 'stash', name: 'Отложить', values: [1, 2], prices: [300], unit: 'слот' },
  rotate: { id: 'rotate', name: 'Поворот плитки', values: [0, 1, 2, 3], prices: [null, 115, 420], unit: 'заряд' },
  lantern: { id: 'lantern', name: 'Фонарик', values: [2, 3, 4, 5], prices: [45, 160, 380], unit: 'плитки видно' },
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
// Скины

export interface Skin {
  id: string;
  kind: SkinKind;
  name: string;
  /** Цена в монетах (0 — есть сразу). */
  price: number;
  /** «Особый» — пока недоступен (под покупки в Р4). */
  special?: boolean;
  /** Получается не за монеты: из деревни или в ежедневной награде. */
  source?: 'village' | 'daily';
  /** Для костюма — номер аватарки Lumo (0–7). */
  avatar?: number;
}

export const SKINS: readonly Skin[] = [
  // Костюмы Lumo (бывшие аватарки 0–7) — меняют Lumo на поле.
  { id: 'costume-0', kind: 'costume', name: 'Синий', price: 0, avatar: 0 },
  { id: 'costume-1', kind: 'costume', name: 'Лесной', price: 0, avatar: 1 },
  { id: 'costume-2', kind: 'costume', name: 'Вишнёвый', price: 80, avatar: 2 },
  { id: 'costume-3', kind: 'costume', name: 'Сливовый', price: 155, avatar: 3 },
  { id: 'costume-4', kind: 'costume', name: 'Янтарный', price: 150, source: 'daily', avatar: 4 },
  { id: 'costume-5', kind: 'costume', name: 'Морской', price: 350, avatar: 5 },
  { id: 'costume-6', kind: 'costume', name: 'Лунный', price: 0, source: 'village', avatar: 6 },
  { id: 'costume-7', kind: 'costume', name: 'Золотой', price: 0, special: true, avatar: 7 },
  // Формы фонаря Lumo.
  { id: 'lantern-default', kind: 'lantern', name: 'Как у костюма', price: 0 },
  { id: 'lantern-round', kind: 'lantern', name: 'Круглый', price: 60 },
  { id: 'lantern-diamond', kind: 'lantern', name: 'Ромб', price: 45 },
  { id: 'lantern-star', kind: 'lantern', name: 'Звезда', price: 0, source: 'village' },
  { id: 'lantern-crown', kind: 'lantern', name: 'Корона', price: 0, special: true },
  // Стиль дороги.
  { id: 'road-glow', kind: 'road', name: 'Светящаяся тропа', price: 0 },
  { id: 'road-moon', kind: 'road', name: 'Лунный свет', price: 70 },
  { id: 'road-stones', kind: 'road', name: 'Камешки', price: 70 },
  { id: 'road-firefly', kind: 'road', name: 'Светлячковая', price: 120 },
  { id: 'road-sunset', kind: 'road', name: 'Закатная тропа', price: 140 },
  { id: 'road-aurora', kind: 'road', name: 'Северное сияние', price: 400 },
  { id: 'road-planks', kind: 'road', name: 'Доски', price: 0, source: 'village' },
  { id: 'road-stars', kind: 'road', name: 'Звёздная пыль', price: 0, special: true },
  // Стиль арки.
  { id: 'arch-portal', kind: 'arch', name: 'Портал', price: 0 },
  { id: 'arch-moon', kind: 'arch', name: 'Лунная', price: 75 },
  { id: 'arch-sunset', kind: 'arch', name: 'Закатная', price: 140 },
  { id: 'arch-stone', kind: 'arch', name: 'Каменная', price: 180 },
  { id: 'arch-flowers', kind: 'arch', name: 'Цветочная', price: 0, source: 'village' },
  { id: 'arch-gold', kind: 'arch', name: 'Золотая', price: 0, special: true },
];

export const skinById = (id: string) => SKINS.find((s) => s.id === id);

/** Можно ли купить скин за монеты прямо сейчас (или почему нет). */
export function buySkin(e: Economy, id: string): Economy | BuyError {
  const s = skinById(id);
  if (!s) return 'locked';
  if (e.skins.owned.includes(id)) return 'owned';
  if (s.special) return 'special';
  if (s.source === 'village') return 'locked';
  if (coins(e) < s.price) return 'notEnoughCoins';
  return { ...e, coinsSpent: e.coinsSpent + s.price, skins: { ...e.skins, owned: [...e.skins.owned, id] } };
}

export function equip(e: Economy, id: string): Economy {
  const s = skinById(id);
  if (!s || !e.skins.owned.includes(id)) return e;
  return { ...e, skins: { ...e.skins, equipped: { ...e.skins.equipped, [s.kind]: id } } };
}

/** Номер аватарки надетого костюма (Lumo на поле и в профиле). */
export function costumeAvatar(e: Economy): number {
  return skinById(e.skins.equipped.costume)?.avatar ?? 0;
}

// ---------------------------------------------------------------------------
// Ежедневная награда: календарь на 7 дней

export type DailyReward = { coins: number } | { hints: number } | { skin: string; orCoins: number };

export const DAILY: readonly DailyReward[] = [
  { coins: 25 },
  { hints: 1 },
  { coins: 40 },
  { hints: 2 },
  { coins: 60 },
  { hints: 3 },
  { skin: 'costume-4', orCoins: 150 },
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
  if ('skin' in reward) out = out.skins.owned.includes(reward.skin) ? grant(out, { coins: reward.orCoins }) : grant(out, { skin: reward.skin });
  else out = grant(out, reward);
  return { economy: out, day, reward };
}

// ---------------------------------------------------------------------------
// Подсказки: 3 бесплатные в день + запас (покупка за монеты, награды, «за рекламу»)

export function freeHintsLeft(e: Economy, today: string): number {
  return e.hints.freeDay === today ? Math.max(0, FREE_HINTS_PER_DAY - e.hints.freeUsed) : FREE_HINTS_PER_DAY;
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

export function normalizeEconomy(raw: unknown): Economy {
  const e = defaultEconomy();
  if (!isObj(raw)) return e;
  e.coinsEarned = num(raw.coinsEarned);
  e.coinsSpent = Math.min(num(raw.coinsSpent), e.coinsEarned);
  if (isObj(raw.paidStars)) for (const [k, v] of Object.entries(raw.paidStars)) e.paidStars[k] = Math.min(3, num(v));
  if (Array.isArray(raw.village)) e.village = VILLAGE.filter((v) => (raw.village as unknown[]).includes(v.id)).map((v) => v.id);
  if (isObj(raw.upgrades)) {
    for (const id of Object.keys(UPGRADES) as UpgradeId[]) e.upgrades[id] = Math.min(UPGRADES[id].values.length - 1, num(raw.upgrades[id]));
  }
  if (isObj(raw.hints)) e.hints = { bank: num(raw.hints.bank, START_HINTS), freeDay: str(raw.hints.freeDay), freeUsed: num(raw.hints.freeUsed) };
  if (isObj(raw.skins)) {
    const owned = Array.isArray(raw.skins.owned) ? raw.skins.owned.filter((x): x is string => typeof x === 'string' && !!skinById(x)) : [];
    e.skins.owned = [...new Set([...e.skins.owned, ...owned])];
    if (isObj(raw.skins.equipped)) {
      for (const kind of ['costume', 'lantern', 'road', 'arch'] as SkinKind[]) {
        const id = str(raw.skins.equipped[kind]);
        if (e.skins.owned.includes(id) && skinById(id)?.kind === kind) e.skins.equipped[kind] = id;
      }
    }
  }
  if (isObj(raw.daily)) e.daily = { lastDay: str(raw.daily.lastDay), streak: Math.min(7, num(raw.daily.streak)) };
  return e;
}

/** Слияние двух устройств: счётчики — максимум, купленное и восстановленное — объединение. */
export function mergeEconomy(local: Economy, cloud: Economy | null): Economy {
  if (!cloud) return local;
  const village = VILLAGE.filter((v) => local.village.includes(v.id) || cloud.village.includes(v.id)).map((v) => v.id);
  const paidStars: Record<string, number> = { ...cloud.paidStars };
  for (const [k, v] of Object.entries(local.paidStars)) paidStars[k] = Math.max(paidStars[k] ?? 0, v);
  const upgrades = { ...local.upgrades };
  for (const id of Object.keys(upgrades) as UpgradeId[]) upgrades[id] = Math.max(local.upgrades[id], cloud.upgrades[id]);
  const laterHints = local.hints.freeDay >= cloud.hints.freeDay ? local.hints : cloud.hints;
  const laterDaily = local.daily.lastDay >= cloud.daily.lastDay ? local.daily : cloud.daily;
  const coinsEarned = Math.max(local.coinsEarned, cloud.coinsEarned);
  return {
    coinsEarned,
    coinsSpent: Math.min(coinsEarned, Math.max(local.coinsSpent, cloud.coinsSpent)),
    paidStars,
    village,
    upgrades,
    hints: { bank: Math.max(local.hints.bank, cloud.hints.bank), freeDay: laterHints.freeDay, freeUsed: laterHints.freeUsed },
    skins: { owned: [...new Set([...local.skins.owned, ...cloud.skins.owned])], equipped: { ...local.skins.equipped } },
    daily: laterDaily,
  };
}

/**
 * Экономика для сохранения старой версии (до валют): монеты за уже пройденные уровни выдаются задним числом,
 * костюмы, открытые звёздами, остаются у игрока.
 */
export function economyFromProgress(stars: Record<string, number>, avatar: number): Economy {
  let e = defaultEconomy();
  for (const [id, s] of Object.entries(stars)) if (s > 0) e = applyWin(e, id, s).economy;
  const total = Object.values(stars).reduce((a, b) => a + b, 0);
  // Раньше аватарки открывались звёздами (10/20/25/30) — уже открытые остаются.
  const legacy: [string, number][] = [['costume-2', 0], ['costume-3', 0], ['costume-4', 10], ['costume-5', 20], ['costume-6', 25]];
  for (const [id, need] of legacy) if (total >= need) e = grant(e, { skin: id });
  if (avatar >= 0 && avatar <= 7 && e.skins.owned.includes(`costume-${avatar}`)) e = equip(e, `costume-${avatar}`);
  return e;
}
