// npm run sim-economy — симуляция первых 2 часов игры типичного игрока: когда восстанавливается каждый объект
// деревни, когда покупается каждое улучшение и скин. Цель: новая цель каждые 2–5 минут в первый час,
// вся деревня — примерно к концу мира 1. Модель — src/core/economySim.ts.

import { LEVELS } from '../src/levels/index';
import { simulate, type SimLevel } from '../src/core/economySim';
import { VILLAGE_TOTAL } from '../src/core/economy';

const levels: SimLevel[] = LEVELS.map((l) => ({ id: l.id, num: l.num, rating: l.metrics?.rating ?? 3, fireflies: l.fireflies.length, infinite: l.tileSet !== null }));
const res = simulate(levels, 120);

const KIND: Record<string, string> = { village: 'Деревня', upgrade: 'Улучшение', skin: 'Скин', daily: 'Награда', level: '' };
console.log('Минута | Уровень | Что                          | Монет | Света');
console.log('-------|---------|------------------------------|-------|------');
for (const e of res.events) {
  console.log(`${String(e.t).padStart(6)} | ${String(e.level || '—').padStart(7)} | ${`${KIND[e.kind]}: ${e.what}`.padEnd(28)} | ${String(e.coins).padStart(5)} | ${String(e.light).padStart(5)}`);
}
const gaps = res.gapsFirstHour;
const maxGap = Math.max(...gaps);
console.log(`\nМир 1 пройден на ${res.worldDoneAt ?? '—'} мин. Вся деревня (${VILLAGE_TOTAL} света) восстановлена на уровне ${res.villageDoneAt ?? '— (не успели)'}.`);
console.log(`Новых целей в первый час: ${gaps.length}, промежутки (мин): ${gaps.join(', ')}; самый длинный — ${maxGap}.`);
console.log(`Итог через 2 часа: монет ${res.final.coins}, света ${res.final.light}.`);
const avg = 60 / gaps.length;
console.log(`В среднем новая цель раз в ${avg.toFixed(1)} мин.`);
const left = res.leftAtWorldEnd;
console.log(`После мира 1 ещё хочется купить: ${left.map((x) => `${x.label} (${x.price})`).join(', ') || '— ничего'}`);
// Цели: в первый час между целями не больше 5 минут; деревня — к концу мира 1 (уровни 26–30);
// после мира 1 остаётся на что копить (хотя бы 3 вещи от 200 монет, среди них — улучшение).
const problems: string[] = [];
if (maxGap > 5) problems.push(`промежуток ${maxGap} мин > 5`);
if (res.villageDoneAt === null || res.villageDoneAt < 26) problems.push(`деревня восстановлена слишком рано или не восстановлена (уровень ${res.villageDoneAt ?? '—'})`);
const expensive = left.filter((x) => x.price >= 200);
if (expensive.length < 3 || !expensive.some((x) => x.label.includes('улучшение'))) problems.push('после мира 1 не осталось дорогих покупок');
if (problems.length) {
  console.error(`\n✗ Цели экономики не выполнены: ${problems.join('; ')} — подкрути цены в src/core/economy.ts`);
  process.exit(1);
}
console.log('\nЦели экономики выполнены ✓');
