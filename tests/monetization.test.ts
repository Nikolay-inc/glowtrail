// Р4 — реклама и покупки: правила частоты межуровневой рекламы, дневной лимит роликов, однократное начисление
// по transaction id, стартовый набор, веб-заглушки, согласие (TCF → статистика), файлы iOS.

import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { REMOTE_DEFAULTS } from '../src/analytics/remoteConfig';
import { coins, defaultEconomy, mergeEconomy, normalizeEconomy } from '../src/core/economy';
import { applyTransaction, defaultShop, mergeShop, normalizeShop, PRODUCT_KEYS, STARTER_ITEM, type ShopState } from '../src/core/shop';
import { itemById } from '../src/core/wardrobe';
import { createAds, fakeAds, noAds } from '../src/monetization/ads';
import { adUnits, GOOGLE_TEST_IDS, productId, revenueCatKey } from '../src/monetization/config';
import { infoPlistStrings, IOS_LANGS } from '../src/monetization/iosStrings';
import * as M from '../src/monetization/index';
import {
  AFTER_REWARDED_MS,
  adSettings,
  analyticsFromTcf,
  interstitialDecision,
  plus3Offer,
  recordAlmost,
  recordInterstitial,
  recordRewarded,
  recordStarterOffer,
  recordWinForAds,
  rewardedAvailable,
  rewardedLeft,
  starterOfferDue,
  starterVisible,
  type InterstitialCtx,
} from '../src/monetization/rules';
import { createStore, noStore, ownedFromCustomerInfo, testStore } from '../src/monetization/store';
import { memoryBackend, migrate, SaveService } from '../src/save/SaveService';

const S = adSettings(REMOTE_DEFAULTS);
const MIN = 60_000;

describe('межуровневая реклама: когда показывать', () => {
  const T0 = 1_800_000_000_000;
  const ready = (o: Partial<ShopState['ads']> = {}): ShopState => ({ ...defaultShop(), ads: { ...defaultShop().ads, winsSince: 3, ...o } });
  const ctx = (o: Partial<InterstitialCtx> = {}): InterstitialCtx => ({ shop: ready(), settings: S, supported: true, levelNum: 20, result: 'win', tutorial: false, intro: false, now: T0 + 10 * MIN, sessionStart: T0, ...o });

  it.each([
    ['всё сошлось', {}, 'ok'],
    ['уровень 14 — ещё рано (с 15)', { levelNum: 14 }, 'early_level'],
    ['уровень 15 — уже можно', { levelNum: 15 }, 'ok'],
    ['после поражения — никогда', { result: 'lose' as const }, 'not_win'],
    ['после пропуска — никогда', { result: 'skip' as const }, 'not_win'],
    ['в обучении — никогда', { tutorial: true }, 'tutorial'],
    ['знакомство с новой механикой — никогда', { intro: true }, 'intro'],
    ['«Без рекламы» — никогда', { shop: { ...ready(), noAds: true } }, 'noads'],
    ['стартовый набор — тоже без рекламы', { shop: { ...ready(), starter: true } }, 'noads'],
    ['первые 3 минуты сессии', { now: T0 + 2 * MIN }, 'grace'],
    ['ровно 3 минуты сессии — можно', { now: T0 + 3 * MIN }, 'ok'],
    ['прошлая межуровневая 2 минуты назад', { shop: ready({ lastInterstitialAt: T0 + 8 * MIN }) }, 'gap'],
    ['прошлая межуровневая 3 минуты назад — можно', { shop: ready({ lastInterstitialAt: T0 + 7 * MIN }) }, 'ok'],
    ['ролик досмотрен минуту назад', { shop: ready({ lastRewardedAt: T0 + 9 * MIN }) }, 'after_rewarded'],
    ['ролик досмотрен 2 минуты назад — можно', { shop: ready({ lastRewardedAt: T0 + 10 * MIN - AFTER_REWARDED_MS }) }, 'ok'],
    ['пройдено 2 уровня из 3', { shop: ready({ winsSince: 2 }) }, 'every_n'],
    ['реклама выключена в Remote Config', { settings: { ...S, enabled: false } }, 'disabled'],
    ['веб-версия — рекламы нет', { supported: false }, 'unsupported'],
  ] as const)('%s', (_name, o, want) => {
    expect(interstitialDecision(ctx(o as Partial<InterstitialCtx>))).toBe(want);
  });

  it('счётчик «раз в 3 уровня»: обучение и уровни до 15 не считаются, после показа — с нуля', () => {
    let s = defaultShop();
    s = recordWinForAds(s, 14, S, false);
    s = recordWinForAds(s, 20, S, true);
    expect(s.ads.winsSince).toBe(0);
    for (const n of [15, 16, 17]) s = recordWinForAds(s, n, S, false);
    expect(s.ads.winsSince).toBe(3);
    s = recordInterstitial(s, T0);
    expect(s.ads).toMatchObject({ winsSince: 0, lastInterstitialAt: T0 });
  });

  it('числа берутся из Remote Config', () => {
    const r = adSettings({ ...REMOTE_DEFAULTS, ads_interstitial_from_level: 30, ads_interstitial_every_n_levels: 5, ads_interstitial_min_gap_sec: 60, ads_session_grace_sec: 0 });
    expect(interstitialDecision(ctx({ settings: r, levelNum: 25 }))).toBe('early_level');
    expect(interstitialDecision(ctx({ settings: r, levelNum: 31, now: T0 + 1000 }))).toBe('every_n');
  });
});

describe('ролики по выбору игрока: общий дневной лимит', () => {
  it('лимит 5 в день на все места вместе, на следующий день — снова', () => {
    let s = defaultShop();
    for (let i = 0; i < 5; i++) {
      expect(rewardedAvailable({ shop: s, today: '2026-11-27', now: 0, settings: S, supported: true, retryAt: 0 })).toBe(true);
      s = recordRewarded(s, '2026-11-27', 1000 * i);
    }
    expect(rewardedLeft(s, '2026-11-27', 5)).toBe(0);
    expect(rewardedAvailable({ shop: s, today: '2026-11-27', now: 0, settings: S, supported: true, retryAt: 0 })).toBe(false);
    expect(rewardedLeft(s, '2026-11-28', 5)).toBe(5);
    expect(rewardedLeft(s, '2026-11-27', adSettings({ ...REMOTE_DEFAULTS, ads_rewarded_daily_cap: 8 }).rewardedCap)).toBe(3);
  });

  it('после ошибки загрузки кнопки прячутся на 60 с; в вебе и при выключенной рекламе — нет кнопок', () => {
    const base = { shop: defaultShop(), today: '2026-11-27', settings: S, supported: true };
    expect(rewardedAvailable({ ...base, now: 1000, retryAt: 61_000 })).toBe(false);
    expect(rewardedAvailable({ ...base, now: 61_000, retryAt: 61_000 })).toBe(true);
    expect(rewardedAvailable({ ...base, now: 0, retryAt: 0, supported: false })).toBe(false);
    expect(rewardedAvailable({ ...base, now: 0, retryAt: 0, settings: { ...S, enabled: false } })).toBe(false);
  });

  it('«+3 плитки»: бесплатно раз в день → часовня → ролик; второй раз за попытку — только часовня', () => {
    const o = (x: Partial<Parameters<typeof plus3Offer>[0]>) => plus3Offer({ usedInAttempt: 0, chapelUsedInAttempt: false, freeToday: true, chapelLeft: 0, adReady: true, ...x });
    expect(o({})).toBe('free');
    expect(o({ freeToday: false, chapelLeft: 1 })).toBe('chapel');
    expect(o({ freeToday: false })).toBe('ad');
    expect(o({ freeToday: false, adReady: false })).toBeNull();
    expect(o({ usedInAttempt: 1, chapelLeft: 1 })).toBe('chapel');
    expect(o({ usedInAttempt: 1, chapelLeft: 0 })).toBeNull();
    expect(o({ usedInAttempt: 2, chapelLeft: 1 })).toBeNull();
  });
});

describe('покупки: начисление один раз на транзакцию', () => {
  it('потребляемые начисляются один раз, повторная транзакция — ничего', () => {
    const s = defaultShop();
    const a = applyTransaction(s, 'coins_s', 'tx-1');
    expect(a?.grant).toEqual({ coins: 800 });
    expect(applyTransaction(a!.shop, 'coins_s', 'tx-1')).toBeNull();
    expect(applyTransaction(a!.shop, 'coins_s', 'tx-2')?.grant).toEqual({ coins: 800 });
    expect(applyTransaction(s, 'hints_30', 'h')?.grant).toEqual({ hints: 30 });
    expect(applyTransaction(s, 'coins_l', '')).toBeNull();
  });

  it('стартовый набор: «Без рекламы», 20 подсказок, 500 монет и вещь; восстановление — без монет и подсказок', () => {
    const r = applyTransaction(defaultShop(), 'starter', 'st-1')!;
    expect(r.shop).toMatchObject({ starter: true, noAds: true });
    expect(r.grant).toEqual({ hints: 20, coins: 500, item: STARTER_ITEM });
    expect(applyTransaction(r.shop, 'starter', 'st-2')?.grant).toEqual({}); // уже есть
    expect(applyTransaction(defaultShop(), 'starter', 'st-1', 'restore')?.grant).toEqual({ item: STARTER_ITEM });
    expect(applyTransaction(defaultShop(), 'coins_l', 'c-1', 'restore')?.grant).toEqual({});
    expect(itemById(STARTER_ITEM)?.source).toBe('starter');
  });

  it('транзакции объединяются при слиянии с облаком — вторая установка не начислит снова', () => {
    const a = applyTransaction(defaultShop(), 'coins_s', 'tx-a')!.shop;
    const b = applyTransaction(defaultShop(), 'noads', 'tx-b')!.shop;
    const m = mergeShop(a, b);
    expect(m.tx.sort()).toEqual(['tx-a', 'tx-b']);
    expect(m.noAds).toBe(true);
    expect(applyTransaction(m, 'coins_s', 'tx-a')).toBeNull();
    const e = mergeEconomy({ ...defaultEconomy(), shop: a }, { ...defaultEconomy(), shop: b });
    expect(e.shop.tx).toHaveLength(2);
  });

  it('сохранение v11: старое — пустой раздел покупок, мусор отбрасывается', () => {
    const d = migrate({ version: 10, progress: {}, economy: { coinsEarned: 5 } });
    expect(d.version).toBe(11);
    expect(d.economy.shop).toEqual(defaultShop());
    expect(d.progress.privacyAsked).toBe(false);
    expect(normalizeShop({ noAds: 'yes', tx: ['a', 'a', 3, ''], starter: true }).tx).toEqual(['a']);
    expect(normalizeShop({ starter: true }).noAds).toBe(true);
    expect(normalizeEconomy({ shop: { noAds: true } }).shop.noAds).toBe(true);
  });

  it('CustomerInfo RevenueCat → права и транзакции', () => {
    const o = ownedFromCustomerInfo({
      entitlements: { active: {}, all: {} } as never,
      allPurchasedProductIdentifiers: [productId('starter'), productId('coins_s')],
      nonSubscriptionTransactions: [
        { transactionIdentifier: 't1', productIdentifier: productId('coins_s'), purchaseDate: '', purchaseToken: null },
        { transactionIdentifier: 't2', productIdentifier: 'other.app.thing', purchaseDate: '', purchaseToken: null },
      ] as never,
    });
    expect(o).toEqual({ noAds: true, starter: true, transactions: [{ key: 'coins_s', txId: 't1' }] });
  });
});

describe('стартовый набор: когда предлагать', () => {
  const due = (shop: ShopState, today: string, trigger: 'win' | 'almost', levelNum = 20) => starterOfferDue({ shop, today, trigger, levelNum, storeAvailable: true });

  it('после уровня 20 или второго «Почти!» за день', () => {
    expect(due(defaultShop(), '2026-11-27', 'win', 19)).toBe(false);
    expect(due(defaultShop(), '2026-11-27', 'win', 20)).toBe(true);
    let s = recordAlmost(defaultShop(), '2026-11-27');
    expect(due(s, '2026-11-27', 'almost')).toBe(false);
    s = recordAlmost(s, '2026-11-27');
    expect(due(s, '2026-11-27', 'almost')).toBe(true);
    expect(due(recordAlmost(s, '2026-11-27'), '2026-11-27', 'almost')).toBe(false); // третье — уже нет
  });

  it('не чаще раза в 3 дня и не больше 3 раз', () => {
    let s = recordStarterOffer(defaultShop(), '2026-11-27');
    expect(due(s, '2026-11-29', 'win')).toBe(false);
    expect(due(s, '2026-11-30', 'win')).toBe(true);
    s = recordStarterOffer(recordStarterOffer(s, '2026-11-30'), '2026-12-03');
    expect(s.starterOffer.shown).toBe(3);
    expect(due(s, '2026-12-31', 'win')).toBe(false);
  });

  it('скрыт, если куплены «Без рекламы» или набор, и в веб-версии', () => {
    expect(starterVisible({ ...defaultShop(), noAds: true })).toBe(false);
    expect(starterVisible({ ...defaultShop(), starter: true })).toBe(false);
    expect(due({ ...defaultShop(), noAds: true }, '2026-11-27', 'win')).toBe(false);
    expect(starterOfferDue({ shop: defaultShop(), today: '2026-11-27', trigger: 'win', levelNum: 25, storeAvailable: false })).toBe(false);
  });
});

describe('веб-заглушки и связка с сохранением', () => {
  let now = 1_800_000_000_000;
  beforeEach(() => {
    SaveService.setBackend(memoryBackend());
    now = 1_800_000_000_000;
  });

  it('в браузере (не приложение) рекламы и покупок нет', async () => {
    expect(createAds()).toBe(noAds);
    expect(createStore()).toBe(noStore);
    expect(noAds.supported).toBe(false);
    expect(await noAds.showRewarded()).toBe('failed');
    expect(await noStore.purchase('noads')).toMatchObject({ ok: false });
    M.setMonetization({ ads: noAds, store: noStore, now: () => now });
    expect(M.rewardedReady()).toBe(false);
    expect(M.storeSupported()).toBe(false);
    expect(await M.buy('coins_s')).toBe('unsupported');
    expect(await M.restorePurchases()).toBeNull();
    expect(await M.maybeInterstitial({ levelNum: 40, tutorial: false, intro: false })).toBe(false);
  });

  it('ролики: награда только за досмотренный, лимит 5 в день, ошибка — пауза 60 с', async () => {
    const ads = fakeAds({ ms: 0 });
    M.setMonetization({ ads, store: noStore, now: () => now });
    for (let i = 0; i < 5; i++) expect(await M.playRewarded('hint')).toBe('rewarded');
    expect(M.rewardedReady()).toBe(false);
    expect(await M.playRewarded('plus3')).toBe('failed');
    expect(ads.shown.rewarded).toBe(5);
    const log = SaveService.load().log.filter((e) => e.ev === 'ad_reward');
    expect(log).toHaveLength(5);
    // Ошибка загрузки: кнопки прячутся на 60 с.
    SaveService.setBackend(memoryBackend());
    M.setMonetization({ ads: fakeAds({ fail: true }), now: () => now });
    expect(await M.playRewarded('daily_double')).toBe('failed');
    expect(M.rewardedReady()).toBe(false);
    now += 60_000;
    expect(M.rewardedReady()).toBe(true);
    expect(SaveService.load().log.some((e) => e.ev === 'ad_fail' && e.place === 'daily_double')).toBe(true);
  });

  it('межуровневая через связку: после ролика — пауза 2 минуты, «Без рекламы» — никогда', async () => {
    const ads = fakeAds({ ms: 0 });
    M.setMonetization({ ads, store: noStore, now: () => now, sessionStart: now - 10 * MIN });
    for (const n of [20, 21, 22]) M.onLevelWin(n, false);
    expect(await M.maybeInterstitial({ levelNum: 22, tutorial: false, intro: false })).toBe(true);
    expect(SaveService.load().economy.shop.ads.winsSince).toBe(0);
    for (const n of [23, 24, 25]) M.onLevelWin(n, false);
    now += 4 * MIN;
    await M.playRewarded('hint');
    expect(await M.maybeInterstitial({ levelNum: 25, tutorial: false, intro: false })).toBe(false);
    SaveService.update((d) => void (d.economy.shop.noAds = true));
    now += 10 * MIN;
    expect(await M.maybeInterstitial({ levelNum: 26, tutorial: false, intro: false })).toBe(false);
    expect(ads.shown.interstitial).toBe(1);
  });

  it('тестовый магазин: покупка начисляется один раз, восстановление и вход в аккаунт', async () => {
    const mem = { v: null as string | null };
    const store = testStore({ confirm: async () => true, storage: { get: () => mem.v, set: (v) => void (mem.v = v) }, locale: 'en-US' });
    M.setMonetization({ ads: noAds, store, now: () => now });
    await M.startStore(null);
    const products = await M.loadProducts();
    expect(products.map((p) => p.key).sort()).toEqual([...PRODUCT_KEYS].sort());
    expect(products.find((p) => p.key === 'noads')?.price).toContain('3.99');
    const before = coins(SaveService.load().economy);
    expect(await M.buy('coins_s')).toBe('ok');
    expect(coins(SaveService.load().economy)).toBe(before + 800);
    expect(await M.buy('starter')).toBe('ok');
    const e = SaveService.load().economy;
    expect(e.shop).toMatchObject({ starter: true, noAds: true });
    expect(e.wardrobe.owned).toContain(STARTER_ITEM);
    expect(coins(e)).toBe(before + 1300);
    expect(await M.buy('starter')).toBe('failed'); // непотребляемое второй раз не купить
    // Восстановление на «новой установке»: монеты и подсказки не повторяются, «Без рекламы» и вещь — да.
    SaveService.setBackend(memoryBackend());
    expect(M.noAdsOwned()).toBe(false);
    const r = await M.restorePurchases();
    expect(r?.noAds).toBe(true);
    expect(SaveService.load().economy.wardrobe.owned).toContain(STARTER_ITEM);
    expect(coins(SaveService.load().economy)).toBe(0);
    expect(SaveService.load().log.filter((x) => x.ev === 'restore')).toHaveLength(1);
    // Вход в аккаунт: покупки гостя переходят к аккаунту.
    SaveService.setBackend(memoryBackend());
    await M.onAccount('user-1');
    expect(M.noAdsOwned()).toBe(true);
    // Отмена покупки — не ошибка и ничего не начисляет.
    const cancel = testStore({ confirm: async () => false, storage: { get: () => null, set: () => undefined } });
    M.setMonetization({ store: cancel });
    expect(await M.buy('hints_10')).toBe('cancelled');
    const evs = SaveService.load().log.map((x) => x.ev);
    expect(evs).toContain('purchase_start');
    expect(evs).toContain('purchase_fail');
  });

  it('стартовый набор через связку: второе «Почти!» за день, при «Без рекламы» — нет', async () => {
    M.setMonetization({ ads: noAds, store: testStore({ storage: { get: () => null, set: () => undefined } }), now: () => now });
    expect(M.starterOfferAfterAlmost()).toBe(false);
    expect(M.starterOfferAfterAlmost()).toBe(true);
    expect(M.starterOfferAfterWin(25)).toBe(false); // сегодня уже предлагали
    SaveService.setBackend(memoryBackend());
    SaveService.update((d) => void (d.economy.shop.noAds = true));
    expect(M.starterOfferAfterWin(25)).toBe(false);
    expect(M.starterAvailable()).toBe(false);
  });
});

describe('согласие и настройки', () => {
  it('решение о статистике из формы UMP (TCF: цели 1 и 8)', () => {
    expect(analyticsFromTcf('11111111111', 1)).toBe('yes');
    expect(analyticsFromTcf('10000001000', 1)).toBe('yes');
    expect(analyticsFromTcf('10000000000', 1)).toBe('no');
    expect(analyticsFromTcf('00000001000', 1)).toBe('no');
    expect(analyticsFromTcf('', 1)).toBeNull();
    expect(analyticsFromTcf('1111111111', 0)).toBeNull();
  });

  it('тестовые ID Google в тестовом режиме, боевые — из окружения; ключ RevenueCat — из окружения', () => {
    expect(adUnits('ios', {}, true)).toEqual({ rewarded: GOOGLE_TEST_IDS.ios.rewarded, interstitial: GOOGLE_TEST_IDS.ios.interstitial });
    expect(adUnits('android', { VITE_ADMOB_ANDROID_REWARDED: 'ca-app-pub-1/2', VITE_ADMOB_ANDROID_INTERSTITIAL: 'ca-app-pub-1/3' }, false)).toEqual({ rewarded: 'ca-app-pub-1/2', interstitial: 'ca-app-pub-1/3' });
    expect(revenueCatKey('ios', {})).toBe('');
    expect(revenueCatKey('ios', { VITE_REVENUECAT_IOS_KEY: ' appl_x ' })).toBe('appl_x');
    expect(productId('noads')).toBe('com.severgames.glowtrail.noads');
  });
});

describe('файлы iOS', () => {
  const plist = readFileSync('ios/App/App/Info.plist', 'utf8');

  it('Info.plist: ID приложения AdMob, SKAdNetwork, текст ATT; комментария «ATT не нужен» больше нет', () => {
    expect(plist).toContain(`<key>GADApplicationIdentifier</key>\n\t<string>${GOOGLE_TEST_IDS.ios.app}</string>`);
    expect(plist).toContain('<key>NSUserTrackingUsageDescription</key>');
    expect((plist.match(/\.skadnetwork<\/string>/g) ?? []).length).toBeGreaterThanOrEqual(50);
    expect(plist).toContain('cstr6suwn9.skadnetwork');
    expect(plist).not.toMatch(/запрос ATT не нужен/);
  });

  it('текст ATT на всех языках совпадает с i18n (npm run ios:strings)', () => {
    for (const lang of IOS_LANGS) expect(readFileSync(`ios/App/App/${lang}.lproj/InfoPlist.strings`, 'utf8')).toBe(infoPlistStrings(lang));
    const pbx = readFileSync('ios/App/App.xcodeproj/project.pbxproj', 'utf8');
    for (const lang of IOS_LANGS) expect(pbx).toContain(`path = ${lang}.lproj/InfoPlist.strings;`);
  });

  it('PrivacyInfo: отслеживание (реклама с разрешения ATT), рекламные данные, история покупок', () => {
    const pi = readFileSync('ios/App/App/PrivacyInfo.xcprivacy', 'utf8');
    expect(pi).toMatch(/<key>NSPrivacyTracking<\/key>\s*<true\/>/);
    for (const k of ['AdvertisingData', 'PurchaseHistory', 'DeviceID']) expect(pi).toContain(`NSPrivacyCollectedDataType${k}</string>`);
    expect((pi.match(/NSPrivacyCollectedDataTypeDeviceID<\/string>/g) ?? []).length).toBe(1);
    expect(pi).toContain('NSPrivacyCollectedDataTypePurposeThirdPartyAdvertising');
  });

  it('StoreKit-файл со всеми товарами и схема с ним', () => {
    const sk = JSON.parse(readFileSync('ios/App/Glowtrail.storekit', 'utf8')) as { products: { productID: string; type: string }[] };
    expect(sk.products.map((p) => p.productID).sort()).toEqual(PRODUCT_KEYS.map(productId).sort());
    for (const p of sk.products) expect(p.type).toBe(p.productID.endsWith('noads') || p.productID.endsWith('starter') ? 'NonConsumable' : 'Consumable');
    expect(readFileSync('ios/App/App.xcodeproj/xcshareddata/xcschemes/App.xcscheme', 'utf8')).toContain('identifier = "../Glowtrail.storekit"');
  });
});
