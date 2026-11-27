// Миры игры: у каждого мира — id, название, тема (цвета карты) и список уровней.
// Уровни мира — JSON-файлы в папке мира (src/levels/<мир>/NN.json), порядок — по имени файла.
// Новый уровень: положить JSON в папку мира, затем npm run ease и npm run verify.
// Новый мир: папка с уровнями + запись в WORLD_DEFS.

import { parseLevel } from '../core/level';
import type { Level, LevelData } from '../core/types';

/** Цвета карты мира. */
export interface WorldTheme {
  /** Небо сверху и снизу карты. */
  skyTop: number;
  skyBottom: number;
  /** Холмы: дальние и ближние. */
  hillFar: number;
  hillNear: number;
  /** Деревья, вода, тропинка. */
  tree: number;
  water: number;
  path: number;
}

export interface World {
  id: string;
  name: string;
  theme: WorldTheme;
  levels: Level[];
}

interface WorldDef {
  id: string;
  name: string;
  theme: WorldTheme;
  files: Record<string, LevelData>;
}

const VALLEY: WorldTheme = {
  skyTop: 0x0b0f27,
  skyBottom: 0x16214a,
  hillFar: 0x1a2a52,
  hillNear: 0x1f3a4e,
  tree: 0x1d4a3f,
  water: 0x2a5d9e,
  path: 0x8a7350,
};

/** «Туманный лес»: бирюзово-фиолетовые сумерки, туман, тёмные ели, светящиеся грибы. */
const FOREST: WorldTheme = {
  skyTop: 0x0a0a22,
  skyBottom: 0x1a1640,
  hillFar: 0x1b2246,
  hillNear: 0x142e3a,
  tree: 0x0f3333,
  water: 0x235a7a,
  path: 0x6e6280,
};

// Миры по порядку; третий («Горный город») добавится сюда же. Название мира — ключ i18n `world.<id>`
// (одинаково на карте и в деревне), поле name — запасное для логов и редактора.
const WORLD_DEFS: WorldDef[] = [
  {
    id: 'valley',
    name: 'Долина',
    theme: VALLEY,
    files: import.meta.glob<LevelData>('./valley/*.json', { eager: true, import: 'default' }),
  },
  {
    id: 'forest',
    name: 'Туманный лес',
    theme: FOREST,
    files: import.meta.glob<LevelData>('./forest/*.json', { eager: true, import: 'default' }),
  },
];

function buildWorlds(): World[] {
  let num = 0;
  return WORLD_DEFS.filter((w) => Object.keys(w.files).length > 0).map((w) => {
    const levels = Object.keys(w.files)
      .sort()
      .map((file) => parseLevel(w.files[file], ++num));
    return { id: w.id, name: w.name, theme: w.theme, levels };
  });
}

export const WORLDS: World[] = buildWorlds();

/** Все уровни всех миров по порядку. */
export const LEVELS: Level[] = WORLDS.flatMap((w) => w.levels);

export function levelById(id: string): Level | undefined {
  return LEVELS.find((l) => l.id === id);
}

export function worldOf(level: Level): World {
  return WORLDS.find((w) => w.levels.includes(level)) ?? WORLDS.find((w) => level.id.startsWith(w.id + '-')) ?? WORLDS[0];
}

/** Мир по id (или undefined). */
export function worldById(id: string): World | undefined {
  return WORLDS.find((w) => w.id === id);
}

/** Мир открыт: первый уровень мира доступен (предыдущий мир пройден или последний уровень пропущен). */
export function worldOpen(world: World, progress: { stars: Record<string, number>; skipped: Record<string, boolean>; unlocked: string[] }): boolean {
  const first = world.levels[0];
  if (!first) return false;
  const i = LEVELS.indexOf(first);
  if (i <= 0) return true;
  const prev = LEVELS[i - 1].id;
  return progress.unlocked.includes(first.id) || !!progress.stars[prev] || !!progress.skipped[prev];
}

/** Номер уровня внутри своего мира (1…). */
export function numberInWorld(level: Level): number {
  return worldOf(level).levels.indexOf(level) + 1;
}

/** «Испытание» — последний уровень каждого десятка (10, 20, 30): на карте кружок побольше. */
export function isChallenge(level: Level): boolean {
  return numberInWorld(level) % 10 === 0;
}

/** Следующий уровень по порядку (через границу миров) или null. */
export function nextLevelOf(level: Level): Level | null {
  const i = LEVELS.indexOf(level);
  return i >= 0 && i + 1 < LEVELS.length ? LEVELS[i + 1] : null;
}
