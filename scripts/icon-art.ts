// Рисунок иконки приложения (выбран вариант C из трёх): силуэт Lumo с фонарём на посохе стоит на холме,
// за ним большой тёплый ореол, к ногам поднимается светящаяся тропа, вокруг светлячки, сумеречное небо.
// Всё — SVG-строки в координатах 1024×1024; make-icons.ts собирает из них иконку, слои адаптивной иконки
// Android, заставку и favicon.

export const S = 1024;
export const BG_BOTTOM = '#100c38';
const LANTERN = '#ffd36b';
const FIREFLY = '#c8ff7a';

const f = (v: number) => v.toFixed(1);

function rng(seed: number) {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

export const defs = `
  <filter id="blur14" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="14"/></filter>
  <filter id="blur30" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="30"/></filter>
  <radialGradient id="ffGlow">
    <stop offset="0" stop-color="${FIREFLY}" stop-opacity="0.85"/>
    <stop offset="0.25" stop-color="${FIREFLY}" stop-opacity="0.35"/>
    <stop offset="1" stop-color="${FIREFLY}" stop-opacity="0"/>
  </radialGradient>
  <radialGradient id="warmGlow">
    <stop offset="0" stop-color="#fff4cf" stop-opacity="1"/>
    <stop offset="0.12" stop-color="#ffe08a" stop-opacity="0.85"/>
    <stop offset="0.35" stop-color="#ffb648" stop-opacity="0.35"/>
    <stop offset="0.65" stop-color="#ff9a3a" stop-opacity="0.1"/>
    <stop offset="1" stop-color="#ff9a3a" stop-opacity="0"/>
  </radialGradient>
  <radialGradient id="vignette" cx="0.5" cy="0.45" r="0.75">
    <stop offset="0.55" stop-color="#05040f" stop-opacity="0"/>
    <stop offset="1" stop-color="#05040f" stop-opacity="0.55"/>
  </radialGradient>
  <linearGradient id="cBg" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="307" y2="1024">
    <stop offset="0" stop-color="#43309c"/>
    <stop offset="0.5" stop-color="#261e7c"/>
    <stop offset="1" stop-color="${BG_BOTTOM}"/>
  </linearGradient>
  <linearGradient id="cHill" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#17123f"/>
    <stop offset="1" stop-color="#07061a"/>
  </linearGradient>
  <linearGradient id="cRoad" gradientUnits="userSpaceOnUse" x1="0" y1="1024" x2="200" y2="780">
    <stop offset="0" stop-color="#ffc56a"/>
    <stop offset="1" stop-color="#fff0c4"/>
  </linearGradient>
  <g id="cLumo">
    <path d="M 240 800 C 262 700 312 610 352 566 L 448 566 C 488 610 538 700 560 800 Z"/>
    <path d="M 420 574 C 480 566 546 580 622 590 L 624 632 C 552 630 482 632 424 648 Z"/>
    <circle cx="630" cy="610" r="25"/>
    <circle cx="400" cy="478" r="102"/>
    <ellipse cx="400" cy="398" rx="152" ry="36"/>
    <path d="M 258 402 C 318 330 380 232 470 176 C 512 150 562 158 578 192 C 546 190 516 206 511 246 C 506 302 520 360 542 402 Z"/>
  </g>`;

function firefly(x: number, y: number, r: number): string {
  return `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r * 5)}" fill="url(#ffGlow)"/>
  <circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" fill="${FIREFLY}"/>
  <circle cx="${f(x - r * 0.25)}" cy="${f(y - r * 0.25)}" r="${f(r * 0.45)}" fill="#f6ffe4"/>`;
}

export function stars(seed: number, n: number, x0: number, y0: number, w: number, h: number, size = 2.4): string {
  const rnd = rng(seed);
  let out = '';
  for (let i = 0; i < n; i++) {
    const x = x0 + rnd() * w;
    const y = y0 + rnd() * h;
    out += `<circle cx="${f(x)}" cy="${f(y)}" r="${f(size * (0.5 + rnd()))}" fill="#fff" opacity="${(0.25 + rnd() * 0.5).toFixed(2)}"/>`;
  }
  return out;
}

/** Свечение: широкое пятно + плотное размытое ядро. */
function glow(cx: number, cy: number, r: number, opacity = 1): string {
  return `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}" fill="url(#warmGlow)" opacity="${opacity}"/>
  <circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r * 0.28)}" fill="#ffd27a" opacity="${(0.35 * opacity).toFixed(2)}" filter="url(#blur30)"/>`;
}

/** Фонарь спереди: ручка, крыша, стекло с огнём, рамка, донце. cx, cy — центр стекла, h — его высота. */
function lantern(cx: number, cy: number, h: number, id: string): string {
  const w = h * 0.78;
  const top = cy - h / 2;
  const bot = cy + h / 2;
  const roofH = h * 0.32;
  const frame = '#4a2f1c';
  const brass = '#d9a04a';
  const glass = `M ${f(cx - w * 0.5)} ${f(top + h * 0.02)} L ${f(cx + w * 0.5)} ${f(top + h * 0.02)} L ${f(cx + w * 0.42)} ${f(bot)} L ${f(cx - w * 0.42)} ${f(bot)} Z`;
  const handle = `M ${f(cx - w * 0.22)} ${f(top - roofH * 0.7)} A ${f(w * 0.22)} ${f(w * 0.24)} 0 1 1 ${f(cx + w * 0.22)} ${f(top - roofH * 0.7)}`;
  return `
  <defs>
    <linearGradient id="${id}Brass" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#7a4f26"/><stop offset="0.45" stop-color="${brass}"/><stop offset="0.7" stop-color="#f3c977"/><stop offset="1" stop-color="#8a5a2b"/>
    </linearGradient>
    <radialGradient id="${id}Glass" cx="0.5" cy="0.55" r="0.65">
      <stop offset="0" stop-color="#ffffff"/><stop offset="0.22" stop-color="#fff3c4"/><stop offset="0.55" stop-color="#ffd36b"/><stop offset="1" stop-color="#ff9e3d"/>
    </radialGradient>
    <radialGradient id="${id}Flame" cx="0.5" cy="0.7" r="0.6">
      <stop offset="0" stop-color="#ffffff"/><stop offset="0.6" stop-color="#fffbe6"/><stop offset="1" stop-color="#ffe9a3"/>
    </radialGradient>
  </defs>
  <path d="${handle}" fill="none" stroke="${frame}" stroke-width="${f(h * 0.055)}" stroke-linecap="round"/>
  <path d="${handle}" fill="none" stroke="${brass}" stroke-width="${f(h * 0.02)}" stroke-linecap="round" opacity="0.8"/>
  <path d="M ${f(cx - w * 0.62)} ${f(top + h * 0.02)} Q ${f(cx - w * 0.5)} ${f(top - roofH * 0.35)} ${f(cx - w * 0.18)} ${f(top - roofH * 0.82)}
           L ${f(cx + w * 0.18)} ${f(top - roofH * 0.82)} Q ${f(cx + w * 0.5)} ${f(top - roofH * 0.35)} ${f(cx + w * 0.62)} ${f(top + h * 0.02)} Z"
    fill="url(#${id}Brass)" stroke="${frame}" stroke-width="${f(h * 0.03)}" stroke-linejoin="round"/>
  <rect x="${f(cx - w * 0.24)}" y="${f(top - roofH * 0.98)}" width="${f(w * 0.48)}" height="${f(roofH * 0.2)}" rx="${f(roofH * 0.08)}"
    fill="url(#${id}Brass)" stroke="${frame}" stroke-width="${f(h * 0.025)}"/>
  <path d="${glass}" fill="url(#${id}Glass)"/>
  <path d="M ${f(cx)} ${f(cy - h * 0.3)} C ${f(cx + w * 0.2)} ${f(cy - h * 0.05)} ${f(cx + w * 0.22)} ${f(cy + h * 0.2)} ${f(cx)} ${f(cy + h * 0.24)}
           C ${f(cx - w * 0.22)} ${f(cy + h * 0.2)} ${f(cx - w * 0.2)} ${f(cy - h * 0.05)} ${f(cx)} ${f(cy - h * 0.3)} Z" fill="url(#${id}Flame)"/>
  <path d="${glass}" fill="none" stroke="${frame}" stroke-width="${f(h * 0.05)}" stroke-linejoin="round"/>
  <line x1="${f(cx - w * 0.2)}" y1="${f(top + h * 0.03)}" x2="${f(cx - w * 0.17)}" y2="${f(bot)}" stroke="${frame}" stroke-width="${f(h * 0.028)}" opacity="0.85"/>
  <line x1="${f(cx + w * 0.2)}" y1="${f(top + h * 0.03)}" x2="${f(cx + w * 0.17)}" y2="${f(bot)}" stroke="${frame}" stroke-width="${f(h * 0.028)}" opacity="0.85"/>
  <path d="M ${f(cx - w * 0.54)} ${f(bot - h * 0.01)} L ${f(cx + w * 0.54)} ${f(bot - h * 0.01)} L ${f(cx + w * 0.44)} ${f(bot + h * 0.13)} L ${f(cx - w * 0.44)} ${f(bot + h * 0.13)} Z"
    fill="url(#${id}Brass)" stroke="${frame}" stroke-width="${f(h * 0.03)}" stroke-linejoin="round"/>
  <path d="M ${f(cx - w * 0.4)} ${f(top + h * 0.1)} L ${f(cx - w * 0.3)} ${f(top + h * 0.1)} L ${f(cx - w * 0.27)} ${f(bot - h * 0.12)} L ${f(cx - w * 0.33)} ${f(bot - h * 0.12)} Z" fill="#fff" opacity="0.35"/>`;
}

// Тропа «кистью»: вдоль кривой Безье часто ставим сплющенные эллипсы, ширина растёт к зрителю.
type Pt = [number, number];
type Bez = [Pt, Pt, Pt, Pt];

function bez(b: Bez, t: number): Pt {
  const u = 1 - t;
  const k = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t];
  return [k.reduce((s, v, i) => s + v * b[i][0], 0), k.reduce((s, v, i) => s + v * b[i][1], 0)];
}

function brush(b: Bez, width: (y: number) => number, fill: string, scale = 1, attrs = ''): string {
  let len = 0;
  let prev = bez(b, 0);
  for (let k = 1; k <= 20; k++) {
    const p = bez(b, k / 20);
    len += Math.hypot(p[0] - prev[0], p[1] - prev[1]);
    prev = p;
  }
  const n = Math.ceil(len / 2.5);
  let out = '';
  for (let k = 0; k <= n; k++) {
    const [x, y] = bez(b, k / n);
    const w = width(y) * scale * 0.5;
    const flat = 0.3 + 0.3 * Math.min(1, Math.max(0, (y - 620) / 400));
    out += `<ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(w)}" ry="${f(Math.max(w * flat, 1))}"/>`;
  }
  return `<g fill="${fill}" ${attrs}>${out}</g>`;
}

// ---------------------------------------------------------------------------
// Слои сцены (координаты исходного рисунка 1024×1024)

const LX = 684; // фонарь на посохе
const LY = 350;
const LH = 172;
/** Линия холма; продлена далеко за края, чтобы при уменьшении сцены не было видно обрезов. */
const HILL = 'M -900 900 L 0 830 C 180 795 300 778 420 778 C 600 780 760 806 1024 866 L 1900 1010';
const ROAD: Bez = [[40, 1140], [260, 980], [470, 920], [410, 790]];
const ROAD_NEAR: Bez = [[-260, 1460], [-120, 1330], [-30, 1220], [40, 1140]];
const roadWidth = (y: number) => 40 + 300 * Math.pow(Math.max(0, y - 785) / 239, 1.1);

/** Небо: градиент и звёзды (на любую область). */
export function sky(x = 0, y = 0, w = S, h = S, starCount = 40): string {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="url(#cBg)"/>
  ${stars(37, starCount, x, y, w, h * 0.6)}`;
}

/** Большой ореол за Lumo. */
export const halo = `${glow(560, 400, 760, 1)}<circle cx="560" cy="400" r="330" fill="#ffe7ad" opacity="0.07"/>`;

/** Холм и светящаяся тропа к ногам Lumo. */
export function hillAndRoad(): string {
  const road = (b: Bez) => `${brush(b, roadWidth, '#ffb648', 1.15, 'opacity="0.6" filter="url(#blur14)"')}
  ${brush(b, roadWidth, 'url(#cRoad)')}
  ${brush(b, roadWidth, '#fffdf2', 0.07, 'opacity="0.8"')}`;
  return `<path d="${HILL} L 1900 2000 L -900 2000 Z" fill="url(#cHill)"/>
  <path d="${HILL}" fill="none" stroke="#ffcf7a" stroke-width="4" opacity="0.4"/>
  ${road(ROAD_NEAR)}
  ${road(ROAD)}`;
}

/** Lumo с посохом и фонарём. clipped — обрезать по линии холма (когда холм лежит в другом слое). */
export function hero(clipped = false): string {
  const clip = clipped
    ? `<defs><clipPath id="aboveHill"><path d="${HILL} L 1900 -900 L -900 -900 Z"/></clipPath></defs>`
    : '';
  return `${clip}<g ${clipped ? 'clip-path="url(#aboveHill)"' : ''}>
  <path d="M 572 800 L ${LX - 2} ${LY + LH / 2 + 22}" stroke="#ffd27a" stroke-width="30" stroke-linecap="round" transform="translate(5 -4)"/>
  <path d="M 572 800 L ${LX - 2} ${LY + LH / 2 + 22}" stroke="#0f0b2e" stroke-width="24" stroke-linecap="round"/>
  <use href="#cLumo" fill="#7b6fe6" opacity="0.7" transform="translate(-6 -2)"/>
  <use href="#cLumo" fill="#ffd98a" transform="translate(9 -7)"/>
  <use href="#cLumo" fill="#0f0b2e"/>
  </g>
  <circle cx="582" cy="192" r="46" fill="url(#warmGlow)"/>
  <circle cx="582" cy="192" r="22" fill="${LANTERN}"/>
  <circle cx="576" cy="186" r="8" fill="#fff6d8"/>
  ${glow(LX, LY, 260, 0.9)}
  ${lantern(LX, LY, LH, 'cL')}`;
}

export const fireflies = [
  firefly(150, 300, 10),
  firefly(240, 590, 7),
  firefly(880, 600, 9),
  firefly(850, 150, 6),
  firefly(720, 690, 7),
  firefly(110, 700, 6),
].join('');

export const vignette = `<rect width="${S}" height="${S}" fill="url(#vignette)"/>`;

/** Документ SVG size×size; тело рисуется в координатах 1024×1024 (если size другой — масштабируется). */
export function doc(body: string, size = S, extraDefs = ''): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${size}" height="${size}" viewBox="0 0 ${S} ${S}">
<defs>${defs}${extraDefs}</defs>
${body}
</svg>`;
}

/** Сцена, уменьшенная в k раз вокруг точки (cx, cy) и поставленная в центр холста. */
export const scaled = (k: number, inner: string, cx = 512, cy = 512) => `<g transform="translate(512 512) scale(${k}) translate(${-cx} ${-cy})">${inner}</g>`;
