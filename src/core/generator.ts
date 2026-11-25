// Генератор уровней: случайное поле (старт, выход, фонари, камни, вода, светлячки), колода из найденного пути
// плюс запас, затем фильтр по метрикам решателя. Чистая логика — используется в npm run gen и в тестах.

import { analyzeLevel, type DifficultyReport } from './difficulty';
import { starThresholds } from './game';
import { GeoTooBig, geoMinBounded } from './geo';
import { levelRows, parseLevel } from './level';
import { advanceTime, placeTile, timeStart } from './tiles';
import { solveLevel, TooManyStates } from './solver';
import { DX, DY, type CellType, type Dir, type GoalType, type Level, type LevelData, type TileKind } from './types';

/** Элементы уровня: клетки поля и плитка «прыжок». */
export type GenFeature = 'lantern' | 'rock' | 'water' | 'firefly' | 'jump' | 'turnbridge' | 'fade';
export const GEN_FEATURES: readonly GenFeature[] = ['lantern', 'rock', 'water', 'firefly', 'jump', 'turnbridge', 'fade'];

export interface GenParams {
  width: number;
  height: number;
  features: GenFeature[];
  /** Запас плиток сверх пути: от и до (по умолчанию 2–7). Больше запас — легче уровень. */
  reserve?: [number, number];
  /** Цель уровня (по умолчанию classic). */
  goal?: GoalType;
}

export interface Candidate {
  data: LevelData;
  /** Метрики решателя (рейтинг, решений, запас, доля тупиков). */
  metrics: NonNullable<LevelData['metrics']>;
  size: string;
  features: GenFeature[];
  /** Плиток в колоде. */
  deck: number;
}

export type Rand = () => number;

export function mulberry32(seed: number): Rand {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const int = (r: Rand, lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1));
const pick = <T>(r: Rand, xs: readonly T[]): T => xs[Math.floor(r() * xs.length)];

const LETTER: Record<Dir, LevelData['startDir']> = { 0: 'N', 1: 'E', 2: 'S', 3: 'W' };

/** Почему кандидат отброшен (для статистики генератора). */
export type Reject = 'layout' | 'unsolvable' | 'path' | 'oneRoad' | 'boring' | 'needsStash' | 'fireflies' | 'deck' | 'tooBig' | 'notEssential' | 'tooHard';

/** Сгенерированное поле. */
export interface GenGrid {
  cells: CellType[];
  start: number;
  dir: Dir;
  /** Арка (-1 у цели «светлячки»). */
  exit: number;
  /** Гаснущие фонари: сколько ходов горят (по клеткам). */
  fade: number[];
  /** Поворотные мосты: горизонтальные на старте (по клеткам). */
  bridgeH: boolean[];
}

/** Больше состояний решателя — уровень отбрасываем: подсказка и «+3 плитки» на телефоне считались бы долго. */
export const GEN_MAX_STATES = 60_000;

/** Случайное поле с нужными элементами. null — не получилось расставить. */
export function randomGrid(r: Rand, p: GenParams): GenGrid | null {
  const { width: w, height: h } = p;
  const cells: CellType[] = new Array(w * h).fill('empty');
  const at = (x: number, y: number) => y * w + x;
  // Старт у края поля, смотрит внутрь; чаще — снизу (как в обучении).
  const side = r() < 0.6 ? 2 : int(r, 0, 3);
  let sx: number;
  let sy: number;
  if (side === 0 || side === 2) {
    sx = int(r, 0, w - 1);
    sy = side === 0 ? 0 : h - 1;
  } else {
    sy = int(r, 1, h - 2);
    sx = side === 3 ? 0 : w - 1;
  }
  const dir = ((side + 2) % 4) as Dir; // от края внутрь
  const start = at(sx, sy);
  cells[start] = 'start';
  const fade: number[] = new Array(w * h).fill(0);
  const bridgeH: boolean[] = new Array(w * h).fill(false);
  const goal = p.goal ?? 'classic';
  // Выход — подальше от старта. У цели «светлячки» арки нет, но река всё равно делит поле «дальней» точкой.
  const far: number[] = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (Math.abs(x - sx) + Math.abs(y - sy) >= Math.floor((w + h) * 0.55)) far.push(at(x, y));
  if (!far.length) return null;
  let exit = pick(r, far);
  const farPoint = exit;
  if (goal === 'classic') cells[exit] = 'exit';
  else exit = -1;
  const free = () => cells.map((c, i) => (c === 'empty' ? i : -1)).filter((i) => i >= 0);
  // Клетка перед стартом остаётся свободной.
  const ahead = at(sx + DX[dir], sy + DY[dir]);
  const put = (type: CellType, n: number) => {
    for (let k = 0; k < n; k++) {
      const f = free().filter((i) => i !== ahead);
      if (!f.length) return false;
      cells[pick(r, f)] = type;
    }
    return true;
  };

  const river: number[] = [];
  const turnbridge = p.features.includes('turnbridge');
  if (p.features.includes('water') || turnbridge) {
    // Река поперёк поля между стартом и выходом, иногда с одной сухой клеткой-бродом (с поворотным мостом брода нет).
    const ey = Math.floor(farPoint / w);
    const horizontal = Math.abs(ey - sy) >= 2 || r() < 0.5;
    if (horizontal) {
      const lo = Math.min(sy, ey) + 1;
      const hi = Math.max(sy, ey) - 1;
      if (lo > hi) return null;
      const y = int(r, lo, hi);
      const gap = !turnbridge && r() < 0.35 ? int(r, 0, w - 1) : -1;
      for (let x = 0; x < w; x++) {
        if (x !== gap && cells[at(x, y)] === 'empty') {
          cells[at(x, y)] = 'water';
          river.push(at(x, y));
        }
      }
    } else {
      const ex = farPoint % w;
      const lo = Math.min(sx, ex) + 1;
      const hi = Math.max(sx, ex) - 1;
      if (lo > hi) return null;
      const x = int(r, lo, hi);
      for (let y = 0; y < h; y++) {
        if (cells[at(x, y)] === 'empty') {
          cells[at(x, y)] = 'water';
          river.push(at(x, y));
        }
      }
    }
  }
  if (turnbridge) {
    // 1–2 поворотных моста на реке, не у края поля.
    const spots = river.filter((i) => {
      const x = i % w;
      const y = Math.floor(i / w);
      return x > 0 && y > 0 && x < w - 1 && y < h - 1;
    });
    const n = Math.min(spots.length, int(r, 1, 2));
    if (!n) return null;
    for (let k = 0; k < n; k++) {
      const i = spots.splice(int(r, 0, spots.length - 1), 1)[0];
      cells[i] = 'turnbridge';
      bridgeH[i] = r() < 0.5;
    }
  }
  const area = w * h;
  if (p.features.includes('rock') && !put('rock', int(r, 2, Math.max(2, Math.round(area / 9))))) return null;
  if (goal === 'classic' && p.features.includes('lantern') && !put('lantern', int(r, 1, area >= 40 ? 3 : 2))) return null;
  if (goal === 'classic' && p.features.includes('fade')) {
    // Гаснущий фонарь: 1 (на больших полях иногда 2), горит 3–7 ходов.
    const n = area >= 40 && r() < 0.3 ? 2 : 1;
    // Ставим его недалеко от арки: до неё должно хватать ходов (иначе уровень заведомо не решается).
    const ex = exit % w;
    const ey = Math.floor(exit / w);
    for (let k = 0; k < n; k++) {
      const turns = int(r, 3, 7);
      const f = free().filter((i) => {
        const d = Math.abs((i % w) - ex) + Math.abs(Math.floor(i / w) - ey);
        return i !== ahead && d >= 2 && d <= turns + 1;
      });
      if (!f.length) return null;
      const i = pick(r, f);
      cells[i] = 'lantern';
      fade[i] = turns;
    }
  }
  if (goal === 'fireflies') {
    if (!put('firefly', int(r, 2, area >= 36 ? 4 : 3))) return null;
  } else if (p.features.includes('firefly') && !put('firefly', int(r, 1, 3))) return null;
  return { cells, start, dir, exit, fade, bridgeH };
}

export function gridRows(cells: readonly CellType[], width: number, fade?: number[], bridgeH?: boolean[]): string[] {
  return levelRows({ cells: [...cells], width, fade: fade ?? cells.map(() => 0), bridgeH: bridgeH ?? cells.map(() => false) });
}

/** Виды плиток для пути и запаса: мост — если есть вода (и нет поворотных мостов), прыжок — если он в элементах. */
export function kindsFor(features: readonly GenFeature[], cells: readonly CellType[]): TileKind[] {
  const out: TileKind[] = ['straight', 'straight2', 'left', 'right'];
  if (cells.includes('water') && !features.includes('turnbridge')) out.push('bridge');
  if (features.includes('jump')) out.push('jump');
  return out;
}

const isOn = (mask: bigint, i: number) => ((mask >> BigInt(i)) & 1n) === 1n;

/** Случайный путь к выходу через все фонари: плитки по порядку. Длина — не больше минимума + slack. */
export function randomPath(r: Rand, level: Level, slack: number, kinds: TileKind[] = kindsFor(level.cells.includes('water') ? ['water'] : [], level.cells)): TileKind[] | null {
  const startIdx = level.start.y * level.width + level.start.x;
  let head = startIdx;
  let dir = level.startDir;
  let mask = 1n << BigInt(startIdx);
  let ts = timeStart(level);
  // Минимальный путь ищем с растущим пределом длины: на больших полях полный перебор слишком долгий.
  const memo = new Map<string, number>();
  let min = -1;
  for (const b of [8, 12, 16, 20, 24]) {
    min = geoMinBounded(level, kinds, head, dir, mask, b, memo, ts);
    if (min >= 0) break;
  }
  if (min < 0) return null;
  const budget = min + slack;
  const seq: TileKind[] = [];
  const isDone = () => (level.goal === 'fireflies' ? level.fireflies.every((f) => isOn(mask, f)) : head === level.exit.y * level.width + level.exit.x);
  while (!isDone()) {
    const opts: { kind: TileKind; head: number; dir: Dir; mask: bigint; w: number; ts: typeof ts }[] = [];
    for (const k of kinds) {
      const pl = placeTile(level, (i) => isOn(mask, i), head, dir, k, ts);
      if (!pl.ok) continue;
      let m = mask;
      for (const c of pl.cells) m |= 1n << BigInt(c.idx);
      const h2 = pl.cells[pl.cells.length - 1].idx;
      const nts = advanceTime(level, ts, pl.cells);
      const rem = geoMinBounded(level, kinds, h2, pl.newDir, m, budget - seq.length - 1, memo, nts);
      if (rem < 0) continue;
      opts.push({ kind: k, head: h2, dir: pl.newDir, mask: m, w: k === 'straight2' ? 0.6 : k === 'jump' ? 1.4 : 1, ts: nts });
    }
    if (!opts.length) return null;
    let x = r() * opts.reduce((s, o) => s + o.w, 0);
    let o = opts[0];
    for (const c of opts) {
      x -= c.w;
      if (x <= 0) {
        o = c;
        break;
      }
    }
    seq.push(o.kind);
    head = o.head;
    dir = o.dir;
    mask = o.mask;
    ts = o.ts;
  }
  return seq;
}

/** Колода: плитки пути, немного перемешанные (каждая сдвигается на 1–2 места), и запас из подходящих лишних плиток. */
export function buildDeck(r: Rand, path: TileKind[], reserve: number, extraKinds: TileKind[]): TileKind[] {
  const deck = [...path];
  for (let k = 0; k < reserve; k++) {
    // Лишняя плитка — того же вида, что встречается на пути (выглядит полезной), или случайная.
    const kind = r() < 0.6 ? pick(r, path) : pick(r, extraKinds);
    deck.splice(int(r, 0, deck.length), 0, kind);
  }
  // Лёгкое перемешивание: несколько обменов соседей на расстоянии до 2.
  for (let k = 0; k < deck.length; k++) {
    const i = int(r, 0, deck.length - 1);
    const j = Math.min(deck.length - 1, Math.max(0, i + int(r, -2, 2)));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

export interface GenFilter {
  /** Меньше этой доли тупиковых ходов — уровень «скучный» (решается почти любыми ходами). */
  minTrap: number;
  /** Минимум разных решений (1 решение — отбрасываем). */
  minRoads: number;
  /** Максимальный рейтинг (уровни-знакомства и лёгкие). */
  maxRating?: number;
}

export const DEFAULT_FILTER: GenFilter = { minTrap: 0.12, minRoads: 2 };

/** Одна попытка: кандидат или причина, почему он отброшен. */
export function generateOne(r: Rand, p: GenParams, filter: GenFilter = DEFAULT_FILTER): Candidate | Reject {
  const g = randomGrid(r, p);
  if (!g) return 'layout';
  const rows = gridRows(g.cells, p.width, g.fade, g.bridgeH);
  const base: LevelData = { id: 'gen', name: 'gen', grid: rows, startDir: LETTER[g.dir], deck: ['straight'], stars: { two: 0, three: 0 } };
  if (p.goal && p.goal !== 'classic') base.goal = p.goal;
  const geo = parseLevel(base);
  const kinds = kindsFor(p.features, g.cells);
  let path: TileKind[] | null;
  try {
    path = randomPath(r, geo, int(r, 0, 2), kinds);
  } catch (e) {
    if (e instanceof GeoTooBig) return 'tooBig';
    throw e;
  }
  if (!path) return 'unsolvable';
  if (path.length < 5) return 'path';
  const [rlo, rhi] = p.reserve ?? [2, 7];
  const reserve = int(r, rlo, rhi);
  const deck = buildDeck(r, path, reserve, kinds);
  const data: LevelData = { ...base, deck };
  const level = parseLevel(data);
  // Сначала дешёвые проверки (решается ли вообще и нужны ли прыжок и поворотный мост) — до дорогой выборки тупиков.
  try {
    if (!solveLevel(level, { countRoads: false, maxStates: GEN_MAX_STATES }).solvable) return 'deck';
    if (!essential(level, p.features.filter((f) => f !== 'fade'), 0)) return 'notEssential';
  } catch (e) {
    if (e instanceof TooManyStates) return 'tooBig';
    throw e;
  }
  let rep: DifficultyReport;
  try {
    rep = analyzeLevel(level, level.deck, GEN_MAX_STATES);
  } catch (e) {
    if (e instanceof TooManyStates) return 'tooBig';
    throw e;
  }
  if (!rep.solvable) return 'deck';
  if (rep.roads < filter.minRoads) return 'oneRoad';
  if (!rep.solvableWithoutStash) return 'needsStash';
  if (rep.metrics.trap < filter.minTrap) return 'boring';
  if (filter.maxRating !== undefined && rep.metrics.rating > filter.maxRating) return 'tooHard';
  if (level.goal === 'classic' && level.fireflies.length && rep.maxFireflies < level.fireflies.length) return 'fireflies';
  try {
    if (p.features.includes('fade') && !essential(level, ['fade'], rep.roads)) return 'notEssential';
  } catch (e) {
    if (e instanceof TooManyStates) return 'tooBig';
    throw e;
  }
  data.stars = starThresholds(rep.maxLeftover);
  data.metrics = rep.metrics;
  return { data, metrics: rep.metrics, size: `${p.width}x${p.height}`, features: [...p.features], deck: deck.length };
}

/**
 * Новый элемент действительно нужен: без прыжков в колоде уровень не решается; без поворотных мостов
 * (на их месте камень) — тоже; гаснущий фонарь отнимает часть решений (с обычным фонарём их больше).
 */
export function essential(level: Level, features: readonly GenFeature[], roads: number): boolean {
  const data = (over: Partial<LevelData>) => parseLevel({ id: 'e', name: 'e', grid: levelRows(level), startDir: LETTER[level.startDir], deck: level.deck, stars: { two: 0, three: 0 }, goal: level.goal, ...over });
  if (features.includes('jump')) {
    const noJump = level.deck.filter((k) => k !== 'jump');
    if (solveLevel(data({ deck: noJump }), { countRoads: false, maxStates: GEN_MAX_STATES }).solvable) return false;
  }
  if (features.includes('turnbridge')) {
    const rows = levelRows(level).map((row) => row.replace(/[-|]/g, '#'));
    if (solveLevel(data({ grid: rows }), { countRoads: false, maxStates: GEN_MAX_STATES }).solvable) return false;
  }
  if (features.includes('fade')) {
    const rows = levelRows(level).map((row) => row.replace(/[2-9]/g, 'L'));
    if (solveLevel(data({ grid: rows }), { maxStates: GEN_MAX_STATES }).roads <= roads) return false;
  }
  return true;
}

/** Признаки уровня (что на поле и в колоде). */
export function featuresOf(level: Level): GenFeature[] {
  const out: GenFeature[] = [];
  if (level.lanterns.some((l) => level.fade[l] === 0)) out.push('lantern');
  if (level.cells.includes('rock')) out.push('rock');
  if (level.cells.includes('water')) out.push('water');
  if (level.fireflies.length) out.push('firefly');
  if ((level.tileSet ?? level.deck).includes('jump')) out.push('jump');
  if (level.turnBridges.length) out.push('turnbridge');
  if (level.fades.length) out.push('fade');
  return out;
}
