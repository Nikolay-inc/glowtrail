// Общие элементы мета-игры: значки монеты и света, счётчики валют, нижняя панель вкладок
// (Карта / Деревня / Магазин / Профиль), всплывающее сообщение и окно ежедневной награды.

import Phaser from 'phaser';
import { sfx } from '../audio';
import { DAILY, nextVillageObject, type DailyReward } from '../core/economy';
import { bloomGift, claimDaily, cozy, dailyAvailable, dailyDoublable, getEconomy, questsToClaim, wallet } from '../meta';
import { rewardedButton } from './adButton';
import { Button, drawIcon, text } from './draw';
import { C, FONT, W, H } from './theme';
import { fmt, t, tk } from '../i18n';
import { itemIcon } from './itemPreview';
import { Modal } from './Modal';
import { uiText } from './UIText';

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
    coinT.setText(fmt(w.coins));
    lightT.setText(fmt(w.light));
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

const TABS: { key: Tab; label: () => string }[] = [
  { key: 'Menu', label: () => t('tab_map') },
  { key: 'Village', label: () => t('tab_village') },
  { key: 'Shop', label: () => t('tab_shop') },
  { key: 'Profile', label: () => t('tab_profile') },
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
  // Точка на «Деревне»: хватает света на следующую постройку, есть награда уюта или выполненное задание жителя.
  const next = nextVillageObject(getEconomy());
  const gift = bloomGift();
  const villageReady = (!!next && wallet().light >= next.cost) || questsToClaim() > 0 || cozy().pending > 0 || (gift.pending > 0 && gift.candidates.length > 0);
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
    const label = text(scene, x, y + 42, t.label(), 30, on ? '#ffb84d' : C.textDim, on, { w: step - 16 });
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
export function richText(scene: Phaser.Scene, x: number, y: number, str: string, size: number, color: string = C.text, bold = true, maxWidth = 0, iconBacking = false, maxLines = 1) {
  const c = scene.add.container(x, y);
  // Слова и значки; при maxLines > 1 — перенос по словам, потом уменьшение до 70%, дальше — сжатие целиком.
  const build = (sz: number) => {
    const r = sz * 0.4;
    const items: { obj: Phaser.GameObjects.Text | G; w: number; space: boolean }[] = [];
    for (const part of str.split(/(\{coin\}|\{light\})/).filter(Boolean)) {
      if (part === COIN || part === LIGHT) {
        const g = scene.add.graphics();
        // На светлой (оранжевой) кнопке значок теряется — тёмная подложка-кружок.
        if (iconBacking) {
          g.fillStyle(0x2a1a05, 0.85);
          g.fillCircle(r, 0, r * 1.3);
        }
        (part === COIN ? drawCoin : drawLight)(g, r, 0, r);
        items.push({ obj: g, w: r * 2 + sz * 0.06, space: false });
      } else {
        const words = maxLines > 1 ? part.split(/( +)/).filter(Boolean) : [part];
        for (const w of words) {
          const t = scene.add.text(0, 0, w, { fontFamily: FONT, fontSize: `${sz}px`, color, fontStyle: bold ? 'bold' : 'normal' }).setOrigin(0, 0.5);
          items.push({ obj: t, w: t.width, space: /^ +$/.test(w) });
        }
      }
    }
    const lines: (typeof items)[] = [[]];
    let lw = 0;
    for (const it of items) {
      if (maxWidth && maxLines > 1 && lw + it.w > maxWidth && lines[lines.length - 1].length && !it.space) {
        lines.push([]);
        lw = 0;
      }
      if (it.space && lines[lines.length - 1].length === 0) {
        it.obj.destroy();
        continue;
      }
      lines[lines.length - 1].push(it);
      lw += it.w;
    }
    return { lines, sz };
  };
  let res = build(size);
  const minSize = Math.floor(size * 0.7);
  const lineW = (l: { w: number; space: boolean }[]) => l.reduce((s2, it) => s2 + it.w, 0) - (l.length && l[l.length - 1].space ? l[l.length - 1].w : 0);
  while (maxLines > 1 && maxWidth && (res.lines.length > maxLines || res.lines.some((l) => lineW(l) > maxWidth)) && res.sz > minSize) {
    for (const l of res.lines) for (const it of l) it.obj.destroy();
    res = build(Math.max(minSize, res.sz - Math.max(1, Math.round(size * 0.05))));
  }
  const lh = res.sz * 1.3;
  let maxW = 0;
  res.lines.forEach((l, i) => {
    const w = lineW(l);
    maxW = Math.max(maxW, w);
    let cx = -w / 2;
    const ly = (i - (res.lines.length - 1) / 2) * lh;
    for (const it of l) {
      it.obj.setPosition(cx, ly);
      cx += it.w;
      c.add(it.obj);
    }
  });
  c.setSize(maxW, lh * res.lines.length);
  if (maxWidth && maxW > maxWidth) c.setScale(maxWidth / maxW);
  return c;
}

/**
 * Надпись под переводы: со значками валют — одной строкой (richText, не шире w), иначе — UIText с переносом.
 * originX 0 — от левого края.
 */
export function smartText(scene: Phaser.Scene, x: number, y: number, str: string, o: { w: number; size: number; color?: string; bold?: boolean; lines?: number; h?: number; originX?: number }): Phaser.GameObjects.Container | Phaser.GameObjects.Text {
  if (/\{(coin|light)\}/.test(str)) {
    const r = richText(scene, x, y, str, o.size, o.color ?? C.text, o.bold ?? true, o.w, false, o.lines ?? 2);
    if (o.originX === 0) r.setX(x + (r.width * r.scaleX) / 2);
    r.setData('ui', { w: o.w, h: o.h ?? o.size * 1.4 * (o.lines ?? 2), src: str });
    return r;
  }
  return uiText(scene, x, y, str, { w: o.w, size: o.size, color: o.color, bold: o.bold, lines: o.lines ?? 2, h: o.h, originX: o.originX ?? 0.5, align: o.originX === 0 ? 'left' : 'center' });
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
  const m = new Modal(scene, { w: 920, closable: false, depth: 60 });
  m.title(t('currency_title'), 64);
  const rows: [typeof drawCoin, string][] = [
    [drawCoin, t('currency_coin')],
    [drawLight, t('currency_light')],
  ];
  rows.forEach(([draw, str], i) => {
    const row = scene.add.container(0, 0);
    const ig = scene.add.graphics().setPosition(-m.inner / 2 + 70, 0);
    draw(ig, 0, 0, 58);
    scene.tweens.add({ targets: ig, y: -8, duration: 900 + i * 150, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    const label = uiText(scene, -m.inner / 2 + 160, 0, str, { w: m.inner - 170, lines: 4, size: 36, originX: 0, align: 'left', lineSpacing: 4 });
    row.add([ig, label]);
    m.add(row, Math.max(150, label.height + 20), 24);
  });
  m.rich(t('currency_note'), 34, C.textDim);
  m.buttons([
    new Button(scene, 0, 0, {
      w: 460,
      h: 120,
      label: t('rule_ok'),
      primary: true,
      onClick: () => {
        sfx.tap();
        m.close(true);
        onClose();
      },
    }),
  ]);
  m.open();
}

/** Текст награды календаря. */
export function dailyLabel(r: DailyReward): string {
  if ('coins' in r) return t('reward.coins', { n: r.coins });
  if ('hints' in r) return t('daily_hints', { n: r.hints });
  return tk(`item.${r.item}`);
}

/**
 * Окно ежедневной награды: календарь на 7 дней, сегодняшний день подсвечен, кнопка «Забрать».
 * Показывается на карте, если награда сегодня ещё не получена.
 */
export function showDailyDialog(scene: Phaser.Scene, onClose: () => void) {
  const day = dailyAvailable();
  if (day === null) return false;
  const m = new Modal(scene, { w: 940, onClose });
  m.title(t('daily_title'), 64);
  m.text(t('daily_sub', { day }), 34, C.textDim, 2);
  // 7 клеток: 4 сверху, 3 снизу.
  const grid = scene.add.container(0, 0);
  const cw = 190;
  DAILY.forEach((r, i) => {
    const row = i < 4 ? 0 : 1;
    const col = row === 0 ? i : i - 4;
    const x = row === 0 ? (col - 1.5) * (cw + 20) : (col - 1) * (cw + 20);
    const y = -125 + row * 250;
    const done = i + 1 < day;
    const now = i + 1 === day;
    const cg = scene.add.graphics();
    cg.fillStyle(now ? 0x3a3a1a : C.card, done ? 0.5 : 1);
    cg.fillRoundedRect(x - cw / 2, y - 105, cw, 210, 30);
    cg.lineStyle(now ? 8 : 3, now ? C.primary : C.cardEdge, now ? 1 : 0.6);
    cg.strokeRoundedRect(x - cw / 2, y - 105, cw, 210, 30);
    grid.add(cg);
    if ('coins' in r) drawCoin(cg, x, y - 25, 34);
    else if ('hints' in r) {
      const ig = scene.add.graphics().setPosition(x, y - 25);
      drawIcon(ig, 'bulb', 80, C.icon);
      grid.add(ig);
    } else grid.add(itemIcon(scene, r.item, 110).setPosition(x, y - 18));
    grid.add(text(scene, x, y - 85, t('daily_day', { n: i + 1 }), 26, C.textDim, false, { w: cw - 20 }));
    const cap = 'coins' in r ? fmt(r.coins) : 'hints' in r ? t('daily_hints_short', { n: r.hints }) : t('daily_item_short');
    grid.add(text(scene, x, y + 62, cap, 32, done ? C.textDim : C.text, true, { w: cw - 20 }));
    if (done) {
      const ck = scene.add.graphics();
      ck.lineStyle(12, 0x8ef0c8, 1);
      ck.beginPath();
      ck.moveTo(x - 30, y - 25);
      ck.lineTo(x - 8, y);
      ck.lineTo(x + 34, y - 52);
      ck.strokePath();
      grid.add(ck);
    }
  });
  m.add(grid, 470, 24);
  m.add(richText(scene, 0, 0, t('daily_today', { reward: dailyLabel(DAILY[day - 1]) }), 42, '#ffd36b', true, m.inner, false, 2), 110, 20);
  const claim = new Button(scene, 0, 0, {
    w: 520,
    h: 130,
    label: t('daily_claim'),
    primary: true,
    onClick: () => {
      const res = claimDaily();
      sfx.win();
      if (res && 'item' in res.reward && !res.gotSkin) toast(scene, t('daily_have_item', { n: res.reward.orCoins }));
      m.close(true);
    },
  });
  m.buttons([claim]);
  // «Удвоить за ролик»: монеты и подсказки (не вещь 7-го дня); награда — только за досмотренный ролик.
  const today = DAILY[day - 1];
  const double = dailyDoublable(today)
    ? rewardedButton(scene, 0, 0, {
        place: 'daily_double',
        label: t('daily_double_ad'),
        w: 520,
        h: 100,
        fontSize: 36,
        onReward: () => {
          claimDaily(true);
          sfx.win();
          toast(scene, t('daily_doubled', { reward: dailyLabel({ ...today, ...('coins' in today ? { coins: today.coins * 2 } : 'hints' in today ? { hints: today.hints * 2 } : {}) } as DailyReward) }));
          m.close(true);
        },
      })
    : null;
  if (double) m.buttons([double]);
  m.open();
  return true;
}
