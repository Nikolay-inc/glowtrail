// HTML-окна поверх игры (вход, запасное «Скопировать») не должны пропускать клики в игру.
// Phaser слушает отпускание мыши и пальца на всём окне браузера (чтобы ловить отпускание за холстом),
// поэтому без этого клик по форме срабатывал и на игровой кнопке под ней — со звуком.

const EVENTS = [
  'pointerdown',
  'pointerup',
  'pointermove',
  'pointercancel',
  'mousedown',
  'mouseup',
  'mousemove',
  'touchstart',
  'touchend',
  'touchmove',
  'touchcancel',
  'click',
  'wheel',
  'keydown',
  'keyup',
] as const;

/** События внутри el не всплывают до window и не доходят до Phaser. Поведение формы не меняется. */
export function isolateFromGame(el: HTMLElement) {
  for (const type of EVENTS) el.addEventListener(type, (e) => e.stopPropagation());
}
