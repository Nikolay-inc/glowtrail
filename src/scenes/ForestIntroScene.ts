// Сцена «Lumo входит в лес» (~7 с, пропуск тапом): Lumo с фонарём идёт по тропинке из долины к стене тёмных
// елей, туман расступается, вдоль тропинки загораются грибы, вылетают светлячки; сверху — название мира и одна
// фраза. Всё нарисовано кодом. Показывается один раз, когда лес открылся (MenuScene), потом — карта на уровне 31.

import Phaser from 'phaser';
import { setMusicMood, sfx } from '../audio';
import { t, tk } from '../i18n';
import { LEVELS, worldById } from '../levels/index';
import { markWorldEntered } from '../storage';
import { addBackground, createLumo } from '../ui/draw';
import { raysBurst, reducedMotion } from '../ui/fx';
import type { LumoFigure } from '../ui/lumo';
import { currentLook } from '../ui/skins';
import { C, H, W } from '../ui/theme';
import { uiText } from '../ui/UIText';
import { currentView } from '../ui/viewport';

/** Где стена леса (низ елей) и проём, в который уходит тропинка. */
const WALL_Y = 1120;
const GATE_X = 560;
const DURATION = 7200;

export class ForestIntroScene extends Phaser.Scene {
  private finished = false;
  private lumo!: LumoFigure;
  private lamp!: Phaser.GameObjects.Image;

  constructor() {
    super('ForestIntro');
  }

  /** hold — для проверки вёрстки (?audit=1): сцена не заканчивается сама и не пропускается. */
  create(data: { hold?: boolean } = {}) {
    this.finished = false;
    // Проверка вёрстки: сценарий проматывается быстро — к скриншоту текст уже виден, туман расступился.
    this.tweens.timeScale = data.hold ? 6 : 1;
    addBackground(this, { dust: false });
    setMusicMood('forest');
    const v = currentView(this);
    const calm = reducedMotion();

    // Небо и луна.
    const sky = this.add.graphics().setDepth(0);
    sky.fillGradientStyle(0x0a0a22, 0x0a0a22, 0x1d1a48, 0x1d1a48, 1);
    sky.fillRect(v.x - 10, v.y - 10, v.w + 20, WALL_Y - v.y + 10);
    this.add.image(830, 560, 'glow').setTint(0x9fb4ff).setBlendMode(Phaser.BlendModes.ADD).setScale(3).setAlpha(0.25).setDepth(0);
    sky.fillStyle(0xdfe6ff, 0.9);
    sky.fillCircle(830, 560, 46);
    sky.fillStyle(0x1d1a48, 0.9);
    sky.fillCircle(850, 548, 40);

    // Дальние холмы с гребнем елей и стена леса (два ряда), в середине — проём.
    const back = this.add.graphics().setDepth(1);
    back.fillStyle(0x1b2246, 1);
    back.fillEllipse(200, WALL_Y - 60, 1100, 380);
    back.fillEllipse(960, WALL_Y - 80, 1200, 420);
    const rnd = new Phaser.Math.RandomDataGenerator(['forest-intro']);
    const wall = this.add.graphics().setDepth(3);
    for (const [row, color, base, hMin, hMax] of [
      [0, 0x0c1f28, WALL_Y - 40, 300, 440],
      [1, 0x06121a, WALL_Y + 10, 340, 520],
    ] as const) {
      for (let x = v.x - 80; x < v.x + v.w + 80; x += rnd.between(70, 110)) {
        if (Math.abs(x - GATE_X) < 170 + row * 20) continue;
        this.spruce(wall, x, base + rnd.between(-20, 20), rnd.between(hMin, hMax), color);
      }
    }
    // Свод над проёмом.
    wall.fillStyle(0x06121a, 1);
    for (let a = 200; a <= 340; a += 8) {
      const rad = Phaser.Math.DegToRad(a);
      wall.fillCircle(GATE_X + Math.cos(rad) * 150, WALL_Y - 120 + Math.sin(rad) * 170, 40);
    }
    const gate = this.add.image(GATE_X, WALL_Y - 110, 'glow').setTint(0x5ad6c8).setBlendMode(Phaser.BlendModes.ADD).setScale(2.6, 3).setAlpha(0.12).setDepth(2);

    // Луг долины и тропинка к проёму (дальше — уже).
    const ground = this.add.graphics().setDepth(4);
    ground.fillGradientStyle(0x142e3a, 0x142e3a, 0x1f3a4e, 0x1f3a4e, 1);
    ground.fillRect(v.x - 10, WALL_Y, v.w + 20, v.y + v.h - WALL_Y + 10);
    const curve = new Phaser.Curves.CubicBezier(
      new Phaser.Math.Vector2(160, Math.max(H + 60, v.y + v.h + 60)),
      new Phaser.Math.Vector2(260, 1500),
      new Phaser.Math.Vector2(760, 1420),
      new Phaser.Math.Vector2(GATE_X, WALL_Y - 10),
    );
    const pts = curve.getSpacedPoints(60);
    for (let i = 0; i < pts.length - 1; i++) {
      const k = 1 - i / pts.length;
      ground.lineStyle(30 + 70 * k, 0x6e6280, 0.6);
      ground.lineBetween(pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y);
    }
    // Трава по краям тропинки.
    ground.lineStyle(4, 0x2f5a52, 0.8);
    for (let n = 0; n < 70; n++) {
      const x = rnd.between(v.x, v.x + v.w);
      const y = rnd.between(WALL_Y + 40, Math.min(H, v.y + v.h));
      ground.lineBetween(x, y, x + rnd.between(-8, 8), y - rnd.between(14, 30));
    }

    // Грибы вдоль тропинки — сначала тусклые, загораются, когда Lumo проходит мимо.
    const mushrooms: { g: Phaser.GameObjects.Graphics; glow: Phaser.GameObjects.Image; at: number }[] = [];
    for (let i = 0; i < 9; i++) {
      const u = 0.34 + i * 0.075;
      const p = curve.getPointAt(u);
      const tan = curve.getTangentAt(u);
      const side = i % 2 ? 1 : -1;
      const s = 1.5 - u * 0.9;
      const x = p.x - tan.y * (70 + 40 * s) * side;
      const y = p.y + tan.x * (70 + 40 * s) * side;
      const color = i % 3 === 1 ? 0xb48cff : 0x5ad6c8;
      const g = this.add.graphics().setDepth(5).setPosition(x, y).setAlpha(0.3);
      g.fillStyle(0xe8e0f4, 1);
      g.fillRoundedRect(-6 * s, -24 * s, 12 * s, 24 * s, 4 * s);
      g.fillStyle(color, 1);
      g.slice(0, -22 * s, 22 * s, Math.PI, 0, false);
      g.fillPath();
      g.fillStyle(0xffffff, 0.8);
      g.fillCircle(-8 * s, -32 * s, 3 * s);
      g.fillCircle(6 * s, -36 * s, 2.5 * s);
      const glow = this.add.image(x, y - 24 * s, 'glow').setTint(color).setBlendMode(Phaser.BlendModes.ADD).setScale(1.2 * s).setAlpha(0).setDepth(5);
      mushrooms.push({ g, glow, at: u });
    }

    // Lumo с фонарём и пятно света вокруг.
    const start = curve.getPointAt(0.08);
    this.lamp = this.add.image(start.x, start.y - 60, 'glow').setTint(C.lanternOn).setBlendMode(Phaser.BlendModes.ADD).setScale(5, 3.4).setAlpha(0.35).setDepth(6);
    this.lumo = createLumo(this, 200, currentLook()).setPosition(start.x, start.y).setDepth(7);
    this.lumo.face(1);

    // Туман над стеной леса — расступается.
    const fog: Phaser.GameObjects.Image[] = [];
    for (let n = 0; n < 8; n++) {
      const x = v.x + (n + 0.5) * (v.w / 8) + rnd.between(-40, 40);
      fog.push(
        this.add
          .image(x, WALL_Y - 140 + rnd.between(-120, 120), 'glow')
          .setTint(0xb0c0ec)
          .setScale(rnd.realInRange(5, 7), rnd.realInRange(2.6, 3.6))
          .setAlpha(0.55)
          .setDepth(8),
      );
    }

    // Название мира и фраза.
    const title = uiText(this, W / 2, 300, tk('world.forest'), { w: W - 160, size: 84, color: '#c8fff4', lines: 1 }).setDepth(30).setAlpha(0);
    title.setShadow(0, 0, '#5ad6c8', 28, true, true);
    const line = uiText(this, W / 2, 450, t('forest_intro_text'), { w: W - 160, size: 50, color: C.text, lines: 2 }).setDepth(30).setAlpha(0);
    line.setShadow(0, 0, '#000000', 14, true, true);
    if (!data.hold) uiText(this, W - 40, H - 70, t('intro_skip'), { w: 520, size: 36, color: C.textDim, bold: false, originX: 1, align: 'right' }).setDepth(30).setAlpha(0.7);

    // Сценарий (на анимациях Phaser — шаги не расходятся с движением, если первый кадр подвиснет).
    if (data.hold) {
      title.setAlpha(1);
      line.setAlpha(1);
    } else {
      this.tweens.add({ targets: title, alpha: 1, duration: 900, delay: 500 });
      this.tweens.add({ targets: line, alpha: 1, duration: 900, delay: 2600 });
    }
    // Lumo идёт по тропинке и уменьшается (уходит вдаль).
    const walk = { u: 0.08 };
    this.lumo.walk(true);
    let step = 0;
    this.tweens.add({
      targets: walk,
      u: 0.97,
      duration: 5600,
      delay: 300,
      ease: 'Sine.inOut',
      onUpdate: () => {
        const p = curve.getPointAt(walk.u);
        const tan = curve.getTangentAt(walk.u);
        this.lumo.setPosition(p.x, p.y).setScale(1.15 - walk.u * 0.75);
        this.lumo.face(tan.x >= 0 ? 1 : -1);
        this.lamp.setPosition(p.x, p.y - 60 * this.lumo.scale).setScale(5 * this.lumo.scale, 3.4 * this.lumo.scale);
        for (const m of mushrooms) {
          if (m.at > walk.u + 0.04 || m.g.getData('lit')) continue;
          m.g.setData('lit', true);
          sfx.step(step++);
          this.tweens.add({ targets: m.g, alpha: 1, duration: 400 });
          this.tweens.add({ targets: m.glow, alpha: 0.7, duration: 500 });
          if (!calm) this.tweens.add({ targets: m.glow, alpha: 0.4, duration: 1400, delay: 600, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
        }
      },
      onComplete: () => {
        this.lumo.walk(false);
        this.tweens.add({ targets: [this.lumo, this.lamp], alpha: 0, duration: 500 });
      },
    });
    this.at(2000, () => {
      // Фонарь вспыхивает — туман расступается к краям.
      sfx.lantern(2);
      fog.forEach((f) => this.tweens.add({ targets: f, x: f.x + (f.x < GATE_X ? -520 : 520), alpha: 0.12, duration: 2600, ease: 'Sine.inOut' }));
      this.tweens.add({ targets: gate, alpha: 0.45, duration: 2400 });
    });
    this.at(3600, () => {
      // Светлячки вылетают из леса.
      for (let n = 0; n < 16; n++) {
        const x = GATE_X + rnd.between(-420, 420);
        const y = WALL_Y - rnd.between(-60, 420);
        const ff = this.add.image(x, y, 'glow').setTint(C.fireflyGlow).setBlendMode(Phaser.BlendModes.ADD).setScale(0.35).setAlpha(0).setDepth(9);
        this.tweens.add({ targets: ff, alpha: 0.9, duration: 500, delay: n * 70 });
        if (!calm) this.tweens.add({ targets: ff, x: x + rnd.between(-90, 90), y: y + rnd.between(-90, 60), duration: rnd.between(1600, 2600), yoyo: true, repeat: -1, ease: 'Sine.inOut' });
      }
    });
    this.at(5400, () => {
      sfx.lantern(4);
      raysBurst(this, GATE_X, WALL_Y - 110, 0x5ad6c8, 220, 2.5);
    });
    if (data.hold) return;
    this.at(DURATION, () => this.finish());
    // Тап или клавиша — пропустить.
    this.input.once('pointerdown', () => this.finish());
    this.input.keyboard?.once('keydown', () => this.finish());
  }

  private at(ms: number, fn: () => void) {
    this.tweens.addCounter({ from: 0, to: 1, duration: ms, onComplete: fn });
  }

  /** Ель-силуэт высотой h, основание в (x, y). */
  private spruce(g: Phaser.GameObjects.Graphics, x: number, y: number, h: number, color: number) {
    g.fillStyle(color, 1);
    const w = h * 0.36;
    for (let k = 0; k < 4; k++) {
      const by = y - k * h * 0.22;
      const ww = w * (1 - k * 0.2);
      g.fillTriangle(x - ww, by, x + ww, by, x, by - h * 0.42);
    }
  }

  private finish() {
    if (this.finished) return;
    this.finished = true;
    // Отмечаем сразу: если приложение закроют во время затемнения, сцена не покажется снова.
    markWorldEntered('forest');
    const first = worldById('forest')?.levels[0];
    const focus = first ? LEVELS.indexOf(first) : undefined;
    this.cameras.main.fadeOut(400, 2, 3, 12);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('Menu', { focus }));
  }
}
