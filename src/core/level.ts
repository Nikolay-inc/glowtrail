import { CELL_BY_CHAR, DIR_BY_LETTER, TILE_KINDS, type CellType, type Level, type LevelData, type Point } from './types';

/** Превращает JSON уровня в структуру для логики и проверяет, что он корректен. */
export function parseLevel(data: LevelData): Level {
  const height = data.grid.length;
  if (height === 0) throw new Error(`Уровень ${data.id}: пустое поле`);
  const width = data.grid[0].length;
  const cells: CellType[] = [];
  let start: Point | null = null;
  let exit: Point | null = null;
  const lanterns: number[] = [];

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
      cells.push(type);
    });
  });

  if (!start) throw new Error(`Уровень ${data.id}: нет старта`);
  if (!exit) throw new Error(`Уровень ${data.id}: нет выхода`);
  const startDir = DIR_BY_LETTER[data.startDir];
  if (startDir === undefined) throw new Error(`Уровень ${data.id}: неверное направление старта`);
  if (data.tileSet && data.tileSet.length === 0) throw new Error(`Уровень ${data.id}: пустой набор плиток`);
  if (!data.tileSet && data.deck.length === 0) throw new Error(`Уровень ${data.id}: пустая колода`);
  for (const t of [...data.deck, ...(data.tileSet ?? []), ...(data.easeDecks ?? []).flat()]) {
    if (!TILE_KINDS.includes(t)) throw new Error(`Уровень ${data.id}: неизвестная плитка «${t}»`);
  }

  return {
    id: data.id,
    name: data.name,
    width,
    height,
    cells,
    start,
    startDir,
    exit,
    lanterns,
    deck: [...(data.deck ?? [])],
    tileSet: data.tileSet ? [...data.tileSet] : null,
    allowStash: data.allowStash ?? true,
    night: data.night ?? false,
    tip: data.tip,
    stars: { ...data.stars },
    tutorial: data.tutorial,
    easeDecks: data.easeDecks?.map((d) => [...d]),
  };
}
