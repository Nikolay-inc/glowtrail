// Кнопка «… за ролик» (иконка ролика) и обёртка показа рекламы: на время ролика музыка и звуки игры молчат.
// Кнопки нет, если роликов нет (веб-версия, выключено в Remote Config, лимит дня, ждём 60 с после ошибки).
// Не загрузился — понятное сообщение, награды нет, кнопка прячется; закрыл раньше времени — «досмотри до конца».

import Phaser from 'phaser';
import { resumeAudio, suspendAudio } from '../audio';
import { t } from '../i18n';
import { logAdOffer, maybeInterstitial, playRewarded, rewardedReady } from '../monetization/index';
import type { RewardedPlace } from '../monetization/rules';
import { Button, drawIcon } from './draw';
import { richText, toast } from './meta';
import { C } from './theme';

/** Показ рекламы без звуков игры (AdMob играет свой звук поверх WebView). */
export async function withAdAudio<T>(fn: () => Promise<T>): Promise<T> {
  suspendAudio();
  try {
    return await fn();
  } finally {
    resumeAudio();
  }
}

export interface RewardedButtonOpts {
  place: RewardedPlace;
  label: string;
  w: number;
  h: number;
  fontSize?: number;
  primary?: boolean;
  level?: string;
  /** Ролик досмотрен — выдать награду. */
  onReward: () => void;
  /** Где показать сообщение (по умолчанию — внизу экрана). */
  toastY?: number;
}

/** Кнопка ролика или null, если ролик сейчас предложить нельзя. Показ кнопки пишется в лог (ad_offer). */
export function rewardedButton(scene: Phaser.Scene, x: number, y: number, o: RewardedButtonOpts): Button | null {
  if (!rewardedReady()) return null;
  logAdOffer(o.place, o.level);
  let busy = false;
  const btn = new Button(scene, x, y, {
    w: o.w,
    h: o.h,
    icon: 'video',
    label: o.label,
    fontSize: o.fontSize,
    primary: o.primary,
    onClick: () => {
      if (busy) return;
      busy = true;
      btn.setEnabled(false);
      void withAdAudio(() => playRewarded(o.place, o.level)).then((r) => {
        busy = false;
        if (!btn.scene) return r === 'rewarded' && o.onReward();
        if (r === 'rewarded') {
          btn.setVisible(false);
          o.onReward();
        } else if (r === 'failed') {
          btn.setVisible(false);
          toast(scene, t('ad_failed'), o.toastY);
        } else {
          btn.setEnabled(true);
          toast(scene, t('ad_not_finished'), o.toastY);
        }
      });
    },
  });
  return btn;
}

/**
 * Кнопка ролика с подписью со значками валют (`rich`: «×2: +25 {coin}»): иконка ролика слева, подпись справа.
 * null — ролик сейчас предложить нельзя.
 */
export function rewardedRichButton(scene: Phaser.Scene, x: number, y: number, o: Omit<RewardedButtonOpts, 'label'> & { rich: string }): Button | null {
  const btn = rewardedButton(scene, x, y, { ...o, label: '' });
  if (!btn) return null;
  // Подпись — своя (со значками), иконка — рядом слева; кнопка растёт под обе. Свою центральную иконку кнопка убирает.
  btn.setIcon(undefined as unknown as 'video');
  const h = o.h;
  const color = o.primary ? '#2a1a05' : C.text;
  const label = richText(scene, 0, 0, o.rich, o.fontSize ?? Math.round(h * 0.38), color, true, 0, !!o.primary);
  const lw = label.width * label.scaleX;
  const iconW = h * 0.5;
  const gap = h * 0.16;
  const content = iconW + gap + lw;
  btn.add(label);
  btn.fitContent(content);
  label.setX(-content / 2 + iconW + gap + lw / 2);
  // Иконку кнопки рисуем сами слева (у Button без текстовой подписи она по центру).
  const ig = scene.add.graphics().setPosition(-content / 2 + iconW / 2, 0);
  drawIcon(ig, 'video', h * 0.62, o.primary ? 0x2a1a05 : C.icon);
  btn.add(ig);
  return btn;
}

/** Межуровневая реклама (если пора) без звуков игры, затем переход. */
export function interstitialThen(c: { levelNum: number; tutorial: boolean; intro: boolean; level?: string }, next: () => void) {
  void maybeInterstitial(c, withAdAudio).finally(next);
}
