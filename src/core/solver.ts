// Решатель: поиск в глубину по всем ходам с учётом лотка из 3 плиток и слота «отложить».
// Используется в npm run verify (проверка уровней), в подсказках, в «+3 плитки» и в облегчении уровня.

import { dealExtra, isInfinite, placeTile, tileLeadsToExit, timeOf, TRAY_SIZE, type Action, type GameState } from './game';
import { geoCountRoads, geoMaxFireflies, geoMinTiles } from './geo';
import { advanceTime, anyExpired, goalReached, timeKey, timeStart, type TimeState } from './tiles';
import { TILE_KINDS, type Dir, type Level, type TileKind } from './types';

export interface Node {
  head: number;
  dir: Dir;
  mask: bigint; // клетки, занятые дорогой
  deckIndex: number;
  tray: TileKind[]; // порядок в лотке на логику не влияет
  stash: TileKind | null;
  /** Часы уровня: сколько плиток поставлено и когда зажглись гаснущие фонари. */
  time: TimeState;
}

interface Result {
  /** Лучшее число оставшихся плиток при победе; -1 — отсюда не выиграть. */
  best: number;
  /** Сколько светлячков можно собрать дальше на пути к победе (максимум); -1 — не выиграть. */
  ff: number;
  /** Разные дороги-решения (последовательности клеток) от этого состояния до выхода. */
  roads: Set<string> | null;
}

export type MoveFrom = 'tray' | 'stash' | 'toStash' | 'swap';

export interface Move {
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
  /** Предел подсчёта решений: дальше решатель не считает (по умолчанию ROAD_LIMIT). */
  roadLimit?: number;
  /** Предел состояний: больше — исключение TooManyStates (по умолчанию без предела). */
  maxStates?: number;
}

/** Решений больше этого числа не считаем — уровню с сотнями решений точное число не важно. */
export const ROAD_LIMIT = 500;

/** Решатель перебрал слишком много состояний (генератор отбрасывает такие уровни: подсказки на телефоне были бы медленными). */
export class TooManyStates extends Error {
  constructor(readonly limit: number) {
    super(`больше ${limit} состояний`);
  }
}

export interface SolveReport {
  solvable: boolean;
  /** Сколько разных дорог приводят к победе (не больше предела). Мало — уровень сложный. */
  roads: number;
  /** Сколько светлячков можно собрать за одну победу (максимум). */
  maxFireflies: number;
  /** Максимум плиток, которые могут остаться (для звёзд). */
  maxLeftover: number;
  /** Минимум плиток, которыми можно пройти уровень. */
  minTiles: number;
  /** Сколько разных состояний перебрал решатель. */
  states: number;
}

export class Solver {
  private memo = new Map<string, Result>();
  private readonly isFirefly: boolean[];
  private readonly roadLimit: number;

  constructor(
    private level: Level,
    readonly deck: TileKind[],
    private opts: { allowStash: boolean; countRoads: boolean; roadLimit?: number; maxStates?: number },
  ) {
    this.isFirefly = level.cells.map((c) => c === 'firefly');
    this.roadLimit = opts.roadLimit ?? ROAD_LIMIT;
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
    return `${n.head},${n.dir},${n.mask.toString(36)},${n.deckIndex},${[...n.tray].sort().join('+')},${n.stash ?? '-'}|${timeKey(this.level, n.time)}`;
  }

  /** Цель достигнута: конец дороги в арке или собраны все светлячки. */
  isGoal(n: Node): boolean {
    return goalReached(this.level, n.head, (i) => ((n.mask >> BigInt(i)) & 1n) === 1n);
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
      const p = placeTile(this.level, isOnRoad, n.head, n.dir, kind, n.time);
      if (!p.ok) return;
      let mask = n.mask;
      for (const c of p.cells) mask |= 1n << BigInt(c.idx);
      const time = advanceTime(this.level, n.time, p.cells);
      out.push({
        kind,
        from,
        cells: p.cells.map((c) => c.idx),
        next: { head: p.cells[p.cells.length - 1].idx, dir: p.newDir, mask, deckIndex, tray, stash, time },
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
    if (this.isGoal(n)) {
      return { best: this.leftover(n), ff: 0, roads: this.opts.countRoads ? new Set(['']) : null };
    }
    const k = this.key(n);
    const cached = this.memo.get(k);
    if (cached) return cached;

    const res: Result = { best: -1, ff: -1, roads: this.opts.countRoads ? new Set() : null };
    this.memo.set(k, res); // дорога только растёт, циклов нет
    if (this.level.fades.length && anyExpired(this.level, n.time)) return res; // фонарь погас — арку не открыть
    if (this.opts.maxStates && this.memo.size > this.opts.maxStates) throw new TooManyStates(this.opts.maxStates);
    for (const m of this.moves(n)) {
      const r = this.explore(m.next);
      if (r.best < 0) continue;
      res.best = Math.max(res.best, r.best);
      let ff = r.ff;
      for (const c of m.cells) if (this.isFirefly[c]) ff++;
      res.ff = Math.max(res.ff, ff);
      // Решения считаем до предела: дальше точное число уже не важно (и не тратим память).
      if (res.roads && r.roads && res.roads.size < this.roadLimit) {
        const prefix = m.cells.map((c) => String.fromCharCode(48 + c)).join('');
        for (const s of r.roads) {
          res.roads.add(prefix + s);
          if (res.roads.size >= this.roadLimit) break;
        }
      }
    }
    return res;
  }

  /** Можно ли отсюда выиграть (с запоминанием — для оценки тупиковых ходов). */
  winnable(n: Node): boolean {
    return this.explore(n).best >= 0;
  }

  /** Одно из лучших решений от состояния: ходы по очереди (больше всего плиток в запасе, при равенстве — больше светлячков). */
  solution(n: Node): Move[] {
    const out: Move[] = [];
    let cur = n;
    while (!this.isGoal(cur)) {
      let best: { m: Move; score: number } | null = null;
      for (const m of this.moves(cur)) {
        const r = this.explore(m.next);
        if (r.best < 0) continue;
        let ff = r.ff;
        for (const c of m.cells) if (this.isFirefly[c]) ff++;
        const score = r.best * 1000 + ff * 10 + (m.from === 'tray' ? 2 : m.from === 'stash' ? 1 : 0);
        if (!best || score > best.score) best = { m, score };
      }
      if (!best) return [];
      out.push(best.m);
      cur = best.m.next;
    }
    return out;
  }
}

export function startNode(level: Level, deck: TileKind[]): Node {
  const startIdx = level.start.y * level.width + level.start.x;
  return {
    head: startIdx,
    dir: level.startDir,
    mask: 1n << BigInt(startIdx),
    deckIndex: Math.min(TRAY_SIZE, deck.length),
    tray: deck.slice(0, TRAY_SIZE),
    stash: null,
    time: timeStart(level),
  };
}

export function nodeOf(state: GameState): Node {
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
    time: timeOf(state),
  };
}

export function solveLevel(level: Level, options: SolveOptions = {}): SolveReport {
  if (level.tileSet && !options.deck) {
    // Бесконечная колода: важна только геометрия, плиток всегда хватает.
    const start = level.start.y * level.width + level.start.x;
    const min = geoMinTiles(level, level.tileSet, start, level.startDir, 1n << BigInt(start));
    return {
      solvable: min >= 0,
      roads: options.countRoads === false ? 0 : geoCountRoads(level, level.tileSet, options.roadLimit ?? ROAD_LIMIT),
      maxFireflies: level.fireflies.length ? geoMaxFireflies(level, level.tileSet) : 0,
      maxLeftover: 0,
      minTiles: min,
      states: 0,
    };
  }
  const deck = options.deck ?? level.deck;
  const solver = new Solver(level, deck, {
    allowStash: (options.allowStash ?? true) && level.allowStash,
    countRoads: options.countRoads ?? true,
    roadLimit: options.roadLimit,
    maxStates: options.maxStates,
  });
  const r = solver.explore(startNode(level, deck));
  return {
    solvable: r.best >= 0,
    roads: r.roads?.size ?? 0,
    maxFireflies: Math.max(0, r.ff),
    maxLeftover: r.best,
    minTiles: r.best >= 0 ? deck.length - r.best : -1,
    states: solver.states,
  };
}

/** Лучший остаток плиток, достижимый из состояния партии; -1 — отсюда не выиграть. */
export function bestFrom(state: GameState): number {
  if (state.status === 'won') return 0;
  if (isInfinite(state.level)) {
    const m = nodeOf(state).mask;
    return geoMinTiles(state.level, state.level.tileSet!, state.head, state.dir, m) >= 0 ? 0 : -1;
  }
  return new Solver(state.level, state.deck, { allowStash: true, countRoads: false }).explore(nodeOf(state)).best;
}

/** Подсказка: ход, после которого ещё можно выиграть с наибольшим запасом плиток. */
export function findHint(state: GameState): Action | null {
  if (state.status !== 'playing') return null;
  if (isInfinite(state.level)) return infiniteHint(state);
  const solver = new Solver(state.level, state.deck, { allowStash: state.level.allowStash, countRoads: false });
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

/** Подсказка в бесконечной колоде: плитка, после которой до выхода ближе всего. */
function infiniteHint(state: GameState): Action | null {
  const level = state.level;
  const kinds = level.tileSet!;
  const board = { level, onRoad: state.onRoad, head: state.head, dir: state.dir };
  const remaining = (kind: TileKind) => {
    const p = placeTile(level, (i) => state.onRoad[i], state.head, state.dir, kind);
    let m = nodeOf(state).mask;
    for (const c of p.cells) m |= 1n << BigInt(c.idx);
    return geoMinTiles(level, kinds, p.cells[p.cells.length - 1].idx, p.newDir, m);
  };
  let best: { action: Action; left: number } | null = null;
  state.tray.forEach((k, slot) => {
    if (!k || !tileLeadsToExit(board, k)) return;
    const left = remaining(k);
    if (!best || left < best.left) best = { action: { type: 'place', slot }, left };
  });
  if (state.stash && tileLeadsToExit(board, state.stash)) {
    const left = remaining(state.stash);
    if (!best || left < (best as { left: number }).left) best = { action: { type: 'placeStash' }, left };
  }
  if (best) return (best as { action: Action }).action;
  // Ни одна плитка не ведёт к выходу, но дойти ещё можно — отложить и взять новую.
  if (bestFrom(state) >= 0 && level.allowStash && state.stash === null) {
    const slot = state.tray.findIndex((t) => t !== null);
    if (slot >= 0) return { type: 'stash', slot };
  }
  return null;
}

/** Ближайшее предыдущее состояние (или текущее), откуда ещё можно выиграть. steps — сколько ходов назад. */
export function nearestSolvable(state: GameState): { state: GameState; steps: number } | null {
  let s: GameState | null = state;
  for (let steps = 0; s; steps++, s = s.prev) {
    if (s.status !== 'won' && bestFrom(s) >= 0) return { state: s, steps };
  }
  return null;
}

/** Виды плиток, которые имеет смысл добавлять на этом поле: мост — только если есть вода, прыжок — только если он есть в колоде. */
function usefulKinds(level: Level): readonly TileKind[] {
  const water = level.cells.includes('water');
  const jump = level.deck.includes('jump');
  return TILE_KINDS.filter((k) => (k !== 'bridge' || water) && (k !== 'jump' || jump));
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
  if (isInfinite(state.level)) return null; // без лимита плиток добавлять нечего
  let base: GameState | null = state;
  for (let rollback = 0; base; rollback++, base = base.prev) {
    if (base.status === 'won') continue;
    let best: { state: GameState; kinds: TileKind[]; score: number } | null = null;
    for (const kinds of combos(n, usefulKinds(state.level))) {
      const next = dealExtra({ ...base, status: 'playing' }, kinds);
      const b = bestFrom(next);
      if (b >= 0 && (!best || b > best.score)) best = { state: next, kinds, score: b };
    }
    if (best) return { state: { ...best.state, undosUsed: state.undosUsed }, kinds: best.kinds, rollback };
  }
  return null;
}

const EASE_POSITIONS = 6;

/** Сколько состояний уровня с этой колодой ведут к победе (-1 — не решается). */
function forgiveness(level: Level, deck: TileKind[]): { winnable: number; left: number } {
  const solver = new Solver(level, deck, { allowStash: level.allowStash, countRoads: false });
  const r = solver.explore(startNode(level, deck));
  return { winnable: r.best >= 0 ? solver.winnableStates : -1, left: r.best };
}

/**
 * Незаметное облегчение после серии поражений: добавляет в колоду `extra` плиток (по одной, жадно).
 * Вид и место выбираются так, чтобы уровень сильнее всего «прощал» ошибки: больше состояний, из которых
 * ещё можно выиграть. Лишняя плитка помогает сильнее всего в начале колоды — сначала перебираем первые позиции.
 * Число решений при этом не уменьшается.
 */
export function easeDeck(level: Level, extra: number, deck: TileKind[] = level.deck): TileKind[] {
  if (level.tileSet) return [...deck]; // бесконечную колоду облегчать не нужно
  let cur = [...deck];
  // Облегчение не должно отнимать решения: вставка плитки сдвигает колоду, и это иногда закрывает дороги.
  const roadsOf = (d: TileKind[]) => solveLevel(level, { deck: d, countRoads: true }).roads;
  for (let k = 0; k < extra; k++) {
    const minRoads = roadsOf(cur);
    let best: { deck: TileKind[]; winnable: number; left: number } | null = null;
    // Сначала — первые позиции (там лишняя плитка помогает сильнее), если ни одна не подходит — вся колода
    // (плитка в самом конце колоды решений точно не отнимает).
    for (const maxPos of [Math.min(cur.length, EASE_POSITIONS), cur.length]) {
      for (const kind of usefulKinds(level)) {
        for (let pos = 0; pos <= maxPos; pos++) {
          const cand = [...cur.slice(0, pos), kind, ...cur.slice(pos)];
          const f = forgiveness(level, cand);
          if (f.winnable < 0) continue;
          if (!best || f.winnable > best.winnable || (f.winnable === best.winnable && f.left > best.left)) {
            if (roadsOf(cand) < minRoads) continue;
            best = { deck: cand, ...f };
          }
        }
      }
      if (best) break;
    }
    // TS сужает best до never после break во вложенном цикле — подсказываем тип явно.
    const found = best as { deck: TileKind[] } | null;
    if (found) cur = found.deck;
  }
  return cur;
}

/** Шаг решения: какая плитка, откуда взята и какие клетки заняла. */
export interface SolutionStep {
  kind: TileKind;
  from: MoveFrom;
  cells: number[];
}

/**
 * Одно из лучших решений уровня от старта (для редактора «Показать решение»): больше всего плиток в запасе,
 * при равенстве — больше светлячков. Пустой список — уровень не решается.
 */
export function solutionOf(level: Level, deck: TileKind[] = level.deck): SolutionStep[] {
  if (level.tileSet && deck === level.deck) {
    // Бесконечная колода: жадно по геометрии — каждая плитка приближает к выходу.
    const kinds = level.tileSet;
    let head = level.start.y * level.width + level.start.x;
    let dir = level.startDir;
    let mask = 1n << BigInt(head);
    const out: SolutionStep[] = [];
    while (!goalReached(level, head, (i) => ((mask >> BigInt(i)) & 1n) === 1n)) {
      let best: { step: SolutionStep; rem: number; head: number; dir: Dir; mask: bigint } | null = null;
      for (const k of kinds) {
        const p = placeTile(level, (i) => ((mask >> BigInt(i)) & 1n) === 1n, head, dir, k);
        if (!p.ok) continue;
        let m = mask;
        for (const c of p.cells) m |= 1n << BigInt(c.idx);
        const h = p.cells[p.cells.length - 1].idx;
        const rem = geoMinTiles(level, kinds, h, p.newDir, m);
        if (rem >= 0 && (!best || rem < best.rem)) best = { step: { kind: k, from: 'tray', cells: p.cells.map((c) => c.idx) }, rem, head: h, dir: p.newDir, mask: m };
      }
      if (!best) return [];
      out.push(best.step);
      head = best.head;
      dir = best.dir;
      mask = best.mask;
    }
    return out;
  }
  const solver = new Solver(level, deck, { allowStash: level.allowStash, countRoads: false });
  return solver.solution(startNode(level, deck)).map((m) => ({ kind: m.kind, from: m.from, cells: m.cells }));
}
