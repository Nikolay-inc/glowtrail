// Sentry: ошибки JavaScript и необработанные исключения — в вебе и в приложении (@sentry/capacitor ловит и
// нативные падения iOS/Android). С версией и номером сборки; source maps загружаются при сборке (vite.config.ts).
// Без персональных данных: sendDefaultPii выключен (без IP и cookies), пользователя не передаём, адреса почты
// вырезаются из событий и хлебных крошек. Ошибки собираются и без согласия на статистику (см. политику).

import * as Sentry from '@sentry/capacitor';
import * as SentryBrowser from '@sentry/browser';
import { platform } from '../platform';
import { APP_BUILD, APP_VERSION } from '../version';
import { scrubEmails } from './scrub';

export function initSentry(dsn: string) {
  Sentry.init(
    {
      dsn,
      release: `glowtrail@${APP_VERSION}+${APP_BUILD}`,
      dist: String(APP_BUILD),
      environment: import.meta.env.MODE === 'app' ? 'app' : import.meta.env.DEV ? 'development' : 'web',
      sendDefaultPii: false,
      // Только ошибки: без трассировки производительности и записи сессий.
      tracesSampleRate: 0,
      maxBreadcrumbs: 50,
      initialScope: {
        tags: { platform: platform(), build: String(APP_BUILD) },
      },
      beforeSend: (event) => {
        delete event.user;
        if (event.request) delete event.request.cookies;
        return scrubEmails(event);
      },
      beforeBreadcrumb: (crumb) => scrubEmails(crumb),
    },
    SentryBrowser.init,
  );
}
