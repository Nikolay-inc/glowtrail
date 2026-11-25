// Тексты игры для обучения, целей и подсказок Lumo. Сейчас только русский; EN и UK добавятся рядом
// с тем же набором ключей. Использование: t('goal_lanterns', { n: 3 }).

const ru = {
  // Цель уровня
  goal_door: 'Доведи Lumo до двери',
  goal_lanterns: 'Зажги все фонари: {n}',
  goal_fireflies: 'Светлячки — по желанию: {n}',
  goal_all_fireflies: 'Собери светлячков: {n}',
  goal_no_door: 'Двери нет — только светлячки',
  fireflies_count: 'Светлячки: {n} из {total}',
  goal_fade_title: 'Гаснущий фонарь',
  goal_fade_text: 'Число — сколько плиток он горит после зажигания. Погаснет до двери — уровень не пройти.',
  goal_bridge_title: 'Поворотный мост',
  goal_bridge_text: 'Поворачивается на 90° после каждой плитки (полупрозрачный — каким станет). Пройти — только вдоль.',
  goal_start: 'Старт',

  // Подсказки Lumo (3–7 слов)
  tip_undo: 'Ошибся? Верни ход назад',
  tip_hint: 'Застрял? Нажми подсказку',
  tip_restart: 'Тупик — начни заново',
  tip_stash: 'Сюда можно отложить плитку',
  tip_turn: 'Стрелки поворачиваются вместе с дорогой',
  tip_rock: 'Через камни не пройти',
  tip_water: 'Через воду — только по мосту',
  tip_lantern: 'Зажги все фонари — откроется дверь',
  tip_door_locked: 'Сначала зажги все фонари',
  tip_side_entry: 'В арку можно войти сбоку',
  tip_drag: 'Плитку можно перетащить к дороге',
  tip_turnbridge: 'Мост повернётся после следующей плитки',
  tip_fade: 'Фонарь погас — не успели к двери',

  // Вступление
  intro_line1: 'В долине погас свет',
  intro_line2: 'Проложи путь к арке',
  intro_skip: 'Пропустить ›',

  // Карточки правил (живая анимация на мини-поле)
  rule_road_title: 'Дорога к двери',
  rule_road_text: 'Нажми на плитку — дорога вырастет. Доведи её до двери.',
  rule_lantern_title: 'Фонари',
  rule_lantern_text: 'Дорога должна пройти через все фонари. Пока они не горят, дверь заперта.',
  rule_side_title: 'Вход с любой стороны',
  rule_side_text: 'В дверь можно войти слева, справа, сверху или снизу.',
  rule_rock_title: 'Камни',
  rule_rock_text: 'Через камни дорога не проходит — обходи их.',
  rule_water_title: 'Река',
  rule_water_text: 'Реку можно перейти только по мосту.',
  rule_firefly_title: 'Светлячки',
  rule_firefly_text: 'Собирай светлячков — это по желанию. Дорога через светлячка забирает его с собой.',
  rule_jump_title: 'Прыжок',
  rule_jump_text: 'Прыжок перелетает через одну клетку: камень, воду или фонарь (фонарь при этом не зажигается).',
  rule_turnbridge_title: 'Поворотный мост',
  rule_turnbridge_text: 'После каждой плитки мост поворачивается на 90°, полупрозрачный — каким он станет. Пройти можно только вдоль моста.',
  rule_fade_title: 'Гаснущий фонарь',
  rule_fade_text: 'Число — сколько плиток фонарь горит после зажигания. Погаснет до двери — уровень не пройти.',
  rule_ffgoal_title: 'Только светлячки',
  rule_ffgoal_text: 'Здесь нет двери: собери всех светлячков — и уровень пройден.',
  rule_ok: 'Понятно',
  rule_next: 'Дальше',
  rule_replay_tutorial: 'Пройти обучение с начала',

  // Знакомство с валютами (на карте после обучения): дальше в игре валюты — только значками
  currency_title: 'Монеты и свет',
  currency_coin: 'Монеты — за пройденные уровни и звёзды. На них — наряды и улучшения.',
  currency_light: 'Свет — за звёзды и светлячков. Он зажигает огни в деревне.',
  currency_note: 'Дальше в игре — только значки',

  // Меню
  tutorial_replay: 'Как играть',
} as const;

export type StringKey = keyof typeof ru;
export type Locale = 'ru';

const TABLES: Record<Locale, Record<StringKey, string>> = { ru };

let locale: Locale = 'ru';

export function setLocale(l: Locale) {
  locale = l;
}

/** Текст по ключу с подстановкой {параметров}. */
export function t(key: StringKey, params: Record<string, string | number> = {}): string {
  const raw = TABLES[locale][key] ?? TABLES.ru[key] ?? key;
  return raw.replace(/\{(\w+)\}/g, (_, k: string) => (k in params ? String(params[k]) : `{${k}}`));
}

/** Все ключи — для тестов (например, что подсказки укладываются в 3–7 слов). */
export function allKeys(): StringKey[] {
  return Object.keys(ru) as StringKey[];
}
