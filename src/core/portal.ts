// Арка-портал (выход): с каких сторон в неё можно войти, где сейчас конец дороги, сколько фонарей ещё не зажжено.

import { lanternsOnRoad, type GameState } from './game';
import { DX, DY, type Dir, type Level } from './types';

export interface PortalSide {
  dir: Dir; // сторона арки: 0 — сверху, 1 — справа, 2 — снизу, 3 — слева
  open: boolean; // с этой стороны можно подойти (нет края поля и камня)
}

/** Четыре стороны арки и можно ли войти с каждой. Вода проходима мостом, поэтому считается открытой. */
export function portalSides(level: Level): PortalSide[] {
  return ([0, 1, 2, 3] as Dir[]).map((dir) => {
    const x = level.exit.x + DX[dir];
    const y = level.exit.y + DY[dir];
    const inside = x >= 0 && y >= 0 && x < level.width && y < level.height;
    const open = inside && level.cells[y * level.width + x] !== 'rock';
    return { dir, open };
  });
}

/** С какой стороны арки сейчас конец дороги (если он на соседней клетке), иначе null. */
export function headSide(state: GameState): Dir | null {
  const w = state.level.width;
  const hx = state.head % w;
  const hy = Math.floor(state.head / w);
  for (const dir of [0, 1, 2, 3] as Dir[]) {
    if (state.level.exit.x + DX[dir] === hx && state.level.exit.y + DY[dir] === hy) return dir;
  }
  return null;
}

/** Сколько фонарей ещё не горит — это число на замке арки. */
export function lanternsLeft(state: GameState): number {
  if (state.level.goal === 'escape') return 0; // «Побег»: арка открыта сразу
  return state.level.lanterns.length - lanternsOnRoad(state);
}
