// Аккаунт игрока на Supabase Auth: регистрация и вход по email и паролю, выход, сброс пароля,
// удаление аккаунта. Играть можно и без аккаунта — он нужен, чтобы прогресс жил в облаке.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { Preferences } from '@capacitor/preferences';
import { isNative } from '../platform';
import { defaultProgress, emptySave, SaveService } from '../save/SaveService';
import { cloudConfigured, redirectUrl, SUPABASE_ANON_KEY, SUPABASE_URL } from './config';
import { CloudSync, type SyncStatus } from './sync';
import { supabaseStore } from './store';
import { authErrorMessage, normalizeEmail } from './validate';

export interface AccountUser {
  id: string;
  email: string | null;
}

/** changed — вошёл/вышел; recovery — пришёл по ссылке «сбросить пароль»; link_error — ссылка из письма не сработала. */
export type AccountEvent = { type: 'changed' } | { type: 'recovery' } | { type: 'link_error'; message: string } | { type: 'sync'; status: SyncStatus };

/** Хранилище сессии Supabase в приложении — на Preferences. */
const preferencesAuthStorage = {
  getItem: async (key: string) => (await Preferences.get({ key })).value,
  setItem: (key: string, value: string) => Preferences.set({ key, value }),
  removeItem: (key: string) => Preferences.remove({ key }),
};

/** Ошибка с текстом, который можно показать игроку. */
export class AccountError extends Error {}

class AccountService {
  private client: SupabaseClient | null = null;
  private sync: CloudSync | null = null;
  private listeners = new Set<(e: AccountEvent) => void>();
  user: AccountUser | null = null;

  get configured(): boolean {
    return this.client !== null;
  }

  get syncStatus(): SyncStatus {
    return this.sync?.status ?? 'off';
  }

  on(fn: (e: AccountEvent) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(e: AccountEvent) {
    for (const fn of this.listeners) fn(e);
  }

  /** Подключение к Supabase (если заданы ключи). Сессия восстанавливается сама. */
  init() {
    if (this.client || !cloudConfigured()) return;
    this.readLinkError();
    this.client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        flowType: 'pkce',
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: !isNative(),
        // В приложении вход хранится в Preferences (localStorage WebView система может очистить).
        storage: isNative() ? preferencesAuthStorage : undefined,
      },
    });
    this.sync = new CloudSync(supabaseStore(this.client));
    this.sync.onStatus((status) => this.emit({ type: 'sync', status }));
    this.client.auth.onAuthStateChange((event, session) => {
      const u = session?.user ?? null;
      this.user = u ? { id: u.id, email: u.email ?? null } : null;
      // Колбэк Supabase нельзя ждать изнутри — запускаем синхронизацию отдельно.
      setTimeout(() => {
        if (this.user) void this.sync!.start(this.user.id);
        else this.sync!.stop();
      }, 0);
      if (event === 'PASSWORD_RECOVERY') this.emit({ type: 'recovery' });
      this.emit({ type: 'changed' });
      this.cleanUrl();
    });
  }

  private api(): SupabaseClient {
    if (!this.client) throw new AccountError('Вход пока не настроен');
    return this.client;
  }

  /** Дописать отложенное сохранение в облако (приложение уходит в фон). */
  async flushSync(): Promise<void> {
    await this.sync?.flush().catch(() => undefined);
  }

  /** Регистрация. Если в проекте включено подтверждение почты — вернёт confirm_email. */
  async signUp(email: string, password: string): Promise<'signed_in' | 'confirm_email'> {
    const { data, error } = await this.api().auth.signUp({
      email: normalizeEmail(email),
      password,
      options: { emailRedirectTo: redirectUrl() },
    });
    if (error) throw new AccountError(authErrorMessage(error));
    // Supabase не раскрывает, что email занят: возвращает «пользователя» без способов входа.
    if (data.user && data.user.identities && data.user.identities.length === 0) {
      throw new AccountError(authErrorMessage({ code: 'user_already_exists' }));
    }
    SaveService.update((d) => void d.log.push({ t: new Date().toISOString(), ev: 'signup' }));
    return data.session ? 'signed_in' : 'confirm_email';
  }

  async signIn(email: string, password: string): Promise<void> {
    const { error } = await this.api().auth.signInWithPassword({ email: normalizeEmail(email), password });
    if (error) throw new AccountError(authErrorMessage(error));
    SaveService.update((d) => void d.log.push({ t: new Date().toISOString(), ev: 'login' }));
  }

  /** Выход: дописываем облако, а на устройстве начинаем с чистого гостевого сохранения. */
  async signOut(): Promise<void> {
    await this.sync?.flush();
    this.sync?.stop();
    await this.client?.auth.signOut({ scope: 'local' });
    this.resetToGuest();
    SaveService.update((d) => void d.log.push({ t: new Date().toISOString(), ev: 'logout' }));
  }

  /** Письмо со ссылкой для нового пароля. */
  async requestPasswordReset(email: string): Promise<void> {
    const { error } = await this.api().auth.resetPasswordForEmail(normalizeEmail(email), { redirectTo: redirectUrl() });
    if (error) throw new AccountError(authErrorMessage(error));
  }

  /** Новый пароль (после ссылки из письма или из профиля). */
  async updatePassword(password: string): Promise<void> {
    const { error } = await this.api().auth.updateUser({ password });
    if (error) throw new AccountError(authErrorMessage(error));
  }

  /** Удаление аккаунта и облачного сохранения (функция delete_my_account в базе). */
  async deleteAccount(): Promise<void> {
    const { error } = await this.api().rpc('delete_my_account');
    if (error) throw new AccountError(authErrorMessage(error));
    this.sync?.stop();
    await this.client?.auth.signOut({ scope: 'local' });
    this.resetToGuest();
  }

  /** Гостевое сохранение с нуля; лог событий и настройка звука остаются на устройстве. */
  private resetToGuest() {
    const current = SaveService.load();
    SaveService.replace({ ...emptySave(), progress: { ...defaultProgress(), muted: current.progress.muted }, log: current.log });
  }

  /** Ссылка из письма могла устареть — Supabase кладёт ошибку в адрес страницы. */
  private readLinkError() {
    if (typeof location === 'undefined') return;
    const params = new URLSearchParams(location.hash.replace(/^#/, '') || location.search);
    const code = params.get('error_code') ?? params.get('error');
    if (code) setTimeout(() => this.emit({ type: 'link_error', message: authErrorMessage({ code }) }), 0);
  }

  /** Убираем служебные параметры из адреса (code, error...), ?level=N оставляем. */
  private cleanUrl() {
    if (typeof location === 'undefined' || typeof history === 'undefined') return;
    const url = new URL(location.href);
    let changed = false;
    for (const k of ['code', 'error', 'error_code', 'error_description', 'type']) {
      if (url.searchParams.has(k)) {
        url.searchParams.delete(k);
        changed = true;
      }
    }
    if (url.hash.includes('error') || url.hash.includes('access_token')) {
      url.hash = '';
      changed = true;
    }
    if (changed) history.replaceState(null, '', url.toString());
  }
}

export const Account = new AccountService();
