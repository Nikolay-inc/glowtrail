// Покупки за интерфейсом: в приложении — RevenueCat (@revenuecat/purchases-capacitor; цены и покупка — из App Store /
// Google Play), без ключа RevenueCat в тестовом режиме — тестовый магазин (подтверждение покупки, цены с пометкой
// «тест», история покупок на устройстве — чтобы проверить начисление и «Восстановить покупки»), в веб-версии —
// покупок нет (supported = false, витрина пишет «доступно в приложении»). При разработке: ?store=fake.

import { isNative, platform } from '../platform';
import { CONSUMABLE, PRODUCT_KEYS, type ProductKey } from '../core/shop';
import { ENTITLEMENT_NO_ADS, productId, revenueCatKey, TEST_MODE } from './config';

export interface StoreProduct {
  key: ProductKey;
  /** Идентификатор в сторе (`com.severgames.glowtrail.noads`). */
  id: string;
  /** Цена из стора — уже в валюте и формате игрока. */
  price: string;
}

export type PurchaseResult = { ok: true; key: ProductKey; txId: string } | { ok: false; cancelled: boolean; error: string };

/** Что у игрока куплено по данным стора: права и транзакции (для восстановления). */
export interface StoreOwned {
  noAds: boolean;
  starter: boolean;
  transactions: { key: ProductKey; txId: string }[];
}

export interface StoreProvider {
  readonly kind: 'revenuecat' | 'test' | 'none';
  readonly supported: boolean;
  init(appUserId?: string | null): Promise<void>;
  products(): Promise<StoreProduct[]>;
  purchase(key: ProductKey): Promise<PurchaseResult>;
  restore(): Promise<StoreOwned | null>;
  /** Текущие права (без запроса к стору, если есть кэш). */
  owned(): Promise<StoreOwned | null>;
  logIn(appUserId: string): Promise<StoreOwned | null>;
  logOut(): Promise<void>;
}

export const keyOfProduct = (id: string): ProductKey | null => {
  const k = id.split('.').pop() as ProductKey;
  return PRODUCT_KEYS.includes(k) ? k : null;
};

/** Веб-версия: покупок нет. */
export const noStore: StoreProvider = {
  kind: 'none',
  supported: false,
  init: async () => undefined,
  products: async () => [],
  purchase: async () => ({ ok: false, cancelled: false, error: 'unsupported' }),
  restore: async () => null,
  owned: async () => null,
  logIn: async () => null,
  logOut: async () => undefined,
};

// ---------------------------------------------------------------------------
// Тестовый магазин (нет ключа RevenueCat или ?store=fake при разработке)

/** Тестовые цены — только для заглушки (в игре с RevenueCat цены приходят из стора). */
export const TEST_PRICES_USD: Record<ProductKey, number> = { noads: 3.99, starter: 4.99, hints_10: 1.99, hints_30: 4.99, coins_s: 1.99, coins_l: 4.99 };

export interface TestStoreOpts {
  /** Подтверждение покупки (по умолчанию — системный confirm). */
  confirm?: (key: ProductKey, price: string) => Promise<boolean>;
  /** Где хранить «историю стора» (по умолчанию localStorage; в тестах — объект в памяти). */
  storage?: { get(): string | null; set(v: string): void };
  locale?: string;
}

const TEST_KEY = 'glowtrail.teststore';

export function testStore(opts: TestStoreOpts = {}): StoreProvider {
  const mem = { v: null as string | null };
  const storage = opts.storage ?? {
    get: () => {
      try {
        return localStorage.getItem(TEST_KEY);
      } catch {
        return mem.v;
      }
    },
    set: (v: string) => {
      try {
        localStorage.setItem(TEST_KEY, v);
      } catch {
        mem.v = v;
      }
    },
  };
  type Rec = { users: Record<string, { key: ProductKey; txId: string }[]> };
  const read = (): Rec => {
    try {
      const r = JSON.parse(storage.get() ?? '') as Rec;
      return r && typeof r.users === 'object' ? r : { users: {} };
    } catch {
      return { users: {} };
    }
  };
  let user = '$anon';
  const ownedOf = (): StoreOwned => {
    const list = read().users[user] ?? [];
    return { noAds: list.some((t) => t.key === 'noads' || t.key === 'starter'), starter: list.some((t) => t.key === 'starter'), transactions: list };
  };
  const fmt = (usd: number) => `${new Intl.NumberFormat(opts.locale ?? (typeof navigator !== 'undefined' ? navigator.language : 'en'), { style: 'currency', currency: 'USD' }).format(usd)} (test)`;
  const confirm =
    opts.confirm ??
    (async (key: ProductKey, price: string) => (typeof window !== 'undefined' && typeof window.confirm === 'function' ? window.confirm(`[Test store] ${productId(key)} — ${price}`) : true));
  let n = 0;
  return {
    kind: 'test',
    supported: true,
    init: async (id) => void (user = id || '$anon'),
    products: async () => PRODUCT_KEYS.map((key) => ({ key, id: productId(key), price: fmt(TEST_PRICES_USD[key]) })),
    async purchase(key) {
      const ok = await confirm(key, fmt(TEST_PRICES_USD[key]));
      if (!ok) return { ok: false, cancelled: true, error: 'cancelled' };
      const rec = read();
      const list = rec.users[user] ?? [];
      if (!CONSUMABLE[key] && list.some((t) => t.key === key)) return { ok: false, cancelled: false, error: 'already_owned' };
      const txId = `test-${Date.now().toString(36)}-${(n++).toString(36)}`;
      rec.users[user] = [...list, { key, txId }];
      storage.set(JSON.stringify(rec));
      return { ok: true, key, txId };
    },
    restore: async () => ownedOf(),
    owned: async () => ownedOf(),
    async logIn(id) {
      // Как RevenueCat: покупки гостя переходят в аккаунт.
      const rec = read();
      const anon = rec.users.$anon ?? [];
      if (anon.length) {
        rec.users[id] = [...(rec.users[id] ?? []), ...anon];
        delete rec.users.$anon;
        storage.set(JSON.stringify(rec));
      }
      user = id;
      return ownedOf();
    },
    logOut: async () => void (user = '$anon'),
  };
}

// ---------------------------------------------------------------------------
// RevenueCat (приложение)

type RC = typeof import('@revenuecat/purchases-capacitor');
type CustomerInfo = import('@revenuecat/purchases-capacitor').CustomerInfo;
type StoreProductRC = import('@revenuecat/purchases-capacitor').PurchasesStoreProduct;

/** Права и транзакции из CustomerInfo RevenueCat. */
export function ownedFromCustomerInfo(info: Pick<CustomerInfo, 'entitlements' | 'allPurchasedProductIdentifiers' | 'nonSubscriptionTransactions'>): StoreOwned {
  const has = (k: ProductKey) => info.allPurchasedProductIdentifiers.includes(productId(k));
  const starter = has('starter');
  const transactions = info.nonSubscriptionTransactions.flatMap((t) => {
    const key = keyOfProduct(t.productIdentifier);
    return key && t.transactionIdentifier ? [{ key, txId: t.transactionIdentifier }] : [];
  });
  return { noAds: !!info.entitlements.active[ENTITLEMENT_NO_ADS] || has('noads') || starter, starter, transactions };
}

function revenueCat(apiKey: string): StoreProvider {
  let mod: RC | null = null;
  const load = async () => (mod ??= await import('@revenuecat/purchases-capacitor'));
  let ready: Promise<boolean> | null = null;
  let cache: StoreProductRC[] = [];
  const P = async () => (await load()).Purchases;
  const ensure = () => ready ?? Promise.resolve(false);
  return {
    kind: 'revenuecat',
    supported: true,
    init(appUserId) {
      ready ??= (async () => {
        const p = await P();
        await p.configure({ apiKey, appUserID: appUserId || null });
        return true;
      })().catch(() => {
        ready = null;
        return false;
      });
      return ready.then(() => undefined);
    },
    async products() {
      if (!(await ensure())) return [];
      try {
        const m = await load();
        const { products } = await m.Purchases.getProducts({ productIdentifiers: PRODUCT_KEYS.map(productId), type: m.PRODUCT_CATEGORY.NON_SUBSCRIPTION });
        cache = products;
        return products.flatMap((pr) => {
          const key = keyOfProduct(pr.identifier);
          return key ? [{ key, id: pr.identifier, price: pr.priceString }] : [];
        });
      } catch {
        return [];
      }
    },
    async purchase(key) {
      if (!(await ensure())) return { ok: false, cancelled: false, error: 'not_configured' };
      const m = await load();
      let product = cache.find((x) => x.identifier === productId(key));
      if (!product) {
        await this.products();
        product = cache.find((x) => x.identifier === productId(key));
      }
      if (!product) return { ok: false, cancelled: false, error: 'no_product' };
      try {
        const r = await m.Purchases.purchaseStoreProduct({ product });
        const txId = r.transaction?.transactionIdentifier;
        if (!txId) return { ok: false, cancelled: false, error: 'no_transaction' };
        return { ok: true, key, txId };
      } catch (e) {
        const err = e as { code?: string; userCancelled?: boolean | null; message?: string };
        const cancelled = !!err.userCancelled || err.code === m.PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR;
        return { ok: false, cancelled, error: cancelled ? 'cancelled' : String(err.code ?? err.message ?? 'error').slice(0, 60) };
      }
    },
    async restore() {
      if (!(await ensure())) return null;
      try {
        return ownedFromCustomerInfo((await (await P()).restorePurchases()).customerInfo);
      } catch {
        return null;
      }
    },
    async owned() {
      if (!(await ensure())) return null;
      try {
        return ownedFromCustomerInfo((await (await P()).getCustomerInfo()).customerInfo);
      } catch {
        return null;
      }
    },
    async logIn(appUserId) {
      if (!(await ensure())) return null;
      try {
        return ownedFromCustomerInfo((await (await P()).logIn({ appUserID: appUserId })).customerInfo);
      } catch {
        return null;
      }
    },
    async logOut() {
      if (!(await ensure())) return;
      try {
        const p = await P();
        if (!(await p.isAnonymous()).isAnonymous) await p.logOut();
      } catch {
        /* уже аноним */
      }
    },
  };
}

/** Покупки для этой платформы: RevenueCat (есть ключ) → тестовый магазин (тестовый режим) → нет покупок. */
export function createStore(): StoreProvider {
  if (isNative()) {
    const os = platform();
    if (os === 'ios' || os === 'android') {
      const key = revenueCatKey(os);
      if (key) return revenueCat(key);
      if (TEST_MODE) return testStore();
    }
    return noStore;
  }
  const q = import.meta.env.DEV && typeof location !== 'undefined' ? new URLSearchParams(location.search).get('store') : null;
  return q === 'fake' ? testStore() : noStore;
}
