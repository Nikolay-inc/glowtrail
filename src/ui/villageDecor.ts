// Украшения деревни (в Горном городе — зимние: фонари-столбики, скамейки, ели в снегу, ледяные скульптуры),
// улицы (в горах — снежная тропа и брусчатка) и портреты жителей.
// Всё — простые фигуры Phaser Graphics в тёплой вечерней палитре (украшения стоят только у восстановленной деревни).
// Координаты — от точки на земле посередине (y вверх отрицательный), как у построек в village.ts.

import Phaser from 'phaser';
import { ALL_DECOR_TYPES, type DecorType } from '../core/villageData';

type G = Phaser.GameObjects.Graphics;
type Pt = [number, number];
const V2 = Phaser.Math.Vector2;

/** Точка света (окно, фонарь, огонёк). */
interface Light {
  x: number;
  y: number;
  r: number;
  c?: number;
}

// Тёплая вечерняя палитра
const WOOD = 0x7a5236;
const WOOD_D = 0x5a3a24;
const WOOD_L = 0x9a6a44;
const STONE = 0x8a8494;
const STONE_D = 0x5e5a6a;
const STONE_L = 0xa8a2b0;
const LEAF = 0x3e7a4a;
const LEAF_D = 0x2a5a36;
const LEAF_L = 0x5a9a5a;
const WARM = 0xffd36b;
const GOLD = 0xe8c25a;
const GOLD_D = 0xb08a2e;
const IRON = 0x1a1626;
const ROOF = 0x9a4a3e;
const ROOF_D = 0x6e3028;
const TRIM = 0xe8d2a8;
const PINK = 0xffb3cf;
const WHITE = 0xfff4e0;
const YELLOW = 0xffd45a;
const ORANGE = 0xff8a6a;
const RED = 0xd04a3a;
const TEAL = 0x6ae6d8;
const FIREFLY = 0xd8ff7a;
const POT = 0xb0603a;
const FLOWERS = [PINK, WHITE, YELLOW, ORANGE];

function fp(g: G, a: number[]) {
  const pts: Phaser.Math.Vector2[] = [];
  for (let i = 0; i < a.length; i += 2) pts.push(new V2(a[i], a[i + 1]));
  g.fillPoints(pts, true);
}

function sp(g: G, pts: Pt[], closed = false) {
  g.strokePoints(
    pts.map(([x, y]) => new V2(x, y)),
    closed,
  );
}

/** Детерминированный «случайный» 0..1 по двум числам. */
function rnd(i: number, k = 0) {
  const s = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453;
  return s - Math.floor(s);
}

function shadow(g: G, w: number) {
  g.fillStyle(0x000000, 0.3);
  g.fillEllipse(0, 3, w, 14);
}

function star(g: G, x: number, y: number, r1: number, r2: number) {
  const pts: Phaser.Math.Vector2[] = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const r = i % 2 ? r2 : r1;
    pts.push(new V2(x + Math.cos(a) * r, y + Math.sin(a) * r));
  }
  g.fillPoints(pts, true);
}

/** Повёрнутый прямоугольник: центр, длина, толщина, угол. */
function plank(g: G, x: number, y: number, len: number, w: number, ang: number) {
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  const hx = (len / 2) * c;
  const hy = (len / 2) * s;
  const nx = (-w / 2) * s;
  const ny = (w / 2) * c;
  fp(g, [x - hx + nx, y - hy + ny, x + hx + nx, y + hy + ny, x + hx - nx, y + hy - ny, x - hx - nx, y - hy - ny]);
}

/** Цветок: стебель от земли, головка. */
function flower(g: G, x: number, y: number, h: number, c: number, r = 4) {
  g.lineStyle(2, LEAF, 1);
  g.lineBetween(x, y, x, y - h);
  g.fillStyle(LEAF_L, 1);
  g.fillEllipse(x - 4, y - h * 0.45, 7, 4);
  g.fillStyle(c, 1);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    g.fillCircle(x + Math.cos(a) * r * 0.7, y - h + Math.sin(a) * r * 0.7, r * 0.6);
  }
  g.fillStyle(YELLOW, 1);
  g.fillCircle(x, y - h, r * 0.4);
}

/** Куст с цветами: центр, радиус. */
function bush(g: G, x: number, y: number, r: number, flowers = true, seed = 0) {
  g.fillStyle(LEAF_D, 1);
  g.fillCircle(x, y, r);
  g.fillStyle(LEAF, 1);
  g.fillCircle(x - r * 0.3, y - r * 0.25, r * 0.7);
  g.fillCircle(x + r * 0.4, y - r * 0.1, r * 0.55);
  if (!flowers) return;
  const n = Math.round(r / 3);
  for (let i = 0; i < n; i++) {
    const a = rnd(i, seed) * Math.PI * 2;
    const d = rnd(i, seed + 1) * r * 0.85;
    g.fillStyle(FLOWERS[(i + seed) % FLOWERS.length], 1);
    g.fillCircle(x + Math.cos(a) * d, y + Math.sin(a) * d * 0.8, 3.5);
  }
}

/** Фонарик-коробочка: x, y — центр; свет в lights. */
function lantern(g: G, L: Light[], x: number, y: number, s = 1, c = WARM) {
  g.fillStyle(IRON, 1);
  g.fillTriangle(x - 10 * s, y - 10 * s, x + 10 * s, y - 10 * s, x, y - 18 * s);
  g.fillStyle(c, 1);
  g.fillRoundedRect(x - 7 * s, y - 10 * s, 14 * s, 18 * s, 3 * s);
  g.fillStyle(IRON, 1);
  g.fillRect(x - 8 * s, y + 7 * s, 16 * s, 3 * s);
  g.lineStyle(1.5, IRON, 0.8);
  g.lineBetween(x, y - 10 * s, x, y + 8 * s);
  L.push({ x, y, r: 14 * s, c });
}

/** Подвесной фонарик на шнурке. */
function hanging(g: G, L: Light[], x: number, y: number, len: number, c = WARM, round = false) {
  g.lineStyle(2, IRON, 1);
  g.lineBetween(x, y, x, y + len);
  const cy = y + len + 9;
  g.fillStyle(c, 1);
  if (round) g.fillEllipse(x, cy, 16, 20);
  else g.fillRoundedRect(x - 7, cy - 9, 14, 18, 3);
  g.fillStyle(IRON, 1);
  g.fillRect(x - 5, cy - 12, 10, 4);
  L.push({ x, y: cy, r: 12, c });
}

/** Гирлянда огоньков между двумя точками (провисает). */
function bulbs(g: G, L: Light[], a: Pt, b: Pt, sag: number, step = 16, cols = [WARM, ORANGE, WHITE, PINK]) {
  const at = (t: number): Pt => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t + sag * 4 * t * (1 - t)];
  const line: Pt[] = [];
  for (let j = 0; j <= 10; j++) line.push(at(j / 10));
  g.lineStyle(1.5, 0x2a2030, 0.9);
  sp(g, line);
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const n = Math.max(1, Math.round(len / step));
  for (let j = 0; j < n; j++) {
    const [x, y] = at((j + 0.5) / n);
    const c = cols[j % cols.length];
    g.fillStyle(c, 1);
    g.fillCircle(x, y + 2, 3);
    L.push({ x, y: y + 2, r: 5, c });
  }
}

/** Колесо со спицами. */
function wheel(g: G, x: number, y: number, r: number, spokes = 6, hub = WOOD_D) {
  g.lineStyle(Math.max(3, r * 0.22), WOOD_D, 1);
  g.strokeCircle(x, y, r);
  g.lineStyle(2, WOOD_D, 1);
  for (let i = 0; i < spokes; i++) {
    const a = (i / spokes) * Math.PI;
    g.lineBetween(x - Math.cos(a) * r, y - Math.sin(a) * r, x + Math.cos(a) * r, y + Math.sin(a) * r);
  }
  g.fillStyle(hub, 1);
  g.fillCircle(x, y, r * 0.25);
}

/** Птичка на ветке/крыше: x, y — лапки. */
function bird(g: G, x: number, y: number, c = 0x4a6a9a, dir: 1 | -1 = 1) {
  g.fillStyle(c, 1);
  g.fillEllipse(x, y - 6, 14, 10);
  g.fillCircle(x + dir * 6, y - 11, 4.5);
  g.fillTriangle(x - dir * 6, y - 7, x - dir * 14, y - 12, x - dir * 12, y - 4);
  g.fillStyle(YELLOW, 1);
  g.fillTriangle(x + dir * 10, y - 12, x + dir * 10, y - 9, x + dir * 14, y - 10.5);
  g.fillStyle(IRON, 1);
  g.fillCircle(x + dir * 7, y - 12, 1.2);
}

// ---------------------------------------------------------------------------
// Украшения

export type { DecorType };
export const DECOR_TYPES: readonly DecorType[] = ALL_DECOR_TYPES;

export interface DecorView {
  objects: Phaser.GameObjects.GameObject[];
  height: number;
  width: number;
  lights: Light[];
}

type Size = [number, number];

function bench(g: G, L: Light[], v: number): Size {
  /** Деревянная скамейка с x-сдвигом и цветом. */
  const wooden = (dx: number, w: number, c: number, cd: number) => {
    g.fillStyle(cd, 1);
    g.fillRect(dx - w / 2 + 6, -22, 6, 22);
    g.fillRect(dx + w / 2 - 12, -22, 6, 22);
    g.fillRect(dx - w / 2 + 8, -56, 5, 34);
    g.fillRect(dx + w / 2 - 13, -56, 5, 34);
    g.fillStyle(c, 1);
    g.fillRect(dx - w / 2, -27, w, 7);
    g.fillRect(dx - w / 2 + 2, -54, w - 4, 7);
    g.fillRect(dx - w / 2 + 2, -42, w - 4, 6);
  };
  switch (v) {
    case 0:
      shadow(g, 100);
      wooden(0, 92, WOOD, WOOD_D);
      return [100, 58];
    case 1:
      shadow(g, 110);
      g.fillStyle(STONE_D, 1);
      g.fillRect(-40, -22, 18, 22);
      g.fillRect(22, -22, 18, 22);
      g.fillStyle(STONE, 1);
      g.fillRoundedRect(-44, -64, 88, 30, { tl: 14, tr: 14, bl: 2, br: 2 });
      g.fillRect(-48, -32, 96, 10);
      g.fillStyle(STONE_L, 1);
      g.fillRect(-48, -32, 96, 3);
      g.lineStyle(2, STONE_D, 1);
      g.strokeCircle(0, -50, 7);
      g.fillStyle(LEAF, 1);
      g.fillCircle(-40, -34, 6);
      g.fillCircle(-33, -36, 4);
      g.fillCircle(42, -60, 5);
      return [110, 66];
    case 2:
      shadow(g, 150);
      wooden(0, 88, 0x4a6a9a, 0x34507a);
      for (const x of [-62, 62]) {
        bush(g, x, -34, 14, true, x > 0 ? 3 : 1);
        g.fillStyle(POT, 1);
        fp(g, [x - 14, -26, x + 14, -26, x + 10, 0, x - 10, 0]);
        g.fillStyle(0x8a4a2a, 1);
        g.fillRect(x - 15, -28, 30, 5);
      }
      g.lineStyle(2, LEAF, 1);
      sp(g, [
        [-40, -56],
        [-20, -60],
        [0, -54],
        [20, -60],
        [40, -56],
      ]);
      for (const x of [-30, -8, 14, 34]) {
        g.fillStyle(PINK, 1);
        g.fillCircle(x, -58, 3);
      }
      return [150, 66];
    case 3: {
      shadow(g, 120);
      g.fillStyle(WOOD_D, 1);
      plank(g, -46, -56, 116, 8, Math.PI / 2 - 0.12);
      plank(g, 46, -56, 116, 8, Math.PI / 2 + 0.12);
      g.fillStyle(WOOD, 1);
      g.fillRect(-58, -116, 116, 9);
      g.lineStyle(2, TRIM, 1);
      g.lineBetween(-28, -108, -28, -34);
      g.lineBetween(28, -108, 28, -34);
      g.fillStyle(WOOD_L, 1);
      g.fillRoundedRect(-36, -36, 72, 8, 3);
      for (let y = -100; y < -40; y += 14) {
        g.fillStyle(FLOWERS[(y / 14) & 3], 1);
        g.fillCircle(-28, y, 3);
        g.fillCircle(28, y + 7, 3);
        g.fillStyle(LEAF_L, 1);
        g.fillCircle(-25, y + 4, 2.5);
        g.fillCircle(31, y + 11, 2.5);
      }
      return [124, 118];
    }
    default: {
      shadow(g, 140);
      g.fillStyle(WOOD_D, 1);
      g.fillRect(-58, -100, 8, 100);
      g.fillRect(50, -100, 8, 100);
      g.fillStyle(ROOF, 1);
      fp(g, [-72, -98, 72, -98, 60, -108, 0, -134, -60, -108]);
      g.lineStyle(2, ROOF_D, 1);
      g.lineBetween(-56, -110, 56, -110);
      g.fillStyle(GOLD, 1);
      g.fillCircle(0, -136, 4);
      wooden(0, 76, WOOD_L, WOOD);
      hanging(g, L, 0, -98, 8);
      // вьюнок по столбам
      for (const x of [-54, 54])
        for (let y = -90; y < -8; y += 16) {
          g.fillStyle(LEAF, 1);
          g.fillCircle(x + (y % 32 ? 4 : -4), y, 5);
          if ((y / 16) % 2) {
            g.fillStyle(PINK, 1);
            g.fillCircle(x + (y % 32 ? 6 : -6), y - 4, 3);
          }
        }
      return [146, 140];
    }
  }
}

function flowers(g: G, L: Light[], v: number): Size {
  switch (v) {
    case 0:
      shadow(g, 60);
      g.lineStyle(2, LEAF_L, 1);
      for (const [x, h] of [
        [-20, 18],
        [-12, 24],
        [-4, 16],
        [6, 22],
        [16, 18],
        [22, 14],
      ] as const)
        g.lineBetween(x, 0, x + (x > 0 ? 3 : -3), -h);
      flower(g, -12, 0, 44, PINK, 6);
      flower(g, 4, 0, 56, WHITE, 6);
      flower(g, 16, 0, 38, YELLOW, 6);
      return [64, 64];
    case 1:
      shadow(g, 130);
      g.fillStyle(0x4a3424, 1);
      g.fillEllipse(0, -6, 116, 22);
      for (const [x, h, c] of [
        [-40, 34, RED],
        [-24, 46, PINK],
        [-8, 40, YELLOW],
        [8, 50, RED],
        [24, 38, WHITE],
        [40, 44, PINK],
      ] as const) {
        g.lineStyle(2.5, LEAF, 1);
        g.lineBetween(x, -6, x, -h);
        g.fillStyle(LEAF_L, 1);
        g.fillEllipse(x + 4, -h * 0.5, 8, 4);
        g.fillStyle(c, 1);
        fp(g, [x - 6, -h, x - 6, -h - 10, x - 2, -h - 6, x, -h - 12, x + 2, -h - 6, x + 6, -h - 10, x + 6, -h]);
        g.fillEllipse(x, -h, 12, 6);
      }
      g.fillStyle(STONE, 1);
      for (let i = 0; i < 9; i++) {
        const a = Math.PI * 0.05 + (i / 8) * Math.PI * 0.9;
        g.fillEllipse(Math.cos(a) * 60, -6 + Math.sin(a) * 12, 16, 9);
      }
      return [130, 64];
    case 2:
      shadow(g, 80);
      bush(g, 0, -62, 30, true, 2);
      flower(g, -16, -52, 40, PINK, 7);
      flower(g, 14, -52, 34, WHITE, 7);
      g.fillStyle(POT, 1);
      fp(g, [-28, -44, 28, -44, 20, 0, -20, 0]);
      g.fillStyle(0x8a4a2a, 1);
      g.fillRect(-31, -48, 62, 8);
      g.lineStyle(2, 0xd88a5a, 1);
      g.lineBetween(-18, -26, 18, -26);
      return [80, 100];
    case 3:
      shadow(g, 100);
      bush(g, 0, -54, 28, true, 4);
      flower(g, -18, -50, 38, YELLOW, 6);
      flower(g, 8, -50, 44, PINK, 6);
      // свисающие цветы по бокам бочки
      g.lineStyle(2, LEAF, 1);
      sp(g, [
        [-30, -44],
        [-38, -30],
        [-36, -14],
      ]);
      sp(g, [
        [30, -44],
        [38, -28],
        [36, -10],
      ]);
      g.fillStyle(WOOD, 1);
      g.fillRoundedRect(-32, -44, 64, 44, 8);
      g.lineStyle(2, WOOD_D, 1);
      for (const x of [-16, 0, 16]) g.lineBetween(x, -44, x, 0);
      g.lineStyle(4, IRON, 1);
      g.lineBetween(-32, -34, 32, -34);
      g.lineBetween(-32, -10, 32, -10);
      for (const [x, y, c] of [
        [-38, -30, PINK],
        [-36, -14, WHITE],
        [38, -28, ORANGE],
        [36, -10, PINK],
      ] as const) {
        g.fillStyle(c, 1);
        g.fillCircle(x, y, 4);
      }
      return [100, 96];
    default: {
      shadow(g, 120);
      g.lineStyle(6, WOOD_D, 1);
      g.lineBetween(-44, 0, -44, -72);
      g.lineBetween(44, 0, 44, -72);
      g.beginPath();
      g.arc(0, -72, 44, Math.PI, 0, false);
      g.strokePath();
      // розы по арке
      const pts: Pt[] = [];
      for (let i = 0; i <= 12; i++) {
        const a = Math.PI + (i / 12) * Math.PI;
        pts.push([Math.cos(a) * 44, -72 + Math.sin(a) * 44]);
      }
      for (let y = -6; y > -72; y -= 14) pts.push([-44, y], [44, y]);
      pts.forEach(([x, y], i) => {
        g.fillStyle(LEAF, 1);
        g.fillCircle(x + (i % 2 ? 5 : -5), y + 3, 6);
        g.fillStyle(i % 3 ? PINK : RED, 1);
        g.fillCircle(x, y, 5);
        g.fillStyle(0xffe0ea, 0.8);
        g.fillCircle(x - 1, y - 1, 2);
      });
      // светящиеся цветы-фонарики
      for (const [x, y] of [
        [-30, -100],
        [30, -100],
        [0, -116],
      ] as const) {
        g.fillStyle(WARM, 1);
        g.fillEllipse(x, y + 10, 9, 12);
        L.push({ x, y: y + 10, r: 9 });
      }
      bush(g, -30, -10, 12, true, 5);
      bush(g, 30, -10, 12, true, 6);
      return [124, 124];
    }
  }
}

function lamp(g: G, L: Light[], v: number): Size {
  switch (v) {
    case 0:
      shadow(g, 40);
      g.fillStyle(WOOD_D, 1);
      g.fillRect(-4, -84, 8, 84);
      g.fillRect(-10, -6, 20, 6);
      lantern(g, L, 0, -94, 1);
      return [40, 112];
    case 1: {
      shadow(g, 50);
      g.fillStyle(IRON, 1);
      fp(g, [-12, 0, 12, 0, 6, -10, 3, -14, -3, -14, -6, -10]);
      g.fillRect(-2.5, -100, 5, 90);
      g.lineStyle(3, IRON, 1);
      g.beginPath();
      g.arc(10, -100, 10, Math.PI, 0, false);
      g.strokePath();
      g.beginPath();
      g.arc(-6, -30, 6, -Math.PI / 2, Math.PI / 2, true);
      g.strokePath();
      g.beginPath();
      g.arc(6, -40, 6, -Math.PI / 2, Math.PI / 2, false);
      g.strokePath();
      g.lineBetween(20, -100, 20, -90);
      lantern(g, L, 20, -76, 0.9);
      g.fillStyle(GOLD, 1);
      g.fillCircle(0, -104, 3.5);
      return [56, 108];
    }
    case 2:
      shadow(g, 80);
      g.fillStyle(IRON, 1);
      g.fillRect(-3, -96, 6, 96);
      g.fillRect(-12, -8, 24, 8);
      g.fillRect(-34, -96, 68, 5);
      g.fillStyle(GOLD, 1);
      g.fillCircle(0, -100, 4);
      g.lineStyle(3, IRON, 1);
      g.lineBetween(-3, -80, -20, -93);
      g.lineBetween(3, -80, 20, -93);
      hanging(g, L, -30, -91, 6);
      hanging(g, L, 30, -91, 6);
      return [84, 104];
    case 3:
      shadow(g, 110);
      g.fillStyle(WOOD_D, 1);
      g.fillRect(-4, -94, 8, 94);
      g.fillStyle(WOOD, 1);
      g.fillRect(-48, -16, 6, 16);
      g.fillRect(42, -16, 6, 16);
      lantern(g, L, 0, -104, 1);
      bulbs(g, L, [0, -90], [-45, -16], 8);
      bulbs(g, L, [0, -90], [45, -16], 8);
      // гирлянда вокруг столба
      for (let y = -84; y < -6; y += 12) {
        g.fillStyle(FLOWERS[(-y / 12) & 3], 1);
        g.fillCircle((y / 12) % 2 ? -5 : 5, y, 2.5);
      }
      return [110, 122];
    default: {
      shadow(g, 50);
      g.fillStyle(0x4a3424, 1);
      fp(g, [-7, 0, 7, 0, 4, -40, 8, -60, 3, -82, -3, -82, -1, -60, -6, -40]);
      g.fillStyle(LEAF, 1);
      g.fillEllipse(-10, -50, 14, 6);
      g.fillEllipse(10, -66, 14, 6);
      // банка со светлячками
      g.fillStyle(0x9ad6f5, 0.35);
      g.fillRoundedRect(-17, -118, 34, 38, 10);
      g.lineStyle(2, 0xc8e8ff, 0.7);
      g.strokeRoundedRect(-17, -118, 34, 38, 10);
      g.fillStyle(WOOD, 1);
      g.fillRect(-13, -124, 26, 7);
      g.lineStyle(2, IRON, 1);
      g.beginPath();
      g.arc(0, -124, 9, Math.PI, 0, false);
      g.strokePath();
      for (const [x, y] of [
        [-7, -108],
        [6, -100],
        [-3, -92],
        [8, -112],
        [22, -96],
        [-24, -88],
      ] as const) {
        g.fillStyle(FIREFLY, 1);
        g.fillCircle(x, y, 2.6);
        L.push({ x, y, r: 6, c: FIREFLY });
      }
      return [56, 134];
    }
  }
}

function tree(g: G, L: Light[], v: number): Size {
  const trunk = (h: number, w = 12, c = WOOD_D) => {
    g.fillStyle(c, 1);
    fp(g, [-w / 2 - 2, 0, w / 2 + 2, 0, w / 2, -h, -w / 2, -h]);
  };
  switch (v) {
    case 0:
      shadow(g, 64);
      trunk(20, 10);
      g.fillStyle(LEAF_D, 1);
      g.fillTriangle(-32, -18, 32, -18, 0, -62);
      g.fillTriangle(-26, -44, 26, -44, 0, -84);
      g.fillTriangle(-19, -66, 19, -66, 0, -102);
      g.fillStyle(LEAF, 1);
      g.fillTriangle(-32, -18, 0, -18, 0, -62);
      g.fillTriangle(-26, -44, 0, -44, 0, -84);
      g.fillTriangle(-19, -66, 0, -66, 0, -102);
      return [66, 104];
    case 1:
      shadow(g, 80);
      trunk(48);
      g.fillStyle(LEAF_D, 1);
      g.fillCircle(0, -72, 36);
      g.fillCircle(-22, -56, 22);
      g.fillCircle(22, -58, 22);
      g.fillStyle(LEAF, 1);
      g.fillCircle(-8, -80, 26);
      g.fillStyle(LEAF_L, 1);
      g.fillCircle(-14, -90, 12);
      return [88, 108];
    case 2:
      shadow(g, 90);
      trunk(52, 12, 0x4a3030);
      g.lineStyle(5, 0x4a3030, 1);
      g.lineBetween(0, -40, -22, -62);
      g.lineBetween(0, -46, 20, -70);
      g.fillStyle(0xd07a9a, 1);
      g.fillCircle(-22, -68, 22);
      g.fillCircle(22, -72, 22);
      g.fillCircle(0, -88, 28);
      g.fillStyle(0xf0a0c0, 1);
      g.fillCircle(-12, -94, 18);
      g.fillCircle(18, -80, 14);
      g.fillCircle(-26, -72, 12);
      g.fillStyle(0xffd8e6, 1);
      for (let i = 0; i < 14; i++) g.fillCircle(-36 + rnd(i, 7) * 72, -110 + rnd(i, 8) * 60, 2.5);
      // лепестки на земле
      for (let i = 0; i < 6; i++) g.fillEllipse(-30 + rnd(i, 9) * 60, -2 + rnd(i, 10) * 6, 5, 3);
      return [96, 118];
    case 3:
      shadow(g, 110);
      trunk(48, 14);
      g.fillStyle(LEAF_D, 1);
      g.fillCircle(0, -74, 36);
      g.fillCircle(-26, -60, 22);
      g.fillCircle(26, -60, 22);
      g.fillStyle(LEAF, 1);
      g.fillCircle(-6, -84, 26);
      for (const [x, y, c] of [
        [-20, -60, ORANGE],
        [14, -88, RED],
        [24, -62, ORANGE],
        [-6, -70, RED],
        [-24, -90, ORANGE],
        [6, -52, RED],
        [30, -76, ORANGE],
      ] as const) {
        g.fillStyle(c, 1);
        g.fillCircle(x, y, 5);
        g.fillStyle(0xffffff, 0.5);
        g.fillCircle(x - 1.5, y - 1.5, 1.5);
      }
      // корзина с яблоками
      g.fillStyle(RED, 1);
      g.fillCircle(30, -16, 5);
      g.fillCircle(40, -17, 5);
      g.fillStyle(0xc9a060, 1);
      fp(g, [22, -14, 50, -14, 46, 0, 26, 0]);
      g.lineStyle(2, 0xa07840, 1);
      g.lineBetween(24, -8, 48, -8);
      return [112, 112];
    default: {
      shadow(g, 100);
      g.fillStyle(0x2a2238, 1);
      fp(g, [-9, 0, 9, 0, 6, -30, 12, -44, 4, -54, -4, -54, -10, -40, -5, -30]);
      g.fillStyle(0x1e4a5a, 1);
      g.fillCircle(0, -82, 38);
      g.fillCircle(-26, -62, 22);
      g.fillCircle(26, -64, 22);
      g.fillStyle(0x2a6a7a, 1);
      g.fillCircle(-8, -92, 24);
      g.fillCircle(16, -74, 14);
      for (const [x, y, c] of [
        [-24, -66, TEAL],
        [16, -98, TEAL],
        [-6, -84, GOLD],
        [26, -66, TEAL],
        [-20, -102, GOLD],
        [6, -60, TEAL],
        [30, -86, GOLD],
      ] as const) {
        g.lineStyle(1.5, 0x9ae8e0, 0.6);
        g.lineBetween(x, y - 8, x, y - 3);
        g.fillStyle(c, 1);
        g.fillCircle(x, y, 4.5);
        L.push({ x, y, r: 10, c });
      }
      return [104, 122];
    }
  }
}

function signpost(g: G, L: Light[], v: number): Size {
  const arrow = (x: number, y: number, w: number, dir: 1 | -1, c: number) => {
    g.fillStyle(c, 1);
    fp(g, [x - (dir * w) / 2, y - 8, x + (dir * w) / 2 - dir * 10, y - 8, x + (dir * w) / 2, y, x + (dir * w) / 2 - dir * 10, y + 8, x - (dir * w) / 2, y + 8]);
    g.lineStyle(2, TRIM, 0.7);
    g.lineBetween(x - (dir * w) / 2 + dir * 6, y, x + (dir * w) / 2 - dir * 14, y);
  };
  switch (v) {
    case 0:
      shadow(g, 60);
      g.fillStyle(WOOD_D, 1);
      g.fillRect(-4, -72, 8, 72);
      arrow(16, -58, 56, 1, WOOD);
      return [76, 76];
    case 1:
      shadow(g, 80);
      g.fillStyle(WOOD_D, 1);
      g.fillRect(-4, -98, 8, 98);
      g.fillTriangle(-6, -98, 6, -98, 0, -106);
      arrow(18, -84, 54, 1, 0x9a5a3a);
      arrow(-16, -64, 50, -1, 0x4a6a9a);
      arrow(14, -44, 46, 1, 0x5a8a4a);
      return [90, 108];
    case 2:
      shadow(g, 90);
      g.fillStyle(WOOD_D, 1);
      g.fillRect(-38, -84, 7, 84);
      g.fillRect(31, -84, 7, 84);
      g.fillStyle(WOOD, 1);
      g.fillRect(-38, -76, 76, 48);
      g.lineStyle(3, WOOD_D, 1);
      g.strokeRect(-38, -76, 76, 48);
      g.fillStyle(ROOF, 1);
      fp(g, [-48, -82, 48, -82, 36, -96, -36, -96]);
      for (const [x, y, w, h, c, a] of [
        [-22, -54, 20, 24, WHITE, -0.1],
        [2, -58, 18, 20, YELLOW, 0.08],
        [22, -50, 16, 18, PINK, -0.05],
      ] as const) {
        g.fillStyle(c, 1);
        plank(g, x, y, w, h, a);
        g.fillStyle(RED, 1);
        g.fillCircle(x, y - h / 2 + 3, 2);
      }
      return [100, 98];
    case 3:
      shadow(g, 90);
      g.fillStyle(WOOD_D, 1);
      g.fillRect(-34, -96, 8, 96);
      g.fillRect(-34, -84, 72, 6);
      g.lineStyle(3, WOOD_D, 1);
      g.lineBetween(-26, -62, -6, -82);
      g.lineStyle(2, IRON, 1);
      g.lineBetween(-4, -78, -4, -66);
      g.lineBetween(30, -78, 30, -66);
      g.fillStyle(WOOD_L, 1);
      g.fillRoundedRect(-12, -66, 50, 32, 6);
      g.lineStyle(2, TRIM, 1);
      g.strokeRoundedRect(-12, -66, 50, 32, 6);
      g.fillStyle(TRIM, 1);
      star(g, 13, -50, 9, 4);
      lantern(g, L, -30, -106, 0.8);
      return [90, 124];
    default: {
      shadow(g, 110);
      g.fillStyle(WOOD_D, 1);
      g.fillRect(-46, -90, 8, 90);
      g.fillRect(38, -90, 8, 90);
      g.fillStyle(0x6a3a4a, 1);
      g.fillRoundedRect(-44, -96, 88, 40, 10);
      g.beginPath();
      g.arc(0, -92, 44, Math.PI, 0, false);
      g.closePath();
      g.fillPath();
      g.lineStyle(4, GOLD, 1);
      g.beginPath();
      g.arc(0, -92, 40, Math.PI, 0, false);
      g.strokePath();
      g.lineBetween(-40, -92, -40, -60);
      g.lineBetween(40, -92, 40, -60);
      g.lineBetween(-40, -60, 40, -60);
      g.fillStyle(GOLD, 1);
      star(g, 0, -100, 15, 6.5);
      g.fillStyle(WARM, 1);
      for (let i = 0; i <= 8; i++) {
        const a = Math.PI + (i / 8) * Math.PI;
        const x = Math.cos(a) * 48;
        const y = -92 + Math.sin(a) * 48;
        g.fillCircle(x, y, 3);
        L.push({ x, y, r: 5 });
      }
      L.push({ x: 0, y: -100, r: 16 });
      g.fillStyle(GOLD, 1);
      g.fillRect(-26, -76, 52, 4);
      g.fillRect(-18, -68, 36, 3);
      return [110, 144];
    }
  }
}

function cart(g: G, L: Light[], v: number): Size {
  switch (v) {
    case 0:
      shadow(g, 100);
      // тачка с мешком
      g.fillStyle(0xd8c8a0, 1);
      g.fillEllipse(-4, -46, 34, 28);
      g.fillStyle(0xb8a880, 1);
      g.fillTriangle(-10, -60, 2, -60, -4, -70);
      g.fillStyle(WOOD, 1);
      fp(g, [-34, -40, 26, -40, 18, -18, -26, -18]);
      g.lineStyle(4, WOOD_D, 1);
      g.lineBetween(-26, -24, -50, -40);
      g.lineBetween(-34, -40, -52, -42);
      g.lineBetween(-20, -18, -22, 0);
      wheel(g, 26, -14, 14, 4);
      return [104, 72];
    case 1:
      shadow(g, 110);
      for (const [x, y, r] of [
        [-20, -46, 13],
        [6, -48, 15],
        [28, -44, 11],
        [-6, -62, 11],
      ] as const) {
        g.fillStyle(0xe8783a, 1);
        g.fillEllipse(x, y, r * 2.2, r * 1.8);
        g.lineStyle(1.5, 0xb8582a, 1);
        g.lineBetween(x, y - r * 0.9, x, y + r * 0.9);
        g.fillStyle(LEAF_D, 1);
        g.fillRect(x - 1.5, y - r - 4, 3, 5);
      }
      g.fillStyle(WOOD, 1);
      g.fillRect(-40, -40, 82, 24);
      g.lineStyle(2, WOOD_D, 1);
      g.lineBetween(-40, -28, 42, -28);
      g.lineStyle(4, WOOD_D, 1);
      g.lineBetween(42, -30, 62, -20);
      wheel(g, -20, -14, 15, 5);
      wheel(g, 24, -14, 15, 5);
      return [120, 78];
    case 2:
      shadow(g, 120);
      for (let i = 0; i < 4; i++) bush(g, -30 + i * 20, -54, 12, true, i * 2);
      g.fillStyle(0x4a6a9a, 1);
      g.fillRect(-46, -46, 92, 28);
      g.lineStyle(2, TRIM, 1);
      g.strokeRect(-46, -46, 92, 28);
      for (const x of [-24, 0, 24]) g.lineBetween(x, -46, x, -18);
      g.lineStyle(4, WOOD_D, 1);
      g.lineBetween(-46, -36, -70, -26);
      wheel(g, -26, -16, 16, 6);
      wheel(g, 26, -16, 16, 6);
      return [140, 80];
    case 3:
      shadow(g, 130);
      g.fillStyle(WOOD_D, 1);
      g.fillRect(-46, -104, 5, 64);
      g.fillRect(41, -104, 5, 64);
      for (let i = 0; i < 5; i++) {
        g.fillStyle(i % 2 ? WHITE : RED, 1);
        fp(g, [-56 + i * 22.4, -112, -33.6 + i * 22.4, -112, -33.6 + i * 22.4, -98, -56 + i * 22.4, -98]);
        g.fillCircle(-44.8 + i * 22.4, -98, 11.2);
      }
      for (let i = 0; i < 7; i++) {
        g.fillStyle(i % 2 ? ORANGE : RED, 1);
        g.fillCircle(-36 + i * 12, -48, 6);
      }
      g.fillStyle(WOOD, 1);
      g.fillRect(-50, -42, 100, 26);
      g.lineStyle(2, WOOD_D, 1);
      g.lineBetween(-50, -30, 50, -30);
      wheel(g, -28, -14, 15, 6);
      wheel(g, 28, -14, 15, 6);
      hanging(g, L, 30, -96, 6);
      return [130, 124];
    default: {
      shadow(g, 140);
      // фургон с тентом и фонариками
      g.fillStyle(0xe8dcc0, 1);
      g.fillRect(-56, -86, 112, 46);
      g.beginPath();
      g.arc(0, -86, 56, Math.PI, 0, false);
      g.closePath();
      g.fillPath();
      g.lineStyle(2, 0xc8b890, 1);
      for (const x of [-30, 0, 30]) g.lineBetween(x, -40, x, -86 - Math.sqrt(56 * 56 - x * x) + 4);
      g.fillStyle(0x6a3a4a, 1);
      g.fillRect(-62, -42, 124, 20);
      g.lineStyle(3, GOLD, 1);
      g.lineBetween(-62, -32, 62, -32);
      wheel(g, -34, -16, 17, 8, GOLD);
      wheel(g, 34, -16, 17, 8, GOLD);
      bulbs(g, L, [-56, -78], [56, -78], 6, 16, [WARM, TEAL, ORANGE, WHITE]);
      hanging(g, L, -62, -86, 4, WARM);
      return [140, 146];
    }
  }
}

function statue(g: G, L: Light[], v: number): Size {
  const pedestal = (w: number, h: number) => {
    g.fillStyle(STONE_D, 1);
    g.fillRect(-w / 2 - 6, -10, w + 12, 10);
    g.fillStyle(STONE, 1);
    g.fillRect(-w / 2, -h, w, h - 10);
    g.fillStyle(STONE_L, 1);
    g.fillRect(-w / 2 - 4, -h - 6, w + 8, 7);
  };
  switch (v) {
    case 0:
      shadow(g, 70);
      for (const [y, w, h] of [
        [-10, 62, 22],
        [-28, 48, 18],
        [-43, 36, 15],
        [-55, 24, 12],
        [-64, 14, 9],
      ] as const) {
        g.fillStyle(STONE, 1);
        g.fillEllipse(0, y, w, h);
        g.fillStyle(STONE_L, 0.6);
        g.fillEllipse(-w * 0.15, y - h * 0.2, w * 0.5, h * 0.35);
      }
      g.fillStyle(LEAF, 1);
      g.fillCircle(-24, -12, 6);
      g.fillCircle(-18, -8, 5);
      g.fillCircle(20, -28, 4);
      return [70, 70];
    case 1:
      shadow(g, 60);
      pedestal(40, 26);
      g.fillStyle(STONE, 1);
      fp(g, [-12, -32, 12, -32, 7, -96, 0, -106, -7, -96]);
      g.fillStyle(STONE_L, 1);
      fp(g, [-12, -32, -4, -32, -2, -96, 0, -106, -7, -96]);
      g.lineStyle(2, STONE_D, 1);
      g.strokeCircle(0, -68, 5);
      return [60, 108];
    case 2: {
      shadow(g, 80);
      pedestal(54, 34);
      const s = STONE_L;
      g.fillStyle(s, 1);
      fp(g, [-22, -40, 22, -40, 0, -84]);
      g.fillRoundedRect(-22, -56, 44, 18, 8);
      g.fillCircle(0, -86, 14);
      g.fillStyle(STONE, 1);
      fp(g, [-17, -92, 17, -92, 4, -122]);
      g.lineStyle(4, STONE, 1);
      g.lineBetween(20, -40, 26, -88);
      g.fillStyle(WARM, 1);
      g.fillRoundedRect(20, -100, 14, 14, 4);
      L.push({ x: 27, y: -93, r: 12 });
      g.fillStyle(STONE_D, 1);
      g.fillCircle(-5, -86, 1.8);
      g.fillCircle(5, -86, 1.8);
      return [80, 124];
    }
    case 3:
      shadow(g, 90);
      g.fillStyle(STONE, 1);
      fp(g, [-16, 0, 16, 0, 9, -50, -9, -50]);
      g.fillStyle(STONE_L, 1);
      g.fillEllipse(0, -54, 84, 20);
      g.fillStyle(0x3a78b8, 1);
      g.fillEllipse(0, -56, 70, 12);
      g.fillStyle(0x9ad6f5, 0.8);
      g.fillEllipse(-12, -57, 18, 4);
      g.lineStyle(2, 0x9ad6f5, 0.8);
      g.lineBetween(0, -60, 0, -74);
      g.fillStyle(0x9ad6f5, 1);
      g.fillCircle(-6, -70, 2);
      g.fillCircle(6, -72, 2);
      bird(g, 32, -58, 0x8a6a4a, -1);
      return [90, 80];
    default:
      shadow(g, 80);
      pedestal(46, 52);
      g.lineStyle(3, GOLD, 1);
      g.lineBetween(-23, -40, 23, -40);
      g.lineBetween(-23, -18, 23, -18);
      g.fillStyle(GOLD_D, 1);
      g.fillRect(-3, -76, 6, 18);
      g.fillStyle(GOLD, 1);
      star(g, 0, -94, 24, 10);
      g.fillStyle(0xfff1cc, 0.8);
      star(g, -4, -98, 8, 3.5);
      L.push({ x: 0, y: -94, r: 28 });
      return [80, 124];
  }
}

function birdhouse(g: G, L: Light[], v: number): Size {
  /** Домик: центр x, низ y, ширина, высота стенки, цвет. */
  const box = (x: number, y: number, w: number, h: number, c: number, roof = ROOF, hole = true) => {
    g.fillStyle(c, 1);
    g.fillRect(x - w / 2, y - h, w, h);
    g.fillStyle(roof, 1);
    fp(g, [x - w / 2 - 6, y - h + 2, x + w / 2 + 6, y - h + 2, x, y - h - w * 0.55]);
    if (hole) {
      g.fillStyle(0x140e18, 1);
      g.fillCircle(x, y - h * 0.6, Math.min(6, w * 0.16));
      g.fillStyle(WOOD_D, 1);
      g.fillRect(x - 1.5, y - h * 0.35, 3, 7);
    }
  };
  switch (v) {
    case 0:
      shadow(g, 40);
      g.fillStyle(WOOD_D, 1);
      g.fillRect(-3, -60, 6, 60);
      g.fillStyle(WOOD, 1);
      g.fillRect(-16, -90, 32, 32);
      g.fillStyle(WOOD_D, 1);
      g.fillRect(-20, -94, 40, 6);
      g.fillStyle(0x140e18, 1);
      g.fillCircle(0, -76, 6);
      return [44, 94];
    case 1:
      shadow(g, 50);
      g.fillStyle(WOOD_D, 1);
      g.fillRect(-3, -62, 6, 62);
      box(0, -60, 34, 30, 0x4a6a9a);
      g.fillStyle(WOOD_D, 1);
      g.fillRect(-1.5, -66, 22, 3);
      bird(g, 18, -66, 0xd8783a);
      return [54, 110];
    case 2:
      shadow(g, 50);
      g.fillStyle(WOOD_D, 1);
      g.fillRect(-3, -48, 6, 48);
      g.fillStyle(0x6a8a5a, 1);
      g.fillRect(-20, -78, 40, 30);
      g.fillStyle(0x140e18, 1);
      g.fillCircle(-8, -64, 5);
      g.fillCircle(8, -64, 5);
      g.fillStyle(WOOD_D, 1);
      g.fillRect(-24, -80, 48, 4);
      box(0, -80, 30, 24, 0xd8c8a0);
      bush(g, 18, -46, 8, true, 1);
      bird(g, -22, -80, 0x4a6a9a, -1);
      return [56, 124];
    case 3: {
      shadow(g, 100);
      g.fillStyle(WOOD_D, 1);
      fp(g, [-8, 0, 8, 0, 5, -100, -5, -100]);
      g.lineStyle(5, WOOD_D, 1);
      g.lineBetween(0, -50, -34, -70);
      g.lineBetween(0, -70, 34, -88);
      g.lineBetween(0, -94, -24, -110);
      g.fillStyle(LEAF, 1);
      for (const [x, y] of [
        [-40, -74],
        [40, -92],
        [-28, -114],
        [6, -110],
      ] as const)
        g.fillCircle(x, y, 9);
      box(-30, -66, 22, 18, 0xd8783a);
      box(32, -84, 22, 18, 0x4a6a9a);
      box(-2, -106, 18, 14, 0xe8d2a8, ROOF_D);
      bird(g, -18, -70, 0xd04a3a);
      bird(g, 44, -88, 0xe8c25a, -1);
      return [104, 122];
    }
    default: {
      shadow(g, 70);
      g.fillStyle(WOOD_D, 1);
      g.fillRect(-4, -40, 8, 40);
      g.fillStyle(0xe8dcc0, 1);
      g.fillRect(-26, -96, 52, 58);
      g.fillStyle(ROOF, 1);
      fp(g, [-34, -94, 34, -94, 0, -126]);
      g.fillStyle(GOLD, 1);
      g.fillCircle(0, -128, 4);
      g.fillRect(-28, -42, 56, 4);
      for (const [x, y] of [
        [-12, -80],
        [12, -80],
        [0, -58],
      ] as const) {
        g.fillStyle(WARM, 1);
        g.fillCircle(x, y, 6);
        g.fillStyle(0xc8b890, 1);
        g.fillRect(x - 7, y + 6, 14, 3);
        L.push({ x, y, r: 9 });
      }
      bird(g, -34, -42, WHITE, -1);
      bird(g, 30, -94, WHITE);
      return [76, 132];
    }
  }
}

// ---------------------------------------------------------------------------
// Зимние украшения Горного города: фонари-столбики, скамейки, ели в снегу, ледяные скульптуры

const SNOW = 0xf2f6ff;
const SNOW_SH = 0xc6d2ec;
const ICE = 0x9ad6ff;
const ICE_FILL = 0xbfe6ff;
const ICE_EDGE = 0xeef8ff;
const ICE_DARK = 0x6aa8d8;
const FIR = 0x2f5a4a;
const FIR_D = 0x1f4034;

/** Снежная шапка-подушка: центр x, верх y, ширина w. */
function snowPad(g: G, x: number, y: number, w: number, h = 7) {
  g.fillStyle(SNOW_SH, 1);
  g.fillRoundedRect(x - w / 2, y - h / 2 + 2, w, h, h / 2);
  g.fillStyle(SNOW, 1);
  g.fillRoundedRect(x - w / 2, y - h / 2, w, h, h / 2);
}

/** Сугробик у основания. */
function snowMound(g: G, x: number, w: number, h = 10) {
  g.fillStyle(SNOW_SH, 1);
  g.fillEllipse(x, 2, w, h);
  g.fillStyle(SNOW, 1);
  g.fillEllipse(x - w * 0.08, 0, w * 0.82, h * 0.8);
}

/** Сосульки под перекладиной. */
function iceDrops(g: G, x0: number, x1: number, y: number, seed = 0) {
  g.fillStyle(ICE_EDGE, 0.9);
  for (let x = x0, i = 0; x <= x1; x += 7, i++) {
    const len = 4 + 9 * rnd(i, seed);
    g.fillTriangle(x - 2, y, x + 2, y, x, y + len);
  }
}

/** Ель в снегу: основание (x, 0), высота h, ширина w. */
function snowFirShape(g: G, x: number, h: number, w: number) {
  g.fillStyle(WOOD_D, 1);
  g.fillRect(x - w * 0.07, -h * 0.14, w * 0.14, h * 0.14);
  const tiers = 3;
  for (let i = 0; i < tiers; i++) {
    const yb = -h * 0.12 - i * h * 0.26;
    const ww = w * (1 - i * 0.24);
    const yt = yb - h * 0.42;
    g.fillStyle(i % 2 ? FIR : FIR_D, 1);
    g.fillTriangle(x - ww / 2, yb, x + ww / 2, yb, x, yt);
    g.fillStyle(SNOW, 1);
    g.fillTriangle(x - ww * 0.22, yb - h * 0.24, x + ww * 0.22, yb - h * 0.24, x, yt);
    g.fillEllipse(x - ww * 0.3, yb - 2, ww * 0.3, 5);
    g.fillEllipse(x + ww * 0.28, yb - 1, ww * 0.26, 4);
  }
}

/** Ледяная фигура: заливка, блик и светлый край. */
function iceShape(g: G, pts: number[]) {
  g.fillStyle(ICE_FILL, 0.78);
  fp(g, pts);
  g.lineStyle(2, ICE_EDGE, 0.95);
  const v: Pt[] = [];
  for (let i = 0; i < pts.length; i += 2) v.push([pts[i], pts[i + 1]]);
  sp(g, v, true);
}

/** Ледяной постамент. */
function icePlinth(g: G, w: number, h: number) {
  g.fillStyle(ICE_DARK, 0.85);
  g.fillRect(-w / 2, -h, w, h);
  g.fillStyle(ICE_EDGE, 0.8);
  g.fillRect(-w / 2, -h, w, 3);
  g.fillStyle(0xffffff, 0.35);
  g.fillRect(-w / 2 + 4, -h + 5, 4, h - 8);
}

function snowLamp(g: G, L: Light[], v: number): Size {
  switch (v) {
    case 0:
      shadow(g, 44);
      snowMound(g, 0, 40, 12);
      g.fillStyle(WOOD_D, 1);
      g.fillRect(-4, -84, 8, 82);
      lantern(g, L, 0, -94, 1);
      snowPad(g, 0, -112, 22, 6);
      return [44, 116];
    case 1:
      shadow(g, 56);
      g.fillStyle(IRON, 1);
      fp(g, [-12, 0, 12, 0, 6, -10, 3, -14, -3, -14, -6, -10]);
      g.fillRect(-2.5, -100, 5, 90);
      g.lineStyle(3, IRON, 1);
      g.beginPath();
      g.arc(10, -100, 10, Math.PI, 0, false);
      g.strokePath();
      g.lineBetween(20, -100, 20, -90);
      lantern(g, L, 20, -76, 0.9);
      snowPad(g, 20, -92, 20, 5);
      snowPad(g, 6, -110, 18, 5);
      snowMound(g, 0, 46, 10);
      return [56, 114];
    case 2:
      shadow(g, 84);
      g.fillStyle(IRON, 1);
      g.fillRect(-3, -96, 6, 96);
      g.fillRect(-12, -8, 24, 8);
      g.fillRect(-34, -96, 68, 5);
      hanging(g, L, -30, -91, 6);
      hanging(g, L, 30, -91, 6);
      snowPad(g, 0, -99, 74, 6);
      snowMound(g, 0, 50, 12);
      return [84, 106];
    case 3:
      shadow(g, 90);
      g.fillStyle(IRON, 1);
      g.fillRect(-3, -100, 6, 100);
      g.fillRect(-38, -100, 76, 5);
      g.fillStyle(GOLD, 1);
      g.fillCircle(0, -104, 4);
      iceDrops(g, -36, 36, -95, 3);
      lantern(g, L, -24, -64, 0.85);
      lantern(g, L, 24, -64, 0.85, ICE);
      g.lineStyle(2, IRON, 1);
      g.lineBetween(-24, -95, -24, -80);
      g.lineBetween(24, -95, 24, -80);
      snowPad(g, 0, -103, 80, 6);
      snowMound(g, 0, 56, 12);
      return [90, 110];
    default: {
      // Ледяной фонарь: прозрачная колонна, голубой огонь внутри
      shadow(g, 60);
      iceShape(g, [-16, 0, 16, 0, 12, -70, -12, -70]);
      g.fillStyle(0xffffff, 0.3);
      g.fillRect(-9, -64, 4, 58);
      iceShape(g, [-20, -70, 20, -70, 14, -104, -14, -104]);
      g.fillStyle(ICE, 1);
      g.fillEllipse(0, -86, 14, 20);
      g.fillStyle(0xffffff, 0.9);
      g.fillEllipse(0, -84, 6, 9);
      L.push({ x: 0, y: -86, r: 18, c: ICE });
      iceShape(g, [-22, -104, 22, -104, 0, -120]);
      snowMound(g, 0, 48, 10);
      return [60, 122];
    }
  }
}

function snowBench(g: G, L: Light[], v: number): Size {
  const wooden = (dx: number, w: number) => {
    g.fillStyle(WOOD_D, 1);
    g.fillRect(dx - w / 2 + 4, -26, 6, 26);
    g.fillRect(dx + w / 2 - 10, -26, 6, 26);
    g.fillRect(dx - w / 2 + 4, -56, 5, 30);
    g.fillRect(dx + w / 2 - 9, -56, 5, 30);
    g.fillStyle(WOOD, 1);
    g.fillRect(dx - w / 2, -30, w, 7);
    g.fillRect(dx - w / 2 + 2, -50, w - 4, 6);
    g.fillRect(dx - w / 2 + 2, -40, w - 4, 6);
    snowPad(g, dx, -32, w + 4, 7);
    snowPad(g, dx, -52, w - 6, 5);
  };
  switch (v) {
    case 0:
      shadow(g, 90);
      wooden(0, 80);
      snowMound(g, 30, 40, 10);
      return [90, 62];
    case 1:
      shadow(g, 100);
      g.fillStyle(STONE_D, 1);
      g.fillRect(-40, -24, 14, 24);
      g.fillRect(26, -24, 14, 24);
      g.fillStyle(STONE, 1);
      g.fillRect(-48, -32, 96, 10);
      g.fillStyle(STONE_L, 1);
      g.fillRect(-48, -32, 96, 3);
      snowPad(g, -10, -34, 70, 8);
      snowMound(g, -30, 40, 10);
      return [100, 44];
    case 2:
      shadow(g, 90);
      wooden(0, 80);
      // плед в клетку и кружка с паром
      g.fillStyle(RED, 1);
      fp(g, [-30, -36, 4, -36, 8, -10, -26, -12]);
      g.lineStyle(2, WHITE, 0.7);
      g.lineBetween(-22, -36, -18, -11);
      g.lineBetween(-10, -36, -6, -11);
      g.lineBetween(-29, -26, 6, -25);
      g.fillStyle(0x3a6ad0, 1);
      g.fillRoundedRect(20, -44, 12, 12, 3);
      g.lineStyle(1.5, 0xffffff, 0.5);
      g.lineBetween(24, -48, 22, -56);
      g.lineBetween(28, -48, 30, -56);
      return [90, 62];
    case 3: {
      // Сани с фонариком
      shadow(g, 110);
      g.lineStyle(4, GOLD_D, 1);
      g.lineBetween(-46, -4, 34, -4);
      g.beginPath();
      g.arc(34, -16, 12, Math.PI / 2, -Math.PI / 2, true);
      g.strokePath();
      g.fillStyle(WOOD_D, 1);
      for (const x of [-34, 0, 24]) g.fillRect(x - 2, -18, 4, 14);
      g.fillStyle(RED, 1);
      fp(g, [-50, -18, 30, -18, 30, -34, -40, -34, -50, -50]);
      g.fillStyle(GOLD, 1);
      g.fillRect(-46, -30, 72, 3);
      snowPad(g, -6, -36, 60, 7);
      g.fillStyle(IRON, 1);
      g.fillRect(16, -70, 3, 34);
      lantern(g, L, 18, -78, 0.8);
      return [110, 92];
    }
    default: {
      // Скамейка у костра
      shadow(g, 120);
      wooden(-24, 70);
      const fx = 40;
      g.fillStyle(STONE_D, 1);
      for (const [x, y] of [[-14, -2], [-6, 2], [6, 2], [14, -2]] as const) g.fillCircle(fx + x, y, 5);
      g.lineStyle(5, WOOD_D, 1);
      g.lineBetween(fx - 12, -2, fx + 10, -10);
      g.lineBetween(fx + 12, -2, fx - 10, -10);
      g.fillStyle(ORANGE, 1);
      g.fillTriangle(fx - 10, -6, fx + 10, -6, fx, -34);
      g.fillStyle(YELLOW, 1);
      g.fillTriangle(fx - 5, -6, fx + 5, -6, fx, -22);
      L.push({ x: fx, y: -16, r: 22, c: 0xffb85a });
      snowMound(g, -60, 30, 8);
      return [124, 62];
    }
  }
}

function snowFir(g: G, L: Light[], v: number): Size {
  switch (v) {
    case 0:
      shadow(g, 50);
      snowFirShape(g, 0, 70, 52);
      snowMound(g, 0, 50, 10);
      return [54, 72];
    case 1:
      shadow(g, 70);
      snowFirShape(g, 0, 118, 70);
      snowMound(g, 0, 64, 12);
      return [72, 120];
    case 2:
      shadow(g, 100);
      snowFirShape(g, -22, 104, 62);
      snowFirShape(g, 26, 76, 50);
      snowMound(g, 0, 96, 12);
      return [100, 106];
    case 3: {
      shadow(g, 76);
      snowFirShape(g, 0, 116, 72);
      const cols = [WARM, ICE, ORANGE, WHITE];
      for (let i = 0; i < 9; i++) {
        const t = (i + 0.5) / 9;
        const y = -18 - t * 84;
        const half = 30 * (1 - t) + 4;
        const x = (i % 2 ? 1 : -1) * half * 0.6;
        const c = cols[i % cols.length];
        g.fillStyle(c, 1);
        g.fillCircle(x, y, 3);
        L.push({ x, y, r: 6, c });
      }
      snowMound(g, 0, 66, 12);
      return [76, 118];
    }
    default: {
      shadow(g, 90);
      snowFirShape(g, 0, 120, 76);
      const cols = [WARM, RED, ICE, GOLD];
      for (let i = 0; i < 10; i++) {
        const t = (i + 0.5) / 10;
        const y = -20 - t * 82;
        const x = (i % 2 ? 1 : -1) * (32 * (1 - t) + 3) * 0.65;
        const c = cols[i % cols.length];
        g.fillStyle(c, 1);
        g.fillCircle(x, y, 3.2);
        L.push({ x, y, r: 6, c });
      }
      g.fillStyle(GOLD, 1);
      star(g, 0, -122, 11, 5);
      L.push({ x: 0, y: -122, r: 16 });
      // подарки под ёлкой
      g.fillStyle(RED, 1);
      g.fillRect(-36, -14, 16, 14);
      g.fillStyle(0x3a6ad0, 1);
      g.fillRect(22, -12, 14, 12);
      g.fillStyle(GOLD, 1);
      g.fillRect(-29, -14, 2, 14);
      g.fillRect(28, -12, 2, 12);
      return [90, 134];
    }
  }
}

function iceStatue(g: G, L: Light[], v: number): Size {
  switch (v) {
    case 0: {
      // Снеговик
      shadow(g, 60);
      for (const [y, r] of [[-20, 22], [-54, 16], [-80, 12]] as const) {
        g.fillStyle(SNOW_SH, 1);
        g.fillCircle(2, y + 2, r);
        g.fillStyle(SNOW, 1);
        g.fillCircle(0, y, r);
      }
      g.fillStyle(IRON, 1);
      g.fillCircle(-4, -83, 1.8);
      g.fillCircle(4, -83, 1.8);
      for (const y of [-58, -48]) g.fillCircle(0, y, 2);
      g.fillStyle(ORANGE, 1);
      g.fillTriangle(0, -80, 0, -76, 12, -78);
      g.fillStyle(RED, 1);
      g.fillRoundedRect(-13, -70, 26, 6, 3);
      g.fillRect(6, -68, 6, 16);
      g.fillStyle(IRON, 1);
      g.fillRect(-12, -94, 24, 4);
      g.fillRect(-8, -110, 16, 16);
      g.lineStyle(3, WOOD_D, 1);
      g.lineBetween(-14, -56, -32, -70);
      g.lineBetween(14, -56, 32, -66);
      return [70, 112];
    }
    case 1: {
      // Ледяная коза на постаменте
      shadow(g, 76);
      icePlinth(g, 56, 22);
      iceShape(g, [-26, -40, -22, -56, 10, -60, 20, -50, 18, -38, -20, -36]);
      for (const x of [-20, -10, 6, 14]) iceShape(g, [x - 2.5, -22, x + 2.5, -22, x + 2.5, -40, x - 2.5, -40]);
      iceShape(g, [12, -58, 22, -76, 32, -72, 24, -52]);
      iceShape(g, [22, -78, 36, -78, 38, -70, 26, -68]);
      g.lineStyle(3, ICE_EDGE, 1);
      g.lineBetween(26, -78, 18, -90);
      g.lineBetween(30, -78, 24, -92);
      L.push({ x: 0, y: -50, r: 18, c: ICE });
      return [76, 96];
    }
    case 2: {
      // Ледяной кристалл
      shadow(g, 70);
      icePlinth(g, 50, 18);
      iceShape(g, [-8, -18, 8, -18, 10, -80, 0, -100, -10, -80]);
      iceShape(g, [-26, -18, -10, -18, -12, -58, -20, -70, -28, -56]);
      iceShape(g, [10, -18, 26, -18, 28, -52, 20, -64, 12, -52]);
      g.fillStyle(0xffffff, 0.5);
      fp(g, [-4, -22, 0, -22, 2, -86, 0, -96, -5, -82]);
      L.push({ x: 0, y: -60, r: 26, c: ICE });
      return [70, 102];
    }
    case 3: {
      // Ледяной Lumo с фонарём
      shadow(g, 70);
      icePlinth(g, 54, 18);
      iceShape(g, [-20, -18, 20, -18, 16, -60, 0, -70, -16, -60]);
      g.fillStyle(ICE_FILL, 0.85);
      g.fillCircle(0, -78, 16);
      g.lineStyle(2, ICE_EDGE, 1);
      g.strokeCircle(0, -78, 16);
      iceShape(g, [-16, -84, 16, -84, 6, -112, 2, -104]);
      g.fillStyle(ICE_DARK, 1);
      g.fillCircle(-5, -78, 2.2);
      g.fillCircle(5, -78, 2.2);
      g.lineStyle(3, ICE_EDGE, 1);
      g.lineBetween(20, -24, 26, -84);
      g.fillStyle(ICE, 1);
      g.fillRoundedRect(20, -98, 14, 14, 4);
      L.push({ x: 27, y: -91, r: 14, c: ICE });
      return [70, 114];
    }
    default: {
      // Ледяной замок
      shadow(g, 110);
      icePlinth(g, 100, 12);
      const tower = (x: number, w: number, h: number) => {
        iceShape(g, [x - w / 2, -12, x + w / 2, -12, x + w / 2, -h, x - w / 2, -h]);
        for (let k = 0; k < 3; k++) iceShape(g, [x - w / 2 + k * (w / 3), -h, x - w / 2 + k * (w / 3) + w / 5, -h, x - w / 2 + k * (w / 3) + w / 5, -h - 7, x - w / 2 + k * (w / 3), -h - 7]);
      };
      tower(0, 44, 70);
      tower(-34, 24, 52);
      tower(34, 24, 52);
      iceShape(g, [-6, -70, 6, -70, 0, -100]);
      g.fillStyle(ICE, 1);
      g.fillRect(-5, -44, 10, 14);
      g.fillRect(-37, -36, 6, 8);
      g.fillRect(31, -36, 6, 8);
      L.push({ x: 0, y: -40, r: 18, c: ICE });
      L.push({ x: -34, y: -32, r: 10, c: ICE });
      L.push({ x: 34, y: -32, r: 10, c: ICE });
      return [110, 102];
    }
  }
}

const MAX_DECOR_H = 120;

const DECOR: Record<DecorType, (g: G, L: Light[], v: number) => Size> = {
  bench,
  flowers,
  lamp,
  tree,
  sign: signpost,
  cart,
  statue,
  birdhouse,
  'snow-lamp': snowLamp,
  'snow-bench': snowBench,
  'snow-fir': snowFir,
  'ice-statue': iceStatue,
};

/** Украшение для слота: variant 0..4 — от простого к нарядному. */
export function drawDecor(scene: Phaser.Scene, type: DecorType, variant: number): DecorView {
  const g = scene.add.graphics();
  const lights: Light[] = [];
  const v = Phaser.Math.Clamp(Math.round(variant), 0, 4);
  let [width, height] = (DECOR[type] ?? bench)(g, lights, v);
  // Не выше 120 px: нарядные варианты чуть уменьшаются.
  if (height > MAX_DECOR_H) {
    const k = MAX_DECOR_H / height;
    g.setScale(k);
    for (const l of lights) {
      l.x *= k;
      l.y *= k;
      l.r *= k;
    }
    width = Math.round(width * k);
    height = MAX_DECOR_H;
  }
  return { objects: [g], width, height, lights };
}

/** Есть ли текстура свечения (создаётся createTextures в draw.ts). */
function addGlow(scene: Phaser.Scene, c: Phaser.GameObjects.Container, lights: Light[], s: number, oy = 0) {
  if (!scene.textures.exists('glow')) return;
  for (const l of lights) c.add(scene.add.image(l.x * s, oy + l.y * s, 'glow').setTint(l.c ?? 0xffc65c).setBlendMode(Phaser.BlendModes.ADD).setScale((l.r * s) / 34).setAlpha(0.7));
}

/** Украшение, вписанное в рамку size×size с центром в (0, 0) (для окна выбора), со свечением огней. */
export function decorIcon(scene: Phaser.Scene, type: DecorType, variant: number, size: number): Phaser.GameObjects.Container {
  const d = drawDecor(scene, type, variant);
  const s = Math.min((size * 0.86) / d.width, (size * 0.86) / d.height);
  const c = scene.add.container(0, 0);
  const body = scene.add.container(0, (d.height * s) / 2, d.objects).setScale(s);
  c.add(body);
  addGlow(scene, c, d.lights, s, (d.height * s) / 2);
  return c;
}

// ---------------------------------------------------------------------------
// Улицы

/** Ровно расставленные точки по сглаженной ломаной (сплайн) и нормали к ней. */
function pathSamples(points: Phaser.Math.Vector2[], step: number) {
  const curve = new Phaser.Curves.Spline(points.map((p) => new V2(p.x, p.y)));
  const len = points.length > 1 ? curve.getLength() : 0;
  const n = Math.max(2, Math.ceil(len / step));
  const pts = points.length > 1 ? curve.getSpacedPoints(n) : [new V2(points[0]?.x ?? 0, points[0]?.y ?? 0), new V2((points[0]?.x ?? 0) + 1, points[0]?.y ?? 0)];
  const nor = pts.map((_, i) => {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(pts.length - 1, i + 1)];
    const t = new V2(b.x - a.x, b.y - a.y).normalize();
    return new V2(-t.y, t.x);
  });
  return { pts, nor, len };
}

/** Полоса по образцу: ширины слева/справа в каждой точке. */
function band(g: G, pts: Phaser.Math.Vector2[], nor: Phaser.Math.Vector2[], wl: (i: number) => number, wr: (i: number) => number, color: number, alpha = 1) {
  g.fillStyle(color, alpha);
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const na = nor[i];
    const nb = nor[i + 1];
    g.fillPoints([new V2(a.x + na.x * wl(i), a.y + na.y * wl(i)), new V2(b.x + nb.x * wl(i + 1), b.y + nb.y * wl(i + 1)), new V2(b.x - nb.x * wr(i + 1), b.y - nb.y * wr(i + 1)), new V2(a.x - na.x * wr(i), a.y - na.y * wr(i))], true);
  }
}

/** Камень-четырёхугольник: центр, вдоль (t) и поперёк (n) направления, полуразмеры. */
function stone(g: G, x: number, y: number, t: Phaser.Math.Vector2, n: Phaser.Math.Vector2, ha: number, hb: number) {
  g.fillPoints(
    [
      new V2(x - t.x * ha - n.x * hb, y - t.y * ha - n.y * hb),
      new V2(x + t.x * ha - n.x * hb, y + t.y * ha - n.y * hb),
      new V2(x + t.x * ha + n.x * hb, y + t.y * ha + n.y * hb),
      new V2(x - t.x * ha + n.x * hb, y - t.y * ha + n.y * hb),
    ],
    true,
  );
}

/** Фонарный столбик улицы: x, y — основание. Возвращает точку света (голова фонаря). */
function streetLamp(g: G, x: number, y: number): { x: number; y: number } {
  g.fillStyle(0x000000, 0.3);
  g.fillEllipse(x, y + 2, 22, 8);
  g.fillStyle(IRON, 1);
  g.fillRect(x - 7, y - 6, 14, 6);
  g.fillRect(x - 2.5, y - 66, 5, 62);
  g.fillStyle(WARM, 1);
  g.fillRoundedRect(x - 8, y - 84, 16, 18, 4);
  g.fillStyle(IRON, 1);
  g.fillTriangle(x - 11, y - 84, x + 11, y - 84, x, y - 94);
  g.fillRect(x - 9, y - 67, 18, 3);
  return { x, y: y - 75 };
}

/** Стиль улиц района: обычный (долина, лес) или снежный (Горный город). */
export type StreetStyle = 'green' | 'snow';

/**
 * Снежная улица Горного города: 0 — снежная тропа со следами, 1 — тропа, посыпанная песком и гравием,
 * 2 — брусчатка в снегу, 3 — мощёная с бордюром и фонарями в снежных валах.
 */
function snowStreet(g: G, points: Phaser.Math.Vector2[], step: 0 | 1 | 2 | 3, width: number): { lamps: { x: number; y: number }[] } {
  const hw = width / 2;
  const { pts, nor } = pathSamples(points, 8);
  const tan = (i: number) => new V2(nor[i].y, -nor[i].x);
  if (step >= 2) {
    const res = greenStreet(g, points, step, width);
    // Снежные валы по краям мостовой и шапки на фонарях.
    band(g, pts, nor, (i) => hw + 7 + 5 * rnd(i, 61), () => -(hw - 1), SNOW_SH);
    band(g, pts, nor, () => -(hw - 1), (i) => hw + 7 + 5 * rnd(i, 62), SNOW_SH);
    band(g, pts, nor, (i) => hw + 5 + 4 * rnd(i, 63), () => -(hw + 1), SNOW);
    band(g, pts, nor, () => -(hw + 1), (i) => hw + 5 + 4 * rnd(i, 64), SNOW);
    for (const l of res.lamps) snowPad(g, l.x, l.y - 20, 22, 5);
    return res;
  }
  if (step === 0) {
    // Снежная тропа: неровный край, утоптанная середина, следы
    band(g, pts, nor, (i) => hw * (0.9 + 0.25 * rnd(i, 71)), (i) => hw * (0.9 + 0.25 * rnd(i, 72)), SNOW_SH);
    band(g, pts, nor, (i) => hw * (0.8 + 0.2 * rnd(i, 73)), (i) => hw * (0.8 + 0.2 * rnd(i, 74)), 0xdfe8f8);
    band(g, pts, nor, (i) => hw * (0.35 + 0.1 * rnd(i, 75)), (i) => hw * (0.35 + 0.1 * rnd(i, 76)), 0xc8d4ea);
    g.fillStyle(0x9aa8c8, 0.8);
    for (let i = 1; i < pts.length; i += 2) {
      const o = (i % 4 < 2 ? 1 : -1) * hw * 0.22;
      const t = tan(i);
      const x = pts[i].x + nor[i].x * o;
      const y = pts[i].y + nor[i].y * o;
      g.fillEllipse(x + t.x * 2, y + t.y * 2, 6, 4);
      g.fillEllipse(x - t.x * 3, y - t.y * 3, 4, 3);
    }
  } else {
    // Тропа, посыпанная песком и мелким гравием
    band(g, pts, nor, () => hw + 3, () => hw + 3, SNOW_SH);
    band(g, pts, nor, () => hw, () => hw, 0xd8e0ee);
    band(g, pts, nor, (i) => hw * (0.62 + 0.1 * rnd(i, 81)), (i) => hw * (0.62 + 0.1 * rnd(i, 82)), 0xa89a86);
    const cols = [0x8a7a64, 0x6a5c50, 0xc0b2a0, 0x5e5a6a];
    for (let i = 0; i < pts.length; i++)
      for (let k = 0; k < 3; k++) {
        const o = (rnd(i, k + 90) - 0.5) * width * 0.6;
        const a = (rnd(i, k + 93) - 0.5) * 6;
        const t = tan(i);
        g.fillStyle(cols[(i + k) % cols.length], 1);
        g.fillCircle(pts[i].x + nor[i].x * o + t.x * a, pts[i].y + nor[i].y * o + t.y * a, 1.4 + rnd(i, k + 96) * 1.4);
      }
  }
  // Снежные кочки у края
  g.fillStyle(SNOW, 1);
  for (let i = 2; i < pts.length; i += 5) {
    const side = i % 10 < 5 ? 1 : -1;
    g.fillEllipse(pts[i].x + nor[i].x * (hw + 4) * side, pts[i].y + nor[i].y * (hw + 4) * side, 14, 7);
  }
  return { lamps: [] };
}

/**
 * Улица по точкам (сглаживается сплайном): 0 — тропинка, 1 — гравий, 2 — брусчатка, 3 — мощёная с бордюром и фонарями.
 * В Горном городе (style 'snow') — снежная тропа, посыпанная тропа, брусчатка и мощёная в снегу.
 * Возвращает точки, где у шага 3 стоят фонари (голова фонаря — для света).
 */
export function drawStreet(g: Phaser.GameObjects.Graphics, points: Phaser.Math.Vector2[], step: 0 | 1 | 2 | 3, width = 44, style: StreetStyle = 'green'): { lamps: { x: number; y: number }[] } {
  if (points.length < 2) return { lamps: [] };
  return style === 'snow' ? snowStreet(g, points, step, width) : greenStreet(g, points, step, width);
}

function greenStreet(g: G, points: Phaser.Math.Vector2[], step: 0 | 1 | 2 | 3, width: number): { lamps: { x: number; y: number }[] } {
  const hw = width / 2;
  const lamps: { x: number; y: number }[] = [];
  const { pts, nor, len } = pathSamples(points, step >= 2 ? 6 : 8);
  const tan = (i: number) => new V2(nor[i].y, -nor[i].x);
  switch (step) {
    case 0: {
      // Тропинка: утоптанная земля, неровный край, следы
      band(g, pts, nor, (i) => hw * (0.86 + 0.24 * rnd(i, 1)), (i) => hw * (0.86 + 0.24 * rnd(i, 2)), 0x3a2e28);
      band(g, pts, nor, (i) => hw * (0.55 + 0.15 * rnd(i, 3)), (i) => hw * (0.5 + 0.15 * rnd(i, 4)), 0x4a3a30);
      g.fillStyle(0x2a221e, 1);
      for (let i = 2; i < pts.length; i += 3) {
        const o = (rnd(i, 5) - 0.5) * width * 0.7;
        g.fillEllipse(pts[i].x + nor[i].x * o, pts[i].y + nor[i].y * o, 5, 3);
      }
      g.lineStyle(2, 0x3e6a3a, 0.9);
      for (let i = 1; i < pts.length; i += 4) {
        const side = i % 8 < 4 ? 1 : -1;
        const w = hw * 1.05;
        const x = pts[i].x + nor[i].x * w * side;
        const y = pts[i].y + nor[i].y * w * side;
        g.lineBetween(x, y, x - 2, y - 7);
        g.lineBetween(x + 3, y, x + 4, y - 6);
      }
      break;
    }
    case 1: {
      // Гравий: светлее, ровный край, россыпь камешков
      band(g, pts, nor, () => hw + 2, () => hw + 2, 0x5a4c40);
      band(g, pts, nor, () => hw - 1, () => hw - 1, 0x8a7a68);
      const cols = [0xa8988a, 0x6a5c50, 0xc0b2a0, 0x7a6c5c];
      for (let i = 0; i < pts.length; i++)
        for (let k = 0; k < 4; k++) {
          const o = (rnd(i, k + 10) - 0.5) * (width - 6);
          const a = (rnd(i, k + 20) - 0.5) * 6;
          const t = tan(i);
          g.fillStyle(cols[(i + k) % cols.length], 1);
          g.fillCircle(pts[i].x + nor[i].x * o + t.x * a, pts[i].y + nor[i].y * o + t.y * a, 1.6 + rnd(i, k + 30) * 1.4);
        }
      break;
    }
    case 2: {
      // Брусчатка: камни рядами поперёк
      band(g, pts, nor, () => hw + 1, () => hw + 1, 0x3a3644);
      const cols = [0x7a7484, 0x8a8494, 0x6e6878, 0x948ea0];
      const sw = 11;
      const nAcross = Math.max(2, Math.round(width / sw));
      const cw = width / nAcross;
      for (let i = 0, row = 0; i < pts.length; i += 2, row++) {
        const t = tan(i);
        const shift = row % 2 ? cw / 2 : 0;
        for (let k = 0; k <= nAcross; k++) {
          let o0 = -hw + k * cw - shift;
          let o1 = o0 + cw;
          o0 = Math.max(o0, -hw + 1);
          o1 = Math.min(o1, hw - 1);
          if (o1 - o0 < 3) continue;
          const o = (o0 + o1) / 2;
          g.fillStyle(cols[(row * 3 + k) % cols.length], 1);
          stone(g, pts[i].x + nor[i].x * o, pts[i].y + nor[i].y * o, t, nor[i], 4.6, (o1 - o0) / 2 - 1.2);
        }
      }
      break;
    }
    case 3: {
      // Мощёная улица: плиты, светлый бордюр, фонари
      band(g, pts, nor, () => hw + 1, () => hw + 1, 0x3a3644);
      const cols = [0x9a94a4, 0xa8a2b2, 0x8e8898];
      const inner = hw - 6;
      for (let i = 0, row = 0; i < pts.length - 1; i += 3, row++) {
        const t = tan(i);
        const parts = row % 2 ? [-inner, -inner / 3, inner / 3, inner] : [-inner, 0, inner];
        for (let k = 0; k < parts.length - 1; k++) {
          const o = (parts[k] + parts[k + 1]) / 2;
          g.fillStyle(cols[(row + k) % cols.length], 1);
          stone(g, pts[i].x + nor[i].x * o, pts[i].y + nor[i].y * o, t, nor[i], 7.6, (parts[k + 1] - parts[k]) / 2 - 1.2);
        }
      }
      band(g, pts, nor, () => hw + 1, () => -(hw - 5), 0xc8c2d0);
      band(g, pts, nor, () => -(hw - 5), () => hw + 1, 0xc8c2d0);
      g.lineStyle(1.5, 0x5e5a6a, 1);
      for (let i = 0; i < pts.length; i += 4) {
        for (const s of [1, -1]) {
          const a = hw - 5;
          const b = hw + 1;
          g.lineBetween(pts[i].x + nor[i].x * a * s, pts[i].y + nor[i].y * a * s, pts[i].x + nor[i].x * b * s, pts[i].y + nor[i].y * b * s);
        }
      }
      // Фонари через ~180 px, попеременно с двух сторон
      const stepLen = len / (pts.length - 1);
      const every = Math.max(1, Math.round(180 / stepLen));
      for (let i = Math.round(every / 2), k = 0; i < pts.length; i += every, k++) {
        const s = k % 2 ? -1 : 1;
        const x = pts[i].x + nor[i].x * (hw + 12) * s;
        const y = pts[i].y + nor[i].y * (hw + 12) * s;
        lamps.push(streetLamp(g, x, y));
      }
      break;
    }
  }
  return { lamps };
}

/** Образец куска улицы в прямоугольнике w×h с центром в (0, 0): трава, изогнутая дорожка, фонари со свечением. */
export function streetSample(scene: Phaser.Scene, step: 0 | 1 | 2 | 3, w: number, h: number, style: StreetStyle = 'green'): Phaser.GameObjects.Container {
  const c = scene.add.container(0, 0);
  const g = scene.add.graphics();
  const snow = style === 'snow';
  g.fillStyle(snow ? 0x3a4466 : 0x24362a, 1);
  g.fillRoundedRect(-w / 2, -h / 2, w, h, Math.min(24, h * 0.15));
  g.fillStyle(snow ? 0x8a96b8 : 0x2e4432, snow ? 0.5 : 1);
  for (let i = 0; i < 18; i++) g.fillEllipse(-w / 2 + 14 + rnd(i, 40) * (w - 28), -h / 2 + 10 + rnd(i, 41) * (h - 20), 16, 6);
  const sw = Math.min(44, h * 0.32);
  const pts = [new V2(-w / 2 + 6, h * 0.22), new V2(-w / 6, -h * 0.02), new V2(w / 6, h * 0.12), new V2(w / 2 - 6, -h * 0.08)];
  const { lamps } = drawStreet(g, pts, step, sw, style);
  c.add(g);
  addGlow(
    scene,
    c,
    lamps.map((l) => ({ ...l, r: 16 })),
    1,
  );
  return c;
}

// ---------------------------------------------------------------------------
// Портреты жителей

type Hat = 'cap' | 'toque' | 'goggles' | 'straw' | 'peaked' | 'sunhat' | 'hood' | 'tophat' | 'wizard' | 'beanie' | 'scarf' | 'mushroom' | 'bun' | 'feather' | 'bandana' | 'bucket' | 'helmet' | 'ushanka' | 'none';
type Extra = 'beard' | 'mustache' | 'glasses' | 'apron' | 'strap';

interface Resident {
  bg: number;
  body: number;
  skin: number;
  hair: number;
  hat: Hat;
  hatC: number;
  hatC2?: number;
  extra?: Extra[];
  extraC?: number;
}

const SKIN = [0xffe0c2, 0xf0c8a0, 0xd8a078, 0xb07a50];

const RESIDENTS: Record<string, Resident> = {
  well: { bg: 0x2b3a6a, body: 0x4a7ab8, skin: SKIN[0], hair: 0x6a4428, hat: 'cap', hatC: 0x6a5a8a },
  bakery: { bg: 0x6a3a2a, body: 0xf0e6d8, skin: SKIN[1], hair: 0x5a3a24, hat: 'toque', hatC: 0xfaf6ee, extra: ['mustache', 'apron'], extraC: 0xd8c8b0 },
  workshop: { bg: 0x3a3050, body: 0x8a5a36, skin: SKIN[2], hair: 0xa04a2a, hat: 'goggles', hatC: 0x6a4a2a, extra: ['apron'], extraC: 0x5a3a24 },
  mill: { bg: 0x4a5a3a, body: 0xd8c8a0, skin: SKIN[0], hair: 0x9a9a9a, hat: 'straw', hatC: 0xe0c070, hatC2: 0x8a4a3a, extra: ['mustache'] },
  bridge: { bg: 0x2a4a5a, body: 0x3a4a7a, skin: SKIN[3], hair: 0x2a2020, hat: 'peaked', hatC: 0x2a3a6a, hatC2: GOLD },
  garden: { bg: 0x3a5a3a, body: 0x5a9a4a, skin: SKIN[1], hair: 0xe0b860, hat: 'sunhat', hatC: 0xe0c070, hatC2: PINK },
  chapel: { bg: 0x3a2a4a, body: 0x6a4a8a, skin: SKIN[0], hair: 0x8a6a4a, hat: 'hood', hatC: 0x6a4a8a },
  square: { bg: 0x5a3a3a, body: 0xb0404a, skin: SKIN[2], hair: 0x3a2a20, hat: 'tophat', hatC: 0x2a2030, hatC2: 0xd04a3a, extra: ['mustache'] },
  lumo: { bg: 0x1e2a5a, body: 0x3d5bd9, skin: SKIN[0], hair: 0xe0b860, hat: 'wizard', hatC: 0x2a3fa8, hatC2: WARM },
  lighthouse: { bg: 0x2a4a6a, body: 0xe8c040, skin: SKIN[1], hair: 0xb0b0b8, hat: 'beanie', hatC: 0xc04040, hatC2: WHITE, extra: ['beard'] },
  herbalist: { bg: 0x2a4030, body: 0x7a6a3a, skin: SKIN[2], hair: 0x5a3a24, hat: 'scarf', hatC: 0x5a8a4a, hatC2: WHITE },
  observatory: { bg: 0x141c3a, body: 0x2a3a6a, skin: SKIN[0], hair: 0xd8d8e0, hat: 'wizard', hatC: 0x1e2a5a, hatC2: 0xfff1cc, extra: ['glasses', 'beard'] },
  'owl-post': { bg: 0x2a3a4a, body: 0x3a6ab0, skin: SKIN[1], hair: 0x6a4428, hat: 'peaked', hatC: 0x3a6ab0, hatC2: WHITE, extra: ['strap'], extraC: 0x6a4428 },
  'mushroom-farm': { bg: 0x3a2a30, body: 0x8a6a4a, skin: SKIN[3], hair: 0x2a2020, hat: 'mushroom', hatC: 0xc2463a, hatC2: 0xf4ecd8 },
  sawmill: { bg: 0x3a3020, body: 0xa03a30, skin: SKIN[1], hair: 0x7a4a2a, hat: 'beanie', hatC: 0xd8783a, hatC2: 0xd8783a, extra: ['beard'] },
  'lamp-workshop': { bg: 0x1a3a40, body: 0x2a8a80, skin: SKIN[0], hair: 0xc8783a, hat: 'goggles', hatC: 0x4a3a2a, extra: ['apron'], extraC: 0x1e5a54 },
  teahouse: { bg: 0x4a2a30, body: 0xc04a5a, skin: SKIN[0], hair: 0x1a1418, hat: 'bun', hatC: 0x1a1418, hatC2: PINK },
  forester: { bg: 0x2a3a2a, body: 0x4a6a3a, skin: SKIN[2], hair: 0x6a3a1e, hat: 'feather', hatC: 0x3a6a3a, hatC2: 0xd04a3a, extra: ['beard'] },
  'swing-bridge': { bg: 0x3a3a2a, body: 0x8a6a4a, skin: SKIN[3], hair: 0x2a2020, hat: 'bandana', hatC: 0xd8783a },
  'glow-lake': { bg: 0x1a3a3a, body: 0x2a7a7a, skin: SKIN[1], hair: 0x8a5a30, hat: 'bucket', hatC: 0x3a8a8a },
  // Горный город: горняк в каске с фонарём, пастушка коз в платке, горный звонарь в ушанке и другие.
  mine: { bg: 0x2a3048, body: 0x5a5e72, skin: SKIN[2], hair: 0x3a2a20, hat: 'helmet', hatC: 0xe8c040, extra: ['beard'] },
  forge: { bg: 0x4a2a20, body: 0x3a3a48, skin: SKIN[1], hair: 0x2a2020, hat: 'bandana', hatC: 0x6a4a3a, extra: ['apron', 'mustache'], extraC: 0x6a4428 },
  'cable-car': { bg: 0x2a3a5a, body: 0xc04040, skin: SKIN[0], hair: 0x6a4428, hat: 'peaked', hatC: 0xc04040, hatC2: GOLD },
  'crystal-cave': { bg: 0x1a2a4a, body: 0x6a5aa8, skin: SKIN[0], hair: 0xe8e8f8, hat: 'goggles', hatC: 0x4a3a5a, extra: ['strap'], extraC: 0x9ad6ff },
  'goat-farm': { bg: 0x3a4a3a, body: 0xa86a4a, skin: SKIN[1], hair: 0xe0b860, hat: 'scarf', hatC: 0xd04a3a, hatC2: WHITE },
  'bell-tower': { bg: 0x2a2a4a, body: 0x4a3a6a, skin: SKIN[0], hair: 0x9a9a9a, hat: 'ushanka', hatC: 0x6a4a3a, hatC2: 0xd8c8b0, extra: ['beard'] },
  'hot-springs': { bg: 0x2a4a5a, body: 0xe8e0d0, skin: SKIN[2], hair: 0x1a1418, hat: 'bun', hatC: 0x1a1418, hatC2: 0x8ae8f0 },
  'stone-bridge': { bg: 0x3a3a40, body: 0x7a7a8a, skin: SKIN[3], hair: 0x2a2020, hat: 'cap', hatC: 0x5a5a6a, extra: ['mustache'] },
  'star-temple': { bg: 0x1e1a3a, body: 0x8a6ac8, skin: SKIN[1], hair: 0xd8d8e0, hat: 'wizard', hatC: 0x3a2a6a, hatC2: 0xffe08a, extra: ['beard'] },
  'summit-beacon': { bg: 0x2a3a6a, body: 0x3a6ad0, skin: SKIN[0], hair: 0xb06a3a, hat: 'ushanka', hatC: 0x3a6ad0, hatC2: WHITE },
};
const DEFAULT_RESIDENT: Resident = { bg: 0x2a3050, body: 0x6a7aa8, skin: SKIN[1], hair: 0x5a3a24, hat: 'none', hatC: 0 };

/** Многоугольник внутри круга радиуса R (точки снаружи прижимаются к краю). */
function clampPoly(g: G, pts: Pt[], R: number) {
  g.fillPoints(
    pts.map(([x, y]) => {
      const d = Math.hypot(x, y);
      const k = d > R ? R / d : 1;
      return new V2(x * k, y * k);
    }),
    true,
  );
}

/** Маленький круглый портрет жителя постройки (для карточки задания), центр в (0, 0). */
export function drawResident(scene: Phaser.Scene, buildingId: string, size: number): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics();
  const P = RESIDENTS[buildingId] ?? DEFAULT_RESIDENT;
  const R = size / 2;
  const Ri = R * 0.94;
  const hy = -R * 0.12;
  const hr = R * 0.33;
  g.fillStyle(P.bg, 1);
  g.fillCircle(0, 0, R);
  g.fillStyle(0xffffff, 0.07);
  g.fillCircle(-R * 0.25, -R * 0.3, R * 0.6);
  // Капюшон — за головой
  if (P.hat === 'hood') {
    g.fillStyle(P.hatC, 1);
    g.fillCircle(0, hy - R * 0.02, hr * 1.38);
    clampPoly(g, [[-hr * 1.3, hy], [hr * 1.3, hy], [R * 0.7, R], [-R * 0.7, R]], Ri);
  }
  // Волосы сзади (длинные — у травницы и чайной)
  if (P.hat === 'bun' || P.hat === 'scarf' || P.hat === 'none' || P.hat === 'sunhat') {
    g.fillStyle(P.hat === 'scarf' ? P.hatC : P.hair, 1);
    g.fillRoundedRect(-hr * 1.1, hy - hr * 0.4, hr * 2.2, hr * 1.7, hr * 0.5);
  }
  // Тело и плечи
  const body: Pt[] = [];
  for (let i = 0; i <= 10; i++) {
    const a = Math.PI * 0.12 + (i / 10) * Math.PI * 0.76;
    body.push([Math.cos(a) * R * 1.05, Math.sin(a) * R * 1.05]);
  }
  for (let i = 0; i <= 12; i++) {
    const a = Math.PI + (i / 12) * Math.PI;
    body.push([Math.cos(a) * R * 0.74, R * 0.98 + Math.sin(a) * R * 0.66]);
  }
  g.fillStyle(P.body, 1);
  clampPoly(g, body, Ri);
  if (P.extra?.includes('apron')) {
    g.fillStyle(P.extraC ?? WHITE, 1);
    clampPoly(
      g,
      [
        [-R * 0.26, R * 0.42],
        [R * 0.26, R * 0.42],
        [R * 0.36, R],
        [-R * 0.36, R],
      ],
      Ri,
    );
  }
  if (P.extra?.includes('strap')) {
    g.lineStyle(R * 0.08, P.extraC ?? WOOD, 1);
    g.lineBetween(-R * 0.42, R * 0.38, R * 0.3, R * 0.88);
  }
  // Шея и голова
  g.fillStyle(P.skin, 1);
  g.fillRect(-hr * 0.35, hy + hr * 0.6, hr * 0.7, hr * 0.7);
  g.fillCircle(-hr * 0.98, hy + hr * 0.05, hr * 0.2);
  g.fillCircle(hr * 0.98, hy + hr * 0.05, hr * 0.2);
  g.fillCircle(0, hy, hr);
  // Чёлка
  if (P.hat !== 'hood' && P.hat !== 'scarf' && P.hat !== 'mushroom') {
    g.fillStyle(P.hair, 1);
    g.beginPath();
    g.arc(0, hy - hr * 0.05, hr * 1.02, Math.PI * 1.05, Math.PI * 1.95, false);
    g.closePath();
    g.fillPath();
  }
  // Лицо
  g.fillStyle(0x1a1a2e, 1);
  g.fillCircle(-hr * 0.36, hy + hr * 0.12, hr * 0.11);
  g.fillCircle(hr * 0.36, hy + hr * 0.12, hr * 0.11);
  g.fillStyle(0xff9e9e, 0.55);
  g.fillCircle(-hr * 0.6, hy + hr * 0.42, hr * 0.14);
  g.fillCircle(hr * 0.6, hy + hr * 0.42, hr * 0.14);
  g.lineStyle(Math.max(1.5, hr * 0.08), 0x6a3a2a, 1);
  g.beginPath();
  g.arc(0, hy + hr * 0.38, hr * 0.24, Math.PI * 0.15, Math.PI * 0.85, false);
  g.strokePath();
  if (P.extra?.includes('beard')) {
    g.fillStyle(P.hair, 1);
    g.beginPath();
    g.arc(0, hy + hr * 0.3, hr * 0.92, Math.PI * 0.02, Math.PI * 0.98, false);
    g.closePath();
    g.fillPath();
    g.fillStyle(P.skin, 1);
    g.fillEllipse(0, hy + hr * 0.48, hr * 0.5, hr * 0.2);
  }
  if (P.extra?.includes('mustache')) {
    g.fillStyle(P.hair, 1);
    g.fillEllipse(-hr * 0.2, hy + hr * 0.36, hr * 0.42, hr * 0.18);
    g.fillEllipse(hr * 0.2, hy + hr * 0.36, hr * 0.42, hr * 0.18);
  }
  if (P.extra?.includes('glasses')) {
    g.lineStyle(Math.max(1.5, hr * 0.07), GOLD_D, 1);
    g.strokeCircle(-hr * 0.36, hy + hr * 0.12, hr * 0.24);
    g.strokeCircle(hr * 0.36, hy + hr * 0.12, hr * 0.24);
    g.lineBetween(-hr * 0.12, hy + hr * 0.1, hr * 0.12, hy + hr * 0.1);
  }
  // Головной убор
  const top = hy - hr;
  const c2 = P.hatC2 ?? WHITE;
  switch (P.hat) {
    case 'cap':
      g.fillStyle(P.hatC, 1);
      g.beginPath();
      g.arc(0, hy - hr * 0.15, hr * 1.06, Math.PI, 0, false);
      g.closePath();
      g.fillPath();
      g.fillEllipse(hr * 0.55, hy - hr * 0.18, hr * 1.1, hr * 0.32);
      g.fillStyle(0x000000, 0.2);
      g.fillRect(-hr * 1.06, hy - hr * 0.24, hr * 2.12, hr * 0.1);
      break;
    case 'toque':
      g.fillStyle(P.hatC, 1);
      g.fillRect(-hr * 0.85, top - hr * 0.1, hr * 1.7, hr * 0.5);
      g.fillCircle(-hr * 0.55, top - hr * 0.45, hr * 0.5);
      g.fillCircle(hr * 0.55, top - hr * 0.45, hr * 0.5);
      g.fillCircle(0, top - hr * 0.7, hr * 0.6);
      g.lineStyle(1.5, 0xc8c0b0, 1);
      g.lineBetween(-hr * 0.85, top + hr * 0.2, hr * 0.85, top + hr * 0.2);
      break;
    case 'goggles':
      g.fillStyle(P.hair, 1);
      for (const x of [-0.6, -0.2, 0.2, 0.6]) g.fillTriangle(hr * (x - 0.25), top + hr * 0.3, hr * (x + 0.25), top + hr * 0.3, hr * (x + 0.05), top - hr * 0.3);
      g.fillStyle(P.hatC, 1);
      g.fillRect(-hr, top + hr * 0.42, hr * 2, hr * 0.18);
      for (const x of [-0.38, 0.38]) {
        g.fillStyle(GOLD_D, 1);
        g.fillCircle(hr * x, top + hr * 0.5, hr * 0.3);
        g.fillStyle(0x7ad0e0, 1);
        g.fillCircle(hr * x, top + hr * 0.5, hr * 0.2);
        g.fillStyle(0xffffff, 0.7);
        g.fillCircle(hr * (x - 0.07), top + hr * 0.43, hr * 0.06);
      }
      break;
    case 'straw':
    case 'sunhat': {
      const bw = P.hat === 'sunhat' ? hr * 3 : hr * 2.7;
      g.fillStyle(P.hatC, 1);
      g.fillEllipse(0, top + hr * 0.38, bw, hr * 0.5);
      g.beginPath();
      g.arc(0, top + hr * 0.36, hr * 0.78, Math.PI, 0, false);
      g.closePath();
      g.fillPath();
      g.fillStyle(c2, 1);
      g.fillRect(-hr * 0.78, top + hr * 0.12, hr * 1.56, hr * 0.2);
      if (P.hat === 'sunhat') {
        g.fillStyle(PINK, 1);
        g.fillCircle(hr * 0.7, top + hr * 0.12, hr * 0.2);
        g.fillStyle(WHITE, 1);
        g.fillCircle(hr * 0.42, top + hr * 0.18, hr * 0.15);
      }
      g.lineStyle(1, 0xb09040, 0.8);
      g.strokeEllipse(0, top + hr * 0.38, bw * 0.8, hr * 0.32);
      break;
    }
    case 'peaked':
      g.fillStyle(P.hatC, 1);
      g.fillRoundedRect(-hr * 0.98, top - hr * 0.42, hr * 1.96, hr * 0.78, hr * 0.25);
      g.fillStyle(0x000000, 0.35);
      g.fillEllipse(0, top + hr * 0.36, hr * 2.1, hr * 0.3);
      g.fillStyle(c2, 1);
      if (buildingId === 'owl-post') {
        g.fillRect(-hr * 0.22, top - hr * 0.18, hr * 0.44, hr * 0.3);
        g.lineStyle(1, P.hatC, 1);
        g.lineBetween(-hr * 0.22, top - hr * 0.18, 0, top - hr * 0.02);
        g.lineBetween(hr * 0.22, top - hr * 0.18, 0, top - hr * 0.02);
      } else g.fillCircle(0, top - hr * 0.05, hr * 0.17);
      break;
    case 'hood':
      g.lineStyle(hr * 0.12, 0x000000, 0.2);
      g.beginPath();
      g.arc(0, hy - R * 0.02, hr * 1.06, Math.PI * 0.9, Math.PI * 2.1, false);
      g.strokePath();
      break;
    case 'tophat':
      g.fillStyle(P.hatC, 1);
      g.fillEllipse(0, top + hr * 0.25, hr * 2.2, hr * 0.38);
      g.fillRect(-hr * 0.7, top - hr * 1.0, hr * 1.4, hr * 1.25);
      g.fillStyle(c2, 1);
      g.fillRect(-hr * 0.7, top - hr * 0.05, hr * 1.4, hr * 0.22);
      break;
    case 'wizard': {
      g.fillStyle(P.hatC, 1);
      const tip = Math.max(-Ri + 2, top - hr * 1.5);
      fp(g, [-hr * 1.05, top + hr * 0.3, hr * 1.05, top + hr * 0.3, hr * 0.4, tip + hr * 0.2, hr * 0.15, tip]);
      g.fillEllipse(0, top + hr * 0.3, hr * 2.6, hr * 0.42);
      g.fillStyle(c2, 1);
      if (buildingId === 'observatory') {
        g.fillCircle(-hr * 0.1, top - hr * 0.3, hr * 0.22);
        g.fillStyle(P.hatC, 1);
        g.fillCircle(hr * 0.02, top - hr * 0.38, hr * 0.18);
        g.fillStyle(c2, 1);
        star(g, hr * 0.4, top - hr * 0.7, hr * 0.12, hr * 0.05);
      } else star(g, hr * 0.15, tip + 2, hr * 0.2, hr * 0.09);
      break;
    }
    case 'beanie':
      g.fillStyle(P.hatC, 1);
      g.beginPath();
      g.arc(0, top + hr * 0.42, hr * 1.04, Math.PI, 0, false);
      g.closePath();
      g.fillPath();
      g.fillStyle(0x000000, 0.18);
      g.fillRect(-hr * 1.04, top + hr * 0.2, hr * 2.08, hr * 0.22);
      g.fillStyle(c2, 1);
      g.fillCircle(0, top - hr * 0.62, hr * 0.24);
      break;
    case 'scarf':
      g.fillStyle(P.hatC, 1);
      g.beginPath();
      g.arc(0, hy + hr * 0.05, hr * 1.12, Math.PI * 0.95, Math.PI * 2.05, false);
      g.closePath();
      g.fillPath();
      g.fillTriangle(hr * 0.8, hy + hr * 0.4, hr * 1.35, hy + hr * 0.75, hr * 1.0, hy + hr * 1.0);
      g.fillStyle(c2, 0.9);
      for (const [x, y] of [
        [-0.6, -0.5],
        [0, -0.8],
        [0.55, -0.45],
        [-0.25, -0.25],
        [0.3, -0.15],
      ] as const)
        g.fillCircle(hr * x, hy + hr * y, hr * 0.08);
      break;
    case 'mushroom':
      g.fillStyle(P.hatC, 1);
      g.beginPath();
      g.arc(0, top + hr * 0.5, hr * 1.5, Math.PI, 0, false);
      g.closePath();
      g.fillPath();
      g.fillStyle(c2, 1);
      for (const [x, y, r] of [
        [-0.7, 0.05, 0.22],
        [0.1, -0.5, 0.26],
        [0.8, 0.0, 0.18],
        [-0.15, 0.15, 0.12],
      ] as const)
        g.fillCircle(hr * x, top + hr * y, hr * r);
      break;
    case 'bun':
      g.fillStyle(P.hair, 1);
      g.fillCircle(0, top - hr * 0.15, hr * 0.42);
      g.lineStyle(Math.max(1.5, hr * 0.07), 0xc8a060, 1);
      g.lineBetween(-hr * 0.6, top - hr * 0.5, hr * 0.5, top + hr * 0.1);
      g.fillStyle(c2, 1);
      g.fillCircle(hr * 0.62, top + hr * 0.15, hr * 0.2);
      g.fillStyle(WHITE, 1);
      g.fillCircle(hr * 0.62, top + hr * 0.15, hr * 0.08);
      break;
    case 'feather':
      g.fillStyle(c2, 1);
      fp(g, [hr * 0.4, top - hr * 0.1, hr * 0.9, top - hr * 0.9, hr * 1.05, top - hr * 0.8, hr * 0.6, top + hr * 0.05]);
      g.fillStyle(P.hatC, 1);
      g.fillEllipse(0, top + hr * 0.32, hr * 2.4, hr * 0.38);
      fp(g, [-hr * 0.75, top + hr * 0.3, hr * 0.75, top + hr * 0.3, hr * 0.5, top - hr * 0.42, -hr * 0.5, top - hr * 0.42]);
      g.fillStyle(0x000000, 0.25);
      g.fillRect(-hr * 0.72, top + hr * 0.06, hr * 1.44, hr * 0.14);
      break;
    case 'bandana':
      g.fillStyle(P.hatC, 1);
      g.beginPath();
      g.arc(0, hy - hr * 0.12, hr * 1.04, Math.PI, 0, false);
      g.closePath();
      g.fillPath();
      g.fillTriangle(-hr * 0.9, hy - hr * 0.2, -hr * 1.5, hy + hr * 0.1, -hr * 1.3, hy - hr * 0.4);
      g.fillTriangle(-hr * 0.9, hy - hr * 0.2, -hr * 1.4, hy + hr * 0.4, -hr * 1.1, hy + hr * 0.3);
      g.fillStyle(WHITE, 0.8);
      g.fillCircle(-hr * 0.3, top + hr * 0.45, hr * 0.07);
      g.fillCircle(hr * 0.3, top + hr * 0.35, hr * 0.07);
      break;
    case 'bucket':
      g.fillStyle(P.hatC, 1);
      fp(g, [-hr * 1.4, top + hr * 0.62, hr * 1.4, top + hr * 0.62, hr * 0.95, top + hr * 0.2, -hr * 0.95, top + hr * 0.2]);
      fp(g, [-hr * 0.9, top + hr * 0.25, hr * 0.9, top + hr * 0.25, hr * 0.7, top - hr * 0.45, -hr * 0.7, top - hr * 0.45]);
      g.fillStyle(0x000000, 0.2);
      g.fillRect(-hr * 0.85, top + hr * 0.05, hr * 1.7, hr * 0.14);
      break;
    case 'helmet':
      // каска горняка с фонариком
      g.fillStyle(P.hatC, 1);
      g.beginPath();
      g.arc(0, top + hr * 0.62, hr * 1.08, Math.PI, 0, false);
      g.closePath();
      g.fillPath();
      g.fillRoundedRect(-hr * 1.3, top + hr * 0.5, hr * 2.6, hr * 0.24, hr * 0.1);
      g.fillStyle(0x000000, 0.2);
      g.fillRect(-hr * 0.08, top - hr * 0.42, hr * 0.16, hr * 0.92);
      g.fillStyle(IRON, 1);
      g.fillCircle(0, top + hr * 0.12, hr * 0.3);
      g.fillStyle(0xfff1a8, 1);
      g.fillCircle(0, top + hr * 0.12, hr * 0.2);
      break;
    case 'ushanka':
      // ушанка: меховой отворот и уши
      g.fillStyle(c2, 1);
      g.fillRoundedRect(-hr * 1.2, hy - hr * 0.35, hr * 0.42, hr * 0.95, hr * 0.18);
      g.fillRoundedRect(hr * 0.78, hy - hr * 0.35, hr * 0.42, hr * 0.95, hr * 0.18);
      g.fillStyle(P.hatC, 1);
      g.beginPath();
      g.arc(0, top + hr * 0.45, hr * 1.05, Math.PI, 0, false);
      g.closePath();
      g.fillPath();
      g.fillStyle(c2, 1);
      g.fillRoundedRect(-hr * 1.12, top + hr * 0.2, hr * 2.24, hr * 0.42, hr * 0.2);
      break;
    case 'none':
      break;
  }
  // Ободок
  g.lineStyle(Math.max(2, R * 0.07), TRIM, 1);
  g.strokeCircle(0, 0, R - Math.max(1, R * 0.035));
  return g;
}
