// npm run ios:check — проверка iOS-проекта перед архивом для TestFlight: версия и номер сборки, команда и Bundle ID,
// имя под иконкой,
// автоматическая подпись, privacy manifest в ресурсах, ITSAppUsesNonExemptEncryption, иконка 1024×1024 без
// прозрачности, адрес для отзывов задан, Firebase (GoogleService-Info.plist) и Sentry (DSN) подключены.

import { existsSync, readFileSync } from 'node:fs';

const errors: string[] = [];
const ok = (cond: boolean, msg: string) => (cond ? console.log(`✓ ${msg}`) : errors.push(msg));

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string };
const build = existsSync('app-build.json') ? (JSON.parse(readFileSync('app-build.json', 'utf8')) as { build: number }).build : 0;
const pbx = readFileSync('ios/App/App.xcodeproj/project.pbxproj', 'utf8');
ok(pbx.includes(`MARKETING_VERSION = ${pkg.version};`), `версия ${pkg.version}`);
ok(build > 0 && pbx.includes(`CURRENT_PROJECT_VERSION = ${build};`), `номер сборки ${build}`);
ok(/DEVELOPMENT_TEAM = [A-Z0-9]{10};/.test(pbx), 'команда разработчика (Team ID)');
ok(pbx.includes('CODE_SIGN_STYLE = Automatic;'), 'автоматическая подпись');
ok(pbx.includes('PRODUCT_BUNDLE_IDENTIFIER = com.severgames.glowtrail;'), 'Bundle ID com.severgames.glowtrail');
ok(pbx.includes('PrivacyInfo.xcprivacy in Resources') && existsSync('ios/App/App/PrivacyInfo.xcprivacy'), 'PrivacyInfo.xcprivacy в ресурсах');
const plist = readFileSync('ios/App/App/Info.plist', 'utf8');
// Под иконкой — «Glowtrail» (название в App Store «Glowtrail: Light the Path» задаётся в App Store Connect).
ok(/<key>CFBundleDisplayName<\/key>\s*<string>Glowtrail<\/string>/.test(plist), 'имя под иконкой: Glowtrail (CFBundleDisplayName)');
const cap = readFileSync('capacitor.config.ts', 'utf8');
ok(cap.includes("appId: 'com.severgames.glowtrail'") && cap.includes("appName: 'Glowtrail'"), 'capacitor.config: appId и appName');
ok(/<key>ITSAppUsesNonExemptEncryption<\/key>\s*<false\/>/.test(plist), 'ITSAppUsesNonExemptEncryption = NO');
// PNG: ширина и высота — байты 16–23, тип цвета — байт 25 (2 — RGB без альфы, 6 — RGBA).
const icon = readFileSync('ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png');
const w = icon.readUInt32BE(16);
const h = icon.readUInt32BE(20);
ok(w === 1024 && h === 1024, `иконка ${w}×${h}`);
ok(icon[25] === 2 || icon[25] === 0, 'иконка без прозрачности');
const env = ['.env.local', '.env.app.local', '.env.app'].map((f) => (existsSync(f) ? readFileSync(f, 'utf8') : '')).join('\n');
ok(/^VITE_CONTACT_EMAIL=.+@.+/m.test(env) || /.+@.+/.test(process.env.VITE_CONTACT_EMAIL ?? ''), 'адрес для отзывов (VITE_CONTACT_EMAIL в .env.local)');

// Аналитика и ошибки (Р5): GoogleService-Info.plist лежит в ios/App/App и добавлен в ресурсы App (перетащить в Xcode),
// DSN Sentry задан для сборки приложения. Без них игра работает, но статистики и отчётов о сбоях не будет.
ok(existsSync('ios/App/App/GoogleService-Info.plist') && pbx.includes('GoogleService-Info.plist in Resources'), 'GoogleService-Info.plist в ресурсах App (Firebase)');
const appEnv = ['.env.app', '.env.app.local', '.env.local', '.env.production'].map((f) => (existsSync(f) ? readFileSync(f, 'utf8') : '')).join('\n');
ok(/^VITE_SENTRY_DSN=https:\/\/.+/m.test(appEnv), 'VITE_SENTRY_DSN для сборки приложения (.env.app или .env.local)');
ok(/<key>FIREBASE_ANALYTICS_COLLECTION_ENABLED<\/key>\s*<false\/>/.test(plist), 'Firebase Analytics выключен до согласия (Info.plist)');

if (errors.length) {
  console.error(`\n✗ Не готово:\n${errors.map((e) => `  - ${e}`).join('\n')}`);
  process.exit(1);
}
console.log('\nПроект готов к архиву для TestFlight ✓');
