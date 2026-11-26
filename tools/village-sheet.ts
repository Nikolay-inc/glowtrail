// Лист для проверки глазами: постройки деревни (уровни 0–3), силуэты Горного города, украшения, улицы, жители.
// Открыть: npx vite, затем /tools/village-sheet.html?page=valley|forest|decor|misc|zoom&id=<постройка>

import Phaser from 'phaser';
import { createTextures } from '../src/ui/draw';
import { DECOR_TYPES, FOREST_BUILDINGS, VALLEY_BUILDINGS, decorIcon, drawBuilding, drawDecor, drawResident, drawSilhouette, drawStreet, streetSample, type BuildingView } from '../src/ui/village';

const params = new URLSearchParams(location.search);
const page = params.get('page') ?? 'valley';
const W = 2100;
const HEIGHTS: Record<string, number> = { valley: 1280, forest: 1280, decor: 1500, misc: 1500, zoom: 900 };
const H = HEIGHTS[page] ?? 1300;

const LABEL = { fontFamily: 'sans-serif', fontSize: '16px', color: '#9aa3d6' };
const TITLE = { fontFamily: 'sans-serif', fontSize: '24px', color: '#fff1cc', fontStyle: 'bold' };

function label(scene: Phaser.Scene, x: number, y: number, text: string, style = LABEL) {
  return scene.add.text(x, y, text, style).setOrigin(0.5, 0);
}

/** Постройка как в деревне: тело, свечение окон и фонарей, жители-силуэты. */
function building(scene: Phaser.Scene, x: number, y: number, id: string, level: number, s: number): BuildingView {
  const lit = level > 0;
  const b = drawBuilding(scene, id, lit, level);
  const c = scene.add.container(x, y);
  if (lit) c.add(scene.add.image(0, -b.height * s * 0.35, 'glow').setTint(0xffb84d).setBlendMode(Phaser.BlendModes.ADD).setScale(3.4 * s * (b.width / 260), 2.4 * s).setAlpha(0.18));
  c.add(scene.add.container(0, 0, b.objects).setScale(s));
  if (lit) for (const l of b.lights) c.add(scene.add.image(l.x * s, l.y * s, 'glow').setTint(l.c ?? 0xffc65c).setBlendMode(Phaser.BlendModes.ADD).setScale((l.r * s) / 34).setAlpha(0.7));
  for (let i = 0; i < b.residents; i++) {
    const fig = scene.add.graphics();
    fig.fillStyle(0x070a18, 1);
    fig.fillCircle(0, -44, 9);
    fig.fillTriangle(-15, 0, 15, 0, 0, -38);
    const side = i % 2 ? 1 : -1;
    fig.setPosition(side * (b.width / 2 - 20 - Math.floor(i / 2) * 34) * s, 6).setScale(s * 1.2);
    c.add(fig);
  }
  // Рамка ширины по земле и высоты
  const fr = scene.add.graphics();
  fr.lineStyle(1, 0x4a57a8, 0.6);
  fr.strokeRect((-b.width / 2) * s, -b.height * s, b.width * s, b.height * s);
  c.add(fr);
  return b;
}

function buildings(scene: Phaser.Scene, ids: readonly string[], title: string) {
  label(scene, W / 2, 8, title, TITLE);
  const s = 0.5;
  const cw = W / 8;
  const rh = 244;
  ids.forEach((id, i) => {
    const col0 = (i % 2) * 4;
    const row = Math.floor(i / 2);
    const gy = 50 + row * rh + 196;
    const ground = scene.add.graphics();
    ground.fillStyle(0x141a30, 1);
    ground.fillRect(col0 * cw + 6, gy - 186, cw * 4 - 12, 230);
    ground.fillStyle(0x1c2a28, 1);
    ground.fillRect(col0 * cw + 6, gy, cw * 4 - 12, 44);
    for (let lv = 0; lv <= 3; lv++) {
      const x = (col0 + lv + 0.5) * cw;
      const b = building(scene, x, gy, id, lv, s);
      label(scene, x, gy + 12, `${id} · ${lv}  w${b.width} h${b.height} r${b.residents}`);
    }
  });
}

function zoom(scene: Phaser.Scene) {
  const id = params.get('id') ?? 'bakery';
  label(scene, W / 2, 8, `${id}: уровни 0–3, масштаб 1.4`, TITLE);
  const ground = scene.add.graphics();
  ground.fillStyle(0x1c2a28, 1);
  ground.fillRect(0, 780, W, 120);
  for (let lv = 0; lv <= 3; lv++) {
    const x = (lv + 0.5) * (W / 4);
    const b = building(scene, x, 780, id, lv, 1.4);
    label(scene, x, 800, `lv ${lv}: w ${b.width}, h ${b.height}, lights ${b.lights.length}, residents ${b.residents}`);
  }
}

function decor(scene: Phaser.Scene) {
  label(scene, W / 2, 8, 'Украшения: 8 типов × 5 вариантов (drawDecor, масштаб 1) и decorIcon 110', TITLE);
  const rh = 178;
  DECOR_TYPES.forEach((type, r) => {
    const gy = 60 + r * rh + 140;
    const ground = scene.add.graphics();
    ground.fillStyle(0x1c2a28, 1);
    ground.fillRect(20, gy, W - 40, 30);
    label(scene, 70, gy - 70, type, { ...LABEL, fontSize: '20px', color: '#ffd36b' });
    for (let v = 0; v < 5; v++) {
      const x = 260 + v * 380;
      const d = drawDecor(scene, type, v);
      const c = scene.add.container(x, gy, d.objects);
      for (const l of d.lights) c.add(scene.add.image(l.x, l.y, 'glow').setTint(l.c ?? 0xffc65c).setBlendMode(Phaser.BlendModes.ADD).setScale(l.r / 34).setAlpha(0.7));
      const fr = scene.add.graphics();
      fr.lineStyle(1, 0x4a57a8, 0.6);
      fr.strokeRect(-d.width / 2, -d.height, d.width, d.height);
      c.add(fr);
      label(scene, x, gy + 8, `${v}: ${d.width}×${d.height}`);
      const ix = x + 150;
      const iy = gy - 60;
      const bg = scene.add.graphics();
      bg.fillStyle(0x2b3470, 1);
      bg.fillRoundedRect(ix - 55, iy - 55, 110, 110, 14);
      decorIcon(scene, type, v, 110).setPosition(ix, iy);
    }
  });
}

function misc(scene: Phaser.Scene) {
  label(scene, W / 2, 8, 'Силуэты Горного города (kind 0–9), масштаб 0.7', TITLE);
  const names = ['mine', 'forge', 'cable car', 'crystal cave', 'goat farm', 'bell tower', 'hot springs', 'stone bridge', 'star temple', 'summit lighthouse'];
  for (let k = 0; k < 10; k++) {
    const x = 210 + (k % 5) * 420;
    const y = 300 + Math.floor(k / 5) * 290;
    const bg = scene.add.graphics();
    bg.fillStyle(0x161c3a, 1);
    bg.fillRect(x - 200, y - 260, 400, 280);
    const s = drawSilhouette(scene, k);
    scene.add.container(x, y, s.objects).setScale(0.7);
    label(scene, x, y + 4, `${k}: ${names[k]}  ${s.width}×${s.height}`);
  }
  label(scene, W / 2, 640, 'Улицы: drawStreet шаги 0–3 (по ломаной) и streetSample 360×180', TITLE);
  for (let st = 0; st < 4; st++) {
    const y0 = 720 + st * 130;
    const g = scene.add.graphics();
    g.fillStyle(0x24362a, 1);
    g.fillRect(20, y0 - 50, 1500, 120);
    const pts = [new Phaser.Math.Vector2(40, y0 + 20), new Phaser.Math.Vector2(400, y0 - 10), new Phaser.Math.Vector2(760, y0 + 40), new Phaser.Math.Vector2(1100, y0), new Phaser.Math.Vector2(1500, y0 + 10)];
    const { lamps } = drawStreet(g, pts, st as 0 | 1 | 2 | 3);
    for (const l of lamps) scene.add.image(l.x, l.y, 'glow').setTint(0xffc65c).setBlendMode(Phaser.BlendModes.ADD).setScale(16 / 34).setAlpha(0.75);
    label(scene, 1520 + 290, y0 - 56 + 128, `streetSample(${st})`);
    streetSample(scene, st as 0 | 1 | 2 | 3, 360, 120).setPosition(1810, y0 + 6);
  }
  label(scene, W / 2, 1250, 'Жители: drawResident, size 110', TITLE);
  const ids = [...VALLEY_BUILDINGS, ...FOREST_BUILDINGS, 'unknown'];
  ids.forEach((id, i) => {
    const x = 70 + i * 98;
    drawResident(scene, id, 88).setPosition(x, 1340);
    scene.add.text(x, 1392, id, { ...LABEL, fontSize: '12px' }).setOrigin(0.5, 0);
  });
  ids.slice(0, 6).forEach((id, i) => {
    drawResident(scene, id, 36).setPosition(70 + i * 50, 1450);
  });
}

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: W,
  height: H,
  backgroundColor: '#0e1430',
  scene: {
    create(this: Phaser.Scene) {
      createTextures(this);
      if (page === 'valley') buildings(this, VALLEY_BUILDINGS, 'Долина: уровни 0 / 1 / 2 / 3 (масштаб 0.5, рамка — width × height)');
      else if (page === 'forest') buildings(this, FOREST_BUILDINGS, 'Лесной квартал: уровни 0 / 1 / 2 / 3 (масштаб 0.5)');
      else if (page === 'decor') decor(this);
      else if (page === 'misc') misc(this);
      else zoom(this);
      (window as unknown as { sheetReady: boolean }).sheetReady = true;
    },
  },
});
