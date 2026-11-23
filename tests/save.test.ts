import { beforeEach, describe, expect, it } from 'vitest';
import { LEGACY_KEYS, memoryBackend, migrate, SAVE_KEY, SAVE_VERSION, SaveService } from '../src/save/SaveService';

describe('SaveService', () => {
  beforeEach(() => SaveService.setBackend(memoryBackend()));

  it('пустое сохранение — версия и значения по умолчанию', () => {
    const d = SaveService.load();
    expect(d.version).toBe(SAVE_VERSION);
    expect(d.progress).toMatchObject({ unlocked: ['valley-01'], stars: {}, fireflies: {}, muted: false });
    expect(d.log).toEqual([]);
  });

  it('save/load: данные пишутся одним объектом с полем version', () => {
    const backend = memoryBackend();
    SaveService.setBackend(backend);
    SaveService.update((d) => {
      d.progress.unlocked = ['valley-01', 'valley-02', 'valley-03'];
      d.log.push({ t: 'x', ev: 'session' });
    });
    const raw = JSON.parse(backend.dump()[SAVE_KEY]);
    expect(raw.version).toBe(SAVE_VERSION);
    expect(raw.progress.unlocked).toHaveLength(3);
    SaveService.setBackend(backend); // сброс кэша — читаем с «диска»
    expect(SaveService.load().progress.unlocked).toEqual(['valley-01', 'valley-02', 'valley-03']);
  });

  it('миграция со старого формата glowtrail.progress.v1 + glowtrail.log.v1', () => {
    const backend = memoryBackend({
      [LEGACY_KEYS.progress]: JSON.stringify({ unlocked: 5, stars: { 1: 3, 2: 2 }, attempts: { 1: 4 }, lossStreak: { 3: 2 }, skipped: { 4: true }, hints: 7, muted: true }),
      [LEGACY_KEYS.log]: JSON.stringify([{ t: '2026-11-22T10:00:00Z', ev: 'win', level: 1, undo: true }]),
    });
    SaveService.setBackend(backend);
    const d = SaveService.load();
    expect(d.version).toBe(SAVE_VERSION);
    expect(d.progress).toEqual({
      unlocked: ['valley-01', 'valley-02', 'valley-03', 'valley-04', 'valley-05'],
      stars: { 'valley-01': 3, 'valley-02': 2 },
      attempts: { 'valley-01': 4 },
      lossStreak: { 'valley-03': 2 },
      skipped: { 'valley-04': true },
      fireflies: {},
      muted: true,
      vibration: true,
    });
    expect('hints' in d.progress).toBe(false); // подсказки теперь бесплатные
    expect(d.log).toHaveLength(1);
    expect(d.log[0].level).toBe('valley-01'); // номер уровня в логе → id
    // Мигрированные данные сразу сохранены в новом формате, старые ключи не тронуты.
    const dump = backend.dump();
    expect(JSON.parse(dump[SAVE_KEY]).version).toBe(SAVE_VERSION);
    expect(dump[LEGACY_KEYS.progress]).toBeDefined();
  });

  it('новый формат важнее старого', () => {
    SaveService.setBackend(
      memoryBackend({
        [SAVE_KEY]: JSON.stringify({ version: 2, progress: { unlocked: 2 }, log: [] }),
        [LEGACY_KEYS.progress]: JSON.stringify({ unlocked: 9 }),
      }),
    );
    expect(SaveService.load().progress.unlocked).toEqual(['valley-01', 'valley-02']);
  });

  it('битые данные не роняют игру', () => {
    SaveService.setBackend(memoryBackend({ [SAVE_KEY]: '{не json' , [LEGACY_KEYS.progress]: 'тоже нет' }));
    expect(SaveService.load().progress.unlocked).toEqual(['valley-01']);
    expect(migrate({ version: 2, progress: 'мусор', log: 'мусор' }).log).toEqual([]);
  });

  it('reset стирает и новое, и старое сохранение', () => {
    const backend = memoryBackend({ [LEGACY_KEYS.log]: '[]' });
    SaveService.setBackend(backend);
    SaveService.update((d) => void (d.progress.stars['valley-04'] = 3));
    SaveService.reset();
    expect(backend.dump()).toEqual({});
    expect(SaveService.load().progress.stars).toEqual({});
  });

  it('v3 → v4: прогресс текущих игроков переходит на id уровней без потерь', () => {
    const v3 = {
      version: 3,
      profile: { playerId: 'abcdefgh-1234', name: 'Аня', tipsSeen: ['rule:road'] },
      progress: { unlocked: 10, stars: { 1: 3, 9: 2, 10: 1 }, attempts: { 10: 6 }, lossStreak: { 7: 2 }, skipped: { 8: true }, muted: false, vibration: false },
      log: [{ t: 'x', ev: 'win', level: 10, stars: 1 }, { t: 'y', ev: 'session' }],
    };
    SaveService.setBackend(memoryBackend({ [SAVE_KEY]: JSON.stringify(v3) }));
    const d = SaveService.load();
    expect(d.version).toBe(4);
    expect(d.profile).toMatchObject({ playerId: 'abcdefgh-1234', name: 'Аня', tipsSeen: ['rule:road'] });
    expect(d.progress.stars).toEqual({ 'valley-01': 3, 'valley-09': 2, 'valley-10': 1 });
    expect(d.progress.unlocked).toHaveLength(10);
    expect(d.progress.attempts).toEqual({ 'valley-10': 6 });
    expect(d.progress.skipped).toEqual({ 'valley-08': true });
    expect(d.progress.vibration).toBe(false);
    expect(d.log.map((e) => e.level)).toEqual(['valley-10', undefined]);
  });
});
