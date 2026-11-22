// Настройки Supabase берутся из переменных окружения сборки (.env / .env.production).
// Если их нет — облачные функции выключены, игра работает как раньше (только локальное сохранение).

export const SUPABASE_URL: string = import.meta.env.VITE_SUPABASE_URL ?? '';
export const SUPABASE_ANON_KEY: string = import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';

export function cloudConfigured(): boolean {
  return SUPABASE_URL.startsWith('https://') && SUPABASE_ANON_KEY.length > 20;
}

/** Куда вернуть игрока по ссылке из письма (подтверждение почты, сброс пароля). */
export function redirectUrl(): string {
  if (typeof location === 'undefined') return '';
  return `${location.origin}${import.meta.env.BASE_URL}`;
}
