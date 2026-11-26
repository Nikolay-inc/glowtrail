// Магазин: «Гардероб» Lumo (головной убор, лицо, одежда с цветами, посох с фонарём, аксессуар, питомец, след,
// готовые наборы) и стили поля — фонари, дороги, арки. В гардеробе сверху крупный анимированный Lumo (ходит,
// машет, поворачивается пальцем), «Примерить» показывает вещь до покупки, до 3 сохранённых образов.
// Глаголы по типу вещи — отдельные ключи: одежда и части образа «Надеть» / «Надето», фонарь, дорога, арка,
// посох, питомец, след — «Выбрать» / «Выбрано». «Особые» вещи — «скоро» (Р4).

import Phaser from 'phaser';
import { sfx } from '../audio';
import { coins, itemCost } from '../core/economy';
import { fullSet, itemById, itemsOf, MAX_SAVED_LOOKS, PART_SLOTS, setById, setItems, SETS, type Look, type PartSlot, type Rarity, type Slot, type WardrobeItem } from '../core/wardrobe';
import { fmt, t, tk } from '../i18n';
import { buyItem, canAfford, equipItem, equipSet, getEconomy, loadOutfit, saveOutfit, wallet } from '../meta';
import { addBackground, Button, drawIcon, text, type IconName } from '../ui/draw';
import { itemIcon } from '../ui/itemPreview';
import { createLumoFigure, type LumoFigure } from '../ui/lumo';
import { addTabBar, addWallet, buttonRichLabel, toast } from '../ui/meta';
import { Modal } from '../ui/Modal';
import { showNotEnough } from '../ui/notEnough';
import { currentLook } from '../ui/skins';
import { uiText } from '../ui/UIText';
import { edgeRows, stretchLayout } from '../ui/viewport';
import { C, W } from '../ui/theme';

export type ShopTab = 'wardrobe' | 'lamp' | 'road' | 'arch';
type PartTab = PartSlot | 'sets';

const TABS: { tab: ShopTab; key: 'wardrobe' | 'shop_lamps' | 'shop_roads' | 'shop_arches' }[] = [
  { tab: 'wardrobe', key: 'wardrobe' },
  { tab: 'lamp', key: 'shop_lamps' },
  { tab: 'road', key: 'shop_roads' },
  { tab: 'arch', key: 'shop_arches' },
];

const PART_TABS: PartTab[] = [...PART_SLOTS, 'sets'];

/** Вещи, которые «надевают» (остальные — «выбирают»). */
const WEAR_SLOTS: Slot[] = ['hat', 'face', 'outfit', 'accessory'];

export const RARITY_COLOR: Record<Rarity, number> = { common: 0x9aa3d6, rare: 0x5ab8ff, epic: 0xc98aff, special: 0xffd36b };
const hexColor = (c: number) => `#${c.toString(16).padStart(6, '0')}`;

export class ShopScene extends Phaser.Scene {
  private tab: ShopTab = 'wardrobe';
  private part: PartTab = 'hat';
  private figure?: LumoFigure;
  private tryLook: Look | null = null;
  private tryBar?: Phaser.GameObjects.Container;
  private quiet = false;

  constructor() {
    super('Shop');
  }

  init(data: { tab?: ShopTab; part?: PartTab; quiet?: boolean }) {
    if (data.tab) this.tab = data.tab;
    if (data.part) this.part = data.part;
    this.quiet = !!data.quiet;
    this.tryLook = null;
    this.tryBar = undefined;
  }

  create() {
    const bounds = stretchLayout(this);
    addBackground(this, { evening: true });
    if (!this.quiet) this.cameras.main.fadeIn(150, 11, 15, 39);
    const { topY, rowY } = edgeRows(bounds);
    text(this, W / 2, topY, t('tab_shop'), 64, C.text, true, { w: W - 120 });
    addWallet(this, W / 2, topY + 95);

    // Вкладки магазина
    const tw = (W - 80) / TABS.length;
    TABS.forEach((k, i) => this.chip(40 + tw * (i + 0.5), topY + 200, tw - 16, 84, t(k.key), k.tab === this.tab, () => this.go({ tab: k.tab })));

    let gridTop = topY + 290;
    if (this.tab === 'wardrobe') gridTop = this.drawWardrobeTop(topY + 260);
    const items = this.tab === 'wardrobe' ? (this.part === 'sets' ? [] : itemsOf(this.part)) : itemsOf(this.tab);
    const area = { top: gridTop, bottom: rowY - 70 };
    if (this.tab === 'wardrobe' && this.part === 'sets') this.drawSets(area);
    else this.drawGrid(items, area, this.tab === 'wardrobe' ? 4 : 3);

    addTabBar(this, 'Shop', rowY + 40, (k) => {
      this.cameras.main.fadeOut(150, 11, 15, 39);
      this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start(k));
    });
  }

  /** Вкладка-«таблетка» с подписью под любой язык. */
  private chip(x: number, y: number, w: number, h: number, label: string, on: boolean, onTap: () => void, icon?: IconName, size = 32) {
    const c = this.add.container(x, y);
    const g = this.add.graphics();
    g.fillStyle(on ? C.primary : C.button, 1);
    g.fillRoundedRect(-w / 2, -h / 2, w, h, h * 0.32);
    if (!on) {
      g.lineStyle(3, C.buttonEdge, 1);
      g.strokeRoundedRect(-w / 2, -h / 2, w, h, h * 0.32);
    }
    c.add(g);
    if (icon) {
      const ig = this.add.graphics().setPosition(0, -h * 0.16);
      drawIcon(ig, icon, h * 0.42, on ? 0x2a1a05 : C.icon);
      c.add([ig, uiText(this, 0, h * 0.26, label, { w: w - 10, size: 22, color: on ? '#2a1a05' : C.text })]);
    } else c.add(uiText(this, 0, 0, label, { w: w - 12, lines: 2, h: h - 8, size, color: on ? '#2a1a05' : C.text }));
    c.setSize(w, h).setInteractive({ useHandCursor: true });
    c.on('pointerup', () => {
      if (on) return;
      sfx.tap();
      onTap();
    });
    return c;
  }

  private go(data: { tab?: ShopTab; part?: PartTab }) {
    this.scene.restart({ tab: data.tab ?? this.tab, part: data.part ?? this.part, quiet: true });
  }

  // -------------------------------------------------------------------------
  // Гардероб: крупный Lumo, сохранённые образы, вкладки частей

  private drawWardrobeTop(y0: number): number {
    const e = getEconomy();
    const look = e.wardrobe.look;
    // Подиум и крупный Lumo: ходит, машет, поворачивается пальцем.
    const fx = W / 2 - 110;
    const fy = y0 + 250;
    const pod = this.add.graphics();
    pod.fillStyle(0xffc65c, 0.08);
    pod.fillCircle(fx, fy - 40, 230);
    pod.fillStyle(0x000000, 0.3);
    pod.fillEllipse(fx, fy + 150, 380, 70);
    const fig = createLumoFigure(this, 300, look, { animate: true, withPet: true }).setPosition(fx, fy);
    this.figure = fig;
    const zone = this.add.zone(fx, fy, 420, 460).setInteractive({ useHandCursor: true, draggable: true });
    let dragX = 0;
    zone.on('dragstart', (p: Phaser.Input.Pointer) => (dragX = p.x));
    zone.on('drag', (p: Phaser.Input.Pointer) => {
      if (Math.abs(p.x - dragX) > 40) {
        fig.face(p.x > dragX ? 1 : -1);
        dragX = p.x;
      }
    });
    zone.on('pointerup', (p: Phaser.Input.Pointer) => {
      if (p.getDistance() < 12) {
        fig.wave();
        sfx.tap();
      }
    });
    // Время от времени Lumo прохаживается и машет.
    this.time.addEvent({ delay: 4200, loop: true, callback: () => (Math.random() < 0.5 ? fig.wave() : fig.hop()) });
    fig.walk(true);
    this.time.delayedCall(1600, () => fig.walk(false));
    const set = fullSet(look);
    if (set) uiText(this, fx, y0 + 445, t('set_full', { name: tk(`set.${set.id}`) }), { w: 460, size: 26, color: hexColor(set.aura) });

    // Цвета одежды
    this.drawSwatches(look, fx, y0 + 28);

    // Сохранённые образы: 3 ячейки справа
    const sx = W - 170;
    uiText(this, sx, y0 + 22, t('saved_looks'), { w: 280, size: 26, color: C.textDim, bold: false });
    for (let i = 0; i < MAX_SAVED_LOOKS; i++) {
      const sy = y0 + 120 + i * 140;
      const saved = e.wardrobe.saved[i];
      const g = this.add.graphics();
      g.fillStyle(C.card, 1);
      g.fillRoundedRect(sx - 130, sy - 60, 260, 120, 30);
      g.lineStyle(3, C.cardEdge, 0.7);
      g.strokeRoundedRect(sx - 130, sy - 60, 260, 120, 30);
      if (saved) createLumoFigure(this, 110, saved, { animate: false }).setPosition(sx - 70, sy + 6);
      uiText(this, saved ? sx + 40 : sx, sy, saved ? t('look_n', { n: i + 1 }) : t('look_empty'), { w: saved ? 150 : 230, lines: 2, size: 26, color: saved ? C.text : C.textDim });
      const z = this.add.zone(sx, sy, 260, 120).setInteractive({ useHandCursor: true });
      z.on('pointerup', () => this.lookSlot(i));
    }

    // Вкладки частей образа (иконки и подписи)
    const py = y0 + 540;
    const pw = (W - 60) / PART_TABS.length;
    PART_TABS.forEach((p, i) => this.chip(30 + pw * (i + 0.5), py, pw - 8, 100, t(`part_${p}` as 'part_hat'), p === this.part, () => this.go({ part: p }), undefined, 26));
    return py + 80;
  }

  private drawSwatches(look: Look, fx: number, y: number) {
    const it = itemById(look.outfit);
    const pals = it?.palettes ?? [];
    if (pals.length < 2) return;
    const step = 64;
    const x0 = fx - ((pals.length - 1) * step) / 2;
    pals.forEach((p, i) => {
      const g = this.add.graphics();
      g.fillStyle(p.main, 1);
      g.fillCircle(x0 + i * step, y, 24);
      g.fillStyle(p.trim, 1);
      g.fillCircle(x0 + i * step + 10, y + 10, 8);
      g.lineStyle(i === look.color ? 6 : 3, i === look.color ? C.primary : 0xffffff, i === look.color ? 1 : 0.4);
      g.strokeCircle(x0 + i * step, y, 27);
      const z = this.add.zone(x0 + i * step, y, step, step).setInteractive({ useHandCursor: true });
      z.on('pointerup', () => {
        sfx.tap();
        if (this.tryLook) {
          this.tryLook = { ...this.tryLook, color: i };
          this.figure?.setLook(this.tryLook);
        } else {
          equipItem(look.outfit, i);
          this.go({});
        }
      });
    });
  }

  /** Ячейка сохранённого образа: надеть или сохранить сюда текущий. */
  private lookSlot(i: number) {
    sfx.tap();
    const saved = getEconomy().wardrobe.saved[i];
    const m = new Modal(this, { w: 760 });
    m.title(t('look_n', { n: i + 1 }), 54);
    if (saved) {
      m.add(createLumoFigure(this, 220, saved, { animate: true, withPet: true }), 240, 20);
      m.buttons([new Button(this, 0, 0, { w: 460, h: 110, label: t('look_wear'), primary: true, onClick: () => (loadOutfit(i), m.close(true), this.go({})) })]);
    }
    m.buttons([
      new Button(this, 0, 0, {
        w: 460,
        h: 100,
        label: t(saved ? 'look_overwrite' : 'look_save'),
        primary: !saved,
        onClick: () => {
          saveOutfit(i);
          m.close(true);
          toast(this, t('look_saved', { n: i + 1 }));
          this.time.delayedCall(400, () => this.go({}));
        },
      }),
    ]);
    m.open();
  }

  // -------------------------------------------------------------------------
  // Сетка вещей (с прокруткой, если не влезает)

  private scrollArea(area: { top: number; bottom: number }, contentH: number): Phaser.GameObjects.Container {
    const c = this.add.container(0, area.top).setData('scroll', true);
    const h = area.bottom - area.top;
    if (contentH <= h) return c;
    const maskG = this.make.graphics({}, false);
    maskG.fillRect(0, area.top, W, h);
    c.setMask(maskG.createGeometryMask());
    const min = area.top - (contentH - h);
    let startY = 0;
    let startC = 0;
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (p.worldY < area.top || p.worldY > area.bottom) return;
      startY = p.worldY;
      startC = c.y;
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!p.isDown || startY === 0) return;
      c.y = Phaser.Math.Clamp(startC + p.worldY - startY, min, area.top);
    });
    this.input.on('pointerup', () => (startY = 0));
    this.input.on('wheel', (_p: unknown, _o: unknown, _dx: number, dy: number) => (c.y = Phaser.Math.Clamp(c.y - dy, min, area.top)));
    return c;
  }

  private drawGrid(items: readonly WardrobeItem[], area: { top: number; bottom: number }, cols: number) {
    const gap = 18;
    const cw = (W - 60 - gap * (cols - 1)) / cols;
    const ch = cols === 4 ? 300 : 360;
    const rows = Math.ceil(items.length / cols);
    const c = this.scrollArea(area, rows * (ch + gap));
    items.forEach((it, i) => {
      const x = 30 + (i % cols) * (cw + gap) + cw / 2;
      const y = Math.floor(i / cols) * (ch + gap) + ch / 2;
      c.add(this.card(it, x, y, cw, ch));
    });
  }

  private card(it: WardrobeItem, x: number, y: number, w: number, h: number): Phaser.GameObjects.Container {
    const e = getEconomy();
    const owned = e.wardrobe.owned.includes(it.id);
    const look = e.wardrobe.look;
    const worn = (look as unknown as Record<string, string>)[it.slot] === it.id;
    const c = this.add.container(x, y);
    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.3);
    g.fillRoundedRect(-w / 2, -h / 2 + 6, w, h, 30);
    g.fillStyle(worn ? 0x3a3418 : C.card, 1);
    g.fillRoundedRect(-w / 2, -h / 2, w, h, 30);
    g.lineStyle(worn ? 6 : 3, worn ? C.primary : RARITY_COLOR[it.rarity], worn ? 1 : 0.75);
    g.strokeRoundedRect(-w / 2, -h / 2, w, h, 30);
    // Полоска редкости
    g.fillStyle(RARITY_COLOR[it.rarity], 0.9);
    g.fillRoundedRect(-w / 2 + 20, -h / 2 + 12, w - 40, 8, 4);
    c.add(g);
    c.add(uiText(this, 0, -h / 2 + 38, t(`rarity_${it.rarity}` as 'rarity_common'), { w: w - 40, size: 20, color: hexColor(RARITY_COLOR[it.rarity]), bold: false }));
    const icon = itemIcon(this, it.id, Math.min(w * 0.62, h * 0.36)).setPosition(0, -h * 0.13);
    if (!owned) icon.setAlpha(0.85);
    c.add(icon);
    c.add(uiText(this, 0, h * 0.12, tk(`item.${it.id}`), { w: w - 20, lines: 2, h: 64, size: 24 }));
    // Статус / действие
    const by = h / 2 - 46;
    const wear = WEAR_SLOTS.includes(it.slot);
    if (worn) c.add(uiText(this, 0, by, t(wear ? 'shop_worn' : 'shop_selected'), { w: w - 20, size: 28, color: '#ffd36b' }));
    else if (owned) c.add(new Button(this, 0, by, { w: w - 30, h: 66, label: t(wear ? 'shop_wear' : 'shop_select'), fontSize: 26, maxW: w - 16, onClick: () => this.equip(it) }));
    else if (it.source === 'coins') {
      const cost = itemCost(e, it.id);
      const ok = canAfford(cost);
      const b = buttonRichLabel(new Button(this, 0, by, { w: w - 30, h: 66, primary: ok, maxW: w - 16, onClick: () => this.buy(it) }), `${fmt(cost.amount)} ${cost.currency === 'light' ? '{light}' : '{coin}'}`, 28, ok);
      c.add(b);
    } else c.add(uiText(this, 0, by, t(`source_${it.source}` as 'source_village'), { w: w - 20, lines: 2, h: 60, size: 22, color: it.source === 'special' ? '#c9a8ff' : C.textDim, bold: false }));
    // Тап по карточке: своя — надеть/выбрать, чужая — примерить.
    const z = this.add.zone(0, -h * 0.12, w, h * 0.72).setInteractive({ useHandCursor: true });
    z.on('pointerup', (p: Phaser.Input.Pointer) => {
      if (p.getDistance() > 14) return;
      if (owned && !worn) this.equip(it);
      else if (!owned) this.tryOn(it);
    });
    c.addAt(z, 1);
    return c;
  }

  private equip(it: WardrobeItem) {
    sfx.tap();
    equipItem(it.id);
    this.go({});
  }

  private buy(it: WardrobeItem) {
    const r = buyItem(it.id);
    if (!r.ok) {
      const cost = itemCost(getEconomy(), it.id);
      if (r.error === 'notEnoughCoins') showNotEnough(this, 'coins', cost.amount - coins(getEconomy()));
      else if (r.error === 'notEnoughLight') showNotEnough(this, 'light', cost.amount - wallet().light);
      else {
        sfx.invalid();
        toast(this, t('unavailable'));
      }
      return;
    }
    sfx.win();
    toast(this, t(WEAR_SLOTS.includes(it.slot) ? 'shop_bought_worn' : 'shop_bought_selected', { name: tk(`item.${it.id}`) }));
    this.time.delayedCall(500, () => this.go({}));
  }

  /** «Примерить»: вещь на крупном Lumo до покупки (только в гардеробе; стили поля — сразу видно на карточке). */
  private tryOn(it: WardrobeItem) {
    if (this.tab !== 'wardrobe' || !this.figure) return;
    sfx.tap();
    const base = this.tryLook ?? currentLook();
    this.tryLook = { ...base, [it.slot]: it.id, ...(it.slot === 'outfit' ? { color: 0 } : {}) } as Look;
    this.figure.setLook(this.tryLook);
    this.figure.hop();
    this.showTryBar(tk(`item.${it.id}`), it);
  }

  private showTryBar(name: string, it?: WardrobeItem) {
    this.tryBar?.destroy();
    const y = (this.figure?.y ?? 600) + 210;
    const bar = this.add.container(W / 2, y).setDepth(40);
    const w = W - 80;
    const g = this.add.graphics();
    g.fillStyle(0x0b0f27, 0.94);
    g.fillRoundedRect(-w / 2, -50, w, 100, 30);
    g.lineStyle(3, C.primary, 0.8);
    g.strokeRoundedRect(-w / 2, -50, w, 100, 30);
    bar.add(g);
    const close = new Button(this, w / 2 - 60, 0, { w: 84, h: 76, icon: 'close', onClick: () => this.endTry() });
    let right = w / 2 - 120;
    if (it && it.source === 'coins') {
      const e = getEconomy();
      const cost = itemCost(e, it.id);
      const ok = canAfford(cost);
      const b = buttonRichLabel(new Button(this, 0, 0, { w: 200, h: 76, primary: ok, maxW: 320, onClick: () => this.buy(it) }), t(cost.currency === 'light' ? 'buy_for_light' : 'buy_for', { n: cost.amount }), 28, ok);
      b.setX(right - b.buttonWidth / 2);
      right -= b.buttonWidth + 20;
      bar.add(b);
    } else if (it) {
      const src = uiText(this, 0, 0, t(`source_${it.source}` as 'source_village'), { w: 240, lines: 2, size: 24, color: C.textDim, bold: false });
      src.setX(right - 120);
      right -= 260;
      bar.add(src);
    }
    const tw = right - (-w / 2 + 30);
    bar.add(uiText(this, -w / 2 + 30, 0, t('try_on', { name }), { w: tw, lines: 2, h: 90, size: 28, originX: 0, align: 'left' }));
    bar.add(close);
    this.tryBar = bar;
  }

  private endTry() {
    this.tryLook = null;
    this.tryBar?.destroy();
    this.tryBar = undefined;
    this.figure?.setLook(currentLook());
  }

  // -------------------------------------------------------------------------
  // Наборы: надеть одним тапом (вещи, которые есть), примерить целиком

  private drawSets(area: { top: number; bottom: number }) {
    const cols = 2;
    const gap = 18;
    const cw = (W - 60 - gap) / cols;
    const ch = 250;
    const e = getEconomy();
    const c = this.scrollArea(area, Math.ceil(SETS.length / cols) * (ch + gap));
    SETS.forEach((s, i) => {
      const x = 30 + (i % cols) * (cw + gap) + cw / 2;
      const y = Math.floor(i / cols) * (ch + gap) + ch / 2;
      const card = this.add.container(x, y);
      const items = setItems(s);
      const have = items.filter((id) => e.wardrobe.owned.includes(id)).length;
      const g = this.add.graphics();
      g.fillStyle(C.card, 1);
      g.fillRoundedRect(-cw / 2, -ch / 2, cw, ch, 30);
      g.lineStyle(3, s.aura, 0.6);
      g.strokeRoundedRect(-cw / 2, -ch / 2, cw, ch, 30);
      card.add(g);
      const look = { ...e.wardrobe.look, ...s.parts } as Look;
      card.add(createLumoFigure(this, 150, look, { animate: false }).setPosition(-cw / 2 + 95, 10));
      const tx = -cw / 2 + 190;
      const tw2 = cw - 210;
      card.add(uiText(this, tx, -ch / 2 + 50, tk(`set.${s.id}`), { w: tw2, lines: 2, h: 70, size: 28, originX: 0, align: 'left' }));
      card.add(uiText(this, tx, -ch / 2 + 110, t('set_have', { n: have, total: items.length }), { w: tw2, size: 24, color: have === items.length ? '#8ef0c8' : C.textDim, bold: false, originX: 0, align: 'left' }));
      const wearB = new Button(this, 0, ch / 2 - 55, { w: 150, h: 70, label: t(have ? 'set_wear' : 'shop_try'), fontSize: 26, primary: have > 0, maxW: tw2, onClick: () => (have ? this.wearSet(s.id) : this.trySet(s.id)) });
      wearB.setX(tx + wearB.buttonWidth / 2);
      card.add(wearB);
      const z = this.add.zone(-cw / 2 + 95, 0, 180, ch).setInteractive({ useHandCursor: true });
      z.on('pointerup', () => this.trySet(s.id));
      card.add(z);
      c.add(card);
    });
  }

  private trySet(id: string) {
    const s = setById(id);
    if (!s || !this.figure) return;
    sfx.tap();
    this.tryLook = { ...currentLook(), ...s.parts } as Look;
    this.figure.setLook(this.tryLook);
    this.figure.wave();
    this.showTryBar(tk(`set.${s.id}`));
  }

  private wearSet(id: string) {
    const missing = equipSet(id);
    sfx.win();
    toast(this, missing.length ? t('set_worn_partial', { n: missing.length }) : t('set_worn'));
    this.time.delayedCall(400, () => this.go({}));
  }
}
