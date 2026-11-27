import { beforeEach, describe, expect, it } from 'vitest';
import { memoryBackend, SaveService } from '../src/save/SaveService';
import { RULE_CARDS, runPhase } from '../src/rules';
import { ALL_RULES, markRulesSeen, pendingRules, restartTutorial, RULES_BY_LEVEL, rulesFor } from '../src/tutorial';
import { FIREFLY_FROM } from '../src/levels/curve';

const lv = (num: number) => ({ num, fireflies: [] as number[] });
import { previewTile } from '../src/core/game';
import { allKeys } from '../src/strings';
import { LEVELS } from '../src/levels/index';

describe('карточки правил: сценарии идут по настоящим правилам игры', () => {
  for (const card of Object.values(RULE_CARDS)) {
    card.phases.forEach((phase, i) => {
      it(`${card.id}, фаза ${i + 1}: неудачные попытки не встают, финал — ${phase.ends === 'lost' ? 'тень догнала' : 'победа'}`, () => {
        const r = runPhase(phase);
        expect(r.failsOk).toBe(true);
        expect(r.state.status).toBe(phase.ends === 'lost' ? 'lost' : 'won');
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
    expect(pendingRules(lv(1))).toEqual(['road']);
    expect(pendingRules(lv(2))).toEqual([]);
    expect(pendingRules(lv(4))).toEqual(['rock', 'side']);
    markRulesSeen(['rock', 'side']);
    expect(pendingRules(lv(4))).toEqual([]);
    expect(SaveService.load().log.filter((e) => e.ev === 'tutorial_step').map((e) => e.step)).toEqual(['rule_rock', 'rule_side']);
  });

  it('«Пройти обучение заново» покажет карточки снова', () => {
    markRulesSeen(['road']);
    restartTutorial();
    expect(pendingRules(lv(1))).toEqual(['road']);
  });

  it('карточка «Светлячки» — перед первым уровнем со светлячками, один раз', () => {
    expect(pendingRules({ num: 15, fireflies: [3] })).toEqual(['firefly']);
    markRulesSeen(['firefly']);
    expect(pendingRules({ num: 16, fireflies: [3] })).toEqual([]);
  });

  it('элементы появляются на тех уровнях, где их объясняют карточки', () => {
    const firstWith = (pred: (l: (typeof LEVELS)[number]) => boolean) => LEVELS.find(pred)!.num;
    expect(RULES_BY_LEVEL[firstWith((l) => l.lanterns.length > 0)]).toContain('lantern');
    expect(RULES_BY_LEVEL[firstWith((l) => l.cells.includes('rock'))]).toContain('rock');
    expect(RULES_BY_LEVEL[firstWith((l) => l.cells.includes('water'))]).toContain('water');
    // Остальное объясняем по содержимому уровня — там, где элемент встретился впервые.
    const byContent = ['firefly', 'jump', 'ffgoal', 'turnbridge', 'fade', 'ring', 'fog', 'shadow', 'escape'];
    expect(Object.values(RULES_BY_LEVEL).flat().sort()).toEqual(ALL_RULES.filter((r) => !byContent.includes(r)).sort());
    const ff = LEVELS.find((l) => l.fireflies.length > 0);
    expect(ff?.num).toBe(FIREFLY_FROM);
    expect(rulesFor(ff!)).toContain('firefly');
    expect(rulesFor(LEVELS.find((l) => l.deck.includes('jump'))!)).toContain('jump');
    expect(rulesFor(LEVELS.find((l) => l.goal === 'fireflies')!)).toContain('ffgoal');
    expect(rulesFor(LEVELS.find((l) => l.turnBridges.length > 0)!)).toContain('turnbridge');
    expect(rulesFor(LEVELS.find((l) => l.fades.length > 0)!)).toContain('fade');
    // Лес: кольца — 31, туман — 35, тень — 41, «Побег» — 51 (первая встреча).
    expect(LEVELS.find((l) => l.rings.length > 0)?.num).toBe(31);
    expect(LEVELS.find((l) => l.fog)?.num).toBe(35);
    expect(LEVELS.find((l) => l.shadow > 0)?.num).toBe(41);
    expect(LEVELS.find((l) => l.goal === 'escape')?.num).toBe(51);
    expect(rulesFor(LEVELS[30])).toContain('ring');
    expect(rulesFor(LEVELS[34])).toContain('fog');
    expect(rulesFor(LEVELS[40])).toContain('shadow');
    expect(rulesFor(LEVELS[50])).toContain('escape');
    // Каждая карточка правил где-то встречается.
    const shown = new Set(LEVELS.flatMap((l) => rulesFor(l)));
    for (const r of ALL_RULES) if (r !== 'side') expect(shown.has(r), r).toBe(true);
  });
});
