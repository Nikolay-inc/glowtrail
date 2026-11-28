// «Мастерская» (в деревне): прокачка способностей за монеты и подсказки.
// «Отложить» 1 → 2 слота, «Поворот плитки» (открывается в деревне) 1 → 2 → 3 заряда, «Фонарик» 2 → 3 → 4 → 5 плиток.
// Подсказки: 3 бесплатные в день, покупка за монеты и «Подсказка за ролик» (если ролик доступен).

import Phaser from 'phaser';
import { setMusicMood, sfx } from '../audio';
import { coins, freeHintsLeft, freeHintsPerDay, HINT_PRICE, upgradePrice, UPGRADES, type UpgradeId } from '../core/economy';
import { fmt, t, tk } from '../i18n';
import { adHint, buyHint, buyUpgrade, getEconomy, today } from '../meta';
import { addBackground, Button, drawIcon, layoutRow, text, type IconName } from '../ui/draw';
import { addTabBar, addWallet, buttonRichLabel, drawCoin, toast } from '../ui/meta';
import { rewardedButton } from '../ui/adButton';
import { showNotEnough } from '../ui/notEnough';
import { uiText } from '../ui/UIText';
import { edgeRows, stretchLayout } from '../ui/viewport';
import { C, W } from '../ui/theme';

const ICON: Record<UpgradeId, IconName> = { stash: 'stashbox', rotate: 'rotate', lantern: 'lantern' };

/** Карточка: иконка слева, справа — заголовок и описание одним блоком по левому краю, под ними уровни, цена справа. */
const CARD_L = 60;
const CARD_R = W - 60;
const ICON_X = 150;
const TEXT_X = 250;
const BTN_X = W - 190;
const TEXT_W = BTN_X - 130 - TEXT_X;

export class WorkshopScene extends Phaser.Scene {
  constructor() {
    super('Workshop');
  }

  create() {
    const bounds = stretchLayout(this);
    // В деревне музыка теплее; уходя — снова ночь.
    setMusicMood('warm');
    this.events.once('shutdown', () => setMusicMood('night'));
    addBackground(this, { evening: true });
    this.cameras.main.fadeIn(200, 11, 15, 39);
    const { topY, rowY } = edgeRows(bounds);
    new Button(this, 90, topY, { w: 130, h: 130, icon: 'back', onClick: () => this.go('Village') });
    text(this, W / 2, topY, t('village_workshop'), 64, C.text, true, { w: W - 340 });
    const wallet = addWallet(this, W / 2, topY + 100);
    const e = getEconomy();

    const card = (y: number, h: number) => {
      const g = this.add.graphics();
      g.fillStyle(0x000000, 0.3);
      g.fillRoundedRect(CARD_L, y - h / 2 + 8, CARD_R - CARD_L, h, 40);
      g.fillStyle(C.card, 1);
      g.fillRoundedRect(CARD_L, y - h / 2, CARD_R - CARD_L, h, 40);
      return g;
    };
    /** Заголовок и описание одним блоком по левому краю; длинное описание переносится и при нужде уменьшается. */
    const textBlock = (y: number, title: string, descr: string) => {
      uiText(this, TEXT_X, y - 62, title, { w: TEXT_W, size: 46, originX: 0, align: 'left' });
      uiText(this, TEXT_X, y - 32, descr, { w: TEXT_W, h: 84, lines: 2, size: 28, color: C.textDim, bold: false, originX: 0, originY: 0, align: 'left' });
    };

    const ids: UpgradeId[] = ['stash', 'rotate', 'lantern'];
    ids.forEach((id, i) => {
      const def = UPGRADES[id];
      const lvl = e.upgrades[id];
      const y = topY + 330 + i * 275;
      card(y, 240);
      const ig = this.add.graphics().setPosition(ICON_X, y);
      drawIcon(ig, ICON[id], 110, C.icon);
      textBlock(y, tk(`upgrade.${id}.name`), tk(`upgrade.${id}.descr`));
      // Уровни — точками под текстом
      const dots = this.add.graphics();
      for (let k = 1; k < def.values.length; k++) {
        dots.fillStyle(k <= lvl ? C.primary : C.starEmpty, 1);
        dots.fillCircle(TEXT_X + 14 + (k - 1) * 40, y + 78, 13);
      }
      const now = def.values[lvl];
      const dotsW = (def.values.length - 1) * 40 + 10;
      uiText(this, TEXT_X + dotsW, y + 78, id === 'rotate' && lvl === 0 ? t('upgrade_none') : tk(`upgrade.${id}.value`, { n: now }), { w: TEXT_W - dotsW, size: 30, bold: false, originX: 0, align: 'left' });
      const price = upgradePrice(e, id);
      const maxed = lvl >= def.values.length - 1;
      if (maxed) text(this, BTN_X, y, t('upgrade_max'), 36, '#8ef0c8', true, { w: 240, lines: 2 });
      else if (price === null) {
        text(this, BTN_X, y, t('upgrade_in_village'), 30, C.textDim, false, { w: 240, lines: 3 });
      } else {
        new Button(this, BTN_X, y, { w: 210, h: 100, label: fmt(price), fontSize: 42, primary: true, onClick: () => this.buy(id) }).setDepth(1);
        const cg = this.add.graphics().setDepth(2);
        drawCoin(cg, BTN_X - 62, y, 21);
      }
    });

    // Подсказки — такая же карточка, кнопки под текстом
    const hy = topY + 330 + 3 * 275 + 30;
    card(hy, 300);
    const bulb = this.add.graphics().setPosition(ICON_X, hy - 40);
    drawIcon(bulb, 'bulb', 110, C.icon);
    const free = freeHintsLeft(e, today());
    textBlock(hy - 30, t('hints_title', { n: free + e.hints.bank }), t('hints_descr', { free, total: freeHintsPerDay(e), bank: e.hints.bank }));
    const buyBtn = new Button(this, 360, hy + 85, {
      w: 380,
      h: 96,
      onClick: () => {
        const r = buyHint();
        if (r.ok) {
          sfx.star(1);
          toast(this, t('hint_bought'));
          this.scene.restart();
        } else showNotEnough(this, 'coins', HINT_PRICE - coins(getEconomy()));
      },
    });
    buttonRichLabel(buyBtn, t('buy_for', { n: HINT_PRICE }), 34, false);
    const adBtn = rewardedButton(this, 770, hy + 85, {
      place: 'hint',
      label: t('hint_for_ad'),
      w: 400,
      h: 96,
      fontSize: 34,
      onReward: () => {
        adHint();
        sfx.star(0);
        toast(this, t('hint_got_ad'));
        this.time.delayedCall(900, () => this.scene.restart());
      },
    });
    layoutRow(adBtn ? [buyBtn, adBtn] : [buyBtn], 570, 24, 880);
    wallet.refresh();
    addTabBar(this, 'Village', rowY + 40, (k) => this.go(k));
  }

  private buy(id: UpgradeId) {
    const r = buyUpgrade(id);
    if (!r.ok) {
      if (r.error === 'notEnoughCoins') showNotEnough(this, 'coins', (upgradePrice(getEconomy(), id) ?? 0) - coins(getEconomy()));
      else {
        sfx.invalid();
        toast(this, t('unavailable'));
      }
      return;
    }
    sfx.win();
    toast(this, t('upgrade_bought', { name: tk(`upgrade.${id}.name`), n: r.value }));
    this.time.delayedCall(600, () => this.scene.restart());
  }

  private go(scene: string) {
    sfx.tap();
    this.cameras.main.fadeOut(180, 11, 15, 39);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start(scene));
  }
}
