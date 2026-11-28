// Зимняя коллекция гардероба (Р2б-3): вещи, награды построек Горного города, цены по редкости, набор.
import { describe, expect, it } from 'vitest';
import ru from '../src/i18n/ru.json';
import en from '../src/i18n/en.json';
import uk from '../src/i18n/uk.json';
import { BUILDINGS } from '../src/core/villageData';
import { DEFAULT_LOOK, defaultWardrobe, fullSet, grantItem, itemBaseCost, itemById, setById, setItems, wearSet, type Look } from '../src/core/wardrobe';

const WINTER: Record<string, string> = {
  'hat-knit': 'hat',
  'hat-fur-hood': 'hat',
  'acc-knit-scarf': 'accessory',
  'acc-mittens': 'accessory',
  'staff-ice': 'staff',
  'pet-snowowl': 'pet',
  'road-ice': 'road',
  'lamp-icicle': 'lamp',
};

describe('зимняя коллекция', () => {
  it('вещи есть в своих слотах и с названиями на всех языках', () => {
    for (const [id, slot] of Object.entries(WINTER)) {
      expect(itemById(id)?.slot, id).toBe(slot);
      for (const dict of [ru, en, uk] as Record<string, string>[]) expect(dict[`item.${id}`], id).toBeTruthy();
    }
    for (const dict of [ru, en, uk] as Record<string, string>[]) expect(dict['set.set-frost']).toBeTruthy();
  });

  it('меховой капюшон и ледяной фонарь — награды построек Горного города, больше нигде не продаются', () => {
    const reward = (id: string) => BUILDINGS.find((b) => b.id === id)?.reward;
    expect(reward('goat-farm')).toEqual({ item: 'hat-fur-hood' });
    expect(reward('crystal-cave')).toEqual({ item: 'staff-ice' });
    for (const id of ['hat-fur-hood', 'staff-ice']) {
      expect(itemById(id)?.source, id).toBe('village');
      expect(BUILDINGS.find((b) => 'item' in b.reward && b.reward.item === id)?.district, id).toBe('mountain');
    }
  });

  it('остальное — в магазине по правилам редкости: обычные и половина редких за свет, эпические за монеты', () => {
    for (const id of ['hat-knit', 'acc-knit-scarf', 'acc-mittens', 'road-ice']) expect(itemBaseCost(id).currency, id).toBe('light');
    for (const id of ['lamp-icicle', 'pet-snowowl']) expect(itemBaseCost(id).currency, id).toBe('coins');
    for (const id of ['hat-knit', 'acc-knit-scarf', 'acc-mittens', 'road-ice', 'lamp-icicle', 'pet-snowowl']) expect(itemById(id)?.source, id).toBe('coins');
    expect(itemBaseCost('hat-knit').amount).toBe(Math.round(itemById('hat-knit')!.price / 8));
  });

  it('прежние вещи не поменяли валюту (новые добавлены в конец списка)', () => {
    expect(itemBaseCost('hat-beret').currency).toBe('light');
    expect(itemBaseCost('hat-tophat').currency).toBe('coins');
    expect(itemBaseCost('arch-sunset').currency).toBe('light');
    expect(itemBaseCost('arch-stone').currency).toBe('coins');
  });

  it('набор «Снежная сказка» надевается одним тапом и светится целиком', () => {
    const s = setById('set-frost')!;
    let w = defaultWardrobe();
    for (const id of setItems(s)) w = grantItem(w, id);
    const r = wearSet(w, 'set-frost');
    expect(r.missing).toEqual([]);
    expect(fullSet(r.wardrobe.look)?.id).toBe('set-frost');
    const look: Look = { ...DEFAULT_LOOK, hat: 'hat-knit' };
    expect(fullSet(look)).toBeNull();
  });
});
