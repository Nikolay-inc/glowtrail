// Обучение и подсказки Lumo: что уже показано, когда обучение закончено, какие окна можно показывать.
// Без Phaser — проверяется тестами.

import { SaveService } from './save/SaveService';
import type { StringKey } from './strings';

/** Подсказки Lumo. Каждая показывается один раз и запоминается в сохранении. */
export type TipId = 'undo' | 'hint' | 'restart' | 'stash' | 'turn' | 'rock' | 'water' | 'lantern' | 'side_entry' | 'drag';

/** Ключ текста подсказки в файле строк. */
export const TIP_TEXT: Record<TipId, StringKey> = {
  undo: 'tip_undo',
  hint: 'tip_hint',
  restart: 'tip_restart',
  stash: 'tip_stash',
  turn: 'tip_turn',
  rock: 'tip_rock',
  water: 'tip_water',
  lantern: 'tip_lantern',
  side_entry: 'tip_side_entry',
  drag: 'tip_drag',
};

/** Карточки правил с анимацией: показываются перед уровнем, где элемент появляется впервые. */
export type RuleId = 'road' | 'lantern' | 'side' | 'rock' | 'water';
export const ALL_RULES: readonly RuleId[] = ['road', 'lantern', 'side', 'rock', 'water'];
export const RULES_BY_LEVEL: Record<number, RuleId[]> = { 1: ['road'], 3: ['lantern'], 4: ['rock', 'side'], 8: ['water'] };

/** Карточки, которые ещё не показывали перед этим уровнем. */
export function pendingRules(levelId: number): RuleId[] {
  const seen = SaveService.load().profile.tipsSeen;
  return (RULES_BY_LEVEL[levelId] ?? []).filter((r) => !seen.includes(`rule:${r}`));
}

export function markRulesSeen(ids: readonly RuleId[]) {
  const seen = SaveService.load().profile.tipsSeen;
  const fresh = ids.filter((r) => !seen.includes(`rule:${r}`));
  if (!fresh.length) return;
  SaveService.update((d) => {
    for (const r of fresh) {
      d.profile.tipsSeen.push(`rule:${r}`);
      d.log.push({ t: new Date().toISOString(), ev: 'tutorial_step', step: `rule_${r}` });
    }
  });
}

/** Последний обучающий уровень: после него — экран уровней и окно «Как тебя зовут?». */
export const TUTORIAL_LAST_LEVEL = 3;
/** После какого уровня предлагаем войти в аккаунт. */
export const AUTH_PROMPT_AFTER_LEVEL = 6;
/** Сколько секунд бездействия до подсказки про кнопку «Подсказка». */
export const IDLE_HINT_SECONDS = 15;

export function hasSeenTip(id: TipId): boolean {
  return SaveService.load().profile.tipsSeen.includes(id);
}

export function markTipSeen(id: TipId) {
  if (hasSeenTip(id)) return;
  SaveService.update((d) => {
    d.profile.tipsSeen.push(id);
    d.log.push({ t: new Date().toISOString(), ev: 'tip_shown', tip: id });
  });
}

export function logTutorialStep(step: string, level?: number) {
  SaveService.update((d) => void d.log.push({ t: new Date().toISOString(), ev: 'tutorial_step', step, level }));
}

export function isTutorialDone(): boolean {
  return SaveService.load().profile.tutorialDone;
}

/** Обучение идёт: вступление и уровни 1–3 при первом запуске (или при «Пройти обучение заново»). */
export function isTutorialActive(levelId: number): boolean {
  return !isTutorialDone() && levelId <= TUTORIAL_LAST_LEVEL;
}

export function completeTutorial() {
  if (isTutorialDone()) return;
  SaveService.update((d) => {
    d.profile.tutorialDone = true;
    d.log.push({ t: new Date().toISOString(), ev: 'tutorial_step', step: 'done' });
  });
}

/** «Пройти обучение заново»: вступление и подсказки покажутся снова. Прогресс не трогаем. */
export function restartTutorial() {
  SaveService.update((d) => {
    d.profile.tutorialDone = false;
    d.profile.tipsSeen = [];
    d.log.push({ t: new Date().toISOString(), ev: 'tutorial_step', step: 'restart' });
  });
}

/** Старый игрок с прогрессом уже знает игру — обучение для него считаем пройденным. */
export function markTutorialDoneForReturningPlayer() {
  const d = SaveService.load();
  if (!d.profile.tutorialDone && Object.keys(d.progress.stars).length > 0) {
    SaveService.update((s) => void (s.profile.tutorialDone = true));
  }
}

// ---------------------------------------------------------------------------
// Не больше одного окна за раз и не два подряд.

let lastModalAt = -Infinity;
let modalOpen = false;
/** Сколько мс после закрытия окна не показываем следующее. */
export const MODAL_GAP_MS = 20_000;

export function canShowModal(now = Date.now()): boolean {
  return !modalOpen && now - lastModalAt >= MODAL_GAP_MS;
}

export function modalOpened() {
  modalOpen = true;
}

export function modalClosed(now = Date.now()) {
  modalOpen = false;
  lastModalAt = now;
}

/** Предложить войти после победы: только с уровня 6, только гостю и если сейчас можно показать окно. */
export function authPromptDue(levelId: number, opts: { promptAllowed: boolean; now?: number }): boolean {
  return levelId >= AUTH_PROMPT_AFTER_LEVEL && opts.promptAllowed && canShowModal(opts.now);
}

/** Для тестов. */
export function resetModalGuard() {
  lastModalAt = -Infinity;
  modalOpen = false;
}
