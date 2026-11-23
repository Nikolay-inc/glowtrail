// Вибрация: лёгкая на постановку плитки, короткая на ошибку, радостная на победу.
// В приложении — @capacitor/haptics (Taptic Engine на iPhone), в браузере — navigator.vibrate (Android).
// Выключатель — в меню (настройка устройства, в облако не уходит).

import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { isNative } from './platform';
import { loadProgress, saveProgress } from './storage';

export function isVibrationOn(): boolean {
  return loadProgress().vibration;
}

export function setVibration(on: boolean) {
  saveProgress({ ...loadProgress(), vibration: on });
  if (on) haptics.tap();
}

function webVibrate(pattern: number | number[]) {
  // До первого касания браузер блокирует вибрацию и пишет ошибку в консоль.
  const ua = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation;
  if (ua && !ua.hasBeenActive) return;
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* вибрации нет */
  }
}

/** Что выбрать для события: нативный тактильный отклик или шаблон для браузера. */
export type HapticKind = 'tap' | 'place' | 'error' | 'win';
export const WEB_PATTERNS: Record<HapticKind, number | number[]> = {
  tap: 6,
  place: 10,
  error: [12, 50, 12],
  win: [20, 60, 20, 60, 40],
};

function play(kind: HapticKind) {
  if (!isVibrationOn()) return;
  if (!isNative()) {
    webVibrate(WEB_PATTERNS[kind]);
    return;
  }
  const safe = (p: Promise<unknown>) => p.catch(() => undefined);
  switch (kind) {
    case 'tap':
      void safe(Haptics.impact({ style: ImpactStyle.Light }));
      break;
    case 'place':
      void safe(Haptics.impact({ style: ImpactStyle.Light }));
      break;
    case 'error':
      void safe(Haptics.notification({ type: NotificationType.Error }));
      break;
    case 'win':
      // «Радостная»: успех и два лёгких отзвука.
      void safe(Haptics.notification({ type: NotificationType.Success }));
      setTimeout(() => void safe(Haptics.impact({ style: ImpactStyle.Light })), 260);
      setTimeout(() => void safe(Haptics.impact({ style: ImpactStyle.Medium })), 420);
      break;
  }
}

export const haptics = {
  tap: () => play('tap'),
  place: () => play('place'),
  error: () => play('error'),
  win: () => play('win'),
};
