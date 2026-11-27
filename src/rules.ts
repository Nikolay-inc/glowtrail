// Сценарии мини-демонстраций для карточек правил. Каждый шаг выполняется настоящей логикой игры,
// поэтому то, что видит игрок, — ровно те правила, по которым он будет играть (это проверяют тесты).

import { applyAction, createGame, previewTile, type GameState } from './core/game';
import { parseLevel } from './core/level';
import type { Level, TileKind } from './core/types';
import type { StringKey } from './strings';
import type { RuleId } from './tutorial';

/** Шаг: поставить плитку, показать неудачную попытку (красный крестик) или вернуть дорогу к старту. */
export type DemoStep = { place: TileKind } | { fail: TileKind } | { reset: true };

export interface DemoPhase {
  grid: string[];
  startDir: 'N' | 'E' | 'S' | 'W';
  steps: DemoStep[];
  goal?: 'classic' | 'fireflies' | 'escape';
  fog?: boolean;
  shadow?: number;
  /** Чем заканчивается фаза (по умолчанию — победой): lost — показываем, как тень догоняет. */
  ends?: 'lost';
}

export interface RuleCard {
  id: RuleId;
  title: StringKey;
  text: StringKey;
  /** Фазы показываются по очереди и повторяются по кругу. */
  phases: DemoPhase[];
}

export const RULE_CARDS: Record<RuleId, RuleCard> = {
  road: {
    id: 'road',
    title: 'rule_road_title',
    text: 'rule_road_text',
    phases: [{ grid: ['.E.', '...', '.S.'], startDir: 'N', steps: [{ place: 'straight' }, { place: 'straight' }] }],
  },
  lantern: {
    id: 'lantern',
    title: 'rule_lantern_title',
    text: 'rule_lantern_text',
    phases: [
      {
        grid: ['.E.', 'L..', '.S.'],
        startDir: 'N',
        // Сначала прямо к двери — заперто; потом через фонарь — дверь открывается.
        steps: [{ place: 'straight' }, { fail: 'straight' }, { reset: true }, { place: 'left' }, { place: 'right' }, { place: 'right' }, { place: 'straight' }],
      },
    ],
  },
  side: {
    id: 'side',
    title: 'rule_side_title',
    text: 'rule_side_text',
    phases: [
      { grid: ['...', '.E.', 'S..'], startDir: 'N', steps: [{ place: 'right' }, { place: 'straight' }] }, // слева
      { grid: ['...', '.E.', '..S'], startDir: 'N', steps: [{ place: 'left' }, { place: 'straight' }] }, // справа
      { grid: ['S..', '.E.', '...'], startDir: 'E', steps: [{ place: 'right' }, { place: 'straight' }] }, // сверху
    ],
  },
  rock: {
    id: 'rock',
    title: 'rule_rock_title',
    text: 'rule_rock_text',
    phases: [
      {
        grid: ['.E.', '.#.', '...', '.S.'],
        startDir: 'N',
        steps: [{ fail: 'straight2' }, { place: 'right' }, { place: 'left' }, { place: 'straight' }, { place: 'left' }, { place: 'straight' }],
      },
    ],
  },
  firefly: {
    id: 'firefly',
    title: 'rule_firefly_title',
    text: 'rule_firefly_text',
    phases: [
      // Дверь открыта и без светлячка: собирать его не обязательно…
      { grid: ['.E.', 'F..', '.S.'], startDir: 'N', steps: [{ place: 'straight' }, { place: 'straight' }] },
      // …но можно сделать крюк и забрать его с собой.
      { grid: ['.E.', 'F..', '.S.'], startDir: 'N', steps: [{ place: 'left' }, { place: 'right' }, { place: 'right' }, { place: 'straight' }] },
    ],
  },
  jump: {
    id: 'jump',
    title: 'rule_jump_title',
    text: 'rule_jump_text',
    phases: [
      // Камень прямо перед дверью: прямо нельзя, прыжок перелетает.
      { grid: ['.E.', '.#.', '.S.'], startDir: 'N', steps: [{ fail: 'straight' }, { place: 'jump' }] },
      // Над фонарём тоже можно перепрыгнуть, но он не зажжётся — дверь останется запертой.
      { grid: ['.E.', '...', '.L.', '.S.'], startDir: 'N', steps: [{ place: 'jump' }, { fail: 'straight' }, { reset: true }, { place: 'straight' }, { place: 'straight' }, { place: 'straight' }] },
    ],
  },
  ffgoal: {
    id: 'ffgoal',
    title: 'rule_ffgoal_title',
    text: 'rule_ffgoal_text',
    phases: [{ grid: ['.F.', '...', '.F.', '.S.'], startDir: 'N', goal: 'fireflies', steps: [{ place: 'straight' }, { place: 'straight' }, { place: 'straight' }] }],
  },
  turnbridge: {
    id: 'turnbridge',
    title: 'rule_turnbridge_title',
    text: 'rule_turnbridge_text',
    phases: [
      // Мост стоит поперёк — «прямо x2» не проходит; шаг — и мост повернулся вдоль дороги.
      { grid: ['.E.', '.-.', '...', '.S.'], startDir: 'N', steps: [{ fail: 'straight2' }, { place: 'straight' }, { place: 'straight' }, { place: 'straight' }] },
    ],
  },
  fade: {
    id: 'fade',
    title: 'rule_fade_title',
    text: 'rule_fade_text',
    phases: [
      // Длинный путь: фонарь гаснет, не дождавшись двери. Короткий — успели.
      {
        grid: ['..E', '...', '.2.', '.S.'],
        startDir: 'N',
        steps: [{ place: 'straight' }, { place: 'right' }, { place: 'left' }, { reset: true }, { place: 'right' }, { place: 'left' }, { place: 'straight2' }],
      },
    ],
  },
  ring: {
    id: 'ring',
    title: 'rule_ring_title',
    text: 'rule_ring_text',
    phases: [
      // Дорога входит в кольцо — и выходит из парного в том же направлении.
      { grid: ['E..', 'a..', '#..', '..a', '..S'], startDir: 'N', steps: [{ place: 'straight' }, { place: 'straight' }] },
    ],
  },
  fog: {
    id: 'fog',
    title: 'rule_fog_title',
    text: 'rule_fog_text',
    phases: [
      // Туман расходится вокруг дороги: впереди открылся камень — обходим.
      {
        grid: ['.E.', '...', '.#.', '...', '.S.'],
        startDir: 'N',
        fog: true,
        steps: [{ place: 'straight' }, { fail: 'straight' }, { reset: true }, { place: 'left' }, { place: 'right' }, { place: 'straight' }, { place: 'right' }, { place: 'left' }, { place: 'straight' }],
      },
    ],
  },
  shadow: {
    id: 'shadow',
    title: 'rule_shadow_title',
    text: 'rule_shadow_text',
    phases: [
      // Петля — тень догоняет. Прямая дорога — успели.
      { grid: ['.E.', '...', '...', '...', '.S.'], startDir: 'N', shadow: 2, ends: 'lost', steps: [{ place: 'left' }, { place: 'right' }, { place: 'straight' }, { place: 'straight' }] },
      { grid: ['.E.', '...', '...', '...', '.S.'], startDir: 'N', shadow: 2, steps: [{ place: 'straight' }, { place: 'straight' }, { place: 'straight' }, { place: 'straight' }] },
    ],
  },
  escape: {
    id: 'escape',
    title: 'rule_escape_title',
    text: 'rule_escape_text',
    phases: [
      // Арка открыта сразу: беги к ней. Фонарь по пути задерживает тень на ход.
      { grid: ['.E.', '...', 'L..', '...', '.S.'], startDir: 'N', goal: 'escape', shadow: 2, steps: [{ place: 'straight' }, { place: 'straight' }, { place: 'straight' }, { place: 'straight' }] },
      {
        grid: ['.E.', '...', 'L..', '...', '.S.'],
        startDir: 'N',
        goal: 'escape',
        shadow: 2,
        steps: [{ place: 'left' }, { place: 'right' }, { place: 'straight' }, { place: 'right' }, { place: 'left' }, { place: 'straight' }],
      },
    ],
  },
  water: {
    id: 'water',
    title: 'rule_water_title',
    text: 'rule_water_text',
    phases: [{ grid: ['.E.', '~~~', '.S.'], startDir: 'N', steps: [{ fail: 'straight' }, { place: 'bridge' }, { place: 'straight' }] }],
  },
};

export function demoLevel(phase: DemoPhase): Level {
  // Колода не важна: плитки демонстрации подкладываются в лоток перед каждым шагом.
  return parseLevel({ id: 'demo', name: 'demo', grid: phase.grid, startDir: phase.startDir, deck: ['straight'], stars: { two: 0, three: 0 }, allowStash: false, goal: phase.goal, fog: phase.fog, shadow: phase.shadow });
}

/** Поставить плитку kind на конец дороги (подкладываем её в лоток и ходим настоящим ходом). */
export function demoPlace(state: GameState, kind: TileKind): GameState {
  return applyAction({ ...state, status: 'playing', tray: [kind, null, null] }, { type: 'place', slot: 0 });
}

/** Прогнать фазу целиком без отрисовки — для тестов: неудачи должны быть неудачами, финал — победой. */
export function runPhase(phase: DemoPhase): { state: GameState; failsOk: boolean } {
  const level = demoLevel(phase);
  let state = createGame(level);
  let failsOk = true;
  for (const step of phase.steps) {
    if ('place' in step) state = demoPlace(state, step.place);
    else if ('fail' in step) failsOk &&= !previewTile(state, step.fail).ok;
    else state = createGame(level);
  }
  return { state, failsOk };
}
