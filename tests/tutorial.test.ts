import { beforeEach, describe, expect, it } from 'vitest';
import { memoryBackend, SAVE_KEY, SaveService } from '../src/save/SaveService';
import { allKeys, t } from '../src/strings';
import {
  authPromptDue,
  canShowModal,
  completeTutorial,
  currencyIntroDue,
  markCurrencyIntroSeen,
  DAILY_GAP_MS,
  dailyPrompt,
  markRulesSeen,
  pendingRules,
  hasSeenTip,
  isTutorialActive,
  isTutorialDone,
  markTipSeen,
  markTutorialDoneForReturningPlayer,
  MODAL_GAP_MS,
  modalClosed,
  modalOpened,
  resetModalGuard,
  restartTutorial,
  TIP_TEXT,
  type TipId,
} from '../src/tutorial';
import { headSide, lanternsLeft, portalSides } from '../src/core/portal';
import { applyAction, createGame } from '../src/core/game';
import { parseLevel } from '../src/core/level';
import { LEVELS } from '../src/levels/index';
import { emptySave } from '../src/save/SaveService';
import { mergeSaves, toCloudPayload } from '../src/cloud/merge';

describe('строки', () => {
  it('подстановка параметров', () => {
    expect(t('goal_lanterns', { n: 3 })).toBe('Зажги все фонари: 3');
    expect(t('goal_door')).toBe('Доведи Lumo до двери');
  });

  it('у каждой подсказки есть текст, и он в 3–7 слов', () => {
    const keys = allKeys();
    for (const [id, key] of Object.entries(TIP_TEXT)) {
      expect(keys, id).toContain(key);
      const words = t(key).split(/\s+/).filter((w) => /[\p{L}\d]/u.test(w));
      expect(words.length, `${id}: «${t(key)}»`).toBeGreaterThanOrEqual(3);
      expect(words.length, `${id}: «${t(key)}»`).toBeLessThanOrEqual(7);
    }
  });
});

describe('подсказки Lumo и обучение', () => {
  beforeEach(() => {
    SaveService.setBackend(memoryBackend());
    resetModalGuard();
  });

  it('каждая подсказка показывается один раз и пишется в лог', () => {
    expect(hasSeenTip('rock')).toBe(false);
    markTipSeen('rock');
    markTipSeen('rock');
    expect(hasSeenTip('rock')).toBe(true);
    const log = SaveService.load().log.filter((e) => e.ev === 'tip_shown');
    expect(log).toEqual([expect.objectContaining({ tip: 'rock' })]);
  });

  it('обучение — уровни 1–3 до завершения', () => {
    expect(isTutorialActive(1)).toBe(true);
    expect(isTutorialActive(3)).toBe(true);
    expect(isTutorialActive(4)).toBe(false);
    completeTutorial();
    expect(isTutorialDone()).toBe(true);
    expect(isTutorialActive(1)).toBe(false);
    expect(SaveService.load().log.at(-1)).toMatchObject({ ev: 'tutorial_step', step: 'done' });
  });

  it('«Пройти обучение заново» сбрасывает обучение и подсказки, но не прогресс', () => {
    SaveService.update((d) => (d.progress.stars = { 1: 3 }));
    markTipSeen('turn');
    completeTutorial();
    restartTutorial();
    expect(isTutorialDone()).toBe(false);
    expect(hasSeenTip('turn')).toBe(false);
    expect(SaveService.load().progress.stars).toEqual({ 1: 3 });
  });

  it('игрок с прогрессом уже прошёл обучение', () => {
    markTutorialDoneForReturningPlayer();
    expect(isTutorialDone()).toBe(false);
    SaveService.update((d) => (d.progress.stars = { 2: 1 }));
    markTutorialDoneForReturningPlayer();
    expect(isTutorialDone()).toBe(true);
  });

  it('не больше одного окна и не два подряд', () => {
    const now = 1_000_000;
    expect(canShowModal(now)).toBe(true);
    modalOpened();
    expect(canShowModal(now)).toBe(false);
    modalClosed(now);
    expect(canShowModal(now + 1000)).toBe(false);
    expect(canShowModal(now + MODAL_GAP_MS)).toBe(true);
  });

  it('предложение войти — только после уровня 6', () => {
    expect(authPromptDue(1, { promptAllowed: true })).toBe(false);
    expect(authPromptDue(5, { promptAllowed: true })).toBe(false);
    expect(authPromptDue(6, { promptAllowed: true })).toBe(true);
    expect(authPromptDue(7, { promptAllowed: false })).toBe(false);
    modalOpened();
    expect(authPromptDue(7, { promptAllowed: true })).toBe(false);
  });

  it('подсказки и обучение переносятся между устройствами', () => {
    const local = emptySave();
    local.profile.tipsSeen = ['rock'];
    const cloud = emptySave();
    cloud.profile.tipsSeen = ['turn', 'rock'];
    cloud.profile.tutorialDone = true;
    const m = mergeSaves(local, toCloudPayload(cloud));
    expect(m.profile.tipsSeen.sort()).toEqual(['rock', 'turn']);
    expect(m.profile.tutorialDone).toBe(true);
  });

  it('старые сохранения: обучение не пройдено, подсказок нет, мусор отбрасывается', () => {
    SaveService.setBackend(
      memoryBackend({
        [SAVE_KEY]: JSON.stringify({ version: 3, profile: { playerId: '11111111-2222-4333-8444-555555555555', tipsSeen: ['rock', 'rock', 5] }, progress: {}, log: [] }),
      }),
    );
    expect(SaveService.load().profile.tipsSeen).toEqual(['rock']);
    expect(SaveService.load().profile.tutorialDone).toBe(false);
  });

  it('id подсказок в уровнях существуют', () => {
    for (const l of LEVELS) if (l.tip) expect(Object.keys(TIP_TEXT), `уровень ${l.id}`).toContain(l.tip as TipId);
  });
});

describe('арка-портал', () => {
  it('уровень 4: войти можно только сбоку', () => {
    const sides = portalSides(LEVELS[3]);
    expect(sides.map((s) => s.open)).toEqual([false, true, false, true]); // сверху край, снизу камень
  });

  it('с какой стороны арки конец дороги', () => {
    const l = parseLevel({ id: 'test', name: 't', grid: ['.E.', '...', '.S.'], startDir: 'N', deck: ['straight', 'straight'], stars: { two: 0, three: 0 } });
    const g = createGame(l);
    expect(headSide(g)).toBeNull();
    const s = applyAction(g, { type: 'place', slot: 0 });
    expect(headSide(s)).toBe(2); // конец дороги под аркой
  });

  it('число на замке — незажжённые фонари', () => {
    const l = parseLevel({ id: 'test', name: 't', grid: ['E..', 'L..', 'S..'], startDir: 'N', deck: ['straight', 'straight'], stars: { two: 0, three: 0 } });
    const g = createGame(l);
    expect(lanternsLeft(g)).toBe(1);
    expect(lanternsLeft(applyAction(g, { type: 'place', slot: 0 }))).toBe(0);
  });
});

describe('баги после Р3а', () => {
  beforeEach(() => {
    SaveService.setBackend(memoryBackend());
    resetModalGuard();
  });

  it('карточки правил: один раз; на пройденном уровне после обучения — нет', () => {
    const level1 = { id: 'valley-01', num: 1, fireflies: [] as number[] };
    expect(pendingRules(level1)).toEqual(['road']);
    markRulesSeen(['road']);
    expect(pendingRules(level1)).toEqual([]);
    // Обучение пройдено, уровень 1 пройден, но карточку почему-то не отметили (старое сохранение) — всё равно не показываем.
    SaveService.update((d) => {
      d.profile.tipsSeen = [];
      d.profile.tutorialDone = true;
      d.progress.stars['valley-01'] = 3;
    });
    expect(pendingRules(level1)).toEqual([]);
    // «Пройти обучение заново» — карточки снова.
    restartTutorial();
    expect(pendingRules(level1)).toEqual(['road']);
  });

  it('награда дня: окно сразу, иначе отметка на подарке; без награды и до обучения — ничего', () => {
    const base = { available: true, tutorialDone: true, nameAsked: true, canShow: true };
    expect(dailyPrompt(base)).toBe('show');
    expect(dailyPrompt({ ...base, canShow: false })).toBe('badge'); // другое окно только что закрылось
    expect(dailyPrompt({ ...base, nameAsked: false })).toBe('badge');
    expect(dailyPrompt({ ...base, available: false })).toBe('none');
    expect(dailyPrompt({ ...base, tutorialDone: false })).toBe('none');
    // После окна знакомства награда дня ждёт недолго (не 20 с, как другие окна).
    modalOpened();
    modalClosed(1000);
    expect(canShowModal(1000 + DAILY_GAP_MS - 1, DAILY_GAP_MS)).toBe(false);
    expect(canShowModal(1000 + DAILY_GAP_MS, DAILY_GAP_MS)).toBe(true);
    expect(canShowModal(1000 + DAILY_GAP_MS)).toBe(false);
  });
});

describe('знакомство с монетами и светом', () => {
  beforeEach(() => SaveService.setBackend(memoryBackend()));
  it('только после обучения и один раз; «Пройти обучение заново» показывает снова', () => {
    expect(currencyIntroDue()).toBe(false);
    completeTutorial();
    expect(currencyIntroDue()).toBe(true);
    markCurrencyIntroSeen();
    expect(currencyIntroDue()).toBe(false);
    restartTutorial();
    completeTutorial();
    expect(currencyIntroDue()).toBe(true);
  });
  it('тексты знакомства есть', () => {
    for (const k of ['currency_title', 'currency_coin', 'currency_light', 'currency_note'] as const) expect(t(k).length).toBeGreaterThan(3);
  });
});
