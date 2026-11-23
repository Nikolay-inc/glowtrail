// Жизненный цикл: приложение свернули — пауза, звук выключен, сохранение дописано на диск и в облако;
// вернулись — продолжаем. В браузере то же по visibilitychange. Сцены слушают game.events:
// 'app-pause' / 'app-resume' (например, чтобы не считать время в фоне) и 'app-back' (кнопка «Назад» на Android).

import type Phaser from 'phaser';
import { App } from '@capacitor/app';
import { resumeAudio, suspendAudio } from './audio';
import { Account } from './cloud/account';
import { isNative } from './platform';
import { SaveService } from './save/SaveService';

export const APP_PAUSE = 'app-pause';
export const APP_RESUME = 'app-resume';
export const APP_BACK = 'app-back';

let paused = false;

export function pauseApp(game: Phaser.Game) {
  if (paused) return;
  paused = true;
  suspendAudio();
  void SaveService.flush();
  void Account.flushSync();
  game.events.emit(APP_PAUSE);
  game.loop.sleep();
}

export function resumeApp(game: Phaser.Game) {
  if (!paused) return;
  paused = false;
  game.loop.wake();
  resumeAudio();
  game.events.emit(APP_RESUME);
}

export function initLifecycle(game: Phaser.Game) {
  document.addEventListener('visibilitychange', () => (document.hidden ? pauseApp(game) : resumeApp(game)));
  if (!isNative()) return;
  void App.addListener('appStateChange', ({ isActive }) => (isActive ? resumeApp(game) : pauseApp(game)));
  void App.addListener('pause', () => pauseApp(game));
  void App.addListener('resume', () => resumeApp(game));
  // Android: «Назад» — с уровня в меню; в меню — свернуть приложение.
  void App.addListener('backButton', () => {
    const scenes = game.scene.getScenes(true);
    const active = scenes.map((s) => s.scene.key);
    if (active.includes('Rules') || active.includes('Intro') || document.querySelector('.gt-auth')) return;
    if (active.includes('Menu')) void App.minimizeApp();
    else if (active.includes('Game')) game.events.emit(APP_BACK);
    else scenes[0]?.scene.start('Menu'); // статистика, профиль
  });
}
