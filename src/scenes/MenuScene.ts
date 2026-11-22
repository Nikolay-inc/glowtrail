// Главное меню: выбор уровня, звёзды, статистика, звук.

import Phaser from 'phaser';
import { LEVELS } from '../levels/index';
import { isMuted, setMuted, sfx } from '../audio';
import { loadProgress } from '../storage';
import { addBackground, Button, createLumo, drawIcon, drawStar, text } from '../ui/draw';
import { C, H, W } from '../ui/theme';

export class MenuScene extends Phaser.Scene {
  constructor() {
    super('Menu');
  }

  create() {
    addBackground(this);
    this.cameras.main.fadeIn(250, 11, 15, 39);
    const progress = loadProgress();

    const title = text(this, W / 2, 230, 'Glowtrail', 150).setPadding(60, 40, 60, 40);
    title.setShadow(0, 0, '#ffc65c', 40, true, true);
    this.tweens.add({ targets: title, y: 240, duration: 2200, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    text(this, W / 2, 350, 'Проложи дорогу фонарщику Lumo', 44, C.textDim, false);

    const lumo = createLumo(this, 260).setPosition(W / 2, 560);
    this.tweens.add({ targets: lumo, y: 545, duration: 1600, yoyo: true, repeat: -1, ease: 'Sine.inOut' });

    // Сетка уровней 5×2
    const cols = 5;
    const size = 160;
    const gapX = 190;
    const gapY = 240;
    const x0 = W / 2 - ((cols - 1) * gapX) / 2;
    const y0 = 850;
    const next = this.nextLevel(progress.unlocked, progress.stars);

    LEVELS.forEach((lvl, i) => {
      const x = x0 + (i % cols) * gapX;
      const y = y0 + Math.floor(i / cols) * gapY;
      const unlocked = lvl.id <= progress.unlocked;
      const stars = progress.stars[lvl.id] ?? 0;
      const c = this.add.container(x, y);
      const g = this.add.graphics();
      g.fillStyle(0x000000, 0.3);
      g.fillRoundedRect(-size / 2, -size / 2 + 8, size, size, 40);
      g.fillStyle(unlocked ? (i === next ? 0x3a46a0 : C.card) : C.cardDisabled, 1);
      g.fillRoundedRect(-size / 2, -size / 2, size, size, 40);
      g.lineStyle(5, i === next ? C.primary : unlocked ? C.cardEdge : 0x2a3160, 1);
      g.strokeRoundedRect(-size / 2, -size / 2, size, size, 40);
      c.add(g);
      if (unlocked) {
        c.add(text(this, 0, -4, String(lvl.id), 70));
        const sg = this.add.graphics();
        for (let k = 0; k < 3; k++) drawStar(sg, (k - 1) * 46, size / 2 + 38, 22, k < stars ? C.star : C.starEmpty);
        c.add(sg);
      } else {
        const lg = this.add.graphics();
        drawIcon(lg, 'lock', 70, C.iconDisabled);
        c.add(lg);
      }
      if (unlocked) {
        c.setSize(size, size).setInteractive({ useHandCursor: true });
        c.on('pointerup', () => this.play(i));
        c.on('pointerdown', () => this.tweens.add({ targets: c, scale: 0.92, duration: 70, yoyo: true }));
      }
      if (i === next) this.tweens.add({ targets: c, scale: 1.06, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    });

    new Button(this, W / 2, 1450, { w: 560, h: 160, icon: 'play', label: 'Играть', primary: true, fontSize: 64, onClick: () => this.play(next) });

    new Button(this, W / 2 - 110, 1700, { w: 160, h: 140, icon: 'stats', onClick: () => this.go('Stats') });
    const sound = new Button(this, W / 2 + 110, 1700, {
      w: 160,
      h: 140,
      icon: isMuted() ? 'mute' : 'sound',
      onClick: () => {
        setMuted(!isMuted());
        sound.setIcon(isMuted() ? 'mute' : 'sound');
        sfx.tap();
      },
    });

    text(this, W / 2, H - 50, 'прототип v0.1', 28, C.textDim, false).setAlpha(0.5);
    this.input.keyboard?.once('keydown-ENTER', () => this.play(next));
  }

  /** Первый открытый уровень без трёх звёзд, иначе последний открытый. */
  private nextLevel(unlocked: number, stars: Record<number, number>): number {
    for (let id = 1; id <= unlocked; id++) if (!stars[id]) return id - 1;
    return Math.min(unlocked, LEVELS.length) - 1;
  }

  private play(levelIndex: number) {
    this.go('Game', { levelIndex });
  }

  private go(scene: string, data: object = {}) {
    sfx.tap();
    this.cameras.main.fadeOut(180, 11, 15, 39);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start(scene, data));
  }
}
