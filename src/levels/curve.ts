// План мира «Долина» (уровни 11–30): роль уровня в «пиле» десятка, целевой рейтинг сложности,
// максимальный размер поля и элементы. По этому плану npm run pick подбирает уровни из кандидатов
// генератора, а npm run verify проверяет кривую.
//
// Внутри каждого десятка: 1–3 лёгкие (новое сочетание), 4–7 средние, 8 — передышка, 9 — сложнее,
// 10 — «испытание». Рейтинг растёт по миру примерно с 2 до 6, «испытания» — до 7.

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

/** Уровень должен быть лёгким: роль «лёгкий» или знакомство с механикой. */
export const mustBeEasy = (slot: Slot) => slot.role === 'easy' || !!slot.intro;

/** Блоки мира: что нового появляется (каждые ~5 уровней). */
export const NOVELTY: { from: number; to: number; what: string }[] = [
  { from: 11, to: 14, what: 'светлячки' },
  { from: 15, to: 17, what: 'прыжок' },
  { from: 18, to: 20, what: 'цель «только светлячки»' },
  { from: 21, to: 24, what: 'поворотный мост' },
  { from: 25, to: 29, what: 'гаснущий фонарь' },
  { from: 30, to: 30, what: 'всё вместе' },
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
  S(29, 'harder', 6, '6x8', ['fade', 'lantern'], [...BASIC, 'jump'], 'Ночная переправа', { night: true }),
  // 30: испытание — всё вместе
  S(30, 'challenge', 6.5, '6x8', ['jump', 'turnbridge', 'fade'], BASIC, 'Сердце долины', { night: true }),
];

export function slotOf(num: number): Slot | undefined {
  return VALLEY_PLAN.find((s) => s.num === num);
}
