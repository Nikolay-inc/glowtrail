// Реклама и покупки в игре (Р4): связывает правила (rules.ts), SDK за интерфейсами (ads.ts, store.ts) и сохранение.
// Ролики — только по выбору игрока (подсказка, «+3 плитки», ×2 монеты, удвоить награду дня), общий дневной лимит
// из Remote Config; межуровневая — редко, после окна победы; покупки — «Без рекламы», стартовый набор, подсказки,
// монеты; потребляемые начисляются один раз на транзакцию. Всё пишется в лог → Firebase (ad_*, store_view,
// purchase_*, restore); выручку RevenueCat передаёт сам — здесь её нет.

import { remoteValues } from '../analytics/remoteConfig';
import { grant } from '../core/economy';
import { applyEntitlements, applyTransaction, PRODUCT_GRANTS, type ProductKey, type ShopState } from '../core/shop';
import { localDay } from '../profile';
import { SaveService, type LogEvent, type SaveData } from '../save/SaveService';
import { AD_RETRY_MS } from './config';
import { createAds, type AdsProvider, type ConsentResult } from './ads';
import {
  adSettings,
  interstitialDecision,
  recordAlmost,
  recordInterstitial,
  recordRewarded,
  recordStarterOffer,
  recordWinForAds,
  rewardedAvailable,
  rewardedLeft,
  starterOfferDue,
  starterVisible,
  type RewardedPlace,
} from './rules';
import { createStore, type StoreOwned, type StoreProduct, type StoreProvider } from './store';

let ads: AdsProvider = createAds();
let store: StoreProvider = createStore();
let sessionStart = Date.now();
let retryAt = 0;
let clock = () => Date.now();

/** Подменить SDK и часы (тесты, проверка вёрстки). */
export function setMonetization(o: { ads?: AdsProvider; store?: StoreProvider; now?: () => number; sessionStart?: number }) {
  if (o.ads) ads = o.ads;
  if (o.store) store = o.store;
  if (o.now) clock = o.now;
  if (o.sessionStart !== undefined) sessionStart = o.sessionStart;
  retryAt = 0;
}

export const adsProvider = () => ads;
export const storeProvider = () => store;
const today = () => localDay(new Date(clock()));
const shop = (): ShopState => SaveService.load().economy.shop;
const settings = () => adSettings(remoteValues());

function log(d: SaveData, e: Omit<LogEvent, 't'>) {
  d.log.push({ t: new Date(clock()).toISOString(), ...e });
}
function logOnly(e: Omit<LogEvent, 't'>) {
  SaveService.update((d) => log(d, e));
}

/** Реклама есть на этой платформе и включена (Remote Config ads_enabled). */
export const adsSupported = () => ads.supported && settings().enabled;
/** Покупки есть на этой платформе (в веб-версии — нет). */
export const storeSupported = () => store.supported;

// ---------------------------------------------------------------------------
// Ролики по выбору игрока

/** Можно ли сейчас предложить «… за ролик» (лимит дня, реклама включена, не ждём после ошибки). */
export function rewardedReady(): boolean {
  return rewardedAvailable({ shop: shop(), today: today(), now: clock(), settings: settings(), supported: ads.supported, retryAt });
}

export const rewardedLeftToday = () => rewardedLeft(shop(), today(), settings().rewardedCap);

/** Кнопка ролика показана (раз на окно) — для воронки в аналитике. */
export function logAdOffer(place: RewardedPlace, level?: string) {
  logOnly({ ev: 'ad_offer', place, ...(level ? { level } : {}) });
}

/**
 * Показать ролик и, если досмотрен, засчитать (счётчик дня, время). Награду выдаёт вызывающий — только при true.
 * Не загрузился — false, кнопки роликов прячутся на 60 с (rewardedReady → false).
 */
export async function playRewarded(place: RewardedPlace, level?: string): Promise<'rewarded' | 'dismissed' | 'failed'> {
  if (!rewardedReady()) return 'failed';
  const r = await ads.showRewarded();
  const extra = level ? { level } : {};
  if (r === 'rewarded') {
    SaveService.update((d) => {
      d.economy = { ...d.economy, shop: recordRewarded(d.economy.shop, today(), clock()) };
      log(d, { ev: 'ad_reward', place, ...extra });
    });
  } else if (r === 'failed') {
    retryAt = clock() + AD_RETRY_MS;
    logOnly({ ev: 'ad_fail', place, ...extra });
  }
  return r;
}

// ---------------------------------------------------------------------------
// Межуровневая реклама

/** Победа: счётчик уровней до следующей межуровневой (уровни до ads_interstitial_from_level не считаются). */
export function onLevelWin(levelNum: number, tutorial: boolean) {
  SaveService.update((d) => {
    d.economy = { ...d.economy, shop: recordWinForAds(d.economy.shop, levelNum, settings(), tutorial) };
  });
}

/**
 * «Дальше» / «На карту» в окне победы: показать межуровневую рекламу, если пора (rules.interstitialDecision).
 * Выполняется, когда реклама закрыта (или сразу, если показывать не нужно).
 */
export async function maybeInterstitial(
  c: { levelNum: number; tutorial: boolean; intro: boolean; level?: string },
  around: (fn: () => Promise<boolean>) => Promise<boolean> = (fn) => fn(),
): Promise<boolean> {
  const why = interstitialDecision({ shop: shop(), settings: settings(), supported: ads.supported, levelNum: c.levelNum, result: 'win', tutorial: c.tutorial, intro: c.intro, now: clock(), sessionStart });
  if (why !== 'ok') return false;
  const shown = await around(() => ads.showInterstitial());
  if (shown) {
    SaveService.update((d) => {
      d.economy = { ...d.economy, shop: recordInterstitial(d.economy.shop, clock()) };
      log(d, { ev: 'ad_interstitial', ...(c.level ? { level: c.level } : {}) });
    });
  }
  return shown;
}

/** Новая сессия (возврат после долгого перерыва): снова «тихие» первые минуты. */
export function newSession() {
  sessionStart = clock();
}

// ---------------------------------------------------------------------------
// Покупки

export const noAdsOwned = () => shop().noAds || shop().starter;
export const starterOwned = () => shop().starter;
/** Стартовый набор есть в витрине: не куплен и «Без рекламы» ещё нет. */
export const starterAvailable = () => starterVisible(shop());

let productCache: StoreProduct[] = [];
/** Товары с ценами из стора (кэш до перезапуска; пусто — стор не ответил). */
export async function loadProducts(): Promise<StoreProduct[]> {
  if (!store.supported) return [];
  const list = await store.products();
  if (list.length) productCache = list;
  return productCache;
}
export const cachedProducts = () => productCache;

export function logStoreView(source: string) {
  logOnly({ ev: 'store_view', source });
}

/** Начислить транзакцию (покупка или восстановление); повторная — ничего. Возвращает, начислено ли что-то новое. */
export function creditTransaction(key: ProductKey, txId: string, mode: 'purchase' | 'restore'): boolean {
  let credited = false;
  SaveService.update((d) => {
    const r = applyTransaction(d.economy.shop, key, txId, mode);
    if (!r) return;
    credited = true;
    let e = { ...d.economy, shop: r.shop };
    const g = r.grant;
    if (g.coins) {
      e = grant(e, { coins: g.coins });
      log(d, { ev: 'currency_earn', currency: 'coins', amount: g.coins, source: 'purchase', product: key });
    }
    if (g.hints) {
      e = grant(e, { hints: g.hints });
      log(d, { ev: 'currency_earn', amount: g.hints, source: 'purchase', item: 'hint', product: key });
    }
    if (g.item && !e.wardrobe.owned.includes(g.item)) e = grant(e, { item: g.item });
    d.economy = e;
  });
  return credited;
}

/** Права из стора без видимой транзакции (новое устройство, вход в аккаунт): «Без рекламы», вещь набора. */
function applyOwned(o: StoreOwned, mode: 'restore'): number {
  let n = 0;
  for (const t of o.transactions) if (creditTransaction(t.key, t.txId, mode)) n++;
  SaveService.update((d) => {
    let e = { ...d.economy, shop: applyEntitlements(d.economy.shop, o) };
    const item = PRODUCT_GRANTS.starter.item;
    if (e.shop.starter && item && !e.wardrobe.owned.includes(item)) e = grant(e, { item });
    d.economy = e;
  });
  return n;
}

export type BuyResult = 'ok' | 'cancelled' | 'failed' | 'unsupported';

/** Купить товар: запрос к стору, начисление один раз на транзакцию, лог purchase_start/done/fail. */
export async function buy(key: ProductKey): Promise<BuyResult> {
  if (!store.supported) return 'unsupported';
  logOnly({ ev: 'purchase_start', product: key });
  const r = await store.purchase(key);
  if (!r.ok) {
    logOnly({ ev: 'purchase_fail', product: key, error: r.error });
    return r.cancelled ? 'cancelled' : 'failed';
  }
  creditTransaction(r.key, r.txId, 'purchase');
  logOnly({ ev: 'purchase_done', product: key });
  return 'ok';
}

/** «Восстановить покупки» (магазин, профиль). null — стор не ответил. */
export async function restorePurchases(): Promise<{ restored: number; noAds: boolean } | null> {
  if (!store.supported) return null;
  const o = await store.restore();
  if (!o) {
    logOnly({ ev: 'restore', value: 'fail' });
    return null;
  }
  const n = applyOwned(o, 'restore');
  logOnly({ ev: 'restore', value: o.noAds ? 'noads' : 'none', amount: n });
  return { restored: n, noAds: noAdsOwned() };
}

// ---------------------------------------------------------------------------
// Стартовый набор: когда предложить

/** Победа: пора ли предложить стартовый набор (после уровня 20). Если да — показ засчитан. */
export function starterOfferAfterWin(levelNum: number): boolean {
  return takeStarterOffer('win', levelNum);
}

/** «Почти!»: счётчик за день; на втором за день — пора ли предложить стартовый набор. */
export function starterOfferAfterAlmost(canShow = true): boolean {
  SaveService.update((d) => {
    d.economy = { ...d.economy, shop: recordAlmost(d.economy.shop, today()) };
  });
  return canShow && takeStarterOffer('almost', 0);
}

function takeStarterOffer(trigger: 'win' | 'almost', levelNum: number): boolean {
  if (!starterOfferDue({ shop: shop(), today: today(), trigger, levelNum, storeAvailable: store.supported })) return false;
  SaveService.update((d) => {
    d.economy = { ...d.economy, shop: recordStarterOffer(d.economy.shop, today()) };
    log(d, { ev: 'starter_offer', source: trigger });
  });
  return true;
}

// ---------------------------------------------------------------------------
// Согласие (UMP, ATT) и запуск

/** Форма Google UMP (если нужна) — результат для решения об аналитике. */
export const gatherConsent = (): Promise<ConsentResult> => ads.gatherConsent();
export const privacyOptionsAvailable = () => ads.privacyOptionsAvailable();
export async function showPrivacyOptions(): Promise<ConsentResult | null> {
  logOnly({ ev: 'privacy_options' });
  return ads.showPrivacyOptions();
}
export const trackingStatus = () => ads.trackingStatus();
export const requestTracking = () => ads.requestTracking();
export const startAds = () => (ads.supported ? ads.start() : Promise.resolve());

let storeStarted = false;
/**
 * Покупки при запуске: настроить стор (с id аккаунта, если игрок вошёл) и подтянуть права — «Без рекламы»
 * восстанавливается само на новом устройстве с тем же аккаунтом.
 */
export async function startStore(userId: string | null) {
  if (!store.supported || storeStarted) return;
  storeStarted = true;
  await store.init(userId);
  const o = await store.owned();
  if (o) applyOwned(o, 'restore');
  void loadProducts();
}

/** Вход в аккаунт Supabase — Purchases.logIn(user.id), выход — logOut. */
export async function onAccount(userId: string | null) {
  if (!store.supported) return;
  if (!storeStarted) return startStore(userId);
  if (userId) {
    const o = await store.logIn(userId);
    if (o) applyOwned(o, 'restore');
  } else await store.logOut();
}
