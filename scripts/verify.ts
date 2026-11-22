// npm run verify — проверяет, что каждый уровень решаем, и что кривая сложности соответствует плану.
// Ошибки (уровень не решается, неверные звёзды, битые колоды облегчения) роняют команду;
// отклонения от кривой — предупреждения.

import { LEVELS } from '../src/levels/index';
import { solveLevel } from '../src/core/solver';
import { starThresholds } from '../src/core/game';
import type { Level } from '../src/core/types';

/** Целевая кривая обучающих уровней 1–10. */
interface Target {
  size: string;
  /** Бесконечная колода (без лимита плиток). */
  infinite: boolean;
  /** Запас плиток сверх минимума (для уровней с колодой). */
  reserve?: [number, number];
  /** Минимум разных решений. */
  minRoads?: number;
  /** Сколько плиток максимум нужно для прохождения. */
  maxTiles: number;
  /** Что уже можно использовать на поле. */
  allows: { turns: boolean; lanterns: number; rocks: boolean; water: boolean };
  /** Этот уровень учит «отложить» и должен его требовать. */
  teachesStash?: boolean;
  note: string;
}

const lin = (i: number) => 4 + Math.round((i * 8) / 9); // 4 → 12 плиток к 10-му уровню
const A = (turns: boolean, lanterns: number, rocks: boolean, water: boolean) => ({ turns, lanterns, rocks, water });
const CURVE: Target[] = [
  { size: '3x4', infinite: true, maxTiles: lin(0), allows: A(false, 0, false, false), note: 'только «прямо»' },
  { size: '3x5', infinite: true, maxTiles: lin(1), allows: A(true, 0, false, false), note: 'повороты' },
  { size: '4x5', infinite: true, minRoads: 10, maxTiles: lin(2), allows: A(true, 1, false, false), note: 'фонарь' },
  { size: '4x5', infinite: true, minRoads: 10, maxTiles: lin(3), allows: A(true, 1, true, false), note: 'камни' },
  { size: '4x6', infinite: false, reserve: [5, 6], minRoads: 10, maxTiles: lin(4), allows: A(true, 1, true, false), note: 'первая колода' },
  { size: '5x6', infinite: false, reserve: [5, 6], minRoads: 10, maxTiles: lin(5), allows: A(true, 1, true, false), teachesStash: true, note: 'учим «отложить»' },
  { size: '5x6', infinite: false, reserve: [5, 6], minRoads: 10, maxTiles: lin(6), allows: A(true, 2, true, false), note: 'два фонаря' },
  { size: '5x7', infinite: false, reserve: [5, 6], minRoads: 10, maxTiles: lin(7), allows: A(true, 2, true, true), note: 'вода и мост' },
  { size: '5x7', infinite: false, reserve: [4, 4], minRoads: 5, maxTiles: lin(8), allows: A(true, 2, true, true), note: 'всё вместе' },
  { size: '6x7', infinite: false, reserve: [4, 4], minRoads: 5, maxTiles: lin(9), allows: A(true, 3, true, true), note: 'финал' },
];

function contents(level: Level) {
  const tiles = level.tileSet ?? level.deck;
  return {
    straightOnly: tiles.every((t) => t === 'straight' || t === 'straight2'),
    lanterns: level.lanterns.length,
    rocks: level.cells.includes('rock'),
    water: level.cells.includes('water') || tiles.includes('bridge'),
  };
}

/** Все плитки a встречаются в b в том же порядке. */
function isSubsequence(a: string[], b: string[]) {
  let i = 0;
  for (const x of b) if (x === a[i]) i++;
  return i === a.length;
}

let errors = 0;
let warnings = 0;
let stashLevels = 0;
const rows: string[][] = [];
const notes: string[] = [];

for (const [i, level] of LEVELS.entries()) {
  const t0 = performance.now();
  const r = solveLevel(level);
  const noStash = solveLevel(level, { allowStash: false, countRoads: false });
  const ms = Math.round(performance.now() - t0);
  const infinite = level.tileSet !== null;
  const size = `${level.width}x${level.height}`;
  const reserve = infinite ? Infinity : r.solvable ? level.deck.length - r.minTiles : -1;
  const needsStash = r.solvable && !noStash.solvable;
  if (needsStash) stashLevels++;
  const err: string[] = [];
  const warn: string[] = [];

  if (!r.solvable) err.push('НЕ РЕШАЕТСЯ');
  if (!infinite && r.solvable) {
    const want = starThresholds(r.maxLeftover);
    if (level.stars.two !== want.two || level.stars.three !== want.three) {
      err.push(`звёзды ${level.stars.two}/${level.stars.three}, по формуле нужно ${want.two}/${want.three}`);
    }
    // Колоды незаметного облегчения: +1 и +2 плитки к исходной, обе решаемы.
    if (!level.easeDecks || level.easeDecks.length < 2) {
      warn.push('нет колод облегчения — запусти npm run ease');
    } else {
      level.easeDecks.forEach((d, k) => {
        if (d.length !== level.deck.length + k + 1 || !isSubsequence(level.deck, d)) err.push(`колода облегчения +${k + 1} не продолжает исходную — запусти npm run ease`);
        else if (!solveLevel(level, { deck: d, countRoads: false }).solvable) err.push(`колода облегчения +${k + 1} не решается`);
      });
    }
  }

  const t = CURVE[i];
  if (t) {
    const c = contents(level);
    if (size !== t.size) warn.push(`поле ${size}, по плану ${t.size}`);
    if (infinite !== t.infinite) warn.push(t.infinite ? 'по плану колода бесконечная' : 'по плану колода с лимитом');
    if (t.reserve && !infinite && (reserve < t.reserve[0] || reserve > t.reserve[1])) {
      warn.push(`запас ${reserve}, по плану ${t.reserve[0] === t.reserve[1] ? t.reserve[0] : `${t.reserve[0]}–${t.reserve[1]}`}`);
    }
    if (t.minRoads && r.roads < t.minRoads) warn.push(`решений ${r.roads}, по плану не меньше ${t.minRoads}`);
    if (r.minTiles > t.maxTiles) warn.push(`нужно ${r.minTiles} плиток, по плану не больше ${t.maxTiles}`);
    if (!t.allows.turns && !c.straightOnly) warn.push('повороты раньше времени');
    if (c.lanterns > t.allows.lanterns) warn.push(`фонарей ${c.lanterns}, можно не больше ${t.allows.lanterns}`);
    if (c.rocks && !t.allows.rocks) warn.push('камни раньше времени');
    if (c.water && !t.allows.water) warn.push('вода или мост раньше времени');
    if (t.teachesStash && !needsStash) warn.push('учит «отложить», но решается без него');
    if (!t.teachesStash && needsStash) warn.push('требует «отложить» — это можно только на обучающем уровне');
    if (t.teachesStash && level.tutorial !== 'stash') warn.push('нет подсказки-обучения «отложить» (tutorial: "stash")');
  } else {
    warn.push('уровня нет в целевой кривой');
  }
  errors += err.length ? 1 : 0;
  warnings += warn.length;

  const status = err.length ? '✗' : warn.length ? '!' : '✓';
  rows.push([
    String(level.id),
    level.name,
    size,
    infinite ? '∞' : String(level.deck.length),
    infinite ? '∞' : String(reserve),
    String(r.minTiles),
    String(r.roads),
    infinite ? 'по отменам' : `${level.stars.two}/${level.stars.three} из ${r.maxLeftover}`,
    !level.allowStash ? '—' : needsStash ? 'нужно' : 'можно',
    `${ms} мс`,
    status,
  ]);
  for (const m of err) notes.push(`✗ ${level.id}. ${m}`);
  for (const m of warn) notes.push(`! ${level.id}. ${m}`);
}
if (stashLevels > 1) {
  notes.push(`! «Отложить» обязателен на ${stashLevels} уровнях, по плану — только на одном`);
  warnings++;
}

const head = ['#', 'Уровень', 'Поле', 'Колода', 'Запас', 'Мин. плиток', 'Решений', 'Звёзды 2/3', '«Отложить»', 'Время', ''];
const widths = head.map((h, c) => Math.max(h.length, ...rows.map((r) => r[c].length)));
const line = (r: string[]) => r.map((v, c) => (c === 1 ? v.padEnd(widths[c]) : v.padStart(widths[c]))).join(' | ');
console.log(line(head));
console.log(widths.map((w) => '-'.repeat(w)).join('-|-'));
for (const r of rows) console.log(line(r));
console.log('\nЗапас — плиток в колоде сверх минимума (∞ — колода бесконечная). Решений — разных дорог до выхода.');
console.log('Звёзды: с колодой — по оставшимся плиткам (3 — от макс. − 1, 2 — от половины); без лимита — 0 отмен 3, 1–2 отмены 2, больше 1.');
console.log('«Отложить»: — слот скрыт, можно — есть, но не обязателен, нужно — без него не решить.');
if (notes.length) console.log('\n' + notes.join('\n'));
if (errors) {
  console.error(`\nОшибок: ${errors}`);
  process.exit(1);
}
console.log(warnings ? `\nВсе уровни решаемы ✓, отклонений от кривой: ${warnings}` : '\nВсе уровни решаемы ✓, кривая соответствует плану ✓');
