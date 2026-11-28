// Как плитка ложится на поле. Общая часть для правил игры и решателей.
// Здесь же — «часы» уровня: поворотные мосты и гаснущие фонари зависят от числа поставленных плиток.

import { DX, DY, goalNeedsLanterns, turnLeft, turnRight, type Dir, type Level, type Point, type TileKind } from './types';

export type BlockReason =
  | 'edge'
  | 'rock'
  | 'water'
  | 'road'
  | 'exitClosed'
  | 'exitPassThrough'
  | 'bridgeNeedsWater'
  /** Поворотный мост стоит поперёк дороги (или на мосту нельзя повернуть). */
  | 'bridgeTurned'
  /** Сугроб: растает, только когда загорится соседний фонарь. */
  | 'drift'
  /** Сигнальный огонь не по порядку: сначала нужно зажечь предыдущий. */
  | 'fireOrder';

export interface PlacedCell extends Point {
  idx: number;
  /** Грибное кольцо: in — дорога вошла в кольцо, out — вышла из парного (Lumo исчезает и появляется). */
  portal?: 'in' | 'out';
  /** Направление, в котором дорога вошла в клетку. */
  din?: Dir;
  /** Клетку прошли не плиткой, а сами: скольжение по льду (ice) или порыв ветра (wind). */
  forced?: 'ice' | 'wind';
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
  /** Сигнальный огонь, который не загорелся (не по порядку) — мигает номером. */
  fire?: number;
}

// ---------------------------------------------------------------------------
// Часы уровня

/**
 * Тень на дороге. Появляется на старте через level.shadow ходов и каждый ход пробегает SHADOW_SPEED клеток
 * дороги к Lumo; догнала конец дороги — поражение. Зажжённый фонарь задерживает её на 1 ход, травница
 * (бонус деревни) — тоже на 1 ход, когда тень вот-вот догонит.
 */
export interface ShadowState {
  /** Клеток в дороге вместе со стартом. */
  len: number;
  /** Номер клетки дороги, где тень (0 — старт); -1 — ещё не появилась. */
  pos: number;
  /** Ходов задержки в запасе (зажжённые фонари). */
  wait: number;
  /** Зарядов травницы на этот уровень. */
  charm: number;
}

/**
 * Тень пробегает 2 клетки за ход: дорога растёт минимум на клетку за ход, и с 1 клеткой тень никогда бы
 * не догнала. Так «прямо x2», кольца и фонари помогают убежать, а лишние петли — нет.
 */
export const SHADOW_SPEED = 2;

/**
 * Время уровня: t — сколько плиток уже поставлено; lit — для каждого гаснущего фонаря (порядок level.fades)
 * номер плитки, после которой он зажёгся (-1 — ещё не зажжён); sh — тень (если она есть на уровне).
 */
export interface TimeState {
  t: number;
  lit: readonly number[];
  sh?: ShadowState;
}

/** Начало уровня; charms — заряды травницы (задерживают тень). */
export const timeStart = (level: Level, charms = 0): TimeState => ({
  t: 0,
  lit: level.fades.map(() => -1),
  ...(level.shadow ? { sh: { len: 1, pos: -1, wait: 0, charm: Math.max(0, charms) } } : {}),
});

/** Тень догнала конец дороги. */
export function shadowCaught(ts: TimeState): boolean {
  const sh = ts.sh;
  return !!sh && sh.pos >= 0 && sh.pos >= sh.len - 1;
}

/** Сколько клеток от тени до конца дороги (-1 — тень ещё не появилась). */
export function shadowGap(ts: TimeState): number {
  const sh = ts.sh;
  return !sh || sh.pos < 0 ? -1 : Math.max(0, sh.len - 1 - sh.pos);
}

/** Через сколько ходов появится тень (0 — уже на дороге или тени нет). */
export function shadowIn(level: Level, ts: TimeState): number {
  return !ts.sh || ts.sh.pos >= 0 ? 0 : Math.max(0, level.shadow - ts.t);
}

/** Что задержало тень на этом ходу (по двум состояниям времени): фонарь, травница или ничего. */
export function shadowDelay(prev: TimeState, next: TimeState): 'lantern' | 'herbalist' | null {
  if (!prev.sh || !next.sh || prev.sh.pos < 0) return null;
  if (next.sh.charm < prev.sh.charm) return 'herbalist';
  // Появившаяся тень стоит на месте только из-за задержки фонаря.
  return next.sh.pos === prev.sh.pos ? 'lantern' : null;
}

/** Тень после хода: дорога выросла на cells, фонари среди них дают задержку. */
export function advanceShadow(level: Level, sh: ShadowState, t: number, cells: readonly { idx: number }[]): ShadowState {
  let { len, pos, wait, charm } = sh;
  len += cells.length;
  for (const c of cells) if (level.cells[c.idx] === 'lantern') wait++;
  const exit = level.exit.y * level.width + level.exit.x;
  const atExit = cells.length > 0 && cells[cells.length - 1].idx === exit;
  if (pos < 0) {
    if (t >= level.shadow) pos = 0; // появилась на старте
  } else if (wait > 0) {
    wait--; // фонарь задержал
  } else {
    const np = pos + SHADOW_SPEED;
    // Травница: вот-вот догонит — тень стоит этот ход (на победном ходу заряд не тратим).
    if (np >= len - 1 && charm > 0 && !atExit) charm--;
    else pos = np;
  }
  return { len, pos, wait, charm };
}

/** Сколько ходов ещё горит гаснущий фонарь (номер в level.fades); -1 — не зажжён, 0 — погас. */
export function fadeLeft(level: Level, ts: TimeState, k: number): number {
  const at = ts.lit[k];
  if (at < 0) return -1;
  return Math.max(0, level.fade[level.fades[k]] - (ts.t - at));
}

/** Какой-то гаснущий фонарь уже погас — арку не открыть. */
export function anyExpired(level: Level, ts: TimeState): boolean {
  if (!goalNeedsLanterns(level.goal)) return false;
  for (let k = 0; k < level.fades.length; k++) if (fadeLeft(level, ts, k) === 0) return true;
  return false;
}

/** Время после плитки, занявшей клетки cells. */
export function advanceTime(level: Level, ts: TimeState, cells: readonly { idx: number }[]): TimeState {
  const t = ts.t + 1;
  const sh = ts.sh ? advanceShadow(level, ts.sh, t, cells) : undefined;
  const withSh = (x: TimeState): TimeState => (sh ? { ...x, sh } : x);
  if (!level.fades.length) return withSh({ t, lit: ts.lit });
  const lit = [...ts.lit];
  for (const c of cells) {
    const k = level.fades.indexOf(c.idx);
    if (k >= 0) lit[k] = t;
  }
  return withSh({ t, lit });
}

/** Ключ времени для запоминания в решателях: чётность хода (мосты), остаток гаснущих фонарей и тень. */
export function timeKey(level: Level, ts: TimeState): string {
  if (!level.timed) return '';
  let s = level.turnBridges.length ? String(ts.t & 1) : '';
  for (let k = 0; k < level.fades.length; k++) s += ',' + fadeLeft(level, ts, k);
  const sh = ts.sh;
  if (sh) s += `|${sh.pos < 0 ? 'c' + Math.max(0, level.shadow - ts.t) : 'g' + (sh.len - 1 - sh.pos)},${sh.wait},${sh.charm}`;
  return s;
}

/** Отсюда уже не выиграть из-за времени: погас гаснущий фонарь или тень догнала. */
export function timeDead(level: Level, ts: TimeState): boolean {
  return (level.fades.length > 0 && anyExpired(level, ts)) || shadowCaught(ts);
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
  // classic и escape — арка; fireflies — все светлячки.
  if (level.goal === 'fireflies') return level.fireflies.every(isOnRoad);
  return head === level.exit.y * level.width + level.exit.x;
}

/** Сугроб в клетке idx растаял: рядом (по стороне) горит фонарь — он на дороге. */
export function driftMelted(level: Level, isOnRoad: (idx: number) => boolean, idx: number): boolean {
  const x = idx % level.width;
  const y = Math.floor(idx / level.width);
  for (let d = 0; d < 4; d++) {
    const nx = x + DX[d];
    const ny = y + DY[d];
    if (nx < 0 || ny < 0 || nx >= level.width || ny >= level.height) continue;
    const n = ny * level.width + nx;
    if (level.cells[n] === 'lantern' && isOnRoad(n)) return true;
  }
  return false;
}

/** Сколько сигнальных огней уже горит (они зажигаются только по порядку — горят первые n). */
export function firesLit(level: Level, isOnRoad: (idx: number) => boolean): number {
  let n = 0;
  while (n < level.fires.length && isOnRoad(level.fires[n])) n++;
  return n;
}

/**
 * Проверяет плитку относительно конца дороги. Общая функция для игры и решателя.
 * Плитка всегда идёт на шаг (или два) вперёд от конца дороги; поворот занимает клетку впереди
 * и разворачивает дорогу налево или направо. «Прыжок» перелетает через одну клетку (кроме арки)
 * и встаёт на следующую; перепрыгнутая клетка на дорогу не попадает (фонарь не зажигается).
 * После плитки — то, что двигает Lumo само: закончил ход на льду — скользит дальше по направлению дороги,
 * пока не встанет на не-ледяную клетку (камень, край поля и прочие препятствия останавливают на последней
 * ледяной); закончил ход на ветре — порыв сдвигает на клетку по стрелке (если там не препятствие), дорога
 * поворачивает по ветру, и на льду скольжение продолжается. Сугроб непроходим, пока рядом не горит фонарь;
 * сигнальный огонь можно пройти, только если горят все предыдущие (тогда он загорается).
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
  // Клетки этого хода — уже дорога (фонарь рядом с сугробом, огонь по порядку, второй раз не пройти).
  const here = new Set<number>();
  const onRoad = (i: number) => here.has(i) || isOnRoad(i);
  let jumped: PlacedCell | undefined;
  let x = head % level.width;
  let y = Math.floor(head / level.width);
  // Сколько фонарей и сигнальных огней ещё не горит — выход открывается, только когда горят все.
  let lanternsLeft = 0;
  let fires = level.fires.length ? firesLit(level, isOnRoad) : 0;
  // «Побег»: арка открыта сразу, фонари только задерживают тень.
  if (level.goal !== 'escape') {
    for (const l of level.lanterns) {
      if (!isOnRoad(l)) lanternsLeft++;
      else if (level.fade[l] > 0 && ts && fadeLeft(level, ts, level.fades.indexOf(l)) <= 0) lanternsLeft++;
    }
    lanternsLeft += level.fires.length - fires;
  }
  const exitIdx = level.exit.y * level.width + level.exit.x;
  const push = (c: PlacedCell) => {
    cells.push(c);
    here.add(c.idx);
  };

  const fail = (reason: BlockReason, fire?: number): Placement => ({ ok: false, kind, cells, newDir, jumped, blocked: { x, y }, reason, ...(fire !== undefined ? { fire } : {}) });

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
    if (onRoad(idx)) return fail('road');
    if (type === 'rock') return fail('rock');
    if (type === 'drift' && !driftMelted(level, onRoad, idx)) return fail('drift');
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
    if (type === 'fire') {
      if (level.fireNo[idx] !== fires + 1) return fail('fireOrder', idx);
      fires++;
      lanternsLeft--;
    }
    if (type === 'lantern') lanternsLeft--;
    if (type === 'ring') {
      // Грибное кольцо: дорога выходит из парного кольца в том же направлении.
      const to = level.ringPair[idx];
      if (to < 0 || onRoad(to)) return fail('road');
      push({ x, y, idx, portal: 'in', din: dir });
      x = to % level.width;
      y = Math.floor(to / level.width);
      push({ x, y, idx: to, portal: 'out', din: dir });
      continue;
    }
    push({ x, y, idx, din: dir });
  }

  // Lumo двигается само: скольжение по льду и порывы ветра (пока есть куда).
  let d = newDir;
  for (let guard = 0; guard < 64; guard++) {
    const last = cells[cells.length - 1];
    if (!last || last.idx === exitIdx) break;
    const lt = level.cells[last.idx];
    let md: Dir;
    if (lt === 'ice') md = d;
    else if (lt === 'wind' && level.wind[last.idx] >= 0) md = level.wind[last.idx] as Dir;
    else break;
    const nx = last.x + DX[md];
    const ny = last.y + DY[md];
    if (nx < 0 || ny < 0 || nx >= level.width || ny >= level.height) break;
    const idx = ny * level.width + nx;
    const type = level.cells[idx];
    if (onRoad(idx) || type === 'rock' || type === 'water') break;
    if (type === 'drift' && !driftMelted(level, onRoad, idx)) break;
    if (type === 'turnbridge' && !bridgeAllows(level, idx, t, md)) break;
    if (type === 'exit' && lanternsLeft > 0) break;
    if (type === 'fire') {
      if (level.fireNo[idx] !== fires + 1) break;
      fires++;
      lanternsLeft--;
    }
    if (type === 'lantern') lanternsLeft--;
    const forced = lt === 'ice' ? 'ice' : 'wind';
    d = md;
    if (type === 'ring') {
      const to = level.ringPair[idx];
      if (to < 0 || onRoad(to)) break;
      push({ x: nx, y: ny, idx, portal: 'in', din: md, forced });
      push({ x: to % level.width, y: Math.floor(to / level.width), idx: to, portal: 'out', din: md, forced });
      continue;
    }
    push({ x: nx, y: ny, idx, din: md, forced });
  }
  return { ok: true, kind, cells, newDir: d, jumped };
}
