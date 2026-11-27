// Экран согласия на анонимную статистику: один раз при первом запуске в ЕС/ЕЭЗ, Великобритании и Швейцарии.
// «Да» — Firebase Analytics включается, «Нет» — выключен; выбор сохраняется и меняется в профиле.
// После выбора — туда, куда шла игра (вступление, обучение или карта).

import Phaser from 'phaser';
import { t } from '../i18n';
import { setAnalyticsChoice } from '../analytics/index';
import { sfx } from '../audio';
import { openPrivacy } from '../feedback';
import { addBackground, Button } from '../ui/draw';
import { Modal } from '../ui/Modal';

export interface ConsentSceneData {
  next: string;
  data?: object;
}

export class ConsentScene extends Phaser.Scene {
  constructor() {
    super('Consent');
  }

  create(data: ConsentSceneData) {
    addBackground(this);
    showConsent(this, (choice) => {
      setAnalyticsChoice(choice, 'consent');
      this.scene.start(data?.next ?? 'Menu', data?.data);
    });
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
