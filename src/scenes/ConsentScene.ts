// Согласие при первом запуске — не больше двух экранов подряд:
//  - в приложении: форма Google UMP (реклама; в ЕС/ЕЭЗ, Великобритании, Швейцарии — обязательна, в других странах
//    не показывается), решение об анонимной статистике берётся из неё (src/monetization/rules.ts analyticsFromTcf);
//    затем системный запрос ATT (iOS). Если формы UMP не было (не настроена, нет сети), а согласие на статистику
//    в этой стране нужно, — вместо неё наш экран про статистику;
//  - в веб-версии рекламы нет — только наш экран про статистику (ЕС, один раз).
// Выбор меняется в профиле («Настройки конфиденциальности», переключатель статистики). После — туда, куда шла игра.

import Phaser from 'phaser';
import { t } from '../i18n';
import { analyticsChoice, consentScreenDue, setAnalyticsChoice } from '../analytics/index';
import { sfx } from '../audio';
import { openPrivacy } from '../feedback';
import { adsProvider, gatherConsent, requestTracking, startAds, trackingStatus } from '../monetization/index';
import type { ConsentResult } from '../monetization/ads';
import { SaveService } from '../save/SaveService';
import { addBackground, Button } from '../ui/draw';
import { Modal } from '../ui/Modal';

export interface ConsentSceneData {
  next: string;
  data?: object;
}

/** Первый запуск: нужен ли этот экран (в приложении — согласие на рекламу и ATT, в вебе — статистика в ЕС). */
export function privacyFlowDue(): boolean {
  if (adsProvider().kind === 'admob') return !SaveService.load().progress.privacyAsked;
  return consentScreenDue();
}

/** Решение из формы UMP → выбор про статистику (если отличается от текущего). */
export function applyConsentAnalytics(choice: 'yes' | 'no' | null) {
  if (choice && analyticsChoice() !== choice) setAnalyticsChoice(choice, 'ump');
}

export class ConsentScene extends Phaser.Scene {
  constructor() {
    super('Consent');
  }

  create(data: ConsentSceneData) {
    addBackground(this);
    const go = () => {
      SaveService.update((d) => void (d.progress.privacyAsked = true));
      this.scene.start(data?.next ?? 'Menu', data?.data);
    };
    if (adsProvider().kind !== 'admob') {
      showConsent(this, (choice) => {
        setAnalyticsChoice(choice, 'consent');
        go();
      });
      return;
    }
    void (async () => {
      // 1. Форма Google UMP (если нужна в этой стране). Без сети запрос может долго висеть — не держим игру дольше 10 с.
      const r = await Promise.race([gatherConsent(), new Promise<ConsentResult>((res) => setTimeout(() => res({ formShown: false, analytics: null, canRequestAds: true }), 10_000))]);
      applyConsentAnalytics(r.analytics);
      // Формы не было, а согласие на статистику нужно — наш экран (тогда он первый из двух).
      if (!r.formShown && !r.analytics && consentScreenDue()) {
        const choice = await new Promise<'yes' | 'no'>((resolve) => showConsent(this, resolve));
        setAnalyticsChoice(choice, 'consent');
      }
      // 2. Запрос ATT (iOS): реклама с идентификатором — только если игрок разрешит.
      if ((await trackingStatus()) === 'notDetermined') await requestTracking();
      void startAds();
      go();
    })();
  }
}

/** Окно «Помогать улучшать игру анонимной статистикой?» (и для аудита вёрстки). */
export function showConsent(scene: Phaser.Scene, onChoice: (choice: 'yes' | 'no') => void) {
  const m = new Modal(scene, { w: 940, closable: false, depth: 60 });
  m.title(t('consent_title'), 58);
  m.text(t('consent_text'), 36, undefined, 6);
  m.text(t('consent_note'), 30, undefined, 3);
  const pick = (choice: 'yes' | 'no') => {
    sfx.tap();
    m.close(true);
    onChoice(choice);
  };
  const no = new Button(scene, 0, 0, {
    w: 340,
    h: 116,
    label: t('consent_no'),
    fontSize: 36,
    onClick: () => pick('no'),
  });
  const yes = new Button(scene, 0, 0, {
    w: 380,
    h: 116,
    label: t('consent_yes'),
    fontSize: 38,
    primary: true,
    onClick: () => pick('yes'),
  });
  m.buttons([no, yes]);
  m.buttons([
    new Button(scene, 0, 0, {
      w: 460,
      h: 84,
      icon: 'lock',
      label: t('privacy'),
      fontSize: 28,
      onClick: () => (sfx.tap(), openPrivacy()),
    }),
  ]);
  m.open();
  return m;
}
