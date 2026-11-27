// Обучение и подсказки Lumo: что уже показано, когда обучение закончено, какие окна можно показывать.
// Без Phaser — проверяется тестами.

import { SaveService } from './save/SaveService';
import type { StringKey } from './strings';

/** Подсказки Lumo. Каждая показывается один раз и запоминается в сохранении. */
export type TipId = 'undo' | 'hint' | 'restart' | 'stash' | 'turn' | 'rock' | 'water' | 'lantern' | 'side_entry' | 'drag' | 'turnbridge' | 'fade';

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
  turnbridge: 'tip_turnbridge',
  fade: 'tip_fade',
};

/** Карточки правил с анимацией: показываются перед уровнем, где элемент появляется впервые. */
export type RuleId = 'road' | 'lantern' | 'side' | 'rock' | 'water' | 'firefly' | 'jump' | 'ffgoal' | 'turnbridge' | 'fade';
export const ALL_RULES: readonly RuleId[] = ['road', 'lantern', 'side', 'rock', 'water', 'firefly', 'jump', 'ffgoal', 'turnbridge', 'fade'];

/** Что на уровне — для выбора карточек правил по содержимому. */
export interface RulesLevel {
  num: number;
  fireflies: readonly number[];
  goal?: 'classic' | 'fireflies';
  deck?: readonly string[];
  turnBridges?: readonly number[];
  fades?: readonly number[];
}
/** Обучающие уровни (по номеру): какие карточки перед ними. */
export const RULES_BY_LEVEL: Record<number, RuleId[]> = { 1: ['road'], 3: ['lantern'], 4: ['rock', 'side'], 8: ['water'] };

/** Карточки перед уровнем: по номеру (обучение) и по содержимому — светлячки объясняем там, где они встретились впервые. */
export function rulesFor(level: RulesLevel): RuleId[] {
  const out = [...(RULES_BY_LEVEL[level.num] ?? [])];
  if (level.goal === 'fireflies') out.push('ffgoal');
  else if (level.fireflies.length > 0) out.push('firefly');
  if (level.deck?.includes('jump')) out.push('jump');
  if (level.turnBridges?.length) out.push('turnbridge');
  if (level.fades?.length) out.push('fade');
  return out;
}

/** Карточки, которые ещё не показывали перед этим уровнем. */
/**
 * Карточки, которые ещё не показывали перед этим уровнем. На уже пройденном (или пропущенном) уровне карточек нет:
 * переигровка — не первая встреча с правилом. Исключение — «Пройти обучение заново» (обучение снова идёт).
 */
export function pendingRules(level: RulesLevel & { id?: string }): RuleId[] {
  const d = SaveService.load();
  if (level.id && (d.progress.stars[level.id] || d.progress.skipped[level.id]) && !isTutorialActive(level.num)) return [];
  const seen = d.profile.tipsSeen;
  return rulesFor(level).filter((r) => !seen.includes(`rule:${r}`));
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

/** Знакомство с монетами и светом: один раз, на карте после обучения (и после «Пройти обучение заново»). */
const CURRENCY_INTRO = 'intro:currency';

export function currencyIntroDue(): boolean {
  const d = SaveService.load();
  return d.profile.tutorialDone && !d.profile.tipsSeen.includes(CURRENCY_INTRO);
}

export function markCurrencyIntroSeen() {
  if (!currencyIntroDue()) return;
  SaveService.update((d) => {
    d.profile.tipsSeen.push(CURRENCY_INTRO);
    d.log.push({ t: new Date().toISOString(), ev: 'tutorial_step', step: 'currency' });
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

export function logTutorialStep(step: string, level?: string) {
  SaveService.update((d) => void d.log.push({ t: new Date().toISOString(), ev: 'tutorial_step', step, level }));
}

export function isTutorialDone(): boolean {
  return SaveService.load().profile.tutorialDone;
}

/** Обучение идёт: вступление и уровни 1–3 (по номеру) при первом запуске (или при «Пройти обучение заново»). */
export function isTutorialActive(levelNum: number): boolean {
  return !isTutorialDone() && levelNum >= 1 && levelNum <= TUTORIAL_LAST_LEVEL;
}

export function completeTutorial() {
  if (isTutorialDone()) return;
  SaveService.update((d) => {
    d.profile.tutorialDone = true;
    const t = new Date().toISOString();
    d.log.push({ t, ev: 'tutorial_step', step: 'done' }, { t, ev: 'tutorial_complete' });
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

export function canShowModal(now = Date.now(), gap = MODAL_GAP_MS): boolean {
  return !modalOpen && now - lastModalAt >= gap;
}

/** Награда дня — приятное окно: после другого окна ждём меньше. */
export const DAILY_GAP_MS = 4_000;

export function modalOpened() {
  modalOpen = true;
}

export function modalClosed(now = Date.now()) {
  modalOpen = false;
  lastModalAt = now;
}

/** Предложить войти после победы: только с уровня 6, только гостю и если сейчас можно показать окно. */
export function authPromptDue(levelNum: number, opts: { promptAllowed: boolean; now?: number }): boolean {
  return levelNum >= AUTH_PROMPT_AFTER_LEVEL && opts.promptAllowed && canShowModal(opts.now);
}

/**
 * Окно «Награда дня» на карте: show — показать сейчас; badge — награда есть, но окно пока нельзя
 * (обучение, знакомство, другое окно недавно) — горит отметка на кнопке-подарке, окно — по тапу или позже;
 * none — награды нет.
 */
export function dailyPrompt(o: { available: boolean; tutorialDone: boolean; nameAsked: boolean; canShow: boolean }): 'show' | 'badge' | 'none' {
  if (!o.available || !o.tutorialDone) return 'none';
  return o.nameAsked && o.canShow ? 'show' : 'badge';
}

/** Для тестов. */
export function resetModalGuard() {
  lastModalAt = -Infinity;
  modalOpen = false;
}
