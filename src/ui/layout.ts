// Раскладка нижней панели уровня: слот «отложить», 3 плитки лотка и колода.
// Без Phaser — чтобы проверить тестом, что ничего не касается края экрана.

import { W } from './theme';

export const CARD = 190;
const GAP = 20; // между плитками лотка
const GAP_STASH = 40; // между слотом «отложить» и лотком
const GAP_DECK = 30; // между лотком и колодой
const DECK_W = 120;
const DECK_STACK = 16; // насколько стопка колоды выступает вправо
const PREVIEW = 72; // мини-карточки превью над колодой
const PREVIEW_STEP = 84;

export interface TrayLayout {
  stashX: number | null;
  slotX: number[];
  deckX: number;
  previewX: number[];
  /** Левый и правый край всей группы (с учётом стопки колоды и превью). */
  left: number;
  right: number;
}

/** Группа «(слот) + лоток + колода» по центру экрана. Без слота «отложить» — лоток с колодой по центру. */
export function trayLayout(withStash: boolean): TrayLayout {
  const total = (withStash ? CARD + GAP_STASH : 0) + 3 * CARD + 2 * GAP + GAP_DECK + DECK_W + DECK_STACK;
  const left = (W - total) / 2;
  let x = left;
  let stashX: number | null = null;
  if (withStash) {
    stashX = x + CARD / 2;
    x += CARD + GAP_STASH;
  }
  const slotX = [0, 1, 2].map((i) => x + CARD / 2 + i * (CARD + GAP));
  x += 3 * CARD + 2 * GAP + GAP_DECK;
  const deckX = x + DECK_W / 2;
  const previewX = [deckX - PREVIEW_STEP / 2, deckX + PREVIEW_STEP / 2];
  const right = Math.max(x + DECK_W + DECK_STACK, previewX[1] + PREVIEW / 2);
  return { stashX, slotX, deckX, previewX, left, right };
}
