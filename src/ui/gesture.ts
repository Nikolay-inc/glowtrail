// Касание или свайп — по точкам в координатах мира (раскладки 1080×1920), а не экрана: камера ставит раскладку
// в безопасную зону (сдвиг на высоких экранах вроде 390x844 — сотни единиц, на широких — ещё и масштаб), и экранные
// и мировые координаты одного касания различаются.
// Чистые функции без Phaser — тест tests/gesture.test.ts.

export type Pt = { x: number; y: number };

/** Сдвиг (в единицах раскладки), до которого касание — ещё тап (≈ 12 px экрана телефона). */
export const TAP_SLOP = 36;
/** Свайп между районами: сдвиг по горизонтали, преобладание над вертикалью и время. */
export const SWIPE_MIN = 140;
export const SWIPE_MS = 800;

export type Gesture = 'tap' | 'swipe-left' | 'swipe-right' | 'drag';

/** Что это было: тап, свайп влево/вправо (смена района) или просто сдвиг пальца. */
export function gestureOf(down: Pt, up: Pt, ms: number): Gesture {
  const dx = up.x - down.x;
  const dy = up.y - down.y;
  if (Math.abs(dx) <= TAP_SLOP && Math.abs(dy) <= TAP_SLOP) return 'tap';
  if (Math.abs(dx) > SWIPE_MIN && Math.abs(dx) > Math.abs(dy) * 1.5 && ms < SWIPE_MS) return dx < 0 ? 'swipe-left' : 'swipe-right';
  return 'drag';
}

/** Экранная точка → мир для камеры с масштабом zoom, чей левый верхний угол видимой области — (viewX, viewY). */
export const screenToWorld = (p: Pt, cam: { zoom: number; viewX: number; viewY: number }): Pt => ({ x: cam.viewX + p.x / cam.zoom, y: cam.viewY + p.y / cam.zoom });

/** Прямоугольник (левый верхний угол, размер). */
export type Box = { x: number; y: number; w: number; h: number };
export const overlap = (a: Box, b: Box, pad = 0) => Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > pad && Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > pad;
export const inside = (p: Pt, b: Box) => p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;
