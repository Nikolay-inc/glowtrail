import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emptySave, memoryBackend, SaveService, type SaveData } from '../src/save/SaveService';
import { hasProgress, mergeSaves, toCloudPayload, type CloudPayload } from '../src/cloud/merge';
import { CloudSync } from '../src/cloud/sync';
import type { CloudStore } from '../src/cloud/store';
import { authErrorMessage, validateEmail, validatePassword, validatePasswordPair } from '../src/cloud/validate';

describe('проверка полей формы', () => {
  it('email', () => {
    expect(validateEmail('  Anna@Mail.com ')).toBeNull();
    expect(validateEmail('')).toBe('Введи email');
    expect(validateEmail('anna@mail')).toMatch(/опечатка/);
    expect(validateEmail('anna mail.com')).toMatch(/опечатка/);
  });

  it('пароль: от 8 символов, повтор совпадает', () => {
    expect(validatePassword('1234567')).toMatch(/не короче 8/);
    expect(validatePassword('12345678')).toBeNull();
    expect(validatePassword('x'.repeat(73))).toMatch(/длинный/);
    expect(validatePasswordPair('12345678', '12345679')).toBe('Пароли не совпадают');
    expect(validatePasswordPair('12345678', '12345678')).toBeNull();
  });

  it('ошибки Supabase — понятным русским текстом', () => {
    expect(authErrorMessage({ code: 'invalid_credentials' })).toBe('Неверный email или пароль');
    expect(authErrorMessage({ message: 'Email not confirmed' })).toMatch(/не подтверждена/);
    expect(authErrorMessage({ code: 'over_email_send_rate_limit' })).toMatch(/Слишком много писем/);
    expect(authErrorMessage({ name: 'AuthRetryableFetchError', message: 'Failed to fetch' })).toMatch(/интернет/);
    expect(authErrorMessage({ code: 'что-то новое' })).toMatch(/попробуй ещё раз/);
  });
});

function save(patch: (d: SaveData) => void): SaveData {
  const d = emptySave();
  patch(d);
  return d;
}

describe('слияние облачного и локального сохранения', () => {
  it('без облака — локальное как есть', () => {
    const local = save((d) => (d.progress.stars = { 'valley-01': 3 }));
    expect(mergeSaves(local, null)).toBe(local);
  });

  it('прогресс не теряется: звёзды и открытые уровни — максимум', () => {
    const local = save((d) => {
      d.progress.stars = { 'valley-01': 3, 'valley-02': 1 };
      d.progress.unlocked = ['valley-01', 'valley-02', 'valley-03'];
      d.progress.attempts = { 'valley-01': 5 };
      d.progress.fireflies = { 'valley-12': 1 };
    });
    const cloud = toCloudPayload(
      save((d) => {
        d.progress.stars = { 'valley-02': 3, 'valley-03': 2 };
        d.progress.unlocked = ['valley-01', 'valley-04'];
        d.progress.attempts = { 'valley-01': 2, 'valley-03': 7 };
        d.progress.fireflies = { 'valley-12': 3 };
      }),
    );
    const m = mergeSaves(local, cloud);
    expect(m.progress.stars).toEqual({ 'valley-01': 3, 'valley-02': 3, 'valley-03': 2 });
    expect([...m.progress.unlocked].sort()).toEqual(['valley-01', 'valley-02', 'valley-03', 'valley-04']);
    expect(m.progress.attempts).toEqual({ 'valley-01': 5, 'valley-03': 7 });
    expect(m.progress.fireflies).toEqual({ 'valley-12': 3 });
  });

  it('в облаке сохранение старой версии (уровни по номерам) — переводим в id и сливаем', () => {
    const local = save((d) => (d.progress.stars = { 'valley-02': 1 }));
    const old = { version: 3, profile: local.profile, progress: { unlocked: 5, stars: { 1: 3, 2: 2 }, attempts: { 4: 1 }, lossStreak: {}, skipped: { 4: true }, muted: false } };
    const m = mergeSaves(local, old as unknown as CloudPayload);
    expect(m.progress.stars).toEqual({ 'valley-01': 3, 'valley-02': 2 });
    expect(m.progress.skipped).toEqual({ 'valley-04': true });
    expect(m.progress.unlocked).toContain('valley-05');
  });

  it('пройденный уровень больше не «пропущен»', () => {
    const local = save((d) => (d.progress.skipped = { 4: true, 5: true }));
    const cloud = toCloudPayload(save((d) => (d.progress.stars = { 4: 2 })));
    expect(mergeSaves(local, cloud).progress.skipped).toEqual({ 'valley-05': true });
  });

  it('личность аккаунта — из облака, лог и звук — с устройства', () => {
    const local = save((d) => {
      d.profile.name = 'Гость';
      d.profile.avatar = 3;
      d.progress.muted = true;
      d.log = [{ t: 'x', ev: 'session' }];
    });
    const cloud = toCloudPayload(
      save((d) => {
        d.profile.playerId = 'cloud-player-id-0001';
        d.profile.name = 'Анна';
        d.profile.avatar = 1;
        d.profile.hintsUsed = 9;
      }),
    );
    const m = mergeSaves(local, cloud);
    expect(m.profile).toMatchObject({ playerId: 'cloud-player-id-0001', name: 'Анна', avatar: 1, hintsUsed: 9 });
    expect(m.progress.muted).toBe(true);
    expect(m.log).toHaveLength(1);
    expect('log' in cloud).toBe(false); // лог в облако не уходит
  });

  it('если в облаке имя ещё не задано — берём имя и аватарку гостя', () => {
    const local = save((d) => {
      d.profile.name = 'Оля';
      d.profile.avatar = 2;
    });
    const m = mergeSaves(local, toCloudPayload(emptySave()));
    expect(m.profile).toMatchObject({ name: 'Оля', avatar: 2 });
  });

  it('серия дней — с того устройства, где играли позже', () => {
    const local = save((d) => Object.assign(d.profile, { lastPlayDay: '2026-11-22', dayStreak: 2, bestDayStreak: 2 }));
    const cloud = toCloudPayload(save((d) => Object.assign(d.profile, { lastPlayDay: '2026-11-20', dayStreak: 5, bestDayStreak: 6 })));
    expect(mergeSaves(local, cloud).profile).toMatchObject({ lastPlayDay: '2026-11-22', dayStreak: 2, bestDayStreak: 6 });
  });

  it('предложение войти, показанное на любом устройстве, не повторяется', () => {
    const local = save((d) => (d.profile.authPrompted = false));
    const cloud = toCloudPayload(save((d) => (d.profile.authPrompted = true)));
    expect(mergeSaves(local, cloud).profile.authPrompted).toBe(true);
  });

  it('есть ли у гостя прогресс', () => {
    expect(hasProgress(emptySave())).toBe(false);
    expect(hasProgress(save((d) => (d.progress.stars = { 1: 1 })))).toBe(true);
  });
});

function fakeStore(initial: CloudPayload | null = null) {
  const saved: CloudPayload[] = [];
  let cloud = initial;
  let fail = false;
  const store: CloudStore = {
    load: vi.fn(async () => {
      if (fail) throw new Error('offline');
      return cloud;
    }),
    save: vi.fn(async (_id: string, p: CloudPayload) => {
      if (fail) throw new Error('offline');
      cloud = p;
      saved.push(JSON.parse(JSON.stringify(p)));
    }),
  };
  return { store, saved, setFail: (v: boolean) => (fail = v) };
}

describe('синхронизация с облаком', () => {
  beforeEach(() => {
    SaveService.setBackend(memoryBackend());
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  it('при входе: облако + локальное сливаются и записываются обратно', async () => {
    SaveService.update((d) => (d.progress.stars = { 1: 3 }));
    const { store, saved } = fakeStore(toCloudPayload(save((d) => (d.progress.stars = { 2: 2 }))));
    const sync = new CloudSync(store, 1000);
    await sync.start('user-1');
    expect(SaveService.load().progress.stars).toEqual({ 'valley-01': 3, 'valley-02': 2 });
    expect(saved.at(-1)!.progress.stars).toEqual({ 'valley-01': 3, 'valley-02': 2 });
    expect(sync.status).toBe('synced');
  });

  it('изменения уходят в облако одной записью после паузы, изменения только лога — нет', async () => {
    const { store, saved } = fakeStore();
    const sync = new CloudSync(store, 1000);
    await sync.start('user-1');
    const before = saved.length;
    SaveService.update((d) => (d.progress.stars[1] = 1));
    SaveService.update((d) => (d.progress.stars[1] = 2));
    SaveService.update((d) => (d.progress.stars[2] = 3));
    expect(saved.length).toBe(before);
    await vi.advanceTimersByTimeAsync(1100);
    expect(saved.length).toBe(before + 1);
    expect(saved.at(-1)!.progress.stars).toEqual({ 1: 2, 2: 3 });
    SaveService.update((d) => void d.log.push({ t: 'x', ev: 'session' }));
    await vi.advanceTimersByTimeAsync(1100);
    expect(saved.length).toBe(before + 1);
  });

  it('без сети — статус offline, следующее изменение повторит запись', async () => {
    const { store, saved, setFail } = fakeStore();
    const sync = new CloudSync(store, 500);
    setFail(true);
    await sync.start('user-1');
    expect(sync.status).toBe('offline');
    setFail(false);
    SaveService.update((d) => (d.progress.stars[1] = 3));
    await vi.advanceTimersByTimeAsync(600);
    expect(sync.status).toBe('synced');
    expect(saved.at(-1)!.progress.stars).toEqual({ 1: 3 });
  });

  it('после выхода облако не трогаем', async () => {
    const { store, saved } = fakeStore();
    const sync = new CloudSync(store, 500);
    await sync.start('user-1');
    sync.stop();
    const n = saved.length;
    SaveService.update((d) => (d.progress.stars[1] = 3));
    await vi.advanceTimersByTimeAsync(600);
    expect(saved.length).toBe(n);
    expect(sync.status).toBe('off');
  });

  it('flush дописывает отложенное изменение сразу', async () => {
    const { store, saved } = fakeStore();
    const sync = new CloudSync(store, 5000);
    await sync.start('user-1');
    SaveService.update((d) => (d.progress.stars['valley-06'] = 2));
    await sync.flush();
    expect(saved.at(-1)!.progress.stars['valley-06']).toBe(2);
  });
});
