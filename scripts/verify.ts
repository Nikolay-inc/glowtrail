// npm run verify — проверяет, что каждый уровень решаем, и что кривая сложности соответствует плану.
// Ошибки (уровень не решается, неверные звёзды) роняют команду; отклонения от кривой — предупреждения.

import { LEVELS } from '../src/levels/index';
import { solveLevel } from '../src/core/solver';
import { starThresholds } from '../src/core/game';
import type { Level } from '../src/core/types';

/** Целевая кривая: размер поля, запас плиток сверх минимума, число решений, что вводим. */
interface Target {
  size: string;
  reserve: number;
  roads?: [number, number];
  /** Элементы, которые уже можно использовать. */
  allows: { turns: boolean; lanterns: number; rocks: boolean; water: boolean; stash: boolean };
  /** Уровень должен требовать «отложить». */
  needsStash?: boolean;
  note: string;
}

const T = (size: string, reserve: number, roads: [number, number] | undefined, lanterns: number, rocks: boolean, stash: boolean, water: boolean, note: string, needsStash = false): Target => ({
  size,
  reserve,
  roads,
  allows: { turns: size !== '3x5', lanterns, rocks, water, stash },
  needsStash,
  note,
});
const INF = Infinity;
const CURVE: Target[] = [
  T('3x5', 0, undefined, 0, false, false, false, 'обучение, только «прямо»'),
  T('4x5', 2, undefined, 0, false, false, false, 'повороты'),
  T('5x5', 3, [5, INF], 1, false, false, false, 'первый фонарь'),
  T('5x6', 3, [5, INF], 2, false, false, false, 'два фонаря'),
  T('5x6', 4, undefined, 2, false, false, false, 'отдых'),
  T('5x7', 3, [4, INF], 2, true, false, false, 'камни'),
  T('5x7', 3, undefined, 2, true, true, false, 'учим «отложить»', true),
  T('6x7', 3, [4, INF], 2, true, true, true, 'вода и мост'),
  T('6x8', 2, [3, INF], 3, true, true, true, 'всё вместе'),
  T('6x8', 1, [1, 2], 3, true, true, true, 'финал мира'),
];

function contents(level: Level) {
  return {
    straightOnly: level.deck.every((t) => t === 'straight' || t === 'straight2'),
    lanterns: level.lanterns.length,
    rocks: level.cells.includes('rock'),
    water: level.cells.includes('water') || level.deck.includes('bridge'),
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
const rows: string[][] = [];
const notes: string[] = [];

for (const [i, level] of LEVELS.entries()) {
  const t0 = performance.now();
  const r = solveLevel(level);
  const noStash = solveLevel(level, { allowStash: false, countRoads: false });
  const ms = Math.round(performance.now() - t0);
  const size = `${level.width}x${level.height}`;
  const reserve = r.solvable ? level.deck.length - r.minTiles : -1;
  const want = starThresholds(r.maxLeftover);
  const err: string[] = [];
  const warn: string[] = [];

  if (!r.solvable) err.push('НЕ РЕШАЕТСЯ');
  if (r.solvable && (level.stars.two !== want.two || level.stars.three !== want.three)) {
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

  const t = CURVE[i];
  if (t) {
    const c = contents(level);
    if (size !== t.size) warn.push(`размер ${size}, по плану ${t.size}`);
    if (reserve !== t.reserve) warn.push(`запас ${reserve}, по плану ${t.reserve}`);
    if (t.roads && (r.roads < t.roads[0] || r.roads > t.roads[1])) {
      warn.push(`решений ${r.roads}, по плану ${t.roads[1] === INF ? `${t.roads[0]}+` : `${t.roads[0]}–${t.roads[1]}`}`);
    }
    if (!t.allows.turns && !c.straightOnly) warn.push('повороты раньше времени');
    if (c.lanterns > t.allows.lanterns) warn.push(`фонарей ${c.lanterns}, можно не больше ${t.allows.lanterns}`);
    if (c.rocks && !t.allows.rocks) warn.push('камни раньше времени');
    if (c.water && !t.allows.water) warn.push('вода или мост раньше времени');
    if (!t.allows.stash && !noStash.solvable) warn.push('нужен «отложить», а его ещё не учили');
    if (t.needsStash && noStash.solvable) warn.push('должен требовать «отложить», но решается без него');
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
    String(level.deck.length),
    String(reserve),
    String(r.roads),
    `${level.stars.two}/${level.stars.three} из ${r.maxLeftover}`,
    noStash.solvable ? 'нет' : 'да',
    `${ms} мс`,
    status,
  ]);
  for (const m of err) notes.push(`✗ ${level.id}. ${m}`);
  for (const m of warn) notes.push(`! ${level.id}. ${m}`);
}

const head = ['#', 'Уровень', 'Поле', 'Плиток', 'Запас', 'Решений', 'Звёзды 2/3', 'Нужно «отложить»', 'Время', ''];
const widths = head.map((h, c) => Math.max(h.length, ...rows.map((r) => r[c].length)));
const line = (r: string[]) => r.map((v, c) => (c === 1 ? v.padEnd(widths[c]) : v.padStart(widths[c]))).join(' | ');
console.log(line(head));
console.log(widths.map((w) => '-'.repeat(w)).join('-|-'));
for (const r of rows) console.log(line(r));
console.log('\nЗапас — сколько плиток в колоде сверх минимума. Решений — разных дорог до выхода (меньше = сложнее).');
console.log('Звёзды: 3 — осталось ≥ (макс. остаток − 1), 2 — ≥ половины макс. остатка; «из N» — макс. остаток.');
if (notes.length) console.log('\n' + notes.join('\n'));
if (errors) {
  console.error(`\nОшибок: ${errors}`);
  process.exit(1);
}
console.log(warnings ? `\nВсе уровни решаемы ✓, отклонений от кривой: ${warnings}` : '\nВсе уровни решаемы ✓, кривая соответствует плану ✓');
