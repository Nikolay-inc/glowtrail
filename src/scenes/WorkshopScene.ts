// «Мастерская» (в деревне): прокачка способностей за монеты и подсказки.
// «Отложить» 1 → 2 слота, «Поворот плитки» (открывается в деревне) 1 → 2 → 3 заряда, «Фонарик» 2 → 3 → 4 → 5 плиток.
// Подсказки: 3 бесплатные в день, покупка за монеты и «бесплатно за рекламу» (пока заглушка).

import Phaser from 'phaser';
import { setMusicMood, sfx } from '../audio';
import { FREE_HINTS_PER_DAY, freeHintsLeft, HINT_PRICE, upgradePrice, UPGRADES, type UpgradeId } from '../core/economy';
import { adHint, buyHint, buyUpgrade, getEconomy, today } from '../meta';
import { addBackground, Button, drawIcon, layoutRow, text, type IconName } from '../ui/draw';
import { addTabBar, addWallet, buttonRichLabel, COIN, drawCoin, toast } from '../ui/meta';
import { edgeRows, stretchLayout } from '../ui/viewport';
import { C, FONT, W } from '../ui/theme';

const DESCR: Record<UpgradeId, string> = {
  stash: 'Держи в запасе больше плиток: второй слот «отложить»',
  rotate: 'Поверни плитку в лотке на 90° — заряды на каждый уровень',
  lantern: 'Видно больше следующих плиток колоды',
};
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
    text(this, W / 2, topY, 'Мастерская', 64);
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
      text(this, TEXT_X, y - 62, title, 46).setOrigin(0, 0.5);
      const d = this.add.text(TEXT_X, y - 32, descr, { fontFamily: FONT, fontSize: '28px', color: C.textDim, wordWrap: { width: TEXT_W } }).setOrigin(0, 0);
      if (d.height > 76) d.setFontSize(24);
    };

    const ids: UpgradeId[] = ['stash', 'rotate', 'lantern'];
    ids.forEach((id, i) => {
      const def = UPGRADES[id];
      const lvl = e.upgrades[id];
      const y = topY + 330 + i * 275;
      card(y, 240);
      const ig = this.add.graphics().setPosition(ICON_X, y);
      drawIcon(ig, ICON[id], 110, C.icon);
      textBlock(y, def.name, DESCR[id]);
      // Уровни — точками под текстом
      const dots = this.add.graphics();
      for (let k = 1; k < def.values.length; k++) {
        dots.fillStyle(k <= lvl ? C.primary : C.starEmpty, 1);
        dots.fillCircle(TEXT_X + 14 + (k - 1) * 40, y + 78, 13);
      }
      const now = def.values[lvl];
      text(this, TEXT_X + (def.values.length - 1) * 40 + 10, y + 78, id === 'rotate' && lvl === 0 ? 'нет' : `${now} ${unit(id, now)}`, 30, C.text, false).setOrigin(0, 0.5);
      const price = upgradePrice(e, id);
      const maxed = lvl >= def.values.length - 1;
      if (maxed) text(this, BTN_X, y, 'Максимум', 36, '#8ef0c8');
      else if (price === null) {
        text(this, BTN_X, y - 18, 'Откроется', 30, C.textDim, false);
        text(this, BTN_X, y + 18, 'в деревне', 30, C.textDim, false);
      } else {
        new Button(this, BTN_X, y, { w: 210, h: 100, label: `${price}`, fontSize: 42, primary: true, onClick: () => this.buy(id) }).setDepth(1);
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
    textBlock(hy - 30, `Подсказки: ${free + e.hints.bank}`, `Бесплатных сегодня ${free} из ${FREE_HINTS_PER_DAY}, в запасе ${e.hints.bank}`);
    const buyBtn = new Button(this, 360, hy + 85, {
      w: 380,
      h: 96,
      onClick: () => {
        const r = buyHint();
        if (r.ok) {
          sfx.star(1);
          toast(this, 'Подсказка куплена');
          this.scene.restart();
        } else {
          sfx.invalid();
          toast(this, `Не хватает ${COIN}`);
        }
      },
    });
    buttonRichLabel(buyBtn, `Купить за ${HINT_PRICE} ${COIN}`, 34, false);
    const adBtn = new Button(this, 770, hy + 85, {
      w: 400,
      h: 96,
      icon: 'play',
      label: 'За рекламу',
      fontSize: 34,
      onClick: () => {
        // Заглушка до Р4: настоящая реклама подключится позже, подсказка выдаётся сразу.
        adHint();
        sfx.star(0);
        toast(this, 'Реклама появится позже — подсказка уже твоя');
        this.time.delayedCall(900, () => this.scene.restart());
      },
    });
    layoutRow([buyBtn, adBtn], 570, 24, 880);
    wallet.refresh();
    addTabBar(this, 'Village', rowY + 40, (k) => this.go(k));
  }

  private buy(id: UpgradeId) {
    const r = buyUpgrade(id);
    if (!r.ok) {
      sfx.invalid();
      toast(this, r.error === 'notEnoughCoins' ? `Не хватает ${COIN} — проходи уровни` : 'Пока недоступно');
      return;
    }
    sfx.win();
    toast(this, `${UPGRADES[id].name}: уровень ${r.value}`);
    this.time.delayedCall(600, () => this.scene.restart());
  }

  private go(scene: string) {
    sfx.tap();
    this.cameras.main.fadeOut(180, 11, 15, 39);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start(scene));
  }
}

function unit(id: UpgradeId, n: number) {
  if (id === 'stash') return n === 1 ? 'слот' : 'слота';
  if (id === 'rotate') return n === 1 ? 'заряд' : 'заряда';
  return 'плитки';
}
