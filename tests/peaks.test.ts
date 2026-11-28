// Механики «Ледяных вершин»: лёд, сугроб и тёплый фонарь, ветер, сигнальные огни.
import { describe, expect, it } from 'vitest';
import { applyAction, createGame, isExitOpen, previewTile, signalsLit, type GameState } from '../src/core/game';
import { levelRows, parseLevel } from '../src/core/level';
import { solutionOf, solveLevel } from '../src/core/solver';
import { driftMelted } from '../src/core/tiles';
import { generateOne, mulberry32, windIceChains } from '../src/core/generator';
import type { LevelData, TileKind } from '../src/core/types';

function level(grid: string[], deck: TileKind[], extra: Partial<LevelData> = {}) {
  return parseLevel({ id: 'p', name: 'p', grid, startDir: 'N', deck, stars: { two: 0, three: 0 }, ...extra });
}

function play(s: GameState, kinds: TileKind[]): GameState {
  for (const k of kinds) {
    const slot = s.tray.indexOf(k);
    expect(slot, `плитка ${k} в лотке`).toBeGreaterThanOrEqual(0);
    s = applyAction(s, { type: 'place', slot });
  }
  return s;
}

describe('лёд', () => {
  it('закончил ход на льду — скользит до не-ледяной клетки, она тоже на дороге', () => {
    const l = level(['.E.', '...', '.=.', '.=.', '.S.'], ['straight', 'straight']);
    const p = previewTile(createGame(l), 'straight');
    expect(p.ok).toBe(true);
    expect(p.cells.map((c) => c.idx)).toEqual([10, 7, 4]);
    expect(p.cells.map((c) => c.forced ?? '')).toEqual(['', 'ice', 'ice']);
  });

  it('камень и край поля останавливают на последней ледяной клетке', () => {
    const rock = previewTile(createGame(level(['.E.', '.#.', '.=.', '.=.', '.S.'], ['straight'])), 'straight');
    expect(rock.cells.map((c) => c.idx)).toEqual([10, 7]);
    const edge = previewTile(createGame(level(['.=.', '.=.', '.S.', 'E..'], ['straight'])), 'straight');
    expect(edge.cells.map((c) => c.idx)).toEqual([4, 1]);
  });

  it('фонарь по пути скольжения зажигается и открывает арку; в открытую арку можно въехать', () => {
    const l = level(['.E.', '.L.', '.=.', '.S.'], ['straight', 'straight']);
    const s = play(createGame(l), ['straight']);
    expect(s.onRoad[4]).toBe(true);
    expect(isExitOpen(s)).toBe(true);
    // Лёд прямо перед аркой: въезжаем, если фонарей нет.
    const w = play(createGame(level(['.E.', '.=.', '.=.', '.S.'], ['straight'])), ['straight']);
    expect(w.status).toBe('won');
    // Закрытая арка останавливает скольжение.
    const closed = previewTile(createGame(level(['LE.', '.=.', '.=.', '.S.'], ['straight'])), 'straight');
    expect(closed.cells.map((c) => c.idx)).toEqual([7, 4]);
  });

  it('после поворота скользит в новом направлении; дорога рисуется непрерывной', () => {
    const l = level(['....', '.==.', '.S..', '..E.'], ['left', 'straight', 'straight']);
    let s = createGame(l);
    // Поворот направо на лёд (клетка 5 — «.==.» вторая) → скользим вправо до края? Клетка 6 — лёд, 7 — трава.
    const p = previewTile(s, 'left');
    expect(p.ok).toBe(true);
    s = play(s, ['left']);
    expect(s.dir).toBe(3);
    expect(s.road.map((r) => r.idx)).toEqual([9, 5, 4]);
    expect(s.road[1].dirOut).toBe(3);
    expect(s.road[2].dirIn).toBe(3);
  });

  it('решатель и решение знают скольжение', () => {
    const l = level(['..E..', '.....', '..=..', '..=..', '..S..'], ['straight', 'straight', 'left', 'right']);
    const r = solveLevel(l);
    expect(r.solvable).toBe(true);
    const sol = solutionOf(l);
    expect(sol.length).toBeGreaterThan(0);
    expect(sol[0].cells.length).toBeGreaterThan(1);
  });
});

describe('сугроб и тёплый фонарь', () => {
  it('сугроб непроходим, пока не загорится соседний фонарь', () => {
    const l = level(['.E.', '.*L', '...', '.S.'], ['straight', 'straight', 'right', 'left', 'left', 'straight']);
    const s = createGame(l);
    expect(previewTile(play(s, ['straight']), 'straight').reason).toBe('drift');
    expect(driftMelted(l, (i) => s.onRoad[i], 4)).toBe(false);
  });

  it('фонарь рядом зажжён — сугроб растаял и стал обычной клеткой', () => {
    const l = level(['....', '.*L.', '..S.', 'E...'], ['straight', 'left', 'left', 'straight', 'left', 'straight']);
    let s = createGame(l);
    s = play(s, ['straight']); // зажгли фонарь 6
    expect(driftMelted(l, (i) => s.onRoad[i], 5)).toBe(true);
    const p = previewTile(s, 'left');
    expect(p.ok).toBe(true);
    expect(solveLevel(l).solvable).toBe(true);
  });

  it('прыжок перелетает нерастаявший сугроб', () => {
    const l = level(['.E.', '...', '.*.', '.S.'], ['jump', 'straight']);
    expect(previewTile(createGame(l), 'jump').ok).toBe(true);
  });
});

describe('ветер', () => {
  it('закончил ход на ветре — сдвиг на клетку по стрелке, дорога поворачивает по ветру', () => {
    const l = level(['...E', '....', '.>..', '.S..'], ['straight', 'left', 'straight']);
    const s = play(createGame(l), ['straight']);
    expect(s.road.map((r) => r.idx)).toEqual([13, 9, 10]);
    expect(s.dir).toBe(1);
    expect(s.road[1].dirOut).toBe(1);
  });

  it('препятствие по стрелке — ветер не сдвигает', () => {
    const l = level(['...E', '....', '.>#.', '.S..'], ['straight']);
    const p = previewTile(createGame(l), 'straight');
    expect(p.cells.map((c) => c.idx)).toEqual([9]);
    expect(p.newDir).toBe(0);
  });

  it('сдвиг на лёд запускает скольжение', () => {
    const l = level(['.....E', '......', '.>==..', '.S....'], ['straight']);
    const p = previewTile(createGame(l), 'straight');
    expect(p.cells.map((c) => c.idx)).toEqual([13, 14, 15, 16]);
    expect(p.cells.map((c) => c.forced ?? '')).toEqual(['', 'wind', 'ice', 'ice']);
    expect(windIceChains(l)).toBe(1);
  });

  it('проход по ветру плиткой «прямо x2» не сдвигает (только конец хода)', () => {
    const l = level(['.E.', '...', '.>.', '.S.'], ['straight2']);
    const p = previewTile(createGame(l), 'straight2');
    expect(p.cells.map((c) => c.idx)).toEqual([7, 4]);
  });
});

describe('сигнальные огни', () => {
  const sig = (grid: string[], deck: TileKind[]) => level(grid, deck, { goal: 'signals' });

  it('разбор: номера по порядку, только у цели signals', () => {
    expect(sig(['.E.', '.B.', '.A.', '.S.'], ['straight']).fires).toEqual([7, 4]);
    expect(() => level(['.E.', '.B.', '.A.', '.S.'], ['straight'])).toThrow();
    expect(() => sig(['.E.', '.C.', '.A.', '.S.'], ['straight'])).toThrow();
    expect(() => sig(['.E.', '...', '.A.', '.S.'], ['straight'])).toThrow();
    expect(levelRows(sig(['.E.', '.B.', '.A.', '.S.'], ['straight']))).toEqual(['.E.', '.B.', '.A.', '.S.']);
  });

  it('не тот по счёту — не загорается, ход не проходит (не проигрыш), номер мигает', () => {
    const l = sig(['.E..', '.A..', '.B..', '.S..'], ['straight', 'right', 'left', 'left']);
    const s = createGame(l);
    const p = previewTile(s, 'straight');
    expect(p.ok).toBe(false);
    expect(p.reason).toBe('fireOrder');
    expect(p.fire).toBe(9);
    expect(s.status).toBe('playing');
  });

  it('по порядку — горят, арка открывается, когда горят все', () => {
    const l = sig(['.E.', '.B.', '.A.', '.S.'], ['straight', 'straight', 'straight']);
    let s = play(createGame(l), ['straight']);
    expect(signalsLit(s)).toBe(1);
    expect(isExitOpen(s)).toBe(false);
    s = play(s, ['straight']);
    expect(isExitOpen(s)).toBe(true);
    s = play(s, ['straight']);
    expect(s.status).toBe('won');
  });

  it('решатель находит порядок огней', () => {
    const deck: TileKind[] = ['straight', 'straight', 'straight', 'right', 'left', 'straight', 'straight', 'left', 'right'];
    expect(solveLevel(sig(['..E', '.B.', '.A.', '.S.'], deck)).solvable).toBe(true);
    // Обратный порядок: по прямой не пройти, нужен обход — его колода не позволяет.
    expect(solveLevel(sig(['.E.', '.A.', '.B.', '.S.'], ['straight', 'straight', 'straight'])).solvable).toBe(false);
  });
});

describe('генератор вершин', () => {
  const gen = (features: string[], goal?: 'signals', seed = 7) => {
    const r = mulberry32(seed);
    for (let i = 0; i < 800; i++) {
      const c = generateOne(r, { width: 5, height: 6, features: features as never, goal });
      if (typeof c !== 'string') return c;
    }
    return null;
  };
  it('лёд, сугроб, ветер и огни: кандидат решаем, нужный элемент на месте', () => {
    for (const [f, goal, ch] of [[['ice', 'rock'], undefined, '='], [['drift', 'lantern', 'rock'], undefined, '*'], [['wind', 'rock'], undefined, '>'], [['rock'], 'signals', 'A']] as const) {
      const c = gen([...f], goal);
      expect(c, f.join('+')).not.toBeNull();
      const lv = parseLevel(c!.data);
      expect(solveLevel(lv).solvable).toBe(true);
      if (ch === '>') expect(lv.wind.some((d) => d >= 0)).toBe(true);
      else expect(c!.data.grid.join('')).toContain(ch);
    }
  }, 120_000);
});
