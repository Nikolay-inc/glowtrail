// Мета-игра поверх сохранения: начисление и трата валют, деревня, прокачка, скины, ежедневная награда, подсказки.
// Правила — в src/core/economy.ts (чистые функции); здесь — только запись в SaveService и лог событий.

import {
  applyWin,
  buyHint as buyHintCore,
  buySkin as buySkinCore,
  buyUpgrade as buyUpgradeCore,
  claimDaily as claimDailyCore,
  coins,
  costumeAvatar,
  dailyDay,
  equip,
  grant,
  hintsAvailable,
  lightBalance,
  lightEarned,
  nextVillageObject,
  restore,
  skinById,
  upgradePrice,
  upgradeValue,
  useHint as useHintCore,
  UPGRADES,
  type BuyError,
  type DailyReward,
  type Economy,
  type Reward,
  type UpgradeId,
} from './core/economy';
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
  return { coins: coins(d.economy), light: lightBalance(d.economy, d.progress) };
}

/** Способности на уровень (прокачка): слоты «отложить», заряды поворота, сколько плиток видно наперёд. */
export function abilities(): { stashSlots: number; rotations: number; preview: number } {
  const e = getEconomy();
  return { stashSlots: upgradeValue(e, 'stash'), rotations: upgradeValue(e, 'rotate'), preview: upgradeValue(e, 'lantern') };
}

/**
 * Победа с наградами: звёзды и светлячки в прогресс (лучший результат), монеты (первое прохождение — 10 + 5 за звезду,
 * переигровка — только за новые звёзды), свет — разница лучшего результата. Возвращает начисленное.
 */
export function recordWinRewards(level: string, stars: number, fireflies: number, nextId: string | null): { coins: number; light: number } {
  let gained = { coins: 0, light: 0 };
  SaveService.update((d) => {
    const p = d.progress;
    const before = lightEarned(p);
    p.stars[level] = Math.max(p.stars[level] ?? 0, stars);
    if (fireflies > 0) p.fireflies[level] = Math.max(p.fireflies[level] ?? 0, fireflies);
    for (const id of [level, nextId]) if (id && !p.unlocked.includes(id)) p.unlocked.push(id);
    p.lossStreak[level] = 0;
    const light = lightEarned(p) - before;
    const res = applyWin(d.economy, level, stars);
    d.economy = res.economy;
    gained = { coins: res.coins, light };
    if (res.coins > 0) push(d, { ev: 'currency_earn', currency: 'coins', amount: res.coins, source: 'level', level });
    if (light > 0) push(d, { ev: 'currency_earn', currency: 'light', amount: light, source: 'level', level });
  });
  return gained;
}

export type MetaResult<T> = { ok: true; value: T } | { ok: false; error: BuyError | 'notEnoughLight' | 'notNext' | 'restored' | 'none' };

/** Восстановить объект деревни за свет. */
export function restoreVillage(id: string): MetaResult<Reward> {
  const d = SaveService.load();
  const res = restore(d.economy, id, lightBalance(d.economy, d.progress));
  if (typeof res === 'string') return { ok: false, error: res };
  const cost = nextVillageObject(d.economy)!.cost;
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

export function buySkin(id: string): MetaResult<string> {
  const res = buySkinCore(getEconomy(), id);
  if (typeof res === 'string') return { ok: false, error: res };
  const price = skinById(id)!.price;
  SaveService.update((d) => {
    d.economy = equipAndSync(res, id, d);
    push(d, { ev: 'skin_buy', item: id, amount: price });
    push(d, { ev: 'currency_spend', currency: 'coins', amount: price, item: `skin:${id}` });
  });
  return { ok: true, value: id };
}

/** Надеть скин; костюм — это и аватарка профиля. */
export function equipSkin(id: string) {
  SaveService.update((d) => {
    d.economy = equipAndSync(d.economy, id, d);
  });
}

function equipAndSync(e: Economy, id: string, d: SaveData): Economy {
  const out = equip(e, id);
  d.profile.avatar = costumeAvatar(out);
  return out;
}

/** Сегодняшний день ежедневной награды (1–7) или null — уже получена. */
export function dailyAvailable(): number | null {
  return dailyDay(getEconomy(), today());
}

export function claimDaily(): { day: number; reward: DailyReward; gotSkin: boolean } | null {
  const before = getEconomy();
  const res = claimDailyCore(before, today());
  if (!res) return null;
  const gotSkin = 'skin' in res.reward && !before.skins.owned.includes(res.reward.skin);
  SaveService.update((d) => {
    d.economy = res.economy;
    push(d, { ev: 'daily_reward', amount: res.day, item: JSON.stringify(res.reward) });
    if ('coins' in res.reward) rewardLog(d, res.reward, 'daily');
    else if ('skin' in res.reward && !gotSkin) rewardLog(d, { coins: res.reward.orCoins }, 'daily');
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
