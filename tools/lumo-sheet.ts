// Лист для проверки глазами: все вещи гардероба, нарисованные src/ui/lumo.ts.
// Открыть: npx vite, затем /tools/lumo-sheet.html?page=compare|heads|outfits|items|sets|icons

import Phaser from 'phaser';
import { createTextures } from '../src/ui/draw';
import { C } from '../src/ui/theme';
import { DEFAULT_LOOK, SETS, WARDROBE, itemsOf, type Look } from '../src/core/wardrobe';
import { createLumoFigure, createPet, drawFieldLamp, drawItemIcon, drawLumoLook, emitTrail, ensureTrailTextures, trailConfig } from '../src/ui/lumo';

const page = new URLSearchParams(location.search).get('page') ?? 'compare';
const W = 1800;
const HEIGHTS: Record<string, number> = { zoom: 1700, compare: 1300, heads: 1500, outfits: 2050, items: 2000, sets: 1450, icons: 1900 };
const H = HEIGHTS[page] ?? 1400;

const LABEL = { fontFamily: 'sans-serif', fontSize: '18px', color: '#9aa3d6' };
const TITLE = { fontFamily: 'sans-serif', fontSize: '26px', color: '#fff1cc', fontStyle: 'bold' };

function label(scene: Phaser.Scene, x: number, y: number, text: string, style = LABEL) {
  return scene.add.text(x, y, text, style).setOrigin(0.5, 0);
}

function lumoAt(scene: Phaser.Scene, x: number, y: number, s: number, look: Look, facing: 1 | -1 = 1) {
  const g = scene.add.graphics().setPosition(x, y);
  drawLumoLook(g, s, look, { facing });
  return g;
}

/** Сетка: n элементов, cols колонок, клетка cw×ch, начало (x0, y0); cb(x, y, i) — центр клетки. */
function grid(n: number, cols: number, x0: number, y0: number, cw: number, ch: number, cb: (x: number, y: number, i: number) => void) {
  for (let i = 0; i < n; i++) cb(x0 + (i % cols) * cw + cw / 2, y0 + Math.floor(i / cols) * ch + ch / 2, i);
  return y0 + Math.ceil(n / cols) * ch;
}

/** Прежний Lumo (копия drawLumo до гардероба, аватарка 0) — для сравнения. */
function drawOldLumo(g: Phaser.GameObjects.Graphics, s: number) {
  g.fillStyle(0x000000, 0.3);
  g.fillEllipse(0, s * 0.42, s * 0.7, s * 0.16);
  g.fillStyle(0x3d5bd9, 1);
  g.fillTriangle(-s * 0.34, s * 0.42, s * 0.34, s * 0.42, 0, -s * 0.2);
  g.fillRoundedRect(-s * 0.34, s * 0.08, s * 0.68, s * 0.36, s * 0.14);
  g.fillStyle(0xffffff, 0.12);
  g.fillRoundedRect(-s * 0.3, s * 0.1, s * 0.6, s * 0.08, s * 0.04);
  g.fillStyle(0xffe3c2, 1);
  g.fillCircle(0, -s * 0.06, s * 0.2);
  g.fillStyle(0x2a3fa8, 1);
  g.fillTriangle(-s * 0.24, -s * 0.1, s * 0.24, -s * 0.1, s * 0.06, -s * 0.52);
  g.fillStyle(C.lanternOn, 1);
  g.fillCircle(s * 0.06, -s * 0.52, s * 0.05);
  g.fillStyle(0x1a1a2e, 1);
  g.fillCircle(-s * 0.07, -s * 0.03, s * 0.035);
  g.fillCircle(s * 0.07, -s * 0.03, s * 0.035);
  g.fillStyle(0xff9e9e, 0.6);
  g.fillCircle(-s * 0.13, s * 0.04, s * 0.035);
  g.fillCircle(s * 0.13, s * 0.04, s * 0.035);
  g.lineStyle(s * 0.05, 0x6b4a2b, 1);
  g.lineBetween(s * 0.3, s * 0.4, s * 0.36, -s * 0.06);
  const lx = s * 0.42;
  const ly = -s * 0.11;
  g.fillStyle(C.lanternOn, 1);
  g.fillRoundedRect(lx - s * 0.1, ly - s * 0.09, s * 0.2, s * 0.18, s * 0.05);
  g.fillStyle(0xffffff, 0.9);
  g.fillCircle(lx, ly, s * 0.04);
}

function oldLumo(scene: Phaser.Scene, x: number, y: number, s: number) {
  scene.add.image(x + 0.42 * s, y - 0.12 * s, 'glow').setTint(C.lanternOn).setBlendMode(Phaser.BlendModes.ADD).setScale((s * 1.4) / 128).setAlpha(0.7);
  const g = scene.add.graphics().setPosition(x, y);
  drawOldLumo(g, s);
}

function compare(scene: Phaser.Scene) {
  label(scene, 450, 20, 'Старый createLumo (s=480)', TITLE);
  label(scene, 1350, 20, 'Новый DEFAULT_LOOK (s=480)', TITLE);
  oldLumo(scene, 450, 360, 480);
  const glow = scene.add.image(1350 + 0.37 * 480, 360 - 0.13 * 480, 'glow').setTint(C.lanternOn).setBlendMode(Phaser.BlendModes.ADD).setScale((480 * 1.4) / 128).setAlpha(0.7);
  glow.setDepth(-1);
  lumoAt(scene, 1350, 360, 480, DEFAULT_LOOK);
  label(scene, 900, 640, 'LumoFigure (анимация, моргание, взмах, ходьба, прыжок) s=200 — и зеркально', TITLE);
  const f1 = createLumoFigure(scene, 200, DEFAULT_LOOK).setPosition(500, 820);
  const f2 = createLumoFigure(scene, 200, { ...DEFAULT_LOOK, ...SETS[1].parts } as Look, { withPet: true }).setPosition(900, 820);
  const f3 = createLumoFigure(scene, 200, { ...DEFAULT_LOOK, ...SETS[0].parts } as Look, { withPet: true }).setPosition(1300, 820);
  f1.wave();
  (window as unknown as { figs: unknown[] }).figs = [f1, f2, f3];
  f2.face(-1);
  f3.walk(true);
  scene.time.addEvent({ delay: 1600, loop: true, callback: () => (f1.wave(), f2.hop()) });
  label(scene, 900, 960, 'Маленькие s=60 и s=100', TITLE);
  const looks: Look[] = [DEFAULT_LOOK, ...SETS.map((s) => ({ ...DEFAULT_LOOK, ...s.parts }) as Look)];
  looks.forEach((l, i) => {
    const x = 120 + i * 150;
    const g1 = scene.add.graphics().setPosition(x, 1050);
    drawLumoLook(g1, 60, l);
    const g2 = scene.add.graphics().setPosition(x, 1180);
    drawLumoLook(g2, 100, l);
  });
  oldLumo(scene, 120 + looks.length * 150, 1050, 60);
  oldLumo(scene, 120 + looks.length * 150, 1180, 100);
  label(scene, 120 + looks.length * 150, 1240, 'старый');
}

function heads(scene: Phaser.Scene) {
  label(scene, W / 2, 10, 'Головные уборы (11), s=220', TITLE);
  let y = grid(11, 6, 0, 40, 300, 330, (x, cy, i) => {
    const it = itemsOf('hat')[i];
    lumoAt(scene, x, cy + 20, 220, { ...DEFAULT_LOOK, hat: it.id });
    label(scene, x, cy + 130, it.id);
  });
  label(scene, W / 2, y + 10, 'Лица (12), s=220', TITLE);
  y = grid(12, 6, 0, y + 40, 300, 330, (x, cy, i) => {
    const it = itemsOf('face')[i];
    lumoAt(scene, x, cy + 20, 220, { ...DEFAULT_LOOK, face: it.id });
    label(scene, x, cy + 130, it.id);
  });
}

function outfits(scene: Phaser.Scene) {
  label(scene, W / 2, 10, 'Одежда (10) × цвета, s=160', TITLE);
  const outs = itemsOf('outfit');
  outs.forEach((it, r) => {
    const pals = it.palettes ?? [];
    const row = Math.floor(r / 2);
    const col0 = (r % 2) * 4;
    pals.forEach((_, c) => {
      const x = 120 + (col0 + c) * 215;
      const y = 140 + row * 385;
      lumoAt(scene, x, y, 160, { ...DEFAULT_LOOK, outfit: it.id, color: c });
      lumoAt(scene, x, y + 200, 160, { ...DEFAULT_LOOK, outfit: it.id, color: c, hat: 'hat-hood', staff: 'staff-round' }, -1);
    });
    label(scene, 120 + (col0 + 1.5) * 215, 140 + row * 385 + 300, it.id);
  });
}

function items(scene: Phaser.Scene) {
  label(scene, W / 2, 10, 'Посохи (8), s=220', TITLE);
  let y = grid(8, 8, 0, 40, 225, 300, (x, cy, i) => {
    const it = itemsOf('staff')[i];
    const g = scene.add.graphics().setPosition(x - 30, cy);
    drawLumoLook(g, 220, { ...DEFAULT_LOOK, staff: it.id });
    label(scene, x, cy + 110, it.id);
  });
  label(scene, W / 2, y + 10, 'Аксессуары (9), s=220', TITLE);
  y = grid(9, 9, 0, y + 40, 200, 300, (x, cy, i) => {
    const it = itemsOf('accessory')[i];
    lumoAt(scene, x, cy, 200, { ...DEFAULT_LOOK, accessory: it.id });
    label(scene, x, cy + 100, it.id);
  });
  label(scene, W / 2, y + 10, 'Питомцы (7): рядом с Lumo s=220 (анимация)', TITLE);
  y = grid(7, 7, 0, y + 40, 257, 300, (x, cy, i) => {
    const it = itemsOf('pet')[i];
    lumoAt(scene, x + 40, cy, 200, DEFAULT_LOOK);
    createPet(scene, 200, it.id).setPosition(x + 40 - 100, cy + 0.42 * 200 - 0.45 * 0.45 * 200 + 6);
    label(scene, x, cy + 100, it.id);
  });
  label(scene, W / 2, y + 10, 'Следы (7): иконки и живой выброс', TITLE);
  ensureTrailTextures(scene);
  y = grid(7, 7, 0, y + 40, 257, 230, (x, cy, i) => {
    const it = itemsOf('trail')[i];
    const g = scene.add.graphics().setPosition(x, cy - 30);
    drawItemIcon(g, 130, it.id);
    if (trailConfig(it.id)) scene.time.addEvent({ delay: 500, loop: true, callback: () => emitTrail(scene, x, cy + 60, it.id, 5, 150) });
    label(scene, x, cy + 80, it.id);
  });
  label(scene, W / 2, y + 10, 'Фонари поля (8): горит / не горит, клетка 150', TITLE);
  y = grid(8, 8, 0, y + 40, 225, 360, (x, cy, i) => {
    const it = itemsOf('lamp')[i];
    for (const [k, lit] of [
      [-1, true],
      [1, false],
    ] as const) {
      const bg = scene.add.graphics().setPosition(x, cy - 80 + (k + 1) * 85);
      bg.fillStyle(C.cell, 1);
      bg.fillRoundedRect(-75, -75, 150, 150, 14);
      bg.fillStyle(C.road, 0.55);
      bg.fillRect(-75, -22, 150, 44);
      drawFieldLamp(bg, it.id, 150, lit);
    }
    label(scene, x, cy + 170, it.id);
  });
}

function sets(scene: Phaser.Scene) {
  label(scene, W / 2, 10, 'Наборы (10) целиком — с аурой и питомцем, s=260', TITLE);
  grid(SETS.length, 5, 0, 40, 360, 690, (x, cy, i) => {
    const set = SETS[i];
    const look = { ...DEFAULT_LOOK, ...set.parts } as Look;
    createLumoFigure(scene, 260, look, { withPet: true }).setPosition(x + 50, cy - 40);
    label(scene, x, cy + 120, set.id);
    const g = scene.add.graphics().setPosition(x, cy + 230);
    drawLumoLook(g, 110, look, { facing: -1 });
  });
}

function zoom(scene: Phaser.Scene) {
  label(scene, W / 2, 10, 'Крупно: лица и шапки (drawItemIcon, s=260)', TITLE);
  const list = [...itemsOf('face'), ...itemsOf('hat')];
  grid(list.length, 6, 0, 40, 300, 290, (x, cy, i) => {
    const g = scene.add.graphics().setPosition(x, cy - 10);
    g.fillStyle(0x2b3470, 1);
    g.fillRoundedRect(-130, -130, 260, 260, 20);
    drawItemIcon(g, 260, list[i].id);
    label(scene, x, cy + 122, list[i].id);
  });
}

function icons(scene: Phaser.Scene) {
  label(scene, W / 2, 10, 'drawItemIcon, s=130 (рамка — граница иконки)', TITLE);
  const list = WARDROBE.filter((w) => w.slot !== 'road' && w.slot !== 'arch');
  grid(list.length, 11, 0, 40, 163, 200, (x, cy, i) => {
    const it = list[i];
    const g = scene.add.graphics().setPosition(x, cy - 10);
    g.fillStyle(0x2b3470, 1);
    g.fillRoundedRect(-70, -70, 140, 140, 16);
    g.lineStyle(2, 0x4a57a8, 1);
    g.strokeRoundedRect(-65, -65, 130, 130, 14);
    drawItemIcon(g, 130, it.id);
    scene.add.text(x, cy + 66, it.id, { ...LABEL, fontSize: '14px' }).setOrigin(0.5, 0);
  });
}

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: W,
  height: H,
  backgroundColor: '#161c46',
  scene: {
    create(this: Phaser.Scene) {
      createTextures(this);
      ({ zoom, compare, heads, outfits, items, sets, icons } as Record<string, (s: Phaser.Scene) => void>)[page]?.(this);
      (window as unknown as { sheetReady: boolean }).sheetReady = true;
    },
  },
});
