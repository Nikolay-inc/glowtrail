import { beforeEach, describe, expect, it } from 'vitest';
import { LEGACY_KEYS, memoryBackend, migrate, SAVE_KEY, SAVE_VERSION, SaveService } from '../src/save/SaveService';

describe('SaveService', () => {
  beforeEach(() => SaveService.setBackend(memoryBackend()));

  it('пустое сохранение — версия и значения по умолчанию', () => {
    const d = SaveService.load();
    expect(d.version).toBe(SAVE_VERSION);
    expect(d.progress).toMatchObject({ unlocked: 1, stars: {}, muted: false });
    expect(d.log).toEqual([]);
  });

  it('save/load: данные пишутся одним объектом с полем version', () => {
    const backend = memoryBackend();
    SaveService.setBackend(backend);
    SaveService.update((d) => {
      d.progress.unlocked = 3;
      d.log.push({ t: 'x', ev: 'session' });
    });
    const raw = JSON.parse(backend.dump()[SAVE_KEY]);
    expect(raw.version).toBe(SAVE_VERSION);
    expect(raw.progress.unlocked).toBe(3);
    SaveService.setBackend(backend); // сброс кэша — читаем с «диска»
    expect(SaveService.load().progress.unlocked).toBe(3);
  });

  it('миграция со старого формата glowtrail.progress.v1 + glowtrail.log.v1', () => {
    const backend = memoryBackend({
      [LEGACY_KEYS.progress]: JSON.stringify({ unlocked: 5, stars: { 1: 3, 2: 2 }, attempts: { 1: 4 }, lossStreak: { 3: 2 }, skipped: { 4: true }, hints: 7, muted: true }),
      [LEGACY_KEYS.log]: JSON.stringify([{ t: '2026-11-22T10:00:00Z', ev: 'win', level: 1, undo: true }]),
    });
    SaveService.setBackend(backend);
    const d = SaveService.load();
    expect(d.version).toBe(SAVE_VERSION);
    expect(d.progress).toEqual({ unlocked: 5, stars: { 1: 3, 2: 2 }, attempts: { 1: 4 }, lossStreak: { 3: 2 }, skipped: { 4: true }, muted: true });
    expect('hints' in d.progress).toBe(false); // подсказки теперь бесплатные
    expect(d.log).toHaveLength(1);
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
    expect(SaveService.load().progress.unlocked).toBe(2);
  });

  it('битые данные не роняют игру', () => {
    SaveService.setBackend(memoryBackend({ [SAVE_KEY]: '{не json' , [LEGACY_KEYS.progress]: 'тоже нет' }));
    expect(SaveService.load().progress.unlocked).toBe(1);
    expect(migrate({ version: 2, progress: 'мусор', log: 'мусор' }).log).toEqual([]);
  });

  it('reset стирает и новое, и старое сохранение', () => {
    const backend = memoryBackend({ [LEGACY_KEYS.log]: '[]' });
    SaveService.setBackend(backend);
    SaveService.update((d) => void (d.progress.unlocked = 4));
    SaveService.reset();
    expect(backend.dump()).toEqual({});
    expect(SaveService.load().progress.unlocked).toBe(1);
  });
});
