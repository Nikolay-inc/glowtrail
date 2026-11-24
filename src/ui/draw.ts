// Вся графика рисуется фигурами в коде: иконки плиток, кнопки, Lumo, свечение.

import Phaser from 'phaser';
import { AVATARS, avatarById, type Avatar } from '../core/avatars';
import { addDust, addFog, addVignette, createFxTextures } from './fx';
import { keepFitted, type ViewRect } from './viewport';
import type { TileKind } from '../core/types';
import { C, FONT, H, W } from './theme';

type G = Phaser.GameObjects.Graphics;

/** Создаёт общие текстуры: мягкое свечение и точку. Вызывается один раз при загрузке. */
export function createTextures(scene: Phaser.Scene) {
  createFxTextures(scene);
  if (!scene.textures.exists('glow')) {
    const size = 128;
    const tex = scene.textures.createCanvas('glow', size, size)!;
    const ctx = tex.getContext();
    const grd = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.25, 'rgba(255,255,255,0.55)');
    grd.addColorStop(0.6, 'rgba(255,255,255,0.12)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, size, size);
    tex.refresh();
  }
  if (!scene.textures.exists('dot')) {
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0xffffff, 1);
    g.fillCircle(8, 8, 8);
    g.generateTexture('dot', 16, 16);
    g.destroy();
  }
}

// ---------------------------------------------------------------------------
// Иконки плиток. Рисуются «вверх» — в лотке их поворачивают по направлению дороги.

function arrowHead(g: G, tipX: number, tipY: number, angle: number, size: number) {
  const a1 = angle + Math.PI * 0.78;
  const a2 = angle - Math.PI * 0.78;
  g.fillTriangle(
    tipX,
    tipY,
    tipX + Math.cos(a1) * size,
    tipY + Math.sin(a1) * size,
    tipX + Math.cos(a2) * size,
    tipY + Math.sin(a2) * size,
  );
}

export function drawTileIcon(g: G, kind: TileKind, s: number, color: number) {
  const lw = s * 0.13;
  g.lineStyle(lw, color, 1);
  g.fillStyle(color, 1);
  const up = -Math.PI / 2;
  switch (kind) {
    case 'straight':
      g.lineBetween(0, s * 0.36, 0, -s * 0.12);
      g.fillCircle(0, s * 0.36, lw / 2);
      arrowHead(g, 0, -s * 0.4, up, s * 0.34);
      break;
    case 'straight2':
      g.lineBetween(0, s * 0.4, 0, -s * 0.04);
      g.fillCircle(0, s * 0.4, lw / 2);
      arrowHead(g, 0, -s * 0.18, up, s * 0.3);
      arrowHead(g, 0, -s * 0.44, up, s * 0.3);
      break;
    case 'left':
    case 'right': {
      const m = kind === 'left' ? -1 : 1;
      const r = s * 0.22;
      g.lineBetween(0, s * 0.38, 0, s * 0.06);
      g.fillCircle(0, s * 0.38, lw / 2);
      g.beginPath();
      if (m < 0) g.arc(-r, s * 0.06, r, 0, -Math.PI / 2, true);
      else g.arc(r, s * 0.06, r, Math.PI, Math.PI * 1.5, false);
      g.strokePath();
      arrowHead(g, m * s * 0.44, s * 0.06 - r, m < 0 ? Math.PI : 0, s * 0.3);
      break;
    }
    case 'jump': {
      // Дуга со стрелкой над препятствием: дорога перепрыгивает одну клетку.
      g.fillStyle(0x8f8679, 1);
      g.fillRoundedRect(s * 0.02, -s * 0.06, s * 0.2, s * 0.2, s * 0.04);
      g.fillStyle(color, 1);
      const curve = new Phaser.Curves.QuadraticBezier(new Phaser.Math.Vector2(0, s * 0.4), new Phaser.Math.Vector2(-s * 0.62, s * 0.04), new Phaser.Math.Vector2(-s * 0.02, -s * 0.3));
      g.strokePoints(curve.getPoints(16), false);
      g.fillCircle(0, s * 0.4, lw / 2);
      arrowHead(g, s * 0.04, -s * 0.36, up + 0.75, s * 0.3);
      break;
    }
    case 'bridge': {
      // Арка моста над волнами и стрелка вперёд.
      g.beginPath();
      g.arc(0, s * 0.16, s * 0.3, Math.PI, Math.PI * 2, false);
      g.strokePath();
      g.lineStyle(lw * 0.7, color, 1);
      g.lineBetween(-s * 0.4, s * 0.16, s * 0.4, s * 0.16);
      g.lineStyle(lw * 0.55, 0x7fc0ff, 1);
      for (const yy of [s * 0.3, s * 0.42]) {
        g.beginPath();
        g.moveTo(-s * 0.36, yy);
        for (let i = 1; i <= 6; i++) g.lineTo(-s * 0.36 + i * s * 0.12, yy + (i % 2 ? -s * 0.04 : 0));
        g.strokePath();
      }
      g.fillStyle(color, 1);
      arrowHead(g, 0, -s * 0.44, up, s * 0.24);
      break;
    }
  }
}

// ---------------------------------------------------------------------------
// Иконки интерфейса

export type IconName = 'restart' | 'undo' | 'menu' | 'stats' | 'sound' | 'mute' | 'play' | 'lock' | 'copy' | 'back' | 'trash' | 'bulb' | 'skip' | 'plus' | 'cloud' | 'user' | 'help' | 'vibrate' | 'novibrate';

export function drawIcon(g: G, name: IconName, s: number, color: number) {
  const lw = s * 0.12;
  g.lineStyle(lw, color, 1);
  g.fillStyle(color, 1);
  switch (name) {
    case 'restart': {
      const r = s * 0.3;
      g.beginPath();
      g.arc(0, 0, r, -Math.PI * 0.35, Math.PI * 1.35, false);
      g.strokePath();
      const a = -Math.PI * 0.35;
      arrowHead(g, Math.cos(a) * r + s * 0.06, Math.sin(a) * r + s * 0.02, a + Math.PI * 0.55, s * 0.26);
      break;
    }
    case 'undo': {
      const r = s * 0.24;
      g.beginPath();
      g.arc(s * 0.02, s * 0.04, r, Math.PI, Math.PI * 2.5, false);
      g.strokePath();
      g.lineBetween(s * 0.02, s * 0.04 + r, -s * 0.14, s * 0.04 + r);
      arrowHead(g, -r + s * 0.02, s * 0.04 - s * 0.16, -Math.PI / 2, s * 0.26);
      break;
    }
    case 'menu': {
      const q = s * 0.2;
      for (const [x, y] of [
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
      ])
        g.fillRoundedRect(x * q * 1.15 - q * 0.9, y * q * 1.15 - q * 0.9, q * 1.8, q * 1.8, q * 0.4);
      break;
    }
    case 'stats':
      g.fillRoundedRect(-s * 0.34, s * 0.02, s * 0.18, s * 0.3, s * 0.04);
      g.fillRoundedRect(-s * 0.09, -s * 0.3, s * 0.18, s * 0.62, s * 0.04);
      g.fillRoundedRect(s * 0.16, -s * 0.12, s * 0.18, s * 0.44, s * 0.04);
      break;
    case 'sound':
    case 'mute':
      g.fillRect(-s * 0.36, -s * 0.12, s * 0.16, s * 0.24);
      g.fillTriangle(-s * 0.24, -s * 0.12, -s * 0.02, -s * 0.32, -s * 0.02, 0);
      g.fillTriangle(-s * 0.24, s * 0.12, -s * 0.02, s * 0.32, -s * 0.02, 0);
      g.fillRect(-s * 0.24, -s * 0.12, s * 0.22, s * 0.24);
      if (name === 'sound') {
        g.lineStyle(lw * 0.8, color, 1);
        g.beginPath();
        g.arc(s * 0.02, 0, s * 0.16, -Math.PI / 3, Math.PI / 3, false);
        g.strokePath();
        g.beginPath();
        g.arc(s * 0.02, 0, s * 0.3, -Math.PI / 3, Math.PI / 3, false);
        g.strokePath();
      } else {
        g.lineStyle(lw * 0.8, color, 1);
        g.lineBetween(s * 0.08, -s * 0.14, s * 0.36, s * 0.14);
        g.lineBetween(s * 0.36, -s * 0.14, s * 0.08, s * 0.14);
      }
      break;
    case 'vibrate':
    case 'novibrate': {
      // Телефон и волны вибрации по бокам; «выключено» — перечёркнуто.
      g.lineStyle(lw * 0.8, color, 1);
      g.strokeRoundedRect(-s * 0.13, -s * 0.28, s * 0.26, s * 0.56, s * 0.06);
      g.fillRect(-s * 0.05, s * 0.18, s * 0.1, s * 0.04);
      for (const side of [-1, 1]) {
        g.beginPath();
        g.moveTo(side * s * 0.24, -s * 0.16);
        g.lineTo(side * s * 0.3, -s * 0.08);
        g.lineTo(side * s * 0.24, 0);
        g.lineTo(side * s * 0.3, s * 0.08);
        g.lineTo(side * s * 0.24, s * 0.16);
        g.strokePath();
      }
      if (name === 'novibrate') g.lineBetween(-s * 0.36, s * 0.34, s * 0.36, -s * 0.34);
      break;
    }
    case 'play':
      g.fillTriangle(-s * 0.2, -s * 0.32, -s * 0.2, s * 0.32, s * 0.34, 0);
      break;
    case 'lock':
      g.fillRoundedRect(-s * 0.26, -s * 0.04, s * 0.52, s * 0.38, s * 0.06);
      g.beginPath();
      g.arc(0, -s * 0.06, s * 0.16, Math.PI, Math.PI * 2, false);
      g.strokePath();
      break;
    case 'copy':
      g.strokeRoundedRect(-s * 0.3, -s * 0.2, s * 0.4, s * 0.5, s * 0.06);
      g.strokeRoundedRect(-s * 0.1, -s * 0.34, s * 0.4, s * 0.5, s * 0.06);
      break;
    case 'back':
      g.lineBetween(s * 0.3, 0, -s * 0.16, 0);
      arrowHead(g, -s * 0.34, 0, Math.PI, s * 0.32);
      break;
    case 'bulb':
      g.fillCircle(0, -s * 0.1, s * 0.24);
      g.fillRoundedRect(-s * 0.12, s * 0.08, s * 0.24, s * 0.16, s * 0.04);
      g.fillRect(-s * 0.09, s * 0.27, s * 0.18, s * 0.06);
      g.lineStyle(lw * 0.6, color, 1);
      for (const a of [-150, -110, -70, -30]) {
        const r = (a * Math.PI) / 180;
        g.lineBetween(Math.cos(r) * s * 0.33, -s * 0.1 + Math.sin(r) * s * 0.33, Math.cos(r) * s * 0.44, -s * 0.1 + Math.sin(r) * s * 0.44);
      }
      break;
    case 'skip':
      g.fillTriangle(-s * 0.34, -s * 0.26, -s * 0.34, s * 0.26, 0, 0);
      g.fillTriangle(-s * 0.04, -s * 0.26, -s * 0.04, s * 0.26, s * 0.3, 0);
      g.fillRect(s * 0.26, -s * 0.26, s * 0.08, s * 0.52);
      break;
    case 'plus':
      g.fillRoundedRect(-s * 0.06, -s * 0.3, s * 0.12, s * 0.6, s * 0.04);
      g.fillRoundedRect(-s * 0.3, -s * 0.06, s * 0.6, s * 0.12, s * 0.04);
      break;
    case 'help':
      // Вопросительный знак: дуга, хвостик и точка.
      g.beginPath();
      g.arc(0, -s * 0.12, s * 0.18, Math.PI * 1.05, Math.PI * 2.3, false);
      g.strokePath();
      g.lineBetween(0, s * 0.02, 0, s * 0.12);
      g.fillCircle(0, s * 0.3, lw * 0.75);
      break;
    case 'cloud':
      g.fillCircle(-s * 0.16, s * 0.04, s * 0.17);
      g.fillCircle(s * 0.06, -s * 0.06, s * 0.22);
      g.fillCircle(s * 0.24, s * 0.08, s * 0.14);
      g.fillRoundedRect(-s * 0.33, s * 0.04, s * 0.71, s * 0.18, s * 0.09);
      break;
    case 'user':
      g.fillCircle(0, -s * 0.12, s * 0.17);
      g.fillRoundedRect(-s * 0.3, s * 0.1, s * 0.6, s * 0.26, { tl: s * 0.2, tr: s * 0.2, bl: s * 0.04, br: s * 0.04 });
      break;
    case 'trash':
      g.fillRoundedRect(-s * 0.22, -s * 0.16, s * 0.44, s * 0.48, s * 0.06);
      g.fillRect(-s * 0.32, -s * 0.28, s * 0.64, s * 0.08);
      g.fillRect(-s * 0.08, -s * 0.36, s * 0.16, s * 0.08);
      break;
  }
}

export function starPoints(r: number, inner = 0.45): Phaser.Math.Vector2[] {
  const pts: Phaser.Math.Vector2[] = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 === 0 ? r : r * inner;
    pts.push(new Phaser.Math.Vector2(Math.cos(a) * rr, Math.sin(a) * rr));
  }
  return pts;
}

export function drawStar(g: G, x: number, y: number, r: number, color: number, alpha = 1) {
  g.fillStyle(color, alpha);
  g.fillPoints(
    starPoints(r).map((p) => new Phaser.Math.Vector2(p.x + x, p.y + y)),
    true,
  );
}

// ---------------------------------------------------------------------------
// Кнопка с иконкой и/или подписью

export interface ButtonOpts {
  w: number;
  h: number;
  icon?: IconName;
  label?: string;
  fontSize?: number;
  primary?: boolean;
  onClick: () => void;
}

export class Button extends Phaser.GameObjects.Container {
  private bg: G;
  private iconG: G;
  private labelT?: Phaser.GameObjects.Text;
  private enabledState = true;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    private opts: ButtonOpts,
  ) {
    super(scene, x, y);
    this.bg = scene.add.graphics();
    this.iconG = scene.add.graphics();
    this.add([this.bg, this.iconG]);
    if (opts.label) {
      this.labelT = scene.add
        .text(opts.icon ? opts.h * 0.32 : 0, 0, opts.label, {
          fontFamily: FONT,
          fontSize: `${opts.fontSize ?? Math.round(opts.h * 0.38)}px`,
          color: opts.primary ? '#2a1a05' : C.text,
          fontStyle: 'bold',
        })
        .setOrigin(0.5);
      this.add(this.labelT);
    }
    this.redraw();
    this.setSize(opts.w, opts.h);
    this.setInteractive({ useHandCursor: true });
    this.on('pointerdown', () => {
      if (!this.enabledState) return;
      scene.tweens.add({ targets: this, scale: 0.92, duration: 70, yoyo: true });
    });
    this.on('pointerup', () => {
      if (!this.enabledState) return;
      opts.onClick();
    });
    scene.add.existing(this);
  }

  setIcon(icon: IconName) {
    this.opts.icon = icon;
    this.redraw();
  }

  setEnabled(v: boolean) {
    this.enabledState = v;
    this.setAlpha(v ? 1 : 0.35);
    return this;
  }

  private redraw() {
    const { w, h, primary, icon } = this.opts;
    const g = this.bg;
    g.clear();
    if (primary) {
      g.fillStyle(C.primaryDark, 1);
      g.fillRoundedRect(-w / 2, -h / 2 + 8, w, h, h * 0.3);
      g.fillStyle(C.primary, 1);
      g.fillRoundedRect(-w / 2, -h / 2, w, h, h * 0.3);
      g.fillStyle(0xffffff, 0.2);
      g.fillRoundedRect(-w / 2 + 12, -h / 2 + 8, w - 24, h * 0.3, h * 0.15);
    } else {
      g.fillStyle(0x000000, 0.25);
      g.fillRoundedRect(-w / 2, -h / 2 + 6, w, h, h * 0.3);
      g.fillStyle(C.button, 1);
      g.fillRoundedRect(-w / 2, -h / 2, w, h, h * 0.3);
      g.lineStyle(4, C.buttonEdge, 1);
      g.strokeRoundedRect(-w / 2, -h / 2, w, h, h * 0.3);
    }
    this.iconG.clear();
    if (icon) {
      const s = h * 0.62;
      this.iconG.setPosition(0, 0);
      drawIcon(this.iconG, icon, s, primary ? 0x2a1a05 : C.icon);
    }
    if (this.labelT && icon) {
      // Иконка и подпись — одной группой по центру кнопки.
      const iconW = h * 0.5;
      const gap = h * 0.16;
      const labelW = this.labelT.width;
      const group = iconW + gap + labelW;
      const left = -Math.min(group, w - h * 0.3) / 2;
      this.iconG.setX(left + iconW / 2);
      this.labelT.setX(left + iconW + gap + labelW / 2);
    } else if (this.labelT) {
      this.labelT.setX(0);
    }
  }
}

// ---------------------------------------------------------------------------
// Фонарщик Lumo

/** Рисует фонарщика Lumo в Graphics (без анимации). Вариант — аватарка игрока. */
export function drawLumo(g: G, s: number, avatar: Avatar = AVATARS[0]) {
  // Тень
  g.fillStyle(0x000000, 0.3);
  g.fillEllipse(0, s * 0.42, s * 0.7, s * 0.16);
  // Плащ
  g.fillStyle(avatar.cloak, 1);
  g.fillTriangle(-s * 0.34, s * 0.42, s * 0.34, s * 0.42, 0, -s * 0.2);
  g.fillRoundedRect(-s * 0.34, s * 0.08, s * 0.68, s * 0.36, s * 0.14);
  g.fillStyle(0xffffff, 0.12);
  g.fillRoundedRect(-s * 0.3, s * 0.1, s * 0.6, s * 0.08, s * 0.04);
  // Лицо
  g.fillStyle(0xffe3c2, 1);
  g.fillCircle(0, -s * 0.06, s * 0.2);
  // Колпак
  g.fillStyle(avatar.hat, 1);
  g.fillTriangle(-s * 0.24, -s * 0.1, s * 0.24, -s * 0.1, s * 0.06, -s * 0.52);
  g.fillStyle(C.lanternOn, 1);
  g.fillCircle(s * 0.06, -s * 0.52, s * 0.05);
  // Глаза и щёки
  g.fillStyle(0x1a1a2e, 1);
  g.fillCircle(-s * 0.07, -s * 0.03, s * 0.035);
  g.fillCircle(s * 0.07, -s * 0.03, s * 0.035);
  g.fillStyle(0xff9e9e, 0.6);
  g.fillCircle(-s * 0.13, s * 0.04, s * 0.035);
  g.fillCircle(s * 0.13, s * 0.04, s * 0.035);
  // Посох с фонариком — форма фонаря зависит от аватарки
  g.lineStyle(s * 0.05, 0x6b4a2b, 1);
  g.lineBetween(s * 0.3, s * 0.4, s * 0.36, -s * 0.06);
  const lx = s * 0.42;
  const ly = -s * 0.11;
  g.fillStyle(C.lanternOn, 1);
  switch (avatar.lantern) {
    case 'square':
      g.fillRoundedRect(lx - s * 0.1, ly - s * 0.09, s * 0.2, s * 0.18, s * 0.05);
      break;
    case 'round':
      g.fillCircle(lx, ly, s * 0.11);
      break;
    case 'star':
      g.fillPoints(starPoints(s * 0.14, 0.5).map((p) => new Phaser.Math.Vector2(p.x + lx, p.y + ly)), true);
      break;
    case 'diamond':
      g.fillPoints(
        [
          [0, -0.14],
          [0.1, 0],
          [0, 0.14],
          [-0.1, 0],
        ].map(([px, py]) => new Phaser.Math.Vector2(lx + px * s, ly + py * s)),
        true,
      );
      break;
  }
  g.fillStyle(0xffffff, 0.9);
  g.fillCircle(lx, ly, s * 0.04);
}

export function createLumo(scene: Phaser.Scene, size: number, avatarId = 0, animate = true): Phaser.GameObjects.Container {
  const avatar = avatarById(avatarId);
  const c = scene.add.container(0, 0);
  const glow = scene.add.image(size * 0.42, -size * 0.12, 'glow').setTint(C.lanternOn).setBlendMode(Phaser.BlendModes.ADD);
  glow.setScale((size * 1.4) / 128).setAlpha(0.7);
  const g = scene.add.graphics();
  drawLumo(g, size, avatar);
  c.add([glow, g]);
  if (animate) {
    // Лёгкое «дыхание» и мерцание фонарика
    scene.tweens.add({ targets: g, scaleY: 1.04, y: -size * 0.015, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    scene.tweens.add({ targets: glow, alpha: 0.45, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
  }
  return c;
}

/** Значок арки-портала: кольцо, светящийся проём и замок (закрыта) или искра (открыта). */
export function drawPortalIcon(g: G, x: number, y: number, r: number, open: boolean) {
  g.fillStyle(open ? C.exitOpen : 0x9b7bff, 0.18);
  g.fillCircle(x, y, r * 1.35);
  g.fillStyle(open ? 0x1d6b66 : 0x2a2350, 1);
  g.fillCircle(x, y, r);
  g.lineStyle(r * 0.26, 0x6c6aa0, 1);
  g.strokeCircle(x, y, r);
  g.fillStyle(open ? C.exitOpen : 0x9b7bff, open ? 0.9 : 0.55);
  g.fillCircle(x, y, r * 0.45);
  for (const [dx, dy] of [
    [0, -1],
    [1, 0],
    [0, 1],
    [-1, 0],
  ]) {
    g.fillStyle(open ? 0xbffff0 : 0xd8ccff, open ? 0.95 : 0.6);
    g.fillCircle(x + dx * r * 1.28, y + dy * r * 1.28, r * 0.16);
  }
  if (!open) drawPadlock(g, x, y + r * 0.05, r * 0.85);
}

/** Светлячок: прозрачные крылышки и светящееся брюшко. on — горит (собран / есть на поле), иначе тусклый. */
export function drawFireflyIcon(g: G, x: number, y: number, r: number, on: boolean) {
  if (on) {
    g.fillStyle(C.fireflyGlow, 0.22);
    g.fillCircle(x, y + r * 0.2, r * 1.25);
  }
  // Крылья
  g.fillStyle(0xdfe8ff, on ? 0.55 : 0.25);
  g.fillEllipse(x - r * 0.45, y - r * 0.45, r * 0.8, r * 0.5);
  g.fillEllipse(x + r * 0.45, y - r * 0.45, r * 0.8, r * 0.5);
  // Голова и брюшко-огонёк
  g.fillStyle(0x3a3350, 1);
  g.fillCircle(x, y - r * 0.45, r * 0.26);
  g.fillStyle(on ? C.firefly : 0x56604a, 1);
  g.fillEllipse(x, y + r * 0.15, r * 0.62, r * 0.9);
  if (on) {
    g.fillStyle(0xffffff, 0.7);
    g.fillEllipse(x - r * 0.08, y + r * 0.02, r * 0.2, r * 0.32);
  }
}

/** Замок (без цифры): корпус и дужка. */
export function drawPadlock(g: G, x: number, y: number, s: number, shackleLift = 0) {
  g.lineStyle(s * 0.14, 0xe7c66b, 1);
  g.beginPath();
  g.arc(x, y - s * 0.1 - shackleLift, s * 0.24, Math.PI, Math.PI * 2, false);
  g.strokePath();
  g.lineBetween(x - s * 0.24, y - s * 0.1 - shackleLift, x - s * 0.24, y + s * 0.02 - shackleLift);
  g.lineBetween(x + s * 0.24, y - s * 0.1, x + s * 0.24, y + s * 0.02);
  g.fillStyle(0xffd36b, 1);
  g.fillRoundedRect(x - s * 0.36, y - s * 0.02, s * 0.72, s * 0.56, s * 0.1);
  g.fillStyle(0xffffff, 0.35);
  g.fillRoundedRect(x - s * 0.3, y + s * 0.03, s * 0.6, s * 0.12, s * 0.05);
}

/** Круглый значок с аватаркой (меню, победа, профиль). locked — серый с замком и условием. */
export function createAvatarBadge(
  scene: Phaser.Scene,
  x: number,
  y: number,
  r: number,
  avatarId: number,
  opts: { locked?: boolean; selected?: boolean; animate?: boolean } = {},
): Phaser.GameObjects.Container {
  const avatar = avatarById(avatarId);
  const c = scene.add.container(x, y);
  const bg = scene.add.graphics();
  bg.fillStyle(0x000000, 0.3);
  bg.fillCircle(0, 6, r);
  bg.fillStyle(opts.locked ? C.cardDisabled : 0x2b3470, 1);
  bg.fillCircle(0, 0, r);
  bg.lineStyle(Math.max(4, r * 0.07), opts.selected ? C.primary : C.cardEdge, 1);
  bg.strokeCircle(0, 0, r);
  c.add(bg);
  const lumo = createLumo(scene, r * 1.45, avatar.id, opts.animate ?? false).setPosition(-r * 0.08, r * 0.12);
  c.add(lumo);
  if (opts.locked) {
    lumo.setAlpha(0.25);
    const lg = scene.add.graphics();
    drawIcon(lg, 'lock', r * 0.7, C.icon);
    lg.setPosition(0, -r * 0.12);
    c.add(lg);
    c.add(text(scene, 0, r * 0.5, `★ ${avatar.stars}`, Math.round(r * 0.34), '#ffd36b'));
  }
  return c;
}

// ---------------------------------------------------------------------------
// Ночной фон: градиент, мерцающие звёзды и светлячки

/**
 * Фон сцены. evening — тёплый вечер «Долины» (закатное небо и тёмные холмы внизу), иначе ночное небо.
 */
export function addBackground(scene: Phaser.Scene, opts: { dust?: boolean; evening?: boolean } = {}) {
  // Фон на весь экран (а не только на раскладку 1080×1920): градиент перерисовывается при смене размера.
  const g = scene.add.graphics().setDepth(-10);
  let vignette: Phaser.GameObjects.Image | null = null;
  const paint = (v: ViewRect) => {
    g.clear();
    if (opts.evening) {
      const mid = v.y + v.h * 0.55;
      g.fillGradientStyle(C.eveTop, C.eveTop, C.eveMid, C.eveMid, 1);
      g.fillRect(v.x - 4, v.y - 4, v.w + 8, mid - v.y + 4);
      g.fillGradientStyle(C.eveMid, C.eveMid, C.eveBottom, C.eveBottom, 1);
      g.fillRect(v.x - 4, mid, v.w + 8, v.y + v.h - mid + 4);
      // Солнце садится за холмы, холмы — тёмные силуэты.
      const by = v.y + v.h;
      g.fillStyle(0xffd27a, 0.18);
      g.fillCircle(v.x + v.w * 0.7, by - v.h * 0.2, v.w * 0.28);
      g.fillStyle(0xffe2a0, 0.35);
      g.fillCircle(v.x + v.w * 0.7, by - v.h * 0.2, v.w * 0.12);
      g.fillStyle(0x3c2f52, 1);
      g.fillEllipse(v.x + v.w * 0.2, by - v.h * 0.06, v.w * 1.1, v.h * 0.26);
      g.fillStyle(0x2a2440, 1);
      g.fillEllipse(v.x + v.w * 0.85, by - v.h * 0.02, v.w * 1.2, v.h * 0.22);
    } else {
      g.fillGradientStyle(C.bgTop, C.bgTop, C.bgBottom, C.bgBottom, 1);
      g.fillRect(v.x - 4, v.y - 4, v.w + 8, v.h + 8);
    }
    vignette?.setPosition(v.x + v.w / 2, v.y + v.h / 2).setDisplaySize(v.w, v.h);
  };
  const view = keepFitted(scene, paint);
  paint(view);
  // Звёзды и светлячки — с запасом за краями раскладки, чтобы покрывать высокие и широкие экраны.
  const X0 = -700;
  const X1 = W + 700;
  const Y0 = -1000;
  const Y1 = H + 1000;
  const rnd = new Phaser.Math.RandomDataGenerator(['glowtrail']);
  // Вечером звёзд меньше и только наверху неба.
  for (let i = 0; i < (opts.evening ? 30 : 90); i++) {
    const st = scene.add
      .image(rnd.between(X0, X1), opts.evening ? rnd.between(Y0, H * 0.35) : rnd.between(Y0, Y1), 'dot')
      .setScale(rnd.realInRange(0.15, 0.35))
      .setAlpha(rnd.realInRange(0.15, 0.5))
      .setDepth(-9);
    scene.tweens.add({
      targets: st,
      alpha: 0.05,
      duration: rnd.between(1200, 3000),
      yoyo: true,
      repeat: -1,
      delay: rnd.between(0, 2000),
    });
  }
  for (let i = 0; i < 9; i++) {
    const f = scene.add
      .image(rnd.between(view.x, view.x + view.w), rnd.between(view.y, view.y + view.h), 'glow')
      .setTint(0xd8ff8a)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setScale(0.22)
      .setAlpha(0)
      .setDepth(-8);
    const wander = () => {
      scene.tweens.add({
        targets: f,
        x: Phaser.Math.Clamp(f.x + Phaser.Math.Between(-220, 220), view.x, view.x + view.w),
        y: Phaser.Math.Clamp(f.y + Phaser.Math.Between(-220, 220), view.y, view.y + view.h),
        alpha: { from: 0, to: 0.55 },
        duration: Phaser.Math.Between(2500, 4500),
        yoyo: true,
        ease: 'Sine.inOut',
        onComplete: wander,
      });
    };
    scene.time.delayedCall(i * 500, wander);
  }
  // Атмосфера: туман, пылинки и тёмные края.
  addFog(scene, view);
  if (opts.dust !== false) addDust(scene, view);
  vignette = addVignette(scene, view);
}

export function text(scene: Phaser.Scene, x: number, y: number, str: string, size: number, color: string = C.text, bold = true) {
  return scene.add
    .text(x, y, str, { fontFamily: FONT, fontSize: `${size}px`, color, fontStyle: bold ? 'bold' : 'normal', align: 'center' })
    .setOrigin(0.5);
}
