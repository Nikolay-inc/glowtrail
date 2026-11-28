// «Не хватает монет / света» в любом окне покупки: «Не хватает N» и 2–3 подсказки, где взять, с кнопкой «Играть»
// (уровни, где меньше 3 звёзд или есть несобранные светлячки, с ожидаемой наградой; новый уровень; награда дня),
// для монет — ещё «Докупить» (покупка в приложении, src/ui/storeUi.ts). Клики пишутся в лог (not_enough_hint_click).

import Phaser from 'phaser';
import { sfx } from '../audio';
import { t } from '../i18n';
import { dailyAvailable, improveSuggestions, logHintClick, quests } from '../meta';
import { questText, questRewardText } from './questText';
import { Button } from './draw';
import { richText } from './meta';
import { Modal } from './Modal';
import { showBuyCoins } from './storeUi';
import { C } from './theme';
import { uiText } from './UIText';

/** Перейти на уровень из подсказки (сцены сами решают, как закрыть себя). */
export function goToLevel(scene: Phaser.Scene, levelIndex: number) {
  scene.cameras.main.fadeOut(180, 11, 15, 39);
  scene.cameras.main.once('camerafadeoutcomplete', () => scene.scene.start('Game', { levelIndex }));
}

/** Строка подсказки: текст слева, кнопка справа. */
function hintRow(scene: Phaser.Scene, m: Modal, label: string, btnLabel: string, icon: 'play' | 'gift' | null, onClick: () => void) {
  const row = scene.add.container(0, 0);
  const g = scene.add.graphics();
  g.fillStyle(0x000000, 0.25);
  g.fillRoundedRect(-m.inner / 2, -52, m.inner, 104, 30);
  row.add(g);
  const btn = new Button(scene, 0, 0, { w: 200, h: 84, icon: icon ?? undefined, label: btnLabel, primary: true, fontSize: 34, maxW: 300, onClick });
  btn.setX(m.inner / 2 - 20 - btn.buttonWidth / 2);
  const textW = m.inner - btn.buttonWidth - 70;
  const rt = richText(scene, 0, 0, label, 30, C.text, true, textW, false, 2);
  rt.setX(-m.inner / 2 + 30 + (rt.width * rt.scaleX) / 2);
  rt.setData('ui', { w: textW, h: 100, src: label });
  row.add([rt, btn]);
  m.add(row, 104, 14);
}

const leave = (scene: Phaser.Scene, m: Modal, key: string, data?: object) => {
  m.close(true);
  scene.cameras.main.fadeOut(180, 11, 15, 39);
  scene.cameras.main.once('camerafadeoutcomplete', () => scene.scene.start(key, data));
};

/**
 * Подсказки «где взять» в готовое окно: 2 уровня, которые можно улучшить (с ожидаемой наградой) или новый уровень,
 * задание жителя (если есть невыполненное) и награда дня (если ещё не забрана).
 */
export function addEarnHints(scene: Phaser.Scene, m: Modal, kind: 'light' | 'coins') {
  m.add(uiText(scene, 0, 0, t(kind === 'light' ? 'where_light' : 'where_coins'), { w: m.inner, size: 32, color: C.textDim, bold: false }), 44, 12);
  for (const s of improveSuggestions(2)) {
    const num = s.levelIndex + 1;
    const label = s.fresh ? t('hint_next_level', { n: num }) : t(kind === 'light' ? 'hint_improve_light' : 'hint_improve_coins', { n: num, amount: kind === 'light' ? s.light : s.coins });
    hintRow(scene, m, label, t('play'), 'play', () => {
      logHintClick(kind === 'light' ? 'level_light' : 'level_coins', s.id);
      m.close(true);
      goToLevel(scene, s.levelIndex);
    });
  }
  // Задание жителя: сначала то, что даёт нужную валюту.
  const qs = quests().daily.filter((q) => !q.claimed);
  const q = qs.find((x) => (kind === 'light' ? 'light' in x.reward : 'coins' in x.reward)) ?? qs[0];
  if (q) {
    const label = t('hint_quest', { quest: questText(q), reward: questRewardText(q) });
    hintRow(scene, m, label, t('quests_open'), null, () => {
      logHintClick('quest', q.id);
      leave(scene, m, 'Village', { panel: 'quests' });
    });
  }
  if (dailyAvailable() !== null && scene.scene.key !== 'Menu') {
    hintRow(scene, m, t('hint_daily_ready'), t('daily_take'), 'gift', () => {
      logHintClick('daily');
      leave(scene, m, 'Menu');
    });
  } else m.text(t('hint_daily'), 30, C.textDim, 2);
}

/** Окно «Не хватает N» с подсказками «где заработать»; для монет — ещё «Докупить» (в веб-версии — «в приложении»). */
export function showNotEnough(scene: Phaser.Scene, kind: 'light' | 'coins', need: number) {
  sfx.invalid();
  const m = new Modal(scene, { w: 920 });
  m.rich(t(kind === 'light' ? 'not_enough_light' : 'not_enough_coins', { n: need }), 52, '#ff9a8a');
  addEarnHints(scene, m, kind);
  if (kind === 'coins') {
    m.buttons([
      new Button(scene, 0, 0, {
        w: 380,
        h: 100,
        icon: 'bag',
        label: t('buy_more'),
        fontSize: 34,
        primary: true,
        onClick: () => {
          logHintClick('buy_coins');
          m.close(true);
          showBuyCoins(scene);
        },
      }),
    ]);
  }
  m.open();
  return m;
}
