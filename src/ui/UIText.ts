// UIText — единый компонент надписей под переводы на любой язык. У надписи есть контейнер (ширина и высота):
// текст переносится по словам до N строк (заголовки 2, описания 3–4), затем шрифт уменьшается до 70% от
// базового; длинные слова (немецкий, финский) переносятся по слогам-кускам с дефисом, если шире контейнера.
// Многоточие — только в крайнем случае, с записью в лог (ellipsisLog, console.warn).
// Проверка вёрстки (npm run i18n-check) читает контейнер из data 'ui' каждой надписи.

import Phaser from 'phaser';
import { keyOfText } from '../i18n';
import { C, FONT } from './theme';

export interface UITextOpts {
  /** Ширина контейнера (px раскладки 1080×1920). */
  w: number;
  /** Высота контейнера; по умолчанию — lines строк базового размера. */
  h?: number;
  /** Сколько строк можно (заголовок 2, описание 3–4, кнопка 1–2). */
  lines?: number;
  size: number;
  /** Нижняя граница уменьшения (доля базового размера). */
  minScale?: number;
  color?: string;
  bold?: boolean;
  align?: 'left' | 'center' | 'right';
  originX?: number;
  originY?: number;
  lineSpacing?: number;
}

/** Что пришлось обрезать многоточием (для i18n-check и отладки). */
export const ellipsisLog: { text: string; key?: string; w: number }[] = [];

/** Контейнер надписи для проверки вёрстки: ширина, высота и ключ перевода. */
export interface UIBox {
  w: number;
  h: number;
  key?: string;
  src: string;
}

let measureCtx: CanvasRenderingContext2D | null = null;
function ctx(): CanvasRenderingContext2D {
  if (!measureCtx) measureCtx = document.createElement('canvas').getContext('2d')!;
  return measureCtx;
}

export function fontCss(size: number, bold: boolean) {
  return `${bold ? 'bold ' : ''}${size}px ${FONT}`;
}

/** Ширина строки в px. */
export function measure(str: string, size: number, bold = true): number {
  const c = ctx();
  c.font = fontCss(size, bold);
  return c.measureText(str).width;
}

/** Длинное слово → куски не шире w (с дефисом на конце каждого, кроме последнего). */
function breakWord(word: string, w: number, size: number, bold: boolean): string[] {
  const out: string[] = [];
  let cur = '';
  for (const ch of [...word]) {
    if (cur && measure(cur + ch + '-', size, bold) > w) {
      out.push(cur + '-');
      cur = ch;
    } else cur += ch;
  }
  if (cur) out.push(cur);
  return out;
}

/** Перенос по словам в ширину w. Явные \n сохраняются. */
export function wrapLines(str: string, w: number, size: number, bold = true): string[] {
  const lines: string[] = [];
  for (const para of str.split('\n')) {
    let cur = '';
    for (const raw of para.split(/ +/)) {
      if (!raw) continue;
      const pieces = measure(raw, size, bold) > w ? breakWord(raw, w, size, bold) : [raw];
      for (let i = 0; i < pieces.length; i++) {
        const word = pieces[i];
        const cand = cur ? `${cur} ${word}` : word;
        if (!cur || measure(cand, size, bold) <= w) cur = cand;
        else {
          lines.push(cur);
          cur = word;
        }
        // Кусок разбитого слова всегда заканчивает строку (кроме последнего).
        if (i < pieces.length - 1) {
          lines.push(cur);
          cur = '';
        }
      }
    }
    lines.push(cur);
  }
  return lines;
}

export interface Fit {
  lines: string[];
  size: number;
  ellipsis: boolean;
}

/** Подбор: сначала перенос до maxLines, потом уменьшение до minScale, в крайнем случае — многоточие. */
export function fitLines(str: string, o: { w: number; h?: number; lines?: number; size: number; minScale?: number; bold?: boolean; lineSpacing?: number }): Fit {
  const bold = o.bold ?? true;
  const maxLines = o.lines ?? 1;
  const minSize = Math.max(8, Math.floor(o.size * (o.minScale ?? 0.7)));
  const lh = (s: number) => s * 1.36 + (o.lineSpacing ?? 0);
  const h = o.h ?? lh(o.size) * maxLines;
  const step = Math.max(1, Math.round(o.size * 0.04));
  for (let size = o.size; ; size = Math.max(minSize, size - step)) {
    const lines = wrapLines(str, o.w, size, bold);
    if (lines.length <= maxLines && lines.length * lh(size) <= h + 1) return { lines, size, ellipsis: false };
    if (size <= minSize) break;
  }
  // Крайний случай: минимальный размер, сколько влезает строк, последняя — с многоточием.
  const lines = wrapLines(str, o.w, minSize, bold);
  const fitN = Math.max(1, Math.min(maxLines, Math.floor((h + 1) / lh(minSize))));
  const kept = lines.slice(0, fitN);
  let last = kept[fitN - 1] ?? '';
  while (last && measure(last + '…', minSize, bold) > o.w) last = last.slice(0, -1).trimEnd();
  kept[fitN - 1] = last + '…';
  return { lines: kept, size: minSize, ellipsis: true };
}

/** Применить подбор к готовому тексту Phaser (например, после смены языка или числа). */
export function setFitted(t: Phaser.GameObjects.Text, str: string, o: UITextOpts) {
  const f = fitLines(str, o);
  if (f.ellipsis) {
    const key = keyOfText(str);
    ellipsisLog.push({ text: str, key, w: o.w });
    console.warn(`[ui] ellipsis: "${str}"${key ? ` (${key})` : ''} in ${o.w}px`);
  }
  t.setFontSize(f.size);
  t.setText(f.lines.join('\n'));
  const h = o.h ?? (o.size * 1.36 + (o.lineSpacing ?? 0)) * (o.lines ?? 1);
  t.setData('ui', { w: o.w, h, key: keyOfText(str), src: str } satisfies UIBox);
  return t;
}

/** Надпись в контейнере w×h с переносом, уменьшением и (в крайнем случае) многоточием. */
export function uiText(scene: Phaser.Scene, x: number, y: number, str: string, o: UITextOpts): Phaser.GameObjects.Text {
  const t = scene.add
    .text(x, y, '', {
      fontFamily: FONT,
      fontSize: `${o.size}px`,
      color: o.color ?? C.text,
      fontStyle: o.bold === false ? 'normal' : 'bold',
      align: o.align ?? 'center',
      lineSpacing: o.lineSpacing ?? 0,
    })
    .setOrigin(o.originX ?? 0.5, o.originY ?? 0.5);
  return setFitted(t, str, o);
}
