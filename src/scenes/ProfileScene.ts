// Экран «Профиль»: Lumo в надетом образе, имя (можно сменить), сводка, настройки (звук, вибрация,
// статистика, «Как играть»), образ (кнопка в гардероб) и язык интерфейса (ru / en / uk, по умолчанию — системы);
// в приложении — «Настройки конфиденциальности» (форма Google UMP) и «Восстановить покупки».

import Phaser from 'phaser';
import { LEVELS } from '../levels/index';
import { isMusicOn, isMuted, setMusicOn, setMuted, sfx } from '../audio';
import { isVibrationOn, setVibration } from '../haptics';
import { displayName, getProfile, levelsPassed, totalStars } from '../profile';
import { WARDROBE } from '../core/wardrobe';
import { getLocale, LANGS, setLocale, systemLang, t, type Lang } from '../i18n';
import { getEconomy } from '../meta';
import { logEvent } from '../storage';
import { analyticsOn, setAnalyticsChoice } from '../analytics/index';
import { privacyOptionsAvailable, showPrivacyOptions, storeSupported } from '../monetization/index';
import { applyConsentAnalytics } from './ConsentScene';
import { restoreWithToast } from '../ui/storeUi';
import { SaveService } from '../save/SaveService';
import { Modal } from '../ui/Modal';
import { uiText } from '../ui/UIText';
import { ALL_RULES } from '../tutorial';
import { addBackground, Button, createAvatarBadge, layoutRow, text, type IconName } from '../ui/draw';
import { showNameDialog } from '../ui/NameDialog';
import { addTabBar, toast } from '../ui/meta';
import { openPrivacy, sendFeedback } from '../feedback';
import { versionLabel } from '../version';
import { currentLook } from '../ui/skins';
import { Account } from '../cloud/account';
import { openAuthDialog } from '../ui/AuthDialog';
import { edgeRows, stretchLayout } from '../ui/viewport';
import { C, W } from '../ui/theme';

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
    const look = currentLook();
    const { topY, rowY } = edgeRows(bounds);

    text(this, W / 2, topY, t('tab_profile'), 64, C.text, true, { w: W - 120 });

    // Lumo в надетом костюме и имя
    createAvatarBadge(this, W / 2, topY + 230, 130, look, { selected: true, animate: true });
    const name = text(this, W / 2, topY + 410, displayName(profile), 64, C.text, true, { w: W - 260 });
    const edit = this.add.graphics();
    drawEditIcon(edit, 40, C.icon);
    edit.setPosition(name.x + name.width / 2 + 45, topY + 410);
    const nameZone = this.add.zone(W / 2, topY + 410, Math.max(400, name.width + 160), 110).setInteractive({ useHandCursor: true });
    nameZone.on('pointerup', () => {
      sfx.tap();
      showNameDialog(this, { title: t('name_title'), withAvatars: false, secondary: 'cancel', onClose: () => this.scene.restart() });
    });

    // Сводка: 4 карточки в ряд
    const cards: [string, string][] = [
      [t('fraction', { a: stars, b: MAX_STARS() }), t('profile_stars', { n: stars })],
      [t('fraction', { a: levelsPassed(), b: LEVELS.length }), t('profile_levels', { n: levelsPassed() })],
      [String(profile.dayStreak), t('profile_days', { n: profile.dayStreak })],
      [String(profile.hintsUsed), t('profile_hints', { n: profile.hintsUsed })],
    ];
    const g = this.add.graphics();
    cards.forEach(([value, label], i) => {
      const x = W / 2 + (i - 1.5) * 245;
      const y = topY + 560;
      g.fillStyle(0x000000, 0.25);
      g.fillRoundedRect(x - 112, y - 65 + 6, 224, 140, 30);
      g.fillStyle(C.card, 1);
      g.fillRoundedRect(x - 112, y - 65, 224, 140, 30);
      text(this, x, y - 15, value, 46, i === 0 ? '#ffd36b' : C.text, true, { w: 200 });
      text(this, x, y + 40, label, 26, C.textDim, false, { w: 204, lines: 2, h: 60 });
    });

    // Настройки: звук, вибрация, статистика, «Как играть»
    const sy = topY + 740;
    const toggle = (i: number, setting: string, on: () => boolean, set: (v: boolean) => void, iconOn: IconName, iconOff: IconName) => {
      const b: Button = new Button(this, W / 2 + (i - 2) * 200, sy, {
        w: 176,
        h: 116,
        icon: on() ? iconOn : iconOff,
        onClick: () => {
          set(!on());
          b.setIcon(on() ? iconOn : iconOff);
          logEvent({ ev: 'settings_change', item: setting, value: on() ? 'on' : 'off' });
          sfx.tap();
        },
      });
    };
    toggle(0, 'music', isMusicOn, setMusicOn, 'music', 'nomusic');
    toggle(1, 'sounds', () => !isMuted(), (v) => setMuted(!v), 'sound', 'mute');
    toggle(2, 'vibration', isVibrationOn, setVibration, 'vibrate', 'novibrate');
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
    [t('set_music'), t('set_sounds'), t('set_vibration'), t('set_stats'), t('tutorial_replay')].forEach((l, i) => text(this, W / 2 + (i - 2) * 200, sy + 92, l, 24, C.textDim, false, { w: 190, lines: 2, h: 66 }));

    // Образ: Lumo, сколько вещей, кнопка «Гардероб» (выбор и покупка — в магазине)
    const e = getEconomy();
    const cy = topY + 960;
    const cg = this.add.graphics();
    cg.fillStyle(0x000000, 0.25);
    cg.fillRoundedRect(W / 2 - 440, cy - 80 + 6, 880, 160, 36);
    cg.fillStyle(C.card, 1);
    cg.fillRoundedRect(W / 2 - 440, cy - 80, 880, 160, 36);
    createAvatarBadge(this, W / 2 - 340, cy, 62, look);
    const wbtn = new Button(this, 0, cy, { w: 230, h: 96, icon: 'wardrobe', label: t('wardrobe'), fontSize: 34, primary: true, maxW: 360, onClick: () => this.go('Shop', { tab: 'wardrobe' }) });
    wbtn.setX(W / 2 + 420 - wbtn.buttonWidth / 2);
    const tw = W / 2 + 420 - wbtn.buttonWidth - 30 - (W / 2 - 250);
    uiText(this, W / 2 - 250, cy - 22, t('profile_look'), { w: tw, size: 40, originX: 0, align: 'left' });
    uiText(this, W / 2 - 250, cy + 28, t('profile_items', { n: e.wardrobe.owned.length, total: WARDROBE.length }), { w: tw, size: 28, color: C.textDim, bold: false, originX: 0, align: 'left' });

    // Язык интерфейса
    new Button(this, W / 2, cy + 150, { w: 520, h: 96, icon: 'globe', label: t('language_button', { lang: t(`lang_${getLocale() === 'qps' ? 'en' : getLocale()}` as 'lang_en') }), fontSize: 34, onClick: () => this.chooseLanguage() });

    // Средний ряд: в приложении — «Восстановить покупки» (требование App Store), в вебе — анонимная статистика.
    // Статистика и форма согласия Google (UMP) — ещё и в окне «Конфиденциальность».
    const statsLabel = () => t(analyticsOn() ? 'set_analytics_on' : 'set_analytics_off');
    const midY = (cy + 150 + rowY - 320) / 2;
    if (storeSupported()) new Button(this, W / 2, midY, { w: 640, h: 88, icon: 'restart', label: t('restore_purchases'), fontSize: 30, onClick: () => void restoreWithToast(this) });
    else {
      const statsBtn: Button = new Button(this, W / 2, midY, {
        w: 640,
        h: 88,
        icon: 'stats',
        label: statsLabel(),
        fontSize: 30,
        onClick: () => {
          sfx.tap();
          setAnalyticsChoice(analyticsOn() ? 'no' : 'yes', 'profile');
          statsBtn.setLabel(statsLabel());
        },
      });
    }

    // Аккаунт: гость — предложение войти; вошёл — email и управление аккаунтом.
    const user = Account.user;
    const label = user ? shortEmail(user.email) : t('login_or_register');
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
    text(this, W / 2, rowY - 115, t('profile_id_version', { id: profile.playerId.slice(0, 8), version: versionLabel() }), 24, C.textDim, false, { w: W - 80 }).setAlpha(0.5);
    // Для тестеров: отзыв на почту (со статистикой и версией) и политика конфиденциальности.
    const feedbackBtn = new Button(this, W / 2 - 200, rowY - 320, {
      w: 380,
      h: 96,
      icon: 'copy',
      label: t('feedback'),
      fontSize: 32,
      onClick: () => {
        sfx.tap();
        void sendFeedback().then((ok) => toast(this, ok ? t('feedback_ok') : t('feedback_no_address'), rowY - 440));
      },
    });
    const privacyBtn = new Button(this, W / 2 + 200, rowY - 320, { w: 380, h: 96, icon: 'lock', label: t('privacy'), fontSize: 30, onClick: () => (sfx.tap(), this.showPrivacy()) });
    layoutRow([feedbackBtn, privacyBtn], W / 2, 24);
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

  /** Выбор языка: ru / en / uk; «как в системе» — снять выбор. */
  /** «Конфиденциальность»: политика, «Настройки конфиденциальности» (форма Google UMP, в приложении), анонимная статистика. */
  showPrivacy() {
    const m = new Modal(this, { w: 900 });
    m.title(t('privacy'), 56);
    const statsLabel = () => t(analyticsOn() ? 'set_analytics_on' : 'set_analytics_off');
    const stats: Button = new Button(this, 0, 0, {
      w: 700,
      h: 96,
      icon: 'stats',
      label: statsLabel(),
      fontSize: 32,
      onClick: () => {
        sfx.tap();
        setAnalyticsChoice(analyticsOn() ? 'no' : 'yes', 'profile');
        stats.setLabel(statsLabel());
      },
    });
    if (privacyOptionsAvailable()) {
      m.buttons([
        new Button(this, 0, 0, {
          w: 700,
          h: 96,
          icon: 'shield',
          label: t('privacy_settings'),
          fontSize: 32,
          onClick: () => {
            sfx.tap();
            void showPrivacyOptions().then((r) => {
              applyConsentAnalytics(r?.analytics ?? null);
              if (stats.scene) stats.setLabel(statsLabel());
            });
          },
        }),
      ]);
    }
    m.buttons([stats]);
    m.buttons([new Button(this, 0, 0, { w: 700, h: 96, icon: 'lock', label: t('privacy_policy'), fontSize: 32, onClick: () => (sfx.tap(), openPrivacy()) })]);
    m.open();
    return m;
  }

  private chooseLanguage() {
    sfx.tap();
    const m = new Modal(this, { w: 760 });
    m.title(t('language_title'), 56);
    const pick = (l: Lang | '') => {
      const before = getLocale();
      SaveService.update((d) => {
        d.progress.language = l;
      });
      const next = l || systemLang();
      setLocale(next);
      logEvent({ ev: 'language_change', item: `${before}->${next}` });
      m.close(true);
      this.scene.restart();
    };
    const cur = SaveService.load().progress.language;
    for (const l of LANGS) m.buttons([new Button(this, 0, 0, { w: 520, h: 100, label: t(`lang_${l}` as 'lang_en'), primary: cur === l, fontSize: 38, onClick: () => pick(l) })]);
    m.buttons([new Button(this, 0, 0, { w: 520, h: 90, label: t('lang_system'), primary: cur === '', fontSize: 32, onClick: () => pick('') })]);
    m.open();
  }

  private go(scene: string, data?: object) {
    sfx.tap();
    this.cameras.main.fadeOut(150, 11, 15, 39);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start(scene, data));
  }
}

/** Длинный email укорачиваем, чтобы влез в кнопку. */
function shortEmail(email: string | null): string {
  if (!email) return t('account');
  return email.length > 26 ? `${email.slice(0, 23)}…` : email;
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
