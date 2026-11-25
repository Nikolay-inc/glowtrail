import { beforeEach, describe, expect, it } from 'vitest';
import {
  applyWin,
  buyHint,
  buySkin,
  buyUpgrade,
  claimDaily,
  coins,
  coinsForWin,
  dailyDay,
  defaultEconomy,
  economyFromProgress,
  equip,
  freeHintsLeft,
  grant,
  hintsAvailable,
  lightBalance,
  lightEarned,
  mergeEconomy,
  nextVillageObject,
  normalizeEconomy,
  restore,
  upgradeValue,
  useHint,
  VILLAGE,
  VILLAGE_TOTAL,
  type Economy,
} from '../src/core/economy';
import { simulate, type SimLevel } from '../src/core/economySim';
import { LEVELS } from '../src/levels/index';
import { memoryBackend, migrate, SaveService, SAVE_VERSION } from '../src/save/SaveService';
import { mergeSaves, toCloudPayload } from '../src/cloud/merge';
import { abilities, recordWinRewards, restoreVillage, wallet } from '../src/meta';

const rich = (n = 1000): Economy => grant(defaultEconomy(), { coins: n });

describe('валюты', () => {
  it('монеты: первое прохождение 10 + 5 за звезду, переигровка — только новые звёзды', () => {
    expect(coinsForWin(undefined, 3)).toBe(25);
    expect(coinsForWin(undefined, 1)).toBe(15);
    expect(coinsForWin(2, 3)).toBe(5);
    expect(coinsForWin(3, 3)).toBe(0);
    let e = applyWin(defaultEconomy(), 'valley-05', 2).economy;
    e = applyWin(e, 'valley-05', 1).economy; // хуже — ничего
    e = applyWin(e, 'valley-05', 3).economy;
    expect(coins(e)).toBe(20 + 5);
  });

  it('свет: 2 за звезду, 1 за светлячка, по лучшему результату; тратится на деревню', () => {
    const best = { stars: { a: 3, b: 2 }, fireflies: { b: 2 } };
    expect(lightEarned(best)).toBe(12);
    let e = defaultEconomy();
    const res = restore(e, VILLAGE[0].id, lightEarned(best));
    expect(typeof res).not.toBe('string');
    e = (res as { economy: Economy }).economy;
    expect(lightBalance(e, best)).toBe(12 - VILLAGE[0].cost);
  });
});

describe('деревня', () => {
  it('десять объектов, по возрастанию цены, восстанавливаются по порядку', () => {
    expect(VILLAGE).toHaveLength(10);
    for (let i = 1; i < VILLAGE.length; i++) expect(VILLAGE[i].cost).toBeGreaterThanOrEqual(VILLAGE[i - 1].cost);
    const e = defaultEconomy();
    expect(restore(e, VILLAGE[1].id, 999)).toBe('notNext');
    expect(restore(e, VILLAGE[0].id, VILLAGE[0].cost - 1)).toBe('notEnoughLight');
  });

  it('награды: монеты, скин, способность «Поворот плитки»', () => {
    let e = defaultEconomy();
    for (const v of VILLAGE) {
      const res = restore(e, v.id, 999);
      if (typeof res === 'string') throw new Error(res);
      e = res.economy;
    }
    expect(nextVillageObject(e)).toBeNull();
    expect(e.upgrades.rotate).toBe(1);
    expect(e.skins.owned).toContain('road-planks');
    expect(coins(e)).toBe(VILLAGE.reduce((s, v) => s + ('coins' in v.reward ? v.reward.coins : 0), 0));
  });
});

describe('прокачка и скины', () => {
  it('улучшения за монеты; поворот открывается только в деревне', () => {
    let e = rich();
    expect(buyUpgrade(e, 'rotate')).toBe('locked');
    e = buyUpgrade(e, 'stash') as Economy;
    expect(upgradeValue(e, 'stash')).toBe(2);
    expect(buyUpgrade(e, 'stash')).toBe('maxed');
    e = buyUpgrade(e, 'lantern') as Economy;
    e = buyUpgrade(e, 'lantern') as Economy;
    e = buyUpgrade(e, 'lantern') as Economy;
    expect(upgradeValue(e, 'lantern')).toBe(5);
    e = grant(e, { ability: 'rotate' });
    e = buyUpgrade(e, 'rotate') as Economy;
    expect(upgradeValue(e, 'rotate')).toBe(2);
    expect(buyUpgrade(defaultEconomy(), 'lantern')).toBe('notEnoughCoins');
  });

  it('скины: покупка, надеть, «особые» недоступны, деревенские не продаются', () => {
    let e = rich();
    e = buySkin(e, 'costume-2') as Economy;
    expect(buySkin(e, 'costume-2')).toBe('owned');
    expect(buySkin(e, 'costume-7')).toBe('special');
    expect(buySkin(e, 'road-planks')).toBe('locked');
    e = equip(e, 'costume-2');
    expect(e.skins.equipped.costume).toBe('costume-2');
    expect(equip(e, 'costume-5').skins.equipped.costume).toBe('costume-2'); // не куплен
  });
});

describe('ежедневная награда и подсказки', () => {
  it('календарь на 7 дней: серия, пропуск — заново, на 7-й день скин', () => {
    let e = defaultEconomy();
    const days = ['2026-03-01', '2026-03-02', '2026-03-03', '2026-03-04', '2026-03-05', '2026-03-06', '2026-03-07'];
    for (const [i, d] of days.entries()) {
      const r = claimDaily(e, d)!;
      expect(r.day).toBe(i + 1);
      e = r.economy;
      expect(claimDaily(e, d)).toBeNull(); // второй раз за день — нет
    }
    expect(e.skins.owned).toContain('costume-4');
    expect(dailyDay(e, '2026-03-08')).toBe(1); // после 7-го — снова 1
    expect(dailyDay(e, '2026-03-10')).toBe(1); // пропуск
  });

  it('3 бесплатные подсказки в день, потом запас, покупка за монеты', () => {
    let e: Economy = { ...defaultEconomy(), hints: { bank: 1, freeDay: '', freeUsed: 0 } };
    const day = '2026-03-01';
    expect(hintsAvailable(e, day)).toBe(4);
    for (let i = 0; i < 4; i++) e = useHint(e, day)!;
    expect(useHint(e, day)).toBeNull();
    expect(freeHintsLeft(e, '2026-03-02')).toBe(3);
    expect(buyHint(e)).toBe('notEnoughCoins');
    e = buyHint(grant(e, { coins: 30 })) as Economy;
    expect(e.hints.bank).toBe(1);
  });
});

describe('сохранение и облако', () => {
  beforeEach(() => SaveService.setBackend(memoryBackend()));

  it('v4 → v5: монеты за пройденные уровни задним числом, открытые звёздами костюмы остаются', () => {
    const v4 = { version: 4, profile: { playerId: 'p-12345678', avatar: 4 }, progress: { unlocked: ['valley-01'], stars: { 'valley-01': 3, 'valley-02': 3, 'valley-03': 2, 'valley-04': 3 } }, log: [] };
    const d = migrate(v4);
    expect(d.version).toBe(SAVE_VERSION);
    expect(coins(d.economy)).toBe(25 + 25 + 20 + 25);
    expect(d.economy.skins.owned).toContain('costume-4'); // 11 звёзд ≥ 10
    expect(d.economy.skins.equipped.costume).toBe('costume-4');
    expect(d.profile.avatar).toBe(4);
  });

  it('победа: монеты и свет начисляются, переигровка — только разница', () => {
    const first = recordWinRewards('valley-05', 2, 0, 'valley-06');
    expect(first).toEqual({ coins: 20, light: 4 });
    const again = recordWinRewards('valley-05', 3, 0, 'valley-06');
    expect(again).toEqual({ coins: 5, light: 2 });
    expect(wallet()).toEqual({ coins: 25, light: 6 });
    const r = restoreVillage(VILLAGE[0].id);
    expect(r.ok).toBe(VILLAGE[0].cost <= 6);
    const log = SaveService.load().log.map((e) => e.ev);
    expect(log).toContain('currency_earn');
  });

  it('способности на уровень берутся из прокачки', () => {
    expect(abilities()).toEqual({ stashSlots: 1, rotations: 0, preview: 2 });
  });

  it('слияние с облаком: счётчики — максимум, покупки и деревня — объединение', () => {
    const a = { ...rich(300), village: ['well'], skins: { ...defaultEconomy().skins, owned: [...defaultEconomy().skins.owned, 'costume-2'] } };
    const b = { ...rich(500), coinsSpent: 100, upgrades: { stash: 1, rotate: 0, lantern: 2 }, village: ['well', 'bakery'] };
    const m = mergeEconomy(a, b);
    expect(m.coinsEarned).toBe(500);
    expect(m.coinsSpent).toBe(100);
    expect(m.village).toEqual(['well', 'bakery']);
    expect(m.upgrades).toEqual({ stash: 1, rotate: 0, lantern: 2 });
    expect(m.skins.owned).toContain('costume-2');
    // Через облачный формат.
    const local = SaveService.load();
    const cloud = { ...local, economy: b };
    expect(mergeSaves(local, toCloudPayload(cloud)).economy.village).toEqual(['well', 'bakery']);
    expect(normalizeEconomy({ coinsEarned: -5, village: ['nope', 'well'] })).toMatchObject({ coinsEarned: 0, village: ['well'] });
  });

  it('старое облако без экономики: монеты за его звёзды', () => {
    const local = SaveService.load();
    const cloud = { version: 4, profile: local.profile, progress: { ...local.progress, stars: { 'valley-01': 3 } } };
    expect(coins(mergeSaves(local, cloud).economy)).toBe(25);
    expect(economyFromProgress({}, 0).skins.equipped.costume).toBe('costume-0');
  });
});

describe('симуляция экономики (типичный игрок)', () => {
  const levels: SimLevel[] = LEVELS.map((l) => ({ id: l.id, num: l.num, rating: l.metrics?.rating ?? 3, fireflies: l.fireflies.length, infinite: l.tileSet !== null }));
  const res = simulate(levels, 120);

  it('в первый час новая цель в среднем каждые 2–5 минут, без пустых отрезков дольше 7,5 минуты', () => {
    const avg = 60 / res.gapsFirstHour.length;
    expect(avg).toBeGreaterThanOrEqual(2);
    expect(avg).toBeLessThanOrEqual(5);
    expect(Math.max(...res.gapsFirstHour)).toBeLessThanOrEqual(7.5);
  });

  it('вся деревня восстанавливается примерно к концу мира 1', () => {
    expect(res.villageDoneAt).not.toBeNull();
    expect(res.villageDoneAt!).toBeGreaterThanOrEqual(25);
    expect(VILLAGE_TOTAL).toBeGreaterThan(100);
  });
});
