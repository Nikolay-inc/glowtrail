import Phaser from 'phaser';
import './assets/fonts.css';
import { setLocale, systemLang, type Locale } from './i18n';
import { initMusic } from './audio';
import { VillageScene } from './scenes/VillageScene';
import { WorkshopScene } from './scenes/WorkshopScene';
import { ShopScene } from './scenes/ShopScene';
import { GameScene } from './scenes/GameScene';
import { MenuScene } from './scenes/MenuScene';
import { StatsScene } from './scenes/StatsScene';
import { ProfileScene } from './scenes/ProfileScene';
import { IntroScene } from './scenes/IntroScene';
import { RulesScene } from './scenes/RulesScene';
import { ConsentScene } from './scenes/ConsentScene';
import { consentScreenDue, initTelemetry } from './analytics/index';
import { isTutorialDone, markTutorialDoneForReturningPlayer } from './tutorial';
import { recordPlayDay } from './profile';
import { Account } from './cloud/account';
import { openAuthDialog } from './ui/AuthDialog';
import { loadProgress, logEvent } from './storage';
import { LEVELS } from './levels/index';
import { createTextures } from './ui/draw';
import { C, H, W } from './ui/theme';
import { Preferences } from '@capacitor/preferences';
import { SplashScreen } from '@capacitor/splash-screen';
import { StatusBar, Style } from '@capacitor/status-bar';
import { initLifecycle } from './lifecycle';
import { isNative, platform } from './platform';
import { createPreferencesBackend } from './save/preferencesBackend';
import { SaveService } from './save/SaveService';

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
    const tutorialIndex = Math.max(0, [0, 1, 2].find((i) => !p.stars[LEVELS[i].id]) ?? 0);
    const params = new URLSearchParams(location.search);
    // ?editor=1 — редактор уровней (только при разработке, в сборку не попадает).
    if (import.meta.env.DEV && params.has('editor')) {
      void import('./editor/editor').then((m) => m.startEditor(this.game));
      return;
    }
    // ?level=N — открыть уровень сразу (удобно для проверки и видео).
    const fromUrl = Number(params.get('level'));
    if (fromUrl >= 1) return void this.scene.start('Game', { levelIndex: fromUrl - 1 });
    const [next, data] = firstTime && !isTutorialDone() ? ['Intro'] : !isTutorialDone() ? ['Game', { levelIndex: tutorialIndex }] : ['Menu'];
    // ЕС/ЕЭЗ, Великобритания, Швейцария: сначала спрашиваем про анонимную статистику (один раз).
    if (consentScreenDue() && !params.has('audit')) this.scene.start('Consent', { next, data });
    else this.scene.start(next, data);
  }
}

/** Язык: ?lang=xx (проверка переводов, псевдо-язык qps), выбранный в профиле или язык системы. */
function initLocale() {
  const q = new URLSearchParams(location.search).get('lang');
  if (q === 'ru' || q === 'en' || q === 'uk' || q === 'qps') return setLocale(q as Locale);
  setLocale((loadProgress().language as Locale) || systemLang());
}

/** Шрифты до первого кадра: Phaser рисует текст в canvas и сам не дождётся загрузки шрифта. */
async function loadFonts() {
  if (typeof document === 'undefined' || !document.fonts) return;
  const sample = 'AaĄąŁłŐőЯяЇїΩω';
  const all = Promise.all(['normal', 'bold'].map((w) => document.fonts.load(`${w} 40px "Noto Sans"`, sample)));
  await Promise.race([all, new Promise((r) => setTimeout(r, 2500))]).catch(() => undefined);
}

// Запуск: в приложении сначала читаем сохранение из Preferences (асинхронно), потом стартует игра.
async function boot() {
  if (isNative()) {
    SaveService.setBackend(await createPreferencesBackend(Preferences, { legacyLocalStorage: localStorage }));
    // Светлые значки статус-бара на тёмном фоне.
    await StatusBar.setStyle({ style: Style.Dark }).catch(() => undefined);
    if (platform() === 'android') {
      await StatusBar.setOverlaysWebView({ overlay: false }).catch(() => undefined);
      await StatusBar.setBackgroundColor({ color: '#0b0f27' }).catch(() => undefined);
    }
  }

  initLocale();
  // Sentry, Firebase и Remote Config (таймаут 2 с) — параллельно со шрифтами.
  await Promise.all([loadFonts(), initTelemetry()]);

  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    width: W,
    height: H,
    backgroundColor: C.bgBottom,
    scale: {
      // EXPAND: холст на весь экран без полос; раскладку 1080×1920 ставит камера (src/ui/viewport.ts).
      mode: Phaser.Scale.EXPAND,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    input: { activePointers: 2 },
    // ?audit=1 (npm run i18n-check): 15 кадров в секунду — анимации идут по времени и доходят до конца так же,
    // а программный WebGL на машине CI не тратит процессор на 60 кадров.
    fps: new URLSearchParams(location.search).has('audit') ? { limit: 15 } : undefined,
    // DOM-элементы поверх холста — для поля ввода имени (масштабируются вместе с игрой).
    dom: { createContainer: true },
    render: { antialias: true },
    scene: [BootScene, ConsentScene, MenuScene, GameScene, StatsScene, ProfileScene, IntroScene, RulesScene, VillageScene, WorkshopScene, ShopScene],
  });

  initLifecycle(game);
  // Ночная музыка — после первого касания (политика автозапуска iOS).
  initMusic();
  // Заставку прячем, когда первая сцена уже нарисовалась.
  if (isNative()) game.events.once('poststep', () => void SplashScreen.hide({ fadeOutDuration: 250 }).catch(() => undefined));

  // Аккаунт и облачное сохранение (если заданы ключи Supabase).
  Account.init();
  // Пришли по ссылке «сбросить пароль» — сразу просим новый пароль.
  Account.on((e) => {
    if (e.type === 'recovery') openAuthDialog('recovery');
    if (e.type === 'link_error') openAuthDialog('login', { message: { text: e.message } });
  });

  // Для отладки в консоли браузера во время разработки.
  if (import.meta.env.DEV) (window as unknown as { game: Phaser.Game }).game = game;
  // ?audit=1 — проверка вёрстки под переводы (npm run i18n-check).
  if (new URLSearchParams(location.search).has('audit')) void import('./debug/audit').then((m) => m.install(game));
}

void boot();
