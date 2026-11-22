// Решатель: поиск в глубину по всем ходам с учётом лотка из 3 плиток и слота «отложить».
// Используется в npm run verify (проверка уровней) и в обучении (рука показывает правильную плитку).

import { placeTile, TRAY_SIZE, type Action, type GameState } from './game';
import type { Dir, Level, TileKind } from './types';

interface Node {
  head: number;
  dir: Dir;
  mask: bigint; // клетки, занятые дорогой
  deckIndex: number;
  tray: TileKind[]; // порядок в лотке на логику не влияет
  stash: TileKind | null;
}

interface Result {
  /** Лучшее число оставшихся плиток при победе; -1 — отсюда не выиграть. */
  best: number;
  /** Разные дороги-решения (последовательности клеток) от этого состояния до выхода. */
  roads: Set<string> | null;
}

export interface SolveOptions {
  allowStash?: boolean;
  countRoads?: boolean;
}

export interface SolveReport {
  solvable: boolean;
  /** Сколько разных дорог приводят к победе. Мало — уровень сложный. */
  roads: number;
  /** Максимум плиток, которые могут остаться (для 3 звёзд). */
  maxLeftover: number;
  /** Минимум плиток, которыми можно пройти уровень. */
  minTiles: number;
  /** Сколько разных состояний перебрал решатель. */
  states: number;
}

class Solver {
  private memo = new Map<string, Result>();
  private readonly exitIdx: number;

  constructor(
    private level: Level,
    private opts: Required<SolveOptions>,
  ) {
    this.exitIdx = level.exit.y * level.width + level.exit.x;
  }

  get states(): number {
    return this.memo.size;
  }

  key(n: Node): string {
    return `${n.head},${n.dir},${n.mask.toString(36)},${n.deckIndex},${[...n.tray].sort().join('+')},${n.stash ?? '-'}`;
  }

  leftover(n: Node): number {
    return this.level.deck.length - n.deckIndex + n.tray.length + (n.stash ? 1 : 0);
  }

  /** Все ходы из состояния: [действие для подсказки, новое состояние, клетки дороги]. */
  moves(n: Node): { kind: TileKind; from: 'tray' | 'stash' | 'toStash'; next: Node; cells: number[] }[] {
    const out: { kind: TileKind; from: 'tray' | 'stash' | 'toStash'; next: Node; cells: number[] }[] = [];
    const isOnRoad = (i: number) => ((n.mask >> BigInt(i)) & 1n) === 1n;
    const deck = this.level.deck;

    const place = (kind: TileKind, tray: TileKind[], deckIndex: number, stash: TileKind | null, from: 'tray' | 'stash') => {
      const p = placeTile(this.level, isOnRoad, n.head, n.dir, kind);
      if (!p.ok) return;
      let mask = n.mask;
      for (const c of p.cells) mask |= 1n << BigInt(c.idx);
      out.push({
        kind,
        from,
        cells: p.cells.map((c) => c.idx),
        next: { head: p.cells[p.cells.length - 1].idx, dir: p.newDir, mask, deckIndex, tray, stash },
      });
    };

    const seen = new Set<TileKind>();
    n.tray.forEach((kind, i) => {
      if (seen.has(kind)) return;
      seen.add(kind);
      // Плитку забрали из лотка — её место занимает следующая из колоды.
      const tray = n.tray.filter((_, j) => j !== i);
      let deckIndex = n.deckIndex;
      if (deckIndex < deck.length) tray.push(deck[deckIndex++]);
      place(kind, tray, deckIndex, n.stash, 'tray');
      // Отложить: имеет смысл, только если в колоде ещё есть плитки.
      if (this.opts.allowStash && n.stash === null && n.deckIndex < deck.length) {
        out.push({ kind, from: 'toStash', cells: [], next: { ...n, tray, deckIndex, stash: kind } });
      }
    });
    if (n.stash) place(n.stash, n.tray, n.deckIndex, null, 'stash');
    return out;
  }

  explore(n: Node): Result {
    if (n.head === this.exitIdx) {
      return { best: this.leftover(n), roads: this.opts.countRoads ? new Set(['']) : null };
    }
    const k = this.key(n);
    const cached = this.memo.get(k);
    if (cached) return cached;

    const res: Result = { best: -1, roads: this.opts.countRoads ? new Set() : null };
    this.memo.set(k, res); // защита от циклов (на практике их нет: дорога только растёт)
    for (const m of this.moves(n)) {
      const r = this.explore(m.next);
      if (r.best < 0) continue;
      res.best = Math.max(res.best, r.best);
      if (res.roads && r.roads) {
        const prefix = m.cells.map((c) => String.fromCharCode(48 + c)).join('');
        for (const s of r.roads) res.roads.add(prefix + s);
      }
    }
    return res;
  }
}

function startNode(level: Level): Node {
  const startIdx = level.start.y * level.width + level.start.x;
  return {
    head: startIdx,
    dir: level.startDir,
    mask: 1n << BigInt(startIdx),
    deckIndex: Math.min(TRAY_SIZE, level.deck.length),
    tray: level.deck.slice(0, TRAY_SIZE),
    stash: null,
  };
}

export function solveLevel(level: Level, options: SolveOptions = {}): SolveReport {
  const solver = new Solver(level, { allowStash: options.allowStash ?? true, countRoads: options.countRoads ?? true });
  const r = solver.explore(startNode(level));
  return {
    solvable: r.best >= 0,
    roads: r.roads?.size ?? 0,
    maxLeftover: r.best,
    minTiles: r.best >= 0 ? level.deck.length - r.best : -1,
    states: solver.states,
  };
}

/** Подсказка: ход, после которого ещё можно выиграть с наибольшим запасом плиток. */
export function findHint(state: GameState): Action | null {
  if (state.status !== 'playing') return null;
  const level = state.level;
  let mask = 0n;
  state.onRoad.forEach((v, i) => {
    if (v) mask |= 1n << BigInt(i);
  });
  const node: Node = {
    head: state.head,
    dir: state.dir,
    mask,
    deckIndex: state.deckIndex,
    tray: state.tray.filter((t): t is TileKind => t !== null),
    stash: state.stash,
  };
  const solver = new Solver(level, { allowStash: true, countRoads: false });
  let bestScore = -1;
  let bestMove: ReturnType<Solver['moves']>[number] | null = null;
  for (const m of solver.moves(node)) {
    const r = solver.explore(m.next);
    // При равенстве предпочитаем поставить плитку, а не откладывать.
    const score = r.best * 2 + (m.from === 'toStash' ? 0 : 1);
    if (r.best >= 0 && score > bestScore) {
      bestScore = score;
      bestMove = m;
    }
  }
  if (!bestMove) return null;
  if (bestMove.from === 'stash') return { type: 'placeStash' };
  const slot = state.tray.indexOf(bestMove.kind);
  return bestMove.from === 'toStash' ? { type: 'stash', slot } : { type: 'place', slot };
}
