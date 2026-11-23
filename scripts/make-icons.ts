// Исходники иконки и заставки приложения: Lumo с фонарём на тёмно-синем ночном фоне, в стиле игры.
// Рисуем SVG (те же фигуры, что drawLumo в src/ui/draw.ts) и переводим в PNG через sharp.
// Дальше `capacitor-assets generate` нарежет все размеры для iOS и Android (npm run icons).

import { mkdirSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';

const OUT = 'assets';
const BG_TOP = '#1d2560';
const BG_BOTTOM = '#0b0f27';
const LANTERN = '#ffd36b';
const ROAD = '#f0bd6e';

/** Lumo (аватарка «Синий»), центр в (0,0), размер s — как в drawLumo. */
function lumo(s: number): string {
  const p = (v: number) => (v * s).toFixed(1);
  const lx = 0.42;
  const ly = -0.11;
  return `
  <ellipse cx="0" cy="${p(0.42)}" rx="${p(0.35)}" ry="${p(0.08)}" fill="#000" opacity="0.3"/>
  <polygon points="${p(-0.34)},${p(0.42)} ${p(0.34)},${p(0.42)} 0,${p(-0.2)}" fill="#3d5bd9"/>
  <rect x="${p(-0.34)}" y="${p(0.08)}" width="${p(0.68)}" height="${p(0.36)}" rx="${p(0.14)}" fill="#3d5bd9"/>
  <rect x="${p(-0.3)}" y="${p(0.1)}" width="${p(0.6)}" height="${p(0.08)}" rx="${p(0.04)}" fill="#fff" opacity="0.12"/>
  <circle cx="0" cy="${p(-0.06)}" r="${p(0.2)}" fill="#ffe3c2"/>
  <polygon points="${p(-0.24)},${p(-0.1)} ${p(0.24)},${p(-0.1)} ${p(0.06)},${p(-0.52)}" fill="#2a3fa8"/>
  <circle cx="${p(0.06)}" cy="${p(-0.52)}" r="${p(0.05)}" fill="${LANTERN}"/>
  <circle cx="${p(-0.07)}" cy="${p(-0.03)}" r="${p(0.035)}" fill="#1a1a2e"/>
  <circle cx="${p(0.07)}" cy="${p(-0.03)}" r="${p(0.035)}" fill="#1a1a2e"/>
  <circle cx="${p(-0.13)}" cy="${p(0.04)}" r="${p(0.035)}" fill="#ff9e9e" opacity="0.6"/>
  <circle cx="${p(0.13)}" cy="${p(0.04)}" r="${p(0.035)}" fill="#ff9e9e" opacity="0.6"/>
  <line x1="${p(0.3)}" y1="${p(0.4)}" x2="${p(0.36)}" y2="${p(-0.06)}" stroke="#6b4a2b" stroke-width="${p(0.05)}" stroke-linecap="round"/>
  <rect x="${p(lx - 0.1)}" y="${p(ly - 0.09)}" width="${p(0.2)}" height="${p(0.18)}" rx="${p(0.05)}" fill="${LANTERN}"/>
  <circle cx="${p(lx)}" cy="${p(ly)}" r="${p(0.04)}" fill="#fff" opacity="0.9"/>`;
}

/** Свечение фонаря (под Lumo). */
function glow(cx: number, cy: number, r: number): string {
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#glow)"/>`;
}

/** Мелкие звёзды — детерминированно, чтобы картинка не менялась от запуска к запуску. */
function stars(w: number, h: number, n: number, size: number): string {
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  let out = '';
  for (let i = 0; i < n; i++) {
    const x = rnd() * w;
    const y = rnd() * h * 0.62;
    out += `<circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${(size * (0.5 + rnd())).toFixed(1)}" fill="#fff" opacity="${(0.25 + rnd() * 0.5).toFixed(2)}"/>`;
  }
  return out;
}

const defs = `
<defs>
  <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="${BG_TOP}"/>
    <stop offset="1" stop-color="${BG_BOTTOM}"/>
  </linearGradient>
  <radialGradient id="glow">
    <stop offset="0" stop-color="${LANTERN}" stop-opacity="0.9"/>
    <stop offset="0.35" stop-color="${LANTERN}" stop-opacity="0.34"/>
    <stop offset="1" stop-color="${LANTERN}" stop-opacity="0"/>
  </radialGradient>
</defs>`;

/** Светящаяся дорожка, уходящая вдаль за спиной Lumo. */
function road(w: number, h: number): string {
  return `<path d="M ${w * 0.3} ${h} Q ${w * 0.5} ${h * 0.82} ${w * 0.47} ${h * 0.74} L ${w * 0.53} ${h * 0.74} Q ${w * 0.6} ${h * 0.84} ${w * 0.7} ${h} Z" fill="${ROAD}" opacity="0.9"/>
  <path d="M ${w * 0.3} ${h} Q ${w * 0.5} ${h * 0.82} ${w * 0.47} ${h * 0.74} L ${w * 0.53} ${h * 0.74} Q ${w * 0.6} ${h * 0.84} ${w * 0.7} ${h} Z" fill="none" stroke="#fff3d6" stroke-width="${w * 0.006}" opacity="0.5"/>`;
}

/** Иконка целиком (iOS берёт её без прозрачности). */
function iconSvg(size: number): string {
  const s = size * 0.62;
  const cx = size * 0.47;
  const cy = size * 0.56;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${defs}
  <rect width="${size}" height="${size}" fill="url(#bg)"/>
  ${stars(size, size, 40, size * 0.0045)}
  ${road(size, size)}
  ${glow(cx + s * 0.42, cy - s * 0.11, size * 0.4)}
  <g transform="translate(${cx} ${cy})">${lumo(s)}</g>
</svg>`;
}

/** Передний слой адаптивной иконки Android: только Lumo со свечением, в безопасной зоне (центральные ~60%). */
function foregroundSvg(size: number): string {
  const s = size * 0.42;
  const cx = size * 0.48;
  const cy = size * 0.53;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${defs}
  ${glow(cx + s * 0.42, cy - s * 0.11, size * 0.26)}
  <g transform="translate(${cx} ${cy})">${lumo(s)}</g>
</svg>`;
}

function backgroundSvg(size: number): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${defs}
  <rect width="${size}" height="${size}" fill="url(#bg)"/>
  ${stars(size, size, 40, size * 0.0045)}
</svg>`;
}

/** Заставка: ночное небо, Lumo в центре (на любом экране обрезаются только края). */
function splashSvg(size: number): string {
  const s = size * 0.2;
  const cx = size / 2;
  const cy = size / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${defs}
  <rect width="${size}" height="${size}" fill="url(#bg)"/>
  ${stars(size, size * 1.4, 120, size * 0.0016)}
  ${glow(cx + s * 0.42, cy - s * 0.11, size * 0.14)}
  <g transform="translate(${cx} ${cy})">${lumo(s)}</g>
  <text x="${cx}" y="${cy + s * 0.85}" font-family="Trebuchet MS, Verdana, sans-serif" font-weight="bold" font-size="${size * 0.04}" fill="#fff1cc" text-anchor="middle" letter-spacing="${size * 0.004}">Glowtrail</text>
</svg>`;
}

async function png(svg: string, file: string, flatten = false) {
  let img = sharp(Buffer.from(svg));
  if (flatten) img = img.flatten({ background: BG_BOTTOM });
  await img.png().toFile(`${OUT}/${file}`);
  console.log('✓', `${OUT}/${file}`);
}

mkdirSync(`${OUT}/src`, { recursive: true });
const icon = iconSvg(1024);
const splash = splashSvg(2732);
writeFileSync(`${OUT}/src/icon.svg`, icon);
writeFileSync(`${OUT}/src/splash.svg`, splash);
await png(icon, 'icon-only.png', true);
await png(foregroundSvg(1024), 'icon-foreground.png');
await png(backgroundSvg(1024), 'icon-background.png', true);
await png(splash, 'splash.png', true);
await png(splash, 'splash-dark.png', true);
