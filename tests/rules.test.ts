import { beforeEach, describe, expect, it } from 'vitest';
import { memoryBackend, SaveService } from '../src/save/SaveService';
import { RULE_CARDS, runPhase } from '../src/rules';
import { ALL_RULES, markRulesSeen, pendingRules, restartTutorial, RULES_BY_LEVEL } from '../src/tutorial';
import { previewTile } from '../src/core/game';
import { allKeys } from '../src/strings';
import { LEVELS } from '../src/levels/index';

describe('карточки правил: сценарии идут по настоящим правилам игры', () => {
  for (const card of Object.values(RULE_CARDS)) {
    card.phases.forEach((phase, i) => {
      it(`${card.id}, фаза ${i + 1}: неудачные попытки не встают, финал — победа`, () => {
        const r = runPhase(phase);
        expect(r.failsOk).toBe(true);
        expect(r.state.status).toBe('won');
      });
    });
  }

  it('у каждой карточки есть заголовок и текст в файле строк', () => {
    for (const card of Object.values(RULE_CARDS)) {
      expect(allKeys()).toContain(card.title);
      expect(allKeys()).toContain(card.text);
    }
  });

  it('карточка «Фонари» показывает запертую дверь, а «Камни» и «Река» — почему плитка не встаёт', () => {
    const lantern = runPhase({ ...RULE_CARDS.lantern.phases[0], steps: RULE_CARDS.lantern.phases[0].steps.slice(0, 1) }).state;
    expect(previewTile(lantern, 'straight').reason).toBe('exitClosed');
    const rock = runPhase({ ...RULE_CARDS.rock.phases[0], steps: [] }).state;
    expect(previewTile(rock, 'straight2').reason).toBe('rock');
    const water = runPhase({ ...RULE_CARDS.water.phases[0], steps: [] }).state;
    expect(previewTile(water, 'straight').reason).toBe('water');
  });

  it('«Вход с любой стороны» входит в арку с трёх разных сторон', () => {
    const sides = RULE_CARDS.side.phases.map((p) => {
      const s = runPhase(p).state;
      return s.road[s.road.length - 1].dirIn; // направление, в котором дорога вошла в арку
    });
    expect(new Set(sides).size).toBe(3);
  });
});

describe('когда показывать карточки', () => {
  beforeEach(() => SaveService.setBackend(memoryBackend()));

  it('перед уровнем, где элемент появляется впервые, и только один раз', () => {
    expect(pendingRules(1)).toEqual(['road']);
    expect(pendingRules(2)).toEqual([]);
    expect(pendingRules(4)).toEqual(['rock', 'side']);
    markRulesSeen(['rock', 'side']);
    expect(pendingRules(4)).toEqual([]);
    expect(SaveService.load().log.filter((e) => e.ev === 'tutorial_step').map((e) => e.step)).toEqual(['rule_rock', 'rule_side']);
  });

  it('«Пройти обучение заново» покажет карточки снова', () => {
    markRulesSeen(['road']);
    restartTutorial();
    expect(pendingRules(1)).toEqual(['road']);
  });

  it('элементы появляются на тех уровнях, где их объясняют карточки', () => {
    const firstWith = (pred: (l: (typeof LEVELS)[number]) => boolean) => LEVELS.find(pred)!.id;
    expect(RULES_BY_LEVEL[firstWith((l) => l.lanterns.length > 0)]).toContain('lantern');
    expect(RULES_BY_LEVEL[firstWith((l) => l.cells.includes('rock'))]).toContain('rock');
    expect(RULES_BY_LEVEL[firstWith((l) => l.cells.includes('water'))]).toContain('water');
    expect(Object.values(RULES_BY_LEVEL).flat().sort()).toEqual([...ALL_RULES].sort());
  });
});
