// Lumo из частей гардероба: головной убор, лицо, одежда с палитрой, посох с фонарём, аксессуар,
// питомец и след. Всё рисуется фигурами Phaser Graphics (без картинок). Данные — src/core/wardrobe.ts.
//
// Единицы: s — размер Lumo (как в drawLumo): фигура примерно от -0.55s до +0.45s по вертикали,
// центр ~ (0, 0), земля (тень) — на y = 0.42s. Питомец — PET_K·s.

import Phaser from 'phaser';
import { C } from './theme';
import { DEFAULT_LOOK, fullSet, itemById, paletteOf, type Look, type Palette } from '../core/wardrobe';

type G = Phaser.GameObjects.Graphics;
type Pt = { x: number; y: number };

// ---------------------------------------------------------------------------
// Перо: рисование в единицах размера s, с зеркалом по X (fx) и сдвигом (ox, oy) в пикселях.

class Pen {
  constructor(
    readonly g: G,
    readonly s: number,
    readonly fx: number = 1,
    readonly ox = 0,
    readonly oy = 0,
  ) {}
  X(v: number) {
    return this.ox + this.fx * v * this.s;
  }
  Y(v: number) {
    return this.oy + v * this.s;
  }
  /** Новое перо с началом в точке (x, y) и масштабом k. */
  at(x: number, y: number, k = 1) {
    return new Pen(this.g, this.s * k, this.fx, this.X(x), this.Y(y));
  }
  pts(f: number[]): Pt[] {
    const out: Pt[] = [];
    for (let i = 0; i + 1 < f.length; i += 2) out.push({ x: this.X(f[i]), y: this.Y(f[i + 1]) });
    return out;
  }
  circle(x: number, y: number, r: number, c: number, a = 1) {
    this.g.fillStyle(c, a);
    this.g.fillCircle(this.X(x), this.Y(y), r * this.s);
  }
  ring(x: number, y: number, r: number, w: number, c: number, a = 1) {
    this.g.lineStyle(w * this.s, c, a);
    this.g.strokeCircle(this.X(x), this.Y(y), r * this.s);
  }
  ellipse(x: number, y: number, w: number, h: number, c: number, a = 1, rot = 0) {
    if (!rot) {
      this.g.fillStyle(c, a);
      this.g.fillEllipse(this.X(x), this.Y(y), w * this.s, h * this.s);
    } else this.poly(ellP(x, y, w / 2, h / 2, rot), c, a);
  }
  rect(x: number, y: number, w: number, h: number, c: number, a = 1, r = 0) {
    const left = this.fx > 0 ? this.X(x) : this.X(x + w);
    const rr = Math.min(r, w / 2, h / 2) * this.s;
    this.g.fillStyle(c, a);
    if (rr > 0.5) this.g.fillRoundedRect(left, this.Y(y), w * this.s, h * this.s, rr);
    else this.g.fillRect(left, this.Y(y), w * this.s, h * this.s);
  }
  poly(f: number[], c: number, a = 1) {
    this.g.fillStyle(c, a);
    this.g.fillPoints(this.pts(f), true);
  }
  tri(x1: number, y1: number, x2: number, y2: number, x3: number, y3: number, c: number, a = 1) {
    this.g.fillStyle(c, a);
    this.g.fillTriangle(this.X(x1), this.Y(y1), this.X(x2), this.Y(y2), this.X(x3), this.Y(y3));
  }
  stroke(f: number[], w: number, c: number, a = 1, closed = false) {
    this.g.lineStyle(w * this.s, c, a);
    this.g.strokePoints(this.pts(f), closed, closed);
  }
  /** Линия с круглыми концами. */
  line(x1: number, y1: number, x2: number, y2: number, w: number, c: number, a = 1) {
    this.g.lineStyle(w * this.s, c, a);
    this.g.lineBetween(this.X(x1), this.Y(y1), this.X(x2), this.Y(y2));
    this.circle(x1, y1, w / 2, c, a);
    this.circle(x2, y2, w / 2, c, a);
  }
  star(x: number, y: number, r: number, c: number, a = 1, inner = 0.45) {
    this.poly(starP(x, y, r, inner), c, a);
  }
  /** Ломаная с круглыми концами (для толстых кривых: волосы, посох, хвосты). */
  path(f: number[], w: number, c: number, a = 1) {
    this.stroke(f, w, c, a);
    // Круглые «суставы»: гладкая толстая кривая без зазоров на изгибах.
    for (let i = 0; i + 1 < f.length; i += 2) this.circle(f[i], f[i + 1], w / 2, c, a);
  }
}

// Геометрия в единицах (плоские массивы x, y, x, y, …)
function quad(x0: number, y0: number, cx: number, cy: number, x1: number, y1: number, n = 10): number[] {
  const out: number[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const a = (1 - t) * (1 - t);
    const b = 2 * (1 - t) * t;
    const d = t * t;
    out.push(a * x0 + b * cx + d * x1, a * y0 + b * cy + d * y1);
  }
  return out;
}
function arcP(cx: number, cy: number, rx: number, ry: number, a0: number, a1: number, n = 16): number[] {
  const out: number[] = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    out.push(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry);
  }
  return out;
}
function ellP(cx: number, cy: number, rx: number, ry: number, rot = 0, n = 24): number[] {
  const out: number[] = [];
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const x = Math.cos(a) * rx;
    const y = Math.sin(a) * ry;
    out.push(cx + x * c - y * s, cy + x * s + y * c);
  }
  return out;
}
function starP(cx: number, cy: number, r: number, inner = 0.45, n = 5, rot = -Math.PI / 2): number[] {
  const out: number[] = [];
  for (let i = 0; i < n * 2; i++) {
    const a = rot + (i * Math.PI) / n;
    const rr = i % 2 === 0 ? r : r * inner;
    out.push(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
  }
  return out;
}
/** Рукав/лапа: четырёхугольник от A к B с шириной w0 у A и w1 у B. */
function limb(ax: number, ay: number, bx: number, by: number, w0: number, w1: number): number[] {
  const dx = bx - ax;
  const dy = by - ay;
  const l = Math.hypot(dx, dy) || 1;
  const nx = -dy / l;
  const ny = dx / l;
  return [ax + (nx * w0) / 2, ay + (ny * w0) / 2, bx + (nx * w1) / 2, by + (ny * w1) / 2, bx - (nx * w1) / 2, by - (ny * w1) / 2, ax - (nx * w0) / 2, ay - (ny * w0) / 2];
}
const cat = (...parts: number[][]) => ([] as number[]).concat(...parts);

/** Смешать цвет с другим (t = 0 — первый, 1 — второй). */
function mix(a: number, b: number, t: number): number {
  const ca = Phaser.Display.Color.IntegerToColor(a);
  const cb = Phaser.Display.Color.IntegerToColor(b);
  return Phaser.Display.Color.GetColor(
    Math.round(ca.red + (cb.red - ca.red) * t),
    Math.round(ca.green + (cb.green - ca.green) * t),
    Math.round(ca.blue + (cb.blue - ca.blue) * t),
  );
}

// ---------------------------------------------------------------------------
// Константы фигуры

const SKIN = 0xffe3c2;
const SKIN_SH = 0xf2c9a2;
const INK = 0x1a1a2e;
const BLUSH = 0xff9e9e;
const HAIR = 0x6b4130;
const PANTS = 0x34304d;
const SHOE = 0x241c30;
const WOOD = 0x6b4a2b;
const WOOD_LIGHT = 0x8f6a44;
const METAL = 0x4a3f5e;
const FRAME = 0xd99a2e;
const GOLD = 0xffcf4d;
const GOLD_DARK = 0xc9952a;
const SHIRT = 0xf3ead8;

/** Голова. */
const HY = -0.05;
const HR = 0.205;
/** Глаза. */
const EX = 0.078;
const EY = -0.005;
/** Плечо свободной руки (точка поворота при взмахе) и кисть с посохом. */
const ARM_PIVOT = { x: -0.165, y: 0.085 };
const STAFF_HAND = { x: 0.31, y: 0.17 };
const STAFF_B = { x: 0.28, y: 0.41 };
const STAFF_T = { x: 0.35, y: -0.03 };

const LONG_OUTFITS = new Set(['outfit-cloak', 'outfit-long-cloak', 'outfit-robe', 'outfit-star-robe', 'outfit-apron']);

/** Где фонарь на посохе (центр свечения), в единицах s при взгляде вправо. */
export function lanternPos(staffId: string): Pt {
  switch (staffId) {
    case 'staff-crook':
      return { x: 0.5, y: 0.03 };
    case 'staff-paper':
      return { x: 0.45, y: -0.08 };
    case 'staff-crystal':
      return { x: 0.36, y: -0.13 };
    case 'staff-moon':
      return { x: 0.36, y: -0.14 };
    default:
      return { x: 0.37, y: -0.13 };
  }
}

/** Цвет свечения фонаря на посохе (для картинки 'glow'). */
export function lanternGlowOf(staffId: string): number {
  switch (staffId) {
    case 'staff-paper':
      return 0xffa060;
    case 'staff-crystal':
      return 0x9fe8ff;
    case 'staff-ice':
      return 0xc4f0ff;
    case 'staff-moon':
      return 0xfff1cc;
    default:
      return C.lanternOn;
  }
}

// ---------------------------------------------------------------------------
// Лицо

function eyeOval(p: Pen, x: number, y: number, k = 1) {
  p.ellipse(x, y, 0.062 * k, 0.078 * k, INK);
  p.circle(x + 0.013 * k, y - 0.018 * k, 0.015 * k, 0xffffff);
  p.circle(x - 0.011 * k, y + 0.014 * k, 0.007 * k, 0xffffff, 0.85);
}
function closedEye(p: Pen, x: number, y: number) {
  p.stroke(arcP(x, y - 0.012, 0.03, 0.026, 0.35, Math.PI - 0.35, 10), 0.016, INK);
}
function smallSmile(p: Pen, w = 0.032, y = 0.05) {
  p.stroke(arcP(0, y - 0.012, w, 0.024, 0.45, Math.PI - 0.45, 10), 0.014, INK);
}
function blush(p: Pen, a = 0.55, k = 1) {
  p.ellipse(-0.135, 0.05, 0.075 * k, 0.042 * k, BLUSH, a);
  p.ellipse(0.135, 0.05, 0.075 * k, 0.042 * k, BLUSH, a);
}
function plainEyes(p: Pen, blink: boolean) {
  for (const x of [-EX, EX]) blink ? closedEye(p, x, EY) : eyeOval(p, x, EY);
}

function drawFace(p: Pen, face: string, blink: boolean) {
  switch (face) {
    case 'face-smile': {
      // Глаза-дуги ^^ и открытая улыбка
      blush(p, 0.65);
      for (const x of [-EX, EX]) p.stroke(arcP(x, EY + 0.018, 0.031, 0.03, Math.PI + 0.3, Math.PI * 2 - 0.3, 10), 0.018, INK);
      p.poly(arcP(0, 0.04, 0.042, 0.04, 0, Math.PI, 12), INK);
      p.ellipse(0, 0.066, 0.036, 0.018, 0xff7a8a);
      break;
    }
    case 'face-sly': {
      // Хитрый прищур: верхнее веко ровное, глаза смотрят вбок; ухмылка набок, одна бровь выше
      blush(p, 0.45);
      for (const x of [-EX, EX]) {
        if (blink) closedEye(p, x, EY);
        else {
          p.poly(cat(arcP(x, EY - 0.008, 0.033, 0.034, 0, Math.PI, 10)), INK);
          p.circle(x + 0.014, EY + 0.006, 0.009, 0xffffff);
          p.line(x - 0.038, EY - 0.012, x + 0.038, EY - 0.004, 0.014, INK);
        }
      }
      p.line(-EX - 0.035, EY - 0.05, -EX + 0.03, EY - 0.045, 0.013, HAIR);
      p.stroke(arcP(EX, EY - 0.04, 0.035, 0.022, Math.PI + 0.3, Math.PI * 2 - 0.3, 8), 0.013, HAIR);
      p.stroke(quad(-0.04, 0.052, 0.0, 0.07, 0.045, 0.036, 10), 0.014, INK);
      p.line(0.045, 0.036, 0.052, 0.03, 0.012, INK);
      break;
    }
    case 'face-surprised': {
      blush(p, 0.4);
      for (const x of [-EX, EX]) {
        if (blink) closedEye(p, x, EY);
        else {
          p.circle(x, EY, 0.04, INK);
          p.circle(x + 0.015, EY - 0.016, 0.016, 0xffffff);
          p.circle(x - 0.013, EY + 0.016, 0.008, 0xffffff, 0.85);
        }
        p.stroke(arcP(x, EY - 0.055, 0.03, 0.016, Math.PI + 0.35, Math.PI * 2 - 0.35, 8), 0.012, HAIR);
      }
      p.ellipse(0, 0.068, 0.04, 0.05, INK);
      p.ellipse(0, 0.078, 0.022, 0.018, 0xff7a8a);
      break;
    }
    case 'face-sleepy': {
      // Полуприкрытые глаза: видна нижняя половина, сверху тяжёлое веко
      blush(p, 0.5);
      for (const x of [-EX, EX]) {
        if (!blink) {
          p.poly(arcP(x, EY + 0.006, 0.033, 0.03, 0, Math.PI, 10), INK);
          p.circle(x + 0.012, EY + 0.012, 0.007, 0xffffff, 0.8);
        }
        // Тяжёлое веко: ровная черта, чуть опущенная к краям
        p.stroke(quad(x - 0.04, EY + 0.012, x, EY - 0.002, x + 0.04, EY + 0.012, 8), 0.017, INK);
      }
      p.ellipse(0, 0.062, 0.03, 0.022, INK);
      break;
    }
    case 'face-determined': {
      // Брови «домиком вниз» и твёрдо сжатые губы с полуулыбкой
      blush(p, 0.35);
      for (const x of [-EX, EX]) {
        if (blink) closedEye(p, x, EY + 0.006);
        else {
          p.ellipse(x, EY + 0.006, 0.058, 0.066, INK);
          p.circle(x + 0.012, EY - 0.008, 0.013, 0xffffff);
        }
      }
      p.line(-EX - 0.042, EY - 0.072, -EX + 0.036, EY - 0.04, 0.02, HAIR);
      p.line(EX + 0.042, EY - 0.072, EX - 0.036, EY - 0.04, 0.02, HAIR);
      p.stroke(quad(-0.034, 0.058, 0.0, 0.064, 0.036, 0.05, 8), 0.015, INK);
      break;
    }
    case 'face-freckles': {
      blush(p, 0.4);
      plainEyes(p, blink);
      for (const sx of [-1, 1])
        for (const [dx, dy] of [
          [0.12, 0.035],
          [0.15, 0.055],
          [0.11, 0.065],
          [0.145, 0.03],
        ])
          p.circle(sx * dx, dy, 0.009, 0xc07a4a, 0.85);
      smallSmile(p);
      break;
    }
    case 'face-blush': {
      blush(p, 0.85, 1.25);
      for (const sx of [-1, 1])
        for (const d of [-0.02, 0, 0.02]) p.line(sx * (0.12 + d), 0.06, sx * (0.13 + d), 0.04, 0.007, 0xe85a6a, 0.8);
      plainEyes(p, blink);
      smallSmile(p, 0.03);
      break;
    }
    case 'face-glasses': {
      blush(p, 0.45);
      plainEyes(p, blink);
      for (const x of [-EX, EX]) {
        p.circle(x, EY, 0.056, 0xffffff, 0.12);
        p.ring(x, EY, 0.056, 0.014, 0x4a3426);
        p.stroke(arcP(x, EY, 0.042, 0.042, Math.PI * 1.15, Math.PI * 1.45, 5), 0.009, 0xffffff, 0.75);
      }
      p.stroke(arcP(0, EY + 0.004, 0.024, 0.014, Math.PI + 0.3, Math.PI * 2 - 0.3, 6), 0.012, 0x4a3426);
      p.line(-EX - 0.056, EY - 0.008, -0.2, EY - 0.02, 0.011, 0x4a3426);
      p.line(EX + 0.056, EY - 0.008, 0.2, EY - 0.02, 0.011, 0x4a3426);
      smallSmile(p);
      break;
    }
    case 'face-monocle': {
      blush(p, 0.4);
      plainEyes(p, blink);
      p.circle(EX, EY, 0.06, 0xffffff, 0.14);
      p.ring(EX, EY, 0.06, 0.014, GOLD);
      p.stroke(arcP(EX, EY, 0.045, 0.045, Math.PI * 1.15, Math.PI * 1.45, 5), 0.009, 0xffffff, 0.8);
      p.stroke(quad(EX + 0.03, EY + 0.052, 0.12, 0.09, 0.15, 0.1, 10), 0.008, GOLD);
      p.line(-EX - 0.035, EY - 0.055, -EX + 0.03, EY - 0.06, 0.012, HAIR);
      smallSmile(p, 0.028);
      break;
    }
    case 'face-mustache': {
      blush(p, 0.4);
      plainEyes(p, blink);
      // Пышные закрученные усы
      for (const sx of [-1, 1]) {
        p.ellipse(sx * 0.038, 0.058, 0.08, 0.042, 0x5a3424, 1, sx * -0.25);
        p.ellipse(sx * 0.075, 0.05, 0.045, 0.03, 0x5a3424, 1, sx * -0.6);
        p.circle(sx * 0.098, 0.036, 0.013, 0x5a3424);
      }
      p.ellipse(-0.02, 0.05, 0.03, 0.012, 0xffffff, 0.15);
      break;
    }
    case 'face-eyepatch': {
      blush(p, 0.4);
      if (blink) closedEye(p, EX, EY);
      else eyeOval(p, EX, EY);
      // Повязка на левом глазу и ремешок через голову
      p.stroke(quad(-0.198, 0.0, -0.08, -0.03, 0.15, -0.13, 10), 0.016, 0x2a2438);
      p.ellipse(-EX, EY + 0.002, 0.09, 0.08, 0x2a2438);
      p.ellipse(-EX - 0.012, EY - 0.014, 0.03, 0.016, 0xffffff, 0.15);
      p.stroke(quad(-0.035, 0.052, 0.01, 0.07, 0.045, 0.04, 8), 0.014, INK);
      break;
    }
    default: {
      // face-round: обычные глаза-овалы, румянец и маленькая улыбка
      blush(p);
      plainEyes(p, blink);
      smallSmile(p);
    }
  }
}

function drawHead(p: Pen) {
  p.circle(0, HY, HR, SKIN);
  // Мягкая тень снизу и блик сверху слева
  p.poly(cat(arcP(0, HY, HR, HR, 0.25, Math.PI - 0.25, 14), arcP(0, HY + 0.05, HR * 0.92, HR * 0.8, Math.PI - 0.5, 0.5, 14)), SKIN_SH, 0.45);
  p.ellipse(-0.08, HY - 0.1, 0.11, 0.06, 0xffffff, 0.22, -0.5);
  // Волосы: шапочка сверху и чёлка (шляпы её частично закрывают)
  const top = arcP(0, HY, HR + 0.006, HR + 0.006, Math.PI * 1.04, Math.PI * 1.96, 18);
  const fringe: number[] = [];
  const n = 7;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = 0.195 - t * 0.39;
    const tipY = i % 2 === 0 ? -0.125 : -0.075;
    fringe.push(x, tipY + Math.abs(x) * 0.12);
  }
  p.poly(cat(top, fringe), HAIR);
  p.ellipse(-0.06, HY - 0.17, 0.09, 0.03, 0xffffff, 0.14, -0.3);
}

// ---------------------------------------------------------------------------
// Головные уборы. back — до головы (капюшон), front — поверх лица.

function hatBack(p: Pen, hat: string, pal: Palette) {
  if (hat === 'hat-hood') {
    // Капюшон: накидка на плечи и объём за головой
    p.poly(cat(quad(-0.25, -0.02, -0.26, 0.12, -0.2, 0.17, 6), quad(-0.2, 0.17, 0, 0.21, 0.2, 0.17, 8), quad(0.2, 0.17, 0.26, 0.12, 0.25, -0.02, 6)), pal.dark);
    p.circle(0, HY - 0.008, HR + 0.05, pal.dark);
    p.poly(cat(quad(-0.12, -0.24, 0.0, -0.33, 0.2, -0.36, 8), [0.2, -0.36], quad(0.2, -0.36, 0.16, -0.26, 0.14, -0.2, 6)), pal.dark);
  } else if (hat === 'hat-fur-hood') {
    // Меховой капюшон: тёплая накидка на плечи и круглый объём за головой (без острого кончика)
    p.poly(cat(quad(-0.26, -0.02, -0.28, 0.13, -0.2, 0.18, 6), quad(-0.2, 0.18, 0, 0.23, 0.2, 0.18, 8), quad(0.2, 0.18, 0.28, 0.13, 0.26, -0.02, 6)), pal.dark);
    p.circle(0, HY - 0.012, HR + 0.075, pal.main);
    p.poly(cat(arcP(0, HY - 0.012, HR + 0.075, HR + 0.075, Math.PI * 0.05, Math.PI * 0.95, 14), arcP(0, HY + 0.02, HR + 0.03, HR + 0.02, Math.PI * 0.9, Math.PI * 0.1, 14)), pal.dark, 0.5);
    p.ellipse(-0.1, HY - 0.2, 0.14, 0.06, 0xffffff, 0.14, -0.4);
    // Шов по макушке
    p.stroke(arcP(0, HY - 0.012, HR + 0.05, HR + 0.07, Math.PI * 1.32, Math.PI * 1.68, 10), 0.01, pal.dark, 0.6);
  }
}

/** Мех: пушистая кайма из кружков по дуге (капюшон, манжеты). */
function furArc(p: Pen, cx: number, cy: number, rx: number, ry: number, a0: number, a1: number, n: number, r: number) {
  const fur = 0xf4f1ea;
  const furSh = 0xd6d2cc;
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    p.circle(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry + r * 0.25, r, furSh);
  }
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    const k = i % 2 ? 0.9 : 1.05;
    p.circle(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry, r * k, fur);
  }
  for (let i = 0; i <= n; i += 2) {
    const a = a0 + ((a1 - a0) * i) / n;
    p.circle(cx + Math.cos(a) * rx - r * 0.3, cy + Math.sin(a) * ry - r * 0.3, r * 0.35, 0xffffff, 0.8);
  }
}

/** Полуширина купола шапки (эллипс с центром cy, полуосями rx, ry) на высоте y. */
const domeHalf = (rx: number, ry: number, cy: number, y: number) => rx * Math.sqrt(Math.max(0, 1 - ((y - cy) / ry) ** 2));

function hatFront(p: Pen, hat: string, pal: Palette) {
  switch (hat) {
    case 'hat-floppy': {
      // Мягкий колпак, кончик свисает влево, кисточка
      const body = cat(quad(0.225, -0.115, 0.2, -0.36, -0.02, -0.405, 10), quad(-0.02, -0.405, -0.22, -0.42, -0.32, -0.26, 10), quad(-0.32, -0.26, -0.22, -0.32, -0.15, -0.26, 6), quad(-0.15, -0.26, -0.21, -0.2, -0.225, -0.115, 6));
      p.poly(body, pal.main);
      p.poly(cat(quad(0.225, -0.115, 0.2, -0.36, -0.02, -0.405, 10), quad(-0.02, -0.405, 0.1, -0.3, 0.06, -0.115, 8)), pal.dark, 0.35);
      p.ellipse(-0.06, -0.33, 0.12, 0.05, 0xffffff, 0.16, -0.3);
      p.rect(-0.24, -0.15, 0.48, 0.06, pal.trim, 1, 0.03);
      p.rect(-0.22, -0.145, 0.44, 0.015, 0xffffff, 0.25, 0.007);
      p.circle(-0.33, -0.235, 0.05, pal.trim);
      p.circle(-0.345, -0.25, 0.018, 0xffffff, 0.45);
      break;
    }
    case 'hat-brim': {
      // Шляпа с полями и лентой цвета одежды
      p.ellipse(0, -0.13, 0.64, 0.12, 0x6b4630);
      p.poly(cat(quad(-0.17, -0.13, -0.19, -0.33, -0.06, -0.35, 8), quad(-0.06, -0.35, 0, -0.32, 0.06, -0.35, 4), quad(0.06, -0.35, 0.19, -0.33, 0.17, -0.13, 8)), 0x8a5e3e);
      p.rect(-0.175, -0.21, 0.35, 0.055, pal.main);
      p.rect(-0.175, -0.21, 0.35, 0.012, 0xffffff, 0.2);
      p.ellipse(-0.09, -0.29, 0.05, 0.08, 0xffffff, 0.12, 0.2);
      p.stroke(arcP(0, -0.13, 0.32, 0.06, 0.15, Math.PI - 0.15, 16), 0.014, 0x4a2f20);
      break;
    }
    case 'hat-hood': {
      // Край капюшона вокруг лица
      p.stroke(arcP(0, HY, HR + 0.012, HR + 0.012, Math.PI * 0.92, Math.PI * 2.08, 26), 0.05, pal.main);
      p.stroke(arcP(0, HY, HR + 0.035, HR + 0.035, Math.PI * 1.1, Math.PI * 1.5, 10), 0.012, 0xffffff, 0.18);
      break;
    }
    case 'hat-beret': {
      p.poly(cat(arcP(0.02, -0.19, 0.25, 0.07, 0, Math.PI, 14)), 0x8a2a3a);
      p.ellipse(0.03, -0.235, 0.52, 0.17, 0xc8414f, 1, -0.1);
      p.ellipse(-0.04, -0.265, 0.2, 0.05, 0xffffff, 0.16, -0.15);
      p.line(0.05, -0.32, 0.06, -0.35, 0.025, 0x8a2a3a);
      break;
    }
    case 'hat-ushanka': {
      const furD = 0x7a5a42;
      const furL = 0xe3d2b8;
      // Уши-клапаны с завязками
      for (const sx of [-1, 1]) {
        p.rect(sx > 0 ? 0.15 : -0.255, -0.15, 0.105, 0.24, furL, 1, 0.05);
        p.line(sx * 0.2, 0.09, sx * 0.19, 0.16, 0.012, furD);
        p.circle(sx * 0.19, 0.165, 0.015, furD);
      }
      p.poly(arcP(0, -0.13, 0.225, 0.22, Math.PI, Math.PI * 2, 18), furD);
      p.ellipse(-0.07, -0.27, 0.1, 0.04, 0xffffff, 0.12, -0.3);
      p.rect(-0.25, -0.2, 0.5, 0.095, furL, 1, 0.045);
      for (let i = 0; i < 9; i++) p.circle(-0.22 + i * 0.055, -0.2 + (i % 2) * 0.006, 0.022, furL);
      p.star(0, -0.155, 0.032, GOLD);
      break;
    }
    case 'hat-wreath': {
      // Венок: листья по эллипсу вокруг макушки, спереди — цветы
      const cx = 0;
      const cy = -0.2;
      const rx = 0.215;
      const ry = 0.06;
      for (let i = 0; i < 12; i++) {
        const a = Math.PI + (i / 11) * Math.PI;
        p.ellipse(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry, 0.085, 0.045, i % 2 ? 0x3e8a3a : 0x4f9e45, 1, a + Math.PI / 2 + 0.6);
      }
      for (let i = 0; i < 13; i++) {
        const a = (i / 12) * Math.PI;
        p.ellipse(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry, 0.09, 0.05, i % 2 ? 0x5cb84e : 0x6ccc5a, 1, a + Math.PI / 2 - 0.6);
      }
      const flowers: [number, number][] = [
        [-0.16, 0xff8ab0],
        [-0.06, 0xfff6e0],
        [0.05, 0xff8ab0],
        [0.15, 0xffd36b],
      ];
      for (const [fx, col] of flowers) {
        const fy = cy + Math.sqrt(Math.max(0, 1 - (fx * fx) / (rx * rx))) * ry;
        for (let k = 0; k < 5; k++) {
          const a = (k / 5) * Math.PI * 2;
          p.circle(fx + Math.cos(a) * 0.022, fy + Math.sin(a) * 0.022, 0.018, col);
        }
        p.circle(fx, fy, 0.014, col === 0xffd36b ? 0xff8a2a : 0xffd36b);
      }
      break;
    }
    case 'hat-tophat': {
      p.ellipse(0, -0.145, 0.54, 0.1, 0x22202c);
      p.poly([-0.15, -0.15, -0.162, -0.5, 0.162, -0.5, 0.15, -0.15], 0x2e2b3c);
      p.ellipse(0, -0.5, 0.324, 0.06, 0x3c394e);
      p.poly([-0.151, -0.165, -0.154, -0.225, 0.154, -0.225, 0.151, -0.165], pal.main);
      p.poly([-0.151, -0.215, -0.154, -0.225, 0.154, -0.225, 0.151, -0.215], 0xffffff, 0.2);
      p.poly([-0.12, -0.24, -0.128, -0.48, -0.09, -0.48, -0.086, -0.24], 0xffffff, 0.1);
      p.stroke(arcP(0, -0.145, 0.27, 0.05, 0.1, Math.PI - 0.1, 14), 0.012, 0x14121c);
      break;
    }
    case 'hat-miner': {
      // Каска горняка с фонариком
      p.poly(arcP(0, -0.115, 0.225, 0.25, Math.PI, Math.PI * 2, 20), 0xf2b631);
      p.poly(arcP(0, -0.115, 0.05, 0.25, Math.PI, Math.PI * 2, 10), 0xd99a1f);
      p.ellipse(-0.1, -0.27, 0.08, 0.05, 0xffffff, 0.3, -0.5);
      p.rect(-0.26, -0.14, 0.52, 0.045, 0xc98a1f, 1, 0.022);
      p.circle(0, -0.215, 0.105, 0xfff3b0, 0.18);
      p.circle(0, -0.215, 0.058, 0x5a5f72);
      p.circle(0, -0.215, 0.04, 0xfffbe6);
      p.circle(-0.012, -0.226, 0.013, 0xffffff);
      break;
    }
    case 'hat-witch': {
      const hc = 0x3a2a66;
      p.ellipse(0, -0.13, 0.68, 0.13, 0x2c1f52);
      p.poly(cat(quad(-0.17, -0.14, -0.08, -0.34, -0.005, -0.44, 8), quad(-0.005, -0.44, 0.08, -0.55, 0.21, -0.5, 8), quad(0.21, -0.5, 0.11, -0.48, 0.075, -0.41, 6), quad(0.075, -0.41, 0.13, -0.28, 0.17, -0.14, 8)), hc);
      p.poly(cat(quad(-0.17, -0.14, -0.08, -0.34, -0.005, -0.44, 8), quad(-0.005, -0.44, -0.04, -0.3, -0.06, -0.14, 6)), 0xffffff, 0.08);
      p.poly([-0.165, -0.15, -0.155, -0.205, 0.155, -0.205, 0.165, -0.15], 0x8455d1);
      p.rect(-0.035, -0.215, 0.07, 0.07, GOLD, 1, 0.012);
      p.rect(-0.018, -0.198, 0.036, 0.036, 0x8455d1, 1, 0.006);
      p.star(0.02, -0.31, 0.03, 0xffe08a);
      p.stroke(arcP(0, -0.13, 0.34, 0.065, 0.12, Math.PI - 0.12, 16), 0.012, 0x1c1238);
      break;
    }
    case 'hat-firefly-crown': {
      // Корона из светлячков: золотой обруч, на зубцах — огоньки
      const tips: [number, number][] = [
        [-0.17, -0.25],
        [-0.085, -0.3],
        [0, -0.33],
        [0.085, -0.3],
        [0.17, -0.25],
      ];
      for (const [x, y] of tips) {
        p.tri(x - 0.045, -0.17, x + 0.045, -0.17, x, y + 0.02, GOLD);
        p.tri(x - 0.045, -0.17, x, -0.17, x, y + 0.02, GOLD_DARK, 0.5);
      }
      p.poly(cat(arcP(0, -0.2, 0.215, 0.05, Math.PI * 0.98, Math.PI * 0.02, 16), arcP(0, -0.145, 0.215, 0.05, Math.PI * 0.02, Math.PI * 0.98, 16)), GOLD);
      p.stroke(arcP(0, -0.145, 0.215, 0.05, Math.PI * 0.02, Math.PI * 0.98, 16), 0.012, GOLD_DARK);
      for (const [x, col] of [
        [-0.1, 0xd04a5e],
        [0, 0x4ac8ff],
        [0.1, 0xd04a5e],
      ] as const)
        p.circle(x, -0.15 + (Math.abs(x) < 0.01 ? 0.008 : 0), 0.018, col);
      for (const [x, y] of tips) {
        p.circle(x, y, 0.055, C.fireflyGlow, 0.28);
        p.circle(x, y, 0.028, C.firefly);
        p.circle(x - 0.006, y - 0.006, 0.011, 0xffffff, 0.9);
      }
      break;
    }
    case 'hat-knit': {
      // Вязаная шапка: купол цвета одежды, полоски отделки, рельефный отворот и большой помпон
      const cy = -0.13;
      const rx = 0.228;
      const ry = 0.27;
      p.poly(arcP(0, cy, rx, ry, Math.PI, Math.PI * 2, 22), pal.main);
      p.poly(cat(arcP(0, cy, rx, ry, Math.PI * 1.58, Math.PI * 2, 10), arcP(0.07, cy, rx - 0.07, ry - 0.04, Math.PI * 2, Math.PI * 1.58, 10)), pal.dark, 0.35);
      const band = (y1: number, y2: number, c: number, a = 1) => {
        const h1 = domeHalf(rx, ry, cy, y1);
        const h2 = domeHalf(rx, ry, cy, y2);
        p.poly([-h1, y1, h1, y1, h2, y2, -h2, y2], c, a);
      };
      band(-0.285, -0.245, pal.trim);
      band(-0.225, -0.21, pal.trim, 0.85);
      // Вязка: ряды «косичек»
      for (const y of [-0.335, -0.175]) {
        const h = domeHalf(rx, ry, cy, y) - 0.03;
        for (let x = -h; x <= h + 1e-6; x += 0.05) p.stroke([x - 0.016, y - 0.014, x, y + 0.01, x + 0.016, y - 0.014], 0.011, pal.dark, 0.4);
      }
      p.ellipse(-0.09, -0.3, 0.09, 0.05, 0xffffff, 0.16, -0.5);
      // Отворот с резинкой
      const cuff = mix(pal.main, 0x000000, 0.15);
      p.rect(-0.248, -0.185, 0.496, 0.09, cuff, 1, 0.04);
      for (let i = 0; i < 13; i++) p.line(-0.215 + i * 0.036, -0.172, -0.215 + i * 0.036, -0.108, 0.012, pal.dark, 0.45);
      p.rect(-0.23, -0.18, 0.46, 0.014, 0xffffff, 0.18, 0.007);
      // Помпон
      const px = 0.02;
      const py = -0.41;
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2;
        p.circle(px + Math.cos(a) * 0.05, py + Math.sin(a) * 0.045, 0.036, 0xdcd6ce);
      }
      p.circle(px, py, 0.062, 0xf4f1ea);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + 0.3;
        p.circle(px + Math.cos(a) * 0.035, py + Math.sin(a) * 0.032, 0.024, 0xffffff, 0.8);
      }
      p.circle(px - 0.022, py - 0.024, 0.016, 0xffffff);
      break;
    }
    case 'hat-fur-hood': {
      // Пушистая меховая кайма вокруг лица
      furArc(p, 0, HY, HR + 0.03, HR + 0.03, Math.PI * 0.8, Math.PI * 2.2, 18, 0.042);
      break;
    }
    default: {
      // hat-cap: колпак с огоньком на кончике (как у прежнего Lumo)
      const cone = cat(quad(-0.225, -0.11, -0.13, -0.36, 0.07, -0.52, 10), quad(0.07, -0.52, 0.13, -0.3, 0.225, -0.11, 10));
      p.poly(cone, pal.dark);
      p.poly(cat(quad(-0.225, -0.11, -0.13, -0.36, 0.07, -0.52, 10), quad(0.07, -0.52, -0.06, -0.33, -0.1, -0.11, 8)), 0xffffff, 0.1);
      p.rect(-0.24, -0.15, 0.48, 0.06, pal.main, 1, 0.03);
      p.rect(-0.22, -0.145, 0.44, 0.015, 0xffffff, 0.2, 0.007);
      p.circle(0.07, -0.52, 0.075, C.lanternOn, 0.25);
      p.circle(0.07, -0.52, 0.05, C.lanternOn);
      p.circle(0.06, -0.53, 0.02, 0xffffff, 0.85);
    }
  }
}


// ---------------------------------------------------------------------------
// Одежда

/** Колокол: плечи (tw, ty), подол (hw, hy). */
function bell(tw: number, ty: number, hw: number, hy: number, bulge = 0.03, flare = 0.03): number[] {
  const my = ty + (hy - ty) * 0.55;
  return cat(
    quad(-tw, ty, -tw - flare, my, -hw, hy, 10),
    quad(-hw, hy, 0, hy + bulge * 2, hw, hy, 12),
    quad(hw, hy, tw + flare, my, tw, ty, 10),
    quad(tw, ty, 0, ty - 0.05, -tw, ty, 8),
  );
}
/** Прямой силуэт (куртка, свитер): плечи скруглены, низ с закруглёнными углами. */
function boxy(tw: number, ty: number, w: number, hy: number): number[] {
  return cat(
    quad(tw, ty, 0, ty - 0.05, -tw, ty, 8),
    quad(-tw, ty, -w - 0.01, ty + 0.01, -w, ty + 0.12, 8),
    [-w + 0.005, hy - 0.025],
    quad(-w + 0.005, hy - 0.025, -w + 0.005, hy, -w + 0.035, hy, 4),
    [w - 0.035, hy],
    quad(w - 0.035, hy, w - 0.005, hy, w - 0.005, hy - 0.025, 4),
    [w, ty + 0.12],
    quad(w, ty + 0.12, w + 0.01, ty + 0.01, tw, ty, 8),
  );
}

function legs(p: Pen, long: boolean) {
  if (!long) {
    p.rect(-0.125, 0.3, 0.1, 0.11, PANTS, 1, 0.03);
    p.rect(0.025, 0.3, 0.1, 0.11, PANTS, 1, 0.03);
  }
  for (const sx of [-1, 1]) {
    p.ellipse(sx * 0.085, 0.405, 0.15, 0.075, SHOE);
    p.ellipse(sx * 0.085 - 0.02, 0.392, 0.05, 0.02, 0xffffff, 0.18);
  }
}

/** Цвет и форма рукавов для одежды. */
function sleeveOf(outfit: string, pal: Palette): { c: number; wide: boolean; cuff: number } {
  switch (outfit) {
    case 'outfit-robe':
    case 'outfit-star-robe':
      return { c: pal.main, wide: true, cuff: pal.trim };
    case 'outfit-vest':
      return { c: SHIRT, wide: false, cuff: 0xd8ccb4 };
    case 'outfit-apron':
      return { c: pal.trim, wide: false, cuff: mix(pal.trim, 0x000000, 0.25) };
    case 'outfit-sweater':
      return { c: pal.main, wide: false, cuff: pal.dark };
    case 'outfit-poncho':
      return { c: pal.dark, wide: false, cuff: pal.dark };
    case 'outfit-cloak':
    case 'outfit-long-cloak':
      return { c: pal.dark, wide: false, cuff: pal.dark };
    default:
      return { c: pal.main, wide: false, cuff: pal.dark };
  }
}

/** Рукав от плеча (0,0) к кисти (hx, hy) — в координатах пера. */
function sleeve(p: Pen, hx: number, hy: number, outfit: string, pal: Palette) {
  const sl = sleeveOf(outfit, pal);
  if (sl.wide) {
    p.poly(limb(0, 0, hx * 0.9, hy * 0.9, 0.085, 0.15), sl.c);
    p.circle(0, 0, 0.0425, sl.c);
    const f = limb(hx * 0.84, hy * 0.84, hx * 0.9, hy * 0.9, 0.14, 0.15);
    p.poly(f, sl.cuff);
  } else {
    p.poly(limb(0, 0, hx * 0.82, hy * 0.82, 0.085, 0.08), sl.c);
    p.circle(0, 0, 0.0425, sl.c);
    p.poly(limb(hx * 0.72, hy * 0.72, hx * 0.84, hy * 0.84, 0.084, 0.082), sl.cuff);
  }
}

const MITTEN = 0xd8463a;
const MITTEN_DARK = 0x9c2a26;
const KNIT_CREAM = 0xf4efe6;

/** Варежка в точке (x, y): (dx, dy) — направление от локтя к кисти (там, где манжета), k — масштаб. */
function mitten(p: Pen, x: number, y: number, dx: number, dy: number, k = 1) {
  const l = Math.hypot(dx, dy) || 1;
  const ux = dx / l;
  const uy = dy / l;
  p.circle(x + ux * 0.012 * k, y + uy * 0.012 * k, 0.058 * k, MITTEN);
  // Большой палец — сбоку, «сверху» относительно руки
  p.circle(x + (uy * 0.045 - ux * 0.005) * k, y + (-ux * 0.045 - uy * 0.005) * k, 0.026 * k, MITTEN);
  p.circle(x + (ux * 0.025 - uy * 0.012) * k, y + (uy * 0.025 + ux * 0.012) * k, 0.038 * k, MITTEN_DARK, 0.35);
  // Снежинка-узор и блик
  const sx = x + ux * 0.015 * k;
  const sy = y + uy * 0.015 * k;
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI;
    p.line(sx - Math.cos(a) * 0.022 * k, sy - Math.sin(a) * 0.022 * k, sx + Math.cos(a) * 0.022 * k, sy + Math.sin(a) * 0.022 * k, 0.008 * k, KNIT_CREAM, 0.9);
  }
  p.circle(x - (ux * 0.02 + uy * 0.02) * k, y - (uy * 0.02 - ux * 0.02) * k, 0.014 * k, 0xffffff, 0.35);
  // Вязаная манжета у запястья
  p.poly(limb(x - ux * 0.075 * k, y - uy * 0.075 * k, x - ux * 0.035 * k, y - uy * 0.035 * k, 0.1 * k, 0.108 * k), KNIT_CREAM);
  for (const t of [-0.03, 0, 0.03]) p.line(x - ux * 0.07 * k - uy * t * k, y - uy * 0.07 * k + ux * t * k, x - ux * 0.04 * k - uy * t * k, y - uy * 0.04 * k + ux * t * k, 0.006 * k, 0xc9c0b2, 0.8);
}

function hand(p: Pen, x: number, y: number, mittens = false, dx = 0, dy = 1) {
  if (mittens) return mitten(p, x, y, dx, dy);
  p.circle(x, y, 0.047, SKIN);
  p.circle(x + 0.012, y + 0.014, 0.03, SKIN_SH, 0.45);
  p.circle(x - 0.012, y - 0.014, 0.014, 0xffffff, 0.35);
}

function outfitBack(p: Pen, outfit: string, pal: Palette) {
  if (outfit === 'outfit-long-cloak') {
    // Откинутый капюшон за спиной
    p.ellipse(0, 0.07, 0.46, 0.18, pal.dark);
    p.ellipse(0, 0.06, 0.34, 0.1, mix(pal.dark, 0x000000, 0.3));
  }
}

function outfitBody(p: Pen, outfit: string, pal: Palette) {
  const { main, dark, trim } = pal;
  switch (outfit) {
    case 'outfit-long-cloak': {
      p.poly(bell(0.14, 0.05, 0.37, 0.425, 0.02, 0.03), main);
      p.poly([-0.03, 0.15, 0.03, 0.15, 0.085, 0.43, -0.085, 0.43], dark);
      p.line(-0.03, 0.15, -0.085, 0.425, 0.014, trim, 0.9);
      p.line(0.03, 0.15, 0.085, 0.425, 0.014, trim, 0.9);
      p.tri(-0.14, 0.22, -0.25, 0.42, -0.12, 0.43, dark, 0.35);
      p.tri(0.15, 0.24, 0.26, 0.42, 0.14, 0.43, dark, 0.25);
      p.ellipse(-0.17, 0.12, 0.12, 0.05, 0xffffff, 0.12, -0.4);
      p.line(-0.045, 0.17, 0.045, 0.17, 0.01, trim);
      p.circle(-0.045, 0.17, 0.022, trim);
      p.circle(0.045, 0.17, 0.022, trim);
      break;
    }
    case 'outfit-robe':
    case 'outfit-star-robe': {
      p.poly(bell(0.14, 0.05, 0.33, 0.41, 0.025, 0.02), main);
      p.tri(-0.1, 0.27, -0.2, 0.41, -0.07, 0.42, dark, 0.3);
      p.tri(0.12, 0.28, 0.22, 0.41, 0.1, 0.42, dark, 0.22);
      p.ellipse(-0.16, 0.12, 0.12, 0.05, 0xffffff, 0.12, -0.4);
      // Подол, ворот и пояс
      p.stroke(quad(-0.33, 0.405, 0, 0.455, 0.33, 0.405, 12), 0.022, trim);
      p.stroke([-0.075, 0.13, 0, 0.215, 0.075, 0.13], 0.02, trim);
      p.poly(cat(quad(-0.215, 0.26, 0, 0.29, 0.215, 0.26, 10), quad(0.22, 0.3, 0, 0.33, -0.22, 0.3, 10)), outfit === 'outfit-robe' ? trim : dark);
      p.poly([-0.06, 0.29, -0.03, 0.29, -0.05, 0.38, -0.085, 0.37], outfit === 'outfit-robe' ? trim : dark);
      if (outfit === 'outfit-star-robe') {
        const stars: [number, number, number][] = [
          [-0.2, 0.36, 0.03],
          [-0.11, 0.21, 0.022],
          [0.15, 0.2, 0.026],
          [0.2, 0.37, 0.024],
          [0.04, 0.37, 0.028],
          [-0.02, 0.25, 0.016],
        ];
        for (const [x, y, r] of stars) p.star(x, y, r, trim, 1, 0.42);
        for (const [x, y] of [
          [-0.15, 0.3],
          [0.1, 0.33],
          [0.2, 0.28],
          [-0.24, 0.39],
        ])
          p.circle(x, y, 0.008, trim, 0.9);
        p.poly(cat(arcP(0.11, 0.37, 0.036, 0.036, Math.PI * 0.45, Math.PI * 1.55, 10), arcP(0.125, 0.365, 0.028, 0.03, Math.PI * 1.45, Math.PI * 0.55, 10)), trim);
      }
      break;
    }
    case 'outfit-jacket': {
      p.poly(boxy(0.14, 0.06, 0.25, 0.355), main);
      p.rect(-0.25, 0.32, 0.5, 0.035, dark, 1, 0.015);
      p.line(0, 0.16, 0, 0.35, 0.012, dark);
      for (const y of [0.2, 0.25, 0.3]) {
        p.circle(0.035, y, 0.017, trim);
        p.circle(0.03, y - 0.004, 0.006, 0xffffff, 0.5);
      }
      p.tri(-0.11, 0.1, -0.015, 0.2, -0.13, 0.2, dark);
      p.tri(0.11, 0.1, 0.015, 0.2, 0.13, 0.2, dark);
      p.rect(-0.2, 0.25, 0.085, 0.012, dark, 1, 0.006);
      p.rect(0.115, 0.25, 0.085, 0.012, dark, 1, 0.006);
      p.ellipse(-0.17, 0.13, 0.12, 0.05, 0xffffff, 0.12, -0.4);
      break;
    }
    case 'outfit-sweater': {
      p.poly(boxy(0.14, 0.06, 0.245, 0.35), main);
      // Вязаный узор: полоса-зигзаг на груди и полоска ниже
      p.rect(-0.245, 0.22, 0.49, 0.05, trim, 1, 0);
      for (let i = 0; i < 9; i++) {
        const x = -0.225 + i * 0.056;
        p.tri(x - 0.022, 0.27, x + 0.022, 0.27, x, 0.24, main);
      }
      p.rect(-0.245, 0.285, 0.49, 0.012, trim, 0.9, 0);
      p.rect(-0.25, 0.31, 0.5, 0.045, dark, 1, 0.018);
      for (let i = 0; i < 12; i++) p.line(-0.23 + i * 0.042, 0.318, -0.23 + i * 0.042, 0.345, 0.006, main, 0.35);
      p.rect(-0.115, 0.115, 0.23, 0.06, dark, 1, 0.025);
      for (let i = 0; i < 6; i++) p.line(-0.09 + i * 0.036, 0.125, -0.09 + i * 0.036, 0.165, 0.006, main, 0.35);
      for (const [x, y] of [
        [-0.17, 0.18],
        [-0.06, 0.19],
        [0.06, 0.19],
        [0.17, 0.18],
      ])
        p.circle(x, y, 0.01, trim, 0.9);
      break;
    }
    case 'outfit-vest': {
      p.poly(boxy(0.14, 0.06, 0.235, 0.35), SHIRT);
      p.tri(-0.07, 0.12, 0, 0.17, -0.02, 0.2, 0xffffff);
      p.tri(0.07, 0.12, 0, 0.17, 0.02, 0.2, 0xffffff);
      // Жилет: две полы с вырезом и острыми концами внизу
      const left = [-0.14, 0.08, -0.03, 0.2, -0.015, 0.33, -0.06, 0.37, -0.235, 0.34, -0.245, 0.18, -0.22, 0.09];
      p.poly(left, main);
      p.poly(left.map((v, i) => (i % 2 === 0 ? -v : v)), main);
      p.line(-0.03, 0.2, -0.015, 0.33, 0.012, trim);
      p.line(0.03, 0.2, 0.015, 0.33, 0.012, trim);
      for (const y of [0.24, 0.29]) p.circle(0.04, y, 0.014, trim);
      p.rect(-0.2, 0.255, 0.07, 0.01, dark, 1, 0.005);
      p.rect(0.13, 0.255, 0.07, 0.01, dark, 1, 0.005);
      p.ellipse(-0.17, 0.14, 0.08, 0.04, 0xffffff, 0.12, -0.4);
      break;
    }
    case 'outfit-poncho': {
      p.poly(cat(quad(-0.12, 0.07, -0.26, 0.14, -0.38, 0.33, 8), [0.38, 0.33], quad(0.38, 0.33, 0.26, 0.14, 0.12, 0.07, 8), quad(0.12, 0.07, 0, 0.03, -0.12, 0.07, 6)), main);
      // Узор: зигзаг и ромбики
      p.rect(-0.31, 0.24, 0.62, 0.045, dark, 1, 0);
      for (let i = 0; i < 10; i++) {
        const x = -0.28 + i * 0.062;
        p.tri(x - 0.024, 0.285, x + 0.024, 0.285, x, 0.248, trim);
      }
      for (const x of [-0.15, -0.05, 0.05, 0.15]) p.poly([x, 0.175, x + 0.022, 0.2, x, 0.225, x - 0.022, 0.2], trim);
      p.stroke(quad(-0.38, 0.33, 0, 0.33, 0.38, 0.33, 4), 0.02, dark);
      for (let i = 0; i < 16; i++) {
        const x = -0.36 + i * 0.048;
        p.line(x, 0.34, x - 0.004, 0.375, 0.012, trim);
      }
      p.ellipse(-0.15, 0.13, 0.12, 0.05, 0xffffff, 0.14, -0.45);
      p.rect(-0.1, 0.115, 0.2, 0.04, dark, 1, 0.02);
      break;
    }
    case 'outfit-apron': {
      // Платье цвета отделки и фартук поверх
      p.poly(bell(0.14, 0.05, 0.31, 0.4, 0.02, 0.02), trim);
      p.tri(-0.1, 0.27, -0.2, 0.4, -0.07, 0.41, 0x000000, 0.18);
      p.line(-0.09, 0.11, -0.07, 0.17, 0.018, dark);
      p.line(0.09, 0.11, 0.07, 0.17, 0.018, dark);
      p.rect(-0.1, 0.16, 0.2, 0.11, main, 1, 0.025);
      p.poly(cat([-0.17, 0.265, 0.17, 0.265], quad(0.21, 0.385, 0, 0.42, -0.21, 0.385, 10)), main);
      p.stroke(quad(-0.21, 0.385, 0, 0.42, 0.21, 0.385, 10), 0.012, dark);
      p.rect(-0.2, 0.25, 0.4, 0.03, dark, 1, 0.012);
      p.ellipse(-0.2, 0.275, 0.05, 0.03, dark, 1, 0.6);
      p.rect(-0.07, 0.3, 0.14, 0.065, dark, 0.35, 0.02);
      // Сердечко на кармане
      p.circle(-0.011, 0.326, 0.013, trim);
      p.circle(0.011, 0.326, 0.013, trim);
      p.tri(-0.024, 0.331, 0.024, 0.331, 0, 0.352, trim);
      break;
    }
    case 'outfit-sea-coat': {
      p.poly(cat(boxy(0.14, 0.06, 0.25, 0.375)), main);
      p.rect(-0.25, 0.345, 0.5, 0.03, dark, 1, 0.012);
      // Большой воротник и два ряда пуговиц
      p.poly([-0.13, 0.08, -0.02, 0.21, -0.1, 0.24, -0.2, 0.14], dark);
      p.poly([0.13, 0.08, 0.02, 0.21, 0.1, 0.24, 0.2, 0.14], dark);
      p.line(-0.02, 0.21, -0.1, 0.24, 0.01, trim, 0.7);
      p.line(0.02, 0.21, 0.1, 0.24, 0.01, trim, 0.7);
      for (const y of [0.24, 0.285, 0.33])
        for (const x of [-0.06, 0.06]) {
          p.circle(x, y, 0.016, trim);
          p.circle(x - 0.005, y - 0.005, 0.006, 0xffffff, 0.5);
        }
      p.rect(-0.25, 0.085, 0.07, 0.025, trim, 1, 0.01);
      p.rect(0.18, 0.085, 0.07, 0.025, trim, 1, 0.01);
      p.ellipse(-0.18, 0.15, 0.06, 0.04, 0xffffff, 0.1, -0.4);
      break;
    }
    default: {
      // outfit-cloak: плащ-колокол (как у прежнего Lumo), отделка по подолу и застёжка
      p.poly(bell(0.13, 0.05, 0.34, 0.405, 0.03, 0.03), main);
      p.tri(-0.1, 0.22, -0.22, 0.41, -0.07, 0.42, dark, 0.35);
      p.tri(0.12, 0.24, 0.23, 0.41, 0.1, 0.42, dark, 0.25);
      p.ellipse(-0.16, 0.12, 0.14, 0.055, 0xffffff, 0.13, -0.4);
      p.stroke(quad(-0.34, 0.4, 0, 0.465, 0.34, 0.4, 12), 0.02, trim, 0.85);
      p.circle(0, 0.175, 0.028, trim);
      p.circle(-0.008, 0.167, 0.009, 0xffffff, 0.6);
    }
  }
}

// ---------------------------------------------------------------------------
// Аксессуары: сзади (до тела) и спереди

function accessoryBack(p: Pen, acc: string) {
  switch (acc) {
    case 'acc-backpack': {
      p.rect(-0.37, 0.06, 0.24, 0.26, 0x8a5a33, 1, 0.06);
      p.rect(-0.37, 0.06, 0.24, 0.1, 0x6a4226, 1, 0.05);
      p.rect(-0.28, 0.14, 0.04, 0.05, GOLD_DARK, 1, 0.01);
      p.rect(-0.39, 0.0, 0.3, 0.08, 0x3e6e4a, 1, 0.04);
      p.line(-0.3, 0.0, -0.3, 0.08, 0.012, 0x22442f);
      p.line(-0.18, 0.0, -0.18, 0.08, 0.012, 0x22442f);
      break;
    }
    case 'acc-capelet': {
      p.poly(bell(0.16, 0.05, 0.36, 0.3, 0.02, 0.0), 0x6a1f38);
      break;
    }
    case 'acc-wings': {
      const wc = 0xd8fff0;
      for (const sx of [-1, 1]) {
        p.ellipse(sx * 0.3, 0.02, 0.32, 0.18, wc, 0.45, sx * -0.55);
        p.poly(ellP(sx * 0.3, 0.02, 0.16, 0.09, sx * -0.55), wc, 0.25);
        p.stroke(ellP(sx * 0.3, 0.02, 0.16, 0.09, sx * -0.55, 28).concat(ellP(sx * 0.3, 0.02, 0.16, 0.09, sx * -0.55, 28).slice(0, 2)), 0.01, 0xffffff, 0.75);
        p.ellipse(sx * 0.27, 0.2, 0.2, 0.13, wc, 0.45, sx * 0.5);
        p.stroke(ellP(sx * 0.27, 0.2, 0.1, 0.065, sx * 0.5, 24).concat(ellP(sx * 0.27, 0.2, 0.1, 0.065, sx * 0.5, 24).slice(0, 2)), 0.01, 0xffffff, 0.75);
        p.line(sx * 0.15, 0.1, sx * 0.4, -0.06, 0.006, 0xffffff, 0.5);
        p.circle(sx * 0.4, -0.04, 0.012, 0xffffff, 0.8);
      }
      break;
    }
  }
}

function accessoryFront(p: Pen, acc: string) {
  switch (acc) {
    case 'acc-scarf': {
      const sc = 0xe0574a;
      p.poly([-0.06, 0.15, -0.025, 0.15, -0.1, 0.34, -0.155, 0.32], sc);
      for (let i = 0; i < 4; i++) p.line(-0.1 - i * 0.017 + 0.005, 0.338, -0.105 - i * 0.017, 0.37, 0.01, sc);
      p.line(-0.07, 0.23, -0.12, 0.25, 0.012, 0xfff1cc, 0.9);
      p.line(-0.085, 0.28, -0.135, 0.3, 0.012, 0xfff1cc, 0.9);
      p.poly(cat(quad(-0.18, 0.08, 0, 0.2, 0.18, 0.08, 10), quad(0.19, 0.14, 0, 0.27, -0.19, 0.14, 10)), sc);
      p.stroke(quad(-0.185, 0.12, 0, 0.245, 0.185, 0.12, 10), 0.012, 0xfff1cc, 0.9);
      break;
    }
    case 'acc-knit-scarf': {
      // Вязаный шарф: толстый виток вокруг шеи, два конца в полоску с бахромой
      const sc = KNIT_CREAM;
      const sd = 0xc9bfae;
      const stripe = 0x3f7fd0;
      // Задний (короткий) конец
      p.poly([-0.005, 0.17, 0.055, 0.17, 0.045, 0.31, -0.015, 0.305], sd);
      for (let i = 0; i < 4; i++) p.line(-0.008 + i * 0.016, 0.305, -0.01 + i * 0.016, 0.335, 0.009, sd);
      // Передний (длинный) конец
      const edge = (y: number): [number, number] => {
        const t = (y - 0.17) / 0.21;
        return [0.045 + t * 0.025, 0.115 + t * 0.03];
      };
      p.poly([0.045, 0.17, 0.115, 0.17, 0.145, 0.38, 0.07, 0.38], sc);
      for (const y of [0.235, 0.3]) {
        const [l1, r1] = edge(y);
        const [l2, r2] = edge(y + 0.028);
        p.poly([l1, y, r1, y, r2, y + 0.028, l2, y + 0.028], stripe);
      }
      for (let i = 0; i < 5; i++) p.line(0.075 + i * 0.016, 0.38, 0.072 + i * 0.017, 0.418, 0.01, sc);
      p.line(0.12, 0.18, 0.14, 0.37, 0.01, sd, 0.5);
      // Виток вокруг шеи
      p.poly(cat(quad(-0.195, 0.07, 0, 0.2, 0.195, 0.07, 12), quad(0.205, 0.15, 0, 0.3, -0.205, 0.15, 12)), sc);
      p.stroke(quad(-0.2, 0.118, 0, 0.262, 0.2, 0.118, 12), 0.024, stripe);
      for (let i = 0; i < 9; i++) {
        const x = -0.16 + i * 0.04;
        const yTop = 0.07 + 0.13 * (1 - (x / 0.2) ** 2) * 0.95;
        p.line(x, yTop + 0.01, x, yTop + 0.035, 0.008, sd, 0.45);
        p.line(x, yTop + 0.065, x, yTop + 0.09, 0.008, sd, 0.45);
      }
      p.ellipse(-0.11, 0.135, 0.09, 0.035, 0xffffff, 0.4, 0.45);
      // Узел у конца
      p.ellipse(0.08, 0.19, 0.09, 0.06, sd);
      p.ellipse(0.075, 0.183, 0.05, 0.025, 0xffffff, 0.15);
      break;
    }
    case 'acc-backpack': {
      p.line(-0.13, 0.11, -0.12, 0.31, 0.03, 0x6a4226);
      p.line(0.13, 0.11, 0.12, 0.31, 0.03, 0x6a4226);
      p.rect(-0.14, 0.24, 0.04, 0.025, GOLD_DARK, 1, 0.006);
      p.rect(0.1, 0.24, 0.04, 0.025, GOLD_DARK, 1, 0.006);
      break;
    }
    case 'acc-satchel': {
      p.line(0.15, 0.09, -0.19, 0.29, 0.03, 0x7a4a2a);
      p.rect(-0.31, 0.26, 0.17, 0.13, 0x9a6a3a, 1, 0.03);
      p.poly(cat([-0.31, 0.265, -0.14, 0.265], quad(-0.14, 0.32, -0.225, 0.35, -0.31, 0.32, 8)), 0x7a4a2a);
      p.rect(-0.24, 0.315, 0.03, 0.03, GOLD, 1, 0.006);
      break;
    }
    case 'acc-capelet': {
      const v = 0x9c2742;
      p.poly(cat(quad(-0.13, 0.07, -0.2, 0.12, -0.3, 0.27, 8), quad(-0.3, 0.27, 0, 0.33, 0.3, 0.27, 12), quad(0.3, 0.27, 0.2, 0.12, 0.13, 0.07, 8), quad(0.13, 0.07, 0, 0.03, -0.13, 0.07, 6)), v);
      p.ellipse(-0.17, 0.14, 0.12, 0.05, 0xffffff, 0.14, -0.45);
      p.stroke(quad(-0.3, 0.27, 0, 0.33, 0.3, 0.27, 12), 0.02, GOLD);
      for (const x of [-0.24, -0.12, 0, 0.12, 0.24]) {
        const y = 0.27 + 0.03 * (1 - (x * x) / 0.09) + 0.003;
        p.circle(x, y, 0.016, 0xfff6ee);
        p.circle(x, y + 0.004, 0.005, INK);
      }
      p.circle(0, 0.175, 0.03, GOLD);
      p.circle(0, 0.175, 0.017, 0x4ac8ff);
      break;
    }
    case 'acc-badge': {
      p.circle(-0.13, 0.245, 0.045, GOLD_DARK);
      p.circle(-0.13, 0.245, 0.037, GOLD);
      p.star(-0.13, 0.247, 0.026, 0xd04a5e);
      p.circle(-0.143, 0.232, 0.008, 0xffffff, 0.7);
      break;
    }
    case 'acc-keys': {
      p.poly(cat(quad(-0.27, 0.29, 0, 0.32, 0.27, 0.29, 10), quad(0.27, 0.325, 0, 0.355, -0.27, 0.325, 10)), 0x5a3a22);
      p.rect(-0.03, 0.295, 0.06, 0.05, GOLD, 1, 0.01);
      p.rect(-0.015, 0.308, 0.03, 0.024, 0x5a3a22, 1, 0.004);
      p.ring(-0.18, 0.35, 0.025, 0.009, GOLD);
      const keys: [number, number, number][] = [
        [-0.2, 0.0, 0xffd36b],
        [-0.17, 0.3, 0xd8dce8],
        [-0.145, -0.25, 0xffd36b],
      ];
      for (const [kx, rot, col] of keys) {
        const ang = Math.PI / 2 + rot;
        const ex = kx + Math.cos(ang) * 0.08;
        const ey = 0.37 + Math.sin(ang) * 0.08;
        p.line(kx, 0.37, ex, ey, 0.012, col);
        p.circle(kx, 0.37, 0.016, col);
        p.line(ex, ey, ex + Math.cos(ang - Math.PI / 2) * 0.022, ey + Math.sin(ang - Math.PI / 2) * 0.022, 0.01, col);
      }
      break;
    }
    case 'acc-bowtie': {
      const bc = 0xd8344a;
      const y = 0.172;
      p.poly([0, y, -0.075, y - 0.04, -0.075, y + 0.04], 0x8a1f30);
      p.poly([0, y, 0.075, y - 0.04, 0.075, y + 0.04], 0x8a1f30);
      p.poly([0, y, -0.065, y - 0.032, -0.065, y + 0.032], bc);
      p.poly([0, y, 0.065, y - 0.032, 0.065, y + 0.032], bc);
      p.circle(0, y, 0.022, 0xa82438);
      p.circle(-0.005, y - 0.006, 0.007, 0xffffff, 0.5);
      break;
    }
  }
}

// ---------------------------------------------------------------------------
// Посох с фонарём

function lanternFlame(p: Pen, x: number, y: number, r: number) {
  p.circle(x, y, r * 1.5, 0xffffff, 0.35);
  p.circle(x, y, r, 0xffffff);
}

function drawStaff(p: Pen, staff: string) {
  const L = lanternPos(staff);
  const shaft = (top: Pt, c = WOOD, hi = WOOD_LIGHT, w = 0.045) => {
    p.line(STAFF_B.x, STAFF_B.y, top.x, top.y, w, c);
    p.line(STAFF_B.x - 0.01, STAFF_B.y - 0.04, top.x - 0.008, top.y + 0.04, w * 0.3, hi, 0.7);
  };
  switch (staff) {
    case 'staff-round': {
      shaft(STAFF_T);
      p.rect(L.x - 0.04, L.y + 0.075, 0.08, 0.03, METAL, 1, 0.01);
      p.circle(L.x, L.y, 0.098, FRAME);
      p.circle(L.x, L.y, 0.078, C.lanternOn);
      p.stroke(arcP(L.x, L.y, 0.088, 0.03, 0, Math.PI, 10), 0.012, FRAME, 0.8);
      p.poly(arcP(L.x, L.y - 0.09, 0.045, 0.035, Math.PI, Math.PI * 2, 8), METAL);
      p.ring(L.x, L.y - 0.135, 0.016, 0.01, METAL);
      lanternFlame(p, L.x, L.y, 0.036);
      break;
    }
    case 'staff-diamond': {
      shaft(STAFF_T);
      p.rect(L.x - 0.035, L.y + 0.1, 0.07, 0.03, METAL, 1, 0.01);
      p.poly([L.x, L.y - 0.135, L.x + 0.095, L.y, L.x, L.y + 0.125, L.x - 0.095, L.y], FRAME);
      p.poly([L.x, L.y - 0.105, L.x + 0.07, L.y, L.x, L.y + 0.095, L.x - 0.07, L.y], C.lanternOn);
      p.poly([L.x, L.y - 0.105, L.x - 0.07, L.y, L.x, L.y], 0xffffff, 0.25);
      p.circle(L.x, L.y - 0.14, 0.018, METAL);
      lanternFlame(p, L.x, L.y, 0.034);
      break;
    }
    case 'staff-star': {
      shaft(STAFF_T);
      p.rect(L.x - 0.035, L.y + 0.075, 0.07, 0.035, METAL, 1, 0.01);
      p.star(L.x, L.y, 0.135, FRAME, 1, 0.52);
      p.star(L.x, L.y + 0.004, 0.1, C.lanternOn, 1, 0.52);
      lanternFlame(p, L.x, L.y + 0.008, 0.032);
      break;
    }
    case 'staff-crook': {
      // Пастуший посох: крюк, на нём на цепочке висит фонарь
      const hook = cat([STAFF_B.x, STAFF_B.y, 0.35, -0.08], arcP(0.43, -0.1, 0.08, 0.085, Math.PI * 0.92, Math.PI * 2.1, 14));
      p.path(hook, 0.045, WOOD);
      p.stroke(arcP(0.43, -0.1, 0.08, 0.085, Math.PI * 1.1, Math.PI * 1.5, 6), 0.012, WOOD_LIGHT, 0.7);
      const hx = 0.43 + Math.cos(Math.PI * 2.1) * 0.08;
      const hy = -0.1 + Math.sin(Math.PI * 2.1) * 0.085;
      p.line(hx, hy, L.x, L.y - 0.08, 0.01, METAL);
      p.tri(L.x - 0.075, L.y - 0.055, L.x + 0.075, L.y - 0.055, L.x, L.y - 0.1, METAL);
      p.rect(L.x - 0.065, L.y - 0.06, 0.13, 0.125, FRAME, 1, 0.03);
      p.rect(L.x - 0.045, L.y - 0.04, 0.09, 0.085, C.lanternOn, 1, 0.02);
      p.rect(L.x - 0.055, L.y + 0.06, 0.11, 0.022, METAL, 1, 0.008);
      lanternFlame(p, L.x, L.y, 0.03);
      break;
    }
    case 'staff-paper': {
      // Бумажный фонарик на бамбуковой палочке
      const bamboo = 0xc8a060;
      p.path(cat([STAFF_B.x, STAFF_B.y], quad(0.34, 0.0, 0.36, -0.2, 0.45, -0.22, 8)), 0.032, bamboo);
      for (const t of [0.2, 0.45, 0.7]) {
        const y = STAFF_B.y + (-0.0 - STAFF_B.y) * t;
        const x = STAFF_B.x + (0.34 - STAFF_B.x) * t;
        p.line(x - 0.018, y, x + 0.018, y, 0.008, 0x8a6a3a);
      }
      p.line(0.45, -0.22, L.x, L.y - 0.075, 0.008, 0x3a2a2a);
      p.rect(L.x - 0.035, L.y - 0.09, 0.07, 0.022, 0x3a2a2a, 1, 0.006);
      p.ellipse(L.x, L.y, 0.16, 0.15, 0xe8473a);
      p.ellipse(L.x, L.y, 0.11, 0.12, 0xffb070);
      p.ellipse(L.x, L.y, 0.06, 0.07, 0xfff1cc, 0.9);
      for (const dy of [-0.045, 0, 0.045]) p.stroke(arcP(L.x, L.y + dy, 0.078, 0.012, 0, Math.PI, 8), 0.007, 0xb5302a, 0.8);
      p.rect(L.x - 0.035, L.y + 0.07, 0.07, 0.02, 0x3a2a2a, 1, 0.006);
      p.line(L.x, L.y + 0.09, L.x, L.y + 0.13, 0.012, 0xe8473a);
      break;
    }
    case 'staff-crystal': {
      shaft(STAFF_T, 0x4a4060, 0x6a6088);
      const x = L.x;
      const y = L.y;
      p.poly([x, y - 0.14, x + 0.065, y - 0.065, x + 0.06, y + 0.045, x, y + 0.095, x - 0.06, y + 0.045, x - 0.065, y - 0.065], 0x5cc8f0);
      p.poly([x, y - 0.14, x, y + 0.095, x - 0.06, y + 0.045, x - 0.065, y - 0.065], 0xb8f4ff);
      p.poly([x, y - 0.14, x + 0.065, y - 0.065, x, y - 0.02, x - 0.065, y - 0.065], 0xe8fcff, 0.85);
      p.circle(x - 0.02, y - 0.03, 0.012, 0xffffff, 0.9);
      // Лапки оправы
      p.stroke(quad(STAFF_T.x - 0.01, STAFF_T.y + 0.02, x - 0.08, y + 0.06, x - 0.06, y + 0.0, 6), 0.016, GOLD_DARK);
      p.stroke(quad(STAFF_T.x + 0.01, STAFF_T.y + 0.02, x + 0.08, y + 0.06, x + 0.06, y + 0.0, 6), 0.016, GOLD_DARK);
      p.circle(STAFF_T.x, STAFF_T.y + 0.02, 0.02, GOLD_DARK);
      break;
    }
    case 'staff-moon': {
      shaft(STAFF_T, 0x8a90b8, 0xc9d1ee);
      p.rect(L.x - 0.03, L.y + 0.08, 0.06, 0.035, 0xc9d1ee, 1, 0.01);
      const outer = arcP(L.x, L.y, 0.11, 0.11, Math.PI * 0.42, Math.PI * 1.58, 18);
      const inner = arcP(L.x + 0.05, L.y - 0.01, 0.085, 0.09, Math.PI * 1.6, Math.PI * 0.42, 18);
      p.poly(cat(outer, inner), 0xfff1a8);
      p.poly(cat(arcP(L.x, L.y, 0.11, 0.11, Math.PI * 0.6, Math.PI * 1.4, 10), arcP(L.x + 0.02, L.y, 0.09, 0.1, Math.PI * 1.4, Math.PI * 0.6, 10)), 0xffffff, 0.45);
      p.star(L.x + 0.055, L.y - 0.005, 0.035, 0xffffff, 1, 0.4);
      break;
    }
    case 'staff-ice': {
      // Ледяной фонарь: посох в инее, шестигранный ледяной фонарь со снежинкой, шапка снега и сосульки
      shaft(STAFF_T, 0x7fa6c8, 0xe0f2ff);
      for (const t of [0.25, 0.55, 0.8]) {
        const x = STAFF_B.x + (STAFF_T.x - STAFF_B.x) * t;
        const y = STAFF_B.y + (STAFF_T.y - STAFF_B.y) * t;
        p.circle(x - 0.012, y, 0.017, 0xffffff, 0.85);
        p.circle(x + 0.006, y - 0.012, 0.011, 0xffffff, 0.7);
      }
      p.rect(L.x - 0.035, L.y + 0.08, 0.07, 0.03, 0x5f84ad, 1, 0.01);
      const hex = (r: number) => {
        const out: number[] = [];
        for (let i = 0; i < 6; i++) {
          const a = -Math.PI / 2 + (i * Math.PI) / 3;
          out.push(L.x + Math.cos(a) * r, L.y + Math.sin(a) * r * 1.05);
        }
        return out;
      };
      p.poly(hex(0.118), 0x8fd0f2);
      p.poly(hex(0.09), 0xe6faff);
      const h = hex(0.09);
      p.poly([L.x, L.y, h[6], h[7], h[8], h[9], h[10], h[11], h[0], h[1]], 0xffffff, 0.35);
      for (let i = 0; i < 3; i++) {
        const a = Math.PI / 2 + (i * Math.PI) / 3;
        const ex = Math.cos(a) * 0.058;
        const ey = Math.sin(a) * 0.058;
        p.line(L.x - ex, L.y - ey, L.x + ex, L.y + ey, 0.012, 0x6cc0ea);
        for (const sgn of [-1, 1]) {
          const bx = L.x + ex * 0.6 * sgn;
          const by = L.y + ey * 0.6 * sgn;
          p.line(bx, by, bx + (Math.cos(a + 0.7) * 0.02 - ex * 0.15) * sgn, by + (Math.sin(a + 0.7) * 0.02 - ey * 0.15) * sgn, 0.008, 0x6cc0ea);
        }
      }
      lanternFlame(p, L.x, L.y, 0.026);
      // Шапка снега
      p.ellipse(L.x, L.y - 0.108, 0.2, 0.065, 0xffffff);
      p.circle(L.x - 0.06, L.y - 0.125, 0.03, 0xffffff);
      p.circle(L.x + 0.035, L.y - 0.13, 0.035, 0xffffff);
      p.ellipse(L.x + 0.02, L.y - 0.09, 0.16, 0.025, 0xc8e6f8, 0.6);
      // Сосульки снизу
      for (const [dx, len] of [
        [-0.065, 0.06],
        [-0.03, 0.095],
        [0.03, 0.05],
        [0.065, 0.08],
      ] as const) {
        const y0 = L.y + 0.062 + ((0.102 - Math.abs(dx)) / 0.102) * 0.062 - 0.006;
        p.tri(L.x + dx - 0.016, y0, L.x + dx + 0.016, y0, L.x + dx, y0 + len, 0xbfeaff);
        p.tri(L.x + dx - 0.016, y0, L.x + dx - 0.002, y0, L.x + dx, y0 + len, 0xffffff, 0.6);
      }
      break;
    }
    default: {
      // staff-square: квадратный фонарь с крышей (как у прежнего Lumo)
      shaft(STAFF_T);
      p.rect(L.x - 0.04, L.y + 0.075, 0.08, 0.035, METAL, 1, 0.01);
      p.rect(L.x - 0.09, L.y - 0.085, 0.18, 0.17, FRAME, 1, 0.035);
      p.rect(L.x - 0.065, L.y - 0.062, 0.13, 0.124, C.lanternOn, 1, 0.022);
      p.line(L.x, L.y - 0.06, L.x, L.y + 0.06, 0.01, FRAME, 0.55);
      p.tri(L.x - 0.105, L.y - 0.08, L.x + 0.105, L.y - 0.08, L.x, L.y - 0.155, METAL);
      p.ring(L.x, L.y - 0.165, 0.016, 0.01, METAL);
      lanternFlame(p, L.x, L.y, 0.036);
    }
  }
}

// ---------------------------------------------------------------------------
// Свободная рука (в координатах плеча — для взмаха)

/** Рисует свободную руку; начало пера — в плече. angle — поворот руки (взмах). */
function drawArm(p: Pen, look: Look, angle = 0) {
  const pal = paletteOf(look);
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const rot = (x: number, y: number): [number, number] => [x * c - y * s, x * s + y * c];
  const [hx, hy] = rot(-0.11, 0.115);
  sleeve(p, hx, hy, look.outfit, pal);
  hand(p, hx, hy, look.accessory === 'acc-mittens', hx, hy);
}

// ---------------------------------------------------------------------------
// Сборка Lumo

interface Parts {
  shadow: boolean;
  body: boolean;
  head: boolean;
  hat: boolean;
  staff: boolean;
  arm: boolean;
}
const ALL: Parts = { shadow: true, body: true, head: true, hat: true, staff: true, arm: true };

function renderLumo(p: Pen, look: Look, blink: boolean, parts: Parts) {
  const pal = paletteOf(look);
  const long = LONG_OUTFITS.has(look.outfit);
  if (parts.shadow) p.ellipse(0, 0.425, 0.72, 0.14, 0x000000, 0.3);
  if (parts.body) {
    accessoryBack(p, look.accessory);
    outfitBack(p, look.outfit, pal);
    legs(p, long);
    // Рука с посохом: рукав до тела
    if (parts.staff) sleeve(p.at(0.16, 0.085), STAFF_HAND.x - 0.16, STAFF_HAND.y - 0.085, look.outfit, pal);
    outfitBody(p, look.outfit, pal);
    accessoryFront(p, look.accessory);
  }
  if (parts.hat) hatBack(p, look.hat, pal);
  if (parts.head) {
    drawHead(p);
    drawFace(p, look.face, blink);
  }
  if (parts.hat) hatFront(p, look.hat, pal);
  if (parts.staff) {
    drawStaff(p, look.staff);
    hand(p, STAFF_HAND.x, STAFF_HAND.y, look.accessory === 'acc-mittens', STAFF_HAND.x - 0.16, STAFF_HAND.y - 0.085);
  }
  if (parts.arm) drawArm(p.at(ARM_PIVOT.x, ARM_PIVOT.y), look);
}

/** Статичный Lumo в образе look. facing = -1 — зеркально (смотрит влево). */
export function drawLumoLook(g: G, s: number, look: Look, opts: { facing?: 1 | -1; blink?: boolean } = {}) {
  renderLumo(new Pen(g, s, opts.facing ?? 1), look, !!opts.blink, ALL);
}

// ---------------------------------------------------------------------------
// Живой Lumo

export class LumoFigure extends Phaser.GameObjects.Container {
  look: Look;
  facing: 1 | -1 = 1;
  readonly size: number;
  private readonly animate: boolean;
  private readonly withPet: boolean;
  /** rig — зеркало (facing); hopC — прыжок; walkC — шаги; bodyC — дыхание. Начала у ног. */
  private readonly rig: Phaser.GameObjects.Container;
  private readonly hopC: Phaser.GameObjects.Container;
  private readonly walkC: Phaser.GameObjects.Container;
  private readonly bodyC: Phaser.GameObjects.Container;
  private readonly g: G;
  private readonly arm: G;
  private readonly glow: Phaser.GameObjects.Image;
  private readonly aura: Phaser.GameObjects.Image;
  private pet: Phaser.GameObjects.Container | null = null;
  private blinking = false;
  private armAngle = 0;
  private walkTween: Phaser.Tweens.Tween | null = null;
  private waveTween: Phaser.Tweens.TweenChain | null = null;
  private blinkTimer: Phaser.Time.TimerEvent | null = null;

  constructor(scene: Phaser.Scene, s: number, look: Look, opts: { animate?: boolean; withPet?: boolean } = {}) {
    super(scene, 0, 0);
    this.size = s;
    this.look = { ...look };
    this.animate = opts.animate ?? true;
    this.withPet = !!opts.withPet;
    const foot = 0.42 * s;
    this.aura = scene.add.image(0, -0.05 * s, 'glow').setBlendMode(Phaser.BlendModes.ADD).setScale((s * 2.1) / 128).setAlpha(0);
    this.rig = scene.add.container(0, 0);
    this.hopC = scene.add.container(0, foot);
    this.walkC = scene.add.container(0, 0);
    this.bodyC = scene.add.container(0, 0);
    this.glow = scene.add.image(0, 0, 'glow').setBlendMode(Phaser.BlendModes.ADD).setScale((s * 1.4) / 128).setAlpha(0.7);
    this.g = scene.add.graphics().setPosition(0, -foot);
    this.arm = scene.add.graphics().setPosition(ARM_PIVOT.x * s, ARM_PIVOT.y * s - foot);
    this.bodyC.add([this.glow, this.g, this.arm]);
    this.walkC.add(this.bodyC);
    this.hopC.add(this.walkC);
    this.rig.add([this.aura, this.hopC]);
    this.add(this.rig);
    this.redraw();
    this.applyLook();
    if (this.animate) {
      scene.tweens.add({ targets: this.bodyC, scaleY: 1.04, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
      scene.tweens.add({ targets: this.glow, alpha: 0.45, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
      this.scheduleBlink();
    }
    this.once(Phaser.GameObjects.Events.DESTROY, () => {
      this.blinkTimer?.remove();
      scene.tweens.killTweensOf([this.bodyC, this.glow, this.aura, this.hopC, this.walkC, this.rig, this]);
      this.walkTween?.stop();
      this.waveTween?.stop();
    });
  }

  /** Перерисовать в новом образе. */
  setLook(look: Look) {
    this.look = { ...look };
    this.redraw();
    this.applyLook();
    return this;
  }

  /** Повернуться: лёгкое сжатие по X и разворот. */
  face(dir: 1 | -1) {
    if (dir === this.facing) return this;
    this.facing = dir;
    this.scene.tweens.killTweensOf(this.rig);
    this.scene.tweens.chain({
      targets: this.rig,
      tweens: [
        { scaleX: -dir * 0.15, duration: 90, ease: 'Sine.in' },
        { scaleX: dir, duration: 120, ease: 'Back.out' },
      ],
    });
    if (this.pet) {
      const o = followOffset(this.size, dir);
      this.scene.tweens.add({ targets: this.pet, x: o.x, duration: 260, ease: 'Sine.inOut' });
      this.pet.setScale(dir, 1);
    }
    return this;
  }

  /** Помахать свободной рукой (~1 с). */
  wave() {
    this.waveTween?.stop();
    const st = { a: this.armAngle };
    const set = () => {
      this.armAngle = st.a;
      this.drawArmNow();
    };
    this.waveTween = this.scene.tweens.chain({
      targets: st,
      tweens: [
        { a: 1.95, duration: 220, ease: 'Back.out', onUpdate: set },
        { a: 1.5, duration: 140, ease: 'Sine.inOut', yoyo: true, repeat: 2, onUpdate: set },
        { a: 0, duration: 240, ease: 'Sine.inOut', onUpdate: set },
      ],
    });
    return this;
  }

  /** Покачивание на месте, как при ходьбе. */
  walk(on: boolean) {
    this.walkTween?.stop();
    this.walkTween = null;
    this.walkC.setAngle(0).setY(0);
    if (on) {
      const st = { t: 0 };
      this.walkTween = this.scene.tweens.add({
        targets: st,
        t: Math.PI * 2,
        duration: 520,
        repeat: -1,
        onUpdate: () => {
          this.walkC.setAngle(Math.sin(st.t) * 4);
          this.walkC.setY(-Math.abs(Math.sin(st.t)) * this.size * 0.04);
        },
      });
    }
    return this;
  }

  /** Подпрыгнуть. */
  hop() {
    const foot = 0.42 * this.size;
    this.scene.tweens.killTweensOf(this.hopC);
    this.hopC.setY(foot);
    this.scene.tweens.add({ targets: this.hopC, y: foot - this.size * 0.22, duration: 200, yoyo: true, ease: 'Quad.out' });
    this.scene.tweens.chain({
      targets: this.bodyC,
      tweens: [
        { scaleX: 1.08, duration: 70, yoyo: true },
        { scaleX: 1.06, duration: 80, delay: 260, yoyo: true },
      ],
    });
    return this;
  }

  private drawArmNow() {
    this.arm.clear();
    drawArm(new Pen(this.arm, this.size), this.look, this.armAngle);
  }

  private redraw() {
    this.g.clear();
    renderLumo(new Pen(this.g, this.size), this.look, this.blinking, { ...ALL, arm: false });
    this.drawArmNow();
  }

  private applyLook() {
    const s = this.size;
    const L = lanternPos(this.look.staff);
    this.glow.setPosition(L.x * s, L.y * s - 0.42 * s).setTint(lanternGlowOf(this.look.staff));
    const set = fullSet(this.look);
    this.scene.tweens.killTweensOf(this.aura);
    if (set) {
      this.aura.setTint(set.aura).setAlpha(0.35);
      if (this.animate) this.scene.tweens.add({ targets: this.aura, alpha: 0.18, scale: (s * 1.85) / 128, duration: 1400, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    } else this.aura.setAlpha(0);
    if (this.withPet) {
      const petId = this.look.pet;
      if (this.pet?.getData('petId') !== petId) {
        this.pet?.destroy();
        this.pet = null;
        if (petId && !petId.endsWith('-none')) {
          const o = followOffset(s, this.facing);
          this.pet = createPet(this.scene, s, petId).setPosition(o.x, o.y).setScale(this.facing, 1);
          this.pet.setData('petId', petId);
          this.addAt(this.pet, 0);
        }
      }
    }
  }

  private scheduleBlink() {
    this.blinkTimer = this.scene.time.delayedCall(Phaser.Math.Between(2200, 5200), () => {
      if (!this.active) return;
      this.blinking = true;
      this.redraw();
      this.scene.time.delayedCall(130, () => {
        if (!this.active) return;
        this.blinking = false;
        this.redraw();
        this.scheduleBlink();
      });
    });
  }
}

/** Живой Lumo: свечение фонаря, дыхание, моргание, аура полного набора, питомец (withPet). */
export function createLumoFigure(scene: Phaser.Scene, s: number, look: Look, opts: { animate?: boolean; withPet?: boolean } = {}): LumoFigure {
  const f = new LumoFigure(scene, s, look, opts);
  scene.add.existing(f);
  return f;
}

// ---------------------------------------------------------------------------
// Питомцы. s — размер Lumo, питомец ~PET_K·s. Начало — центр питомца, «земля» на +0.45 его размера.

export const PET_K = 0.45;

/** Где стоит питомец относительно Lumo (центр питомца): сзади-слева и чуть ниже. */
export function followOffset(s: number, facing: 1 | -1 = 1): Pt {
  return { x: -0.5 * s * facing, y: 0.42 * s - 0.45 * PET_K * s + 0.03 * s };
}

const petPen = (g: G, s: number) => new Pen(g, s * PET_K);

function petShadow(p: Pen, k = 1, a = 0.28) {
  p.ellipse(0, 0.45, 0.6 * k, 0.12 * k, 0x000000, a);
}

// Светлячок
function fireflyWings(p: Pen) {
  p.ellipse(-0.1, -0.2, 0.26, 0.16, 0xdfe8ff, 0.6, -0.5);
  p.ellipse(0.06, -0.22, 0.24, 0.15, 0xdfe8ff, 0.6, 0.4);
}
function fireflyBody(p: Pen) {
  p.ellipse(-0.13, 0.0, 0.26, 0.2, C.firefly);
  p.ellipse(-0.15, 0.0, 0.12, 0.1, 0xffffff, 0.85);
  p.ellipse(0.04, -0.05, 0.18, 0.15, 0x3a3350);
  p.circle(0.15, -0.08, 0.075, 0x3a3350);
  p.circle(0.18, -0.09, 0.022, 0xffffff);
  p.stroke(quad(0.17, -0.14, 0.2, -0.24, 0.27, -0.27, 6), 0.018, 0x3a3350);
  p.stroke(quad(0.13, -0.14, 0.12, -0.25, 0.17, -0.3, 6), 0.018, 0x3a3350);
}
// Совёнок (бурый) и снежный совёнок (белый, с жёлтыми глазами и крапинками)
interface OwlColors {
  body: number;
  wing: number;
  belly: number;
  chevron: number;
  face: number;
  lid: number;
  lidLine: number;
  iris?: number;
  speckle?: number;
}
const OWL_BROWN: OwlColors = { body: 0x8a6f5a, wing: 0x6e5644, belly: 0xd8c3a5, chevron: 0xa88a6a, face: 0xe8d8c0, lid: 0xb89a7c, lidLine: 0x5a4636 };
const OWL_SNOW: OwlColors = { body: 0xeef2fa, wing: 0xd2dbec, belly: 0xffffff, chevron: 0x8a94b0, face: 0xffffff, lid: 0xdfe6f4, lidLine: 0x7a84a0, iris: 0xffd23a, speckle: 0x6a7490 };
function owletBody(p: Pen, o: OwlColors = OWL_BROWN) {
  const b = o.body;
  p.tri(-0.24, -0.12, -0.16, -0.12, -0.25, -0.3, b);
  p.tri(0.24, -0.12, 0.16, -0.12, 0.25, -0.3, b);
  p.ellipse(0, 0.12, 0.6, 0.66, b);
  p.ellipse(-0.27, 0.18, 0.16, 0.36, o.wing, 1, 0.2);
  p.ellipse(0.27, 0.18, 0.16, 0.36, o.wing, 1, -0.2);
  if (o.speckle) {
    for (const [x, y] of [
      [-0.28, 0.1],
      [-0.25, 0.22],
      [-0.29, 0.28],
      [0.28, 0.1],
      [0.25, 0.22],
      [0.29, 0.28],
      [-0.17, -0.2],
      [0.17, -0.2],
      [0, -0.24],
    ])
      p.circle(x, y, 0.018, o.speckle, 0.7);
  }
  p.ellipse(0, 0.25, 0.36, 0.36, o.belly);
  for (const [x, y] of [
    [-0.08, 0.18],
    [0.08, 0.18],
    [0, 0.25],
    [-0.08, 0.32],
    [0.08, 0.32],
  ])
    p.stroke([x - 0.03, y - 0.015, x, y + 0.012, x + 0.03, y - 0.015], 0.016, o.chevron);
  p.ellipse(0, -0.04, 0.5, 0.3, o.face);
  for (const x of [-0.12, 0.12]) {
    p.circle(x, -0.04, 0.105, 0xffffff);
    if (o.iris) p.circle(x + 0.01, -0.035, 0.082, o.iris);
    p.circle(x + 0.01, -0.035, 0.06, INK);
    p.circle(x + 0.03, -0.055, 0.02, 0xffffff);
  }
  p.tri(-0.035, 0.04, 0.035, 0.04, 0, 0.1, o.iris ? 0x4a4a5a : 0xffa13b);
  for (const x of [-0.09, 0.09]) for (const d of [-0.03, 0, 0.03]) p.circle(x + d, 0.44, 0.02, o.iris ? 0x9aa0b4 : 0xffa13b);
  if (o === OWL_SNOW) {
    // Крошечный вязаный шарфик
    p.poly(cat(quad(-0.22, 0.08, 0, 0.15, 0.22, 0.08, 8), quad(0.22, 0.13, 0, 0.2, -0.22, 0.13, 8)), MITTEN);
    p.poly([0.1, 0.13, 0.17, 0.12, 0.2, 0.27, 0.13, 0.28], MITTEN);
    p.line(0.115, 0.2, 0.18, 0.195, 0.018, KNIT_CREAM);
    p.stroke(quad(-0.22, 0.105, 0, 0.175, 0.22, 0.105, 8), 0.014, KNIT_CREAM, 0.9);
  }
}
function owletLids(p: Pen, o: OwlColors = OWL_BROWN) {
  for (const x of [-0.12, 0.12]) {
    p.circle(x, -0.04, 0.11, o.lid);
    p.stroke(arcP(x, -0.04, 0.07, 0.03, 0.2, Math.PI - 0.2, 8), 0.016, o.lidLine);
  }
}
// Котик (смотрит вправо, сидит)
function kittenTail(p: Pen) {
  p.path(quad(0, 0, -0.22, -0.02, -0.17, -0.3, 10), 0.085, 0xf0a04a);
  p.circle(-0.17, -0.3, 0.045, 0xc8782a);
}
function kittenBody(p: Pen) {
  const o = 0xf0a04a;
  const d = 0xc8782a;
  p.ellipse(-0.04, 0.22, 0.48, 0.46, o);
  p.ellipse(0.05, 0.27, 0.22, 0.28, 0xfff1dc);
  p.stroke(arcP(-0.12, 0.22, 0.1, 0.12, Math.PI * 0.9, Math.PI * 1.3, 6), 0.03, d);
  p.stroke(arcP(-0.14, 0.3, 0.1, 0.12, Math.PI * 0.9, Math.PI * 1.3, 6), 0.03, d);
  for (const x of [0.0, 0.13]) p.ellipse(x, 0.42, 0.12, 0.08, 0xfff1dc);
  // Голова
  p.tri(-0.07, -0.18, 0.02, -0.22, -0.06, -0.34, o);
  p.tri(0.14, -0.22, 0.23, -0.18, 0.22, -0.34, o);
  p.tri(-0.05, -0.2, 0.0, -0.22, -0.055, -0.3, 0xff9eb0);
  p.tri(0.16, -0.22, 0.21, -0.2, 0.205, -0.3, 0xff9eb0);
  p.ellipse(0.08, -0.08, 0.4, 0.34, o);
  p.stroke([0.04, -0.24, 0.05, -0.18], 0.025, d);
  p.stroke([0.11, -0.24, 0.1, -0.18], 0.025, d);
  p.ellipse(0.12, -0.02, 0.2, 0.12, 0xfff1dc);
  for (const x of [0.01, 0.17]) {
    p.ellipse(x, -0.08, 0.05, 0.07, INK);
    p.circle(x + 0.01, -0.095, 0.014, 0xffffff);
  }
  p.tri(0.07, -0.035, 0.11, -0.035, 0.09, -0.01, 0xff7a8a);
  p.stroke(cat(arcP(0.07, -0.01, 0.02, 0.018, 0.2, Math.PI - 0.2, 5), arcP(0.11, -0.01, 0.02, 0.018, 0.2, Math.PI - 0.2, 5)), 0.01, INK);
  for (const dy of [-0.02, 0.01]) {
    p.line(-0.05, -0.02 + dy, -0.15, -0.035 + dy * 1.5, 0.007, 0xffffff, 0.7);
    p.line(0.23, -0.02 + dy, 0.33, -0.035 + dy * 1.5, 0.007, 0xffffff, 0.7);
  }
  p.ellipse(-0.08, -0.04, 0.06, 0.035, BLUSH, 0.6);
  p.ellipse(0.24, -0.04, 0.06, 0.035, BLUSH, 0.6);
}
// Лиса (смотрит вправо, сидит)
function foxTail(p: Pen) {
  const tail = cat(quad(0, 0.02, -0.2, 0.06, -0.3, -0.12, 10), quad(-0.3, -0.12, -0.34, -0.32, -0.2, -0.38, 8), quad(-0.2, -0.38, -0.16, -0.2, 0, -0.06, 10));
  p.poly(tail, 0xe8742a);
  p.poly(cat(quad(-0.3, -0.24, -0.33, -0.34, -0.2, -0.38, 6), quad(-0.2, -0.38, -0.2, -0.3, -0.3, -0.24, 6)), 0xfff1e0);
}
function foxBody(p: Pen) {
  const o = 0xe8742a;
  const w = 0xfff1e0;
  const d = 0x3a2a2a;
  p.ellipse(-0.03, 0.22, 0.44, 0.46, o);
  p.ellipse(0.06, 0.24, 0.2, 0.34, w);
  for (const x of [-0.02, 0.12]) {
    p.rect(x - 0.035, 0.3, 0.07, 0.14, d, 1, 0.03);
    p.ellipse(x, 0.43, 0.1, 0.05, d);
  }
  // Голова с острой мордочкой
  p.tri(-0.06, -0.14, 0.05, -0.2, -0.05, -0.38, o);
  p.tri(0.1, -0.2, 0.2, -0.14, 0.17, -0.38, o);
  p.tri(-0.055, -0.3, -0.035, -0.29, -0.05, -0.38, d);
  p.tri(0.16, -0.29, 0.175, -0.3, 0.17, -0.38, d);
  p.tri(-0.035, -0.17, 0.03, -0.2, -0.04, -0.3, 0xffd0b0);
  p.tri(0.12, -0.2, 0.18, -0.16, 0.16, -0.3, 0xffd0b0);
  p.ellipse(0.06, -0.08, 0.36, 0.3, o);
  p.poly([0.0, -0.06, 0.32, -0.02, 0.06, 0.06], w);
  p.poly([0.12, -0.12, 0.33, -0.03, 0.2, 0.02], o);
  p.circle(0.33, -0.025, 0.028, d);
  p.ellipse(0.1, -0.1, 0.05, 0.065, INK);
  p.circle(0.11, -0.115, 0.013, 0xffffff);
  p.ellipse(-0.03, -0.1, 0.035, 0.055, INK);
  p.ellipse(0.05, -0.02, 0.06, 0.035, BLUSH, 0.5);
}
// Мотылёк
function mothWing(p: Pen, sx: number) {
  const wc = 0xd8cdea;
  p.ellipse(sx * 0.2, -0.12, 0.36, 0.28, wc, 1, sx * -0.35);
  p.ellipse(sx * 0.16, 0.08, 0.24, 0.2, 0xc6b8de, 1, sx * 0.4);
  p.circle(sx * 0.22, -0.13, 0.055, 0xffb84d);
  p.circle(sx * 0.22, -0.13, 0.028, 0x3a3350);
  p.circle(sx * 0.15, 0.09, 0.025, 0x8a7ab0);
  p.stroke(arcP(sx * 0.2, -0.12, 0.16, 0.12, Math.PI * 1.1, Math.PI * 1.6, 8).map((v, i) => (i % 2 === 0 ? sx * Math.abs(v) : v)), 0.01, 0xffffff, 0.5);
}
function mothBody(p: Pen) {
  p.ellipse(0, 0.0, 0.14, 0.32, 0xf0e6cc);
  for (const y of [0.04, 0.09]) p.stroke(arcP(0, y, 0.06, 0.015, 0.2, Math.PI - 0.2, 6), 0.012, 0xc9b896);
  p.circle(0, -0.15, 0.075, 0xf8f0dc);
  for (const sx of [-1, 1]) {
    p.circle(sx * 0.032, -0.16, 0.02, INK);
    const ant = quad(sx * 0.03, -0.21, sx * 0.05, -0.3, sx * 0.13, -0.33, 6);
    p.stroke(ant, 0.012, 0x8a7a5a);
    for (let i = 2; i < ant.length - 2; i += 2) p.line(ant[i], ant[i + 1], ant[i] + sx * 0.02, ant[i + 1] - 0.025, 0.008, 0x8a7a5a);
  }
  p.ellipse(-0.06, -0.12, 0.03, 0.02, BLUSH, 0.6);
  p.ellipse(0.06, -0.12, 0.03, 0.02, BLUSH, 0.6);
}
// Грибочек
function mushroomBody(p: Pen) {
  p.ellipse(-0.07, 0.43, 0.1, 0.05, 0xd8c3a5);
  p.ellipse(0.07, 0.43, 0.1, 0.05, 0xd8c3a5);
  p.rect(-0.15, -0.02, 0.3, 0.44, 0xfff1dc, 1, 0.12);
  p.rect(0.06, 0.02, 0.07, 0.36, 0xe8d8bc, 1, 0.035);
  for (const x of [-0.06, 0.06]) {
    p.ellipse(x, 0.16, 0.04, 0.055, INK);
    p.circle(x + 0.008, 0.148, 0.011, 0xffffff);
  }
  p.ellipse(-0.1, 0.22, 0.05, 0.03, BLUSH, 0.7);
  p.ellipse(0.1, 0.22, 0.05, 0.03, BLUSH, 0.7);
  p.stroke(arcP(0, 0.21, 0.025, 0.02, 0.3, Math.PI - 0.3, 6), 0.012, INK);
  p.ellipse(0, 0.0, 0.62, 0.12, 0xf3e2c8);
  p.poly(cat(arcP(0, 0.0, 0.34, 0.36, Math.PI, Math.PI * 2, 20)), 0xd8463a);
  p.ellipse(-0.12, -0.22, 0.14, 0.06, 0xffffff, 0.2, -0.5);
  for (const [x, y, r] of [
    [-0.17, -0.1, 0.045],
    [0.0, -0.22, 0.055],
    [0.18, -0.11, 0.04],
    [-0.06, -0.06, 0.03],
    [0.1, -0.26, 0.025],
  ])
    p.circle(x, y, r, 0xfff6ee);
}

/** Питомец целиком (статично). s — размер Lumo. */
export function drawPet(g: G, s: number, petId: string) {
  const p = petPen(g, s);
  switch (petId) {
    case 'pet-firefly':
      p.ellipse(0, 0.45, 0.24, 0.06, 0x000000, 0.18);
      p.circle(-0.13, 0, 0.3, C.fireflyGlow, 0.14);
      p.circle(-0.13, 0, 0.18, C.fireflyGlow, 0.22);
      fireflyWings(p);
      fireflyBody(p);
      break;
    case 'pet-owlet':
    case 'pet-snowowl':
      petShadow(p);
      owletBody(p, petId === 'pet-snowowl' ? OWL_SNOW : OWL_BROWN);
      break;
    case 'pet-kitten':
      petShadow(p);
      kittenTail(p.at(-0.2, 0.36));
      kittenBody(p);
      break;
    case 'pet-fox':
      petShadow(p);
      foxTail(p.at(-0.18, 0.36));
      foxBody(p);
      break;
    case 'pet-moth':
      p.ellipse(0, 0.45, 0.3, 0.07, 0x000000, 0.18);
      mothWing(p, -1);
      mothWing(p, 1);
      mothBody(p);
      break;
    case 'pet-mushroom':
      petShadow(p, 0.9);
      mushroomBody(p);
      break;
  }
}

/** Питомец с анимацией ожидания; pet-none — пустой контейнер. s — размер Lumo. */
export function createPet(scene: Phaser.Scene, s: number, petId: string): Phaser.GameObjects.Container {
  const c = scene.add.container(0, 0);
  const u = s * PET_K;
  const gfx = () => scene.add.graphics();
  const tw = (cfg: Phaser.Types.Tweens.TweenBuilderConfig) => scene.tweens.add(cfg);
  const timers: Phaser.Time.TimerEvent[] = [];
  switch (petId) {
    case 'pet-firefly': {
      const sh = gfx();
      new Pen(sh, u).ellipse(0, 0.45, 0.24, 0.06, 0x000000, 0.18);
      const fly = scene.add.container(0, 0);
      const glow = scene.add.image(-0.13 * u, 0, 'glow').setTint(C.fireflyGlow).setBlendMode(Phaser.BlendModes.ADD).setScale((u * 1.3) / 128).setAlpha(0.7);
      const wings = gfx();
      fireflyWings(new Pen(wings, u));
      const body = gfx();
      fireflyBody(new Pen(body, u));
      fly.add([glow, wings, body]);
      c.add([sh, fly]);
      tw({ targets: fly, x: { from: -0.25 * u, to: 0.25 * u }, duration: 1700, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
      tw({ targets: fly, y: { from: -0.12 * u, to: 0.1 * u }, duration: 1100, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
      tw({ targets: glow, alpha: 0.3, duration: 420, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
      tw({ targets: wings, scaleY: 0.5, y: -0.1 * u, duration: 70, yoyo: true, repeat: -1 });
      break;
    }
    case 'pet-owlet':
    case 'pet-snowowl': {
      const oc = petId === 'pet-snowowl' ? OWL_SNOW : OWL_BROWN;
      const body = gfx();
      const p = new Pen(body, u);
      petShadow(p);
      owletBody(p, oc);
      const lids = gfx();
      owletLids(new Pen(lids, u), oc);
      lids.setVisible(false);
      c.add([body, lids]);
      const blink = () => {
        timers.push(
          scene.time.delayedCall(Phaser.Math.Between(1800, 4200), () => {
            if (!c.active) return;
            lids.setVisible(true);
            scene.time.delayedCall(150, () => {
              if (!c.active) return;
              lids.setVisible(false);
              blink();
            });
          }),
        );
      };
      blink();
      tw({ targets: [body, lids], angle: { from: -3, to: 3 }, duration: 1600, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
      break;
    }
    case 'pet-kitten':
    case 'pet-fox': {
      const fox = petId === 'pet-fox';
      const sh = gfx();
      petShadow(new Pen(sh, u));
      const tail = gfx().setPosition((fox ? -0.18 : -0.2) * u, 0.36 * u);
      (fox ? foxTail : kittenTail)(new Pen(tail, u));
      const body = gfx();
      (fox ? foxBody : kittenBody)(new Pen(body, u));
      c.add([sh, tail, body]);
      tw({ targets: tail, angle: { from: fox ? -6 : -14, to: fox ? 8 : 14 }, duration: fox ? 900 : 520, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
      tw({ targets: body, scaleY: 1.03, y: -0.012 * u, duration: 1000, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
      break;
    }
    case 'pet-moth': {
      const sh = gfx();
      new Pen(sh, u).ellipse(0, 0.45, 0.3, 0.07, 0x000000, 0.18);
      const fly = scene.add.container(0, 0);
      const wl = gfx();
      mothWing(new Pen(wl, u), -1);
      const wr = gfx();
      mothWing(new Pen(wr, u), 1);
      const body = gfx();
      mothBody(new Pen(body, u));
      fly.add([wl, wr, body]);
      c.add([sh, fly]);
      tw({ targets: [wl, wr], scaleX: 0.55, duration: 140, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
      tw({ targets: fly, y: { from: -0.06 * u, to: 0.06 * u }, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
      tw({ targets: fly, x: { from: -0.08 * u, to: 0.08 * u }, duration: 1500, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
      break;
    }
    case 'pet-mushroom': {
      const sh = gfx();
      petShadow(new Pen(sh, u), 0.9);
      // Начало тела — у «ног», чтобы сжатие было от земли
      const body = gfx().setPosition(0, 0.45 * u);
      mushroomBody(new Pen(body, u, 1, 0, -0.45 * u));
      c.add([sh, body]);
      scene.tweens.chain({
        targets: body,
        loop: -1,
        loopDelay: 900,
        tweens: [
          { scaleY: 0.86, scaleX: 1.1, duration: 120, ease: 'Sine.out' },
          { scaleY: 1.08, scaleX: 0.94, y: 0.45 * u - 0.22 * u, duration: 220, ease: 'Quad.out' },
          { scaleY: 1, scaleX: 1, y: 0.45 * u, duration: 200, ease: 'Quad.in' },
          { scaleY: 0.9, scaleX: 1.06, duration: 80, yoyo: true },
        ],
      });
      tw({ targets: sh, scaleX: 0.75, duration: 220, delay: 120, yoyo: true, repeat: -1, repeatDelay: 1160, hold: 0 });
      break;
    }
  }
  c.once(Phaser.GameObjects.Events.DESTROY, () => {
    for (const t of timers) t.remove();
    scene.tweens.killTweensOf(c.getAll());
    for (const ch of c.getAll()) if (ch instanceof Phaser.GameObjects.Container) scene.tweens.killTweensOf(ch.getAll());
  });
  return c;
}

// ---------------------------------------------------------------------------
// След при ходьбе

export type TrailShape = 'spark' | 'petal' | 'star' | 'snow' | 'leaf' | 'firefly';
export interface TrailConfig {
  tints: number[];
  texture: 'glow' | 'dot';
  shape: TrailShape;
}

export function trailConfig(trailId: string): TrailConfig | null {
  switch (trailId) {
    case 'trail-sparks':
      return { tints: [0xffd36b, 0xfff1cc, 0xffb84d], texture: 'glow', shape: 'spark' };
    case 'trail-petals':
      return { tints: [0xffb3cf, 0xff8ab0, 0xfff0f5], texture: 'dot', shape: 'petal' };
    case 'trail-stars':
      return { tints: [0xffe08a, 0xfff1cc, 0xd8b8ff], texture: 'glow', shape: 'star' };
    case 'trail-snow':
      return { tints: [0xffffff, 0xcfe6ff, 0xe8f4ff], texture: 'dot', shape: 'snow' };
    case 'trail-leaves':
      return { tints: [0x9dff5c, 0x5cae4a, 0xe8a03a, 0xc8ff7a], texture: 'dot', shape: 'leaf' };
    case 'trail-fireflies':
      return { tints: [C.firefly, C.fireflyGlow], texture: 'glow', shape: 'firefly' };
    case 'trail-aurora':
      // Северное сияние: бирюза, зелень и сирень, звёздочки.
      return { tints: [0x7affd8, 0x9dff9a, 0xc9a8ff, 0x8ad8ff], texture: 'glow', shape: 'star' };
    default:
      return null;
  }
}

/** Фигуры частиц следа (белые, красятся tint), рисуются в квадрате 32×32. */
function drawTrailShape(g: G, shape: TrailShape, cx: number, cy: number, r: number, color = 0xffffff, alpha = 1) {
  const p = new Pen(g, r, 1, cx, cy);
  switch (shape) {
    case 'petal':
      p.poly(cat(quad(0, 0.9, -0.75, 0.1, -0.15, -0.85, 10), [0, -0.6], quad(0.15, -0.85, 0.75, 0.1, 0, 0.9, 10)), color, alpha);
      break;
    case 'star':
      p.poly(starP(0, 0.05, 0.95, 0.45), color, alpha);
      break;
    case 'snow':
      for (let i = 0; i < 3; i++) {
        const a = (i * Math.PI) / 3;
        const dx = Math.cos(a) * 0.9;
        const dy = Math.sin(a) * 0.9;
        p.line(-dx, -dy, dx, dy, 0.16, color, alpha);
        for (const sgn of [-1, 1]) {
          const bx = sgn * dx * 0.55;
          const by = sgn * dy * 0.55;
          const a1 = a + (sgn > 0 ? 0 : Math.PI);
          p.line(bx, by, bx + Math.cos(a1 + 0.7) * 0.3, by + Math.sin(a1 + 0.7) * 0.3, 0.12, color, alpha);
          p.line(bx, by, bx + Math.cos(a1 - 0.7) * 0.3, by + Math.sin(a1 - 0.7) * 0.3, 0.12, color, alpha);
        }
      }
      p.circle(0, 0, 0.18, color, alpha);
      break;
    case 'leaf':
      p.poly(cat(quad(-0.8, 0.5, -0.6, -0.6, 0.85, -0.6, 10), quad(0.85, -0.6, 0.6, 0.6, -0.8, 0.5, 10)), color, alpha);
      p.line(-0.9, 0.62, 0.5, -0.35, 0.1, 0x000000, alpha * 0.25);
      break;
    case 'firefly':
      p.circle(0, 0, 0.9, color, alpha * 0.25);
      p.circle(0, 0, 0.45, color, alpha);
      p.circle(0, 0, 0.2, 0xffffff, alpha);
      break;
    default:
      p.circle(0, 0, 0.9, color, alpha * 0.3);
      p.circle(0, 0, 0.45, color, alpha);
  }
}

/** Текстуры фигурных частиц ('trail-petal', 'trail-star', 'trail-snow', 'trail-leaf') — один раз. */
export function ensureTrailTextures(scene: Phaser.Scene) {
  for (const shape of ['petal', 'star', 'snow', 'leaf'] as const) {
    const key = `trail-${shape}`;
    if (scene.textures.exists(key)) continue;
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    drawTrailShape(g, shape, 16, 16, 15);
    g.generateTexture(key, 32, 32);
    g.destroy();
  }
}

/** Короткий выброс 4–8 частиц следа в точке шага. size — размер Lumo (масштаб частиц). */
export function emitTrail(scene: Phaser.Scene, x: number, y: number, trailId: string, depth: number, size = 100) {
  const cfg = trailConfig(trailId);
  if (!cfg) return null;
  ensureTrailTextures(scene);
  const k = size / 100;
  const key = cfg.shape === 'spark' || cfg.shape === 'firefly' ? 'glow' : `trail-${cfg.shape}`;
  const base: Phaser.Types.GameObjects.Particles.ParticleEmitterConfig = {
    emitting: false,
    tint: cfg.tints,
    angle: { min: 200, max: 340 },
    alpha: { start: 1, end: 0 },
  };
  let extra: Phaser.Types.GameObjects.Particles.ParticleEmitterConfig;
  let life = 1000;
  switch (cfg.shape) {
    case 'spark':
      life = 750;
      extra = { speed: { min: 20 * k, max: 70 * k }, lifespan: { min: 450, max: life }, scale: { start: 0.2 * k, end: 0 }, gravityY: -20 * k, blendMode: Phaser.BlendModes.ADD };
      break;
    case 'firefly':
      life = 1400;
      extra = { speed: { min: 12 * k, max: 40 * k }, angle: { min: 220, max: 320 }, lifespan: { min: 900, max: life }, scale: { start: 0.14 * k, end: 0.05 * k }, gravityY: -15 * k, blendMode: Phaser.BlendModes.ADD };
      break;
    case 'star':
      life = 900;
      extra = { speed: { min: 20 * k, max: 60 * k }, lifespan: { min: 600, max: life }, scale: { start: 0.5 * k, end: 0 }, rotate: { min: -180, max: 180 }, gravityY: -10 * k, blendMode: Phaser.BlendModes.ADD };
      break;
    case 'snow':
      life = 1300;
      extra = { speed: { min: 10 * k, max: 30 * k }, lifespan: { min: 900, max: life }, scale: { start: 0.4 * k, end: 0.25 * k }, rotate: { min: -180, max: 180 }, gravityY: 25 * k };
      break;
    default:
      // petal, leaf: взлетают и плавно падают, поворачиваясь
      life = 1200;
      extra = { speed: { min: 15 * k, max: 45 * k }, lifespan: { min: 800, max: life }, scale: { start: 0.5 * k, end: 0.3 * k }, rotate: { min: -180, max: 180 }, gravityY: 30 * k };
  }
  const em = scene.add.particles(x, y, key, { ...base, ...extra }).setDepth(depth);
  em.explode(Phaser.Math.Between(4, 8));
  scene.time.delayedCall(life + 150, () => em.destroy());
  return em;
}

// ---------------------------------------------------------------------------
// Фонари на поле (клетка L). s — размер клетки, центр — в центре клетки.

interface LampStyle {
  frame: number;
  glass: number;
  glow: number;
}
const LAMP: Record<string, LampStyle> = {
  'lamp-classic': { frame: 0xff8a2a, glass: 0xfff6e0, glow: C.lanternOn },
  'lamp-paper': { frame: 0xe8473a, glass: 0xffc28a, glow: 0xff9a5a },
  'lamp-candle': { frame: 0xffb84d, glass: 0xfff6e0, glow: 0xffc65c },
  'lamp-flower': { frame: 0xff7aa8, glass: 0xfff6e0, glow: 0xffb3cf },
  'lamp-crystal': { frame: 0x4ac8ff, glass: 0xe0fbff, glow: 0x9fe8ff },
  'lamp-star': { frame: 0xffb84d, glass: 0xfff6e0, glow: 0xffe08a },
  'lamp-moon': { frame: 0x9cb0ff, glass: 0xf4f6ff, glow: 0xcfd8ff },
  'lamp-gold': { frame: 0xffcf4d, glass: 0xfffbe8, glow: 0xffe08a },
  'lamp-icicle': { frame: 0x7cc8f0, glass: 0xeefcff, glow: 0xb8ecff },
};

/** Цвет свечения фонаря на поле в этом стиле. */
export function lampGlowOf(styleId: string): number {
  return (LAMP[styleId] ?? LAMP['lamp-classic']).glow;
}

export function drawFieldLamp(g: G, styleId: string, s: number, lit: boolean) {
  const st = LAMP[styleId] ?? LAMP['lamp-classic'];
  const p = new Pen(g, s);
  const on = lit;
  const off = C.lanternOff;
  const dim = 0x3a3350;
  // Постамент: тёмный диск, у горящего — ободок цвета рамки
  p.circle(0, 0.02, 0.36, 0x15112b, 0.92);
  p.ring(0, 0.02, 0.36, 0.035, on ? st.frame : 0x4a4466, on ? 1 : 0.8);
  p.ellipse(0, 0.3, 0.3, 0.08, 0x000000, 0.35);
  const post = styleId === 'lamp-gold' ? (on ? 0xb5862a : 0x5a4a3a) : C.post;
  const stdPost = () => {
    p.rect(-0.03, -0.12, 0.06, 0.42, post);
    p.rect(-0.1, 0.24, 0.2, 0.06, post, 1, 0.02);
  };
  const frame = on ? st.frame : dim;
  const glass = on ? st.glass : off;
  const core = (x: number, y: number, r = 0.06) => p.circle(x, y, on ? r : r * 0.75, on ? 0xffffff : 0x8a7d66);
  switch (styleId) {
    case 'lamp-paper': {
      p.rect(-0.02, -0.16, 0.04, 0.46, 0x5a4636);
      p.rect(-0.1, 0.24, 0.2, 0.06, post, 1, 0.02);
      p.line(-0.0, -0.44, 0, -0.38, 0.02, 0x2a2238);
      p.rect(-0.07, -0.4, 0.14, 0.04, 0x2a2238, 1, 0.01);
      p.ellipse(0, -0.24, 0.3, 0.27, on ? st.frame : 0x5a2f2f);
      p.ellipse(0, -0.24, 0.21, 0.22, on ? st.glass : 0x6d4a3a);
      for (const dy of [-0.07, 0, 0.07]) p.stroke(arcP(0, -0.24 + dy, 0.145, 0.02, 0, Math.PI, 8), 0.012, on ? 0xb5302a : 0x3a2222, 0.8);
      p.rect(-0.07, -0.12, 0.14, 0.035, 0x2a2238, 1, 0.01);
      core(0, -0.24, 0.05);
      break;
    }
    case 'lamp-candle': {
      // Подсвечник с блюдцем, свеча и пламя
      p.rect(-0.04, 0.0, 0.08, 0.3, post);
      p.ellipse(0, 0.27, 0.24, 0.07, post);
      p.ellipse(0, 0.0, 0.3, 0.08, on ? st.frame : dim);
      p.ellipse(0, -0.01, 0.24, 0.05, 0x15112b, 0.5);
      p.rect(-0.065, -0.26, 0.13, 0.26, on ? 0xfff1dc : 0x8a8070, 1, 0.025);
      p.rect(0.02, -0.25, 0.03, 0.22, 0x000000, 0.12, 0.01);
      p.ellipse(-0.02, -0.255, 0.07, 0.03, on ? 0xffffff : 0x9a9080, 0.8);
      p.line(0, -0.27, 0, -0.3, 0.015, 0x2a2238);
      if (on) {
        p.poly(cat(quad(0, -0.47, 0.075, -0.36, 0.045, -0.31, 6), quad(0.045, -0.31, 0, -0.27, -0.045, -0.31, 4), quad(-0.045, -0.31, -0.075, -0.36, 0, -0.47, 6)), st.frame);
        p.poly(cat(quad(0, -0.42, 0.045, -0.35, 0.025, -0.315, 5), quad(0.025, -0.315, 0, -0.295, -0.025, -0.315, 3), quad(-0.025, -0.315, -0.045, -0.35, 0, -0.42, 5)), 0xffffff);
      } else p.circle(0, -0.31, 0.012, 0x8a7d66);
      break;
    }
    case 'lamp-flower': {
      // Стебель с листьями и цветок-фонарь
      p.stroke(quad(0, 0.28, -0.04, 0.05, 0, -0.16, 8), 0.05, on ? 0x4f9e45 : 0x3a4a3a);
      p.ellipse(-0.1, 0.12, 0.16, 0.07, on ? 0x5cb84e : 0x3a4a3a, 1, -0.5);
      p.ellipse(0.09, 0.05, 0.14, 0.06, on ? 0x5cb84e : 0x3a4a3a, 1, 0.5);
      p.rect(-0.1, 0.24, 0.2, 0.06, post, 1, 0.02);
      const petal = on ? st.frame : 0x4a3a4e;
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
        p.ellipse(Math.cos(a) * 0.1, -0.27 + Math.sin(a) * 0.1, 0.13, 0.17, petal, 1, a + Math.PI / 2);
      }
      p.circle(0, -0.27, 0.095, glass);
      core(0, -0.27, 0.055);
      break;
    }
    case 'lamp-crystal': {
      p.poly([-0.12, 0.27, -0.08, 0.08, 0.08, 0.08, 0.12, 0.27], post);
      const c1 = on ? 0x7fe0ff : 0x4a5a6e;
      const c2 = on ? 0xc8f6ff : 0x5e6e80;
      p.poly([-0.17, 0.1, -0.2, -0.08, -0.14, -0.16, -0.09, -0.06, -0.08, 0.1], c1);
      p.poly([0.17, 0.1, 0.2, -0.04, 0.15, -0.12, 0.1, -0.04, 0.08, 0.1], c1);
      p.poly([0, -0.46, 0.1, -0.33, 0.09, 0.1, -0.09, 0.1, -0.1, -0.33], frame);
      p.poly([0, -0.42, 0.065, -0.32, 0.06, 0.05, -0.06, 0.05, -0.065, -0.32], glass);
      p.poly([0, -0.42, 0, 0.05, -0.06, 0.05, -0.065, -0.32], c2, 0.5);
      core(0, -0.18, 0.05);
      break;
    }
    case 'lamp-star': {
      stdPost();
      p.star(0, -0.25, 0.22, frame, 1, 0.5);
      p.star(0, -0.245, 0.15, glass, 1, 0.5);
      core(0, -0.24, 0.05);
      break;
    }
    case 'lamp-moon': {
      stdPost();
      const outer = arcP(0, -0.24, 0.2, 0.2, Math.PI * 0.35, Math.PI * 1.65, 20);
      const inner = arcP(0.09, -0.27, 0.16, 0.16, Math.PI * 1.62, Math.PI * 0.38, 20);
      p.poly(cat(outer, inner), frame);
      const o2 = arcP(0, -0.24, 0.15, 0.15, Math.PI * 0.42, Math.PI * 1.58, 16);
      const i2 = arcP(0.07, -0.26, 0.135, 0.135, Math.PI * 1.55, Math.PI * 0.45, 16);
      p.poly(cat(o2, i2), glass);
      p.star(0.1, -0.24, 0.06, on ? 0xffffff : 0x8a7d66, 1, 0.42);
      break;
    }
    case 'lamp-gold': {
      stdPost();
      // Узорные «плечи» и шпиль
      p.stroke(quad(-0.03, -0.1, -0.16, -0.08, -0.18, -0.2, 6), 0.025, post);
      p.stroke(quad(0.03, -0.1, 0.16, -0.08, 0.18, -0.2, 6), 0.025, post);
      p.rect(-0.16, -0.38, 0.32, 0.31, frame, 1, 0.07);
      p.rect(-0.115, -0.335, 0.23, 0.22, glass, 1, 0.05);
      p.line(-0.115, -0.225, 0.115, -0.225, 0.012, frame, 0.5);
      p.tri(-0.18, -0.37, 0.18, -0.37, 0, -0.47, frame);
      p.circle(0, -0.49, 0.03, frame);
      p.circle(-0.18, -0.21, 0.025, frame);
      p.circle(0.18, -0.21, 0.025, frame);
      core(0, -0.225);
      if (on) p.circle(-0.07, -0.3, 0.018, 0xffffff, 0.8);
      break;
    }
    case 'lamp-icicle': {
      // Фонарь-сосулька: столб в инее, ледяной фонарь под снежной крышей, по краям свисают сосульки
      stdPost();
      p.circle(-0.03, 0.05, 0.03, on ? 0xffffff : 0x8a90a8, 0.8);
      p.circle(0.025, -0.05, 0.022, on ? 0xffffff : 0x8a90a8, 0.7);
      const ice = on ? 0xc8f0ff : 0x55607a;
      const iceHi = on ? 0xffffff : 0x7a84a0;
      p.rect(-0.15, -0.37, 0.3, 0.3, frame, 1, 0.07);
      p.rect(-0.11, -0.33, 0.22, 0.22, glass, 1, 0.05);
      if (on) p.poly([-0.11, -0.33, 0.0, -0.33, -0.11, -0.2], 0xffffff, 0.45);
      // Сосульки под фонарём
      for (const [x, len] of [
        [-0.12, 0.1],
        [-0.065, 0.16],
        [0.065, 0.12],
        [0.12, 0.08],
      ] as const) {
        p.tri(x - 0.025, -0.075, x + 0.025, -0.075, x, -0.075 + len, ice);
        p.tri(x - 0.025, -0.075, x - 0.005, -0.075, x, -0.075 + len, iceHi, 0.55);
      }
      // Крыша со снегом и сосульки с крыши
      p.tri(-0.19, -0.36, 0.19, -0.36, 0, -0.47, C.post);
      p.poly(cat(quad(-0.21, -0.35, -0.12, -0.44, 0, -0.485, 8), quad(0, -0.485, 0.12, -0.44, 0.21, -0.35, 8), quad(0.21, -0.35, 0, -0.38, -0.21, -0.35, 8)), on ? 0xffffff : 0x8a90a8);
      for (const x of [-0.17, 0.17]) p.tri(x - 0.022, -0.355, x + 0.022, -0.355, x, -0.27, ice);
      core(0, -0.22);
      if (on) for (const [x, y] of [[-0.24, -0.3], [0.25, -0.18], [-0.22, -0.05]] as const) p.star(x, y, 0.03, 0xffffff, 0.85, 0.35);
      break;
    }
    default: {
      // lamp-classic: как drawLamp в BoardView
      stdPost();
      p.rect(-0.15, -0.37, 0.3, 0.3, frame, 1, 0.07);
      p.rect(-0.11, -0.33, 0.22, 0.22, glass, 1, 0.05);
      p.tri(-0.17, -0.36, 0.17, -0.36, 0, -0.47, C.post);
      core(0, -0.22);
    }
  }
}

// ---------------------------------------------------------------------------
// Иконки вещей для сетки гардероба (в квадрате ±0.5s)

function noneIcon(p: Pen) {
  p.ring(0, 0, 0.26, 0.04, 0x9aa3d6, 0.6);
  p.line(-0.18, 0.18, 0.18, -0.18, 0.04, 0x9aa3d6, 0.6);
}

export function drawItemIcon(g: G, s: number, itemId: string) {
  const it = itemById(itemId);
  if (!it) return;
  const p = new Pen(g, s);
  if (itemId.endsWith('-none')) return noneIcon(p);
  const look: Look = { ...DEFAULT_LOOK, [it.slot]: itemId };
  switch (it.slot) {
    case 'hat': {
      // Голова крупно
      const k = 1.3;
      renderLumo(new Pen(g, s * k, 1, 0, s * 0.19 * k), look, false, { shadow: false, body: false, head: true, hat: true, staff: false, arm: false });
      break;
    }
    case 'face': {
      const k = 2;
      renderLumo(new Pen(g, s * k, 1, 0, s * 0.06 * k), { ...look, hat: 'none' }, false, { shadow: false, body: false, head: true, hat: false, staff: false, arm: false });
      break;
    }
    case 'outfit': {
      const k = 0.88;
      renderLumo(new Pen(g, s * k, 1, -s * 0.03, s * 0.06), look, false, { ...ALL, staff: false });
      break;
    }
    case 'accessory': {
      if (itemId === 'acc-mittens') {
        // Пара варежек на шнурке крупно
        p.stroke(quad(-0.2, -0.12, 0, 0.12, 0.2, -0.12, 12), 0.018, KNIT_CREAM, 0.9);
        mitten(p, -0.17, 0.06, -0.25, -1, 3.2);
        mitten(new Pen(g, s, -1), -0.17, 0.06, -0.25, -1, 3.2);
        break;
      }
      const k = 0.88;
      renderLumo(new Pen(g, s * k, 1, -s * 0.02, s * 0.06), look, false, { ...ALL, staff: false });
      break;
    }
    case 'staff': {
      const k = 1.15;
      const L = lanternPos(itemId);
      const cx = (STAFF_B.x + L.x) / 2;
      drawStaff(new Pen(g, s * k, 1, -cx * s * k, -0.1 * s * k), itemId);
      break;
    }
    case 'pet':
      drawPet(g, (s * 0.85) / PET_K, itemId);
      break;
    case 'trail': {
      const cfg = trailConfig(itemId);
      if (!cfg) return noneIcon(p);
      const pts: [number, number, number][] = [
        [-0.3, 0.2, 0.11],
        [-0.1, 0.0, 0.14],
        [0.12, 0.16, 0.1],
        [0.28, -0.12, 0.13],
        [0.02, -0.26, 0.09],
      ];
      pts.forEach(([x, y, r], i) => drawTrailShape(g, cfg.shape, x * s, y * s, r * s, cfg.tints[i % cfg.tints.length]));
      break;
    }
    case 'lamp':
      drawFieldLamp(g, itemId, s * 0.95, true);
      break;
  }
}
