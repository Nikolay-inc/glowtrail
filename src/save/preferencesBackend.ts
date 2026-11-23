// Хранилище сохранения в приложении: @capacitor/preferences (UserDefaults на iOS, SharedPreferences на Android).
// localStorage внутри WebView система может очистить при нехватке места, Preferences — нет.
// SaveService работает синхронно, поэтому данные читаются в память при запуске, а записи уходят
// на диск с небольшой задержкой (несколько изменений подряд — одна запись); flush() — дописать сразу.

import { LEGACY_KEYS, SAVE_KEY, type SaveBackend } from './SaveService';

/** То, что нужно от Preferences (в тестах — заглушка). */
export interface PrefsApi {
  get(o: { key: string }): Promise<{ value: string | null }>;
  set(o: { key: string; value: string }): Promise<void>;
  remove(o: { key: string }): Promise<void>;
}

export interface FlushableBackend extends SaveBackend {
  flush(): Promise<void>;
}

const KEYS = [SAVE_KEY, LEGACY_KEYS.progress, LEGACY_KEYS.log];

export async function createPreferencesBackend(
  prefs: PrefsApi,
  opts: { delayMs?: number; legacyLocalStorage?: Pick<Storage, 'getItem'> | null } = {},
): Promise<FlushableBackend> {
  const delay = opts.delayMs ?? 400;
  const mem = new Map<string, string>();
  for (const key of KEYS) {
    const { value } = await prefs.get({ key });
    if (value !== null) mem.set(key, value);
  }
  // Первый запуск приложения: если в Preferences пусто, а в localStorage WebView что-то есть — переносим.
  if (!mem.has(SAVE_KEY) && opts.legacyLocalStorage) {
    for (const key of KEYS) {
      let v: string | null = null;
      try {
        v = opts.legacyLocalStorage.getItem(key);
      } catch {
        v = null;
      }
      if (v !== null) {
        mem.set(key, v);
        await prefs.set({ key, value: v });
      }
    }
  }

  const dirty = new Map<string, string | null>(); // null — удалить
  let timer: ReturnType<typeof setTimeout> | null = null;
  let chain: Promise<void> = Promise.resolve();

  const writeOut = () => {
    timer = null;
    const batch = [...dirty.entries()];
    dirty.clear();
    chain = chain.then(async () => {
      for (const [key, value] of batch) {
        if (value === null) await prefs.remove({ key });
        else await prefs.set({ key, value });
      }
    });
    return chain;
  };
  const schedule = () => {
    if (!timer) timer = setTimeout(writeOut, delay);
  };

  return {
    read: (key) => mem.get(key) ?? null,
    write: (key, value) => {
      mem.set(key, value);
      dirty.set(key, value);
      schedule();
    },
    remove: (key) => {
      mem.delete(key);
      dirty.set(key, null);
      schedule();
    },
    flush: () => {
      if (timer) clearTimeout(timer);
      return dirty.size ? writeOut() : chain;
    },
  };
}
