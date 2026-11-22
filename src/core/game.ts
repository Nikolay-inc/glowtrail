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
  /** Колода этой попытки (может отличаться от колоды уровня: облегчение, «+3 плитки»). */
  deck: TileKind[];
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
  /** Состояние до последнего действия — для кнопки «отменить» и отката подсказкой. */
  prev: GameState | null;
}

export type Action =
  | { type: 'place'; slot: number } // плитка из лотка
  | { type: 'placeStash' } // плитка из слота «отложить»
  | { type: 'stash'; slot: number } // убрать плитку из лотка в пустой слот «отложить»
  | { type: 'swap'; slot: number }; // поменять отложенную плитку с плиткой лотка

export function createGame(level: Level, deck: TileKind[] = level.deck): GameState {
  const startIdx = level.start.y * level.width + level.start.x;
  const onRoad = new Array<boolean>(level.cells.length).fill(false);
  onRoad[startIdx] = true;
  const tray: (TileKind | null)[] = [];
  for (let i = 0; i < TRAY_SIZE; i++) tray.push(deck[i] ?? null);
  const state: GameState = {
    level,
    deck: [...deck],
    road: [{ ...level.start, idx: startIdx, kind: 'start', dirIn: level.startDir, dirOut: level.startDir }],
    onRoad,
    head: startIdx,
    dir: level.startDir,
    deckIndex: Math.min(TRAY_SIZE, deck.length),
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
  return deckLeft(state) + state.tray.filter((t) => t !== null).length + (state.stash ? 1 : 0);
}

/** Сколько плиток ещё лежит в колоде (не в лотке). */
export function deckLeft(state: GameState): number {
  return state.deck.length - state.deckIndex;
}

/** Следующие плитки колоды (для превью). */
export function upcoming(state: GameState, n: number): TileKind[] {
  return state.deck.slice(state.deckIndex, state.deckIndex + n);
}

export function lanternsOnRoad(state: GameState): number {
  return state.level.lanterns.filter((l) => state.onRoad[l]).length;
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

/** Есть ли хоть одно осмысленное действие. Обмен с отложенной плиткой новых плиток не даёт и не считается. */
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
    case 'swap':
      return state.stash !== null && action.slot >= 0 && action.slot < state.tray.length;
  }
}

/** Выполняет действие. Если оно незаконно — возвращает то же состояние. */
export function applyAction(state: GameState, action: Action): GameState {
  if (!isLegal(state, action)) return state;
  const tray = [...state.tray];
  let deckIndex = state.deckIndex;
  const refill = (slot: number) => {
    tray[slot] = deckIndex < state.deck.length ? state.deck[deckIndex++] : null;
  };
  const finish = (patch: Partial<GameState>): GameState => {
    const next: GameState = { ...state, tray, deckIndex, moves: state.moves + 1, prev: state, ...patch };
    return { ...next, status: computeStatus(next) };
  };

  if (action.type === 'stash') {
    const kind = tray[action.slot]!;
    refill(action.slot);
    return finish({ stash: kind });
  }
  if (action.type === 'swap') {
    const kind = tray[action.slot];
    tray[action.slot] = state.stash;
    return finish({ stash: kind });
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
  p.cells.forEach((c, i) => {
    onRoad[c.idx] = true;
    const last = i === p.cells.length - 1;
    road.push({ ...c, kind, dirIn: state.dir, dirOut: last ? p.newDir : state.dir });
  });

  return finish({ road, onRoad, head: p.cells[p.cells.length - 1].idx, dir: p.newDir, stash });
}

export function canUndo(state: GameState): boolean {
  return state.undoLeft > 0 && state.prev !== null && state.status !== 'won';
}

export function undo(state: GameState): GameState {
  if (!canUndo(state)) return state;
  return { ...state.prev!, undoLeft: state.undoLeft - 1 };
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
  const rest = kinds.slice(TRAY_SIZE);
  deck.splice(deckIndex, 0, ...rest);
  const next: GameState = { ...state, deck, tray, deckIndex, prev: state };
  return { ...next, status: computeStatus(next) };
}

/** Пороги звёзд по максимальному остатку плиток: 3 — не меньше (макс − 1), 2 — не меньше половины (вниз). */
export function starThresholds(maxLeftover: number): { two: number; three: number } {
  return { two: Math.floor(Math.max(0, maxLeftover) / 2), three: Math.max(0, maxLeftover - 1) };
}

/** Звёзды за победу: зависят от того, сколько плиток осталось неиспользованными. */
export function starsFor(state: GameState): number {
  if (state.status !== 'won') return 0;
  const left = tilesLeft(state);
  if (left >= state.level.stars.three) return 3;
  if (left >= state.level.stars.two) return 2;
  return 1;
}
