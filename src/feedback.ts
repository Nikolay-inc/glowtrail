// «Отправить отзыв» (для тестеров): письмо разработчику с версией, устройством и статистикой игры.
// Полная статистика копируется в буфер обмена (письмо по ссылке mailto ограничено по длине), в само письмо
// уходит начало статистики. Адрес — из VITE_CONTACT_EMAIL (.env.production / .env.app), в коде его нет.
// Политика конфиденциальности — страница на сайте игры (site/privacy.html → privacy.html в сборке).

import { t } from './i18n';
import { LEVELS } from './levels/index';
import { platform, WEB_URL } from './platform';
import { statsText } from './storage';
import { versionLabel } from './version';

/** Адрес для отзывов и контакта (задаётся в .env.*, пусто — кнопка отзыва подскажет, что не настроено). */
export const FEEDBACK_EMAIL: string = (import.meta.env.VITE_CONTACT_EMAIL as string | undefined) ?? '';
export const PRIVACY_URL = `${WEB_URL}privacy.html`;
/** Сколько символов статистики кладём прямо в письмо (длинные mailto-ссылки почтовые программы обрезают). */
const BODY_STATS = 1400;

export interface Feedback {
  subject: string;
  body: string;
  /** Полный текст для буфера обмена. */
  full: string;
  url: string;
}

/** Собрать письмо. Чистая функция — проверяется тестом. */
export function buildFeedback(to: string, stats: string, info: { version: string; platform: string; device: string }): Feedback {
  const head = [t('fb_version', { v: info.version }), t('fb_platform', { v: info.platform }), t('fb_device', { v: info.device })].join('\n');
  const full = `${head}\n\n${stats}`;
  const cut = stats.length > BODY_STATS ? `${stats.slice(0, BODY_STATS)}\n${t('fb_cut')}` : stats;
  const body = `${t('fb_hello')}\n\n\n\n— — —\n${head}\n\n${cut}`;
  const subject = t('fb_subject', { v: info.version });
  const url = `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  return { subject, body, full, url };
}

/** Открыть письмо: статистику — в буфер обмена, письмо — в почтовой программе. false — адрес не настроен. */
export async function sendFeedback(): Promise<boolean> {
  if (!FEEDBACK_EMAIL) return false;
  const fb = buildFeedback(FEEDBACK_EMAIL, statsText(LEVELS), { version: versionLabel(), platform: platform(), device: navigator.userAgent });
  try {
    await navigator.clipboard?.writeText(fb.full);
  } catch {
    /* без буфера — статистика всё равно в письме (начало) */
  }
  window.location.href = fb.url;
  return true;
}

/** Политика конфиденциальности — в браузере (в приложении откроется Safari). */
export function openPrivacy() {
  window.open(PRIVACY_URL, '_blank');
}
