// Аналитика без побочных эффектов (покрыта тестами): как запись лога превращается в событие Firebase,
// свойства игрока, нужен ли экран согласия (ЕС), можно ли собирать статистику.

import type { AnalyticsChoice, EventType, LogEvent } from '../save/SaveService';

/**
 * Имена в Firebase. Все события лога уходят под своими именами, кроме этих: у попыток уровня — понятные
 * level_*, а `session_start` в Firebase зарезервировано (его Firebase пишет сам), поэтому — game_session_start.
 */
export const FIREBASE_EVENT_NAMES: Partial<Record<EventType, string>> = {
  session: 'game_session_start',
  start: 'level_start',
  win: 'level_win',
  lose: 'level_lose',
  abandon: 'level_abandon',
};

export type EventParams = Record<string, string | number>;

/** Пределы Firebase: имя параметра до 40 символов, строка до 100, не больше 25 параметров. */
const MAX_PARAM_VALUE = 100;
const MAX_PARAMS = 25;

/**
 * Событие Firebase из записи лога: те же параметры (кроме времени `t` — у Firebase своё),
 * пустые отбрасываются, булевы → 0/1, длинные строки обрезаются; к id уровня добавляется номер `level_num`.
 */
export function firebaseEvent(e: LogEvent, levelNum?: (id: string) => number | undefined): { name: string; params: EventParams } {
  const params: EventParams = {};
  for (const [k, v] of Object.entries(e)) {
    if (k === 't' || k === 'ev' || v === undefined || v === null) continue;
    if (typeof v === 'number') {
      if (Number.isFinite(v)) params[k] = v;
    } else if (typeof v === 'boolean') params[k] = v ? 1 : 0;
    else params[k] = String(v).slice(0, MAX_PARAM_VALUE);
  }
  const num = e.level ? levelNum?.(e.level) : undefined;
  if (num !== undefined) params.level_num = num;
  const keys = Object.keys(params);
  if (keys.length > MAX_PARAMS) for (const k of keys.slice(MAX_PARAMS)) delete params[k];
  return { name: FIREBASE_EVENT_NAMES[e.ev] ?? e.ev, params };
}

/** Свойства игрока (user properties): глава, всего звёзд, уровень уюта, язык, версия. Значения — строки до 36 символов. */
export interface PlayerFacts {
  chapter: number;
  totalStars: number;
  cozyLevel: number;
  language: string;
  version: string;
}

export function userProperties(f: PlayerFacts): Record<string, string> {
  return {
    chapter: String(f.chapter),
    total_stars: String(f.totalStars),
    cozy_level: String(f.cozyLevel),
    game_language: f.language.slice(0, 36),
    game_version: f.version.slice(0, 36),
  };
}

/**
 * Часовые пояса ЕС/ЕЭЗ, Великобритании и Швейцарии (там нужно согласие до сбора статистики),
 * включая заморские территории. Лучше лишний раз спросить, чем не спросить.
 */
const CONSENT_ZONES = new Set([
  'Europe/Amsterdam',
  'Europe/Athens',
  'Europe/Berlin',
  'Europe/Bratislava',
  'Europe/Brussels',
  'Europe/Bucharest',
  'Europe/Budapest',
  'Europe/Busingen',
  'Europe/Copenhagen',
  'Europe/Dublin',
  'Europe/Helsinki',
  'Europe/Lisbon',
  'Europe/Ljubljana',
  'Europe/Luxembourg',
  'Europe/Madrid',
  'Europe/Malta',
  'Europe/Mariehamn',
  'Europe/Nicosia',
  'Europe/Paris',
  'Europe/Prague',
  'Europe/Riga',
  'Europe/Rome',
  'Europe/Sofia',
  'Europe/Stockholm',
  'Europe/Tallinn',
  'Europe/Vienna',
  'Europe/Vilnius',
  'Europe/Warsaw',
  'Europe/Zagreb',
  'Europe/Monaco',
  'Europe/San_Marino',
  'Europe/Vatican',
  'Europe/Andorra',
  'Europe/Oslo',
  'Europe/Vaduz',
  'Europe/Zurich',
  'Europe/London',
  'Europe/Belfast',
  'Europe/Guernsey',
  'Europe/Isle_of_Man',
  'Europe/Jersey',
  'Europe/Gibraltar',
  'Atlantic/Canary',
  'Atlantic/Madeira',
  'Atlantic/Azores',
  'Atlantic/Reykjavik',
  'Atlantic/Faroe',
  'Arctic/Longyearbyen',
  'Asia/Nicosia',
  'Asia/Famagusta',
  'Africa/Ceuta',
  'America/Guadeloupe',
  'America/Martinique',
  'America/Cayenne',
  'America/St_Barthelemy',
  'America/Marigot',
  'Indian/Reunion',
  'Indian/Mayotte',
]);

/** Страны ЕС/ЕЭЗ, Великобритания и Швейцария — по региону языка, если часовой пояс неизвестен. */
const CONSENT_REGIONS = new Set('AT BE BG HR CY CZ DK EE FI FR DE GR HU IE IT LV LT LU MT NL PL PT RO SK SI ES SE IS LI NO GB CH'.split(' '));

/**
 * Нужен ли экран согласия: часовой пояс из списка выше; если пояса нет — регион языка системы (de-DE → DE).
 * Ни того, ни другого — спрашиваем (безопасный вариант).
 */
export function consentRegion(timeZone: string | undefined, langs: readonly string[]): boolean {
  if (timeZone) return CONSENT_ZONES.has(timeZone);
  const regions = langs.map((l) => l.split(/[-_]/)[1]?.toUpperCase()).filter((r): r is string => !!r);
  return regions.length === 0 || regions.some((r) => CONSENT_REGIONS.has(r));
}

/** Собирать ли статистику: игрок согласился, или не спрашивали и согласие в этой стране не нужно. */
export function analyticsAllowed(choice: AnalyticsChoice, needsConsent: boolean): boolean {
  return choice === 'yes' || (choice === '' && !needsConsent);
}

/** Экран согласия показываем один раз: в стране, где он нужен, пока игрок не выбрал. */
export function consentDue(choice: AnalyticsChoice, needsConsent: boolean): boolean {
  return choice === '' && needsConsent;
}
