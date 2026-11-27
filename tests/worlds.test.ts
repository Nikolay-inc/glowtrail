import { describe, expect, it } from 'vitest';
import { applyAction, createGame, firefliesOnRoad, type GameState } from '../src/core/game';
import { levelRows, parseLevel } from '../src/core/level';
import { analyzeLevel, ratingOf, trapRate } from '../src/core/difficulty';
import { generateOne, mulberry32, randomPath } from '../src/core/generator';
import { geoMinBounded, geoMinTiles } from '../src/core/geo';
import { solutionOf, solveLevel, TooManyStates } from '../src/core/solver';
import type { LevelData, TileKind } from '../src/core/types';
import { isChallenge, LEVELS, levelById, nextLevelOf, numberInWorld, WORLDS } from '../src/levels/index';
import { ALL_SLOTS, BREATHER_MAX_RATING, BREATHER_MIN_ROADS, EASY_MAX_RATING, EASY_MIN_ROADS, FOREST_PLAN, mustBeEasy, MAX_H, MAX_W, NOVELTY, VALLEY_PLAN } from '../src/levels/curve';
import { fogFair } from '../src/core/fog';
import { featuresOf } from '../src/core/generator';

function dataOf(l: ReturnType<typeof parseLevel>): LevelData {
  return { id: l.id, name: l.name, grid: levelRows(l), startDir: (['N', 'E', 'S', 'W'] as const)[l.startDir], deck: l.deck, stars: l.stars, goal: l.goal };
}

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
      expect(rep.firefliesWithoutStash).toBe(l.fireflies.length);
      expect(c.metrics).toEqual(rep.metrics);
    }
    expect(found).toBeGreaterThan(0);
  });

  it('новые элементы в кандидатах действительно нужны', () => {
    const cases: { features: ('jump' | 'turnbridge' | 'fade' | 'rock' | 'water')[]; check: (l: ReturnType<typeof parseLevel>) => void }[] = [
      { features: ['jump', 'rock'], check: (l) => expect(solveLevel(parseLevel({ ...dataOf(l), deck: l.deck.filter((k) => k !== 'jump') })).solvable).toBe(false) },
      { features: ['turnbridge'], check: (l) => expect(l.turnBridges.length).toBeGreaterThan(0) },
      { features: ['fade'], check: (l) => expect(l.fades.length).toBeGreaterThan(0) },
    ];
    for (const c of cases) {
      const r = mulberry32(7);
      let ok = 0;
      for (let i = 0; i < 300 && ok < 1; i++) {
        const cand = generateOne(r, { width: 5, height: 6, features: c.features });
        if (typeof cand === 'string') continue;
        ok++;
        c.check(parseLevel(cand.data));
      }
      expect(ok, c.features.join('+')).toBe(1);
    }
  });

  it('цель «светлячки»: кандидат без арки, решаем, все светлячки обязательны', () => {
    const r = mulberry32(3);
    let cand = generateOne(r, { width: 5, height: 6, features: ['firefly'], goal: 'fireflies' });
    for (let i = 0; i < 100 && typeof cand === 'string'; i++) cand = generateOne(r, { width: 5, height: 6, features: ['firefly'], goal: 'fireflies' });
    expect(typeof cand).not.toBe('string');
    const l = parseLevel((cand as Exclude<typeof cand, string>).data);
    expect(l.goal).toBe('fireflies');
    expect(l.exit.x).toBe(-1);
    expect(solveLevel(l).solvable).toBe(true);
  });
});

describe('мир «Долина»', () => {
  it('30 уровней: постоянные id, номера по порядку, испытания — 10, 20, 30', () => {
    expect(WORLDS.map((w) => w.id)).toEqual(['valley', 'forest']);
    const v = WORLDS[0].levels;
    expect(v).toHaveLength(30);
    v.forEach((l, i) => {
      expect(l.id).toBe(`valley-${String(i + 1).padStart(2, '0')}`);
      expect(l.num).toBe(i + 1);
      expect(numberInWorld(l)).toBe(i + 1);
      expect(levelById(l.id)).toBe(l);
    });
    expect(v.filter(isChallenge).map((l) => l.num)).toEqual([10, 20, 30]);
    expect(nextLevelOf(v[29])?.id).toBe('forest-01');
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

  it('все светлячки уровня собираются за одну победу без «отложить» (уровень 11 раньше требовал его)', () => {
    for (const l of LEVELS) {
      if (!l.fireflies.length || l.tileSet) continue;
      const r = solveLevel(l, { deck: l.deck, allowStash: false, countRoads: false });
      expect(r.solvable && r.maxFireflies, l.id).toBe(l.fireflies.length);
    }
  });

  it('светлячки появляются с уровня 11, уровни 1–10 без новых элементов', () => {
    expect(LEVELS.slice(0, 10).every((l) => l.fireflies.length === 0)).toBe(true);
    expect(LEVELS[10].fireflies.length).toBeGreaterThan(0);
    for (const l of LEVELS.slice(0, 10)) {
      expect(l.goal, l.id).toBe('classic');
      expect(l.timed, l.id).toBe(false);
      expect([...l.deck, ...(l.tileSet ?? [])].includes('jump'), l.id).toBe(false);
    }
  });

  it('что-то новое каждые ~5 уровней: в каждом блоке плана — его элемент', () => {
    type L = (typeof LEVELS)[number];
    const has: Record<(typeof NOVELTY)[number]['test'], (l: L) => boolean> = {
      firefly: (l) => l.fireflies.length > 0 && l.goal === 'classic',
      jump: (l) => l.deck.includes('jump'),
      ffgoal: (l) => l.goal === 'fireflies',
      turnbridge: (l) => l.turnBridges.length > 0,
      fade: (l) => l.fades.length > 0,
      valleyAll: (l) => l.deck.includes('jump') && l.turnBridges.length > 0 && l.fades.length > 0,
      ring: (l) => l.rings.length > 0,
      fog: (l) => l.fog,
      shadow: (l) => l.shadow > 0,
      ringFog: (l) => l.rings.length > 0 && l.fog,
      escape: (l) => l.goal === 'escape' && l.shadow > 0,
      combo: (l) => (l.deck.includes('jump') || l.turnBridges.length > 0 || l.fades.length > 0) && (l.rings.length > 0 || l.fog || l.shadow > 0),
      boss: (l) => l.goal === 'escape' && l.fog && l.rings.length > 0,
    };
    for (const b of NOVELTY) {
      for (let n = b.from; n <= b.to; n++) expect(has[b.test](LEVELS[n - 1]), `${n}: ${b.what}`).toBe(true);
    }
  });

  it('передышки действительно лёгкие, цели и элементы — по плану (оба мира)', () => {
    for (const slot of ALL_SLOTS) {
      const l = LEVELS[slot.num - 1];
      expect(l.goal, l.id).toBe(slot.goal ?? 'classic');
      const f = featuresOf(l);
      for (const need of slot.needs) expect(f, `${l.id} нужен ${need}`).toContain(need);
      if (mustBeEasy(slot)) {
        expect(l.metrics!.rating, `${l.id} лёгкий/знакомство`).toBeLessThanOrEqual(EASY_MAX_RATING);
        expect(l.metrics!.roads, `${l.id} лёгкий/знакомство`).toBeGreaterThanOrEqual(EASY_MIN_ROADS);
      }
      if (slot.role === 'breather') {
        expect(l.metrics!.rating, l.id).toBeLessThanOrEqual(BREATHER_MAX_RATING);
        expect(l.metrics!.roads, l.id).toBeGreaterThanOrEqual(BREATHER_MIN_ROADS);
      }
    }
  });
});

describe('мир «Туманный лес»', () => {
  const forest = WORLDS.find((w) => w.id === 'forest')!;

  it('30 уровней 31–60: id forest-01…30, номер в мире 1–30, испытания — 40, 50, 60', () => {
    expect(forest.levels).toHaveLength(30);
    forest.levels.forEach((l, i) => {
      expect(l.id).toBe(`forest-${String(i + 1).padStart(2, '0')}`);
      expect(l.num).toBe(31 + i);
      expect(numberInWorld(l)).toBe(i + 1);
    });
    expect(forest.levels.filter(isChallenge).map((l) => l.num)).toEqual([40, 50, 60]);
    expect(nextLevelOf(forest.levels[29])).toBeNull();
  });

  it('по плану: поле до 6x8, решений не меньше 2, туман без угадывания, тень у «Побега»', () => {
    for (const slot of FOREST_PLAN) {
      const l = LEVELS[slot.num - 1];
      expect(l.width, l.id).toBeLessThanOrEqual(Math.min(slot.maxW, MAX_W));
      expect(l.height, l.id).toBeLessThanOrEqual(Math.min(slot.maxH, MAX_H));
      expect(l.metrics!.roads, l.id).toBeGreaterThanOrEqual(2);
      if (l.goal === 'escape') expect(l.shadow, l.id).toBeGreaterThan(0);
      if (l.fog) expect(fogFair(l).ok, `${l.id}: туман без угадывания`).toBe(true);
    }
  });

  it('рейтинг растёт по миру: средний 31–40 < 41–50 < 51–60, босс — самый сложный в последнем десятке', () => {
    const avg = (lo: number) => LEVELS.slice(lo - 1, lo + 9).reduce((a, l) => a + l.metrics!.rating, 0) / 10;
    expect(avg(31)).toBeLessThan(avg(41));
    expect(avg(41)).toBeLessThan(avg(51));
    const last = LEVELS.slice(50, 60).map((l) => l.metrics!.rating);
    expect(last[9]).toBe(Math.max(...last));
  });
});
