// Скины на экране: что надето (костюм, фонарь, дорога, арка) и как выглядят стили дороги и арки.
// Покупка и надевание — src/meta.ts, список — src/core/economy.ts (SKINS).

import Phaser from 'phaser';
import { costumeAvatar } from '../core/economy';
import type { LanternShape } from '../core/avatars';
import { getEconomy } from '../meta';

export type RoadStyle = 'glow' | 'moon' | 'firefly' | 'stars' | 'stones' | 'planks';
export type ArchStyle = 'portal' | 'moon' | 'stone' | 'flowers' | 'gold';

/** Цвета ленты света для светящихся стилей дороги: сияние, полоса, сердцевина. */
export const ROAD_COLORS: Record<'glow' | 'moon' | 'firefly' | 'stars', { glow: number; band: number; core: number }> = {
  glow: { glow: 0xffc65c, band: 0xf0bd6e, core: 0xfff1cc },
  moon: { glow: 0x9cc8ff, band: 0xb8d4ff, core: 0xf2f7ff },
  firefly: { glow: 0x9dff5c, band: 0xb8f07a, core: 0xf2ffd8 },
  stars: { glow: 0xd8b8ff, band: 0xc9a8ff, core: 0xffffff },
};

/** Цвета арки: кольцо, ободок, свечение открытой/закрытой. */
export const ARCH_COLORS: Record<ArchStyle, { ring: number; rim: number; open: number; closed: number }> = {
  portal: { ring: 0x6c6aa0, rim: 0x9b7bff, open: 0x8ef0c8, closed: 0x9b7bff },
  moon: { ring: 0x9aa6c8, rim: 0xd8e4ff, open: 0xcfe6ff, closed: 0x8898c8 },
  stone: { ring: 0x7a7468, rim: 0xa89e8c, open: 0xffd36b, closed: 0x8a7a60 },
  flowers: { ring: 0x3e6e4a, rim: 0xffb3cf, open: 0xffd0e4, closed: 0x9b7bff },
  gold: { ring: 0xc99a2a, rim: 0xffe08a, open: 0xfff1cc, closed: 0xc9a040 },
};

export interface Look {
  avatar: number;
  lantern?: LanternShape;
  road: RoadStyle;
  arch: ArchStyle;
}

/** Что сейчас надето. */
export function equippedLook(): Look {
  const e = getEconomy();
  const lantern = e.skins.equipped.lantern.replace('lantern-', '');
  return {
    avatar: costumeAvatar(e),
    lantern: lantern === 'default' ? undefined : (lantern as LanternShape),
    road: e.skins.equipped.road.replace('road-', '') as RoadStyle,
    arch: e.skins.equipped.arch.replace('arch-', '') as ArchStyle,
  };
}

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
  } else if (style === 'gold' || style === 'moon') {
    g.fillStyle(style === 'gold' ? 0xffe08a : 0xe8f0ff, 1);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      g.fillCircle(x + Math.cos(a) * r * 1.14, y + Math.sin(a) * r * 1.14, r * 0.09);
    }
  }
}
