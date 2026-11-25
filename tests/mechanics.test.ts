import { describe, expect, it } from 'vitest';
import { applyAction, createGame, expiredLantern, fadeLeftAt, lanternsOnRoad, previewTile, timeOf, type GameState } from '../src/core/game';
import { levelRows, parseLevel } from '../src/core/level';
import { findHint, solutionOf, solveLevel } from '../src/core/solver';
import { bridgeHorizontal } from '../src/core/tiles';
import type { LevelData, TileKind } from '../src/core/types';

function level(grid: string[], deck: TileKind[], extra: Partial<LevelData> = {}) {
  return parseLevel({ id: 'm', name: 'm', grid, startDir: 'N', deck, stars: { two: 0, three: 0 }, ...extra });
}

/** Ставит плитки по очереди (каждая должна быть в лотке). */
function play(s: GameState, kinds: TileKind[]): GameState {
  for (const k of kinds) {
    const slot = s.tray.indexOf(k);
    expect(slot, `плитка ${k} в лотке`).toBeGreaterThanOrEqual(0);
    s = applyAction(s, { type: 'place', slot });
  }
  return s;
}

describe('прыжок', () => {
  it('перепрыгивает камень, воду и фонарь; фонарь не зажигается', () => {
    for (const mid of ['#', '~', 'L']) {
      const l = level(['.E.', '...', `.${mid}.`, '.S.'], ['jump', 'straight', 'straight']);
      const s = createGame(l);
      const p = previewTile(s, 'jump');
      expect(p.ok, mid).toBe(true);
      expect(p.jumped!.idx).toBe(7);
      expect(p.cells.map((c) => c.idx)).toEqual([4]);
      const after = applyAction(s, { type: 'place', slot: 0 });
      expect(after.onRoad[7]).toBe(false);
      if (mid === 'L') expect(lanternsOnRoad(after)).toBe(0);
    }
  });

  it('приземлиться можно только на допустимую клетку, через арку прыгать нельзя', () => {
    expect(previewTile(createGame(level(['.E.', '...', '...', '.S.'], ['jump'])), 'jump').ok).toBe(true);
    expect(previewTile(createGame(level(['.E.', '.#.', '...', '.S.'], ['jump'])), 'jump').reason).toBe('rock');
    expect(previewTile(createGame(level(['.E.', '.~.', '...', '.S.'], ['jump'])), 'jump').reason).toBe('water');
    expect(previewTile(createGame(level(['...', '.S.', '.E.'], ['jump'])), 'jump').reason).toBe('edge');
    // Через арку.
    const p = previewTile(createGame(level(['...', '.E.', '.S.'], ['jump'])), 'jump');
    expect(p.reason).toBe('exitPassThrough');
  });

  it('решатель использует прыжок', () => {
    const l = level(['.E.', '.#.', '.S.'], ['straight', 'jump', 'left']);
    const r = solveLevel(l);
    expect(r.solvable).toBe(true);
    expect(solutionOf(l)[0].kind).toBe('jump');
  });
});

describe('поворотный мост', () => {
  it('поворачивается после каждой поставленной плитки', () => {
    const l = level(['.E.', '.-.', '...', '.S.'], ['straight', 'straight', 'straight']);
    const idx = 4;
    expect(bridgeHorizontal(l, idx, 0)).toBe(true);
    expect(bridgeHorizontal(l, idx, 1)).toBe(false);
    expect(bridgeHorizontal(l, idx, 2)).toBe(true);
  });

  it('пройти можно только вдоль моста; отложить время не двигает', () => {
    const l = level(['.E.', '.-.', '...', '.S.'], ['straight', 'straight', 'straight', 'left']);
    let s = createGame(l);
    s = play(s, ['straight']); // t=1: мост вертикальный — можно на север
    expect(previewTile(s, 'straight').ok).toBe(true);
    // Отложить — это не плитка на поле, мост не поворачивается.
    s = applyAction(s, { type: 'stash', slot: s.tray.indexOf('left') });
    expect(timeOf(s).t).toBe(1);
    expect(previewTile(s, 'straight').ok).toBe(true);
    // А на нечётном ходу (мост горизонтальный) — поперёк нельзя.
    const s2 = createGame(level(['.E.', '.-.', '.S.'], ['straight', 'straight']));
    expect(previewTile(s2, 'straight').reason).toBe('bridgeTurned');
  });

  it('на мосту нельзя повернуть, «прямо x2» проходит мост насквозь', () => {
    const s = createGame(level(['...', '.E.', '.|.', '.S.'], ['left', 'straight2']));
    expect(previewTile(s, 'left').reason).toBe('bridgeTurned');
    expect(previewTile(s, 'straight2').ok).toBe(true);
  });

  it('решатель учитывает номер хода', () => {
    // Мост сначала горизонтальный: сразу пройти нельзя, нужно сделать ход в обход или «подождать» лишней плиткой.
    const l = level(['..E..', '..-..', '.....', '..S..'], ['straight', 'straight', 'straight']);
    expect(solveLevel(l).solvable).toBe(true); // прямо, прямо (t=1, мост вертикальный), прямо
    const blocked = level(['.E.', '.-.', '.S.'], ['straight', 'straight']);
    expect(solveLevel(blocked).solvable).toBe(false);
    expect(levelRows(l)).toEqual(['..E..', '..-..', '.....', '..S..']);
  });
});

describe('гаснущий фонарь', () => {
  const grid = ['.E.', '...', '...', '.3.', '.S.'];

  it('после зажигания горит N ходов, число уменьшается', () => {
    const l = level(grid, ['straight', 'straight', 'straight', 'straight', 'right', 'left', 'left']);
    let s = createGame(l);
    expect(fadeLeftAt(s, 10)).toBe(-1);
    s = play(s, ['straight']);
    expect(fadeLeftAt(s, 10)).toBe(3);
    expect(lanternsOnRoad(s)).toBe(1);
    s = play(s, ['straight', 'straight']);
    expect(fadeLeftAt(s, 10)).toBe(1);
    s = play(s, ['straight']); // третья плитка входит в арку — успели
    expect(s.status).toBe('won');
  });

  it('погас до арки — снова не зажжён, партия проиграна', () => {
    const l = level(['..E', '...', '...', '.3.', '.S.'], ['straight', 'straight', 'straight', 'right', 'left', 'straight']);
    let s = createGame(l);
    s = play(s, ['straight', 'straight', 'straight']);
    expect(fadeLeftAt(s, 10)).toBe(1);
    s = play(s, ['right']);
    expect(fadeLeftAt(s, 10)).toBe(0);
    expect(expiredLantern(s)).toBe(10);
    expect(lanternsOnRoad(s)).toBe(0);
    expect(s.status).toBe('lost');
  });

  it('решатель знает про время', () => {
    expect(solveLevel(level(['..E', '...', '...', '.2.', '.S.'], ['straight', 'straight', 'right', 'left', 'straight', 'straight'])).solvable).toBe(false);
    expect(solveLevel(level(['..E', '...', '...', '.5.', '.S.'], ['straight', 'straight', 'right', 'left', 'straight', 'straight'])).solvable).toBe(true);
  });
});

describe('цель «светлячки»', () => {
  const grid = ['.F.', '...', '.F.', '.S.'];

  it('арки нет, победа при сборе последнего светлячка', () => {
    const l = level(grid, ['straight', 'straight', 'straight', 'left'], { goal: 'fireflies' });
    expect(l.goal).toBe('fireflies');
    expect(l.exit).toEqual({ x: -1, y: -1 });
    let s = createGame(l);
    s = play(s, ['straight']);
    expect(s.status).toBe('playing'); // первый светлячок собран, но не последний
    s = play(s, ['straight', 'straight']);
    expect(s.status).toBe('won');
  });

  it('решатель и подсказка работают без арки', () => {
    const l = level(grid, ['left', 'straight', 'straight', 'right', 'straight'], { goal: 'fireflies' });
    expect(solveLevel(l).solvable).toBe(true);
    let s = createGame(l);
    for (let i = 0; i < 6 && s.status === 'playing'; i++) s = applyAction(s, findHint(s)!);
    expect(s.status).toBe('won');
  });

  it('уровень с целью «светлячки» без светлячков или с аркой — ошибка', () => {
    expect(() => level(['...', '.S.'], ['straight'], { goal: 'fireflies' })).toThrow();
    expect(() => level(['FE.', '.S.'], ['straight'], { goal: 'fireflies' })).toThrow();
  });
});

describe('прокачка: второй слот «отложить», поворот плитки', () => {
  it('второй слот: отложить две плитки, поставить из второго, обменять', () => {
    const l = level(['.E.', '...', '...', '.S.'], ['left', 'right', 'straight', 'straight', 'straight', 'straight']);
    let s = createGame(l, l.deck, 1, { stashSlots: 2 });
    s = applyAction(s, { type: 'stash', slot: 0 }); // left → слот 1
    s = applyAction(s, { type: 'stash', slot: 1 }); // right → слот 2
    expect([s.stash, s.stash2]).toEqual(['left', 'right']);
    // Третий раз отложить некуда.
    expect(applyAction(s, { type: 'stash', slot: 2 })).toBe(s);
    s = applyAction(s, { type: 'swap', slot: 2, with: 1 });
    expect(s.stash2).toBe('straight');
    s = applyAction(s, { type: 'placeStash', from: 1 });
    expect(s.stash2).toBeNull();
    expect(s.road).toHaveLength(2);
  });

  it('с одним слотом второй недоступен', () => {
    const l = level(['.E.', '...', '.S.'], ['left', 'right', 'straight', 'straight']);
    let s = createGame(l);
    s = applyAction(s, { type: 'stash', slot: 0 });
    expect(applyAction(s, { type: 'stash', slot: 1 })).toBe(s);
  });

  it('решатель и подсказка пользуются вторым слотом', () => {
    // Узкий коридор: повороты некуда ставить, «прямо» лежат глубоко в колоде — с одним слотом до них не добраться.
    const l = level(['E', '.', '.', '.', 'S'], ['left', 'right', 'left', 'right', 'straight', 'straight2', 'straight']);
    const one = createGame(l);
    const two = createGame(l, l.deck, 1, { stashSlots: 2 });
    expect(findHint(one)).toBeNull();
    let s = two;
    for (let i = 0; i < 8 && s.status === 'playing'; i++) s = applyAction(s, findHint(s)!);
    expect(s.status).toBe('won');
  });

  it('поворот плитки: прямо → направо → налево → прямо, тратит заряд', () => {
    const l = level(['.E.', '.S.', '...'], ['straight', 'straight2', 'bridge']);
    let s = createGame(l, l.deck, 1, { rotations: 2 });
    s = applyAction(s, { type: 'rotate', slot: 0 });
    expect(s.tray[0]).toBe('right');
    expect(s.rotations).toBe(1);
    s = applyAction(s, { type: 'rotate', slot: 0 });
    expect(s.tray[0]).toBe('left');
    expect(applyAction(s, { type: 'rotate', slot: 0 })).toBe(s); // зарядов нет
    // «Прямо x2» не поворачивается.
    expect(applyAction(createGame(l, l.deck, 1, { rotations: 1 }), { type: 'rotate', slot: 1 }).tray[1]).toBe('straight2');
  });

});
