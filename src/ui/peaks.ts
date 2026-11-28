// Отрисовка механик «Ледяных вершин» на поле: лёд с бликом, снег на клетках, сугробы (тают у зажжённого
// фонаря), ветер со стрелкой и снежинками, сигнальные огни с номерами. Логики здесь нет — всё берётся
// из состояния партии (core/game, core/tiles).

import Phaser from 'phaser';
import { DX, DY, type Dir } from '../core/types';
import { reducedMotion } from './fx';
import { FONT } from './theme';

/** Цвета льда и костров. */
export const ICE = { base: 0x9fd8f2, deep: 0x5aa6d6, edge: 0xdaf4ff, crack: 0x6fb4dc };
export const FIRE = { flame: 0xff8a2a, core: 0xffe08a, glow: 0xffa04a, ember: 0x5a3020, log: 0x6e4a2e, logDark: 0x45301e, stone: 0x8a94a8 };
/** Цвет луча, показывающего, где закончится скольжение. */
export const SLIDE_BEAM = 0x9be8ff;

/** Ледяная клетка (запекается в текстуру поля): гладкая голубая плита, трещинки и диагональный блик. */
export function drawIceBase(g: Phaser.GameObjects.Graphics, x: number, y: number, cell: number, pad: number, r: number, seed: number) {
  const w = cell - pad * 2;
  g.fillStyle(ICE.deep, 1);
  g.fillRoundedRect(x + pad, y + pad, w, w, r);
  g.fillStyle(ICE.base, 0.92);
  g.fillRoundedRect(x + pad + cell * 0.02, y + pad + cell * 0.02, w - cell * 0.04, w - cell * 0.07, r * 0.9);
  // Трещинки — тонкие ломаные, у каждой клетки свои.
  g.lineStyle(cell * 0.012, ICE.crack, 0.75);
  const sx = x + cell * (0.25 + (seed % 5) * 0.08);
  const sy = y + cell * (0.62 + (seed % 3) * 0.06);
  g.beginPath();
  g.moveTo(sx, sy);
  g.lineTo(sx + cell * 0.12, sy - cell * 0.06);
  g.lineTo(sx + cell * 0.2, sy + cell * 0.03);
  g.lineTo(sx + cell * 0.32, sy - cell * 0.02);
  g.strokePath();
  // Диагональный блик — сразу видно, что скользко.
  g.fillStyle(0xffffff, 0.55);
  g.fillPoints(
    [
      [0.2, 0.42],
      [0.42, 0.18],
      [0.52, 0.18],
      [0.3, 0.42],
    ].map(([px, py]) => new Phaser.Math.Vector2(x + px * cell, y + py * cell)),
    true,
  );
  g.fillStyle(0xffffff, 0.35);
  g.fillPoints(
    [
      [0.36, 0.44],
      [0.58, 0.2],
      [0.62, 0.2],
      [0.4, 0.44],
    ].map(([px, py]) => new Phaser.Math.Vector2(x + px * cell, y + py * cell)),
    true,
  );
  g.lineStyle(cell * 0.018, ICE.edge, 0.8);
  g.strokeRoundedRect(x + pad + cell * 0.02, y + pad + cell * 0.02, w - cell * 0.04, w - cell * 0.07, r * 0.9);
}

/** Снег на обычной клетке (запекается): белый пушистый край сверху и пара сугробиков. */
export function drawSnowCap(g: Phaser.GameObjects.Graphics, x: number, y: number, cell: number, pad: number, seed: number) {
  g.fillStyle(0xeaf4ff, 0.18);
  for (let k = 0; k < 4; k++) g.fillCircle(x + pad + cell * (0.12 + k * 0.25), y + pad + cell * 0.05, cell * (0.08 + ((seed + k) % 3) * 0.015));
  g.fillStyle(0xffffff, 0.12);
  g.fillEllipse(x + cell * (0.3 + (seed % 4) * 0.1), y + cell * 0.78, cell * 0.3, cell * 0.08);
}

/** Украшения снежной клетки: искорки снега мерцают, иногда маленькая ёлочка в снегу. */
export function peaksCellDecor(scene: Phaser.Scene, rnd: Phaser.Math.RandomDataGenerator, x0: number, y0: number, cell: number): Phaser.GameObjects.GameObject[] {
  const out: Phaser.GameObjects.GameObject[] = [];
  const calm = reducedMotion();
  const n = rnd.weightedPick([0, 1, 1, 2]);
  for (let k = 0; k < n; k++) {
    const img = scene.add
      .image(x0 + cell * rnd.realInRange(0.2, 0.8), y0 + cell * rnd.realInRange(0.25, 0.85), 'glow')
      .setTint(0xdff4ff)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setScale((cell * 0.09) / 128)
      .setAlpha(0.2)
      .setDepth(1.1);
    if (!calm) scene.tweens.add({ targets: img, alpha: 0.85, duration: rnd.between(500, 900), yoyo: true, repeat: -1, delay: rnd.between(0, 3000), repeatDelay: rnd.between(1500, 4000), ease: 'Sine.inOut' });
    out.push(img);
  }
  if (rnd.frac() < 0.22) {
    // Ёлочка в снегу: три яруса и белые шапки.
    const g = scene.add.graphics().setDepth(1.2 + (y0 + cell) / 100000);
    const cx = x0 + cell * rnd.realInRange(0.25, 0.75);
    const by = y0 + cell * rnd.realInRange(0.62, 0.85);
    const s = cell * rnd.realInRange(0.1, 0.14);
    g.fillStyle(0x000000, 0.2);
    g.fillEllipse(cx, by + s * 0.1, s * 1.8, s * 0.4);
    for (let t = 0; t < 3; t++) {
      const yy = by - t * s * 0.7;
      const ww = s * (1 - t * 0.25);
      g.fillStyle(0x1f4a52, 1);
      g.fillTriangle(cx - ww, yy, cx + ww, yy, cx, yy - s * 1.05);
      g.fillStyle(0xffffff, 0.85);
      g.fillTriangle(cx - ww * 0.45, yy - s * 0.55, cx + ww * 0.45, yy - s * 0.55, cx, yy - s * 1.05);
    }
    out.push(g);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Сугроб

/** Сугроб: пушистая снежная горка; тает с паром и каплями, когда загорается соседний фонарь. */
export class DriftView {
  private c: Phaser.GameObjects.Container;
  private mound: Phaser.GameObjects.Graphics;
  private puddle: Phaser.GameObjects.Graphics;
  private melted = false;

  constructor(
    private scene: Phaser.Scene,
    readonly idx: number,
    x: number,
    y: number,
    private cell: number,
  ) {
    this.puddle = scene.add.graphics().setDepth(1.05).setPosition(x, y).setAlpha(0);
    this.puddle.fillStyle(0x6fb4dc, 0.45);
    this.puddle.fillEllipse(0, cell * 0.12, cell * 0.62, cell * 0.24);
    this.puddle.fillStyle(0xffffff, 0.35);
    this.puddle.fillEllipse(-cell * 0.1, cell * 0.08, cell * 0.18, cell * 0.05);
    this.mound = scene.add.graphics();
    this.c = scene.add.container(x, y + cell * 0.22, [this.mound]).setDepth(2.5 + y / 100000);
    const g = this.mound;
    const s = cell;
    g.fillStyle(0x000000, 0.25);
    g.fillEllipse(0, s * 0.02, s * 0.84, s * 0.2);
    // Горка из нескольких «подушек» снега, снизу голубая тень.
    g.fillStyle(0xb8d4ec, 1);
    g.fillEllipse(0, -s * 0.06, s * 0.82, s * 0.32);
    g.fillStyle(0xe6f2ff, 1);
    g.fillEllipse(-s * 0.16, -s * 0.18, s * 0.42, s * 0.34);
    g.fillEllipse(s * 0.16, -s * 0.16, s * 0.44, s * 0.3);
    g.fillEllipse(0, -s * 0.3, s * 0.4, s * 0.32);
    g.fillStyle(0xffffff, 1);
    g.fillEllipse(-s * 0.06, -s * 0.38, s * 0.22, s * 0.1);
    g.fillEllipse(s * 0.2, -s * 0.24, s * 0.12, s * 0.06);
    // Голубые искорки.
    g.fillStyle(0x9be8ff, 0.9);
    for (const [px, py] of [
      [-0.22, -0.2],
      [0.1, -0.33],
      [0.26, -0.12],
    ])
      g.fillCircle(px * s, py * s, s * 0.014);
  }

  /** Сугроб растаял (рядом горит фонарь) или снова стоит (отменили ход). */
  set(melted: boolean, animate: boolean) {
    if (melted === this.melted) return;
    this.melted = melted;
    this.scene.tweens.killTweensOf([this.c, this.puddle]);
    if (!melted) {
      this.c.setScale(1).setAlpha(1).setVisible(true);
      this.puddle.setAlpha(0);
      return;
    }
    if (!animate || reducedMotion()) {
      this.c.setVisible(false);
      this.puddle.setAlpha(1);
      return;
    }
    // Тает: оседает и бледнеет, поднимается пар, остаётся лужица.
    this.scene.tweens.add({ targets: this.c, scaleY: 0.15, scaleX: 1.15, alpha: 0, duration: 900, ease: 'Sine.in', onComplete: () => this.c.setVisible(false) });
    this.scene.tweens.add({ targets: this.puddle, alpha: 1, duration: 700, delay: 500 });
    for (let k = 0; k < 6; k++) {
      const steam = this.scene.add
        .image(this.c.x + (k - 2.5) * this.cell * 0.1, this.c.y - this.cell * 0.15, 'glow')
        .setTint(0xffffff)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setScale((this.cell * 0.22) / 128)
        .setAlpha(0)
        .setDepth(6.85);
      this.scene.tweens.add({
        targets: steam,
        y: steam.y - this.cell * Phaser.Math.FloatBetween(0.4, 0.7),
        alpha: { from: 0.55, to: 0 },
        scale: steam.scale * 1.8,
        duration: 1000,
        delay: k * 90,
        ease: 'Sine.out',
        onComplete: () => steam.destroy(),
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Ветер

/** Клетка ветра: стрелка-порыв и снежинки, летящие по стрелке. */
export class WindView {
  constructor(scene: Phaser.Scene, readonly idx: number, readonly dir: Dir, x: number, y: number, cell: number) {
    // Над ночным затемнением поля (6.5), но под туманом (6.55): стрелку видно, скрытый туманом ветер — нет.
    const g = scene.add.graphics().setPosition(x, y).setDepth(6.52);
    const fx = DX[dir];
    const fy = DY[dir];
    const px = -fy;
    const py = fx;
    // Холодная голубая подложка — клетку ветра видно издалека.
    g.fillStyle(0x7fd0f0, 0.2);
    g.fillRoundedRect(-cell * 0.43, -cell * 0.43, cell * 0.86, cell * 0.86, cell * 0.14);
    g.lineStyle(cell * 0.025, 0xbfefff, 0.55);
    g.strokeRoundedRect(-cell * 0.43, -cell * 0.43, cell * 0.86, cell * 0.86, cell * 0.14);
    // Завитки ветра поперёк клетки и две стрелки-галочки по направлению.
    g.lineStyle(cell * 0.03, 0xdff4ff, 0.5);
    for (const off of [-0.22, 0.22]) {
      g.beginPath();
      const ax = px * off * cell;
      const ay = py * off * cell;
      for (let k = 0; k <= 8; k++) {
        const t = -0.38 + (k / 8) * 0.76;
        const wob = Math.sin(t * 9 + off * 10) * cell * 0.035;
        const xx = ax + fx * t * cell + px * wob;
        const yy = ay + fy * t * cell + py * wob;
        if (k === 0) g.moveTo(xx, yy);
        else g.lineTo(xx, yy);
      }
      g.strokePath();
    }
    g.lineStyle(cell * 0.07, 0xe6faff, 1);
    for (const back of [0.02, 0.24]) {
      const tx = fx * (0.3 - back) * cell;
      const ty = fy * (0.3 - back) * cell;
      g.beginPath();
      g.moveTo(tx - fx * cell * 0.14 + px * cell * 0.14, ty - fy * cell * 0.14 + py * cell * 0.14);
      g.lineTo(tx, ty);
      g.lineTo(tx - fx * cell * 0.14 - px * cell * 0.14, ty - fy * cell * 0.14 - py * cell * 0.14);
      g.strokePath();
    }
    if (reducedMotion()) return;
    scene.tweens.add({ targets: g, alpha: 0.7, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    // Снежинки: летят по стрелке через клетку и исчезают у края.
    for (let k = 0; k < 4; k++) {
      const flake = scene.add.image(x, y, 'glow').setTint(0xffffff).setBlendMode(Phaser.BlendModes.ADD).setScale((cell * 0.07) / 128).setAlpha(0).setDepth(6.52); // под туманом: не выдаёт скрытый ветер
      const fly = () => {
        const side = Phaser.Math.FloatBetween(-0.35, 0.35);
        flake.setPosition(x - fx * cell * 0.45 + px * side * cell, y - fy * cell * 0.45 + py * side * cell);
        scene.tweens.add({
          targets: flake,
          x: x + fx * cell * 0.5 + px * (side + 0.08) * cell,
          y: y + fy * cell * 0.5 + py * (side + 0.08) * cell,
          alpha: { from: 0.95, to: 0 },
          duration: Phaser.Math.Between(700, 1000),
          delay: Phaser.Math.Between(0, 900),
          ease: 'Sine.in',
          onComplete: fly,
        });
      };
      fly();
    }
  }
}

// ---------------------------------------------------------------------------
// Сигнальные огни

/** Костёр с номером: не зажжён — кострище с табличкой; зажжён — пламя и тёплый свет. Не по порядку — мигает номером. */
export class FireView {
  private base: Phaser.GameObjects.Graphics;
  private flame: Phaser.GameObjects.Graphics;
  private glow: Phaser.GameObjects.Image;
  private badge: Phaser.GameObjects.Container;
  private badgeG: Phaser.GameObjects.Graphics;
  private label: Phaser.GameObjects.Text;
  private lit = false;
  private next = false;

  constructor(
    private scene: Phaser.Scene,
    readonly idx: number,
    readonly num: number,
    private x: number,
    private y: number,
    private cell: number,
  ) {
    const s = cell;
    this.base = scene.add.graphics().setPosition(x, y).setDepth(2.2);
    const g = this.base;
    // Кольцо камней и сложенные шалашом поленья.
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      g.fillStyle(FIRE.stone, 1);
      g.fillEllipse(Math.cos(a) * s * 0.27, s * 0.14 + Math.sin(a) * s * 0.11, s * 0.12, s * 0.08);
    }
    g.fillStyle(FIRE.ember, 1);
    g.fillEllipse(0, s * 0.14, s * 0.4, s * 0.15);
    g.lineStyle(s * 0.06, FIRE.logDark, 1);
    g.lineBetween(-s * 0.18, s * 0.2, s * 0.06, -s * 0.12);
    g.lineBetween(s * 0.18, s * 0.2, -s * 0.06, -s * 0.12);
    g.lineStyle(s * 0.045, FIRE.log, 1);
    g.lineBetween(-s * 0.16, s * 0.18, s * 0.05, -s * 0.1);
    g.lineBetween(s * 0.16, s * 0.18, -s * 0.05, -s * 0.1);
    this.glow = scene.add.image(x, y, 'glow').setTint(FIRE.glow).setBlendMode(Phaser.BlendModes.ADD).setScale((s * 1.7) / 128).setAlpha(0.12).setDepth(6.8);
    this.flame = scene.add.graphics().setPosition(x, y + s * 0.08).setDepth(2.3).setVisible(false);
    this.drawFlame();
    // Табличка с номером — над костром, видна и в темноте.
    this.badgeG = scene.add.graphics();
    this.label = scene.add.text(0, 0, String(num), { fontFamily: FONT, fontSize: `${Math.round(s * 0.2)}px`, fontStyle: 'bold', color: '#fff6e0' }).setOrigin(0.5);
    this.badge = scene.add.container(x + s * 0.27, y - s * 0.27, [this.badgeG, this.label]).setDepth(6.9);
    this.drawBadge();
  }

  private drawFlame() {
    const g = this.flame;
    const s = this.cell;
    g.clear();
    g.fillStyle(FIRE.flame, 0.95);
    g.fillTriangle(-s * 0.15, 0, s * 0.15, 0, 0, -s * 0.42);
    g.fillTriangle(-s * 0.2, 0, -s * 0.02, 0, -s * 0.12, -s * 0.26);
    g.fillTriangle(s * 0.02, 0, s * 0.2, 0, s * 0.12, -s * 0.28);
    g.fillStyle(FIRE.core, 1);
    g.fillTriangle(-s * 0.08, 0, s * 0.08, 0, 0, -s * 0.24);
  }

  private drawBadge() {
    const g = this.badgeG;
    const r = this.cell * 0.15;
    g.clear();
    g.fillStyle(0x000000, 0.35);
    g.fillCircle(0, r * 0.15, r);
    g.fillStyle(this.lit ? 0xff8a2a : this.next ? 0x3a4a78 : 0x2a3150, 1);
    g.fillCircle(0, 0, r);
    g.lineStyle(this.cell * 0.022, this.lit ? 0xffe08a : this.next ? 0x9be8ff : 0x6d7aa8, 1);
    g.strokeCircle(0, 0, r);
  }

  /** Этот костёр — следующий по порядку (табличка светится голубым). */
  setNext(next: boolean) {
    if (next === this.next) return;
    this.next = next;
    this.drawBadge();
    this.scene.tweens.killTweensOf(this.badge);
    this.badge.setScale(1);
    if (next && !reducedMotion()) this.scene.tweens.add({ targets: this.badge, scale: 1.15, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
  }

  setLit(lit: boolean, animate: boolean) {
    if (lit === this.lit) return;
    this.lit = lit;
    if (lit) this.next = false;
    this.drawBadge();
    this.scene.tweens.killTweensOf([this.flame, this.glow]);
    this.flame.setVisible(lit).setScale(1);
    if (!lit) {
      this.glow.setAlpha(0.12).setScale((this.cell * 1.7) / 128);
      return;
    }
    this.glow.setAlpha(0.9);
    if (animate) this.scene.tweens.add({ targets: this.flame, scale: { from: 0.2, to: 1 }, duration: 380, ease: 'Back.out' });
    if (!reducedMotion()) {
      this.scene.tweens.add({ targets: this.flame, scaleY: 1.12, scaleX: 0.92, duration: 260, yoyo: true, repeat: -1, ease: 'Sine.inOut', delay: animate ? 400 : 0 });
      this.scene.tweens.add({ targets: this.glow, alpha: 0.6, duration: 600, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    }
  }

  /** Не по порядку: табличка вежливо мигает номером (это не проигрыш). */
  blink() {
    this.scene.tweens.killTweensOf(this.badge);
    this.badge.setScale(1);
    this.scene.tweens.add({ targets: this.badge, scale: 1.45, duration: 160, yoyo: true, repeat: 2, ease: 'Sine.inOut', onComplete: () => this.setNextAgain() });
    this.scene.tweens.add({ targets: this.label, alpha: 0.25, duration: 160, yoyo: true, repeat: 2 });
  }

  private setNextAgain() {
    const n = this.next;
    this.next = !n;
    this.setNext(n);
  }

  get center() {
    return { x: this.x, y: this.y };
  }
}
