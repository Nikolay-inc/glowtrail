// Река деревни и мост через неё. Река — полоса с берегами на всю видимую ширину (за края экрана на любом
// размере), плавно изгибается и сужается к мосту; по воде — мягкие блики. Мост на карте — вид сверху:
// настил поперёк реки от берега до берега (тропинка идёт прямо по нему), перила по бокам, столбы с фонарями.
// Каменный (Долина) или верёвочный (Лесной квартал); у заброшенного не хватает досок, на уровнях 2–3 —
// цветы, вывеска и гирлянда.

import Phaser from 'phaser';
import type { BuildingView } from './village';

/** Где мост: x и полуширина реки у моста. */
export const BRIDGE_X = 540;
export const RIVER_HW_BRIDGE = 46;

/** Река: центр y(x) и полуширина (у моста — уже, к краям — шире). Производная в точке моста — 0: мост стоит ровно поперёк. */
export function riverShape(cy: number) {
  const y = (x: number) => {
    const dx = x - BRIDGE_X;
    return cy - 22 * (1 - Math.cos(dx / 320)) + 9 * (1 - Math.cos(dx / 140));
  };
  const hw = (x: number) => RIVER_HW_BRIDGE + 10 * Math.min(1, Math.abs(x - BRIDGE_X) / 320);
  return { y, hw };
}

/** Нарисовать реку от x0 до x1 (видимая область с запасом). Возвращает картинки бликов (добавить в слой карты). */
export function drawRiver(scene: Phaser.Scene, g: Phaser.GameObjects.Graphics, cy: number, x0: number, x1: number, color: { water: number; ripple: number }): Phaser.GameObjects.Image[] {
  const { y, hw } = riverShape(cy);
  const xs: number[] = [];
  for (let x = x0; x < x1; x += 16) xs.push(x);
  xs.push(x1);
  const band = (k: number, dy = 0) => [...xs.map((x) => new Phaser.Math.Vector2(x, y(x) - hw(x) * k + dy)), ...[...xs].reverse().map((x) => new Phaser.Math.Vector2(x, y(x) + hw(x) * k + dy))];
  // Берега: тёмная кромка чуть шире воды, потом вода, светлее к середине.
  g.fillStyle(0x060c10, 0.55);
  g.fillPoints(band(1.12, 3), true);
  g.fillStyle(color.water, 1);
  g.fillPoints(band(1), true);
  g.fillStyle(color.ripple, 0.12);
  g.fillPoints(band(0.55, 4), true);
  // Дальний берег отбрасывает тень на воду.
  g.lineStyle(6, 0x050a14, 0.35);
  g.strokePoints(xs.map((x) => new Phaser.Math.Vector2(x, y(x) - hw(x) + 3)), false);
  // Мягкие блики: вытянутые пятна света по течению (мерцают).
  const out: Phaser.GameObjects.Image[] = [];
  const rnd = new Phaser.Math.RandomDataGenerator(['river']);
  for (let x = x0 + 60; x < x1 - 40; x += rnd.between(150, 230)) {
    if (Math.abs(x - BRIDGE_X) < 110) continue; // под мостом не блестит
    const img = scene.add.image(x, y(x) + rnd.between(-12, 14), 'glow').setTint(color.ripple).setBlendMode(Phaser.BlendModes.ADD).setScale(rnd.realInRange(1.1, 1.7), 0.18).setAlpha(0.22);
    scene.tweens.add({ targets: img, alpha: 0.06, x: x + 18, duration: rnd.between(1800, 2800), yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    out.push(img);
  }
  return out;
}

/**
 * Мост через реку, вид сверху: ближний конец — точка (0, 0) на южном берегу, дальний — (0, −len) на северном.
 * kind: 'stone' — каменный с парапетом, 'rope' — верёвочный (доски с зазорами, провисшие канаты).
 */
export function drawCrossing(scene: Phaser.Scene, kind: 'stone' | 'rope', lit: boolean, level: number, len: number): BuildingView {
  const g = scene.add.graphics();
  const v: BuildingView = { objects: [g], height: len + 70, width: 190, lights: [], chimneys: [], residents: lit ? 1 + Math.max(0, level - 1) : 0 };
  const wN = 150;
  const wF = 122;
  const at = (k: number) => ({ y: -len * k, half: (wN + (wF - wN) * k) / 2 }); // k: 0 — ближний конец, 1 — дальний
  const deck = lit ? (kind === 'stone' ? 0x9a92a4 : 0x8a6a48) : kind === 'stone' ? 0x2e3048 : 0x2a2236;
  const deckDark = lit ? (kind === 'stone' ? 0x6e6878 : 0x5a4028) : 0x1c1e30;
  const rail = lit ? (kind === 'stone' ? 0xb8b0c2 : 0x6b4a2b) : 0x24263a;
  // Тень моста на воде.
  g.fillStyle(0x000000, 0.28);
  g.fillEllipse(8, -len * 0.5 + 6, wN + 40, len * 0.75);
  // Настил.
  g.fillStyle(deck, 1);
  g.fillPoints([new Phaser.Math.Vector2(-wN / 2, 0), new Phaser.Math.Vector2(wN / 2, 0), new Phaser.Math.Vector2(wF / 2, -len), new Phaser.Math.Vector2(-wF / 2, -len)], true);
  if (kind === 'stone') {
    // Каменная кладка: ряды и стыки вразбежку.
    g.lineStyle(2, deckDark, 0.9);
    for (let k = 1; k < 9; k++) {
      const a = at(k / 9);
      g.lineBetween(-a.half, a.y, a.half, a.y);
      for (let j = -2; j <= 2; j++) {
        const x = (j + (k % 2 ? 0.5 : 0)) * a.half * 0.4;
        if (Math.abs(x) < a.half) g.lineBetween(x, a.y, x, a.y + len / 9);
      }
    }
    if (!lit) {
      // Выбоины в камне.
      g.fillStyle(0x0a0b18, 1);
      g.fillEllipse(-20, -len * 0.4, 30, 14);
      g.fillEllipse(26, -len * 0.7, 22, 10);
    }
  } else {
    // Доски поперёк с зазорами (у заброшенного — двух нет, видна вода).
    for (let k = 0; k < 11; k++) {
      const a = at((k + 0.15) / 11);
      const b = at((k + 0.85) / 11);
      if (!lit && (k === 4 || k === 7)) {
        g.fillStyle(0x0f2a3a, 1);
      } else g.fillStyle(k % 2 ? deck : deckDark, 1);
      g.fillPoints([new Phaser.Math.Vector2(-a.half, a.y), new Phaser.Math.Vector2(a.half, a.y), new Phaser.Math.Vector2(b.half, b.y), new Phaser.Math.Vector2(-b.half, b.y)], true);
    }
  }
  // Перила по обеим сторонам: каменный парапет или столбики с провисшим канатом.
  for (const side of [-1, 1]) {
    const pts = (off: number) => [0, 0.25, 0.5, 0.75, 1].map((k) => new Phaser.Math.Vector2(side * (at(k).half + off), at(k).y));
    if (kind === 'stone') {
      g.lineStyle(14, rail, 1);
      g.strokePoints(pts(4), false);
      g.lineStyle(4, lit ? 0xe8e0f0 : 0x34364e, 0.6);
      g.strokePoints(pts(1), false);
      if (!lit && side > 0) {
        // Обломанный кусок парапета.
        g.fillStyle(0x05060e, 1);
        g.fillRect(side * at(0.55).half - 4, at(0.55).y - 12, 16, 22);
      }
    } else {
      g.fillStyle(rail, 1);
      for (const k of [0, 0.33, 0.66, 1]) g.fillRect(side * (at(k).half + 4) - 4, at(k).y - 14, 8, 18);
      g.lineStyle(4, lit ? 0xd8c090 : 0x3a3448, 1);
      const curve = new Phaser.Curves.QuadraticBezier(new Phaser.Math.Vector2(side * (at(0).half + 4), -12), new Phaser.Math.Vector2(side * (at(0.5).half + 12), at(0.5).y + 6), new Phaser.Math.Vector2(side * (at(1).half + 4), at(1).y - 12));
      g.strokePoints(curve.getPoints(16), false);
    }
  }
  // Столбы на концах (на берегах) и фонари.
  for (const k of [0, 1]) {
    for (const side of [-1, 1]) {
      const a = at(k);
      const x = side * (a.half + 6);
      g.fillStyle(lit ? (kind === 'stone' ? 0xc8c0d2 : 0x6b4a2b) : 0x24263a, 1);
      g.fillRect(x - 9, a.y - 40, 18, 44);
      g.fillStyle(0x1a1626, 1);
      g.fillRect(x - 3, a.y - 70, 6, 32);
      g.fillStyle(lit ? 0xffd36b : 0x0d1024, 1);
      g.fillRoundedRect(x - 9, a.y - 88, 18, 20, 4);
      g.fillStyle(0x1a1626, 1);
      g.fillTriangle(x - 12, a.y - 88, x + 12, a.y - 88, x, a.y - 98);
      if (lit) v.lights.push({ x, y: a.y - 78, r: 16 });
    }
  }
  // Уровень 2: ящики с цветами у ближних столбов и табличка; уровень 3: гирлянда вдоль перил и флажки.
  if (lit && level >= 2) {
    for (const side of [-1, 1]) {
      const x = side * (at(0).half + 30);
      g.fillStyle(0x6b4a2b, 1);
      g.fillRect(x - 16, -12, 32, 14);
      for (const [dx, c] of [[-9, 0xffb3cf], [0, 0xfff4e0], [9, 0xffd45a]] as const) {
        g.fillStyle(c, 1);
        g.fillCircle(x + dx, -16, 5);
      }
    }
    g.fillStyle(0x6b4a2b, 1);
    g.fillRoundedRect(-34, -len - 112, 68, 24, 6);
    g.lineStyle(3, 0xffd36b, 0.9);
    g.strokeRoundedRect(-34, -len - 112, 68, 24, 6);
    g.lineStyle(3, 0x1a1626, 1);
    g.lineBetween(-20, -len - 88, -20, -len - 60);
    g.lineBetween(20, -len - 88, 20, -len - 60);
    v.height = len + 115;
  }
  if (lit && level >= 3) {
    for (const side of [-1, 1]) {
      for (let k = 0.1; k < 0.95; k += 0.12) {
        const a = at(k);
        const x = side * (a.half + 4);
        g.fillStyle([0xffd36b, 0xff9ec7, 0x9dff5c][Math.round(k * 10) % 3], 1);
        g.fillCircle(x, a.y - 18, 4);
        v.lights.push({ x, y: a.y - 18, r: 6 });
      }
      const a = at(1);
      const x = side * (a.half + 6);
      g.lineStyle(3, 0x1a1626, 1);
      g.lineBetween(x, a.y - 98, x, a.y - 124);
      g.fillStyle(side < 0 ? 0xff7a59 : 0xffd36b, 1);
      g.fillTriangle(x, a.y - 124, x, a.y - 110, x + side * 22, a.y - 117);
    }
    v.height = Math.max(v.height, len + 125);
  }
  return v;
}
