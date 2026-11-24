import { CELL_BY_CHAR, CHAR_BY_CELL, DIR_BY_LETTER, TILE_KINDS, type CellType, type Level, type LevelData, type Point } from './types';

/** Превращает JSON уровня в структуру для логики и проверяет, что он корректен. */
export function parseLevel(data: LevelData, num = 0): Level {
  const height = data.grid.length;
  if (height === 0) throw new Error(`Уровень ${data.id}: пустое поле`);
  const width = data.grid[0].length;
  const cells: CellType[] = [];
  let start: Point | null = null;
  let exit: Point | null = null;
  const lanterns: number[] = [];
  const fireflies: number[] = [];
  const fade: number[] = [];
  const bridgeH: boolean[] = [];
  const turnBridges: number[] = [];
  const goal = data.goal ?? 'classic';

  data.grid.forEach((row, y) => {
    if (row.length !== width) throw new Error(`Уровень ${data.id}: строка ${y} другой длины`);
    [...row].forEach((ch, x) => {
      const type = CELL_BY_CHAR[ch];
      if (!type) throw new Error(`Уровень ${data.id}: неизвестный символ «${ch}»`);
      if (type === 'start') {
        if (start) throw new Error(`Уровень ${data.id}: два старта`);
        start = { x, y };
      }
      if (type === 'exit') {
        if (exit) throw new Error(`Уровень ${data.id}: два выхода`);
        exit = { x, y };
      }
      if (type === 'lantern') lanterns.push(y * width + x);
      if (type === 'firefly') fireflies.push(y * width + x);
      if (type === 'turnbridge') turnBridges.push(y * width + x);
      fade.push(ch >= '2' && ch <= '9' ? Number(ch) : 0);
      bridgeH.push(ch === '-');
      cells.push(type);
    });
  });

  if (!start) throw new Error(`Уровень ${data.id}: нет старта`);
  if (goal === 'classic' && !exit) throw new Error(`Уровень ${data.id}: нет выхода`);
  if (goal === 'fireflies') {
    if (exit) throw new Error(`Уровень ${data.id}: у цели «светлячки» арки нет`);
    if (fireflies.length === 0) throw new Error(`Уровень ${data.id}: цель «светлячки», а светлячков нет`);
  }
  const startDir = DIR_BY_LETTER[data.startDir];
  if (startDir === undefined) throw new Error(`Уровень ${data.id}: неверное направление старта`);
  if (data.tileSet && data.tileSet.length === 0) throw new Error(`Уровень ${data.id}: пустой набор плиток`);
  if (!data.tileSet && data.deck.length === 0) throw new Error(`Уровень ${data.id}: пустая колода`);
  for (const t of [...data.deck, ...(data.tileSet ?? []), ...(data.easeDecks ?? []).flat()]) {
    if (!TILE_KINDS.includes(t)) throw new Error(`Уровень ${data.id}: неизвестная плитка «${t}»`);
  }

  return {
    id: String(data.id),
    num,
    name: data.name,
    width,
    height,
    cells,
    start,
    startDir,
    exit: exit ?? { x: -1, y: -1 },
    goal,
    lanterns,
    fireflies,
    fade,
    fades: fade.map((n, i) => (n > 0 ? i : -1)).filter((i) => i >= 0),
    turnBridges,
    bridgeH,
    timed: turnBridges.length > 0 || fade.some((n) => n > 0),
    deck: [...(data.deck ?? [])],
    tileSet: data.tileSet ? [...data.tileSet] : null,
    allowStash: data.allowStash ?? true,
    night: data.night ?? false,
    tip: data.tip,
    stars: { ...data.stars },
    tutorial: data.tutorial,
    easeDecks: data.easeDecks?.map((d) => [...d]),
    metrics: data.metrics ? { ...data.metrics } : undefined,
  };
}

/** Символ клетки в формате JSON (с ориентацией моста и числом гаснущего фонаря). */
export function cellChar(level: Pick<Level, 'cells' | 'fade' | 'bridgeH'>, idx: number): string {
  const c = level.cells[idx];
  if (c === 'turnbridge') return level.bridgeH[idx] ? '-' : '|';
  if (c === 'lantern' && level.fade[idx] > 0) return String(level.fade[idx]);
  return CHAR_BY_CELL[c];
}

/** Строки поля уровня в формате JSON. */
export function levelRows(level: Pick<Level, 'cells' | 'fade' | 'bridgeH' | 'width'>): string[] {
  const rows: string[] = [];
  for (let i = 0; i < level.cells.length; i += level.width) {
    let row = '';
    for (let j = i; j < i + level.width; j++) row += cellChar(level, j);
    rows.push(row);
  }
  return rows;
}
