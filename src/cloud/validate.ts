// Проверка полей формы и понятные тексты ошибок Supabase на русском.

export const PASSWORD_MIN = 8;

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

/** null — всё хорошо, иначе текст ошибки. */
export function validateEmail(raw: string): string | null {
  const email = normalizeEmail(raw);
  if (!email) return 'Введи email';
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return 'Похоже, в email опечатка';
  return null;
}

export function validatePassword(pw: string): string | null {
  if (!pw) return 'Введи пароль';
  if (pw.length < PASSWORD_MIN) return `Пароль — не короче ${PASSWORD_MIN} символов`;
  if (pw.length > 72) return 'Пароль слишком длинный (до 72 символов)';
  return null;
}

export function validatePasswordPair(pw: string, repeat: string): string | null {
  return validatePassword(pw) ?? (pw === repeat ? null : 'Пароли не совпадают');
}

/** Ошибки Supabase Auth по коду (error.code) или по тексту — на понятный русский. */
export function authErrorMessage(err: unknown): string {
  const e = (err ?? {}) as { code?: string; message?: string; name?: string; status?: number };
  const code = e.code ?? '';
  const msg = (e.message ?? '').toLowerCase();
  const byCode: Record<string, string> = {
    invalid_credentials: 'Неверный email или пароль',
    email_not_confirmed: 'Почта ещё не подтверждена — открой письмо и нажми ссылку',
    user_already_exists: 'Этот email уже зарегистрирован — войди',
    email_exists: 'Этот email уже зарегистрирован — войди',
    weak_password: `Слишком простой пароль — сделай его длиннее (от ${PASSWORD_MIN} символов)`,
    same_password: 'Новый пароль совпадает со старым',
    email_address_invalid: 'Этот email не подходит — проверь адрес',
    over_email_send_rate_limit: 'Слишком много писем подряд — попробуй через несколько минут',
    over_request_rate_limit: 'Слишком много попыток — подожди минуту',
    signup_disabled: 'Регистрация сейчас выключена',
    session_not_found: 'Сессия истекла — войди ещё раз',
    otp_expired: 'Ссылка из письма устарела — запроси новую',
  };
  if (byCode[code]) return byCode[code];
  if (msg.includes('invalid login')) return byCode.invalid_credentials;
  if (msg.includes('not confirmed')) return byCode.email_not_confirmed;
  if (msg.includes('already registered')) return byCode.user_already_exists;
  if (e.name === 'AuthRetryableFetchError' || msg.includes('failed to fetch') || msg.includes('network')) {
    return 'Нет связи с сервером — проверь интернет';
  }
  return 'Что-то пошло не так — попробуй ещё раз';
}
