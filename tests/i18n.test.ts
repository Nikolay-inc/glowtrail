import { afterEach, describe, expect, it } from 'vitest';
import { allKeys, format, pseudo, setLocale, systemLang, table, tk, type Lang } from '../src/i18n';
import { fitLines, wrapLines } from '../src/ui/UIText';
import { WARDROBE, SETS } from '../src/core/wardrobe';
import { VILLAGE } from '../src/core/economy';

describe('i18n: шаблоны, множественное число, числа', () => {
  afterEach(() => setLocale('ru'));

  it('подстановки и plural по Intl.PluralRules для ru / uk / en', () => {
    setLocale('ru');
    expect(tk('profile_stars', { n: 1 })).toBe('звезда');
    expect(tk('profile_stars', { n: 3 })).toBe('звезды');
    expect(tk('profile_stars', { n: 11 })).toBe('звёзд');
    expect(tk('profile_stars', { n: 21 })).toBe('звезда');
    expect(tk('restored_title', { name: 'Колодец' })).toBe('Колодец: снова горит свет!');
    setLocale('en');
    expect(tk('rollback_ask', { n: 1 })).toMatch(/1/);
    expect(tk('rollback_ask', { n: 1 })).not.toBe(tk('rollback_ask', { n: 2 }).replace('2', '1'));
    setLocale('uk');
    expect(tk('dist_exit', { n: 5 })).toContain('5');
  });

  it('числа — по языку, значки валют остаются', () => {
    setLocale('en');
    expect(format('{n} {coin}', { n: 12345 })).toBe('12,345 {coin}');
    setLocale('ru');
    expect(format('{n}', { n: 12345 }).replace(/\s/g, ' ')).toBe('12 345');
  });

  it('псевдо-язык: длиннее на 40%, акценты, скобки, значки не трогает', () => {
    const p = pseudo('Restore {coin}');
    expect(p.startsWith('[') && p.endsWith(']')).toBe(true);
    expect(p).toContain('{coin}');
    expect(p).toMatch(/Ŕéšţóŕé/);
    expect(p.length).toBeGreaterThanOrEqual(Math.floor('Restore '.length * 1.4));
  });

  it('язык системы: uk, ru (и be/kk), остальное — en', () => {
    expect(systemLang(['uk-UA'])).toBe('uk');
    expect(systemLang(['be-BY'])).toBe('ru');
    expect(systemLang(['de-DE', 'ru'])).toBe('ru');
    expect(systemLang(['pl-PL'])).toBe('en');
  });

  it('у каждой вещи, набора и постройки есть тексты на всех языках', () => {
    const need = [...WARDROBE.map((w) => `item.${w.id}`), ...SETS.map((s) => `set.${s.id}`), ...VILLAGE.map((v) => `building.${v.id}.name`)];
    for (const lang of ['ru', 'en', 'uk'] as Lang[]) for (const k of need) expect(table(lang)[k], `${lang}: ${k}`).toBeTruthy();
    for (const lang of ['en', 'uk'] as Lang[]) expect(Object.keys(table(lang)).sort()).toEqual([...allKeys()].sort());
  });
});

describe('UIText: перенос, уменьшение, многоточие', () => {
  // В тестах нет canvas — ширина символа ~0,6 размера шрифта (подмена measure через document).
  const fakeCtx = { font: '16px x', measureText(s: string) { return { width: s.length * parseFloat(this.font.replace(/^bold /, '')) * 0.6 }; } };
  (globalThis as unknown as { document: unknown }).document = { createElement: () => ({ getContext: () => fakeCtx }) };

  it('переносит по словам и разбивает длинное слово с дефисом', () => {
    expect(wrapLines('aa bb cc', 30, 10)).toEqual(['aa bb', 'cc']);
    const long = wrapLines('Donaudampfschifffahrt', 60, 10);
    expect(long.length).toBeGreaterThan(1);
    expect(long[0].endsWith('-')).toBe(true);
  });

  it('сначала строки, потом уменьшение до 70%, потом многоточие', () => {
    expect(fitLines('aa bb cc dd', { w: 60, lines: 2, size: 10 }).ellipsis).toBe(false);
    const shrink = fitLines('aaaa bbbb cccc', { w: 50, lines: 2, size: 10 });
    expect(shrink.size).toBeLessThan(10);
    expect(shrink.size).toBeGreaterThanOrEqual(7);
    const cut = fitLines('word '.repeat(40), { w: 50, lines: 2, size: 10 });
    expect(cut.ellipsis).toBe(true);
    expect(cut.lines).toHaveLength(2);
    expect(cut.lines[1].endsWith('…')).toBe(true);
  });
});
