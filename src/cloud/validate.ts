// Проверка полей формы и понятные тексты ошибок Supabase на русском.

import { t } from '../i18n';
export const PASSWORD_MIN = 8;

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

/** null — всё хорошо, иначе текст ошибки. */
export function validateEmail(raw: string): string | null {
  const email = normalizeEmail(raw);
  if (!email) return t('v_email_empty');
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return t('v_email_typo');
  return null;
}

export function validatePassword(pw: string): string | null {
  if (!pw) return t('v_pw_empty');
  if (pw.length < PASSWORD_MIN) return t('v_pw_short', { n: PASSWORD_MIN });
  if (pw.length > 72) return t('v_pw_long', { n: 72 });
  return null;
}

export function validatePasswordPair(pw: string, repeat: string): string | null {
  return validatePassword(pw) ?? (pw === repeat ? null : t('v_pw_mismatch'));
}

/** Ошибки Supabase Auth по коду (error.code) или по тексту — на понятный русский. */
export function authErrorMessage(err: unknown): string {
  const e = (err ?? {}) as { code?: string; message?: string; name?: string; status?: number };
  const code = e.code ?? '';
  const msg = (e.message ?? '').toLowerCase();
  const byCode: Record<string, string> = {
    invalid_credentials: t('e_invalid_credentials'),
    email_not_confirmed: t('e_email_not_confirmed'),
    user_already_exists: t('e_user_exists'),
    email_exists: t('e_user_exists'),
    weak_password: t('e_weak_password', { n: PASSWORD_MIN }),
    same_password: t('e_same_password'),
    email_address_invalid: t('e_email_invalid'),
    over_email_send_rate_limit: t('e_email_rate'),
    over_request_rate_limit: t('e_request_rate'),
    signup_disabled: t('e_signup_disabled'),
    session_not_found: t('e_session'),
    otp_expired: t('e_otp_expired'),
  };
  if (byCode[code]) return byCode[code];
  if (msg.includes('invalid login')) return byCode.invalid_credentials;
  if (msg.includes('not confirmed')) return byCode.email_not_confirmed;
  if (msg.includes('already registered')) return byCode.user_already_exists;
  if (e.name === 'AuthRetryableFetchError' || msg.includes('failed to fetch') || msg.includes('network')) {
    return t('e_network');
  }
  return t('e_generic');
}
