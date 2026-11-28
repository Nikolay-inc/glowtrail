// Аналитика игры: каждая новая запись лога событий (src/storage.ts, src/meta.ts, …) дублируется в Firebase
// с теми же именами и параметрами (имена попыток уровня — level_*, см. events.ts), свойства игрока обновляются
// по ходу игры. Согласие: в ЕС/ЕЭЗ, Великобритании и Швейцарии — экран при первом запуске (ConsentScene),
// без согласия статистика выключена; выбор хранится в сохранении (progress.analytics) и меняется в профиле.
// Локальный лог и статистика для тестеров остаются как были.

import { cozyLevel } from '../core/village';
import { getLocale } from '../i18n';
import { LEVELS } from '../levels/index';
import { openDistricts } from '../meta';
import { totalStars } from '../profile';
import { SaveService, type AnalyticsChoice, type SaveData } from '../save/SaveService';
import { APP_BUILD, APP_VERSION } from '../version';
import { sentryDsn } from './config';
import { analyticsAllowed, consentDue, consentRegion, firebaseEvent, userProperties } from './events';
import { loadRemoteConfig, setAnalyticsEnabled, setUserProperties, track } from './firebase';

const levelNums = new Map(LEVELS.map((l) => [l.id, l.num]));

/** Нужно ли в этой стране спрашивать согласие (часовой пояс, затем регион языка). */
export function needsConsent(): boolean {
  let tz: string | undefined;
  try {
    tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    tz = undefined;
  }
  const langs = typeof navigator !== 'undefined' ? navigator.languages ?? [navigator.language] : [];
  return consentRegion(tz, langs);
}

export const analyticsChoice = (): AnalyticsChoice => SaveService.load().progress.analytics;

/** Статистика сейчас собирается. */
export const analyticsOn = () => analyticsAllowed(analyticsChoice(), needsConsent());

/** Показать экран согласия (первый запуск в ЕС, выбор ещё не сделан). */
export const consentScreenDue = () => consentDue(analyticsChoice(), needsConsent());

/** Выбор игрока: экран согласия или переключатель в профиле. */
export function setAnalyticsChoice(choice: 'yes' | 'no', from: 'consent' | 'profile' | 'ump') {
  const before = analyticsOn();
  SaveService.update((d) => {
    d.progress.analytics = choice;
  });
  // Включили — сначала включаем Firebase, потом событие; выключили — событие уходит последним.
  if (choice === 'yes' && !before) void setAnalyticsEnabled(true);
  SaveService.update(
    (d) =>
      void d.log.push({
        t: new Date().toISOString(),
        ev: 'settings_change',
        item: 'analytics',
        value: choice,
        source: from,
      }),
  );
  if (choice === 'no') void setAnalyticsEnabled(false);
}

function facts(d: SaveData) {
  return userProperties({
    chapter: openDistricts().filter((x) => x !== 'mountain').length,
    totalStars: totalStars(d.progress),
    cozyLevel: cozyLevel(d.economy).level,
    language: getLocale(),
    version: `${APP_VERSION} (${APP_BUILD})`,
  });
}

let started = false;

/**
 * Запуск при старте игры: Sentry (если задан DSN), Firebase и Remote Config. Возвращает обещание,
 * которое выполняется, когда Remote Config загружен или прошло 2 с (игра не ждёт дольше).
 */
export function initTelemetry(): Promise<void> {
  if (started) return Promise.resolve();
  started = true;
  const dsn = sentryDsn();
  // Sentry — в собранной игре (в dev — только с VITE_SENTRY_DEV=1).
  if (dsn && (!import.meta.env.DEV || import.meta.env.VITE_SENTRY_DEV === '1')) void import('./sentry').then((m) => m.initSentry(dsn)).catch(() => undefined);

  SaveService.onLog((events, d) => {
    if (!analyticsOn()) return;
    setUserProperties(facts(d));
    for (const e of events) {
      const { name, params } = firebaseEvent(e, (id) => levelNums.get(id));
      track(name, params);
    }
  });
  if (analyticsOn()) {
    setUserProperties(facts(SaveService.load()));
    void setAnalyticsEnabled(true);
  }
  return loadRemoteConfig(2000);
}
