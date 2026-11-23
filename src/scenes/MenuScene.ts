// Главное меню: выбор уровня, звёзды, статистика, звук.

import { isVibrationOn, setVibration } from '../haptics';
import Phaser from 'phaser';
import { LEVELS } from '../levels/index';
import { isMuted, setMuted, sfx } from '../audio';
import { loadProgress } from '../storage';
import { displayName, getProfile } from '../profile';
import { showNameDialog } from '../ui/NameDialog';
import { ALL_RULES, canShowModal, isTutorialDone, modalClosed, modalOpened } from '../tutorial';
import { t } from '../strings';
import { Account } from '../cloud/account';
import { openAuthDialog } from '../ui/AuthDialog';
import { addBackground, Button, createAvatarBadge, createLumo, drawIcon, drawStar, text } from '../ui/draw';
import { C, FONT, H, W } from '../ui/theme';
import { irisIn, reducedMotion } from '../ui/fx';

export class MenuScene extends Phaser.Scene {
  constructor() {
    super('Menu');
  }

  create() {
    addBackground(this);
    const progress = loadProgress();
    const calm = reducedMotion();

    // Заголовок светится изнутри, по нему изредка пробегает блик.
    const titleGlow = this.add.image(W / 2, 235, 'glow').setTint(C.lanternOn).setBlendMode(Phaser.BlendModes.ADD).setScale(7, 2.2).setAlpha(0.18);
    this.tweens.add({ targets: titleGlow, alpha: 0.32, scaleX: 7.6, duration: 2200, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    const title = text(this, W / 2, 230, 'Glowtrail', 150).setPadding(60, 40, 60, 40);
    title.setShadow(0, 0, '#ffc65c', 40, true, true);
    this.tweens.add({ targets: [title, titleGlow], y: '+=10', duration: 2200, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    if (!calm) {
      const sweep = this.add.image(170, 235, 'glow').setTint(0xffffff).setBlendMode(Phaser.BlendModes.ADD).setScale(1.1, 2.4).setAlpha(0);
      this.tweens.add({
        targets: sweep,
        x: { from: 170, to: W - 170 },
        alpha: { from: 0, to: 0.0 },
        duration: 1500,
        repeat: -1,
        repeatDelay: 3800,
        delay: 1200,
        ease: 'Sine.inOut',
        onUpdate: (tw) => sweep.setAlpha(Math.sin(tw.progress * Math.PI) * 0.38),
      });
    }
    text(this, W / 2, 350, 'Проложи дорогу фонарщику Lumo', 44, C.textDim, false);

    const profile = getProfile();
    // Круг тёплого света от фонаря Lumo — единственное светлое пятно в ночи.
    const pool = this.add.image(W / 2 + 40, 560, 'glow').setTint(C.lanternOn).setBlendMode(Phaser.BlendModes.ADD).setScale(5.5, 4.5).setAlpha(0.16);
    this.tweens.add({ targets: pool, alpha: 0.24, scale: 5.9, duration: 1700, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    const lumo = createLumo(this, 260, profile.avatar).setPosition(W / 2, 560);

    // Кнопка профиля в углу: аватарка и имя
    const badge = createAvatarBadge(this, 100, 100, 62, profile.avatar);
    badge.setSize(140, 140).setInteractive({ useHandCursor: true });
    badge.on('pointerup', () => this.go('Profile'));
    const nameT = this.add
      .text(180, 100, displayName(profile), { fontFamily: FONT, fontSize: '40px', color: C.text, fontStyle: 'bold' })
      .setOrigin(0, 0.5)
      .setInteractive({ useHandCursor: true });
    nameT.on('pointerup', () => this.go('Profile'));

    // Вход в аккаунт — на виду, в правом верхнем углу. После входа — значок облака.
    const loggedIn = !!Account.user;
    const authBtn = new Button(this, loggedIn ? W - 100 : W - 150, 100, {
      w: loggedIn ? 130 : 230,
      h: 110,
      icon: loggedIn ? 'cloud' : 'user',
      label: loggedIn ? undefined : 'Войти',
      fontSize: 40,
      onClick: () => {
        sfx.tap();
        openAuthDialog(Account.user ? 'account' : 'login', { onClose: () => this.scene.isActive() && this.scene.restart() });
      },
    });
    authBtn.setDepth(5);
    const offAuth = Account.on((e) => e.type === 'changed' && this.scene.isActive() && this.scene.restart());
    this.events.once('shutdown', offAuth);
    this.tweens.add({ targets: lumo, y: 545, duration: 1600, yoyo: true, repeat: -1, ease: 'Sine.inOut' });

    // Сетка уровней 5×2
    const cols = 5;
    const size = 160;
    const gapX = 190;
    const gapY = 240;
    const x0 = W / 2 - ((cols - 1) * gapX) / 2;
    const y0 = 850;
    const next = this.nextLevel(progress.unlocked, progress.stars, progress.skipped);

    LEVELS.forEach((lvl, i) => {
      const x = x0 + (i % cols) * gapX;
      const y = y0 + Math.floor(i / cols) * gapY;
      const unlocked = lvl.id <= progress.unlocked;
      const stars = progress.stars[lvl.id] ?? 0;
      const skipped = !stars && !!progress.skipped[lvl.id];
      // Открытые уровни мягко вспыхивают волной, за следующим — вращающиеся лучи.
      if (unlocked && !calm) {
        const glow = this.add.image(x, y, 'glow').setTint(C.lanternOn).setBlendMode(Phaser.BlendModes.ADD).setScale(2.2).setAlpha(0);
        this.tweens.add({ targets: glow, alpha: 0.28, duration: 700, yoyo: true, repeat: -1, repeatDelay: 2600, delay: 600 + i * 140, ease: 'Sine.inOut' });
      }
      if (i === next) {
        const rays = this.add.container(x, y);
        for (let k = 0; k < 10; k++) {
          rays.add(
            this.add
              .image(0, 0, 'ray')
              .setOrigin(0.5, 1)
              .setRotation((k / 10) * Math.PI * 2)
              .setScale(0.8, 0.75)
              .setTint(C.lanternOn)
              .setBlendMode(Phaser.BlendModes.ADD)
              .setAlpha(0.42),
          );
        }
        if (!calm) this.tweens.add({ targets: rays, angle: 360, duration: 24000, repeat: -1 });
      }
      const c = this.add.container(x, y);
      const g = this.add.graphics();
      g.fillStyle(0x000000, 0.3);
      g.fillRoundedRect(-size / 2, -size / 2 + 8, size, size, 40);
      g.fillStyle(unlocked ? (i === next ? 0x3a46a0 : C.card) : C.cardDisabled, 1);
      g.fillRoundedRect(-size / 2, -size / 2, size, size, 40);
      g.lineStyle(5, i === next ? C.primary : skipped ? 0x7a6440 : unlocked ? C.cardEdge : 0x2a3160, 1);
      g.strokeRoundedRect(-size / 2, -size / 2, size, size, 40);
      c.add(g);
      if (unlocked) {
        c.add(text(this, 0, -4, String(lvl.id), 70));
        if (skipped) {
          // Пропущенный уровень: вместо звёзд — значок пропуска, уровень остаётся доступным.
          const sg = this.add.graphics();
          drawIcon(sg, 'skip', 44, 0xd98a1f);
          sg.setPosition(0, size / 2 + 38);
          c.add(sg);
        } else {
          const sg = this.add.graphics();
          for (let k = 0; k < 3; k++) drawStar(sg, (k - 1) * 46, size / 2 + 38, 22, k < stars ? C.star : C.starEmpty);
          c.add(sg);
        }
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

    new Button(this, W / 2 - 330, 1700, { w: 160, h: 140, icon: 'stats', onClick: () => this.go('Stats') });
    // «Как играть»: все карточки правил с живой анимацией; в конце — «Пройти обучение с начала».
    new Button(this, W / 2 + 330, 1700, {
      w: 160,
      h: 140,
      icon: 'help',
      onClick: () => {
        sfx.tap();
        this.scene.launch('Rules', { cards: [...ALL_RULES], from: 'Menu', menuMode: true });
        this.scene.pause();
      },
    });
    text(this, W / 2 + 330, 1800, t('tutorial_replay'), 30, C.textDim, false);
    // Вибрация (в браузере — где поддерживается, в приложении — Taptic Engine / вибромотор).
    const vibro = new Button(this, W / 2 + 110, 1700, {
      w: 160,
      h: 140,
      icon: isVibrationOn() ? 'vibrate' : 'novibrate',
      onClick: () => {
        setVibration(!isVibrationOn());
        vibro.setIcon(isVibrationOn() ? 'vibrate' : 'novibrate');
        sfx.tap();
      },
    });
    const sound = new Button(this, W / 2 - 110, 1700, {
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
    // Меню появляется из темноты — свет расходится от фонаря Lumo.
    irisIn(this, W / 2 + 60, 540, 750);
    // Обучение пройдено — мягко знакомимся: имя и аватарка (не вместе с другими окнами).
    if (isTutorialDone() && !profile.nameAsked && canShowModal()) {
      this.time.delayedCall(1100, () => {
        if (!canShowModal() || !this.scene.isActive()) return;
        modalOpened();
        showNameDialog(this, {
          title: 'Как тебя зовут?',
          withAvatars: true,
          secondary: 'skip',
          onClose: () => {
            modalClosed();
            if (this.scene.isActive()) this.scene.restart();
          },
        });
      });
    }
  }

  /** Первый открытый непройденный и непропущенный уровень, иначе последний открытый. */
  private nextLevel(unlocked: number, stars: Record<number, number>, skipped: Record<number, boolean>): number {
    for (let id = 1; id <= unlocked; id++) if (!stars[id] && !skipped[id]) return id - 1;
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
