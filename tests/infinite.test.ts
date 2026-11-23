import { describe, expect, it } from 'vitest';
import { parseLevel } from '../src/core/level';
import { applyAction, canPlace, createGame, deckLeft, starsFor, tileLeadsToExit, undo, upcoming, type GameState } from '../src/core/game';
import { findHint, solveLevel } from '../src/core/solver';
import { LEVELS } from '../src/levels/index';
import type { LevelData, TileKind } from '../src/core/types';

function inf(grid: string[], tileSet: TileKind[], extra: Partial<LevelData> = {}) {
  return parseLevel({ id: 'test', name: 't', grid, startDir: 'N', deck: [], tileSet, stars: { two: 0, three: 0 }, allowStash: false, ...extra });
}
const board = (s: GameState) => ({ level: s.level, onRoad: s.onRoad, head: s.head, dir: s.dir });

describe('бесконечная колода', () => {
  const open = inf(['.E..', '....', '..L.', '....', '.S..'], ['straight', 'left', 'right']);

  it('плитки берутся из набора, колода не кончается', () => {
    const g = createGame(open, [], 42);
    expect(g.tray.every((t) => t && open.tileSet!.includes(t))).toBe(true);
    expect(deckLeft(g)).toBe(Infinity);
    expect(upcoming(g, 2)).toEqual([]);
  });

  it('одно и то же зерно — одни и те же плитки (отмена возвращает те же плитки)', () => {
    const a = createGame(open, [], 7);
    const b = createGame(open, [], 7);
    expect(a.tray).toEqual(b.tray);
    const slot = a.tray.findIndex((t) => canPlace(a, t));
    const a2 = applyAction(a, { type: 'place', slot });
    expect(undo(a2).tray).toEqual(a.tray);
  });

  it('честная раздача: пока до выхода можно дойти, в лотке есть плитка, которая к нему ведёт', () => {
    for (let seed = 1; seed <= 40; seed++) {
      let s = createGame(open, [], seed);
      for (let step = 0; step < 30 && s.status === 'playing'; step++) {
        const helpful = s.tray.some((t) => t !== null && tileLeadsToExit(board(s), t));
        expect(helpful, `зерно ${seed}, ход ${step}`).toBe(true);
        s = applyAction(s, findHint(s)!);
      }
      expect(s.status, `зерно ${seed}`).toBe('won');
    }
  });

  it('поражение — только когда дорога в тупике', () => {
    // Узкий коридор: один поворот — и дорога упирается в стену.
    const l = inf(['#E#', '#.#', '#.#', '#S#'], ['straight', 'left']);
    let s = createGame(l, [], 3);
    expect(s.status).toBe('playing');
    // Ставим «налево», если он есть в лотке: дальше некуда → тупик.
    const slot = s.tray.indexOf('left');
    if (slot >= 0) {
      s = applyAction(s, { type: 'place', slot });
      expect(s.status).toBe('lost');
    }
    // А пока «прямо» встаёт — игра продолжается, даже если в лотке одни повороты.
    const g = { ...createGame(l, [], 3), tray: ['left', 'left', 'left'] as TileKind[] };
    expect(applyAction(g, { type: 'place', slot: 0 }).status).toBe('lost');
  });

  it('звёзды по отменам: 0 — 3, 1–2 — 2, больше — 1', () => {
    const l = inf(['.E.', '...', '.S.'], ['straight']);
    const won = (undos: number): GameState => {
      const s = applyAction(applyAction(createGame(l, [], 1), { type: 'place', slot: 0 }), { type: 'place', slot: 0 });
      return { ...s, undosUsed: undos };
    };
    expect(won(0).status).toBe('won');
    expect(starsFor(won(0))).toBe(3);
    expect(starsFor(won(1))).toBe(2);
    expect(starsFor(won(2))).toBe(2);
    expect(starsFor(won(3))).toBe(1);
  });

  it('решатель считает дороги и минимум плиток по геометрии', () => {
    const r = solveLevel(inf(['.E.', '...', '...', '.S.'], ['straight']));
    expect(r).toMatchObject({ solvable: true, roads: 1, minTiles: 3 });
  });

  it('уровни 1–4 бесконечные и без слота «отложить», дальше — с колодой', () => {
    LEVELS.slice(0, 4).forEach((l) => {
      expect(l.tileSet, `уровень ${l.id}`).not.toBeNull();
      expect(l.allowStash).toBe(false);
    });
    LEVELS.slice(4).forEach((l) => expect(l.tileSet, `уровень ${l.id}`).toBeNull());
  });

  it("«отложить» недоступен, если уровень его не разрешает", () => {
    const g = createGame(LEVELS[4]);
    expect(LEVELS[4].allowStash).toBe(false);
    expect(applyAction(g, { type: 'stash', slot: 0 })).toBe(g);
  });
});
