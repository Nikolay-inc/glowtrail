import Phaser from 'phaser';
import { GameScene } from './scenes/GameScene';
import { MenuScene } from './scenes/MenuScene';
import { StatsScene } from './scenes/StatsScene';
import { ProfileScene } from './scenes/ProfileScene';
import { recordPlayDay } from './profile';
import { loadProgress, logEvent } from './storage';
import { createTextures } from './ui/draw';
import { C, H, W } from './ui/theme';

/** Готовит общие текстуры и решает, куда идти: новичок сразу попадает в первый уровень. */
class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create() {
    createTextures(this);
    logEvent({ ev: 'session' });
    recordPlayDay();
    const p = loadProgress();
    const firstTime = Object.keys(p.stars).length === 0 && Object.keys(p.attempts).length === 0;
    // ?level=N — открыть уровень сразу (удобно для проверки и видео).
    const fromUrl = Number(new URLSearchParams(location.search).get('level'));
    if (fromUrl >= 1) this.scene.start('Game', { levelIndex: fromUrl - 1 });
    else this.scene.start(firstTime ? 'Game' : 'Menu', { levelIndex: 0 });
  }
}

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: W,
  height: H,
  backgroundColor: C.bgBottom,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  input: { activePointers: 2 },
  // DOM-элементы поверх холста — для поля ввода имени (масштабируются вместе с игрой).
  dom: { createContainer: true },
  render: { antialias: true },
  scene: [BootScene, MenuScene, GameScene, StatsScene, ProfileScene],
});

// Для отладки в консоли браузера во время разработки.
if (import.meta.env.DEV) (window as unknown as { game: Phaser.Game }).game = game;
