// npm run verify — проверяет все уровни и кривую сложности.
// Ошибки (не решается, неверные звёзды, битые колоды облегчения, устаревшие метрики, недоступные светлячки,
// уровень с одним решением) роняют команду; отклонения от кривой — предупреждения.
// Обучающие уровни 1–10 сверяются со своей таблицей (CURVE ниже), уровни 11–90 — с планами миров (src/levels/curve.ts).
// До уровня 81 — не больше одной цепочки «ветер → лёд» на уровень.
// Уровни с туманом проверяются на «без угадывания» (fogFair): осторожный игрок, видящий только раскрытое, доходит до цели.
//   --world forest — в таблице только уровни этого мира; --md — таблица в Markdown (для отчёта).

import { LEVELS } from '../src/levels/index';
import { analyzeLevel } from '../src/core/difficulty';
import { solveLevel } from '../src/core/solver';
import { starThresholds } from '../src/core/game';
import { featuresOf, usesFeatures, windIceChains } from '../src/core/generator';
import type { Level } from '../src/core/types';
import { portalSides } from '../src/core/portal';
import { TIP_TEXT } from '../src/tutorial';
import { ALL_SLOTS, WIND_CHAIN_FREE_FROM, MEDIUM_MIN_ROADS, needsChoice, BREATHER_MAX_RATING, BREATHER_MIN_ROADS, EASY_MAX_RATING, EASY_MIN_ROADS, mustBeEasy, FIREFLY_FROM, MAX_H, MAX_W, NOVELTY, RATING_TOLERANCE, slotOf, type NoveltyTest, type Role } from '../src/levels/curve';
import { fogFair } from '../src/core/fog';
import { WORLDS, worldOf } from '../src/levels/worlds';

const onlyWorld = process.argv.includes('--world') ? process.argv[process.argv.indexOf('--world') + 1] : null;
const md = process.argv.includes('--md');

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
  /** В арку можно войти только сбоку (сверху и снизу — край поля или камень). */
  sideEntry?: boolean;
  note: string;
}

const lin = (i: number) => 4 + Math.round((i * 8) / 9); // 4 → 12 плиток к 10-му уровню
const A = (turns: boolean, lanterns: number, rocks: boolean, water: boolean) => ({ turns, lanterns, rocks, water });
const CURVE: Target[] = [
  { size: '3x4', infinite: true, maxTiles: lin(0), allows: A(false, 0, false, false), note: 'только «прямо»' },
  { size: '3x5', infinite: true, maxTiles: lin(1), allows: A(true, 0, false, false), note: 'повороты' },
  { size: '4x5', infinite: true, minRoads: 10, maxTiles: lin(2), allows: A(true, 1, false, false), note: 'фонарь' },
  { size: '4x5', infinite: true, minRoads: 10, maxTiles: lin(3), allows: A(true, 1, true, false), sideEntry: true, note: 'камни, вход в арку сбоку' },
  { size: '4x6', infinite: false, reserve: [5, 6], minRoads: 10, maxTiles: lin(4), allows: A(true, 1, true, false), note: 'первая колода' },
  { size: '5x6', infinite: false, reserve: [5, 6], minRoads: 10, maxTiles: lin(5), allows: A(true, 1, true, false), teachesStash: true, note: 'учим «отложить»' },
  { size: '5x6', infinite: false, reserve: [5, 6], minRoads: 10, maxTiles: lin(6), allows: A(true, 2, true, false), note: 'два фонаря' },
  { size: '5x7', infinite: false, reserve: [5, 6], minRoads: 10, maxTiles: lin(7), allows: A(true, 2, true, true), note: 'вода и мост' },
  { size: '5x7', infinite: false, reserve: [4, 4], minRoads: 5, maxTiles: lin(8), allows: A(true, 2, true, true), note: 'всё вместе' },
  { size: '6x7', infinite: false, reserve: [4, 4], minRoads: 5, maxTiles: lin(9), allows: A(true, 3, true, true), note: 'финал' },
];

const ROLE_RU: Record<Role, string> = { easy: 'лёгкий', medium: 'средний', breather: 'передышка', harder: 'сложнее', challenge: 'испытание' };

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

/** Новые элементы уровня — коротко для таблицы. */
function elementsOf(level: Level): string {
  const out: string[] = [];
  if (level.deck.includes('jump')) out.push('прыжок');
  if (level.turnBridges.length) out.push('мост');
  if (level.fades.length) out.push(`гаснущий ${level.fades.map((i) => level.fade[i]).join(',')}`);
  if (level.rings.length) out.push(`кольца ×${level.rings.length}`);
  if (level.fog) out.push('туман');
  if (level.shadow) out.push(`тень ${level.shadow}`);
  const n = (c: string) => level.cells.filter((x) => x === c).length;
  if (n('ice')) out.push(`лёд ×${n('ice')}`);
  if (n('drift')) out.push(`сугроб ×${n('drift')}`);
  if (n('wind')) out.push(`ветер ×${n('wind')}`);
  if (level.fires.length) out.push(`огни ×${level.fires.length}`);
  return out.join(' + ');
}

let errors = 0;
let warnings = 0;
let stashLevels = 0;
const rows: string[][] = [];
const notes: string[] = [];
const ratings = new Map<number, number>();

for (const [i, level] of LEVELS.entries()) {
  const t0 = performance.now();
  const base = { ...level, easeDecks: undefined, metrics: undefined };
  const r = analyzeLevel(base);
  const m = r.metrics;
  ratings.set(level.num, m.rating);
  const ms = Math.round(performance.now() - t0);
  const infinite = level.tileSet !== null;
  const size = `${level.width}x${level.height}`;
  const needsStash = r.solvable && !r.solvableWithoutStash;
  if (needsStash) stashLevels++;
  const err: string[] = [];
  const warn: string[] = [];

  if (!r.solvable) err.push('НЕ РЕШАЕТСЯ');
  if (level.tip && !(level.tip in TIP_TEXT)) err.push(`неизвестная подсказка tip: "${level.tip}"`);
  if (level.fog) {
    const f = fogFair(base);
    if (!f.ok) err.push(`туман: без угадывания не решить (осторожный игрок застрял на ходу ${f.stuckAt})`);
  }
  if (level.goal !== 'fireflies' && level.fireflies.length && r.maxFireflies < level.fireflies.length) {
    err.push(`светлячков ${level.fireflies.length}, а собрать за одну победу можно только ${r.maxFireflies}`);
  } else if (level.fireflies.length && !infinite && r.firefliesWithoutStash < level.fireflies.length) {
    err.push(`всех светлячков (${level.fireflies.length}) можно собрать только с «отложить» — без него ${r.firefliesWithoutStash}`);
  }
  const jm = level.metrics;
  if (!jm) err.push('нет метрик сложности — запусти npm run ease');
  else if (jm.rating !== m.rating || jm.roads !== m.roads || jm.minTiles !== m.minTiles || jm.reserve !== m.reserve || jm.trap !== m.trap) {
    err.push(`метрики в JSON устарели (рейтинг ${jm.rating} → ${m.rating}) — запусти npm run ease`);
  }
  if (!infinite && r.solvable) {
    const want = starThresholds(r.maxLeftover);
    if (level.stars.two !== want.two || level.stars.three !== want.three) {
      err.push(`звёзды ${level.stars.two}/${level.stars.three}, по формуле нужно ${want.two}/${want.three}`);
    }
    // 2★ и 3★ должны требовать разного: иначе вторая звезда ничего не значит (нужен запас хотя бы 3 плитки).
    if (level.stars.two >= level.stars.three) err.push(`пороги звёзд 2★ (${level.stars.two}) и 3★ (${level.stars.three}) не различаются — нужен больший запас`);
    // Колоды незаметного облегчения: +1 и +2 плитки к исходной, обе решаемы.
    if (!level.easeDecks || level.easeDecks.length < 2) {
      err.push('нет колод облегчения — запусти npm run ease');
    } else {
      level.easeDecks.forEach((d, k) => {
        if (d.length !== level.deck.length + k + 1 || !isSubsequence(level.deck, d)) err.push(`колода облегчения +${k + 1} не продолжает исходную — запусти npm run ease`);
        else if (!solveLevel(level, { deck: d, countRoads: false }).solvable) err.push(`колода облегчения +${k + 1} не решается`);
      });
    }
  }

  const t = CURVE[i];
  const slot = slotOf(level.num);
  let plan = '';
  if (t) {
    plan = t.note;
    const c = contents(level);
    if (size !== t.size) warn.push(`поле ${size}, по плану ${t.size}`);
    if (infinite !== t.infinite) warn.push(t.infinite ? 'по плану колода бесконечная' : 'по плану колода с лимитом');
    if (t.reserve && !infinite && (m.reserve < t.reserve[0] || m.reserve > t.reserve[1])) {
      warn.push(`запас ${m.reserve}, по плану ${t.reserve[0] === t.reserve[1] ? t.reserve[0] : `${t.reserve[0]}–${t.reserve[1]}`}`);
    }
    if (t.minRoads && r.roads < t.minRoads) warn.push(`решений ${r.roads}, по плану не меньше ${t.minRoads}`);
    if (r.minTiles > t.maxTiles) warn.push(`нужно ${r.minTiles} плиток, по плану не больше ${t.maxTiles}`);
    if (!t.allows.turns && !c.straightOnly) warn.push('повороты раньше времени');
    if (c.lanterns > t.allows.lanterns) warn.push(`фонарей ${c.lanterns}, можно не больше ${t.allows.lanterns}`);
    if (c.rocks && !t.allows.rocks) warn.push('камни раньше времени');
    if (c.water && !t.allows.water) warn.push('вода или мост раньше времени');
    if (level.fireflies.length) warn.push('светлячки раньше времени');
    const late = featuresOf(level).filter((f) => ['jump', 'turnbridge', 'fade', 'ring', 'fog', 'shadow', 'ice', 'drift', 'wind'].includes(f));
    if (late.length || level.goal !== 'classic') warn.push(`новые элементы раньше времени: ${[...late, level.goal].join(', ')}`);
    if (t.teachesStash && !needsStash) warn.push('учит «отложить», но решается без него');
    if (t.teachesStash && level.tutorial !== 'stash') warn.push('нет подсказки-обучения «отложить» (tutorial: "stash")');
    if (t.sideEntry) {
      const sides = portalSides(level);
      const vertical = sides[0].open || sides[2].open;
      const horizontal = sides[1].open || sides[3].open;
      if (vertical || !horizontal) warn.push('в арку должно быть можно войти только сбоку');
    }
  } else if (slot) {
    plan = `${slot.intro ? 'знакомство' : ROLE_RU[slot.role]} ~${slot.rating}${slot.goal === 'fireflies' ? ', светлячки' : slot.goal === 'escape' ? ', побег' : slot.goal === 'signals' ? ', огни' : ''}`;
    if (r.roads < 2) err.push('одно решение — по плану мира таких уровней нет');
    if (!usesFeatures(level, slot.needs)) err.push(`по плану нужны ${slot.needs.filter((f) => f === 'ice' || f === 'wind').join(' и ')}, но лучшее решение без них обходится`);
    if (level.num < WIND_CHAIN_FREE_FROM && windIceChains(level) > 1) err.push(`цепочек «ветер → лёд» ${windIceChains(level)} — до уровня ${WIND_CHAIN_FREE_FROM} можно не больше одной`);
    if (needsChoice(slot) && r.roads < MEDIUM_MIN_ROADS) err.push(`${ROLE_RU[slot.role]} — нужно решений ≥ ${MEDIUM_MIN_ROADS} (сейчас ${r.roads})`);
    if (level.goal !== (slot.goal ?? 'classic')) warn.push(`цель ${level.goal}, по плану ${slot.goal ?? 'classic'}`);
    if (mustBeEasy(slot) && (m.rating > EASY_MAX_RATING || r.roads < EASY_MIN_ROADS)) {
      err.push(`${slot.intro ? 'знакомство с механикой' : 'лёгкий'} — нужен рейтинг ≤ ${EASY_MAX_RATING} и решений ≥ ${EASY_MIN_ROADS} (сейчас ${m.rating} и ${r.roads})`);
    }
    if (slot.role === 'breather' && (m.rating > BREATHER_MAX_RATING || r.roads < BREATHER_MIN_ROADS)) {
      warn.push(`передышка должна быть лёгкой: рейтинг ≤ ${BREATHER_MAX_RATING} и решений ≥ ${BREATHER_MIN_ROADS} (сейчас ${m.rating} и ${r.roads})`);
    }
    if (level.width > slot.maxW || level.height > slot.maxH) warn.push(`поле ${size}, по плану не больше ${slot.maxW}x${slot.maxH}`);
    if (level.width > MAX_W || level.height > MAX_H) warn.push(`поле больше ${MAX_W}x${MAX_H}`);
    const f = featuresOf(level);
    const missing = slot.needs.filter((x) => !f.includes(x));
    const extra = f.filter((x) => !slot.needs.includes(x) && !slot.allows.includes(x));
    if (missing.length) warn.push(`по плану нужны: ${missing.join(', ')}`);
    if (extra.length) warn.push(`по плану нельзя: ${extra.join(', ')}`);
    if (level.num < FIREFLY_FROM && level.fireflies.length) warn.push(`светлячки — только с уровня ${FIREFLY_FROM}`);
    if (!!slot.night !== level.night) warn.push(slot.night ? 'по плану ночной уровень' : 'по плану не ночной');
    if (Math.abs(m.rating - slot.rating) > RATING_TOLERANCE) warn.push(`рейтинг ${m.rating}, по плану ${slot.rating} ± ${RATING_TOLERANCE}`);
  } else {
    warn.push('уровня нет в плане мира');
  }
  if (!t && needsStash) warn.push('требует «отложить» — это можно только на обучающем уровне');
  if (r.states > 60_000) warn.push(`решатель перебирает ${r.states} состояний — подсказка на телефоне будет думать долго`);
  errors += err.length ? 1 : 0;
  warnings += warn.length;

  const status = err.length ? '✗' : warn.length ? '!' : '✓';
  if (onlyWorld && worldOf(level).id !== onlyWorld) {
    for (const x of err) notes.push(`✗ ${level.num}. ${x}`);
    continue;
  }
  rows.push([
    String(level.num),
    level.name,
    size,
    infinite ? '∞' : String(level.deck.length),
    infinite ? '∞' : String(m.reserve),
    String(r.minTiles),
    r.roads >= 500 ? '500+' : String(r.roads),
    `${Math.round(m.trap * 100)}%`,
    m.rating.toFixed(1),
    plan,
    elementsOf(level),
    level.fireflies.length ? `${level.fireflies.length}${level.goal === 'fireflies' ? ' (цель)' : ''}` : '',
    infinite ? 'по отменам' : `${level.stars.two}/${level.stars.three} из ${r.maxLeftover}`,
    !level.allowStash ? '—' : needsStash ? 'нужно' : 'можно',
    `${ms} мс`,
    status,
  ]);
  for (const x of err) notes.push(`✗ ${level.num}. ${x}`);
  for (const x of warn) notes.push(`! ${level.num}. ${x}`);
}
if (stashLevels > 1) {
  notes.push(`! «Отложить» обязателен на ${stashLevels} уровнях, по плану — только на одном`);
  warnings++;
}

// «Пила» внутри каждого десятка мира: передышка легче средних, «сложнее» сложнее передышки, испытание — самое сложное.
const decades = [...new Set(ALL_SLOTS.map((s) => Math.floor((s.num - 1) / 10)))];
for (const d of decades) {
  const slots = ALL_SLOTS.filter((s) => Math.floor((s.num - 1) / 10) === d && ratings.has(s.num));
  if (slots.length < 10) continue;
  const rt = (role: Role) => slots.filter((s) => s.role === role).map((s) => ratings.get(s.num)!);
  const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
  const [lo, hi] = [d * 10 + 1, d * 10 + 10];
  const breather = rt('breather')[0];
  const harder = rt('harder')[0];
  const challenge = rt('challenge')[0];
  const others = slots.filter((s) => s.role !== 'challenge').map((s) => ratings.get(s.num)!);
  const saw: string[] = [];
  if (!(breather < avg(rt('medium')))) saw.push(`передышка (${breather}) не легче средних (${avg(rt('medium')).toFixed(1)})`);
  if (harder !== undefined && !(harder > breather)) saw.push(`«сложнее» (${harder}) не сложнее передышки (${breather})`);
  if (!(avg(rt('easy')) < avg(rt('medium')))) saw.push('лёгкие не легче средних');
  if (!(challenge >= Math.max(...others))) saw.push(`испытание (${challenge}) не самое сложное в десятке (${Math.max(...others)})`);
  for (const x of saw) notes.push(`! ${lo}–${hi}. «Пила»: ${x}`);
  warnings += saw.length;
}
// Рост сложности по миру: средний рейтинг каждого десятка (кроме обучения 1–10) выше предыдущего в том же мире.
const decadeAvg = (lo: number) => {
  const xs = [...ratings.entries()].filter(([n]) => n >= lo && n < lo + 10).map(([, r]) => r);
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN;
};
const avgLines: string[] = [];
for (const w of WORLDS) {
  const first = w.levels[0]?.num ?? 1;
  const starts = w.levels.filter((l) => (l.num - 1) % 10 === 0 && l.num > 10).map((l) => l.num);
  const avgs = starts.map((lo) => [lo, decadeAvg(lo)] as const).filter(([, a]) => !Number.isNaN(a));
  if (avgs.length) avgLines.push(`${w.id}: ${avgs.map(([lo, a]) => `${lo}–${lo + 9} — ${a.toFixed(1)}`).join(', ')}`);
  for (let k = 1; k < avgs.length; k++) {
    if (!(avgs[k][1] > avgs[k - 1][1])) {
      notes.push(`! Сложность не растёт по миру ${w.id}: ${avgs[k - 1][0]}–${avgs[k - 1][0] + 9} — ${avgs[k - 1][1].toFixed(1)}, ${avgs[k][0]}–${avgs[k][0] + 9} — ${avgs[k][1].toFixed(1)}`);
      warnings++;
    }
  }
  void first;
}

// Что-то новое примерно каждые 5 уровней: в каждом блоке плана есть его новинка.
const NOVEL: Record<NoveltyTest, (l: Level) => boolean> = {
  firefly: (l) => l.fireflies.length > 0,
  jump: (l) => l.deck.includes('jump'),
  ffgoal: (l) => l.goal === 'fireflies',
  turnbridge: (l) => l.turnBridges.length > 0,
  fade: (l) => l.fades.length > 0,
  valleyAll: (l) => l.deck.includes('jump') && l.turnBridges.length > 0 && l.fades.length > 0,
  ring: (l) => l.rings.length > 0,
  fog: (l) => l.fog,
  shadow: (l) => l.shadow > 0,
  ringFog: (l) => l.rings.length > 0 && l.fog,
  escape: (l) => l.goal === 'escape',
  combo: (l) => (l.deck.includes('jump') || l.turnBridges.length > 0 || l.fades.length > 0) && (l.rings.length > 0 || l.fog || l.shadow > 0),
  boss: (l) => l.goal === 'escape' && l.fog && l.rings.length > 0,
  ice: (l) => l.cells.includes('ice'),
  drift: (l) => l.cells.includes('drift'),
  iceDrift: (l) => l.cells.includes('ice') && l.cells.includes('drift'),
  wind: (l) => l.cells.includes('wind'),
  windPast: (l) => l.cells.includes('wind') && (l.cells.includes('ice') || l.turnBridges.length > 0 || l.rings.length > 0),
  signals: (l) => l.goal === 'signals',
  signalsMix: (l) => l.goal === 'signals' && (l.cells.includes('ice') || l.cells.includes('wind') || l.fog),
  summit: (l) => l.goal === 'signals' && l.cells.includes('ice') && l.cells.includes('wind'),
};
for (const b of NOVELTY) {
  const lv = LEVELS.filter((l) => l.num >= b.from && l.num <= b.to);
  const miss = lv.filter((l) => !NOVEL[b.test](l)).map((l) => l.num);
  if (miss.length) {
    notes.push(`! ${b.from}–${b.to} (${b.what}): нет новинки на уровнях ${miss.join(', ')}`);
    warnings++;
  }
}

const head = ['#', 'Уровень', 'Поле', 'Колода', 'Запас', 'Мин.', 'Решений', 'Тупики', 'Рейтинг', 'План', 'Новое', 'Светл.', 'Звёзды 2/3', '«Отложить»', 'Время', ''];
const widths = head.map((h, c) => Math.max(h.length, ...rows.map((r) => r[c].length)));
const line = (r: string[]) => r.map((v, c) => (c === 1 || c === 9 || c === 10 ? v.padEnd(widths[c]) : v.padStart(widths[c]))).join(' | ');
if (md) {
  // Markdown: без столбца времени.
  const cut = (r: string[]) => r.filter((_, c) => c !== 14);
  console.log('| ' + cut(head).map((h) => h || 'OK').join(' | ') + ' |');
  console.log('|' + cut(head).map(() => '---').join('|') + '|');
  for (const r of rows) console.log('| ' + cut(r).join(' | ') + ' |');
} else {
  console.log(line(head));
  console.log(widths.map((w) => '-'.repeat(w)).join('-|-'));
  for (const r of rows) console.log(line(r));
}
console.log('\nЗапас — плиток в колоде сверх минимума (∞ — колода бесконечная). Решений — разных дорог до выхода (считаем до 500).');
console.log('Тупики — доля случайных допустимых ходов, после которых уровень уже не решить (выборка 600 ходов).');
console.log('Рейтинг 1–10 = 1 + тупики (до 4) + мало решений (до 2) + малый запас (до 1,5) + длина пути (до 1,5), формула — ratingOf в src/core/difficulty.ts.');
console.log('Звёзды: с колодой — по оставшимся плиткам (3 — от макс. − 1, 2 — от половины); без лимита — 0 отмен 3, 1–2 отмены 2, больше 1.');
if (avgLines.length) console.log(`Средний рейтинг по десяткам: ${avgLines.join('; ')}`);
if (notes.length) console.log('\n' + notes.join('\n'));
if (errors) {
  console.error(`\nОшибок: ${errors}`);
  process.exit(1);
}
console.log(warnings ? `\nВсе уровни решаемы ✓, отклонений от кривой: ${warnings}` : '\nВсе уровни решаемы ✓, кривая соответствует плану ✓');
