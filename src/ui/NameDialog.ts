// Окно «Как тебя зовут?»: поле имени (настоящий <input>, чтобы на телефоне открывалась клавиатура)
// и, при первом знакомстве, выбор аватарки из открытых.

import Phaser from 'phaser';
import { AVATARS } from '../core/avatars';
import { sfx } from '../audio';
import { DEFAULT_NAME, getProfile, NAME_MAX, setAvatar, setName, skipName } from '../profile';
import { Button, createAvatarBadge, text } from './draw';
import { Account } from '../cloud/account';
import { openAuthDialog } from './AuthDialog';
import { C, FONT, H, W } from './theme';

export interface NameDialogOptions {
  title: string;
  /** Показать выбор аватарки (первое знакомство). */
  withAvatars: boolean;
  /** Подпись второй кнопки: «Пропустить» при знакомстве, «Отмена» при смене имени. */
  secondary: 'skip' | 'cancel';
  onClose: () => void;
}

export function showNameDialog(scene: Phaser.Scene, opts: NameDialogOptions) {
  const profile = getProfile();
  let selected = profile.avatar;

  const o = scene.add.container(0, 0).setDepth(60);
  const dim = scene.add.rectangle(W / 2, H / 2, W * 4, H * 4, 0x060818, 0.7).setInteractive();
  // Окно в верхней половине экрана — снизу откроется клавиатура.
  const panelH = opts.withAvatars ? 900 : 620;
  const top = 200;
  const pw = 900;
  const panel = scene.add.graphics();
  panel.fillStyle(0x000000, 0.35);
  panel.fillRoundedRect(W / 2 - pw / 2, top + 14, pw, panelH, 60);
  panel.fillStyle(C.panel, 1);
  panel.fillRoundedRect(W / 2 - pw / 2, top, pw, panelH, 60);
  panel.lineStyle(6, C.cardEdge, 1);
  panel.strokeRoundedRect(W / 2 - pw / 2, top, pw, panelH, 60);
  o.add([dim, panel, text(scene, W / 2, top + 100, opts.title, 66)]);

  // Поле имени
  const input = scene.add.dom(W / 2, top + 240, 'input', {
    width: '640px',
    height: '110px',
    'font-size': '54px',
    'font-family': FONT,
    'font-weight': 'bold',
    'text-align': 'center',
    color: '#fff1cc',
    background: '#0f1436',
    border: '5px solid #4a57a8',
    'border-radius': '36px',
    outline: 'none',
    'box-sizing': 'border-box',
  });
  const node = input.node as HTMLInputElement;
  node.maxLength = NAME_MAX;
  node.placeholder = DEFAULT_NAME;
  node.value = profile.name ?? '';
  node.autocomplete = 'off';
  node.setAttribute('aria-label', 'Имя');
  node.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') done();
  });

  // Выбор аватарки — только открытые (остальные откроются за звёзды на экране «Профиль»).
  const badges: { id: number; c: Phaser.GameObjects.Container }[] = [];
  const drawBadges = () => {
    badges.forEach((b) => b.c.destroy());
    badges.length = 0;
    // Стартовые костюмы: выбранный станет твоим (остальные — в магазине).
    const open = AVATARS.slice(0, 4);
    const step = 190;
    const x0 = W / 2 - ((open.length - 1) * step) / 2;
    open.forEach((a, i) => {
      const c = createAvatarBadge(scene, x0 + i * step, top + 560, 78, a.id, { selected: a.id === selected, animate: a.id === selected });
      c.setSize(170, 170).setInteractive({ useHandCursor: true });
      c.on('pointerup', () => {
        selected = a.id;
        sfx.tap();
        drawBadges();
      });
      o.add(c);
      badges.push({ id: a.id, c });
    });
  };
  if (opts.withAvatars) {
    o.add(text(scene, W / 2, top + 400, 'Выбери фонарщика', 40, C.textDim, false));
    drawBadges();
  }

  const close = () => {
    input.destroy();
    o.destroy();
    opts.onClose();
  };
  const done = () => {
    setName(node.value);
    if (opts.withAvatars) setAvatar(selected);
    sfx.tap();
    close();
  };
  const btnY = top + panelH - 150;
  o.add(new Button(scene, W / 2 + 160, btnY, { w: 360, h: 130, label: 'Готово', primary: true, onClick: done }));
  o.add(
    new Button(scene, W / 2 - 200, btnY, {
      w: 280,
      h: 110,
      label: opts.secondary === 'skip' ? 'Пропустить' : 'Отмена',
      fontSize: 38,
      onClick: () => {
        if (opts.secondary === 'skip') skipName();
        sfx.tap();
        close();
      },
    }),
  );
  // При знакомстве — путь для тех, у кого уже есть аккаунт (прогресс подтянется из облака).
  if (opts.withAvatars && Account.configured && !Account.user) {
    const link = text(scene, W / 2, top + panelH + 70, 'У меня есть аккаунт — войти', 40, C.textDim, false);
    link.setInteractive({ useHandCursor: true });
    link.on('pointerup', () => {
      skipName();
      close();
      openAuthDialog('login');
    });
    o.add(link);
  }
  o.setAlpha(0);
  scene.tweens.add({ targets: o, alpha: 1, duration: 200 });
  input.setAlpha(0);
  scene.tweens.add({ targets: input, alpha: 1, duration: 200 });
  return close;
}
