// Постройки деревни в долине (простые фигуры, без картинок). Каждая узнаётся по силуэту.
// До восстановления — тёмные и чуть обветшалые (покосившиеся ставни, дыры в черепице, сломанный штакетник);
// после — тёплые цвета, свет в окнах, фонари у входа. Дым, жители и свечение добавляет VillageScene.

import Phaser from 'phaser';

type G = Phaser.GameObjects.Graphics;
const V2 = Phaser.Math.Vector2;

export interface BuildingView {
  /** Слои постройки (координаты — от точки на земле посередине). */
  objects: Phaser.GameObjects.GameObject[];
  /** Высота над землёй (для подписей и плашки). */
  height: number;
  /** Окна и фонари: где зажечь свет. */
  lights: { x: number; y: number; r: number }[];
  /** Трубы — откуда идёт дым. */
  chimneys: { x: number; y: number }[];
  /** Лопасти мельницы — крутятся, когда мельница восстановлена. */
  rotor?: Phaser.GameObjects.Graphics;
  /** Где луч маяка. */
  beam?: { x: number; y: number };
}

/** Палитра: тёмная (до) и тёплая (после). */
function pal(lit: boolean) {
  return lit
    ? { wall: 0x7a5f6e, wallDark: 0x5e4858, roof: 0x9a4a3e, roofDark: 0x6e3028, wood: 0x7a5236, woodDark: 0x5a3a24, stone: 0x8a8494, stoneDark: 0x5e5a6a, window: 0xffd36b, trim: 0xe8d2a8, leaf: 0x3e7a4a, leafDark: 0x2a5a36 }
    : { wall: 0x262a44, wallDark: 0x1c1f36, roof: 0x1e2038, roofDark: 0x151730, wood: 0x2a2236, woodDark: 0x1e1828, stone: 0x2e3048, stoneDark: 0x22243a, window: 0x0d1024, trim: 0x3a3a54, leaf: 0x1a2a26, leafDark: 0x13201c };
}

/** Тень на земле. */
function shadow(g: G, w: number) {
  g.fillStyle(0x000000, 0.35);
  g.fillEllipse(0, 6, w, 26);
}

/** Двускатная черепичная крыша: ряды черепицы, у тёмной — пара дыр. */
function roof(g: G, x: number, y: number, w: number, h: number, p: ReturnType<typeof pal>, lit: boolean) {
  g.fillStyle(p.roof, 1);
  g.fillTriangle(x - w / 2 - 16, y, x + w / 2 + 16, y, x, y - h);
  g.lineStyle(3, p.roofDark, 1);
  for (let i = 1; i < 4; i++) {
    const yy = y - (h * i) / 4;
    const half = (w / 2 + 16) * (1 - i / 4);
    g.lineBetween(x - half, yy, x + half, yy);
  }
  if (!lit) {
    g.fillStyle(0x0a0b18, 1);
    g.fillTriangle(x + w * 0.12, y - h * 0.3, x + w * 0.22, y - h * 0.3, x + w * 0.17, y - h * 0.45);
  }
}

/** Окно с наличником и ставнями (у тёмной постройки одна ставня покосилась). */
function windowAt(g: G, v: BuildingView, x: number, y: number, w: number, h: number, p: ReturnType<typeof pal>, lit: boolean, shutters = true) {
  g.fillStyle(p.trim, 1);
  g.fillRect(x - w / 2 - 4, y - h / 2 - 4, w + 8, h + 8);
  g.fillStyle(p.window, 1);
  g.fillRect(x - w / 2, y - h / 2, w, h);
  g.lineStyle(2, p.trim, 1);
  g.lineBetween(x, y - h / 2, x, y + h / 2);
  g.lineBetween(x - w / 2, y, x + w / 2, y);
  if (shutters) {
    g.fillStyle(p.wood, 1);
    g.fillRect(x - w / 2 - 14, y - h / 2, 9, h);
    if (lit) g.fillRect(x + w / 2 + 5, y - h / 2, 9, h);
    else g.fillPoints([new V2(x + w / 2 + 5, y - h / 2 + 4), new V2(x + w / 2 + 14, y - h / 2 + 8), new V2(x + w / 2 + 12, y + h / 2 + 6), new V2(x + w / 2 + 3, y + h / 2 + 2)], true);
  }
  v.lights.push({ x, y, r: Math.max(w, h) });
}

function door(g: G, x: number, y: number, w: number, h: number, p: ReturnType<typeof pal>, round = false) {
  g.fillStyle(p.woodDark, 1);
  if (round) {
    g.fillRect(x - w / 2, y - h + w / 2, w, h - w / 2);
    g.fillCircle(x, y - h + w / 2, w / 2);
  } else g.fillRect(x - w / 2, y - h, w, h);
  g.fillStyle(p.trim, 1);
  g.fillCircle(x + w * 0.28, y - h * 0.45, 3);
}

/** Фонарь на столбе у входа. */
function lampPost(g: G, v: BuildingView, x: number, y: number, h: number, p: ReturnType<typeof pal>) {
  g.fillStyle(0x1a1626, 1);
  g.fillRect(x - 3, y - h, 6, h);
  g.fillStyle(p.window, 1);
  g.fillRoundedRect(x - 9, y - h - 18, 18, 20, 4);
  g.fillStyle(0x1a1626, 1);
  g.fillTriangle(x - 12, y - h - 18, x + 12, y - h - 18, x, y - h - 28);
  v.lights.push({ x, y: y - h - 8, r: 16 });
}

/** Штакетник (у тёмной постройки — сломанные доски). */
function fence(g: G, x0: number, x1: number, y: number, p: ReturnType<typeof pal>, lit: boolean) {
  g.fillStyle(p.wood, 1);
  g.fillRect(x0, y - 22, x1 - x0, 5);
  let i = 0;
  for (let x = x0; x <= x1; x += 14, i++) {
    if (!lit && i % 4 === 2) continue;
    const tilt = !lit && i % 5 === 3 ? 6 : 0;
    g.fillPoints([new V2(x - 3, y), new V2(x + 3, y), new V2(x + 3 + tilt, y - 30), new V2(x + tilt, y - 36), new V2(x - 3 + tilt, y - 30)], true);
  }
}

function chimney(g: G, v: BuildingView, x: number, y: number, h: number, p: ReturnType<typeof pal>) {
  g.fillStyle(p.stoneDark, 1);
  g.fillRect(x - 11, y - h, 22, h);
  g.fillStyle(p.stone, 1);
  g.fillRect(x - 14, y - h - 6, 28, 8);
  v.chimneys.push({ x, y: y - h - 8 });
}

// ---------------------------------------------------------------------------

export function drawBuilding(scene: Phaser.Scene, id: string, lit: boolean): BuildingView {
  const g = scene.add.graphics();
  const v: BuildingView = { objects: [g], height: 200, lights: [], chimneys: [] };
  const p = pal(lit);
  switch (id) {
    case 'well': {
      shadow(g, 150);
      // Каменное кольцо из кладки
      g.fillStyle(p.stone, 1);
      g.fillRoundedRect(-62, -58, 124, 60, 14);
      g.lineStyle(2, p.stoneDark, 1);
      for (const yy of [-40, -20]) g.lineBetween(-60, yy, 60, yy);
      for (let x = -48; x <= 48; x += 24) g.lineBetween(x + (x % 48 ? 12 : 0), -58, x + (x % 48 ? 12 : 0), -40);
      g.fillStyle(0x05060e, 1);
      g.fillEllipse(0, -58, 104, 18);
      // Стойки, ворот, крыша
      g.fillStyle(p.wood, 1);
      g.fillRect(-54, -140, 10, 84);
      g.fillRect(44, -140, 10, 84);
      g.fillRect(-48, -118, 96, 8);
      g.lineStyle(2, p.trim, 1);
      g.lineBetween(0, -112, 0, lit ? -78 : -88);
      g.fillStyle(p.woodDark, 1);
      g.fillRect(-10, lit ? -80 : -90, 20, 16); // ведро
      roof(g, 0, -136, 120, 50, p, lit);
      lampPost(g, v, 80, 0, 70, p);
      v.height = 190;
      break;
    }
    case 'bakery': {
      shadow(g, 230);
      g.fillStyle(p.wall, 1);
      g.fillRect(-95, -125, 190, 125);
      g.fillStyle(p.wallDark, 1);
      g.fillRect(-95, -20, 190, 20); // цоколь
      roof(g, 0, -125, 190, 80, p, lit);
      chimney(g, v, 55, -150, 70, p);
      // Полосатый навес над витриной
      for (let i = 0; i < 6; i++) {
        g.fillStyle(i % 2 ? p.trim : p.roof, 1);
        g.fillTriangle(-80 + i * 22, -78, -58 + i * 22, -78, -69 + i * 22, -62);
        g.fillRect(-80 + i * 22, -92, 22, 14);
      }
      windowAt(g, v, -45, -45, 56, 34, p, lit, false);
      door(g, 45, 0, 34, 60, p);
      // Вывеска-крендель
      g.lineStyle(6, p.trim, 1);
      g.strokeCircle(0, -112, 12);
      lampPost(g, v, -120, 0, 64, p);
      v.height = 290;
      break;
    }
    case 'workshop': {
      shadow(g, 260);
      g.fillStyle(p.wood, 1);
      g.fillRect(-110, -115, 220, 115);
      g.lineStyle(2, p.woodDark, 1);
      for (let x = -100; x < 110; x += 20) g.lineBetween(x, -115, x, 0);
      // Широкая крыша-сарай
      g.fillStyle(p.roof, 1);
      g.fillPoints([new V2(-128, -112), new V2(128, -112), new V2(90, -175), new V2(-90, -175)], true);
      g.lineStyle(3, p.roofDark, 1);
      g.lineBetween(-110, -140, 110, -140);
      chimney(g, v, -60, -160, 50, p);
      // Двустворчатые ворота с крестом
      g.fillStyle(p.woodDark, 1);
      g.fillRect(-40, -78, 80, 78);
      g.lineStyle(4, p.wood, 1);
      g.lineBetween(-40, -78, 40, 0);
      g.lineBetween(40, -78, -40, 0);
      g.lineBetween(0, -78, 0, 0);
      windowAt(g, v, 75, -70, 30, 26, p, lit, false);
      // Шестерёнка-вывеска
      g.fillStyle(p.trim, 1);
      g.fillCircle(0, -100, 12);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        g.fillCircle(Math.cos(a) * 14, -100 + Math.sin(a) * 14, 4);
      }
      g.fillStyle(p.wall, 1);
      g.fillCircle(0, -100, 5);
      // Поленница
      g.fillStyle(p.woodDark, 1);
      for (let r = 0; r < 3; r++) for (let c = 0; c < 3 - r; c++) g.fillCircle(-150 + c * 18 + r * 9, -8 - r * 16, 8);
      v.height = 230;
      break;
    }
    case 'mill': {
      shadow(g, 170);
      // Сужающаяся башня
      g.fillStyle(p.wall, 1);
      g.fillPoints([new V2(-58, 0), new V2(58, 0), new V2(38, -190), new V2(-38, -190)], true);
      g.fillStyle(p.roof, 1);
      g.fillTriangle(-50, -186, 50, -186, 0, -240);
      door(g, 0, 0, 30, 52, p, true);
      windowAt(g, v, 0, -110, 22, 26, p, lit, false);
      // Лопасти — отдельным слоем (крутятся)
      const rotor = scene.add.graphics().setPosition(0, -195);
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + (lit ? 0 : 0.35);
        const broken = !lit && i === 2;
        const len = broken ? 70 : 125;
        const cx = Math.cos(a);
        const sy = Math.sin(a);
        rotor.lineStyle(7, p.woodDark, 1);
        rotor.lineBetween(0, 0, cx * len, sy * len);
        // Решётка паруса
        rotor.fillStyle(lit ? 0xd8c8a8 : 0x2a2a40, lit ? 0.9 : 0.8);
        const nx = -sy * 22;
        const ny = cx * 22;
        rotor.fillPoints([new V2(cx * 30, sy * 30), new V2(cx * len, sy * len), new V2(cx * len + nx, sy * len + ny), new V2(cx * 30 + nx, sy * 30 + ny)], true);
      }
      rotor.fillStyle(p.trim, 1);
      rotor.fillCircle(0, 0, 9);
      v.objects.push(rotor);
      v.rotor = rotor;
      v.height = 320;
      break;
    }
    case 'bridge': {
      // Каменный арочный мост с перилами и фонарями
      g.fillStyle(0x000000, 0.3);
      g.fillEllipse(0, 8, 300, 22);
      g.fillStyle(p.stone, 1);
      g.fillPoints([new V2(-160, 0), new V2(-130, -40), new V2(130, -40), new V2(160, 0), new V2(90, 0), new V2(60, -18), new V2(-60, -18), new V2(-90, 0)], true);
      g.lineStyle(2, p.stoneDark, 1);
      for (let x = -120; x <= 120; x += 30) g.lineBetween(x, -40, x, -26);
      g.fillStyle(p.wood, 1);
      g.fillRect(-140, -66, 280, 6);
      for (let x = -130; x <= 130; x += 26) if (lit || x !== 0) g.fillRect(x - 3, -64, 6, 26);
      lampPost(g, v, -150, -40, 50, p);
      lampPost(g, v, 150, -40, 50, p);
      v.height = 140;
      break;
    }
    case 'garden': {
      shadow(g, 260);
      // Грядки
      for (let i = 0; i < 3; i++) {
        g.fillStyle(lit ? 0x4a3424 : 0x1e1a24, 1);
        g.fillRoundedRect(-110 + i * 76, -20, 64, 18, 6);
        g.fillStyle(lit ? 0x6aa84f : 0x1e2a24, 1);
        for (let k = 0; k < 4; k++) g.fillCircle(-100 + i * 76 + k * 15, -24, 5);
      }
      // Деревья с плодами
      for (const [x, s] of [[-75, 1], [10, 1.2], [90, 0.95]] as const) {
        g.fillStyle(p.woodDark, 1);
        g.fillRect(x - 6, -70 * s, 12, 50 * s);
        g.fillStyle(p.leafDark, 1);
        g.fillCircle(x, -100 * s, 42 * s);
        g.fillStyle(p.leaf, 1);
        g.fillCircle(x - 10 * s, -108 * s, 30 * s);
        if (lit) for (const [dx, dy] of [[-18, -96], [14, -110], [8, -84]] as const) v.lights.push({ x: x + dx * s, y: dy * s, r: 9 });
      }
      fence(g, -140, 140, 4, p, lit);
      v.height = 170;
      break;
    }
    case 'chapel': {
      shadow(g, 220);
      // Неф
      g.fillStyle(p.wall, 1);
      g.fillRect(-90, -120, 130, 120);
      roof(g, -25, -120, 130, 60, p, lit);
      windowAt(g, v, -55, -60, 18, 34, p, lit, false);
      windowAt(g, v, 5, -60, 18, 34, p, lit, false);
      // Колокольня со шпилем
      g.fillStyle(p.wallDark, 1);
      g.fillRect(40, -200, 60, 200);
      g.fillStyle(p.window, 1);
      g.fillRect(55, -175, 30, 34);
      g.fillStyle(lit ? 0xc9a040 : 0x2a2838, 1);
      g.fillTriangle(60, -150, 80, -150, 70, -168); // колокол
      v.lights.push({ x: 70, y: -158, r: 22 });
      g.fillStyle(p.roof, 1);
      g.fillTriangle(34, -200, 106, -200, 70, -285);
      g.fillStyle(p.trim, 1);
      g.fillRect(68, -305, 4, 22);
      g.fillRect(62, -298, 16, 4);
      door(g, 70, 0, 30, 54, p, true);
      // Круглое окно-роза
      g.fillStyle(p.trim, 1);
      g.fillCircle(-25, -150, 13);
      g.fillStyle(p.window, 1);
      g.fillCircle(-25, -150, 9);
      v.lights.push({ x: -25, y: -150, r: 12 });
      v.height = 310;
      break;
    }
    case 'square': {
      // Мощёная площадь, фонтан и фонарные столбы
      g.fillStyle(p.stoneDark, 1);
      g.fillEllipse(0, -10, 300, 80);
      g.lineStyle(2, p.stone, 0.6);
      g.strokeEllipse(0, -10, 220, 56);
      g.strokeEllipse(0, -10, 140, 34);
      // Фонтан: нижняя чаша, колонна, верхняя чаша, струи
      g.fillStyle(p.stone, 1);
      g.fillEllipse(0, -22, 110, 30);
      g.fillStyle(lit ? 0x3a78b8 : 0x101830, 1);
      g.fillEllipse(0, -26, 90, 18);
      g.fillStyle(p.stone, 1);
      g.fillRect(-7, -70, 14, 46);
      g.fillEllipse(0, -72, 50, 14);
      if (lit) {
        g.lineStyle(3, 0x9ad6f5, 0.85);
        for (const dx of [-1, 1]) {
          g.beginPath();
          g.arc(dx * 22, -72, 22, dx < 0 ? Math.PI * 1.1 : -Math.PI * 0.1, dx < 0 ? Math.PI * 1.9 : -Math.PI * 0.9, dx > 0);
          g.strokePath();
        }
      }
      for (const [x, y] of [[-130, -10], [130, -10], [-80, -36], [80, -36]] as const) lampPost(g, v, x, y, 80, p);
      v.height = 140;
      break;
    }
    case 'lumo': {
      shadow(g, 220);
      // Уютный домик: круглая дверь, звезда над входом, крыльцо, цветы
      g.fillStyle(p.wall, 1);
      g.fillRect(-80, -110, 160, 110);
      roof(g, 0, -110, 160, 90, p, lit);
      chimney(g, v, -45, -140, 60, p);
      door(g, 0, 0, 40, 66, p, true);
      windowAt(g, v, -50, -58, 30, 28, p, lit);
      windowAt(g, v, 50, -58, 30, 28, p, lit);
      // Чердачное круглое окно
      g.fillStyle(p.trim, 1);
      g.fillCircle(0, -150, 14);
      g.fillStyle(p.window, 1);
      g.fillCircle(0, -150, 10);
      v.lights.push({ x: 0, y: -150, r: 12 });
      // Звезда-вывеска
      g.fillStyle(lit ? 0xffd36b : 0x3a3a54, 1);
      const pts: Phaser.Math.Vector2[] = [];
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const r = i % 2 ? 6 : 14;
        pts.push(new V2(Math.cos(a) * r, -84 + Math.sin(a) * r));
      }
      g.fillPoints(pts, true);
      fence(g, -150, -95, 4, p, lit);
      fence(g, 95, 150, 4, p, lit);
      if (lit) {
        for (const [x, c] of [[-120, 0xffb3cf], [-105, 0xfff4e0], [120, 0xffd45a], [135, 0xffb3cf]] as const) {
          g.fillStyle(c, 1);
          g.fillCircle(x, -6, 5);
        }
      }
      lampPost(g, v, 40, 0, 58, p);
      v.height = 270;
      break;
    }
    case 'lighthouse': {
      g.fillStyle(0x000000, 0.35);
      g.fillEllipse(0, 6, 150, 24);
      // Башня в полоску
      g.fillStyle(lit ? 0xe0dae8 : 0x262a40, 1);
      g.fillPoints([new V2(-52, 0), new V2(52, 0), new V2(32, -270), new V2(-32, -270)], true);
      g.fillStyle(lit ? 0xb0404a : 0x1a1c30, 1);
      for (const [y0, y1] of [[-60, -100], [-150, -190]] as const) {
        const w0 = 52 - (20 * -y0) / 270;
        const w1 = 52 - (20 * -y1) / 270;
        g.fillPoints([new V2(-w0, y0), new V2(w0, y0), new V2(w1, y1), new V2(-w1, y1)], true);
      }
      door(g, 0, 0, 26, 44, p, true);
      windowAt(g, v, 0, -125, 14, 20, p, lit, false);
      // Галерея с перилами
      g.fillStyle(p.woodDark, 1);
      g.fillRect(-48, -276, 96, 8);
      g.lineStyle(2, p.trim, 1);
      for (let x = -44; x <= 44; x += 11) g.lineBetween(x, -276, x, -292);
      g.lineBetween(-46, -292, 46, -292);
      // Фонарная комната и купол
      g.fillStyle(p.window, 1);
      g.fillRect(-24, -318, 48, 42);
      g.lineStyle(2, 0x1a1626, 1);
      g.lineBetween(-8, -318, -8, -276);
      g.lineBetween(8, -318, 8, -276);
      v.lights.push({ x: 0, y: -297, r: 30 });
      g.fillStyle(p.roof, 1);
      g.beginPath();
      g.arc(0, -318, 30, Math.PI, 0, false);
      g.closePath();
      g.fillPath();
      g.fillStyle(p.trim, 1);
      g.fillCircle(0, -350, 5);
      v.beam = { x: 0, y: -297 };
      v.height = 360;
      break;
    }
  }
  return v;
}
