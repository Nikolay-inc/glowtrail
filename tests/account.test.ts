import { beforeEach, describe, expect, it, vi } from 'vitest';
import { memoryBackend, SaveService } from '../src/save/SaveService';

// Подменяем Supabase: проверяем нашу логику вокруг него, без сети.
type Listener = (event: string, session: { user: { id: string; email: string } } | null) => void;
const fake = {
  listener: null as Listener | null,
  signUp: vi.fn(),
  signInWithPassword: vi.fn(),
  signOut: vi.fn(async () => ({ error: null })),
  resetPasswordForEmail: vi.fn(async () => ({ error: null })),
  updateUser: vi.fn(async () => ({ error: null })),
  rpc: vi.fn(async () => ({ error: null })),
  cloud: null as unknown,
};
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: {
      onAuthStateChange: (fn: Listener) => {
        fake.listener = fn;
        return { data: { subscription: { unsubscribe() {} } } };
      },
      signUp: fake.signUp,
      signInWithPassword: fake.signInWithPassword,
      signOut: fake.signOut,
      resetPasswordForEmail: fake.resetPasswordForEmail,
      updateUser: fake.updateUser,
    },
    rpc: fake.rpc,
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: fake.cloud ? { data: fake.cloud } : null, error: null }) }) }),
      upsert: async (row: { data: unknown }) => {
        fake.cloud = row.data;
        return { error: null };
      },
    }),
  }),
}));

async function freshAccount() {
  vi.resetModules();
  vi.stubEnv('VITE_SUPABASE_URL', 'https://test-project.supabase.co');
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'test-anon-key-1234567890-abcdef');
  const save = await import('../src/save/SaveService');
  save.SaveService.setBackend(memoryBackend());
  const mod = await import('../src/cloud/account');
  mod.Account.init();
  return { ...mod, SaveService: save.SaveService };
}

describe('аккаунт (Supabase подменён)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fake.cloud = null;
    SaveService.setBackend(memoryBackend());
  });

  it('без ключей вход выключен, игра работает локально', async () => {
    vi.resetModules();
    vi.stubEnv('VITE_SUPABASE_URL', '');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '');
    const { Account } = await import('../src/cloud/account');
    Account.init();
    expect(Account.configured).toBe(false);
    await expect(Account.signIn('a@b.co', '12345678')).rejects.toThrow('Вход пока не настроен');
  });

  it('регистрация: с подтверждением почты — просим открыть письмо', async () => {
    const { Account } = await freshAccount();
    fake.signUp.mockResolvedValue({ data: { user: { id: 'u1', identities: [{}] }, session: null }, error: null });
    await expect(Account.signUp(' Anna@Mail.com ', '12345678')).resolves.toBe('confirm_email');
    expect(fake.signUp).toHaveBeenCalledWith(expect.objectContaining({ email: 'anna@mail.com', password: '12345678' }));
  });

  it('регистрация на занятый email — понятная ошибка', async () => {
    const { Account } = await freshAccount();
    fake.signUp.mockResolvedValue({ data: { user: { id: 'u1', identities: [] }, session: null }, error: null });
    await expect(Account.signUp('anna@mail.com', '12345678')).rejects.toThrow('уже зарегистрирован');
  });

  it('вход с неверным паролем — понятная ошибка', async () => {
    const { Account } = await freshAccount();
    fake.signInWithPassword.mockResolvedValue({ error: { code: 'invalid_credentials', message: 'Invalid login credentials' } });
    await expect(Account.signIn('anna@mail.com', 'wrongpass')).rejects.toThrow('Неверный email или пароль');
  });

  it('после входа гостевой прогресс уходит в облако аккаунта', async () => {
    vi.useFakeTimers();
    const { Account, SaveService: S } = await freshAccount();
    S.update((d) => (d.progress.stars = { 1: 3, 2: 2 }));
    fake.listener!('SIGNED_IN', { user: { id: 'u1', email: 'anna@mail.com' } });
    expect(Account.user).toEqual({ id: 'u1', email: 'anna@mail.com' });
    await vi.advanceTimersByTimeAsync(10);
    expect((fake.cloud as { progress: { stars: object } }).progress.stars).toEqual({ 1: 3, 2: 2 });
    vi.useRealTimers();
  });

  it('выход: на устройстве — чистый гость, лог и звук остаются', async () => {
    const { Account, SaveService: S } = await freshAccount();
    S.update((d) => {
      d.progress.stars = { 1: 3 };
      d.progress.muted = true;
      d.profile.name = 'Анна';
      d.log.push({ t: 'x', ev: 'session' });
    });
    await Account.signOut();
    const d = S.load();
    expect(d.progress.stars).toEqual({});
    expect(d.progress.muted).toBe(true);
    expect(d.profile.name).toBeNull();
    expect(d.log.map((e) => e.ev)).toEqual(['session', 'logout']);
  });

  it('удаление аккаунта вызывает функцию в базе и сбрасывает устройство', async () => {
    const { Account, SaveService: S } = await freshAccount();
    S.update((d) => (d.progress.stars = { 1: 3 }));
    await Account.deleteAccount();
    expect(fake.rpc).toHaveBeenCalledWith('delete_my_account');
    expect(S.load().progress.stars).toEqual({});
  });

  it('сброс пароля и новый пароль', async () => {
    const { Account } = await freshAccount();
    await Account.requestPasswordReset('Anna@Mail.com');
    expect(fake.resetPasswordForEmail).toHaveBeenCalledWith('anna@mail.com', expect.anything());
    await Account.updatePassword('newpassword1');
    expect(fake.updateUser).toHaveBeenCalledWith({ password: 'newpassword1' });
  });

  it('ссылка «сбросить пароль» открывает форму нового пароля', async () => {
    const { Account } = await freshAccount();
    const events: string[] = [];
    Account.on((e) => events.push(e.type));
    fake.listener!('PASSWORD_RECOVERY', { user: { id: 'u1', email: 'anna@mail.com' } });
    expect(events).toContain('recovery');
  });
});
