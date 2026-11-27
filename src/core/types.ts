// Базовые типы игры. Здесь нет ничего от Phaser — только данные.

/** Направление: 0 — вверх, 1 — вправо, 2 — вниз, 3 — влево. */
export type Dir = 0 | 1 | 2 | 3;

export const DX = [0, 1, 0, -1] as const;
export const DY = [-1, 0, 1, 0] as const;

export const DIR_BY_LETTER: Record<string, Dir> = { N: 0, E: 1, S: 2, W: 3 };

export const turnLeft = (d: Dir): Dir => ((d + 3) % 4) as Dir;
export const turnRight = (d: Dir): Dir => ((d + 1) % 4) as Dir;

/** Виды плиток. Все они относительны текущего направления дороги. */
export type TileKind = 'straight' | 'straight2' | 'left' | 'right' | 'bridge' | 'jump';

export const TILE_KINDS: readonly TileKind[] = ['straight', 'straight2', 'left', 'right', 'bridge', 'jump'];

/**
 * Типы клеток. turnbridge — поворотный мост через воду (после каждой поставленной плитки поворачивается на 90°).
 * Гаснущий фонарь — это lantern с числом ходов (Level.fade).
 */
export type CellType = 'empty' | 'rock' | 'water' | 'lantern' | 'exit' | 'start' | 'firefly' | 'turnbridge' | 'ring';

export const CELL_BY_CHAR: Record<string, CellType> = {
  '.': 'empty',
  '#': 'rock',
  '~': 'water',
  L: 'lantern',
  E: 'exit',
  S: 'start',
  F: 'firefly',
  '-': 'turnbridge', // поворотный мост, сначала горизонтальный (проход слева направо)
  '|': 'turnbridge', // поворотный мост, сначала вертикальный (проход сверху вниз)
  '2': 'lantern', // гаснущий фонарь: цифра — сколько ходов горит после зажигания
  '3': 'lantern',
  '4': 'lantern',
  '5': 'lantern',
  '6': 'lantern',
  '7': 'lantern',
  '8': 'lantern',
  '9': 'lantern',
  a: 'ring', // грибное кольцо-телепорт пары A (на поле ровно два)
  b: 'ring', // грибное кольцо-телепорт пары B
};

/** Буквы пар грибных колец: индекс + 1 — номер пары в Level.ringId. */
export const RING_LETTERS = ['a', 'b'] as const;

/** Обратная таблица: тип клетки → символ (редактор, генератор). Для моста и гаснущего фонаря — cellChar в level.ts. */
export const CHAR_BY_CELL: Record<CellType, string> = { empty: '.', rock: '#', water: '~', lantern: 'L', exit: 'E', start: 'S', firefly: 'F', turnbridge: '-', ring: 'a' };

/**
 * Цель уровня: classic — дойти до арки через все фонари; fireflies — собрать всех светлячков (арки нет);
 * escape — «Побег»: дойти до арки, пока тень не догнала (арка открыта сразу, фонари задерживают тень).
 */
export type GoalType = 'classic' | 'fireflies' | 'escape';

/** Уровень в том виде, как он лежит в JSON. */
export interface LevelData {
  /** Постоянный id уровня (по нему хранится прогресс): «valley-07». */
  id: string;
  name: string;
  /**
   * Строки поля сверху вниз: . пусто, # камень, ~ вода, L фонарь, E выход, S старт, F светлячок,
   * - | поворотный мост (горизонтальный / вертикальный на старте), 2–9 гаснущий фонарь (горит N ходов),
   * a b грибные кольца-телепорты (по два одной буквы).
   */
  grid: string[];
  /** Туман: клетки скрыты, кроме тех, что рядом с дорогой и зажжёнными фонарями (арка, фонари и кольца светятся сквозь него). */
  fog?: boolean;
  /** Тень: появляется на старте через столько ходов (число на старте) и бежит по дороге за Lumo. */
  shadow?: number;
  /** Куда смотрит фонарщик на старте: N, E, S, W. */
  startDir: 'N' | 'E' | 'S' | 'W';
  /** Цель уровня (по умолчанию classic). */
  goal?: GoalType;
  /** Колода плиток сверху вниз: первые три сразу попадают в лоток. Пусто, если колода бесконечная. */
  deck: TileKind[];
  /** Бесконечная колода: плитки выдаются случайно из этого набора (обучающие уровни). */
  tileSet?: TileKind[];
  /** Можно ли пользоваться слотом «отложить» (по умолчанию да). */
  allowStash?: boolean;
  /** Ночной уровень: поле затемнено, светятся только дорога и фонари. */
  night?: boolean;
  /** Подсказка Lumo в начале уровня при первом прохождении (lantern, side_entry, stash, water…). */
  tip?: string;
  /** Сколько плиток должно остаться для 2 и 3 звёзд. */
  stars: { two: number; three: number };
  /** Подсказка без текста: place — рука показывает нужную плитку, stash — показывает слот «отложить». */
  tutorial?: 'place' | 'stash';
  /** Колоды с 1 и 2 лишними плитками для незаметного облегчения (считает npm run ease). */
  easeDecks?: TileKind[][];
  /** Метрики сложности (считает npm run ease, сверяет npm run verify). */
  metrics?: LevelMetrics;
}

/** Метрики сложности уровня — по ним строится кривая мира. */
export interface LevelMetrics {
  /** Итоговый рейтинг 1–10. */
  rating: number;
  /** Разных решений (дорог до выхода), не больше предела решателя. */
  roads: number;
  minTiles: number;
  /** Плиток в колоде сверх минимума (-1 — колода бесконечная). */
  reserve: number;
  /** Доля тупиковых ходов: в скольких процентах случаев случайный допустимый ход делает уровень нерешаемым. */
  trap: number;
}

export interface Point {
  x: number;
  y: number;
}

/** Разобранный уровень, удобный для логики. */
export interface Level {
  id: string;
  /** Номер уровня по порядку во всех мирах (1, 2, …) — для показа и обучения. 0 — уровень вне миров. */
  num: number;
  name: string;
  width: number;
  height: number;
  cells: CellType[]; // индекс = y * width + x
  start: Point;
  startDir: Dir;
  /** Арка. У цели fireflies арки нет: { x: -1, y: -1 }. */
  exit: Point;
  goal: GoalType;
  lanterns: number[]; // индексы клеток с фонарями (вместе с гаснущими)
  fireflies: number[]; // индексы клеток со светлячками (собирать по желанию, у цели fireflies — обязательно)
  /** По клеткам: сколько ходов горит гаснущий фонарь (0 — обычная клетка или обычный фонарь). */
  fade: number[];
  /** Гаснущие фонари (индексы клеток) — порядок для состояния решателя. */
  fades: number[];
  /** Поворотные мосты (индексы клеток). */
  turnBridges: number[];
  /** По клеткам: парное грибное кольцо (индекс клетки) или -1. */
  ringPair: number[];
  /** По клеткам: номер пары колец (1 — a, 2 — b) или 0. */
  ringId: number[];
  /** Пары колец: [клетка, клетка]. */
  rings: [number, number][];
  /** Туман над полем. */
  fog: boolean;
  /** Через сколько ходов на старте появляется тень (0 — тени нет). */
  shadow: number;
  /** По клеткам: поворотный мост на старте горизонтальный (проход слева направо). */
  bridgeH: boolean[];
  /** На поле есть то, что меняется со временем (поворотный мост, гаснущий фонарь, тень). */
  timed: boolean;
  deck: TileKind[];
  /** Набор бесконечной колоды или null, если колода конечная. */
  tileSet: TileKind[] | null;
  allowStash: boolean;
  night: boolean;
  tip?: string;
  stars: { two: number; three: number };
  tutorial?: 'place' | 'stash';
  easeDecks?: TileKind[][];
  metrics?: LevelMetrics;
}
