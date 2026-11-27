// Ключи аналитики и отчётов об ошибках — из переменных окружения сборки, не из кода.
// Нет ключей — Firebase (в вебе) и Sentry выключены, игра работает как раньше.
// В приложении Firebase настраивается файлами GoogleService-Info.plist (iOS) и google-services.json (Android);
// без них нативный плагин просто отвечает «не настроен» (см. patches/).

export interface FirebaseWebConfig {
  apiKey: string;
  authDomain?: string;
  projectId: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId: string;
  measurementId: string;
}

type Env = Record<string, string | boolean | undefined>;

/** Веб-конфиг Firebase (Project settings → Your apps → Web app). Без apiKey, appId и measurementId — null. */
export function firebaseWebConfig(env: Env = import.meta.env): FirebaseWebConfig | null {
  const s = (k: string) => (typeof env[k] === 'string' ? (env[k] as string).trim() : '');
  const cfg: FirebaseWebConfig = {
    apiKey: s('VITE_FIREBASE_API_KEY'),
    authDomain: s('VITE_FIREBASE_AUTH_DOMAIN') || undefined,
    projectId: s('VITE_FIREBASE_PROJECT_ID'),
    storageBucket: s('VITE_FIREBASE_STORAGE_BUCKET') || undefined,
    messagingSenderId: s('VITE_FIREBASE_MESSAGING_SENDER_ID') || undefined,
    appId: s('VITE_FIREBASE_APP_ID'),
    measurementId: s('VITE_FIREBASE_MEASUREMENT_ID'),
  };
  return cfg.apiKey && cfg.appId && cfg.projectId && cfg.measurementId ? cfg : null;
}

/** DSN проекта Sentry (публичный, можно хранить в .env.production). Пусто — Sentry выключен. */
export function sentryDsn(env: Env = import.meta.env): string {
  const v = env.VITE_SENTRY_DSN;
  return typeof v === 'string' && /^https:\/\/[^@]+@[^/]+\/\d+$/.test(v.trim()) ? v.trim() : '';
}
