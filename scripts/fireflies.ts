// npm run fireflies -- --world peaks --plan 1:2,3:2,7:2,10:4 [--only 61,63] [--dry]
// Ставит необязательных светлячков на клетки решения уровня (пустые клетки, через которые проходит лучшее решение),
// чтобы светлячки были примерно на половине уровней мира и их можно было собрать за одну победу без «отложить».
// План — позиция уровня в десятке : сколько светлячков (по умолчанию как в лесу: 1-й, 3-й, 7-й — по 2, испытание — 4).
// Уровни, где светлячки уже есть, не трогает. После — npm run ease и npm run verify.

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { parseLevel } from '../src/core/level';
import { analyzeLevel } from '../src/core/difficulty';
import { solutionOf } from '../src/core/solver';
import type { LevelData } from '../src/core/types';
import { WORLD_PLANS } from '../src/levels/curve';

const arg = (name: string) => (process.argv.includes(`--${name}`) ? process.argv[process.argv.indexOf(`--${name}`) + 1] : undefined);
const world = arg('world') ?? 'peaks';
const dry = process.argv.includes('--dry');
const only = arg('only') ? new Set(arg('only')!.split(',').map(Number)) : null;
const plan = new Map((arg('plan') ?? '1:2,3:2,7:2,10:4').split(',').map((p) => p.split(':').map(Number) as [number, number]));
const first = WORLD_PLANS[world]?.[0]?.num ?? 1;
const offset = world === 'valley' ? 0 : first - 1;

const dir = `src/levels/${world}`;
for (const file of readdirSync(dir).filter((f) => /^\d\d\.json$/.test(f)).sort()) {
  const data = JSON.parse(readFileSync(`${dir}/${file}`, 'utf8')) as LevelData;
  const num = offset + Number(file.slice(0, 2));
  const pos = ((num - 1) % 10) + 1;
  const want = plan.get(pos) ?? 0;
  if (only && !only.has(num)) continue;
  if (!want || data.grid.join('').includes('F')) continue;
  const level = parseLevel(data);
  // Клетки решения без «отложить» (светлячков нельзя прятать за хитростью), пустые, по порядку пути.
  const sol = solutionOf(parseLevel({ ...data, allowStash: false }));
  const path = sol.flatMap((s) => s.cells).filter((c, i, a) => a.indexOf(c) === i && level.cells[c] === 'empty');
  if (path.length < want) {
    console.log(`${num}: на пути решения мало пустых клеток (${path.length})`);
    continue;
  }
  // Равномерно по пути, не подряд.
  const picks: number[] = [];
  for (let k = 0; k < want; k++) picks.push(path[Math.min(path.length - 1, Math.round(((k + 0.5) * path.length) / want))]);
  const uniq = [...new Set(picks)];
  const grid = data.grid.map((row, y) => [...row].map((ch, x) => (uniq.includes(y * level.width + x) ? 'F' : ch)).join(''));
  const next: LevelData = { ...data, grid };
  const rep = analyzeLevel(parseLevel({ ...next, easeDecks: undefined, metrics: undefined }));
  if (!rep.solvable || rep.firefliesWithoutStash < uniq.length) {
    console.log(`${num}: светлячков ${uniq.length}, без «отложить» собирается ${rep.firefliesWithoutStash} — пропускаю`);
    continue;
  }
  console.log(`${num}: +${uniq.length} светлячков (решений ${rep.roads}, рейтинг ${rep.metrics.rating})`);
  if (!dry) writeFileSync(`${dir}/${file}`, JSON.stringify(next, null, 2) + '\n');
}
console.log(dry ? '\n--dry: файлы не записаны' : '\nДальше: npm run ease и npm run verify');
