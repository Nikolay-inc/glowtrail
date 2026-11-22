import { describe, expect, it } from 'vitest';
import { parseLevel } from '../src/core/level';
import {
  applyAction,
  canUndo,
  createGame,
  isExitOpen,
  previewTile,
  starsFor,
  tilesLeft,
  undo,
  type GameState,
} from '../src/core/game';
import { findHint, solveLevel } from '../src/core/solver';
import { LEVELS } from '../src/levels/index';
import type { LevelData, TileKind } from '../src/core/types';

function level(grid: string[], deck: TileKind[], extra: Partial<LevelData> = {}) {
  return parseLevel({ id: 0, name: 't', grid, startDir: 'N', deck, stars: { two: 1, three: 2 }, ...extra });
}

const place = (s: GameState, slot: number) => applyAction(s, { type: 'place', slot });

describe('размещение плиток', () => {
  it('прямая встаёт на клетку впереди', () => {
    const g = createGame(level(['.E.', '...', '.S.'], ['straight', 'straight']));
    const p = previewTile(g, 'straight');
    expect(p.ok).toBe(true);
    expect(p.cells).toEqual([{ x: 1, y: 1, idx: 4 }]);
    expect(p.newDir).toBe(0);
  });

  it('поворот занимает клетку впереди и разворачивает дорогу', () => {
    const g = createGame(level(['...', '.E.', '...', '.S.'], ['left', 'right']));
    expect(previewTile(g, 'left')).toMatchObject({ ok: true, cells: [{ x: 1, y: 2 }], newDir: 3 });
    expect(previewTile(g, 'right')).toMatchObject({ ok: true, cells: [{ x: 1, y: 2 }], newDir: 1 });
  });

  it('прямо x2 занимает две клетки', () => {
    const g = createGame(level(['.E.', '...', '...', '.S.'], ['straight2']));
    expect(previewTile(g, 'straight2').cells.map((c) => c.y)).toEqual([2, 1]);
  });

  it('нельзя уйти за край поля', () => {
    const g = createGame(level(['E..', 'S..'], ['left']));
    // Старт смотрит вверх, впереди выход — проверим поворот с края: сначала нужна клетка впереди.
    const g2 = createGame(level(['S..', '..E'], ['straight']));
    expect(previewTile(g2, 'straight')).toMatchObject({ ok: false, reason: 'edge' });
    expect(previewTile(g, 'left').ok).toBe(true);
  });

  it('нельзя ставить в камень', () => {
    const g = createGame(level(['.E.', '.#.', '.S.'], ['straight']));
    expect(previewTile(g, 'straight')).toMatchObject({ ok: false, reason: 'rock', blocked: { x: 1, y: 1 } });
  });

  it('вода проходима только мостом, а мост — только над водой', () => {
    const g = createGame(level(['.E.', '.~.', '.S.'], ['straight', 'bridge']));
    expect(previewTile(g, 'straight')).toMatchObject({ ok: false, reason: 'water' });
    expect(previewTile(g, 'bridge').ok).toBe(true);
    const dry = createGame(level(['.E.', '...', '.S.'], ['bridge']));
    expect(previewTile(dry, 'bridge')).toMatchObject({ ok: false, reason: 'bridgeNeedsWater' });
  });

  it('прямо x2 не может перепрыгнуть воду или камень', () => {
    const g = createGame(level(['.E.', '...', '.#.', '...', '.S.'], ['straight2']));
    const s = place(createGame(level(['.E.', '...', '.~.', '...', '.S.'], ['straight', 'straight2'])), 0);
    expect(previewTile(s, 'straight2')).toMatchObject({ ok: false, reason: 'water' });
    expect(previewTile(place(g, 0), 'straight2').ok).toBe(false);
  });

  it('нельзя ставить на уже проложенную дорогу', () => {
    // Петля: вправо, вправо, вправо — третий поворот упирается в старт.
    const g = createGame(level(['E...', '....', '.S..', '....'], ['right', 'right', 'right', 'right']));
    let s = place(g, 0); // (1,1) → вправо
    s = place(s, 1); // (2,1) → вниз
    s = place(s, 2); // (2,2) → влево
    expect(s.road).toHaveLength(4);
    expect(previewTile(s, 'straight')).toMatchObject({ ok: false, reason: 'road', blocked: { x: 1, y: 2 } });
  });

  it('выход закрыт, пока не пройдены все фонари', () => {
    const g = createGame(level(['.E.', '.S.', 'L..'], ['straight']));
    expect(isExitOpen(g)).toBe(false);
    expect(previewTile(g, 'straight')).toMatchObject({ ok: false, reason: 'exitClosed' });
  });

  it('прямо x2 не проходит сквозь выход', () => {
    const g = createGame(level(['...', '.E.', '.S.'], ['straight2']));
    expect(previewTile(g, 'straight2')).toMatchObject({ ok: false, reason: 'exitPassThrough' });
  });
});

describe('лоток, колода, отложить и отмена', () => {
  const lvl = level(['.E.', '...', '...', '...', '.S.'], ['left', 'straight', 'straight', 'straight2', 'right']);

  it('в лотке три верхние плитки, на освободившееся место приходит следующая', () => {
    const g = createGame(lvl);
    expect(g.tray).toEqual(['left', 'straight', 'straight']);
    const s = place(g, 1);
    expect(s.tray).toEqual(['left', 'straight2', 'straight']);
    expect(s.road).toHaveLength(2);
    expect(tilesLeft(s)).toBe(4);
  });

  it('отложить: плитка уходит в запас, позже её можно поставить', () => {
    const g = createGame(lvl);
    const s = applyAction(g, { type: 'stash', slot: 0 });
    expect(s.stash).toBe('left');
    expect(s.tray).toEqual(['straight2', 'straight', 'straight']);
    // Второй раз отложить нельзя, пока слот занят.
    expect(applyAction(s, { type: 'stash', slot: 1 })).toBe(s);
    const s2 = applyAction(s, { type: 'placeStash' });
    expect(s2.stash).toBeNull();
    expect(s2.dir).toBe(3);
  });

  it('отмена без ограничений: можно отменить много ходов подряд, до старта', () => {
    const g = createGame(lvl);
    const s = place(place(place(g, 1), 2), 0);
    expect(s.road).toHaveLength(4);
    expect(canUndo(s)).toBe(true);
    const u1 = undo(s);
    const u2 = undo(u1);
    const u3 = undo(u2);
    expect(u3.road).toHaveLength(1);
    expect(u3.undosUsed).toBe(3);
    expect(canUndo(u3)).toBe(false); // это уже старт
    expect(undo(u3)).toBe(u3);
  });

  it('незаконный ход не меняет состояние', () => {
    const g = createGame(level(['.E.', '.#.', '.S.'], ['straight', 'left']));
    expect(applyAction(g, { type: 'place', slot: 0 })).toBe(g);
  });
});

describe('победа и поражение', () => {
  it('победа, когда дорога дошла до выхода через все фонари', () => {
    const g = createGame(level(['.E.', '.L.', '...', '.S.'], ['straight', 'straight', 'straight', 'left', 'right']));
    let s = place(g, 0);
    s = place(s, 1);
    expect(s.status).toBe('playing');
    s = place(s, 2);
    expect(s.status).toBe('won');
    expect(tilesLeft(s)).toBe(2);
    expect(starsFor(s)).toBe(3);
  });

  it('звёзды зависят от оставшихся плиток', () => {
    const lvl = level(['.E.', '...', '.S.'], ['straight', 'straight', 'left'], { stars: { two: 1, three: 2 } });
    const s = place(place(createGame(lvl), 0), 1);
    expect(s.status).toBe('won');
    expect(tilesLeft(s)).toBe(1);
    expect(starsFor(s)).toBe(2);
  });

  it('поражение, когда ни одну плитку нельзя поставить', () => {
    const g = createGame(level(['E..', '...', '.S.'], ['right', 'bridge', 'bridge']));
    expect(g.status).toBe('playing');
    const s = place(g, 0); // поворот направо, дальше суша — мосты не встают
    expect(s.tray.filter(Boolean)).toEqual(['bridge', 'bridge']);
    expect(s.status).toBe('lost');
  });

  it('поражение, когда плитки кончились', () => {
    const g = createGame(level(['E..', '...', '...', 'S..'], ['straight']));
    const s = place(g, 0);
    expect(s.status).toBe('lost');
  });

  it('сразу поражение, если на старте нет ни одного хода', () => {
    const g = createGame(level(['E..', '#..', 'S..'], ['straight']));
    expect(g.status).toBe('lost');
  });
});

describe('решатель', () => {
  it('находит единственное решение простого уровня', () => {
    const r = solveLevel(level(['.E.', '...', '...', '.S.'], ['straight', 'straight', 'straight']));
    expect(r).toMatchObject({ solvable: true, roads: 1, minTiles: 3, maxLeftover: 0 });
  });

  it('считает разные дороги, а не разные порядки ходов', () => {
    // Прямо+прямо и прямо x2 дают одну и ту же дорогу.
    const r = solveLevel(level(['.E.', '...', '.S.'], ['straight', 'straight', 'straight2']));
    expect(r.roads).toBe(1);
    expect(r.maxLeftover).toBe(2);
  });

  it('понимает, когда без «отложить» не решить', () => {
    const lvl = LEVELS.find((l) => l.tutorial === 'stash')!;
    expect(solveLevel(lvl, { allowStash: false }).solvable).toBe(false);
    expect(solveLevel(lvl).solvable).toBe(true);
  });

  it('подсказки решателя проводят каждый уровень до победы', () => {
    for (const lvl of LEVELS) {
      let s = createGame(lvl);
      for (let i = 0; i < 40 && s.status === 'playing'; i++) {
        const hint = findHint(s);
        expect(hint, `уровень ${lvl.id}`).not.toBeNull();
        s = applyAction(s, hint!);
      }
      expect(s.status, `уровень ${lvl.id}`).toBe('won');
      expect(starsFor(s), `уровень ${lvl.id}`).toBe(3);
    }
  });
});
