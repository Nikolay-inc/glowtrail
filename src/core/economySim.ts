// Симуляция экономики для «типичного игрока» (npm run sim-economy и тесты): проходит уровни мира по порядку,
// тратит свет на деревню, монеты — на прокачку и скины, как только хватает. Детерминированно (зерно).
// Модель игрока: между уровнями — не больше одного объекта деревни и одной покупки; время на уровень растёт с рейтингом, иногда проигрывает и переигрывает, звёзды и светлячки —
// по вероятностям от рейтинга. После мира 1 переигрывает уровни с худшими звёздами.

import {
  applyWin,
  buySkin,
  buyUpgrade,
  claimDaily,
  coins,
  defaultEconomy,
  lightBalance,
  nextVillageObject,
  restore,
  skinById,
  upgradePrice,
  type Economy,
  type UpgradeId,
} from './economy';

export interface SimLevel {
  id: string;
  num: number;
  rating: number;
  fireflies: number;
  /** Уровень без лимита плиток (обучение): звёзды по отменам, почти всегда 3. */
  infinite: boolean;
}

export interface SimEvent {
  /** Минута игры. */
  t: number;
  level: number;
  kind: 'village' | 'upgrade' | 'skin' | 'daily' | 'level';
  what: string;
  coins: number;
  light: number;
}

export interface SimResult {
  events: SimEvent[];
  /** На каком уровне (номер) восстановлена вся деревня; null — не успели. */
  villageDoneAt: number | null;
  /** Минута, когда пройден последний уровень мира. */
  worldDoneAt: number | null;
  /** Промежутки между новыми целями (объект деревни, улучшение, скин) в первый час, минуты. */
  gapsFirstHour: number[];
  final: { coins: number; light: number; economy: Economy };
}

/** Что хочет купить типичный игрок (берёт самое дешёвое из доступного). */
export const UPGRADE_ORDER: UpgradeId[] = ['lantern', 'rotate', 'stash'];
const UPGRADE_NAMES: Record<UpgradeId, string> = { stash: 'Отложить', rotate: 'Поворот', lantern: 'Фонарик' };
export const SKIN_ORDER = ['costume-2', 'lantern-round', 'arch-moon', 'road-moon', 'costume-3', 'road-stones', 'lantern-diamond', 'road-firefly', 'arch-stone', 'costume-5'];

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function simulate(levels: readonly SimLevel[], minutes = 120, seed = 7): SimResult {
  const r = rng(seed);
  let e = defaultEconomy();
  const best = { stars: {} as Record<string, number>, fireflies: {} as Record<string, number> };
  const events: SimEvent[] = [];
  let t = 0;
  let villageDoneAt: number | null = null;
  let worldDoneAt: number | null = null;
  const log = (level: number, kind: SimEvent['kind'], what: string) =>
    events.push({ t: Math.round(t * 10) / 10, level, kind, what, coins: coins(e), light: lightBalance(e, best) });

  const daily = claimDaily(e, '2026-01-01');
  if (daily) {
    e = daily.economy;
    log(0, 'daily', `ежедневная награда, день ${daily.day}`);
  }

  const spend = (num: number) => {
    // Между уровнями игрок заходит в деревню и магазин: восстанавливает не больше одного объекта
    // и покупает не больше одной вещи (самую дешёвую из желаемых).
    for (let k = 0; k < 1; k++) {
      const next = nextVillageObject(e);
      if (!next) break;
      const res = restore(e, next.id, lightBalance(e, best));
      if (typeof res === 'string') break;
      e = res.economy;
      log(num, 'village', `${next.name} (${next.cost} света)`);
      if (!nextVillageObject(e) && villageDoneAt === null) villageDoneAt = num;
    }
    for (let k = 0; k < 1; k++) {
      const wants: { price: number; buy: () => Economy | string; label: string; kind: SimEvent['kind'] }[] = [];
      for (const id of new Set(UPGRADE_ORDER)) {
        const price = upgradePrice(e, id);
        if (price !== null) wants.push({ price, buy: () => buyUpgrade(e, id), label: `${UPGRADE_NAMES[id]} → ${e.upgrades[id] + 1}`, kind: 'upgrade' });
      }
      for (const id of SKIN_ORDER) {
        const s = skinById(id)!;
        if (!e.skins.owned.includes(id) && !s.special && !s.source) wants.push({ price: s.price, buy: () => buySkin(e, id), label: s.name, kind: 'skin' });
      }
      const pick = wants.filter((w) => w.price <= coins(e)).sort((a, b) => a.price - b.price)[0];
      if (!pick) break;
      const res = pick.buy();
      if (typeof res === 'string') break;
      e = res;
      log(num, pick.kind, pick.label);
    }
  };

  const play = (lv: SimLevel, replay: boolean) => {
    const rating = lv.rating;
    // Поражения: шанс растёт с рейтингом; каждая неудачная попытка — 60% времени уровня.
    const levelTime = lv.infinite ? 0.7 : 0.8 + rating * 0.45;
    const lose = Math.min(0.55, Math.max(0.03, (rating - 2) * 0.12));
    while (r() < lose) t += levelTime * 0.6;
    t += levelTime;
    const p3 = lv.infinite ? 0.85 : Math.min(0.9, Math.max(0.25, 1.15 - rating * 0.15)) + (replay ? 0.3 : 0);
    const stars = r() < p3 ? 3 : r() < 0.8 ? 2 : 1;
    let ff = 0;
    for (let i = 0; i < lv.fireflies; i++) if (r() < (replay ? 0.85 : 0.6)) ff++;
    e = applyWin(e, lv.id, stars).economy;
    best.stars[lv.id] = Math.max(best.stars[lv.id] ?? 0, stars);
    best.fireflies[lv.id] = Math.max(best.fireflies[lv.id] ?? 0, ff);
    spend(lv.num);
  };

  for (const lv of levels) {
    if (t >= minutes) break;
    play(lv, false);
    if (lv === levels[levels.length - 1]) worldDoneAt = Math.round(t);
  }
  // Мир пройден, время ещё есть — переигрывает уровни с худшими звёздами.
  while (t < minutes && worldDoneAt !== null) {
    const worst = [...levels].sort((a, b) => (best.stars[a.id] ?? 0) - (best.stars[b.id] ?? 0))[0];
    if ((best.stars[worst.id] ?? 0) >= 3) break;
    play(worst, true);
  }

  // Цели, полученные в одну минуту (объект и покупка сразу после уровня), считаем одним моментом.
  const goals = [...new Set(events.filter((x) => x.kind !== 'daily' && x.kind !== 'level' && x.t <= 60).map((x) => x.t))];
  const gapsFirstHour = goals.map((g, i) => Math.round((g - (i ? goals[i - 1] : 0)) * 10) / 10);
  return { events, villageDoneAt, worldDoneAt, gapsFirstHour, final: { coins: coins(e), light: lightBalance(e, best), economy: e } };
}
