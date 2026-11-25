// Аватарки игрока: 8 вариантов фонарщика Lumo. Рисуются в коде (ui/draw.ts → createLumo).

export type LanternShape = 'square' | 'round' | 'star' | 'diamond' | 'crown';

export interface Avatar {
  id: number;
  name: string;
  hat: number;
  cloak: number;
  lantern: LanternShape;
  /** Сколько звёзд нужно, чтобы открыть (0 — доступна сразу). */
  stars: number;
}

export const AVATARS: readonly Avatar[] = [
  { id: 0, name: 'Синий', hat: 0x2a3fa8, cloak: 0x3d5bd9, lantern: 'square', stars: 0 },
  { id: 1, name: 'Лесной', hat: 0x1f7a4d, cloak: 0x34a86a, lantern: 'round', stars: 0 },
  { id: 2, name: 'Вишнёвый', hat: 0x9c2742, cloak: 0xd04a5e, lantern: 'square', stars: 0 },
  { id: 3, name: 'Сливовый', hat: 0x5b2f99, cloak: 0x8455d1, lantern: 'round', stars: 0 },
  { id: 4, name: 'Янтарный', hat: 0xb5651d, cloak: 0xe39a3b, lantern: 'star', stars: 10 },
  { id: 5, name: 'Морской', hat: 0x10707a, cloak: 0x1fa5a8, lantern: 'diamond', stars: 20 },
  { id: 6, name: 'Лунный', hat: 0x6f7aa6, cloak: 0xc9d1ee, lantern: 'star', stars: 25 },
  { id: 7, name: 'Золотой', hat: 0x2b2340, cloak: 0xd9a826, lantern: 'diamond', stars: 30 },
];

export function avatarById(id: number): Avatar {
  return AVATARS[id] ?? AVATARS[0];
}

export function isAvatarUnlocked(id: number, totalStars: number): boolean {
  return totalStars >= avatarById(id).stars;
}
