// Постройки деревни (простые фигуры, без картинок). Каждая узнаётся по силуэту.
// До восстановления (уровень 0) — тёмные и обветшалые (покосившиеся ставни, дыры в черепице, сломанный штакетник,
// у лесных — мох, паутина, поваленные доски); после — тёплые цвета, свет в окнах, фонари у входа.
// Уровни постройки: 1 — восстановлена, 2 — улучшена (вывеска, ещё окна со светом, цветочные ящики, второй фонарь),
// 3 — расцвет (пристройка сбоку, гирлянда огоньков, флажок или флюгер, золотая отделка).
// Дым, жители и свечение добавляет VillageScene по полям BuildingView.
// Постройки Горного города (камень, снег на крышах, сосульки) — в villageMountain.ts.
// Украшения, улицы и портреты жителей — в villageDecor.ts (реэкспорт ниже).

import Phaser from 'phaser';
import { mountain, mountainExt, type MountainExt } from './villageMountain';

export { DECOR_TYPES, decorIcon, drawDecor, drawResident, drawStreet, streetSample, type DecorType, type DecorView, type StreetStyle } from './villageDecor';

export type G = Phaser.GameObjects.Graphics;
export type Pt = [number, number];
const V2 = Phaser.Math.Vector2;

/** Точка света: окно, фонарь, огонёк гирлянды. `c` — цвет света (по умолчанию тёплый). */
export interface Light {
  x: number;
  y: number;
  r: number;
  c?: number;
}

export interface BuildingView {
  /** Слои постройки (координаты — от точки на земле посередине). */
  objects: Phaser.GameObjects.GameObject[];
  /** Высота над землёй (для подписей и плашки), с надстройками и флажком. */
  height: number;
  /** Ширина по земле (для раскладки); постройка отцентрована по ней. */
  width: number;
  /** Окна и фонари: где зажечь свет. */
  lights: Light[];
  /** Трубы — откуда идёт дым. */
  chimneys: { x: number; y: number }[];
  /** Сколько жителей-силуэтов поставить рядом (0 у заброшенной). */
  residents: number;
  /** Лопасти мельницы / водяное колесо — крутятся, когда постройка восстановлена. */
  rotor?: Phaser.GameObjects.Graphics;
  /** Радиус лопастей / колеса (для раскладки: чтобы ничто не попадало под лопасти). */
  rotorR?: number;
  /** Где луч маяка. */
  beam?: { x: number; y: number };
}

/** Постройки долины (по порядку восстановления), лесного квартала и Горного города. */
export const VALLEY_BUILDINGS = ['well', 'bakery', 'workshop', 'mill', 'bridge', 'garden', 'chapel', 'square', 'lumo', 'lighthouse'] as const;
export const FOREST_BUILDINGS = ['herbalist', 'observatory', 'owl-post', 'mushroom-farm', 'sawmill', 'lamp-workshop', 'teahouse', 'forester', 'swing-bridge', 'glow-lake'] as const;
export const MOUNTAIN_BUILDINGS = ['mine', 'forge', 'cable-car', 'crystal-cave', 'goat-farm', 'bell-tower', 'hot-springs', 'stone-bridge', 'star-temple', 'summit-beacon'] as const;
const FOREST = new Set<string>(FOREST_BUILDINGS);
const MOUNTAIN = new Set<string>(MOUNTAIN_BUILDINGS);

export const GOLD = 0xe8c25a;
export const GOLD_DARK = 0xb08a2e;
export const IRON = 0x1a1626;
const TEAL = 0x6ae6d8;
/** Холодный свет Горного города (лёд, кристаллы). */
export const ICE = 0x9ad6ff;
const FIREFLY = 0xd8ff7a;

export interface Pal {
  wall: number;
  wallDark: number;
  roof: number;
  roofDark: number;
  wood: number;
  woodDark: number;
  stone: number;
  stoneDark: number;
  window: number;
  trim: number;
  leaf: number;
  leafDark: number;
  /** Мох / трава. */
  moss: number;
  /** Свет фонарей у входа (в лесу — бирюзовый). */
  lamp: number;
  /** Акцент: в лесу светящийся бирюзовый. */
  accent: number;
  forest: boolean;
  /** Горный город: снег на крышах, сосульки, гирлянды с холодными огоньками. */
  mountain?: boolean;
  lit: boolean;
}

/** Палитра долины: тёмная (до) и тёплая (после). */
function pal(lit: boolean): Pal {
  return lit
    ? { wall: 0x7a5f6e, wallDark: 0x5e4858, roof: 0x9a4a3e, roofDark: 0x6e3028, wood: 0x7a5236, woodDark: 0x5a3a24, stone: 0x8a8494, stoneDark: 0x5e5a6a, window: 0xffd36b, trim: 0xe8d2a8, leaf: 0x3e7a4a, leafDark: 0x2a5a36, moss: 0x4e8a4a, lamp: 0xffd36b, accent: 0xffd36b, forest: false, lit }
    : { wall: 0x262a44, wallDark: 0x1c1f36, roof: 0x1e2038, roofDark: 0x151730, wood: 0x2a2236, woodDark: 0x1e1828, stone: 0x2e3048, stoneDark: 0x22243a, window: 0x0d1024, trim: 0x3a3a54, leaf: 0x1a2a26, leafDark: 0x13201c, moss: 0x1a2a26, lamp: 0x0d1024, accent: 0x2a2c44, forest: false, lit };
}

/** Лесная палитра: тёмное дерево, мох, зелёные крыши, бирюзовые огни. До восстановления — тёмная, заросшая. */
function forestPal(lit: boolean): Pal {
  return lit
    ? { wall: 0x6b5241, wallDark: 0x4c3a2e, roof: 0x3f7350, roofDark: 0x2b5239, wood: 0x6e4a30, woodDark: 0x45301f, stone: 0x75817c, stoneDark: 0x4c5753, window: 0xffd36b, trim: 0xcfc19a, leaf: 0x3f7a48, leafDark: 0x27512f, moss: 0x5f9a48, lamp: 0x8af4e6, accent: TEAL, forest: true, lit }
    : { wall: 0x1f2430, wallDark: 0x171b26, roof: 0x17231f, roofDark: 0x101915, wood: 0x221f2b, woodDark: 0x18161f, stone: 0x262c37, stoneDark: 0x1b2029, window: 0x0d1024, trim: 0x30364a, leaf: 0x15221b, leafDark: 0x0f1813, moss: 0x1b2a21, lamp: 0x0d1024, accent: 0x1c2836, forest: true, lit };
}

/** Горная палитра: серо-голубой камень, тёмная черепица под снегом, тёплые окна. До восстановления — холодная, тёмная. */
function mountainPal(lit: boolean): Pal {
  return lit
    ? { wall: 0x8a8ea4, wallDark: 0x62667e, roof: 0x5a3a48, roofDark: 0x3e2632, wood: 0x7a5236, woodDark: 0x4e3424, stone: 0x9a9eb2, stoneDark: 0x6a6e86, window: 0xffd36b, trim: 0xece4d4, leaf: 0x2f5a4a, leafDark: 0x1f4034, moss: 0xeef4ff, lamp: 0xffd36b, accent: ICE, forest: false, mountain: true, lit }
    : { wall: 0x272c44, wallDark: 0x1d2136, roof: 0x1e2034, roofDark: 0x15172a, wood: 0x2a2236, woodDark: 0x1e1828, stone: 0x2e3350, stoneDark: 0x22263c, window: 0x0d1024, trim: 0x3a3e58, leaf: 0x172426, leafDark: 0x101a1c, moss: 0x8a96b8, lamp: 0x0d1024, accent: 0x2a2c44, forest: false, mountain: true, lit };
}

// ---------------------------------------------------------------------------
// Мелкие помощники

/** Залитый многоугольник из плоского списка координат. */
export function fp(g: G, a: number[]) {
  const pts: Phaser.Math.Vector2[] = [];
  for (let i = 0; i < a.length; i += 2) pts.push(new V2(a[i], a[i + 1]));
  g.fillPoints(pts, true);
}

/** Ломаная из точек. */
export function sp(g: G, pts: Pt[], closed = false) {
  g.strokePoints(
    pts.map(([x, y]) => new V2(x, y)),
    closed,
  );
}

/** Повёрнутый прямоугольник (доска, бревно): центр, длина, толщина, угол. */
export function plank(g: G, x: number, y: number, len: number, w: number, ang: number) {
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  const hx = (len / 2) * c;
  const hy = (len / 2) * s;
  const nx = (-w / 2) * s;
  const ny = (w / 2) * c;
  fp(g, [x - hx + nx, y - hy + ny, x + hx + nx, y + hy + ny, x + hx - nx, y + hy - ny, x - hx - nx, y - hy - ny]);
}

/** Точки на эллипсе от угла a0 до a1 (радианы, y вниз). */
export function arcPts(cx: number, cy: number, rx: number, ry: number, a0: number, a1: number, n: number): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    out.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);
  }
  return out;
}

/** Края двускатной крыши roof(): левый свес, конёк, правый свес. */
export function roofEdge(x: number, y: number, w: number, h: number): Pt[] {
  return [
    [x - w / 2 - 16, y],
    [x, y - h],
    [x + w / 2 + 16, y],
  ];
}

/** Тень на земле. */
export function shadow(g: G, w: number) {
  g.fillStyle(0x000000, 0.35);
  g.fillEllipse(0, 6, w, 26);
}

/** Двускатная черепичная крыша: ряды черепицы, у тёмной — пара дыр, у лесной — пятна мха. */
function roof(g: G, x: number, y: number, w: number, h: number, p: Pal, lit: boolean) {
  g.fillStyle(p.roof, 1);
  g.fillTriangle(x - w / 2 - 16, y, x + w / 2 + 16, y, x, y - h);
  g.lineStyle(3, p.roofDark, 1);
  for (let i = 1; i < 4; i++) {
    const yy = y - (h * i) / 4;
    const half = (w / 2 + 16) * (1 - i / 4);
    g.lineBetween(x - half, yy, x + half, yy);
  }
  if (p.forest) {
    g.fillStyle(p.moss, lit ? 0.9 : 0.8);
    for (const [fx, fy, r] of [
      [-0.3, 0.2, 9],
      [0.25, 0.35, 7],
      [-0.1, 0.55, 6],
    ] as const) {
      g.fillCircle(x + fx * w, y - fy * h, r);
      g.fillCircle(x + fx * w + r, y - fy * h + 2, r * 0.7);
    }
  }
  if (!lit) {
    g.fillStyle(0x0a0b18, 1);
    g.fillTriangle(x + w * 0.12, y - h * 0.3, x + w * 0.22, y - h * 0.3, x + w * 0.17, y - h * 0.45);
  }
}

/** Окно с наличником и ставнями (у тёмной постройки одна ставня покосилась). */
export function windowAt(g: G, v: BuildingView, x: number, y: number, w: number, h: number, p: Pal, lit: boolean, shutters = true) {
  g.fillStyle(p.trim, 1);
  g.fillRect(x - w / 2 - 4, y - h / 2 - 4, w + 8, h + 8);
  g.fillStyle(p.window, 1);
  g.fillRect(x - w / 2, y - h / 2, w, h);
  g.lineStyle(2, p.trim, 1);
  g.lineBetween(x, y - h / 2, x, y + h / 2);
  g.lineBetween(x - w / 2, y, x + w / 2, y);
  if (shutters) {
    g.fillStyle(p.wood, 1);
    g.fillRect(x - w / 2 - 14, y - h / 2, 9, h);
    if (lit) g.fillRect(x + w / 2 + 5, y - h / 2, 9, h);
    else g.fillPoints([new V2(x + w / 2 + 5, y - h / 2 + 4), new V2(x + w / 2 + 14, y - h / 2 + 8), new V2(x + w / 2 + 12, y + h / 2 + 6), new V2(x + w / 2 + 3, y + h / 2 + 2)], true);
  }
  v.lights.push({ x, y, r: Math.max(w, h) });
}

/** Круглое окно (дупло, иллюминатор) с крестом рамы. */
export function roundWindow(g: G, v: BuildingView, x: number, y: number, r: number, p: Pal, cross = true) {
  g.fillStyle(p.trim, 1);
  g.fillCircle(x, y, r + 4);
  g.fillStyle(p.window, 1);
  g.fillCircle(x, y, r);
  if (cross) {
    g.lineStyle(2, p.trim, 1);
    g.lineBetween(x - r, y, x + r, y);
    g.lineBetween(x, y - r, x, y + r);
  }
  v.lights.push({ x, y, r: r + 2 });
}

export function door(g: G, x: number, y: number, w: number, h: number, p: Pal, round = false) {
  g.fillStyle(p.woodDark, 1);
  if (round) {
    g.fillRect(x - w / 2, y - h + w / 2, w, h - w / 2);
    g.fillCircle(x, y - h + w / 2, w / 2);
  } else g.fillRect(x - w / 2, y - h, w, h);
  g.fillStyle(p.trim, 1);
  g.fillCircle(x + w * 0.28, y - h * 0.45, 3);
}

/** Фонарь на столбе у входа (в лесу свет бирюзовый). */
export function lampPost(g: G, v: BuildingView, x: number, y: number, h: number, p: Pal) {
  g.fillStyle(IRON, 1);
  g.fillRect(x - 3, y - h, 6, h);
  g.fillStyle(p.lamp, 1);
  g.fillRoundedRect(x - 9, y - h - 18, 18, 20, 4);
  g.fillStyle(IRON, 1);
  g.fillTriangle(x - 12, y - h - 18, x + 12, y - h - 18, x, y - h - 28);
  v.lights.push({ x, y: y - h - 8, r: 16, ...(p.forest && p.lit ? { c: TEAL } : {}) });
}

/** Висячий фонарик на шнурке: x, y — точка подвеса. */
export function hangLantern(g: G, v: BuildingView, x: number, y: number, len: number, color: number, lit: boolean, round = false) {
  g.lineStyle(2, IRON, 1);
  g.lineBetween(x, y, x, y + len);
  const cy = y + len + 9;
  g.fillStyle(lit ? color : 0x1e2030, 1);
  if (round) g.fillEllipse(x, cy, 16, 20);
  else g.fillRoundedRect(x - 7, cy - 9, 14, 18, 3);
  g.fillStyle(IRON, 1);
  g.fillRect(x - 5, cy - 12, 10, 4);
  if (lit) v.lights.push({ x, y: cy, r: 12, c: color });
}

/** Штакетник (у тёмной постройки — сломанные доски). */
export function fence(g: G, x0: number, x1: number, y: number, p: Pal, lit: boolean) {
  g.fillStyle(p.wood, 1);
  g.fillRect(x0, y - 22, x1 - x0, 5);
  let i = 0;
  for (let x = x0; x <= x1; x += 14, i++) {
    if (!lit && i % 4 === 2) continue;
    const tilt = !lit && i % 5 === 3 ? 6 : 0;
    g.fillPoints([new V2(x - 3, y), new V2(x + 3, y), new V2(x + 3 + tilt, y - 30), new V2(x + tilt, y - 36), new V2(x - 3 + tilt, y - 30)], true);
  }
}

export function chimney(g: G, v: BuildingView, x: number, y: number, h: number, p: Pal) {
  g.fillStyle(p.stoneDark, 1);
  g.fillRect(x - 11, y - h, 22, h);
  g.fillStyle(p.stone, 1);
  g.fillRect(x - 14, y - h - 6, 28, 8);
  v.chimneys.push({ x, y: y - h - 8 });
}

/** Паутина в углу: x, y — угол, dir — куда раскрывается (знаки по x и y). */
function cobweb(g: G, x: number, y: number, r: number, dx: 1 | -1 = 1, dy: 1 | -1 = 1) {
  g.lineStyle(1.5, 0xc8d0e8, 0.35);
  const n = 4;
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * (Math.PI / 2);
    g.lineBetween(x, y, x + dx * Math.cos(a) * r, y + dy * Math.sin(a) * r);
  }
  for (const k of [0.35, 0.65, 0.95]) {
    const pts: Pt[] = [];
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * (Math.PI / 2);
      const rr = r * k * (i % 2 ? 0.88 : 1);
      pts.push([x + dx * Math.cos(a) * rr, y + dy * Math.sin(a) * rr]);
    }
    sp(g, pts);
  }
}

/** Лоза / мох по ломаной (заросшая постройка или мшистая отделка). */
function vines(g: G, pts: Pt[], color: number, size = 6) {
  g.lineStyle(2, color, 1);
  sp(g, pts);
  g.fillStyle(color, 1);
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[i + 1];
    const n = Math.max(1, Math.round(Math.hypot(x1 - x0, y1 - y0) / 14));
    for (let k = 0; k < n; k++) {
      const t = k / n;
      const side = (i + k) % 2 ? 1 : -1;
      g.fillCircle(x0 + (x1 - x0) * t + side * 4, y0 + (y1 - y0) * t, size * (k % 3 ? 0.7 : 1));
    }
  }
}

/** Маленький гриб; у восстановленной — светится бирюзой. */
function mushroom(g: G, v: BuildingView, x: number, y: number, s: number, p: Pal, glow: boolean) {
  g.fillStyle(p.lit ? 0xe8dcc0 : 0x2a2a38, 1);
  g.fillRect(x - 3 * s, y - 12 * s, 6 * s, 12 * s);
  g.fillStyle(p.lit ? (glow ? TEAL : 0xc2463a) : 0x2a1e2c, 1);
  g.beginPath();
  g.arc(x, y - 11 * s, 10 * s, Math.PI, 0, false);
  g.closePath();
  g.fillPath();
  g.fillStyle(p.lit ? 0xf4ecd8 : 0x3a3446, 0.9);
  g.fillCircle(x - 4 * s, y - 15 * s, 1.8 * s);
  g.fillCircle(x + 3 * s, y - 17 * s, 1.4 * s);
  if (glow && p.lit) v.lights.push({ x, y: y - 14 * s, r: 9 * s, c: TEAL });
}

/** Торец бревна с кольцами. */
export function logEnd(g: G, x: number, y: number, r: number, p: Pal) {
  g.fillStyle(p.woodDark, 1);
  g.fillCircle(x, y, r);
  g.fillStyle(p.lit ? 0xc9a070 : 0x2c2634, 1);
  g.fillCircle(x, y, r - 2.5);
  g.lineStyle(1.5, p.woodDark, 0.8);
  g.strokeCircle(x, y, r * 0.5);
}

/** Ящик с цветами под окном (y — верх ящика). */
export function flowerBox(g: G, x: number, y: number, w: number, forest: boolean) {
  g.fillStyle(0x3e7a4a, 1);
  const n = Math.max(2, Math.round(w / 10));
  for (let k = 0; k < n; k++) g.fillCircle(x - w / 2 + 5 + (k * (w - 10)) / (n - 1), y - 2, 6);
  const cols = forest ? [0x7ab8ff, TEAL, 0xf4ecd8, 0xc89aff] : [0xffb3cf, 0xfff4e0, 0xffd45a, 0xff8a6a];
  for (let k = 0; k < n; k++) {
    g.fillStyle(cols[k % cols.length], 1);
    g.fillCircle(x - w / 2 + 5 + (k * (w - 10)) / (n - 1), y - 6 - (k % 2) * 4, 3.5);
  }
  g.fillStyle(0x6a4428, 1);
  g.fillRect(x - w / 2, y, w, 12);
  g.fillStyle(0x4a2e1a, 1);
  g.fillRect(x - w / 2, y + 9, w, 3);
}

// ---------------------------------------------------------------------------
// Знаки на вывесках

export type Emblem = 'drop' | 'bread' | 'gear' | 'wheat' | 'arch' | 'apple' | 'bell' | 'star' | 'beam' | 'leaf' | 'moon' | 'letter' | 'mushroom' | 'log' | 'lamp' | 'cup' | 'tree' | 'fish' | 'house' | 'pick' | 'anvil' | 'gondola' | 'crystal' | 'goat' | 'steam' | 'peak';

export function star(g: G, x: number, y: number, r1: number, r2: number, rot = -Math.PI / 2) {
  const pts: Phaser.Math.Vector2[] = [];
  for (let i = 0; i < 10; i++) {
    const a = rot + (i * Math.PI) / 5;
    const r = i % 2 ? r2 : r1;
    pts.push(new V2(x + Math.cos(a) * r, y + Math.sin(a) * r));
  }
  g.fillPoints(pts, true);
}

/** Пиктограмма: s — половина размера, c — цвет, bg — цвет доски (для вырезов). */
function emblem(g: G, kind: Emblem, x: number, y: number, s: number, c: number, bg: number) {
  g.fillStyle(c, 1);
  g.lineStyle(Math.max(2, s * 0.25), c, 1);
  switch (kind) {
    case 'drop':
      g.fillCircle(x, y + s * 0.3, s * 0.6);
      g.fillTriangle(x - s * 0.55, y + s * 0.15, x + s * 0.55, y + s * 0.15, x, y - s);
      break;
    case 'bread':
      g.fillEllipse(x, y, s * 2, s * 1.1);
      g.lineStyle(2, bg, 1);
      for (const d of [-0.45, 0, 0.45]) g.lineBetween(x + d * s - 2, y - s * 0.3, x + d * s + 2, y + s * 0.3);
      break;
    case 'gear':
      g.fillCircle(x, y, s * 0.62);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        g.fillCircle(x + Math.cos(a) * s * 0.78, y + Math.sin(a) * s * 0.78, s * 0.22);
      }
      g.fillStyle(bg, 1);
      g.fillCircle(x, y, s * 0.25);
      break;
    case 'wheat':
      g.lineBetween(x, y + s, x, y - s);
      for (const k of [-0.6, -0.15, 0.3]) {
        g.fillEllipse(x - s * 0.28, y + k * s, s * 0.45, s * 0.28);
        g.fillEllipse(x + s * 0.28, y + k * s, s * 0.45, s * 0.28);
      }
      g.fillEllipse(x, y - s * 0.85, s * 0.3, s * 0.45);
      break;
    case 'arch':
      g.beginPath();
      g.arc(x, y + s * 0.6, s * 0.85, Math.PI, 0, false);
      g.strokePath();
      g.lineBetween(x - s * 1.1, y - s * 0.1, x + s * 1.1, y - s * 0.1);
      break;
    case 'apple':
      g.fillCircle(x - s * 0.28, y + s * 0.15, s * 0.55);
      g.fillCircle(x + s * 0.28, y + s * 0.15, s * 0.55);
      g.lineBetween(x, y - s * 0.3, x + s * 0.15, y - s * 0.85);
      g.fillEllipse(x + s * 0.45, y - s * 0.7, s * 0.5, s * 0.25);
      break;
    case 'bell':
      fp(g, [x - s * 0.8, y + s * 0.55, x + s * 0.8, y + s * 0.55, x + s * 0.5, y - s * 0.2, x + s * 0.3, y - s * 0.75, x - s * 0.3, y - s * 0.75, x - s * 0.5, y - s * 0.2]);
      g.fillCircle(x, y + s * 0.75, s * 0.22);
      break;
    case 'star':
      star(g, x, y, s, s * 0.45);
      break;
    case 'beam':
      fp(g, [x - s * 0.3, y + s, x + s * 0.3, y + s, x + s * 0.18, y - s * 0.4, x - s * 0.18, y - s * 0.4]);
      g.fillCircle(x, y - s * 0.55, s * 0.25);
      g.lineStyle(2, c, 1);
      g.lineBetween(x + s * 0.35, y - s * 0.6, x + s * 1.1, y - s * 0.9);
      g.lineBetween(x - s * 0.35, y - s * 0.6, x - s * 1.1, y - s * 0.9);
      break;
    case 'leaf':
      fp(g, [x - s, y + s * 0.6, x - s * 0.4, y - s * 0.4, x + s * 0.5, y - s * 0.8, x + s, y - s * 0.9, x + s * 0.6, y, x - s * 0.1, y + s * 0.6]);
      g.lineStyle(2, bg, 1);
      g.lineBetween(x - s, y + s * 0.6, x + s * 0.5, y - s * 0.5);
      break;
    case 'moon':
      g.fillCircle(x, y, s * 0.85);
      g.fillStyle(bg, 1);
      g.fillCircle(x + s * 0.4, y - s * 0.25, s * 0.7);
      break;
    case 'letter':
      g.fillRect(x - s, y - s * 0.6, s * 2, s * 1.2);
      g.lineStyle(2, bg, 1);
      g.lineBetween(x - s, y - s * 0.6, x, y + s * 0.1);
      g.lineBetween(x + s, y - s * 0.6, x, y + s * 0.1);
      break;
    case 'mushroom':
      g.beginPath();
      g.arc(x, y, s, Math.PI, 0, false);
      g.closePath();
      g.fillPath();
      g.fillRect(x - s * 0.3, y, s * 0.6, s * 0.8);
      g.fillStyle(bg, 1);
      g.fillCircle(x - s * 0.4, y - s * 0.45, s * 0.18);
      g.fillCircle(x + s * 0.3, y - s * 0.6, s * 0.15);
      break;
    case 'log':
      g.fillRect(x - s, y - s * 0.45, s * 1.5, s * 0.9);
      g.fillCircle(x + s * 0.5, y, s * 0.55);
      g.lineStyle(1.5, bg, 1);
      g.strokeCircle(x + s * 0.5, y, s * 0.28);
      break;
    case 'lamp':
      g.fillRoundedRect(x - s * 0.5, y - s * 0.5, s, s * 1.2, 2);
      g.fillTriangle(x - s * 0.7, y - s * 0.5, x + s * 0.7, y - s * 0.5, x, y - s);
      g.fillStyle(bg, 1);
      g.fillCircle(x, y + s * 0.1, s * 0.22);
      break;
    case 'cup':
      fp(g, [x - s * 0.7, y - s * 0.2, x + s * 0.5, y - s * 0.2, x + s * 0.35, y + s * 0.75, x - s * 0.55, y + s * 0.75]);
      g.lineStyle(2, c, 1);
      g.strokeCircle(x + s * 0.65, y + s * 0.2, s * 0.25);
      g.lineBetween(x - s * 0.3, y - s * 0.45, x - s * 0.15, y - s * 0.9);
      g.lineBetween(x + s * 0.1, y - s * 0.45, x + s * 0.25, y - s * 0.9);
      break;
    case 'tree':
      g.fillTriangle(x - s * 0.8, y + s * 0.5, x + s * 0.8, y + s * 0.5, x, y - s * 0.4);
      g.fillTriangle(x - s * 0.6, y, x + s * 0.6, y, x, y - s);
      g.fillRect(x - s * 0.12, y + s * 0.5, s * 0.24, s * 0.4);
      break;
    case 'fish':
      g.fillEllipse(x - s * 0.15, y, s * 1.4, s * 0.8);
      g.fillTriangle(x + s * 0.45, y, x + s, y - s * 0.45, x + s, y + s * 0.45);
      g.fillStyle(bg, 1);
      g.fillCircle(x - s * 0.5, y - s * 0.1, s * 0.1);
      break;
    case 'house':
      g.fillRect(x - s * 0.6, y - s * 0.1, s * 1.2, s * 0.9);
      g.fillTriangle(x - s * 0.85, y - s * 0.1, x + s * 0.85, y - s * 0.1, x, y - s * 0.9);
      g.fillStyle(bg, 1);
      g.fillRect(x - s * 0.15, y + s * 0.3, s * 0.3, s * 0.5);
      break;
    case 'pick':
      // кирка: рукоять наискосок и изогнутое железо
      g.lineBetween(x - s * 0.7, y + s * 0.8, x + s * 0.4, y - s * 0.4);
      g.beginPath();
      g.arc(x + s * 0.4, y + s * 0.2, s * 0.75, Math.PI * 1.2, Math.PI * 1.85, false);
      g.strokePath();
      break;
    case 'anvil':
      fp(g, [x - s, y - s * 0.45, x + s * 0.7, y - s * 0.45, x + s * 0.45, y - s * 0.05, x + s * 0.25, y + s * 0.05, x + s * 0.4, y + s * 0.65, x - s * 0.5, y + s * 0.65, x - s * 0.3, y + s * 0.05, x - s * 0.55, y - s * 0.15]);
      break;
    case 'gondola':
      g.lineBetween(x - s * 1.1, y - s * 0.85, x + s * 1.1, y - s * 0.55);
      g.lineBetween(x, y - s * 0.7, x, y - s * 0.3);
      g.fillRoundedRect(x - s * 0.6, y - s * 0.3, s * 1.2, s * 1.0, s * 0.2);
      g.fillStyle(bg, 1);
      g.fillRect(x - s * 0.4, y - s * 0.15, s * 0.32, s * 0.32);
      g.fillRect(x + s * 0.08, y - s * 0.15, s * 0.32, s * 0.32);
      break;
    case 'crystal':
      fp(g, [x, y - s, x + s * 0.4, y - s * 0.35, x + s * 0.3, y + s * 0.8, x - s * 0.3, y + s * 0.8, x - s * 0.4, y - s * 0.35]);
      fp(g, [x - s * 0.55, y - s * 0.3, x - s * 0.3, y + s * 0.1, x - s * 0.4, y + s * 0.8, x - s * 0.8, y + s * 0.8, x - s * 0.85, y + s * 0.05]);
      g.lineStyle(1.5, bg, 1);
      g.lineBetween(x, y - s, x, y + s * 0.8);
      break;
    case 'goat':
      g.fillEllipse(x - s * 0.1, y + s * 0.1, s * 1.3, s * 0.7);
      g.fillCircle(x + s * 0.65, y - s * 0.25, s * 0.28);
      g.lineBetween(x - s * 0.5, y + s * 0.3, x - s * 0.5, y + s * 0.85);
      g.lineBetween(x + s * 0.3, y + s * 0.3, x + s * 0.3, y + s * 0.85);
      g.lineStyle(Math.max(1.5, s * 0.15), c, 1);
      g.beginPath();
      g.arc(x + s * 0.45, y - s * 0.5, s * 0.3, Math.PI * 1.1, Math.PI * 1.9, false);
      g.strokePath();
      break;
    case 'steam':
      g.fillRoundedRect(x - s * 0.9, y + s * 0.35, s * 1.8, s * 0.45, s * 0.2);
      g.lineStyle(Math.max(1.5, s * 0.18), c, 1);
      for (const dx of [-0.45, 0, 0.45]) {
        g.beginPath();
        g.arc(x + dx * s + s * 0.12, y - s * 0.1, s * 0.22, Math.PI * 0.5, Math.PI * 1.5, false);
        g.arc(x + dx * s - s * 0.12, y - s * 0.55, s * 0.22, Math.PI * 0.5, Math.PI * 1.5, true);
        g.strokePath();
      }
      break;
    case 'peak':
      g.fillTriangle(x - s, y + s * 0.75, x + s, y + s * 0.75, x + s * 0.1, y - s * 0.85);
      g.fillStyle(bg, 1);
      g.fillTriangle(x - s * 0.18, y - s * 0.4, x + s * 0.36, y - s * 0.4, x + s * 0.1, y - s * 0.85);
      g.fillStyle(c, 1);
      g.fillCircle(x + s * 0.1, y - s * 0.95, s * 0.12);
      break;
  }
}

// ---------------------------------------------------------------------------
// Уровни постройки: общие детали по разметке Up

/** Вывеска: hang — на кронштейне сбоку от стены, drop — на цепочках вниз, wall — доска на стене, stand — на столбиках. */
export interface SignSpec {
  mode: 'hang' | 'drop' | 'wall' | 'stand';
  x: number;
  y: number;
  dir?: 1 | -1;
  w?: number;
  emblem: Emblem;
}

type ExtKind = 'shed' | 'veranda' | 'tower' | 'greenhouse' | 'kiosk' | 'cottage' | 'gazebo' | 'trough' | MountainExt;

/** Разметка улучшений постройки (координаты базового рисунка). */
export interface Up {
  /** Края по земле и высота базового рисунка. */
  l: number;
  r: number;
  h: number;
  sign: SignSpec;
  /** Второй фонарь: x, y (земля), высота столба. */
  lamp?: [number, number, number];
  /** Ещё окна со светом (ур. 2): x, y, w, h. */
  win?: [number, number, number, number][];
  /** Цветочные ящики (ур. 2): x, y (верх ящика), ширина. */
  boxes?: [number, number, number][];
  /** Гирлянды огоньков (ур. 3) — ломаные вдоль крыши/края. */
  garland: Pt[][];
  /** Золотая отделка (ур. 3); по умолчанию — те же линии, что гирлянда. */
  trim?: Pt[][];
  /** Флажок (или флюгер, если третий элемент true); без него — на верхушке пристройки. */
  flag?: [number, number, boolean?];
  /** Пристройка (ур. 3): с какой стороны, x края стены, вид, уровень земли. */
  ext: { side: 1 | -1; at: number; kind: ExtKind; y?: number };
  lv2?: () => void;
  lv3?: () => void;
}

/** Состояние рисования: слои, палитра, уровень и занятая область. */
export interface B {
  scene: Phaser.Scene;
  g: G;
  back: G;
  front: G;
  v: BuildingView;
  p: Pal;
  lit: boolean;
  lv: number;
  l: number;
  r: number;
  top: number;
}

export function grow(b: B, x0: number, x1: number, top = 0) {
  b.l = Math.min(b.l, x0, x1);
  b.r = Math.max(b.r, x0, x1);
  b.top = Math.max(b.top, top);
}

function sign(b: B, s: SignSpec, gold: boolean) {
  const { g, p } = b;
  const w = s.w ?? 48;
  let h = 30;
  let cx = s.x;
  let cy = s.y;
  g.lineStyle(4, IRON, 1);
  switch (s.mode) {
    case 'hang': {
      const d = s.dir ?? 1;
      cx = s.x + d * 38;
      g.lineBetween(s.x, s.y, cx + d * 10, s.y);
      g.lineBetween(s.x, s.y + 14, s.x + d * 16, s.y);
      g.lineStyle(2, IRON, 1);
      g.lineBetween(cx - 15, s.y, cx - 15, s.y + 8);
      g.lineBetween(cx + 15, s.y, cx + 15, s.y + 8);
      cy = s.y + 8 + h / 2;
      break;
    }
    case 'drop':
      g.lineStyle(2, IRON, 1);
      g.lineBetween(s.x - 15, s.y, s.x - 15, s.y + 10);
      g.lineBetween(s.x + 15, s.y, s.x + 15, s.y + 10);
      cy = s.y + 10 + h / 2;
      break;
    case 'wall':
      h = 22;
      break;
    case 'stand':
      g.fillStyle(p.woodDark, 1);
      g.fillRect(s.x - w / 2 + 6, s.y - 60, 6, 60);
      g.fillRect(s.x + w / 2 - 12, s.y - 60, 6, 60);
      cy = s.y - 52;
      break;
  }
  g.fillStyle(p.wood, 1);
  g.fillRoundedRect(cx - w / 2, cy - h / 2, w, h, 5);
  g.lineStyle(3, gold ? GOLD : p.trim, 1);
  g.strokeRoundedRect(cx - w / 2, cy - h / 2, w, h, 5);
  emblem(g, s.emblem, cx, cy, h * 0.34, gold ? GOLD : p.trim, p.wood);
  grow(b, cx - w / 2 - 4, cx + w / 2 + 4, -(cy - h / 2));
}

/** Гирлянда: провисающий провод с огоньками между точками; каждый огонёк — точка света. */
function garland(b: B, pts: Pt[]) {
  const g = b.front;
  const cols = b.p.forest ? [TEAL, 0xffd36b, 0x9ad6ff, FIREFLY] : b.p.mountain ? [0xffd36b, ICE, 0xfff1cc, 0xff9e6b] : [0xffd36b, 0xff9e6b, 0xfff1cc, 0xffb3cf];
  let k = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[i + 1];
    const len = Math.hypot(x1 - x0, y1 - y0);
    const spans = Math.max(1, Math.round(len / 70));
    for (let s = 0; s < spans; s++) {
      const ax = x0 + ((x1 - x0) * s) / spans;
      const ay = y0 + ((y1 - y0) * s) / spans;
      const bx = x0 + ((x1 - x0) * (s + 1)) / spans;
      const by = y0 + ((y1 - y0) * (s + 1)) / spans;
      const sl = len / spans;
      const sag = Math.min(14, sl * 0.16);
      const at = (t: number): Pt => [ax + (bx - ax) * t, ay + (by - ay) * t + 3 + sag * 4 * t * (1 - t)];
      const line: Pt[] = [];
      for (let j = 0; j <= 10; j++) line.push(at(j / 10));
      g.lineStyle(2, 0x2a2030, 0.9);
      sp(g, line);
      const n = Math.max(1, Math.round(sl / 24));
      for (let j = 0; j < n; j++) {
        const [x, y] = at((j + 0.5) / n);
        const c = cols[k++ % cols.length];
        g.fillStyle(c, 1);
        g.fillCircle(x, y + 2, 4);
        b.v.lights.push({ x, y: y + 2, r: 6, c });
      }
    }
  }
  for (const [x, y] of pts) grow(b, x, x, -y);
}

/** Золотая отделка вдоль линий с шариками на изломах. */
function trim(b: B, pts: Pt[]) {
  b.g.lineStyle(4, GOLD, 1);
  sp(b.g, pts);
  b.g.fillStyle(GOLD, 1);
  for (const [x, y] of pts) b.g.fillCircle(x, y, 4);
}

/** Флажок или флюгер-петушок на золотом шесте; y — основание. */
function flag(b: B, x: number, y: number, vane: boolean) {
  const g = b.front;
  if (vane) {
    g.fillStyle(GOLD_DARK, 1);
    g.fillRect(x - 2, y - 46, 4, 46);
    g.fillStyle(GOLD, 1);
    g.fillCircle(x, y - 46, 4);
    // стрелка
    g.fillRect(x - 20, y - 36, 40, 3);
    g.fillTriangle(x + 20, y - 40, x + 20, y - 31, x + 29, y - 34.5);
    fp(g, [x - 20, y - 34.5, x - 28, y - 42, x - 24, y - 34.5, x - 28, y - 27]);
    // петушок
    g.fillEllipse(x, y - 58, 18, 12);
    g.fillCircle(x + 8, y - 65, 4.5);
    g.fillTriangle(x + 6, y - 69, x + 11, y - 69, x + 8, y - 74);
    g.fillTriangle(x + 12, y - 66, x + 12, y - 63, x + 16, y - 64);
    fp(g, [x - 6, y - 58, x - 16, y - 74, x - 10, y - 60, x - 14, y - 54]);
    grow(b, x - 30, x + 30, -(y - 76));
  } else {
    g.fillStyle(GOLD_DARK, 1);
    g.fillRect(x - 2, y - 58, 4, 58);
    g.fillStyle(GOLD, 1);
    g.fillCircle(x, y - 60, 4);
    g.fillStyle(b.p.forest ? 0x3aa86a : b.p.mountain ? 0x3a6ad0 : 0xd0504a, 1);
    fp(g, [x + 2, y - 56, x + 20, y - 59, x + 36, y - 52, x + 28, y - 47, x + 36, y - 40, x + 18, y - 42, x + 2, y - 38]);
    g.lineStyle(2, GOLD, 1);
    g.lineBetween(x + 4, y - 47, x + 26, y - 47);
    grow(b, x - 4, x + 38, -(y - 64));
  }
}

/** Пристройка за основной постройкой (слой back). Возвращает верхушку — туда по умолчанию ставится флажок. */
function extension(b: B, e: Up['ext']): Pt {
  const g = b.back;
  const { p, v } = b;
  const s = e.side;
  const y0 = e.y ?? 0;
  const X = (d: number) => e.at + s * d;
  const R = (d0: number, d1: number, ya: number, yb: number) => g.fillRect(Math.min(X(d0), X(d1)), y0 + ya, Math.abs(d1 - d0), yb - ya);
  const P = (a: number[]) => fp(g, a.map((n, i) => (i % 2 ? y0 + n : X(n))));
  const win = (d: number, y: number, w: number, h: number) => windowAt(g, v, X(d), y0 + y, w, h, p, true, false);
  let top: Pt = [X(40), y0 - 100];
  let w = 90;
  let h = 100;
  switch (e.kind) {
    case 'shed': {
      g.fillStyle(p.wallDark, 1);
      R(-14, 74, -74, 0);
      g.lineStyle(2, p.woodDark, 1);
      for (let d = 4; d < 74; d += 14) g.lineBetween(X(d), y0 - 74, X(d), y0);
      g.fillStyle(p.roof, 1);
      P([-14, -104, -14, -92, 84, -66, 84, -78]);
      win(36, -42, 24, 22);
      // бочка
      g.fillStyle(p.wood, 1);
      g.fillRoundedRect(X(86) - 13, y0 - 34, 26, 34, 6);
      g.lineStyle(2, IRON, 1);
      g.lineBetween(X(86) - 13, y0 - 24, X(86) + 13, y0 - 24);
      g.lineBetween(X(86) - 13, y0 - 10, X(86) + 13, y0 - 10);
      w = 100;
      h = 104;
      top = [X(70), y0 - 72];
      break;
    }
    case 'veranda': {
      g.fillStyle(p.woodDark, 1);
      R(-14, 100, -12, 0);
      for (const d of [20, 94]) R(d - 3, d + 3, -96, -12);
      g.fillStyle(p.wood, 1);
      R(-14, 100, -46, -40);
      for (let d = 2; d < 96; d += 12) R(d - 1.5, d + 1.5, -42, -12);
      // полосатый навес
      for (let i = 0; i < 6; i++) {
        g.fillStyle(i % 2 ? p.trim : p.roof, 1);
        P([-14 + i * 20, -112, 6 + i * 20, -112, 8 + i * 20, -92, -12 + i * 20, -92]);
        P([-12 + i * 20, -92, 8 + i * 20, -92, -2 + i * 20, -84]);
      }
      // столик с фонариком
      g.fillStyle(p.wood, 1);
      R(44, 76, -36, -32);
      R(58, 62, -32, -12);
      g.fillStyle(p.window, 1);
      g.fillCircle(X(60), y0 - 42, 5);
      v.lights.push({ x: X(60), y: y0 - 42, r: 9 });
      hangLantern(g, v, X(60), y0 - 92, 10, p.forest ? TEAL : 0xffd36b, true);
      w = 104;
      h = 112;
      top = [X(94), y0 - 112];
      break;
    }
    case 'tower': {
      g.fillStyle(p.wallDark, 1);
      R(-10, 56, -190, 0);
      g.fillStyle(p.roof, 1);
      P([-18, -188, 64, -188, 23, -252]);
      g.lineStyle(2, p.roofDark, 1);
      g.lineBetween(X(-6), y0 - 208, X(52), y0 - 208);
      g.lineBetween(X(6), y0 - 228, X(40), y0 - 228);
      win(23, -150, 18, 24);
      win(23, -96, 18, 24);
      door(g, X(23), y0, 22, 40, p, true);
      w = 64;
      h = 252;
      top = [X(23), y0 - 250];
      break;
    }
    case 'greenhouse': {
      g.fillStyle(0x9ad6f5, 0.28);
      P([-12, -62, 92, -62, 92, 0, -12, 0]);
      P([-12, -62, 92, -62, 40, -100]);
      g.fillStyle(p.leaf, 1);
      for (const d of [8, 30, 52, 74]) {
        g.fillCircle(X(d), y0 - 14, 10);
        g.fillCircle(X(d + 6), y0 - 24, 7);
      }
      g.fillStyle(0xffb3cf, 1);
      g.fillCircle(X(30), y0 - 30, 4);
      g.fillCircle(X(74), y0 - 28, 4);
      g.lineStyle(3, p.trim, 1);
      sp(g, [
        [X(-12), y0],
        [X(-12), y0 - 62],
        [X(40), y0 - 100],
        [X(92), y0 - 62],
        [X(92), y0],
      ]);
      g.lineBetween(X(-12), y0 - 62, X(92), y0 - 62);
      for (const d of [14, 40, 66]) g.lineBetween(X(d), y0, X(d), y0 - 62);
      g.lineBetween(X(40), y0 - 62, X(40), y0 - 100);
      v.lights.push({ x: X(40), y: y0 - 40, r: 30 });
      w = 96;
      h = 100;
      top = [X(40), y0 - 100];
      break;
    }
    case 'kiosk': {
      g.fillStyle(p.woodDark, 1);
      for (const d of [6, 84]) R(d - 3, d + 3, -96, 0);
      g.fillStyle(p.wood, 1);
      R(0, 90, -42, 0);
      g.lineStyle(2, p.woodDark, 1);
      g.lineBetween(X(0), y0 - 30, X(90), y0 - 30);
      // товары
      const goods = p.forest ? [TEAL, 0xc2463a, 0xffd36b] : [0xe8783a, 0xd04a3a, 0xffd36b];
      for (let i = 0; i < 6; i++) {
        g.fillStyle(goods[i % 3], 1);
        g.fillCircle(X(12 + i * 13), y0 - 48, 6);
      }
      for (let i = 0; i < 5; i++) {
        g.fillStyle(i % 2 ? p.trim : p.roof, 1);
        P([-8 + i * 21, -110, 13 + i * 21, -110, 13 + i * 21, -92, -8 + i * 21, -92]);
        g.fillCircle(X(2.5 + i * 21), y0 - 92, 10.5);
      }
      hangLantern(g, v, X(45), y0 - 88, 6, p.forest ? TEAL : 0xffd36b, true);
      w = 96;
      h = 110;
      top = [X(84), y0 - 110];
      break;
    }
    case 'cottage': {
      g.fillStyle(p.wallDark, 1);
      R(-12, 92, -82, 0);
      g.fillStyle(p.roof, 1);
      P([-20, -80, 104, -80, 46, -140]);
      g.lineStyle(2, p.roofDark, 1);
      g.lineBetween(X(-2), y0 - 100, X(90), y0 - 100);
      g.lineBetween(X(18), y0 - 120, X(72), y0 - 120);
      win(26, -46, 26, 24);
      door(g, X(70), y0, 24, 46, p, true);
      w = 104;
      h = 140;
      top = [X(46), y0 - 140];
      break;
    }
    case 'gazebo': {
      g.fillStyle(p.woodDark, 1);
      R(-6, 102, -12, 0);
      for (const d of [6, 48, 90]) R(d - 3, d + 3, -100, -12);
      g.fillStyle(p.wood, 1);
      R(-6, 102, -46, -41);
      g.fillStyle(p.roof, 1);
      P([-14, -98, 110, -98, 92, -112, 48, -150, 4, -112]);
      g.fillStyle(p.trim, 1);
      g.fillCircle(X(48), y0 - 152, 5);
      hangLantern(g, v, X(48), y0 - 104, 8, p.forest ? TEAL : 0xffd36b, true, true);
      w = 110;
      h = 156;
      top = [X(48), y0 - 152];
      break;
    }
    default: {
      // Пристройки Горного города (шале, дровяник, ларёк с глинтвейном) — villageMountain.ts.
      const m = mountainExt(b, e.kind as MountainExt, X, y0);
      w = m.w;
      h = m.h;
      top = m.top;
      break;
    }
    case 'trough': {
      // поилка с колонкой
      g.fillStyle(p.stone, 1);
      R(-4, 80, -30, 0);
      g.lineStyle(2, p.stoneDark, 1);
      g.lineBetween(X(-4), y0 - 15, X(80), y0 - 15);
      g.fillStyle(0x3a78b8, 1);
      g.fillEllipse(X(38), y0 - 30, 76, 10);
      g.fillStyle(IRON, 1);
      R(62, 72, -86, -30);
      R(46, 66, -76, -70);
      g.lineStyle(4, IRON, 1);
      g.lineBetween(X(72), y0 - 82, X(92), y0 - 96);
      g.fillStyle(0xffb3cf, 1);
      g.fillCircle(X(6), y0 - 36, 5);
      g.fillCircle(X(16), y0 - 38, 4);
      g.fillStyle(0x3e7a4a, 1);
      g.fillCircle(X(11), y0 - 32, 6);
      w = 96;
      h = 96;
      top = [X(67), y0 - 86];
      break;
    }
  }
  grow(b, X(-14), X(w), -(y0 - h));
  return top;
}

function level2(b: B, u: Up) {
  const { g, v, p } = b;
  for (const [x, y, w, h] of u.win ?? []) windowAt(g, v, x, y, w, h, p, true, false);
  for (const [x, y, w] of u.boxes ?? []) flowerBox(g, x, y, w, p.forest);
  if (u.lamp) {
    const [x, y, h] = u.lamp;
    lampPost(g, v, x, y, h, p);
    grow(b, x - 12, x + 12, -(y - h - 28));
  }
  u.lv2?.();
  sign(b, u.sign, b.lv >= 3);
}

function level3(b: B, u: Up) {
  const top = extension(b, u.ext);
  for (const line of u.trim ?? u.garland) trim(b, line);
  u.lv3?.();
  for (const line of u.garland) garland(b, line);
  if (u.flag) flag(b, u.flag[0], u.flag[1], !!u.flag[2]);
  else flag(b, top[0], top[1], false);
}

// ---------------------------------------------------------------------------
// Постройки долины

function valley(b: B, id: string): Up | null {
  const { scene, g, v, p, lit, lv } = b;
  switch (id) {
    case 'well': {
      shadow(g, 150);
      // Каменное кольцо из кладки
      g.fillStyle(p.stone, 1);
      g.fillRoundedRect(-62, -58, 124, 60, 14);
      g.lineStyle(2, p.stoneDark, 1);
      for (const yy of [-40, -20]) g.lineBetween(-60, yy, 60, yy);
      for (let x = -48; x <= 48; x += 24) g.lineBetween(x + (x % 48 ? 12 : 0), -58, x + (x % 48 ? 12 : 0), -40);
      g.fillStyle(0x05060e, 1);
      g.fillEllipse(0, -58, 104, 18);
      // Стойки, ворот, крыша
      g.fillStyle(p.wood, 1);
      g.fillRect(-54, -140, 10, 84);
      g.fillRect(44, -140, 10, 84);
      g.fillRect(-48, -118, 96, 8);
      g.lineStyle(2, p.trim, 1);
      g.lineBetween(0, -112, 0, lit ? -78 : -88);
      g.fillStyle(p.woodDark, 1);
      g.fillRect(-10, lit ? -80 : -90, 20, 16); // ведро
      roof(g, 0, -136, 120, 50, p, lit);
      lampPost(g, v, 80, 0, 70, p);
      return {
        l: -76,
        r: 92,
        h: 190,
        sign: { mode: 'hang', x: -54, y: -98, dir: -1, emblem: 'drop' },
        lamp: [-128, 0, 60],
        boxes: [
          [-34, -12, 40],
          [34, -12, 40],
        ],
        garland: [roofEdge(0, -136, 120, 50)],
        flag: [0, -186, true],
        ext: { side: 1, at: 96, kind: 'trough' },
        lv2: () => {
          // ведро с цветами и фонарик на вороте
          g.fillStyle(0x3e7a4a, 1);
          g.fillCircle(-4, -82, 6);
          g.fillCircle(5, -83, 5);
          g.fillStyle(0xffb3cf, 1);
          g.fillCircle(-3, -87, 3.5);
          g.fillStyle(0xfff4e0, 1);
          g.fillCircle(5, -88, 3);
          hangLantern(g, v, -30, -110, 6, 0xffd36b, true);
        },
      };
    }
    case 'bakery': {
      shadow(g, 230);
      g.fillStyle(p.wall, 1);
      g.fillRect(-95, -125, 190, 125);
      g.fillStyle(p.wallDark, 1);
      g.fillRect(-95, -20, 190, 20); // цоколь
      roof(g, 0, -125, 190, 80, p, lit);
      chimney(g, v, 55, -150, 70, p);
      // Полосатый навес над витриной
      for (let i = 0; i < 6; i++) {
        g.fillStyle(i % 2 ? p.trim : p.roof, 1);
        g.fillTriangle(-80 + i * 22, -78, -58 + i * 22, -78, -69 + i * 22, -62);
        g.fillRect(-80 + i * 22, -92, 22, 14);
      }
      windowAt(g, v, -45, -45, 56, 34, p, lit, false);
      door(g, 45, 0, 34, 60, p);
      // Вывеска-крендель
      g.lineStyle(6, p.trim, 1);
      g.strokeCircle(lv >= 2 ? 50 : 0, lv >= 2 ? -104 : -112, 12);
      lampPost(g, v, -120, 0, 64, p);
      return {
        l: -130,
        r: 111,
        h: 290,
        sign: { mode: 'wall', x: -14, y: -108, w: 60, emblem: 'bread' },
        win: [[0, -160, 24, 22]],
        boxes: [[-45, -24, 70]],
        lamp: [130, 0, 60],
        garland: [roofEdge(0, -125, 190, 80)],
        flag: [0, -205, true],
        ext: { side: -1, at: -128, kind: 'veranda' },
        lv2: () => {
          // буханки в витрине
          g.fillStyle(0xc98a4a, 1);
          for (const x of [-62, -45, -28]) g.fillEllipse(x, -33, 14, 8);
        },
        lv3: () => {
          g.lineStyle(6, GOLD, 1);
          g.strokeCircle(50, -104, 12);
        },
      };
    }
    case 'workshop': {
      shadow(g, 260);
      g.fillStyle(p.wood, 1);
      g.fillRect(-110, -115, 220, 115);
      g.lineStyle(2, p.woodDark, 1);
      for (let x = -100; x < 110; x += 20) g.lineBetween(x, -115, x, 0);
      // Широкая крыша-сарай
      g.fillStyle(p.roof, 1);
      g.fillPoints([new V2(-128, -112), new V2(128, -112), new V2(90, -175), new V2(-90, -175)], true);
      g.lineStyle(3, p.roofDark, 1);
      g.lineBetween(-110, -140, 110, -140);
      chimney(g, v, -60, -160, 50, p);
      // Двустворчатые ворота с крестом
      g.fillStyle(p.woodDark, 1);
      g.fillRect(-40, -78, 80, 78);
      g.lineStyle(4, p.wood, 1);
      g.lineBetween(-40, -78, 40, 0);
      g.lineBetween(40, -78, -40, 0);
      g.lineBetween(0, -78, 0, 0);
      windowAt(g, v, 75, -70, 30, 26, p, lit, false);
      // Шестерёнка-вывеска
      g.fillStyle(p.trim, 1);
      g.fillCircle(0, -100, 12);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        g.fillCircle(Math.cos(a) * 14, -100 + Math.sin(a) * 14, 4);
      }
      g.fillStyle(p.wall, 1);
      g.fillCircle(0, -100, 5);
      // Поленница
      g.fillStyle(p.woodDark, 1);
      for (let r = 0; r < 3; r++) for (let c = 0; c < 3 - r; c++) g.fillCircle(-150 + c * 18 + r * 9, -8 - r * 16, 8);
      return {
        l: -158,
        r: 128,
        h: 230,
        sign: { mode: 'hang', x: 110, y: -100, dir: 1, emblem: 'gear' },
        win: [[-75, -70, 30, 26]],
        boxes: [
          [-75, -53, 44],
          [75, -53, 44],
        ],
        lamp: [-186, 0, 62],
        garland: [
          [
            [-128, -112],
            [-90, -175],
            [90, -175],
            [128, -112],
          ],
        ],
        flag: [40, -175, false],
        ext: { side: -1, at: -110, kind: 'shed' },
        lv2: () => {
          // окошко в крыше
          windowAt(g, v, 50, -146, 22, 16, p, true, false);
        },
        lv3: () => {
          g.fillStyle(GOLD, 1);
          g.fillCircle(0, -100, 12);
          for (let i = 0; i < 8; i++) {
            const a = (i / 8) * Math.PI * 2;
            g.fillCircle(Math.cos(a) * 14, -100 + Math.sin(a) * 14, 4);
          }
          g.fillStyle(p.wall, 1);
          g.fillCircle(0, -100, 5);
        },
      };
    }
    case 'mill': {
      shadow(g, 170);
      // Сужающаяся башня
      g.fillStyle(p.wall, 1);
      g.fillPoints([new V2(-58, 0), new V2(58, 0), new V2(38, -190), new V2(-38, -190)], true);
      g.fillStyle(p.roof, 1);
      g.fillTriangle(-50, -186, 50, -186, 0, -240);
      door(g, 0, 0, 30, 52, p, true);
      windowAt(g, v, 0, -110, 22, 26, p, lit, false);
      // Лопасти — отдельным слоем (крутятся)
      const rotor = scene.add.graphics().setPosition(0, -195);
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + (lit ? 0 : 0.35);
        const broken = !lit && i === 2;
        const len = broken ? 70 : 125;
        const cx = Math.cos(a);
        const sy = Math.sin(a);
        rotor.lineStyle(7, p.woodDark, 1);
        rotor.lineBetween(0, 0, cx * len, sy * len);
        // Решётка паруса
        rotor.fillStyle(lit ? (lv >= 3 ? 0xf0dcb0 : 0xd8c8a8) : 0x2a2a40, lit ? 0.9 : 0.8);
        const nx = -sy * 22;
        const ny = cx * 22;
        rotor.fillPoints([new V2(cx * 30, sy * 30), new V2(cx * len, sy * len), new V2(cx * len + nx, sy * len + ny), new V2(cx * 30 + nx, sy * 30 + ny)], true);
        if (lv >= 3) {
          rotor.fillStyle(GOLD, 1);
          rotor.fillCircle(cx * len, sy * len, 5);
        }
      }
      rotor.fillStyle(lv >= 3 ? GOLD : p.trim, 1);
      rotor.fillCircle(0, 0, 9);
      v.objects.push(rotor);
      v.rotor = rotor;
      v.rotorR = 132;
      return {
        l: -64,
        r: 64,
        h: 320,
        sign: { mode: 'wall', x: 0, y: -70, w: 46, emblem: 'wheat' },
        win: [
          [-34, -32, 14, 18],
          [34, -32, 14, 18],
          [0, -158, 16, 18],
        ],
        boxes: [
          [-34, -17, 28],
          [34, -17, 28],
        ],
        lamp: [92, 0, 62],
        garland: [
          [
            [-56, -6],
            [-38, -188],
          ],
          [
            [56, -6],
            [38, -188],
          ],
        ],
        trim: [
          [
            [-50, -186],
            [0, -240],
            [50, -186],
          ],
        ],
        flag: [0, -240, false],
        ext: { side: -1, at: -48, kind: 'shed' },
        lv2: () => {
          // мешки с мукой у двери
          g.fillStyle(0xe8dcc0, 1);
          g.fillRoundedRect(22, -22, 20, 22, 6);
          g.fillRoundedRect(-44, -20, 18, 20, 6);
        },
      };
    }
    case 'bridge': {
      // Каменный арочный мост с перилами и фонарями
      g.fillStyle(0x000000, 0.3);
      g.fillEllipse(0, 8, 300, 22);
      g.fillStyle(p.stone, 1);
      g.fillPoints([new V2(-160, 0), new V2(-130, -40), new V2(130, -40), new V2(160, 0), new V2(90, 0), new V2(60, -18), new V2(-60, -18), new V2(-90, 0)], true);
      g.lineStyle(2, p.stoneDark, 1);
      for (let x = -120; x <= 120; x += 30) g.lineBetween(x, -40, x, -26);
      g.fillStyle(p.wood, 1);
      g.fillRect(-140, -66, 280, 6);
      for (let x = -130; x <= 130; x += 26) if (lit || x !== 0) g.fillRect(x - 3, -64, 6, 26);
      lampPost(g, v, -150, -40, 50, p);
      lampPost(g, v, 150, -40, 50, p);
      return {
        l: -165,
        r: 165,
        h: 140,
        sign: { mode: 'wall', x: 0, y: -29, w: 52, emblem: 'arch' },
        boxes: [
          [-82, -78, 44],
          [82, -78, 44],
        ],
        lamp: [0, -66, 40],
        garland: [
          [
            [-150, -100],
            [0, -126],
            [150, -100],
          ],
        ],
        trim: [
          [
            [-130, -40],
            [130, -40],
          ],
          [
            [-90, 0],
            [-60, -18],
            [60, -18],
            [90, 0],
          ],
        ],
        flag: [-150, -126, false],
        ext: { side: 1, at: 164, kind: 'kiosk' },
        lv3: () => flag(b, 150, -126, false),
      };
    }
    case 'garden': {
      shadow(g, 260);
      // Грядки
      for (let i = 0; i < 3; i++) {
        g.fillStyle(lit ? 0x4a3424 : 0x1e1a24, 1);
        g.fillRoundedRect(-110 + i * 76, -20, 64, 18, 6);
        g.fillStyle(lit ? 0x6aa84f : 0x1e2a24, 1);
        for (let k = 0; k < 4; k++) g.fillCircle(-100 + i * 76 + k * 15, -24, 5);
      }
      // Деревья с плодами
      for (const [x, s] of [
        [-75, 1],
        [10, 1.2],
        [90, 0.95],
      ] as const) {
        g.fillStyle(p.woodDark, 1);
        g.fillRect(x - 6, -70 * s, 12, 50 * s);
        g.fillStyle(p.leafDark, 1);
        g.fillCircle(x, -100 * s, 42 * s);
        g.fillStyle(p.leaf, 1);
        g.fillCircle(x - 10 * s, -108 * s, 30 * s);
        if (lit)
          for (const [dx, dy] of [
            [-18, -96],
            [14, -110],
            [8, -84],
          ] as const)
            v.lights.push({ x: x + dx * s, y: dy * s, r: 9 });
      }
      fence(g, -140, 140, 4, p, lit);
      return {
        l: -142,
        r: 142,
        h: 170,
        sign: { mode: 'stand', x: -112, y: 4, w: 44, emblem: 'apple' },
        lamp: [162, 0, 66],
        garland: [
          [
            [-110, -118],
            [-40, -150],
            [52, -150],
            [126, -110],
          ],
        ],
        trim: [
          [
            [-140, -20],
            [140, -20],
          ],
        ],
        ext: { side: 1, at: 140, kind: 'greenhouse' },
        lv2: () => {
          // фонарики на ветках и цветы вдоль забора
          for (const [x, y] of [
            [-48, -112],
            [44, -132],
            [112, -96],
          ] as const)
            hangLantern(g, v, x, y, 8, 0xffd36b, true, true);
          const cols = [0xffb3cf, 0xfff4e0, 0xffd45a];
          for (let x = -132; x <= 132; x += 18) {
            g.fillStyle(0x3e7a4a, 1);
            g.fillCircle(x, -2, 6);
            g.fillStyle(cols[Math.abs(x) % 3], 1);
            g.fillCircle(x + 3, -8, 3.5);
          }
        },
        lv3: () => {
          // пугало в шляпе
          g.fillStyle(p.woodDark, 1);
          g.fillRect(-152, -92, 5, 92);
          g.fillRect(-170, -70, 40, 5);
          g.fillStyle(0x6a8acf, 1);
          fp(g, [-162, -70, -136, -70, -140, -40, -158, -40]);
          g.fillStyle(0xe8d2a8, 1);
          g.fillCircle(-149, -80, 8);
          g.fillStyle(0xc9a040, 1);
          g.fillEllipse(-149, -86, 28, 6);
          g.fillRect(-156, -96, 14, 10);
          grow(b, -172, -128, 98);
        },
      };
    }
    case 'chapel': {
      shadow(g, 220);
      // Неф
      g.fillStyle(p.wall, 1);
      g.fillRect(-90, -120, 130, 120);
      roof(g, -25, -120, 130, 60, p, lit);
      windowAt(g, v, -55, -60, 18, 34, p, lit, false);
      windowAt(g, v, 5, -60, 18, 34, p, lit, false);
      // Колокольня со шпилем
      g.fillStyle(p.wallDark, 1);
      g.fillRect(40, -200, 60, 200);
      g.fillStyle(p.window, 1);
      g.fillRect(55, -175, 30, 34);
      g.fillStyle(lit ? (lv >= 3 ? GOLD : 0xc9a040) : 0x2a2838, 1);
      g.fillTriangle(60, -150, 80, -150, 70, -168); // колокол
      v.lights.push({ x: 70, y: -158, r: 22 });
      g.fillStyle(p.roof, 1);
      g.fillTriangle(34, -200, 106, -200, 70, -285);
      g.fillStyle(lv >= 3 ? GOLD : p.trim, 1);
      g.fillRect(68, -305, 4, 22);
      g.fillRect(62, -298, 16, 4);
      door(g, 70, 0, 30, 54, p, true);
      // Круглое окно-роза
      g.fillStyle(p.trim, 1);
      g.fillCircle(-25, -150, 13);
      g.fillStyle(p.window, 1);
      g.fillCircle(-25, -150, 9);
      v.lights.push({ x: -25, y: -150, r: 12 });
      return {
        l: -106,
        r: 106,
        h: 310,
        sign: { mode: 'stand', x: -134, y: 4, w: 46, emblem: 'bell' },
        win: [[70, -102, 14, 24]],
        boxes: [
          [-55, -38, 32],
          [5, -38, 32],
        ],
        lamp: [126, 0, 60],
        garland: [roofEdge(-25, -120, 130, 60), [
          [34, -200],
          [70, -285],
          [106, -200],
        ]],
        ext: { side: -1, at: -90, kind: 'cottage' },
      };
    }
    case 'square': {
      // Мощёная площадь, фонтан и фонарные столбы
      g.fillStyle(p.stoneDark, 1);
      g.fillEllipse(0, -10, 300, 80);
      g.lineStyle(2, p.stone, 0.6);
      g.strokeEllipse(0, -10, 220, 56);
      g.strokeEllipse(0, -10, 140, 34);
      // Фонтан: нижняя чаша, колонна, верхняя чаша, струи
      g.fillStyle(p.stone, 1);
      g.fillEllipse(0, -22, 110, 30);
      g.fillStyle(lit ? 0x3a78b8 : 0x101830, 1);
      g.fillEllipse(0, -26, 90, 18);
      g.fillStyle(p.stone, 1);
      g.fillRect(-7, -70, 14, 46);
      g.fillEllipse(0, -72, 50, 14);
      if (lit) {
        g.lineStyle(3, 0x9ad6f5, 0.85);
        for (const dx of [-1, 1]) {
          g.beginPath();
          g.arc(dx * 22, -72, 22, dx < 0 ? Math.PI * 1.1 : -Math.PI * 0.1, dx < 0 ? Math.PI * 1.9 : -Math.PI * 0.9, dx > 0);
          g.strokePath();
        }
      }
      for (const [x, y] of [
        [-130, -10],
        [130, -10],
        [-80, -36],
        [80, -36],
      ] as const)
        lampPost(g, v, x, y, 80, p);
      return {
        l: -160,
        r: 160,
        h: 140,
        sign: { mode: 'stand', x: -105, y: 16, w: 40, emblem: 'star' },
        boxes: [
          [-56, 4, 44],
          [56, 4, 44],
        ],
        lamp: [-182, 0, 70],
        garland: [
          [
            [-130, -110],
            [-80, -134],
            [80, -134],
            [130, -110],
          ],
        ],
        trim: [
          [
            [-55, -22],
            [55, -22],
          ],
        ],
        ext: { side: 1, at: 150, kind: 'kiosk' },
        lv2: () => {
          // скамейки по краям площади
          for (const x of [-40, 40]) {
            g.fillStyle(p.wood, 1);
            g.fillRect(x - 20, -50, 40, 5);
            g.fillRect(x - 20, -60, 40, 4);
            g.fillStyle(p.woodDark, 1);
            g.fillRect(x - 17, -45, 4, 8);
            g.fillRect(x + 13, -45, 4, 8);
          }
        },
        lv3: () => {
          // золотая звезда над фонтаном
          g.fillStyle(GOLD, 1);
          star(g, 0, -92, 14, 6);
          v.lights.push({ x: 0, y: -92, r: 16 });
        },
      };
    }
    case 'lumo': {
      shadow(g, 220);
      // Уютный домик: круглая дверь, звезда над входом, крыльцо, цветы
      g.fillStyle(p.wall, 1);
      g.fillRect(-80, -110, 160, 110);
      roof(g, 0, -110, 160, 90, p, lit);
      chimney(g, v, -45, -140, 60, p);
      door(g, 0, 0, 40, 66, p, true);
      windowAt(g, v, -50, -58, 30, 28, p, lit);
      windowAt(g, v, 50, -58, 30, 28, p, lit);
      // Чердачное круглое окно
      g.fillStyle(p.trim, 1);
      g.fillCircle(0, -150, 14);
      g.fillStyle(p.window, 1);
      g.fillCircle(0, -150, 10);
      v.lights.push({ x: 0, y: -150, r: 12 });
      // Звезда-вывеска
      g.fillStyle(lv >= 3 ? GOLD : lit ? 0xffd36b : 0x3a3a54, 1);
      star(g, 0, -84, 14, 6);
      fence(g, -150, -95, 4, p, lit);
      fence(g, 95, 150, 4, p, lit);
      if (lit) {
        for (const [x, c] of [
          [-120, 0xffb3cf],
          [-105, 0xfff4e0],
          [120, 0xffd45a],
          [135, 0xffb3cf],
        ] as const) {
          g.fillStyle(c, 1);
          g.fillCircle(x, -6, 5);
        }
      }
      lampPost(g, v, 40, 0, 58, p);
      return {
        l: -150,
        r: 150,
        h: 270,
        sign: { mode: 'hang', x: 80, y: -96, dir: 1, w: 44, emblem: 'house' },
        win: [
          [-42, -128, 16, 14],
          [42, -128, 16, 14],
        ],
        boxes: [
          [-50, -40, 44],
          [50, -40, 44],
        ],
        lamp: [-172, 0, 60],
        garland: [roofEdge(0, -110, 160, 90)],
        flag: [0, -200, true],
        ext: { side: 1, at: 80, kind: 'tower' },
      };
    }
    case 'lighthouse': {
      g.fillStyle(0x000000, 0.35);
      g.fillEllipse(0, 6, 150, 24);
      // Башня в полоску
      g.fillStyle(lit ? 0xe0dae8 : 0x262a40, 1);
      g.fillPoints([new V2(-52, 0), new V2(52, 0), new V2(32, -270), new V2(-32, -270)], true);
      g.fillStyle(lit ? 0xb0404a : 0x1a1c30, 1);
      for (const [y0, y1] of [
        [-60, -100],
        [-150, -190],
      ] as const) {
        const w0 = 52 - (20 * -y0) / 270;
        const w1 = 52 - (20 * -y1) / 270;
        g.fillPoints([new V2(-w0, y0), new V2(w0, y0), new V2(w1, y1), new V2(-w1, y1)], true);
      }
      door(g, 0, 0, 26, 44, p, true);
      windowAt(g, v, 0, -125, 14, 20, p, lit, false);
      // Галерея с перилами
      g.fillStyle(p.woodDark, 1);
      g.fillRect(-48, -276, 96, 8);
      g.lineStyle(2, lv >= 3 ? GOLD : p.trim, 1);
      for (let x = -44; x <= 44; x += 11) g.lineBetween(x, -276, x, -292);
      g.lineBetween(-46, -292, 46, -292);
      // Фонарная комната и купол
      g.fillStyle(p.window, 1);
      g.fillRect(-24, -318, 48, 42);
      g.lineStyle(2, IRON, 1);
      g.lineBetween(-8, -318, -8, -276);
      g.lineBetween(8, -318, 8, -276);
      v.lights.push({ x: 0, y: -297, r: 30 });
      g.fillStyle(p.roof, 1);
      g.beginPath();
      g.arc(0, -318, 30, Math.PI, 0, false);
      g.closePath();
      g.fillPath();
      g.fillStyle(p.trim, 1);
      g.fillCircle(0, -350, 5);
      v.beam = { x: 0, y: -297 };
      return {
        l: -60,
        r: 60,
        h: 360,
        sign: { mode: 'hang', x: 48, y: -64, dir: 1, w: 44, emblem: 'beam' },
        win: [
          [0, -80, 12, 18],
          [0, -225, 12, 16],
        ],
        boxes: [
          [-34, -10, 30],
          [34, -10, 30],
        ],
        lamp: [-84, 0, 60],
        garland: [
          [
            [-44, -284],
            [-118, -4],
          ],
          [
            [44, -284],
            [118, -4],
          ],
        ],
        trim: [
          [
            [-48, -276],
            [48, -276],
          ],
          arcPts(0, -318, 31, 31, Math.PI, Math.PI * 2, 8),
        ],
        flag: [0, -355, false],
        ext: { side: 1, at: 50, kind: 'cottage' },
      };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Лесной квартал

function forest(b: B, id: string): Up | null {
  const { scene, g, v, p, lit, lv } = b;
  switch (id) {
    case 'herbalist': {
      shadow(g, 280);
      // Навес с сушёными травами слева
      g.fillStyle(p.woodDark, 1);
      g.fillRect(-156, -84, 6, 84);
      g.fillStyle(p.roof, 1);
      fp(g, [-80, -110, -80, -98, -168, -76, -168, -88]);
      const herbs = lit ? [0x8aa84a, 0xc9a040, 0x6a9a6a, 0xa86a8a, 0x7ab86a] : [0x24262e, 0x2a2830, 0x22282a, 0x2a2430, 0x24282a];
      const nH = lv >= 2 ? 5 : 4;
      for (let i = 0; i < nH; i++) {
        const x = -150 + i * (lv >= 2 ? 15 : 18);
        const yTop = -98 + ((-80 - x) / 88) * 22;
        const len = 8 + (i % 2) * 6;
        g.lineStyle(1.5, p.trim, 1);
        g.lineBetween(x, yTop, x, yTop + len);
        g.fillStyle(herbs[i % herbs.length], 1);
        g.fillTriangle(x - 6, yTop + len + 20, x + 6, yTop + len + 20, x, yTop + len);
        g.fillRect(x - 1.5, yTop + len - 2, 3, 5);
      }
      // Домик
      g.fillStyle(p.wall, 1);
      g.fillRect(-80, -105, 160, 105);
      g.lineStyle(3, p.wallDark, 1);
      g.lineBetween(-80, -52, 80, -52);
      g.lineBetween(-80, -105, -80, 0);
      g.lineBetween(80, -105, 80, 0);
      roof(g, 0, -105, 160, 80, p, lit);
      chimney(g, v, 45, -130, 55, p);
      roundWindow(g, v, -30, -60, 19, p);
      door(g, 40, 0, 32, 62, p, true);
      // Горшки
      const pot = lit ? 0xb0603a : 0x2a2230;
      for (const [x, s] of [
        [96, 1],
        [118, 0.8],
        [-118, 0.9],
      ] as const) {
        g.fillStyle(p.leaf, 1);
        g.fillCircle(x - 5 * s, -26 * s, 8 * s);
        g.fillCircle(x + 5 * s, -30 * s, 7 * s);
        if (lit) {
          g.fillStyle(x > 100 ? 0xc89aff : TEAL, 1);
          g.fillCircle(x + 4 * s, -36 * s, 3.5 * s);
        }
        g.fillStyle(pot, 1);
        fp(g, [x - 11 * s, -20 * s, x + 11 * s, -20 * s, x + 8 * s, 0, x - 8 * s, 0]);
      }
      if (!lit) {
        cobweb(g, -49, -79, 18, 1, 1);
        vines(g, [[-78, 0], [-72, -40], [-60, -70], [-50, -100]], p.moss, 5);
        g.fillStyle(p.wood, 1);
        plank(g, 70, -20, 60, 9, -1.2);
      }
      return {
        l: -170,
        r: 130,
        h: 215,
        sign: { mode: 'hang', x: 80, y: -94, dir: 1, w: 44, emblem: 'leaf' },
        win: [[0, -138, 22, 18]],
        boxes: [[-30, -33, 52]],
        lamp: [-194, 0, 60],
        garland: [roofEdge(0, -105, 160, 80), [
          [-80, -112],
          [-168, -90],
        ]],
        flag: [0, -185, true],
        ext: { side: -1, at: -168, kind: 'greenhouse' },
        lv2: () => {
          // венок на двери
          g.lineStyle(5, p.leaf, 1);
          g.strokeCircle(40, -40, 9);
          g.fillStyle(0xd04a3a, 1);
          g.fillCircle(34, -34, 2.5);
          g.fillCircle(46, -36, 2.5);
        },
        lv3: () => {
          // кристалл на цепочке под навесом
          g.lineStyle(1.5, IRON, 1);
          g.lineBetween(-96, -102, -96, -86);
          g.fillStyle(TEAL, 1);
          fp(g, [-96, -86, -89, -76, -96, -62, -103, -76]);
          v.lights.push({ x: -96, y: -75, r: 12, c: TEAL });
        },
      };
    }
    case 'observatory': {
      shadow(g, 200);
      // Каменная башня
      g.fillStyle(p.stone, 1);
      g.fillRect(-55, -150, 110, 150);
      g.lineStyle(2, p.stoneDark, 1);
      for (let y = -125; y < 0; y += 25) g.lineBetween(-55, y, 55, y);
      for (let y = -150, k = 0; y < 0; y += 25, k++) for (let x = -40 + (k % 2) * 18; x < 55; x += 36) g.lineBetween(x, y, x, y + 25);
      door(g, 0, 0, 30, 56, p, true);
      windowAt(g, v, 0, -100, 18, 24, p, lit, false);
      // Балкон
      g.fillStyle(p.woodDark, 1);
      g.fillRect(-66, -156, 132, 8);
      // Купол с рёбрами и щелью
      g.fillStyle(lit ? 0x3e5c8e : 0x1c2234, 1);
      g.beginPath();
      g.arc(0, -156, 62, Math.PI, 0, false);
      g.closePath();
      g.fillPath();
      g.lineStyle(2, lit ? 0x5a7ab0 : 0x262c40, 1);
      // Меридианы купола: четверти эллипсов от основания к макушке.
      for (const rx of [24, 46]) {
        sp(g, arcPts(0, -156, rx, 62, Math.PI, Math.PI * 1.5, 8));
        sp(g, arcPts(0, -156, rx, 62, Math.PI * 1.5, Math.PI * 2, 8));
      }
      g.fillStyle(0x0b0e1c, 1);
      fp(g, [-9, -156, 9, -156, 7, -217, -7, -217]);
      if (!lit) {
        g.fillStyle(0x0b0e1c, 1);
        fp(g, [24, -170, 46, -176, 36, -150]);
      }
      // Телескоп
      const ang = lit ? -0.78 : -0.2;
      const tx = 8;
      const ty = -190;
      g.fillStyle(lit ? 0xc9a040 : 0x2a2838, 1);
      plank(g, tx + Math.cos(ang) * 40, ty + Math.sin(ang) * 40, 84, 16, ang);
      g.fillStyle(lit ? 0xe8c25a : 0x34324a, 1);
      plank(g, tx + Math.cos(ang) * 82, ty + Math.sin(ang) * 82, 10, 22, ang);
      const ex = tx + Math.cos(ang) * 88;
      const ey = ty + Math.sin(ang) * 88;
      if (lit) {
        g.fillStyle(0x9ad6ff, 1);
        g.fillCircle(ex, ey, 6);
        v.lights.push({ x: ex, y: ey, r: 14, c: 0x9ad6ff });
        g.fillStyle(0xfff1cc, 1);
        star(g, ex + 26, ey - 22, 6, 2.5);
        star(g, ex - 8, ey - 38, 4, 1.8);
      }
      if (!lit) {
        vines(g, [[-54, 0], [-50, -40], [-40, -80], [-46, -130]], p.moss, 5);
        cobweb(g, -15, -41, 16, -1, 1);
      }
      return {
        l: -70,
        r: 70,
        h: 250,
        sign: { mode: 'wall', x: 0, y: -134, w: 56, emblem: 'moon' },
        win: [
          [-32, -60, 14, 20],
          [32, -60, 14, 20],
        ],
        boxes: [
          [-32, -44, 28],
          [32, -44, 28],
        ],
        lamp: [82, 0, 60],
        garland: [arcPts(0, -158, 66, 64, Math.PI, Math.PI * 2, 8), [
          [-66, -150],
          [66, -150],
        ]],
        trim: [arcPts(0, -156, 62, 62, Math.PI, Math.PI * 2, 10)],
        flag: [0, -218, false],
        ext: { side: -1, at: -55, kind: 'cottage' },
        lv3: () => {
          // армиллярная сфера у входа
          g.lineStyle(3, GOLD, 1);
          g.strokeCircle(118, -40, 14);
          g.strokeEllipse(118, -40, 28, 10);
          g.fillStyle(GOLD, 1);
          g.fillRect(116, -26, 4, 20);
          g.fillRect(108, -8, 20, 6);
          v.lights.push({ x: 118, y: -40, r: 10 });
          grow(b, 102, 134, 56);
        },
      };
    }
    case 'owl-post': {
      shadow(g, 200);
      // Ствол с корнями
      g.fillStyle(lit ? 0x5a4030 : 0x1e1a24, 1);
      fp(g, [-24, 0, 24, 0, 16, -126, -16, -126]);
      fp(g, [-24, 0, -44, 4, -18, -24]);
      fp(g, [24, 0, 46, 4, 18, -22]);
      g.lineStyle(2, p.woodDark, 1);
      g.lineBetween(-6, -10, -2, -90);
      g.lineBetween(8, -30, 5, -110);
      // Лестница
      g.lineStyle(3, p.wood, 1);
      g.lineBetween(28, 0, 30, -124);
      g.lineBetween(42, 0, 44, -124);
      for (let y = -14, k = 0; y > -124; y -= 18, k++) if (lit || k % 3 !== 1) g.lineBetween(29, y, 43, y);
      // Площадка и подкосы
      g.fillStyle(p.woodDark, 1);
      g.fillRect(-80, -132, 160, 10);
      g.lineStyle(4, p.woodDark, 1);
      g.lineBetween(-14, -80, -64, -124);
      g.lineBetween(14, -80, 64, -124);
      // Домик
      g.fillStyle(p.wall, 1);
      g.fillRect(-60, -210, 120, 80);
      roof(g, 0, -210, 120, 60, p, lit);
      roundWindow(g, v, -32, -172, 12, p, false);
      roundWindow(g, v, 32, -172, 12, p, false);
      door(g, 0, -132, 22, 40, p, true);
      // Сова на коньке
      const owl = lit ? 0x2a2030 : 0x14121c;
      g.fillStyle(owl, 1);
      g.fillEllipse(0, -284, 26, 32);
      g.fillCircle(0, -298, 11);
      g.fillTriangle(-11, -302, -5, -304, -10, -314);
      g.fillTriangle(11, -302, 5, -304, 10, -314);
      g.fillStyle(lit ? 0xffd36b : 0x24222e, 1);
      g.fillCircle(-4.5, -298, 3.2);
      g.fillCircle(4.5, -298, 3.2);
      if (lit) v.lights.push({ x: 0, y: -298, r: 7 });
      // Почтовый ящик
      g.fillStyle(p.woodDark, 1);
      g.fillRect(93, -58, 6, 58);
      g.fillStyle(lit ? 0x3a6ab0 : 0x22263a, 1);
      g.fillRoundedRect(78, -78, 36, 22, { tl: 10, tr: 10, bl: 0, br: 0 });
      g.fillStyle(lit ? 0xd0504a : 0x2a2030, 1);
      g.fillRect(112, -84, 4, 14);
      g.fillRect(112, -84, 10, 6);
      if (lit) {
        g.fillStyle(0xf4ecd8, 1);
        g.fillRect(84, -62, 18, 4);
      }
      if (!lit) {
        cobweb(g, -64, -122, 20, 1, 1);
        g.fillStyle(p.wood, 1);
        plank(g, -78, -100, 46, 8, 1.3);
        vines(g, [[-20, -4], [-16, -50], [-12, -100]], p.moss, 5);
      }
      return {
        l: -80,
        r: 124,
        h: 316,
        sign: { mode: 'hang', x: -60, y: -194, dir: -1, w: 44, emblem: 'letter' },
        win: [[0, -234, 14, 14]],
        boxes: [
          [-32, -154, 30],
          [32, -154, 30],
        ],
        lamp: [-66, 0, 66],
        garland: [roofEdge(0, -210, 120, 60), [
          [-80, -124],
          [80, -124],
        ]],
        flag: [60, -212, false],
        ext: { side: 1, at: 60, kind: 'shed', y: -132 },
        lv2: () => {
          // письма в ящике и сова-почтальон на перилах
          g.fillStyle(0xf4ecd8, 1);
          plank(g, 96, -82, 16, 10, -0.3);
          hangLantern(g, v, -74, -122, 8, TEAL, true);
        },
      };
    }
    case 'mushroom-farm': {
      shadow(g, 320);
      // Грядки с грибами
      for (const side of [-1, 1]) {
        g.fillStyle(lit ? 0x4a3424 : 0x1e1a24, 1);
        g.fillEllipse(side * 118, -4, 82, 18);
        for (const [dx, s] of [
          [-24, 0.9],
          [0, 1.2],
          [24, 0.8],
        ] as const)
          mushroom(g, v, side * 118 + dx, -6, s, p, lv >= 1 && (dx === 0 || lv >= 2));
      }
      // Ножка-дом
      g.fillStyle(lit ? 0xe8dcc0 : 0x2a2a38, 1);
      fp(g, [-46, 0, 46, 0, 40, -100, -40, -100]);
      g.lineStyle(2, lit ? 0xc8bca0 : 0x22222e, 1);
      g.lineBetween(-20, -6, -16, -96);
      g.lineBetween(22, -6, 18, -96);
      door(g, -12, 0, 32, 58, p, true);
      roundWindow(g, v, 24, -64, 11, p);
      // Шляпка в пятнышках
      g.fillStyle(lit ? 0x8a2a28 : 0x1e1622, 1);
      g.fillEllipse(0, -96, 214, 26);
      g.fillStyle(lit ? 0xc2463a : 0x2a1e2c, 1);
      fp(g, arcPts(0, -96, 116, 80, Math.PI, Math.PI * 2, 24).flat());
      g.fillStyle(lit ? 0xf4ecd8 : 0x3a3446, 1);
      for (const [x, y, r] of [
        [-60, -124, 12],
        [-12, -152, 10],
        [40, -132, 14],
        [82, -110, 8],
        [-92, -104, 7],
        [10, -116, 6],
      ] as const)
        g.fillCircle(x, y, r);
      chimney(g, v, 64, -150, 28, p);
      if (!lit) {
        g.fillStyle(0x0a0b18, 1);
        g.fillCircle(-30, -108, 9);
        g.fillCircle(-22, -104, 6);
        cobweb(g, -28, -46, 16, 1, 1);
        g.fillStyle(p.wood, 1);
        plank(g, 50, -14, 50, 8, 0.35);
      }
      return {
        l: -162,
        r: 162,
        h: 186,
        sign: { mode: 'drop', x: -84, y: -92, w: 44, emblem: 'mushroom' },
        boxes: [[24, -46, 30]],
        lamp: [-184, 0, 60],
        garland: [arcPts(0, -98, 120, 84, Math.PI * 1.04, Math.PI * 1.96, 10)],
        trim: [arcPts(0, -96, 116, 80, Math.PI, Math.PI * 2, 16)],
        flag: [0, -176, false],
        ext: { side: 1, at: 160, kind: 'shed' },
        lv2: () => {
          // окошки в шляпке
          roundWindow(g, v, -50, -112, 8, p, false);
          roundWindow(g, v, 66, -100, 7, p, false);
        },
        lv3: () => {
          // большой светящийся гриб-фонарь
          mushroom(g, v, 160, 0, 2.2, p, true);
        },
      };
    }
    case 'sawmill': {
      shadow(g, 330);
      // Пруд под колесом
      g.fillStyle(lit ? 0x2a6aa0 : 0x101830, 1);
      g.fillEllipse(-120, -2, 150, 22);
      // Жёлоб на столбах
      g.fillStyle(p.woodDark, 1);
      g.fillRect(-196, -128, 6, 128);
      g.fillRect(-156, -128, 6, 128);
      g.fillStyle(p.wood, 1);
      g.fillRect(-206, -140, 96, 12);
      if (lit) {
        g.fillStyle(0x5a9ad6, 0.85);
        g.fillRect(-206, -144, 92, 5);
        g.fillStyle(0x7ab8e8, 0.7);
        g.fillRect(-118, -136, 8, 18);
      }
      // Сарай
      g.fillStyle(p.wood, 1);
      g.fillRect(-60, -110, 170, 110);
      g.lineStyle(2, p.woodDark, 1);
      for (let x = -50; x < 110; x += 16) g.lineBetween(x, -110, x, 0);
      if (!lit) {
        g.fillStyle(0x0a0b18, 1);
        g.fillRect(-10, -96, 10, 30);
        g.fillRect(6, -40, 10, 26);
      }
      roof(g, 25, -110, 170, 60, p, lit);
      g.fillStyle(p.woodDark, 1);
      g.fillRect(30, -76, 60, 76);
      g.lineStyle(3, p.wood, 1);
      g.lineBetween(30, -76, 90, 0);
      g.lineBetween(60, -76, 60, 0);
      windowAt(g, v, -25, -62, 28, 24, p, lit, false);
      // Пильный диск на фронтоне (на ур. 2 там окно)
      if (lv < 2) {
        g.fillStyle(lit ? 0xc8ccd8 : 0x2e3044, 1);
        g.fillCircle(25, -138, 13);
        for (let i = 0; i < 12; i++) {
          const a = (i / 12) * Math.PI * 2;
          g.fillTriangle(25 + Math.cos(a) * 12, -138 + Math.sin(a) * 12, 25 + Math.cos(a + 0.3) * 12, -138 + Math.sin(a + 0.3) * 12, 25 + Math.cos(a + 0.1) * 17, -138 + Math.sin(a + 0.1) * 17);
        }
        g.fillStyle(p.wood, 1);
        g.fillCircle(25, -138, 3);
      }
      // Поленница справа
      for (let r = 0; r < 3; r++) for (let c = 0; c < 4 - r; c++) logEnd(g, 140 + c * 17 + r * 8.5, -9 - r * 16, 9, p);
      // Водяное колесо — отдельным слоем (крутится)
      const rotor = scene.add.graphics().setPosition(-120, -62);
      rotor.lineStyle(6, p.woodDark, 1);
      rotor.strokeCircle(0, 0, 54);
      rotor.lineStyle(4, p.wood, 1);
      rotor.strokeCircle(0, 0, 30);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        if (!lit && i === 5) continue;
        rotor.lineStyle(4, p.woodDark, 1);
        rotor.lineBetween(0, 0, Math.cos(a) * 54, Math.sin(a) * 54);
        if (!lit && i % 3 === 1) continue;
        rotor.fillStyle(p.wood, 1);
        const c = Math.cos(a);
        const s = Math.sin(a);
        rotor.fillPoints([new V2(c * 50 - s * 6, s * 50 + c * 6), new V2(c * 66 - s * 6, s * 66 + c * 6), new V2(c * 66 + s * 6, s * 66 - c * 6), new V2(c * 50 + s * 6, s * 50 - c * 6)], true);
      }
      rotor.fillStyle(lv >= 3 ? GOLD : p.trim, 1);
      rotor.fillCircle(0, 0, 8);
      v.objects.push(rotor);
      v.rotor = rotor;
      v.rotorR = 70;
      if (!lit) {
        cobweb(g, -39, -74, 16, 1, 1);
        g.fillStyle(p.wood, 1);
        plank(g, 100, -24, 54, 9, -1.1);
      }
      return {
        l: -206,
        r: 196,
        h: 186,
        sign: { mode: 'wall', x: 60, y: -94, w: 56, emblem: 'log' },
        win: [[25, -138, 20, 18]],
        boxes: [[-25, -45, 44]],
        lamp: [114, 0, 58],
        garland: [roofEdge(25, -110, 170, 60)],
        flag: [25, -170, true],
        ext: { side: 1, at: 110, kind: 'shed' },
      };
    }
    case 'lamp-workshop': {
      shadow(g, 280);
      g.fillStyle(p.wall, 1);
      g.fillRect(-85, -120, 170, 120);
      g.lineStyle(3, p.wallDark, 1);
      g.lineBetween(-85, -86, 85, -86);
      roof(g, 0, -120, 170, 70, p, lit);
      chimney(g, v, -50, -140, 50, p);
      // Витрина с фонарями
      g.fillStyle(p.trim, 1);
      g.fillRect(-79, -84, 88, 58);
      g.fillStyle(lit ? 0x3a2a30 : p.window, 1);
      g.fillRect(-75, -80, 80, 50);
      const inside = [0xffd36b, TEAL, 0xff9e6b];
      for (let i = 0; i < 3; i++) {
        const x = -60 + i * 25;
        g.lineStyle(1.5, IRON, 1);
        g.lineBetween(x, -80, x, -70 + (i % 2) * 6);
        g.fillStyle(lit ? inside[i] : 0x1e2030, 1);
        g.fillRoundedRect(x - 6, -70 + (i % 2) * 6, 12, 15, 3);
        if (lit) v.lights.push({ x, y: -62 + (i % 2) * 6, r: 12, c: inside[i] });
      }
      g.lineStyle(2, p.trim, 1);
      g.lineBetween(-35, -80, -35, -30);
      door(g, 50, 0, 30, 60, p);
      // Балка с висячими фонариками
      g.fillStyle(p.woodDark, 1);
      g.fillRect(-138, -124, 276, 6);
      const hang = [
        [-128, 14, 0xffd36b, true],
        [-108, 26, TEAL, false],
        [108, 22, 0xff9e6b, true],
        [128, 10, TEAL, false],
      ] as const;
      for (const [x, len, c, round] of hang) {
        if (!lit && x === 108) continue;
        hangLantern(g, v, x, -118, len, c, lit, round);
      }
      if (!lit) {
        // упавший фонарик и паутина
        g.fillStyle(0x1e2030, 1);
        plank(g, 112, -6, 14, 18, 1.1);
        g.lineStyle(2, IRON, 1);
        g.lineBetween(108, -118, 104, -104);
        cobweb(g, -75, -80, 18, 1, 1);
        vines(g, [[84, 0], [80, -50], [70, -110]], p.moss, 5);
      }
      return {
        l: -140,
        r: 140,
        h: 230,
        sign: { mode: 'wall', x: -35, y: -102, w: 70, emblem: 'lamp' },
        win: [[0, -150, 20, 18]],
        boxes: [[-35, -24, 86]],
        lamp: [-166, 0, 62],
        garland: [roofEdge(0, -120, 170, 70)],
        trim: [
          roofEdge(0, -120, 170, 70),
          [
            [-138, -124],
            [138, -124],
          ],
        ],
        flag: [0, -190, false],
        ext: { side: 1, at: 140, kind: 'kiosk' },
        lv2: () => {
          for (const [x, len, c] of [
            [-90, 34, 0xffb3cf],
            [92, 38, 0x9ad6ff],
          ] as const)
            hangLantern(g, v, x, -118, len, c, true, true);
        },
      };
    }
    case 'teahouse': {
      shadow(g, 300);
      // Каменное основание со ступенями
      g.fillStyle(p.stone, 1);
      g.fillRect(-130, -24, 260, 24);
      g.fillStyle(p.stoneDark, 1);
      g.fillRect(-30, -12, 60, 12);
      g.lineStyle(2, p.stoneDark, 1);
      g.lineBetween(-130, -24, 130, -24);
      // Бумажные стены
      const paper = lit ? 0xf0dcb0 : 0x1c2030;
      g.fillStyle(paper, lit ? 0.95 : 1);
      g.fillRect(-110, -114, 220, 90);
      g.lineStyle(2, lit ? 0x8a5a3a : 0x262a3a, 1);
      for (let x = -95; x < 110; x += 15) g.lineBetween(x, -114, x, -24);
      for (let y = -99; y < -24; y += 15) g.lineBetween(-110, y, 110, y);
      if (lit)
        for (const x of [-75, 0, 75]) v.lights.push({ x, y: -70, r: 34 });
      else {
        g.fillStyle(0x0a0b18, 1);
        fp(g, [-70, -90, -52, -96, -56, -70, -74, -74]);
        fp(g, [40, -60, 58, -66, 50, -44]);
      }
      // Столбы
      g.fillStyle(lit ? 0x8a3a2a : 0x241c26, 1);
      for (const x of [-112, -40, 40, 112]) g.fillRect(x - 5, -120, 10, 96);
      // Нижняя крыша с загнутыми краями
      g.fillStyle(p.roof, 1);
      fp(g, [-178, -134, -150, -120, -120, -114, 120, -114, 150, -120, 178, -134, 112, -150, -112, -150]);
      g.fillStyle(p.roofDark, 1);
      fp(g, [-150, -120, -120, -114, 120, -114, 150, -120, 120, -120, -120, -120]);
      // Второй ярус
      g.fillStyle(paper, 1);
      g.fillRect(-58, -184, 116, 36);
      g.lineStyle(2, lit ? 0x8a5a3a : 0x262a3a, 1);
      for (let x = -43; x < 58; x += 15) g.lineBetween(x, -184, x, -148);
      if (lit) v.lights.push({ x: 0, y: -166, r: 26 });
      g.fillStyle(p.roof, 1);
      fp(g, [-118, -196, -96, -186, -70, -182, 70, -182, 96, -186, 118, -196, 56, -226, -56, -226]);
      g.fillStyle(lv >= 3 ? GOLD : p.trim, 1);
      g.fillRect(-3, -244, 6, 20);
      g.fillCircle(0, -246, 6);
      // Бумажные фонари на углах
      for (const x of [-150, 150]) {
        g.lineStyle(2, IRON, 1);
        g.lineBetween(x, -120, x, -106);
        g.fillStyle(lit ? 0xe85a3a : 0x2a1e26, 1);
        g.fillEllipse(x, -94, 18, 24);
        g.fillStyle(IRON, 1);
        g.fillRect(x - 5, -108, 10, 3);
        g.fillRect(x - 5, -83, 10, 3);
        if (lit) v.lights.push({ x, y: -94, r: 14, c: 0xff8a5a });
      }
      // Низкий столик с чайником
      g.fillStyle(p.woodDark, 1);
      g.fillRect(-36, -40, 72, 6);
      g.fillRect(-30, -34, 5, 10);
      g.fillRect(25, -34, 5, 10);
      g.fillStyle(lit ? 0x7ac8b0 : 0x24303a, 1);
      g.fillCircle(-8, -48, 9);
      g.fillRect(0, -52, 10, 3);
      g.fillRect(-11, -59, 6, 4);
      g.fillStyle(lit ? 0xf4ecd8 : 0x2a2a38, 1);
      g.fillRect(12, -46, 7, 6);
      g.fillRect(23, -46, 7, 6);
      if (!lit) {
        cobweb(g, -107, -114, 18, 1, 1);
        vines(g, [[-130, -24], [-120, -70], [-112, -112]], p.moss, 5);
      }
      return {
        l: -180,
        r: 180,
        h: 252,
        sign: { mode: 'drop', x: -76, y: -114, w: 40, emblem: 'cup' },
        boxes: [
          [-90, -36, 36],
          [90, -36, 36],
        ],
        lamp: [-200, 0, 56],
        garland: [
          [
            [-176, -136],
            [-120, -118],
            [120, -118],
            [176, -136],
          ],
          [
            [-116, -198],
            [-70, -184],
            [70, -184],
            [116, -198],
          ],
        ],
        flag: [0, -246, false],
        ext: { side: 1, at: 130, kind: 'veranda' },
        lv2: () => {
          for (const x of [-90, 90]) {
            g.lineStyle(2, IRON, 1);
            g.lineBetween(x, -114, x, -104);
            g.fillStyle(0xffb35a, 1);
            g.fillEllipse(x, -94, 14, 18);
            v.lights.push({ x, y: -94, r: 12, c: 0xffb35a });
          }
        },
      };
    }
    case 'forester': {
      shadow(g, 300);
      // Колода с топором
      g.fillStyle(p.wood, 1);
      g.fillRect(-148, -28, 34, 28);
      g.fillStyle(lit ? 0xc9a070 : 0x2c2634, 1);
      g.fillEllipse(-131, -28, 34, 10);
      g.lineStyle(3, p.woodDark, 1);
      g.lineBetween(-128, -30, -108, -64);
      g.fillStyle(lit ? 0xc8ccd8 : 0x2e3044, 1);
      fp(g, [-136, -26, -122, -40, -116, -34, -126, -22]);
      // Изба из брёвен
      for (let y = 0, k = 0; y > -110; y -= 18, k++) {
        g.fillStyle(k % 2 ? p.wood : p.woodDark, 1);
        g.fillRoundedRect(-92, y - 18, 184, 17, 8);
        logEnd(g, -94, y - 9, 8, p);
        logEnd(g, 94, y - 9, 8, p);
      }
      roof(g, 0, -110, 180, 80, p, lit);
      chimney(g, v, 60, -138, 56, p);
      door(g, 0, 0, 34, 64, p);
      g.lineStyle(2, p.wood, 1);
      g.lineBetween(-17, -32, 17, -32);
      // Рога над дверью
      g.lineStyle(4, lit ? 0xd8c8a0 : 0x343448, 1);
      for (const d of [-1, 1]) {
        sp(g, [
          [d * 4, -74],
          [d * 18, -84],
          [d * 26, -100],
        ]);
        g.lineBetween(d * 14, -81, d * 14, -94);
        g.lineBetween(d * 22, -92, d * 32, -96);
      }
      windowAt(g, v, -54, -60, 28, 24, p, lit);
      windowAt(g, v, 54, -60, 28, 24, p, lit);
      // Поленница под навесом
      g.fillStyle(p.roofDark, 1);
      fp(g, [104, -62, 176, -50, 176, -44, 104, -56]);
      for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) logEnd(g, 116 + c * 16, -8 - r * 15, 8, p);
      if (!lit) {
        vines(g, [[-90, -4], [-80, -40], [-70, -90]], p.moss, 6);
        cobweb(g, -68, -72, 16, 1, 1);
        g.fillStyle(p.wood, 1);
        plank(g, 150, 2, 54, 12, 0.05);
      }
      return {
        l: -150,
        r: 180,
        h: 210,
        sign: { mode: 'hang', x: -92, y: -96, dir: -1, w: 44, emblem: 'tree' },
        win: [[0, -142, 22, 18]],
        boxes: [
          [-54, -42, 42],
          [54, -42, 42],
        ],
        lamp: [-176, 0, 60],
        garland: [roofEdge(0, -110, 180, 80)],
        flag: [0, -190, true],
        ext: { side: -1, at: -94, kind: 'shed' },
        lv3: () => {
          g.lineStyle(4, GOLD, 1);
          for (const d of [-1, 1])
            sp(g, [
              [d * 4, -74],
              [d * 18, -84],
              [d * 26, -100],
            ]);
        },
      };
    }
    case 'swing-bridge': {
      const deckY = (x: number) => -40 + 26 * (1 - (x / 150) ** 2);
      const railY = (x: number) => -108 + 30 * (1 - (x / 150) ** 2);
      // Ручей под мостом
      g.fillStyle(lit ? 0x2a6aa0 : 0x101830, 1);
      g.fillEllipse(0, 4, 200, 18);
      g.fillStyle(0x000000, 0.3);
      g.fillEllipse(-150, 6, 50, 14);
      g.fillEllipse(150, 6, 50, 14);
      // Нижние канаты
      g.lineStyle(3, lit ? 0xb89a70 : 0x2c2a38, 1);
      const deck: Pt[] = [];
      for (let x = -150; x <= 150; x += 15) deck.push([x, deckY(x) + 4]);
      sp(g, deck);
      // Доски
      for (let i = 0, x = -136; x <= 136; x += 17, i++) {
        if (!lit && i % 4 === 1) continue;
        g.fillStyle(i % 2 ? p.wood : p.woodDark, 1);
        const a = Math.atan2(deckY(x + 4) - deckY(x - 4), 8);
        plank(g, x, deckY(x), 14, 9, a);
      }
      if (!lit) {
        g.fillStyle(p.wood, 1);
        plank(g, -100 + 17 * 0.5, deckY(-100) + 22, 14, 9, 1.2);
      }
      // Столбы с фонарями
      for (const x of [-150, 150]) {
        g.fillStyle(p.woodDark, 1);
        g.fillRect(x - 7, -130, 14, 132);
        g.fillStyle(lv >= 3 ? GOLD : p.wood, 1);
        g.fillRect(x - 10, -134, 20, 6);
        lampPost(g, v, x, -134, 2, p);
      }
      // Поручни и вертикальные верёвки
      g.lineStyle(3, lit ? 0xc8b090 : 0x2c2a38, 1);
      const rail: Pt[] = [];
      const railEnd = lit ? 150 : 40;
      for (let x = -150; x <= railEnd; x += 15) rail.push([x, railY(x)]);
      sp(g, rail);
      if (!lit) {
        sp(g, [
          [40, railY(40)],
          [52, railY(40) + 40],
          [48, railY(40) + 62],
        ]);
      }
      g.lineStyle(2, lit ? 0xc8b090 : 0x2c2a38, 1);
      for (let x = -120; x <= (lit ? 120 : 30); x += 30) g.lineBetween(x, railY(x), x, deckY(x));
      return {
        l: -165,
        r: 165,
        h: 170,
        sign: { mode: 'hang', x: -157, y: -100, dir: -1, w: 44, emblem: 'arch' },
        boxes: [
          [-122, -14, 30],
          [122, -14, 30],
        ],
        garland: [rail.filter((_, i) => i % 2 === 0)],
        trim: [
          [
            [-157, -128],
            [-143, -128],
          ],
        ],
        flag: [150, -164, false],
        ext: { side: 1, at: 160, kind: 'shed' },
        lv2: () => {
          for (const x of [-60, 60]) hangLantern(g, v, x, railY(x), 6, TEAL, true);
        },
        lv3: () => flag(b, -150, -164, false),
      };
    }
    case 'glow-lake': {
      // Берег и камни
      g.fillStyle(p.leafDark, 1);
      g.fillEllipse(0, -14, 336, 96);
      g.fillStyle(p.stone, 1);
      for (const [x, y, w] of [
        [-150, -10, 24],
        [-120, 18, 20],
        [80, 22, 26],
        [130, 10, 18],
        [-40, 28, 22],
        [10, -56, 18],
      ] as const)
        g.fillEllipse(x, y, w, w * 0.6);
      // Вода
      g.fillStyle(lit ? 0x1f8a90 : 0x0c1622, 1);
      g.fillEllipse(0, -14, 300, 74);
      if (lit) {
        g.fillStyle(0x3ac8c0, 0.5);
        g.fillEllipse(-10, -16, 220, 46);
        g.lineStyle(3, 0xbff8ee, 0.8);
        for (const [x, y, w] of [
          [-80, -22, 30],
          [30, -6, 40],
          [-10, -32, 24],
          [70, -24, 20],
        ] as const)
          g.lineBetween(x - w / 2, y, x + w / 2, y);
        for (const x of [-70, 0, 70]) v.lights.push({ x, y: -14, r: 38, c: TEAL });
      } else {
        g.lineStyle(2, 0x1e2a36, 1);
        g.lineBetween(-60, -18, -20, -18);
        g.lineBetween(20, -8, 60, -8);
        // плавающая коряга
        g.fillStyle(p.woodDark, 1);
        plank(g, -30, -2, 60, 9, 0.12);
      }
      // Кувшинки
      for (const [x, y] of [
        [-90, -10],
        [-46, -28],
        [36, -2],
      ] as const) {
        g.fillStyle(lit ? 0x3e8a4a : 0x15221b, 1);
        g.fillEllipse(x, y, 26, 11);
        g.fillStyle(lit ? 0x3ac8c0 : 0x0c1622, 1);
        g.fillTriangle(x, y, x + 13, y - 3, x + 13, y + 3);
        if (lit) {
          g.fillStyle(0xffb3cf, 1);
          g.fillCircle(x - 4, y - 4, 4);
        }
      }
      // Камыши
      for (const [x, h] of [
        [-136, 60],
        [-126, 74],
        [-116, 54],
      ] as const) {
        g.lineStyle(3, p.leaf, 1);
        g.lineBetween(x, -10, x + 3, -10 - h);
        g.fillStyle(lit ? 0x7a5236 : 0x221f2b, 1);
        g.fillEllipse(x + 3, -10 - h + 8, 7, 18);
      }
      // Мостки
      g.fillStyle(p.woodDark, 1);
      for (const x of [86, 146]) g.fillRect(x - 3, -22, 6, 26);
      g.fillStyle(p.wood, 1);
      g.fillRect(70, -28, 86, 10);
      g.lineStyle(2, p.woodDark, 1);
      for (let x = 82; x < 156; x += 12) g.lineBetween(x, -28, x, -18);
      // Светлячки
      if (lit)
        for (const [x, y] of [
          [-60, -70],
          [-20, -96],
          [24, -78],
          [60, -104],
          [96, -72],
          [-100, -88],
        ] as const) {
          g.fillStyle(FIREFLY, 1);
          g.fillCircle(x, y, 3);
          v.lights.push({ x, y, r: 7, c: FIREFLY });
        }
      if (!lit) cobweb(g, -126, -84, 14, 1, 1);
      return {
        l: -170,
        r: 170,
        h: 120,
        sign: { mode: 'stand', x: -158, y: 6, w: 40, emblem: 'fish' },
        lamp: [150, -24, 46],
        garland: [
          [
            [-150, -112],
            [0, -120],
            [118, -112],
          ],
        ],
        trim: [
          [
            [70, -28],
            [156, -28],
          ],
        ],
        flag: [-150, -112, false],
        ext: { side: 1, at: 168, kind: 'gazebo' },
        lv2: () => {
          // кораблики со свечками
          for (const [x, y] of [
            [-20, -20],
            [60, -12],
          ] as const) {
            g.fillStyle(0xf4ecd8, 1);
            fp(g, [x - 10, y, x + 10, y, x + 6, y + 5, x - 6, y + 5]);
            g.fillStyle(0xffd36b, 1);
            g.fillCircle(x, y - 4, 3);
            v.lights.push({ x, y: y - 4, r: 9 });
          }
        },
        lv3: () => {
          // шесты для гирлянды
          g.fillStyle(p.woodDark, 1);
          g.fillRect(-153, -112, 6, 116);
          g.fillRect(115, -112, 6, 90);
          g.fillStyle(GOLD, 1);
          g.fillCircle(118, -114, 4);
        },
      };
    }
  }
  return null;
}

/** Постройка без рисунка (неизвестный id): простой домик. */
function generic(b: B): Up {
  const { g, v, p, lit } = b;
  shadow(g, 200);
  g.fillStyle(p.wall, 1);
  g.fillRect(-80, -100, 160, 100);
  roof(g, 0, -100, 160, 70, p, lit);
  door(g, 0, 0, 30, 56, p);
  windowAt(g, v, -46, -56, 26, 24, p, lit);
  windowAt(g, v, 46, -56, 26, 24, p, lit);
  return {
    l: -96,
    r: 96,
    h: 190,
    sign: { mode: 'hang', x: 80, y: -90, dir: 1, emblem: 'house' },
    boxes: [
      [-46, -40, 40],
      [46, -40, 40],
    ],
    lamp: [-120, 0, 60],
    garland: [roofEdge(0, -100, 160, 70)],
    flag: [0, -170, true],
    ext: { side: 1, at: 80, kind: 'shed' },
  };
}

// ---------------------------------------------------------------------------

/**
 * Рисунок постройки. lit=false — заброшена (уровень 0); при lit уровень 1–3:
 * 1 — восстановлена, 2 — улучшена, 3 — расцвет.
 */
export function drawBuilding(scene: Phaser.Scene, id: string, lit: boolean, level = 1): BuildingView {
  const lv = lit ? Phaser.Math.Clamp(Math.round(level), 1, 3) : 0;
  const back = scene.add.graphics();
  const g = scene.add.graphics();
  const front = scene.add.graphics();
  const v: BuildingView = { objects: [back, g, front], height: 200, width: 200, lights: [], chimneys: [], residents: 0 };
  const p = FOREST.has(id) ? forestPal(lit) : MOUNTAIN.has(id) ? mountainPal(lit) : pal(lit);
  const b: B = { scene, g, back, front, v, p, lit, lv, l: 0, r: 0, top: 0 };
  const u = valley(b, id) ?? forest(b, id) ?? mountain(b, id) ?? generic(b);
  grow(b, u.l, u.r, u.h);
  if (lv >= 2) level2(b, u);
  if (lv >= 3) level3(b, u);
  // Отцентровать по занятой земле (с пристройкой, фонарём, вывеской).
  const dx = Math.round(-(b.l + b.r) / 2);
  if (dx) {
    for (const o of v.objects) (o as Phaser.GameObjects.Graphics).x += dx;
    for (const l of v.lights) l.x += dx;
    for (const c of v.chimneys) c.x += dx;
    if (v.beam) v.beam.x += dx;
  }
  v.width = Math.round(b.r - b.l);
  v.height = Math.round(Math.max(u.h, b.top));
  const base = id === 'square' || id === 'well' || id === 'teahouse' || id === 'goat-farm' || id === 'hot-springs' ? 2 : 1;
  v.residents = lv === 0 ? 0 : base + lv - 1;
  return v;
}
