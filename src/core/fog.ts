// Туман: клетки поля скрыты, кроме тех, что рядом с дорогой (радиус обзора) и с зажжёнными фонарями
// (на клетку дальше). Арка, фонари, грибные кольца и старт светятся сквозь туман — цель всегда видна.
// Здесь же — проверка, что уровень с туманом не требует угадывания (fogFair).

import { parseLevel, levelRows } from './level';
import { Solver, startNode, type Move, type MoveFrom, type Node } from './solver';
import { fadeLeft, type TimeState } from './tiles';
import type { CellType, Level, LevelData, TileKind } from './types';

/** Что видно сквозь туман: светящиеся клетки. */
export const GLOWS_THROUGH_FOG: readonly CellType[] = ['exit', 'lantern', 'ring', 'start'];

/** Базовый радиус обзора в тумане (клеток вокруг дороги, по квадрату 3×3). Обсерватория добавляет 1–2. */
export const FOG_SIGHT = 1;

/** Фонарь в клетке idx горит (на дороге и, если гаснущий, ещё не погас). */
function lanternLit(level: Level, isOnRoad: (i: number) => boolean, time: TimeState | null, idx: number): boolean {
  if (level.cells[idx] !== 'lantern' || !isOnRoad(idx)) return false;
  if (level.fade[idx] === 0 || !time) return true;
  return fadeLeft(level, time, level.fades.indexOf(idx)) !== 0;
}

/**
 * Какие клетки видны сейчас: в радиусе sight (по квадрату) от каждой клетки дороги, в радиусе sight + 1
 * от зажжённых фонарей, плюс светящиеся сквозь туман. Без тумана видно всё.
 */
export function fogVisible(level: Level, isOnRoad: (i: number) => boolean, time: TimeState | null, sight = FOG_SIGHT): boolean[] {
  const n = level.cells.length;
  if (!level.fog) return new Array<boolean>(n).fill(true);
  const vis = level.cells.map((c) => GLOWS_THROUGH_FOG.includes(c));
  const open = (cx: number, cy: number, r: number) => {
    for (let y = Math.max(0, cy - r); y <= Math.min(level.height - 1, cy + r); y++) {
      for (let x = Math.max(0, cx - r); x <= Math.min(level.width - 1, cx + r); x++) vis[y * level.width + x] = true;
    }
  };
  for (let i = 0; i < n; i++) {
    if (!isOnRoad(i)) continue;
    const x = i % level.width;
    const y = Math.floor(i / level.width);
    open(x, y, lanternLit(level, isOnRoad, time, i) ? sight + 1 : sight);
  }
  return vis;
}

const onMask = (mask: bigint) => (i: number) => ((mask >> BigInt(i)) & 1n) === 1n;

/** Видимые клетки для состояния решателя. */
export function nodeVisible(level: Level, n: Node, sight = FOG_SIGHT): boolean[] {
  return fogVisible(level, onMask(n.mask), n.time, sight);
}

/** Уровень «как его видит игрок»: всё скрытое туманом считается пустой травой (оптимистичный план). */
function optimisticLevel(level: Level, vis: boolean[]): Level {
  const rows = levelRows(level).map((row, y) => [...row].map((ch, x) => (vis[y * level.width + x] ? ch : '.')).join(''));
  const data: LevelData = {
    id: level.id,
    name: level.name,
    grid: rows,
    startDir: (['N', 'E', 'S', 'W'] as const)[level.startDir],
    goal: level.goal,
    deck: level.deck.length ? level.deck : ['straight'],
    stars: { two: 0, three: 0 },
    allowStash: level.allowStash,
    shadow: level.shadow || undefined,
  };
  return parseLevel(data, level.num);
}

export interface FogReport {
  /** Решение находится без угадывания. */
  ok: boolean;
  /** Сколько ходов сделал «осторожный игрок». */
  steps: number;
  /** На каком ходу план развалился (если не ok). */
  stuckAt?: number;
}

const PREF: Record<MoveFrom, number> = { tray: 3, toStash: 2, stash: 1, stash2: 1, swap: 0, swap2: 0 };

/**
 * Проверка «без угадывания»: осторожный игрок видит только раскрытые клетки, скрытое считает пустой травой,
 * ставит плитки только на видимые клетки и после каждого хода строит план заново (решателем) по тому,
 * что открылось. Уровень честный, если такой игрок доходит до цели с этой колодой.
 */
export function fogFair(level: Level, deck: TileKind[] = level.deck, sight = FOG_SIGHT): FogReport {
  if (!level.fog) return { ok: true, steps: 0 };
  const opts = { allowStash: level.allowStash, countRoads: false };
  const real = new Solver(level, deck, opts);
  let node = startNode(level, deck);
  for (let step = 0; step < 200; step++) {
    if (real.isGoal(node)) return { ok: true, steps: step };
    const vis = nodeVisible(level, node, sight);
    const plan = new Solver(optimisticLevel(level, vis), deck, opts);
    let best: { m: Move; score: number } | null = null;
    for (const m of real.moves(node)) {
      if (!m.cells.every((c) => vis[c])) continue; // в туман вслепую не ставим
      const r = plan.explore(m.next);
      if (r.best < 0) continue;
      const score = r.best * 10 + PREF[m.from];
      if (!best || score > best.score) best = { m, score };
    }
    if (!best) return { ok: false, steps: step, stuckAt: step + 1 };
    node = best.m.next;
  }
  return { ok: false, steps: 200, stuckAt: 200 };
}
