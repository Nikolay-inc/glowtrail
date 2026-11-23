// Весь экран без пустых полос: игра растягивается на всю высоту (Phaser EXPAND), а привычная раскладка
// 1080×1920 ставится камерой внутрь безопасной зоны (вырез, Dynamic Island, полоска «домой»).
// Фон и декор рисуются на всю видимую область. Расчёт — чистая функция computeView (покрыта тестом).

import Phaser from 'phaser';
import { H, W } from './theme';

export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/** Видимая область в координатах игры и масштаб камеры. */
export interface ViewRect {
  x: number;
  y: number;
  w: number;
  h: number;
  zoom: number;
  /** Точка мира в центре экрана. */
  cx: number;
  cy: number;
}

/**
 * Где показать раскладку W×H на экране gameW×gameH с отступами безопасной зоны (в пикселях игры).
 * Раскладка целиком внутри безопасной зоны и по центру неё; если не помещается — камера уменьшает её.
 */
export function computeView(gameW: number, gameH: number, insets: Insets): ViewRect {
  const availW = Math.max(1, gameW - insets.left - insets.right);
  const availH = Math.max(1, gameH - insets.top - insets.bottom);
  const zoom = Math.min(1, availW / W, availH / H);
  const leftScreen = insets.left + (availW - W * zoom) / 2;
  const topScreen = insets.top + (availH - H * zoom) / 2;
  const cx = (gameW / 2 - leftScreen) / zoom;
  const cy = (gameH / 2 - topScreen) / zoom;
  const w = gameW / zoom;
  const h = gameH / zoom;
  return { x: cx - w / 2, y: cy - h / 2, w, h, zoom, cx, cy };
}

let probe: HTMLDivElement | null = null;

/** Отступы безопасной зоны в CSS-пикселях (env(safe-area-inset-*)); вне телефона — нули. */
export function readSafeInsets(): Insets {
  if (typeof document === 'undefined') return { top: 0, right: 0, bottom: 0, left: 0 };
  if (!probe) {
    probe = document.createElement('div');
    probe.style.cssText =
      'position:fixed;inset:0;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);';
    document.body.appendChild(probe);
  }
  const cs = getComputedStyle(probe);
  const px = (v: string) => parseFloat(v) || 0;
  return { top: px(cs.paddingTop), right: px(cs.paddingRight), bottom: px(cs.paddingBottom), left: px(cs.paddingLeft) };
}

const views = new WeakMap<Phaser.Scene, ViewRect>();

/** Текущая видимая область сцены (после fitView). */
export function currentView(scene: Phaser.Scene): ViewRect {
  return views.get(scene) ?? computeView(W, H, { top: 0, right: 0, bottom: 0, left: 0 });
}

/** Поставить камеру сцены так, чтобы раскладка была в безопасной зоне. Возвращает видимую область. */
export function fitView(scene: Phaser.Scene): ViewRect {
  const gameW = scene.scale.width;
  const gameH = scene.scale.height;
  const css = readSafeInsets();
  // CSS-пиксели → пиксели игры
  const canvas = scene.game.canvas;
  const kx = canvas.clientWidth ? gameW / canvas.clientWidth : 1;
  const ky = canvas.clientHeight ? gameH / canvas.clientHeight : 1;
  const view = computeView(gameW, gameH, { top: css.top * ky, bottom: css.bottom * ky, left: css.left * kx, right: css.right * kx });
  const cam = scene.cameras.main;
  cam.setZoom(view.zoom);
  cam.centerOn(view.cx, view.cy);
  views.set(scene, view);
  return view;
}

/**
 * fitView сразу и при каждом изменении размера экрана (поворот на планшете, окно браузера).
 * onChange получает новую видимую область — чтобы перерисовать фон.
 */
export function keepFitted(scene: Phaser.Scene, onChange?: (v: ViewRect) => void): ViewRect {
  const view = fitView(scene);
  const handler = () => onChange?.(fitView(scene));
  scene.scale.on('resize', handler);
  scene.events.once('shutdown', () => scene.scale.off('resize', handler));
  return view;
}
