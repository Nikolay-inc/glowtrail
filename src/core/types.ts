// Базовые типы игры. Здесь нет ничего от Phaser — только данные.

/** Направление: 0 — вверх, 1 — вправо, 2 — вниз, 3 — влево. */
export type Dir = 0 | 1 | 2 | 3;

export const DX = [0, 1, 0, -1] as const;
export const DY = [-1, 0, 1, 0] as const;

export const DIR_BY_LETTER: Record<string, Dir> = { N: 0, E: 1, S: 2, W: 3 };

export const turnLeft = (d: Dir): Dir => ((d + 3) % 4) as Dir;
export const turnRight = (d: Dir): Dir => ((d + 1) % 4) as Dir;

/** Виды плиток. Все они относительны текущего направления дороги. */
export type TileKind = 'straight' | 'straight2' | 'left' | 'right' | 'bridge';

export const TILE_KINDS: readonly TileKind[] = ['straight', 'straight2', 'left', 'right', 'bridge'];

export type CellType = 'empty' | 'rock' | 'water' | 'lantern' | 'exit' | 'start';

export const CELL_BY_CHAR: Record<string, CellType> = {
  '.': 'empty',
  '#': 'rock',
  '~': 'water',
  L: 'lantern',
  E: 'exit',
  S: 'start',
};

/** Уровень в том виде, как он лежит в JSON. */
export interface LevelData {
  id: number;
  name: string;
  /** Строки поля сверху вниз: . пусто, # камень, ~ вода, L фонарь, E выход, S старт. */
  grid: string[];
  /** Куда смотрит фонарщик на старте: N, E, S, W. */
  startDir: 'N' | 'E' | 'S' | 'W';
  /** Колода плиток сверху вниз: первые три сразу попадают в лоток. Пусто, если колода бесконечная. */
  deck: TileKind[];
  /** Бесконечная колода: плитки выдаются случайно из этого набора (обучающие уровни). */
  tileSet?: TileKind[];
  /** Можно ли пользоваться слотом «отложить» (по умолчанию да). */
  allowStash?: boolean;
  /** Ночной уровень: поле затемнено, светятся только дорога и фонари. */
  night?: boolean;
  /** Сколько плиток должно остаться для 2 и 3 звёзд. */
  stars: { two: number; three: number };
  /** Подсказка без текста: place — рука показывает нужную плитку, stash — показывает слот «отложить». */
  tutorial?: 'place' | 'stash';
  /** Колоды с 1 и 2 лишними плитками для незаметного облегчения (считает npm run ease). */
  easeDecks?: TileKind[][];
}

export interface Point {
  x: number;
  y: number;
}

/** Разобранный уровень, удобный для логики. */
export interface Level {
  id: number;
  name: string;
  width: number;
  height: number;
  cells: CellType[]; // индекс = y * width + x
  start: Point;
  startDir: Dir;
  exit: Point;
  lanterns: number[]; // индексы клеток с фонарями
  deck: TileKind[];
  /** Набор бесконечной колоды или null, если колода конечная. */
  tileSet: TileKind[] | null;
  allowStash: boolean;
  night: boolean;
  stars: { two: number; three: number };
  tutorial?: 'place' | 'stash';
  easeDecks?: TileKind[][];
}
