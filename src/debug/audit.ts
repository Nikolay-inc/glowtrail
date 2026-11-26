// Проверка вёрстки под переводы (npm run i18n-check, ?audit=1): открывает каждый экран и окно игры и ищет
// надписи, которые вылезают за свой контейнер (UIText, кнопка, окно Modal) или за экран.
// Работает в браузере поверх настоящих сцен; скрипт scripts/i18n-check.ts управляет им через Playwright.

import Phaser from 'phaser';
import { nextVillageObject, VILLAGE } from '../core/economy';
import { getLocale, keyOfText, t } from '../i18n';
import { LEVELS } from '../levels/index';
import { getEconomy } from '../meta';
import { SaveService } from '../save/SaveService';
import { ALL_RULES } from '../tutorial';
import { showCurrencyIntro, showDailyDialog } from '../ui/meta';
import { showNameDialog } from '../ui/NameDialog';
import { showNotEnough } from '../ui/notEnough';
import { ellipsisLog, type UIBox } from '../ui/UIText';

export interface Violation {
  view: string;
  key: string;
  text: string;
  reason: 'box' | 'button' | 'panel' | 'screen';
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
  // Открытый лесной квартал (последним: отмечает уровень 30 пройденным в сохранении проверки).
  v['village-forest'] = async () => {
    SaveService.update((d) => {
      d.progress.stars[LEVELS[29].id] = 2;
      d.economy.buildings = { ...d.economy.buildings, herbalist: 1, observatory: 2 };
    });
    await start('Village', { district: 'forest' }, 1000);
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

/** Надписи активных сцен, которые вылезают за свой контейнер, кнопку, окно или экран. */
export function check(game: Phaser.Game, view: string): Violation[] {
  const out: Violation[] = [];
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
  };
}
