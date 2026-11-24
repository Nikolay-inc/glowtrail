// Метрики сложности уровня: число решений, минимум и запас плиток, доля тупиковых ходов и итоговый рейтинг 1–10.
// Чистая логика без Phaser: используется в npm run verify, ease, gen, pick и в редакторе уровней.

import { geoMinTiles } from './geo';
import { goalReached, placeTile } from './tiles';
import { solveLevel, Solver, startNode, type Node, type SolveReport } from './solver';
import type { Dir, Level, LevelMetrics, TileKind } from './types';

export interface DifficultyReport extends SolveReport {
  metrics: LevelMetrics;
  /** Решается ли без слота «отложить». */
  solvableWithoutStash: boolean;
}

/** mulberry32 — детерминированная выборка: у одного и того же уровня всегда одни и те же метрики. */
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

function hashLevel(level: Level, deck: readonly TileKind[]): number {
  const s = level.cells.join('') + level.startDir + deck.join('');
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Сколько ходов пробуем в выборке. */
export const TRAP_SAMPLES = 600;

/**
 * Доля тупиковых ходов: идём по уровню случайными допустимыми ходами (пока решение ещё есть) и считаем,
 * в какой доле случаев случайный ход отнимает последнюю возможность выиграть. 0 — любой ход годится,
 * 0,5 — каждый второй ход губит партию.
 */
export function trapRate(level: Level, deck: readonly TileKind[] = level.deck, samples = TRAP_SAMPLES, maxStates?: number): number {
  const rand = rng(hashLevel(level, deck));
  let traps = 0;
  let total = 0;
  if (level.tileSet) {
    // Бесконечная колода: ход — любая плитка из набора, которая встаёт.
    const kinds = level.tileSet;
    const start = level.start.y * level.width + level.start.x;
    for (let p = 0; p < samples * 3 && total < samples; p++) {
      let head = start;
      let dir: Dir = level.startDir;
      let mask = 1n << BigInt(start);
      if (geoMinTiles(level, kinds, head, dir, mask) < 0) return 1;
      while (!goalReached(level, head, (i) => ((mask >> BigInt(i)) & 1n) === 1n) && total < samples) {
        const opts = kinds
          .map((k) => placeTile(level, (i) => ((mask >> BigInt(i)) & 1n) === 1n, head, dir, k))
          .filter((m) => m.ok);
        if (!opts.length) break;
        const m = opts[Math.floor(rand() * opts.length)];
        let nm = mask;
        for (const c of m.cells) nm |= 1n << BigInt(c.idx);
        const nh = m.cells[m.cells.length - 1].idx;
        total++;
        if (geoMinTiles(level, kinds, nh, m.newDir, nm) < 0) {
          traps++;
          break;
        }
        head = nh;
        dir = m.newDir;
        mask = nm;
      }
    }
    return total ? traps / total : 0;
  }

  const solver = new Solver(level, [...deck], { allowStash: level.allowStash, countRoads: false, maxStates });
  const start = startNode(level, [...deck]);
  if (!solver.winnable(start)) return 1;
  for (let p = 0; p < samples * 3 && total < samples; p++) {
    let n: Node = start;
    while (!solver.isGoal(n) && total < samples) {
      const moves = solver.moves(n);
      if (!moves.length) break;
      const m = moves[Math.floor(rand() * moves.length)];
      total++;
      if (!solver.winnable(m.next)) {
        traps++;
        break;
      }
      n = m.next;
    }
  }
  return total ? traps / total : 0;
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/**
 * Рейтинг сложности 1–10 из метрик. Вклад (в сумме до 9 баллов сверх 1):
 * - доля тупиковых ходов — главное (до 4 баллов): до 10% — 0, 60% и больше — 4;
 * - мало решений (до 2 баллов): 100+ решений — 0, 1 решение — 2; на коротком пути (3–9 плиток) вклад меньше —
 *   единственная дорога из трёх плиток не делает уровень сложным;
 * - малый запас плиток (до 1,5 балла): запас 5+ — 0, запас 0 — 1,5; бесконечная колода — 0;
 * - длина пути (до 1,5 балла): до 5 плиток — 0, 17+ — 1,5.
 */
export function ratingOf(m: { trap: number; roads: number; reserve: number; minTiles: number }): number {
  const trap = 4 * clamp01((m.trap - 0.1) / 0.5);
  const short = clamp01((m.minTiles - 3) / 6);
  const roads = 2 * short * clamp01(1 - Math.log10(Math.max(1, m.roads)) / 2);
  const reserve = m.reserve < 0 ? 0 : 1.5 * clamp01((5 - m.reserve) / 5);
  const length = 1.5 * clamp01((m.minTiles - 5) / 12);
  const raw = 1 + trap + roads + reserve + length;
  return Math.round(Math.max(1, Math.min(10, raw)) * 10) / 10;
}

/**
 * Все метрики уровня (колода — своя или уровня). maxStates — предел состояний решателя:
 * больше — исключение TooManyStates (генератор отбрасывает такие уровни).
 */
export function analyzeLevel(level: Level, deck: TileKind[] = level.deck, maxStates?: number): DifficultyReport {
  const r = solveLevel(level, { deck: level.tileSet ? undefined : deck, maxStates });
  const noStash = level.allowStash && !level.tileSet ? solveLevel(level, { deck, allowStash: false, countRoads: false, maxStates }).solvable : r.solvable;
  const reserve = level.tileSet ? -1 : r.solvable ? deck.length - r.minTiles : 0;
  const trap = r.solvable ? Math.round(trapRate(level, deck, TRAP_SAMPLES, maxStates) * 1000) / 1000 : 1;
  const metrics: LevelMetrics = { rating: 0, roads: r.roads, minTiles: r.minTiles, reserve, trap };
  metrics.rating = ratingOf(metrics);
  return { ...r, metrics, solvableWithoutStash: noStash };
}
