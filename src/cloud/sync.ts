// Синхронизация сохранения с облаком, пока игрок вошёл в аккаунт.
// При входе: забрать облачное → слить с локальным → записать обратно. Дальше — каждое изменение
// прогресса или профиля уходит в облако с небольшой задержкой (несколько изменений подряд — одна запись).

import { SaveService, type SaveData } from '../save/SaveService';
import { mergeSaves, toCloudPayload } from './merge';
import type { CloudStore } from './store';

export type SyncStatus = 'off' | 'syncing' | 'synced' | 'offline';

export class CloudSync {
  private userId: string | null = null;
  private unsubscribe: (() => void) | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private lastPushed = '';
  private listeners = new Set<(s: SyncStatus) => void>();
  status: SyncStatus = 'off';

  constructor(
    private store: CloudStore,
    private debounceMs = 1500,
  ) {}

  onStatus(fn: (s: SyncStatus) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private setStatus(s: SyncStatus) {
    this.status = s;
    for (const fn of this.listeners) fn(s);
  }

  /** Игрок вошёл: слияние и запуск автосохранения в облако. */
  async start(userId: string): Promise<void> {
    if (this.userId === userId) return;
    this.stop();
    this.userId = userId;
    this.setStatus('syncing');
    try {
      const cloud = await this.store.load(userId);
      if (this.userId !== userId) return; // успели выйти
      const merged = mergeSaves(SaveService.load(), cloud);
      SaveService.replace(merged);
      await this.push(merged, true);
    } catch {
      this.setStatus('offline');
    }
    this.unsubscribe = SaveService.subscribe((d) => this.schedule(d));
  }

  /** Игрок вышел: облако больше не трогаем. */
  stop() {
    this.unsubscribe?.();
    this.unsubscribe = null;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.userId = null;
    this.lastPushed = '';
    this.setStatus('off');
  }

  /** Дописать отложенное изменение прямо сейчас (перед выходом из аккаунта). */
  async flush(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
      await this.push(SaveService.load());
    }
  }

  private schedule(d: SaveData) {
    // Лог событий в облако не идёт — изменения только лога не повод писать в облако.
    if (JSON.stringify(toCloudPayload(d)) === this.lastPushed) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.push(SaveService.load());
    }, this.debounceMs);
  }

  private async push(d: SaveData, force = false) {
    if (!this.userId) return;
    const payload = toCloudPayload(d);
    const json = JSON.stringify(payload);
    if (!force && json === this.lastPushed) return;
    this.setStatus('syncing');
    try {
      await this.store.save(this.userId, payload);
      this.lastPushed = json;
      this.setStatus('synced');
    } catch {
      this.setStatus('offline'); // повторим при следующем изменении
    }
  }
}
