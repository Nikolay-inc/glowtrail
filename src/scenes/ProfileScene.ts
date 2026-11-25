// Экран «Профиль»: Lumo в надетом костюме, имя (можно сменить), сводка, настройки (звук, вибрация,
// статистика, «Как играть») и выбор костюма — купленные можно надеть, остальные — в магазине.

import Phaser from 'phaser';
import { LEVELS } from '../levels/index';
import { isMuted, setMuted, sfx } from '../audio';
import { isVibrationOn, setVibration } from '../haptics';
import { displayName, getProfile, levelsPassed, totalStars } from '../profile';
import { SKINS } from '../core/economy';
import { equipSkin, getEconomy } from '../meta';
import { ALL_RULES } from '../tutorial';
import { addBackground, Button, createAvatarBadge, text } from '../ui/draw';
import { showNameDialog } from '../ui/NameDialog';
import { addTabBar } from '../ui/meta';
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
    const sound = new Button(this, W / 2 - 360, sy, {
      w: 200,
      h: 120,
      icon: isMuted() ? 'mute' : 'sound',
      onClick: () => {
        setMuted(!isMuted());
        sound.setIcon(isMuted() ? 'mute' : 'sound');
        sfx.tap();
      },
    });
    const vibro = new Button(this, W / 2 - 120, sy, {
      w: 200,
      h: 120,
      icon: isVibrationOn() ? 'vibrate' : 'novibrate',
      onClick: () => {
        setVibration(!isVibrationOn());
        vibro.setIcon(isVibrationOn() ? 'vibrate' : 'novibrate');
        sfx.tap();
      },
    });
    new Button(this, W / 2 + 120, sy, { w: 200, h: 120, icon: 'stats', onClick: () => this.go('Stats') });
    new Button(this, W / 2 + 360, sy, {
      w: 200,
      h: 120,
      icon: 'help',
      onClick: () => {
        sfx.tap();
        this.scene.launch('Rules', { cards: [...ALL_RULES], from: 'Profile', menuMode: true });
        this.scene.pause();
      },
    });
    ['Звук', 'Вибрация', 'Статистика', 'Как играть'].forEach((l, i) => text(this, W / 2 + (i - 1.5) * 240, sy + 85, l, 26, C.textDim, false));

    // Костюмы: купленные — надеть, остальные — в магазин
    text(this, W / 2, topY + 900, 'Костюмы Lumo', 40, C.textDim, false);
    const e = getEconomy();
    const costumes = SKINS.filter((x) => x.kind === 'costume');
    costumes.forEach((c, i) => {
      const x = W / 2 + ((i % 4) - 1.5) * 225;
      const y = topY + 1030 + Math.floor(i / 4) * 200;
      const owned = e.skins.owned.includes(c.id);
      const badge = createAvatarBadge(this, x, y, 82, c.avatar ?? 0, {
        locked: !owned,
        selected: e.skins.equipped.costume === c.id,
        lockLabel: c.special ? 'особый' : c.source === 'village' ? 'деревня' : `${c.price}`,
        lantern: look.lantern,
      });
      badge.setSize(180, 180).setInteractive({ useHandCursor: true });
      badge.on('pointerup', () => {
        if (!owned) {
          sfx.tap();
          this.scene.start('Shop', { kind: 'costume' });
          return;
        }
        equipSkin(c.id);
        sfx.tap();
        this.scene.restart();
      });
    });

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
    text(this, W / 2, rowY - 115, `ID игрока: ${profile.playerId.slice(0, 8)}`, 24, C.textDim, false).setAlpha(0.4);
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

  private go(scene: string) {
    sfx.tap();
    this.cameras.main.fadeOut(150, 11, 15, 39);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start(scene));
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
