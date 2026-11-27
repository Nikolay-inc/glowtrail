// Касание или свайп в деревне: по точкам в координатах мира. Регрессия: на высоком телефоне (390x844) камера
// сдвигает раскладку, касание сравнивалось в разных системах координат и считалось свайпом — окно постройки
// не открывалось. Сквозная проверка нажатием — в npm run i18n-check (village-tap, 375x667 и 390x844).
import { describe, expect, it } from 'vitest';
import { gestureOf, inside, overlap, screenToWorld, TAP_SLOP } from '../src/ui/gesture';

describe('касание и свайп (деревня)', () => {
  it('тап — палец почти не сдвинулся; свайп — далеко по горизонтали и быстро', () => {
    expect(gestureOf({ x: 800, y: 900 }, { x: 812, y: 905 }, 120)).toBe('tap');
    expect(gestureOf({ x: 800, y: 900 }, { x: 800 + TAP_SLOP, y: 900 }, 120)).toBe('tap');
    expect(gestureOf({ x: 800, y: 900 }, { x: 600, y: 920 }, 300)).toBe('swipe-left');
    expect(gestureOf({ x: 300, y: 900 }, { x: 500, y: 890 }, 300)).toBe('swipe-right');
    expect(gestureOf({ x: 300, y: 900 }, { x: 500, y: 890 }, 1200)).toBe('drag');
    expect(gestureOf({ x: 300, y: 900 }, { x: 330, y: 1100 }, 200)).toBe('drag');
  });

  it('тап на высоком экране (раскладка сдвинута на 208) и на широком (масштаб 0,8): это тап, а не свайп', () => {
    const tall = { zoom: 1, viewX: 0, viewY: -208 };
    expect(gestureOf(screenToWorld({ x: 770, y: 1100 }, tall), screenToWorld({ x: 772, y: 1102 }, tall), 150)).toBe('tap');
    expect(gestureOf({ x: 770, y: 1100 }, screenToWorld({ x: 772, y: 1102 }, tall), 150)).not.toBe('tap');
    const cam = { zoom: 0.8, viewX: -120, viewY: 0 };
    const downScreen = { x: 278, y: 330 };
    const upScreen = { x: 280, y: 331 };
    const down = screenToWorld(downScreen, cam);
    const up = screenToWorld(upScreen, cam);
    expect(gestureOf(down, up, 150)).toBe('tap');
    // Старая ошибка: экранная точка касания против мировой точки отпускания — «сдвиг» в сотни единиц.
    expect(gestureOf(downScreen, up, 150)).not.toBe('tap');
  });

  it('прямоугольники: перекрытие и попадание точки', () => {
    expect(overlap({ x: 0, y: 0, w: 100, h: 50 }, { x: 90, y: 40, w: 50, h: 50 })).toBe(true);
    expect(overlap({ x: 0, y: 0, w: 100, h: 50 }, { x: 100, y: 0, w: 50, h: 50 })).toBe(false);
    expect(overlap({ x: 0, y: 0, w: 100, h: 50 }, { x: 99, y: 0, w: 50, h: 50 }, 2)).toBe(false);
    expect(inside({ x: 5, y: 5 }, { x: 0, y: 0, w: 10, h: 10 })).toBe(true);
    expect(inside({ x: 15, y: 5 }, { x: 0, y: 0, w: 10, h: 10 })).toBe(false);
  });
});
