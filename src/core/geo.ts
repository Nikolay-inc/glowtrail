// Решатель для бесконечной колоды: плитки любые из набора, лимита нет.
// Отвечает только на вопросы геометрии: можно ли отсюда дойти до выхода и сколько разных дорог есть.

import { advanceTime, goalReached, placeTile, timeDead, timeKey, timeStart, type TimeState } from './tiles';
import type { Dir, Level, TileKind } from './types';

/** Кэш «минимум плиток до выхода» по уровню: зависит только от геометрии, поэтому общий для всех вызовов. */
const minCache = new WeakMap<Level, Map<string, number>>();

function cacheFor(level: Level, kinds: readonly TileKind[]) {
  let byLevel = minCache.get(level);
  if (!byLevel) {
    byLevel = new Map();
    minCache.set(level, byLevel);
  }
  return { map: byLevel, prefix: kinds.join('+') };
}

const isOn = (mask: bigint, i: number) => ((mask >> BigInt(i)) & 1n) === 1n;

/** Цель достигнута (арка или все светлячки). */
const done = (level: Level, h: number, m: bigint) => goalReached(level, h, (i) => isOn(m, i));
/** Отсюда уже не выиграть из-за времени (погас гаснущий фонарь). */
const dead = (level: Level, ts: TimeState) => level.timed && timeDead(level, ts);

/** Минимум плиток из набора, чтобы дойти до выхода через все фонари; -1 — уже не дойти. */
export function geoMinTiles(level: Level, kinds: readonly TileKind[], head: number, dir: Dir, mask: bigint, time: TimeState = timeStart(level)): number {
  const { map, prefix } = cacheFor(level, kinds);
  const rec = (h: number, d: Dir, m: bigint, ts: TimeState): number => {
    if (done(level, h, m)) return 0;
    if (dead(level, ts)) return -1;
    const key = `${prefix}|${h},${d},${m.toString(36)}|${timeKey(level, ts)}`;
    const cached = map.get(key);
    if (cached !== undefined) return cached;
    map.set(key, -1);
    let best = -1;
    for (const k of kinds) {
      const p = placeTile(level, (i) => isOn(m, i), h, d, k, ts);
      if (!p.ok) continue;
      let nm = m;
      for (const c of p.cells) nm |= 1n << BigInt(c.idx);
      const r = rec(p.cells[p.cells.length - 1].idx, p.newDir, nm, advanceTime(level, ts, p.cells));
      if (r >= 0 && (best < 0 || r + 1 < best)) best = r + 1;
    }
    map.set(key, best);
    return best;
  };
  return rec(head, dir, mask, time);
}

/** Можно ли поставить хоть одну плитку из набора (иначе дорога в тупике). */
export function geoCanMove(level: Level, kinds: readonly TileKind[], head: number, dir: Dir, mask: bigint, time?: TimeState): boolean {
  return kinds.some((k) => placeTile(level, (i) => isOn(mask, i), head, dir, k, time).ok);
}

/** Сколько разных дорог (последовательностей клеток) ведут со старта к выходу. */
export function geoCountRoads(level: Level, kinds: readonly TileKind[], limit = 1_000_000): number {
  const memo = new Map<string, Set<string>>();
  const rec = (h: number, d: Dir, m: bigint, ts: TimeState): Set<string> => {
    if (done(level, h, m)) return new Set(['']);
    if (dead(level, ts)) return new Set();
    const key = `${h},${d},${m.toString(36)}|${timeKey(level, ts)}`;
    const cached = memo.get(key);
    if (cached) return cached;
    const out = new Set<string>();
    memo.set(key, out);
    for (const k of kinds) {
      const p = placeTile(level, (i) => isOn(m, i), h, d, k, ts);
      if (!p.ok) continue;
      let nm = m;
      for (const c of p.cells) nm |= 1n << BigInt(c.idx);
      const prefix = p.cells.map((c) => String.fromCharCode(48 + c.idx)).join('');
      for (const s of rec(p.cells[p.cells.length - 1].idx, p.newDir, nm, advanceTime(level, ts, p.cells))) {
        out.add(prefix + s);
        if (out.size >= limit) return out;
      }
    }
    return out;
  };
  const start = level.start.y * level.width + level.start.x;
  return rec(start, level.startDir, 1n << BigInt(start), timeStart(level)).size;
}

/** Сколько светлячков можно собрать по дороге к выходу (максимум по всем дорогам). */
export function geoMaxFireflies(level: Level, kinds: readonly TileKind[]): number {
  const memo = new Map<string, number>();
  const rec = (h: number, d: Dir, m: bigint, ts: TimeState): number => {
    if (done(level, h, m)) return 0;
    if (dead(level, ts)) return -1;
    const key = `${h},${d},${m.toString(36)}|${timeKey(level, ts)}`;
    const cached = memo.get(key);
    if (cached !== undefined) return cached;
    memo.set(key, -1);
    let best = -1;
    for (const k of kinds) {
      const p = placeTile(level, (i) => isOn(m, i), h, d, k, ts);
      if (!p.ok) continue;
      let nm = m;
      let ff = 0;
      for (const c of p.cells) {
        nm |= 1n << BigInt(c.idx);
        if (level.cells[c.idx] === 'firefly') ff++;
      }
      const r = rec(p.cells[p.cells.length - 1].idx, p.newDir, nm, advanceTime(level, ts, p.cells));
      if (r >= 0) best = Math.max(best, r + ff);
    }
    memo.set(key, best);
    return best;
  };
  const start = level.start.y * level.width + level.start.x;
  return Math.max(0, rec(start, level.startDir, 1n << BigInt(start), timeStart(level)));
}

/** Поиск с пределом длины перебрал слишком много состояний (генератор отбрасывает такое поле). */
export class GeoTooBig extends Error {}
export const GEO_MEMO_LIMIT = 1_500_000;

/**
 * Минимум плиток до выхода, но искать не дальше budget плиток (быстро на больших полях — для генератора).
 * Возвращает точный минимум, если он не больше budget, иначе -1. memo можно передавать между вызовами одного поля.
 */
export function geoMinBounded(
  level: Level,
  kinds: readonly TileKind[],
  head: number,
  dir: Dir,
  mask: bigint,
  budget: number,
  memo: Map<string, number> = new Map(),
  time: TimeState = timeStart(level),
): number {
  // В memo: число ≥ 0 — точный минимум; отрицательное -(b+1) — за b плиток не дойти.
  const rec = (h: number, d: Dir, m: bigint, b: number, ts: TimeState): number => {
    if (done(level, h, m)) return 0;
    if (b <= 0 || dead(level, ts)) return -1;
    if (memo.size > GEO_MEMO_LIMIT) throw new GeoTooBig();
    const key = `${h},${d},${m.toString(36)}|${timeKey(level, ts)}`;
    const c = memo.get(key);
    if (c !== undefined) {
      if (c >= 0) return c <= b ? c : -1;
      if (-c - 1 >= b) return -1;
    }
    let best = -1;
    for (const k of kinds) {
      const p = placeTile(level, (i) => isOn(m, i), h, d, k, ts);
      if (!p.ok) continue;
      let nm = m;
      for (const cell of p.cells) nm |= 1n << BigInt(cell.idx);
      const r = rec(p.cells[p.cells.length - 1].idx, p.newDir, nm, b - 1, advanceTime(level, ts, p.cells));
      if (r >= 0 && (best < 0 || r + 1 < best)) best = r + 1;
    }
    memo.set(key, best >= 0 ? best : -(b + 1));
    return best;
  };
  return rec(head, dir, mask, budget, time);
}
