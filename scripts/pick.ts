// npm run pick — подбирает уровни 11–30 мира «Долина» из кандидатов генератора (generated/*.json)
// под план мира (src/levels/curve.ts): размер поля, обязательные и разрешённые элементы, целевой рейтинг.
// Пишет src/levels/valley/NN.json (id «valley-NN», название-заготовка из плана), сразу считает колоды
// облегчения и метрики. Уровни 1–10 (обучение) не трогает.
//
//   npm run pick              — подобрать и записать
//   npm run pick -- --dry     — только показать, что выбрано бы
//   npm run pick -- --only 14,20  — перевыбрать только эти уровни (остальные не трогать)

import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { parseLevel } from '../src/core/level';
import { analyzeLevel, ratingOf } from '../src/core/difficulty';
import { featuresOf, GEN_MAX_STATES, type Candidate } from '../src/core/generator';
import { easeDeck, TooManyStates } from '../src/core/solver';
import type { DifficultyReport } from '../src/core/difficulty';
import { starThresholds } from '../src/core/game';
import type { LevelData } from '../src/core/types';
import { VALLEY_PLAN, type Slot } from '../src/levels/curve';

const dry = process.argv.includes('--dry');
const onlyArg = process.argv.indexOf('--only');
const only = onlyArg >= 0 ? new Set(process.argv[onlyArg + 1].split(',').map(Number)) : null;

if (!existsSync('generated')) throw new Error('Нет папки generated/ — сначала npm run gen');
const pool: Candidate[] = [];
const seen = new Set<string>();
for (const f of readdirSync('generated').filter((x) => x.endsWith('.json'))) {
  const { candidates } = JSON.parse(readFileSync(`generated/${f}`, 'utf8')) as { candidates: Candidate[] };
  for (const c of candidates) {
    const key = c.data.grid.join('/');
    if (seen.has(key)) continue; // одно поле — один уровень
    seen.add(key);
    pool.push(c);
  }
}
console.log(`Кандидатов: ${pool.length} из ${readdirSync('generated').length} файлов\n`);

// Поля уже стоящих уровней — чтобы не взять тот же уровень дважды.
const fileOf = (num: number) => `src/levels/valley/${String(num).padStart(2, '0')}.json`;
const used = new Set<string>();
for (const slot of VALLEY_PLAN) {
  if (only && !only.has(slot.num) && existsSync(fileOf(slot.num))) {
    used.add((JSON.parse(readFileSync(fileOf(slot.num), 'utf8')) as LevelData).grid.join('/'));
  }
}

function fits(slot: Slot, c: Candidate): boolean {
  const [w, h] = c.size.split('x').map(Number);
  if (w > slot.maxW || h > slot.maxH) return false;
  const f = featuresOf(parseLevel(c.data));
  if (!slot.needs.every((x) => f.includes(x))) return false;
  return f.every((x) => slot.needs.includes(x) || slot.allows.includes(x));
}

/** Чем меньше, тем лучше: отклонение рейтинга от цели, небольшой штраф за маленькое поле на поздних уровнях. */
function score(slot: Slot, c: Candidate): number {
  const [w, h] = c.size.split('x').map(Number);
  const area = (w * h) / (slot.maxW * slot.maxH);
  return Math.abs(ratingOf(c.metrics) - slot.rating) + (1 - area) * 0.6;
}

const rows: string[] = [];
for (const slot of VALLEY_PLAN) {
  if (only && !only.has(slot.num)) continue;
  const ranked = pool.filter((c) => !used.has(c.data.grid.join('/')) && fits(slot, c)).sort((a, b) => score(slot, a) - score(slot, b));
  // Лучший кандидат, который решатель разбирает быстро (подсказки на телефоне).
  let best: Candidate | undefined;
  let rep: DifficultyReport | undefined;
  for (const c of ranked) {
    try {
      rep = analyzeLevel(parseLevel({ ...c.data, night: slot.night }), c.data.deck, GEN_MAX_STATES);
      best = c;
      break;
    } catch (e) {
      if (!(e instanceof TooManyStates)) throw e;
    }
  }
  if (!best || !rep) {
    rows.push(`${slot.num}. ${slot.name}: нет подходящих кандидатов (${slot.maxW}x${slot.maxH}, ${slot.needs.join('+')}) — сгенерируй ещё`);
    continue;
  }
  used.add(best.data.grid.join('/'));
  const data: LevelData = {
    id: `valley-${String(slot.num).padStart(2, '0')}`,
    name: slot.name,
    grid: best.data.grid,
    startDir: best.data.startDir,
    deck: best.data.deck,
    stars: { two: 0, three: 0 },
  };
  if (slot.night) data.night = true;
  // Звёзды, облегчение и метрики — заново, теми же функциями, что verify и ease.
  const level = parseLevel(data);
  data.stars = starThresholds(rep.maxLeftover);
  const one = easeDeck(level, 1);
  data.easeDecks = [one, easeDeck(level, 1, one)];
  data.metrics = rep.metrics;
  rows.push(
    `${String(slot.num).padStart(2)}. ${slot.name.padEnd(24)} ${best.size} ${featuresOf(level).join('+').padEnd(26)} рейтинг ${rep.metrics.rating.toFixed(1)} (план ${slot.rating}), решений ${rep.roads}, тупики ${Math.round(rep.metrics.trap * 100)}%, запас ${rep.metrics.reserve}  ← ${best.data.id}`,
  );
  if (!dry) writeFileSync(fileOf(slot.num), JSON.stringify(data, null, 2) + '\n');
}
console.log(rows.join('\n'));
console.log(dry ? '\n--dry: файлы не записаны' : '\nЗаписано в src/levels/valley/. Дальше: npm run verify');
