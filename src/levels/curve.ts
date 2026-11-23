// План мира «Долина» (уровни 11–30): роль уровня в «пиле» десятка, целевой рейтинг сложности,
// максимальный размер поля и элементы. По этому плану npm run pick подбирает уровни из кандидатов
// генератора, а npm run verify проверяет кривую.
//
// Внутри каждого десятка: 1–3 лёгкие (новое сочетание), 4–7 средние, 8 — передышка, 9 — сложнее,
// 10 — «испытание». Рейтинг растёт по миру примерно с 2 до 6, «испытания» — до 7.

export type Role = 'easy' | 'medium' | 'breather' | 'harder' | 'challenge';
export type Feature = 'lantern' | 'rock' | 'water' | 'firefly';

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
export const FIREFLY_FROM = 12;

const ALL: Feature[] = ['lantern', 'rock', 'water', 'firefly'];
const S = (num: number, role: Role, rating: number, size: string, needs: Feature[], allows: Feature[], name: string, night = false): Slot => {
  const [maxW, maxH] = size.split('x').map(Number);
  return { num, role, rating, maxW, maxH, needs, allows, night, name };
};

export const VALLEY_PLAN: Slot[] = [
  // 11–20: светлячки и всё вместе
  S(11, 'easy', 2, '5x7', ['lantern', 'rock'], [], 'Каменная тропа'),
  S(12, 'easy', 2, '5x6', ['firefly'], ['lantern'], 'Первый светлячок'),
  S(13, 'easy', 2.5, '5x7', ['firefly', 'rock'], ['lantern'], 'Светлячки среди камней'),
  S(14, 'medium', 3, '5x7', ['water', 'firefly'], ['lantern', 'rock'], 'Брод'),
  S(15, 'medium', 3.5, '6x7', ['water', 'rock'], ['lantern'], 'Мельничный ручей'),
  S(16, 'medium', 3.5, '6x7', ['lantern', 'firefly'], ['rock', 'water'], 'Ночные огоньки'),
  S(17, 'medium', 4, '6x7', ['water', 'lantern'], ALL, 'Старый мост'),
  S(18, 'breather', 2.5, '5x6', ['firefly'], ['lantern'], 'Поляна'),
  S(19, 'harder', 4.5, '6x8', ['lantern', 'rock'], ALL, 'Петля'),
  S(20, 'challenge', 5.5, '6x8', ['lantern', 'water'], ALL, 'Испытание у реки'),
  // 21–30: ночь, вода и длинные пути
  S(21, 'easy', 3, '5x7', ['firefly'], ['lantern', 'rock'], 'Светлячки в ночи', true),
  S(22, 'easy', 3, '6x7', ['water', 'firefly'], ['lantern'], 'Заводь'),
  S(23, 'easy', 3.5, '6x7', ['lantern', 'rock', 'firefly'], [], 'Каменный сад'),
  S(24, 'medium', 4, '6x7', ['water', 'lantern'], ALL, 'Излучина'),
  S(25, 'medium', 4.5, '6x8', ['rock', 'lantern'], ALL, 'Каменный лес'),
  S(26, 'medium', 5, '6x8', ['water', 'rock'], ALL, 'Два берега'),
  S(27, 'medium', 5, '6x8', ['lantern', 'firefly'], ALL, 'Туманная лощина'),
  S(28, 'breather', 3.5, '5x7', ['firefly'], ['lantern'], 'Тихий луг'),
  S(29, 'harder', 6, '6x8', ['lantern', 'water'], ALL, 'Ночная переправа', true),
  S(30, 'challenge', 7, '6x8', ['lantern', 'water', 'rock'], ALL, 'Сердце долины', true),
];

export function slotOf(num: number): Slot | undefined {
  return VALLEY_PLAN.find((s) => s.num === num);
}
