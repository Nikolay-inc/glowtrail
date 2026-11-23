// npm run gen -- --count 300 --size 5x6 --features lantern,rock,water --seed N [--reserve 2-7]
// Генерирует кандидатов в уровни и сохраняет их с метриками в generated/ (в игру они не попадают).
// Отбрасывает нерешаемые, уровни с 1 решением, «скучные» (почти любой ход годится), требующие «отложить»
// и уровни, где не собрать всех светлячков. Из кандидатов уровни выбирает npm run pick.

import { mkdirSync, writeFileSync } from 'node:fs';
import { generateOne, mulberry32, type Candidate, type GenFeature, type Reject } from '../src/core/generator';

function arg(name: string, def: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}

const count = Number(arg('count', '50'));
const [width, height] = arg('size', '5x6').split('x').map(Number);
const features = arg('features', 'lantern,rock').split(',').filter(Boolean) as GenFeature[];
const seed = Number(arg('seed', '1'));
const maxTries = Number(arg('tries', String(count * 200)));
const reserve = arg('reserve', '2-7').split('-').map(Number) as [number, number];
const known: GenFeature[] = ['lantern', 'rock', 'water', 'firefly'];
for (const f of features) if (!known.includes(f)) throw new Error(`Неизвестный элемент «${f}», можно: ${known.join(', ')}`);
if (!(width >= 3 && height >= 3 && width <= 8 && height <= 10)) throw new Error('Размер поля: от 3x3 до 8x10');

const r = mulberry32(seed);
const out: Candidate[] = [];
const seen = new Set<string>();
const rejects: Partial<Record<Reject | 'dup', number>> = {};
const t0 = performance.now();
let tries = 0;
while (out.length < count && tries < maxTries) {
  tries++;
  const c = generateOne(r, { width, height, features, reserve });
  if (typeof c === 'string') {
    rejects[c] = (rejects[c] ?? 0) + 1;
    continue;
  }
  const key = c.data.grid.join('/') + c.data.deck.join(',');
  if (seen.has(key)) {
    rejects.dup = (rejects.dup ?? 0) + 1;
    continue;
  }
  seen.add(key);
  c.data.id = `gen-${seed}-${out.length + 1}`;
  out.push(c);
  if (out.length % 25 === 0) console.log(`  ${out.length}/${count} (попыток ${tries})`);
}

mkdirSync('generated', { recursive: true });
const file = `generated/${width}x${height}-${features.join('+') || 'plain'}-r${reserve.join('-')}-s${seed}.json`;
writeFileSync(file, JSON.stringify({ params: { width, height, features, seed }, candidates: out }, null, 1) + '\n');

const hist = new Map<number, number>();
for (const c of out) hist.set(Math.round(c.metrics.rating), (hist.get(Math.round(c.metrics.rating)) ?? 0) + 1);
console.log(`\nКандидатов: ${out.length} из ${tries} попыток за ${Math.round((performance.now() - t0) / 1000)} с → ${file}`);
console.log('Отброшено:', Object.entries(rejects).map(([k, v]) => `${k} ${v}`).join(', ') || 'ничего');
console.log('Рейтинг:', [...hist.entries()].sort((a, b) => a[0] - b[0]).map(([k, v]) => `${k}: ${v}`).join('  '));
