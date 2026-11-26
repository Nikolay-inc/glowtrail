// Задания жителей: 3 в день (лёгкое, среднее, трудное; награды — монеты, монеты, свет) и большое на неделю
// (монеты + сундук). Задания выбираются детерминированно по дню и только из того, что игрок уже видел:
// светлячки, прыжок, «отложить», ночь, поворотный мост, гаснущий фонарь — после первого уровня с ними;
// «улучши результат» — только если есть уровень, который можно улучшить. Прогресс копится от событий игры.

import { grant, type Economy } from './economy';
import type { Quest, QuestKind, QuestState } from './questState';
import { grantStreetStep } from './village';
import { DAILY_QUESTS, WEEKLY_QUEST, type DistrictId } from './villageData';
import { CHEST_ITEMS, grantItem, itemById, QUEST_ITEMS } from './wardrobe';

export type { Quest, QuestKind, QuestState } from './questState';

/** Механики, которые игрок уже встречал (на пройденных уровнях). */
export interface Seen {
  fireflies: boolean;
  jump: boolean;
  stash: boolean;
  night: boolean;
  turnbridge: boolean;
  fade: boolean;
}

export interface QuestContext {
  seen: Seen;
  /** Есть пройденный уровень меньше чем на 3 звезды или с несобранными светлячками. */
  improvable: boolean;
  /** Жители (id восстановленных построек), кто даёт задания; пусто — общий житель. */
  residents: string[];
  /** Множитель монет главы. */
  mult: number;
  /** Бонус светящегося озера к большому заданию, %. */
  weeklyPct: number;
}

type Need = keyof Seen | 'improve' | null;
type PoolItem = [QuestKind, number, Need];

const POOLS: Record<'easy' | 'mid' | 'hard' | 'weekly', PoolItem[]> = {
  easy: [
    ['win', 2, null],
    ['tiles', 40, null],
    ['stars', 4, null],
  ],
  mid: [
    ['win', 4, null],
    ['stars', 7, null],
    ['fireflies', 4, 'fireflies'],
    ['stash', 3, 'stash'],
    ['nohint', 2, null],
  ],
  hard: [
    ['three', 2, null],
    ['improve', 1, 'improve'],
    ['jump', 4, 'jump'],
    ['night', 1, 'night'],
    ['turnbridge', 2, 'turnbridge'],
    ['fade', 1, 'fade'],
  ],
  weekly: [
    ['win', 15, null],
    ['stars', 35, null],
    ['fireflies', 20, 'fireflies'],
    ['three', 8, null],
  ],
};
const TIERS = ['easy', 'mid', 'hard'] as const;

/** Задание доступно: механика уже встречалась, улучшать есть что. */
export function allowed(need: Need, ctx: QuestContext): boolean {
  if (need === null) return true;
  if (need === 'improve') return ctx.improvable;
  return ctx.seen[need];
}

/** Детерминированный генератор от строки (день, неделя). */
function rng(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  let s = (h >>> 0) % 2147483646 || 1;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

const round5 = (n: number) => Math.max(5, Math.round(n / 5) * 5);

function make(item: PoolItem, id: string, reward: Quest['reward'], resident: string, chest = false): Quest {
  return { id, kind: item[0], target: item[1], progress: 0, reward, chest: chest || undefined, resident, claimed: false };
}

function rewardOf(i: number, ctx: QuestContext): Quest['reward'] {
  const r = DAILY_QUESTS[i];
  return 'coins' in r ? { coins: round5(r.coins * ctx.mult) } : { light: r.light };
}

/** Три задания дня. */
export function dailyQuests(day: string, ctx: QuestContext): Quest[] {
  const rnd = rng(`d:${day}`);
  const people = ctx.residents.length ? ctx.residents : ['well'];
  const used = new Set<string>();
  return TIERS.map((tier, i) => {
    const pool = POOLS[tier].filter((p) => allowed(p[2], ctx));
    const item = pool[Math.floor(rnd() * pool.length)];
    let who = people[Math.floor(rnd() * people.length)];
    if (used.has(who) && people.length > used.size) who = people.find((p) => !used.has(p)) ?? who;
    used.add(who);
    return make(item, `${day}:${i}:${item[0]}`, rewardOf(i, ctx), who);
  });
}

/** Понедельник недели дня (YYYY-MM-DD). */
export function weekOf(day: string): string {
  const d = new Date(Date.UTC(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10)));
  const wd = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - wd);
  return d.toISOString().slice(0, 10);
}

export function weeklyQuest(week: string, ctx: QuestContext): Quest {
  const rnd = rng(`w:${week}`);
  const pool = POOLS.weekly.filter((p) => allowed(p[2], ctx));
  const item = pool[Math.floor(rnd() * pool.length)];
  const people = ctx.residents.length ? ctx.residents : ['well'];
  const coins = round5(WEEKLY_QUEST.coins * ctx.mult * (1 + ctx.weeklyPct / 100));
  return make(item, `${week}:w:${item[0]}`, { coins }, people[Math.floor(rnd() * people.length)], true);
}

/** Новый день / новая неделя — новые задания (незабранные старые пропадают). */
export function ensureQuests(e: Economy, today: string, ctx: QuestContext): Economy {
  let q: QuestState = e.quests;
  if (q.day !== today) q = { ...q, day: today, daily: dailyQuests(today, ctx), rerolls: 0 };
  const week = weekOf(today);
  if (q.week !== week) q = { ...q, week, weekly: weeklyQuest(week, ctx) };
  return q === e.quests ? e : { ...e, quests: q };
}

// ---------------------------------------------------------------------------
// События игры → прогресс

export type QuestEvent =
  | { type: 'win'; stars: number; fireflies: number; improved: boolean; hint: boolean; night: boolean; turnbridge: boolean; fade: boolean }
  | { type: 'tile'; jump: boolean }
  | { type: 'stash' };

function gain(kind: QuestKind, ev: QuestEvent): number {
  if (ev.type === 'tile') return kind === 'tiles' ? 1 : kind === 'jump' && ev.jump ? 1 : 0;
  if (ev.type === 'stash') return kind === 'stash' ? 1 : 0;
  switch (kind) {
    case 'win':
      return 1;
    case 'stars':
      return ev.stars;
    case 'three':
      return ev.stars >= 3 ? 1 : 0;
    case 'fireflies':
      return ev.fireflies;
    case 'improve':
      return ev.improved ? 1 : 0;
    case 'nohint':
      return ev.hint ? 0 : 1;
    case 'night':
      return ev.night ? 1 : 0;
    case 'turnbridge':
      return ev.turnbridge ? 1 : 0;
    case 'fade':
      return ev.fade ? 1 : 0;
    default:
      return 0;
  }
}

const isDone = (q: Quest) => q.progress >= q.target;

/** Применить событие; возвращает задания, которые только что выполнены. */
export function applyQuestEvent(e: Economy, ev: QuestEvent): { economy: Economy; completed: Quest[] } {
  const completed: Quest[] = [];
  const step = (q: Quest): Quest => {
    if (q.claimed || isDone(q)) return q;
    const g = gain(q.kind, ev);
    if (!g) return q;
    const n = { ...q, progress: Math.min(q.target, q.progress + g) };
    if (isDone(n)) completed.push(n);
    return n;
  };
  const daily = e.quests.daily.map(step);
  const weekly = e.quests.weekly ? step(e.quests.weekly) : null;
  if (!completed.length && daily.every((q, i) => q === e.quests.daily[i]) && weekly === e.quests.weekly) return { economy: e, completed };
  return { economy: { ...e, quests: { ...e.quests, daily, weekly } }, completed };
}

/** Сколько выполненных, но не забранных заданий (точка на кнопке). */
export const questsReady = (e: Economy) => [...e.quests.daily, ...(e.quests.weekly ? [e.quests.weekly] : [])].filter((q) => isDone(q) && !q.claimed).length;

/** Вещи «за задания» — по одной за каждое большое задание недели, пока есть. */
const questItems = () => QUEST_ITEMS.filter((id) => itemById(id));

export type ClaimResult = { economy: Economy; coins: number; light: number; item: string | null; street: string | null };

/** Забрать награду: монеты или свет (+ свет грибной фермы); у большого задания — сундук, вещь «за задания» и шаг улицы. */
export function claimQuest(e: Economy, id: string, questLight = 0, open: readonly DistrictId[] = ['valley']): ClaimResult | null {
  const all = [...e.quests.daily, ...(e.quests.weekly ? [e.quests.weekly] : [])];
  const q = all.find((x) => x.id === id);
  if (!q || q.claimed || !isDone(q)) return null;
  let out: Economy = { ...e, quests: { ...e.quests, daily: e.quests.daily.map((x) => (x.id === id ? { ...x, claimed: true } : x)), weekly: e.quests.weekly?.id === id ? { ...e.quests.weekly, claimed: true } : e.quests.weekly } };
  let coins = 'coins' in q.reward ? q.reward.coins : 0;
  let light = 'light' in q.reward ? q.reward.light : 0;
  if (!q.chest) light += questLight;
  let item: string | null = null;
  let street: string | null = null;
  if (q.chest) {
    // Большое задание недели: ещё и бесплатный шаг улицы.
    const st = grantStreetStep(out, open);
    out = st.economy;
    street = st.street;
    coins += 30;
    item = [...questItems(), ...CHEST_ITEMS].find((x) => !out.wardrobe.owned.includes(x)) ?? null;
    if (item) out = { ...out, wardrobe: grantItem(out.wardrobe, item) };
  }
  if (coins) out = grant(out, { coins });
  if (light) out = grant(out, { light });
  return { economy: out, coins, light, item, street };
}

/** Заменить задание (совиная почта): другое из того же уровня трудности. */
export function rerollQuest(e: Economy, id: string, ctx: QuestContext, allowedRerolls: number): Economy | null {
  if (e.quests.rerolls >= allowedRerolls) return null;
  const i = e.quests.daily.findIndex((x) => x.id === id);
  if (i < 0) return null;
  const q = e.quests.daily[i];
  if (q.claimed || isDone(q)) return null;
  const present = new Set(e.quests.daily.map((x) => x.kind));
  const pool = POOLS[TIERS[i]].filter((p) => allowed(p[2], ctx) && !present.has(p[0]));
  if (!pool.length) return null;
  const rnd = rng(`r:${e.quests.day}:${e.quests.rerolls}:${id}`);
  const item = pool[Math.floor(rnd() * pool.length)];
  const nq = make(item, `${e.quests.day}:${i}:${item[0]}:r${e.quests.rerolls + 1}`, q.reward, q.resident);
  const daily = e.quests.daily.map((x, k) => (k === i ? nq : x));
  return { ...e, quests: { ...e.quests, daily, rerolls: e.quests.rerolls + 1 } };
}
