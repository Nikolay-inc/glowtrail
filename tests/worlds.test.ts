import { describe, expect, it } from 'vitest';
import { applyAction, createGame, firefliesOnRoad, type GameState } from '../src/core/game';
import { parseLevel } from '../src/core/level';
import { analyzeLevel, ratingOf, trapRate } from '../src/core/difficulty';
import { generateOne, mulberry32, randomPath } from '../src/core/generator';
import { geoMinBounded, geoMinTiles } from '../src/core/geo';
import { solutionOf, solveLevel, TooManyStates } from '../src/core/solver';
import type { LevelData, TileKind } from '../src/core/types';
import { isChallenge, LEVELS, levelById, nextLevelOf, numberInWorld, WORLDS } from '../src/levels/index';
import { MAX_H, MAX_W, VALLEY_PLAN } from '../src/levels/curve';

function level(grid: string[], deck: TileKind[], extra: Partial<LevelData> = {}) {
  return parseLevel({ id: 'test', name: 't', grid, startDir: 'N', deck, stars: { two: 0, three: 0 }, ...extra });
}

/** Сыграть решение из решателя настоящими ходами игры. */
function playSolution(s: GameState): GameState {
  for (const step of solutionOf(s.level, s.deck)) {
    const slot = s.tray.indexOf(step.kind);
    if (step.from === 'toStash') s = applyAction(s, { type: 'stash', slot });
    else if (step.from === 'stash') s = applyAction(s, { type: 'placeStash' });
    else if (step.from === 'swap') s = applyAction(applyAction(s, { type: 'swap', slot }), { type: 'placeStash' });
    else s = applyAction(s, { type: 'place', slot });
  }
  return s;
}

describe('светлячки', () => {
  it('дорога через клетку собирает светлячка, собирать не обязательно', () => {
    const l = level(['.E.', 'F..', '.S.'], ['straight', 'straight', 'left', 'right', 'right']);
    expect(l.fireflies).toEqual([3]);
    // Прямо к двери — победа без светлячка.
    let s = createGame(l, ['straight', 'straight']);
    s = applyAction(s, { type: 'place', slot: 0 });
    s = applyAction(s, { type: 'place', slot: 1 });
    expect(s.status).toBe('won');
    expect(firefliesOnRoad(s)).toBe(0);
    // Крюк через светлячка.
    s = createGame(l, ['left', 'right', 'right', 'straight']);
    for (const k of ['left', 'right', 'right', 'straight'] as TileKind[]) s = applyAction(s, { type: 'place', slot: s.tray.indexOf(k) });
    expect(s.status).toBe('won');
    expect(firefliesOnRoad(s)).toBe(1);
  });

  it('решатель знает, сколько светлячков можно собрать за одну победу', () => {
    const l = level(['.E.', 'F.F', '.S.'], ['left', 'right', 'right', 'straight', 'straight']);
    expect(solveLevel(l).maxFireflies).toBe(1); // обоих не собрать — дорога не может вернуться
    const inf = level(['.E.', 'F..', '.S.'], [], { tileSet: ['straight', 'left', 'right'], allowStash: false });
    expect(solveLevel(inf).maxFireflies).toBe(1);
  });
});

describe('метрики сложности', () => {
  it('одинаковый уровень — одинаковые метрики (выборка детерминирована)', () => {
    const l = LEVELS[6];
    expect(trapRate(l)).toBe(trapRate(l));
    expect(analyzeLevel(l).metrics).toEqual(analyzeLevel(l).metrics);
  });

  it('рейтинг растёт с долей тупиков и падает с запасом и числом решений', () => {
    const base = { trap: 0.3, roads: 20, reserve: 4, minTiles: 10 };
    expect(ratingOf({ ...base, trap: 0.5 })).toBeGreaterThan(ratingOf(base));
    expect(ratingOf({ ...base, reserve: 6 })).toBeLessThan(ratingOf(base));
    expect(ratingOf({ ...base, roads: 300 })).toBeLessThan(ratingOf(base));
    expect(ratingOf({ trap: 0, roads: 1, reserve: -1, minTiles: 3 })).toBe(1); // первый уровень обучения
    expect(ratingOf({ trap: 1, roads: 1, reserve: 0, minTiles: 30 })).toBe(10);
  });

  it('метрики в JSON уровней совпадают с расчётом (иначе npm run ease)', () => {
    for (const l of LEVELS.slice(0, 10)) {
      expect(l.metrics, l.id).toEqual(analyzeLevel({ ...l, metrics: undefined, easeDecks: undefined }).metrics);
    }
  });

  it('решение решателя по шагам ведёт к победе настоящими ходами', () => {
    for (const l of LEVELS.filter((x) => !x.tileSet)) {
      const end = playSolution(createGame(l));
      expect(end.status, l.id).toBe('won');
    }
  });

  it('предел состояний решателя', () => {
    const l = LEVELS[9];
    expect(() => solveLevel(l, { maxStates: 10 })).toThrow(TooManyStates);
  });
});

describe('генератор', () => {
  it('поиск пути с пределом длины совпадает с полным поиском', () => {
    const l = LEVELS[3];
    const kinds = l.tileSet!;
    const start = l.start.y * l.width + l.start.x;
    const full = geoMinTiles(l, kinds, start, l.startDir, 1n << BigInt(start));
    expect(geoMinBounded(l, kinds, start, l.startDir, 1n << BigInt(start), 20)).toBe(full);
    expect(geoMinBounded(l, kinds, start, l.startDir, 1n << BigInt(start), full - 1)).toBe(-1);
  });

  it('случайный путь доходит до выхода через все фонари', () => {
    const r = mulberry32(5);
    const l = LEVELS[6];
    const path = randomPath(r, l, 1)!;
    expect(path).not.toBeNull();
    expect(solveLevel(l, { deck: path, allowStash: false, countRoads: false }).solvable).toBe(true);
  });

  it('кандидат решаем, без «отложить», с 2+ решениями и всеми светлячками', () => {
    const r = mulberry32(42);
    let found = 0;
    for (let i = 0; i < 80 && found < 2; i++) {
      const c = generateOne(r, { width: 5, height: 6, features: ['lantern', 'firefly'] });
      if (typeof c === 'string') continue;
      found++;
      const l = parseLevel(c.data);
      const rep = analyzeLevel(l);
      expect(rep.solvable).toBe(true);
      expect(rep.solvableWithoutStash).toBe(true);
      expect(rep.roads).toBeGreaterThanOrEqual(2);
      expect(rep.maxFireflies).toBe(l.fireflies.length);
      expect(c.metrics).toEqual(rep.metrics);
    }
    expect(found).toBeGreaterThan(0);
  });
});

describe('мир «Долина»', () => {
  it('30 уровней: постоянные id, номера по порядку, испытания — 10, 20, 30', () => {
    expect(WORLDS.map((w) => w.id)).toEqual(['valley']);
    const v = WORLDS[0].levels;
    expect(v).toHaveLength(30);
    v.forEach((l, i) => {
      expect(l.id).toBe(`valley-${String(i + 1).padStart(2, '0')}`);
      expect(l.num).toBe(i + 1);
      expect(numberInWorld(l)).toBe(i + 1);
      expect(levelById(l.id)).toBe(l);
    });
    expect(v.filter(isChallenge).map((l) => l.num)).toEqual([10, 20, 30]);
    expect(nextLevelOf(v[29])).toBeNull();
    expect(nextLevelOf(v[0])).toBe(v[1]);
  });

  it('уровни 11–30 — по плану: поле до 6x8, ночь по плану, без уровней с одним решением', () => {
    for (const slot of VALLEY_PLAN) {
      const l = levelById(`valley-${slot.num}`)!;
      expect(l.width, l.id).toBeLessThanOrEqual(Math.min(slot.maxW, MAX_W));
      expect(l.height, l.id).toBeLessThanOrEqual(Math.min(slot.maxH, MAX_H));
      expect(l.night, l.id).toBe(!!slot.night);
      expect(l.metrics!.roads, l.id).toBeGreaterThanOrEqual(2);
    }
  });

  it('светлячки появляются с уровня 12', () => {
    expect(LEVELS.slice(0, 11).every((l) => l.fireflies.length === 0)).toBe(true);
    expect(LEVELS[11].fireflies.length).toBeGreaterThan(0);
  });
});
