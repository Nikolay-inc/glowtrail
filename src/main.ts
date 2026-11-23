import Phaser from 'phaser';
import { GameScene } from './scenes/GameScene';
import { MenuScene } from './scenes/MenuScene';
import { StatsScene } from './scenes/StatsScene';
import { ProfileScene } from './scenes/ProfileScene';
import { IntroScene } from './scenes/IntroScene';
import { isTutorialDone, markTutorialDoneForReturningPlayer } from './tutorial';
import { recordPlayDay } from './profile';
import { Account } from './cloud/account';
import { openAuthDialog } from './ui/AuthDialog';
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
    // Обучение: первый запуск — вступление, потом уровни 1–3; прерванное обучение продолжаем с того же места.
    markTutorialDoneForReturningPlayer();
    const firstTime = Object.keys(p.stars).length === 0 && Object.keys(p.attempts).length === 0;
    const tutorialLevel = [1, 2, 3].find((id) => !p.stars[id]) ?? 1;
    // ?level=N — открыть уровень сразу (удобно для проверки и видео).
    const fromUrl = Number(new URLSearchParams(location.search).get('level'));
    if (fromUrl >= 1) this.scene.start('Game', { levelIndex: fromUrl - 1 });
    else if (firstTime && !isTutorialDone()) this.scene.start('Intro');
    else if (!isTutorialDone()) this.scene.start('Game', { levelIndex: tutorialLevel - 1 });
    else this.scene.start('Menu');
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
  scene: [BootScene, MenuScene, GameScene, StatsScene, ProfileScene, IntroScene],
});

// Аккаунт и облачное сохранение (если заданы ключи Supabase).
Account.init();
// Пришли по ссылке «сбросить пароль» — сразу просим новый пароль.
Account.on((e) => {
  if (e.type === 'recovery') openAuthDialog('recovery');
  if (e.type === 'link_error') openAuthDialog('login', { message: { text: e.message } });
});

// Для отладки в консоли браузера во время разработки.
if (import.meta.env.DEV) (window as unknown as { game: Phaser.Game }).game = game;
