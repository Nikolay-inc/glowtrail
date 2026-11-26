// Переводы интерфейса: все тексты — по ключам из src/i18n/<язык>.json. Строки — шаблоны с подстановками
// («{name}: снова горит свет!»), без склейки кусков; множественное число — `{n, plural, one {# монета} few {…} …}`
// по Intl.PluralRules, числа — Intl.NumberFormat. Псевдо-язык «qps» (проверка вёрстки): английская строка,
// длиннее на 40%, с акцентами и в [скобках] — npm run i18n-check.

import ru from './ru.json';
import en from './en.json';
import uk from './uk.json';

export type StringKey = keyof typeof ru;
export type Lang = 'ru' | 'en' | 'uk';
export type Locale = Lang | 'qps';
export const LANGS: readonly Lang[] = ['ru', 'en', 'uk'];

const TABLES: Record<Lang, Record<string, string>> = { ru, en, uk };

let locale: Locale = 'ru';
const listeners = new Set<(l: Locale) => void>();

/** Язык системы: ru / uk, иначе английский (белорусский и казахский интерфейс — пока русский). */
export function systemLang(langs: readonly string[] = typeof navigator !== 'undefined' ? navigator.languages ?? [navigator.language] : []): Lang {
  for (const l of langs) {
    const p = l.toLowerCase().slice(0, 2);
    if (p === 'uk') return 'uk';
    if (p === 'ru' || p === 'be' || p === 'kk') return 'ru';
    if (p === 'en') return 'en';
  }
  return langs.length ? 'en' : 'ru';
}

export function setLocale(l: Locale) {
  if (l === locale) return;
  locale = l;
  if (typeof document !== 'undefined' && document.documentElement) document.documentElement.lang = l === 'qps' ? 'en' : l;
  for (const f of listeners) f(l);
}

export const getLocale = () => locale;
export const onLocaleChange = (f: (l: Locale) => void) => {
  listeners.add(f);
  return () => listeners.delete(f);
};

/** Язык для Intl (псевдо-язык форматирует как английский). */
const intlLang = () => (locale === 'qps' ? 'en' : locale);

const nfCache = new Map<string, Intl.NumberFormat>();
const prCache = new Map<string, Intl.PluralRules>();

/** Число по правилам языка: 1 234 / 1,234. */
export function fmt(n: number): string {
  const l = intlLang();
  let f = nfCache.get(l);
  if (!f) nfCache.set(l, (f = new Intl.NumberFormat(l)));
  return f.format(n);
}

function pluralCat(n: number): string {
  const l = intlLang();
  let r = prCache.get(l);
  if (!r) prCache.set(l, (r = new Intl.PluralRules(l)));
  return r.select(n);
}

export type Params = Record<string, string | number>;

/** Подстановка в шаблон: {name}, {n, plural, one {...} other {...}} (с # — число). Числа форматируются. */
export function format(tpl: string, params: Params = {}): string {
  let out = '';
  let i = 0;
  while (i < tpl.length) {
    const ch = tpl[i];
    if (ch !== '{') {
      out += ch;
      i++;
      continue;
    }
    const end = matchBrace(tpl, i);
    if (end < 0) {
      out += tpl.slice(i);
      break;
    }
    const body = tpl.slice(i + 1, end);
    i = end + 1;
    const m = /^\s*(\w+)\s*(?:,\s*plural\s*,(.*))?$/s.exec(body);
    if (!m) {
      out += `{${body}}`;
      continue;
    }
    const [, name, forms] = m;
    if (forms === undefined) {
      // Значки валют {coin} / {light} и неизвестные параметры остаются как есть.
      if (!(name in params)) out += `{${name}}`;
      else out += typeof params[name] === 'number' ? fmt(params[name] as number) : String(params[name]);
      continue;
    }
    const n = Number(params[name] ?? 0);
    const options = parseForms(forms);
    const exact = options[`=${n}`];
    const chosen = exact ?? options[pluralCat(n)] ?? options.other ?? '';
    out += format(chosen, params).replace(/#/g, fmt(n));
  }
  return out;
}

function matchBrace(s: string, start: number): number {
  let depth = 0;
  for (let j = start; j < s.length; j++) {
    if (s[j] === '{') depth++;
    else if (s[j] === '}' && --depth === 0) return j;
  }
  return -1;
}

function parseForms(s: string): Record<string, string> {
  const out: Record<string, string> = {};
  let i = 0;
  while (i < s.length) {
    const m = /^\s*(=?\w+)\s*\{/.exec(s.slice(i));
    if (!m) break;
    const open = i + m[0].length - 1;
    const close = matchBrace(s, open);
    if (close < 0) break;
    out[m[1]] = s.slice(open + 1, close);
    i = close + 1;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Псевдо-язык

const ACCENTS: Record<string, string> = {
  a: 'á', b: 'ƀ', c: 'ç', d: 'ď', e: 'é', f: 'ƒ', g: 'ğ', h: 'ĥ', i: 'í', j: 'ĵ', k: 'ķ', l: 'ĺ', m: 'ɱ', n: 'ñ', o: 'ó', p: 'þ', q: 'ǫ', r: 'ŕ', s: 'š', t: 'ţ', u: 'ú', v: 'ṽ', w: 'ŵ', x: 'ẋ', y: 'ý', z: 'ž',
  A: 'Á', B: 'Ɓ', C: 'Ç', D: 'Ď', E: 'É', F: 'Ƒ', G: 'Ğ', H: 'Ĥ', I: 'Í', J: 'Ĵ', K: 'Ķ', L: 'Ĺ', M: 'Ṁ', N: 'Ñ', O: 'Ó', P: 'Þ', Q: 'Ǫ', R: 'Ŕ', S: 'Š', T: 'Ţ', U: 'Ú', V: 'Ṽ', W: 'Ŵ', X: 'Ẋ', Y: 'Ý', Z: 'Ž',
};
const PAD = 'ļőŕéɱ íþšúɱ ďőĺőŕ šíţ áɱéţ çőñšéçţéţúŕ';

/** «Settings» → «[Šéţţíñğš ļőŕé]»: акценты, +40% длины, скобки. Значки {coin}/{light} и переносы не трогаем. */
export function pseudo(s: string): string {
  const parts = s.split(/(\{coin\}|\{light\}|\n)/);
  let letters = 0;
  const body = parts
    .map((p) => {
      if (p === '{coin}' || p === '{light}' || p === '\n') return p;
      letters += p.length;
      return [...p].map((c) => ACCENTS[c] ?? c).join('');
    })
    .join('');
  const extra = Math.ceil(letters * 0.4);
  const pad = extra > 0 ? ' ' + PAD.repeat(Math.ceil(extra / PAD.length)).slice(0, Math.max(1, extra - 1)) : '';
  return `[${body}${pad}]`;
}

// ---------------------------------------------------------------------------
// Перевод

/** Строка по ключу → ключ (для проверки вёрстки: какая надпись вылезла). */
const reverse = new Map<string, string>();
export const keyOfText = (s: string) => reverse.get(s);

export function hasKey(key: string): boolean {
  return key in ru;
}

/** Текст по ключу с подстановкой параметров. */
export function t(key: StringKey, params: Params = {}): string {
  return tk(key, params);
}

/** Ключи, которых нет ни в одном языке (показан сам ключ) — для i18n-check. */
export const missingKeys = new Set<string>();

/** То же для ключей, собранных из данных (`item.${id}`): нет ключа — сам ключ (и тест это ловит). */
export function tk(key: string, params: Params = {}): string {
  const lang: Lang = locale === 'qps' ? 'en' : locale;
  const found = TABLES[lang][key] ?? TABLES.en[key] ?? TABLES.ru[key];
  if (found === undefined) missingKeys.add(key);
  const raw = found ?? key;
  let out = format(raw, params);
  if (locale === 'qps') out = pseudo(out);
  if (reverse.size > 5000) reverse.clear();
  reverse.set(out, key);
  return out;
}

/** Все ключи (для тестов и i18n-check). */
export function allKeys(): StringKey[] {
  return Object.keys(ru) as StringKey[];
}

export function table(lang: Lang): Record<string, string> {
  return TABLES[lang];
}
