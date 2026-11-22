// Карточка плитки в лотке (или в слоте «отложить»).

import Phaser from 'phaser';
import type { Dir, TileKind } from '../core/types';
import { drawTileIcon } from './draw';
import { C } from './theme';

import { CARD } from './layout';

export { CARD };

export class TileCard extends Phaser.GameObjects.Container {
  kind: TileKind | null = null;
  enabled = false;
  readonly homeX: number;
  readonly homeY: number;
  private bg: Phaser.GameObjects.Graphics;
  private iconWrap: Phaser.GameObjects.Container;
  private icon: Phaser.GameObjects.Graphics;
  /** Тёплое свечение рамки: доступная плитка «дышит». */
  private shine: Phaser.GameObjects.Graphics;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    readonly slot: number | 'stash',
  ) {
    super(scene, x, y);
    this.homeX = x;
    this.homeY = y;
    this.bg = scene.add.graphics();
    this.icon = scene.add.graphics();
    this.iconWrap = scene.add.container(0, 0, [this.icon]);
    this.shine = scene.add.graphics();
    this.shine.lineStyle(7, C.lanternOn, 1);
    this.shine.strokeRoundedRect(-CARD / 2, -CARD / 2, CARD, CARD, CARD * 0.2);
    this.shine.setAlpha(0).setBlendMode(Phaser.BlendModes.ADD);
    this.add([this.bg, this.shine, this.iconWrap]);
    this.setSize(CARD, CARD);
    if (slot !== 'stash') {
      scene.tweens.add({
        targets: this.shine,
        alpha: { from: 0, to: 0.45 },
        duration: 900,
        yoyo: true,
        repeat: -1,
        repeatDelay: 2600,
        delay: 400 + (typeof slot === 'number' ? slot : 0) * 300,
        ease: 'Sine.inOut',
      });
    }
    this.setInteractive({ useHandCursor: true });
    this.setDepth(10);
    scene.add.existing(this);
    this.draw();
  }

  /** Обновляет плитку. dir — текущее направление дороги: иконка поворачивается по нему. */
  setTile(kind: TileKind | null, enabled: boolean, dir: Dir, animate = true) {
    const changed = kind !== this.kind || enabled !== this.enabled;
    this.kind = kind;
    this.enabled = enabled;
    if (changed) this.draw();
    const target = (dir * Math.PI) / 2;
    let delta = Phaser.Math.Angle.Wrap(target - this.iconWrap.rotation);
    if (Math.abs(delta) < 0.001) return;
    if (!animate) {
      this.iconWrap.rotation = target;
      return;
    }
    this.scene.tweens.killTweensOf(this.iconWrap);
    this.scene.tweens.add({
      targets: this.iconWrap,
      rotation: this.iconWrap.rotation + delta,
      duration: 260,
      ease: 'Back.out',
    });
  }

  private draw() {
    const g = this.bg;
    const s = CARD;
    const r = s * 0.2;
    g.clear();
    this.icon.clear();
    this.shine.setVisible(this.enabled && this.kind !== null);
    if (!this.kind) {
      if (this.slot === 'stash') this.drawEmptyStash();
      return;
    }
    g.fillStyle(0x000000, 0.3);
    g.fillRoundedRect(-s / 2, -s / 2 + 10, s, s, r);
    g.fillStyle(this.enabled ? C.card : C.cardDisabled, 1);
    g.fillRoundedRect(-s / 2, -s / 2, s, s, r);
    g.lineStyle(5, this.enabled ? C.cardEdge : 0x2a3160, 1);
    g.strokeRoundedRect(-s / 2, -s / 2, s, s, r);
    if (this.enabled) {
      g.fillStyle(0xffffff, 0.07);
      g.fillRoundedRect(-s / 2 + 10, -s / 2 + 8, s - 20, s * 0.35, r * 0.7);
    }
    drawTileIcon(this.icon, this.kind, s * 0.8, this.enabled ? C.icon : C.iconDisabled);
  }

  private drawEmptyStash() {
    const g = this.bg;
    const s = CARD * 0.92;
    g.lineStyle(5, C.cardEdge, 0.7);
    // Пунктирная рамка
    const seg = 22;
    const half = s / 2;
    for (let t = -half + 18; t < half - 18; t += seg * 1.7) {
      const e = Math.min(t + seg, half - 18);
      g.lineBetween(t, -half, e, -half);
      g.lineBetween(t, half, e, half);
      g.lineBetween(-half, t, -half, e);
      g.lineBetween(half, t, half, e);
    }
    // Уголки
    g.beginPath();
    g.arc(-half + 18, -half + 18, 18, Math.PI, Math.PI * 1.5);
    g.strokePath();
    g.beginPath();
    g.arc(half - 18, -half + 18, 18, Math.PI * 1.5, Math.PI * 2);
    g.strokePath();
    g.beginPath();
    g.arc(half - 18, half - 18, 18, 0, Math.PI / 2);
    g.strokePath();
    g.beginPath();
    g.arc(-half + 18, half - 18, 18, Math.PI / 2, Math.PI);
    g.strokePath();
    // Значок «положить сюда»: стрелка вниз в коробку
    g.lineStyle(9, C.cardEdge, 0.9);
    g.lineBetween(0, -s * 0.26, 0, s * 0.02);
    g.fillStyle(C.cardEdge, 0.9);
    g.fillTriangle(-s * 0.13, -s * 0.02, s * 0.13, -s * 0.02, 0, s * 0.13);
    g.beginPath();
    g.moveTo(-s * 0.24, s * 0.06);
    g.lineTo(-s * 0.24, s * 0.24);
    g.lineTo(s * 0.24, s * 0.24);
    g.lineTo(s * 0.24, s * 0.06);
    g.strokePath();
  }

  isInside(x: number, y: number, slack = 0) {
    return Math.abs(x - this.homeX) <= CARD / 2 + slack && Math.abs(y - this.homeY) <= CARD / 2 + slack;
  }
}

/** Маленькая полупрозрачная карточка превью колоды: следующая плитка, взять её нельзя. */
export class MiniCard extends Phaser.GameObjects.Container {
  private bg: Phaser.GameObjects.Graphics;
  private icon: Phaser.GameObjects.Graphics;
  private iconWrap: Phaser.GameObjects.Container;
  private kind: TileKind | null = null;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    private size: number,
  ) {
    super(scene, x, y);
    this.bg = scene.add.graphics();
    this.icon = scene.add.graphics();
    this.iconWrap = scene.add.container(0, 0, [this.icon]);
    this.add([this.bg, this.iconWrap]);
    this.setAlpha(0.55).setDepth(8);
    scene.add.existing(this);
  }

  setTile(kind: TileKind | null, dir: Dir, animate = true) {
    if (kind !== this.kind) {
      this.kind = kind;
      const s = this.size;
      this.bg.clear();
      this.icon.clear();
      if (kind) {
        this.bg.fillStyle(C.cardDisabled, 1);
        this.bg.fillRoundedRect(-s / 2, -s / 2, s, s, s * 0.22);
        this.bg.lineStyle(3, C.cardEdge, 0.8);
        this.bg.strokeRoundedRect(-s / 2, -s / 2, s, s, s * 0.22);
        drawTileIcon(this.icon, kind, s * 0.78, C.icon);
      }
    }
    const target = (dir * Math.PI) / 2;
    const delta = Phaser.Math.Angle.Wrap(target - this.iconWrap.rotation);
    if (Math.abs(delta) < 0.001) return;
    this.scene.tweens.killTweensOf(this.iconWrap);
    if (!animate) this.iconWrap.rotation = target;
    else this.scene.tweens.add({ targets: this.iconWrap, rotation: this.iconWrap.rotation + delta, duration: 260, ease: 'Back.out' });
  }
}
