// Картинки наград и вещей для окон (деревня, награда дня, сундук, магазин): монеты, свет, способность,
// вещь гардероба (через рисунки Lumo из частей), бонус постройки.

import Phaser from 'phaser';
import type { Reward } from '../core/economy';
import { BONUS, type BonusKind } from '../core/villageData';
import { itemById } from '../core/wardrobe';
import { tk } from '../i18n';
import { drawFireflyIcon, drawIcon, type IconName } from './draw';
import { drawItemIcon } from './lumo';
import { drawCoin, drawLight } from './meta';
import { drawArchSample, drawRoadSample, type ArchStyle, type RoadStyle } from './skins';
import { C } from './theme';

/** Картинка вещи гардероба размером ~size. */
export function itemIcon(scene: Phaser.Scene, id: string, size: number): Phaser.GameObjects.Container {
  const c = scene.add.container(0, 0);
  const g = scene.add.graphics();
  c.add(g);
  const it = itemById(id);
  if (it?.slot === 'road') {
    g.fillStyle(0x1e3a2e, 1);
    g.fillRoundedRect(-size * 0.5, -size * 0.45, size, size * 0.9, size * 0.12);
    drawRoadSample(g, id.replace('road-', '') as RoadStyle, size * 0.1, 0, size * 0.8);
  } else if (it?.slot === 'arch') drawArchSample(g, id.replace('arch-', '') as ArchStyle, 0, 0, size * 0.3);
  else drawItemIcon(g, size, id);
  return c;
}

/** Значок по виду бонуса (одинаковые бонусы у разных построек — один значок). */
const KIND_ICON: Record<BonusKind, IconName | 'light' | 'coin' | 'firefly'> = {
  lightPer3Star: 'light',
  extraFreeHints: 'bulb',
  rotateCharges: 'rotate',
  coinMultPct: 'coin',
  coinsPerFirefly: 'firefly',
  brightFireflies: 'firefly',
  dailyPlus3: 'plus',
  chestTier: 'chest',
  wardrobeDiscountPct: 'wardrobe',
  preview: 'lantern',
  nightLight: 'lantern',
  questRerolls: 'scroll',
  questLight: 'light',
  streetDiscountPct: 'hammer',
  decorDiscountPct: 'brush',
  weeklyPct: 'scroll',
};

/** Значок бонуса постройки. */
export function bonusIcon(scene: Phaser.Scene, id: string, size: number): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics();
  const k = BONUS[id] ? KIND_ICON[BONUS[id].kind] : 'bulb';
  if (k === 'light') drawLight(g, 0, 0, size * 0.4);
  else if (k === 'coin') drawCoin(g, 0, 0, size * 0.4);
  else if (k === 'firefly') drawFireflyIcon(g, 0, 0, size * 0.42, true);
  else drawIcon(g, k, size * 0.8, C.icon);
  return g;
}

/** Картинка награды: монеты, способность или вещь. */
export function rewardIcon(scene: Phaser.Scene, r: Reward, size: number): Phaser.GameObjects.GameObject {
  if ('coins' in r) {
    const g = scene.add.graphics();
    drawCoin(g, 0, 0, size * 0.4);
    return g;
  }
  if ('ability' in r) {
    const g = scene.add.graphics();
    drawIcon(g, 'rotate', size * 0.8, C.icon);
    return g;
  }
  return itemIcon(scene, r.item, size);
}

/** Подпись награды (с {coin} — значком). */
export function rewardCaption(r: Reward): string {
  if ('coins' in r) return tk('reward.coins', { n: r.coins });
  if ('ability' in r) return tk('ability.rotate');
  return tk(`item.${r.item}`);
}
