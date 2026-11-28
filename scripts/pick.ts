// npm run pick — подбирает уровни мира из кандидатов генератора (generated/*.json) под план мира
// (src/levels/curve.ts): размер поля, обязательные и разрешённые элементы, целевой рейтинг.
// Пишет src/levels/<мир>/NN.json (id «<мир>-NN», NN — номер в мире, название-заготовка из плана), сразу
// считает колоды облегчения и метрики. Уровни 1–10 «Долины» (обучение) не трогает.
//
//   npm run pick                  — «Долина» (11–30): подобрать и записать
//   npm run pick -- --world forest — «Туманный лес» (31–60)
//   npm run pick -- --world peaks  — «Ледяные вершины» (61–90)
//   npm run pick -- --dry         — только показать, что выбрано бы
//   npm run pick -- --only 14,20  — перевыбрать только эти уровни (номера по порядку, остальные не трогать)

import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { parseLevel } from '../src/core/level';
import { analyzeLevel, ratingOf } from '../src/core/difficulty';
import { featuresOf, GEN_MAX_STATES, usesFeatures, windIceChains, type Candidate } from '../src/core/generator';
import { easeDeck, TooManyStates } from '../src/core/solver';
import type { DifficultyReport } from '../src/core/difficulty';
import { starThresholds } from '../src/core/game';
import type { LevelData } from '../src/core/types';
import { WIND_CHAIN_FREE_FROM, BREATHER_MAX_RATING, BREATHER_MIN_ROADS, EASY_MAX_RATING, EASY_MIN_ROADS, MEDIUM_MIN_ROADS, mustBeEasy, needsChoice, WORLD_PLANS, type Slot } from '../src/levels/curve';

const dry = process.argv.includes('--dry');
const onlyArg = process.argv.indexOf('--only');
const only = onlyArg >= 0 ? new Set(process.argv[onlyArg + 1].split(',').map(Number)) : null;
const worldArg = process.argv.indexOf('--world');
const world = worldArg >= 0 ? process.argv[worldArg + 1] : 'valley';
const PLAN = WORLD_PLANS[world];
if (!PLAN) throw new Error(`Нет плана мира «${world}» (есть: ${Object.keys(WORLD_PLANS).join(', ')})`);
/** Номер первого уровня мира минус 1: номер в мире = num - offset. «Долина» начинается с 1, план — с 11. */
const offset = world === 'valley' ? 0 : PLAN[0].num - 1;

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
const inWorld = (num: number) => String(num - offset).padStart(2, '0');
const fileOf = (num: number) => `src/levels/${world}/${inWorld(num)}.json`;
const used = new Set<string>();
for (const slot of PLAN) {
  if (only && !only.has(slot.num) && existsSync(fileOf(slot.num))) {
    used.add((JSON.parse(readFileSync(fileOf(slot.num), 'utf8')) as LevelData).grid.join('/'));
  }
}

function fits(slot: Slot, c: Candidate): boolean {
  const [w, h] = c.size.split('x').map(Number);
  if (w > slot.maxW || h > slot.maxH) return false;
  if ((c.data.goal ?? 'classic') !== (slot.goal ?? 'classic')) return false;
  if (slot.role === 'breather' && (c.metrics.rating > BREATHER_MAX_RATING || c.metrics.roads < BREATHER_MIN_ROADS)) return false;
  if (mustBeEasy(slot) && (c.metrics.rating > EASY_MAX_RATING || c.metrics.roads < EASY_MIN_ROADS)) return false;
  // Средние и «сложнее» — не меньше 4 решений; пороги звёзд 2★ и 3★ различаются (запас хотя бы 3 плитки).
  if (needsChoice(slot) && c.metrics.roads < MEDIUM_MIN_ROADS) return false;
  if (c.data.stars.two >= c.data.stars.three) return false;
  const lv = parseLevel(c.data);
  const f = featuresOf(lv);
  if (!slot.needs.every((x) => f.includes(x))) return false;
  if (slot.num < WIND_CHAIN_FREE_FROM && windIceChains(lv) > 1) return false;
  // Лёд и ветер из обязательных элементов должны работать в лучшем решении (знакомство без скольжения ничему не учит).
  if (!usesFeatures(lv, slot.needs)) return false;
  if (!f.every((x) => slot.needs.includes(x) || slot.allows.includes(x))) return false;
  // Туман «без угадывания» генератор уже проверил (fogGuess), итог ещё раз проверяет verify.
  return true;
}

/** Чем меньше, тем лучше: отклонение рейтинга от цели, небольшой штраф за маленькое поле на поздних уровнях. */
function score(slot: Slot, c: Candidate): number {
  const [w, h] = c.size.split('x').map(Number);
  const area = (w * h) / (slot.maxW * slot.maxH);
  // С запасом меньше 2 плиток звёзды теряют смысл (3 звезды за любую победу) — такие берём в последнюю очередь.
  return Math.abs(ratingOf(c.metrics) - slot.rating) + (1 - area) * 0.6 + (c.metrics.reserve < 2 ? 1 : 0);
}

const rows: string[] = [];
for (const slot of PLAN) {
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
    id: `${world}-${inWorld(slot.num)}`,
    name: slot.name,
    grid: best.data.grid,
    startDir: best.data.startDir,
    deck: best.data.deck,
    stars: { two: 0, three: 0 },
  };
  if (best.data.fog) data.fog = true;
  if (best.data.shadow) data.shadow = best.data.shadow;
  if (slot.goal && slot.goal !== 'classic') data.goal = slot.goal;
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
console.log(dry ? '\n--dry: файлы не записаны' : `\nЗаписано в src/levels/${world}/. Дальше: npm run verify`);
