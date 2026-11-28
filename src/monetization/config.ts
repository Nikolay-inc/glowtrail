// Настройки рекламы и покупок (Р4). Сейчас — тестовый режим: официальные тестовые ID Google (реклама «Test Ad»,
// деньги не идут) и ключ RevenueCat из .env (нет ключа — покупки идут через тестовую заглушку, см. store.ts).
// Боевые значения подставляются здесь же через переменные окружения сборки (.env.app), код игры не меняется:
//   VITE_ADMOB_TEST=0                       — выключить тестовый режим (боевые ID ниже обязательны);
//   VITE_ADMOB_IOS_REWARDED / _INTERSTITIAL — ID рекламных блоков iOS (ca-app-pub-…/…);
//   VITE_ADMOB_ANDROID_REWARDED / _INTERSTITIAL — то же для Android;
//   VITE_REVENUECAT_IOS_KEY / VITE_REVENUECAT_ANDROID_KEY — публичные ключи RevenueCat (appl_… / goog_…).
// ID приложения AdMob (GADApplicationIdentifier) — в ios/App/App/Info.plist и в AndroidManifest (meta-data
// com.google.android.gms.ads.APPLICATION_ID): сейчас тестовые ID Google, их нужно заменить вместе с блоками.

type Env = Record<string, string | boolean | undefined>;
const env: Env = (import.meta as { env?: Env }).env ?? {};
const s = (k: string, e: Env = env) => (typeof e[k] === 'string' ? (e[k] as string).trim() : '');

/** Тестовый режим: тестовые рекламные блоки Google и тестовый запрос согласия. Выключается только явно. */
export const TEST_MODE = s('VITE_ADMOB_TEST') !== '0';

/** Bundle ID / applicationId — префикс идентификаторов товаров (`com.severgames.glowtrail.noads`). */
export const APP_ID = 'com.severgames.glowtrail';

/** Официальные тестовые ID Google (https://developers.google.com/admob/ios/test-ads, …/android/test-ads). */
export const GOOGLE_TEST_IDS = {
  ios: { app: 'ca-app-pub-3940256099942544~1458002511', rewarded: 'ca-app-pub-3940256099942544/1712485313', interstitial: 'ca-app-pub-3940256099942544/4411468910' },
  android: { app: 'ca-app-pub-3940256099942544~3347511713', rewarded: 'ca-app-pub-3940256099942544/5224354917', interstitial: 'ca-app-pub-3940256099942544/1033173712' },
} as const;

export type AdPlatform = 'ios' | 'android';

/** ID рекламных блоков платформы: в тестовом режиме — тестовые Google, иначе — из переменных окружения. */
export function adUnits(platform: AdPlatform, e: Env = env, test = TEST_MODE): { rewarded: string; interstitial: string } {
  if (test) return { rewarded: GOOGLE_TEST_IDS[platform].rewarded, interstitial: GOOGLE_TEST_IDS[platform].interstitial };
  const P = platform.toUpperCase();
  return { rewarded: s(`VITE_ADMOB_${P}_REWARDED`, e), interstitial: s(`VITE_ADMOB_${P}_INTERSTITIAL`, e) };
}

/** Публичный ключ RevenueCat платформы (пусто — покупки через тестовую заглушку в тестовом режиме, иначе выключены). */
export function revenueCatKey(platform: AdPlatform, e: Env = env): string {
  return s(platform === 'ios' ? 'VITE_REVENUECAT_IOS_KEY' : 'VITE_REVENUECAT_ANDROID_KEY', e);
}

/** Право (entitlement) RevenueCat «без рекламы»: его дают товары noads и starter (настраивается в RevenueCat). */
export const ENTITLEMENT_NO_ADS = 'no_ads';

/** Идентификатор товара в сторе: `<bundle id>.<имя>`. */
export const productId = (key: string) => `${APP_ID}.${key}`;

/**
 * Запрос рекламы: детский контент — нет (игра 4+, но не «для детей»), максимальный рейтинг рекламы — PG.
 * Передаётся в AdMob.initialize.
 */
export const AD_REQUEST = { maxAdContentRating: 'ParentalGuidance', tagForChildDirectedTreatment: false, tagForUnderAgeOfConsent: false } as const;

/** Сколько ждём загрузки ролика по нажатию кнопки, прежде чем сказать «не загрузился». */
export const AD_LOAD_TIMEOUT_MS = 8000;
/** На сколько прячем кнопки роликов, если ролик не загрузился. */
export const AD_RETRY_MS = 60_000;

/**
 * Текст системного запроса ATT (NSUserTrackingUsageDescription) — ключ i18n; `npm run ios:strings` пишет его
 * на всех языках в ios/App/App/<язык>.lproj/InfoPlist.strings, тест сверяет файлы с переводами.
 */
export const ATT_TEXT_KEY = 'att_description';
