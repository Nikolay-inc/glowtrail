import { describe, expect, it } from 'vitest';
import { GAP, mapLayout, MARGIN_BOTTOM, STEP, SWAY, zigzagX } from '../src/ui/mapLayout';
import { W } from '../src/ui/theme';

describe('карта мира — раскладка кружков (mapLayout)', () => {
  it('снизу вверх с шагом STEP, между мирами — промежуток GAP; та же раскладка при каждом вызове', () => {
    const a = mapLayout(90, [30, 60]);
    expect(a).toEqual(mapLayout(90, [30, 60]));
    expect(a.pos[0].y).toBe(a.height - MARGIN_BOTTOM);
    expect(a.pos[1].y - a.pos[0].y).toBe(-STEP);
    expect(a.pos[30].y - a.pos[29].y).toBe(-STEP - GAP);
    expect(a.pos[60].y - a.pos[59].y).toBe(-STEP - GAP);
    for (const p of a.pos) {
      expect(p.x).toBeGreaterThanOrEqual(W / 2 - SWAY);
      expect(p.x).toBeLessThanOrEqual(W / 2 + SWAY);
    }
  });

  it('серпантин в горах: проходы по склону от края до края с поворотами, остальные миры — как раньше', () => {
    const plain = mapLayout(90, [30, 60]);
    const a = mapLayout(90, [30, 60], [{ from: 60, to: 90 }]);
    expect(a.height).toBe(plain.height);
    // Долина и лес не меняются; высота кружков — тоже.
    expect(a.pos.slice(0, 60)).toEqual(plain.pos.slice(0, 60));
    expect(a.pos.map((p) => p.y)).toEqual(plain.pos.map((p) => p.y));
    // Крутые повороты у краёв через каждые 3 уровня, между ними — ровный проход.
    const xs = a.pos.slice(60).map((p) => Math.round(p.x - W / 2));
    expect(xs.slice(0, 7)).toEqual([-SWAY, -Math.round(SWAY / 3), Math.round(SWAY / 3), SWAY, Math.round(SWAY / 3), -Math.round(SWAY / 3), -SWAY]);
    expect(zigzagX(0)).toBe(-1);
    expect(zigzagX(3)).toBe(1);
    expect(zigzagX(6)).toBe(-1);
  });
});
