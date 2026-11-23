// Тексты игры для обучения, целей и подсказок Lumo. Сейчас только русский; EN и UK добавятся рядом
// с тем же набором ключей. Использование: t('goal_lanterns', { n: 3 }).

const ru = {
  // Цель уровня
  goal_door: 'Доведи Lumo до двери',
  goal_lanterns: 'Зажги все фонари: {n}',

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

  // Вступление
  intro_line1: 'В долине погас свет',
  intro_line2: 'Проложи путь к арке',
  intro_skip: 'Пропустить ›',

  // Меню
  tutorial_replay: 'Обучение',
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
