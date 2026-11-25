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
  /** Что игрок ещё хотел бы купить, когда прошёл мир 1 (дорогие скины, высшие уровни улучшений). */
  leftAtWorldEnd: { label: string; price: number }[];
  final: { coins: number; light: number; economy: Economy };
}

/**
 * Список желаний типичного игрока: следующая вещь покупается, как только хватает монет (не больше одной
 * между уровнями). Улучшение, которое ещё не открыто (поворот — из деревни), игрок ждёт.
 */
export type Wish = { upgrade: UpgradeId } | { skin: string };
export const WISHLIST: Wish[] = [
  { upgrade: 'lantern' },
  { skin: 'costume-2' },
  { upgrade: 'rotate' },
  { skin: 'road-moon' },
  { upgrade: 'lantern' },
  { skin: 'arch-moon' },
  { skin: 'costume-3' },
  { skin: 'road-stones' },
  { skin: 'lantern-round' },
  { skin: 'lantern-diamond' },
  { skin: 'road-firefly' },
  { skin: 'road-sunset' },
  { skin: 'arch-sunset' },
  { skin: 'arch-stone' },
  { upgrade: 'stash' },
  { skin: 'costume-5' },
  { skin: 'road-aurora' },
  { upgrade: 'lantern' },
  { upgrade: 'rotate' },
];
const UPGRADE_NAMES: Record<UpgradeId, string> = { stash: 'Отложить', rotate: 'Поворот', lantern: 'Фонарик' };

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
  let leftAtWorldEnd: { label: string; price: number }[] = [];
  const wantsLeft = () =>
    WISHLIST.slice(wish).map((w) =>
      'upgrade' in w ? { label: `${UPGRADE_NAMES[w.upgrade]} (улучшение)`, price: upgradePrice(e, w.upgrade) ?? 0 } : { label: skinById(w.skin)!.name, price: skinById(w.skin)!.price },
    );

  const log = (level: number, kind: SimEvent['kind'], what: string) =>
    events.push({ t: Math.round(t * 10) / 10, level, kind, what, coins: coins(e), light: lightBalance(e, best) });

  const daily = claimDaily(e, '2026-01-01');
  if (daily) {
    e = daily.economy;
    log(0, 'daily', `ежедневная награда, день ${daily.day}`);
  }

  let wish = 0;
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
    // Монеты: следующая вещь из списка желаний, если хватает.
    if (wish < WISHLIST.length) {
      const w = WISHLIST[wish];
      if ('upgrade' in w) {
        const price = upgradePrice(e, w.upgrade);
        if (price !== null && coins(e) >= price) {
          e = buyUpgrade(e, w.upgrade) as Economy;
          log(num, 'upgrade', `${UPGRADE_NAMES[w.upgrade]} → ${e.upgrades[w.upgrade]}`);
          wish++;
        }
      } else {
        const res = buySkin(e, w.skin);
        if (res === 'owned' || res === 'locked' || res === 'special') wish++;
        else if (typeof res !== 'string') {
          e = res;
          log(num, 'skin', skinById(w.skin)!.name);
          wish++;
        }
      }
    }
  };

  // Средний игрок: ожидаемое время уровня с учётом поражений (каждая неудачная попытка — 60% времени уровня),
  // средние звёзды и светлячки (округлённые). Детерминированно — промежутки между целями не зависят от удачи.
  const play = (lv: SimLevel, replay: boolean) => {
    const rating = lv.rating;
    // Калибровка: рейтинг 2 — около 1,5 мин, рейтинг 6 — около 4 мин вместе с поражениями.
    const levelTime = lv.infinite ? 0.7 : 0.6 + rating * 0.4;
    const lose = Math.min(0.45, Math.max(0.03, (rating - 2) * 0.1));
    t += levelTime * (1 + (0.6 * lose) / (1 - lose));
    const p3 = Math.min(1, (lv.infinite ? 0.85 : Math.min(0.9, Math.max(0.25, 1.15 - rating * 0.15))) + (replay ? 0.3 : 0));
    const expectedStars = 3 * p3 + (1 - p3) * 2.2;
    const stars = Math.max(1, Math.min(3, Math.round(expectedStars)));
    const ff = Math.round(lv.fireflies * (replay ? 0.85 : 0.6));
    void r;
    e = applyWin(e, lv.id, stars).economy;
    best.stars[lv.id] = Math.max(best.stars[lv.id] ?? 0, stars);
    best.fireflies[lv.id] = Math.max(best.fireflies[lv.id] ?? 0, ff);
    spend(lv.num);
  };

  for (const lv of levels) {
    if (t >= minutes) break;
    play(lv, false);
    if (lv === levels[levels.length - 1]) {
      worldDoneAt = Math.round(t);
      leftAtWorldEnd = wantsLeft();
    }
  }
  // Мир пройден, время ещё есть — переигрывает уровни с худшими звёздами.
  while (t < minutes && worldDoneAt !== null) {
    const worst = [...levels].sort((a, b) => (best.stars[a.id] ?? 0) - (best.stars[b.id] ?? 0))[0];
    if ((best.stars[worst.id] ?? 0) >= 3) break;
    // Переигровка лучше: средние звёзды на ней выше.
    play(worst, true);
  }

  // Цели, полученные в одну минуту (объект и покупка сразу после уровня), считаем одним моментом.
  const goals = [...new Set(events.filter((x) => x.kind !== 'daily' && x.kind !== 'level' && x.t <= 60).map((x) => x.t))];
  const gapsFirstHour = goals.map((g, i) => Math.round((g - (i ? goals[i - 1] : 0)) * 10) / 10);
  return { events, villageDoneAt, worldDoneAt, gapsFirstHour, leftAtWorldEnd, final: { coins: coins(e), light: lightBalance(e, best), economy: e } };
}
