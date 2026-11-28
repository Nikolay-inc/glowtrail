// Реклама за интерфейсом: в приложении — AdMob (@capacitor-community/admob: ролики с наградой, межуровневая,
// форма согласия Google UMP, запрос ATT на iOS), в веб-версии — заглушка без рекламы (supported = false).
// Для проверки в браузере и тестов: ?ads=fake — «тестовый ролик» поверх страницы (?ads=fail — не загружается).
// Игра и тесты работают без нативной части: SDK подгружается лениво и только в приложении.

import { isNative, platform } from '../platform';
import { AD_LOAD_TIMEOUT_MS, AD_REQUEST, adUnits, TEST_MODE, type AdPlatform } from './config';
import { analyticsFromTcf } from './rules';

export type RewardedResult = 'rewarded' | 'dismissed' | 'failed';
export type TrackingStatus = 'authorized' | 'denied' | 'notDetermined' | 'restricted' | 'unsupported';

export interface ConsentResult {
  /** Форма UMP была на экране. */
  formShown: boolean;
  /** Решение об анонимной статистике из формы (null — форма не про это или не показывалась). */
  analytics: 'yes' | 'no' | null;
  /** Рекламу можно запрашивать (согласие получено или не нужно). */
  canRequestAds: boolean;
}

export interface AdsProvider {
  readonly kind: 'admob' | 'fake' | 'none';
  /** Реклама есть на этой платформе. */
  readonly supported: boolean;
  /** Форма согласия Google UMP (показывается, только если нужна: ЕС/ЕЭЗ, Великобритания, Швейцария). */
  gatherConsent(): Promise<ConsentResult>;
  /** Нужна ли кнопка «Настройки конфиденциальности» (форма UMP доступна повторно). */
  privacyOptionsAvailable(): boolean;
  /** Открыть форму UMP снова (из профиля). */
  showPrivacyOptions(): Promise<ConsentResult | null>;
  trackingStatus(): Promise<TrackingStatus>;
  /** Системный запрос ATT (iOS): «Разрешить приложению отслеживать…». */
  requestTracking(): Promise<TrackingStatus>;
  /** Запустить SDK рекламы (после согласия) и начать загрузку роликов. */
  start(): Promise<void>;
  /** Показать ролик с наградой (ждёт загрузки до AD_LOAD_TIMEOUT_MS). */
  showRewarded(): Promise<RewardedResult>;
  /** Показать межуровневую рекламу, если загружена; false — не показали. */
  showInterstitial(): Promise<boolean>;
}

const NO_CONSENT: ConsentResult = { formShown: false, analytics: null, canRequestAds: false };

/** Веб-версия (GitHub Pages): рекламы нет. */
export const noAds: AdsProvider = {
  kind: 'none',
  supported: false,
  gatherConsent: async () => NO_CONSENT,
  privacyOptionsAvailable: () => false,
  showPrivacyOptions: async () => null,
  trackingStatus: async () => 'unsupported',
  requestTracking: async () => 'unsupported',
  start: async () => undefined,
  showRewarded: async () => 'failed',
  showInterstitial: async () => false,
};

/** Тестовая реклама для браузера и тестов: «ролик» — затемнение с надписью на ~1,2 с. */
export function fakeAds(opts: { fail?: boolean; ms?: number } = {}): AdsProvider & { shown: { rewarded: number; interstitial: number } } {
  const shown = { rewarded: 0, interstitial: 0 };
  const overlay = (label: string, ms: number) =>
    new Promise<void>((resolve) => {
      if (typeof document === 'undefined') return void setTimeout(resolve, 0);
      const el = document.createElement('div');
      el.setAttribute('data-test-ad', label);
      el.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#000c;color:#fff;display:flex;align-items:center;justify-content:center;font:bold 28px sans-serif';
      el.textContent = `Test Ad · ${label}`;
      document.body.appendChild(el);
      setTimeout(() => (el.remove(), resolve()), ms);
    });
  return {
    kind: 'fake',
    supported: true,
    shown,
    gatherConsent: async () => ({ formShown: false, analytics: null, canRequestAds: true }),
    privacyOptionsAvailable: () => true,
    showPrivacyOptions: async () => ({ formShown: true, analytics: null, canRequestAds: true }),
    trackingStatus: async () => 'unsupported',
    requestTracking: async () => 'unsupported',
    start: async () => undefined,
    showRewarded: async () => {
      if (opts.fail) return 'failed';
      shown.rewarded++;
      await overlay('rewarded', opts.ms ?? 1200);
      return 'rewarded';
    },
    showInterstitial: async () => {
      if (opts.fail) return false;
      shown.interstitial++;
      await overlay('interstitial', opts.ms ?? 1200);
      return true;
    },
  };
}

// ---------------------------------------------------------------------------
// AdMob (приложение)

type AdMobModule = typeof import('@capacitor-community/admob');
type AdMobApi = AdMobModule['AdMob'] & {
  /** Свой метод (patches/@capacitor-community+admob): строки IAB TCF из формы UMP. */
  getTcfConsent?: () => Promise<{ purposeConsents: string; gdprApplies: number }>;
};

function admobAds(os: AdPlatform): AdsProvider {
  let mod: AdMobModule | null = null;
  const load = async () => (mod ??= await import('@capacitor-community/admob'));
  const api = async () => (await load()).AdMob as AdMobApi;
  const units = adUnits(os);
  let started = false;
  let privacyRequired = false;
  let rewardedReady: Promise<boolean> | null = null;
  let interstitialReady: Promise<boolean> | null = null;

  const tcf = async (): Promise<'yes' | 'no' | null> => {
    try {
      const a = await api();
      if (!a.getTcfConsent) return null;
      const r = await a.getTcfConsent();
      return analyticsFromTcf(r.purposeConsents, r.gdprApplies);
    } catch {
      return null;
    }
  };

  const consentInfo = async () => {
    const a = await api();
    const m = await load();
    // Тестовый режим: форма как в ЕЭЗ — её видно и в симуляторе (боевой режим — по настоящей стране).
    const info = await a.requestConsentInfo(TEST_MODE ? { debugGeography: m.AdmobConsentDebugGeography.EEA } : {});
    privacyRequired = info.privacyOptionsRequirementStatus === 'REQUIRED';
    return info;
  };

  const prepareRewarded = () =>
    (rewardedReady ??= (async () => {
      const a = await api();
      await a.prepareRewardVideoAd({ adId: units.rewarded });
      return true;
    })().catch(() => {
      rewardedReady = null;
      return false;
    }));
  const prepareInterstitial = () =>
    (interstitialReady ??= (async () => {
      const a = await api();
      await a.prepareInterstitial({ adId: units.interstitial });
      return true;
    })().catch(() => {
      interstitialReady = null;
      return false;
    }));

  const status = async (): Promise<TrackingStatus> => {
    if (os !== 'ios') return 'unsupported';
    try {
      return (await (await api()).trackingAuthorizationStatus()).status;
    } catch {
      return 'unsupported';
    }
  };

  return {
    kind: 'admob',
    supported: !!units.rewarded && !!units.interstitial,
    async gatherConsent() {
      try {
        const a = await api();
        const m = await load();
        const info = await consentInfo();
        let formShown = false;
        let can = info.canRequestAds;
        if (info.isConsentFormAvailable && info.status === m.AdmobConsentStatus.REQUIRED) {
          const after = await a.showConsentForm();
          formShown = true;
          can = after.canRequestAds;
          privacyRequired = after.privacyOptionsRequirementStatus === 'REQUIRED';
        }
        return { formShown, analytics: await tcf(), canRequestAds: can };
      } catch {
        // Нет сети или форма не настроена в AdMob — рекламу всё равно можно (неперсонализированную решит SDK).
        return { formShown: false, analytics: await tcf(), canRequestAds: true };
      }
    },
    privacyOptionsAvailable: () => privacyRequired || TEST_MODE,
    async showPrivacyOptions() {
      try {
        const a = await api();
        if (!privacyRequired) await consentInfo();
        await a.showPrivacyOptionsForm();
        return { formShown: true, analytics: await tcf(), canRequestAds: true };
      } catch {
        return null;
      }
    },
    trackingStatus: status,
    async requestTracking() {
      if (os !== 'ios') return 'unsupported';
      try {
        await (await api()).requestTrackingAuthorization();
      } catch {
        /* нет ATT — считаем как есть */
      }
      return status();
    },
    async start() {
      if (started) return;
      started = true;
      try {
        const a = await api();
        const m = await load();
        await a.initialize({
          maxAdContentRating: m.MaxAdContentRating.ParentalGuidance,
          tagForChildDirectedTreatment: AD_REQUEST.tagForChildDirectedTreatment,
          tagForUnderAgeOfConsent: AD_REQUEST.tagForUnderAgeOfConsent,
          initializeForTesting: TEST_MODE,
        });
        void prepareRewarded();
        void prepareInterstitial();
      } catch {
        started = false;
      }
    },
    async showRewarded() {
      await this.start();
      const ready = await Promise.race([prepareRewarded(), new Promise<boolean>((r) => setTimeout(() => r(false), AD_LOAD_TIMEOUT_MS))]);
      if (!ready) return 'failed';
      const a = await api();
      const m = await load();
      rewardedReady = null;
      // showRewardVideoAd выполняется только при награде; закрыл раньше — приходит лишь Dismissed.
      let rewarded = false;
      const result = await new Promise<RewardedResult>((resolve) => {
        const handles: Promise<{ remove: () => Promise<void> }>[] = [];
        const done = (r: RewardedResult) => {
          for (const h of handles) void h.then((x) => x.remove()).catch(() => undefined);
          resolve(r);
        };
        handles.push(a.addListener(m.RewardAdPluginEvents.Rewarded, () => (rewarded = true)));
        handles.push(a.addListener(m.RewardAdPluginEvents.Dismissed, () => setTimeout(() => done(rewarded ? 'rewarded' : 'dismissed'), 300)));
        handles.push(a.addListener(m.RewardAdPluginEvents.FailedToShow, () => done('failed')));
        a.showRewardVideoAd()
          .then(() => (rewarded = true))
          .catch(() => done('failed'));
      });
      void prepareRewarded();
      return result;
    },
    async showInterstitial() {
      if (!started) return false;
      const ready = await Promise.race([prepareInterstitial(), new Promise<boolean>((r) => setTimeout(() => r(false), 300))]);
      if (!ready) return false;
      const a = await api();
      const m = await load();
      interstitialReady = null;
      const shown = await new Promise<boolean>((resolve) => {
        const handles: Promise<{ remove: () => Promise<void> }>[] = [];
        const done = (v: boolean) => {
          for (const h of handles) void h.then((x) => x.remove()).catch(() => undefined);
          resolve(v);
        };
        handles.push(a.addListener(m.InterstitialAdPluginEvents.Dismissed, () => done(true)));
        handles.push(a.addListener(m.InterstitialAdPluginEvents.FailedToShow, () => done(false)));
        a.showInterstitial().catch(() => done(false));
      });
      void prepareInterstitial();
      return shown;
    },
  };
}

/** Реклама для этой платформы: приложение — AdMob, браузер — без рекламы (или ?ads=fake для проверки). */
export function createAds(): AdsProvider {
  if (isNative()) {
    const os = platform();
    if (os === 'ios' || os === 'android') return admobAds(os);
  }
  // Тестовая реклама — только при разработке (npm run dev, проверка вёрстки), в собранный сайт не попадает.
  const q = import.meta.env.DEV && typeof location !== 'undefined' ? new URLSearchParams(location.search).get('ads') : null;
  if (q === 'fake' || q === 'fail') return fakeAds({ fail: q === 'fail' });
  return noAds;
}
