// Сцена «Lumo поднимается в горы» (~7,5 с, пропуск тапом): Lumo с фонарём идёт по серпантину вверх по
// заснеженному склону к перевалу между снежными пиками; по пути загораются снежные фонарики-вешки, идёт снег,
// в небе разгорается северное сияние; сверху — название мира и одна фраза. Всё нарисовано кодом.
// Показывается один раз, когда «Ледяные вершины» открылись (MenuScene), потом — карта на уровне 61.

import Phaser from 'phaser';
import { setMusicMood, sfx } from '../audio';
import { t, tk } from '../i18n';
import { LEVELS, worldById } from '../levels/index';
import { markWorldEntered } from '../storage';
import { addBackground, createLumo, paintPeaks } from '../ui/draw';
import { raysBurst, reducedMotion } from '../ui/fx';
import type { LumoFigure } from '../ui/lumo';
import { currentLook } from '../ui/skins';
import { addAurora, addSnowfall } from '../ui/snow';
import { C, H, W } from '../ui/theme';
import { uiText } from '../ui/UIText';
import { currentView } from '../ui/viewport';

/** Перевал (куда уходит тропинка) и линия снежного склона. */
const PASS_X = 560;
const PASS_Y = 900;
const DURATION = 7500;

export class PeaksIntroScene extends Phaser.Scene {
  private finished = false;
  private lumo!: LumoFigure;
  private lamp!: Phaser.GameObjects.Image;

  constructor() {
    super('PeaksIntro');
  }

  /** hold — для проверки вёрстки (?audit=1): сцена не заканчивается сама и не пропускается. */
  create(data: { hold?: boolean } = {}) {
    this.finished = false;
    // Проверка вёрстки: сценарий проматывается быстро — к скриншоту текст уже виден, сияние разгорелось.
    this.tweens.timeScale = data.hold ? 6 : 1;
    addBackground(this, { dust: false });
    setMusicMood('peaks');
    const v = currentView(this);
    const calm = reducedMotion();

    // Небо: глубокая синяя ночь, к перевалу светлее.
    const sky = this.add.graphics().setDepth(0);
    sky.fillGradientStyle(0x050b20, 0x050b20, 0x1d3a66, 0x1d3a66, 1);
    sky.fillRect(v.x - 10, v.y - 10, v.w + 20, PASS_Y + 200 - v.y);
    const rnd = new Phaser.Math.RandomDataGenerator(['peaks-intro']);
    for (let n = 0; n < 50; n++) {
      sky.fillStyle(0xffffff, rnd.realInRange(0.2, 0.7));
      sky.fillCircle(rnd.between(v.x, v.x + v.w), rnd.between(v.y, PASS_Y - 200), rnd.realInRange(1.5, 3.5));
    }
    // Северное сияние — сначала тусклое, разгорается.
    const aurora = addAurora(this, { x: v.x, y: v.y + 80, w: v.w, h: PASS_Y - v.y }, { depth: 1, alpha: 1.2, seed: 'peaks-intro' });
    aurora.objects.forEach((g) => g.setAlpha(0.15));

    // Дальние пики (с шапками) и ближняя гора с перевалом посередине.
    const far = this.add.graphics().setDepth(2);
    paintPeaks(far, v.x, v.w, PASS_Y + 120, 620, 0x2a4a7a, 0xe6f0ff, 0.42, 'peaks-intro-far');
    const near = this.add.graphics().setDepth(3);
    // Два больших пика по бокам перевала.
    for (const [cx, top, half] of [
      [PASS_X - 430, PASS_Y - 560, 520],
      [PASS_X + 450, PASS_Y - 480, 500],
    ] as const) {
      near.fillStyle(0x1b3560, 1);
      near.fillTriangle(cx - half, PASS_Y + 260, cx + half, PASS_Y + 260, cx, top);
      near.fillStyle(0xeef5ff, 1);
      near.fillTriangle(cx - half * 0.38, top + (PASS_Y + 260 - top) * 0.38, cx + half * 0.38, top + (PASS_Y + 260 - top) * 0.38, cx, top);
      near.fillStyle(0x000000, 0.2);
      near.fillTriangle(cx, top, cx + half, PASS_Y + 260, cx + half * 0.3, PASS_Y + 260);
    }
    const gate = this.add.image(PASS_X, PASS_Y - 40, 'glow').setTint(0x9fe8ff).setBlendMode(Phaser.BlendModes.ADD).setScale(3, 2.4).setAlpha(0.15).setDepth(3);

    // Снежный склон: от перевала вниз светлеет; по нему — серпантин.
    const ground = this.add.graphics().setDepth(4);
    ground.fillGradientStyle(0x9ab8dc, 0x9ab8dc, 0xdfeaf8, 0xdfeaf8, 1);
    ground.fillRect(v.x - 10, PASS_Y + 40, v.w + 20, v.y + v.h - PASS_Y + 10);
    // Мягкие сугробы-тени поперёк склона.
    ground.fillStyle(0x7f9ec8, 0.25);
    for (let n = 0; n < 7; n++) ground.fillEllipse(rnd.between(v.x, v.x + v.w), rnd.between(PASS_Y + 120, Math.min(H, v.y + v.h)), rnd.between(300, 600), rnd.between(30, 60));
    // Серпантин: проходы по склону от края до края с крутыми поворотами, вверху — уже (уходит вдаль).
    const bottom = Math.max(H + 60, v.y + v.h + 60);
    const path = new Phaser.Curves.Spline([
      new Phaser.Math.Vector2(180, bottom),
      new Phaser.Math.Vector2(300, 1700),
      new Phaser.Math.Vector2(820, 1560),
      new Phaser.Math.Vector2(860, 1450),
      new Phaser.Math.Vector2(300, 1310),
      new Phaser.Math.Vector2(260, 1210),
      new Phaser.Math.Vector2(740, 1090),
      new Phaser.Math.Vector2(760, 1010),
      new Phaser.Math.Vector2(PASS_X, PASS_Y + 30),
    ]);
    const pts = path.getSpacedPoints(120);
    for (let i = 0; i < pts.length - 1; i++) {
      const k = 1 - i / pts.length;
      ground.lineStyle(26 + 74 * k, 0x6f8fbf, 0.5);
      ground.lineBetween(pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y);
      ground.lineStyle(10 + 40 * k, 0xf4f8ff, 0.8);
      ground.lineBetween(pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y);
    }
    // Ели в снегу по краям склона.
    const trees = this.add.graphics().setDepth(5);
    for (let n = 0; n < 16; n++) {
      const x = n % 2 ? rnd.between(v.x, v.x + 160) : rnd.between(v.x + v.w - 160, v.x + v.w);
      const y = rnd.between(PASS_Y + 140, Math.min(H + 100, v.y + v.h));
      const s = 0.6 + ((y - PASS_Y) / (H - PASS_Y)) * 1.2;
      this.snowySpruce(trees, x, y, s);
    }

    // Вешки с огоньками вдоль серпантина — загораются, когда Lumo проходит мимо.
    const poles: { g: Phaser.GameObjects.Graphics; glow: Phaser.GameObjects.Image; at: number }[] = [];
    for (let i = 0; i < 9; i++) {
      const u = 0.12 + i * 0.095;
      const p = path.getPointAt(u);
      const tan = path.getTangentAt(u);
      const side = i % 2 ? 1 : -1;
      const s = 1.4 - u * 0.9;
      const x = p.x - tan.y * (60 + 40 * s) * side;
      const y = p.y + tan.x * (60 + 40 * s) * side;
      const g = this.add.graphics().setDepth(6).setPosition(x, y).setAlpha(0.45);
      g.fillStyle(0x3a2a1a, 1);
      g.fillRect(-4 * s, -60 * s, 8 * s, 60 * s);
      g.fillStyle(0xd84a3a, 1);
      for (let k = 0; k < 3; k++) g.fillRect(-4 * s, -56 * s + k * 18 * s, 8 * s, 8 * s);
      g.fillStyle(0xfff1c8, 1);
      g.fillCircle(0, -66 * s, 8 * s);
      const glow = this.add.image(x, y - 66 * s, 'glow').setTint(C.lanternOn).setBlendMode(Phaser.BlendModes.ADD).setScale(1.1 * s).setAlpha(0).setDepth(6);
      poles.push({ g, glow, at: u });
    }

    // Lumo с фонарём и пятно света вокруг.
    const start = path.getPointAt(0.04);
    this.lamp = this.add.image(start.x, start.y - 60, 'glow').setTint(C.lanternOn).setBlendMode(Phaser.BlendModes.ADD).setScale(5, 3.4).setAlpha(0.35).setDepth(7);
    this.lumo = createLumo(this, 200, currentLook()).setPosition(start.x, start.y).setDepth(8);
    this.lumo.face(1);

    // Снегопад поверх всего (гуще, чем фон карты).
    addSnowfall(this, { x: v.x, y: v.y, w: v.w, h: v.h }, { depth: 9, density: 2.5, wind: 30 });

    // Название мира и фраза.
    const title = uiText(this, W / 2, 300, tk('world.peaks'), { w: W - 160, size: 84, color: '#e6f6ff', lines: 1 }).setDepth(30).setAlpha(0);
    title.setShadow(0, 0, '#7fd8ff', 28, true, true);
    const line = uiText(this, W / 2, 450, t('peaks_intro_text'), { w: W - 160, size: 50, color: C.text, lines: 2 }).setDepth(30).setAlpha(0);
    line.setShadow(0, 0, '#000000', 14, true, true);
    if (!data.hold) uiText(this, W - 40, H - 70, t('intro_skip'), { w: 520, size: 36, color: C.textDim, bold: false, originX: 1, align: 'right' }).setDepth(30).setAlpha(0.7);

    if (data.hold) {
      title.setAlpha(1);
      line.setAlpha(1);
    } else {
      this.tweens.add({ targets: title, alpha: 1, duration: 900, delay: 500 });
      this.tweens.add({ targets: line, alpha: 1, duration: 900, delay: 2600 });
    }
    // Lumo поднимается по серпантину и уменьшается (уходит вдаль, к перевалу).
    const walk = { u: 0.04 };
    this.lumo.walk(true);
    let step = 0;
    this.tweens.add({
      targets: walk,
      u: 0.98,
      duration: 6000,
      delay: 300,
      ease: 'Sine.inOut',
      onUpdate: () => {
        const p = path.getPointAt(walk.u);
        const tan = path.getTangentAt(walk.u);
        this.lumo.setPosition(p.x, p.y).setScale(1.1 - walk.u * 0.75);
        this.lumo.face(tan.x >= 0 ? 1 : -1);
        this.lamp.setPosition(p.x, p.y - 60 * this.lumo.scale).setScale(5 * this.lumo.scale, 3.4 * this.lumo.scale);
        for (const m of poles) {
          if (m.at > walk.u + 0.03 || m.g.getData('lit')) continue;
          m.g.setData('lit', true);
          sfx.step(step++);
          this.tweens.add({ targets: m.g, alpha: 1, duration: 400 });
          this.tweens.add({ targets: m.glow, alpha: 0.8, duration: 500 });
          if (!calm) this.tweens.add({ targets: m.glow, alpha: 0.45, duration: 1300, delay: 600, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
        }
      },
      onComplete: () => {
        this.lumo.walk(false);
        this.tweens.add({ targets: [this.lumo, this.lamp], alpha: 0, duration: 500 });
      },
    });
    this.at(2200, () => {
      // Фонарь вспыхивает — в небе разгорается северное сияние.
      sfx.lantern(2);
      aurora.objects.forEach((g, i) => this.tweens.add({ targets: g, alpha: 1, duration: 2400, delay: i * 300, ease: 'Sine.inOut' }));
      this.tweens.add({ targets: gate, alpha: 0.4, duration: 2400 });
    });
    this.at(5800, () => {
      sfx.lantern(4);
      raysBurst(this, PASS_X, PASS_Y - 40, 0x9fe8ff, 220, 2.5);
    });
    if (data.hold) {
      aurora.objects.forEach((g) => g.setAlpha(1));
      return;
    }
    this.at(DURATION, () => this.finish());
    // Тап или клавиша — пропустить.
    this.input.once('pointerdown', () => this.finish());
    this.input.keyboard?.once('keydown', () => this.finish());
  }

  private at(ms: number, fn: () => void) {
    this.tweens.addCounter({ from: 0, to: 1, duration: ms, onComplete: fn });
  }

  /** Ель в снегу: тёмные ярусы с белыми «шапками» по краям, основание в (x, y). */
  private snowySpruce(g: Phaser.GameObjects.Graphics, x: number, y: number, s: number) {
    g.fillStyle(0x000000, 0.12);
    g.fillEllipse(x, y + 4 * s, 90 * s, 18 * s);
    g.fillStyle(0x2a1c12, 1);
    g.fillRect(x - 6 * s, y - 18 * s, 12 * s, 18 * s);
    for (let k = 0; k < 3; k++) {
      const w = (52 - k * 12) * s;
      const by = y - 14 * s - k * 38 * s;
      const top = by - (70 - k * 6) * s;
      g.fillStyle(0x16353f, 1);
      g.fillTriangle(x - w, by, x + w, by, x, top);
      g.fillStyle(0xf2f7ff, 1);
      g.fillTriangle(x - w * 0.42, top + (by - top) * 0.42, x + w * 0.42, top + (by - top) * 0.42, x, top);
      g.fillTriangle(x - w, by, x - w * 0.4, by, x - w * 0.75, by - 8 * s);
      g.fillTriangle(x + w * 0.4, by, x + w, by, x + w * 0.75, by - 8 * s);
    }
  }

  private finish() {
    if (this.finished) return;
    this.finished = true;
    // Отмечаем сразу: если приложение закроют во время затемнения, сцена не покажется снова.
    markWorldEntered('peaks');
    const first = worldById('peaks')?.levels[0];
    const focus = first ? LEVELS.indexOf(first) : undefined;
    this.cameras.main.fadeOut(400, 4, 8, 20);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('Menu', { focus }));
  }
}
