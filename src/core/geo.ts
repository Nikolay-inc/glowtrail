// Решатель для бесконечной колоды: плитки любые из набора, лимита нет.
// Отвечает только на вопросы геометрии: можно ли отсюда дойти до выхода и сколько разных дорог есть.

import { placeTile } from './tiles';
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

/** Минимум плиток из набора, чтобы дойти до выхода через все фонари; -1 — уже не дойти. */
export function geoMinTiles(level: Level, kinds: readonly TileKind[], head: number, dir: Dir, mask: bigint): number {
  const exitIdx = level.exit.y * level.width + level.exit.x;
  const { map, prefix } = cacheFor(level, kinds);
  const rec = (h: number, d: Dir, m: bigint): number => {
    if (h === exitIdx) return 0;
    const key = `${prefix}|${h},${d},${m.toString(36)}`;
    const cached = map.get(key);
    if (cached !== undefined) return cached;
    map.set(key, -1);
    let best = -1;
    for (const k of kinds) {
      const p = placeTile(level, (i) => isOn(m, i), h, d, k);
      if (!p.ok) continue;
      let nm = m;
      for (const c of p.cells) nm |= 1n << BigInt(c.idx);
      const r = rec(p.cells[p.cells.length - 1].idx, p.newDir, nm);
      if (r >= 0 && (best < 0 || r + 1 < best)) best = r + 1;
    }
    map.set(key, best);
    return best;
  };
  return rec(head, dir, mask);
}

/** Можно ли поставить хоть одну плитку из набора (иначе дорога в тупике). */
export function geoCanMove(level: Level, kinds: readonly TileKind[], head: number, dir: Dir, mask: bigint): boolean {
  return kinds.some((k) => placeTile(level, (i) => isOn(mask, i), head, dir, k).ok);
}

/** Сколько разных дорог (последовательностей клеток) ведут со старта к выходу. */
export function geoCountRoads(level: Level, kinds: readonly TileKind[], limit = 1_000_000): number {
  const exitIdx = level.exit.y * level.width + level.exit.x;
  const memo = new Map<string, Set<string>>();
  const rec = (h: number, d: Dir, m: bigint): Set<string> => {
    if (h === exitIdx) return new Set(['']);
    const key = `${h},${d},${m.toString(36)}`;
    const cached = memo.get(key);
    if (cached) return cached;
    const out = new Set<string>();
    memo.set(key, out);
    for (const k of kinds) {
      const p = placeTile(level, (i) => isOn(m, i), h, d, k);
      if (!p.ok) continue;
      let nm = m;
      for (const c of p.cells) nm |= 1n << BigInt(c.idx);
      const prefix = p.cells.map((c) => String.fromCharCode(48 + c.idx)).join('');
      for (const s of rec(p.cells[p.cells.length - 1].idx, p.newDir, nm)) {
        out.add(prefix + s);
        if (out.size >= limit) return out;
      }
    }
    return out;
  };
  const start = level.start.y * level.width + level.start.x;
  return rec(start, level.startDir, 1n << BigInt(start)).size;
}

/** Сколько светлячков можно собрать по дороге к выходу (максимум по всем дорогам). */
export function geoMaxFireflies(level: Level, kinds: readonly TileKind[]): number {
  const exitIdx = level.exit.y * level.width + level.exit.x;
  const memo = new Map<string, number>();
  const rec = (h: number, d: Dir, m: bigint): number => {
    if (h === exitIdx) return 0;
    const key = `${h},${d},${m.toString(36)}`;
    const cached = memo.get(key);
    if (cached !== undefined) return cached;
    memo.set(key, -1);
    let best = -1;
    for (const k of kinds) {
      const p = placeTile(level, (i) => isOn(m, i), h, d, k);
      if (!p.ok) continue;
      let nm = m;
      let ff = 0;
      for (const c of p.cells) {
        nm |= 1n << BigInt(c.idx);
        if (level.cells[c.idx] === 'firefly') ff++;
      }
      const r = rec(p.cells[p.cells.length - 1].idx, p.newDir, nm);
      if (r >= 0) best = Math.max(best, r + ff);
    }
    memo.set(key, best);
    return best;
  };
  const start = level.start.y * level.width + level.start.x;
  return Math.max(0, rec(start, level.startDir, 1n << BigInt(start)));
}

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
): number {
  const exitIdx = level.exit.y * level.width + level.exit.x;
  // В memo: число ≥ 0 — точный минимум; отрицательное -(b+1) — за b плиток не дойти.
  const rec = (h: number, d: Dir, m: bigint, b: number): number => {
    if (h === exitIdx) return 0;
    if (b <= 0) return -1;
    const key = `${h},${d},${m.toString(36)}`;
    const c = memo.get(key);
    if (c !== undefined) {
      if (c >= 0) return c <= b ? c : -1;
      if (-c - 1 >= b) return -1;
    }
    let best = -1;
    for (const k of kinds) {
      const p = placeTile(level, (i) => isOn(m, i), h, d, k);
      if (!p.ok) continue;
      let nm = m;
      for (const cell of p.cells) nm |= 1n << BigInt(cell.idx);
      const r = rec(p.cells[p.cells.length - 1].idx, p.newDir, nm, b - 1);
      if (r >= 0 && (best < 0 || r + 1 < best)) best = r + 1;
    }
    memo.set(key, best >= 0 ? best : -(b + 1));
    return best;
  };
  return rec(head, dir, mask, budget);
}
