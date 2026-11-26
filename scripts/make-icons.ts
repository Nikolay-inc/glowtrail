// Исходники иконки и заставки приложения (рисунок — scripts/icon-art.ts: Lumo с фонарём на холме, ореол,
// светящаяся тропа, светлячки). SVG → PNG через sharp, дальше `capacitor-assets generate` нарежет все
// размеры для iOS и Android (npm run icons). Заодно — favicon.svg и apple-touch-icon.png для веб-версии.
//
// Адаптивная иконка Android: фон (небо, ореол, холм, тропа, светлячки) и передний слой (Lumo с фонарём,
// обрезанный по линии холма) уменьшены одинаково, чтобы Lumo с фонарём целиком попал в безопасный круг
// (66 из 108 dp) при любой маске, а края фона были продолжением той же сцены.

import { mkdirSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';
import { BG_BOTTOM, defs, doc, fireflies, halo, hero, hillAndRoad, scaled, sky, stars, vignette } from './icon-art';

const OUT = 'assets';
/** Центр Lumo с фонарём в рисунке и масштаб слоёв адаптивной иконки (самая дальняя точка — ≤ 0,3 размера от центра). */
const HERO_CX = 505;
const HERO_CY = 480;
const ADAPTIVE_K = 0.74;

const bigSky = (n: number) => sky(-900, -900, 2800, 2800, 0) + stars(37, n, -900, -900, 2800, 1700);

const icon = doc(`${sky()}${halo}${hero()}${hillAndRoad()}${fireflies}${vignette}`);
const foreground = doc(scaled(ADAPTIVE_K, hero(true), HERO_CX, HERO_CY));
const background = doc(`${scaled(ADAPTIVE_K, `${bigSky(260)}${halo}${hillAndRoad()}${fireflies}`, HERO_CX, HERO_CY)}${vignette}`);

/** Заставка 2732×2732: та же сцена мельче, по центру, название — в небе над Lumo; на телефоне видна полоса ~46% ширины. */
const SPLASH_K = 0.55;
const splash = doc(
  `${scaled(SPLASH_K, `${bigSky(520)}${halo}${hero()}${hillAndRoad()}${fireflies}`, HERO_CX, 500)}
  <text x="512" y="268" font-family="Trebuchet MS, Verdana, sans-serif" font-weight="bold" font-size="44" fill="#fff1cc" text-anchor="middle" letter-spacing="4">Glowtrail</text>`,
  2732,
);

/** favicon: без звёзд и «кисти» тропы — простые фигуры, скруглённый квадрат. */
const favicon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">
<defs>${defs}<clipPath id="round"><rect width="1024" height="1024" rx="224"/></clipPath></defs>
<g clip-path="url(#round)">
  <rect width="1024" height="1024" fill="url(#cBg)"/>
  ${halo}
  ${hero()}
  <path d="M -900 900 L 0 830 C 180 795 300 778 420 778 C 600 780 760 806 1024 866 L 1024 1024 L 0 1024 Z" fill="url(#cHill)"/>
  <path d="M 380 790 L 440 790 C 470 880 330 960 190 1024 L -20 1024 C 160 950 400 880 380 790 Z" fill="#ffe2a0"/>
</g>
</svg>`;

async function png(svg: string, file: string, flatten = false) {
  let img = sharp(Buffer.from(svg));
  if (flatten) img = img.flatten({ background: BG_BOTTOM }).removeAlpha();
  await img.png().toFile(`${OUT}/${file}`);
  console.log('✓', `${OUT}/${file}`);
}

mkdirSync(`${OUT}/src`, { recursive: true });
writeFileSync(`${OUT}/src/icon.svg`, icon);
writeFileSync(`${OUT}/src/splash.svg`, splash);
await png(icon, 'icon-only.png', true);
await png(foreground, 'icon-foreground.png');
await png(background, 'icon-background.png', true);
await png(splash, 'splash.png', true);
await png(splash, 'splash-dark.png', true);
writeFileSync('public/favicon.svg', favicon);
console.log('✓ public/favicon.svg');
await sharp(`${OUT}/icon-only.png`).resize(180, 180, { kernel: 'lanczos3' }).png().toFile('public/apple-touch-icon.png');
console.log('✓ public/apple-touch-icon.png');
