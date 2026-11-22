import { beforeEach, describe, expect, it } from 'vitest';
import { parseLevel } from '../src/core/level';
import {
  applyAction,
  createGame,
  dealExtra,
  distanceToExit,
  leftmostTile,
  starThresholds,
  tilesLeft,
  upcoming,
  type GameState,
} from '../src/core/game';
import { bestFrom, easeDeck, findExtraTiles, findHint, nearestSolvable, solveLevel } from '../src/core/solver';
import { LEVELS } from '../src/levels/index';
import type { LevelData, TileKind } from '../src/core/types';

function level(grid: string[], deck: TileKind[], extra: Partial<LevelData> = {}) {
  return parseLevel({ id: 0, name: 't', grid, startDir: 'N', deck, stars: { two: 1, three: 2 }, ...extra });
}
const place = (s: GameState, slot: number) => applyAction(s, { type: 'place', slot });

describe('звёзды по формуле', () => {
  it('3 — от (макс − 1), 2 — от половины вниз', () => {
    expect(starThresholds(0)).toEqual({ two: 0, three: 0 });
    expect(starThresholds(1)).toEqual({ two: 0, three: 0 });
    expect(starThresholds(3)).toEqual({ two: 1, three: 2 });
    expect(starThresholds(4)).toEqual({ two: 2, three: 3 });
    expect(starThresholds(5)).toEqual({ two: 2, three: 4 });
  });

  it('звёзды всех уровней совпадают с формулой', () => {
    for (const l of LEVELS) {
      const r = solveLevel(l, { countRoads: false });
      expect(l.stars, `уровень ${l.id}`).toEqual(starThresholds(r.maxLeftover));
    }
  });
});

describe('превью колоды и слот «отложить»', () => {
  const lvl = level(['.E.', '...', '...', '...', '.S.'], ['left', 'straight', 'straight', 'straight2', 'right', 'straight']);

  it('превью показывает следующие 2 плитки колоды', () => {
    const g = createGame(lvl);
    expect(upcoming(g, 2)).toEqual(['straight2', 'right']);
    expect(upcoming(place(g, 1), 2)).toEqual(['right', 'straight']);
  });

  it('крайняя левая плитка лотка', () => {
    const g = createGame(lvl);
    expect(leftmostTile(g)).toBe(0);
    expect(leftmostTile({ ...g, tray: [null, null, 'left'] })).toBe(2);
    expect(leftmostTile({ ...g, tray: [null, null, null] })).toBe(-1);
  });

  it('обмен: отложенная плитка встаёт в слот лотка, плитка лотка уходит в запас', () => {
    let s = applyAction(createGame(lvl), { type: 'stash', slot: 0 }); // отложили left
    expect(s.stash).toBe('left');
    s = applyAction(s, { type: 'swap', slot: 0 });
    expect(s.stash).toBe('straight2');
    expect(s.tray[0]).toBe('left');
    expect(tilesLeft(s)).toBe(6);
    expect(s.moves).toBe(2);
  });

  it('обмен без отложенной плитки невозможен', () => {
    const g = createGame(lvl);
    expect(applyAction(g, { type: 'swap', slot: 0 })).toBe(g);
  });

  it('подсказки ведут к победе и после того, как плитку отложили', () => {
    const lvl7 = LEVELS.find((l) => l.tutorial === 'stash')!;
    let s = createGame(lvl7);
    s = applyAction(s, { type: 'stash', slot: 0 });
    for (let i = 0; i < 30 && s.status === 'playing'; i++) s = applyAction(s, findHint(s)!);
    expect(s.status).toBe('won');
  });
});

describe('защита от застревания', () => {
  it('расстояние до выхода', () => {
    const g = createGame(level(['E....', '.....', '....S'], ['straight']));
    expect(distanceToExit(g)).toBe(6);
  });

  it('+3 плитки: новые плитки в лотке, старые возвращаются наверх колоды', () => {
    const g = createGame(level(['.E.', '...', '...', '.S.'], ['left', 'right', 'left', 'straight']));
    const s = dealExtra(g, ['straight', 'straight', 'straight']);
    expect(s.tray).toEqual(['straight', 'straight', 'straight']);
    expect(upcoming(s, 4)).toEqual(['left', 'right', 'left', 'straight']);
    expect(tilesLeft(s)).toBe(tilesLeft(g) + 3);
  });

  it('+3 плитки подбирает плитки, с которыми можно выиграть', () => {
    // Колода из одних поворотов: проигрыш сразу.
    const g = createGame(level(['.E.', '...', '...', '.S.'], ['bridge', 'bridge', 'bridge']));
    expect(g.status).toBe('lost');
    const res = findExtraTiles(g, 3)!;
    expect(res).not.toBeNull();
    expect(res.rollback).toBe(0);
    expect(res.state.status).toBe('playing');
    expect(bestFrom(res.state)).toBeGreaterThanOrEqual(0);
  });

  it('+3 плитки откатывает дорогу, если из тупика не выйти никакими плитками', () => {
    // Дорога упёрлась в угол — дальше ничего не встанет.
    const l = level(['E..', '...', 'S..'], ['right', 'straight', 'straight', 'left', 'left']);
    let s = createGame(l);
    s = place(s, 0); // (0,1) → вправо
    s = place(s, 1); // (1,1)
    s = place(s, 2); // (2,1) — край
    const left = findHint(s);
    expect(bestFrom(s)).toBe(-1);
    const res = findExtraTiles(s, 3)!;
    expect(res.rollback).toBeGreaterThan(0);
    expect(bestFrom(res.state)).toBeGreaterThanOrEqual(0);
    expect(left === null || left !== undefined).toBe(true);
  });

  it('откат подсказкой — к ближайшему состоянию, откуда можно выиграть', () => {
    const l = level(['E..', '...', 'S..'], ['right', 'straight', 'straight', 'left', 'left']);
    let s = createGame(l);
    s = place(place(place(s, 0), 1), 2);
    const back = nearestSolvable(s)!;
    expect(back.steps).toBeGreaterThan(0);
    expect(bestFrom(back.state)).toBeGreaterThanOrEqual(0);
    expect(nearestSolvable(createGame(l))!.steps).toBe(0);
  });

  it('облегчение добавляет плитку и не уменьшает число решений', () => {
    const l = { ...LEVELS[1], easeDecks: undefined };
    const deck = easeDeck(l, 1);
    expect(deck).toHaveLength(l.deck.length + 1);
    expect(solveLevel(l, { deck }).roads).toBeGreaterThanOrEqual(solveLevel(l).roads);
  });

  it('заранее посчитанные колоды облегчения: +1 и +2 плитки, решаемы, решений не меньше', () => {
    for (const l of LEVELS) {
      const before = solveLevel(l).roads;
      expect(l.easeDecks, `уровень ${l.id}`).toHaveLength(2);
      l.easeDecks!.forEach((d, k) => {
        expect(d).toHaveLength(l.deck.length + k + 1);
        const r = solveLevel(l, { deck: d });
        expect(r.solvable).toBe(true);
        expect(r.roads, `уровень ${l.id}, +${k + 1}`).toBeGreaterThanOrEqual(before);
      });
    }
  });
});

describe('хранилище: подсказки, серии поражений, пропуски', () => {
  beforeEach(() => {
    const mem = new Map<string, string>();
    (globalThis as unknown as { localStorage: Storage }).localStorage = {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => void mem.set(k, v),
      removeItem: (k: string) => void mem.delete(k),
      clear: () => mem.clear(),
      key: () => null,
      length: 0,
    };
  });

  it('серия поражений растёт и сбрасывается победой, подсказка +1 только за первое прохождение', async () => {
    const st = await import('../src/storage');
    expect(st.hintsLeft()).toBe(st.START_HINTS);
    expect(st.recordLoss(3)).toBe(1);
    expect(st.recordLoss(3)).toBe(2);
    expect(st.lossStreak(3)).toBe(2);
    expect(st.recordWin(3, 2, 10).hintAwarded).toBe(true);
    expect(st.lossStreak(3)).toBe(0);
    expect(st.hintsLeft()).toBe(st.START_HINTS + 1);
    expect(st.recordWin(3, 3, 10).hintAwarded).toBe(false);
    expect(st.hintsLeft()).toBe(st.START_HINTS + 1);
  });

  it('подсказки тратятся и не уходят в минус', async () => {
    const st = await import('../src/storage');
    for (let i = st.START_HINTS; i > 0; i--) expect(st.useHint()).toBe(i - 1);
    expect(st.useHint()).toBe(-1);
  });

  it('пропуск открывает следующий уровень и попадает в сводку', async () => {
    const st = await import('../src/storage');
    st.recordSkip(4, 10);
    st.logEvent({ ev: 'level_skipped', level: 4 });
    st.logEvent({ ev: 'hint_used', level: 4 });
    const p = st.loadProgress();
    expect(p.skipped[4]).toBe(true);
    expect(p.unlocked).toBe(5);
    const row = st.summarize(st.loadLog(), 10)[3];
    expect(row).toMatchObject({ skipped: true, hints: 1 });
    expect(st.statsText(10)).toContain('пропущен');
  });
});
