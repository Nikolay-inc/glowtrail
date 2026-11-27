// Remote Config: значения по умолчанию — здесь, в коде; при старте подгружаются из Firebase (таймаут 2 с).
// Пока это заготовки на будущее (реклама, экономика, задания) — ни на что в игре не влияют.

export const REMOTE_DEFAULTS = {
  /** С какого уровня показывать межуровневую рекламу (Р6). */
  ads_interstitial_from_level: 15,
  /** Раз в сколько пройденных уровней. */
  ads_interstitial_every_n_levels: 3,
  /** Сколько наград за рекламу в день. */
  ads_rewarded_daily_cap: 5,
  /** Множитель монет за уровни. */
  economy_coin_multiplier: 1,
  /** Задания жителей включены. */
  quests_enabled: true,
} as const;

export type RemoteKey = keyof typeof REMOTE_DEFAULTS;
export type RemoteValues = {
  [K in RemoteKey]: (typeof REMOTE_DEFAULTS)[K] extends boolean ? boolean : number;
};

let values: RemoteValues = { ...REMOTE_DEFAULTS };
let source: 'default' | 'remote' = 'default';

/**
 * Приводит сырые значения (строки из Firebase или уже числа/булевы) к типам значений по умолчанию.
 * Неверные и неизвестные ключи отбрасываются — остаётся значение по умолчанию.
 */
export function parseRemote(raw: Record<string, unknown>): RemoteValues {
  const out: RemoteValues = { ...REMOTE_DEFAULTS };
  for (const key of Object.keys(REMOTE_DEFAULTS) as RemoteKey[]) {
    const v = raw[key];
    if (v === undefined || v === null || v === '') continue;
    if (typeof REMOTE_DEFAULTS[key] === 'boolean') {
      if (v === true || v === 'true' || v === '1') (out as Record<string, unknown>)[key] = true;
      else if (v === false || v === 'false' || v === '0') (out as Record<string, unknown>)[key] = false;
    } else {
      const n = typeof v === 'number' ? v : Number(v);
      if (Number.isFinite(n) && n >= 0) (out as Record<string, unknown>)[key] = n;
    }
  }
  return out;
}

export function applyRemote(raw: Record<string, unknown>) {
  values = parseRemote(raw);
  source = 'remote';
}

/** Значение настройки: из Firebase, если загрузилось, иначе по умолчанию. */
export function remote<K extends RemoteKey>(key: K): RemoteValues[K] {
  return values[key];
}

export const remoteSource = () => source;
export const remoteValues = (): RemoteValues => ({ ...values });
