// Как плитка ложится на поле. Общая часть для правил игры и решателей.
// Здесь же — «часы» уровня: поворотные мосты и гаснущие фонари зависят от числа поставленных плиток.

import { DX, DY, turnLeft, turnRight, type Dir, type Level, type Point, type TileKind } from './types';

export type BlockReason =
  | 'edge'
  | 'rock'
  | 'water'
  | 'road'
  | 'exitClosed'
  | 'exitPassThrough'
  | 'bridgeNeedsWater'
  /** Поворотный мост стоит поперёк дороги (или на мосту нельзя повернуть). */
  | 'bridgeTurned';

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
  /** Клетка, через которую перепрыгнула плитка «прыжок» (на дорогу она не попадает). */
  jumped?: PlacedCell;
  /** Клетка, в которую упёрлась плитка, если её нельзя поставить. */
  blocked?: Point;
  reason?: BlockReason;
}

// ---------------------------------------------------------------------------
// Часы уровня

/**
 * Время уровня: t — сколько плиток уже поставлено; lit — для каждого гаснущего фонаря (порядок level.fades)
 * номер плитки, после которой он зажёгся (-1 — ещё не зажжён).
 */
export interface TimeState {
  t: number;
  lit: readonly number[];
}

export const timeStart = (level: Level): TimeState => ({ t: 0, lit: level.fades.map(() => -1) });

/** Сколько ходов ещё горит гаснущий фонарь (номер в level.fades); -1 — не зажжён, 0 — погас. */
export function fadeLeft(level: Level, ts: TimeState, k: number): number {
  const at = ts.lit[k];
  if (at < 0) return -1;
  return Math.max(0, level.fade[level.fades[k]] - (ts.t - at));
}

/** Какой-то гаснущий фонарь уже погас — арку не открыть. */
export function anyExpired(level: Level, ts: TimeState): boolean {
  if (level.goal !== 'classic') return false;
  for (let k = 0; k < level.fades.length; k++) if (fadeLeft(level, ts, k) === 0) return true;
  return false;
}

/** Время после плитки, занявшей клетки cells. */
export function advanceTime(level: Level, ts: TimeState, cells: readonly { idx: number }[]): TimeState {
  const t = ts.t + 1;
  if (!level.fades.length) return { t, lit: ts.lit };
  const lit = [...ts.lit];
  for (const c of cells) {
    const k = level.fades.indexOf(c.idx);
    if (k >= 0) lit[k] = t;
  }
  return { t, lit };
}

/** Ключ времени для запоминания в решателях: чётность хода (мосты) и остаток гаснущих фонарей. */
export function timeKey(level: Level, ts: TimeState): string {
  if (!level.timed) return '';
  let s = level.turnBridges.length ? String(ts.t & 1) : '';
  for (let k = 0; k < level.fades.length; k++) s += ',' + fadeLeft(level, ts, k);
  return s;
}

/** Поворотный мост в момент t горизонтальный (проход слева направо)? */
export function bridgeHorizontal(level: Level, idx: number, t: number): boolean {
  return level.bridgeH[idx] !== ((t & 1) === 1);
}

/** Пройти по поворотному мосту в направлении dir в момент t (только вдоль моста). */
export function bridgeAllows(level: Level, idx: number, t: number, dir: Dir): boolean {
  return bridgeHorizontal(level, idx, t) === (dir === 1 || dir === 3);
}

// ---------------------------------------------------------------------------

/** Сколько клеток вперёд занимает плитка и как она меняет направление. */
export function tileShape(kind: TileKind, dir: Dir): { steps: number; newDir: Dir } {
  switch (kind) {
    case 'straight':
    case 'bridge':
      return { steps: 1, newDir: dir };
    case 'straight2':
    case 'jump':
      return { steps: 2, newDir: dir };
    case 'left':
      return { steps: 1, newDir: turnLeft(dir) };
    case 'right':
      return { steps: 1, newDir: turnRight(dir) };
  }
}

/** Цель достигнута: конец дороги в арке или (цель «светлячки») дорога собрала всех светлячков. */
export function goalReached(level: Level, head: number, isOnRoad: (idx: number) => boolean): boolean {
  if (level.goal === 'fireflies') return level.fireflies.every(isOnRoad);
  return head === level.exit.y * level.width + level.exit.x;
}

/**
 * Проверяет плитку относительно конца дороги. Общая функция для игры и решателя.
 * Плитка всегда идёт на шаг (или два) вперёд от конца дороги; поворот занимает клетку впереди
 * и разворачивает дорогу налево или направо. «Прыжок» перелетает через одну клетку (кроме арки)
 * и встаёт на следующую; перепрыгнутая клетка на дорогу не попадает (фонарь не зажигается).
 * ts — время уровня (поворотные мосты, гаснущие фонари); без него — начало уровня.
 */
export function placeTile(
  level: Level,
  isOnRoad: (idx: number) => boolean,
  head: number,
  dir: Dir,
  kind: TileKind,
  ts?: TimeState,
): Placement {
  const { steps, newDir } = tileShape(kind, dir);
  const t = ts?.t ?? 0;
  const cells: PlacedCell[] = [];
  let jumped: PlacedCell | undefined;
  let x = head % level.width;
  let y = Math.floor(head / level.width);
  // Сколько фонарей ещё не горит — выход открывается, только когда горят все.
  let lanternsLeft = 0;
  for (const l of level.lanterns) {
    if (!isOnRoad(l)) lanternsLeft++;
    else if (level.fade[l] > 0 && ts && fadeLeft(level, ts, level.fades.indexOf(l)) <= 0) lanternsLeft++;
  }

  const fail = (reason: BlockReason): Placement => ({ ok: false, kind, cells, newDir, jumped, blocked: { x, y }, reason });

  for (let s = 0; s < steps; s++) {
    x += DX[dir];
    y += DY[dir];
    if (x < 0 || y < 0 || x >= level.width || y >= level.height) return fail('edge');
    const idx = y * level.width + x;
    const type = level.cells[idx];
    if (kind === 'jump' && s === 0) {
      // Перелетаем через любую клетку, кроме арки.
      if (type === 'exit') return fail('exitPassThrough');
      jumped = { x, y, idx };
      continue;
    }
    if (isOnRoad(idx)) return fail('road');
    if (type === 'rock') return fail('rock');
    if (type === 'turnbridge') {
      // По поворотному мосту — только прямо и только вдоль моста.
      if (kind === 'bridge') return fail('bridgeNeedsWater');
      if (newDir !== dir || !bridgeAllows(level, idx, t, dir)) return fail('bridgeTurned');
    }
    if (kind === 'bridge' && type !== 'water') return fail('bridgeNeedsWater');
    if (type === 'water' && kind !== 'bridge') return fail('water');
    if (type === 'exit') {
      if (s !== steps - 1) return fail('exitPassThrough');
      if (lanternsLeft > 0) return fail('exitClosed');
    }
    if (type === 'lantern') lanternsLeft--;
    cells.push({ x, y, idx });
  }
  return { ok: true, kind, cells, newDir, jumped };
}
