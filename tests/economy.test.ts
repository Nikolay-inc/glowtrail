import { beforeEach, describe, expect, it } from 'vitest';
import {
  applyReplay,
  applyWin,
  replayCoinsNext,
  buyHint,
  buyItem,
  chapelReady,
  freeHintsPerDay,
  openChest,
  villageBonuses,
  wellLight,
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
  itemCost,
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
import { WARDROBE } from '../src/core/wardrobe';
import { buildingCost, L1_LIGHT, priceTotals, PROFILES, simulate3, type ModelLevel } from '../src/core/economyModel';
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
    // Колодец: +1 свет за каждый уровень на 3 звезды (здесь — один такой уровень).
    expect(wellLight(e, best)).toBe(1);
    expect(lightBalance(e, best)).toBe(12 + 1 - VILLAGE[0].cost);
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

  it('награды: монеты, вещи гардероба, способность «Поворот плитки»; бонусы построек', () => {
    let e = defaultEconomy();
    for (const v of VILLAGE) {
      const res = restore(e, v.id, 999);
      if (typeof res === 'string') throw new Error(res);
      e = res.economy;
    }
    expect(nextVillageObject(e)).toBeNull();
    expect(e.upgrades.rotate).toBe(1);
    expect(e.wardrobe.owned).toContain('road-planks');
    expect(e.wardrobe.owned).toContain('outfit-star-robe');
    expect(coins(e)).toBe(VILLAGE.reduce((s, v) => s + ('coins' in v.reward ? v.reward.coins : 0), 0));
    expect(villageBonuses(e)).toMatchObject({ lightPer3Star: 1, extraFreeHints: 1, coinMultPct: 10, coinsPerFirefly: 5, dailyPlus3: 1, dailyChest: true, preview: 1 });
    expect(freeHintsPerDay(e)).toBe(4);
    // Мельница +10% и мост +5 за нового светлячка.
    const w = applyWin(e, 'valley-11', 3, 2);
    expect(w.coins).toBe(25);
    expect(w.bonus).toBe(3 + 10);
    expect(applyWin(w.economy, 'valley-11', 3, 2).bonus).toBe(0); // повтор — светлячки уже оплачены
    // Сундук раз в день, часовня раз в день.
    const c = openChest(e, '2026-03-01')!;
    expect(c.coins).toBeGreaterThanOrEqual(20);
    expect(openChest(c.economy, '2026-03-01')).toBeNull();
    expect(chapelReady(e, '2026-03-01')).toBe(true);
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

  it('гардероб: покупка, надеть, «особые» недоступны, деревенские не продаются', () => {
    let e = rich();
    // Обычная вещь — за свет: свет списывается в lightShop (баланс считается из прогресса).
    expect(itemCost(e, 'hat-brim').currency).toBe('light');
    expect(buyItem(e, 'hat-brim', 0)).toBe('notEnoughLight');
    e = buyItem(e, 'hat-brim', 999) as Economy;
    expect(e.lightShop).toBe(itemCost(defaultEconomy(), 'hat-brim').amount);
    expect(coins(e)).toBe(coins(rich()));
    expect(buyItem(e, 'hat-brim', 999)).toBe('owned');
    // Эпическая — за монеты.
    const epic = WARDROBE.find((w) => w.source === 'coins' && w.rarity === 'epic')!;
    expect(itemCost(e, epic.id)).toEqual({ currency: 'coins', amount: epic.price });
    expect(buyItem(e, 'hat-firefly-crown')).toBe('special');
    expect(buyItem(e, 'road-planks')).toBe('locked');
    e = equip(e, 'hat-brim');
    expect(e.wardrobe.look.hat).toBe('hat-brim');
    expect(equip(e, 'hat-witch').wardrobe.look.hat).toBe('hat-brim'); // не куплена
  });
});

describe('ежедневная награда и подсказки', () => {
  it('календарь на 7 дней: серия, пропуск — заново, на 7-й день наряд', () => {
    let e = defaultEconomy();
    const days = ['2026-03-01', '2026-03-02', '2026-03-03', '2026-03-04', '2026-03-05', '2026-03-06', '2026-03-07'];
    for (const [i, d] of days.entries()) {
      const r = claimDaily(e, d)!;
      expect(r.day).toBe(i + 1);
      e = r.economy;
      expect(claimDaily(e, d)).toBeNull(); // второй раз за день — нет
    }
    expect(e.wardrobe.owned).toContain('outfit-poncho');
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

  it('v4 → v6: монеты за пройденные уровни задним числом, открытые звёздами костюмы остаются вещами гардероба', () => {
    const v4 = { version: 4, profile: { playerId: 'p-12345678', avatar: 4 }, progress: { unlocked: ['valley-01'], stars: { 'valley-01': 3, 'valley-02': 3, 'valley-03': 2, 'valley-04': 3 } }, log: [] };
    const d = migrate(v4);
    expect(d.version).toBe(SAVE_VERSION);
    expect(coins(d.economy)).toBe(25 + 25 + 20 + 25);
    expect(d.economy.wardrobe.owned).toContain('outfit-poncho'); // костюм «Янтарный» (11 звёзд ≥ 10) → пончо
    expect(d.economy.wardrobe.look.outfit).toBe('outfit-poncho');
    expect(d.profile.avatar).toBe(0);
  });

  it('победа: монеты и свет начисляются, переигровка — только разница', () => {
    const first = recordWinRewards('valley-05', 2, 0, 'valley-06');
    expect(first).toEqual({ coins: 20, light: 4, bonusCoins: 0, bonusLight: 0 });
    const again = recordWinRewards('valley-05', 3, 0, 'valley-06');
    expect(again).toEqual({ coins: 5, light: 2, bonusCoins: 0, bonusLight: 0 });
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
    const a = { ...rich(300), buildings: { well: 2 }, wardrobe: { ...defaultEconomy().wardrobe, owned: [...defaultEconomy().wardrobe.owned, 'hat-brim'] } };
    const b = { ...rich(500), coinsSpent: 100, upgrades: { stash: 1, rotate: 0, lantern: 2 }, buildings: { well: 1, bakery: 1 } };
    const m = mergeEconomy(a, b);
    expect(m.coinsEarned).toBe(500);
    expect(m.coinsSpent).toBe(100);
    expect(m.buildings).toEqual({ well: 2, bakery: 1 });
    expect(m.upgrades).toEqual({ stash: 1, rotate: 0, lantern: 2 });
    expect(m.wardrobe.owned).toContain('hat-brim');
    // Через облачный формат.
    const local = SaveService.load();
    const cloud = { ...local, economy: b };
    expect(mergeSaves(local, toCloudPayload(cloud)).economy.buildings).toEqual({ well: 1, bakery: 1 });
    // Старый формат (v6): список восстановленных → уровень 1.
    expect(normalizeEconomy({ coinsEarned: -5, village: ['nope', 'well'] })).toMatchObject({ coinsEarned: 0, buildings: { well: 1 } });
  });

  it('старое облако без экономики: монеты за его звёзды', () => {
    const local = SaveService.load();
    const cloud = { version: 4, profile: local.profile, progress: { ...local.progress, stars: { 'valley-01': 3 } } };
    expect(coins(mergeSaves(local, cloud).economy)).toBe(25);
    expect(economyFromProgress({}, 0).wardrobe.look.outfit).toBe('outfit-cloak');
  });
});

describe('экономика на три главы (npm run sim-economy)', () => {
  const ch1: ModelLevel[] = LEVELS.slice(0, 30).map((l) => ({ num: l.num, chapter: 1, rating: l.metrics?.rating ?? 3, fireflies: l.fireflies.length, infinite: l.tileSet !== null }));
  const avg = PROFILES.find((p) => p.id === 'average')!;
  const base = simulate3(ch1, avg, 0);
  const extra = simulate3(ch1, avg, 15);

  it('средний без перепрохождений: к концу каждой главы 85–90% построек и их первых улучшений', () => {
    expect(base.chapters).toHaveLength(3);
    for (const c of base.chapters) {
      expect(c.share, `глава ${c.chapter}`).toBeGreaterThanOrEqual(0.85);
      expect(c.share, `глава ${c.chapter}`).toBeLessThanOrEqual(0.9);
    }
  });

  it('в первый час каждой главы новая цель не реже раза в 5 минут (слабый и средний)', () => {
    const weak = PROFILES.find((p) => p.id === 'weak')!;
    for (const r of [base, extra, simulate3(ch1, weak, 0), simulate3(ch1, weak, 15)]) for (const c of r.chapters) expect(c.maxGapFirstHour, `${r.profile} +${r.extra}, глава ${c.chapter}`).toBeLessThanOrEqual(5);
  });

  it('слабый без перепрохождений — не меньше 75% построек и улучшений в каждой главе', () => {
    const weak = simulate3(ch1, PROFILES.find((p) => p.id === 'weak')!, 0);
    for (const c of weak.chapters) expect(c.share, `глава ${c.chapter}`).toBeGreaterThanOrEqual(0.75);
  });

  it('гардероб покупается: 3–4 вещи к главе 1, 10–12 к главе 3, с перепрохождениями — вдвое; первая — в первые 20 минут', () => {
    const w = (c: (typeof base.chapters)[number]) => c.wardrobeBought + c.wardrobeRewards;
    expect(w(base.chapters[0])).toBeGreaterThanOrEqual(3);
    expect(w(base.chapters[0])).toBeLessThanOrEqual(4);
    expect(w(base.chapters[2])).toBeGreaterThanOrEqual(10);
    expect(w(base.chapters[2])).toBeLessThanOrEqual(12);
    expect(w(extra.chapters[2])).toBeGreaterThanOrEqual(w(base.chapters[2]) * 1.6);
    expect(base.firstItemAt).not.toBeNull();
    expect(base.firstItemAt!).toBeLessThanOrEqual(20);
  });

  it('стили поля (фонари, дороги, арки): 1–2 к главе 1, 5–6 к главе 3 — покупки и награды', () => {
    const f = (c: (typeof base.chapters)[number]) => c.fieldBought + c.fieldRewards;
    expect(f(base.chapters[0])).toBeGreaterThanOrEqual(1);
    expect(f(base.chapters[0])).toBeLessThanOrEqual(2);
    expect(f(base.chapters[2])).toBeGreaterThanOrEqual(5);
    expect(f(base.chapters[2])).toBeLessThanOrEqual(6);
  });

  it('испытания 10/20/30 каждой главы: расцвет в подарок — 3 за главу, выбирается, когда есть постройка на 2-м уровне', () => {
    for (const c of base.chapters) {
      expect(c.bloomsEarned).toBe(c.chapter * 3);
      expect(c.bloomsUsed).toBe(c.bloomsEarned);
    }
  });

  it('свет не копится: в конце главы ≤ 30 (с перепрохождениями ≤ 60)', () => {
    for (const c of base.chapters) expect(c.lightLeft, `глава ${c.chapter}`).toBeLessThanOrEqual(30);
    for (const c of extra.chapters) expect(c.lightLeft, `+15, глава ${c.chapter}`).toBeLessThanOrEqual(60);
  });

  it('короткий хвост: с 15 мин в день за ≤ 45 дней — все третьи уровни, все улицы, по украшению в каждом слоте', () => {
    for (const k of ['buildings', 'streets', 'decorOne'] as const) {
      expect(extra.milestones[k], k).not.toBeNull();
      expect(extra.milestones[k]!, k).toBeLessThanOrEqual(45);
    }
  });

  it('уровни не блокируются: все три профиля проходят все 90 уровней, перепрохождения добавляют покупок', () => {
    for (const p of PROFILES) expect(simulate3(ch1, p, 0).chapters).toHaveLength(3);
    const v = (c: (typeof base.chapters)[number]) => c.l1 + c.l2 + c.l3 + c.abilities + c.wardrobeBought + c.streets + c.decorBought;
    expect(v(extra.chapters[2])).toBeGreaterThan(v(base.chapters[2]));
    expect(extra.tailDays).not.toBeNull();
  });

  it('цены: постройки по 3 уровня, украшения в слотах 3–5 вариантов, улицы в 3 шага', () => {
    expect(buildingCost('valley', 0, 1)).toEqual({ light: VILLAGE[0].cost, coins: 0 });
    expect(buildingCost('forest', 9, 3).coins).toBeGreaterThan(buildingCost('forest', 9, 2).coins);
    expect(VILLAGE_TOTAL).toBe(L1_LIGHT.valley.reduce((a, b) => a + b, 0));
    expect(priceTotals()).toHaveLength(3);
  });

  it('повтор без улучшения: 6 → 3 → 1 → 0 монет за уровень в день, сброс назавтра', () => {
    let e = applyWin(defaultEconomy(), 'valley-03', 3).economy;
    const got: number[] = [];
    for (let i = 0; i < 5; i++) {
      const r = applyReplay(e, 'valley-03', '2026-03-01');
      got.push(r.coins);
      e = r.economy;
    }
    expect(got).toEqual([6, 3, 1, 0, 0]);
    expect(replayCoinsNext(e, 'valley-03', '2026-03-02')).toBe(6);
    expect(applyReplay(defaultEconomy(), 'valley-04', '2026-03-01').coins).toBe(0); // ещё не пройден
  });
});
