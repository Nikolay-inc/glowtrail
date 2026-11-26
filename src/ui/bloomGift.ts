// Награда испытания (уровни 10, 20, 30 главы): окно «Награда испытания» — шаг улицы уже выдан, расцвет постройки
// игрок выбирает сам. Нет постройки на 2-м уровне — подарок ждёт (понятная подпись), «Позже» — тоже ждёт.
// Работает в любой сцене (экран победы, деревня); окно — src/ui/Modal.ts.

import Phaser from 'phaser';
import { sfx } from '../audio';
import { bonusValue } from '../core/economy';
import { BONUS, buildingDef } from '../core/villageData';
import { haptics } from '../haptics';
import { t, tk } from '../i18n';
import { bloomGift, getEconomy, useBloomGift } from '../meta';
import { Button } from './draw';
import { bonusIcon } from './itemPreview';
import { smartText } from './meta';
import { Modal } from './Modal';
import { C } from './theme';
import { uiText } from './UIText';
import { illustration } from './villagePanels';

export interface BloomGiftOpts {
  /** Шаг улицы, выданный только что (показать строкой). */
  street?: string | null;
  /** Монеты вместо шага улицы (все улицы уже мощёные). */
  coins?: number;
  /** Окно закрыто (выбран расцвет или «Позже»). */
  onClose?: () => void;
  /** Расцвет выбран — перерисовать сцену. */
  onBloom?: (id: string) => void;
  /** Где держать ссылку на открытое окно (деревня закрывает его перед своими окнами). */
  track?: (m: Modal | undefined) => void;
}

const name = (id: string) => tk(`building.${id}.name`);

/** Окно награды испытания: выбор постройки для расцвета или «подарок ждёт». */
export function showBloomGift(scene: Phaser.Scene, o: BloomGiftOpts = {}): Modal {
  const gift = bloomGift();
  const m = new Modal(scene, { w: 940, accent: 0xffd36b, onClose: () => (o.track?.(undefined), o.onClose?.()) });
  o.track?.(m);
  m.title(t('challenge_gift_title'), 56, '#ffd36b');
  if (o.street) m.text(t('street_free', { name: tk(`street.${o.street.replace(':', '.')}`) }), 34, C.text, 2, true);
  else if (o.coins) m.rich(t('reward.coins', { n: o.coins }), 44, '#ffd36b');
  if (!gift.candidates.length) {
    m.text(t('bloom_gift_wait'), 34, C.textDim, 4);
    m.buttons([new Button(scene, 0, 0, { w: 360, h: 110, label: t('rule_ok'), primary: true, onClick: () => m.close() })]);
    return m.open();
  }
  m.text(t(gift.pending > 1 ? 'bloom_gift_pick_n' : 'bloom_gift_pick', { n: gift.pending }), 34, C.textDim, 3);
  // Постройки на 2-м уровне — карточками в две колонки.
  const cols = 2;
  const gap = 18;
  const cw = (m.inner - gap) / cols;
  const ch = 112;
  gift.candidates.forEach((_, i) => {
    if (i % cols !== 0) return;
    const row = scene.add.container(0, 0);
    for (let k = 0; k < cols && i + k < gift.candidates.length; k++) {
      const bid = gift.candidates[i + k];
      const x = -m.inner / 2 + cw / 2 + k * (cw + gap);
      const g = scene.add.graphics();
      g.fillStyle(C.card, 1);
      g.fillRoundedRect(x - cw / 2, -ch / 2, cw, ch, 26);
      g.lineStyle(3, 0xffd36b, 0.7);
      g.strokeRoundedRect(x - cw / 2, -ch / 2, cw, ch, 26);
      row.add(g);
      row.add(bonusIcon(scene, bid, 56).setPosition(x - cw / 2 + 52, 0));
      row.add(uiText(scene, x - cw / 2 + 96, -18, name(bid), { w: cw - 116, lines: 1, size: 28, color: C.text, bold: true, originX: 0, align: 'left' }));
      if (BONUS[bid]) row.add(smartText(scene, x - cw / 2 + 96, 22, tk(`bonus.${bid}`, { n: bonusValue(getEconomy(), bid, 3) }), { w: cw - 116, size: 22, color: '#9dff5c', bold: false, originX: 0, lines: 1 }));
      const z = scene.add.zone(x, 0, cw, ch).setInteractive({ useHandCursor: true });
      z.on('pointerup', () => pick(scene, m, bid, o));
      row.add(z);
    }
    m.add(row, ch, 14);
  });
  m.buttons([new Button(scene, 0, 0, { w: 320, h: 100, label: t('later'), onClick: () => m.close() })]);
  return m.open();
}

function pick(scene: Phaser.Scene, m: Modal, id: string, o: BloomGiftOpts) {
  if (!buildingDef(id) || !useBloomGift(id)) return sfx.invalid();
  sfx.win();
  haptics.win();
  const rest = { ...o, street: null, coins: 0 };
  m.close(true);
  o.onBloom?.(id);
  // «{name} в расцвете!» — постройка на 3-м уровне и её бонус.
  const r = new Modal(scene, { w: 860, accent: 0xffd36b, onClose: () => (o.track?.(undefined), bloomGift().pending && bloomGift().candidates.length ? showBloomGift(scene, rest) : o.onClose?.()) });
  o.track?.(r);
  r.add(illustration(scene, id, 3, 300).c, 300, 20);
  r.title(t('bloom_title', { name: name(id) }), 52);
  r.text(t('upgrade_look_3'), 32, C.textDim, 2);
  if (BONUS[id]) r.add(smartText(scene, 0, 0, tk(`bonus.${id}`, { n: bonusValue(getEconomy(), id, 3) }), { w: r.inner, size: 32, color: '#9dff5c', lines: 2 }), 80, 20);
  r.buttons([new Button(scene, 0, 0, { w: 360, h: 110, label: t('restored_ok'), primary: true, onClick: () => r.close() })]);
  r.open();
}
