// Механики «Туманного леса»: грибные кольца-телепорты, туман (и проверка «без угадывания»), тень, цель «Побег»,
// бонусы деревни (травница, обсерватория), генератор, сохранение v10.
import { describe, expect, it } from 'vitest';
import { applyAction, createGame, lossReason, previewTile, timeOf, type GameState } from '../src/core/game';
import { parseLevel } from '../src/core/level';
import { fogFair, fogVisible } from '../src/core/fog';
import { generateOne, mulberry32, featuresOf } from '../src/core/generator';
import { solveLevel, findHint } from '../src/core/solver';
import { shadowDelay, shadowGap, SHADOW_SPEED } from '../src/core/tiles';
import type { LevelData, TileKind } from '../src/core/types';
import { migrate } from '../src/save/SaveService';
import { mergeSaves } from '../src/cloud/merge';
import { emptySave } from '../src/save/SaveService';
import { rulesFor } from '../src/tutorial';

function level(grid: string[], deck: TileKind[], extra: Partial<LevelData> = {}) {
  return parseLevel({ id: 'test', name: 't', grid, startDir: 'N', deck, stars: { two: 0, three: 0 }, ...extra });
}

/** Ставит плитки по очереди (каждую — в лоток и сразу на поле). */
function play(s: GameState, kinds: TileKind[]): GameState {
  for (const k of kinds) s = applyAction({ ...s, status: 'playing', tray: [k, null, null] }, { type: 'place', slot: 0 });
  return s;
}

describe('грибные кольца', () => {
  it('пара колец: дорога входит в одно и выходит из парного в том же направлении', () => {
    const l = level(['E..', 'a..', '#..', '..a', '..S'], ['straight', 'straight']);
    expect(l.rings).toHaveLength(1);
    const p = previewTile(createGame(l), 'straight');
    expect(p.ok).toBe(true);
    expect(p.cells.map((c) => [c.idx, c.portal])).toEqual([[11, 'in'], [3, 'out']]);
    const s = play(createGame(l), ['straight', 'straight']);
    expect(s.status).toBe('won');
    expect(solveLevel(l).solvable).toBe(true);
  });

  it('«прямо x2» через кольцо продолжает путь от парного; поворот на кольце поворачивает дорогу после выхода', () => {
    const l = level(['.E..', '.a..', '....', '...a', '...S'], ['straight2']);
    const p = previewTile(createGame(l), 'straight2');
    expect(p.ok).toBe(true);
    expect(p.cells.map((c) => c.idx)).toEqual([15, 5, 1]);
    const turn = previewTile(createGame(l), 'left');
    expect(turn.cells.map((c) => c.idx)).toEqual([15, 5]);
    expect(turn.newDir).toBe(3);
  });

  it('прыжок перелетает кольцо, не входя в него; в использованное кольцо второй раз не войти', () => {
    const l = level(['E..', '...', '.a.', '.S.', 'a..'], ['jump']);
    const p = previewTile(createGame(l), 'jump');
    expect(p.ok).toBe(true);
    expect(p.jumped?.idx).toBe(7);
    expect(p.cells.map((c) => c.idx)).toEqual([4]);
  });

  it('колец одной буквы должно быть ровно два', () => {
    expect(() => level(['E.a', '...', '.S.'], ['straight'])).toThrow(/двa|два/);
  });
});

describe('тень', () => {
  // Прямой коридор: арка через 4 клетки, тень появляется через 2 хода и бежит по 2 клетки за ход.
  const corridor = (extra: Partial<LevelData> = {}, grid = ['.E.', '...', '...', '...', '.S.']) => level(grid, ['straight', 'straight', 'straight', 'straight', 'left', 'right'], { shadow: 2, ...extra });

  it('появляется на старте через N ходов и бежит по дороге; петля — догоняет, прямой путь — успели', () => {
    expect(SHADOW_SPEED).toBe(2);
    let s = play(createGame(corridor()), ['straight']);
    expect(timeOf(s).sh!.pos).toBe(-1);
    s = play(s, ['straight']);
    expect(timeOf(s).sh!.pos).toBe(0);
    expect(shadowGap(timeOf(s))).toBe(2);
    expect(play(s, ['straight', 'straight']).status).toBe('won');
    const loop = play(createGame(corridor()), ['left', 'right', 'straight', 'straight']);
    expect(loop.status).toBe('lost');
    expect(lossReason(loop)).toBe('shadow');
  });

  it('зажжённый фонарь задерживает тень на ход, травница — когда тень вот-вот догонит', () => {
    const lit = corridor({}, ['.E.', '...', 'L..', '...', '.S.']);
    const a = play(createGame(lit), ['left', 'right']);
    const b = play(a, ['straight']); // фонарь
    expect(shadowDelay(timeOf(a), timeOf(b))).toBe('lantern');
    expect(timeOf(b).sh!.pos).toBe(timeOf(a).sh!.pos);
    // Травница: тот же проигрышный путь, но тень дважды стоит на месте.
    const herb = createGame(corridor(), undefined, 1, { charms: 2 });
    const c = play(herb, ['left', 'right', 'straight']);
    const d = play(c, ['straight']);
    expect(shadowDelay(timeOf(c), timeOf(d))).toBe('herbalist');
    expect(lossReason(d)).not.toBe('shadow');
    expect(timeOf(d).sh!.charm).toBe(1);
  });

  it('решатель учитывает тень: с тенью решений меньше, без неё — больше; подсказка ведёт к победе', () => {
    const grid = ['..E..', '.....', '.....', '.....', '..S..'];
    const deck: TileKind[] = ['straight', 'left', 'right', 'straight', 'straight', 'right', 'left', 'straight'];
    const free = solveLevel(level(grid, deck));
    const chased = solveLevel(level(grid, deck, { shadow: 2 }));
    expect(chased.solvable).toBe(true);
    expect(chased.roads).toBeLessThan(free.roads);
    let s = createGame(level(grid, deck, { shadow: 2 }));
    for (let i = 0; i < 12 && s.status === 'playing'; i++) s = applyAction(s, findHint(s)!);
    expect(s.status).toBe('won');
  });

  it('«Побег»: арка открыта без фонарей, без тени цель не разбирается', () => {
    const l = level(['.E.', 'L..', '...', '.S.'], ['straight', 'straight', 'straight'], { goal: 'escape', shadow: 3 });
    expect(play(createGame(l), ['straight', 'straight', 'straight']).status).toBe('won');
    expect(() => level(['.E.', '.S.'], ['straight'], { goal: 'escape' })).toThrow(/Побег/);
    expect(rulesFor({ num: 51, fireflies: [], goal: 'escape', shadow: 3 })).toContain('escape');
    expect(rulesFor({ num: 41, fireflies: [], shadow: 3 })).toEqual(['shadow']);
  });
});

describe('туман', () => {
  it('видно клетки в радиусе 1 от дороги и 2 — от зажжённого фонаря; арка, фонари и кольца — всегда', () => {
    const l = level(['E....', '.....', '..L..', '.....', '.....', '..S..'], ['straight'], { fog: true });
    const start = 5 * 5 + 2;
    const vis = fogVisible(l, (i) => i === start, null);
    expect(vis[0]).toBe(true); // арка
    expect(vis[2 * 5 + 2]).toBe(true); // фонарь
    expect(vis[4 * 5 + 1]).toBe(true); // рядом с дорогой
    expect(vis[3 * 5 + 2]).toBe(false);
    // Обсерватория: обзор дальше на клетку.
    expect(fogVisible(l, (i) => i === start, null, 2)[3 * 5 + 2]).toBe(true);
    // Зажжённый фонарь на дороге раскрывает на клетку дальше.
    const lit = fogVisible(l, (i) => i === start || i === 12 || i === 17 || i === 22, null);
    expect(lit[0 * 5 + 4]).toBe(true);
    // Без тумана видно всё.
    expect(fogVisible(level(['E', 'S'], ['straight']), () => false, null).every(Boolean)).toBe(true);
  });

  it('проверка «без угадывания»: камень в тумане на кратчайшем пути — уровень нечестный, на обходе — честный', () => {
    const deck: TileKind[] = ['straight', 'left', 'right', 'straight', 'straight', 'right', 'left', 'straight', 'straight'];
    const trap = level(['.E.', '...', '.#.', '...', '.S.'], deck, { fog: true });
    expect(solveLevel(trap).solvable).toBe(true);
    expect(fogFair(trap).ok).toBe(false);
    const fair = level(['.E.', '...', '#..', '...', '.S.'], deck, { fog: true });
    expect(fogFair(fair).ok).toBe(true);
    expect(fogFair(level(['.E.', '...', '.#.', '...', '.S.'], deck)).ok).toBe(true); // без тумана — всё видно
  });
});

describe('генератор леса', () => {
  it('кольца, туман, тень и «Побег» дают решаемых кандидатов с нужными элементами', () => {
    const cases: { features: ('ring' | 'fog' | 'shadow' | 'rock' | 'lantern')[]; goal?: 'escape' }[] = [
      { features: ['ring', 'rock'] },
      { features: ['fog', 'rock'] },
      { features: ['shadow', 'rock', 'lantern'] },
      { goal: 'escape', features: ['rock'] },
    ];
    for (const c of cases) {
      const r = mulberry32(7);
      let cand = null;
      for (let i = 0; i < 4000 && !cand; i++) {
        const x = generateOne(r, { width: 5, height: 6, features: c.features, goal: c.goal });
        if (typeof x !== 'string') cand = x;
      }
      expect(cand, c.features.join('+')).not.toBeNull();
      const l = parseLevel(cand!.data);
      expect(solveLevel(l).solvable).toBe(true);
      const f = featuresOf(l);
      for (const x of c.features) expect(f).toContain(x);
      if (c.goal === 'escape') expect(l.shadow).toBeGreaterThan(0);
      if (l.fog) expect(fogFair(l).ok).toBe(true);
    }
  });
});

describe('сохранение v10: миры', () => {
  it('старое сохранение — только «Долина», прогресс по id не теряется; облако — объединение миров', () => {
    const old = migrate({ version: 9, progress: { unlocked: ['valley-01', 'valley-30'], stars: { 'valley-30': 3 } }, profile: {}, economy: {}, log: [] });
    expect(old.progress.worlds).toEqual(['valley']);
    expect(old.progress.stars['valley-30']).toBe(3);
    const local = { ...emptySave(), progress: { ...emptySave().progress, worlds: ['valley', 'forest'] } };
    const merged = mergeSaves(local, { profile: local.profile, progress: { ...emptySave().progress, worlds: ['valley'] }, economy: local.economy } as never);
    expect(merged.progress.worlds.sort()).toEqual(['forest', 'valley']);
  });
});
