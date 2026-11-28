// npm run ios:strings — переводы текстов Info.plist для iOS из i18n: ios/App/App/<язык>.lproj/InfoPlist.strings.
// Сейчас это текст системного запроса ATT (NSUserTrackingUsageDescription, ключ i18n — ATT_TEXT_KEY).
// Запускать после изменения перевода; тест (tests/monetization.test.ts) сверяет файлы с i18n.

import { mkdirSync, writeFileSync } from 'node:fs';
import { infoPlistStrings, IOS_LANGS } from '../src/monetization/iosStrings';

for (const lang of IOS_LANGS) {
  const dir = `ios/App/App/${lang}.lproj`;
  mkdirSync(dir, { recursive: true });
  writeFileSync(`${dir}/InfoPlist.strings`, infoPlistStrings(lang));
  console.log(`${dir}/InfoPlist.strings`);
}
