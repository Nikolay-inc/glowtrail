// Экран «Профиль»: Lumo в надетом костюме, имя (можно сменить), сводка, настройки (звук, вибрация,
// статистика, «Как играть») и выбор костюма — купленные можно надеть, остальные — в магазине.

import Phaser from 'phaser';
import { LEVELS } from '../levels/index';
import { isMusicOn, isMuted, setMusicOn, setMuted, sfx } from '../audio';
import { isVibrationOn, setVibration } from '../haptics';
import { displayName, getProfile, levelsPassed, totalStars } from '../profile';
import { SKINS } from '../core/economy';
import { getEconomy } from '../meta';
import { ALL_RULES } from '../tutorial';
import { addBackground, Button, createAvatarBadge, text, type IconName } from '../ui/draw';
import { showNameDialog } from '../ui/NameDialog';
import { addTabBar, toast } from '../ui/meta';
import { openPrivacy, sendFeedback } from '../feedback';
import { versionLabel } from '../version';
import { equippedLook } from '../ui/skins';
import { Account } from '../cloud/account';
import { openAuthDialog } from '../ui/AuthDialog';
import { stretchLayout } from '../ui/viewport';
import { C, H, W } from '../ui/theme';

const MAX_STARS = () => LEVELS.length * 3;

export class ProfileScene extends Phaser.Scene {
  constructor() {
    super('Profile');
  }

  create() {
    const bounds = stretchLayout(this);
    addBackground(this);
    this.cameras.main.fadeIn(200, 11, 15, 39);
    const profile = getProfile();
    const stars = totalStars();
    const look = equippedLook();
    const topY = 100 + bounds.top;

    text(this, W / 2, topY, 'Профиль', 64);

    // Lumo в надетом костюме и имя
    createAvatarBadge(this, W / 2, topY + 230, 130, look.avatar, { selected: true, animate: true, lantern: look.lantern });
    const name = text(this, W / 2, topY + 410, displayName(profile), 64);
    const edit = this.add.graphics();
    drawEditIcon(edit, 40, C.icon);
    edit.setPosition(name.x + name.width / 2 + 45, topY + 410);
    const nameZone = this.add.zone(W / 2, topY + 410, Math.max(400, name.width + 160), 110).setInteractive({ useHandCursor: true });
    nameZone.on('pointerup', () => {
      sfx.tap();
      showNameDialog(this, { title: 'Как тебя зовут?', withAvatars: false, secondary: 'cancel', onClose: () => this.scene.restart() });
    });

    // Сводка: 4 карточки в ряд
    const cards: [string, string][] = [
      [`${stars}/${MAX_STARS()}`, 'звёзд'],
      [`${levelsPassed()}/${LEVELS.length}`, 'уровней'],
      [String(profile.dayStreak), dayWord(profile.dayStreak)],
      [String(profile.hintsUsed), 'подсказок'],
    ];
    const g = this.add.graphics();
    cards.forEach(([value, label], i) => {
      const x = W / 2 + (i - 1.5) * 245;
      const y = topY + 560;
      g.fillStyle(0x000000, 0.25);
      g.fillRoundedRect(x - 112, y - 65 + 6, 224, 140, 30);
      g.fillStyle(C.card, 1);
      g.fillRoundedRect(x - 112, y - 65, 224, 140, 30);
      text(this, x, y - 15, value, 46, i === 0 ? '#ffd36b' : C.text);
      text(this, x, y + 40, label, 26, C.textDim, false);
    });

    // Настройки: звук, вибрация, статистика, «Как играть»
    const sy = topY + 740;
    const toggle = (i: number, on: () => boolean, set: (v: boolean) => void, iconOn: IconName, iconOff: IconName) => {
      const b: Button = new Button(this, W / 2 + (i - 2) * 200, sy, {
        w: 176,
        h: 116,
        icon: on() ? iconOn : iconOff,
        onClick: () => {
          set(!on());
          b.setIcon(on() ? iconOn : iconOff);
          sfx.tap();
        },
      });
    };
    toggle(0, isMusicOn, setMusicOn, 'music', 'nomusic');
    toggle(1, () => !isMuted(), (v) => setMuted(!v), 'sound', 'mute');
    toggle(2, isVibrationOn, setVibration, 'vibrate', 'novibrate');
    new Button(this, W / 2 + 200, sy, { w: 176, h: 116, icon: 'stats', onClick: () => this.go('Stats') });
    new Button(this, W / 2 + 400, sy, {
      w: 176,
      h: 116,
      icon: 'help',
      onClick: () => {
        sfx.tap();
        this.scene.launch('Rules', { cards: [...ALL_RULES], from: 'Profile', menuMode: true });
        this.scene.pause();
      },
    });
    ['Музыка', 'Звуки', 'Вибрация', 'Статистика', 'Как играть'].forEach((l, i) => text(this, W / 2 + (i - 2) * 200, sy + 82, l, 24, C.textDim, false));

    // Костюм: какой надет и кнопка «Сменить» (выбор и покупка — в магазине)
    const e = getEconomy();
    const cy = topY + 960;
    const cg = this.add.graphics();
    cg.fillStyle(0x000000, 0.25);
    cg.fillRoundedRect(W / 2 - 440, cy - 80 + 6, 880, 160, 36);
    cg.fillStyle(C.card, 1);
    cg.fillRoundedRect(W / 2 - 440, cy - 80, 880, 160, 36);
    createAvatarBadge(this, W / 2 - 340, cy, 62, look.avatar, { lantern: look.lantern });
    const costume = SKINS.find((x) => x.id === e.skins.equipped.costume);
    const owned = SKINS.filter((x) => x.kind === 'costume' && e.skins.owned.includes(x.id)).length;
    text(this, W / 2 - 250, cy - 22, `Костюм «${costume?.name ?? ''}»`, 40).setOrigin(0, 0.5);
    text(this, W / 2 - 250, cy + 28, `Есть ${owned} из ${SKINS.filter((x) => x.kind === 'costume').length}`, 28, C.textDim, false).setOrigin(0, 0.5);
    new Button(this, W / 2 + 300, cy, { w: 230, h: 96, label: 'Сменить', fontSize: 38, primary: true, onClick: () => this.go('Shop', { kind: 'costume' }) });

    // Аккаунт: гость — предложение войти; вошёл — email и управление аккаунтом.
    const user = Account.user;
    const label = user ? shortEmail(user.email) : 'Войти или зарегистрироваться';
    const rowY = 1730 + (bounds.bottom - H);
    new Button(this, W / 2, rowY - 190, {
      w: 760,
      h: 104,
      icon: user ? 'cloud' : 'user',
      label,
      fontSize: user ? 34 : 36,
      primary: !user,
      onClick: () => {
        sfx.tap();
        openAuthDialog(user ? 'account' : 'register', { onClose: () => this.scene.isActive() && this.scene.restart() });
      },
    });
    text(this, W / 2, rowY - 115, `ID игрока: ${profile.playerId.slice(0, 8)} · версия ${versionLabel()}`, 24, C.textDim, false).setAlpha(0.5);
    // Для тестеров: отзыв на почту (со статистикой и версией) и политика конфиденциальности.
    new Button(this, W / 2 - 200, rowY - 320, {
      w: 380,
      h: 96,
      icon: 'copy',
      label: 'Отправить отзыв',
      fontSize: 32,
      onClick: () => {
        sfx.tap();
        void sendFeedback().then((ok) => toast(this, ok ? 'Статистика скопирована — откроется письмо' : 'Адрес для отзывов не настроен', rowY - 440));
      },
    });
    new Button(this, W / 2 + 200, rowY - 320, { w: 380, h: 96, icon: 'lock', label: 'Конфиденциальность', fontSize: 30, onClick: () => (sfx.tap(), openPrivacy()) });
    addTabBar(this, 'Profile', rowY + 40, (k) => this.go(k));

    // Вошли/вышли или облако подтянуло прогресс с другого устройства — обновляем экран.
    const off = Account.on((ev) => {
      if (ev.type === 'changed' || (ev.type === 'sync' && ev.status === 'synced' && !this.syncedOnce)) {
        this.syncedOnce = ev.type === 'sync';
        this.scene.restart();
      }
    });
    this.events.once('shutdown', off);
  }

  private syncedOnce = false;

  private go(scene: string, data?: object) {
    sfx.tap();
    this.cameras.main.fadeOut(150, 11, 15, 39);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start(scene, data));
  }
}

/** Длинный email укорачиваем, чтобы влез в кнопку. */
function shortEmail(email: string | null): string {
  if (!email) return 'Аккаунт';
  return email.length > 26 ? `${email.slice(0, 23)}…` : email;
}

function dayWord(n: number) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return 'день подряд';
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return 'дня подряд';
  return 'дней подряд';
}

/** Карандаш «изменить». */
function drawEditIcon(g: Phaser.GameObjects.Graphics, s: number, color: number) {
  g.fillStyle(color, 0.8);
  g.fillPoints(
    [
      [-0.38, 0.38],
      [-0.3, 0.12],
      [0.18, -0.36],
      [0.36, -0.18],
      [-0.12, 0.3],
    ].map(([x, y]) => new Phaser.Math.Vector2(x * s, y * s)),
    true,
  );
}
