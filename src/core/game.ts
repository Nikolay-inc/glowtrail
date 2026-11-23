// Чистая логика игры: размещение плиток, лоток, отложенная плитка, отмена, победа и поражение.
// Состояние неизменяемое: каждое действие возвращает новое состояние.

import { geoCanMove, geoMinTiles } from './geo';
import { placeTile, type PlacedCell, type Placement } from './tiles';
import type { Dir, Level, TileKind } from './types';

export { placeTile, tileShape, type BlockReason, type PlacedCell, type Placement } from './tiles';

export const TRAY_SIZE = 3;

// ---------------------------------------------------------------------------
// Состояние партии

export interface RoadCell extends PlacedCell {
  /** Какая плитка лежит в клетке (start — клетка старта). */
  kind: TileKind | 'start';
  /** Направление, в котором дорога вошла в клетку. */
  dirIn: Dir;
  /** Направление, в котором дорога выходит из клетки. */
  dirOut: Dir;
}

export type Status = 'playing' | 'won' | 'lost';

export interface GameState {
  level: Level;
  /** Колода этой попытки (облегчение, «+3 плитки»). В бесконечном режиме — уже выданные плитки. */
  deck: TileKind[];
  road: RoadCell[];
  onRoad: boolean[];
  head: number;
  dir: Dir;
  deckIndex: number;
  tray: (TileKind | null)[];
  stash: TileKind | null;
  /** Состояние генератора случайных плиток (бесконечная колода). */
  rng: number;
  /** Сколько раз отменяли ход — от этого зависят звёзды на уровнях без лимита. */
  undosUsed: number;
  moves: number;
  status: Status;
  /** Состояние до последнего действия — для отмены и отката подсказкой. */
  prev: GameState | null;
}

export type Action =
  | { type: 'place'; slot: number } // плитка из лотка
  | { type: 'placeStash' } // плитка из слота «отложить»
  | { type: 'stash'; slot: number } // убрать плитку из лотка в пустой слот «отложить»
  | { type: 'swap'; slot: number }; // поменять отложенную плитку с плиткой лотка

export const isInfinite = (level: Level) => level.tileSet !== null;

// ---------------------------------------------------------------------------
// Бесконечная колода: случайные плитки из набора, но «честные» — если до выхода ещё можно дойти,
// в лотке всегда есть хотя бы одна плитка, которая к нему ведёт.

/** mulberry32: детерминированный генератор, состояние хранится в партии (отмена возвращает те же плитки). */
function nextRandom(seed: number): [number, number] {
  let t = (seed + 0x6d2b79f5) | 0;
  const next = t;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return [((t ^ (t >>> 14)) >>> 0) / 4294967296, next];
}

interface Board {
  level: Level;
  onRoad: boolean[];
  head: number;
  dir: Dir;
}

function maskOf(onRoad: boolean[]): bigint {
  let m = 0n;
  onRoad.forEach((v, i) => {
    if (v) m |= 1n << BigInt(i);
  });
  return m;
}

/** Плитка ведёт к выходу: её можно поставить, и после неё до выхода ещё можно дойти. */
export function tileLeadsToExit(b: Board, kind: TileKind): boolean {
  const kinds = b.level.tileSet ?? [];
  const p = placeTile(b.level, (i) => b.onRoad[i], b.head, b.dir, kind);
  if (!p.ok) return false;
  let m = maskOf(b.onRoad);
  for (const c of p.cells) m |= 1n << BigInt(c.idx);
  return geoMinTiles(b.level, kinds, p.cells[p.cells.length - 1].idx, p.newDir, m) >= 0;
}

/** Выдаёт плитку в слот лотка. others — остальные доступные плитки (лоток и отложенная). */
function dealInfinite(b: Board, others: (TileKind | null)[], rng: number, fair = true): [TileKind, number] {
  const kinds = b.level.tileSet!;
  let [r, seed] = nextRandom(rng);
  let kind = kinds[Math.floor(r * kinds.length)];
  if (!fair) return [kind, seed];
  const helpful = kinds.filter((k) => tileLeadsToExit(b, k));
  const anyHelpful = [...others, kind].some((k) => k !== null && helpful.includes(k));
  if (helpful.length > 0 && !anyHelpful) {
    [r, seed] = nextRandom(seed);
    kind = helpful[Math.floor(r * helpful.length)];
  }
  return [kind, seed];
}

// ---------------------------------------------------------------------------

export function createGame(level: Level, deck: TileKind[] = level.deck, seed = 1): GameState {
  const startIdx = level.start.y * level.width + level.start.x;
  const onRoad = new Array<boolean>(level.cells.length).fill(false);
  onRoad[startIdx] = true;
  const tray: (TileKind | null)[] = [];
  let rng = seed >>> 0;
  let dealt: TileKind[] = [...deck];
  if (isInfinite(level)) {
    dealt = [];
    const b: Board = { level, onRoad, head: startIdx, dir: level.startDir };
    for (let i = 0; i < TRAY_SIZE; i++) {
      // Честность проверяем на последней плитке: хотя бы одна из трёх должна вести к выходу.
      const [k, next] = dealInfinite(b, tray, rng, i === TRAY_SIZE - 1);
      tray.push(k);
      dealt.push(k);
      rng = next;
    }
  } else {
    for (let i = 0; i < TRAY_SIZE; i++) tray.push(deck[i] ?? null);
  }
  const state: GameState = {
    level,
    deck: dealt,
    road: [{ ...level.start, idx: startIdx, kind: 'start', dirIn: level.startDir, dirOut: level.startDir }],
    onRoad,
    head: startIdx,
    dir: level.startDir,
    deckIndex: Math.min(TRAY_SIZE, dealt.length),
    tray,
    stash: null,
    rng,
    undosUsed: 0,
    moves: 0,
    status: 'playing',
    prev: null,
  };
  return { ...state, status: computeStatus(state) };
}

export function previewTile(state: GameState, kind: TileKind): Placement {
  return placeTile(state.level, (i) => state.onRoad[i], state.head, state.dir, kind);
}

export function canPlace(state: GameState, kind: TileKind | null): boolean {
  return kind !== null && previewTile(state, kind).ok;
}

/** Плиток осталось всего: колода + лоток + отложенная (Infinity для бесконечной колоды). */
export function tilesLeft(state: GameState): number {
  return deckLeft(state) + state.tray.filter((t) => t !== null).length + (state.stash ? 1 : 0);
}

/** Сколько плиток ещё лежит в колоде (не в лотке). */
export function deckLeft(state: GameState): number {
  return isInfinite(state.level) ? Infinity : state.deck.length - state.deckIndex;
}

/** Следующие плитки колоды (для превью). В бесконечной колоде будущее неизвестно. */
export function upcoming(state: GameState, n: number): TileKind[] {
  return isInfinite(state.level) ? [] : state.deck.slice(state.deckIndex, state.deckIndex + n);
}

export function lanternsOnRoad(state: GameState): number {
  return state.level.lanterns.filter((l) => state.onRoad[l]).length;
}

/** Сколько светлячков собрала дорога (собирать не обязательно). */
export function firefliesOnRoad(state: GameState): number {
  return state.level.fireflies.filter((f) => state.onRoad[f]).length;
}

export function isExitOpen(state: GameState): boolean {
  return lanternsOnRoad(state) === state.level.lanterns.length;
}

/** Сколько клеток (по прямой сетке) от конца дороги до выхода. */
export function distanceToExit(state: GameState): number {
  const w = state.level.width;
  const hx = state.head % w;
  const hy = Math.floor(state.head / w);
  return Math.abs(hx - state.level.exit.x) + Math.abs(hy - state.level.exit.y);
}

/** Крайний левый занятый слот лотка (или -1). */
export function leftmostTile(state: GameState): number {
  return state.tray.findIndex((t) => t !== null);
}

/**
 * Есть ли хоть одно осмысленное действие. В бесконечной колоде поражение — только когда дорога
 * в тупике (не встаёт ни одна плитка из набора). Обмен с отложенной плиткой новых плиток не даёт.
 */
export function hasAnyMove(state: GameState): boolean {
  if (isInfinite(state.level)) {
    return geoCanMove(state.level, state.level.tileSet!, state.head, state.dir, maskOf(state.onRoad));
  }
  if (state.tray.some((t) => canPlace(state, t))) return true;
  if (canPlace(state, state.stash)) return true;
  // Отложить имеет смысл, только если из колоды придёт новая плитка.
  if (state.level.allowStash && state.stash === null && deckLeft(state) > 0 && state.tray.some((t) => t !== null)) return true;
  return false;
}

function computeStatus(state: GameState): Status {
  if (state.head === state.level.exit.y * state.level.width + state.level.exit.x) return 'won';
  return hasAnyMove(state) ? 'playing' : 'lost';
}

export function isLegal(state: GameState, action: Action): boolean {
  if (state.status !== 'playing') return false;
  switch (action.type) {
    case 'place':
      return canPlace(state, state.tray[action.slot] ?? null);
    case 'placeStash':
      return canPlace(state, state.stash);
    case 'stash':
      return state.level.allowStash && state.stash === null && (state.tray[action.slot] ?? null) !== null;
    case 'swap':
      return state.level.allowStash && state.stash !== null && action.slot >= 0 && action.slot < state.tray.length;
  }
}

/** Выполняет действие. Если оно незаконно — возвращает то же состояние. */
export function applyAction(state: GameState, action: Action): GameState {
  if (!isLegal(state, action)) return state;
  const tray = [...state.tray];
  let deck = state.deck;
  let deckIndex = state.deckIndex;
  let rng = state.rng;
  let stash = state.stash;
  let road = state.road;
  let onRoad = state.onRoad;
  let head = state.head;
  let dir = state.dir;
  let refillSlot = -1;

  if (action.type === 'stash') {
    stash = tray[action.slot]!;
    tray[action.slot] = null;
    refillSlot = action.slot;
  } else if (action.type === 'swap') {
    const kind = tray[action.slot];
    tray[action.slot] = stash;
    stash = kind;
  } else {
    let kind: TileKind;
    if (action.type === 'place') {
      kind = tray[action.slot]!;
      tray[action.slot] = null;
      refillSlot = action.slot;
    } else {
      kind = stash!;
      stash = null;
    }
    const p = previewTile(state, kind);
    onRoad = [...state.onRoad];
    road = [...state.road];
    p.cells.forEach((c, i) => {
      onRoad[c.idx] = true;
      const last = i === p.cells.length - 1;
      road.push({ ...c, kind, dirIn: state.dir, dirOut: last ? p.newDir : state.dir });
    });
    head = p.cells[p.cells.length - 1].idx;
    dir = p.newDir;
  }

  // Добор в освободившийся слот — уже с учётом новой дороги.
  if (refillSlot >= 0) {
    if (isInfinite(state.level)) {
      const others = [...tray.filter((_, i) => i !== refillSlot), stash];
      const [k, next] = dealInfinite({ level: state.level, onRoad, head, dir }, others, rng);
      tray[refillSlot] = k;
      deck = [...deck, k];
      deckIndex = deck.length;
      rng = next;
    } else {
      tray[refillSlot] = deckIndex < deck.length ? deck[deckIndex++] : null;
    }
  }

  const next: GameState = { ...state, tray, deck, deckIndex, rng, stash, road, onRoad, head, dir, moves: state.moves + 1, prev: state };
  return { ...next, status: computeStatus(next) };
}

/** Отмена без ограничений: можно отменять много ходов подряд, до самого старта. */
export function canUndo(state: GameState): boolean {
  return state.prev !== null && state.status !== 'won';
}

export function undo(state: GameState): GameState {
  if (!canUndo(state)) return state;
  return { ...state.prev!, undosUsed: state.undosUsed + 1 };
}

/**
 * «+3 плитки»: новые плитки сразу ложатся в лоток, а прежние плитки лотка
 * возвращаются наверх колоды. Всего плиток становится больше на kinds.length.
 */
export function dealExtra(state: GameState, kinds: TileKind[]): GameState {
  const old = state.tray.filter((t): t is TileKind => t !== null);
  const deck = [...state.deck.slice(0, state.deckIndex), ...old, ...state.deck.slice(state.deckIndex)];
  const tray: (TileKind | null)[] = [];
  let deckIndex = state.deckIndex;
  for (let i = 0; i < TRAY_SIZE; i++) tray.push(kinds[i] ?? (deckIndex < deck.length ? deck[deckIndex++] : null));
  // Если плиток больше, чем слотов, лишние идут наверх колоды.
  deck.splice(deckIndex, 0, ...kinds.slice(TRAY_SIZE));
  const next: GameState = { ...state, deck, tray, deckIndex, prev: state };
  return { ...next, status: computeStatus(next) };
}

/** Пороги звёзд по максимальному остатку плиток: 3 — не меньше (макс − 1), 2 — не меньше половины (вниз). */
export function starThresholds(maxLeftover: number): { two: number; three: number } {
  return { two: Math.floor(Math.max(0, maxLeftover) / 2), three: Math.max(0, maxLeftover - 1) };
}

/**
 * Звёзды за победу. Уровни с колодой — по оставшимся плиткам.
 * Уровни без лимита — по отменам: 0 — 3 звезды, 1–2 — 2, больше — 1.
 */
export function starsFor(state: GameState): number {
  if (state.status !== 'won') return 0;
  if (isInfinite(state.level)) return state.undosUsed === 0 ? 3 : state.undosUsed <= 2 ? 2 : 1;
  const left = tilesLeft(state);
  if (left >= state.level.stars.three) return 3;
  if (left >= state.level.stars.two) return 2;
  return 1;
}
