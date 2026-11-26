// Гардероб Lumo: Lumo собирается из частей (головной убор, лицо, одежда с цветом, посох с фонарём,
// аксессуар, питомец, след), плюс стили поля — фонари, дороги, арки. Готовые образы-наборы, редкость,
// источники. Чистые данные и правила без Phaser; рисунки — src/ui/lumo.ts, тексты — i18n `item.<id>`.

export type PartSlot = 'hat' | 'face' | 'outfit' | 'staff' | 'accessory' | 'pet' | 'trail';
export type FieldSlot = 'lamp' | 'road' | 'arch';
export type Slot = PartSlot | FieldSlot;
export type Rarity = 'common' | 'rare' | 'epic' | 'special';
/** Откуда берётся вещь: монеты, постройки и уровни деревни, награда дня, задания жителей, сундуки, уют; «особые» — Р4. */
export type ItemSource = 'start' | 'coins' | 'village' | 'daily' | 'quest' | 'chest' | 'cozy' | 'special';

export const PART_SLOTS: readonly PartSlot[] = ['hat', 'face', 'outfit', 'staff', 'accessory', 'pet', 'trail'];
export const FIELD_SLOTS: readonly FieldSlot[] = ['lamp', 'road', 'arch'];

/** Цвет одежды: основной, тёмный (тени, колпак), отделка. */
export interface Palette {
  main: number;
  dark: number;
  trim: number;
}

export interface WardrobeItem {
  id: string;
  slot: Slot;
  rarity: Rarity;
  /** Цена в монетах (для source 'coins'); для остальных — «стоимость» для экономики и запасной цены. */
  price: number;
  source: ItemSource;
  /** Варианты цвета (одежда): все варианты открываются вместе с вещью. */
  palettes?: Palette[];
}

const P = (main: number, dark: number, trim: number): Palette => ({ main, dark, trim });

/** Цены по редкости — середины диапазонов (экономика глав 1–3 — src/core/economyModel.ts). */
export const RARITY_PRICE: Record<Rarity, number> = { common: 90, rare: 220, epic: 520, special: 0 };

const item = (id: string, slot: Slot, rarity: Rarity, source: ItemSource, price = source === 'start' ? 0 : RARITY_PRICE[rarity], palettes?: Palette[]): WardrobeItem => ({
  id,
  slot,
  rarity,
  price,
  source,
  ...(palettes ? { palettes } : {}),
});

/** Пустой слот: «без аксессуара», «без питомца», «без следа». */
export const NONE = { accessory: 'acc-none', pet: 'pet-none', trail: 'trail-none' } as const;

export const WARDROBE: readonly WardrobeItem[] = [
  // Головной убор (11): колпаки разных форм, шляпа с полями, капюшон, венок, корона из светлячков, ушанка, берет,
  // ведьминская шляпа, цилиндр, шлем горняка.
  item('hat-cap', 'hat', 'common', 'start'),
  item('hat-floppy', 'hat', 'common', 'coins', 80),
  item('hat-brim', 'hat', 'common', 'coins', 110),
  item('hat-hood', 'hat', 'common', 'coins', 90),
  item('hat-beret', 'hat', 'rare', 'coins', 180),
  item('hat-ushanka', 'hat', 'rare', 'daily'),
  item('hat-wreath', 'hat', 'rare', 'village'),
  item('hat-tophat', 'hat', 'rare', 'coins', 240),
  item('hat-miner', 'hat', 'epic', 'quest'),
  item('hat-witch', 'hat', 'epic', 'coins', 480),
  item('hat-firefly-crown', 'hat', 'special', 'special'),
  // Лицо (12): глаза и выражения, веснушки, румянец, очки, монокль, усы, повязка.
  item('face-round', 'face', 'common', 'start'),
  item('face-smile', 'face', 'common', 'start'),
  item('face-sly', 'face', 'common', 'coins', 70),
  item('face-surprised', 'face', 'common', 'coins', 70),
  item('face-sleepy', 'face', 'common', 'coins', 80),
  item('face-determined', 'face', 'rare', 'coins', 150),
  item('face-freckles', 'face', 'common', 'cozy'),
  item('face-blush', 'face', 'common', 'daily'),
  item('face-glasses', 'face', 'rare', 'coins', 200),
  item('face-monocle', 'face', 'epic', 'chest'),
  item('face-mustache', 'face', 'rare', 'quest'),
  item('face-eyepatch', 'face', 'epic', 'coins', 420),
  // Одежда (10), у каждой 3–4 цвета.
  item('outfit-cloak', 'outfit', 'common', 'start', 0, [P(0x3d5bd9, 0x2a3fa8, 0xffd36b), P(0x34a86a, 0x1f7a4d, 0xffe08a), P(0xd04a5e, 0x9c2742, 0xffd0a8), P(0x8455d1, 0x5b2f99, 0xe8d0ff)]),
  item('outfit-long-cloak', 'outfit', 'common', 'coins', 120, [P(0x2f4f6f, 0x1b2f45, 0xc9d1ee), P(0x6a3f2a, 0x45281a, 0xe8c07a), P(0x3e6e4a, 0x22442f, 0xc8ff7a)]),
  item('outfit-robe', 'outfit', 'rare', 'coins', 230, [P(0x5b2f99, 0x3a1d66, 0xffd36b), P(0x1f5a8a, 0x123a5c, 0xcfe6ff), P(0x8a2a3a, 0x5c1824, 0xffd0a8)]),
  item('outfit-star-robe', 'outfit', 'epic', 'village', 520, [P(0xc9d1ee, 0x6f7aa6, 0xffe08a), P(0x2a2a6a, 0x16163f, 0xffe08a), P(0x5a3a8a, 0x352258, 0xd8b8ff)]),
  item('outfit-jacket', 'outfit', 'common', 'coins', 100, [P(0xb5651d, 0x7a4212, 0xfff1cc), P(0x2b3470, 0x1a2150, 0xffb84d), P(0x3a5a3a, 0x223822, 0xe8c07a)]),
  item('outfit-sweater', 'outfit', 'common', 'daily', 90, [P(0xd8634a, 0x9a3f2e, 0xfff1cc), P(0x4a8ad8, 0x2e5a9a, 0xfff1cc), P(0xe3b23b, 0xa87a1d, 0x7a3a2a), P(0x6ac0a0, 0x3e8a70, 0xfff1cc)]),
  item('outfit-vest', 'outfit', 'rare', 'quest', 200, [P(0x6a4a8a, 0x45305a, 0xffd36b), P(0x8a5a33, 0x5a3a20, 0xfff1cc), P(0x2a6a6a, 0x184444, 0xffe08a)]),
  item('outfit-poncho', 'outfit', 'rare', 'coins', 260, [P(0xe39a3b, 0xb5651d, 0xd04a5e), P(0x1fa5a8, 0x10707a, 0xffd36b), P(0xc85a8a, 0x8a3a60, 0xfff1cc)]),
  item('outfit-apron', 'outfit', 'common', 'village', 110, [P(0xf3e8d8, 0xc9b8a0, 0xd04a5e), P(0xf3e8d8, 0xc9b8a0, 0x3d5bd9), P(0xffe0c0, 0xd8a878, 0x3e6e4a)]),
  item('outfit-sea-coat', 'outfit', 'epic', 'coins', 560, [P(0x1f3f6a, 0x112540, 0xffd36b), P(0x10707a, 0x0a4a52, 0xfff1cc), P(0xe8e8f0, 0xa8aec4, 0x1f3f6a)]),
  // Посох и фонарь в руке (8).
  item('staff-square', 'staff', 'common', 'start'),
  item('staff-round', 'staff', 'common', 'coins', 60),
  item('staff-diamond', 'staff', 'common', 'coins', 50),
  item('staff-star', 'staff', 'rare', 'coins', 190),
  item('staff-crook', 'staff', 'rare', 'chest'),
  item('staff-paper', 'staff', 'rare', 'coins', 210),
  item('staff-crystal', 'staff', 'epic', 'coins', 500),
  item('staff-moon', 'staff', 'special', 'special'),
  // Аксессуар (8 + «без»).
  item('acc-none', 'accessory', 'common', 'start'),
  item('acc-scarf', 'accessory', 'common', 'coins', 70),
  item('acc-backpack', 'accessory', 'common', 'coins', 120),
  item('acc-satchel', 'accessory', 'common', 'quest'),
  item('acc-capelet', 'accessory', 'rare', 'coins', 230),
  item('acc-badge', 'accessory', 'common', 'cozy'),
  item('acc-keys', 'accessory', 'rare', 'village'),
  item('acc-bowtie', 'accessory', 'rare', 'coins', 160),
  item('acc-wings', 'accessory', 'epic', 'chest'),
  // Питомец-спутник (6 + «без»): следует за Lumo по полю и деревне.
  item('pet-none', 'pet', 'common', 'start'),
  item('pet-firefly', 'pet', 'common', 'village'),
  item('pet-owlet', 'pet', 'rare', 'coins', 320),
  item('pet-kitten', 'pet', 'rare', 'coins', 340),
  item('pet-fox', 'pet', 'epic', 'coins', 620),
  item('pet-moth', 'pet', 'rare', 'quest'),
  item('pet-mushroom', 'pet', 'epic', 'cozy'),
  // След при ходьбе (6 + «без»).
  item('trail-none', 'trail', 'common', 'start'),
  item('trail-sparks', 'trail', 'common', 'coins', 80),
  item('trail-petals', 'trail', 'common', 'coins', 100),
  item('trail-stars', 'trail', 'rare', 'coins', 220),
  item('trail-snow', 'trail', 'rare', 'daily'),
  item('trail-leaves', 'trail', 'common', 'quest'),
  item('trail-fireflies', 'trail', 'epic', 'chest'),
  // Фонари на поле (8).
  item('lamp-classic', 'lamp', 'common', 'start'),
  item('lamp-paper', 'lamp', 'common', 'coins', 90),
  item('lamp-candle', 'lamp', 'common', 'coins', 80),
  item('lamp-flower', 'lamp', 'rare', 'coins', 200),
  item('lamp-crystal', 'lamp', 'rare', 'quest'),
  item('lamp-star', 'lamp', 'rare', 'village'),
  item('lamp-moon', 'lamp', 'epic', 'coins', 460),
  item('lamp-gold', 'lamp', 'special', 'special'),
  // Дороги (10).
  item('road-glow', 'road', 'common', 'start'),
  item('road-moon', 'road', 'common', 'coins', 70),
  item('road-stones', 'road', 'common', 'coins', 70),
  item('road-planks', 'road', 'common', 'village'),
  item('road-firefly', 'road', 'rare', 'coins', 150),
  item('road-sunset', 'road', 'rare', 'coins', 170),
  item('road-ember', 'road', 'rare', 'chest'),
  item('road-mint', 'road', 'rare', 'quest'),
  item('road-aurora', 'road', 'epic', 'coins', 420),
  item('road-stars', 'road', 'special', 'special'),
  // Арки (8).
  item('arch-portal', 'arch', 'common', 'start'),
  item('arch-moon', 'arch', 'common', 'coins', 80),
  item('arch-flowers', 'arch', 'rare', 'village'),
  item('arch-sunset', 'arch', 'rare', 'coins', 160),
  item('arch-stone', 'arch', 'rare', 'coins', 190),
  item('arch-leaves', 'arch', 'rare', 'quest'),
  item('arch-crystal', 'arch', 'epic', 'coins', 480),
  item('arch-gold', 'arch', 'special', 'special'),
];

export const itemById = (id: string) => WARDROBE.find((w) => w.id === id);
export const itemsOf = (slot: Slot) => WARDROBE.filter((w) => w.slot === slot);

/** Образ Lumo и стили поля: id предмета в каждом слоте, цвет одежды — индекс палитры. */
export interface Look {
  hat: string;
  face: string;
  outfit: string;
  color: number;
  staff: string;
  accessory: string;
  pet: string;
  trail: string;
  lamp: string;
  road: string;
  arch: string;
}

export const DEFAULT_LOOK: Look = {
  hat: 'hat-cap',
  face: 'face-round',
  outfit: 'outfit-cloak',
  color: 0,
  staff: 'staff-square',
  accessory: NONE.accessory,
  pet: NONE.pet,
  trail: NONE.trail,
  lamp: 'lamp-classic',
  road: 'road-glow',
  arch: 'arch-portal',
};

/** Палитра одежды образа (индекс за пределами — первая). */
export function paletteOf(look: Pick<Look, 'outfit' | 'color'>): Palette {
  const p = itemById(look.outfit)?.palettes ?? itemById('outfit-cloak')!.palettes!;
  return p[look.color] ?? p[0];
}

// ---------------------------------------------------------------------------
// Готовые образы-наборы: надеть одним тапом; полный набор — только косметика (свечение и особый след).

export interface OutfitSet {
  id: string;
  parts: Partial<Look>;
  /** Цвет свечения полного набора. */
  aura: number;
}

export const SETS: readonly OutfitSet[] = [
  { id: 'set-forest', parts: { hat: 'hat-hood', face: 'face-smile', outfit: 'outfit-long-cloak', color: 2, staff: 'staff-crook', accessory: 'acc-satchel', pet: 'pet-fox', trail: 'trail-leaves' }, aura: 0x9dff5c },
  { id: 'set-stargazer', parts: { hat: 'hat-witch', face: 'face-glasses', outfit: 'outfit-star-robe', color: 1, staff: 'staff-star', accessory: 'acc-capelet', pet: 'pet-owlet', trail: 'trail-stars' }, aura: 0xd8b8ff },
  { id: 'set-baker', parts: { hat: 'hat-floppy', face: 'face-blush', outfit: 'outfit-apron', color: 0, staff: 'staff-round', accessory: 'acc-scarf', pet: 'pet-kitten', trail: 'trail-sparks' }, aura: 0xffd0a8 },
  { id: 'set-sea', parts: { hat: 'hat-brim', face: 'face-mustache', outfit: 'outfit-sea-coat', color: 0, staff: 'staff-paper', accessory: 'acc-badge', pet: 'pet-moth', trail: 'trail-snow' }, aura: 0x9cc8ff },
  { id: 'set-miner', parts: { hat: 'hat-miner', face: 'face-determined', outfit: 'outfit-jacket', color: 0, staff: 'staff-crystal', accessory: 'acc-keys', pet: 'pet-mushroom', trail: 'trail-sparks' }, aura: 0xffb84d },
  { id: 'set-winter', parts: { hat: 'hat-ushanka', face: 'face-freckles', outfit: 'outfit-sweater', color: 1, staff: 'staff-square', accessory: 'acc-scarf', pet: 'pet-owlet', trail: 'trail-snow' }, aura: 0xcfe6ff },
  { id: 'set-gardener', parts: { hat: 'hat-wreath', face: 'face-smile', outfit: 'outfit-vest', color: 2, staff: 'staff-round', accessory: 'acc-backpack', pet: 'pet-firefly', trail: 'trail-petals' }, aura: 0xffb3cf },
  { id: 'set-gentleman', parts: { hat: 'hat-tophat', face: 'face-monocle', outfit: 'outfit-robe', color: 2, staff: 'staff-diamond', accessory: 'acc-bowtie', pet: 'pet-kitten', trail: 'trail-stars' }, aura: 0xffe08a },
  { id: 'set-dreamer', parts: { hat: 'hat-beret', face: 'face-sleepy', outfit: 'outfit-poncho', color: 2, staff: 'staff-paper', accessory: 'acc-wings', pet: 'pet-moth', trail: 'trail-fireflies' }, aura: 0xc8ff7a },
  { id: 'set-royal', parts: { hat: 'hat-firefly-crown', face: 'face-determined', outfit: 'outfit-star-robe', color: 0, staff: 'staff-moon', accessory: 'acc-capelet', pet: 'pet-firefly', trail: 'trail-fireflies' }, aura: 0xfff1cc },
];

export const setById = (id: string) => SETS.find((s) => s.id === id);

/** Вещи набора (без цвета). */
export function setItems(s: OutfitSet): string[] {
  return PART_SLOTS.map((k) => s.parts[k] as string | undefined).filter((x): x is string => !!x && !x.endsWith('-none'));
}

/** Какой набор надет целиком (все его вещи, цвет не важен) — для свечения и особого следа. */
export function fullSet(look: Look): OutfitSet | null {
  return SETS.find((s) => setItems(s).every((id) => (Object.values(look) as unknown[]).includes(id))) ?? null;
}

// ---------------------------------------------------------------------------
// Состояние гардероба в сохранении

export const MAX_SAVED_LOOKS = 3;

export interface WardrobeState {
  owned: string[];
  look: Look;
  /** Сохранённые образы (до 3). */
  saved: (Look | null)[];
}

export const startItems = () => WARDROBE.filter((w) => w.source === 'start').map((w) => w.id);

export function defaultWardrobe(): WardrobeState {
  return { owned: startItems(), look: { ...DEFAULT_LOOK }, saved: [null, null, null] };
}

export const owns = (w: WardrobeState, id: string) => w.owned.includes(id);

/** Надеть вещь (только свою). color — для одежды. */
export function wear(w: WardrobeState, id: string, color?: number): WardrobeState {
  const it = itemById(id);
  if (!it || !owns(w, id)) return w;
  const look = { ...w.look, [it.slot]: id } as Look;
  if (it.slot === 'outfit') look.color = Math.min(Math.max(0, color ?? (w.look.outfit === id ? w.look.color : 0)), (it.palettes?.length ?? 1) - 1);
  return { ...w, look };
}

/** Надеть набор: надеваются только вещи, которые есть у игрока. Возвращает и сколько вещей не хватает. */
export function wearSet(w: WardrobeState, setId: string): { wardrobe: WardrobeState; missing: string[] } {
  const s = setById(setId);
  if (!s) return { wardrobe: w, missing: [] };
  let out = w;
  const missing: string[] = [];
  for (const k of PART_SLOTS) {
    const id = s.parts[k] as string | undefined;
    if (!id) continue;
    if (owns(out, id)) out = wear(out, id, k === 'outfit' ? s.parts.color : undefined);
    else missing.push(id);
  }
  return { wardrobe: out, missing };
}

export function saveLook(w: WardrobeState, slot: number): WardrobeState {
  if (slot < 0 || slot >= MAX_SAVED_LOOKS) return w;
  const saved = [...w.saved];
  saved[slot] = { ...w.look };
  return { ...w, saved };
}

/** Надеть сохранённый образ: вещи, которых уже нет (не бывает) или неизвестные, остаются как были. */
export function loadLook(w: WardrobeState, slot: number): WardrobeState {
  const l = w.saved[slot];
  if (!l) return w;
  let out = w;
  for (const k of [...PART_SLOTS, ...FIELD_SLOTS]) out = wear(out, l[k], k === 'outfit' ? l.color : undefined);
  return out;
}

export function grantItem(w: WardrobeState, id: string): WardrobeState {
  if (!itemById(id) || owns(w, id)) return w;
  return { ...w, owned: [...w.owned, id] };
}

// ---------------------------------------------------------------------------
// Нормализация, слияние и перенос старых скинов (v5: костюмы 0–7, формы фонаря, дорога, арка)

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

export function normalizeLook(raw: unknown, owned: string[]): Look {
  const look = { ...DEFAULT_LOOK };
  if (!isObj(raw)) return look;
  for (const k of [...PART_SLOTS, ...FIELD_SLOTS]) {
    const id = raw[k];
    if (typeof id === 'string' && owned.includes(id) && itemById(id)?.slot === k) (look as Record<string, unknown>)[k] = id;
  }
  const pals = itemById(look.outfit)?.palettes?.length ?? 1;
  const c = raw.color;
  look.color = typeof c === 'number' && Number.isInteger(c) && c >= 0 && c < pals ? c : 0;
  return look;
}

export function normalizeWardrobe(raw: unknown): WardrobeState {
  const w = defaultWardrobe();
  if (!isObj(raw)) return w;
  const owned = Array.isArray(raw.owned) ? raw.owned.filter((x): x is string => typeof x === 'string' && !!itemById(x)) : [];
  w.owned = [...new Set([...w.owned, ...owned])];
  w.look = normalizeLook(raw.look, w.owned);
  if (Array.isArray(raw.saved)) w.saved = [0, 1, 2].map((i) => (isObj(raw.saved && (raw.saved as unknown[])[i]) ? normalizeLook((raw.saved as unknown[])[i], w.owned) : null));
  return w;
}

/** Слияние двух устройств: вещи — объединение, надетый образ и сохранённые — с этого устройства (или облачные, где пусто). */
export function mergeWardrobe(local: WardrobeState, cloud: WardrobeState | null): WardrobeState {
  if (!cloud) return local;
  return {
    owned: [...new Set([...local.owned, ...cloud.owned])],
    look: local.look,
    saved: local.saved.map((s, i) => s ?? cloud.saved[i] ?? null),
  };
}

/** Старые костюмы (v5) → вещи гардероба. 0–3 — цвета обычного плаща, остальные — свои вещи. */
const COSTUME_MAP: Record<string, { items: string[]; look: Partial<Look> }> = {
  'costume-0': { items: [], look: { outfit: 'outfit-cloak', color: 0 } },
  'costume-1': { items: [], look: { outfit: 'outfit-cloak', color: 1 } },
  'costume-2': { items: [], look: { outfit: 'outfit-cloak', color: 2 } },
  'costume-3': { items: [], look: { outfit: 'outfit-cloak', color: 3 } },
  'costume-4': { items: ['outfit-poncho'], look: { outfit: 'outfit-poncho', color: 0, staff: 'staff-star' } },
  'costume-5': { items: ['outfit-sea-coat'], look: { outfit: 'outfit-sea-coat', color: 1, staff: 'staff-diamond' } },
  'costume-6': { items: ['outfit-star-robe'], look: { outfit: 'outfit-star-robe', color: 0, staff: 'staff-star' } },
  'costume-7': { items: [], look: {} },
};
const OLD_IDS: Record<string, string> = {
  'lantern-default': 'staff-square',
  'lantern-round': 'staff-round',
  'lantern-diamond': 'staff-diamond',
  'lantern-star': 'staff-star',
  'lantern-crown': 'staff-moon',
};

/** Перенос старых скинов: купленное остаётся у игрока (костюм 4 «Янтарный» → пончо и т. д.), надетое — надетым. */
export function wardrobeFromSkins(owned: string[], equipped: Record<string, string>): WardrobeState {
  let w = defaultWardrobe();
  for (const id of owned) {
    const c = COSTUME_MAP[id];
    if (c) for (const it of c.items) w = grantItem(w, it);
    else w = grantItem(w, OLD_IDS[id] ?? id);
  }
  const look = { ...w.look };
  const cm = COSTUME_MAP[equipped.costume ?? ''];
  if (cm) Object.assign(look, cm.look);
  const staff = OLD_IDS[equipped.lantern ?? ''];
  if (staff && staff !== 'staff-square') look.staff = staff;
  if (equipped.road) look.road = equipped.road;
  if (equipped.arch) look.arch = equipped.arch;
  w.look = normalizeLook(look, w.owned);
  return w;
}

/** Номер для старого поля profile.avatar (облако старой версии, совместимость): цвет обычного плаща или 0. */
export const avatarIndex = (look: Look) => (look.outfit === 'outfit-cloak' ? look.color : 0);
