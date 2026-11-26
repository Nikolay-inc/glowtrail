// Украшения деревни, улицы, силуэты закрытых построек Горного города и портреты жителей.
// Всё — простые фигуры Phaser Graphics в тёплой вечерней палитре (украшения стоят только у восстановленной деревни).
// Координаты — от точки на земле посередине (y вверх отрицательный), как у построек в village.ts.

import Phaser from 'phaser';

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

export type DecorType = 'bench' | 'flowers' | 'lamp' | 'tree' | 'sign' | 'cart' | 'statue' | 'birdhouse';
export const DECOR_TYPES: readonly DecorType[] = ['bench', 'flowers', 'lamp', 'tree', 'sign', 'cart', 'statue', 'birdhouse'];

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

/**
 * Улица по точкам (сглаживается сплайном): 0 — тропинка, 1 — гравий, 2 — брусчатка, 3 — мощёная с бордюром и фонарями.
 * Возвращает точки, где у шага 3 стоят фонари (голова фонаря — для света).
 */
export function drawStreet(g: Phaser.GameObjects.Graphics, points: Phaser.Math.Vector2[], step: 0 | 1 | 2 | 3, width = 44): { lamps: { x: number; y: number }[] } {
  const hw = width / 2;
  const lamps: { x: number; y: number }[] = [];
  if (points.length < 2) return { lamps };
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
export function streetSample(scene: Phaser.Scene, step: 0 | 1 | 2 | 3, w: number, h: number): Phaser.GameObjects.Container {
  const c = scene.add.container(0, 0);
  const g = scene.add.graphics();
  g.fillStyle(0x24362a, 1);
  g.fillRoundedRect(-w / 2, -h / 2, w, h, Math.min(24, h * 0.15));
  g.fillStyle(0x2e4432, 1);
  for (let i = 0; i < 18; i++) g.fillEllipse(-w / 2 + 14 + rnd(i, 40) * (w - 28), -h / 2 + 10 + rnd(i, 41) * (h - 20), 16, 6);
  const sw = Math.min(44, h * 0.32);
  const pts = [new V2(-w / 2 + 6, h * 0.22), new V2(-w / 6, -h * 0.02), new V2(w / 6, h * 0.12), new V2(w / 2 - 6, -h * 0.08)];
  const { lamps } = drawStreet(g, pts, step, sw);
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
// Силуэты закрытых построек Горного города

export interface SilhouetteView {
  objects: Phaser.GameObjects.GameObject[];
  height: number;
  width: number;
}

type Shape = ['p', number[]] | ['c', number, number, number] | ['r', number, number, number, number] | ['e', number, number, number, number];

const SIL_FILL = 0x0a0d1c;
const SIL_LINE = 0x7a9ad0;

/** Решётчатая мачта: основание (x, ширина), верх (ширина, высота) — детали-раскосы. */
function lattice(x: number, wb: number, wt: number, h: number, y0 = 0): { shapes: Shape[]; lines: Pt[][] } {
  const shapes: Shape[] = [
    ['p', [x - wb / 2 - 4, y0, x - wb / 2 + 4, y0, x - wt / 2 + 3, y0 - h, x - wt / 2 - 3, y0 - h]],
    ['p', [x + wb / 2 - 4, y0, x + wb / 2 + 4, y0, x + wt / 2 + 3, y0 - h, x + wt / 2 - 3, y0 - h]],
  ];
  const lines: Pt[][] = [];
  const n = 4;
  for (let i = 0; i < n; i++) {
    const t0 = i / n;
    const t1 = (i + 1) / n;
    const w0 = (wb + (wt - wb) * t0) / 2;
    const w1 = (wb + (wt - wb) * t1) / 2;
    lines.push([
      [x - w0, y0 - h * t0],
      [x + w1, y0 - h * t1],
    ]);
    lines.push([
      [x + w0, y0 - h * t0],
      [x - w1, y0 - h * t1],
    ]);
    shapes.push(['r', x - w1, y0 - h * t1 - 2, w1 * 2, 4]);
  }
  return { shapes, lines };
}

function silhouetteShapes(kind: number): { shapes: Shape[]; lines: Pt[][]; w: number; h: number } {
  switch (kind) {
    case 0: {
      // Шахта: холм со входом в штольню, копёр с колесом, вагонетка на рельсах
      const hill: number[] = [];
      for (let i = 0; i <= 16; i++) {
        const a = Math.PI + (i / 16) * Math.PI;
        hill.push(Math.cos(a) * 130, Math.sin(a) * 110 * (1 + 0.08 * Math.sin(i * 1.7)));
      }
      const tower = lattice(70, 56, 18, 150, -60);
      return {
        shapes: [['p', hill], ...tower.shapes, ['c', 70, -214, 20], ['p', [-112, -4, -72, -4, -76, -28, -108, -28]], ['c', -102, -4, 6], ['c', -82, -4, 6]],
        lines: [
          ...tower.lines,
          [
            [-46, 0],
            [-46, -60],
            [6, -60],
            [6, 0],
          ],
          [
            [-54, -60],
            [14, -60],
          ],
          [
            [-150, 2],
            [-30, 2],
          ],
          [
            [70, -214],
            [40, -60],
          ],
        ],
        w: 280,
        h: 236,
      };
    }
    case 1:
      // Кузница: дом с высокой трубой, наковальня
      return {
        shapes: [
          ['r', -100, -100, 160, 100],
          ['p', [-116, -96, 76, -96, 50, -150, -90, -150]],
          ['p', [12, -150, 46, -150, 42, -230, 16, -230]],
          ['r', 8, -246, 42, 16],
          ['p', [86, 0, 120, 0, 112, -14, 128, -28, 132, -40, 76, -40, 92, -28, 94, -14]],
          ['p', [76, -40, 70, -36, 60, -38, 76, -46]],
        ],
        lines: [
          [
            [-60, 0],
            [-60, -60],
            [-20, -60],
            [-20, 0],
          ],
          [
            [-90, -70],
            [-76, -70],
            [-76, -50],
            [-90, -50],
          ],
          [
            [26, -250],
            [20, -270],
            [30, -290],
          ],
          [
            [104, -54],
            [98, -66],
          ],
          [
            [116, -50],
            [124, -62],
          ],
        ],
        w: 260,
        h: 260,
      };
    case 2: {
      // Канатная дорога: станция, мачта, трос и кабинка
      const tower = lattice(110, 50, 14, 200);
      return {
        shapes: [
          ['r', -160, -80, 74, 80],
          ['p', [-172, -76, -74, -76, -123, -118]],
          ...tower.shapes,
          ['r', 84, -208, 52, 8],
          ['p', [-8, -112, 40, -112, 44, -84, -12, -84]],
          ['r', -6, -128, 40, 16],
        ],
        lines: [
          [
            [-100, -96],
            [110, -206],
            [170, -190],
          ],
          [
            [16, -128],
            [16, -150],
          ],
          [
            [0, -108],
            [0, -96],
          ],
          [
            [30, -108],
            [30, -96],
          ],
          ...tower.lines,
        ],
        w: 330,
        h: 210,
      };
    }
    case 3: {
      // Хрустальная пещера: скала с гротом и кристаллы
      const crystal = (x: number, y: number, w: number, h: number, a: number): Shape => {
        const c = Math.cos(a);
        const s = Math.sin(a);
        const pt = (u: number, v: number) => [x + u * c - v * s, y + u * s + v * c];
        return ['p', [...pt(-w / 2, 0), ...pt(-w / 2, -h * 0.75), ...pt(0, -h), ...pt(w / 2, -h * 0.75), ...pt(w / 2, 0)]];
      };
      return {
        shapes: [
          ['p', [-140, 0, -120, -50, -90, -80, -50, -96, -10, -90, 30, -110, 70, -92, 110, -60, 140, 0]],
          crystal(-40, -84, 22, 80, -0.25),
          crystal(-10, -88, 28, 120, 0.05),
          crystal(26, -100, 20, 76, 0.35),
          crystal(84, -60, 18, 60, 0.6),
          crystal(-96, -64, 16, 52, -0.55),
        ],
        lines: [
          [
            [-40, 0],
            [-36, -36],
            [-10, -54],
            [16, -36],
            [20, 0],
          ],
          [
            [-10, -88],
            [-8, -200],
          ],
        ],
        w: 290,
        h: 210,
      };
    }
    case 4:
      // Козья ферма: амбар с ломаной крышей, забор и коза
      return {
        shapes: [
          ['p', [-50, 0, -50, -84, -34, -124, 30, -146, 94, -124, 110, -84, 110, 0]],
          ['r', 120, -40, 8, 40],
          ['r', 160, -40, 8, 40],
          ['r', 116, -34, 56, 5],
          ['r', 116, -18, 56, 5],
          ['e', -110, -38, 56, 30],
          ['p', [-86, -44, -70, -66, -60, -64, -66, -40]],
          ['e', -64, -66, 18, 14],
          ['p', [-68, -72, -76, -92, -84, -96, -72, -76]],
          ['p', [-62, -72, -62, -94, -68, -100, -66, -74]],
          ['p', [-60, -60, -54, -48, -58, -46]],
          ['r', -132, -26, 6, 26],
          ['r', -118, -26, 6, 26],
          ['r', -100, -26, 6, 26],
          ['r', -88, -26, 6, 26],
          ['p', [-138, -44, -148, -52, -140, -38]],
        ],
        lines: [
          [
            [10, 0],
            [10, -60],
            [50, -60],
            [50, 0],
          ],
          [
            [10, -60],
            [50, 0],
          ],
          [
            [50, -60],
            [10, 0],
          ],
          [
            [20, -100],
            [40, -100],
            [40, -84],
            [20, -84],
          ],
        ],
        w: 330,
        h: 150,
      };
    case 5:
      // Колокольня: башня, открытый ярус с колоколом, шпиль
      return {
        shapes: [
          ['r', -56, -20, 112, 20],
          ['r', -42, -230, 84, 212],
          ['r', -50, -240, 100, 12],
          ['p', [-50, -240, 50, -240, 0, -330]],
          ['r', -2, -352, 4, 24],
          ['r', -10, -344, 20, 4],
        ],
        lines: [
          [
            [-24, -150],
            [-24, -196],
            [-12, -210],
            [12, -210],
            [24, -196],
            [24, -150],
            [-24, -150],
          ],
          [
            [-12, -164],
            [-8, -190],
            [8, -190],
            [12, -164],
            [-12, -164],
          ],
          [
            [-12, -20],
            [-12, -60],
            [0, -70],
            [12, -60],
            [12, -20],
          ],
          [
            [-8, -110],
            [8, -110],
            [8, -126],
            [-8, -126],
            [-8, -110],
          ],
        ],
        w: 120,
        h: 354,
      };
    case 6:
      // Горячие источники: купальня, камни вокруг пруда, пар
      return {
        shapes: [
          ['e', 30, -10, 220, 36],
          ['e', -76, -18, 40, 26],
          ['e', -40, -4, 32, 18],
          ['e', 120, -20, 44, 30],
          ['e', 90, 0, 34, 16],
          ['r', -170, -70, 76, 70],
          ['p', [-190, -64, -178, -74, -86, -74, -74, -64, -100, -96, -164, -96]],
          ['r', -136, -110, 8, 16],
        ],
        lines: [
          [
            [0, -36],
            [-8, -60],
            [4, -84],
            [-6, -110],
          ],
          [
            [36, -32],
            [44, -58],
            [34, -82],
            [42, -110],
            [36, -130],
          ],
          [
            [74, -34],
            [66, -56],
            [76, -80],
          ],
          [
            [-148, 0],
            [-148, -44],
            [-116, -44],
            [-116, 0],
          ],
        ],
        w: 330,
        h: 132,
      };
    case 7: {
      // Каменный мост: две арки, перила
      const pts: number[] = [-180, 0, -168, -70, 168, -70, 180, 0, 140, 0];
      for (let i = 0; i <= 10; i++) {
        const a = (i / 10) * Math.PI;
        pts.push(85 + Math.cos(a) * 55, -Math.sin(a) * 50);
      }
      pts.push(-30, 0);
      for (let i = 0; i <= 10; i++) {
        const a = (i / 10) * Math.PI;
        pts.push(-85 + Math.cos(a) * 55, -Math.sin(a) * 50);
      }
      const posts: Shape[] = [];
      for (let x = -160; x <= 160; x += 40) posts.push(['r', x - 4, -96, 8, 28]);
      return {
        shapes: [['p', pts], ['r', -172, -100, 344, 8], ...posts, ['p', [-10, 0, 10, 0, 10, -54, 0, -64, -10, -54]]],
        lines: [
          [
            [-168, -60],
            [168, -60],
          ],
          [
            [-120, 10],
            [-60, 10],
          ],
          [
            [50, 10],
            [120, 10],
          ],
        ],
        w: 360,
        h: 100,
      };
    }
    case 8: {
      // Звёздный храм: ступени, колонны, купол, звезда
      const starPts: number[] = [];
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const r = i % 2 ? 9 : 22;
        starPts.push(Math.cos(a) * r, -246 + Math.sin(a) * r);
      }
      const dome: number[] = [];
      for (let i = 0; i <= 14; i++) {
        const a = Math.PI + (i / 14) * Math.PI;
        dome.push(Math.cos(a) * 70, -150 + Math.sin(a) * 66);
      }
      return {
        shapes: [
          ['r', -130, -14, 260, 14],
          ['r', -116, -28, 232, 14],
          ['r', -102, -40, 204, 12],
          ['r', -92, -136, 14, 96],
          ['r', -44, -136, 14, 96],
          ['r', 30, -136, 14, 96],
          ['r', 78, -136, 14, 96],
          ['r', -104, -152, 208, 18],
          ['p', dome],
          ['r', -3, -226, 6, 12],
          ['p', starPts],
        ],
        lines: [
          [
            [-104, -144],
            [104, -144],
          ],
          [
            [-14, -40],
            [-14, -110],
            [0, -122],
            [14, -110],
            [14, -40],
          ],
        ],
        w: 260,
        h: 270,
      };
    }
    default: {
      // Маяк на вершине: скала-пик и маяк
      return {
        shapes: [
          ['p', [-150, 0, -110, -40, -84, -36, -50, -90, -30, -86, 0, -140, 30, -120, 56, -96, 80, -70, 104, -60, 150, 0]],
          ['p', [-18, -136, 18, -136, 12, -262, -12, -262]],
          ['r', -22, -270, 44, 8],
          ['r', -12, -296, 24, 26],
          ['p', [-16, -296, 16, -296, 0, -320]],
        ],
        lines: [
          [
            [-50, -90],
            [-36, -70],
            [-24, -78],
            [0, -110],
            [20, -96],
            [30, -110],
          ],
          [
            [-12, -282],
            [12, -282],
          ],
          [
            [-60, -308],
            [-24, -290],
          ],
          [
            [60, -308],
            [24, -290],
          ],
        ],
        w: 300,
        h: 322,
      };
    }
  }
}

/** Силуэт закрытой постройки «скоро» (Горный город, kind 0..9): один тёмный цвет и тонкий холодный контур. */
export function drawSilhouette(scene: Phaser.Scene, kind: number): SilhouetteView {
  const g = scene.add.graphics();
  const { shapes, lines, w, h } = silhouetteShapes(((Math.round(kind) % 10) + 10) % 10);
  const draw = (fill: boolean) => {
    for (const s of shapes) {
      switch (s[0]) {
        case 'p': {
          const pts: Phaser.Math.Vector2[] = [];
          for (let i = 0; i < s[1].length; i += 2) pts.push(new V2(s[1][i], s[1][i + 1]));
          if (fill) g.fillPoints(pts, true);
          else g.strokePoints(pts, true);
          break;
        }
        case 'c':
          if (fill) g.fillCircle(s[1], s[2], s[3]);
          else g.strokeCircle(s[1], s[2], s[3]);
          break;
        case 'r':
          if (fill) g.fillRect(s[1], s[2], s[3], s[4]);
          else g.strokeRect(s[1], s[2], s[3], s[4]);
          break;
        case 'e':
          if (fill) g.fillEllipse(s[1], s[2], s[3], s[4]);
          else g.strokeEllipse(s[1], s[2], s[3], s[4]);
          break;
      }
    }
  };
  // Сначала толстый контур всех фигур, затем заливка поверх — снаружи остаётся тонкая кромка.
  g.lineStyle(5, SIL_LINE, 0.55);
  draw(false);
  g.fillStyle(SIL_FILL, 1);
  draw(true);
  g.lineStyle(2, SIL_LINE, 0.4);
  for (const l of lines) sp(g, l);
  return { objects: [g], height: h, width: w };
}

// ---------------------------------------------------------------------------
// Портреты жителей

type Hat = 'cap' | 'toque' | 'goggles' | 'straw' | 'peaked' | 'sunhat' | 'hood' | 'tophat' | 'wizard' | 'beanie' | 'scarf' | 'mushroom' | 'bun' | 'feather' | 'bandana' | 'bucket' | 'none';
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
    case 'none':
      break;
  }
  // Ободок
  g.lineStyle(Math.max(2, R * 0.07), TRIM, 1);
  g.strokeCircle(0, 0, R - Math.max(1, R * 0.035));
  return g;
}
