// Отрисовка механик «Туманного леса» на поле: палитра леса, грибные кольца-телепорты, туман и тень.
// Логики здесь нет — всё берётся из состояния партии (core/game, core/tiles, core/fog).

import Phaser from 'phaser';
import { timeOf, type GameState } from '../core/game';
import { shadowIn, type ShadowState } from '../core/tiles';
import type { Level } from '../core/types';
import { reducedMotion } from './fx';
import { C, FONT } from './theme';
import { text } from './draw';

/** Палитра поля: «Долина» — сумеречный луг, «Лес» — бирюзово-фиолетовый мох и тёмная вода. */
export type Palette = 'valley' | 'forest' | 'peaks';

export interface PaletteColors {
  cell: number;
  cellLight: number;
  field: number;
  water: number;
  waterLight: number;
}

export const PALETTES: Record<Palette, PaletteColors> = {
  valley: { cell: C.cell, cellLight: C.cellLight, field: C.field, water: C.water, waterLight: C.waterLight },
  forest: { cell: 0x16303a, cellLight: 0x27495a, field: 0x090f1c, water: 0x15335a, waterLight: 0x7ab8e8 },
  // «Ледяные вершины»: заснеженные клетки в холодных сумерках, тёмно-синяя вода подо льдом.
  peaks: { cell: 0x2e4a6e, cellLight: 0x8fb4da, field: 0x0c1830, water: 0x12305a, waterLight: 0x9fd8f2 },
};

/** Палитра уровня — по id мира. */
export const paletteOf = (level: Pick<Level, 'id'>): Palette => (level.id.startsWith('forest-') ? 'forest' : level.id.startsWith('peaks-') ? 'peaks' : 'valley');

/** Цвета пар грибных колец: A — сиреневая, B — бирюзовая (у B ещё и точки на шляпках — различимы без цвета). */
export const RING_COLORS = [0xd78bff, 0x5ef0d8] as const;

interface BoardGeom {
  cell: number;
  center(idx: number): { x: number; y: number };
}

// ---------------------------------------------------------------------------
// Грибные кольца

/** Кольцо грибов вокруг клетки (запекается в текстуру поля). pair — 1 или 2. */
export function drawRingBase(g: Phaser.GameObjects.Graphics, cx: number, cy: number, cell: number, pair: number) {
  const color = RING_COLORS[(pair - 1) % 2];
  // Мшистое пятно и тёмная сердцевина — «вход».
  g.fillStyle(color, 0.12);
  g.fillCircle(cx, cy, cell * 0.42);
  g.fillStyle(0x05040f, 0.55);
  g.fillCircle(cx, cy, cell * 0.27);
  const n = 9;
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2 + 0.2;
    const r = cell * (0.34 + (k % 2) * 0.03);
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r * 0.86;
    const s = cell * (0.055 + (k % 3) * 0.012);
    g.fillStyle(0xe8dccb, 1); // ножка
    g.fillRect(x - s * 0.28, y - s * 0.2, s * 0.56, s * 0.95);
    g.fillStyle(color, 1); // шляпка
    g.fillEllipse(x, y - s * 0.25, s * 2, s * 1.2);
    g.fillStyle(0xffffff, 0.35);
    g.fillEllipse(x - s * 0.35, y - s * 0.45, s * 0.7, s * 0.35);
    if (pair === 2) {
      g.fillStyle(0xffffff, 0.8);
      g.fillCircle(x + s * 0.3, y - s * 0.3, s * 0.16);
    }
  }
}

/** Живая часть кольца: свечение (видно в темноте и тумане) и медленный вихрь в середине. */
export class RingView {
  readonly glow: Phaser.GameObjects.Image;
  private swirl: Phaser.GameObjects.Graphics;
  private used = false;

  constructor(
    scene: Phaser.Scene,
    readonly idx: number,
    readonly pair: number,
    x: number,
    y: number,
    private cell: number,
  ) {
    const color = RING_COLORS[(pair - 1) % 2];
    this.glow = scene.add.image(x, y, 'glow').setTint(color).setBlendMode(Phaser.BlendModes.ADD).setScale((cell * 1.25) / 128).setAlpha(0.55).setDepth(6.8);
    this.swirl = scene.add.graphics().setPosition(x, y).setDepth(1.6);
    this.swirl.lineStyle(cell * 0.03, color, 0.7);
    for (let k = 0; k < 3; k++) {
      const a0 = (k / 3) * Math.PI * 2;
      this.swirl.beginPath();
      this.swirl.arc(0, 0, cell * 0.17, a0, a0 + Math.PI * 0.55, false);
      this.swirl.strokePath();
    }
    if (!reducedMotion()) {
      scene.tweens.add({ targets: this.swirl, angle: 360, duration: 4200, repeat: -1 });
      scene.tweens.add({ targets: this.glow, alpha: 0.3, duration: 1300 + pair * 200, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    }
  }

  /** Кольцо уже пройдено дорогой — гаснет наполовину. */
  setUsed(used: boolean) {
    if (used === this.used) return;
    this.used = used;
    this.swirl.setAlpha(used ? 0.25 : 1);
    this.glow.setScale((this.cell * (used ? 0.8 : 1.25)) / 128);
  }

  get color() {
    return RING_COLORS[(this.pair - 1) % 2];
  }
}

// ---------------------------------------------------------------------------
// Туман

interface FogCell {
  idx: number;
  c: Phaser.GameObjects.Container;
  puffs: Phaser.GameObjects.Image[];
  phase: number;
  shown: boolean;
}

/**
 * Туман над скрытыми клетками: плотная дымка и несколько медленно плывущих клубов. Клетка открылась —
 * клубы расходятся и тают; отменили ход — туман возвращается.
 */
export class FogView {
  private cells: FogCell[] = [];
  private calm = reducedMotion();

  constructor(
    private scene: Phaser.Scene,
    level: Level,
    private geom: BoardGeom,
    private depth = 6.55,
  ) {
    const { cell } = geom;
    const rnd = new Phaser.Math.RandomDataGenerator([level.id, 'fog']);
    level.cells.forEach((_, idx) => {
      const p = geom.center(idx);
      const base = scene.add.graphics();
      base.fillStyle(0x1c1f38, 0.96);
      base.fillRoundedRect(-cell * 0.53, -cell * 0.53, cell * 1.06, cell * 1.06, cell * 0.18);
      base.fillStyle(0x3a3e66, 0.5);
      base.fillRoundedRect(-cell * 0.5, -cell * 0.5, cell, cell * 0.5, cell * 0.18);
      const puffs: Phaser.GameObjects.Image[] = [];
      for (let k = 0; k < 3; k++) {
        puffs.push(
          scene.add
            .image(rnd.realInRange(-0.25, 0.25) * cell, rnd.realInRange(-0.25, 0.25) * cell, 'glow')
            .setTint(rnd.pick([0xb8b4e6, 0x9fd8e0, 0xc8c0f0]))
            .setScale((cell * rnd.realInRange(0.9, 1.3)) / 128)
            .setAlpha(rnd.realInRange(0.28, 0.45)),
        );
      }
      const c = scene.add.container(p.x, p.y, [base, ...puffs]).setDepth(this.depth).setVisible(false);
      this.cells.push({ idx, c, puffs, phase: rnd.realInRange(0, Math.PI * 2), shown: false });
    });
  }

  /** Показать туман над скрытыми клетками (vis — видимые). animate — плавно. Возвращает, сколько клеток открылось. */
  set(vis: readonly boolean[], animate: boolean): number {
    let opened = 0;
    for (const f of this.cells) {
      const hide = !vis[f.idx];
      if (hide === f.shown) continue;
      f.shown = hide;
      this.scene.tweens.killTweensOf(f.c);
      if (hide) {
        f.c.setVisible(true);
        if (animate) this.scene.tweens.add({ targets: f.c, alpha: { from: 0, to: 1 }, scale: { from: 1.15, to: 1 }, duration: 350 });
        else f.c.setAlpha(1).setScale(1);
      } else {
        opened++;
        if (animate && !this.calm) {
          this.scene.tweens.add({ targets: f.c, alpha: 0, scale: 1.35, duration: 520, ease: 'Sine.out', onComplete: () => f.c.setVisible(false) });
        } else f.c.setVisible(false);
      }
    }
    return opened;
  }

  /** Каждый кадр: клубы тумана медленно плывут. */
  update(time: number) {
    if (this.calm) return;
    const cell = this.geom.cell;
    for (const f of this.cells) {
      if (!f.shown) continue;
      f.puffs.forEach((p, k) => {
        const t = time * 0.00025 + f.phase + k * 2.1;
        p.x = Math.sin(t) * cell * 0.18 + Math.sin(t * 2.3) * cell * 0.04;
        p.y = Math.cos(t * 0.8) * cell * 0.12;
      });
    }
  }
}

/** Медленно плывущий туман над всем лесным полем (атмосфера, не механика): несколько больших прозрачных клубов. */
export function forestMist(scene: Phaser.Scene, area: { x: number; y: number; w: number; h: number }, cell: number) {
  if (reducedMotion()) return;
  for (let k = 0; k < 5; k++) {
    const y = area.y + area.h * (0.15 + k * 0.18);
    const img = scene.add
      .image(area.x - cell, y, 'glow')
      .setTint(k % 2 ? 0x8fd8d8 : 0xb8a8f0)
      .setScale((cell * 3.2) / 128, (cell * 1.3) / 128)
      .setAlpha(0.1)
      .setDepth(6.58);
    const dur = 26000 + k * 5200;
    const run = () => {
      img.x = area.x - cell * 1.5;
      scene.tweens.add({ targets: img, x: area.x + area.w + cell * 1.5, duration: dur, ease: 'Linear', onComplete: run });
    };
    scene.time.delayedCall(k * 3500, run);
  }
}

/** Светящиеся грибы и капли на пустых клетках леса — объекты для украшений клетки (прячутся под дорогой). */
export function forestCellDecor(scene: Phaser.Scene, rnd: Phaser.Math.RandomDataGenerator, x0: number, y0: number, cell: number): Phaser.GameObjects.GameObject[] {
  const out: Phaser.GameObjects.GameObject[] = [];
  if (rnd.frac() < 0.34) {
    const g = scene.add.graphics().setDepth(1.25);
    const x = x0 + cell * rnd.realInRange(0.22, 0.78);
    const y = y0 + cell * rnd.realInRange(0.45, 0.85);
    const color = rnd.pick([0x7af0e0, 0xc89bff, 0x9dffb0]);
    for (let k = 0; k < rnd.between(1, 3); k++) {
      const s = cell * rnd.realInRange(0.04, 0.065);
      const px = x + k * s * 1.8 - s;
      g.fillStyle(0xd8cfc0, 1);
      g.fillRect(px - s * 0.22, y - s * 0.9, s * 0.44, s * 0.9);
      g.fillStyle(color, 1);
      g.fillEllipse(px, y - s * 0.95, s * 1.8, s * 1.1);
    }
    const glow = scene.add.image(x, y - cell * 0.06, 'glow').setTint(color).setBlendMode(Phaser.BlendModes.ADD).setScale((cell * 0.55) / 128).setAlpha(0.45).setDepth(6.6);
    if (!reducedMotion()) scene.tweens.add({ targets: glow, alpha: 0.18, duration: rnd.between(1400, 2600), yoyo: true, repeat: -1, ease: 'Sine.inOut', delay: rnd.between(0, 1500) });
    out.push(g, glow);
  }
  return out;
}

/** Редкие капли, падающие с невидимых веток над полем леса. */
export function forestDrops(scene: Phaser.Scene, area: { x: number; y: number; w: number; h: number }, cell: number) {
  if (reducedMotion()) return;
  scene.add
    .particles(0, 0, 'dot', {
      x: { min: area.x, max: area.x + area.w },
      y: area.y - cell * 0.3,
      lifespan: 1700,
      speedY: { min: 380, max: 520 },
      scaleX: 0.08,
      scaleY: 0.22,
      alpha: { start: 0.55, end: 0.1 },
      frequency: 700,
      tint: 0xa8e0ff,
      deathZone: { type: 'onLeave', source: new Phaser.Geom.Rectangle(area.x - 10, area.y - cell, area.w + 20, area.h + cell) },
    })
    .setDepth(6.6);
}

// ---------------------------------------------------------------------------
// Тень

/** Табличка отсчёта тени — в углу клетки старта (доля клетки от центра по x и y). */
export const SHADOW_BADGE_OFFSET = 0.37;

/** Точка дороги для тени: центр клетки; gap — сюда тень «перепрыгивает» через кольцо. */
interface ShadowPt {
  x: number;
  y: number;
  gap: boolean;
}

/**
 * Тень на дороге: табличка с обратным отсчётом на старте, потом тёмный сгусток с глазами, который бежит по
 * дороге за Lumo и гасит её позади себя. Задержка (фонарь, травница) — короткая подпись над тенью.
 */
export class ShadowView {
  private badge: Phaser.GameObjects.Container;
  private badgeText: Phaser.GameObjects.Text;
  private blob: Phaser.GameObjects.Container;
  private trail: Phaser.GameObjects.Graphics;
  private last: ShadowState | null = null;
  private pts: ShadowPt[] = [];
  private calm = reducedMotion();

  constructor(
    private scene: Phaser.Scene,
    private level: Level,
    private geom: BoardGeom,
  ) {
    const { cell } = geom;
    const s = geom.center(level.start.y * level.width + level.start.x);
    // Табличка на старте: через сколько ходов появится тень. В верхнем левом углу клетки — не на фигурке Lumo
    // (Lumo стоит по центру, шляпа и посох не доходят до угла).
    const bg = scene.add.graphics();
    const r = cell * 0.135;
    bg.fillStyle(0x000000, 0.4);
    bg.fillCircle(0, r * 0.15, r);
    bg.fillStyle(0x24123c, 1);
    bg.fillCircle(0, 0, r);
    bg.lineStyle(cell * 0.025, 0xb98cff, 1);
    bg.strokeCircle(0, 0, r);
    this.badgeText = scene.add.text(0, 0, String(level.shadow), { fontFamily: FONT, fontSize: `${Math.round(cell * 0.17)}px`, color: '#e8d8ff', fontStyle: 'bold' }).setOrigin(0.5);
    this.badge = scene.add.container(s.x - cell * SHADOW_BADGE_OFFSET, s.y - cell * SHADOW_BADGE_OFFSET, [bg, this.badgeText]).setDepth(7.02);
    this.trail = scene.add.graphics().setDepth(2.2);
    this.blob = this.makeBlob(cell).setPosition(s.x, s.y).setVisible(false).setDepth(6.94);
  }

  private makeBlob(cell: number) {
    const sc = this.scene;
    const s = cell * 0.36;
    const aura = sc.add.image(0, 0, 'glow').setTint(0x6a2cff).setScale((cell * 1.3) / 128).setAlpha(0.35);
    const g = sc.add.graphics();
    g.fillStyle(0x0c0618, 0.95);
    g.fillEllipse(0, -s * 0.15, s * 1.5, s * 1.6);
    // Рваный низ — дымка.
    for (let k = -2; k <= 2; k++) g.fillCircle(k * s * 0.3, s * 0.55 + (k % 2 ? s * 0.08 : 0), s * 0.22);
    g.fillStyle(0x2a1550, 0.9);
    g.fillEllipse(-s * 0.2, -s * 0.5, s * 0.6, s * 0.35);
    const eyes = sc.add.graphics();
    eyes.fillStyle(0xe8d8ff, 1);
    eyes.fillEllipse(-s * 0.25, -s * 0.2, s * 0.22, s * 0.3);
    eyes.fillEllipse(s * 0.25, -s * 0.2, s * 0.22, s * 0.3);
    const c = sc.add.container(0, 0, [aura, g, eyes]);
    if (!this.calm) {
      sc.tweens.add({ targets: g, scaleY: 1.06, scaleX: 0.95, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
      sc.tweens.add({ targets: eyes, scaleY: 0.15, duration: 90, yoyo: true, repeat: -1, repeatDelay: 2600, delay: 900 });
      sc.tweens.add({ targets: aura, alpha: 0.15, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    }
    return c;
  }

  /** Где тень на поле (null — ещё не появилась). */
  get position(): { x: number; y: number } | null {
    return this.blob.visible ? { x: this.blob.x, y: this.blob.y } : null;
  }

  /** Привести вид к состоянию партии. animate — после хода (тень бежит), иначе — сразу (старт, отмена). */
  sync(state: GameState, animate: boolean, delay = 0) {
    const sh = timeOf(state).sh;
    if (!sh) return;
    this.pts = state.road.map((r) => ({ ...this.geom.center(r.idx), gap: r.portal === 'out' }));
    const left = shadowIn(this.level, timeOf(state));
    const prev = this.last;
    this.last = sh;
    // Табличка обратного отсчёта.
    if (sh.pos < 0) {
      this.badge.setVisible(true);
      if (this.badgeText.text !== String(left)) {
        this.badgeText.setText(String(left));
        if (animate) this.scene.tweens.add({ targets: this.badge, scale: { from: 1.4, to: 1 }, duration: 300, ease: 'Back.out' });
      }
      this.blob.setVisible(false);
      this.drawTrail(-1);
      return;
    }
    this.badge.setVisible(false);
    const appear = !prev || prev.pos < 0 || !this.blob.visible;
    if (appear) {
      const p = this.pts[0];
      this.blob.setVisible(true).setPosition(p.x, p.y);
      if (animate && !this.calm) {
        this.blob.setScale(0.2).setAlpha(0);
        this.scene.tweens.add({ targets: this.blob, scale: 1, alpha: 1, duration: 450, delay, ease: 'Back.out' });
      } else this.blob.setScale(1).setAlpha(1);
      if (!animate || sh.pos === 0) {
        this.place(sh.pos);
        return;
      }
    }
    if (!animate || !prev || prev.pos < 0 || this.calm) {
      this.place(sh.pos);
      return;
    }
    // Бежит по клеткам дороги от прежней позиции к новой.
    const from = prev.pos;
    const to = Math.min(sh.pos, this.pts.length - 1);
    if (to === from) return;
    const prog = { v: from };
    this.scene.tweens.add({
      targets: prog,
      v: to,
      duration: 260 * (to - from),
      delay,
      ease: 'Sine.inOut',
      onUpdate: () => this.place(prog.v),
      onComplete: () => this.place(to),
    });
  }

  /** Поставить тень в точку дороги (дробная позиция — между клетками; через кольцо — скачком). */
  private place(pos: number) {
    const i = Math.max(0, Math.min(this.pts.length - 1, Math.floor(pos)));
    const j = Math.min(this.pts.length - 1, i + 1);
    const f = pos - i;
    const a = this.pts[i];
    const b = this.pts[j];
    const p = b.gap ? (f < 0.5 ? a : b) : { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
    this.blob.setPosition(p.x, p.y - this.geom.cell * 0.05);
    this.drawTrail(pos);
  }

  /** Дорога позади тени гаснет. */
  private drawTrail(pos: number) {
    const g = this.trail;
    g.clear();
    if (pos <= 0) return;
    const s = this.geom.cell;
    const full = Math.floor(pos);
    g.lineStyle(s * 0.42, 0x08040f, 0.62);
    g.fillStyle(0x08040f, 0.62);
    for (let i = 0; i <= full && i < this.pts.length; i++) g.fillCircle(this.pts[i].x, this.pts[i].y, s * 0.21);
    for (let i = 0; i < full && i + 1 < this.pts.length; i++) {
      if (this.pts[i + 1].gap) continue;
      g.lineBetween(this.pts[i].x, this.pts[i].y, this.pts[i + 1].x, this.pts[i + 1].y);
    }
    const f = pos - full;
    if (f > 0 && full + 1 < this.pts.length && !this.pts[full + 1].gap) {
      const a = this.pts[full];
      const b = this.pts[full + 1];
      g.lineBetween(a.x, a.y, a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f);
    }
  }

  /** Подпись над тенью: «Фонарь задержал тень» / «Травница задержала тень» (с листиком). */
  delayed(label: string, herb: boolean, delay = 0) {
    const p = this.position;
    if (!p) return;
    const cell = this.geom.cell;
    this.scene.time.delayedCall(delay, () => {
      const c = this.scene.add.container(p.x, p.y - cell * 0.7).setDepth(9);
      const size = Math.max(30, Math.round(cell * 0.24));
      const t = text(this.scene, herb ? size * 0.55 : 0, 0, label, size, herb ? '#c8ffb8' : '#ffd36b', true, { w: cell * 3.6, lines: 2 });
      // Тёмная плашка под подписью — читается на любом фоне.
      const pad = size * 0.45;
      const bw = t.displayWidth + pad * 2 + (herb ? size * 1.1 : 0);
      const bh = t.displayHeight + pad * 1.2;
      const bg = this.scene.add.graphics();
      bg.fillStyle(0x0b0f27, 0.88);
      bg.fillRoundedRect(-bw / 2, -bh / 2, bw, bh, bh / 2);
      bg.lineStyle(3, herb ? 0x5ed06a : 0xffb84d, 0.9);
      bg.strokeRoundedRect(-bw / 2, -bh / 2, bw, bh, bh / 2);
      c.add([bg, t]);
      if (herb) {
        // Листик травницы слева от подписи.
        const g = this.scene.add.graphics();
        const x = -bw / 2 + pad + size * 0.35;
        g.fillStyle(0x5ed06a, 1);
        g.fillEllipse(x, 0, size * 0.85, size * 0.48);
        g.lineStyle(Math.max(2, size * 0.07), 0x2a6a30, 1);
        g.lineBetween(x - size * 0.42, size * 0.05, x + size * 0.38, -size * 0.05);
        c.add(g);
      }
      // Не вылезать за поле по горизонтали.
      const half = bw / 2;
      const minX = this.geom.center(0).x - cell / 2 + half;
      const maxX = this.geom.center(this.level.width - 1).x + cell / 2 - half;
      c.x = Math.max(minX, Math.min(maxX, c.x));
      // Тень вздрагивает и отшатывается.
      this.scene.tweens.add({ targets: this.blob, scaleX: 0.8, scaleY: 1.15, duration: 140, yoyo: true, repeat: 1 });
      c.setScale(0.6).setAlpha(0);
      this.scene.tweens.add({ targets: c, scale: 1, alpha: 1, y: c.y - cell * 0.15, duration: 260, ease: 'Back.out' });
      this.scene.tweens.add({ targets: c, alpha: 0, y: c.y - cell * 0.45, duration: 500, delay: 1500, onComplete: () => c.destroy() });
    });
  }

  /** Тень догнала: бросок к Lumo и тёмная вспышка. */
  caught(target: { x: number; y: number }, delay = 0) {
    this.scene.tweens.add({ targets: this.blob, x: target.x, y: target.y, scale: 1.6, duration: 280, delay, ease: 'Quad.in' });
  }

  /** Победа: тень тает в свете. */
  vanish() {
    this.badge.setVisible(false);
    this.scene.tweens.add({ targets: [this.blob, this.trail], alpha: 0, duration: 600 });
  }
}
