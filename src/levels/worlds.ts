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

// Пока один мир; следующие (до трёх) добавятся сюда же.
const WORLD_DEFS: WorldDef[] = [
  {
    id: 'valley',
    name: 'Долина',
    theme: VALLEY,
    files: import.meta.glob<LevelData>('./valley/*.json', { eager: true, import: 'default' }),
  },
];

function buildWorlds(): World[] {
  let num = 0;
  return WORLD_DEFS.map((w) => {
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
  return WORLDS.find((w) => w.levels.includes(level)) ?? WORLDS[0];
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
