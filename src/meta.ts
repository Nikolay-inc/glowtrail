// Мета-игра поверх сохранения: начисление и трата валют, деревня (районы, уровни построек, улицы, украшения, уют),
// задания жителей, прокачка, гардероб, ежедневная награда, подсказки.
// Правила — в src/core/economy.ts, village.ts, quests.ts (чистые функции); здесь — только запись в SaveService и лог.

import {
  applyReplay,
  applyWin,
  buyHint as buyHintCore,
  buyItem as buyItemCore,
  buyUpgrade as buyUpgradeCore,
  claimDaily as claimDailyCore,
  coins,
  chapelReady,
  chestReady,
  openChest,
  useChapel,
  wellLight,
  dailyDay,
  equip,
  grant,
  itemCost,
  nextLevelCost,
  upgradeBuilding,
  villageById,
  hintsAvailable,
  lightBalance,
  lightEarned,
  restore,
  upgradePrice,
  upgradeValue,
  villageBonuses,
  useHint as useHintCore,
  UPGRADES,
  type BuyError,
  type Cost,
  type DailyReward,
  type Economy,
  type Reward,
  type UpgradeId,
} from './core/economy';
import { applyQuestEvent, claimQuest as claimQuestCore, ensureQuests, questsReady, rerollQuest, type QuestContext, type QuestEvent, type Seen } from './core/quests';
import { bloomCandidates, bloomsPending, chapterMult, claimCozy as claimCozyCore, clearDecor, cozyLevel, earnChallenge, freeBloom, placeDecor as placeDecorCore, upgradeStreet, type CozyGrant } from './core/village';
import { BUILDINGS, type DistrictId } from './core/villageData';
import { avatarIndex, loadLook, saveLook, wearSet, type WardrobeState } from './core/wardrobe';
import { isChallenge, LEVELS } from './levels/index';
import { localDay } from './profile';
import { SaveService, type LogEvent, type SaveData } from './save/SaveService';

const now = () => new Date().toISOString();
export const today = () => localDay(new Date());

function push(d: SaveData, e: Omit<LogEvent, 't'>) {
  d.log.push({ t: now(), ...e });
}

export function getEconomy(): Economy {
  return SaveService.load().economy;
}

/** Баланс: монеты и свет. */
export function wallet(): { coins: number; light: number } {
  const d = SaveService.load();
  // Свет не бывает меньше нуля (на случай несогласованных данных после слияния устройств).
  return { coins: coins(d.economy), light: Math.max(0, lightBalance(d.economy, d.progress)) };
}

/** Способности на уровень (прокачка): слоты «отложить», заряды поворота, сколько плиток видно наперёд. */
export function abilities(): { stashSlots: number; rotations: number; preview: number } {
  const e = getEconomy();
  const b = villageBonuses(e);
  // Мастерская ур. 2–3 — ещё заряды «Поворота плитки»; маяк — «Фонарик» +1/+2/+3 (не больше 8 плиток в ряду).
  const rotations = upgradeValue(e, 'rotate') + (upgradeValue(e, 'rotate') > 0 ? Math.max(0, b.rotateCharges - 1) : 0);
  return { stashSlots: upgradeValue(e, 'stash'), rotations, preview: Math.min(8, upgradeValue(e, 'lantern') + b.preview) };
}

/**
 * Победа с наградами: звёзды и светлячки в прогресс (лучший результат), монеты (первое прохождение — 10 + 5 за звезду,
 * переигровка — только за новые звёзды), свет — разница лучшего результата. Возвращает начисленное.
 */
export function recordWinRewards(level: string, stars: number, fireflies: number, nextId: string | null): { coins: number; light: number; bonusCoins: number; bonusLight: number } {
  let gained = { coins: 0, light: 0, bonusCoins: 0, bonusLight: 0 };
  SaveService.update((d) => {
    const p = d.progress;
    const before = lightEarned(p);
    const wellBefore = wellLight(d.economy, p);
    const wasPaid = d.economy.paidStars[level] !== undefined;
    p.stars[level] = Math.max(p.stars[level] ?? 0, stars);
    if (fireflies > 0) p.fireflies[level] = Math.max(p.fireflies[level] ?? 0, fireflies);
    for (const id of [level, nextId]) if (id && !p.unlocked.includes(id)) p.unlocked.push(id);
    p.lossStreak[level] = 0;
    const light = lightEarned(p) - before;
    const bonusLight = wellLight(d.economy, p) - wellBefore;
    const res = applyWin(d.economy, level, stars, p.fireflies[level] ?? 0);
    d.economy = res.economy;
    // Повтор без улучшения (ни звёзд, ни светлячков): небольшая убывающая награда 6 → 3 → 1 → 0 за день.
    let replay = 0;
    if (res.coins === 0 && res.bonus === 0 && light === 0 && bonusLight === 0 && wasPaid) {
      const r = applyReplay(d.economy, level, today());
      d.economy = r.economy;
      replay = r.coins;
    }
    gained = { coins: res.coins + replay, light, bonusCoins: res.bonus, bonusLight };
    if (replay > 0) push(d, { ev: 'currency_earn', currency: 'coins', amount: replay, source: 'replay', level });
    if (res.coins > 0) push(d, { ev: 'currency_earn', currency: 'coins', amount: res.coins, source: 'level', level });
    if (res.bonus > 0) push(d, { ev: 'currency_earn', currency: 'coins', amount: res.bonus, source: 'village_bonus', level });
    if (light > 0) push(d, { ev: 'currency_earn', currency: 'light', amount: light, source: 'level', level });
    if (bonusLight > 0) push(d, { ev: 'currency_earn', currency: 'light', amount: bonusLight, source: 'village_bonus', level });
  });
  return gained;
}

export type MetaResult<T> = { ok: true; value: T } | { ok: false; error: BuyError | 'notEnoughLight' | 'notNext' | 'restored' | 'none' | 'notRestored' | 'bad' };

/** Восстановить постройку за свет (следующую по порядку в своём районе). */
export function restoreVillage(id: string): MetaResult<Reward> {
  const d = SaveService.load();
  const res = restore(d.economy, id, lightBalance(d.economy, d.progress));
  if (typeof res === 'string') return { ok: false, error: res };
  const cost = villageById(id)!.cost;
  SaveService.update((x) => {
    x.economy = res.economy;
    push(x, { ev: 'village_restore', item: id, amount: cost });
    push(x, { ev: 'currency_spend', currency: 'light', amount: cost, item: `village:${id}` });
    rewardLog(x, res.reward, `village:${id}`);
  });
  return { ok: true, value: res.reward };
}

function rewardLog(d: SaveData, r: Reward | DailyReward | { hints: number }, source: string) {
  if ('coins' in r) push(d, { ev: 'currency_earn', currency: 'coins', amount: r.coins, source });
}

export function buyUpgrade(id: UpgradeId): MetaResult<number> {
  const e = getEconomy();
  const price = upgradePrice(e, id);
  const res = buyUpgradeCore(e, id);
  if (typeof res === 'string') return { ok: false, error: res };
  SaveService.update((d) => {
    d.economy = res;
    push(d, { ev: 'upgrade_buy', item: `${id}:${res.upgrades[id]}`, amount: price ?? 0 });
    push(d, { ev: 'currency_spend', currency: 'coins', amount: price ?? 0, item: `upgrade:${id}` });
  });
  return { ok: true, value: res.upgrades[id] };
}

/** Хватает ли монет или света на цену. */
export function canAfford(c: Cost): boolean {
  const w = wallet();
  return c.currency === 'coins' ? w.coins >= c.amount : w.light >= c.amount;
}

/** Купить вещь гардероба: обычные и часть редких — за свет, остальные — за монеты. */
export function buyItem(id: string): MetaResult<string> {
  const cost = itemCost(getEconomy(), id);
  const res = buyItemCore(getEconomy(), id, wallet().light);
  if (typeof res === 'string') return { ok: false, error: res };
  SaveService.update((d) => {
    d.economy = syncAvatar({ ...res, wardrobe: res.wardrobe }, d);
    push(d, { ev: 'wardrobe_buy', item: id, amount: cost.amount, currency: cost.currency });
    push(d, { ev: 'currency_spend', currency: cost.currency, amount: cost.amount, item: `wardrobe:${id}` });
  });
  return { ok: true, value: id };
}

/** Надеть вещь (одежда — с цветом). Надетый образ — это и аватарка профиля. */
export function equipItem(id: string, color?: number) {
  SaveService.update((d) => {
    d.economy = syncAvatar(equip(d.economy, id, color), d);
  });
}

/** Надеть набор (вещи, которые есть). Возвращает, каких вещей не хватает. */
export function equipSet(setId: string): string[] {
  let missing: string[] = [];
  SaveService.update((d) => {
    const r = wearSet(d.economy.wardrobe, setId);
    missing = r.missing;
    d.economy = syncAvatar({ ...d.economy, wardrobe: r.wardrobe }, d);
  });
  return missing;
}

/** Сохранить надетый образ в ячейку (до 3). */
export function saveOutfit(slot: number) {
  SaveService.update((d) => {
    d.economy = { ...d.economy, wardrobe: saveLook(d.economy.wardrobe, slot) };
    push(d, { ev: 'outfit_save', amount: slot + 1 });
  });
}

export function loadOutfit(slot: number) {
  SaveService.update((d) => {
    d.economy = syncAvatar({ ...d.economy, wardrobe: loadLook(d.economy.wardrobe, slot) }, d);
  });
}

export const wardrobe = (): WardrobeState => getEconomy().wardrobe;

function syncAvatar(e: Economy, d: SaveData): Economy {
  d.profile.avatar = avatarIndex(e.wardrobe.look);
  return e;
}

/** Сундук фонарной площади: можно ли открыть сегодня. */
export const chestAvailable = () => chestReady(getEconomy(), today());

export function claimChest(): { coins: number; item: string | null } | null {
  const res = openChest(getEconomy(), today());
  if (!res) return null;
  SaveService.update((d) => {
    d.economy = res.economy;
    push(d, { ev: 'chest_open', amount: res.coins, item: res.item ?? undefined });
    push(d, { ev: 'currency_earn', currency: 'coins', amount: res.coins, source: 'chest' });
  });
  return { coins: res.coins, item: res.item };
}

/** Часовня: бесплатный второй «+3 плитки» сегодня ещё не использован. */
export const chapelAvailable = () => chapelReady(getEconomy(), today());
export function spendChapel() {
  SaveService.update((d) => {
    d.economy = useChapel(d.economy, today());
  });
}

/** Сегодняшний день ежедневной награды (1–7) или null — уже получена. */
export function dailyAvailable(): number | null {
  return dailyDay(getEconomy(), today());
}

export function claimDaily(): { day: number; reward: DailyReward; gotSkin: boolean } | null {
  const before = getEconomy();
  const res = claimDailyCore(before, today());
  if (!res) return null;
  const gotSkin = 'item' in res.reward && !before.wardrobe.owned.includes(res.reward.item);
  SaveService.update((d) => {
    d.economy = res.economy;
    push(d, { ev: 'daily_reward', amount: res.day, item: JSON.stringify(res.reward) });
    if ('coins' in res.reward) rewardLog(d, res.reward, 'daily');
    else if ('item' in res.reward && !gotSkin) rewardLog(d, { coins: res.reward.orCoins }, 'daily');
  });
  return { day: res.day, reward: res.reward, gotSkin };
}

export function hintsLeft(): number {
  return hintsAvailable(getEconomy(), today());
}

/** Потратить подсказку (бесплатные на сегодня, потом запас). false — подсказок нет. */
export function spendHint(): boolean {
  const res = useHintCore(getEconomy(), today());
  if (!res) return false;
  SaveService.update((d) => {
    d.economy = res;
  });
  return true;
}

export function buyHint(): MetaResult<number> {
  const res = buyHintCore(getEconomy());
  if (typeof res === 'string') return { ok: false, error: res };
  SaveService.update((d) => {
    d.economy = res;
    push(d, { ev: 'currency_spend', currency: 'coins', amount: 30, item: 'hint' });
  });
  return { ok: true, value: res.hints.bank };
}

/** «Бесплатно за рекламу» — заглушка до Р4: подсказка выдаётся сразу. */
export function adHint() {
  SaveService.update((d) => {
    d.economy = grant(d.economy, { hints: 1 });
    push(d, { ev: 'currency_earn', amount: 1, source: 'ad_stub', item: 'hint' });
  });
}

export { UPGRADES };

// ---------------------------------------------------------------------------
// «Не хватает»: где взять свет и монеты — уровни, которые можно улучшить

export interface Improve {
  levelIndex: number;
  id: string;
  /** Сколько света можно добрать (звёзды до 3 и несобранные светлячки). */
  light: number;
  /** Монет за новые звёзды. */
  coins: number;
  /** Ещё не пройден (следующий уровень). */
  fresh: boolean;
}

/** Можно ли улучшить пройденный уровень (меньше 3 звёзд или есть несобранные светлячки) — для значка на карте. */
export function canImprove(id: string): boolean {
  const d = SaveService.load();
  const lvl = LEVELS.find((l) => l.id === id);
  const stars = d.progress.stars[id] ?? 0;
  if (!lvl || stars <= 0) return false;
  return stars < 3 || (d.progress.fireflies[id] ?? 0) < lvl.fireflies.length;
}

/** До limit предложений: сначала то, где больше света; следующий непройденный уровень — тоже вариант. */
export function improveSuggestions(limit = 2): Improve[] {
  const d = SaveService.load();
  const out: Improve[] = [];
  LEVELS.forEach((lvl, i) => {
    const stars = d.progress.stars[lvl.id] ?? 0;
    if (stars > 0) {
      const ff = Math.max(0, lvl.fireflies.length - (d.progress.fireflies[lvl.id] ?? 0));
      const light = 2 * (3 - stars) + ff;
      if (light > 0) out.push({ levelIndex: i, id: lvl.id, light, coins: 5 * (3 - stars), fresh: false });
    }
  });
  out.sort((a, b) => b.light - a.light || a.levelIndex - b.levelIndex);
  const next = LEVELS.findIndex((l) => !(d.progress.stars[l.id] > 0) && !d.progress.skipped[l.id]);
  const res = out.slice(0, limit);
  if (next >= 0 && res.length < limit) res.push({ levelIndex: next, id: LEVELS[next].id, light: 6 + LEVELS[next].fireflies.length, coins: 25, fresh: true });
  return res;
}

export function logHintClick(kind: string, level?: string) {
  SaveService.update((d) => push(d, { ev: 'not_enough_hint_click', item: kind, level }));
}

// ---------------------------------------------------------------------------
// Деревня 2.0: районы, уровни построек, улицы, украшения, уют

/** Район открыт: долина — сразу, лесной квартал — с главой 2 (после уровня 30), горный город — скоро. */
export function districtOpen(d: DistrictId): boolean {
  if (d === 'valley') return true;
  if (d === 'mountain') return false;
  const p = SaveService.load().progress;
  const last = LEVELS[29]?.id;
  return !!last && ((p.stars[last] ?? 0) > 0 || !!p.skipped[last]);
}
export const openDistricts = (): DistrictId[] => (['valley', 'forest', 'mountain'] as const).filter(districtOpen);
/** Множитель монет наград (уют, задания) — по дальнему открытому району. */
export const rewardMult = () => chapterMult(openDistricts());

/** Улучшить постройку (ур. 2) или довести до расцвета (ур. 3). */
export function upgradeVillage(id: string): MetaResult<number> {
  const d = SaveService.load();
  const cost = nextLevelCost(d.economy, id);
  const res = upgradeBuilding(d.economy, id, lightBalance(d.economy, d.progress));
  if (typeof res === 'string') return { ok: false, error: res === 'notEnoughCoins' ? 'notEnoughCoins' : res === 'maxed' ? 'maxed' : res };
  SaveService.update((x) => {
    x.economy = res;
    push(x, { ev: 'building_upgrade', item: `${id}:${cost!.level}`, amount: cost!.coins });
    push(x, { ev: 'currency_spend', currency: 'coins', amount: cost!.coins, item: `building:${id}:${cost!.level}` });
    if (cost!.light) push(x, { ev: 'currency_spend', currency: 'light', amount: cost!.light, item: `building:${id}:${cost!.level}` });
  });
  return { ok: true, value: cost!.level };
}

export function buyStreet(d: DistrictId, i: number): MetaResult<number> {
  const before = getEconomy();
  const res = upgradeStreet(before, d, i);
  if (typeof res === 'string') return { ok: false, error: res };
  const price = res.coinsSpent - before.coinsSpent;
  const step = res.streets[`${d}:${i}`];
  SaveService.update((x) => {
    x.economy = res;
    push(x, { ev: 'street_upgrade', item: `${d}:${i}:${step}`, amount: price });
    push(x, { ev: 'currency_spend', currency: 'coins', amount: price, item: `street:${d}:${i}` });
  });
  return { ok: true, value: step };
}

/** Поставить украшение в слот (купить, если ещё не куплено); variant −1 — убрать. */
/** Поставить украшение в слот (купить за монеты или свет, если ещё не куплено); variant −1 — убрать. value — потрачено (0 — уже было). */
export function setDecor(d: DistrictId, slot: number, variant: number): MetaResult<number> {
  if (variant < 0) {
    SaveService.update((x) => {
      x.economy = clearDecor(x.economy, d, slot);
    });
    return { ok: true, value: 0 };
  }
  const res = placeDecorCore(getEconomy(), d, slot, variant, wallet().light);
  if (typeof res === 'string') return { ok: false, error: res === 'maxed' ? 'maxed' : res };
  const b = res.bought;
  SaveService.update((x) => {
    x.economy = res.economy;
    push(x, { ev: 'decor_place', item: `${d}:${slot}:${variant}`, amount: b?.amount ?? 0, currency: b?.currency });
    if (b) push(x, { ev: 'currency_spend', currency: b.currency, amount: b.amount, item: `decor:${d}:${slot}:${variant}` });
  });
  return { ok: true, value: b?.amount ?? 0 };
}

export const cozy = () => cozyLevel(getEconomy());

export function claimCozy(): CozyGrant | null {
  const res = claimCozyCore(getEconomy(), rewardMult(), openDistricts().filter((d) => d !== 'mountain'));
  if (!res) return null;
  SaveService.update((x) => {
    x.economy = res.economy;
    push(x, { ev: 'cozy_level', amount: res.economy.cozyClaimed, item: JSON.stringify(res.got) });
    if (res.got.coins) push(x, { ev: 'currency_earn', currency: 'coins', amount: res.got.coins, source: 'cozy' });
    if (res.got.light) push(x, { ev: 'currency_earn', currency: 'light', amount: res.got.light, source: 'cozy' });
    if (res.got.street) push(x, { ev: 'street_upgrade', item: `${res.got.street}:free`, amount: 0, source: 'cozy' });
  });
  return res.got;
}

// ---------------------------------------------------------------------------
// Задания жителей

/** Какие механики игрок уже встречал (на пройденных уровнях) — задания только на них. */
export function seenMechanics(): Seen {
  const p = SaveService.load().progress;
  const won = LEVELS.filter((l) => (p.stars[l.id] ?? 0) > 0);
  const stashLevel = LEVELS.find((l) => l.tutorial === 'stash');
  return {
    fireflies: won.some((l) => l.fireflies.length > 0),
    jump: won.some((l) => l.deck.includes('jump') || (l.tileSet ?? []).includes('jump')),
    stash: !!stashLevel && won.some((l) => l.num >= stashLevel.num && l.allowStash),
    night: won.some((l) => l.night),
    turnbridge: won.some((l) => l.turnBridges.length > 0),
    fade: won.some((l) => l.fades.length > 0),
  };
}

export function questContext(): QuestContext {
  const d = SaveService.load();
  const e = d.economy;
  return {
    seen: seenMechanics(),
    improvable: LEVELS.some((l) => canImprove(l.id)),
    residents: BUILDINGS.filter((b) => (e.buildings[b.id] ?? 0) > 0).map((b) => b.id),
    mult: rewardMult(),
    weeklyPct: villageBonuses(e).weeklyPct,
  };
}

/** Задания на сегодня (новый день — новые задания). */
export function quests() {
  const e = getEconomy();
  const next = ensureQuests(e, today(), questContext());
  if (next !== e) SaveService.update((x) => (x.economy = ensureQuests(x.economy, today(), questContext())));
  return next.quests;
}

export const questsToClaim = () => questsReady(getEconomy());

/** Событие игры (победа, плитка, «отложить») → прогресс заданий. Возвращает только что выполненные. */
export function questEvent(ev: QuestEvent) {
  quests();
  const res = applyQuestEvent(getEconomy(), ev);
  if (res.economy !== getEconomy()) SaveService.update((x) => (x.economy = applyQuestEvent(x.economy, ev).economy));
  return res.completed;
}

export function claimQuest(id: string) {
  const res = claimQuestCore(getEconomy(), id, villageBonuses(getEconomy()).questLight, openDistricts().filter((d) => d !== 'mountain'));
  if (!res) return null;
  SaveService.update((x) => {
    x.economy = res.economy;
    push(x, { ev: 'quest_done', item: id, amount: res.coins || res.light });
    if (res.coins) push(x, { ev: 'currency_earn', currency: 'coins', amount: res.coins, source: 'quest' });
    if (res.street) push(x, { ev: 'street_upgrade', item: `${res.street}:free`, amount: 0, source: 'quest' });
    if (res.light) push(x, { ev: 'currency_earn', currency: 'light', amount: res.light, source: 'quest' });
  });
  return res;
}

/** Совиная почта: заменить задание (столько раз в день, сколько даёт её уровень). */
export function rerollQuestMeta(id: string): boolean {
  const e = getEconomy();
  const res = rerollQuest(e, id, questContext(), villageBonuses(e).questRerolls);
  if (!res) return false;
  SaveService.update((x) => (x.economy = res));
  return true;
}
export const rerollsLeft = () => {
  const e = getEconomy();
  return Math.max(0, villageBonuses(e).questRerolls - (e.quests.day === today() ? e.quests.rerolls : 0));
};

// ---------------------------------------------------------------------------
// Награды испытаний (уровни 10, 20, 30 главы): шаг улицы сразу, расцвет постройки — на выбор игрока

/** Районы, где действуют подарки (горный город ещё закрыт). */
const giftDistricts = () => openDistricts().filter((d) => d !== 'mountain');

export type ChallengeReward = { street: string | null; coins: number };

/** Победа на испытании: выдать награду (один раз за уровень). null — не испытание или награда уже была. */
export function challengeReward(levelId: string): ChallengeReward | null {
  const level = LEVELS.find((l) => l.id === levelId);
  if (!level || !isChallenge(level) || (SaveService.load().progress.stars[levelId] ?? 0) <= 0) return null;
  const res = earnChallenge(getEconomy(), levelId, giftDistricts());
  if (!res) return null;
  SaveService.update((x) => {
    x.economy = res.economy;
    push(x, { ev: 'challenge_reward', level: levelId });
    if (res.street) push(x, { ev: 'street_upgrade', item: `${res.street}:free`, amount: 0, source: 'challenge' });
    if (res.coins) push(x, { ev: 'currency_earn', currency: 'coins', amount: res.coins, source: 'challenge' });
  });
  return { street: res.street, coins: res.coins };
}

/** Испытания, пройденные раньше (до v8 или на другом устройстве), — выдать их награды. Возвращает, сколько выдано. */
export function syncChallenges(): number {
  const p = SaveService.load().progress;
  const earned = new Set(getEconomy().challenges.earned);
  let n = 0;
  for (const l of LEVELS) if (isChallenge(l) && (p.stars[l.id] ?? 0) > 0 && !earned.has(l.id) && challengeReward(l.id)) n++;
  return n;
}

/** Подарки-расцветы: сколько ждут и какие постройки можно выбрать (на 2-м уровне). */
export function bloomGift(): { pending: number; candidates: string[] } {
  const e = getEconomy();
  return { pending: bloomsPending(e).length, candidates: bloomCandidates(e, giftDistricts()) };
}

/** Бесплатный расцвет выбранной постройки. */
export function useBloomGift(id: string): boolean {
  const res = freeBloom(getEconomy(), id);
  if (typeof res === 'string') return false;
  SaveService.update((x) => {
    x.economy = res;
    push(x, { ev: 'building_upgrade', item: `${id}:3`, amount: 0, source: 'challenge' });
  });
  return true;
}
