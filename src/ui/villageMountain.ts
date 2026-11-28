// Постройки Горного города (простые фигуры, без картинок): камень, снег на крышах, тёплые окна, сосульки.
// До восстановления — тёмные, заметённые снегом, с обломанными досками и погасшими окнами; после — тёплый свет
// в окнах и фонарях, холодные огоньки кристаллов. Уровни 2–3 (вывеска, ещё окна и фонарь, гирлянда, флажок,
// пристройка) — общими деталями из village.ts по разметке Up; здесь же три горные пристройки: шале, дровяник и
// ларёк с горячим чаем.
//
// Модуль связан с village.ts по кругу (оттуда — помощники, туда — mountain/mountainExt): поэтому здесь нет
// вычислений на верхнем уровне с импортированными значениями — только функции.

import { arcPts, chimney, door, fp, GOLD, hangLantern, ICE, IRON, lampPost, logEnd, plank, roundWindow, shadow, sp, star, windowAt, type B, type G, type Pal, type Pt, type Up } from './village';

export type MountainExt = 'chalet' | 'woodshed' | 'stall';

/** Детерминированный шум для неровностей снега и камня. */
function rr(i: number, k = 0) {
  const x = Math.sin(i * 127.1 + k * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/** Снег: светлый ночью у восстановленной постройки, серо-голубой у заброшенной. */
const snowC = (p: Pal) => (p.lit ? 0xf2f6ff : 0x5a6488);
const snowShade = (p: Pal) => (p.lit ? 0xc6d2ec : 0x3e4668);
const iceC = (p: Pal) => (p.lit ? 0xd8ecff : 0x56607e);

/**
 * Снежная шапка вдоль верхнего края (ломаная слева направо): толщина t, мягкий волнистый нижний край с
 * «подушками» снега и тенью.
 */
function snowCap(g: G, pts: Pt[], t: number, p: Pal, seed = 0) {
  const top: Pt[] = [];
  const bot: Pt[] = [];
  let k = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[i + 1];
    const n = Math.max(1, Math.round(Math.hypot(x1 - x0, y1 - y0) / 10));
    for (let j = 0; j <= n; j++) {
      if (i > 0 && j === 0) continue;
      const x = x0 + ((x1 - x0) * j) / n;
      const y = y0 + ((y1 - y0) * j) / n;
      top.push([x, y - t * 0.45]);
      bot.push([x, y + t * (0.45 + 0.45 * rr(k++, seed))]);
    }
  }
  g.fillStyle(snowShade(p), 1);
  fp(g, [...top.flat(), ...bot.map(([x, y]) => [x, y + 3]).reverse().flat()]);
  g.fillStyle(snowC(p), 1);
  fp(g, [...top.flat(), ...[...bot].reverse().flat()]);
  for (let i = 0; i < bot.length; i += 2) g.fillCircle(bot[i][0], bot[i][1] - t * 0.15, t * 0.32);
}

/** Сосульки вдоль карниза от x0 до x1 на высоте y. */
function icicles(g: G, x0: number, x1: number, y: number, p: Pal, seed = 0, maxLen = 16) {
  g.fillStyle(iceC(p), p.lit ? 0.92 : 0.8);
  const n = Math.max(1, Math.floor(Math.abs(x1 - x0) / 13));
  for (let i = 0; i <= n; i++) {
    const x = x0 + ((x1 - x0) * i) / n;
    const len = 5 + maxLen * rr(i, seed + 7);
    g.fillTriangle(x - 3, y, x + 3, y, x + 0.5, y + len);
  }
}

/** Сугроб у земли. */
function drift(g: G, x: number, w: number, h: number, p: Pal) {
  g.fillStyle(snowShade(p), 1);
  g.fillEllipse(x, 3, w, h * 1.1);
  g.fillStyle(snowC(p), 1);
  g.fillEllipse(x - w * 0.06, 0, w * 0.9, h);
}

/** Каменная кладка: прямоугольник с неровными рядами камней. */
function stoneWall(g: G, x: number, y: number, w: number, h: number, p: Pal, seed = 0, base = p.wall, joint = p.wallDark) {
  g.fillStyle(base, 1);
  g.fillRect(x, y, w, h);
  g.lineStyle(2, joint, 1);
  const rows = Math.max(1, Math.round(h / 18));
  const rh = h / rows;
  for (let r = 1; r < rows; r++) g.lineBetween(x, y + r * rh, x + w, y + r * rh);
  for (let r = 0; r < rows; r++) {
    let cx = x + (r % 2 ? 10 : 22) + rr(r, seed) * 8;
    while (cx < x + w - 6) {
      g.lineBetween(cx, y + r * rh, cx, y + (r + 1) * rh);
      cx += 22 + rr(r * 7 + cx, seed) * 14;
    }
  }
}

/** Двускатная крыша под снегом: черепица, снежная шапка по скатам, сосульки по карнизу. */
function snowRoof(g: G, x: number, y: number, w: number, h: number, p: Pal, seed = 0, over = 16) {
  const L = x - w / 2 - over;
  const R = x + w / 2 + over;
  g.fillStyle(p.roof, 1);
  g.fillTriangle(L, y, R, y, x, y - h);
  g.lineStyle(3, p.roofDark, 1);
  for (let i = 1; i < 4; i++) {
    const yy = y - (h * i) / 4;
    const half = (w / 2 + over) * (1 - i / 4);
    g.lineBetween(x - half, yy, x + half, yy);
  }
  if (!p.lit) {
    g.fillStyle(0x0a0b18, 1);
    g.fillTriangle(x + w * 0.12, y - h * 0.3, x + w * 0.22, y - h * 0.3, x + w * 0.17, y - h * 0.45);
  }
  snowCap(
    g,
    [
      [L - 2, y + 1],
      [x, y - h - 1],
      [R + 2, y + 1],
    ],
    12,
    p,
    seed,
  );
  g.fillStyle(p.roofDark, 1);
  g.fillRect(L, y, R - L, 5);
  icicles(g, L + 4, R - 4, y + 5, p, seed);
}

/** Окно с наличником и снегом на подоконнике. */
function winterWindow(b: B, x: number, y: number, w: number, h: number, shutters = true) {
  windowAt(b.g, b.v, x, y, w, h, b.p, b.lit, shutters);
  b.g.fillStyle(snowC(b.p), 1);
  b.g.fillRoundedRect(x - w / 2 - 7, y + h / 2 + 2, w + 14, 6, 3);
}

/** Ель в снегу (центр основания x, y; s — масштаб). */
function fir(g: G, x: number, y: number, s: number, p: Pal) {
  g.fillStyle(p.woodDark, 1);
  g.fillRect(x - 3 * s, y - 10 * s, 6 * s, 10 * s);
  for (const [w, yy, h] of [
    [30, -8, 26],
    [24, -24, 24],
    [16, -40, 22],
  ] as const) {
    g.fillStyle(p.leaf, 1);
    g.fillTriangle(x - w * s, y + yy * s, x + w * s, y + yy * s, x, y + (yy - h - 10) * s);
    g.fillStyle(snowC(p), 1);
    g.fillTriangle(x - w * 0.45 * s, y + (yy - h * 0.55) * s, x + w * 0.45 * s, y + (yy - h * 0.55) * s, x, y + (yy - h - 10) * s);
  }
}

/** Коза: x, y — между ногами, dir — куда смотрит. */
function goat(g: G, x: number, y: number, s: number, dir: 1 | -1, p: Pal, color = 0xf0ece4) {
  const c = p.lit ? color : 0x343a54;
  const dark = p.lit ? 0x5a4a3a : 0x22263a;
  g.fillStyle(dark, 1);
  for (const dx of [-12, -6, 8, 13]) g.fillRect(x + dx * s * dir - 1.5 * s, y - 14 * s, 3 * s, 14 * s);
  g.fillStyle(c, 1);
  g.fillEllipse(x, y - 20 * s, 36 * s, 18 * s);
  g.fillTriangle(x - 18 * s * dir, y - 24 * s, x - 18 * s * dir, y - 18 * s, x - 23 * s * dir, y - 27 * s);
  // шея и голова
  fp(g, [x + 10 * s * dir, y - 26 * s, x + 18 * s * dir, y - 38 * s, x + 24 * s * dir, y - 34 * s, x + 18 * s * dir, y - 20 * s]);
  g.fillEllipse(x + 24 * s * dir, y - 37 * s, 14 * s, 10 * s);
  g.fillTriangle(x + 28 * s * dir, y - 34 * s, x + 25 * s * dir, y - 33 * s, x + 27 * s * dir, y - 26 * s);
  // рога назад
  g.lineStyle(2.5 * s, dark, 1);
  sp(g, [
    [x + 22 * s * dir, y - 41 * s],
    [x + 17 * s * dir, y - 48 * s],
    [x + 11 * s * dir, y - 46 * s],
  ]);
  g.fillStyle(0x1a1a2e, 1);
  g.fillCircle(x + 25 * s * dir, y - 39 * s, 1.6 * s);
}

/** Кристалл: основание x, y, высота h, наклон a (радианы), цвет. */
function crystal(b: B, x: number, y: number, h: number, a: number, c: number, glow = true) {
  const { g, v, p } = b;
  const col = p.lit ? c : 0x2c3250;
  const w = h * 0.28;
  const ca = Math.cos(a);
  const sa = Math.sin(a);
  // u — поперёк кристалла, t — вдоль (вверх с наклоном a)
  const P = (u: number, t: number): [number, number] => [x + u * ca + t * sa, y + u * sa - t * ca];
  const pts = [P(-w, 0), P(-w, h * 0.7), P(0, h), P(w, h * 0.7), P(w, 0)];
  g.fillStyle(col, 1);
  fp(g, pts.flat());
  g.fillStyle(0xffffff, p.lit ? 0.35 : 0.08);
  fp(g, [...P(-w * 0.2, 0), ...P(-w * 0.2, h * 0.75), ...P(0, h), ...P(w * 0.25, h * 0.7), ...P(w * 0.25, 0)]);
  if (glow && p.lit) v.lights.push({ x: P(0, h * 0.5)[0], y: P(0, h * 0.5)[1], r: h * 0.45, c });
}

/** Шесты и знаки, общие для гирлянд вдоль крыши: края двускатной крыши snowRoof. */
const roofLine = (x: number, y: number, w: number, h: number, over = 16): Pt[] => [
  [x - w / 2 - over, y],
  [x, y - h],
  [x + w / 2 + over, y],
];

// ---------------------------------------------------------------------------
// Пристройки (ур. 3) — слой back, X(d) — координата от края стены в сторону пристройки

export function mountainExt(b: B, kind: MountainExt, X: (d: number) => number, y0: number): { w: number; h: number; top: Pt } {
  const g = b.back;
  const { p, v } = b;
  const R = (d0: number, d1: number, ya: number, yb: number) => g.fillRect(Math.min(X(d0), X(d1)), y0 + ya, Math.abs(d1 - d0), yb - ya);
  switch (kind) {
    case 'chalet': {
      // Шале: каменный цоколь, деревянный верх, крутая крыша под снегом
      const cx = (X(-10) + X(94)) / 2;
      stoneWall(g, Math.min(X(-10), X(94)), y0 - 34, 104, 34, p, 3, p.stone, p.stoneDark);
      g.fillStyle(p.wood, 1);
      R(-10, 94, -88, -34);
      g.lineStyle(2, p.woodDark, 1);
      for (let yy = -78; yy < -34; yy += 11) g.lineBetween(X(-10), y0 + yy, X(94), y0 + yy);
      windowAt(g, v, X(26), y0 - 60, 24, 22, p, true, true);
      door(g, X(70), y0, 22, 44, p, true);
      snowRoof(g, cx, y0 - 88, 104, 62, p, 11, 12);
      return { w: 104, h: 156, top: [cx, y0 - 152] };
    }
    case 'woodshed': {
      // Дровяник: навес на столбах, поленница, топор в колоде
      g.fillStyle(p.woodDark, 1);
      for (const d of [0, 82]) R(d - 3, d + 3, -84, 0);
      g.fillStyle(p.roof, 1);
      fp(g, [X(-10), y0 - 92, X(-10), y0 - 82, X(94), y0 - 70, X(94), y0 - 80]);
      snowCap(
        g,
        [
          [Math.min(X(-12), X(96)), X(-12) < X(96) ? y0 - 92 : y0 - 80],
          [Math.max(X(-12), X(96)), X(-12) < X(96) ? y0 - 80 : y0 - 92],
        ],
        10,
        p,
        5,
      );
      for (let r = 0; r < 4; r++) for (let c = 0; c < 5 - (r === 3 ? 1 : 0); c++) logEnd(g, X(10 + c * 15 + (r % 2) * 7), y0 - 9 - r * 15, 7.5, p);
      g.fillStyle(p.woodDark, 1);
      g.fillRoundedRect(X(104) - 12, y0 - 18, 24, 18, 4);
      g.lineStyle(3, p.wood, 1);
      g.lineBetween(X(104), y0 - 18, X(112), y0 - 40);
      g.fillStyle(0xaab0c0, 1);
      fp(g, [X(108), y0 - 38, X(118), y0 - 44, X(116), y0 - 32]);
      drift(g, X(40), 90, 14, p);
      return { w: 120, h: 96, top: [X(80), y0 - 80] };
    }
    case 'stall': {
      // Ларёк с горячим чаем: прилавок, полосатый навес, кружки с паром, фонарик
      g.fillStyle(p.woodDark, 1);
      for (const d of [6, 84]) R(d - 3, d + 3, -100, 0);
      g.fillStyle(p.wood, 1);
      R(0, 90, -42, 0);
      g.lineStyle(2, p.woodDark, 1);
      g.lineBetween(X(0), y0 - 30, X(90), y0 - 30);
      for (let i = 0; i < 4; i++) {
        const x = X(16 + i * 20);
        g.fillStyle([0xd04a3a, 0xece4d4, 0x3a6ad0, 0xe8c25a][i], 1);
        g.fillRoundedRect(x - 6, y0 - 54, 12, 12, 3);
        g.lineStyle(1.5, 0xffffff, 0.45);
        g.lineBetween(x - 2, y0 - 58, x - 4, y0 - 66);
        g.lineBetween(x + 2, y0 - 58, x + 4, y0 - 66);
      }
      for (let i = 0; i < 5; i++) {
        g.fillStyle(i % 2 ? p.trim : 0x3a6ad0, 1);
        fp(g, [X(-8 + i * 21), y0 - 114, X(13 + i * 21), y0 - 114, X(13 + i * 21), y0 - 96, X(-8 + i * 21), y0 - 96]);
        g.fillCircle(X(2.5 + i * 21), y0 - 96, 10.5);
      }
      snowCap(
        g,
        [
          [Math.min(X(-10), X(98)), y0 - 114],
          [Math.max(X(-10), X(98)), y0 - 114],
        ],
        9,
        p,
        8,
      );
      hangLantern(g, v, X(45), y0 - 92, 6, 0xffd36b, true);
      return { w: 98, h: 120, top: [X(84), y0 - 116] };
    }
  }
}

// ---------------------------------------------------------------------------
// Постройки Горного города

export function mountain(b: B, id: string): Up | null {
  const { scene, g, v, p, lit, lv } = b;
  switch (id) {
    case 'mine': {
      shadow(g, 300);
      // Скала-холм под снегом
      const hill: Pt[] = [];
      for (let i = 0; i <= 18; i++) {
        const a = Math.PI + (i / 18) * Math.PI;
        hill.push([Math.cos(a) * 130 + 10, Math.sin(a) * 112 * (1 + 0.07 * Math.sin(i * 1.9))]);
      }
      g.fillStyle(p.stoneDark, 1);
      fp(g, hill.flat());
      g.fillStyle(p.stone, 1);
      fp(g, [-90, 0, -70, -60, -20, -88, 40, -96, 90, -66, 100, 0]);
      g.lineStyle(2, p.stoneDark, 0.9);
      sp(g, [[-60, -40], [-30, -50], [0, -42]]);
      sp(g, [[50, -60], [80, -40], [96, -20]]);
      snowCap(g, hill.slice(3, 16), 13, p, 1);
      fir(g, 112, -44, 0.9, p);
      // Штольня: деревянная рама, тёмный вход (у восстановленной — тёплый свет из глубины)
      g.fillStyle(lit ? 0x2a1a10 : 0x05060e, 1);
      g.fillRect(-66, -66, 52, 66);
      if (lit) {
        g.fillStyle(0xffb85a, 0.55);
        g.fillEllipse(-40, -18, 30, 26);
        v.lights.push({ x: -40, y: -26, r: 30 });
      }
      g.fillStyle(p.wood, 1);
      g.fillRect(-72, -72, 10, 72);
      g.fillRect(-18, -72, 10, 72);
      g.fillRect(-80, -80, 80, 12);
      snowCap(g, [[-82, -80], [2, -80]], 9, p, 2);
      // Рельсы и вагонетка с рудой
      g.lineStyle(3, IRON, 1);
      g.lineBetween(-170, -2, -20, -2);
      g.lineBetween(-170, 3, -20, 3);
      g.fillStyle(p.woodDark, 1);
      for (let x = -164; x < -24; x += 16) g.fillRect(x, -3, 6, 8);
      const cartX = lit ? -118 : -128;
      g.fillStyle(lit ? 0x6a6e86 : 0x262a40, 1);
      if (lit) fp(g, [cartX - 26, -40, cartX + 26, -40, cartX + 20, -10, cartX - 20, -10]);
      else fp(g, [cartX - 24, -34, cartX + 26, -44, cartX + 24, -14, cartX - 18, -6]);
      if (lit) {
        const ore = lv >= 2 ? [GOLD, ICE, 0xc89aff, GOLD, ICE] : [0x8a8494, GOLD, 0x8a8494];
        ore.forEach((c, i) => {
          g.fillStyle(c, 1);
          g.fillCircle(cartX - 16 + i * (32 / Math.max(1, ore.length - 1)), -42 - (i % 2) * 4, 6);
        });
        if (lv >= 2) v.lights.push({ x: cartX, y: -46, r: 12, c: ICE });
      }
      g.fillStyle(IRON, 1);
      g.fillCircle(cartX - 12, -8, 7);
      g.fillCircle(cartX + 12, -8, 7);
      // Копёр: решётчатая башня с колесом (колесо крутится у восстановленной)
      g.lineStyle(5, p.woodDark, 1);
      g.lineBetween(46, -84, 64, -214);
      g.lineBetween(100, -60, 82, -214);
      g.lineStyle(3, p.wood, 1);
      for (let k = 0; k < 4; k++) {
        const y0 = -70 - k * 36;
        g.lineBetween(48 + k * 4, y0, 98 - k * 4, y0 - 36);
        g.lineBetween(98 - k * 4, y0, 48 + k * 4, y0 - 36);
      }
      g.lineStyle(2, IRON, 1);
      g.lineBetween(73, -214, -14, -70);
      const rotor = scene.add.graphics().setPosition(73, -218);
      rotor.lineStyle(4, lit ? IRON : 0x1a1c2e, 1);
      rotor.strokeCircle(0, 0, 22);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        rotor.lineBetween(0, 0, Math.cos(a) * 22, Math.sin(a) * 22);
      }
      rotor.fillStyle(lv >= 3 ? GOLD : p.trim, 1);
      rotor.fillCircle(0, 0, 5);
      v.objects.push(rotor);
      v.rotor = rotor;
      v.rotorR = 26;
      lampPost(g, v, -190, 0, 62, p);
      if (!lit) {
        g.fillStyle(p.wood, 1);
        plank(g, -40, -36, 66, 9, 0.6);
        plank(g, -40, -30, 60, 8, -0.5);
        drift(g, -40, 70, 18, p);
      }
      icicles(g, -78, -4, -68, p, 3, 12);
      return {
        l: -206,
        r: 140,
        h: 244,
        sign: { mode: 'stand', x: 130, y: 0, w: 46, emblem: 'pick' },
        lamp: [-226, 0, 56],
        win: [[44, -40, 18, 16]],
        garland: [
          [
            [-80, -84],
            [0, -84],
          ],
          [
            [-10, -74],
            [70, -210],
          ],
        ],
        flag: [10, -96, false],
        ext: { side: -1, at: -236, kind: 'woodshed' },
        lv2: () => {
          // фонарики над входом в штольню
          hangLantern(g, v, -60, -68, 8, 0xffd36b, true);
          hangLantern(g, v, -22, -68, 8, 0xffd36b, true);
        },
        lv3: () => {
          // золотая кирка над входом
          g.lineStyle(4, GOLD, 1);
          g.lineBetween(-52, -90, -28, -110);
          g.beginPath();
          g.arc(-28, -100, 14, Math.PI * 1.15, Math.PI * 1.9, false);
          g.strokePath();
        },
      };
    }
    case 'forge': {
      shadow(g, 280);
      // Каменный дом с односкатной крышей и высокой трубой
      stoneWall(g, -110, -112, 170, 112, p, 4);
      g.fillStyle(p.roof, 1);
      fp(g, [-128, -108, 78, -108, 78, -150, -128, -126]);
      snowCap(g, [[-130, -127], [80, -151]], 12, p, 4);
      icicles(g, -126, 74, -104, p, 4);
      // Труба
      stoneWall(g, 14, -244, 36, 112, p, 5, p.stoneDark, p.wallDark);
      g.fillStyle(p.stone, 1);
      g.fillRect(8, -252, 48, 12);
      snowCap(g, [[6, -252], [58, -252]], 8, p, 5);
      v.chimneys.push({ x: 32, y: -258 });
      // Горн: арка с огнём
      g.fillStyle(p.stoneDark, 1);
      g.fillRect(-96, -70, 64, 70);
      g.fillStyle(lit ? 0xff8a3a : 0x0d1024, 1);
      g.fillRect(-86, -40, 44, 40);
      g.beginPath();
      g.arc(-64, -40, 22, Math.PI, 0, false);
      g.closePath();
      g.fillPath();
      if (lit) {
        g.fillStyle(0xffd36b, 1);
        g.fillTriangle(-78, 0, -50, 0, -64, -34);
        v.lights.push({ x: -64, y: -26, r: 34, c: 0xff9a4a });
      }
      door(g, 24, 0, 34, 64, p);
      winterWindow(b, -6, -74, 26, 24, false);
      // Наковальня у входа
      g.fillStyle(p.woodDark, 1);
      g.fillRect(96, -22, 26, 22);
      g.fillStyle(lit ? 0x4a4e60 : 0x1e2032, 1);
      fp(g, [80, -36, 136, -36, 128, -28, 118, -26, 122, -22, 96, -22, 100, -26, 90, -28]);
      if (lit) {
        g.fillStyle(0xffd36b, 1);
        for (const [x, y] of [[112, -46], [120, -54], [104, -52]] as const) g.fillCircle(x, y, 2);
      }
      lampPost(g, v, -138, 0, 60, p);
      if (!lit) {
        drift(g, 108, 70, 22, p);
        g.fillStyle(p.wood, 1);
        plank(g, 24, -30, 56, 8, 1.1);
      }
      return {
        l: -150,
        r: 140,
        h: 262,
        sign: { mode: 'hang', x: 60, y: -96, dir: 1, emblem: 'anvil' },
        lamp: [160, 0, 56],
        garland: [
          [
            [-128, -126],
            [78, -150],
          ],
        ],
        flag: [-110, -128, false],
        ext: { side: -1, at: -150, kind: 'stall' },
        lv2: () => {
          // клещи и молот на стене, бочка с водой
          g.lineStyle(3, IRON, 1);
          g.lineBetween(-20, -100, -26, -80);
          g.lineBetween(-16, -100, -10, -80);
          g.fillStyle(IRON, 1);
          g.fillRect(-34, -98, 12, 6);
          g.fillStyle(p.wood, 1);
          g.fillRoundedRect(64, -30, 22, 30, 5);
          g.fillStyle(0x7ab8e0, 1);
          g.fillEllipse(75, -30, 20, 5);
        },
        lv3: () => {
          // золотая подкова над дверью
          g.lineStyle(5, GOLD, 1);
          g.beginPath();
          g.arc(24, -76, 9, Math.PI * 0.15, Math.PI * 0.85, true);
          g.strokePath();
        },
      };
    }
    case 'cable-car': {
      shadow(g, 320);
      // Станция: каменный низ, деревянный верх, крыша под снегом, большое колесо троса
      stoneWall(g, -170, -46, 110, 46, p, 6);
      g.fillStyle(p.wood, 1);
      g.fillRect(-170, -110, 110, 64);
      g.lineStyle(2, p.woodDark, 1);
      for (let y = -100; y < -46; y += 12) g.lineBetween(-170, y, -60, y);
      door(g, -140, 0, 26, 46, p, true);
      winterWindow(b, -92, -80, 28, 24);
      snowRoof(g, -115, -110, 110, 54, p, 6);
      g.lineStyle(4, IRON, 1);
      g.strokeCircle(-60, -112, 14);
      // Мачта
      g.lineStyle(5, p.stoneDark, 1);
      g.lineBetween(88, 0, 104, -200);
      g.lineBetween(132, 0, 116, -200);
      g.lineStyle(3, p.stone, 1);
      for (let k = 0; k < 5; k++) {
        const y0 = -k * 40;
        const w0 = 22 - k * 1.6;
        const w1 = 22 - (k + 1) * 1.6;
        g.lineBetween(110 - w0, y0, 110 + w1, y0 - 40);
        g.lineBetween(110 + w0, y0, 110 - w1, y0 - 40);
      }
      g.fillStyle(IRON, 1);
      g.fillRect(84, -206, 52, 8);
      // Трос и кабинка
      g.lineStyle(2.5, IRON, 1);
      g.lineBetween(-60, -126, 110, -206);
      g.lineBetween(110, -206, 176, -190);
      const t = lit ? 0.45 : 0.62;
      const cx = -60 + (110 + 60) * t;
      const cy = -126 + (-206 + 126) * t;
      g.lineStyle(3, IRON, 1);
      g.lineBetween(cx, cy, cx, cy + 22);
      const tilt = lit ? 0 : 0.18;
      g.fillStyle(lit ? 0xc04040 : 0x262a40, 1);
      const cab = (dx: number, dy: number): [number, number] => [cx + dx * Math.cos(tilt) - dy * Math.sin(tilt), cy + 22 + dx * Math.sin(tilt) + dy * Math.cos(tilt)];
      fp(g, [...cab(-26, 0), ...cab(26, 0), ...cab(28, 44), ...cab(-28, 44)]);
      g.fillStyle(p.window, 1);
      fp(g, [...cab(-20, 8), ...cab(-2, 8), ...cab(-2, 24), ...cab(-20, 24)]);
      fp(g, [...cab(2, 8), ...cab(20, 8), ...cab(20, 24), ...cab(2, 24)]);
      if (lit) v.lights.push({ x: cx, y: cy + 38, r: 22 });
      g.fillStyle(snowC(p), 1);
      g.fillRoundedRect(cx - 28, cy + 18, 56, 6, 3);
      lampPost(g, v, -196, 0, 60, p);
      if (!lit) {
        drift(g, -115, 120, 22, p);
        icicles(g, cx - 24, cx + 24, cy + 66, p, 9, 8);
      }
      return {
        l: -210,
        r: 180,
        h: 230,
        sign: { mode: 'hang', x: -170, y: -86, dir: -1, emblem: 'gondola' },
        lamp: [150, 0, 56],
        win: [[-138, -80, 22, 22]],
        garland: [
          roofLine(-115, -110, 110, 54),
          [
            [-60, -128],
            [110, -208],
          ],
        ],
        flag: [110, -206, false],
        ext: { side: -1, at: -212, kind: 'chalet' },
        lv2: () => {
          // фонарик на кабинке и лыжи у станции
          hangLantern(g, v, cx + 20, cy + 46, 4, 0xffd36b, true);
          g.lineStyle(4, 0xd04a3a, 1);
          g.lineBetween(-52, 0, -44, -56);
          g.lineStyle(4, 0x3a6ad0, 1);
          g.lineBetween(-44, 0, -36, -56);
        },
      };
    }
    case 'crystal-cave': {
      shadow(g, 300);
      // Скала с гротом
      g.fillStyle(p.stoneDark, 1);
      fp(g, [-150, 0, -132, -70, -100, -130, -40, -168, 20, -176, 80, -150, 124, -96, 146, 0]);
      g.fillStyle(p.stone, 1);
      fp(g, [-110, 0, -100, -80, -60, -134, 0, -150, 60, -134, 104, -84, 116, 0]);
      g.lineStyle(2, p.stoneDark, 1);
      sp(g, [[-90, -40], [-70, -60], [-74, -90]]);
      sp(g, [[70, -40], [90, -70]]);
      snowCap(g, [[-134, -66], [-100, -130], [-40, -168], [20, -176], [80, -150], [126, -94]], 14, p, 7);
      // Грот
      g.fillStyle(lit ? 0x14204a : 0x05060e, 1);
      g.fillRect(-50, -60, 100, 60);
      g.beginPath();
      g.arc(0, -60, 50, Math.PI, 0, false);
      g.closePath();
      g.fillPath();
      if (lit) {
        g.fillStyle(ICE, 0.25);
        g.fillEllipse(0, -40, 80, 60);
      }
      icicles(g, -44, 44, -108 + 4, p, 7, 10);
      // Кристаллы у входа и на скале
      const cols = [ICE, 0xc89aff, 0x7ae0ff];
      crystal(b, -30, 0, 46, 0.25, cols[0]);
      crystal(b, -12, 0, 30, -0.1, cols[1]);
      crystal(b, 26, 0, 40, -0.3, cols[2]);
      crystal(b, -110, -4, 34, -0.3, cols[1]);
      crystal(b, 104, -4, 30, 0.35, cols[0]);
      if (!lit) {
        drift(g, 0, 110, 28, p);
        g.fillStyle(p.stoneDark, 1);
        for (const [x, y, r] of [[-20, -10, 12], [14, -8, 10], [0, -22, 9]] as const) g.fillCircle(x, y, r);
      }
      lampPost(g, v, -176, 0, 58, p);
      return {
        l: -190,
        r: 150,
        h: 210,
        sign: { mode: 'stand', x: 128, y: 0, w: 46, emblem: 'crystal' },
        lamp: [176, 0, 54],
        garland: [
          arcPts(0, -60, 54, 54, Math.PI, Math.PI * 2, 8),
        ],
        trim: [arcPts(0, -60, 52, 52, Math.PI, Math.PI * 2, 8)],
        flag: [20, -178, false],
        ext: { side: -1, at: -192, kind: 'stall' },
        lv2: () => {
          crystal(b, -126, -40, 26, -0.5, cols[2]);
          crystal(b, 60, -118, 28, 0.3, cols[1]);
          hangLantern(g, v, 0, -110, 10, 0x9ad6ff, true, true);
        },
        lv3: () => {
          crystal(b, -60, -150, 32, -0.2, 0xffe08a);
          g.fillStyle(GOLD, 1);
          star(g, 0, -126, 9, 4);
        },
      };
    }
    case 'goat-farm': {
      shadow(g, 300);
      // Амбар с ломаной крышей
      g.fillStyle(lit ? 0x8a3a34 : 0x24223a, 1);
      g.fillRect(-100, -110, 160, 110);
      g.lineStyle(2, lit ? 0x6a2a26 : 0x1a1a2e, 1);
      for (let x = -88; x < 60; x += 14) g.lineBetween(x, -110, x, 0);
      const roofPts: Pt[] = [
        [-116, -106],
        [-90, -160],
        [-20, -186],
        [50, -160],
        [76, -106],
      ];
      g.fillStyle(p.roof, 1);
      fp(g, roofPts.flat());
      g.lineStyle(3, p.roofDark, 1);
      g.lineBetween(-90, -160, 50, -160);
      snowCap(g, roofPts, 13, p, 8);
      icicles(g, -112, 72, -104, p, 8);
      // Большие ворота с крестом и сеновал
      g.fillStyle(p.woodDark, 1);
      g.fillRect(-56, -76, 72, 76);
      g.lineStyle(4, p.trim, 1);
      g.strokeRect(-56, -76, 72, 76);
      g.lineBetween(-56, -76, 16, 0);
      g.lineBetween(16, -76, -56, 0);
      g.fillStyle(p.window, 1);
      g.fillRect(-34, -146, 28, 26);
      g.lineStyle(2, p.trim, 1);
      g.strokeRect(-34, -146, 28, 26);
      if (lit) {
        g.fillStyle(0xe0c070, 1);
        g.fillRect(-30, -128, 20, 8);
        v.lights.push({ x: -20, y: -133, r: 22 });
      }
      // Изгородь и козы
      g.fillStyle(p.wood, 1);
      g.fillRect(64, -30, 96, 5);
      g.fillRect(64, -16, 96, 5);
      for (let x = 66; x <= 160; x += 24) g.fillRect(x - 3, -40, 6, 40);
      goat(g, lit ? 112 : 120, 0, 1, -1, p);
      if (!lit) {
        drift(g, 110, 100, 18, p);
        g.fillStyle(p.wood, 1);
        plank(g, -20, -40, 70, 9, 0.9);
      }
      lampPost(g, v, -128, 0, 60, p);
      return {
        l: -140,
        r: 166,
        h: 250,
        sign: { mode: 'hang', x: 60, y: -92, dir: 1, w: 44, emblem: 'goat' },
        lamp: [186, 0, 56],
        win: [[-82, -50, 18, 20]],
        garland: [roofPts],
        flag: [-20, -190, true],
        ext: { side: -1, at: -142, kind: 'woodshed' },
        lv2: () => {
          // тюки сена, колокольчик у ворот, вторая коза
          g.fillStyle(0xd8b860, 1);
          g.fillRoundedRect(30, -26, 28, 26, 5);
          g.lineStyle(2, 0xa88a40, 1);
          g.lineBetween(30, -14, 58, -14);
          goat(g, 146, 0, 0.75, 1, p, 0x8a6a4a);
        },
        lv3: () => {
          // венок из еловых веток на воротах
          g.lineStyle(6, p.leaf, 1);
          g.strokeCircle(-20, -92, 11);
          g.fillStyle(0xd04a3a, 1);
          g.fillCircle(-26, -84, 3);
          g.fillCircle(-14, -84, 3);
        },
      };
    }
    case 'bell-tower': {
      shadow(g, 200);
      // Каменная башня с открытым ярусом и шпилем
      stoneWall(g, -46, -200, 92, 200, p, 9);
      g.fillStyle(p.wallDark, 1);
      g.fillRect(-52, -206, 104, 10);
      // Ярус колокола
      g.fillStyle(p.stoneDark, 1);
      g.fillRect(-42, -270, 84, 64);
      g.fillStyle(lit ? 0x1a2040 : 0x05060e, 1);
      g.fillRect(-28, -250, 56, 44);
      g.beginPath();
      g.arc(0, -250, 28, Math.PI, 0, false);
      g.closePath();
      g.fillPath();
      g.fillStyle(lit ? (lv >= 3 ? GOLD : 0xd8a840) : 0x2e3048, 1);
      fp(g, [-18, -214, 18, -214, 12, -232, 8, -248, -8, -248, -12, -232]);
      g.fillCircle(0, -210, 4);
      if (lit) v.lights.push({ x: 0, y: -232, r: 24 });
      g.fillStyle(p.stone, 1);
      g.fillRect(-48, -276, 96, 8);
      // Шпиль
      g.fillStyle(p.roof, 1);
      g.fillTriangle(-50, -276, 50, -276, 0, -350);
      snowCap(g, [[-52, -275], [0, -351], [52, -275]], 11, p, 9);
      icicles(g, -46, 46, -270, p, 9, 10);
      // Вход, часы, окна-бойницы
      door(g, 0, 0, 34, 60, p, true);
      g.fillStyle(p.trim, 1);
      g.fillCircle(0, -160, 18);
      g.fillStyle(lit ? 0xfff4e0 : 0x2a2c44, 1);
      g.fillCircle(0, -160, 14);
      g.lineStyle(2, IRON, 1);
      g.lineBetween(0, -160, 0, -170);
      g.lineBetween(0, -160, 7, -156);
      if (lit) v.lights.push({ x: 0, y: -160, r: 16 });
      winterWindow(b, 0, -104, 14, 26, false);
      if (!lit) {
        drift(g, 30, 90, 20, p);
        g.fillStyle(p.wood, 1);
        plank(g, 0, -30, 50, 8, -1.2);
      }
      lampPost(g, v, -76, 0, 60, p);
      return {
        l: -90,
        r: 90,
        h: 380,
        sign: { mode: 'hang', x: 46, y: -64, dir: 1, w: 44, emblem: 'bell' },
        lamp: [86, 0, 56],
        win: [[-24, -56, 12, 18], [24, -56, 12, 18]],
        garland: [
          [
            [-50, -276],
            [0, -350],
            [50, -276],
          ],
        ],
        trim: [
          [
            [-48, -270],
            [48, -270],
          ],
        ],
        flag: [0, -352, true],
        ext: { side: -1, at: -90, kind: 'chalet' },
        lv2: () => {
          // венок с лентой на двери, верёвка колокола
          g.lineStyle(5, p.leaf, 1);
          g.strokeCircle(0, -40, 9);
          g.fillStyle(0xd04a3a, 1);
          g.fillTriangle(-4, -30, 4, -30, 0, -22);
        },
      };
    }
    case 'hot-springs': {
      shadow(g, 320);
      // Купальня: низкий деревянный домик на камнях
      stoneWall(g, -170, -28, 120, 28, p, 10, p.stone, p.stoneDark);
      g.fillStyle(p.wood, 1);
      g.fillRect(-170, -96, 120, 68);
      g.lineStyle(2, p.woodDark, 1);
      for (let x = -160; x < -50; x += 14) g.lineBetween(x, -96, x, -28);
      door(g, -78, 0, 26, 52, p, true);
      winterWindow(b, -134, -64, 30, 22);
      snowRoof(g, -110, -96, 120, 50, p, 10);
      chimney(g, v, -82, -120, 26, p);
      // Пруд с камнями вокруг
      g.fillStyle(p.stoneDark, 1);
      g.fillEllipse(56, -14, 210, 52);
      g.fillStyle(lit ? 0x3aa8c0 : 0x9aaed0, 1);
      g.fillEllipse(56, -16, 176, 36);
      if (lit) {
        g.fillStyle(0x8ae8f0, 0.6);
        g.fillEllipse(36, -20, 70, 10);
        v.lights.push({ x: 56, y: -16, r: 40, c: 0x8ae8f0 });
        // пар
        for (const x of [10, 56, 100]) v.chimneys.push({ x, y: -26 });
      } else {
        g.lineStyle(2, 0xd8e4f8, 0.6);
        g.lineBetween(10, -20, 50, -12);
        g.lineBetween(70, -24, 110, -16);
      }
      g.fillStyle(p.stone, 1);
      for (const [x, y, r] of [[-38, -14, 13], [-24, -2, 10], [146, -14, 14], [132, -2, 9], [60, 6, 11], [100, 4, 9], [20, 4, 10]] as const) g.fillCircle(x, y, r);
      g.fillStyle(snowC(p), 1);
      for (const [x, y, r] of [[-38, -22, 9], [146, -22, 9], [60, 0, 7]] as const) g.fillEllipse(x, y, r * 2, r);
      lampPost(g, v, -196, 0, 60, p);
      if (!lit) drift(g, -110, 120, 20, p);
      return {
        l: -210,
        r: 164,
        h: 200,
        sign: { mode: 'hang', x: -170, y: -76, dir: -1, emblem: 'steam' },
        lamp: [184, 0, 56],
        win: [[-110, -128, 18, 14]],
        garland: [roofLine(-110, -96, 120, 50)],
        flag: [-110, -148, false],
        ext: { side: -1, at: -212, kind: 'stall' },
        lv2: () => {
          // фонарики вокруг пруда и полотенца на шесте
          for (const x of [-24, 146]) {
            g.fillStyle(IRON, 1);
            g.fillRect(x - 2, -60, 4, 46);
            hangLantern(g, v, x, -60, 2, 0xffd36b, true, true);
          }
          g.fillStyle(p.woodDark, 1);
          g.fillRect(-40, -84, 3, 70);
          g.fillStyle(0xd04a3a, 1);
          g.fillRect(-37, -82, 14, 22);
        },
      };
    }
    case 'stone-bridge': {
      // Двухарочный каменный мост над замёрзшим ручьём
      g.fillStyle(0x000000, 0.3);
      g.fillEllipse(0, 8, 340, 22);
      g.fillStyle(lit ? 0x8ab0d8 : 0x3a4868, 1);
      g.fillEllipse(0, 0, 300, 18);
      stoneWall(g, -170, -80, 340, 80, p, 11, p.stone, p.stoneDark);
      // Арки
      for (const cx of [-70, 70]) {
        g.fillStyle(lit ? 0x2a3a5a : 0x0a0c1a, 1);
        g.fillRect(cx - 50, -30, 100, 30);
        g.beginPath();
        g.arc(cx, -30, 50, Math.PI, 0, false);
        g.closePath();
        g.fillPath();
        g.fillStyle(lit ? 0x9ac8f0 : 0x3a4868, 1);
        g.fillEllipse(cx, -2, 92, 10);
        icicles(g, cx - 40, cx + 40, -78, p, cx, 12);
      }
      // Парапет и перила
      g.fillStyle(p.stoneDark, 1);
      g.fillRect(-176, -92, 352, 14);
      const posts = [-160, -100, -40, 20, 80, 140];
      for (const [i, x] of posts.entries()) {
        if (!lit && i === 3) continue;
        g.fillStyle(p.stone, 1);
        g.fillRect(x - 6, -120, 12, 30);
        g.fillStyle(snowC(p), 1);
        g.fillEllipse(x, -121, 16, 7);
      }
      g.fillStyle(p.stone, 1);
      if (lit) g.fillRect(-160, -116, 320, 6);
      else {
        g.fillRect(-160, -116, 160, 6);
        plank(g, 72, -108, 60, 6, 0.4);
      }
      snowCap(g, [[-178, -92], [178, -92]], 10, p, 11);
      lampPost(g, v, -196, 0, 74, p);
      return {
        l: -210,
        r: 210,
        h: 170,
        sign: { mode: 'stand', x: 196, y: 0, w: 44, emblem: 'arch' },
        lamp: [-236, 0, 60],
        garland: [
          [
            [-176, -122],
            [176, -122],
          ],
        ],
        trim: [
          [
            [-176, -92],
            [176, -92],
          ],
        ],
        flag: [0, -124, false],
        ext: { side: 1, at: 230, kind: 'chalet' },
        lv2: () => {
          for (const x of [-100, 20, 140]) hangLantern(g, v, x, -120, 2, 0xffd36b, true);
        },
      };
    }
    case 'star-temple': {
      shadow(g, 300);
      // Ступени
      for (let i = 0; i < 3; i++) {
        g.fillStyle(i % 2 ? p.stone : p.stoneDark, 1);
        g.fillRect(-130 + i * 14, -12 - i * 12, 260 - i * 28, 12);
        g.fillStyle(snowC(p), 0.9);
        g.fillRect(-130 + i * 14, -12 - i * 12, 26, 4);
        g.fillRect(104 - i * 14, -12 - i * 12, 26, 4);
      }
      // Стена-ниша со светом и колонны
      g.fillStyle(lit ? 0x2a2450 : 0x0d0f22, 1);
      g.fillRect(-84, -150, 168, 114);
      if (lit) {
        g.fillStyle(0xffe08a, 0.25);
        g.fillEllipse(0, -90, 120, 90);
        v.lights.push({ x: 0, y: -90, r: 40, c: 0xffe08a });
      }
      g.fillStyle(p.stone, 1);
      for (const x of [-92, -40, 40, 92]) {
        g.fillRect(x - 10, -150, 20, 114);
        g.fillStyle(p.stoneDark, 1);
        g.fillRect(x - 14, -46, 28, 10);
        g.fillRect(x - 14, -156, 28, 10);
        g.fillStyle(p.stone, 1);
      }
      if (!lit) {
        g.fillStyle(p.stoneDark, 1);
        g.fillCircle(46, -30, 10);
        g.fillCircle(30, -28, 7);
      }
      // Архитрав и купол
      g.fillStyle(p.stoneDark, 1);
      g.fillRect(-116, -172, 232, 18);
      g.fillStyle(p.roof, 1);
      g.beginPath();
      g.arc(0, -172, 78, Math.PI, 0, false);
      g.closePath();
      g.fillPath();
      g.lineStyle(2, p.roofDark, 1);
      for (const k of [-0.5, 0, 0.5]) g.lineBetween(k * 78, -172, k * 38, -238);
      snowCap(g, arcPts(0, -176, 82, 80, Math.PI * 1.08, Math.PI * 1.92, 14), 12, p, 12);
      icicles(g, -112, 112, -154, p, 12, 10);
      // Шпиль со звездой
      g.fillStyle(IRON, 1);
      g.fillRect(-3, -284, 6, 36);
      g.fillStyle(lit ? GOLD : 0x2e3048, 1);
      star(g, 0, -296, 18, 8);
      if (lit) v.lights.push({ x: 0, y: -296, r: 26, c: 0xffe08a });
      lampPost(g, v, -156, 0, 60, p);
      return {
        l: -170,
        r: 150,
        h: 320,
        sign: { mode: 'drop', x: 0, y: -154, w: 50, emblem: 'star' },
        lamp: [170, 0, 56],
        garland: [arcPts(0, -174, 82, 82, Math.PI, Math.PI * 2, 10)],
        trim: [
          [
            [-116, -172],
            [116, -172],
          ],
        ],
        flag: [96, -172, false],
        ext: { side: 1, at: 160, kind: 'chalet' },
        lv2: () => {
          // чаши с огнём на ступенях
          for (const x of [-112, 112]) {
            g.fillStyle(IRON, 1);
            fp(g, [x - 12, -40, x + 12, -40, x + 6, -28, x - 6, -28]);
            g.fillRect(x - 2, -28, 4, 16);
            g.fillStyle(0xffb85a, 1);
            g.fillTriangle(x - 8, -40, x + 8, -40, x, -58);
            v.lights.push({ x, y: -46, r: 16, c: 0xffb85a });
          }
        },
      };
    }
    case 'summit-beacon': {
      shadow(g, 260);
      // Скала-пик под снегом
      g.fillStyle(p.stoneDark, 1);
      fp(g, [-130, 0, -90, -60, -54, -92, -20, -104, 30, -100, 70, -70, 120, 0]);
      g.fillStyle(p.stone, 1);
      fp(g, [-96, 0, -70, -54, -30, -84, 20, -88, 60, -56, 86, 0]);
      snowCap(g, [[-92, -58], [-54, -92], [-20, -104], [30, -100], [70, -70]], 14, p, 13);
      fir(g, -78, -36, 0.85, p);
      fir(g, 74, -28, 0.75, p);
      // Башня маяка
      const base = -96;
      stoneWall(g, -34, base - 170, 68, 170, p, 13, lit ? 0xe0dae8 : 0x262a40, lit ? 0xb0aac0 : 0x1e2036);
      g.fillStyle(lit ? 0x3a6ad0 : 0x1a1c30, 1);
      g.fillRect(-34, base - 60, 68, 20);
      g.fillRect(-34, base - 130, 68, 20);
      door(g, 0, base, 22, 38, p, true);
      winterWindow(b, 0, base - 90, 14, 18, false);
      // Галерея, фонарная комната и купол
      g.fillStyle(p.woodDark, 1);
      g.fillRect(-46, base - 178, 92, 8);
      g.lineStyle(2, lv >= 3 ? GOLD : p.trim, 1);
      for (let x = -42; x <= 42; x += 12) g.lineBetween(x, base - 178, x, base - 194);
      g.lineBetween(-44, base - 194, 44, base - 194);
      g.fillStyle(p.window, 1);
      g.fillRect(-22, base - 218, 44, 40);
      g.lineStyle(2, IRON, 1);
      g.lineBetween(-7, base - 218, -7, base - 178);
      g.lineBetween(7, base - 218, 7, base - 178);
      if (lit) {
        v.lights.push({ x: 0, y: base - 198, r: 30 });
        v.beam = { x: 0, y: base - 198 };
      }
      g.fillStyle(p.roof, 1);
      g.beginPath();
      g.arc(0, base - 218, 28, Math.PI, 0, false);
      g.closePath();
      g.fillPath();
      snowCap(g, arcPts(0, base - 220, 30, 30, Math.PI * 1.1, Math.PI * 1.9, 8), 9, p, 14);
      g.fillStyle(p.trim, 1);
      g.fillCircle(0, base - 250, 5);
      icicles(g, -44, 44, base - 170, p, 14, 10);
      lampPost(g, v, -150, 0, 60, p);
      if (!lit) {
        drift(g, -20, 100, 24, p);
        g.fillStyle(p.wood, 1);
        plank(g, 30, base - 20, 50, 7, -0.4);
      }
      return {
        l: -164,
        r: 130,
        h: 360,
        sign: { mode: 'stand', x: 110, y: 0, w: 44, emblem: 'peak' },
        lamp: [150, 0, 56],
        garland: [
          [
            [-42, base - 186],
            [-116, -4],
          ],
          [
            [42, base - 186],
            [112, -4],
          ],
        ],
        trim: [
          [
            [-46, base - 178],
            [46, base - 178],
          ],
        ],
        flag: [0, base - 255, false],
        ext: { side: -1, at: -168, kind: 'woodshed' },
        lv2: () => {
          winterWindow(b, 0, base - 148, 12, 14, false);
          roundWindow(g, v, 0, base - 26, 7, p);
        },
      };
    }
  }
  return null;
}
