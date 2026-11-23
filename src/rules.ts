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
  water: {
    id: 'water',
    title: 'rule_water_title',
    text: 'rule_water_text',
    phases: [{ grid: ['.E.', '~~~', '.S.'], startDir: 'N', steps: [{ fail: 'straight' }, { place: 'bridge' }, { place: 'straight' }] }],
  },
};

export function demoLevel(phase: DemoPhase): Level {
  // Колода не важна: плитки демонстрации подкладываются в лоток перед каждым шагом.
  return parseLevel({ id: 0, name: 'demo', grid: phase.grid, startDir: phase.startDir, deck: ['straight'], stars: { two: 0, three: 0 }, allowStash: false });
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
