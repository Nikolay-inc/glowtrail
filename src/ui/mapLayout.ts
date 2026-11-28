// Раскладка кружков уровней на карте мира (MenuScene) — чистая функция без Phaser, с тестом (tests/map.test.ts).

import { W } from './theme';

/** Шаг между уровнями на карте и размах «змейки» тропинки. */
export const STEP = 250;
export const SWAY = 290;
export const MARGIN_TOP = 420;
export const MARGIN_BOTTOM = 420;
/** Дополнительный промежуток между мирами — там переход (туман, арка из елей, ворота). */
export const GAP = 900;
/** Серпантин: уровней на один проход склона (от поворота до поворота). */
export const ZIGZAG_RUN = 3;

/** Участок уровней [from, to) с раскладкой «серпантин». */
export interface ZigzagRange {
  from: number;
  to: number;
}

/**
 * Где на карте кружок уровня i (0 — внизу). breaks — индексы первых уровней следующих миров: перед ними
 * промежуток GAP под переход. zigzag — участки-«серпантины» (горы): там тропинка не плавная змейка, а прямые
 * проходы по склону от края до края с крутыми поворотами (по ZIGZAG_RUN уровней на проход). Та же раскладка
 * при каждом открытии.
 */
export function mapLayout(count: number, breaks: number[] = [], zigzag: ZigzagRange[] = []): { height: number; pos: { x: number; y: number }[] } {
  const inside = breaks.filter((b) => b > 0 && b < count);
  const height = MARGIN_TOP + MARGIN_BOTTOM + (count - 1) * STEP + inside.length * GAP;
  const pos = Array.from({ length: count }, (_, i) => {
    const z = zigzag.find((r) => i >= r.from && i < r.to);
    return {
      x: z ? W / 2 + zigzagX(i - z.from) * SWAY : W / 2 + Math.sin(i * 0.82 + 0.4) * SWAY * (0.75 + 0.25 * Math.sin(i * 0.31)),
      y: height - MARGIN_BOTTOM - i * STEP - inside.filter((b) => b <= i).length * GAP,
    };
  });
  return { height, pos };
}

/** Серпантин: «треугольная волна» от −1 до 1 — ZIGZAG_RUN шагов в одну сторону, столько же обратно. */
export function zigzagX(j: number): number {
  const period = ZIGZAG_RUN * 2;
  const k = ((j % period) + period) % period;
  const u = k <= ZIGZAG_RUN ? k / ZIGZAG_RUN : (period - k) / ZIGZAG_RUN;
  return u * 2 - 1;
}
