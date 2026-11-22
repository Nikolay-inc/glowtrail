// Как плитка ложится на поле. Общая часть для правил игры и решателей.

import { DX, DY, turnLeft, turnRight, type Dir, type Level, type Point, type TileKind } from './types';

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
