// Стили поля на экране: что надето (образ Lumo, фонари, дорога, арка) и как выглядят стили дороги и арки.
// Покупка и надевание — src/meta.ts, список — src/core/wardrobe.ts (WARDROBE).

import Phaser from 'phaser';
import type { Look } from '../core/wardrobe';
import { getEconomy } from '../meta';

export type RoadStyle = 'glow' | 'moon' | 'firefly' | 'sunset' | 'aurora' | 'stars' | 'stones' | 'planks' | 'ember' | 'mint' | 'ice';
export type ArchStyle = 'portal' | 'moon' | 'sunset' | 'stone' | 'flowers' | 'gold' | 'crystal' | 'leaves';

/** Цвета ленты света для светящихся стилей дороги: сияние, полоса, сердцевина. */
export const ROAD_COLORS: Record<Exclude<RoadStyle, 'stones' | 'planks'>, { glow: number; band: number; core: number }> = {
  ember: { glow: 0xff6a3a, band: 0xff8a4a, core: 0xffe0b0 },
  mint: { glow: 0x6affc8, band: 0x9af0d0, core: 0xeafff6 },
  glow: { glow: 0xffc65c, band: 0xf0bd6e, core: 0xfff1cc },
  moon: { glow: 0x9cc8ff, band: 0xb8d4ff, core: 0xf2f7ff },
  firefly: { glow: 0x9dff5c, band: 0xb8f07a, core: 0xf2ffd8 },
  sunset: { glow: 0xff8a6a, band: 0xffa07a, core: 0xffe6d8 },
  aurora: { glow: 0x5affd0, band: 0x8ab8ff, core: 0xe8fff8 },
  stars: { glow: 0xd8b8ff, band: 0xc9a8ff, core: 0xffffff },
  ice: { glow: 0x48c8ff, band: 0xbdeeff, core: 0xffffff },
};

/**
 * «Ледяная дорога»: трещинки во льду и искры инея на отрезке a → b (s — размер клетки). Детали стабильны:
 * зависят от seed (номер отрезка), не от случайности. Общая для образца в магазине и для поля (BoardView).
 */
export function drawIceDetails(g: Phaser.GameObjects.Graphics, ax: number, ay: number, bx: number, by: number, s: number, seed: number, alpha = 1) {
  const len = Math.hypot(bx - ax, by - ay) || 1;
  const ux = (bx - ax) / len;
  const uy = (by - ay) / len;
  const nx = -uy;
  const ny = ux;
  const h = (k: number) => {
    const v = Math.sin(seed * 127.1 + k * 311.7) * 43758.5453;
    return v - Math.floor(v);
  };
  // Трещинки: ломаные поперёк ленты с короткой веточкой
  g.lineStyle(Math.max(1, s * 0.018), 0xffffff, 0.75 * alpha);
  for (let k = 0; k < 2; k++) {
    const t = 0.25 + k * 0.45 + (h(k) - 0.5) * 0.15;
    const side = h(k + 7) < 0.5 ? -1 : 1;
    const cx = ax + (bx - ax) * t;
    const cy = ay + (by - ay) * t;
    const p1 = { x: cx + nx * side * s * 0.13, y: cy + ny * side * s * 0.13 };
    const p2 = { x: cx + ux * s * 0.05 + nx * side * s * 0.03, y: cy + uy * s * 0.05 + ny * side * s * 0.03 };
    const p3 = { x: cx - ux * s * 0.02 - nx * side * s * 0.08, y: cy - uy * s * 0.02 - ny * side * s * 0.08 };
    g.lineBetween(p1.x, p1.y, p2.x, p2.y);
    g.lineBetween(p2.x, p2.y, p3.x, p3.y);
    g.lineBetween(p2.x, p2.y, p2.x + ux * s * 0.07, p2.y + uy * s * 0.07);
  }
  // Искры инея: крестики-звёздочки по краям ленты
  for (let k = 0; k < 3; k++) {
    const t = (k + 0.5) / 3 + (h(k + 3) - 0.5) * 0.2;
    const off = (h(k + 11) - 0.5) * s * 0.3;
    const x = ax + (bx - ax) * t + nx * off;
    const y = ay + (by - ay) * t + ny * off;
    const r = s * (0.03 + h(k + 5) * 0.025);
    g.lineStyle(Math.max(1, s * 0.012), 0xffffff, 0.9 * alpha);
    g.lineBetween(x - r, y, x + r, y);
    g.lineBetween(x, y - r, x, y + r);
    g.fillStyle(0xffffff, alpha);
    g.fillCircle(x, y, Math.max(1, s * 0.012));
  }
}

/** Цвета арки: кольцо, ободок, свечение открытой/закрытой. */
export const ARCH_COLORS: Record<ArchStyle, { ring: number; rim: number; open: number; closed: number }> = {
  portal: { ring: 0x6c6aa0, rim: 0x9b7bff, open: 0x8ef0c8, closed: 0x9b7bff },
  moon: { ring: 0x9aa6c8, rim: 0xd8e4ff, open: 0xcfe6ff, closed: 0x8898c8 },
  sunset: { ring: 0xa8586a, rim: 0xffa07a, open: 0xffd0a8, closed: 0xc87a8a },
  stone: { ring: 0x7a7468, rim: 0xa89e8c, open: 0xffd36b, closed: 0x8a7a60 },
  flowers: { ring: 0x3e6e4a, rim: 0xffb3cf, open: 0xffd0e4, closed: 0x9b7bff },
  gold: { ring: 0xc99a2a, rim: 0xffe08a, open: 0xfff1cc, closed: 0xc9a040 },
  crystal: { ring: 0x5a8ac8, rim: 0xbfefff, open: 0xd8f6ff, closed: 0x7aa8e0 },
  leaves: { ring: 0x2e5a36, rim: 0x9ad86a, open: 0xd8ffb0, closed: 0x6a9a5a },
};

/** Что сейчас надето (образ Lumo и стили поля). */
export function currentLook(): Look {
  return getEconomy().wardrobe.look;
}

export const roadStyleOf = (look: Pick<Look, 'road'>) => look.road.replace('road-', '') as RoadStyle;
export const archStyleOf = (look: Pick<Look, 'arch'>) => look.arch.replace('arch-', '') as ArchStyle;

/** Образец дороги для магазина: короткий отрезок с поворотом. */
export function drawRoadSample(g: Phaser.GameObjects.Graphics, style: RoadStyle, x: number, y: number, s: number) {
  const pts = [new Phaser.Math.Vector2(x - s * 0.5, y + s * 0.25), new Phaser.Math.Vector2(x, y + s * 0.25), new Phaser.Math.Vector2(x, y - s * 0.35)];
  const line = (w: number, color: number, alpha: number) => {
    g.lineStyle(w, color, alpha);
    g.strokePoints(pts, false);
    g.fillStyle(color, alpha);
    for (const p of pts) g.fillCircle(p.x, p.y, w / 2);
  };
  if (style === 'stones') {
    line(s * 0.3, 0x8a6436, 1);
    line(s * 0.24, 0xe8c07a, 1);
    for (let i = 0; i < 8; i++) {
      const t = i / 7;
      const p = t < 0.5 ? new Phaser.Math.Vector2(pts[0].x + (pts[1].x - pts[0].x) * t * 2, pts[0].y) : new Phaser.Math.Vector2(pts[1].x, pts[1].y + (pts[2].y - pts[1].y) * (t - 0.5) * 2);
      g.fillStyle(i % 2 ? 0xf3d89c : 0xc49a5a, 1);
      g.fillEllipse(p.x + (i % 3 - 1) * s * 0.04, p.y + (i % 2 ? 1 : -1) * s * 0.03, s * 0.09, s * 0.07);
    }
    return;
  }
  if (style === 'planks') {
    line(s * 0.28, 0x5a3a20, 1);
    g.fillStyle(0x9a6a3e, 1);
    for (let i = 0; i < 4; i++) g.fillRect(pts[0].x + i * s * 0.13 - s * 0.04, pts[0].y - s * 0.12, s * 0.09, s * 0.24);
    for (let i = 0; i < 5; i++) g.fillRect(pts[1].x - s * 0.12, pts[1].y - i * s * 0.13 - s * 0.04, s * 0.24, s * 0.09);
    return;
  }
  const c = ROAD_COLORS[style];
  line(s * 0.5, c.glow, 0.15);
  line(s * 0.22, c.band, 0.95);
  line(s * 0.08, c.core, 0.9);
  if (style === 'ice') for (let i = 0; i + 1 < pts.length; i++) drawIceDetails(g, pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y, s * 0.55, i + 1);
}

/** Образец арки для магазина. */
export function drawArchSample(g: Phaser.GameObjects.Graphics, style: ArchStyle, x: number, y: number, r: number) {
  const c = ARCH_COLORS[style];
  g.fillStyle(c.open, 0.15);
  g.fillCircle(x, y, r * 1.3);
  g.fillStyle(0x14524e, 1);
  g.fillCircle(x, y, r);
  g.lineStyle(r * 0.26, c.ring, 1);
  g.strokeCircle(x, y, r);
  g.lineStyle(r * 0.07, c.rim, 1);
  g.strokeCircle(x, y, r * 1.14);
  g.fillStyle(c.open, 0.9);
  g.fillCircle(x, y, r * 0.35);
  decorateArch(g, style, x, y, r);
}

/** Детали стиля поверх кольца арки (камни, цветы, лучи). */
export function decorateArch(g: Phaser.GameObjects.Graphics, style: ArchStyle, x: number, y: number, r: number) {
  if (style === 'stone') {
    g.lineStyle(r * 0.05, 0x4a463e, 1);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      g.lineBetween(x + Math.cos(a) * r * 0.87, y + Math.sin(a) * r * 0.87, x + Math.cos(a) * r * 1.13, y + Math.sin(a) * r * 1.13);
    }
  } else if (style === 'flowers') {
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 - Math.PI / 2;
      g.fillStyle(i % 2 ? 0xffb3cf : 0xfff4e0, 1);
      g.fillCircle(x + Math.cos(a) * r, y + Math.sin(a) * r, r * 0.13);
    }
  } else if (style === 'leaves') {
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      g.fillStyle(i % 2 ? 0x9ad86a : 0x5aa04a, 1);
      g.fillEllipse(x + Math.cos(a) * r * 1.02, y + Math.sin(a) * r * 1.02, r * 0.26, r * 0.14);
    }
  } else if (style === 'crystal') {
    g.fillStyle(0xe8fbff, 0.95);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
      const cx = x + Math.cos(a) * r * 1.1;
      const cy = y + Math.sin(a) * r * 1.1;
      g.fillTriangle(cx - r * 0.07, cy, cx + r * 0.07, cy, cx, cy - r * 0.2);
    }
  } else if (style === 'gold' || style === 'moon') {
    g.fillStyle(style === 'gold' ? 0xffe08a : 0xe8f0ff, 1);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      g.fillCircle(x + Math.cos(a) * r * 1.14, y + Math.sin(a) * r * 1.14, r * 0.09);
    }
  }
}
