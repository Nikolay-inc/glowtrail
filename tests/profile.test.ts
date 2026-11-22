import { beforeEach, describe, expect, it } from 'vitest';
import { AVATARS, isAvatarUnlocked } from '../src/core/avatars';
import { LEGACY_KEYS, memoryBackend, SAVE_KEY, SAVE_VERSION, SaveService } from '../src/save/SaveService';
import {
  countHint,
  DEFAULT_NAME,
  displayName,
  getProfile,
  levelsPassed,
  recordPlayDay,
  sanitizeName,
  setAvatar,
  setName,
  shouldAskName,
  skipName,
  totalStars,
} from '../src/profile';
import { trayLayout } from '../src/ui/layout';
import { W } from '../src/ui/theme';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('сохранение v3: профиль', () => {
  beforeEach(() => SaveService.setBackend(memoryBackend()));

  it('новый игрок получает постоянный playerId (UUID) и профиль по умолчанию', () => {
    const backend = memoryBackend();
    SaveService.setBackend(backend);
    const p = getProfile();
    expect(SAVE_VERSION).toBe(3);
    expect(p.playerId).toMatch(UUID);
    expect(p).toMatchObject({ name: null, avatar: 0, nameAsked: false, hintsUsed: 0, dayStreak: 0 });
    // Сразу сохранён: после перезагрузки тот же playerId.
    SaveService.setBackend(backend);
    expect(getProfile().playerId).toBe(p.playerId);
  });

  it('миграция v2 → v3: прогресс сохраняется, появляется профиль, подсказки считаются по логу', () => {
    const backend = memoryBackend({
      [SAVE_KEY]: JSON.stringify({
        version: 2,
        progress: { unlocked: 4, stars: { 1: 3, 2: 2, 3: 1 }, attempts: {}, lossStreak: {}, skipped: {}, muted: false },
        log: [{ t: 'a', ev: 'hint_used', level: 2 }, { t: 'b', ev: 'hint_used', level: 3 }, { t: 'c', ev: 'win', level: 3 }],
      }),
    });
    SaveService.setBackend(backend);
    const d = SaveService.load();
    expect(d.version).toBe(3);
    expect(d.progress.stars).toEqual({ 1: 3, 2: 2, 3: 1 });
    expect(d.profile.playerId).toMatch(UUID);
    expect(d.profile.hintsUsed).toBe(2);
    expect(d.log).toHaveLength(3);
    // Сразу пересохранено в v3 — playerId не будет меняться при каждой загрузке.
    expect(JSON.parse(backend.dump()[SAVE_KEY]).profile.playerId).toBe(d.profile.playerId);
  });

  it('миграция v1 → v3 цепочкой', () => {
    SaveService.setBackend(
      memoryBackend({
        [LEGACY_KEYS.progress]: JSON.stringify({ unlocked: 3, stars: { 1: 2 }, hints: 5 }),
        [LEGACY_KEYS.log]: JSON.stringify([{ t: 'x', ev: 'hint_used' }]),
      }),
    );
    const d = SaveService.load();
    expect(d.version).toBe(3);
    expect(d.progress.unlocked).toBe(3);
    expect(d.profile.hintsUsed).toBe(1);
  });

  it('профиль v3 читается как есть, мусор в полях отбрасывается', () => {
    SaveService.setBackend(
      memoryBackend({
        [SAVE_KEY]: JSON.stringify({
          version: 3,
          profile: { playerId: '11111111-2222-4333-8444-555555555555', name: 'Аня', avatar: 99, hintsUsed: -4, dayStreak: 3, nameAsked: true },
          progress: {},
          log: [],
        }),
      }),
    );
    expect(getProfile()).toMatchObject({ playerId: '11111111-2222-4333-8444-555555555555', name: 'Аня', avatar: 0, hintsUsed: 0, dayStreak: 3, nameAsked: true });
  });
});

describe('имя и знакомство', () => {
  beforeEach(() => SaveService.setBackend(memoryBackend()));

  it('имя чистится и обрезается до 16 символов, пустое — «Путник»', () => {
    expect(sanitizeName('  Лёша   К. ')).toBe('Лёша К.');
    expect(sanitizeName('абвгдеёжзийклмнопрст')).toHaveLength(16);
    expect([...sanitizeName('🙂'.repeat(20))!]).toHaveLength(16);
    expect(sanitizeName('   ')).toBeNull();
    expect(displayName()).toBe(DEFAULT_NAME);
    setName('Оля');
    expect(displayName()).toBe('Оля');
  });

  it('окно имени — после уровня 3 и только пока не спросили', () => {
    expect(shouldAskName(2)).toBe(false);
    expect(shouldAskName(3)).toBe(true);
    skipName();
    expect(shouldAskName(3)).toBe(false);
    expect(displayName()).toBe(DEFAULT_NAME);
  });
});

describe('аватарки', () => {
  beforeEach(() => SaveService.setBackend(memoryBackend()));

  it('8 вариантов: 4 сразу, остальные за 10, 20, 25 и 30 звёзд', () => {
    expect(AVATARS).toHaveLength(8);
    expect(AVATARS.filter((a) => isAvatarUnlocked(a.id, 0))).toHaveLength(4);
    expect(AVATARS.slice(4).map((a) => a.stars)).toEqual([10, 20, 25, 30]);
    expect(isAvatarUnlocked(4, 9)).toBe(false);
    expect(isAvatarUnlocked(4, 10)).toBe(true);
  });

  it('закрытую аватарку выбрать нельзя, открытую — можно', () => {
    expect(setAvatar(5)).toBe(false);
    expect(setAvatar(2)).toBe(true);
    expect(getProfile().avatar).toBe(2);
    SaveService.update((d) => {
      for (let i = 1; i <= 7; i++) d.progress.stars[i] = 3; // 21 звезда
    });
    expect(totalStars()).toBe(21);
    expect(levelsPassed()).toBe(7);
    expect(setAvatar(5)).toBe(true);
    expect(setAvatar(6)).toBe(false);
  });
});

describe('серия дней и подсказки', () => {
  beforeEach(() => SaveService.setBackend(memoryBackend()));

  it('вчера играл — серия растёт, тот же день — без изменений, пропуск — заново', () => {
    expect(recordPlayDay(new Date(2026, 10, 20, 10)).dayStreak).toBe(1);
    expect(recordPlayDay(new Date(2026, 10, 20, 23)).dayStreak).toBe(1);
    expect(recordPlayDay(new Date(2026, 10, 21, 0, 5)).dayStreak).toBe(2);
    expect(recordPlayDay(new Date(2026, 10, 22, 9)).dayStreak).toBe(3);
    const p = recordPlayDay(new Date(2026, 10, 25, 9));
    expect(p.dayStreak).toBe(1);
    expect(p.bestDayStreak).toBe(3);
  });

  it('серия переживает смену месяца', () => {
    recordPlayDay(new Date(2026, 10, 30, 20));
    expect(recordPlayDay(new Date(2026, 11, 1, 8)).dayStreak).toBe(2);
  });

  it('счётчик подсказок', () => {
    countHint();
    countHint();
    expect(getProfile().hintsUsed).toBe(2);
  });
});

describe('раскладка лотка', () => {
  // 375 px по ширине = 1080 виртуальных → 1 px ≈ 2,9 виртуальных.
  const minMargin = 30;

  it('со слотом «отложить»: группа по центру и не касается краёв', () => {
    const l = trayLayout(true);
    expect(l.stashX).not.toBeNull();
    expect(l.left).toBeGreaterThanOrEqual(minMargin);
    expect(W - l.right).toBeGreaterThanOrEqual(minMargin);
  });

  it('без слота «отложить»: лоток с колодой по центру', () => {
    const l = trayLayout(false);
    expect(l.stashX).toBeNull();
    expect(Math.abs(l.left - (W - l.right))).toBeLessThan(20);
    expect(W - l.right).toBeGreaterThanOrEqual(minMargin);
    expect(l.slotX[1]).toBeLessThan(W / 2); // колода справа — лоток чуть левее центра
  });
});

describe('предложение войти после первой победы', () => {
  beforeEach(() => SaveService.setBackend(memoryBackend()));

  it('гостю — один раз, если облако настроено', async () => {
    const { shouldPromptAuth, markAuthPrompted } = await import('../src/profile');
    expect(getProfile().authPrompted).toBe(false);
    expect(shouldPromptAuth({ configured: true, signedIn: false })).toBe(true);
    markAuthPrompted();
    expect(shouldPromptAuth({ configured: true, signedIn: false })).toBe(false);
    expect(SaveService.load().log.at(-1)?.ev).toBe('auth_prompt');
  });

  it('не предлагаем, если уже вошёл или облако не настроено', async () => {
    const { shouldPromptAuth } = await import('../src/profile');
    expect(shouldPromptAuth({ configured: true, signedIn: true })).toBe(false);
    expect(shouldPromptAuth({ configured: false, signedIn: false })).toBe(false);
  });

  it('старые сохранения без флага — флаг выключен', () => {
    SaveService.setBackend(
      memoryBackend({ [SAVE_KEY]: JSON.stringify({ version: 3, profile: { playerId: '11111111-2222-4333-8444-555555555555' }, progress: {}, log: [] }) }),
    );
    expect(getProfile().authPrompted).toBe(false);
  });
});
