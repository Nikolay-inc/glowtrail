// Экран «Профиль»: аватарка, имя (можно сменить), сводка и выбор аватарки.

import Phaser from 'phaser';
import { AVATARS, isAvatarUnlocked } from '../core/avatars';
import { LEVELS } from '../levels/index';
import { sfx } from '../audio';
import { displayName, getProfile, levelsPassed, setAvatar, totalStars } from '../profile';
import { addBackground, Button, createAvatarBadge, text } from '../ui/draw';
import { showNameDialog } from '../ui/NameDialog';
import { Account } from '../cloud/account';
import { openAuthDialog } from '../ui/AuthDialog';
import { C, W } from '../ui/theme';

const MAX_STARS = () => LEVELS.length * 3;

export class ProfileScene extends Phaser.Scene {
  constructor() {
    super('Profile');
  }

  create() {
    addBackground(this);
    this.cameras.main.fadeIn(200, 11, 15, 39);
    const profile = getProfile();
    const stars = totalStars();

    new Button(this, 90, 105, { w: 130, h: 130, icon: 'back', onClick: () => this.back() });
    text(this, W / 2, 105, 'Профиль', 70);

    // Аватарка и имя
    createAvatarBadge(this, W / 2, 400, 170, profile.avatar, { selected: true, animate: true });
    const name = text(this, W / 2, 640, displayName(profile), 72);
    const edit = this.add.graphics();
    drawEditIcon(edit, 44, C.icon);
    edit.setPosition(name.x + name.width / 2 + 50, 640);
    const nameZone = this.add.zone(W / 2, 640, Math.max(400, name.width + 160), 120).setInteractive({ useHandCursor: true });
    nameZone.on('pointerup', () => {
      sfx.tap();
      showNameDialog(this, { title: 'Как тебя зовут?', withAvatars: false, secondary: 'cancel', onClose: () => this.scene.restart() });
    });

    // Сводка: 4 карточки
    const cards: [string, string][] = [
      [`${stars} из ${MAX_STARS()}`, 'звёзд'],
      [`${levelsPassed()} из ${LEVELS.length}`, 'уровней пройдено'],
      [String(profile.dayStreak), dayWord(profile.dayStreak)],
      [String(profile.hintsUsed), 'подсказок'],
    ];
    const g = this.add.graphics();
    cards.forEach(([value, label], i) => {
      const x = W / 2 + (i % 2 === 0 ? -225 : 225);
      const y = 800 + Math.floor(i / 2) * 190;
      g.fillStyle(0x000000, 0.25);
      g.fillRoundedRect(x - 205, y - 75 + 6, 410, 160, 36);
      g.fillStyle(C.card, 1);
      g.fillRoundedRect(x - 205, y - 75, 410, 160, 36);
      text(this, x, y - 18, value, 60, i === 0 ? '#ffd36b' : C.text);
      text(this, x, y + 45, label, 34, C.textDim, false);
    });

    // Выбор аватарки: 4 открыты сразу, остальные — за звёзды
    text(this, W / 2, 1185, 'Выбери фонарщика', 44, C.textDim, false);
    AVATARS.forEach((a, i) => {
      const x = W / 2 + ((i % 4) - 1.5) * 225;
      const y = 1345 + Math.floor(i / 4) * 220;
      const unlocked = isAvatarUnlocked(a.id, stars);
      const badge = createAvatarBadge(this, x, y, 95, a.id, { locked: !unlocked, selected: a.id === profile.avatar });
      badge.setSize(200, 200).setInteractive({ useHandCursor: true });
      badge.on('pointerup', () => {
        if (!unlocked) {
          sfx.invalid();
          this.tweens.add({ targets: badge, x: x + 10, duration: 45, yoyo: true, repeat: 3 });
          return;
        }
        if (setAvatar(a.id)) {
          sfx.tap();
          this.scene.restart();
        }
      });
    });

    // Аккаунт: гость — предложение войти; вошёл — email и управление аккаунтом.
    const user = Account.user;
    const label = user ? shortEmail(user.email) : 'Войти или зарегистрироваться';
    new Button(this, W / 2, 1790, {
      w: 760,
      h: 112,
      icon: user ? 'cloud' : 'user',
      label,
      fontSize: user ? 36 : 38,
      primary: !user,
      onClick: () => {
        sfx.tap();
        openAuthDialog(user ? 'account' : 'register', { onClose: () => this.scene.isActive() && this.scene.restart() });
      },
    });
    text(this, W / 2, 1880, `ID игрока: ${profile.playerId.slice(0, 8)}`, 26, C.textDim, false).setAlpha(0.4);

    // Вошли/вышли или облако подтянуло прогресс с другого устройства — обновляем экран.
    const off = Account.on((e) => {
      if (e.type === 'changed' || (e.type === 'sync' && e.status === 'synced' && !this.syncedOnce)) {
        this.syncedOnce = e.type === 'sync';
        this.scene.restart();
      }
    });
    this.events.once('shutdown', off);
  }

  private syncedOnce = false;

  private back() {
    sfx.tap();
    this.scene.start('Menu');
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
