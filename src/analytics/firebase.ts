// Firebase Analytics и Remote Config. В приложении — нативные плагины @capacitor-firebase (настройки из
// GoogleService-Info.plist / google-services.json), в вебе — Firebase JS SDK (веб-конфиг из переменных окружения).
// Без рекламного идентификатора: рекламные согласия всегда «запрещено», Google Signals и рекламная персонализация
// выключены, в iOS-сборке нет IDFA (FirebaseAnalyticsCore), запрос ATT не нужен.
// Всё загружается лениво: без ключей или без согласия код Firebase даже не скачивается.

import { isNative } from '../platform';
import { firebaseWebConfig } from './config';
import type { EventParams } from './events';
import { applyRemote, REMOTE_DEFAULTS, type RemoteKey } from './remoteConfig';

type Backend = {
  log(name: string, params: EventParams): Promise<void>;
  setUserProperty(key: string, value: string): Promise<void>;
  setEnabled(on: boolean): Promise<void>;
  fetchRemote(): Promise<Record<string, unknown>>;
};

let backend: Backend | null = null;
let starting: Promise<Backend | null> | null = null;
let enabled = false;
/** События до готовности Firebase (не больше 100). */
const queue: { name: string; params: EventParams }[] = [];
const props = new Map<string, string>();
/** Веб: ?analytics_debug=1 — события видны в DebugView. */
const debugMode = typeof location !== 'undefined' && new URLSearchParams(location.search).has('analytics_debug');

const withTimeout = <T>(p: Promise<T>, ms: number): Promise<T | undefined> => Promise.race([p, new Promise<undefined>((r) => setTimeout(() => r(undefined), ms))]);

async function nativeBackend(): Promise<Backend | null> {
  const [{ FirebaseAnalytics, ConsentType, ConsentStatus }, { FirebaseRemoteConfig, GetValueSource }] = await Promise.all([
    import('@capacitor-firebase/analytics'),
    import('@capacitor-firebase/remote-config'),
  ]);
  try {
    // Без GoogleService-Info.plist / google-services.json плагин отвечает ошибкой «не настроен».
    await FirebaseAnalytics.setEnabled({ enabled: false });
    for (const type of [ConsentType.AdStorage, ConsentType.AdUserData, ConsentType.AdPersonalization]) {
      await FirebaseAnalytics.setConsent({
        type,
        status: ConsentStatus.Denied,
      });
    }
    await FirebaseAnalytics.setConsent({
      type: ConsentType.AnalyticsStorage,
      status: ConsentStatus.Granted,
    });
  } catch {
    return null;
  }
  return {
    log: (name, params) => FirebaseAnalytics.logEvent({ name, params }),
    setUserProperty: (key, value) => FirebaseAnalytics.setUserProperty({ key, value }),
    setEnabled: (on) => FirebaseAnalytics.setEnabled({ enabled: on }),
    async fetchRemote() {
      await FirebaseRemoteConfig.fetchAndActivate();
      const out: Record<string, unknown> = {};
      for (const key of Object.keys(REMOTE_DEFAULTS) as RemoteKey[]) {
        const v = await FirebaseRemoteConfig.getString({ key });
        // Значение из консоли Firebase; ключа там нет — остаётся значение по умолчанию из кода.
        if (v.source === GetValueSource.Remote) out[key] = v.value;
      }
      return out;
    },
  };
}

async function webBackend(): Promise<Backend | null> {
  const cfg = firebaseWebConfig();
  if (!cfg) return null;
  const [{ initializeApp }, an, rc] = await Promise.all([import('firebase/app'), import('firebase/analytics'), import('firebase/remote-config')]);
  const app = initializeApp(cfg);
  let analytics: import('firebase/analytics').Analytics | null = null;
  // Analytics создаём только при включённой статистике: при создании веб-SDK сразу шлёт page_view.
  const ensure = async () => {
    if (analytics) return analytics;
    if (!(await an.isSupported().catch(() => false))) return null;
    an.setConsent({
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
      analytics_storage: 'granted',
    });
    analytics = an.initializeAnalytics(app, {
      config: {
        allow_google_signals: false,
        allow_ad_personalization_signals: false,
      },
    });
    return analytics;
  };
  const remoteConfig = rc.getRemoteConfig(app);
  remoteConfig.settings.minimumFetchIntervalMillis = 60 * 60 * 1000;
  remoteConfig.settings.fetchTimeoutMillis = 2000;
  remoteConfig.defaultConfig = { ...REMOTE_DEFAULTS };
  return {
    async log(name, params) {
      if (analytics) an.logEvent(analytics, name, debugMode ? { ...params, debug_mode: 1 } : params);
    },
    async setUserProperty(key, value) {
      if (analytics) an.setUserProperties(analytics, { [key]: value });
    },
    async setEnabled(on) {
      const a = on ? await ensure() : analytics;
      if (a) an.setAnalyticsCollectionEnabled(a, on);
    },
    async fetchRemote() {
      await rc.fetchAndActivate(remoteConfig);
      const out: Record<string, unknown> = {};
      for (const [key, v] of Object.entries(rc.getAll(remoteConfig))) if (v.getSource() === 'remote') out[key] = v.asString();
      return out;
    },
  };
}

/** Запуск Firebase (один раз). null — не настроен (нет ключей или файлов конфигурации). */
function start(): Promise<Backend | null> {
  starting ??= (isNative() ? nativeBackend() : webBackend())
    .catch(() => null)
    .then((b) => {
      backend = b;
      if (!b) queue.length = 0;
      return b;
    });
  return starting;
}

/** Remote Config при старте: ждём не дольше timeoutMs, потом игра идёт со значениями по умолчанию. */
export async function loadRemoteConfig(timeoutMs = 2000): Promise<void> {
  const job = (async () => {
    const b = await start();
    if (!b) return;
    const raw = await b.fetchRemote().catch(() => null);
    if (raw) applyRemote(raw);
  })();
  await withTimeout(job, timeoutMs);
}

/** Включить или выключить сбор статистики (согласие игрока). */
export async function setAnalyticsEnabled(on: boolean) {
  enabled = on;
  if (!on) queue.length = 0;
  const b = await start();
  if (!b) return;
  await b.setEnabled(on).catch(() => undefined);
  if (on) {
    for (const [k, v] of props) void b.setUserProperty(k, v).catch(() => undefined);
    flush();
  }
}

function flush() {
  if (!backend || !enabled) return;
  for (const e of queue.splice(0)) void backend.log(e.name, e.params).catch(() => undefined);
}

/** Событие в Firebase (только при включённой статистике). */
export function track(name: string, params: EventParams) {
  if (!enabled) return;
  if (import.meta.env.DEV) console.debug(`[analytics] ${name} ${JSON.stringify(params)}`);
  if (backend) void backend.log(name, params).catch(() => undefined);
  else if (queue.length < 100) queue.push({ name, params });
}

/** Свойства игрока: отправляем только изменившиеся. */
export function setUserProperties(next: Record<string, string>) {
  for (const [k, v] of Object.entries(next)) {
    if (props.get(k) === v) continue;
    props.set(k, v);
    if (enabled && backend) void backend.setUserProperty(k, v).catch(() => undefined);
  }
}

export const firebaseReady = () => backend !== null;
