// Вступление при первом запуске (~12 с): тёмная долина, Lumo входит и зажигает фонарь,
// свет пробегает по камням тропинки, вдалеке разгорается арка. Две короткие фразы. Тап — пропустить.

import Phaser from 'phaser';
import { sfx } from '../audio';
import { getProfile } from '../profile';
import { t } from '../strings';
import { logTutorialStep } from '../tutorial';
import { addBackground, createLumo, drawPortalIcon, text } from '../ui/draw';
import { raysBurst } from '../ui/fx';
import { C, H, W } from '../ui/theme';

const LUMO_AT = { x: 250, y: 1330 };
const ARCH_AT = { x: 820, y: 760 };

export class IntroScene extends Phaser.Scene {
  private dark!: Phaser.GameObjects.RenderTexture;
  private lightImg!: Phaser.GameObjects.Image;
  private lumo!: Phaser.GameObjects.Container;
  private lumoLight = 0.25; // радиус света фонаря (в долях экрана)
  private stones: { x: number; y: number; lit: number }[] = [];
  private archLight = 0;
  private finished = false;

  constructor() {
    super('Intro');
  }

  create() {
    this.finished = false;
    this.lumoLight = 0.25;
    this.archLight = 0;
    addBackground(this, { dust: true });
    logTutorialStep('intro_start');
    this.drawValley();

    // Тропинка из камней от Lumo к арке (кривая Безье).
    const curve = new Phaser.Curves.CubicBezier(
      new Phaser.Math.Vector2(LUMO_AT.x + 90, LUMO_AT.y + 30),
      new Phaser.Math.Vector2(560, 1420),
      new Phaser.Math.Vector2(520, 960),
      new Phaser.Math.Vector2(ARCH_AT.x - 40, ARCH_AT.y + 90),
    );
    const g = this.add.graphics().setDepth(5);
    this.stones = curve.getSpacedPoints(11).slice(0, 11).map((p, i) => {
      const k = 1 - i * 0.05; // дальше — меньше
      g.fillStyle(0x3a3f66, 1);
      g.fillEllipse(p.x, p.y, 46 * k, 22 * k);
      g.fillStyle(0x59609a, 1);
      g.fillEllipse(p.x - 4, p.y - 4, 30 * k, 12 * k);
      return { x: p.x, y: p.y, lit: 0 };
    });

    // Арка на холме — пока тёмная.
    const arch = this.add.graphics().setDepth(6).setAlpha(0);
    drawPortalIcon(arch, 0, 0, 46, true);
    arch.setPosition(ARCH_AT.x, ARCH_AT.y);

    this.lumo = createLumo(this, 190, getProfile().avatar).setPosition(-140, LUMO_AT.y).setDepth(7);

    // Темнота поверх всего, кроме текста.
    this.dark = this.add.renderTexture(0, 0, W, H).setOrigin(0).setDepth(20);
    this.lightImg = this.make.image({ x: 0, y: 0, key: 'glow' }, false);

    const line1 = text(this, W / 2, 330, t('intro_line1'), 64).setDepth(30).setAlpha(0);
    const line2 = text(this, W / 2, 430, t('intro_line2'), 56, '#ffd36b').setDepth(30).setAlpha(0);
    const skip = text(this, W - 40, H - 70, t('intro_skip'), 36, C.textDim, false).setOrigin(1, 0.5).setDepth(30).setAlpha(0.7);
    void skip;

    // Сценарий
    this.tweens.add({ targets: line1, alpha: 1, duration: 900, delay: 500 });
    this.tweens.add({ targets: this.lumo, x: LUMO_AT.x, duration: 2200, delay: 400, ease: 'Sine.out' });
    this.at(2900, () => {
      // Lumo зажигает фонарь: свет разливается по долине.
      sfx.lantern(0);
      raysBurst(this, this.lumo.x + 80, this.lumo.y - 30, C.lanternOn, 260, 25);
      this.tweens.add({ targets: this, lumoLight: 1.1, duration: 1300, ease: 'Cubic.out' });
      this.tweens.add({ targets: line1, alpha: 0, duration: 600, delay: 900 });
    });
    this.stones.forEach((st, i) => {
      this.at(4300 + i * 220, () => {
        sfx.step(i);
        this.tweens.add({ targets: st, lit: 1, duration: 300 });
      });
    });
    this.at(7000, () => {
      // Вдалеке разгорается арка.
      sfx.lantern(4);
      this.tweens.add({ targets: arch, alpha: 1, duration: 700 });
      this.tweens.add({ targets: arch, scale: { from: 0.6, to: 1 }, duration: 900, ease: 'Back.out' });
      raysBurst(this, ARCH_AT.x, ARCH_AT.y, C.exitOpen, 220, 25);
      this.tweens.add({ targets: this, archLight: 1, duration: 900 });
    });
    this.tweens.add({ targets: line2, alpha: 1, duration: 900, delay: 8200 });
    this.at(11800, () => this.finish(false));

    // Тап — пропустить.
    this.input.once('pointerdown', () => this.finish(true));
    this.input.keyboard?.once('keydown', () => this.finish(true));
    this.update(0);
  }

  /**
   * Шаг сценария через ms. Всё вступление идёт на анимациях Phaser (а не на таймерах), чтобы шаги
   * не расходились с движением, если первый кадр на телефоне подвиснет.
   */
  private at(ms: number, fn: () => void) {
    this.tweens.addCounter({ from: 0, to: 1, duration: ms, onComplete: fn });
  }

  private drawValley() {
    // Три слоя холмов: дальние светлее, ближние темнее.
    const layers: [number, number, number, number][] = [
      [0x1b2052, 900, 70, 0.0021],
      [0x141842, 1150, 90, 0.0032],
      [0x0c0f2c, 1420, 60, 0.0045],
    ];
    layers.forEach(([color, base, amp, freq], i) => {
      const g = this.add.graphics().setDepth(1 + i);
      const pts: Phaser.Math.Vector2[] = [new Phaser.Math.Vector2(0, H)];
      for (let x = 0; x <= W; x += 30) pts.push(new Phaser.Math.Vector2(x, base - Math.sin(x * freq + i * 1.7) * amp - Math.sin(x * freq * 2.3) * amp * 0.4));
      pts.push(new Phaser.Math.Vector2(W, H));
      g.fillStyle(color, 1);
      g.fillPoints(pts, true);
    });
    // Холм с аркой справа.
    const hill = this.add.graphics().setDepth(2.5);
    hill.fillStyle(0x181d4a, 1);
    hill.fillEllipse(ARCH_AT.x, ARCH_AT.y + 140, 520, 240);
  }

  update(time: number) {
    if (!this.dark) return;
    const flicker = 1 + Math.sin(time * 0.006) * 0.03;
    this.dark.clear();
    this.dark.fill(0x02030c, 0.94);
    const light = (x: number, y: number, d: number, a: number) => {
      this.lightImg.setScale(d / 128).setAlpha(Math.min(1, a));
      this.dark.erase(this.lightImg, x, y);
    };
    // Мягкий край света: два слоя — широкий слабый и яркий в центре.
    light(this.lumo.x + 60, this.lumo.y - 40, W * 1.7 * this.lumoLight * flicker, 0.75);
    light(this.lumo.x + 60, this.lumo.y - 40, W * 0.9 * this.lumoLight * flicker, 1);
    for (const st of this.stones) if (st.lit > 0) light(st.x, st.y, 230, st.lit);
    if (this.archLight > 0) {
      light(ARCH_AT.x, ARCH_AT.y, 900 * this.archLight * flicker, 0.7 * this.archLight);
      light(ARCH_AT.x, ARCH_AT.y, 420 * this.archLight * flicker, this.archLight);
    }
  }

  private finish(skipped: boolean) {
    if (this.finished) return;
    this.finished = true;
    logTutorialStep(skipped ? 'intro_skipped' : 'intro_done');
    this.cameras.main.fadeOut(400, 2, 3, 12);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('Game', { levelIndex: 0 }));
  }
}
