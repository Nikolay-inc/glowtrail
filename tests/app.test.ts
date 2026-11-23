// Приложение (Capacitor): раскладка в безопасной зоне, сохранение в Preferences, вибрация.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { computeView, stretchBounds } from '../src/ui/viewport';
import { createPreferencesBackend, type PrefsApi } from '../src/save/preferencesBackend';
import { memoryBackend, SAVE_KEY, SaveService } from '../src/save/SaveService';
import { haptics, isVibrationOn, setVibration, WEB_PATTERNS } from '../src/haptics';
import { H, W } from '../src/ui/theme';

const none = { top: 0, right: 0, bottom: 0, left: 0 };

describe('computeView — раскладка 1080×1920 в безопасной зоне', () => {
  it('ровно 9:16 без выреза — как раньше, масштаб 1', () => {
    const v = computeView(W, H, none);
    expect(v).toMatchObject({ x: 0, y: 0, w: W, h: H, zoom: 1, cx: W / 2, cy: H / 2 });
  });

  it('высокий экран (iPhone): раскладка по центру, сверху и снизу — фон, без полос', () => {
    const v = computeView(1080, 2337, none); // 19.5:9
    expect(v.zoom).toBe(1);
    expect(v.w).toBe(1080);
    expect(v.h).toBeCloseTo(2337);
    expect(v.y).toBeCloseTo(-(2337 - H) / 2); // фон рисуется выше раскладки
    expect(v.y + v.h).toBeCloseTo(H + (2337 - H) / 2);
  });

  it('вырез и полоска «домой»: раскладка не заходит в небезопасную зону', () => {
    const ins = { top: 160, right: 0, bottom: 100, left: 0 };
    const gameH = 2337;
    const v = computeView(1080, gameH, ins);
    // Экранная координата верха раскладки: (0 - v.y) * zoom
    const layoutTop = (0 - v.y) * v.zoom;
    const layoutBottom = (H - v.y) * v.zoom;
    expect(layoutTop).toBeGreaterThanOrEqual(ins.top - 0.01);
    expect(layoutBottom).toBeLessThanOrEqual(gameH - ins.bottom + 0.01);
  });

  it('широкий экран (компьютер): уменьшаем по высоте, по бокам — фон', () => {
    const v = computeView(3000, 1500, none);
    expect(v.zoom).toBeCloseTo(1500 / H);
    expect(v.x).toBeLessThan(0);
    expect(v.y).toBeCloseTo(0);
    expect(v.h).toBeCloseTo(H);
  });

  it('растянутая раскладка: верх и низ встают к краям безопасной зоны, камера та же', () => {
    const ins = { top: 125, right: 0, bottom: 89, left: 0 }; // iPhone 11
    const v = computeView(1080, 2337, ins);
    const b = stretchBounds(v, 320);
    expect(b.top).toBeCloseTo(v.safeTop);
    expect(b.bottom).toBeCloseTo(v.safeBottom);
    expect(b.top).toBeLessThan(0);
    expect(b.bottom).toBeGreaterThan(H);
    const v2 = computeView(1080, 2337, ins, b);
    expect(v2.zoom).toBe(1);
    expect(v2.cy).toBeCloseTo(v.cy);
  });

  it('растягиваем не больше maxExtra; на экране 9:16 и на компьютере — без изменений', () => {
    const tall = stretchBounds(computeView(1080, 3000, none), 320);
    expect(tall).toEqual({ top: -320, bottom: H + 320 });
    expect(stretchBounds(computeView(W, H, none), 320)).toEqual({ top: 0, bottom: H });
    expect(stretchBounds(computeView(3000, 1500, none), 320)).toEqual({ top: 0, bottom: H });
  });

  it('окно стало ниже — растянутая раскладка целиком помещается (камера уменьшает)', () => {
    const b = { top: -200, bottom: H + 200 };
    const v = computeView(1080, 1920, none, b);
    expect(v.zoom).toBeCloseTo(1920 / (H + 400));
    expect(v.y).toBeCloseTo(b.top - (v.h - (H + 400)) / 2);
    expect(v.y).toBeLessThanOrEqual(b.top + 0.01);
    expect(v.y + v.h).toBeGreaterThanOrEqual(b.bottom - 0.01);
  });

  it('не помещается по высоте с отступами — уменьшаем', () => {
    const v = computeView(1080, 1920, { top: 120, right: 0, bottom: 80, left: 0 });
    expect(v.zoom).toBeCloseTo(1720 / 1920);
  });
});

/** Заглушка Preferences: «диск» — обычный объект. */
function fakePrefs(initial: Record<string, string> = {}) {
  const disk: Record<string, string> = { ...initial };
  const calls: string[] = [];
  const api: PrefsApi = {
    get: async ({ key }) => ({ value: key in disk ? disk[key] : null }),
    set: async ({ key, value }) => {
      calls.push(`set:${key}`);
      disk[key] = value;
    },
    remove: async ({ key }) => {
      calls.push(`remove:${key}`);
      delete disk[key];
    },
  };
  return { api, disk, calls };
}

describe('Preferences — хранилище сохранения в приложении', () => {
  afterEach(() => SaveService.setBackend(memoryBackend()));

  it('при запуске читает сохранение с диска', async () => {
    const save = JSON.stringify({ version: 3, profile: {}, progress: { unlocked: 7, stars: { 1: 3 } }, log: [] });
    const { api } = fakePrefs({ [SAVE_KEY]: save });
    SaveService.setBackend(await createPreferencesBackend(api));
    expect(SaveService.load().progress.unlocked).toBe(7);
  });

  it('несколько изменений подряд — одна запись; flush пишет сразу', async () => {
    const { api, disk, calls } = fakePrefs();
    const backend = await createPreferencesBackend(api, { delayMs: 10_000 });
    SaveService.setBackend(backend);
    SaveService.update((d) => void (d.progress.unlocked = 2));
    SaveService.update((d) => void (d.progress.unlocked = 3));
    expect(calls).toEqual([]); // ещё не записано
    await SaveService.flush();
    expect(calls).toEqual([`set:${SAVE_KEY}`]);
    expect(JSON.parse(disk[SAVE_KEY]).progress.unlocked).toBe(3);
  });

  it('записывает сама через задержку', async () => {
    vi.useFakeTimers();
    try {
      const { api, disk } = fakePrefs();
      SaveService.setBackend(await createPreferencesBackend(api, { delayMs: 400 }));
      SaveService.update((d) => void (d.progress.unlocked = 4));
      await vi.advanceTimersByTimeAsync(450);
      expect(JSON.parse(disk[SAVE_KEY]).progress.unlocked).toBe(4);
    } finally {
      vi.useRealTimers();
    }
  });

  it('первый запуск приложения: переносит прогресс из localStorage WebView', async () => {
    const save = JSON.stringify({ version: 3, profile: {}, progress: { unlocked: 9, stars: {} }, log: [] });
    const { api, disk } = fakePrefs();
    const legacy = { getItem: (k: string) => (k === SAVE_KEY ? save : null) };
    SaveService.setBackend(await createPreferencesBackend(api, { legacyLocalStorage: legacy }));
    expect(SaveService.load().progress.unlocked).toBe(9);
    expect(disk[SAVE_KEY]).toBe(save);
  });

  it('если в Preferences уже есть сохранение — localStorage не трогаем', async () => {
    const mine = JSON.stringify({ version: 3, profile: {}, progress: { unlocked: 2, stars: {} }, log: [] });
    const old = JSON.stringify({ version: 3, profile: {}, progress: { unlocked: 9, stars: {} }, log: [] });
    const { api } = fakePrefs({ [SAVE_KEY]: mine });
    SaveService.setBackend(await createPreferencesBackend(api, { legacyLocalStorage: { getItem: () => old } }));
    expect(SaveService.load().progress.unlocked).toBe(2);
  });
});

describe('Вибрация', () => {
  let vibrate: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    SaveService.setBackend(memoryBackend());
    vibrate = vi.fn();
    vi.stubGlobal('navigator', { vibrate });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('по умолчанию включена; в браузере — шаблоны navigator.vibrate', () => {
    expect(isVibrationOn()).toBe(true);
    haptics.place();
    haptics.error();
    haptics.win();
    expect(vibrate.mock.calls.map((c) => c[0])).toEqual([WEB_PATTERNS.place, WEB_PATTERNS.error, WEB_PATTERNS.win]);
  });

  it('выключатель: настройка сохраняется, вибрации больше нет', () => {
    setVibration(false);
    expect(SaveService.load().progress.vibration).toBe(false);
    haptics.place();
    haptics.win();
    expect(vibrate).not.toHaveBeenCalled();
    setVibration(true);
    expect(vibrate).toHaveBeenCalledTimes(1); // короткий отклик, что включилось
  });

  it('ошибка короче победы', () => {
    const len = (p: number | number[]) => (Array.isArray(p) ? p.reduce((a, b) => a + b, 0) : p);
    expect(len(WEB_PATTERNS.place)).toBeLessThan(len(WEB_PATTERNS.error));
    expect(len(WEB_PATTERNS.error)).toBeLessThan(len(WEB_PATTERNS.win));
  });
});
