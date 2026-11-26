// «Деревня 2.0»: уровни построек, районы, бонусы по уровням, улицы, украшения, уют, задания жителей, награды испытаний,
// миграция v6 → v7 → v8.
import { describe, expect, it } from 'vitest';
import {
  applyWin,
  chapelLeft,
  coins,
  defaultEconomy,
  itemCost,
  lightBalance,
  lightSpent,
  mergeEconomy,
  nextInDistrict,
  nextLevelCost,
  normalizeEconomy,
  openChest,
  restore,
  upgradeBuilding,
  useChapel,
  villageBonuses,
  type Economy,
} from '../src/core/economy';
import { buildingCost as modelCost } from '../src/core/economyModel';
import { applyQuestEvent, claimQuest, dailyQuests, ensureQuests, rerollQuest, weekOf, weeklyQuest, type QuestContext } from '../src/core/quests';
import { bloomCandidates, bloomsPending, CHALLENGE_STREET_COINS, claimCozy, cozyLevel, cozyPoints, decorCost, earnChallenge, freeBloom, placeDecor, clearDecor, streetNextPrice, upgradeStreet } from '../src/core/village';
import { BUILDINGS, buildingCost, costOf, COZY_STEP, decorPrice, streetPrice } from '../src/core/villageData';
import { CHEST_ITEMS, COZY_ITEMS, FIELD_SLOTS, itemBaseCost, QUEST_ITEMS, WARDROBE } from '../src/core/wardrobe';
import { migrate } from '../src/save/SaveService';

const rich = (n = 5000): Economy => ({ ...defaultEconomy(), coinsEarned: n });
const best = { stars: {}, fireflies: {} };
const ctx = (over: Partial<QuestContext> = {}): QuestContext => ({
  seen: { fireflies: false, jump: false, stash: false, night: false, turnbridge: false, fade: false },
  improvable: false,
  residents: ['well', 'bakery'],
  mult: 1,
  weeklyPct: 0,
  ...over,
});

describe('постройки: три уровня', () => {
  it('восстановление по порядку в своём районе, улучшение за монеты, расцвет — монеты и свет', () => {
    let e = rich();
    expect(restore(e, 'herbalist', 999)).not.toBe('notNext'); // первая в лесу — можно
    const r = restore(e, 'well', 999);
    if (typeof r === 'string') throw new Error(r);
    e = r.economy;
    expect(nextInDistrict(e, 'valley')?.id).toBe('bakery');
    expect(nextLevelCost(e, 'well')).toEqual({ level: 2, coins: costOf('well', 2).coins, light: 0 });
    const up = upgradeBuilding(e, 'well', 999);
    if (typeof up === 'string') throw new Error(up);
    expect(up.buildings.well).toBe(2);
    expect(coins(up)).toBe(coins(e) - costOf('well', 2).coins);
    expect(upgradeBuilding(up, 'well', 0)).toBe('notEnoughLight');
    const bloom = upgradeBuilding(up, 'well', 999);
    if (typeof bloom === 'string') throw new Error(bloom);
    expect(bloom.buildings.well).toBe(3);
    expect(upgradeBuilding(bloom, 'well', 999)).toBe('maxed');
    expect(upgradeBuilding(rich(), 'mill', 999)).toBe('notRestored');
    expect(upgradeBuilding({ ...e, coinsEarned: 0 }, 'well', 999)).toBe('notEnoughCoins');
    // Свет потрачен на восстановление и расцвет.
    expect(lightSpent(bloom)).toBe(costOf('well', 1).light + costOf('well', 3).light);
  });

  it('игра и модель экономики считают цены по одной таблице', () => {
    for (const b of BUILDINGS) for (const l of [1, 2, 3] as const) expect(modelCost(b.district, b.index, l)).toEqual(buildingCost(b.district, b.index, l));
  });

  it('бонус растёт с уровнем и складывается между районами', () => {
    const e: Economy = { ...rich(), buildings: { mill: 1, teahouse: 1, bakery: 3, herbalist: 1, chapel: 2, square: 3, lumo: 2 } };
    const b = villageBonuses(e);
    expect(b.coinMultPct).toBe(10 + 5);
    expect(b.extraFreeHints).toBe(3 + 1);
    expect(b.dailyPlus3).toBe(2);
    expect(b.dailyChest).toBe(true);
    expect(villageBonuses({ ...rich(), buildings: { mill: 3 } }).coinMultPct).toBe(20);
    // Мельница ур. 2 — +15% к монетам за уровень.
    expect(applyWin({ ...rich(0), buildings: { mill: 2 } }, 'valley-05', 3).bonus).toBe(Math.round(25 * 0.15));
    // Часовня ур. 2 — два бесплатных «+3» в день.
    const t = '2026-11-26';
    expect(chapelLeft(e, t)).toBe(2);
    expect(chapelLeft(useChapel(useChapel(e, t), t), t)).toBe(0);
    expect(chapelLeft(useChapel(useChapel(e, t), t), '2026-11-27')).toBe(2);
    // Площадь ур. 3 — сундук вдвое щедрее.
    const c1 = openChest({ ...rich(0), buildings: { square: 1 } }, t)!.coins;
    const c3 = openChest({ ...rich(0), buildings: { square: 3 } }, t)!.coins;
    expect(c3).toBe(c1 * 2);
    // Дом Lumo ур. 2 — скидка 10% на гардероб.
    const coinItem = WARDROBE.find((w) => w.source === 'coins')!;
    expect(itemCost(e, coinItem.id).amount).toBeLessThan(itemCost(rich(), coinItem.id).amount);
  });
});

describe('улицы и украшения', () => {
  it('улица: три шага по цене главы, скидка лесопилки, дальше — мощёная', () => {
    let e = rich();
    for (let s = 0; s < 3; s++) {
      expect(streetNextPrice(e, 'valley', 2)).toBe(streetPrice('valley', s));
      const r = upgradeStreet(e, 'valley', 2);
      if (typeof r === 'string') throw new Error(r);
      e = r;
    }
    expect(e.streets['valley:2']).toBe(3);
    expect(upgradeStreet(e, 'valley', 2)).toBe('maxed');
    expect(upgradeStreet(rich(10), 'valley', 0)).toBe('notEnoughCoins');
    expect(streetNextPrice({ ...rich(), buildings: { sawmill: 3 } }, 'forest', 0)).toBeLessThan(streetPrice('forest', 0));
  });

  it('украшение покупается один раз, менять и убирать — бесплатно', () => {
    const e0 = rich(1000);
    const a = placeDecor(e0, 'valley', 3, 2);
    if (typeof a === 'string') throw new Error(a);
    expect(a.bought).toEqual(decorPrice('valley', 2));
    const b = placeDecor(a.economy, 'valley', 3, 0);
    if (typeof b === 'string') throw new Error(b);
    const back = placeDecor(b.economy, 'valley', 3, 2);
    if (typeof back === 'string') throw new Error(back);
    expect(back.bought).toBeNull();
    expect(back.economy.decor.placed['valley:3']).toBe(2);
    const cleared = clearDecor(back.economy, 'valley', 3);
    expect(cleared.decor.placed['valley:3']).toBeUndefined();
    expect(cleared.decor.owned).toContain('valley:3:2');
    expect(placeDecor(e0, 'valley', 3, 9)).toBe('bad');
    expect(placeDecor(rich(0), 'valley', 3, 2)).toBe('notEnoughCoins');
    // Вариант 2 — за свет.
    expect(decorPrice('valley', 1).currency).toBe('light');
    expect(placeDecor(rich(0), 'valley', 3, 1, 0)).toBe('notEnoughLight');
    const lit = placeDecor(rich(0), 'valley', 3, 1, 99);
    if (typeof lit === 'string') throw new Error(lit);
    expect(lit.economy.lightShop).toBe(decorPrice('valley', 1).amount);
    expect(decorCost({ ...rich(), buildings: { forester: 2 } }, 'valley', 4).amount).toBeLessThan(decorPrice('valley', 4).amount);
  });
});

describe('уют', () => {
  it('очки за уровни построек, украшения и улицы; награды по кругу, вещь — «за уют»', () => {
    const e: Economy = { ...rich(0), buildings: { well: 3, bakery: 1 }, decor: { owned: ['valley:0:0', 'valley:1:0'], placed: {} }, streets: { 'valley:0': 2 } };
    expect(cozyPoints(e)).toBe(20 + 5 + 2 + 8);
    const c = cozyLevel(e);
    expect(c.level).toBe(2);
    expect(c.pending).toBe(1);
    expect(c.into).toBe(35 - COZY_STEP);
    const first = claimCozy(e, 1)!;
    expect(first.got.coins).toBe(60);
    expect(claimCozy(first.economy, 1)).toBeNull();
    // Третья награда — вещь «за уют».
    const many: Economy = { ...e, cozyClaimed: 2, buildings: Object.fromEntries(BUILDINGS.slice(0, 20).map((b) => [b.id, 3])) };
    const item = claimCozy(many, 1)!;
    expect(WARDROBE.find((w) => w.id === item.got.item)?.source).toBe('cozy');
    expect(item.economy.wardrobe.owned).toContain(item.got.item);
    // Свет за уют идёт в баланс.
    const lightR = claimCozy({ ...many, cozyClaimed: 1 }, 1)!;
    expect(lightBalance(lightR.economy, best) - lightBalance({ ...many, cozyClaimed: 1 }, best)).toBe(6);
  });
});

describe('шаг улицы в награду', () => {
  it('уют (4-я награда) и задание недели улучшают самую простую улицу', () => {
    const e: Economy = { ...rich(0), cozyClaimed: 3, streets: { 'valley:0': 2 }, buildings: Object.fromEntries(BUILDINGS.slice(0, 10).map((b) => [b.id, 3])) };
    const r = claimCozy(e, 1, ['valley'])!;
    expect(r.got.street).toBe('valley:1');
    expect(r.economy.streets['valley:1']).toBe(1);
    let w = ensureQuests(rich(0), '2026-11-26', ctx());
    const wq = w.quests.weekly!;
    w = { ...w, quests: { ...w.quests, weekly: { ...wq, progress: wq.target } } };
    const got = claimQuest(w, wq.id, 0, ['valley'])!;
    expect(got.street).toBe('valley:0');
    expect(got.economy.streets['valley:0']).toBe(1);
  });
});

describe('задания жителей', () => {
  it('3 задания в день детерминированно, награды — монеты, монеты, свет', () => {
    const a = dailyQuests('2026-11-26', ctx());
    expect(a).toEqual(dailyQuests('2026-11-26', ctx()));
    expect(a.map((q) => Object.keys(q.reward)[0])).toEqual(['coins', 'coins', 'light']);
    expect(dailyQuests('2026-11-26', ctx({ mult: 1.25 }))[0].reward).toEqual({ coins: 30 });
  });

  it('никогда не даёт задание на механику, которую игрок ещё не видел', () => {
    const banned = new Set(['fireflies', 'jump', 'stash', 'night', 'turnbridge', 'fade', 'improve']);
    for (let i = 0; i < 200; i++) {
      const day = new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10);
      for (const q of [...dailyQuests(day, ctx()), weeklyQuest(weekOf(day), ctx())]) expect(banned.has(q.kind)).toBe(false);
    }
    // Увидел прыжок — задания на прыжок появляются, на мост — нет.
    const seen = ctx({ seen: { fireflies: true, jump: true, stash: true, night: false, turnbridge: false, fade: false }, improvable: true });
    const kinds = new Set<string>();
    for (let i = 0; i < 200; i++) for (const q of dailyQuests(new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10), seen)) kinds.add(q.kind);
    expect(kinds.has('jump')).toBe(true);
    expect(kinds.has('turnbridge')).toBe(false);
    expect(kinds.has('night')).toBe(false);
  });

  it('прогресс от событий, награда (+ свет грибной фермы), сундук недели, замена', () => {
    let e = ensureQuests(rich(0), '2026-11-26', ctx());
    expect(e.quests.daily).toHaveLength(3);
    expect(e.quests.weekly?.chest).toBe(true);
    const target = e.quests.daily[0].target;
    for (let i = 0; i < 60; i++) {
      e = applyQuestEvent(e, { type: 'win', stars: 3, fireflies: 0, improved: false, hint: false, night: false, turnbridge: false, fade: false }).economy;
      e = applyQuestEvent(e, { type: 'tile', jump: false }).economy;
    }
    const q = e.quests.daily[0];
    expect(q.progress).toBe(target);
    const before = coins(e);
    const got = claimQuest(e, q.id, 2)!;
    expect(coins(got.economy) - before).toBe((q.reward as { coins: number }).coins);
    expect(got.light).toBe(2);
    expect(claimQuest(got.economy, q.id)).toBeNull();
    // Новый день — новые задания.
    expect(ensureQuests(got.economy, '2026-11-27', ctx()).quests.day).toBe('2026-11-27');
    // Замена: только если есть совиная почта.
    const fresh = ensureQuests(rich(0), '2026-11-26', ctx());
    expect(rerollQuest(fresh, fresh.quests.daily[1].id, ctx(), 0)).toBeNull();
    const rr = rerollQuest(fresh, fresh.quests.daily[1].id, ctx(), 1);
    expect(rr?.quests.daily[1].kind).not.toBe(fresh.quests.daily[1].kind);
    expect(rerollQuest(rr!, rr!.quests.daily[1].id, ctx(), 1)).toBeNull();
  });
});

describe('сохранение v7', () => {
  it('v6: список восстановленных → уровни 1, chapelDay → счётчик часовни', () => {
    const v6 = { version: 6, profile: {}, progress: { unlocked: [], stars: {}, attempts: {}, lossStreak: {}, skipped: {}, fireflies: {} }, economy: { coinsEarned: 100, village: ['well', 'bakery'], chapelDay: '2026-11-25' }, log: [] };
    const d = migrate(v6);
    expect(d.version).toBe(8);
    expect(d.economy.buildings).toEqual({ well: 1, bakery: 1 });
    expect(d.economy.chapel).toEqual({ day: '2026-11-25', used: 1 });
    expect(d.economy.streets).toEqual({});
  });

  it('нормализация отбрасывает мусор; слияние: уровни и улицы — максимум, украшения — объединение', () => {
    const e = normalizeEconomy({ buildings: { well: 5, nope: 2 }, streets: { 'valley:1': 2, 'valley:9': 1, x: 1 }, decor: { owned: ['valley:0:0', 'valley:0:9', 'bad'], placed: { 'valley:0': 0, 'valley:2': 1 } }, lightBonus: -3 });
    expect(e.buildings).toEqual({ well: 3 });
    expect(e.streets).toEqual({ 'valley:1': 2 });
    expect(e.decor).toEqual({ owned: ['valley:0:0'], placed: { 'valley:0': 0 } });
    expect(e.lightBonus).toBe(0);
    const a: Economy = { ...rich(), buildings: { well: 3, mill: 1 }, streets: { 'valley:0': 1 }, decor: { owned: ['valley:0:0'], placed: { 'valley:0': 0 } }, lightBonus: 4 };
    const b: Economy = { ...rich(), buildings: { well: 1, mill: 2, herbalist: 1 }, streets: { 'valley:0': 3 }, decor: { owned: ['valley:1:1'], placed: { 'valley:1': 1 } }, lightBonus: 6 };
    const m = mergeEconomy(a, b);
    expect(m.buildings).toEqual({ well: 3, mill: 2, herbalist: 1 });
    expect(m.streets).toEqual({ 'valley:0': 3 });
    expect(m.decor.owned.sort()).toEqual(['valley:0:0', 'valley:1:1']);
    expect(m.lightBonus).toBe(6);
  });
});

describe('награда испытания (уровни 10, 20, 30)', () => {
  const lv2 = (over: Record<string, number> = {}): Economy => ({ ...rich(0), buildings: { well: 2, bakery: 1, ...over } });

  it('шаг улицы сразу и расцвет на выбор — один раз за уровень', () => {
    const r = earnChallenge(lv2(), 'valley-10', ['valley'])!;
    expect(r.street).toBe('valley:0');
    expect(r.economy.streets['valley:0']).toBe(1);
    expect(bloomsPending(r.economy)).toEqual(['valley-10']);
    expect(earnChallenge(r.economy, 'valley-10', ['valley'])).toBeNull();
    // Все улицы мощёные — монеты вместо шага.
    const paved = { ...lv2(), streets: { 'valley:0': 3, 'valley:1': 3, 'valley:2': 3, 'valley:3': 3 } };
    const c = earnChallenge(paved, 'valley-20', ['valley'])!;
    expect(c.street).toBeNull();
    expect(coins(c.economy)).toBe(CHALLENGE_STREET_COINS);
  });

  it('расцвет: только постройка на 2-м уровне, бесплатно (без монет и света); нет такой — подарок ждёт', () => {
    const e0 = earnChallenge(lv2(), 'valley-10', ['valley'])!.economy;
    expect(bloomCandidates(e0, ['valley'])).toEqual(['well']);
    expect(freeBloom(e0, 'bakery')).toBe('notLevel2');
    const light0 = lightSpent(e0);
    const e1 = freeBloom(e0, 'well') as Economy;
    expect(e1.buildings.well).toBe(3);
    expect(coins(e1)).toBe(coins(e0));
    expect(lightSpent(e1)).toBe(light0);
    expect(bloomsPending(e1)).toEqual([]);
    expect(freeBloom(e1, 'well')).toBe('none');
    // Нет постройки на 2-м уровне — подарок не теряется, ждёт улучшения.
    const wait = earnChallenge({ ...rich(0), buildings: { well: 1 } }, 'valley-10', ['valley'])!.economy;
    expect(bloomCandidates(wait, ['valley'])).toEqual([]);
    expect(bloomsPending(wait)).toEqual(['valley-10']);
    const later = { ...wait, buildings: { well: 2 } };
    expect((freeBloom(later, 'well') as Economy).buildings.well).toBe(3);
  });

  it('сохранение v8: старое — пусто; нормализация и слияние (объединение, выбранное — с этого устройства)', () => {
    const v7 = { version: 7, profile: {}, progress: { unlocked: [], stars: {}, attempts: {}, lossStreak: {}, skipped: {}, fireflies: {} }, economy: { coinsEarned: 10, buildings: { well: 2 } }, log: [] };
    const d = migrate(v7);
    expect(d.version).toBe(8);
    expect(d.economy.challenges).toEqual({ earned: [], bloomed: {} });
    const n = normalizeEconomy({ challenges: { earned: ['valley-10', 'valley-10', 5], bloomed: { 'valley-10': 'well', 'valley-20': 'mill', 'valley-30': 'nope' } } });
    expect(n.challenges).toEqual({ earned: ['valley-10'], bloomed: { 'valley-10': 'well' } });
    const a: Economy = { ...rich(), buildings: { well: 3 }, challenges: { earned: ['valley-10', 'valley-20'], bloomed: { 'valley-10': 'well' } } };
    const b: Economy = { ...rich(), buildings: { mill: 3 }, challenges: { earned: ['valley-10', 'valley-30'], bloomed: { 'valley-30': 'mill' } } };
    const m = mergeEconomy(a, b);
    expect(m.challenges.earned.sort()).toEqual(['valley-10', 'valley-20', 'valley-30']);
    expect(m.challenges.bloomed).toEqual({ 'valley-10': 'well', 'valley-30': 'mill' });
    expect(bloomsPending(m)).toEqual(['valley-20']);
  });
});

describe('стили поля в наградах', () => {
  it('каждый стиль поля «за задания», «за уют», «из сундука» и «из деревни» действительно выдаётся', () => {
    const village = new Set(BUILDINGS.flatMap((b) => ('item' in b.reward ? [b.reward.item] : [])));
    const lists: Record<string, readonly string[]> = { quest: QUEST_ITEMS, cozy: COZY_ITEMS, chest: CHEST_ITEMS };
    for (const w of WARDROBE.filter((x) => (FIELD_SLOTS as readonly string[]).includes(x.slot))) {
      if (w.source === 'village') expect(village.has(w.id), w.id).toBe(true);
      else if (lists[w.source]) expect(lists[w.source].includes(w.id), w.id).toBe(true);
    }
    for (const id of [...QUEST_ITEMS, ...COZY_ITEMS, ...CHEST_ITEMS]) expect(WARDROBE.some((w) => w.id === id), id).toBe(true);
    // Стили поля есть и в наградах, и за свет.
    expect(QUEST_ITEMS.some((id) => id.startsWith('lamp-') || id.startsWith('road-'))).toBe(true);
    expect(COZY_ITEMS.some((id) => id.startsWith('arch-'))).toBe(true);
    expect(WARDROBE.filter((x) => (FIELD_SLOTS as readonly string[]).includes(x.slot) && itemBaseCost(x.id).currency === 'light').length).toBeGreaterThanOrEqual(4);
  });
});
