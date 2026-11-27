// Проверка вёрстки под переводы (npm run i18n-check, ?audit=1): открывает каждый экран и окно игры и ищет
// надписи, которые вылезают за свой контейнер (UIText, кнопка, окно Modal) или за экран.
// Работает в браузере поверх настоящих сцен; скрипт scripts/i18n-check.ts управляет им через Playwright.

import Phaser from 'phaser';
import { nextVillageObject, VILLAGE } from '../core/economy';
import { getLocale, keyOfText, missingKeys, t } from '../i18n';
import { SETS, WARDROBE } from '../core/wardrobe';
import { BUILDINGS, DECOR_TYPE_ORDER, DISTRICTS } from '../core/villageData';
import { LEVELS } from '../levels/index';
import { getEconomy } from '../meta';
import { SaveService } from '../save/SaveService';
import { ALL_RULES } from '../tutorial';
import { showCurrencyIntro, showDailyDialog } from '../ui/meta';
import { showNameDialog } from '../ui/NameDialog';
import { showNotEnough } from '../ui/notEnough';
import { showBloomGift } from '../ui/bloomGift';
import { overlap, type Box } from '../ui/gesture';
import { ellipsisLog, type UIBox } from '../ui/UIText';

export interface Violation {
  view: string;
  key: string;
  text: string;
  reason: 'box' | 'button' | 'panel' | 'screen' | 'rawid' | 'overlap';
  over: number;
}

type Any = Record<string, (...a: unknown[]) => unknown>;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Экраны и окна для проверки: имя → как открыть. */
function views(game: Phaser.Game): Record<string, () => Promise<void>> {
  const start = async (key: string, data?: object, wait = 900) => {
    for (const s of game.scene.getScenes(true)) if (s.scene.key !== key) s.scene.stop();
    game.scene.start(key, data);
    await sleep(wait);
    return game.scene.getScene(key);
  };
  const v: Record<string, () => Promise<void>> = {
    map: async () => void (await start('Menu')),
    daily: async () => {
      const s = await start('Menu');
      showDailyDialog(s, () => undefined);
      await sleep(500);
    },
    currency: async () => {
      const s = await start('Menu');
      showCurrencyIntro(s, () => undefined);
      await sleep(500);
    },
    name: async () => {
      const s = await start('Menu');
      showNameDialog(s, { title: t('name_title'), withAvatars: true, secondary: 'skip', onClose: () => undefined });
      await sleep(500);
    },
    village: async () => void (await start('Village')),
    'village-bonuses': async () => {
      const s = (await start('Village')) as unknown as Any;
      s.showBonuses();
      await sleep(500);
    },
    'village-restore': async () => {
      const s = (await start('Village')) as unknown as Any;
      s.showBuilding(nextVillageObject(getEconomy()) ?? VILLAGE[0]);
      await sleep(500);
    },
    'village-locked': async () => {
      const s = (await start('Village')) as unknown as Any;
      s.showBuilding(VILLAGE[VILLAGE.length - 1]);
      await sleep(500);
    },
    'village-restored': async () => {
      const s = (await start('Village')) as unknown as Any;
      s.showRestored(VILLAGE[0], VILLAGE[0].reward);
      await sleep(1900);
    },
    'village-building-lit': async () => {
      const s = (await start('Village')) as unknown as Any;
      s.showBuilding(VILLAGE[0]);
      await sleep(500);
    },
    'village-upgrade': async () => {
      const s = (await start('Village')) as unknown as Any;
      s.showBuilding(VILLAGE[0]);
      await sleep(500);
    },
    'village-upgraded': async () => {
      const s = (await start('Village')) as unknown as Any;
      s.showUpgraded('well', 2);
      await sleep(1900);
    },
    'village-edit': async () => {
      const s = (await start('Village')) as unknown as Any;
      s.toggleEdit();
      await sleep(500);
    },
    'village-street': async () => {
      const s = (await start('Village')) as unknown as Any;
      s.showStreet(1);
      await sleep(500);
    },
    'village-decor': async () => {
      const s = (await start('Village')) as unknown as Any;
      s.showDecor(3);
      await sleep(500);
    },
    'village-cozy': async () => {
      const s = (await start('Village')) as unknown as Any;
      s.showCozy();
      await sleep(500);
    },
    'village-quests': async () => {
      const s = (await start('Village')) as unknown as Any;
      s.showQuests();
      await sleep(500);
    },
    'village-forest-locked': async () => {
      const s = (await start('Village')) as unknown as Any;
      s.switchDistrict(1);
      await sleep(700);
    },
    'village-mountain': async () => {
      const s = (await start('Village')) as unknown as Any;
      s.switchDistrict(1);
      s.switchDistrict(1);
      await sleep(700);
    },
    workshop: async () => void (await start('Workshop')),
    'not-enough': async () => {
      const s = await start('Workshop');
      showNotEnough(s, 'coins', 120);
      await sleep(500);
    },
    profile: async () => void (await start('Profile')),
    'profile-language': async () => {
      const s = (await start('Profile')) as unknown as Any;
      s.chooseLanguage();
      await sleep(500);
    },
    stats: async () => void (await start('Stats')),
    'goal-card': async () => void (await start('Game', { levelIndex: 24 }, 1400)),
    'lumo-tip': async () => {
      const s = (await start('Game', { levelIndex: 5 }, 1400)) as unknown as { tips: { show: (o: object) => void }; [k: string]: unknown };
      (s as unknown as Any).closeOverlay?.();
      s.tips.show({ text: t('tip_hint'), target: { x: 540, y: 1500 }, side: 'above' });
      await sleep(500);
    },
    win: async () => {
      const s = (await start('Game', { levelIndex: 12 }, 1400)) as unknown as Any;
      s.closeOverlay?.();
      s.showWinPanel(3);
      await sleep(1600);
    },
    almost: async () => {
      const s = (await start('Game', { levelIndex: 12 }, 1400)) as unknown as Any;
      s.closeOverlay?.();
      s.showLosePanel();
      await sleep(700);
    },
    'hints-out': async () => {
      const s = (await start('Game', { levelIndex: 12 }, 1400)) as unknown as Any;
      s.closeOverlay?.();
      s.showBuyHintPanel();
      await sleep(600);
    },
  };
  for (const tab of ['lamp', 'road', 'arch'] as const) v[`shop-${tab}`] = async () => void (await start('Shop', { tab }));
  for (const part of ['hat', 'face', 'outfit', 'staff', 'accessory', 'pet', 'trail', 'sets'] as const) v[`wardrobe-${part}`] = async () => void (await start('Shop', { tab: 'wardrobe', part }));
  ALL_RULES.forEach((r, i) => (v[`rule-${r}`] = async () => void (await start('Rules', { cards: [...ALL_RULES], index: i, from: 'Menu', menuMode: true }, 1200))));
  // Награда испытания: выбор постройки для расцвета и «подарок ждёт» (нет постройки на 2-м уровне).
  const giftPending = () =>
    SaveService.update((d) => {
      if (!d.economy.challenges.earned.includes('audit-challenge')) d.economy.challenges.earned.push('audit-challenge');
      delete d.economy.challenges.bloomed['audit-challenge'];
    });
  v['win-challenge'] = async () => {
    giftPending();
    const s = (await start('Game', { levelIndex: 9 }, 1400)) as unknown as Any;
    s.closeOverlay?.();
    s.showWinPanel(3);
    // В игре окно открывается через 1,3 с после окна победы (таймер сцены); здесь — сразу.
    showBloomGift(s as unknown as Phaser.Scene, { street: 'valley:2' });
    await sleep(600);
  };
  v['bloom-gift'] = async () => {
    giftPending();
    const s = await start('Village');
    showBloomGift(s, { street: 'valley:1' });
    await sleep(500);
  };
  v['bloom-wait'] = async () => {
    giftPending();
    const keep = { ...getEconomy().buildings };
    SaveService.update((d) => (d.economy.buildings = Object.fromEntries(Object.entries(keep).map(([k, n]) => [k, Math.min(1, n)]))));
    const s = await start('Village');
    showBloomGift(s, { coins: 100 });
    await sleep(500);
    SaveService.update((d) => (d.economy.buildings = keep));
  };
  // Все постройки долины восстановлены (подписи с огоньками уровня) — обычный вид и «Украсить» с участком.
  const allLit = async (edit: boolean, plot: number | null) => {
    const keep = { ...getEconomy().buildings };
    SaveService.update((d) => (d.economy.buildings = { ...keep, well: 3, bakery: 2, workshop: 2, mill: 1, bridge: 3, garden: 1, chapel: 2, square: 1, lumo: 1, lighthouse: 1 }));
    const s = (await start('Village')) as unknown as Any & { plot: number | null };
    if (edit) {
      s.toggleEdit();
      if (plot !== null) s.selectPlot(plot);
    }
    await sleep(500);
    SaveService.update((d) => (d.economy.buildings = keep));
  };
  v['village-all'] = () => allLit(false, null);
  v['village-all-edit'] = () => allLit(true, 3);
  // Открытый лесной квартал (последним: отмечает уровень 30 пройденным в сохранении проверки).
  v['village-forest'] = async () => {
    SaveService.update((d) => {
      d.progress.stars[LEVELS[29].id] = 2;
      d.economy.buildings = { ...d.economy.buildings, herbalist: 1, observatory: 2, 'swing-bridge': 3 };
    });
    await start('Village', { district: 'forest' }, 1000);
  };
  v['village-forest-edit'] = async () => {
    const s = (await start('Village', { district: 'forest' }, 1000)) as unknown as Any;
    s.toggleEdit();
    await sleep(500);
  };
  return v;
}

type Rect = { x: number; y: number; w: number; h: number };
const contains = (o: Rect, i: Rect, tol: number) => Math.max(o.x - i.x, i.x + i.w - (o.x + o.w), o.y - i.y, i.y + i.h - (o.y + o.h)) - tol;

/** Прямоугольник (-w/2..w/2, -h/2..h/2) в локальных координатах объекта → мир. */
function localRectToWorld(o: Phaser.GameObjects.Container, w: number, h: number, ox = 0.5, oy = 0.5): Rect {
  const m = o.getWorldTransformMatrix();
  const pts = [
    [-w * ox, -h * oy],
    [w * (1 - ox), -h * oy],
    [-w * ox, h * (1 - oy)],
    [w * (1 - ox), h * (1 - oy)],
  ].map(([x, y]) => m.transformPoint(x, y));
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
}

function boundsOf(o: Phaser.GameObjects.GameObject): Rect {
  const b = (o as unknown as { getBounds: () => Phaser.Geom.Rectangle }).getBounds();
  return { x: b.x, y: b.y, w: b.width, h: b.height };
}

function shown(o: Phaser.GameObjects.GameObject): boolean {
  let p: Phaser.GameObjects.GameObject | null = o;
  while (p) {
    const q = p as unknown as { visible: boolean; alpha: number; parentContainer: Phaser.GameObjects.Container | null };
    if (!q.visible || q.alpha < 0.05) return false;
    p = q.parentContainer;
  }
  return true;
}

/** Внутренние id данных (постройки, районы, вещи, наборы, украшения) — в интерфейсе их быть не должно. */
const RAW_IDS = new Set<string>([...BUILDINGS.map((b) => b.id), ...DISTRICTS, ...WARDROBE.map((w) => w.id), ...SETS.map((s) => s.id), ...DECOR_TYPE_ORDER]);
/** В псевдо-языке все переведённые буквы с акцентами: «голое» слово-id значит, что надпись мимо i18n. */
const rawIdIn = (s: string) => s.split(/[^a-z0-9-]+/).find((w) => w.length > 2 && RAW_IDS.has(w));

type LBox = Box & { kind: string; owner: number; id: string; road?: boolean };
/** Что с чем не должно перекрываться на карте деревни. */
const CLASH: Record<string, string[]> = { label: ['label', 'art'], slot: ['label', 'art', 'walker', 'street', 'slot'], street: ['label', 'art', 'street'] };

/** Карта деревни: подписи и ценники не под соседними постройками (лопастями), слоты и знаки улиц — ни на чём. */
export function villageOverlaps(boxes: LBox[], view: string, labels = true): Violation[] {
  const out: Violation[] = [];
  for (let i = 0; i < boxes.length; i++) {
    for (let j = 0; j < boxes.length; j++) {
      if (i === j) continue;
      const a = boxes[i];
      const b = boxes[j];
      if (!CLASH[a.kind]?.includes(b.kind)) continue;
      if (!labels && (a.kind === 'label' || b.kind === 'label')) continue;
      if (a.kind === b.kind && j < i) continue;
      // Своя подпись — под своим рисунком: это не перекрытие.
      if (a.kind === 'label' && b.kind === 'art' && a.owner === b.owner) continue;
      // Знак улицы на мосту — мост и есть улица.
      if (a.kind === 'street' && b.road) continue;
      if (overlap(a, b, 2)) out.push({ view, key: `${a.id} × ${b.id}`, text: `${a.kind} × ${b.kind}`, reason: 'overlap', over: 0 });
    }
  }
  return out;
}

/** Надписи активных сцен, которые вылезают за свой контейнер, кнопку, окно или экран, и надписи с id вместо названия. */
export function check(game: Phaser.Game, view: string): Violation[] {
  const out: Violation[] = [];
  for (const scene of game.scene.getScenes(true)) {
    const boxes = (scene as unknown as { boxes?: LBox[]; modal?: unknown }).boxes;
    // Подписи в псевдо-языке искусственно длинные: их перекрытия проверяются на настоящих языках (второй проход i18n-check).
    if (scene.scene.key === 'Village' && boxes) out.push(...villageOverlaps(boxes, view, getLocale() !== 'qps'));
  }
  for (const scene of game.scene.getScenes(true)) {
    const cam = scene.cameras.main;
    const screen: Rect = { x: cam.worldView.x, y: cam.worldView.y, w: cam.worldView.width, h: cam.worldView.height };
    const visit = (o: Phaser.GameObjects.GameObject) => {
      const isText = o instanceof Phaser.GameObjects.Text;
      const ui = o.getData?.('ui') as UIBox | undefined;
      const parent = (o as unknown as { parentContainer: Phaser.GameObjects.Container | null }).parentContainer;
      const insideRich = isText && !!parent?.getData('ui') && !(parent instanceof Phaser.GameObjects.Text);
      if ((isText && !insideRich && (o as Phaser.GameObjects.Text).text.trim()) || (o instanceof Phaser.GameObjects.Container && ui)) {
        if (shown(o)) {
          const b = boundsOf(o);
          const src = ui?.src ?? (o as Phaser.GameObjects.Text).text;
          const key = ui?.key ?? keyOfText(src) ?? '?';
          const push = (reason: Violation['reason'], over: number) => over > 0 && out.push({ view, key, text: src.slice(0, 80), reason, over: Math.round(over) });
          // За экран — только если надпись видна частично (целиком за краем — прокрутка карты/сетки).
          const outside = b.x > screen.x + screen.w || b.x + b.w < screen.x || b.y > screen.y + screen.h || b.y + b.h < screen.y;
          let scrolled = false;
          for (let q = parent; q; q = (q as unknown as { parentContainer: Phaser.GameObjects.Container | null }).parentContainer) if (q.getData('scroll')) scrolled = true;
          if (!outside && !scrolled) push('screen', contains(screen, b, 2));
          const raw = getLocale() === 'qps' ? rawIdIn((o instanceof Phaser.GameObjects.Text ? o.text : '') || src) : undefined;
          if (raw) out.push({ view, key, text: src.slice(0, 80), reason: 'rawid', over: 0 });
          if (ui && parent !== null && o instanceof Phaser.GameObjects.Text) {
            const ox = o.originX;
            const oy = o.originY;
            const m = parent ? parent.getWorldTransformMatrix() : null;
            const corner = (x: number, y: number) => (m ? m.transformPoint(x, y) : { x, y });
            const a = corner(o.x - ox * ui.w * o.scaleX, o.y - oy * ui.h * o.scaleY);
            const c2 = corner(o.x + (1 - ox) * ui.w * o.scaleX, o.y + (1 - oy) * ui.h * o.scaleY);
            push('box', contains({ x: Math.min(a.x, c2.x), y: Math.min(a.y, c2.y), w: Math.abs(c2.x - a.x), h: Math.abs(c2.y - a.y) }, b, 3));
          } else if (ui && o instanceof Phaser.GameObjects.Text) {
            push('box', contains({ x: o.x - o.originX * ui.w, y: o.y - o.originY * ui.h, w: ui.w, h: ui.h }, b, 3));
          }
          // Внутри кнопки и окна.
          let p = parent;
          while (p) {
            if (p.constructor.name === 'Button' || (p as unknown as { buttonWidth?: number }).buttonWidth !== undefined) push('button', contains(localRectToWorld(p, p.width, p.height), b, 4));
            const panel = p.getData('panel') as { w: number; h: number } | undefined;
            if (panel) push('panel', contains(localRectToWorld(p, panel.w, panel.h), b, 4));
            p = (p as unknown as { parentContainer: Phaser.GameObjects.Container | null }).parentContainer;
          }
        }
      }
      if (o instanceof Phaser.GameObjects.Container) for (const ch of o.list) visit(ch);
    };
    for (const o of scene.children.list) visit(o);
  }
  return out;
}

export function install(game: Phaser.Game) {
  (globalThis as { __glowAudit?: boolean }).__glowAudit = true;
  const v = views(game);
  (window as unknown as { __audit: object }).__audit = {
    views: Object.keys(v),
    locale: () => getLocale(),
    open: (name: string) => v[name](),
    check: (name: string) => check(game, name),
    ellipsis: () => ellipsisLog.splice(0),
    /**
     * Проверка касаний: открыть деревню и вернуть экранные точки (CSS px) центра рисунка и подписи постройки —
     * i18n-check нажимает туда мышью и ждёт окно постройки (`modalOpen`).
     */
    tapTargets: async (id: string, district = 'valley') => {
      for (const sc of game.scene.getScenes(true)) if (sc.scene.key !== 'Village') sc.scene.stop();
      // Лесной квартал открывается после уровня 30.
      if (district === 'forest') SaveService.update((d) => (d.progress.stars[LEVELS[29].id] = Math.max(1, d.progress.stars[LEVELS[29].id] ?? 0)));
      game.scene.start('Village', { district });
      await sleep(900);
      // Ждём, пока сцена запустится и нарисует карту (камера есть только у работающей сцены).
      let s = game.scene.getScene('Village') as unknown as { boxes: LBox[]; cameras: Phaser.Cameras.Scene2D.CameraManager; sys: Phaser.Scenes.Systems };
      for (let n = 0; n < 100 && !(s?.sys.isActive() && s.cameras?.main && s.boxes?.length); n++) {
        await sleep(100);
        s = game.scene.getScene('Village') as unknown as typeof s;
      }
      const cam = s.cameras.main;
      const r = game.canvas.getBoundingClientRect();
      const k = r.width / game.scale.width;
      const toScreen = (x: number, y: number) => ({ x: r.left + (x - cam.worldView.x) * cam.zoom * k, y: r.top + (y - cam.worldView.y) * cam.zoom * k });
      const at = (kind: string) => {
        const b = s.boxes.find((x) => x.kind === kind && x.id === id);
        // Рисунок — чуть ниже середины (у лопастей мельницы середина прямоугольника — в небе), подпись — по центру.
        return b ? toScreen(b.x + b.w / 2, kind === 'art' ? b.y + b.h * 0.7 : b.y + b.h / 2) : null;
      };
      return { art: at('art'), label: at('label') };
    },
    /** Что под указателем в деревне (отладка касаний). */
    hit: () => {
      const s = game.scene.getScene('Village');
      return s.input.hitTestPointer(game.input.activePointer).map((o) => `${o.type} d${(o as unknown as { depth: number }).depth} w${(o as unknown as { width: number }).width}`);
    },
    /** Открыто ли окно в деревне (и закрыть его). */
    modalOpen: () => {
      const s = game.scene.getScene('Village') as unknown as { modal?: { close: (silent?: boolean) => void; root: Phaser.GameObjects.Container } };
      const m = s?.modal;
      // Убрать сразу (без анимации закрытия): затемнение окна иначе перехватит следующее нажатие проверки.
      m?.close(true);
      m?.root.destroy();
      return !!m;
    },
    /** Ключи без перевода, показанные с прошлого вызова. */
    missing: () => {
      const out = [...missingKeys];
      missingKeys.clear();
      return out;
    },
  };
}
