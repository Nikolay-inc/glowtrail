// Магазин скинов за монеты: костюмы Lumo (меняют Lumo на поле), формы фонаря, стиль дороги, стиль арки.
// «Особые» скины пока недоступны (под покупки в Р4), часть скинов — из деревни и ежедневной награды.

import Phaser from 'phaser';
import { sfx } from '../audio';
import { coins, SKINS, type Skin, type SkinKind } from '../core/economy';
import type { LanternShape } from '../core/avatars';
import { buySkin, equipSkin, getEconomy } from '../meta';
import { addBackground, Button, createAvatarBadge, createLumo, drawIcon, text } from '../ui/draw';
import { addTabBar, addWallet, drawCoin, toast } from '../ui/meta';
import { drawArchSample, drawRoadSample, equippedLook, type ArchStyle, type RoadStyle } from '../ui/skins';
import { stretchLayout } from '../ui/viewport';
import { C, H, W } from '../ui/theme';

const KINDS: { kind: SkinKind; label: string }[] = [
  { kind: 'costume', label: 'Костюмы' },
  { kind: 'lantern', label: 'Фонарь' },
  { kind: 'road', label: 'Дорога' },
  { kind: 'arch', label: 'Арка' },
];

export class ShopScene extends Phaser.Scene {
  private kind: SkinKind = 'costume';

  constructor() {
    super('Shop');
  }

  init(data: { kind?: SkinKind }) {
    if (data.kind) this.kind = data.kind;
  }

  create() {
    const bounds = stretchLayout(this);
    addBackground(this, { evening: true });
    this.cameras.main.fadeIn(150, 11, 15, 39);
    const topY = 100 + bounds.top;
    text(this, W / 2, topY, 'Магазин', 64);
    addWallet(this, W / 2, topY + 95);

    // Вкладки категорий
    KINDS.forEach((k, i) => {
      const x = W / 2 + (i - 1.5) * 240;
      new Button(this, x, topY + 210, {
        w: 225,
        h: 90,
        label: k.label,
        fontSize: 34,
        primary: k.kind === this.kind,
        onClick: () => {
          if (k.kind === this.kind) return;
          sfx.tap();
          this.scene.restart({ kind: k.kind });
        },
      });
    });

    const e = getEconomy();
    const items = SKINS.filter((s) => s.kind === this.kind);
    const look = equippedLook();
    items.forEach((s, i) => {
      const col = i % 3;
      const row = Math.floor(i / 3);
      const x = W / 2 + (col - 1) * 330;
      const y = topY + 470 + row * 430;
      this.drawItem(s, x, y, e.skins.owned.includes(s.id), e.skins.equipped[s.kind] === s.id, look.avatar, coins(e));
    });

    const rowY = 1730 + (bounds.bottom - H);
    addTabBar(this, 'Shop', rowY + 40, (k) => {
      this.cameras.main.fadeOut(150, 11, 15, 39);
      this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start(k));
    });
  }

  private drawItem(s: Skin, x: number, y: number, owned: boolean, equipped: boolean, avatar: number, money: number) {
    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.3);
    g.fillRoundedRect(x - 150, y - 170 + 8, 300, 390, 36);
    g.fillStyle(equipped ? 0x3a3418 : C.card, 1);
    g.fillRoundedRect(x - 150, y - 170, 300, 390, 36);
    g.lineStyle(equipped ? 7 : 3, equipped ? C.primary : s.special ? 0xc9a8ff : C.cardEdge, equipped ? 1 : 0.7);
    g.strokeRoundedRect(x - 150, y - 170, 300, 390, 36);
    // Превью
    const py = y - 55;
    if (s.kind === 'costume') createAvatarBadge(this, x, py, 95, s.avatar ?? 0, { selected: equipped });
    else if (s.kind === 'lantern') {
      const shape = s.id === 'lantern-default' ? undefined : (s.id.replace('lantern-', '') as LanternShape);
      createLumo(this, 190, avatar, false, shape).setPosition(x - 15, py + 10);
    } else if (s.kind === 'road') {
      const pg = this.add.graphics();
      pg.fillStyle(0x1e3a2e, 1);
      pg.fillRoundedRect(x - 110, py - 100, 220, 200, 24);
      drawRoadSample(pg, s.id.replace('road-', '') as RoadStyle, x + 20, py, 170);
    } else {
      const pg = this.add.graphics();
      drawArchSample(pg, s.id.replace('arch-', '') as ArchStyle, x, py, 62);
    }
    text(this, x, y + 80, s.name, 32).setWordWrapWidth(270);
    // Кнопка / статус
    const by = y + 174;
    if (equipped) text(this, x, by, 'Надето', 34, '#ffd36b');
    else if (owned) new Button(this, x, by, { w: 230, h: 80, label: 'Надеть', fontSize: 34, onClick: () => this.equip(s) });
    else if (s.special) {
      text(this, x, by - 14, 'Особый', 32, '#c9a8ff');
      text(this, x, by + 22, 'скоро', 26, C.textDim, false);
    } else if (s.source === 'village') {
      const lg = this.add.graphics().setPosition(x - 80, by);
      drawIcon(lg, 'lock', 40, C.iconDisabled);
      text(this, x + 20, by, 'В деревне', 30, C.textDim, false);
    } else {
      const b = new Button(this, x, by, { w: 230, h: 80, label: `${s.price}`, fontSize: 38, primary: money >= s.price, onClick: () => this.buy(s) });
      const cg = this.add.graphics();
      drawCoin(cg, x - 70, by, 20);
      b.setDepth(1);
      cg.setDepth(2);
      if (s.source === 'daily') text(this, x, y + 110, 'или в награде дня', 22, '#ffd36b', false);
    }
  }

  private buy(s: Skin) {
    const r = buySkin(s.id);
    if (!r.ok) {
      sfx.invalid();
      toast(this, r.error === 'notEnoughCoins' ? 'Не хватает монет — проходи уровни' : 'Пока недоступно');
      return;
    }
    sfx.win();
    toast(this, `«${s.name}» — надето!`);
    this.time.delayedCall(500, () => this.scene.restart({ kind: this.kind }));
  }

  private equip(s: Skin) {
    equipSkin(s.id);
    sfx.tap();
    this.scene.restart({ kind: this.kind });
  }
}
