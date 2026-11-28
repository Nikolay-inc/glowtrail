// Вся графика рисуется фигурами в коде: иконки плиток, кнопки, Lumo, свечение.

import Phaser from 'phaser';
import { AVATARS, type Avatar } from '../core/avatars';
import { DEFAULT_LOOK, type Look } from '../core/wardrobe';
import { createLumoFigure, type LumoFigure } from './lumo';
import { addDust, addFog, addVignette, createFxTextures } from './fx';
import { keepFitted, type ViewRect } from './viewport';
import type { TileKind } from '../core/types';
import { C, FONT, H, W } from './theme';
import { setFitted, type UITextOpts } from './UIText';

type G = Phaser.GameObjects.Graphics;

/** Создаёт общие текстуры: мягкое свечение и точку. Вызывается один раз при загрузке. */
export function createTextures(scene: Phaser.Scene) {
  createFxTextures(scene);
  if (!scene.textures.exists('glow')) {
    const size = 128;
    const tex = scene.textures.createCanvas('glow', size, size)!;
    const ctx = tex.getContext();
    const grd = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.25, 'rgba(255,255,255,0.55)');
    grd.addColorStop(0.6, 'rgba(255,255,255,0.12)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, size, size);
    tex.refresh();
  }
  if (!scene.textures.exists('dot')) {
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0xffffff, 1);
    g.fillCircle(8, 8, 8);
    g.generateTexture('dot', 16, 16);
    g.destroy();
  }
}

// ---------------------------------------------------------------------------
// Иконки плиток. Рисуются «вверх» — в лотке их поворачивают по направлению дороги.

function arrowHead(g: G, tipX: number, tipY: number, angle: number, size: number) {
  const a1 = angle + Math.PI * 0.78;
  const a2 = angle - Math.PI * 0.78;
  g.fillTriangle(
    tipX,
    tipY,
    tipX + Math.cos(a1) * size,
    tipY + Math.sin(a1) * size,
    tipX + Math.cos(a2) * size,
    tipY + Math.sin(a2) * size,
  );
}

/**
 * Дуга со стрелкой на конце: наконечник сидит ровно на окружности — его кончик в точке угла `to`,
 * основание тоже на окружности, направление — по хорде между ними (на круге наконечник не «уезжает»
 * ни внутрь, ни наружу). clockwise — по часовой (углы растут, экран y вниз).
 */
function arcArrow(g: G, cx: number, cy: number, r: number, from: number, to: number, clockwise: boolean, head: number) {
  const sign = clockwise ? 1 : -1;
  const back = (head * 0.77) / r; // длина основания наконечника по дуге
  const baseA = to - sign * back;
  g.beginPath();
  // Линия заходит под наконечник, чтобы не было щели.
  g.arc(cx, cy, r, from, to - sign * back * 0.6, !clockwise);
  g.strokePath();
  const tipX = cx + Math.cos(to) * r;
  const tipY = cy + Math.sin(to) * r;
  const baseX = cx + Math.cos(baseA) * r;
  const baseY = cy + Math.sin(baseA) * r;
  arrowHead(g, tipX, tipY, Math.atan2(tipY - baseY, tipX - baseX), head);
}

/**
 * Иконки плиток: у всех одна толщина линии, линия начинается в одной точке снизу (y = 0.38), наконечник одного
 * размера и сидит точно на конце линии по её направлению. В лотке иконку поворачивают по направлению дороги
 * (кратно 90°), поэтому всё симметрично относительно вертикальной оси.
 */
const TILE_LW = 0.13;
const TIP = 0.3;
const START = 0.38;

/** Наконечник, у которого середина основания — ровно в точке (bx, by), остриё — по направлению angle. */
function tipAt(g: G, bx: number, by: number, angle: number, s: number) {
  const len = s * TIP * 0.63;
  arrowHead(g, bx + Math.cos(angle) * len, by + Math.sin(angle) * len, angle, s * TIP);
}

export function drawTileIcon(g: G, kind: TileKind, s: number, color: number) {
  const lw = s * TILE_LW;
  g.lineStyle(lw, color, 1);
  g.fillStyle(color, 1);
  const up = -Math.PI / 2;
  const stem = (toY: number) => {
    g.lineBetween(0, s * START, 0, toY);
    g.fillCircle(0, s * START, lw / 2);
  };
  switch (kind) {
    case 'straight':
      stem(-s * 0.2);
      tipAt(g, 0, -s * 0.2, up, s);
      break;
    case 'straight2':
      stem(-s * 0.26);
      tipAt(g, 0, -s * 0.02, up, s);
      tipAt(g, 0, -s * 0.26, up, s);
      break;
    case 'left':
    case 'right': {
      // Прямо до середины, ровная четверть окружности, короткий отрезок и наконечник по горизонтали.
      // Иконка центрирована по ширине: ствол сдвинут в сторону, противоположную повороту.
      const m = kind === 'left' ? -1 : 1;
      const r = s * 0.22;
      const cy = s * 0.08;
      const ox = -m * s * 0.2;
      g.lineBetween(ox, s * START, ox, cy);
      g.fillCircle(ox, s * START, lw / 2);
      g.beginPath();
      if (m < 0) g.arc(ox - r, cy, r, 0, -Math.PI / 2, true);
      else g.arc(ox + r, cy, r, Math.PI, Math.PI * 1.5, false);
      g.strokePath();
      const ey = cy - r;
      g.lineBetween(ox + m * r, ey, ox + m * s * 0.26, ey);
      tipAt(g, ox + m * s * 0.26, ey, m < 0 ? Math.PI : 0, s);
      break;
    }
    case 'jump': {
      // Дуга над препятствием (камешек), наконечник — по касательной к концу дуги.
      g.fillStyle(0x8f8679, 1);
      g.fillRoundedRect(s * 0.04, -s * 0.06, s * 0.2, s * 0.2, s * 0.04);
      g.fillStyle(color, 1);
      const p0 = new Phaser.Math.Vector2(0, s * START);
      const p1 = new Phaser.Math.Vector2(-s * 0.6, s * 0.02);
      const p2 = new Phaser.Math.Vector2(-s * 0.04, -s * 0.24);
      g.strokePoints(new Phaser.Curves.QuadraticBezier(p0, p1, p2).getPoints(20), false);
      g.fillCircle(0, s * START, lw / 2);
      tipAt(g, p2.x, p2.y, Math.atan2(p2.y - p1.y, p2.x - p1.x), s);
      break;
    }
    case 'bridge': {
      // Арка моста над волнами, стрелка вперёд из её вершины.
      const top = s * 0.16 - s * 0.3;
      g.beginPath();
      g.arc(0, s * 0.16, s * 0.3, Math.PI, Math.PI * 2, false);
      g.strokePath();
      g.lineBetween(-s * 0.4, s * 0.16, s * 0.4, s * 0.16);
      g.lineBetween(0, top, 0, -s * 0.26);
      g.lineStyle(lw * 0.55, 0x7fc0ff, 1);
      for (const yy of [s * 0.3, s * 0.42]) {
        g.beginPath();
        g.moveTo(-s * 0.36, yy);
        for (let i = 1; i <= 6; i++) g.lineTo(-s * 0.36 + i * s * 0.12, yy + (i % 2 ? -s * 0.04 : 0));
        g.strokePath();
      }
      g.fillStyle(color, 1);
      tipAt(g, 0, -s * 0.26, up, s);
      break;
    }
  }
}

// ---------------------------------------------------------------------------
// Иконки интерфейса

export type IconName = 'music' | 'nomusic' | 'stashbox' | 'lantern' | 'gift' | 'rotate' | 'restart' | 'undo' | 'menu' | 'stats' | 'sound' | 'mute' | 'play' | 'lock' | 'copy' | 'back' | 'trash' | 'bulb' | 'skip' | 'plus' | 'cloud' | 'user' | 'help' | 'vibrate' | 'novibrate' | 'close' | 'hammer' | 'globe' | 'chest' | 'wardrobe' | 'scroll' | 'brush' | 'heart' | 'arrowLeft' | 'arrowRight' | 'video' | 'bag' | 'shield';

export function drawIcon(g: G, name: IconName, s: number, color: number) {
  const lw = s * 0.12;
  g.lineStyle(lw, color, 1);
  g.fillStyle(color, 1);
  switch (name) {
    case 'music':
    case 'nomusic': {
      // Две ноты, связанные перекладиной; «выключено» — перечёркнуто.
      g.fillEllipse(-s * 0.2, s * 0.24, s * 0.22, s * 0.16);
      g.fillEllipse(s * 0.2, s * 0.16, s * 0.22, s * 0.16);
      g.lineBetween(-s * 0.1, s * 0.22, -s * 0.1, -s * 0.28);
      g.lineBetween(s * 0.3, s * 0.14, s * 0.3, -s * 0.36);
      g.lineStyle(lw * 1.4, color, 1);
      g.lineBetween(-s * 0.1, -s * 0.28, s * 0.3, -s * 0.36);
      if (name === 'nomusic') {
        g.lineStyle(lw, 0xff6b6b, 1);
        g.lineBetween(-s * 0.4, s * 0.4, s * 0.4, -s * 0.4);
      }
      break;
    }
    case 'stashbox': {
      // Слот-ящик и стрелка вниз в него.
      g.strokeRoundedRect(-s * 0.36, s * 0.02, s * 0.72, s * 0.36, s * 0.06);
      g.lineBetween(-s * 0.36, s * 0.14, s * 0.36, s * 0.14);
      g.lineBetween(0, -s * 0.42, 0, -s * 0.06);
      arrowHead(g, 0, s * 0.02, Math.PI / 2, s * 0.24);
      break;
    }
    case 'lantern': {
      // Фонарь с лучом вправо.
      g.fillTriangle(s * 0.08, -s * 0.04, s * 0.48, -s * 0.3, s * 0.48, s * 0.22);
      g.fillStyle(0x1a2150, 1);
      g.fillTriangle(s * 0.14, -s * 0.04, s * 0.44, -s * 0.22, s * 0.44, s * 0.14);
      g.fillStyle(color, 1);
      g.fillRoundedRect(-s * 0.3, -s * 0.2, s * 0.32, s * 0.36, s * 0.06);
      g.fillTriangle(-s * 0.36, -s * 0.2, s * 0.08, -s * 0.2, -s * 0.14, -s * 0.38);
      g.fillRect(-s * 0.18, s * 0.16, s * 0.08, s * 0.2);
      g.fillStyle(0x1a2150, 1);
      g.fillCircle(-s * 0.14, -s * 0.02, s * 0.07);
      break;
    }
    case 'gift': {
      // Коробка с бантом.
      g.fillRoundedRect(-s * 0.36, -s * 0.06, s * 0.72, s * 0.44, s * 0.05);
      g.fillRect(-s * 0.42, -s * 0.2, s * 0.84, s * 0.16);
      g.lineStyle(s * 0.07, 0x1a2150, 1);
      g.lineBetween(0, -s * 0.2, 0, s * 0.38);
      g.lineStyle(s * 0.1, color, 1);
      g.strokeEllipse(-s * 0.14, -s * 0.3, s * 0.26, s * 0.16);
      g.strokeEllipse(s * 0.14, -s * 0.3, s * 0.26, s * 0.16);
      break;
    }
    case 'rotate': {
      // Плитка и стрелка по часовой стрелке вокруг неё.
      g.strokeRoundedRect(-s * 0.18, -s * 0.18, s * 0.36, s * 0.36, s * 0.06);
      arcArrow(g, 0, 0, s * 0.35, -Math.PI * 0.95, Math.PI * 0.25, true, s * 0.24);
      break;
    }
    case 'restart': {
      // Почти полный круг по часовой, наконечник наверху смотрит вправо — на начало круга.
      arcArrow(g, 0, s * 0.02, s * 0.3, -Math.PI * 0.15, Math.PI * 1.45, true, s * 0.24);
      break;
    }
    case 'undo': {
      // «Назад»: хвост снизу, дуга справа вверх, наверху прямой участок и наконечник влево.
      const r = s * 0.22;
      const cx = s * 0.08;
      const cy = s * 0.04;
      const head = s * 0.28;
      g.lineBetween(-s * 0.2, cy + r, cx, cy + r);
      g.beginPath();
      g.arc(cx, cy, r, Math.PI / 2, -Math.PI / 2, true);
      g.strokePath();
      const tipX = -s * 0.32;
      g.lineBetween(cx, cy - r, tipX + head * 0.5, cy - r);
      arrowHead(g, tipX, cy - r, Math.PI, head);
      break;
    }
    case 'menu': {
      const q = s * 0.2;
      for (const [x, y] of [
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
      ])
        g.fillRoundedRect(x * q * 1.15 - q * 0.9, y * q * 1.15 - q * 0.9, q * 1.8, q * 1.8, q * 0.4);
      break;
    }
    case 'stats':
      g.fillRoundedRect(-s * 0.34, s * 0.02, s * 0.18, s * 0.3, s * 0.04);
      g.fillRoundedRect(-s * 0.09, -s * 0.3, s * 0.18, s * 0.62, s * 0.04);
      g.fillRoundedRect(s * 0.16, -s * 0.12, s * 0.18, s * 0.44, s * 0.04);
      break;
    case 'sound':
    case 'mute':
      g.fillRect(-s * 0.36, -s * 0.12, s * 0.16, s * 0.24);
      g.fillTriangle(-s * 0.24, -s * 0.12, -s * 0.02, -s * 0.32, -s * 0.02, 0);
      g.fillTriangle(-s * 0.24, s * 0.12, -s * 0.02, s * 0.32, -s * 0.02, 0);
      g.fillRect(-s * 0.24, -s * 0.12, s * 0.22, s * 0.24);
      if (name === 'sound') {
        g.lineStyle(lw * 0.8, color, 1);
        g.beginPath();
        g.arc(s * 0.02, 0, s * 0.16, -Math.PI / 3, Math.PI / 3, false);
        g.strokePath();
        g.beginPath();
        g.arc(s * 0.02, 0, s * 0.3, -Math.PI / 3, Math.PI / 3, false);
        g.strokePath();
      } else {
        g.lineStyle(lw * 0.8, color, 1);
        g.lineBetween(s * 0.08, -s * 0.14, s * 0.36, s * 0.14);
        g.lineBetween(s * 0.36, -s * 0.14, s * 0.08, s * 0.14);
      }
      break;
    case 'vibrate':
    case 'novibrate': {
      // Телефон и волны вибрации по бокам; «выключено» — перечёркнуто.
      g.lineStyle(lw * 0.8, color, 1);
      g.strokeRoundedRect(-s * 0.13, -s * 0.28, s * 0.26, s * 0.56, s * 0.06);
      g.fillRect(-s * 0.05, s * 0.18, s * 0.1, s * 0.04);
      for (const side of [-1, 1]) {
        g.beginPath();
        g.moveTo(side * s * 0.24, -s * 0.16);
        g.lineTo(side * s * 0.3, -s * 0.08);
        g.lineTo(side * s * 0.24, 0);
        g.lineTo(side * s * 0.3, s * 0.08);
        g.lineTo(side * s * 0.24, s * 0.16);
        g.strokePath();
      }
      if (name === 'novibrate') g.lineBetween(-s * 0.36, s * 0.34, s * 0.36, -s * 0.34);
      break;
    }
    case 'play':
      g.fillTriangle(-s * 0.2, -s * 0.32, -s * 0.2, s * 0.32, s * 0.34, 0);
      break;
    case 'lock':
      g.fillRoundedRect(-s * 0.26, -s * 0.04, s * 0.52, s * 0.38, s * 0.06);
      g.beginPath();
      g.arc(0, -s * 0.06, s * 0.16, Math.PI, Math.PI * 2, false);
      g.strokePath();
      break;
    case 'copy':
      g.strokeRoundedRect(-s * 0.3, -s * 0.2, s * 0.4, s * 0.5, s * 0.06);
      g.strokeRoundedRect(-s * 0.1, -s * 0.34, s * 0.4, s * 0.5, s * 0.06);
      break;
    case 'back':
      g.lineBetween(s * 0.3, 0, -s * 0.16, 0);
      arrowHead(g, -s * 0.34, 0, Math.PI, s * 0.32);
      break;
    case 'bulb':
      g.fillCircle(0, -s * 0.1, s * 0.24);
      g.fillRoundedRect(-s * 0.12, s * 0.08, s * 0.24, s * 0.16, s * 0.04);
      g.fillRect(-s * 0.09, s * 0.27, s * 0.18, s * 0.06);
      g.lineStyle(lw * 0.6, color, 1);
      for (const a of [-150, -110, -70, -30]) {
        const r = (a * Math.PI) / 180;
        g.lineBetween(Math.cos(r) * s * 0.33, -s * 0.1 + Math.sin(r) * s * 0.33, Math.cos(r) * s * 0.44, -s * 0.1 + Math.sin(r) * s * 0.44);
      }
      break;
    case 'skip':
      g.fillTriangle(-s * 0.34, -s * 0.26, -s * 0.34, s * 0.26, 0, 0);
      g.fillTriangle(-s * 0.04, -s * 0.26, -s * 0.04, s * 0.26, s * 0.3, 0);
      g.fillRect(s * 0.26, -s * 0.26, s * 0.08, s * 0.52);
      break;
    case 'hammer': {
      // Молоток: рукоять по диагонали и боёк поперёк.
      const a = -Math.PI / 4;
      const pts = (pp: [number, number][]) => pp.map(([px, py]) => new Phaser.Math.Vector2(px * Math.cos(a) - py * Math.sin(a), px * Math.sin(a) + py * Math.cos(a)));
      g.fillPoints(pts([[-s * 0.05, -s * 0.1], [s * 0.05, -s * 0.1], [s * 0.05, s * 0.44], [-s * 0.05, s * 0.44]]), true);
      g.fillPoints(pts([[-s * 0.3, -s * 0.34], [s * 0.22, -s * 0.34], [s * 0.3, -s * 0.24], [s * 0.3, -s * 0.12], [-s * 0.3, -s * 0.12]]), true);
      break;
    }
    case 'scroll': {
      // Свиток заданий: лист с валиками сверху и снизу и строками.
      g.fillRoundedRect(-s * 0.28, -s * 0.34, s * 0.56, s * 0.68, s * 0.04);
      g.fillRoundedRect(-s * 0.36, -s * 0.42, s * 0.72, s * 0.12, s * 0.06);
      g.fillRoundedRect(-s * 0.36, s * 0.3, s * 0.72, s * 0.12, s * 0.06);
      g.lineStyle(s * 0.05, 0x1a2150, 1);
      for (const y of [-0.16, 0, 0.16]) g.lineBetween(-s * 0.18, s * y, s * 0.18, s * y);
      break;
    }
    case 'brush': {
      // Кисть: ручка по диагонали, металлическое кольцо и мазок-ворс.
      const a = Math.PI / 4;
      const pts = (pp: [number, number][]) => pp.map(([px, py]) => new Phaser.Math.Vector2(px * Math.cos(a) - py * Math.sin(a), px * Math.sin(a) + py * Math.cos(a)));
      g.fillPoints(pts([[-s * 0.045, -s * 0.46], [s * 0.045, -s * 0.46], [s * 0.06, s * 0.02], [-s * 0.06, s * 0.02]]), true);
      g.fillPoints(pts([[-s * 0.1, s * 0.04], [s * 0.1, s * 0.04], [s * 0.1, s * 0.14], [-s * 0.1, s * 0.14]]), true);
      g.fillPoints(pts([[-s * 0.1, s * 0.16], [s * 0.1, s * 0.16], [s * 0.04, s * 0.46], [-s * 0.08, s * 0.4]]), true);
      break;
    }
    case 'heart':
      g.fillCircle(-s * 0.15, -s * 0.08, s * 0.18);
      g.fillCircle(s * 0.15, -s * 0.08, s * 0.18);
      g.fillTriangle(-s * 0.32, -s * 0.0, s * 0.32, -s * 0.0, 0, s * 0.34);
      break;
    case 'arrowLeft':
    case 'arrowRight': {
      const d = name === 'arrowLeft' ? -1 : 1;
      g.lineStyle(s * 0.14, color, 1);
      g.beginPath();
      g.moveTo(-d * s * 0.12, -s * 0.28);
      g.lineTo(d * s * 0.16, 0);
      g.lineTo(-d * s * 0.12, s * 0.28);
      g.strokePath();
      break;
    }
    case 'globe':
      g.strokeCircle(0, 0, s * 0.36);
      g.strokeEllipse(0, 0, s * 0.34, s * 0.72);
      g.lineBetween(-s * 0.36, 0, s * 0.36, 0);
      g.lineBetween(-s * 0.3, -s * 0.18, s * 0.3, -s * 0.18);
      g.lineBetween(-s * 0.3, s * 0.18, s * 0.3, s * 0.18);
      break;
    case 'chest':
      g.fillRoundedRect(-s * 0.4, -s * 0.06, s * 0.8, s * 0.42, s * 0.05);
      g.fillRoundedRect(-s * 0.4, -s * 0.34, s * 0.8, s * 0.24, { tl: s * 0.18, tr: s * 0.18, bl: 0, br: 0 });
      g.fillStyle(0x1a2150, 1);
      g.fillRect(-s * 0.4, -s * 0.1, s * 0.8, s * 0.05);
      g.fillRoundedRect(-s * 0.08, -s * 0.12, s * 0.16, s * 0.18, s * 0.03);
      break;
    case 'wardrobe':
      // Плечики-вешалка.
      g.beginPath();
      g.arc(0, -s * 0.24, s * 0.1, Math.PI, Math.PI * 2.3, false);
      g.strokePath();
      g.lineBetween(0, -s * 0.12, -s * 0.42, s * 0.2);
      g.lineBetween(0, -s * 0.12, s * 0.42, s * 0.2);
      g.lineBetween(-s * 0.42, s * 0.2, s * 0.42, s * 0.2);
      break;
    case 'plus':
      g.fillRoundedRect(-s * 0.06, -s * 0.3, s * 0.12, s * 0.6, s * 0.04);
      g.fillRoundedRect(-s * 0.3, -s * 0.06, s * 0.6, s * 0.12, s * 0.04);
      break;
    case 'help':
      // Вопросительный знак: дуга, хвостик и точка.
      g.beginPath();
      g.arc(0, -s * 0.12, s * 0.18, Math.PI * 1.05, Math.PI * 2.3, false);
      g.strokePath();
      g.lineBetween(0, s * 0.02, 0, s * 0.12);
      g.fillCircle(0, s * 0.3, lw * 0.75);
      break;
    case 'cloud':
      g.fillCircle(-s * 0.16, s * 0.04, s * 0.17);
      g.fillCircle(s * 0.06, -s * 0.06, s * 0.22);
      g.fillCircle(s * 0.24, s * 0.08, s * 0.14);
      g.fillRoundedRect(-s * 0.33, s * 0.04, s * 0.71, s * 0.18, s * 0.09);
      break;
    case 'user':
      g.fillCircle(0, -s * 0.12, s * 0.17);
      g.fillRoundedRect(-s * 0.3, s * 0.1, s * 0.6, s * 0.26, { tl: s * 0.2, tr: s * 0.2, bl: s * 0.04, br: s * 0.04 });
      break;
    case 'close':
      g.lineStyle(s * 0.13, color, 1);
      g.lineBetween(-s * 0.26, -s * 0.26, s * 0.26, s * 0.26);
      g.lineBetween(-s * 0.26, s * 0.26, s * 0.26, -s * 0.26);
      break;
    case 'video':
      // Ролик: экранчик со скруглёнными углами и треугольником «пуск».
      g.strokeRoundedRect(-s * 0.36, -s * 0.26, s * 0.72, s * 0.52, s * 0.1);
      g.fillTriangle(-s * 0.1, -s * 0.14, -s * 0.1, s * 0.14, s * 0.16, 0);
      break;
    case 'bag':
      // Покупки: сумка с ручкой.
      g.fillRoundedRect(-s * 0.3, -s * 0.12, s * 0.6, s * 0.46, s * 0.08);
      g.beginPath();
      g.arc(0, -s * 0.12, s * 0.16, Math.PI, Math.PI * 2, false);
      g.strokePath();
      break;
    case 'shield':
      // Конфиденциальность: щит.
      g.beginPath();
      g.moveTo(0, -s * 0.36);
      g.lineTo(s * 0.3, -s * 0.24);
      g.lineTo(s * 0.26, s * 0.08);
      g.lineTo(0, s * 0.36);
      g.lineTo(-s * 0.26, s * 0.08);
      g.lineTo(-s * 0.3, -s * 0.24);
      g.closePath();
      g.strokePath();
      break;
    case 'trash':
      g.fillRoundedRect(-s * 0.22, -s * 0.16, s * 0.44, s * 0.48, s * 0.06);
      g.fillRect(-s * 0.32, -s * 0.28, s * 0.64, s * 0.08);
      g.fillRect(-s * 0.08, -s * 0.36, s * 0.16, s * 0.08);
      break;
  }
}

export function starPoints(r: number, inner = 0.45): Phaser.Math.Vector2[] {
  const pts: Phaser.Math.Vector2[] = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 === 0 ? r : r * inner;
    pts.push(new Phaser.Math.Vector2(Math.cos(a) * rr, Math.sin(a) * rr));
  }
  return pts;
}

export function drawStar(g: G, x: number, y: number, r: number, color: number, alpha = 1) {
  g.fillStyle(color, alpha);
  g.fillPoints(
    starPoints(r).map((p) => new Phaser.Math.Vector2(p.x + x, p.y + y)),
    true,
  );
}

const lerpColor = (a: number, b: number, k: number) => {
  const c = Phaser.Display.Color.Interpolate.ColorWithColor(Phaser.Display.Color.ValueToColor(a), Phaser.Display.Color.ValueToColor(b), 100, Math.round(k * 100));
  return Phaser.Display.Color.GetColor(c.r, c.g, c.b);
};

/**
 * Звезда «с объёмом»: тень, тёмно-золотой ободок, гранёные лучи (свет сверху слева — одна половина
 * луча светлее, другая темнее) и блик. empty — «пустая» звезда-лунка тех же форм.
 */
export function drawShinyStar(g: G, x: number, y: number, r: number, empty = false, alpha = 1) {
  const at = (pts: Phaser.Math.Vector2[], dx = 0, dy = 0) => pts.map((p) => new Phaser.Math.Vector2(p.x + x + dx, p.y + y + dy));
  const outer = starPoints(r, 0.5);
  if (empty) {
    g.fillStyle(0x000000, 0.3 * alpha);
    g.fillPoints(at(outer), true);
    g.fillStyle(C.starEmpty, alpha);
    g.fillPoints(at(starPoints(r * 0.9, 0.5), 0, r * 0.05), true);
    return;
  }
  g.fillStyle(0x000000, 0.28 * alpha);
  g.fillPoints(at(outer, 0, r * 0.1), true);
  g.fillStyle(0xc98512, alpha);
  g.fillPoints(at(outer), true);
  // Грани: треугольник «центр — вершина луча — впадина»; яркость — по нормали грани к свету.
  const inner = starPoints(r * 0.86, 0.5);
  const cy = y - r * 0.03;
  const L = new Phaser.Math.Vector2(-0.5, -0.86).normalize();
  for (let i = 0; i < 10; i++) {
    const a = inner[i];
    const b = inner[(i + 1) % 10];
    const tip = i % 2 === 0 ? a : b;
    const dip = i % 2 === 0 ? b : a;
    const axis = tip.clone().normalize();
    const n = dip.clone().subtract(axis.clone().scale(dip.dot(axis))).normalize();
    const k = Phaser.Math.Clamp(0.5 + 0.5 * n.dot(L), 0, 1);
    g.fillStyle(lerpColor(0xf0a828, 0xffe58a, k), alpha);
    g.fillTriangle(x, cy, a.x + x, a.y + cy, b.x + x, b.y + cy);
  }
  // Блик на верхнем левом луче и искорка в центре.
  g.fillStyle(0xffffff, 0.6 * alpha);
  g.fillEllipse(x - r * 0.2, cy - r * 0.36, r * 0.16, r * 0.3);
  g.fillStyle(0xfff6d8, 0.8 * alpha);
  g.fillCircle(x, cy, r * 0.07);
}

// ---------------------------------------------------------------------------
// Кнопка с иконкой и/или подписью

export interface ButtonOpts {
  w: number;
  h: number;
  icon?: IconName;
  label?: string;
  fontSize?: number;
  primary?: boolean;
  /** Самая большая ширина кнопки (по умолчанию — ширина экрана с полями): длиннее — подпись в 2 строки и мельче. */
  maxW?: number;
  onClick: () => void;
}

export class Button extends Phaser.GameObjects.Container {
  private bg: G;
  private iconG: G;
  private labelT?: Phaser.GameObjects.Text;
  private enabledState = true;
  /** Ширина, заданная при создании: кнопка не бывает уже, но растёт под содержимое (длинный текст, другой язык). */
  private minW: number;
  /** Ширина внешнего содержимого (подпись со значками — buttonRichLabel). */
  private extraW = 0;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    private opts: ButtonOpts,
  ) {
    super(scene, x, y);
    this.minW = opts.w;
    this.bg = scene.add.graphics();
    this.iconG = scene.add.graphics();
    this.add([this.bg, this.iconG]);
    if (opts.label) {
      this.labelT = scene.add
        .text(opts.icon ? opts.h * 0.32 : 0, 0, opts.label, {
          fontFamily: FONT,
          fontSize: `${opts.fontSize ?? Math.round(opts.h * 0.38)}px`,
          color: opts.primary ? '#2a1a05' : C.text,
          fontStyle: 'bold',
        })
        .setOrigin(0.5);
      this.add(this.labelT);
      this.fitLabel(opts.label);
    }
    this.redraw();
    this.setSize(opts.w, opts.h);
    this.setInteractive({ useHandCursor: true });
    this.on('pointerdown', () => {
      if (!this.enabledState) return;
      scene.tweens.add({ targets: this, scale: 0.92, duration: 70, yoyo: true });
    });
    this.on('pointerup', () => {
      if (!this.enabledState) return;
      opts.onClick();
    });
    scene.add.existing(this);
  }

  setIcon(icon: IconName) {
    this.opts.icon = icon;
    this.redraw();
  }

  setLabel(label: string) {
    if (this.labelT) this.fitLabel(label);
    this.redraw();
  }

  /** Подпись не шире кнопки на экране: сначала кнопка растёт, потом — 2 строки и до 70% размера. */
  private fitLabel(label: string) {
    const { h, icon } = this.opts;
    const base = this.opts.fontSize ?? Math.round(h * 0.38);
    const avail = (this.opts.maxW ?? W - 80) - h * 0.6 - (icon ? h * 0.66 : 0);
    const o: UITextOpts = { w: avail, h: h * 0.84, lines: 2, size: base, lineSpacing: -4 };
    this.labelT!.setAlign('center');
    setFitted(this.labelT!, label, o);
  }

  /** Подсветка «режим включён» (например, «Поворот плитки»). */
  setPrimary(v: boolean) {
    this.opts.primary = v;
    this.labelT?.setColor(v ? '#2a1a05' : C.text);
    this.redraw();
  }

  /** Растянуть кнопку под внешнее содержимое шириной contentW (например, подпись со значками). */
  fitContent(contentW: number) {
    this.extraW = contentW;
    this.redraw();
    return this;
  }

  /** Текущая ширина кнопки (с учётом растяжения под содержимое). */
  get buttonWidth() {
    return this.opts.w;
  }

  setEnabled(v: boolean) {
    this.enabledState = v;
    this.setAlpha(v ? 1 : 0.35);
    return this;
  }

  private redraw() {
    const { h, primary, icon } = this.opts;
    // Ширина по содержимому: иконка + промежуток + подпись и поля по краям (не меньше заданной).
    const iconW = h * 0.5;
    const gap = h * 0.16;
    const labelW = this.labelT?.width ?? 0;
    const content = Math.max(this.extraW, this.labelT ? (icon ? iconW + gap : 0) + labelW : 0);
    const w = Math.max(this.minW, Math.ceil(content + h * 0.6));
    if (w !== this.opts.w) {
      this.opts.w = w;
      this.setSize(w, h);
      const area = this.input?.hitArea as Phaser.Geom.Rectangle | undefined;
      area?.setTo(0, 0, w, h);
    }
    const g = this.bg;
    g.clear();
    if (primary) {
      g.fillStyle(C.primaryDark, 1);
      g.fillRoundedRect(-w / 2, -h / 2 + 8, w, h, h * 0.3);
      g.fillStyle(C.primary, 1);
      g.fillRoundedRect(-w / 2, -h / 2, w, h, h * 0.3);
      g.fillStyle(0xffffff, 0.2);
      g.fillRoundedRect(-w / 2 + 12, -h / 2 + 8, w - 24, h * 0.3, h * 0.15);
    } else {
      g.fillStyle(0x000000, 0.25);
      g.fillRoundedRect(-w / 2, -h / 2 + 6, w, h, h * 0.3);
      g.fillStyle(C.button, 1);
      g.fillRoundedRect(-w / 2, -h / 2, w, h, h * 0.3);
      g.lineStyle(4, C.buttonEdge, 1);
      g.strokeRoundedRect(-w / 2, -h / 2, w, h, h * 0.3);
    }
    this.iconG.clear();
    if (icon) {
      const s = h * 0.62;
      this.iconG.setPosition(0, 0);
      drawIcon(this.iconG, icon, s, primary ? 0x2a1a05 : C.icon);
    }
    if (this.labelT && icon) {
      // Иконка и подпись — одной группой по центру кнопки.
      const left = -(iconW + gap + labelW) / 2;
      this.iconG.setX(left + iconW / 2);
      this.labelT.setX(left + iconW + gap + labelW / 2);
    } else if (this.labelT) {
      this.labelT.setX(0);
    }
  }
}

/**
 * Ряд кнопок по центру cx — по их фактической ширине (кнопки растут под текст на любом языке).
 * Если ряд шире maxW, все кнопки ряда уменьшаются одинаково.
 */
export function layoutRow(buttons: Button[], cx: number, gap = 30, maxW = W - 60) {
  const total = buttons.reduce((s, b) => s + b.buttonWidth, 0) + gap * (buttons.length - 1);
  const k = Math.min(1, maxW / total);
  let x = cx - (total * k) / 2;
  for (const b of buttons) {
    b.setScale(k);
    b.setX(x + (b.buttonWidth * k) / 2);
    x += (b.buttonWidth + gap) * k;
  }
}

// ---------------------------------------------------------------------------
// Фонарщик Lumo

/** Рисует фонарщика Lumo в Graphics (без анимации). Вариант — аватарка игрока. */
export function drawLumo(g: G, s: number, avatar: Avatar = AVATARS[0]) {
  // Тень
  g.fillStyle(0x000000, 0.3);
  g.fillEllipse(0, s * 0.42, s * 0.7, s * 0.16);
  // Плащ
  g.fillStyle(avatar.cloak, 1);
  g.fillTriangle(-s * 0.34, s * 0.42, s * 0.34, s * 0.42, 0, -s * 0.2);
  g.fillRoundedRect(-s * 0.34, s * 0.08, s * 0.68, s * 0.36, s * 0.14);
  g.fillStyle(0xffffff, 0.12);
  g.fillRoundedRect(-s * 0.3, s * 0.1, s * 0.6, s * 0.08, s * 0.04);
  // Лицо
  g.fillStyle(0xffe3c2, 1);
  g.fillCircle(0, -s * 0.06, s * 0.2);
  // Колпак
  g.fillStyle(avatar.hat, 1);
  g.fillTriangle(-s * 0.24, -s * 0.1, s * 0.24, -s * 0.1, s * 0.06, -s * 0.52);
  g.fillStyle(C.lanternOn, 1);
  g.fillCircle(s * 0.06, -s * 0.52, s * 0.05);
  // Глаза и щёки
  g.fillStyle(0x1a1a2e, 1);
  g.fillCircle(-s * 0.07, -s * 0.03, s * 0.035);
  g.fillCircle(s * 0.07, -s * 0.03, s * 0.035);
  g.fillStyle(0xff9e9e, 0.6);
  g.fillCircle(-s * 0.13, s * 0.04, s * 0.035);
  g.fillCircle(s * 0.13, s * 0.04, s * 0.035);
  // Посох с фонариком — форма фонаря зависит от аватарки
  g.lineStyle(s * 0.05, 0x6b4a2b, 1);
  g.lineBetween(s * 0.3, s * 0.4, s * 0.36, -s * 0.06);
  const lx = s * 0.42;
  const ly = -s * 0.11;
  g.fillStyle(C.lanternOn, 1);
  switch (avatar.lantern) {
    case 'square':
      g.fillRoundedRect(lx - s * 0.1, ly - s * 0.09, s * 0.2, s * 0.18, s * 0.05);
      break;
    case 'round':
      g.fillCircle(lx, ly, s * 0.11);
      break;
    case 'star':
      g.fillPoints(starPoints(s * 0.14, 0.5).map((p) => new Phaser.Math.Vector2(p.x + lx, p.y + ly)), true);
      break;
    case 'diamond':
      g.fillPoints(
        [
          [0, -0.14],
          [0.1, 0],
          [0, 0.14],
          [-0.1, 0],
        ].map(([px, py]) => new Phaser.Math.Vector2(lx + px * s, ly + py * s)),
        true,
      );
      break;
    case 'crown':
      g.fillRoundedRect(lx - s * 0.11, ly - s * 0.02, s * 0.22, s * 0.11, s * 0.03);
      for (const dx of [-0.09, 0, 0.09]) g.fillTriangle(lx + (dx - 0.05) * s, ly, lx + (dx + 0.05) * s, ly, lx + dx * s, ly - s * 0.13);
      break;
  }
  g.fillStyle(0xffffff, 0.9);
  g.fillCircle(lx, ly, s * 0.04);
}

/** Lumo в образе look (части гардероба, src/ui/lumo.ts); animate — «дыхание» и мерцание фонаря. */
export function createLumo(scene: Phaser.Scene, size: number, look: Look = DEFAULT_LOOK, animate = true, opts: { withPet?: boolean } = {}): LumoFigure {
  return createLumoFigure(scene, size, look, { animate, withPet: opts.withPet });
}

/** Значок арки-портала: кольцо, светящийся проём и замок (закрыта) или искра (открыта). */
export function drawPortalIcon(g: G, x: number, y: number, r: number, open: boolean) {
  g.fillStyle(open ? C.exitOpen : 0x9b7bff, 0.18);
  g.fillCircle(x, y, r * 1.35);
  g.fillStyle(open ? 0x1d6b66 : 0x2a2350, 1);
  g.fillCircle(x, y, r);
  g.lineStyle(r * 0.26, 0x6c6aa0, 1);
  g.strokeCircle(x, y, r);
  g.fillStyle(open ? C.exitOpen : 0x9b7bff, open ? 0.9 : 0.55);
  g.fillCircle(x, y, r * 0.45);
  for (const [dx, dy] of [
    [0, -1],
    [1, 0],
    [0, 1],
    [-1, 0],
  ]) {
    g.fillStyle(open ? 0xbffff0 : 0xd8ccff, open ? 0.95 : 0.6);
    g.fillCircle(x + dx * r * 1.28, y + dy * r * 1.28, r * 0.16);
  }
  if (!open) drawPadlock(g, x, y + r * 0.05, r * 0.85);
}

/** Светлячок: прозрачные крылышки и светящееся брюшко. on — горит (собран / есть на поле), иначе тусклый. */
export function drawFireflyIcon(g: G, x: number, y: number, r: number, on: boolean) {
  if (on) {
    g.fillStyle(C.fireflyGlow, 0.22);
    g.fillCircle(x, y + r * 0.2, r * 1.25);
  }
  // Крылья
  g.fillStyle(0xdfe8ff, on ? 0.55 : 0.25);
  g.fillEllipse(x - r * 0.45, y - r * 0.45, r * 0.8, r * 0.5);
  g.fillEllipse(x + r * 0.45, y - r * 0.45, r * 0.8, r * 0.5);
  // Голова и брюшко-огонёк
  g.fillStyle(0x3a3350, 1);
  g.fillCircle(x, y - r * 0.45, r * 0.26);
  g.fillStyle(on ? C.firefly : 0x56604a, 1);
  g.fillEllipse(x, y + r * 0.15, r * 0.62, r * 0.9);
  if (on) {
    g.fillStyle(0xffffff, 0.7);
    g.fillEllipse(x - r * 0.08, y + r * 0.02, r * 0.2, r * 0.32);
  }
}

/** Замок (без цифры): корпус и дужка. */
export function drawPadlock(g: G, x: number, y: number, s: number, shackleLift = 0) {
  g.lineStyle(s * 0.14, 0xe7c66b, 1);
  g.beginPath();
  g.arc(x, y - s * 0.1 - shackleLift, s * 0.24, Math.PI, Math.PI * 2, false);
  g.strokePath();
  g.lineBetween(x - s * 0.24, y - s * 0.1 - shackleLift, x - s * 0.24, y + s * 0.02 - shackleLift);
  g.lineBetween(x + s * 0.24, y - s * 0.1, x + s * 0.24, y + s * 0.02);
  g.fillStyle(0xffd36b, 1);
  g.fillRoundedRect(x - s * 0.36, y - s * 0.02, s * 0.72, s * 0.56, s * 0.1);
  g.fillStyle(0xffffff, 0.35);
  g.fillRoundedRect(x - s * 0.3, y + s * 0.03, s * 0.6, s * 0.12, s * 0.05);
}

/** Круглый значок с аватаркой (меню, победа, профиль). locked — серый с замком и условием. */
export function createAvatarBadge(
  scene: Phaser.Scene,
  x: number,
  y: number,
  r: number,
  look: Look,
  opts: { locked?: boolean; selected?: boolean; animate?: boolean; lockLabel?: string } = {},
): Phaser.GameObjects.Container {
  const c = scene.add.container(x, y);
  const bg = scene.add.graphics();
  bg.fillStyle(0x000000, 0.3);
  bg.fillCircle(0, 6, r);
  bg.fillStyle(opts.locked ? C.cardDisabled : 0x2b3470, 1);
  bg.fillCircle(0, 0, r);
  bg.lineStyle(Math.max(4, r * 0.07), opts.selected ? C.primary : C.cardEdge, 1);
  bg.strokeCircle(0, 0, r);
  c.add(bg);
  const lumo = createLumo(scene, r * 1.45, look, opts.animate ?? false).setPosition(-r * 0.08, r * 0.12);
  c.add(lumo);
  if (opts.locked) {
    lumo.setAlpha(0.25);
    const lg = scene.add.graphics();
    drawIcon(lg, 'lock', r * 0.7, C.icon);
    lg.setPosition(0, -r * 0.12);
    c.add(lg);
    if (opts.lockLabel) c.add(text(scene, 0, r * 0.5, opts.lockLabel, Math.round(r * 0.3), '#ffd36b'));
  }
  return c;
}

// ---------------------------------------------------------------------------
// Ночной фон: градиент, мерцающие звёзды и светлячки

/**
 * Фон сцены. evening — тёплый вечер «Долины» (закатное небо и тёмные холмы внизу), иначе ночное небо.
 */
export function addBackground(scene: Phaser.Scene, opts: { dust?: boolean; evening?: boolean; forest?: boolean } = {}) {
  // Фон на весь экран (а не только на раскладку 1080×1920): градиент перерисовывается при смене размера.
  const g = scene.add.graphics().setDepth(-10);
  let vignette: Phaser.GameObjects.Image | null = null;
  const paint = (v: ViewRect) => {
    g.clear();
    if (opts.forest) {
      // «Туманный лес»: бирюзово-фиолетовые сумерки, полосы тумана и чёрные силуэты елей.
      const mid = v.y + v.h * 0.5;
      g.fillGradientStyle(0x080820, 0x080820, 0x1c1446, 0x1c1446, 1);
      g.fillRect(v.x - 4, v.y - 4, v.w + 8, mid - v.y + 4);
      g.fillGradientStyle(0x1c1446, 0x1c1446, 0x0f3a46, 0x0f3a46, 1);
      g.fillRect(v.x - 4, mid, v.w + 8, v.y + v.h - mid + 4);
      const by = v.y + v.h;
      g.fillStyle(0x7ae0d8, 0.06);
      g.fillEllipse(v.x + v.w * 0.5, by - v.h * 0.2, v.w * 1.4, v.h * 0.12);
      const rnd = new Phaser.Math.RandomDataGenerator(['forest-bg']);
      for (const [base, color, hk] of [[by - v.h * 0.1, 0x10142e, 0.16], [by - v.h * 0.02, 0x06081a, 0.2]] as const) {
        g.fillStyle(color, 1);
        for (let x = v.x - 60; x < v.x + v.w + 60; x += rnd.between(70, 130)) {
          const h = v.h * hk * rnd.realInRange(0.7, 1.2);
          const w = h * 0.36;
          g.fillTriangle(x - w, base, x + w, base, x, base - h);
          g.fillTriangle(x - w * 0.8, base - h * 0.35, x + w * 0.8, base - h * 0.35, x, base - h * 1.05);
        }
        g.fillRect(v.x - 4, base, v.w + 8, by - base + 4);
      }
      g.fillStyle(0xb8a8f0, 0.05);
      g.fillEllipse(v.x + v.w * 0.3, by - v.h * 0.12, v.w * 0.9, v.h * 0.05);
    } else if (opts.evening) {
      const mid = v.y + v.h * 0.55;
      g.fillGradientStyle(C.eveTop, C.eveTop, C.eveMid, C.eveMid, 1);
      g.fillRect(v.x - 4, v.y - 4, v.w + 8, mid - v.y + 4);
      g.fillGradientStyle(C.eveMid, C.eveMid, C.eveBottom, C.eveBottom, 1);
      g.fillRect(v.x - 4, mid, v.w + 8, v.y + v.h - mid + 4);
      // Последний отсвет заката за холмами, холмы — чёрные силуэты.
      const by = v.y + v.h;
      g.fillStyle(0xff9a6a, 0.07);
      g.fillCircle(v.x + v.w * 0.7, by - v.h * 0.16, v.w * 0.3);
      g.fillStyle(0x16122a, 1);
      g.fillEllipse(v.x + v.w * 0.2, by - v.h * 0.06, v.w * 1.1, v.h * 0.26);
      g.fillStyle(0x0d0b1c, 1);
      g.fillEllipse(v.x + v.w * 0.85, by - v.h * 0.02, v.w * 1.2, v.h * 0.22);
    } else {
      g.fillGradientStyle(C.bgTop, C.bgTop, C.bgBottom, C.bgBottom, 1);
      g.fillRect(v.x - 4, v.y - 4, v.w + 8, v.h + 8);
    }
    vignette?.setPosition(v.x + v.w / 2, v.y + v.h / 2).setDisplaySize(v.w, v.h);
  };
  const view = keepFitted(scene, paint);
  paint(view);
  // Звёзды и светлячки — с запасом за краями раскладки, чтобы покрывать высокие и широкие экраны.
  const X0 = -700;
  const X1 = W + 700;
  const Y0 = -1000;
  const Y1 = H + 1000;
  const rnd = new Phaser.Math.RandomDataGenerator(['glowtrail']);
  // В сумерках звёзды только в верхней части неба.
  for (let i = 0; i < (opts.evening || opts.forest ? 60 : 90); i++) {
    const st = scene.add
      .image(rnd.between(X0, X1), opts.evening || opts.forest ? rnd.between(Y0, H * 0.55) : rnd.between(Y0, Y1), 'dot')
      .setScale(rnd.realInRange(0.15, 0.35))
      .setAlpha(rnd.realInRange(0.15, 0.5))
      .setDepth(-9);
    scene.tweens.add({
      targets: st,
      alpha: 0.05,
      duration: rnd.between(1200, 3000),
      yoyo: true,
      repeat: -1,
      delay: rnd.between(0, 2000),
    });
  }
  for (let i = 0; i < 9; i++) {
    const f = scene.add
      .image(rnd.between(view.x, view.x + view.w), rnd.between(view.y, view.y + view.h), 'glow')
      .setTint(0xd8ff8a)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setScale(0.22)
      .setAlpha(0)
      .setDepth(-8);
    const wander = () => {
      scene.tweens.add({
        targets: f,
        x: Phaser.Math.Clamp(f.x + Phaser.Math.Between(-220, 220), view.x, view.x + view.w),
        y: Phaser.Math.Clamp(f.y + Phaser.Math.Between(-220, 220), view.y, view.y + view.h),
        alpha: { from: 0, to: 0.55 },
        duration: Phaser.Math.Between(2500, 4500),
        yoyo: true,
        ease: 'Sine.inOut',
        onComplete: wander,
      });
    };
    scene.time.delayedCall(i * 500, wander);
  }
  // Атмосфера: туман, пылинки и тёмные края.
  addFog(scene, view);
  if (opts.dust !== false) addDust(scene, view);
  vignette = addVignette(scene, view);
}

/**
 * Надпись по центру (x, y). fit — контейнер: ширина w, строк lines (по умолчанию 1), высота h — тогда текст
 * переносится, уменьшается до 70% и в крайнем случае обрезается (src/ui/UIText.ts). Без fit — как есть.
 */
export function text(scene: Phaser.Scene, x: number, y: number, str: string, size: number, color: string = C.text, bold = true, fit?: { w: number; lines?: number; h?: number }) {
  const t = scene.add
    .text(x, y, str, { fontFamily: FONT, fontSize: `${size}px`, color, fontStyle: bold ? 'bold' : 'normal', align: 'center' })
    .setOrigin(0.5);
  if (fit) setFitted(t, str, { ...fit, size, bold });
  return t;
}
