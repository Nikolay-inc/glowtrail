// Где запущена игра: в мобильном приложении (Capacitor, iOS/Android) или в браузере.

import { Capacitor } from '@capacitor/core';

export function isNative(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

export function platform(): 'ios' | 'android' | 'web' {
  try {
    return Capacitor.getPlatform() as 'ios' | 'android' | 'web';
  } catch {
    return 'web';
  }
}

/** Адрес веб-версии: в приложении ссылки из писем (сброс пароля) ведут сюда. */
export const WEB_URL = 'https://nikolay-inc.github.io/glowtrail/';
