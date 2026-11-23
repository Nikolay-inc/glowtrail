// npm run ease — заранее считает для каждого уровня:
// - колоды незаметного облегчения (+1 и +2 плитки; в игре используется +2) — поле easeDecks;
// - метрики сложности (решений, минимум и запас плиток, доля тупиковых ходов, рейтинг 1–10) — поле metrics.
// Запускать после любого изменения уровня. npm run verify сверяет JSON с расчётом.
import { readFileSync, writeFileSync } from 'node:fs';
import { WORLDS } from '../src/levels/worlds';
import { easeDeck } from '../src/core/solver';
import { analyzeLevel } from '../src/core/difficulty';

/** Файл уровня: src/levels/<мир>/NN.json, NN — номер в мире. */
function levelFile(worldId: string, indexInWorld: number) {
  return `src/levels/${worldId}/${String(indexInWorld + 1).padStart(2, '0')}.json`;
}

for (const world of WORLDS) {
  world.levels.forEach((level, i) => {
    const file = levelFile(world.id, i);
    const data = JSON.parse(readFileSync(file, 'utf8'));
    if (data.id !== level.id) throw new Error(`${file}: id ${data.id}, ожидался ${level.id}`);
    const base = { ...level, easeDecks: undefined, metrics: undefined };
    if (level.tileSet) {
      delete data.easeDecks; // бесконечную колоду облегчать нечего
    } else {
      const one = easeDeck(base, 1);
      const two = easeDeck(base, 1, one);
      data.easeDecks = [one, two];
    }
    data.metrics = analyzeLevel(base).metrics;
    writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
    console.log(`${level.num}. ${level.name}: ${level.tileSet ? 'колода бесконечная' : 'облегчение +1 и +2'}, рейтинг ${data.metrics.rating}`);
  });
}
