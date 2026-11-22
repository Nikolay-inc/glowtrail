// npm run ease — заранее считает колоды для незаметного облегчения (+1 и +2 плитки)
// и записывает их в JSON уровней (поле easeDecks). Запускать после изменения уровней.
import { readFileSync, writeFileSync } from 'node:fs';
import { LEVELS } from '../src/levels/index';
import { easeDeck } from '../src/core/solver';

for (const level of LEVELS) {
  const file = `src/levels/${String(level.id).padStart(2, '0')}.json`;
  const data = JSON.parse(readFileSync(file, 'utf8'));
  const base = { ...level, easeDecks: undefined };
  const one = easeDeck(base, 1);
  const two = easeDeck(base, 1, one);
  data.easeDecks = [one, two];
  writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
  console.log(`${level.id}. ${level.name}: +1 и +2 плитки посчитаны`);
}
