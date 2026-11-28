import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { buildFeedback, PRIVACY_URL } from '../src/feedback';
import { APP_VERSION, versionLabel } from '../src/version';

describe('подготовка к TestFlight', () => {
  it('версия из package.json, номер сборки, подпись и Bundle ID', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8')).version as string;
    expect(APP_VERSION).toBe(pkg);
    expect(pkg).toBe('0.2.0');
    expect(versionLabel()).toMatch(new RegExp(`^${pkg.replace(/\./g, '\\.')} \\(сборка \\d+\\)$`));
    const build = JSON.parse(readFileSync('app-build.json', 'utf8')).build as number;
    const pbx = readFileSync('ios/App/App.xcodeproj/project.pbxproj', 'utf8');
    expect(pbx).toContain(`MARKETING_VERSION = ${pkg};`);
    expect(pbx).toContain(`CURRENT_PROJECT_VERSION = ${build};`);
    expect(pbx).toContain('DEVELOPMENT_TEAM = R457T4MLSR;');
    expect(pbx).toContain('CODE_SIGN_STYLE = Automatic;');
    expect(pbx).toContain('PRODUCT_BUNDLE_IDENTIFIER = com.severgames.glowtrail;');
    expect(pbx).toContain('PrivacyInfo.xcprivacy in Resources');
  });

  it('имя под иконкой — «Glowtrail», Bundle ID не меняется (название в App Store — «Glowtrail: Light the Path»)', () => {
    const plist = readFileSync('ios/App/App/Info.plist', 'utf8');
    expect(plist).toMatch(/<key>CFBundleDisplayName<\/key>\s*<string>Glowtrail<\/string>/);
    const cap = readFileSync('capacitor.config.ts', 'utf8');
    expect(cap).toContain("appId: 'com.severgames.glowtrail'");
    expect(cap).toContain("appName: 'Glowtrail'");
    const strings = readFileSync('android/app/src/main/res/values/strings.xml', 'utf8');
    expect(strings).toContain('<string name="app_name">Glowtrail</string>');
    expect(readFileSync('android/app/build.gradle', 'utf8')).toContain('applicationId "com.severgames.glowtrail"');
  });

  it('Info.plist без вопроса о шифровании, privacy manifest на месте', () => {
    const plist = readFileSync('ios/App/App/Info.plist', 'utf8');
    expect(plist).toMatch(/<key>ITSAppUsesNonExemptEncryption<\/key>\s*<false\/>/);
    const pm = readFileSync('ios/App/App/PrivacyInfo.xcprivacy', 'utf8');
    expect(pm).toContain('NSPrivacyAccessedAPICategoryUserDefaults');
    expect(pm).toContain('CA92.1');
    // Р4: реклама AdMob с IDFA (только по разрешению ATT) — отслеживание объявлено.
    expect(pm).toMatch(/<key>NSPrivacyTracking<\/key>\s*<true\/>/);
    for (const t of ['EmailAddress', 'UserID', 'GameplayContent']) expect(pm).toContain(`NSPrivacyCollectedDataType${t}`);
  });

  it('политика конфиденциальности (RU и EN): удаление аккаунта, контакт подставляется при сборке', () => {
    expect(existsSync('site/privacy.html')).toBe(true);
    const html = readFileSync('site/privacy.html', 'utf8');
    expect(html).toContain('id="ru"');
    expect(html).toContain('id="en"');
    expect(html).toContain('Удалить аккаунт');
    expect(html).toContain('Delete account');
    expect(html).toContain('%CONTACT_EMAIL%');
    expect(html).not.toMatch(/mailto:[^%"]+@/); // адреса в репозитории нет
    expect(PRIVACY_URL).toBe('https://nikolay-inc.github.io/glowtrail/privacy.html');
  });

  it('письмо с отзывом: версия, устройство, статистика (длинная — обрезана, полная — для буфера)', () => {
    const stats = 'x'.repeat(5000);
    const fb = buildFeedback('dev@example.com', stats, { version: '0.1.0 (сборка 26)', platform: 'ios', device: 'iPhone' });
    expect(fb.url.startsWith('mailto:dev@example.com?subject=')).toBe(true);
    expect(fb.subject).toContain('0.1.0');
    expect(fb.body).toContain('Платформа: ios');
    expect(fb.body.length).toBeLessThan(2000);
    expect(fb.full).toContain(stats);
    expect(decodeURIComponent(fb.url.split('body=')[1])).toBe(fb.body);
  });
});
