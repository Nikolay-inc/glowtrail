// Чистая логика игры: размещение плиток, лоток, отложенная плитка, отмена, победа и поражение.
// Состояние неизменяемое: каждое действие возвращает новое состояние.

import { DX, DY, turnLeft, turnRight, type Dir, type Level, type Point, type TileKind } from './types';

export const TRAY_SIZE = 3;
export const UNDO_PER_LEVEL = 1;

export type BlockReason = 'edge' | 'rock' | 'water' | 'road' | 'exitClosed' | 'exitPassThrough' | 'bridgeNeedsWater';

export interface PlacedCell extends Point {
  idx: number;
}

/** Куда ляжет плитка и можно ли её поставить. */
export interface Placement {
  ok: boolean;
  kind: TileKind;
  /** Клетки, которые займёт плитка (при ошибке — те, что успели пройти до препятствия). */
  cells: PlacedCell[];
  /** Направление дороги после плитки. */
  newDir: Dir;
  /** Клетка, в которую упёрлась плитка, если её нельзя поставить. */
  blocked?: Point;
  reason?: BlockReason;
}

/** Сколько клеток вперёд занимает плитка и как она меняет направление. */
export function tileShape(kind: TileKind, dir: Dir): { steps: number; newDir: Dir } {
  switch (kind) {
    case 'straight':
    case 'bridge':
      return { steps: 1, newDir: dir };
    case 'straight2':
      return { steps: 2, newDir: dir };
    case 'left':
      return { steps: 1, newDir: turnLeft(dir) };
    case 'right':
      return { steps: 1, newDir: turnRight(dir) };
  }
}

/**
 * Проверяет плитку относительно конца дороги. Общая функция для игры и решателя.
 * Плитка всегда идёт на шаг (или два) вперёд от конца дороги; поворот занимает клетку впереди
 * и разворачивает дорогу налево или направо.
 */
export function placeTile(
  level: Level,
  isOnRoad: (idx: number) => boolean,
  head: number,
  dir: Dir,
  kind: TileKind,
): Placement {
  const { steps, newDir } = tileShape(kind, dir);
  const cells: PlacedCell[] = [];
  let x = head % level.width;
  let y = Math.floor(head / level.width);
  // Сколько фонарей ещё не на дороге — выход открывается, только когда все пройдены.
  let lanternsLeft = 0;
  for (const l of level.lanterns) if (!isOnRoad(l)) lanternsLeft++;

  const fail = (reason: BlockReason): Placement => ({
    ok: false,
    kind,
    cells,
    newDir,
    blocked: { x, y },
    reason,
  });

  for (let s = 0; s < steps; s++) {
    x += DX[dir];
    y += DY[dir];
    if (x < 0 || y < 0 || x >= level.width || y >= level.height) return fail('edge');
    const idx = y * level.width + x;
    const type = level.cells[idx];
    if (isOnRoad(idx)) return fail('road');
    if (type === 'rock') return fail('rock');
    if (kind === 'bridge' && type !== 'water') return fail('bridgeNeedsWater');
    if (type === 'water' && kind !== 'bridge') return fail('water');
    if (type === 'exit') {
      if (s !== steps - 1) return fail('exitPassThrough');
      if (lanternsLeft > 0) return fail('exitClosed');
    }
    if (type === 'lantern') lanternsLeft--;
    cells.push({ x, y, idx });
  }
  return { ok: true, kind, cells, newDir };
}

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
  road: RoadCell[];
  onRoad: boolean[];
  head: number;
  dir: Dir;
  deckIndex: number;
  tray: (TileKind | null)[];
  stash: TileKind | null;
  undoLeft: number;
  moves: number;
  status: Status;
  /** Состояние до последнего действия — для кнопки «отменить». */
  prev: GameState | null;
}

export type Action =
  | { type: 'place'; slot: number } // плитка из лотка
  | { type: 'placeStash' } // плитка из слота «отложить»
  | { type: 'stash'; slot: number }; // убрать плитку из лотка в слот «отложить»

export function createGame(level: Level): GameState {
  const startIdx = level.start.y * level.width + level.start.x;
  const onRoad = new Array<boolean>(level.cells.length).fill(false);
  onRoad[startIdx] = true;
  const tray: (TileKind | null)[] = [];
  for (let i = 0; i < TRAY_SIZE; i++) tray.push(level.deck[i] ?? null);
  const state: GameState = {
    level,
    road: [{ ...level.start, idx: startIdx, kind: 'start', dirIn: level.startDir, dirOut: level.startDir }],
    onRoad,
    head: startIdx,
    dir: level.startDir,
    deckIndex: Math.min(TRAY_SIZE, level.deck.length),
    tray,
    stash: null,
    undoLeft: UNDO_PER_LEVEL,
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

/** Плиток осталось всего: колода + лоток + отложенная. */
export function tilesLeft(state: GameState): number {
  return state.level.deck.length - state.deckIndex + state.tray.filter((t) => t !== null).length + (state.stash ? 1 : 0);
}

/** Сколько плиток ещё лежит в колоде (не в лотке). */
export function deckLeft(state: GameState): number {
  return state.level.deck.length - state.deckIndex;
}

export function lanternsOnRoad(state: GameState): number {
  return state.level.lanterns.filter((l) => state.onRoad[l]).length;
}

export function isExitOpen(state: GameState): boolean {
  return lanternsOnRoad(state) === state.level.lanterns.length;
}

/** Есть ли хоть одно осмысленное действие. */
export function hasAnyMove(state: GameState): boolean {
  if (state.tray.some((t) => canPlace(state, t))) return true;
  if (canPlace(state, state.stash)) return true;
  // Отложить имеет смысл, только если из колоды придёт новая плитка.
  if (state.stash === null && deckLeft(state) > 0 && state.tray.some((t) => t !== null)) return true;
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
      return state.stash === null && (state.tray[action.slot] ?? null) !== null;
  }
}

/** Выполняет действие. Если оно незаконно — возвращает то же состояние. */
export function applyAction(state: GameState, action: Action): GameState {
  if (!isLegal(state, action)) return state;
  const tray = [...state.tray];
  let deckIndex = state.deckIndex;
  const refill = (slot: number) => {
    tray[slot] = deckIndex < state.level.deck.length ? state.level.deck[deckIndex++] : null;
  };

  if (action.type === 'stash') {
    const kind = tray[action.slot]!;
    refill(action.slot);
    const next: GameState = { ...state, tray, deckIndex, stash: kind, moves: state.moves + 1, prev: state };
    return { ...next, status: computeStatus(next) };
  }

  let kind: TileKind;
  let stash = state.stash;
  if (action.type === 'place') {
    kind = tray[action.slot]!;
    refill(action.slot);
  } else {
    kind = stash!;
    stash = null;
  }

  const p = previewTile(state, kind);
  const onRoad = [...state.onRoad];
  const road = [...state.road];
  let dirIn = state.dir;
  p.cells.forEach((c, i) => {
    onRoad[c.idx] = true;
    const last = i === p.cells.length - 1;
    road.push({ ...c, kind, dirIn, dirOut: last ? p.newDir : state.dir });
    dirIn = state.dir;
  });

  const next: GameState = {
    ...state,
    road,
    onRoad,
    head: p.cells[p.cells.length - 1].idx,
    dir: p.newDir,
    tray,
    deckIndex,
    stash,
    moves: state.moves + 1,
    prev: state,
  };
  return { ...next, status: computeStatus(next) };
}

export function canUndo(state: GameState): boolean {
  return state.undoLeft > 0 && state.prev !== null && state.status !== 'won';
}

export function undo(state: GameState): GameState {
  if (!canUndo(state)) return state;
  return { ...state.prev!, undoLeft: state.undoLeft - 1 };
}

/** Звёзды за победу: зависят от того, сколько плиток осталось неиспользованными. */
export function starsFor(state: GameState): number {
  if (state.status !== 'won') return 0;
  const left = tilesLeft(state);
  if (left >= state.level.stars.three) return 3;
  if (left >= state.level.stars.two) return 2;
  return 1;
}
