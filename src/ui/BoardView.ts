// Отрисовка поля: клетки, дорога, призрак плитки, фонари, выход и фонарщик.
// Логики здесь нет — вид только показывает состояние из core/game.

import Phaser from 'phaser';
import { fadeLeftAt, tilesPlaced, type GameState, type Placement } from '../core/game';
import { bridgeHorizontal } from '../core/tiles';
import { DX, DY, type Dir, type Level } from '../core/types';
import { C } from './theme';
import { createLumo, drawFireflyIcon, drawPadlock } from './draw';
import { headSide, lanternsLeft, portalSides } from '../core/portal';
import { FONT } from './theme';
import { raysBurst, reducedMotion } from './fx';
import { sfx } from '../audio';

/** Точка дороги: центр клетки; jump — к ней дорога пришла прыжком (рисуем дугу, а не линию). */
interface RoadPt {
  x: number;
  y: number;
  jump?: boolean;
}

/** Детерминированный «шум» 0..1 по двум числам — раскладка камешков не дрожит при перерисовке. */
const hash = (a: number, b: number) => {
  const x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return x - Math.floor(x);
};

/** Длительность шага Lumo по плитке. */
const STEP_MS = 250;

/** Оранжевая рамка и свечение горящего фонаря — отдельный цвет от жёлтой дороги. */
const LAMP_FRAME = 0xff8a2a;
const LAMP_GLOW = 0xffa04a;

interface FireflyView {
  idx: number;
  /** Светлячок и его свечение двигаются вместе (контейнер). */
  view: Phaser.GameObjects.Container;
  glow: Phaser.GameObjects.Image;
  collected: boolean;
}

interface LanternView {
  idx: number;
  glow: Phaser.GameObjects.Image;
  lamp: Phaser.GameObjects.Graphics;
  /** off — не горит, road — зажжён дорогой, lit — зажжён на финише, out — гаснущий фонарь погас. */
  state: 'off' | 'road' | 'lit' | 'out';
  /** Гаснущий фонарь: сколько ходов ещё горит (число на табличке). */
  badge?: Phaser.GameObjects.Container;
  badgeText?: Phaser.GameObjects.Text;
  badgeG?: Phaser.GameObjects.Graphics;
}

interface BridgeView {
  idx: number;
  view: Phaser.GameObjects.Graphics;
  /** Следующее положение моста — полупрозрачно. */
  ghost: Phaser.GameObjects.Graphics;
  horiz: boolean;
  locked: boolean;
}

export interface BoardOptions {
  avatar?: number;
  /** Ночная темнота над полем (по умолчанию — только у ночных уровней). */
  dark?: boolean;
  maxCell?: number;
  /** Звуки шагов и камешков (в игре да, в карточках правил нет). */
  sound?: boolean;
  /** Бабочки и искры над полем (в карточках правил выключены). */
  ambient?: boolean;
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
  private fireflies: FireflyView[] = [];
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
  // Живое поле: травинки колышутся, у каждой клетки свои украшения (прячутся под дорогой)
  private tufts: { img: Phaser.GameObjects.Image; phase: number; amp: number }[] = [];
  private decor = new Map<number, Phaser.GameObjects.GameObject[]>();
  private bridges: BridgeView[] = [];
  private dust!: Phaser.GameObjects.Particles.ParticleEmitter;
  private sparks!: Phaser.GameObjects.Particles.ParticleEmitter;
  private readonly sound: boolean;
  private readonly hasExit: boolean;
  /** Где сейчас стоит Lumo (индекс клетки) и куда смотрит. */
  private lumoIdx = -1;
  private lumoTween?: Phaser.Tweens.TweenChain | Phaser.Tweens.Tween;
  private lastT = -1;

  constructor(
    private scene: Phaser.Scene,
    private level: Level,
    area: { x: number; y: number; w: number; h: number },
    opts: BoardOptions = {},
  ) {
    this.cell = Math.floor(Math.min(area.w / level.width, area.h / level.height, opts.maxCell ?? 200));
    this.ox = area.x + (area.w - this.cell * level.width) / 2;
    this.oy = area.y + (area.h - this.cell * level.height) / 2;
    this.sound = opts.sound ?? false;
    this.hasExit = level.goal === 'classic';

    createDecorTextures(scene);
    this.drawCells();
    this.decorate();
    this.drawTurnBridges();
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
    this.drawFireflies();

    const startIdx = level.start.y * level.width + level.start.x;
    this.lumo = createLumo(scene, this.cell * 0.8, opts.avatar ?? 0).setDepth(7);
    this.placeLumo(startIdx, level.startDir);

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
    // Свет разлетается искрами, когда дорога дотягивается до клетки; искры серии без ошибок.
    this.dust = scene.add
      .particles(0, 0, 'glow', {
        speed: { min: 30, max: 120 },
        angle: { min: 180, max: 360 },
        scale: { start: 0.22 * (this.cell / 200), end: 0 },
        alpha: { start: 0.9, end: 0 },
        lifespan: 650,
        gravityY: -40,
        blendMode: Phaser.BlendModes.ADD,
        tint: [0xffd36b, 0xfff1cc],
        emitting: false,
      })
      .setDepth(6.9);
    this.sparks = scene.add
      .particles(0, 0, 'glow', {
        speed: { min: 40, max: 160 },
        scale: { start: 0.2 * (this.cell / 200), end: 0 },
        alpha: { start: 1, end: 0 },
        lifespan: 800,
        gravityY: -60,
        blendMode: Phaser.BlendModes.ADD,
        tint: [0xfff1cc, 0xffd36b, 0xffb84d],
        emitting: false,
      })
      .setDepth(8);
    if (opts.dark ?? true) this.initDarkness();
    if (opts.ambient !== false) this.ambient();
  }

  // -------------------------------------------------------------------------
  // Живое поле

  /** Украшения пустых клеток: травинки, цветы, камешки — случайно, но всегда одинаково для уровня. */
  private decorate() {
    const { level, cell, scene } = this;
    const rnd = new Phaser.Math.RandomDataGenerator([level.id, String(level.width), level.cells.join('')]);
    level.cells.forEach((type, idx) => {
      if (type !== 'empty' && type !== 'firefly') return;
      const x0 = this.ox + (idx % level.width) * cell;
      const y0 = this.oy + Math.floor(idx / level.width) * cell;
      const items: Phaser.GameObjects.GameObject[] = [];
      const spot = () => ({ x: x0 + cell * rnd.realInRange(0.18, 0.82), y: y0 + cell * rnd.realInRange(0.3, 0.86) });
      const tuftN = rnd.weightedPick([0, 1, 1, 2, 2, 3]);
      for (let k = 0; k < tuftN; k++) {
        const p = spot();
        const img = scene.add
          .image(p.x, p.y, `tuft${rnd.between(0, 2)}`)
          .setOrigin(0.5, 1)
          .setScale((cell / 200) * rnd.realInRange(1.0, 1.45))
          .setFlipX(rnd.frac() < 0.5)
          .setDepth(1.2 + p.y / 100000);
        this.tufts.push({ img, phase: rnd.realInRange(0, Math.PI * 2), amp: rnd.realInRange(0.05, 0.11) });
        items.push(img);
      }
      if (rnd.frac() < 0.38) {
        const p = spot();
        const img = scene.add
          .image(p.x, p.y, `flower${rnd.between(0, 2)}`)
          .setOrigin(0.5, 1)
          .setScale((cell / 200) * rnd.realInRange(1.0, 1.3))
          .setDepth(1.2 + p.y / 100000);
        this.tufts.push({ img, phase: rnd.realInRange(0, Math.PI * 2), amp: 0.06 });
        items.push(img);
      }
      if (rnd.frac() < 0.3) {
        const g = scene.add.graphics().setDepth(0.6);
        const p = spot();
        for (let k = 0; k < rnd.between(2, 3); k++) {
          const px = p.x + rnd.realInRange(-0.08, 0.08) * cell;
          const py = p.y + rnd.realInRange(-0.05, 0.05) * cell;
          const r = cell * rnd.realInRange(0.025, 0.045);
          g.fillStyle(0x000000, 0.2);
          g.fillEllipse(px, py + r * 0.5, r * 2.4, r * 1.2);
          g.fillStyle(rnd.pick([0xb9ad98, 0xa39782, 0xd2c6b0]), 1);
          g.fillEllipse(px, py, r * 2.2, r * 1.6);
        }
        items.push(g);
      }
      if (items.length) this.decor.set(idx, items);
    });
  }

  /** Бабочки днём и тёплые искры над полем — редкие, чтобы не отвлекать. */
  private ambient() {
    const { scene, cell, level } = this;
    if (reducedMotion()) return;
    const w = cell * level.width;
    const h = cell * level.height;
    scene.add
      .particles(0, 0, 'glow', {
        x: { min: this.ox, max: this.ox + w },
        y: { min: this.oy + h * 0.3, max: this.oy + h },
        lifespan: 4200,
        speedY: { min: -30, max: -10 },
        speedX: { min: -12, max: 12 },
        scale: { start: 0.09 * (cell / 200), end: 0 },
        alpha: { start: 0.75, end: 0 },
        frequency: 900,
        blendMode: Phaser.BlendModes.ADD,
        tint: level.night ? 0x9dff5c : 0xffd890,
      })
      .setDepth(6.6);
    if (level.night) return;
    const fly = () => {
      if (!this.scene.sys.isActive() || this.won) return;
      this.butterfly();
      scene.time.delayedCall(Phaser.Math.Between(9000, 16000), fly);
    };
    scene.time.delayedCall(Phaser.Math.Between(2500, 6000), fly);
  }

  /** Бабочка пролетает над полем по волнистой линии. */
  private butterfly() {
    const { scene, cell, level } = this;
    const fromLeft = Math.random() < 0.5;
    const x0 = fromLeft ? this.ox - cell * 0.4 : this.ox + cell * (level.width + 0.4);
    const x1 = fromLeft ? this.ox + cell * (level.width + 0.4) : this.ox - cell * 0.4;
    const baseY = this.oy + cell * Phaser.Math.FloatBetween(0.5, level.height - 0.5);
    const color = Phaser.Utils.Array.GetRandom([0xc9b8e8, 0xd8e6f0, 0xe8dcb0]);
    const wings = scene.add.graphics();
    const s = cell * 0.13;
    wings.fillStyle(color, 0.55);
    wings.fillEllipse(-s * 0.55, -s * 0.2, s * 1.1, s * 1.2);
    wings.fillEllipse(s * 0.55, -s * 0.2, s * 1.1, s * 1.2);
    wings.fillEllipse(-s * 0.4, s * 0.45, s * 0.7, s * 0.7);
    wings.fillEllipse(s * 0.4, s * 0.45, s * 0.7, s * 0.7);
    const body = scene.add.graphics();
    body.fillStyle(0x3a2a3a, 1);
    body.fillEllipse(0, 0, s * 0.22, s * 1.1);
    const b = scene.add.container(x0, baseY, [wings, body]).setDepth(6.95).setAngle(fromLeft ? 90 : -90);
    scene.tweens.add({ targets: wings, scaleX: 0.25, duration: 110, yoyo: true, repeat: -1 });
    const dur = Phaser.Math.Between(6500, 9000);
    const phase = Math.random() * 6;
    scene.tweens.addCounter({
      from: 0,
      to: 1,
      duration: dur,
      onUpdate: (tw) => {
        const k = tw.getValue() ?? 0;
        b.x = x0 + (x1 - x0) * k;
        b.y = baseY + Math.sin(k * 9 + phase) * cell * 0.45;
      },
      onComplete: () => b.destroy(),
    });
  }

  /** Поворотные мосты: доски над водой и полупрозрачное следующее положение. */
  private drawTurnBridges() {
    const { level, scene } = this;
    for (const idx of level.turnBridges) {
      const c = this.center(idx);
      const ghost = scene.add.graphics().setDepth(1.4).setPosition(c.x, c.y).setAlpha(0.3);
      const view = scene.add.graphics().setDepth(1.5).setPosition(c.x, c.y);
      this.drawPlanks(view, false);
      this.drawPlanks(ghost, true);
      const horiz = level.bridgeH[idx];
      view.setAngle(horiz ? 0 : 90);
      ghost.setAngle(horiz ? 90 : 0);
      this.bridges.push({ idx, view, ghost, horiz, locked: false });
    }
  }

  /** Доски моста (горизонтально: проход слева направо); ghost — только контур. */
  private drawPlanks(g: Phaser.GameObjects.Graphics, ghost: boolean) {
    const s = this.cell;
    const w = s * 1.0;
    const h = s * 0.6;
    if (ghost) {
      g.lineStyle(s * 0.03, 0xfff1cc, 1);
      g.strokeRoundedRect(-w / 2, -h / 2, w, h, s * 0.07);
      for (let k = -2; k <= 2; k++) g.lineBetween(k * s * 0.18, -h / 2, k * s * 0.18, h / 2);
      return;
    }
    g.fillStyle(0x000000, 0.25);
    g.fillRoundedRect(-w / 2, -h / 2 + s * 0.05, w, h, s * 0.07);
    g.fillStyle(C.bridge, 1);
    g.fillRoundedRect(-w / 2, -h / 2, w, h, s * 0.07);
    g.lineStyle(s * 0.025, 0x5a3a20, 1);
    for (let k = -2; k <= 2; k++) g.lineBetween(k * s * 0.18, -h / 2, k * s * 0.18, h / 2);
    g.fillStyle(C.bridgeLight, 1);
    g.fillRect(-w / 2, -h / 2, w, s * 0.06);
    g.fillRect(-w / 2, h / 2 - s * 0.06, w, s * 0.06);
    // Ось вращения посередине.
    g.fillStyle(0x3a2a18, 1);
    g.fillCircle(0, 0, s * 0.07);
    g.fillStyle(0xd9b07a, 1);
    g.fillCircle(0, 0, s * 0.035);
  }

  /** Мосты поворачиваются после каждой поставленной плитки; мост под дорогой больше не крутится. */
  private updateBridges(state: GameState, animate: boolean) {
    const t = tilesPlaced(state);
    let turned = false;
    for (const b of this.bridges) {
      const onRoad = state.onRoad[b.idx];
      let horiz: boolean;
      if (onRoad) {
        const r = state.road.find((x) => x.idx === b.idx)!;
        horiz = r.dirIn === 1 || r.dirIn === 3;
      } else horiz = bridgeHorizontal(this.level, b.idx, t);
      b.ghost.setVisible(!onRoad);
      b.locked = onRoad;
      if (horiz === b.horiz && !animate) continue;
      const target = horiz ? 0 : 90;
      this.scene.tweens.killTweensOf([b.view, b.ghost]);
      if (horiz !== b.horiz && animate) {
        turned = true;
        const to = b.view.angle + Phaser.Math.Angle.ShortestBetween(b.view.angle, target);
        this.scene.tweens.add({ targets: b.view, angle: to, duration: 420, ease: 'Back.out' });
        this.scene.tweens.add({ targets: b.ghost, angle: to + 90, duration: 420, ease: 'Back.out' });
      } else {
        b.view.setAngle(target);
        b.ghost.setAngle(target + 90);
      }
      b.horiz = horiz;
    }
    if (turned && this.sound) sfx.creak();
  }

  /** Украшения клеток прячутся под дорогой (и возвращаются при отмене хода). */
  private updateDecor(state: GameState) {
    for (const [idx, items] of this.decor) {
      const hide = state.onRoad[idx];
      for (const it of items) (it as unknown as Phaser.GameObjects.Components.Visible).setVisible(!hide);
    }
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
      .setAlpha(level.night ? 0.74 : 0.52);
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
    // Трава колышется, светлячки летают.
    for (const t of this.tufts) t.img.rotation = Math.sin(time * 0.0016 + t.phase) * t.amp + Math.sin(time * 0.0007 + t.phase * 2) * t.amp * 0.4;
    for (const [i, f] of this.fireflies.entries()) {
      if (f.collected) continue;
      const c = this.center(f.idx);
      const k = time * 0.001 + i * 1.7;
      f.view.setPosition(c.x + Math.sin(k * 0.9) * this.cell * 0.2 + Math.sin(k * 2.3) * this.cell * 0.04, c.y + Math.cos(k * 1.3) * this.cell * 0.14 - this.cell * 0.05);
    }
    if (!this.dark) return;
    const { cell } = this;
    const flicker = 1 + Math.sin(time * 0.006) * 0.03 + Math.sin(time * 0.0173) * 0.02;
    this.dark.clear();
    this.dark.draw(this.darkShape, 0, 0);
    for (const p of this.roadLights) this.light(p.x, p.y, cell * 2.7, 0.9);
    for (const l of this.lanterns) {
      if (l.state === 'off') continue;
      const c = this.center(l.idx);
      this.light(c.x, c.y - cell * 0.2, cell * (l.state === 'lit' ? 4.6 : 4) * flicker, 0.95);
    }
    // Светлячки сами светятся в темноте (пока их не собрали).
    for (const f of this.fireflies) {
      if (f.collected || !f.view.visible) continue;
      this.light(f.view.x, f.view.y, cell * 1.3 * flicker, 0.55);
    }
    if (this.exitOpen && this.hasExit) {
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

  /**
   * Клетки поля рисуются один раз и запекаются в текстуру: статичная графика не пересчитывается каждый кадр
   * (60 fps на телефоне).
   */
  private drawCells() {
    const { level, cell } = this;
    const bx = Math.floor(this.ox - cell * 0.12);
    const by = Math.floor(this.oy - cell * 0.12);
    const bw = Math.ceil(cell * (level.width + 0.24)) + 2;
    const bh = Math.ceil(cell * (level.height + 0.24)) + 14;
    const g = this.scene.make.graphics({ x: 0, y: 0 }, false);
    g.translateCanvas(-bx, -by);
    const pad = cell * 0.05;
    const r = cell * 0.16;
    // Подложка поля
    g.fillStyle(0x000000, 0.3);
    g.fillRoundedRect(this.ox - cell * 0.12, this.oy - cell * 0.12 + 12, cell * (level.width + 0.24), cell * (level.height + 0.24), cell * 0.25);
    g.fillStyle(C.field, 1);
    g.fillRoundedRect(this.ox - cell * 0.12, this.oy - cell * 0.12, cell * (level.width + 0.24), cell * (level.height + 0.24), cell * 0.25);

    level.cells.forEach((type, idx) => {
      const x = this.ox + (idx % level.width) * cell;
      const y = this.oy + Math.floor(idx / level.width) * cell;
      if (type === 'water' || type === 'turnbridge') {
        g.fillStyle(C.water, 1);
        g.fillRoundedRect(x + pad * 0.3, y + pad, cell - pad * 0.6, cell - pad * 2, r * 0.6);
        g.fillStyle(0xffffff, 0.06);
        g.fillRoundedRect(x + pad * 0.3, y + pad, cell - pad * 0.6, (cell - pad * 2) * 0.35, r * 0.6);
        this.addWaves(x, y);
        return;
      }
      // Клетка тёмного луга: два близких оттенка, чтобы поле не было однотонным.
      const tone = hash(idx, level.width) * 0.5;
      g.fillStyle(C.cell, 1);
      g.fillRoundedRect(x + pad, y + pad, cell - pad * 2, cell - pad * 2, r);
      g.fillStyle(C.cellLight, 0.3 + tone * 0.35);
      g.fillRoundedRect(x + pad, y + pad, cell - pad * 2, (cell - pad * 2) * 0.5, r);
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
    const key = `board-cells-${this.level.id}`;
    if (this.scene.textures.exists(key)) this.scene.textures.remove(key);
    g.generateTexture(key, bw, bh);
    g.destroy();
    this.scene.add.image(bx, by, key).setOrigin(0).setDepth(0);
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
    // Блики на воде: вспыхивают и гаснут в случайных местах.
    if (reducedMotion()) return;
    const glint = this.scene.add
      .image(x + cell * 0.5, y + cell * 0.5, 'glow')
      .setBlendMode(Phaser.BlendModes.ADD)
      .setScale((cell * 0.22) / 128, (cell * 0.1) / 128)
      .setAlpha(0)
      .setDepth(1);
    const blink = () => {
      glint.setPosition(x + cell * Phaser.Math.FloatBetween(0.2, 0.8), y + cell * Phaser.Math.FloatBetween(0.2, 0.8));
      this.scene.tweens.add({ targets: glint, alpha: 0.8, duration: 380, yoyo: true, ease: 'Sine.inOut', delay: Phaser.Math.Between(600, 3200), onComplete: blink });
    };
    blink();
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
      const view: LanternView = { idx, glow, lamp, state: 'off' };
      if (level.fade[idx] > 0) {
        // Гаснущий фонарь: табличка с числом ходов, которые он будет гореть.
        const badgeG = scene.add.graphics();
        const badgeText = scene.add
          .text(0, 0, String(level.fade[idx]), { fontFamily: FONT, fontSize: `${Math.round(cell * 0.22)}px`, color: '#fff1cc', fontStyle: 'bold' })
          .setOrigin(0.5);
        view.badgeG = badgeG;
        view.badgeText = badgeText;
        view.badge = scene.add.container(c.x + cell * 0.3, c.y - cell * 0.3, [badgeG, badgeText]).setDepth(6.92);
        this.drawBadge(view, 'off');
      }
      this.lanterns.push(view);
      this.drawLamp(lamp, false);
      this.ember(glow);
    }
    if (!this.hasExit) return; // цель «светлячки» — арки нет
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

  /** Табличка гаснущего фонаря: тёмная (не зажжён), оранжевая (горит), серая (погас). */
  private drawBadge(l: LanternView, mode: 'off' | 'on' | 'out' | 'last') {
    const g = l.badgeG!;
    const r = this.cell * 0.17;
    g.clear();
    g.fillStyle(0x000000, 0.35);
    g.fillCircle(0, r * 0.15, r);
    g.fillStyle(mode === 'on' ? 0xff8a2a : mode === 'last' ? 0xff4a3a : mode === 'out' ? 0x4a4458 : 0x2a2440, 1);
    g.fillCircle(0, 0, r);
    g.lineStyle(this.cell * 0.025, mode === 'off' ? 0xffb84d : 0xfff1cc, mode === 'out' ? 0.4 : 0.9);
    g.strokeCircle(0, 0, r);
    l.badgeText!.setColor(mode === 'out' ? '#9a94aa' : '#fff1cc');
  }

  /** Светлячки: летают над клеткой и мигают; дорога через клетку собирает светлячка. */
  private drawFireflies() {
    const { level, cell, scene } = this;
    level.fireflies.forEach((idx, i) => {
      const c = this.center(idx);
      const glow = scene.add.image(0, 0, 'glow').setTint(C.fireflyGlow).setBlendMode(Phaser.BlendModes.ADD).setScale((cell * 0.9) / 128).setAlpha(0.55);
      const g = scene.add.graphics();
      drawFireflyIcon(g, 0, 0, cell * 0.16, true);
      const view = scene.add.container(c.x, c.y, [glow, g]).setDepth(6.85);
      // Летает вокруг клетки (в update) и мигает брюшком — у каждого свой ритм.
      scene.tweens.add({ targets: glow, alpha: 0.2, duration: 700 + i * 90, yoyo: true, repeat: -1, ease: 'Sine.inOut', delay: i * 230 });
      this.fireflies.push({ idx, view, glow, collected: false });
    });
  }

  /** Дорога прошла через светлячка — он вспыхивает и улетает вверх; отменили ход — возвращается на место. */
  updateFireflies(state: GameState) {
    for (const f of this.fireflies) {
      const on = state.onRoad[f.idx];
      if (on && !f.collected) {
        f.collected = true;
        const c = this.center(f.idx);
        this.burst.explode(8, c.x, c.y);
        raysBurst(this.scene, c.x, c.y, C.fireflyGlow, this.cell * 1.1);
        this.flash(c.x, c.y, this.cell * 2.2, 600);
        this.scene.tweens.add({
          targets: f.view,
          y: c.y - this.cell * 0.9,
          scale: 0.4,
          alpha: 0,
          duration: 650,
          ease: 'Quad.in',
          onComplete: () => f.view.setVisible(false),
        });
      } else if (!on && f.collected) {
        f.collected = false;
        const c = this.center(f.idx);
        this.scene.tweens.killTweensOf(f.view);
        f.view.setVisible(true).setPosition(c.x, c.y).setScale(1).setAlpha(1);
      }
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
    if (side === this.litSide || !this.hasExit) return;
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
    if (!this.lock?.visible) return;
    this.scene.tweens.killTweensOf(this.lock);
    this.lock.setAngle(0).setScale(1);
    this.scene.tweens.add({ targets: this.lock, angle: { from: -14, to: 14 }, duration: 70, yoyo: true, repeat: 3, onComplete: () => this.lock.setAngle(0) });
    this.scene.tweens.add({ targets: this.lock, scale: 1.25, duration: 140, yoyo: true });
  }

  /** Центр арки — чтобы направить на неё подсказку. */
  exitCenter() {
    if (!this.hasExit) return this.center(this.level.start.y * this.level.width + this.level.start.x);
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

  /** Точки дороги: центры клеток, признаки мостов и прыжков. */
  private roadPoints(state: GameState) {
    return state.road.map((r) => ({ ...this.center(r.idx), bridge: r.kind === 'bridge', jump: r.kind === 'jump', dirIn: r.dirIn }));
  }

  /**
   * Рисует дорогу и ставит Lumo на её конец. Если newCells > 0 — новые клетки выкладываются камешками
   * (с «бум» и пылью), а Lumo шагает по ним. Иначе (начало, отмена) — сразу.
   */
  setRoad(state: GameState, newCells = 0, onDone?: () => void) {
    const pts = this.roadPoints(state);
    this.roadAnim?.stop();
    this.roadLights = pts.map((p) => ({ x: p.x, y: p.y }));
    this.updateDecor(state);
    const t = tilesPlaced(state);
    this.updateBridges(state, this.lastT >= 0 && t !== this.lastT);
    this.lastT = t;
    if (newCells <= 0) {
      this.drawRoad(pts, pts.length - 1);
      const last = state.road[state.road.length - 1];
      this.moveLumo(last.idx, last.dirOut);
      onDone?.();
      return;
    }
    const base = pts.length - 1 - newCells;
    const newRoad = state.road.slice(state.road.length - newCells);
    const jump = newRoad[0].kind === 'jump';
    const dur = jump ? STEP_MS + 80 : STEP_MS + (newCells - 1) * 90;
    const prog = { v: 0 };
    this.roadAnim = this.scene.tweens.add({
      targets: prog,
      v: newCells,
      duration: dur,
      ease: 'Sine.inOut',
      onUpdate: () => this.drawRoad(pts, base + prog.v),
      onComplete: () => {
        this.drawRoad(pts, pts.length - 1);
        onDone?.();
      },
    });
    this.walkTo(newRoad, dur, jump);
  }

  // -------------------------------------------------------------------------
  // Lumo на поле

  /** Позиция Lumo в клетке: чуть позади центра, чтобы стрелка конца дороги была видна. */
  private lumoAt(idx: number, dir: Dir) {
    const c = this.center(idx);
    return { x: c.x - DX[dir] * this.cell * 0.08, y: c.y - this.cell * 0.08 - DY[dir] * this.cell * 0.06 };
  }

  private face(dir: Dir) {
    if (DX[dir] !== 0) this.lumo.setScale(DX[dir] < 0 ? -1 : 1, 1);
  }

  private placeLumo(idx: number, dir: Dir) {
    const p = this.lumoAt(idx, dir);
    this.lumo.setPosition(p.x, p.y);
    this.lumoIdx = idx;
    this.face(dir);
  }

  /** Без шагов: отмена хода, откат подсказкой — Lumo быстро скользит на конец дороги. */
  private moveLumo(idx: number, dir: Dir) {
    if (idx === this.lumoIdx || this.won) return;
    this.lumoTween?.stop();
    const p = this.lumoAt(idx, dir);
    this.lumoIdx = idx;
    this.face(dir);
    this.lumoTween = this.scene.tweens.add({ targets: this.lumo, x: p.x, y: p.y, angle: 0, duration: 200, ease: 'Sine.out' });
  }

  /** Lumo шагает по новым клеткам: подпрыгивает на каждом шаге, фонарь покачивается; прыжок — высокой дугой. */
  private walkTo(cells: GameState['road'], dur: number, jump: boolean) {
    this.lumoTween?.stop();
    this.lumoIdx = cells[cells.length - 1].idx;
    const each = dur / cells.length;
    const s = this.cell;
    const tweens = cells.map((r, i) => {
      const p = this.lumoAt(r.idx, r.dirOut);
      const from = { x: this.lumo.x, y: this.lumo.y };
      const prog = { k: 0 };
      return {
        targets: prog,
        k: 1,
        duration: each,
        ease: 'Sine.inOut',
        onStart: () => {
          from.x = this.lumo.x;
          from.y = this.lumo.y;
          this.face(r.dirIn);
          if (jump && this.sound) sfx.jump();
        },
        onUpdate: () => {
          const k = prog.k;
          const hop = Math.sin(k * Math.PI) * s * (jump ? 0.55 : 0.12);
          this.lumo.x = from.x + (p.x - from.x) * k;
          this.lumo.y = from.y + (p.y - from.y) * k - hop;
          // Фонарь покачивается в такт шагу.
          this.lumo.angle = Math.sin(k * Math.PI * 2) * (jump ? 10 : 7);
          if (jump) this.lumo.setScale(Math.sign(this.lumo.scaleX || 1) * (1 + Math.sin(k * Math.PI) * 0.18), 1 + Math.sin(k * Math.PI) * 0.18);
        },
        onComplete: () => {
          this.lumo.angle = 0;
          this.lumo.setScale(Math.sign(this.lumo.scaleX || 1), 1);
          this.face(r.dirOut);
          // Свет дошёл до клетки: искры, мягкое «бум» и лёгкая вибрация шага.
          const c = this.center(r.idx);
          this.dust.explode(jump ? 10 : 6, c.x, c.y + s * 0.2);
          this.flash(c.x, c.y, s * 2.4);
          if (this.sound) {
            sfx.thump();
            sfx.footstep(i);
          }
        },
      };
    });
    this.lumoTween = this.scene.tweens.chain({ tweens });
  }

  /** Серия ходов без отмен: искры бегут по последним клеткам дороги. */
  sparkle(state: GameState, n: number) {
    const cells = state.road.slice(-Math.min(state.road.length, 2 + n));
    cells.forEach((r, i) => {
      const c = this.center(r.idx);
      this.scene.time.delayedCall(i * 60, () => this.sparks.explode(3 + Math.min(n, 6), c.x, c.y));
    });
  }

  private drawRoad(pts: (RoadPt & { bridge: boolean; dirIn: Dir })[], upTo: number) {
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
    // Дорога — лента света: широкое мягкое сияние, тёплая полоса и яркая сердцевина.
    this.polyline(g, pts, upTo, s * 0.8, C.roadGlow, 0.07);
    this.polyline(g, pts, upTo, s * 0.52, C.roadGlow, 0.16);
    this.polyline(g, pts, upTo, s * 0.3, C.road, 0.95);
    this.polyline(g, pts, upTo, s * 0.11, C.roadCore, 0.85);
    this.motes(g, pts, upTo);
    // Пока свет растекается — на его краю горит яркий огонёк.
    const full = Math.floor(upTo);
    const frac = upTo - full;
    if (frac > 0.01 && full + 1 < pts.length && !pts[full + 1].jump) {
      const a = pts[full];
      const b = pts[full + 1];
      const x = a.x + (b.x - a.x) * frac;
      const y = a.y + (b.y - a.y) * frac;
      g.fillStyle(C.roadGlow, 0.35);
      g.fillCircle(x, y, s * 0.26);
      g.fillStyle(C.roadCore, 1);
      g.fillCircle(x, y, s * 0.11);
    }
  }

  /** Искорки света вдоль дороги (неподвижные, разной яркости). */
  private motes(g: Phaser.GameObjects.Graphics, pts: RoadPt[], upTo: number) {
    const s = this.cell;
    for (let i = 0; i < pts.length - 1; i++) {
      const b = pts[i + 1];
      if (b.jump || i >= upTo) continue;
      const a = pts[i];
      const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      const nx = -(b.y - a.y) / len;
      const ny = (b.x - a.x) / len;
      for (let k = 0; k < 4; k++) {
        const t = (k + hash(i, k)) / 4;
        if (i + t > upTo) break;
        const off = (hash(k, i * 5) - 0.5) * s * 0.5;
        g.fillStyle(C.roadCore, 0.35 + hash(i * 3, k) * 0.5);
        g.fillCircle(a.x + (b.x - a.x) * t + nx * off, a.y + (b.y - a.y) * t + ny * off, s * (0.015 + hash(i, k * 7) * 0.02));
      }
    }
  }

  /** Линия через точки; к точке с jump — пунктирная дуга (прыжок над клеткой). edgeCaps — круглые стыки. */
  private polyline(g: Phaser.GameObjects.Graphics, pts: RoadPt[], upTo: number, lw: number, color: number, alpha: number, solidOnly = false) {
    g.lineStyle(lw, color, alpha);
    g.fillStyle(color, alpha);
    const seg = (i: number, frac: number) => {
      const a = pts[i];
      const b = pts[i + 1];
      if (b.jump) {
        if (!solidOnly) this.jumpArc(g, a, b, frac, lw, color, alpha);
        else this.jumpArc(g, a, b, frac, lw * 0.5, color, alpha);
        return;
      }
      const x = a.x + (b.x - a.x) * frac;
      const y = a.y + (b.y - a.y) * frac;
      g.lineBetween(a.x, a.y, x, y);
      g.fillCircle(x, y, lw / 2);
    };
    const full = Math.floor(upTo);
    for (let i = 0; i <= full && i < pts.length; i++) g.fillCircle(pts[i].x, pts[i].y, lw / 2);
    for (let i = 0; i < full && i < pts.length - 1; i++) seg(i, 1);
    const frac = upTo - full;
    if (frac > 0 && full + 1 < pts.length) seg(full, frac);
  }

  /** Дуга прыжка: точки по параболе, выгнутой влево от направления движения. */
  private jumpArc(g: Phaser.GameObjects.Graphics, a: RoadPt, b: RoadPt, frac: number, lw: number, color: number, alpha: number) {
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const nx = (b.y - a.y) / len;
    const ny = -(b.x - a.x) / len;
    const n = 9;
    const r = Math.min(lw * 0.32, this.cell * 0.09);
    for (let k = 1; k < n; k++) {
      const t = k / n;
      if (t > frac) break;
      const lift = Math.sin(t * Math.PI) * this.cell * 0.42;
      const x = a.x + (b.x - a.x) * t + nx * lift;
      const y = a.y + (b.y - a.y) * t + ny * lift;
      g.fillStyle(color, alpha);
      g.fillCircle(x, y, r * (0.7 + Math.sin(t * Math.PI) * 0.5));
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
    const pts: RoadPt[] = [head, ...p.cells.map((c, i) => ({ ...this.center(c.idx), jump: p.kind === 'jump' && i === 0 }))];
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
    if (p.jumped) {
      // Клетка, над которой пролетит прыжок: пунктирный кружок (фонарь здесь не зажжётся).
      const jc = this.center(p.jumped.idx);
      g.lineStyle(s * 0.03, color, alpha * 0.9);
      for (let k = 0; k < 8; k++) {
        const a0 = (k / 8) * Math.PI * 2;
        g.beginPath();
        g.arc(jc.x, jc.y, s * 0.3, a0, a0 + Math.PI / 8, false);
        g.strokePath();
      }
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
      let onRoad = state.onRoad[l.idx];
      if (l.badge) {
        // Гаснущий фонарь: число — сколько ходов ещё горит; погас — снова не зажжён.
        // На победе (последняя плитка вошла в арку, пока фонарь горел) он так и остаётся гореть — с галочкой.
        const won = state.status === 'won' && onRoad;
        const left = won ? 1 : fadeLeftAt(state, l.idx);
        const n = won ? '✓' : String(left < 0 ? this.level.fade[l.idx] : left);
        if (l.badgeText!.text !== n) {
          l.badgeText!.setText(n);
          this.scene.tweens.add({ targets: l.badge, scale: { from: 1.35, to: 1 }, duration: 300, ease: 'Back.out' });
        }
        this.drawBadge(l, left < 0 ? 'off' : left === 0 ? 'out' : left === 1 && !won ? 'last' : 'on');
        if (onRoad && left === 0) {
          if (l.state !== 'out') {
            l.state = 'out';
            this.drawLamp(l.lamp, false);
            this.scene.tweens.killTweensOf(l.glow);
            l.glow.setAlpha(0);
            const c = this.center(l.idx);
            this.dust.explode(12, c.x, c.y - this.cell * 0.25);
            if (this.sound) sfx.fizzle();
          }
          continue;
        }
        if (l.state === 'out') l.state = 'off';
        onRoad = onRoad && left > 0;
      }
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
    if (!this.hasExit) return;
    // Число на замке — сколько фонарей ещё не зажжено.
    const left = lanternsLeft(state);
    if (this.lockText.text !== String(left)) {
      this.lockText.setText(String(left));
      if (this.lock.visible && left > 0) this.scene.tweens.add({ targets: this.lock, scale: { from: 1.3, to: 1 }, duration: 300, ease: 'Back.out' });
    }
    const open = left === 0;
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

  /**
   * Финал: по дороге от старта бежит волна света и зажигает фонари, затем Lumo входит в арку
   * (цель «светлячки» — радостно подпрыгивает, а светлячки кружат вокруг него).
   */
  walkLumo(state: GameState, onStep: (i: number) => void, onLantern: (n: number) => void, onDone: () => void) {
    this.headG.clear();
    this.ghostG.clear();
    this.hintG.clear();
    this.dropG.clear();
    this.highlightSide(null);
    this.scene.tweens.add({ targets: this.cone, alpha: 0, duration: 300 });
    const cells = state.road.slice(1);
    let litCount = 0;
    const stepDur = Phaser.Math.Clamp(1500 / cells.length, 70, 150);
    // Пусть Lumo сначала дошагает последнюю плитку.
    const startDelay = 320;
    this.won = true;
    // Свет возвращается: пока бежит волна и зажигаются фонари, ночная темнота рассеивается.
    if (this.dark) this.scene.tweens.add({ targets: this.dark, alpha: 0.12, duration: stepDur * cells.length + 600, ease: 'Sine.in' });
    cells.forEach((r, i) => {
      this.scene.time.delayedCall(startDelay + i * stepDur, () => {
        const c = this.center(r.idx);
        onStep(i);
        this.sparks.explode(2, c.x, c.y);
        this.flash(c.x, c.y, this.cell * 2.6, 500);
        const l = this.lanterns.find((v) => v.idx === r.idx);
        if (l && l.state !== 'out') {
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
      });
    });
    this.scene.time.delayedCall(startDelay + cells.length * stepDur + 100, () => {
      const e = this.center(state.head);
      this.burst.explode(30, e.x, e.y);
      raysBurst(this.scene, e.x, e.y, this.hasExit ? C.exitOpen : C.fireflyGlow, this.cell * 3);
      this.flash(e.x, e.y, this.cell * 6, 1200);
      if (this.hasExit) {
        this.scene.tweens.add({ targets: this.exitGlow, alpha: 1, scale: this.exitGlow.scale * 1.6, duration: 500 });
        this.scene.tweens.add({ targets: [this.portalRing, this.portalSwirl], scale: 1.2, duration: 400, yoyo: true });
        this.scene.tweens.add({ targets: this.lumo, alpha: 0, scale: 0.4, x: e.x, y: e.y - this.cell * 0.2, duration: 450, ease: 'Quad.in', onComplete: onDone });
        return;
      }
      // Цель «светлячки»: собранные светлячки слетаются к Lumo и кружат, Lumo подпрыгивает от радости.
      this.fireflies.forEach((f, i) => {
        f.view.setVisible(true).setAlpha(1).setScale(1);
        this.scene.tweens.killTweensOf(f.view);
        const a = (i / this.fireflies.length) * Math.PI * 2;
        this.scene.tweens.add({ targets: f.view, x: this.lumo.x + Math.cos(a) * this.cell * 0.6, y: this.lumo.y + Math.sin(a) * this.cell * 0.45, duration: 600, ease: 'Sine.out' });
      });
      this.scene.tweens.add({ targets: this.lumo, y: this.lumo.y - this.cell * 0.4, duration: 220, yoyo: true, repeat: 1, ease: 'Quad.out', onComplete: onDone });
    });
  }

  /** Лёгкая тряска поля, когда ход невозможен. */
  bump() {
    this.scene.cameras.main.shake(120, 0.003);
  }
}

/** Текстуры украшений поля (травинки и цветы) — рисуются один раз на всю игру. */
function createDecorTextures(scene: Phaser.Scene) {
  if (scene.textures.exists('tuft0')) return;
  const S = 64;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  const blade = (x: number, h: number, lean: number, w: number, color: number) => {
    g.fillStyle(color, 1);
    g.fillTriangle(x - w, S, x + w, S, x + lean, S - h);
  };
  const tufts: [number, number, number, number][][] = [
    [[26, 30, -8, 4], [32, 40, 2, 4], [38, 28, 9, 4]],
    [[22, 24, -10, 3.5], [29, 36, -3, 4], [35, 42, 4, 4], [42, 26, 10, 3.5]],
    [[28, 22, -6, 4], [34, 30, 6, 4]],
  ];
  tufts.forEach((bl, i) => {
    g.clear();
    for (const [x, h, lean, w] of bl) blade(x, h, lean, w, C.grassDark);
    for (const [x, h, lean, w] of bl) blade(x + 1, h * 0.8, lean * 0.8, w * 0.55, C.grass);
    g.generateTexture(`tuft${i}`, S, S);
  });
  const petals = [0xb79ac8, 0xc8d6e6, 0xd8c27a];
  petals.forEach((col, i) => {
    g.clear();
    g.lineStyle(3, C.grassDark, 1);
    g.lineBetween(32, S, 32 + (i - 1) * 3, 30);
    g.fillStyle(C.grass, 1);
    g.fillEllipse(26, 50, 10, 5);
    const cx = 32 + (i - 1) * 3;
    const cy = 26;
    g.fillStyle(col, 1);
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2;
      g.fillCircle(cx + Math.cos(a) * 6, cy + Math.sin(a) * 6, 5);
    }
    g.fillStyle(i === 2 ? 0xc0602a : 0xffc93a, 1);
    g.fillCircle(cx, cy, 4);
    g.generateTexture(`flower${i}`, S, S);
  });
  g.destroy();
}
