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
  /** Верх и низ безопасной зоны в координатах игры (на высоком экране — выше 0 и ниже H). */
  safeTop: number;
  safeBottom: number;
}

/** Вертикальные границы раскладки: по умолчанию 0…H, растянутая сцена — шире. */
export interface LayoutBounds {
  top: number;
  bottom: number;
}

const DEFAULT_BOUNDS: LayoutBounds = { top: 0, bottom: H };

/**
 * Где показать раскладку (ширина W, по высоте bounds.top…bottom) на экране gameW×gameH с отступами
 * безопасной зоны (в пикселях игры). Раскладка целиком внутри безопасной зоны и по центру неё;
 * если не помещается — камера уменьшает её.
 */
export function computeView(gameW: number, gameH: number, insets: Insets, bounds: LayoutBounds = DEFAULT_BOUNDS): ViewRect {
  const layoutH = bounds.bottom - bounds.top;
  const availW = Math.max(1, gameW - insets.left - insets.right);
  const availH = Math.max(1, gameH - insets.top - insets.bottom);
  const zoom = Math.min(1, availW / W, availH / layoutH);
  const leftScreen = insets.left + (availW - W * zoom) / 2;
  const topScreen = insets.top + (availH - layoutH * zoom) / 2;
  const cx = (gameW / 2 - leftScreen) / zoom;
  const cy = (gameH / 2 - topScreen) / zoom + bounds.top;
  const w = gameW / zoom;
  const h = gameH / zoom;
  const y = cy - h / 2;
  return { x: cx - w / 2, y, w, h, zoom, cx, cy, safeTop: y + insets.top / zoom, safeBottom: y + (gameH - insets.bottom) / zoom };
}

/**
 * Высокий экран: насколько можно растянуть раскладку вверх и вниз (не больше maxExtra с каждой стороны),
 * чтобы верхняя панель встала к верху безопасной зоны, нижняя — к низу, а поле стало крупнее.
 */
export function stretchBounds(view: ViewRect, maxExtra: number): LayoutBounds {
  return {
    top: Math.max(-maxExtra, Math.min(0, view.safeTop)),
    bottom: Math.min(H + maxExtra, Math.max(H, view.safeBottom)),
  };
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
const sceneBounds = new WeakMap<Phaser.Scene, LayoutBounds>();

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
  const insets = { top: css.top * ky, bottom: css.bottom * ky, left: css.left * kx, right: css.right * kx };
  const view = computeView(gameW, gameH, insets, sceneBounds.get(scene));
  const cam = scene.cameras.main;
  cam.setZoom(view.zoom);
  cam.centerOn(view.cx, view.cy);
  views.set(scene, view);
  return view;
}

/**
 * Растянуть раскладку сцены на высокий экран (вызывать в начале create, до addBackground).
 * Возвращает границы: элементы сверху ставим от top, снизу — до bottom. При изменении размера окна
 * камера держит именно эти границы в безопасной зоне (если не влезают — уменьшает).
 */
export function stretchLayout(scene: Phaser.Scene, maxExtra = 320): LayoutBounds {
  sceneBounds.delete(scene);
  const bounds = stretchBounds(fitView(scene), maxExtra);
  sceneBounds.set(scene, bounds);
  scene.events.once('shutdown', () => sceneBounds.delete(scene));
  fitView(scene);
  return bounds;
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

/**
 * Опорные линии экранов с вкладками: topY — заголовок у верха безопасной зоны, rowY — ряд над нижней
 * панелью вкладок (сама панель — rowY + 40), чтобы панель стояла вплотную к низу безопасной зоны
 * (под ней — только полоска «домой», закрытая фоном панели).
 */
export function edgeRows(bounds: LayoutBounds): { topY: number; rowY: number } {
  return { topY: bounds.top + 85, rowY: bounds.bottom - 135 };
}
