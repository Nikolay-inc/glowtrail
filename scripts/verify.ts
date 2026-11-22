// npm run verify — проверяет, что каждый уровень решаем, и печатает статистику решателя.
import { LEVELS } from '../src/levels/index';
import { solveLevel } from '../src/core/solver';

let failed = 0;
console.log('Уровень              | плиток | решений | мин. плиток | макс. остаток | звёзды 2/3 | без «отложить»');
console.log('-'.repeat(104));
for (const level of LEVELS) {
  const t0 = performance.now();
  const r = solveLevel(level);
  const noStash = solveLevel(level, { allowStash: false, countRoads: false });
  const ms = Math.round(performance.now() - t0);
  const problems: string[] = [];
  if (!r.solvable) problems.push('НЕ РЕШАЕТСЯ');
  if (r.solvable && level.stars.three > r.maxLeftover) problems.push(`3 звезды недостижимы (нужно ${level.stars.three}, максимум ${r.maxLeftover})`);
  if (level.stars.two > level.stars.three) problems.push('порог 2 звёзд выше порога 3');
  if (level.tutorial === 'stash' && noStash.solvable) problems.push('обучение «отложить», но уровень решается без него');
  if (problems.length) failed++;
  const name = `${String(level.id).padStart(2)}. ${level.name}`.padEnd(20);
  console.log(
    `${name} | ${String(level.deck.length).padStart(6)} | ${String(r.roads).padStart(7)} | ${String(r.minTiles).padStart(11)} | ${String(r.maxLeftover).padStart(13)} | ${`${level.stars.two}/${level.stars.three}`.padStart(10)} | ${noStash.solvable ? 'решается' : 'нужно'.padEnd(8)}  ${ms} мс${problems.length ? '  ✗ ' + problems.join('; ') : '  ✓'}`,
  );
}
console.log('\nРешений = число разных дорог до выхода. Чем меньше, тем сложнее уровень.');
if (failed) {
  console.error(`\nОшибок: ${failed}`);
  process.exit(1);
}
console.log('Все уровни решаемы ✓');
