// Отрисовка поля: клетки, дорога, призрак плитки, фонари, выход и фонарщик.
// Логики здесь нет — вид только показывает состояние из core/game.

import Phaser from 'phaser';
import type { GameState, Placement } from '../core/game';
import { DX, DY, type Dir, type Level } from '../core/types';
import { C } from './theme';
import { createLumo, drawPadlock } from './draw';
import { headSide, lanternsLeft, portalSides } from '../core/portal';
import { FONT } from './theme';
import { raysBurst } from './fx';

/** Оранжевая рамка и свечение горящего фонаря — отдельный цвет от жёлтой дороги. */
const LAMP_FRAME = 0xff8a2a;
const LAMP_GLOW = 0xffa04a;

interface LanternView {
  idx: number;
  glow: Phaser.GameObjects.Image;
  lamp: Phaser.GameObjects.Graphics;
  state: 'off' | 'road' | 'lit';
}

export class BoardView {
  readonly cell: number;
  readonly ox: number;
  readonly oy: number;
  private roadG: Phaser.GameObjects.Graphics;
  private ghostG: Phaser.GameObjects.Graphics;
  private headG: Phaser.GameObjects.Graphics;
  private hintG: Phaser.GameObjects.Graphics;
  private lanterns: LanternView[] = [];
  private exitGlow!: Phaser.GameObjects.Image;
  private exitOpen = false;
  // Арка-портал: кольцо, вращающийся свет внутри, 4 огонька-входа и замок с числом фонарей
  private portalRing!: Phaser.GameObjects.Graphics;
  private portalSwirl!: Phaser.GameObjects.Graphics;
  private portalOrbs: { dir: Dir; open: boolean; glow: Phaser.GameObjects.Image; dot: Phaser.GameObjects.Graphics }[] = [];
  private lock!: Phaser.GameObjects.Container;
  private lockG!: Phaser.GameObjects.Graphics;
  private lockText!: Phaser.GameObjects.Text;
  private litSide: Dir | null = null;
  // Конус света фонаря на конце дороги и зона, куда можно бросить плитку
  private cone!: Phaser.GameObjects.Image;
  private coneErase!: Phaser.GameObjects.Image;
  private dropG!: Phaser.GameObjects.Graphics;
  readonly lumo: Phaser.GameObjects.Container;
  private burst: Phaser.GameObjects.Particles.ParticleEmitter;
  private roadAnim?: Phaser.Tweens.Tween;
  // Темнота над полем и источники света
  private dark!: Phaser.GameObjects.RenderTexture;
  private darkShape!: Phaser.GameObjects.Graphics;
  private lightImg!: Phaser.GameObjects.Image;
  private darkX = 0;
  private darkY = 0;
  private roadLights: { x: number; y: number }[] = [];
  private flashes: { x: number; y: number; t0: number; dur: number; d: number }[] = [];
  private won = false;

  constructor(
    private scene: Phaser.Scene,
    private level: Level,
    area: { x: number; y: number; w: number; h: number },
    opts: { avatar?: number; dark?: boolean; maxCell?: number } = {},
  ) {
    this.cell = Math.floor(Math.min(area.w / level.width, area.h / level.height, opts.maxCell ?? 200));
    this.ox = area.x + (area.w - this.cell * level.width) / 2;
    this.oy = area.y + (area.h - this.cell * level.height) / 2;

    this.drawCells();
    this.roadG = scene.add.graphics().setDepth(2);
    // Предпросмотр и стрелка — поверх темноты, чтобы всегда было видно, куда ляжет плитка.
    // Над аркой и замком (6.72–6.9): крестик «дверь заперта» должен быть виден поверх неё.
    this.hintG = scene.add.graphics().setDepth(6.95);
    this.ghostG = scene.add.graphics().setDepth(6.96);
    this.headG = scene.add.graphics().setDepth(6.7);
    this.dropG = scene.add.graphics().setDepth(6.65);
    scene.tweens.add({ targets: this.dropG, alpha: 0.45, duration: 420, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    // Конус света: тёплый луч фонаря Lumo в сторону, куда идёт дорога.
    this.cone = scene.add.image(0, 0, 'cone').setOrigin(0, 0.5).setTint(C.lanternOn).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.28).setDepth(6.62);
    this.cone.setScale((this.cell * 1.9) / 256);
    this.coneErase = scene.make.image({ x: 0, y: 0, key: 'cone' }, false).setOrigin(0, 0.5);
    scene.tweens.add({ targets: this.headG, alpha: 0.35, duration: 650, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    this.drawLanternsAndExit();

    const start = this.center(level.start.y * level.width + level.start.x);
    this.lumo = createLumo(scene, this.cell * 0.9, opts.avatar ?? 0).setPosition(start.x, start.y - this.cell * 0.05).setDepth(7);

    this.burst = scene.add
      .particles(0, 0, 'glow', {
        speed: { min: 80, max: 260 },
        scale: { start: 0.35, end: 0 },
        alpha: { start: 0.9, end: 0 },
        lifespan: 700,
        blendMode: Phaser.BlendModes.ADD,
        tint: C.lanternOn,
        emitting: false,
      })
      .setDepth(8);
    if (opts.dark !== false) this.initDarkness();
  }

  // -------------------------------------------------------------------------
  // Темнота и свет: поле в полумраке, светятся Lumo, дорога, зажжённые фонари и открытый выход.

  private initDarkness() {
    const { cell, level } = this;
    const pad = cell * 0.12;
    const w = Math.ceil(cell * (level.width + 0.24));
    const h = Math.ceil(cell * (level.height + 0.24));
    this.darkX = this.ox - pad;
    this.darkY = this.oy - pad;
    this.dark = this.scene.add
      .renderTexture(this.darkX, this.darkY, w, h)
      .setOrigin(0)
      .setDepth(6.5)
      .setAlpha(level.night ? 0.72 : 0.48);
    this.darkShape = this.scene.make.graphics({}, false);
    this.darkShape.fillStyle(0x03040f, 1);
    this.darkShape.fillRoundedRect(0, 0, w, h, cell * 0.25);
    this.lightImg = this.scene.make.image({ x: 0, y: 0, key: 'glow' }, false);
    this.update(0);
  }

  private light(x: number, y: number, diameter: number, alpha: number) {
    this.lightImg.setScale(diameter / 128).setAlpha(Math.min(1, alpha));
    this.dark.erase(this.lightImg, x - this.darkX, y - this.darkY);
  }

  /** Каждый кадр: перерисовать темноту и «вырезать» в ней свет (с лёгким мерцанием пламени). */
  update(time: number) {
    if (!this.dark) return;
    const { cell } = this;
    const flicker = 1 + Math.sin(time * 0.006) * 0.03 + Math.sin(time * 0.0173) * 0.02;
    this.dark.clear();
    this.dark.draw(this.darkShape, 0, 0);
    for (const p of this.roadLights) this.light(p.x, p.y, cell * 2.1, 0.85);
    for (const l of this.lanterns) {
      if (l.state === 'off') continue;
      const c = this.center(l.idx);
      this.light(c.x, c.y - cell * 0.2, cell * (l.state === 'lit' ? 4.6 : 4) * flicker, 0.95);
    }
    if (this.exitOpen) {
      const e = this.center(this.level.exit.y * this.level.width + this.level.exit.x);
      this.light(e.x, e.y, cell * (this.won ? 4 : 2.8) * flicker, 0.8);
    }
    if (this.lumo.alpha > 0.05) this.light(this.lumo.x + cell * 0.2, this.lumo.y - cell * 0.1, cell * 3 * flicker, 1);
    // Конус света на конце дороги тоже разгоняет темноту.
    if (this.cone.visible && this.cone.alpha > 0.02) {
      this.coneErase.setRotation(this.cone.rotation).setScale(this.cone.scaleX * flicker, this.cone.scaleY).setAlpha(0.85);
      this.dark.erase(this.coneErase, this.cone.x - this.darkX, this.cone.y - this.darkY);
    }
    this.flashes = this.flashes.filter((f) => time - f.t0 < f.dur);
    for (const f of this.flashes) {
      const k = 1 - (time - f.t0) / f.dur;
      this.light(f.x, f.y, f.d * (1.4 - k * 0.4), k);
    }
  }

  /** Вспышка света в точке (новая плитка, фонарь). */
  private flash(x: number, y: number, d: number, dur = 700) {
    this.flashes.push({ x, y, d, dur, t0: this.scene.time.now });
  }

  center(idx: number): { x: number; y: number } {
    const x = idx % this.level.width;
    const y = Math.floor(idx / this.level.width);
    return { x: this.ox + (x + 0.5) * this.cell, y: this.oy + (y + 0.5) * this.cell };
  }

  private drawCells() {
    const { level, cell } = this;
    const g = this.scene.add.graphics().setDepth(0);
    const pad = cell * 0.05;
    const r = cell * 0.16;
    // Подложка поля
    g.fillStyle(0x000000, 0.25);
    g.fillRoundedRect(this.ox - cell * 0.12, this.oy - cell * 0.12 + 10, cell * (level.width + 0.24), cell * (level.height + 0.24), cell * 0.25);
    g.fillStyle(0x121845, 0.9);
    g.fillRoundedRect(this.ox - cell * 0.12, this.oy - cell * 0.12, cell * (level.width + 0.24), cell * (level.height + 0.24), cell * 0.25);

    level.cells.forEach((type, idx) => {
      const x = this.ox + (idx % level.width) * cell;
      const y = this.oy + Math.floor(idx / level.width) * cell;
      if (type === 'water') {
        g.fillStyle(C.water, 1);
        g.fillRoundedRect(x + pad * 0.3, y + pad, cell - pad * 0.6, cell - pad * 2, r * 0.6);
        this.addWaves(x, y);
        return;
      }
      g.fillStyle(C.cell, 1);
      g.fillRoundedRect(x + pad, y + pad, cell - pad * 2, cell - pad * 2, r);
      g.fillStyle(0xffffff, 0.04);
      g.fillRoundedRect(x + pad, y + pad, cell - pad * 2, (cell - pad * 2) * 0.45, r);
      if (type === 'rock') {
        const cx = x + cell / 2;
        const cy = y + cell / 2;
        const s = cell * 0.36;
        g.fillStyle(0x000000, 0.3);
        g.fillEllipse(cx, cy + s * 0.75, s * 1.9, s * 0.5);
        g.fillStyle(C.rockDark, 1);
        g.fillPoints(
          [
            [-0.9, 0.6],
            [-0.75, -0.3],
            [-0.25, -0.85],
            [0.45, -0.75],
            [0.95, -0.1],
            [0.85, 0.65],
          ].map(([px, py]) => new Phaser.Math.Vector2(cx + px * s, cy + py * s)),
          true,
        );
        g.fillStyle(C.rock, 1);
        g.fillPoints(
          [
            [-0.75, 0.35],
            [-0.6, -0.3],
            [-0.2, -0.7],
            [0.4, -0.6],
            [0.75, -0.1],
            [0.6, 0.35],
          ].map(([px, py]) => new Phaser.Math.Vector2(cx + px * s, cy + py * s)),
          true,
        );
        g.fillStyle(C.rockLight, 1);
        g.fillEllipse(cx - s * 0.2, cy - s * 0.35, s * 0.5, s * 0.22);
      }
    });
  }

  private addWaves(x: number, y: number) {
    const { cell } = this;
    const w = this.scene.add.graphics().setDepth(1);
    w.lineStyle(cell * 0.035, C.waterLight, 0.6);
    for (const yy of [0.38, 0.64]) {
      w.beginPath();
      w.moveTo(x + cell * 0.18, y + cell * yy);
      for (let i = 1; i <= 4; i++) w.lineTo(x + cell * (0.18 + i * 0.16), y + cell * yy + (i % 2 ? -cell * 0.05 : 0));
      w.strokePath();
    }
    this.scene.tweens.add({
      targets: w,
      x: cell * 0.06,
      alpha: 0.5,
      duration: Phaser.Math.Between(1100, 1600),
      yoyo: true,
      repeat: -1,
      ease: 'Sine.inOut',
      delay: Phaser.Math.Between(0, 800),
    });
  }

  private drawLanternsAndExit() {
    const { level, cell, scene } = this;
    for (const idx of level.lanterns) {
      const c = this.center(idx);
      const glow = scene.add
        .image(c.x, c.y - cell * 0.18, 'glow')
        .setTint(C.lanternOn)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setScale((cell * 1.6) / 128)
        .setAlpha(0)
        .setDepth(6.8);
      const lamp = scene.add.graphics().setDepth(6).setPosition(c.x, c.y);
      this.lanterns.push({ idx, glow, lamp, state: 'off' });
      this.drawLamp(lamp, false);
      this.ember(glow);
    }
    const e = this.center(level.exit.y * level.width + level.exit.x);
    this.exitGlow = scene.add
      .image(e.x, e.y, 'glow')
      .setTint(C.exitOpen)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setScale((cell * 1.7) / 128)
      .setAlpha(0)
      .setDepth(6.8);
    this.createPortal(e.x, e.y);
    // Закрытый выход тлеет таинственным фиолетовым — его ещё нужно открыть.
    this.exitGlow.setTint(0x9b7bff);
    this.ember(this.exitGlow, 0.32);
    if (level.lanterns.length === 0) {
      // Фонарей нет — арка открыта с самого начала.
      this.exitOpen = true;
      this.lock.setVisible(false);
      this.drawPortal(true);
      this.exitGlow.setTint(C.exitOpen);
    }
  }

  /** Арка-портал, симметричная со всех сторон: войти можно с любой открытой стороны. */
  private createPortal(x: number, y: number) {
    const { cell, scene, level } = this;
    this.portalRing = scene.add.graphics().setDepth(6.72).setPosition(x, y);
    this.portalSwirl = scene.add.graphics().setDepth(6.74).setPosition(x, y);
    scene.tweens.add({ targets: this.portalSwirl, angle: 360, duration: 9000, repeat: -1 });
    for (const side of portalSides(level)) {
      const ox = x + DX[side.dir] * cell * 0.45;
      const oy = y + DY[side.dir] * cell * 0.45;
      const glow = scene.add
        .image(ox, oy, 'glow')
        .setTint(0xd8ccff)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setScale((cell * 0.5) / 128)
        .setAlpha(side.open ? 0.35 : 0.06)
        .setDepth(6.8);
      const dot = scene.add.graphics().setDepth(6.81).setPosition(ox, oy);
      dot.fillStyle(0xd8ccff, 1);
      dot.fillCircle(0, 0, cell * 0.055);
      dot.setAlpha(side.open ? 0.75 : 0.15);
      if (side.open) {
        scene.tweens.add({ targets: glow, alpha: 0.18, duration: 1300, yoyo: true, repeat: -1, ease: 'Sine.inOut', delay: side.dir * 200 });
      }
      this.portalOrbs.push({ dir: side.dir, open: side.open, glow, dot });
    }
    // Замок с числом незажжённых фонарей — поверх темноты, чтобы его всегда было видно.
    this.lockG = scene.add.graphics();
    this.lockText = scene.add
      .text(0, cell * 0.135, '0', { fontFamily: FONT, fontSize: `${Math.round(cell * 0.2)}px`, color: '#3a2a05', fontStyle: 'bold' })
      .setOrigin(0.5);
    this.lock = scene.add.container(x, y, [this.lockG, this.lockText]).setDepth(6.9);
    drawPadlock(this.lockG, 0, 0, cell * 0.42);
    this.drawPortal(false);
  }

  private drawPortal(open: boolean) {
    const s = this.cell;
    const g = this.portalRing;
    g.clear();
    g.fillStyle(0x000000, 0.3);
    g.fillEllipse(0, s * 0.4, s * 0.7, s * 0.12);
    g.fillStyle(open ? 0x14524e : 0x221c45, 1);
    g.fillCircle(0, 0, s * 0.34);
    g.lineStyle(s * 0.09, 0x6c6aa0, 1);
    g.strokeCircle(0, 0, s * 0.34);
    g.lineStyle(s * 0.025, open ? C.exitOpen : 0x9b7bff, 0.9);
    g.strokeCircle(0, 0, s * 0.385);
    const w = this.portalSwirl;
    w.clear();
    const col = open ? 0xbffff0 : 0x9b7bff;
    for (let i = 0; i < 3; i++) {
      w.lineStyle(s * 0.035, col, open ? 0.85 : 0.5);
      w.beginPath();
      w.arc(0, 0, s * (0.12 + i * 0.07), (i * Math.PI * 2) / 3, (i * Math.PI * 2) / 3 + Math.PI * 0.9, false);
      w.strokePath();
    }
    w.fillStyle(col, open ? 0.9 : 0.4);
    w.fillCircle(0, 0, s * 0.06);
  }

  /** Конец дороги рядом с аркой — огонёк с этой стороны ярко загорается. */
  private highlightSide(side: Dir | null) {
    if (side === this.litSide) return;
    this.litSide = side;
    for (const o of this.portalOrbs) {
      const on = o.dir === side;
      this.scene.tweens.killTweensOf([o.glow, o.dot]);
      if (on) {
        o.glow.setTint(this.exitOpen ? C.exitOpen : 0xd8ccff);
        this.scene.tweens.add({ targets: o.glow, alpha: 1, scale: (this.cell * 0.95) / 128, duration: 250, ease: 'Back.out' });
        this.scene.tweens.add({ targets: o.dot, alpha: 1, scale: 1.6, duration: 250, ease: 'Back.out' });
      } else {
        o.glow.setScale((this.cell * 0.5) / 128).setAlpha(o.open ? 0.35 : 0.06);
        o.dot.setScale(1).setAlpha(o.open ? 0.75 : 0.15);
        if (o.open) this.scene.tweens.add({ targets: o.glow, alpha: 0.18, duration: 1300, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
      }
    }
  }

  /** Попытка войти в закрытую арку: замок вздрагивает. */
  shakeLock() {
    if (!this.lock.visible) return;
    this.scene.tweens.killTweensOf(this.lock);
    this.lock.setAngle(0).setScale(1);
    this.scene.tweens.add({ targets: this.lock, angle: { from: -14, to: 14 }, duration: 70, yoyo: true, repeat: 3, onComplete: () => this.lock.setAngle(0) });
    this.scene.tweens.add({ targets: this.lock, scale: 1.25, duration: 140, yoyo: true });
  }

  /** Центр арки — чтобы направить на неё подсказку. */
  exitCenter() {
    return this.center(this.level.exit.y * this.level.width + this.level.exit.x);
  }

  /** Слабое тление в темноте: незажжённый фонарь или закрытый выход зовут к себе. */
  private ember(glow: Phaser.GameObjects.Image, max = 0.3) {
    this.scene.tweens.killTweensOf(glow);
    glow.setAlpha(max * 0.4);
    this.scene.tweens.add({
      targets: glow,
      alpha: max,
      duration: Phaser.Math.Between(1100, 1600),
      yoyo: true,
      repeat: -1,
      ease: 'Sine.inOut',
      delay: Phaser.Math.Between(0, 800),
    });
  }

  /**
   * Фонарь стоит на тёмном круглом постаменте, а горит белым в оранжевой рамке — чтобы не сливаться
   * с жёлтой дорогой, которая проходит через его клетку.
   */
  private drawLamp(g: Phaser.GameObjects.Graphics, on: boolean) {
    const s = this.cell;
    g.clear();
    // Постамент: тёмный диск поверх дороги, при зажжённом фонаре — с оранжевым ободком.
    g.fillStyle(0x15112b, 0.92);
    g.fillCircle(0, s * 0.02, s * 0.36);
    g.lineStyle(s * 0.035, on ? LAMP_FRAME : 0x4a4466, on ? 1 : 0.8);
    g.strokeCircle(0, s * 0.02, s * 0.36);
    g.fillStyle(0x000000, 0.35);
    g.fillEllipse(0, s * 0.3, s * 0.3, s * 0.08);
    g.fillStyle(C.post, 1);
    g.fillRect(-s * 0.03, -s * 0.12, s * 0.06, s * 0.42);
    g.fillRoundedRect(-s * 0.1, s * 0.24, s * 0.2, s * 0.06, s * 0.02);
    // Голова фонаря: горящий — светлое стекло в оранжевой рамке, погасший — тёмное.
    g.fillStyle(on ? LAMP_FRAME : 0x3a3350, 1);
    g.fillRoundedRect(-s * 0.15, -s * 0.37, s * 0.3, s * 0.3, s * 0.07);
    g.fillStyle(on ? 0xfff6e0 : C.lanternOff, 1);
    g.fillRoundedRect(-s * 0.11, -s * 0.33, s * 0.22, s * 0.22, s * 0.05);
    g.fillStyle(C.post, 1);
    g.fillTriangle(-s * 0.17, -s * 0.36, s * 0.17, -s * 0.36, 0, -s * 0.47);
    g.fillStyle(on ? 0xffffff : 0x8a7d66, 1);
    g.fillCircle(0, -s * 0.22, s * (on ? 0.06 : 0.045));
  }

  // -------------------------------------------------------------------------
  // Дорога

  /** Точки полилинии дороги и признаки мостов. */
  private roadPoints(state: GameState) {
    return state.road.map((r) => ({ ...this.center(r.idx), bridge: r.kind === 'bridge', dirIn: r.dirIn }));
  }

  /**
   * Рисует дорогу. Если newCells > 0 — последние клетки «вырастают» с анимацией.
   */
  setRoad(state: GameState, newCells = 0, onDone?: () => void) {
    const pts = this.roadPoints(state);
    this.roadAnim?.stop();
    this.roadLights = pts.map((p) => ({ x: p.x, y: p.y }));
    // Новые клетки вспыхивают светом.
    for (const p of pts.slice(pts.length - newCells)) if (newCells > 0) this.flash(p.x, p.y, this.cell * 2.4);
    if (newCells <= 0) {
      this.drawRoad(pts, pts.length - 1);
      onDone?.();
      return;
    }
    const base = pts.length - 1 - newCells;
    const prog = { v: 0 };
    this.roadAnim = this.scene.tweens.add({
      targets: prog,
      v: newCells,
      duration: 110 + newCells * 70,
      ease: 'Quad.out',
      onUpdate: () => this.drawRoad(pts, base + prog.v),
      onComplete: () => {
        this.drawRoad(pts, pts.length - 1);
        onDone?.();
      },
    });
  }

  private drawRoad(pts: { x: number; y: number; bridge: boolean; dirIn: Dir }[], upTo: number) {
    const g = this.roadG;
    const s = this.cell;
    g.clear();
    // Мосты под дорогой
    pts.forEach((p, i) => {
      if (!p.bridge || i > Math.ceil(upTo)) return;
      const horiz = p.dirIn === 1 || p.dirIn === 3;
      const w = horiz ? s * 0.98 : s * 0.62;
      const h = horiz ? s * 0.62 : s * 0.98;
      g.fillStyle(C.bridge, 1);
      g.fillRoundedRect(p.x - w / 2, p.y - h / 2, w, h, s * 0.06);
      g.lineStyle(s * 0.025, 0x5a3a20, 1);
      for (let k = -2; k <= 2; k++) {
        if (horiz) g.lineBetween(p.x + k * s * 0.18, p.y - h / 2, p.x + k * s * 0.18, p.y + h / 2);
        else g.lineBetween(p.x - w / 2, p.y + k * s * 0.18, p.x + w / 2, p.y + k * s * 0.18);
      }
      g.fillStyle(C.bridgeLight, 1);
      if (horiz) {
        g.fillRect(p.x - w / 2, p.y - h / 2, w, s * 0.06);
        g.fillRect(p.x - w / 2, p.y + h / 2 - s * 0.06, w, s * 0.06);
      } else {
        g.fillRect(p.x - w / 2, p.y - h / 2, s * 0.06, h);
        g.fillRect(p.x + w / 2 - s * 0.06, p.y - h / 2, s * 0.06, h);
      }
    });
    const layers: [number, number, number][] = [
      [s * 0.5, C.roadGlow, 0.16],
      [s * 0.3, C.road, 1],
      [s * 0.1, C.roadCore, 0.75],
    ];
    for (const [lw, color, alpha] of layers) this.polyline(g, pts, upTo, lw, color, alpha);
  }

  private polyline(g: Phaser.GameObjects.Graphics, pts: { x: number; y: number }[], upTo: number, lw: number, color: number, alpha: number) {
    g.lineStyle(lw, color, alpha);
    g.fillStyle(color, alpha);
    const full = Math.floor(upTo);
    for (let i = 0; i < full && i < pts.length - 1; i++) g.lineBetween(pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y);
    for (let i = 0; i <= full && i < pts.length; i++) g.fillCircle(pts[i].x, pts[i].y, lw / 2);
    const frac = upTo - full;
    if (frac > 0 && full + 1 < pts.length) {
      const a = pts[full];
      const b = pts[full + 1];
      const x = a.x + (b.x - a.x) * frac;
      const y = a.y + (b.y - a.y) * frac;
      g.lineBetween(a.x, a.y, x, y);
      g.fillCircle(x, y, lw / 2);
    }
  }

  /** Стрелка на конце дороги — куда ляжет следующая плитка. */
  setHead(state: GameState) {
    const g = this.headG;
    g.clear();
    if (state.status === 'won') {
      this.highlightSide(null);
      this.scene.tweens.add({ targets: this.cone, alpha: 0, duration: 300 });
      return;
    }
    const c = this.center(state.head);
    this.chevron(g, c.x, c.y, state.dir, C.roadCore, 0.9);
    this.highlightSide(headSide(state));
    this.moveCone(c.x, c.y, state.dir);
  }

  /** Конус света плавно переезжает на новый конец дороги и поворачивается по направлению. */
  private moveCone(x: number, y: number, dir: Dir) {
    const target = ((dir - 1) * Math.PI) / 2; // 0 — вверх, луч текстуры смотрит вправо
    const first = !this.cone.getData('placed');
    this.scene.tweens.killTweensOf(this.cone);
    if (first) {
      this.cone.setPosition(x, y).setRotation(target).setData('placed', true);
      return;
    }
    const delta = Phaser.Math.Angle.Wrap(target - this.cone.rotation);
    this.scene.tweens.add({ targets: this.cone, x, y, rotation: this.cone.rotation + delta, alpha: 0.28, duration: 380, ease: 'Sine.inOut' });
  }

  /** Подсветка конца дороги как зоны, куда можно бросить плитку (при перетаскивании). */
  showDropZone(state: GameState | null, active = false) {
    const g = this.dropG;
    g.clear();
    if (!state) return;
    const s = this.cell;
    const h = this.center(state.head);
    const nx = h.x + DX[state.dir] * s;
    const ny = h.y + DY[state.dir] * s;
    g.lineStyle(s * (active ? 0.09 : 0.06), C.lanternOn, 1);
    g.strokeCircle(h.x, h.y, s * 0.42);
    g.fillStyle(C.lanternOn, active ? 0.35 : 0.16);
    g.fillCircle(nx, ny, s * 0.4);
    g.strokeCircle(nx, ny, s * 0.4);
  }

  /** Точка (x, y) над зоной сброса: конец дороги или клетка перед ним. */
  isOverDropZone(state: GameState, x: number, y: number): boolean {
    const s = this.cell;
    const h = this.center(state.head);
    const nx = h.x + DX[state.dir] * s;
    const ny = h.y + DY[state.dir] * s;
    return Math.hypot(x - h.x, y - h.y) < s * 0.75 || Math.hypot(x - nx, y - ny) < s * 0.85;
  }

  private chevron(g: Phaser.GameObjects.Graphics, cx: number, cy: number, dir: Dir, color: number, alpha: number) {
    const s = this.cell;
    const fx = DX[dir];
    const fy = DY[dir];
    const px = -fy;
    const py = fx;
    const tip = { x: cx + fx * s * 0.47, y: cy + fy * s * 0.47 };
    const back = s * 0.16;
    const wide = s * 0.16;
    g.lineStyle(s * 0.065, color, alpha);
    g.beginPath();
    g.moveTo(tip.x - fx * back + px * wide, tip.y - fy * back + py * wide);
    g.lineTo(tip.x, tip.y);
    g.lineTo(tip.x - fx * back - px * wide, tip.y - fy * back - py * wide);
    g.strokePath();
  }

  /** Полупрозрачный предпросмотр плитки (или красный — если её нельзя поставить). */
  showGhost(state: GameState, p: Placement | null, target: 'ghost' | 'hint' = 'ghost') {
    const g = target === 'ghost' ? this.ghostG : this.hintG;
    g.clear();
    if (!p) return;
    const s = this.cell;
    const head = this.center(state.head);
    const pts = [head, ...p.cells.map((c) => this.center(c.idx))];
    const color = p.ok ? C.ghost : C.bad;
    const alpha = target === 'hint' ? 0.28 : p.ok ? 0.5 : 0.55;
    // Настоящая форма дороги: после последней клетки — выход в новом направлении, поворот виден изгибом.
    const shape = [...pts];
    if (p.ok) {
      const last = pts[pts.length - 1];
      shape.push({ x: last.x + DX[p.newDir] * s * 0.42, y: last.y + DY[p.newDir] * s * 0.42 });
      if (target === 'ghost') this.polyline(g, shape, shape.length - 1, s * 0.52, C.roadGlow, 0.22); // подсветка целиком
    }
    this.polyline(g, p.ok ? shape : pts, (p.ok ? shape : pts).length - 1, s * 0.3, color, alpha);
    for (const c of p.cells) {
      const cc = this.center(c.idx);
      g.lineStyle(s * 0.04, color, alpha);
      g.strokeRoundedRect(cc.x - s * 0.44, cc.y - s * 0.44, s * 0.88, s * 0.88, s * 0.14);
    }
    if (p.ok) {
      const last = pts[pts.length - 1];
      this.chevron(g, last.x, last.y, p.newDir, C.roadCore, 0.95);
    } else if (p.blocked) {
      const inside = p.blocked.x >= 0 && p.blocked.y >= 0 && p.blocked.x < this.level.width && p.blocked.y < this.level.height;
      const from = pts[pts.length - 1];
      const bx = this.ox + (p.blocked.x + 0.5) * s;
      const by = this.oy + (p.blocked.y + 0.5) * s;
      // Линия до препятствия и крестик на нём
      const ex = inside ? bx : (from.x + bx) / 2;
      const ey = inside ? by : (from.y + by) / 2;
      g.lineStyle(s * 0.3, color, alpha * 0.6);
      g.lineBetween(from.x, from.y, from.x + (ex - from.x) * 0.6, from.y + (ey - from.y) * 0.6);
      g.lineStyle(s * 0.08, color, 0.95);
      const k = s * 0.17;
      g.lineBetween(ex - k, ey - k, ex + k, ey + k);
      g.lineBetween(ex + k, ey - k, ex - k, ey + k);
    }
  }

  // -------------------------------------------------------------------------
  // Фонари и выход

  updateLanterns(state: GameState) {
    for (const l of this.lanterns) {
      const onRoad = state.onRoad[l.idx];
      if (onRoad && l.state === 'off') {
        // Дорога прошла через фонарь — он зажигается сразу.
        l.state = 'road';
        this.drawLamp(l.lamp, true);
        this.scene.tweens.killTweensOf(l.glow);
        l.glow.setTint(LAMP_GLOW).setAlpha(1);
        this.scene.tweens.add({ targets: l.glow, alpha: { from: 0.95, to: 0.6 }, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
        this.scene.tweens.add({ targets: l.lamp, scale: { from: 1.35, to: 1 }, duration: 400, ease: 'Back.out' });
        const c = this.center(l.idx);
        this.burst.explode(10, c.x, c.y - this.cell * 0.22);
        this.flash(c.x, c.y - this.cell * 0.2, this.cell * 4, 900);
        raysBurst(this.scene, c.x, c.y - this.cell * 0.22, LAMP_GLOW, this.cell * 1.6);
      } else if (!onRoad && l.state !== 'off') {
        l.state = 'off';
        this.drawLamp(l.lamp, false);
        l.glow.setTint(C.lanternOn);
        this.ember(l.glow);
      }
    }
    // Число на замке — сколько фонарей ещё не зажжено.
    const left = lanternsLeft(state);
    if (this.lockText.text !== String(left)) {
      this.lockText.setText(String(left));
      if (this.lock.visible && left > 0) this.scene.tweens.add({ targets: this.lock, scale: { from: 1.3, to: 1 }, duration: 300, ease: 'Back.out' });
    }
    const open = this.level.lanterns.every((i) => state.onRoad[i]);
    if (open !== this.exitOpen) {
      this.exitOpen = open;
      this.drawPortal(open);
      this.scene.tweens.killTweensOf(this.exitGlow);
      if (open) {
        const e = this.exitCenter();
        this.exitGlow.setTint(C.exitOpen);
        this.unlock();
        this.scene.tweens.add({ targets: this.portalRing, scale: { from: 1.25, to: 1 }, duration: 350, ease: 'Back.out' });
        this.scene.tweens.add({ targets: this.exitGlow, alpha: { from: 0.9, to: 0.4 }, duration: 1000, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
        raysBurst(this.scene, e.x, e.y, C.exitOpen, this.cell * 1.8);
        this.flash(e.x, e.y, this.cell * 3.5, 1000);
      } else {
        // Отменили ход — замок возвращается.
        this.exitGlow.setTint(0x9b7bff);
        this.ember(this.exitGlow, 0.32);
        this.scene.tweens.killTweensOf(this.lock);
        const e = this.exitCenter();
        this.lockG.clear();
        drawPadlock(this.lockG, 0, 0, this.cell * 0.42);
        this.lockText.setVisible(true);
        this.lock.setVisible(true).setAlpha(1).setScale(1).setAngle(0).setPosition(e.x, e.y);
      }
      this.litSide = null;
      this.highlightSide(headSide(state));
    }
  }

  /** Замок открывается: дужка поднимается, замок улетает вверх и гаснет. */
  private unlock() {
    const s = this.cell * 0.42;
    const lift = { v: 0 };
    this.scene.tweens.killTweensOf(this.lock);
    this.lockText.setVisible(false);
    this.scene.tweens.add({
      targets: lift,
      v: s * 0.28,
      duration: 260,
      ease: 'Back.out',
      onUpdate: () => {
        this.lockG.clear();
        drawPadlock(this.lockG, 0, 0, s, lift.v);
      },
      onComplete: () => {
        this.scene.tweens.add({
          targets: this.lock,
          y: this.lock.y - this.cell * 0.5,
          alpha: 0,
          angle: 20,
          duration: 420,
          delay: 120,
          ease: 'Quad.in',
          onComplete: () => this.lock.setVisible(false),
        });
      },
    });
  }

  /** Фонарщик идёт по дороге и зажигает фонари. */
  walkLumo(state: GameState, onStep: (i: number) => void, onLantern: (n: number) => void, onDone: () => void) {
    this.headG.clear();
    this.ghostG.clear();
    this.hintG.clear();
    this.dropG.clear();
    this.highlightSide(null);
    this.scene.tweens.add({ targets: this.cone, alpha: 0, duration: 300 });
    const cells = state.road.slice(1);
    let litCount = 0;
    const stepDur = Phaser.Math.Clamp(1700 / cells.length, 110, 200);
    this.won = true;
    // Свет возвращается: пока Lumo идёт и зажигает фонари, темнота над полем рассеивается.
    if (this.dark) this.scene.tweens.add({ targets: this.dark, alpha: 0.12, duration: stepDur * cells.length + 600, ease: 'Sine.in' });
    const chain = cells.map((r, i) => {
      const c = this.center(r.idx);
      return {
        x: c.x,
        y: c.y - this.cell * 0.05,
        duration: stepDur,
        ease: 'Sine.inOut',
        onStart: () => {
          // Поворачиваем лицом по ходу движения (только по горизонтали).
          if (DX[r.dirIn] !== 0) this.lumo.setScale(DX[r.dirIn] < 0 ? -1 : 1, 1);
        },
        onComplete: () => {
          onStep(i);
          const l = this.lanterns.find((v) => v.idx === r.idx);
          if (l) {
            l.state = 'lit';
            this.drawLamp(l.lamp, true);
            this.scene.tweens.killTweensOf(l.glow);
            l.glow.setTint(LAMP_GLOW).setAlpha(1);
            this.scene.tweens.add({ targets: l.glow, alpha: 0.75, scale: l.glow.scale * 1.1, duration: 800, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
            this.scene.tweens.add({ targets: l.lamp, scale: { from: 1.35, to: 1 }, duration: 400, ease: 'Back.out' });
            const lc = this.center(l.idx);
            this.burst.explode(24, lc.x, lc.y - this.cell * 0.22);
            raysBurst(this.scene, lc.x, lc.y - this.cell * 0.22, LAMP_GLOW, this.cell * 2.4);
            this.flash(lc.x, lc.y - this.cell * 0.2, this.cell * 5, 1100);
            onLantern(litCount++);
          }
        },
      };
    });
    this.scene.tweens.chain({
      targets: this.lumo,
      tweens: chain,
      onComplete: () => {
        const e = this.center(state.head);
        this.burst.explode(30, e.x, e.y);
        raysBurst(this.scene, e.x, e.y, C.exitOpen, this.cell * 3);
        this.flash(e.x, e.y, this.cell * 6, 1200);
        this.scene.tweens.add({ targets: this.exitGlow, alpha: 1, scale: this.exitGlow.scale * 1.6, duration: 500 });
        this.scene.tweens.add({ targets: [this.portalRing, this.portalSwirl], scale: 1.2, duration: 400, yoyo: true });
        this.scene.tweens.add({ targets: this.lumo, alpha: 0, scale: 0.4, y: e.y - this.cell * 0.2, duration: 450, ease: 'Quad.in', onComplete: onDone });
      },
    });
  }

  /** Лёгкая тряска поля, когда ход невозможен. */
  bump() {
    this.scene.cameras.main.shake(120, 0.003);
  }
}
