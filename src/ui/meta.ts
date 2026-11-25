// Общие элементы мета-игры: значки монеты и света, счётчики валют, нижняя панель вкладок
// (Карта / Деревня / Магазин / Профиль), всплывающее сообщение и окно ежедневной награды.

import Phaser from 'phaser';
import { sfx } from '../audio';
import { DAILY, nextVillageObject, skinById, type DailyReward } from '../core/economy';
import { claimDaily, dailyAvailable, getEconomy, wallet } from '../meta';
import { Button, createLumo, drawIcon, text } from './draw';
import { C, FONT, W, H } from './theme';
import { t } from '../strings';

type G = Phaser.GameObjects.Graphics;

/** Монета: золотой кружок с ободком и бликом. */
export function drawCoin(g: G, x: number, y: number, r: number) {
  g.fillStyle(0x000000, 0.25);
  g.fillCircle(x, y + r * 0.12, r);
  g.fillStyle(0xd9a21f, 1);
  g.fillCircle(x, y, r);
  g.fillStyle(0xffd45a, 1);
  g.fillCircle(x, y - r * 0.04, r * 0.8);
  g.lineStyle(r * 0.12, 0xd9a21f, 1);
  g.strokeCircle(x, y - r * 0.04, r * 0.55);
  g.fillStyle(0xffffff, 0.6);
  g.fillEllipse(x - r * 0.3, y - r * 0.38, r * 0.4, r * 0.22);
}

/** Свет: тёплый огонёк-капля с сиянием. */
export function drawLight(g: G, x: number, y: number, r: number) {
  g.fillStyle(0xffc65c, 0.25);
  g.fillCircle(x, y, r * 1.25);
  g.fillStyle(0xffb84d, 1);
  g.fillTriangle(x - r * 0.62, y + r * 0.1, x + r * 0.62, y + r * 0.1, x, y - r * 1.05);
  g.fillCircle(x, y + r * 0.22, r * 0.66);
  g.fillStyle(0xfff1cc, 1);
  g.fillCircle(x, y + r * 0.28, r * 0.36);
}

/** Счётчики «монеты и свет» в одну строку по центру x. refresh() — обновить числа. */
export function addWallet(scene: Phaser.Scene, x: number, y: number, depth = 21) {
  const g = scene.add.graphics().setDepth(depth);
  const coinT = text(scene, 0, y, '0', 40).setOrigin(0, 0.5).setDepth(depth);
  const lightT = text(scene, 0, y, '0', 40).setOrigin(0, 0.5).setDepth(depth);
  const refresh = () => {
    const w = wallet();
    coinT.setText(String(w.coins));
    lightT.setText(String(w.light));
    const total = 50 + coinT.width + 60 + 50 + lightT.width;
    let cx = x - total / 2;
    g.clear();
    g.fillStyle(0x000000, 0.28);
    g.fillRoundedRect(cx - 24, y - 34, total + 48, 68, 34);
    drawCoin(g, cx + 20, y, 20);
    coinT.setX(cx + 50);
    cx += 50 + coinT.width + 60;
    drawLight(g, cx + 20, y, 20);
    lightT.setX(cx + 50);
  };
  refresh();
  return { refresh, objects: [g, coinT, lightT] };
}

export type Tab = 'Menu' | 'Village' | 'Shop' | 'Profile';

const TABS: { key: Tab; label: string }[] = [
  { key: 'Menu', label: 'Карта' },
  { key: 'Village', label: 'Деревня' },
  { key: 'Shop', label: 'Магазин' },
  { key: 'Profile', label: 'Профиль' },
];

/** Значки вкладок рисуются здесь же (простые фигуры). */
function drawTabIcon(g: G, key: Tab, s: number, color: number) {
  g.lineStyle(s * 0.1, color, 1);
  g.fillStyle(color, 1);
  if (key === 'Menu') {
    // Карта: сложенный лист и тропинка с точкой
    g.strokeRect(-s * 0.42, -s * 0.32, s * 0.84, s * 0.64);
    g.lineBetween(-s * 0.14, -s * 0.32, -s * 0.14, s * 0.32);
    g.lineBetween(s * 0.14, -s * 0.32, s * 0.14, s * 0.32);
    g.fillCircle(s * 0.28, -s * 0.12, s * 0.08);
  } else if (key === 'Village') {
    // Домик с окном
    g.fillTriangle(-s * 0.45, -s * 0.02, s * 0.45, -s * 0.02, 0, -s * 0.44);
    g.fillRect(-s * 0.32, -s * 0.04, s * 0.64, s * 0.42);
    g.fillStyle(0x1a2150, 1);
    g.fillRect(-s * 0.1, s * 0.08, s * 0.2, s * 0.18);
  } else if (key === 'Shop') {
    // Сумка
    g.fillRoundedRect(-s * 0.36, -s * 0.12, s * 0.72, s * 0.5, s * 0.08);
    g.beginPath();
    g.arc(0, -s * 0.12, s * 0.18, Math.PI, 0, false);
    g.strokePath();
  } else {
    drawIcon(g, 'user', s, color);
  }
}

/**
 * Нижняя панель вкладок. active — текущий экран. Метка-точка на «Деревне», если хватает света на следующий объект.
 */
export function addTabBar(scene: Phaser.Scene, active: Tab, y: number, go: (key: Tab) => void) {
  const bar = scene.add.container(0, 0).setDepth(30);
  const bg = scene.add.graphics();
  bg.fillStyle(0x070a1c, 0.96);
  bg.fillRect(-W, y - 85, W * 3, H);
  bg.lineStyle(3, C.cardEdge, 0.5);
  bg.lineBetween(-W, y - 85, W * 2, y - 85);
  bar.add(bg);
  const step = W / TABS.length;
  const next = nextVillageObject(getEconomy());
  const villageReady = !!next && wallet().light >= next.cost;
  TABS.forEach((t, i) => {
    const x = step * (i + 0.5);
    const on = t.key === active;
    const g = scene.add.graphics();
    if (on) {
      g.fillStyle(C.primary, 0.16);
      g.fillRoundedRect(x - step / 2 + 14, y - 72, step - 28, 144, 32);
    }
    const ig = scene.add.graphics().setPosition(x, y - 18);
    drawTabIcon(ig, t.key, 64, on ? C.primary : C.icon);
    const label = text(scene, x, y + 42, t.label, 30, on ? '#ffb84d' : C.textDim, on);
    const zone = scene.add.zone(x, y, step, 170).setInteractive({ useHandCursor: true });
    zone.on('pointerup', () => {
      if (on) return;
      sfx.tap();
      go(t.key);
    });
    bar.add([g, ig, label, zone]);
    if (t.key === 'Village' && villageReady && !on) {
      const dot = scene.add.graphics();
      dot.fillStyle(0xff6b4a, 1);
      dot.fillCircle(x + 38, y - 50, 14);
      bar.add(dot);
      scene.tweens.add({ targets: dot, alpha: 0.4, duration: 600, yoyo: true, repeat: -1 });
    }
  });
  return bar;
}

/** Значки валют в тексте: везде пишем числом и значком, без слов «монет» / «света». */
export const COIN = '{coin}';
export const LIGHT = '{light}';

/**
 * Строка текста со значками валют: «+30 {coin} · 10 {light}» → текст и нарисованные монета/огонёк.
 * Контейнер с центром в (x, y); шире maxWidth — уменьшается целиком.
 */
export function richText(scene: Phaser.Scene, x: number, y: number, str: string, size: number, color: string = C.text, bold = true, maxWidth = 0, iconBacking = false) {
  const c = scene.add.container(x, y);
  const r = size * 0.4;
  let cx = 0;
  const items: { obj: Phaser.GameObjects.Text | G; w: number; icon: boolean }[] = [];
  for (const part of str.split(/(\{coin\}|\{light\})/).filter(Boolean)) {
    if (part === COIN || part === LIGHT) {
      const g = scene.add.graphics();
      // На светлой (оранжевой) кнопке значок теряется — тёмная подложка-кружок.
      if (iconBacking) {
        g.fillStyle(0x2a1a05, 0.85);
        g.fillCircle(r, 0, r * 1.3);
      }
      (part === COIN ? drawCoin : drawLight)(g, r, 0, r);
      items.push({ obj: g, w: r * 2 + size * 0.06, icon: true });
    } else {
      const t = scene.add.text(0, 0, part, { fontFamily: FONT, fontSize: `${size}px`, color, fontStyle: bold ? 'bold' : 'normal' }).setOrigin(0, 0.5);
      items.push({ obj: t, w: t.width, icon: false });
    }
  }
  for (const it of items) {
    it.obj.setX(cx);
    cx += it.w;
  }
  for (const it of items) it.obj.setX(it.obj.x - cx / 2);
  c.add(items.map((i) => i.obj));
  c.setSize(cx, size * 1.3);
  if (maxWidth && cx > maxWidth) c.setScale(maxWidth / cx);
  return c;
}

/** Подпись кнопки со значками валют (кнопку создаём без label). */
export function buttonRichLabel(btn: Button, str: string, size: number, primary = true) {
  const label = richText(btn.scene, 0, 0, str, size, primary ? '#2a1a05' : C.text, true, 0, primary);
  btn.add(label);
  return btn.fitContent(label.width);
}

/** Короткое сообщение внизу экрана (купил, не хватает {coin}…). Понимает значки валют. */
export function toast(scene: Phaser.Scene, msg: string, y = 1560) {
  const t = richText(scene, W / 2, y, msg, 40, C.text, true, 900).setDepth(60).setAlpha(0);
  const w = t.width * t.scaleX + 60;
  const bg = scene.add.graphics();
  bg.fillStyle(0x0b0f27, 0.88);
  bg.fillRoundedRect(-w / 2, -40, w, 80, 24);
  t.addAt(bg.setScale(1 / t.scaleX), 0);
  scene.tweens.add({ targets: t, alpha: 1, y: y - 20, duration: 200 });
  scene.tweens.add({ targets: t, alpha: 0, delay: 1800, duration: 400, onComplete: () => t.destroy() });
}

/**
 * Знакомство с валютами: большой значок монеты и света с пояснением. После него валюты в игре
 * обозначаются только значками ({coin} / {light}), без слов.
 */
export function showCurrencyIntro(scene: Phaser.Scene, onClose: () => void) {
  const o = scene.add.container(0, 0).setDepth(60);
  const dim = scene.add.rectangle(W / 2, H / 2, W * 4, H * 4, 0x060818, 0.7).setInteractive();
  const pw = 900;
  const ph = 860;
  const top = H / 2 - ph / 2;
  const panel = scene.add.graphics();
  panel.fillStyle(0x000000, 0.35);
  panel.fillRoundedRect(W / 2 - pw / 2, top + 14, pw, ph, 60);
  panel.fillStyle(C.panel, 1);
  panel.fillRoundedRect(W / 2 - pw / 2, top, pw, ph, 60);
  panel.lineStyle(6, C.primary, 1);
  panel.strokeRoundedRect(W / 2 - pw / 2, top, pw, ph, 60);
  o.add([dim, panel, text(scene, W / 2, top + 100, t('currency_title'), 64)]);
  const rows: [typeof drawCoin, string][] = [
    [drawCoin, t('currency_coin')],
    [drawLight, t('currency_light')],
  ];
  rows.forEach(([draw, str], i) => {
    const y = top + 285 + i * 200;
    const ig = scene.add.graphics().setPosition(W / 2 - 320, y);
    draw(ig, 0, 0, 58);
    scene.tweens.add({ targets: ig, y: y - 8, duration: 900 + i * 150, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    const label = scene.add
      .text(W / 2 - 220, y, str, { fontFamily: FONT, fontSize: '38px', color: C.text, fontStyle: 'bold', wordWrap: { width: 600 } })
      .setOrigin(0, 0.5)
      .setLineSpacing(6);
    o.add([ig, label]);
  });
  o.add(richText(scene, W / 2, top + 660, `${t('currency_note')} ${COIN} и ${LIGHT}`, 34, C.textDim, false));
  o.add(
    new Button(scene, W / 2, top + 770, {
      w: 460,
      h: 120,
      label: t('rule_ok'),
      primary: true,
      onClick: () => {
        sfx.tap();
        o.destroy();
        onClose();
      },
    }),
  );
  o.setAlpha(0);
  scene.tweens.add({ targets: o, alpha: 1, duration: 220 });
}

/** Текст награды календаря. */
export function dailyLabel(r: DailyReward): string {
  if ('coins' in r) return `${r.coins} ${COIN}`;
  if ('hints' in r) return `${r.hints} ${r.hints === 1 ? 'подсказка' : r.hints < 5 ? 'подсказки' : 'подсказок'}`;
  return `Костюм «${skinById(r.skin)?.name ?? ''}»`;
}

/**
 * Окно ежедневной награды: календарь на 7 дней, сегодняшний день подсвечен, кнопка «Забрать».
 * Показывается на карте, если награда сегодня ещё не получена.
 */
export function showDailyDialog(scene: Phaser.Scene, onClose: () => void) {
  const day = dailyAvailable();
  if (day === null) return false;
  const o = scene.add.container(0, 0).setDepth(70);
  const dim = scene.add.rectangle(W / 2, H / 2, W * 4, H * 4, 0x060818, 0.7).setInteractive();
  const g = scene.add.graphics();
  const top = 420;
  const ph = 1000;
  g.fillStyle(0x000000, 0.35);
  g.fillRoundedRect(W / 2 - 460, top + 14, 920, ph, 60);
  g.fillStyle(C.panel, 1);
  g.fillRoundedRect(W / 2 - 460, top, 920, ph, 60);
  g.lineStyle(6, C.primary, 0.9);
  g.strokeRoundedRect(W / 2 - 460, top, 920, ph, 60);
  o.add([dim, g, text(scene, W / 2, top + 90, 'Награда дня', 64), text(scene, W / 2, top + 165, `День ${day} из 7 — заходи каждый день`, 38, C.textDim, false)]);
  // 7 клеток: 4 сверху, 3 снизу (7-я — большая, со скином)
  DAILY.forEach((r, i) => {
    const row = i < 4 ? 0 : 1;
    const col = row === 0 ? i : i - 4;
    const cw = 190;
    const x = row === 0 ? W / 2 + (col - 1.5) * (cw + 20) : W / 2 + (col - 1) * (cw + 20) + (i === 6 ? 0 : 0);
    const y = top + 330 + row * 250;
    const done = i + 1 < day;
    const now = i + 1 === day;
    const cg = scene.add.graphics();
    cg.fillStyle(now ? 0x3a3a1a : C.card, done ? 0.5 : 1);
    cg.fillRoundedRect(x - cw / 2, y - 105, cw, 210, 30);
    cg.lineStyle(now ? 8 : 3, now ? C.primary : C.cardEdge, now ? 1 : 0.6);
    cg.strokeRoundedRect(x - cw / 2, y - 105, cw, 210, 30);
    // Сначала фон клетки, потом картинка награды (иначе фон её закрывает).
    o.add(cg);
    if ('coins' in r) drawCoin(cg, x, y - 25, 34);
    else if ('hints' in r) {
      const ig = scene.add.graphics().setPosition(x, y - 25);
      drawIcon(ig, 'bulb', 80, C.icon);
      o.add(ig);
    } else {
      // Костюм — сам Lumo в этом костюме.
      o.add(createLumo(scene, 96, skinById(r.skin)?.avatar ?? 0, false).setPosition(x - 8, y - 12));
    }
    o.add(text(scene, x, y - 85, `День ${i + 1}`, 26, C.textDim, false));
    o.add(text(scene, x, y + 55, 'coins' in r ? `${r.coins}` : 'hints' in r ? `×${r.hints}` : 'костюм', 34, done ? C.textDim : C.text));
    if (done) {
      const ck = scene.add.graphics();
      ck.lineStyle(12, 0x8ef0c8, 1);
      ck.beginPath();
      ck.moveTo(x - 30, y - 25);
      ck.lineTo(x - 8, y);
      ck.lineTo(x + 34, y - 52);
      ck.strokePath();
      o.add(ck);
    }
  });
  const label = richText(scene, W / 2, top + 760, `Сегодня: ${dailyLabel(DAILY[day - 1])}`, 44, '#ffd36b', true, 760);
  o.add(label);
  const close = () => {
    o.destroy();
    onClose();
  };
  o.add(
    new Button(scene, W / 2, top + 880, {
      w: 520,
      h: 130,
      label: 'Забрать',
      primary: true,
      onClick: () => {
        const res = claimDaily();
        sfx.win();
        if (res && 'skin' in res.reward && !res.gotSkin) toast(scene, `Костюм уже есть — ${res.reward.orCoins} ${COIN}`);
        close();
      },
    }),
  );
  o.setAlpha(0);
  scene.tweens.add({ targets: o, alpha: 1, duration: 220 });
  return true;
}
