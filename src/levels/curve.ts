// Планы миров: «Долина» (уровни 11–30) и «Туманный лес» (31–60) — роль уровня в «пиле» десятка, целевой
// рейтинг сложности, максимальный размер поля и элементы. По этому плану npm run pick подбирает уровни из
// кандидатов генератора, а npm run verify проверяет кривую.
//
// «Долина»: в каждом десятке 1–3 лёгкие (новое сочетание), 4–7 средние, 8 — передышка, 9 — сложнее,
// 10 — «испытание». Рейтинг растёт по миру примерно с 2 до 6, «испытания» — до 7.
// «Туманный лес»: 1–3 лёгкие, 4–7(8) средние, 9 — передышка, 10 — «испытание» (в пятом и шестом десятках
// 8-й — «сложнее»). Рейтинг растёт примерно с 2,5–3 до 6, босс мира (60) — самый сложный в десятке.

import type { GenFeature } from '../core/generator';
import type { GoalType } from '../core/types';

export type Role = 'easy' | 'medium' | 'breather' | 'harder' | 'challenge';
export type Feature = GenFeature;

export interface Slot {
  num: number;
  role: Role;
  /** Целевой рейтинг сложности (допуск ±1). */
  rating: number;
  /** Максимальный размер поля (ширина × высота). */
  maxW: number;
  maxH: number;
  /** Обязательные элементы. */
  needs: Feature[];
  /** Какие ещё элементы можно (кроме обязательных). */
  allows: Feature[];
  /** Цель уровня (по умолчанию classic). */
  goal?: GoalType;
  /** Уровень-знакомство: здесь механика появляется впервые — он должен быть лёгким, как «лёгкие». */
  intro?: boolean;
  night?: boolean;
  /** Название-заготовка (можно поменять в JSON). */
  name: string;
}

/** Допуск по рейтингу от целевого. */
export const RATING_TOLERANCE = 1;
/** Самое большое поле в мире. */
export const MAX_W = 6;
export const MAX_H = 8;
/** С какого уровня появляются светлячки. */
export const FIREFLY_FROM = 11;
/** Передышка должна быть действительно лёгкой: рейтинг не выше и решений не меньше. */
export const BREATHER_MAX_RATING = 3;
export const BREATHER_MIN_ROADS = 10;
/** Лёгкие уровни и уровни-знакомства (первая встреча с механикой): рейтинг не выше и решений не меньше. */
export const EASY_MAX_RATING = 3;
export const EASY_MIN_ROADS = 10;

/** Средние и «сложнее» (кроме испытаний): решений не меньше — у таких уровней должен быть выбор пути. */
export const MEDIUM_MIN_ROADS = 4;
/** Роль требует выбора пути (не меньше MEDIUM_MIN_ROADS решений). */
export const needsChoice = (slot: Slot) => slot.role === 'medium' || slot.role === 'harder';

/** Уровень должен быть лёгким: роль «лёгкий» или знакомство с механикой. */
export const mustBeEasy = (slot: Slot) => slot.role === 'easy' || !!slot.intro;

/** Что проверяем у блока новинок (verify): признак уровня. */
export type NoveltyTest = 'firefly' | 'jump' | 'ffgoal' | 'turnbridge' | 'fade' | 'valleyAll' | 'ring' | 'fog' | 'shadow' | 'ringFog' | 'escape' | 'combo' | 'boss';

/** Блоки миров: что нового появляется (каждые ~5 уровней). */
export const NOVELTY: { from: number; to: number; what: string; test: NoveltyTest }[] = [
  { from: 11, to: 14, what: 'светлячки', test: 'firefly' },
  { from: 15, to: 17, what: 'прыжок', test: 'jump' },
  { from: 18, to: 20, what: 'цель «только светлячки»', test: 'ffgoal' },
  { from: 21, to: 24, what: 'поворотный мост', test: 'turnbridge' },
  { from: 25, to: 29, what: 'гаснущий фонарь', test: 'fade' },
  { from: 30, to: 30, what: 'всё вместе', test: 'valleyAll' },
  { from: 31, to: 34, what: 'грибные кольца', test: 'ring' },
  { from: 35, to: 38, what: 'туман', test: 'fog' },
  { from: 41, to: 45, what: 'тень', test: 'shadow' },
  { from: 46, to: 48, what: 'кольца + туман', test: 'ringFog' },
  { from: 51, to: 55, what: 'цель «Побег»', test: 'escape' },
  { from: 56, to: 58, what: 'сочетания с механиками долины', test: 'combo' },
  { from: 60, to: 60, what: 'босс: побег через туман с кольцами', test: 'boss' },
];

const BASIC: Feature[] = ['lantern', 'rock', 'water', 'firefly'];
const S = (
  num: number,
  role: Role,
  rating: number,
  size: string,
  needs: Feature[],
  allows: Feature[],
  name: string,
  extra: { night?: boolean; goal?: GoalType; intro?: boolean } = {},
): Slot => {
  const [maxW, maxH] = size.split('x').map(Number);
  return { num, role, rating, maxW, maxH, needs, allows, name, ...extra };
};

export const VALLEY_PLAN: Slot[] = [
  // 11–14: светлячки (по желанию)
  S(11, 'easy', 2, '5x6', ['firefly'], ['rock'], 'Первый светлячок', { intro: true }),
  S(12, 'easy', 2, '5x7', ['firefly', 'lantern'], ['rock'], 'Светлячковая тропа'),
  S(13, 'easy', 2.5, '5x7', ['firefly', 'rock'], ['lantern'], 'Светлячки среди камней'),
  S(14, 'medium', 3, '6x7', ['firefly', 'water'], ['lantern', 'rock'], 'Брод'),
  // 15–17: прыжок
  S(15, 'medium', 2.5, '5x7', ['jump', 'rock'], ['firefly'], 'Прыжок через камень', { intro: true }),
  S(16, 'medium', 3.5, '6x7', ['jump', 'water'], ['rock', 'firefly'], 'Кочки'),
  S(17, 'medium', 4, '6x7', ['jump', 'lantern'], ['rock', 'water', 'firefly'], 'Скачки у ручья'),
  // 18–20: цель «только светлячки» (арки нет)
  S(18, 'breather', 2.5, '5x6', ['firefly'], ['rock'], 'Поляна', { goal: 'fireflies', intro: true }),
  S(19, 'harder', 4.5, '6x8', ['firefly', 'rock'], ['water', 'jump'], 'Ночной хоровод', { goal: 'fireflies' }),
  S(20, 'challenge', 5.5, '6x8', ['firefly', 'jump'], ['rock', 'water'], 'Испытание огоньков', { goal: 'fireflies' }),
  // 21–24: поворотный мост (он стоит на реке, поэтому вода разрешена)
  S(21, 'easy', 2.5, '5x7', ['turnbridge'], ['water', 'rock', 'firefly'], 'Поворотный мост', { intro: true }),
  S(22, 'easy', 2.5, '6x7', ['turnbridge', 'firefly'], ['water', 'rock'], 'Мельница'),
  S(23, 'easy', 3, '6x7', ['turnbridge', 'lantern'], ['water', 'rock', 'firefly'], 'Две переправы'),
  S(24, 'medium', 4, '6x8', ['turnbridge', 'lantern'], ['water', 'rock', 'firefly', 'jump'], 'Излучина'),
  // 25–29: гаснущий фонарь
  S(25, 'medium', 3, '6x7', ['fade'], ['rock', 'firefly'], 'Гаснущий фонарь', { intro: true }),
  S(26, 'medium', 5, '6x8', ['fade', 'rock'], ['lantern', 'water', 'firefly'], 'Тающий свет'),
  S(27, 'medium', 5, '6x8', ['fade', 'water'], ['lantern', 'rock', 'firefly'], 'Туманная лощина'),
  S(28, 'breather', 3, '5x7', ['fade'], ['rock', 'firefly'], 'Тихий луг'),
  S(29, 'harder', 5.5, '6x8', ['fade', 'lantern'], [...BASIC, 'jump'], 'Ночная переправа', { night: true }),
  // 30: испытание — всё вместе
  S(30, 'challenge', 6.5, '6x8', ['jump', 'turnbridge', 'fade'], BASIC, 'Сердце долины', { night: true }),
];

// «Туманный лес» (31–60). Тень у цели «Побег» есть всегда — она в обязательных элементах.
const ESC: { goal: GoalType } = { goal: 'escape' };
export const FOREST_PLAN: Slot[] = [
  // 31–34: грибные кольца-телепорты
  S(31, 'easy', 2.5, '5x6', ['ring'], ['rock'], 'Грибное кольцо', { intro: true }),
  S(32, 'easy', 3, '5x7', ['ring', 'lantern'], ['rock', 'firefly'], 'Светлячки над грибами'),
  S(33, 'easy', 3, '5x7', ['ring', 'rock'], ['lantern', 'firefly'], 'Корни и кольца'),
  S(34, 'medium', 3.5, '6x7', ['ring', 'water'], ['lantern', 'rock', 'firefly'], 'Через ручей'),
  // 35–38: туман
  S(35, 'medium', 2.5, '5x6', ['fog', 'rock'], ['lantern'], 'Первый туман', { intro: true }),
  S(36, 'medium', 3.5, '5x7', ['fog', 'rock', 'lantern'], ['firefly'], 'Молочная тропа'),
  S(37, 'medium', 4, '6x7', ['fog', 'water'], ['rock', 'lantern', 'firefly'], 'Сырая низина'),
  S(38, 'medium', 4.5, '6x8', ['fog', 'lantern'], ['rock', 'water', 'firefly'], 'Фонари в тумане'),
  S(39, 'breather', 3, '5x6', ['ring'], ['rock', 'firefly'], 'Полянка'),
  S(40, 'challenge', 5.5, '6x8', ['ring', 'fog'], ['rock', 'lantern', 'water', 'firefly'], 'Испытание тумана'),
  // 41–45: тень
  S(41, 'easy', 2.5, '5x6', ['shadow'], ['rock', 'lantern'], 'Тень за спиной', { intro: true }),
  S(42, 'easy', 3, '5x7', ['shadow', 'lantern'], ['rock', 'firefly'], 'Фонари против тени'),
  S(43, 'easy', 3, '5x7', ['shadow', 'rock'], ['lantern', 'firefly'], 'Валуны'),
  S(44, 'medium', 4, '6x7', ['shadow', 'water'], ['rock', 'lantern', 'firefly'], 'Мостки'),
  S(45, 'medium', 4.5, '6x7', ['shadow', 'ring'], ['rock', 'lantern', 'firefly'], 'Скорее в кольцо'),
  // 46–48: кольца и туман вместе
  S(46, 'medium', 4.5, '6x7', ['ring', 'fog'], ['rock', 'lantern', 'firefly'], 'Кольца в тумане'),
  S(47, 'medium', 5, '6x8', ['ring', 'fog', 'water'], ['rock', 'lantern', 'firefly'], 'Туманный брод'),
  S(48, 'harder', 5, '6x8', ['ring', 'fog', 'lantern'], ['rock', 'water', 'firefly'], 'Блуждающие огни'),
  S(49, 'breather', 3, '5x6', ['shadow'], ['rock', 'lantern'], 'Тихая опушка'),
  S(50, 'challenge', 5.5, '6x8', ['shadow', 'ring', 'fog'], ['rock', 'lantern', 'water'], 'Испытание тени'),
  // 51–55: цель «Побег»
  S(51, 'easy', 2.5, '5x6', ['shadow'], ['rock'], 'Побег', { ...ESC, intro: true }),
  S(52, 'easy', 3, '5x7', ['shadow', 'lantern'], ['rock', 'firefly'], 'Огоньки на пути', ESC),
  S(53, 'easy', 3, '5x7', ['shadow', 'rock'], ['lantern', 'firefly', 'water'], 'Бурелом', ESC),
  S(54, 'medium', 4.5, '6x7', ['shadow', 'water'], ['rock', 'lantern', 'firefly'], 'Болото', ESC),
  S(55, 'medium', 5, '6x7', ['shadow', 'ring'], ['rock', 'lantern', 'firefly'], 'Грибной обход', ESC),
  // 56–58: сочетания с механиками долины
  S(56, 'medium', 5, '6x7', ['ring', 'jump'], ['rock', 'lantern', 'firefly'], 'Прыжок в кольцо'),
  S(57, 'medium', 5, '6x8', ['shadow', 'turnbridge'], ['water', 'rock', 'lantern'], 'Мельничный ручей'),
  S(58, 'harder', 5, '6x8', ['fog', 'fade'], ['rock', 'lantern', 'firefly'], 'Тающие огни'),
  S(59, 'breather', 3, '5x6', ['shadow'], ['rock', 'lantern'], 'Передышка у костра', ESC),
  // 60: босс мира — побег через туман с кольцами
  S(60, 'challenge', 6, '6x8', ['shadow', 'fog', 'ring'], ['rock', 'lantern', 'water'], 'Сердце леса', ESC),
];

// Светлячки в лесу — по желанию на любом уровне (как в «Долине»: на 1, 3, 7 уровнях десятка — по 2, на испытаниях — 4).
for (const slot of FOREST_PLAN) if (!slot.allows.includes('firefly')) slot.allows.push('firefly');

/** Планы по мирам (id мира → слоты). */
export const WORLD_PLANS: Record<string, Slot[]> = { valley: VALLEY_PLAN, forest: FOREST_PLAN };
/** Все слоты всех миров по порядку. */
export const ALL_SLOTS: Slot[] = [...VALLEY_PLAN, ...FOREST_PLAN];

export function slotOf(num: number): Slot | undefined {
  return ALL_SLOTS.find((s) => s.num === num);
}
