// Все уровни игры. Чтобы добавить уровень — положи JSON рядом и добавь его сюда.
import { parseLevel } from '../core/level';
import type { Level, LevelData } from '../core/types';
import l01 from './01.json';
import l02 from './02.json';
import l03 from './03.json';
import l04 from './04.json';
import l05 from './05.json';
import l06 from './06.json';
import l07 from './07.json';
import l08 from './08.json';
import l09 from './09.json';
import l10 from './10.json';

export const LEVEL_DATA = [l01, l02, l03, l04, l05, l06, l07, l08, l09, l10] as LevelData[];
export const LEVELS: Level[] = LEVEL_DATA.map(parseLevel);
