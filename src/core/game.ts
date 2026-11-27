// Чистая логика игры: размещение плиток, лоток, отложенная плитка, отмена, победа и поражение.
// Состояние неизменяемое: каждое действие возвращает новое состояние.

import { geoCanMove, geoMinTiles } from './geo';
import { advanceShadow, anyExpired, fadeLeft, goalReached, placeTile, shadowCaught, timeStart, type PlacedCell, type Placement, type ShadowState, type TimeState } from './tiles';
import type { Dir, Level, TileKind } from './types';

export { placeTile, tileShape, type BlockReason, type PlacedCell, type Placement, type TimeState, type ShadowState } from './tiles';

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
  /** Номер плитки, которая заняла клетку (0 — старт). По нему считаются часы уровня. */
  step: number;
  /** Грибное кольцо: дорога вошла (in) или вышла из парного (out). */
  portal?: 'in' | 'out';
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
  /** Второй слот «отложить» (после прокачки; иначе всегда null). */
  stash2: TileKind | null;
  /** Сколько слотов «отложить» (1 или 2 — прокачка). */
  stashSlots: number;
  /** Заряды «Поворота плитки» на этот уровень. */
  rotations: number;
  /** Заряды травницы на этот уровень (задерживают тень; сколько осталось — в timeOf(state).sh). */
  charms: number;
  /** Радиус обзора в тумане (1 + обсерватория). */
  sight: number;
  /** Состояние генератора случайных плиток (бесконечная колода). */
  rng: number;
  /** Сколько раз отменяли ход — от этого зависят звёзды на уровнях без лимита. */
  undosUsed: number;
  moves: number;
  status: Status;
  /** Состояние до последнего действия — для отмены и отката подсказкой. */
  prev: GameState | null;
}

export type StashIndex = 0 | 1;

export type Action =
  | { type: 'place'; slot: number } // плитка из лотка
  | { type: 'placeStash'; from?: StashIndex } // плитка из слота «отложить» (первого или второго)
  | { type: 'stash'; slot: number; to?: StashIndex } // убрать плитку из лотка в пустой слот «отложить» (по умолчанию — первый пустой)
  | { type: 'swap'; slot: number; with?: StashIndex } // поменять отложенную плитку с плиткой лотка
  | { type: 'rotate'; slot: number }; // «Поворот плитки»: повернуть плитку лотка на 90° (тратит заряд)

/** Способности игрока на уровень (прокачка). */
export interface GameOptions {
  /** Слотов «отложить»: 1 или 2. */
  stashSlots?: number;
  /** Зарядов «Поворота плитки». */
  rotations?: number;
  /** Травница: сколько раз за уровень задержать тень (0–3). */
  charms?: number;
  /** Обсерватория: на сколько клеток дальше видно в тумане (0–2). */
  fogBonus?: number;
}

/** Поворот на 90° по часовой стрелке: выход «прямо» → «направо» → (назад нельзя) → «налево» → «прямо». */
export function rotateKind(kind: TileKind): TileKind | null {
  if (kind === 'straight') return 'right';
  if (kind === 'right') return 'left';
  if (kind === 'left') return 'straight';
  return null; // «прямо x2», мост и прыжок не поворачиваются
}

export const stashAt = (s: GameState, i: StashIndex) => (i === 1 ? s.stash2 : s.stash);

/** Куда положить плитку: заданный слот (если он пуст и есть) или первый пустой; -1 — некуда. */
export function stashTarget(s: GameState, to?: StashIndex): number {
  const ok = (i: StashIndex) => (i === 0 || s.stashSlots >= 2) && stashAt(s, i) === null;
  if (to !== undefined) return ok(to) ? to : -1;
  return ok(0) ? 0 : ok(1) ? 1 : -1;
}

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

export function createGame(level: Level, deck: TileKind[] = level.deck, seed = 1, opts: GameOptions = {}): GameState {
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
    road: [{ ...level.start, idx: startIdx, kind: 'start', dirIn: level.startDir, dirOut: level.startDir, step: 0 }],
    onRoad,
    head: startIdx,
    dir: level.startDir,
    deckIndex: Math.min(TRAY_SIZE, dealt.length),
    tray,
    stash: null,
    stash2: null,
    stashSlots: level.allowStash ? Math.max(1, Math.min(2, opts.stashSlots ?? 1)) : 1,
    rotations: Math.max(0, opts.rotations ?? 0),
    charms: level.shadow ? Math.max(0, opts.charms ?? 0) : 0,
    sight: 1 + Math.max(0, opts.fogBonus ?? 0),
    rng,
    undosUsed: 0,
    moves: 0,
    status: 'playing',
    prev: null,
  };
  return { ...state, status: computeStatus(state) };
}

/** Сколько плиток поставлено на поле (часы уровня: поворотные мосты, гаснущие фонари). */
export function tilesPlaced(state: GameState): number {
  return state.road[state.road.length - 1].step;
}

/** Время уровня для правил: число поставленных плиток, когда зажглись гаснущие фонари и где тень. */
export function timeOf(state: GameState): TimeState {
  const t = tilesPlaced(state);
  const lit = state.level.fades.length ? state.level.fades.map((idx) => state.road.find((r) => r.idx === idx)?.step ?? -1) : [];
  const sh = shadowOf(state);
  return sh ? { t, lit, sh } : { t, lit };
}

/** Тень по дороге: проигрываем ходы по порядку (дорога знает, какой плиткой занята каждая клетка). */
export function shadowOf(state: GameState): ShadowState | undefined {
  const level = state.level;
  let sh = timeStart(level, state.charms).sh;
  if (!sh) return undefined;
  const road = state.road;
  let i = 1;
  for (let step = 1; i < road.length; step++) {
    const cells: { idx: number }[] = [];
    while (i < road.length && road[i].step === step) cells.push(road[i++]);
    sh = advanceShadow(level, sh, step, cells);
  }
  return sh;
}

/** Почему партия проиграна: тень догнала, гаснущий фонарь погас или ходов нет. */
export function lossReason(state: GameState): 'shadow' | 'fade' | 'stuck' | null {
  if (state.status !== 'lost') return null;
  const ts = timeOf(state);
  if (shadowCaught(ts)) return 'shadow';
  if (state.level.fades.length && anyExpired(state.level, ts)) return 'fade';
  return 'stuck';
}

/** Сколько ходов ещё горит гаснущий фонарь в клетке idx: -1 — не зажжён, 0 — погас. */
export function fadeLeftAt(state: GameState, idx: number): number {
  const k = state.level.fades.indexOf(idx);
  return k < 0 ? -1 : fadeLeft(state.level, timeOf(state), k);
}

export function previewTile(state: GameState, kind: TileKind): Placement {
  return placeTile(state.level, (i) => state.onRoad[i], state.head, state.dir, kind, timeOf(state));
}

export function canPlace(state: GameState, kind: TileKind | null): boolean {
  return kind !== null && previewTile(state, kind).ok;
}

/** Плиток осталось всего: колода + лоток + отложенная (Infinity для бесконечной колоды). */
export function tilesLeft(state: GameState): number {
  return deckLeft(state) + state.tray.filter((t) => t !== null).length + (state.stash ? 1 : 0) + (state.stash2 ? 1 : 0);
}

/** Сколько плиток ещё лежит в колоде (не в лотке). */
export function deckLeft(state: GameState): number {
  return isInfinite(state.level) ? Infinity : state.deck.length - state.deckIndex;
}

/** Следующие плитки колоды (для превью). В бесконечной колоде будущее неизвестно. */
export function upcoming(state: GameState, n: number): TileKind[] {
  return isInfinite(state.level) ? [] : state.deck.slice(state.deckIndex, state.deckIndex + n);
}

/** Сколько фонарей сейчас горит (гаснущий фонарь, который погас, не считается). */
export function lanternsOnRoad(state: GameState): number {
  const level = state.level;
  // После победы все фонари на дороге считаются горящими (в арку вошли, пока они горели).
  if (!level.fades.length || state.status === 'won') return level.lanterns.filter((l) => state.onRoad[l]).length;
  const ts = timeOf(state);
  return level.lanterns.filter((l) => state.onRoad[l] && (level.fade[l] === 0 || fadeLeft(level, ts, level.fades.indexOf(l)) > 0)).length;
}

/** Сколько светлячков собрала дорога (собирать не обязательно). */
export function firefliesOnRoad(state: GameState): number {
  return state.level.fireflies.filter((f) => state.onRoad[f]).length;
}

export function isExitOpen(state: GameState): boolean {
  return state.level.goal === 'escape' || lanternsOnRoad(state) === state.level.lanterns.length;
}

/** Сколько клеток (по прямой сетке) от конца дороги до выхода (цель «светлячки» — до ближайшего несобранного). */
export function distanceToExit(state: GameState): number {
  const w = state.level.width;
  const hx = state.head % w;
  const hy = Math.floor(state.head / w);
  if (state.level.goal === 'fireflies') {
    let best = Infinity;
    for (const f of state.level.fireflies) {
      if (!state.onRoad[f]) best = Math.min(best, Math.abs(hx - (f % w)) + Math.abs(hy - Math.floor(f / w)));
    }
    return best === Infinity ? 0 : best;
  }
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
  if (canPlace(state, state.stash) || canPlace(state, state.stash2)) return true;
  // Отложить имеет смысл, только если из колоды придёт новая плитка.
  if (state.level.allowStash && stashTarget(state) >= 0 && deckLeft(state) > 0 && state.tray.some((t) => t !== null)) return true;
  // Поворот плитки: есть заряд и повёрнутая плитка встанет.
  if (state.rotations > 0) {
    for (const t of state.tray) {
      let k = t ? rotateKind(t) : null;
      for (let i = 0; i < 2 && k; i++, k = rotateKind(k)) if (canPlace(state, k)) return true;
    }
  }
  return false;
}

function computeStatus(state: GameState): Status {
  if (goalReached(state.level, state.head, (i) => state.onRoad[i])) return 'won';
  // Гаснущий фонарь погас до прихода в арку — снова не зажжён, а пройти через него ещё раз нельзя.
  if (state.level.fades.length && anyExpired(state.level, timeOf(state))) return 'lost';
  // Тень догнала конец дороги.
  if (state.level.shadow && shadowCaught(timeOf(state))) return 'lost';
  return hasAnyMove(state) ? 'playing' : 'lost';
}

/** Какой гаснущий фонарь погас (индекс клетки) или -1. После победы фонари не гаснут. */
export function expiredLantern(state: GameState): number {
  if (state.level.goal !== 'classic' || state.status === 'won') return -1;
  const ts = timeOf(state);
  const k = state.level.fades.findIndex((_, i) => fadeLeft(state.level, ts, i) === 0);
  return k < 0 ? -1 : state.level.fades[k];
}

export function isLegal(state: GameState, action: Action): boolean {
  if (state.status !== 'playing') return false;
  switch (action.type) {
    case 'place':
      return canPlace(state, state.tray[action.slot] ?? null);
    case 'placeStash':
      return canPlace(state, stashAt(state, action.from ?? 0));
    case 'stash':
      return state.level.allowStash && stashTarget(state, action.to) >= 0 && (state.tray[action.slot] ?? null) !== null;
    case 'swap':
      return state.level.allowStash && stashAt(state, action.with ?? 0) !== null && action.slot >= 0 && action.slot < state.tray.length;
    case 'rotate': {
      const k = state.tray[action.slot] ?? null;
      return state.rotations > 0 && k !== null && rotateKind(k) !== null;
    }
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
  let stash2 = state.stash2;
  let rotations = state.rotations;
  let road = state.road;
  let onRoad = state.onRoad;
  let head = state.head;
  let dir = state.dir;
  let refillSlot = -1;

  if (action.type === 'rotate') {
    tray[action.slot] = rotateKind(tray[action.slot]!);
    rotations--;
  } else if (action.type === 'stash') {
    if (stashTarget(state, action.to) === 1) stash2 = tray[action.slot]!;
    else stash = tray[action.slot]!;
    tray[action.slot] = null;
    refillSlot = action.slot;
  } else if (action.type === 'swap') {
    const kind = tray[action.slot];
    if ((action.with ?? 0) === 1) {
      tray[action.slot] = stash2;
      stash2 = kind;
    } else {
      tray[action.slot] = stash;
      stash = kind;
    }
  } else {
    let kind: TileKind;
    if (action.type === 'place') {
      kind = tray[action.slot]!;
      tray[action.slot] = null;
      refillSlot = action.slot;
    } else if ((action.from ?? 0) === 1) {
      kind = stash2!;
      stash2 = null;
    } else {
      kind = stash!;
      stash = null;
    }
    const p = previewTile(state, kind);
    const step = tilesPlaced(state) + 1;
    onRoad = [...state.onRoad];
    road = [...state.road];
    p.cells.forEach((c, i) => {
      onRoad[c.idx] = true;
      const last = i === p.cells.length - 1;
      road.push({ ...c, kind, dirIn: state.dir, dirOut: last ? p.newDir : state.dir, step });
    });
    head = p.cells[p.cells.length - 1].idx;
    dir = p.newDir;
  }

  // Добор в освободившийся слот — уже с учётом новой дороги.
  if (refillSlot >= 0) {
    if (isInfinite(state.level)) {
      const others = [...tray.filter((_, i) => i !== refillSlot), stash, stash2];
      const [k, next] = dealInfinite({ level: state.level, onRoad, head, dir }, others, rng);
      tray[refillSlot] = k;
      deck = [...deck, k];
      deckIndex = deck.length;
      rng = next;
    } else {
      tray[refillSlot] = deckIndex < deck.length ? deck[deckIndex++] : null;
    }
  }

  const next: GameState = { ...state, tray, deck, deckIndex, rng, stash, stash2, rotations, road, onRoad, head, dir, moves: state.moves + 1, prev: state };
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
