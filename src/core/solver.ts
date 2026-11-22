// Решатель: поиск в глубину по всем ходам с учётом лотка из 3 плиток и слота «отложить».
// Используется в npm run verify (проверка уровней), в подсказках, в «+3 плитки» и в облегчении уровня.

import { dealExtra, placeTile, TRAY_SIZE, type Action, type GameState } from './game';
import { TILE_KINDS, type Dir, type Level, type TileKind } from './types';

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

type MoveFrom = 'tray' | 'stash' | 'toStash' | 'swap';

interface Move {
  kind: TileKind;
  from: MoveFrom;
  next: Node;
  cells: number[];
}

export interface SolveOptions {
  allowStash?: boolean;
  countRoads?: boolean;
  /** Колода вместо колоды уровня (облегчение, проверки). */
  deck?: TileKind[];
}

export interface SolveReport {
  solvable: boolean;
  /** Сколько разных дорог приводят к победе. Мало — уровень сложный. */
  roads: number;
  /** Максимум плиток, которые могут остаться (для звёзд). */
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
    private deck: TileKind[],
    private opts: { allowStash: boolean; countRoads: boolean },
  ) {
    this.exitIdx = level.exit.y * level.width + level.exit.x;
  }

  get states(): number {
    return this.memo.size;
  }

  /** Сколько перебранных состояний ещё ведут к победе — мера того, насколько уровень прощает ошибки. */
  get winnableStates(): number {
    let n = 0;
    for (const r of this.memo.values()) if (r.best >= 0) n++;
    return n;
  }

  key(n: Node): string {
    return `${n.head},${n.dir},${n.mask.toString(36)},${n.deckIndex},${[...n.tray].sort().join('+')},${n.stash ?? '-'}`;
  }

  leftover(n: Node): number {
    return this.deck.length - n.deckIndex + n.tray.length + (n.stash ? 1 : 0);
  }

  /**
   * Все ходы. Обмен с отложенной плиткой сам по себе плиток не тратит, а любая серия обменов
   * равна одному обмену, поэтому «обмен + постановка» — один составной ход (так нет циклов).
   */
  moves(n: Node, withSwap = true): Move[] {
    const out: Move[] = [];
    const isOnRoad = (i: number) => ((n.mask >> BigInt(i)) & 1n) === 1n;
    const deck = this.deck;

    const place = (kind: TileKind, tray: TileKind[], deckIndex: number, stash: TileKind | null, from: MoveFrom) => {
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
      const others = n.tray.filter((_, j) => j !== i);
      // Плитку забрали из лотка — её место занимает следующая из колоды.
      const tray = [...others];
      let deckIndex = n.deckIndex;
      if (deckIndex < deck.length) tray.push(deck[deckIndex++]);
      place(kind, tray, deckIndex, n.stash, 'tray');
      if (!this.opts.allowStash) return;
      // Отложить: имеет смысл, только если в колоде ещё есть плитки.
      if (n.stash === null && n.deckIndex < deck.length) {
        out.push({ kind, from: 'toStash', cells: [], next: { ...n, tray, deckIndex, stash: kind } });
      }
      // Обмен с отложенной плиткой, сразу за ним — постановка.
      if (withSwap && n.stash !== null && n.stash !== kind) {
        const swapped: Node = { ...n, tray: [...others, n.stash], stash: kind };
        for (const m of this.moves(swapped, false)) {
          if (m.from === 'tray' || m.from === 'stash') out.push({ ...m, kind, from: 'swap' });
        }
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
    this.memo.set(k, res); // дорога только растёт, циклов нет
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

function startNode(level: Level, deck: TileKind[]): Node {
  const startIdx = level.start.y * level.width + level.start.x;
  return {
    head: startIdx,
    dir: level.startDir,
    mask: 1n << BigInt(startIdx),
    deckIndex: Math.min(TRAY_SIZE, deck.length),
    tray: deck.slice(0, TRAY_SIZE),
    stash: null,
  };
}

function nodeOf(state: GameState): Node {
  let mask = 0n;
  state.onRoad.forEach((v, i) => {
    if (v) mask |= 1n << BigInt(i);
  });
  return {
    head: state.head,
    dir: state.dir,
    mask,
    deckIndex: state.deckIndex,
    tray: state.tray.filter((t): t is TileKind => t !== null),
    stash: state.stash,
  };
}

export function solveLevel(level: Level, options: SolveOptions = {}): SolveReport {
  const deck = options.deck ?? level.deck;
  const solver = new Solver(level, deck, { allowStash: options.allowStash ?? true, countRoads: options.countRoads ?? true });
  const r = solver.explore(startNode(level, deck));
  return {
    solvable: r.best >= 0,
    roads: r.roads?.size ?? 0,
    maxLeftover: r.best,
    minTiles: r.best >= 0 ? deck.length - r.best : -1,
    states: solver.states,
  };
}

/** Лучший остаток плиток, достижимый из состояния партии; -1 — отсюда не выиграть. */
export function bestFrom(state: GameState): number {
  if (state.status === 'won') return 0;
  return new Solver(state.level, state.deck, { allowStash: true, countRoads: false }).explore(nodeOf(state)).best;
}

/** Подсказка: ход, после которого ещё можно выиграть с наибольшим запасом плиток. */
export function findHint(state: GameState): Action | null {
  if (state.status !== 'playing') return null;
  const solver = new Solver(state.level, state.deck, { allowStash: true, countRoads: false });
  let bestScore = -1;
  let bestMove: Move | null = null;
  // При равенстве: поставить из лотка > отложить > поставить из слота > обменять.
  const pref: Record<MoveFrom, number> = { tray: 3, toStash: 2, stash: 1, swap: 0 };
  for (const m of solver.moves(nodeOf(state))) {
    const r = solver.explore(m.next);
    const score = r.best * 4 + pref[m.from];
    if (r.best >= 0 && score > bestScore) {
      bestScore = score;
      bestMove = m;
    }
  }
  if (!bestMove) return null;
  if (bestMove.from === 'stash') return { type: 'placeStash' };
  const slot = state.tray.indexOf(bestMove.kind);
  if (bestMove.from === 'toStash') return { type: 'stash', slot };
  if (bestMove.from === 'swap') return { type: 'swap', slot };
  return { type: 'place', slot };
}

/** Ближайшее предыдущее состояние (или текущее), откуда ещё можно выиграть. steps — сколько ходов назад. */
export function nearestSolvable(state: GameState): { state: GameState; steps: number } | null {
  let s: GameState | null = state;
  for (let steps = 0; s; steps++, s = s.prev) {
    if (s.status !== 'won' && bestFrom(s) >= 0) return { state: s, steps };
  }
  return null;
}

/** Виды плиток, которые имеет смысл добавлять на этом поле (мост — только если есть вода). */
function usefulKinds(level: Level): readonly TileKind[] {
  return level.cells.includes('water') ? TILE_KINDS : TILE_KINDS.filter((k) => k !== 'bridge');
}

/** Все наборы из n видов плиток (с повторами). */
function combos(n: number, kinds: readonly TileKind[]): TileKind[][] {
  const out: TileKind[][] = [];
  const rec = (start: number, acc: TileKind[]) => {
    if (acc.length === n) {
      out.push([...acc]);
      return;
    }
    for (let i = start; i < kinds.length; i++) rec(i, [...acc, kinds[i]]);
  };
  rec(0, []);
  return out;
}

/**
 * «+3 плитки»: подбирает n плиток, с которыми из текущего состояния можно выиграть.
 * Если из текущего состояния не выиграть никакими плитками (дорога зашла в тупик),
 * откатывается к ближайшему состоянию, где это возможно. Возвращает новое состояние.
 */
export function findExtraTiles(state: GameState, n = 3): { state: GameState; kinds: TileKind[]; rollback: number } | null {
  let base: GameState | null = state;
  for (let rollback = 0; base; rollback++, base = base.prev) {
    if (base.status === 'won') continue;
    let best: { state: GameState; kinds: TileKind[]; score: number } | null = null;
    for (const kinds of combos(n, usefulKinds(state.level))) {
      const next = dealExtra({ ...base, status: 'playing' }, kinds);
      const b = bestFrom(next);
      if (b >= 0 && (!best || b > best.score)) best = { state: next, kinds, score: b };
    }
    if (best) return { state: { ...best.state, undoLeft: state.undoLeft }, kinds: best.kinds, rollback };
  }
  return null;
}

const EASE_POSITIONS = 6;

/** Сколько состояний уровня с этой колодой ведут к победе (-1 — не решается). */
function forgiveness(level: Level, deck: TileKind[]): { winnable: number; left: number } {
  const solver = new Solver(level, deck, { allowStash: true, countRoads: false });
  const r = solver.explore(startNode(level, deck));
  return { winnable: r.best >= 0 ? solver.winnableStates : -1, left: r.best };
}

/**
 * Незаметное облегчение после серии поражений: добавляет в колоду `extra` плиток (по одной, жадно).
 * Вид и место выбираются так, чтобы уровень сильнее всего «прощал» ошибки: больше состояний, из которых
 * ещё можно выиграть. Лишняя плитка помогает сильнее всего в начале колоды — перебираем только первые позиции.
 */
export function easeDeck(level: Level, extra: number, deck: TileKind[] = level.deck): TileKind[] {
  let cur = [...deck];
  for (let k = 0; k < extra; k++) {
    let best: { deck: TileKind[]; winnable: number; left: number } | null = null;
    for (const kind of usefulKinds(level)) {
      for (let pos = 0; pos <= Math.min(cur.length, EASE_POSITIONS); pos++) {
        const cand = [...cur.slice(0, pos), kind, ...cur.slice(pos)];
        const f = forgiveness(level, cand);
        if (f.winnable < 0) continue;
        if (!best || f.winnable > best.winnable || (f.winnable === best.winnable && f.left > best.left)) {
          best = { deck: cand, ...f };
        }
      }
    }
    if (best) cur = best.deck;
  }
  return cur;
}
