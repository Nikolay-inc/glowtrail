// «Мастерская» (в деревне): прокачка способностей за монеты и подсказки.
// «Отложить» 1 → 2 слота, «Поворот плитки» (открывается в деревне) 1 → 2 → 3 заряда, «Фонарик» 2 → 3 → 4 → 5 плиток.
// Подсказки: 3 бесплатные в день, покупка за монеты и «бесплатно за рекламу» (пока заглушка).

import Phaser from 'phaser';
import { sfx } from '../audio';
import { FREE_HINTS_PER_DAY, freeHintsLeft, HINT_PRICE, upgradePrice, UPGRADES, type UpgradeId } from '../core/economy';
import { adHint, buyHint, buyUpgrade, getEconomy, today } from '../meta';
import { addBackground, Button, drawIcon, drawTileIcon, text } from '../ui/draw';
import { addTabBar, addWallet, drawCoin, toast } from '../ui/meta';
import { stretchLayout } from '../ui/viewport';
import { C, H, W } from '../ui/theme';

const DESCR: Record<UpgradeId, string> = {
  stash: 'Слоты «отложить»: держи в запасе больше плиток',
  rotate: 'Поверни плитку в лотке на 90° (заряды на уровень)',
  lantern: 'Фонарик: сколько следующих плиток колоды видно',
};

export class WorkshopScene extends Phaser.Scene {
  constructor() {
    super('Workshop');
  }

  create() {
    const bounds = stretchLayout(this);
    addBackground(this, { evening: true });
    this.cameras.main.fadeIn(200, 11, 15, 39);
    const topY = 100 + bounds.top;
    new Button(this, 90, topY, { w: 130, h: 130, icon: 'back', onClick: () => this.go('Village') });
    text(this, W / 2, topY, 'Мастерская', 64);
    const wallet = addWallet(this, W / 2, topY + 100);
    const e = getEconomy();

    (['stash', 'rotate', 'lantern'] as UpgradeId[]).forEach((id, i) => {
      const def = UPGRADES[id];
      const lvl = e.upgrades[id];
      const y = 420 + i * 300;
      const g = this.add.graphics();
      g.fillStyle(0x000000, 0.3);
      g.fillRoundedRect(60, y - 120 + 8, W - 120, 250, 40);
      g.fillStyle(C.card, 1);
      g.fillRoundedRect(60, y - 120, W - 120, 250, 40);
      const ig = this.add.graphics().setPosition(170, y - 10);
      if (id === 'stash') drawIcon(ig, 'plus', 110, C.icon);
      else if (id === 'rotate') drawTileIcon(ig, 'right', 120, C.icon);
      else drawIcon(ig, 'bulb', 110, C.icon);
      text(this, 270, y - 70, def.name, 50).setOrigin(0, 0.5);
      text(this, 270, y - 15, DESCR[id], 30, C.textDim, false).setOrigin(0, 0.5).setWordWrapWidth(470);
      // Уровни: точки
      for (let k = 1; k < def.values.length; k++) {
        g.fillStyle(k <= lvl ? C.primary : C.starEmpty, 1);
        g.fillCircle(290 + (k - 1) * 46, y + 70, 15);
      }
      const now = def.values[lvl];
      text(this, 270 + def.values.length * 46, y + 70, id === 'rotate' && lvl === 0 ? 'нет' : `${now} ${unit(id, now)}`, 32, C.text).setOrigin(0, 0.5);
      const price = upgradePrice(e, id);
      const maxed = lvl >= def.values.length - 1;
      const bx = W - 200;
      if (maxed) text(this, bx, y, 'Максимум', 38, '#8ef0c8');
      else if (price === null) {
        text(this, bx, y - 20, 'Откроется', 32, C.textDim, false);
        text(this, bx, y + 20, 'в Мастерской деревни', 26, C.textDim, false);
      } else {
        const b = new Button(this, bx, y, { w: 230, h: 110, label: `${price}`, fontSize: 44, primary: true, onClick: () => this.buy(id) });
        const cg = this.add.graphics();
        drawCoin(cg, bx - 70, y, 22);
        b.setDepth(1);
        cg.setDepth(2);
      }
    });

    // Подсказки
    const hy = 1340;
    const hg = this.add.graphics();
    hg.fillStyle(0x000000, 0.3);
    hg.fillRoundedRect(60, hy - 130 + 8, W - 120, 280, 40);
    hg.fillStyle(C.card, 1);
    hg.fillRoundedRect(60, hy - 130, W - 120, 280, 40);
    const bulb = this.add.graphics().setPosition(170, hy - 40);
    drawIcon(bulb, 'bulb', 110, C.icon);
    const free = freeHintsLeft(e, today());
    text(this, 270, hy - 80, `Подсказки: ${free + e.hints.bank}`, 50).setOrigin(0, 0.5);
    text(this, 270, hy - 25, `Бесплатных сегодня ${free} из ${FREE_HINTS_PER_DAY}, в запасе ${e.hints.bank}`, 30, C.textDim, false).setOrigin(0, 0.5);
    new Button(this, 330, hy + 75, {
      w: 400,
      h: 100,
      label: `Купить за ${HINT_PRICE}`,
      fontSize: 36,
      onClick: () => {
        const r = buyHint();
        if (r.ok) {
          sfx.star(1);
          toast(this, 'Подсказка куплена');
          this.scene.restart();
        } else {
          sfx.invalid();
          toast(this, 'Не хватает монет');
        }
      },
    });
    new Button(this, 760, hy + 75, {
      w: 420,
      h: 100,
      icon: 'play',
      label: 'За рекламу',
      fontSize: 36,
      onClick: () => {
        // Заглушка до Р4: настоящая реклама подключится позже, подсказка выдаётся сразу.
        adHint();
        sfx.star(0);
        toast(this, 'Реклама появится позже — подсказка уже твоя');
        this.time.delayedCall(900, () => this.scene.restart());
      },
    });
    wallet.refresh();

    const rowY = 1730 + (bounds.bottom - H);
    addTabBar(this, 'Village', rowY + 40, (k) => this.go(k));
  }

  private buy(id: UpgradeId) {
    const r = buyUpgrade(id);
    if (!r.ok) {
      sfx.invalid();
      toast(this, r.error === 'notEnoughCoins' ? 'Не хватает монет — проходи уровни' : 'Пока недоступно');
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
