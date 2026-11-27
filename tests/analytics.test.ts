import { beforeEach, describe, expect, it } from 'vitest';
import { analyticsAllowed, consentDue, consentRegion, FIREBASE_EVENT_NAMES, firebaseEvent, userProperties } from '../src/analytics/events';
import { firebaseWebConfig, sentryDsn } from '../src/analytics/config';
import { parseRemote, REMOTE_DEFAULTS } from '../src/analytics/remoteConfig';
import { scrubEmails } from '../src/analytics/scrub';
import { memoryBackend, migrate, newLogEntries, SaveService, type LogEvent } from '../src/save/SaveService';
import { logEvent } from '../src/storage';
import { mergeSaves, toCloudPayload } from '../src/cloud/merge';

const ev = (e: Omit<LogEvent, 't'>, t = '2026-11-27T10:00:00.000Z'): LogEvent => ({ t, ...e });

describe('события Firebase из лога', () => {
  it('попытки уровня — level_*, сессия — game_session_start (session_start зарезервировано), остальные — как в логе', () => {
    expect(firebaseEvent(ev({ ev: 'start', level: 'valley-07' })).name).toBe('level_start');
    expect(firebaseEvent(ev({ ev: 'win', level: 'valley-07' })).name).toBe('level_win');
    expect(firebaseEvent(ev({ ev: 'lose', level: 'valley-07' })).name).toBe('level_lose');
    expect(firebaseEvent(ev({ ev: 'abandon', level: 'valley-07' })).name).toBe('level_abandon');
    expect(firebaseEvent(ev({ ev: 'session' })).name).toBe('game_session_start');
    for (const name of ['tutorial_step', 'tutorial_complete', 'hint_used', 'auto_ease', 'level_skipped', 'currency_earn', 'currency_spend', 'village_restore', 'building_upgrade', 'decor_place', 'street_upgrade', 'quest_done', 'cozy_level', 'daily_reward', 'wardrobe_buy', 'skin_buy', 'settings_change', 'language_change'] as const) {
      expect(firebaseEvent(ev({ ev: name })).name).toBe(name);
    }
    // Зарезервированные имена Firebase не используем.
    const reserved = ['session_start', 'first_open', 'app_update', 'screen_view', 'user_engagement', 'error'];
    for (const n of Object.values(FIREBASE_EVENT_NAMES)) expect(reserved).not.toContain(n);
  });

  it('те же параметры: без времени и пустых, с номером уровня', () => {
    const { params } = firebaseEvent(ev({ ev: 'win', level: 'valley-07', attempt: 2, ms: 41000, stars: 3, tilesLeft: 4, hints: 1, undos: 0, moves: 9 }), (id) => (id === 'valley-07' ? 7 : undefined));
    expect(params).toEqual({ level: 'valley-07', attempt: 2, ms: 41000, stars: 3, tilesLeft: 4, hints: 1, undos: 0, moves: 9, level_num: 7 });
    const spend = firebaseEvent(ev({ ev: 'currency_spend', currency: 'coins', amount: 30, item: 'hint', source: undefined }));
    expect(spend.params).toEqual({ currency: 'coins', amount: 30, item: 'hint' });
  });

  it('длинные строки обрезаются до 100 символов, булевы — 0/1', () => {
    const { params } = firebaseEvent(ev({ ev: 'cozy_level', item: 'x'.repeat(300), undo: true }));
    expect((params.item as string).length).toBe(100);
    expect(params.undo).toBe(1);
  });

  it('свойства игрока — строки', () => {
    expect(userProperties({ chapter: 1, totalStars: 42, cozyLevel: 3, language: 'ru', version: '0.2.0 (29)' })).toEqual({ chapter: '1', total_stars: '42', cozy_level: '3', game_language: 'ru', game_version: '0.2.0 (29)' });
  });
});

describe('согласие на статистику', () => {
  it('ЕС, ЕЭЗ, Великобритания и Швейцария — по часовому поясу', () => {
    for (const tz of ['Europe/Berlin', 'Europe/Paris', 'Europe/Warsaw', 'Europe/London', 'Europe/Zurich', 'Europe/Oslo', 'Atlantic/Canary', 'Europe/Riga']) expect(consentRegion(tz, [])).toBe(true);
    for (const tz of ['Europe/Moscow', 'Europe/Kyiv', 'Europe/Kiev', 'Europe/Minsk', 'Europe/Istanbul', 'America/New_York', 'Asia/Almaty', 'UTC']) expect(consentRegion(tz, ['de-DE'])).toBe(false);
  });

  it('без часового пояса — по региону языка, без данных — спрашиваем', () => {
    expect(consentRegion(undefined, ['de-DE'])).toBe(true);
    expect(consentRegion(undefined, ['ru-RU', 'en-US'])).toBe(false);
    expect(consentRegion(undefined, ['en'])).toBe(true);
    expect(consentRegion(undefined, [])).toBe(true);
  });

  it('без согласия в ЕС статистика выключена, вне ЕС — включена, пока игрок не выключит', () => {
    expect(analyticsAllowed('', true)).toBe(false);
    expect(analyticsAllowed('yes', true)).toBe(true);
    expect(analyticsAllowed('no', true)).toBe(false);
    expect(analyticsAllowed('', false)).toBe(true);
    expect(analyticsAllowed('no', false)).toBe(false);
    expect(consentDue('', true)).toBe(true);
    expect(consentDue('no', true)).toBe(false);
    expect(consentDue('', false)).toBe(false);
  });

  it('выбор хранится в сохранении (v9), старые сохранения — «не спрашивали», при входе в аккаунт — с этого устройства', () => {
    const old = migrate({ version: 8, progress: { unlocked: ['valley-01'], stars: {} }, log: [] });
    expect(old.version).toBe(9);
    expect(old.progress.analytics).toBe('');
    expect(migrate({ version: 9, progress: { analytics: 'no' } }).progress.analytics).toBe('no');
    expect(migrate({ version: 9, progress: { analytics: 'maybe' } }).progress.analytics).toBe('');
    const local = migrate({ version: 9, progress: { analytics: 'yes' } });
    const cloud = toCloudPayload(migrate({ version: 9, progress: { analytics: 'no' } }));
    expect(mergeSaves(local, cloud).progress.analytics).toBe('yes');
  });
});

describe('новые записи лога', () => {
  beforeEach(() => SaveService.setBackend(memoryBackend()));

  it('дописанный хвост — новые записи; заменённый лог — нет', () => {
    const a = ev({ ev: 'session' }, '1');
    const b = ev({ ev: 'start' }, '2');
    expect(newLogEntries([a], [a, b])).toEqual([b]);
    expect(newLogEntries([], [a])).toEqual([a]);
    expect(newLogEntries(null, [a])).toEqual([]);
    expect(newLogEntries([a, b], [a, b])).toEqual([]);
    expect(newLogEntries([b], [a, b])).toEqual([]);
  });

  it('SaveService.onLog видит logEvent и прямую запись в d.log, в том числе когда лог упёрся в предел', () => {
    const seen: string[] = [];
    const off = SaveService.onLog((events) => seen.push(...events.map((e) => e.ev)));
    logEvent({ ev: 'session' });
    SaveService.update((d) => void d.log.push(ev({ ev: 'tutorial_step', step: 'x' }), ev({ ev: 'tutorial_complete' })));
    SaveService.update((d) => void (d.progress.muted = true)); // без записи в лог
    SaveService.update((d) => {
      d.log = Array.from({ length: 2000 }, (_, i) => ev({ ev: 'tap_place' }, String(i)));
    });
    seen.length = 0;
    logEvent({ ev: 'hint_used' });
    logEvent({ ev: 'auto_ease' });
    expect(seen).toEqual(['hint_used', 'auto_ease']);
    off();
  });
});

describe('Remote Config', () => {
  it('значения по умолчанию в коде, неверные значения отбрасываются', () => {
    expect(parseRemote({})).toEqual(REMOTE_DEFAULTS);
    expect(parseRemote({ economy_coin_multiplier: '1.5', quests_enabled: 'false', ads_rewarded_daily_cap: 'abc', unknown: 1 })).toEqual({ ...REMOTE_DEFAULTS, economy_coin_multiplier: 1.5, quests_enabled: false });
    expect(Object.keys(REMOTE_DEFAULTS).sort()).toEqual(['ads_interstitial_every_n_levels', 'ads_interstitial_from_level', 'ads_rewarded_daily_cap', 'economy_coin_multiplier', 'quests_enabled']);
  });
});

describe('ключи и персональные данные', () => {
  it('без ключей Firebase и Sentry выключены', () => {
    expect(firebaseWebConfig({})).toBeNull();
    expect(firebaseWebConfig({ VITE_FIREBASE_API_KEY: 'k', VITE_FIREBASE_PROJECT_ID: 'p', VITE_FIREBASE_APP_ID: 'a' })).toBeNull();
    expect(firebaseWebConfig({ VITE_FIREBASE_API_KEY: 'k', VITE_FIREBASE_PROJECT_ID: 'p', VITE_FIREBASE_APP_ID: 'a', VITE_FIREBASE_MEASUREMENT_ID: 'G-1' })?.measurementId).toBe('G-1');
    expect(sentryDsn({})).toBe('');
    expect(sentryDsn({ VITE_SENTRY_DSN: 'not a dsn' })).toBe('');
    expect(sentryDsn({ VITE_SENTRY_DSN: 'https://abc@o1.ingest.sentry.io/123' })).toBe('https://abc@o1.ingest.sentry.io/123');
  });

  it('почта вырезается из отчётов об ошибках', () => {
    const e = scrubEmails({ message: 'login failed for player@example.com', extra: { list: ['a.b@mail.ru', 3] }, n: 1 });
    expect(e).toEqual({ message: 'login failed for [email]', extra: { list: ['[email]', 3] }, n: 1 });
  });
});
