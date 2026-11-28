// Покупки в интерфейсе (Р4): витрина «Покупки» в магазине, окно стартового набора, «Докупить» монеты,
// «Восстановить покупки». Цены — только из стора (RevenueCat), уже в валюте игрока; пока стор не ответил — «…».
// В веб-версии покупок нет: витрина показывает товары с пометкой «доступно в приложении».

import Phaser from 'phaser';
import { sfx } from '../audio';
import { PRODUCT_GRANTS, STARTER_ITEM, type ProductKey } from '../core/shop';
import { fmt, t, tk } from '../i18n';
import { buy, cachedProducts, loadProducts, logStoreView, noAdsOwned, restorePurchases, starterAvailable, storeSupported, type BuyResult } from '../monetization/index';
import { Button, drawIcon, type IconName } from './draw';
import { itemIcon } from './itemPreview';
import { drawCoin, richText, toast } from './meta';
import { Modal } from './Modal';
import { C, W } from './theme';
import { uiText } from './UIText';

/** Цена товара из стора (кэш) или «…», пока не загрузилась. */
export const priceOf = (key: ProductKey) => cachedProducts().find((p) => p.key === key)?.price ?? '…';

/** Подпись товара: что даёт покупка (значки валют — {coin}). */
export function productLabel(key: ProductKey): string {
  const g = PRODUCT_GRANTS[key];
  if (key === 'noads') return t('store_noads');
  if (key === 'starter') return t('store_starter');
  if (g.hints) return t('store_hints', { n: g.hints });
  return t('store_coins', { n: fmt(g.coins ?? 0) });
}

const ICON: Record<ProductKey, IconName | 'coin'> = { noads: 'shield', starter: 'gift', hints_10: 'bulb', hints_30: 'bulb', coins_s: 'coin', coins_l: 'coin' };

/** Купить с сообщением о результате; onDone — после успешной покупки (обновить экран). */
export async function purchase(scene: Phaser.Scene, key: ProductKey, onDone?: () => void): Promise<BuyResult> {
  sfx.tap();
  const r = await buy(key);
  if (!scene.scene.isActive()) return r;
  if (r === 'ok') {
    sfx.win();
    toast(scene, t('purchase_done', { name: productLabel(key) }));
    onDone?.();
  } else if (r === 'failed') {
    sfx.invalid();
    toast(scene, t('purchase_failed'));
  } else if (r === 'unsupported') toast(scene, t('store_app_only'));
  return r;
}

/** «Восстановить покупки» с сообщением. */
export async function restoreWithToast(scene: Phaser.Scene, onDone?: () => void) {
  sfx.tap();
  const r = await restorePurchases();
  if (!scene.scene.isActive()) return;
  if (!r) return void toast(scene, t('restore_failed'));
  toast(scene, r.noAds || r.restored > 0 ? t('restore_done') : t('restore_none'));
  onDone?.();
}

/** Кнопка «Купить за <цена>»; цена догружается из стора, если её ещё нет. */
function priceButton(scene: Phaser.Scene, key: ProductKey, o: { w: number; h: number; fontSize: number; primary?: boolean; onClick: () => void }) {
  const btn = new Button(scene, 0, 0, { w: o.w, h: o.h, label: storeSupported() ? priceOf(key) : t('store_in_app'), fontSize: o.fontSize, primary: o.primary ?? true, onClick: o.onClick });
  if (!storeSupported()) btn.setEnabled(false);
  else if (priceOf(key) === '…') void loadProducts().then(() => btn.scene && btn.setLabel(priceOf(key)));
  return btn;
}

/**
 * Окно стартового набора: «Без рекламы», 20 подсказок, 500 монет и вещь, которой больше нигде нет.
 * source — откуда предложили (для аналитики): после победы, после «Почти!» или из магазина.
 */
export function showStarterOffer(scene: Phaser.Scene, source: 'win' | 'almost' | 'shop', onClose?: () => void, onBought?: () => void) {
  logStoreView(`starter_${source}`);
  const m = new Modal(scene, { w: 940, onClose, accent: 0xffd36b });
  m.title(t('starter_title'), 60, '#ffd36b');
  m.text(t('starter_sub'), 32, C.textDim, 2);
  const g = PRODUCT_GRANTS.starter;
  const rows: { icon: IconName | 'coin' | 'item'; text: string }[] = [
    { icon: 'shield', text: t('starter_noads') },
    { icon: 'bulb', text: t('starter_hints', { n: g.hints ?? 0 }) },
    { icon: 'coin', text: t('starter_coins', { n: fmt(g.coins ?? 0) }) },
    { icon: 'item', text: t('starter_item', { name: tk(`item.${STARTER_ITEM}`) }) },
  ];
  for (const r of rows) {
    const c = scene.add.container(0, 0);
    const bg = scene.add.graphics();
    bg.fillStyle(0x000000, 0.25);
    bg.fillRoundedRect(-m.inner / 2, -48, m.inner, 96, 28);
    c.add(bg);
    const ix = -m.inner / 2 + 64;
    if (r.icon === 'item') c.add(itemIcon(scene, STARTER_ITEM, 84).setPosition(ix, 0));
    else if (r.icon === 'coin') {
      const cg = scene.add.graphics();
      drawCoin(cg, ix, 0, 28);
      c.add(cg);
    } else {
      const ig = scene.add.graphics().setPosition(ix, 0);
      drawIcon(ig, r.icon, 70, C.icon);
      c.add(ig);
    }
    const tw = m.inner - 150;
    const rt = richText(scene, 0, 0, r.text, 34, C.text, true, tw, false, 2);
    rt.setX(-m.inner / 2 + 120 + (rt.width * rt.scaleX) / 2);
    rt.setData('ui', { w: tw, h: 90, src: r.text });
    c.add(rt);
    m.add(c, 96, 12);
  }
  m.space(10);
  const buyBtn = priceButton(scene, 'starter', {
    w: 520,
    h: 130,
    fontSize: 46,
    onClick: () =>
      void purchase(scene, 'starter', () => {
        m.close(true);
        onBought?.();
      }),
  });
  m.buttons([buyBtn]);
  m.buttons([new Button(scene, 0, 0, { w: 300, h: 90, label: t('later'), fontSize: 34, onClick: () => m.close() })]);
  m.open();
  return m;
}

/** «Докупить» монеты (из окна «Не хватает»): два набора с ценами из стора. */
export function showBuyCoins(scene: Phaser.Scene, onClose?: () => void) {
  logStoreView('not_enough');
  const m = new Modal(scene, { w: 900, onClose });
  m.title(t('buy_coins_title'), 56);
  for (const key of ['coins_s', 'coins_l'] as const) {
    const c = scene.add.container(0, 0);
    const bg = scene.add.graphics();
    bg.fillStyle(0x000000, 0.25);
    bg.fillRoundedRect(-m.inner / 2, -60, m.inner, 120, 30);
    c.add(bg);
    const cg = scene.add.graphics();
    drawCoin(cg, -m.inner / 2 + 70, 0, 32);
    c.add(cg);
    const btn = priceButton(scene, key, { w: 240, h: 90, fontSize: 36, onClick: () => void purchase(scene, key, () => m.close(true)) });
    btn.setX(m.inner / 2 - 24 - btn.buttonWidth / 2);
    const tw = m.inner - btn.buttonWidth - 170;
    const label = productLabel(key);
    const rt = richText(scene, 0, 0, label, 36, C.text, true, tw, false, 2);
    rt.setX(-m.inner / 2 + 125 + (rt.width * rt.scaleX) / 2);
    rt.setData('ui', { w: tw, h: 110, src: label });
    c.add([rt, btn]);
    m.add(c, 120, 18);
  }
  if (!storeSupported()) m.text(t('store_app_only'), 30, C.textDim, 2);
  m.open();
  return m;
}

// ---------------------------------------------------------------------------
// Витрина «Покупки» в магазине

function card(scene: Phaser.Scene, x: number, y: number, w: number, h: number, accent?: number) {
  const g = scene.add.graphics();
  g.fillStyle(0x000000, 0.3);
  g.fillRoundedRect(x - w / 2, y - h / 2 + 8, w, h, 36);
  g.fillStyle(C.card, 1);
  g.fillRoundedRect(x - w / 2, y - h / 2, w, h, 36);
  if (accent !== undefined) {
    g.lineStyle(5, accent, 1);
    g.strokeRoundedRect(x - w / 2, y - h / 2, w, h, 36);
  }
  return g;
}

function iconAt(scene: Phaser.Scene, key: ProductKey, x: number, y: number, size: number) {
  const ic = ICON[key];
  const g = scene.add.graphics();
  if (ic === 'coin') drawCoin(g, x, y, size * 0.4);
  else {
    g.setPosition(x, y);
    drawIcon(g, ic, size, C.icon);
  }
  return g;
}

/** Витрина: стартовый набор (если доступен), «Без рекламы», подсказки и монеты, «Восстановить покупки». */
export function drawPurchases(scene: Phaser.Scene, area: { top: number; bottom: number }, refresh: () => void) {
  logStoreView('shop');
  const L = 60;
  const R = W - 60;
  const cw = R - L;
  let y = area.top + 10;
  const app = storeSupported();
  if (!app) {
    uiText(scene, W / 2, y + 30, t('store_app_only'), { w: cw, lines: 2, size: 32, color: '#ffd36b' });
    y += 90;
  }
  // Стартовый набор — крупной карточкой (один раз; не показываем, если «Без рекламы» уже есть).
  if (starterAvailable()) {
    const h = 200;
    card(scene, W / 2, y + h / 2, cw, h, 0xffd36b);
    scene.add.existing(itemIcon(scene, STARTER_ITEM, 120).setPosition(L + 100, y + h / 2));
    const tx = L + 190;
    const btn = priceButton(scene, 'starter', { w: 220, h: 96, fontSize: 36, onClick: () => showStarterOffer(scene, 'shop', undefined, refresh) });
    btn.setPosition(R - 30 - btn.buttonWidth / 2, y + h / 2);
    const tw = R - 60 - btn.buttonWidth - tx;
    uiText(scene, tx, y + 50, t('starter_title'), { w: tw, size: 40, color: '#ffd36b', originX: 0, align: 'left' });
    uiText(scene, tx, y + 82, t('starter_short', { n: PRODUCT_GRANTS.starter.hints ?? 0, coins: fmt(PRODUCT_GRANTS.starter.coins ?? 0) }), { w: tw, h: 100, lines: 3, size: 26, color: C.textDim, bold: false, originX: 0, originY: 0, align: 'left' });
    y += h + 26;
  }
  // «Без рекламы».
  {
    const h = 150;
    card(scene, W / 2, y + h / 2, cw, h);
    iconAt(scene, 'noads', L + 90, y + h / 2, 84);
    const tx = L + 170;
    let bw = 220;
    if (noAdsOwned()) uiText(scene, R - 140, y + h / 2, t('store_owned'), { w: 220, size: 32, color: '#8ef0c8' });
    else {
      const btn = priceButton(scene, 'noads', { w: 220, h: 96, fontSize: 36, onClick: () => void purchase(scene, 'noads', refresh) });
      btn.setPosition(R - 30 - btn.buttonWidth / 2, y + h / 2);
      bw = btn.buttonWidth;
    }
    const tw = R - 60 - bw - tx;
    uiText(scene, tx, y + 42, t('store_noads'), { w: tw, size: 38, originX: 0, align: 'left' });
    uiText(scene, tx, y + 70, t('store_noads_descr'), { w: tw, h: 70, lines: 2, size: 24, color: C.textDim, bold: false, originX: 0, originY: 0, align: 'left' });
    y += h + 26;
  }
  // Подсказки и монеты — по две карточки в ряд.
  const half = (cw - 24) / 2;
  for (const pair of [['hints_10', 'hints_30'], ['coins_s', 'coins_l']] as const) {
    const h = 230;
    pair.forEach((key, i) => {
      const cx = L + half / 2 + i * (half + 24);
      card(scene, cx, y + h / 2, half, h);
      iconAt(scene, key, cx, y + 46, 64);
      const label = productLabel(key);
      const rt = richText(scene, cx, y + 104, label, 32, C.text, true, half - 30, false, 1);
      rt.setData('ui', { w: half - 30, h: 40, src: label });
      const btn = priceButton(scene, key, { w: half - 60, h: 76, fontSize: 32, onClick: () => void purchase(scene, key, refresh) });
      btn.setPosition(cx, y + h - 52);
    });
    y += h + 26;
  }
  // Восстановить покупки (обязательно для App Store).
  if (app) new Button(scene, W / 2, Math.min(y + 50, area.bottom - 50), { w: 520, h: 96, icon: 'restart', label: t('restore_purchases'), fontSize: 32, onClick: () => void restoreWithToast(scene, refresh) });
}
