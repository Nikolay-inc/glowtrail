// Главное меню — карта мира: одна вертикальная тропинка с кружками уровней через все миры по порядку:
// снизу «Долина» (холмы, деревья, речки, дома без огней), выше «Туманный лес» (ели-силуэты, полосы тумана,
// светящиеся грибы). На стыке миров — переход: полоса тумана и арка из елей, тропинка уходит в лес; пока лес
// закрыт — он под густой дымкой, кружки с замками, на стыке подсказка. Пройденные уровни светятся, под ними
// звёзды; текущий пульсирует, рядом стоит Lumo; «испытания» — кружки побольше с короной. Карта прокручивается
// пальцем, колесом и стрелками; при открытии — прокручена к текущему уровню. Название мира в шапке и музыка —
// по миру в середине экрана. Декорации разбиты на участки по высоте: невидимые участки скрыты, их анимации
// на паузе (карта длинная, цель — 60 кадров на iPhone 11). Сверху — профиль, мир, валюты и «Войти»,
// снизу — «Играть» и вкладки Карта / Деревня / Магазин / Профиль. Награда дня — окном при открытии.
// Когда лес открылся впервые — сначала сцена «Lumo входит в лес» (ForestIntroScene), остальные окна потом.

import { t, tk } from '../i18n';
import { currentLook } from '../ui/skins';
import Phaser from 'phaser';
import { addTabBar, addWallet, showCurrencyIntro, showDailyDialog } from '../ui/meta';
import { dailyAvailable, syncChallenges } from '../meta';
import { currentView, edgeRows, stretchLayout, type ViewRect } from '../ui/viewport';
import { isChallenge, LEVELS, numberInWorld, WORLDS, worldById, worldOpen, type World } from '../levels/index';
import type { Level } from '../core/types';
import { setMusicMood, sfx } from '../audio';
import { hasEnteredWorld, isUnlocked, loadProgress, type Progress } from '../storage';
import { displayName, getProfile } from '../profile';
import { showNameDialog } from '../ui/NameDialog';
import { canShowModal, currencyIntroDue, DAILY_GAP_MS, dailyPrompt, isTutorialDone, markCurrencyIntroSeen, modalClosed, modalOpened } from '../tutorial';
import { Account } from '../cloud/account';
import { openAuthDialog } from '../ui/AuthDialog';
import { addBackground, Button, createAvatarBadge, createLumo, drawFireflyIcon, drawIcon, drawShinyStar, text } from '../ui/draw';
import { setFitted } from '../ui/UIText';
import { C, FONT, W } from '../ui/theme';
import { irisIn, reducedMotion } from '../ui/fx';

/** Шаг между уровнями на карте и размах «змейки» тропинки. */
const STEP = 250;
const SWAY = 290;
const MARGIN_TOP = 420;
const MARGIN_BOTTOM = 420;
/** Дополнительный промежуток между мирами — там переход (туман, арка из елей). */
const GAP = 900;
const R = 66;
const R_CHALLENGE = 88;
/** Высота участка декораций (отсечка невидимого) и запас над/под экраном, в котором участки ещё видны. */
const CHUNK = 1000;
const CULL_PAD = 450;
/** Карта по горизонтали шире раскладки — на широких экранах края не пустые. */
const XL = -800;
const XR = W + 800;

/** Слои карты снизу вверх: у каждого — свои объекты по участкам. */
const LAYERS = ['sky', 'hills', 'water', 'path', 'lit', 'deco', 'glow', 'haze', 'nodes', 'top'] as const;
type Layer = (typeof LAYERS)[number];

interface NodePos {
  level: Level;
  index: number;
  x: number;
  y: number;
  r: number;
}

/** Участок карты по высоте: его объекты прячутся, а анимации ставятся на паузу, когда он далеко от экрана. */
interface CullItem {
  y0: number;
  y1: number;
  objs: Phaser.GameObjects.GameObject[];
  tweens: Phaser.Tweens.Tween[];
  on: boolean;
}

/** Где мир на карте: от верхней границы (top) до нижней (bottom), в координатах карты. */
interface Region {
  world: World;
  top: number;
  bottom: number;
  open: boolean;
}

/**
 * Где на карте кружок уровня i (0 — внизу). breaks — индексы первых уровней следующих миров: перед ними
 * промежуток GAP под переход. Чистая функция — та же раскладка при каждом открытии.
 */
export function mapLayout(count: number, breaks: number[] = []): { height: number; pos: { x: number; y: number }[] } {
  const inside = breaks.filter((b) => b > 0 && b < count);
  const height = MARGIN_TOP + MARGIN_BOTTOM + (count - 1) * STEP + inside.length * GAP;
  const pos = Array.from({ length: count }, (_, i) => ({
    x: W / 2 + Math.sin(i * 0.82 + 0.4) * SWAY * (0.75 + 0.25 * Math.sin(i * 0.31)),
    y: height - MARGIN_BOTTOM - i * STEP - inside.filter((b) => b <= i).length * GAP,
  }));
  return { height, pos };
}

/** Индексы (в LEVELS) первых уровней миров после первого. */
function worldBreaks(): number[] {
  return WORLDS.slice(1).map((w) => LEVELS.indexOf(w.levels[0]));
}

export class MenuScene extends Phaser.Scene {
  private map!: Phaser.GameObjects.Container;
  private mapH = 0;
  private nodes: NodePos[] = [];
  /** Низ верхней панели и верх нижней (в координатах раскладки) — карта прокручивается между ними. */
  private hudTop = 0;
  private hudBottom = 0;
  private drag: { y0: number; map0: number; moved: boolean; lastY: number; lastT: number; v: number } | null = null;
  private velocity = 0;
  private layers = {} as Record<Layer, Phaser.GameObjects.Container>;
  private culled: CullItem[] = [];
  private chunkGfx = new Map<string, Phaser.GameObjects.Graphics>();
  private regions: Region[] = [];
  /** Название мира в шапке и мир в середине экрана (музыка и шапка меняются только при смене). */
  private title: Phaser.GameObjects.Text | null = null;
  private shownWorld = '';
  private calm = false;

  constructor() {
    super('Menu');
  }

  create(data: { focus?: number } = {}) {
    this.velocity = 0;
    this.drag = null;
    this.regions = [];
    const progress = loadProgress();
    // Лес открылся впервые — сначала сцена входа в лес (награда дня и другие окна подождут до возвращения).
    const forest = worldById('forest');
    const audit = !!(globalThis as { __glowAudit?: boolean }).__glowAudit;
    if (forest && !audit && worldOpen(forest, progress) && !hasEnteredWorld('forest')) {
      this.scene.start('ForestIntro');
      return;
    }
    // Высокий экран: профиль и «Войти» — к верху безопасной зоны, нижний ряд кнопок — к низу.
    const bounds = stretchLayout(this);
    const { topY, rowY } = edgeRows(bounds);
    addBackground(this, { dust: false });
    // Награды испытаний, пройденных раньше (старое сохранение, другое устройство) — для отметки на вкладке «Деревня».
    syncChallenges();
    const next = this.nextLevel(progress);
    this.title = null;
    this.shownWorld = '';

    this.hudTop = topY + 260;
    // Снизу — кнопка «Играть» и панель вкладок (Карта / Деревня / Магазин / Профиль).
    this.hudBottom = rowY - 340;
    this.buildMap(progress, next);

    // --- Верхняя панель: затемнение, профиль, мир и звёзды, вход
    const hud = this.add.graphics().setDepth(20);
    const paintHud = (v: ViewRect) => {
      hud.clear();
      // Шапка (аватар, имя, «Войти», мир, валюты) — на своей сплошной подложке с мягким краем:
      // карта прокручивается под ней. Край — ниже счётчиков, чтобы не резать название мира.
      const headEnd = topY + 225;
      hud.fillStyle(C.bgBottom, 0.97);
      hud.fillRect(v.x, v.y, v.w, headEnd - v.y);
      hud.fillGradientStyle(C.bgBottom, C.bgBottom, C.bgBottom, C.bgBottom, 0.97, 0.97, 0, 0);
      hud.fillRect(v.x, headEnd, v.w, 90);
      // Низ: «Играть» и вкладки — тоже на подложке, кружки уровней уходят под неё мягко.
      const footStart = rowY - 245;
      hud.fillGradientStyle(C.bgBottom, C.bgBottom, C.bgBottom, C.bgBottom, 0, 0, 0.97, 0.97);
      hud.fillRect(v.x, footStart - 100, v.w, 100);
      hud.fillStyle(C.bgBottom, 0.97);
      hud.fillRect(v.x, footStart, v.w, v.y + v.h - footStart);
    };
    paintHud(currentView(this));
    // Окно изменилось (поворот планшета, браузер): камера уже подогнана (keepFitted), перерисуем панели.
    const onResize = () => this.time.delayedCall(0, () => {
      paintHud(currentView(this));
      this.setMapY(this.map.y);
    });
    this.scale.on('resize', onResize);
    this.events.once('shutdown', () => this.scale.off('resize', onResize));

    const profile = getProfile();
    const badge = createAvatarBadge(this, 100, topY, 62, currentLook()).setDepth(21);
    badge.setSize(140, 140).setInteractive({ useHandCursor: true });
    badge.on('pointerup', () => this.go('Profile'));
    const nameT = this.add
      .text(180, topY, displayName(profile), { fontFamily: FONT, fontSize: '40px', color: C.text, fontStyle: 'bold' })
      .setOrigin(0, 0.5)
      .setDepth(21)
      .setInteractive({ useHandCursor: true });
    nameT.on('pointerup', () => this.go('Profile'));

    // Название мира и под ним валюты: монеты и свет.
    // Название — мира в середине экрана (меняется при прокрутке, см. updateWorld).
    const title = text(this, W / 2, topY + 105, tk(`world.${this.regionAt(this.nodes[next].y).world.id}`), 64, C.text, true, { w: W - 420 }).setDepth(21);
    title.setShadow(0, 0, '#ffc65c', 24, true, true);
    this.title = title;
    addWallet(this, W / 2, topY + 175);

    const loggedIn = !!Account.user;
    const authBtn = new Button(this, loggedIn ? W - 100 : W - 150, topY, {
      w: loggedIn ? 130 : 230,
      h: 110,
      icon: loggedIn ? 'cloud' : 'user',
      label: loggedIn ? undefined : t('login'),
      fontSize: 40,
      onClick: () => {
        sfx.tap();
        openAuthDialog(Account.user ? 'account' : 'login', { onClose: () => this.scene.isActive() && this.scene.restart() });
      },
    });
    authBtn.setDepth(21);
    const offAuth = Account.on((e) => e.type === 'changed' && this.scene.isActive() && this.scene.restart());
    this.events.once('shutdown', offAuth);

    // --- Нижняя панель: «Играть» и вкладки. Звук, вибрация, статистика и «Как играть» — в профиле.
    const playNext = () => this.play(this.nodes[next].index);
    new Button(this, W / 2, rowY - 150, { w: 400, h: 140, icon: 'play', label: t('play'), primary: true, fontSize: 56, onClick: playNext }).setDepth(21);
    addTabBar(this, 'Menu', rowY + 40, (key) => this.go(key));

    // --- Прокрутка карты: палец, колесо, стрелки
    this.input.on('pointerdown', this.onDown, this);
    this.input.on('pointermove', this.onMove, this);
    this.input.on('pointerup', this.onUp, this);
    this.input.on('wheel', (_p: unknown, _o: unknown, _dx: number, dy: number) => {
      this.velocity = 0;
      this.setMapY(this.map.y - dy);
    });
    this.input.keyboard?.on('keydown-UP', () => this.scrollBy(STEP));
    this.input.keyboard?.on('keydown-DOWN', () => this.scrollBy(-STEP));
    this.input.keyboard?.once('keydown-ENTER', playNext);
    this.events.once('shutdown', () => {
      this.input.off('pointerdown', this.onDown, this);
      this.input.off('pointermove', this.onMove, this);
      this.input.off('pointerup', this.onUp, this);
    });

    // Карта открыта на текущем уровне (после сцены входа в лес — на первом уровне леса).
    const cur = this.nodes[data.focus !== undefined && this.nodes[data.focus] ? data.focus : next];
    // Текущий уровень — посередине между шапкой и кнопкой «Играть» (выше кнопки, со звёздами).
    this.setMapY((this.hudTop + this.hudBottom) / 2 - cur.y);
    const p = this.mapToWorld(cur);
    // При проверке вёрстки (?audit=1) — без затемнения: скриншот сразу показывает карту.
    if (!audit) irisIn(this, p.x, p.y, 750);

    // Награда дня: кнопка-подарок с отметкой, пока награда не забрана; окно — сразу, если можно,
    // иначе — как только другие окна позволят (проверяем каждые 1,5 с), или по тапу на подарок.
    const dailyState = () =>
      dailyPrompt({ available: dailyAvailable() !== null, tutorialDone: isTutorialDone(), nameAsked: getProfile().nameAsked, canShow: canShowModal(Date.now(), DAILY_GAP_MS) });
    if (dailyState() !== 'none') {
      const openDaily = () => {
        if (!this.scene.isActive() || dailyAvailable() === null) return;
        modalOpened();
        showDailyDialog(this, () => {
          modalClosed();
          if (this.scene.isActive()) this.scene.restart();
        });
      };
      const gift = new Button(this, 100, topY + 175, { w: 120, h: 100, icon: 'gift', onClick: () => (sfx.tap(), openDaily()) }).setDepth(22);
      const dot = this.add.graphics().setDepth(23);
      dot.fillStyle(0xff6b4a, 1);
      dot.fillCircle(150, topY + 135, 14);
      this.tweens.add({ targets: [gift], scale: 1.08, duration: 600, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
      const tryShow = () => {
        if (dailyState() === 'show') openDaily();
        else retry = this.time.delayedCall(1500, tryShow);
      };
      let retry = this.time.delayedCall(800, tryShow);
      this.events.once('shutdown', () => retry.remove());
    }

    // Обучение пройдено — сначала знакомство с валютами (монеты и свет, дальше — только значками),
    // в следующий раз — имя и аватарка (не вместе с другими окнами).
    if (currencyIntroDue() && canShowModal()) {
      this.time.delayedCall(600, () => {
        if (!canShowModal() || !this.scene.isActive()) return;
        modalOpened();
        markCurrencyIntroSeen();
        showCurrencyIntro(this, () => {
          modalClosed();
          if (this.scene.isActive()) this.scene.restart();
        });
      });
    } else if (isTutorialDone() && !profile.nameAsked && canShowModal()) {
      this.time.delayedCall(1100, () => {
        if (!canShowModal() || !this.scene.isActive()) return;
        modalOpened();
        showNameDialog(this, {
          title: t('name_title'),
          withAvatars: true,
          secondary: 'skip',
          onClose: () => {
            modalClosed();
            if (this.scene.isActive()) this.scene.restart();
          },
        });
      });
    }
  }

  update(_time: number, delta: number) {
    // Инерция после броска пальцем.
    if (!this.drag && Math.abs(this.velocity) > 0.02) {
      this.setMapY(this.map.y + this.velocity * delta);
      this.velocity *= Math.pow(0.992, delta);
    }
  }

  // -------------------------------------------------------------------------
  // Карта

  private buildMap(progress: Progress, next: number) {
    const breaks = worldBreaks();
    const { height, pos } = mapLayout(LEVELS.length, breaks);
    this.mapH = height;
    this.map = this.add.container(0, 0).setDepth(0).setData('scroll', true);
    this.culled = [];
    this.chunkGfx.clear();
    for (const l of LAYERS) this.map.add((this.layers[l] = this.add.container(0, 0)));
    this.calm = reducedMotion();

    // Миры на карте: граница — посередине промежутка между последним уровнем мира и первым следующего.
    const junction = (b: number) => (pos[b - 1].y + pos[b].y) / 2;
    this.regions = WORLDS.map((world, k) => ({
      world,
      bottom: k === 0 ? height + 700 : junction(breaks[k - 1]),
      top: k === WORLDS.length - 1 ? -700 : junction(breaks[k]),
      open: worldOpen(world, progress),
    }));

    // Тропинка — плавная кривая через все кружки. Снизу она приходит из-за края экрана (под нижней панелью),
    // сверху уходит за верхний край — обрезанных концов не видно.
    const pts = [
      new Phaser.Math.Vector2(W / 2 - 140, height + 520),
      new Phaser.Math.Vector2(W / 2 - 60, height + 120),
      ...pos.map((p) => new Phaser.Math.Vector2(p.x, p.y)),
      new Phaser.Math.Vector2(W / 2 - 40, 40),
      new Phaser.Math.Vector2(W / 2 - 120, -420),
    ];
    const samples = new Phaser.Curves.Spline(pts).getSpacedPoints(LEVELS.length * 40);
    // Точки тропинки по полосам высотой 100 — быстрый поиск «рядом с тропинкой» для сотен деревьев.
    const bands = new Map<number, Phaser.Math.Vector2[]>();
    for (const q of samples) {
      const b = Math.floor(q.y / 100);
      if (!bands.has(b)) bands.set(b, []);
      bands.get(b)!.push(q);
    }
    const near = (x: number, y: number, d: number) => {
      for (let b = Math.floor((y - d) / 100); b <= Math.floor((y + d) / 100); b++) if (bands.get(b)?.some((s) => Math.abs(s.x - x) < d && Math.abs(s.y - y) < d)) return true;
      return false;
    };
    const crossAt = (y: number) => samples.reduce((a, b) => (Math.abs(b.y - y) < Math.abs(a.y - y) ? b : a));

    // Реки: в каждом мире — перед первым уровнем с водой и ещё одна во втором десятке (по уровням с водой).
    const rivers: number[] = [];
    for (const w of WORLDS) {
      const s0 = LEVELS.indexOf(w.levels[0]);
      const first = w.levels.findIndex((l) => l.cells.includes('water'));
      if (first > 0) rivers.push((pos[s0 + first - 1].y + pos[s0 + first].y) / 2);
      const later = w.levels.findIndex((l, i) => i > first + 8 && l.cells.includes('water'));
      if (first >= 0 && later > 0) rivers.push((pos[s0 + later - 1].y + pos[s0 + later].y) / 2);
    }
    const inRiver = (y: number) => rivers.some((ry) => Math.abs(y - ry) < 80);
    const nearJunction = (y: number) => this.regions.some((r, k) => k > 0 && Math.abs(y - r.bottom) < 340);

    this.regions.forEach((r, k) => this.drawRegion(r, k, height, { near, inRiver, nearJunction, samples, pos }));

    // Реки с мостиком там, где их пересекает тропинка.
    for (const ry of rivers) {
      const theme = this.regionAt(ry).world.theme;
      const g = this.add.graphics();
      g.fillStyle(theme.water, 0.95);
      const top: Phaser.Math.Vector2[] = [];
      const bot: Phaser.Math.Vector2[] = [];
      for (let xx = XL; xx <= XR; xx += 60) {
        const wv = Math.sin(xx * 0.008) * 14;
        top.push(new Phaser.Math.Vector2(xx, ry - 44 + wv));
        bot.push(new Phaser.Math.Vector2(xx, ry + 44 + wv));
      }
      g.fillPoints([...top, ...bot.reverse()], true);
      const waves = this.add.graphics();
      const rnd = new Phaser.Math.RandomDataGenerator([`river${ry}`]);
      waves.lineStyle(6, C.waterLight, 0.5);
      for (let xx = XL; xx < XR; xx += rnd.between(140, 220)) {
        const yy = ry + rnd.between(-20, 20) + Math.sin(xx * 0.008) * 14;
        waves.lineBetween(xx, yy, xx + 60, yy - 8);
      }
      // Мостик
      const cross = crossAt(ry);
      g.fillStyle(C.bridge, 1);
      g.fillRoundedRect(cross.x - 62, ry - 66, 124, 132, 16);
      g.fillStyle(C.bridgeLight, 1);
      for (let k = 0; k < 4; k++) g.fillRect(cross.x - 62, ry - 58 + k * 33, 124, 12);
      const item = this.put('water', ry - 100, ry + 100, g, waves);
      this.loop(item, { targets: waves, x: 30, alpha: 0.5, duration: 1600, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    }

    // Сама тропинка: тёмная подложка, утоптанная земля (цвет — по миру) и тёплый свет на пройденной части.
    // Рисуется по участкам: каждый участок — свой Graphics, невидимые не перерисовываются.
    const runs = (list: Phaser.Math.Vector2[]) => {
      const out: { y: number; color: number; pts: Phaser.Math.Vector2[] }[] = [];
      let key = '';
      list.forEach((q) => {
        const reg = this.regionAt(q.y);
        const kk = `${Math.floor(q.y / CHUNK)}:${reg.world.id}`;
        if (kk !== key) {
          if (out.length) out[out.length - 1].pts.push(q); // стык участков без разрыва
          out.push({ y: q.y, color: reg.world.theme.path, pts: [] });
          key = kk;
        }
        out[out.length - 1].pts.push(q);
      });
      return out.filter((r) => r.pts.length > 1);
    };
    const stroke = (g: Phaser.GameObjects.Graphics, pts2: Phaser.Math.Vector2[], w: number, color: number, alpha: number) => {
      g.lineStyle(w, color, alpha);
      g.beginPath();
      g.moveTo(pts2[0].x, pts2[0].y);
      for (const q of pts2.slice(1)) g.lineTo(q.x, q.y);
      g.strokePath();
    };
    for (const run of runs(samples)) {
      const g = this.gfx('path', run.y);
      stroke(g, run.pts, 64, 0x000000, 0.25);
      stroke(g, run.pts, 46, run.color, 0.55);
    }
    // Пунктир-камешки по тропинке
    const prnd = new Phaser.Math.RandomDataGenerator(['pebbles']);
    for (let k = 0; k < samples.length; k += 3) {
      const g = this.gfx('path', samples[k].y);
      g.fillStyle(0xd8c49a, 0.25);
      g.fillCircle(samples[k].x + prnd.between(-8, 8), samples[k].y + prnd.between(-8, 8), 5);
    }
    // Пройденная часть тропинки светится — до текущего уровня.
    let litTo = 0;
    samples.forEach((q, k) => {
      if (Math.hypot(q.x - pos[next].x, q.y - pos[next].y) < Math.hypot(samples[litTo].x - pos[next].x, samples[litTo].y - pos[next].y)) litTo = k;
    });
    for (const run of runs(samples.slice(0, Math.max(2, litTo)))) {
      const g = this.gfx('lit', run.y);
      stroke(g, run.pts, 40, C.roadGlow, 0.18);
      stroke(g, run.pts, 18, C.road, 0.85);
      stroke(g, run.pts, 6, C.roadCore, 0.9);
    }

    // Сверху — туман и обещание новых земель (только над последним миром).
    const soon = text(this, W / 2, 140, t('map_more_soon'), 40, C.textDim, false, { w: W - 100 }).setAlpha(0.6);
    this.put('top', 60, 220, soon);

    // Кружки уровней.
    this.nodes = LEVELS.map((level, i) => ({ level, index: i, x: pos[i].x, y: pos[i].y, r: isChallenge(level) ? R_CHALLENGE : R }));
    this.nodes.forEach((n, i) => this.drawNode(n, i, progress, next));

    // Lumo стоит у текущего уровня — со стороны, где больше места.
    const cur = this.nodes[next];
    const side = cur.x > W / 2 ? -1 : 1;
    const lumoX = cur.x + side * (cur.r + 80);
    const pool = this.add.image(lumoX, cur.y + 10, 'glow').setTint(C.lanternOn).setBlendMode(Phaser.BlendModes.ADD).setScale(2.4, 1.6).setAlpha(0.22);
    const lumo = createLumo(this, 130, currentLook(), true, { withPet: true }).setPosition(lumoX, cur.y - 10);
    if (side < 0) lumo.setScale(-1, 1);
    const item = this.put('nodes', cur.y - 200, cur.y + 100, pool, lumo);
    this.loop(item, { targets: lumo, y: cur.y - 24, duration: 1400, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
  }

  /** Оформление одного мира: небо, холмы, деревья, дома, туман и грибы (лес), переход снизу и дымка, пока мир закрыт. */
  private drawRegion(
    r: Region,
    k: number,
    height: number,
    o: { near: (x: number, y: number, d: number) => boolean; inRiver: (y: number) => boolean; nearJunction: (y: number) => boolean; samples: Phaser.Math.Vector2[]; pos: { x: number; y: number }[] },
  ) {
    const { world, top, bottom } = r;
    const theme = world.theme;
    const forest = world.id === 'forest';
    const rnd = new Phaser.Math.RandomDataGenerator([world.id]);
    const yTop = Math.max(top, -600);
    const yBot = Math.min(bottom, height + 600);

    // Небо: в долине снизу светлее, к верху — ночь; в лесу — бирюзово-фиолетовые сумерки целиком.
    const sky = this.add.graphics();
    if (forest) sky.fillGradientStyle(theme.skyTop, theme.skyTop, theme.skyBottom, theme.skyBottom, 0.92, 0.92, 0.95, 0.95);
    else sky.fillGradientStyle(theme.skyTop, theme.skyTop, theme.skyBottom, theme.skyBottom, 0.0, 0.0, 0.9, 0.9);
    sky.fillRect(XL, yTop, XR - XL, yBot - yTop);
    this.put('sky', yTop, yBot, sky);
    if (forest) {
      // Пятна сумеречного света: фиолетовые и бирюзовые.
      for (let y = yBot - 300; y > yTop; y -= rnd.between(700, 1000)) {
        const img = this.add
          .image(rnd.between(-200, W + 200), y, 'glow')
          .setTint(rnd.frac() < 0.5 ? 0x6a3fa0 : 0x1f7a7a)
          .setBlendMode(Phaser.BlendModes.ADD)
          .setScale(rnd.realInRange(7, 10))
          .setAlpha(0.12);
        this.put('sky', y - 640, y + 640, img);
      }
    }

    // Холмы по краям: дальние и ближние (по участкам).
    for (let y = yBot - 20; y > yTop + 200; y -= rnd.between(380, 560)) {
      const g = this.gfx('hills', y);
      for (const side of [-1, 1]) {
        const cx = W / 2 + side * rnd.between(560, 760);
        g.fillStyle(theme.hillFar, 0.85);
        g.fillEllipse(cx + side * 120, y - 40, rnd.between(900, 1300), rnd.between(420, 560));
        if (forest) {
          // Гребень дальних елей на холме.
          g.fillStyle(0x0a1a22, 0.9);
          for (let x = cx - 360; x < cx + 360; x += rnd.between(50, 80)) {
            const h = rnd.between(90, 170);
            const by = y - 40 - 150 + Math.abs(x - cx) * 0.35;
            g.fillTriangle(x - 34, by, x + 34, by, x, by - h);
          }
        }
        g.fillStyle(theme.hillNear, 0.9);
        g.fillEllipse(cx, y + 60, rnd.between(700, 1000), rnd.between(320, 420));
      }
    }

    // Деревья — где нет тропинки, реки и перехода между мирами. В лесу — гуще, тёмные ели-силуэты.
    const tTop = Math.max(yTop, 80);
    const tBot = Math.min(yBot, height - 40);
    const count = Math.round((tBot - tTop) * (forest ? 0.05 : 0.035));
    for (let n = 0; n < count; n++) {
      const tx = rnd.between(XL + 100, XR - 100);
      const ty = rnd.between(tTop, tBot);
      if (o.near(tx, ty, 150) || o.inRiver(ty) || o.nearJunction(ty)) continue;
      const s = rnd.realInRange(0.7, 1.3);
      const g = this.gfx('deco', ty);
      g.fillStyle(0x000000, 0.25);
      g.fillEllipse(tx, ty + 8, 70 * s, 18 * s);
      if (forest) this.spruce(g, tx, ty, s * rnd.realInRange(1, 1.35), rnd.frac() < 0.35 ? 0x08161c : theme.tree);
      else if (rnd.frac() < 0.6) {
        // Ель
        g.fillStyle(theme.tree, 1);
        g.fillTriangle(tx - 42 * s, ty, tx + 42 * s, ty, tx, ty - 120 * s);
        g.fillStyle(Phaser.Display.Color.IntegerToColor(theme.tree).lighten(8).color, 1);
        g.fillTriangle(tx - 30 * s, ty - 50 * s, tx + 30 * s, ty - 50 * s, tx, ty - 140 * s);
      } else {
        // Круглое дерево
        g.fillStyle(0x3a2c22, 1);
        g.fillRect(tx - 6 * s, ty - 40 * s, 12 * s, 40 * s);
        g.fillStyle(theme.tree, 1);
        g.fillCircle(tx, ty - 70 * s, 44 * s);
        g.fillStyle(0xffffff, 0.05);
        g.fillCircle(tx - 12 * s, ty - 84 * s, 22 * s);
      }
    }

    // Дома без огней — у каждого пятого уровня мира (с другой стороны тропинки, чем встаёт Lumo);
    // в долине ещё дом Lumo у начала тропинки, в лесу — дома-грибы.
    const s0 = LEVELS.indexOf(world.levels[0]);
    if (k === 0) this.house(this.gfx('deco', height - 40), W / 2 + 250, height - 40, 1.2);
    world.levels.forEach((_, i) => {
      if ((i + 1) % 5 !== 0) return;
      const p = o.pos[s0 + i];
      const side = p.x > W / 2 ? 1 : -1;
      if (forest) this.mushroomHouse(this.gfx('deco', p.y + 40), p.x + side * 200, p.y + 40, 0.85);
      else this.house(this.gfx('deco', p.y + 40), p.x + side * 200, p.y + 40, 0.85);
    });

    if (forest) {
      // Светящиеся грибы вдоль тропинки — по очереди с разных сторон, не на кружках уровней.
      const glows = new Map<number, Phaser.GameObjects.Image[]>();
      let side = 1;
      for (let i = 2; i < o.samples.length - 2; i += 17) {
        const q = o.samples[i];
        if (q.y < yTop + 150 || q.y > yBot - 300) continue;
        const a = o.samples[i - 2];
        const b = o.samples[i + 2];
        const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
        side = -side;
        const d = rnd.between(70, 100);
        const mx = q.x + ((-(b.y - a.y) / len) * d) * side;
        const my = q.y + (((b.x - a.x) / len) * d) * side;
        if (this.nodesNear(o.pos, mx, my, R_CHALLENGE + 60)) continue;
        const color = rnd.frac() < 0.6 ? 0x5ad6c8 : 0xb48cff;
        const s = rnd.realInRange(0.8, 1.2);
        this.mushroom(this.gfx('deco', my), mx, my, s, color, r.open);
        if (!r.open) continue;
        const img = this.add.image(mx, my - 18 * s, 'glow').setTint(color).setBlendMode(Phaser.BlendModes.ADD).setScale(0.9 * s).setAlpha(0.5);
        const c = Math.floor(my / CHUNK);
        if (!glows.has(c)) glows.set(c, []);
        glows.get(c)!.push(img);
      }
      // Одна анимация мерцания на участок (а не на каждый гриб).
      for (const [c, imgs] of glows) {
        const item = this.put('glow', c * CHUNK - 100, (c + 1) * CHUNK + 100, ...imgs);
        this.loop(item, { targets: imgs, alpha: 0.25, duration: 1900 + (c % 3) * 300, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
      }
      // Полосы тумана поперёк карты, медленно плывут.
      for (let y = yBot - 500; y > yTop + 200; y -= rnd.between(560, 760)) {
        const band: Phaser.GameObjects.Image[] = [];
        for (let n = 0; n < 3; n++) {
          band.push(
            this.add
              .image(rnd.between(-100, W + 100), y + rnd.between(-60, 60), 'glow')
              .setTint(0xa8b8e8)
              .setScale(rnd.realInRange(10, 15), rnd.realInRange(1.3, 1.9))
              .setAlpha(rnd.realInRange(0.07, 0.12)),
          );
        }
        const item = this.put('haze', y - 200, y + 200, ...band);
        this.loop(item, { targets: band, x: `+=${rnd.between(50, 90)}`, duration: rnd.between(6500, 9000), yoyo: true, repeat: -1, ease: 'Sine.inOut' });
      }
    }

    // Мир закрыт — густая дымка поверх декораций (кружки с замками видны сквозь неё) и клочья тумана над ними.
    if (!r.open && k > 0) {
      for (let c = Math.floor(yTop / CHUNK); c * CHUNK < yBot; c++) {
        const y0 = Math.max(yTop, c * CHUNK);
        const y1 = Math.min(yBot, (c + 1) * CHUNK);
        const g = this.gfx('haze', y0 + 1);
        // Снизу (у перехода) дымка сгущается постепенно.
        const fade = Math.min(1, Math.max(0, (yBot - y1) / 500));
        g.fillGradientStyle(theme.skyBottom, theme.skyBottom, theme.skyBottom, theme.skyBottom, 0.6, 0.6, 0.6 * fade, 0.6 * fade);
        g.fillRect(XL, y0, XR - XL, y1 - y0);
      }
      for (let y = yBot - 400; y > yTop + 200; y -= 420) {
        const img = this.add
          .image(rnd.between(0, W), y, 'glow')
          .setTint(0xb8c4e8)
          .setScale(rnd.realInRange(9, 13), rnd.realInRange(2, 3))
          .setAlpha(0.14);
        this.put('top', y - 250, y + 250, img);
      }
    }

    if (k > 0) this.drawJunction(r, o.samples);
  }

  /** Переход между мирами (внизу мира r): полоса тумана, арка из елей, табличка с названием; закрыт — подсказка. */
  private drawJunction(r: Region, samples: Phaser.Math.Vector2[]) {
    const jy = r.bottom;
    const cross = samples.reduce((a, b) => (Math.abs(b.y - jy) < Math.abs(a.y - jy) ? b : a));
    const cx = cross.x;
    const theme = r.world.theme;
    const rnd = new Phaser.Math.RandomDataGenerator([`junction-${r.world.id}`]);

    // Полоса тумана поперёк карты.
    const fog: Phaser.GameObjects.Image[] = [];
    for (let n = 0; n < 5; n++) {
      fog.push(
        this.add
          .image(-200 + n * 370 + rnd.between(-60, 60), jy + rnd.between(-90, 50), 'glow')
          .setTint(0xb0c0ec)
          .setScale(rnd.realInRange(7, 10), rnd.realInRange(2.2, 3))
          .setAlpha(0.2),
      );
    }
    const fogItem = this.put('haze', jy - 400, jy + 300, ...fog);
    this.loop(fogItem, { targets: fog, alpha: 0.12, duration: 4200, yoyo: true, repeat: -1, ease: 'Sine.inOut' });

    // Арка из елей: две большие ели по бокам тропинки и свод из ветвей над ней.
    const g = this.add.graphics();
    const dark = 0x07161a;
    for (const side of [-1, 1]) {
      g.fillStyle(0x000000, 0.3);
      g.fillEllipse(cx + side * 190, jy + 100, 200, 40);
      this.spruce(g, cx + side * 190, jy + 100, 2.6, dark);
    }
    const ac = { x: cx, y: jy - 70 };
    const arcPt = (deg: number, rr: number) => {
      const rad = Phaser.Math.DegToRad(deg);
      return { x: ac.x + Math.cos(rad) * rr, y: ac.y + Math.sin(rad) * rr * 1.05 };
    };
    // Свод: толстая дуга из еловых лап, хвоя торчит наружу ярусами.
    for (const [rr, w, color] of [
      [200, 84, dark],
      [204, 40, theme.tree],
    ] as const) {
      g.lineStyle(w, color, 1);
      g.beginPath();
      for (let a = 196; a <= 344; a += 4) {
        const q = arcPt(a, rr);
        if (a === 196) g.moveTo(q.x, q.y);
        else g.lineTo(q.x, q.y);
      }
      g.strokePath();
    }
    for (let a = 198; a <= 342; a += 9) {
      const base1 = arcPt(a - 5, 230);
      const base2 = arcPt(a + 5, 230);
      const tip = arcPt(a + rnd.between(-2, 2), 275 + rnd.between(-10, 12));
      g.fillStyle(dark, 1);
      g.fillTriangle(base1.x, base1.y, base2.x, base2.y, tip.x, tip.y);
      const in1 = arcPt(a - 4, 170);
      const in2 = arcPt(a + 4, 170);
      const inTip = arcPt(a, 140 + rnd.between(-8, 8));
      g.fillTriangle(in1.x, in1.y, in2.x, in2.y, inTip.x, inTip.y);
    }
    // Свисающий мох.
    g.lineStyle(4, 0x2f6a5a, 0.7);
    for (let n = 0; n < 9; n++) {
      const x = ac.x - 150 + n * 37;
      const y = ac.y - Math.sqrt(Math.max(0, 1 - ((x - ac.x) / 200) ** 2)) * 210 + 50;
      g.lineBetween(x, y, x + rnd.between(-6, 6), y + rnd.between(30, 70));
    }
    const items: Phaser.GameObjects.GameObject[] = [g];
    // Табличка с названием мира на своде.
    const name = text(this, ac.x, ac.y - 250, tk(`world.${r.world.id}`), 38, '#c8fff4', true, { w: 420 });
    const plank = this.add.graphics();
    const pw = Math.min(460, name.width + 60);
    plank.lineStyle(4, 0x3a2a1a, 1);
    plank.lineBetween(ac.x - pw / 2 + 30, ac.y - 280, ac.x - pw / 2 + 50, ac.y - 196);
    plank.lineBetween(ac.x + pw / 2 - 30, ac.y - 280, ac.x + pw / 2 - 50, ac.y - 196);
    plank.fillStyle(0x000000, 0.35);
    plank.fillRoundedRect(ac.x - pw / 2, ac.y - 280, pw, 66, 14);
    plank.fillStyle(0x4a3524, 1);
    plank.fillRoundedRect(ac.x - pw / 2, ac.y - 284, pw, 66, 14);
    plank.lineStyle(3, r.open ? 0x5ad6c8 : 0x6a5a48, 1);
    plank.strokeRoundedRect(ac.x - pw / 2, ac.y - 284, pw, 66, 14);
    name.setPosition(ac.x, ac.y - 251);
    if (!r.open) name.setAlpha(0.7);
    items.push(plank, name);
    if (r.open) {
      // Лес открыт — в проёме арки бирюзовое сияние, по бокам горят грибы.
      const glow = this.add.image(cx, jy - 60, 'glow').setTint(0x5ad6c8).setBlendMode(Phaser.BlendModes.ADD).setScale(3.2, 2.6).setAlpha(0.28);
      items.push(glow);
      const m = this.add.graphics();
      for (const side of [-1, 1]) for (const d of [70, 110]) this.mushroom(m, cx + side * d, jy + 120 - d * 0.3, 0.9, side < 0 ? 0x5ad6c8 : 0xb48cff, true);
      items.push(m);
      const item = this.put('deco', jy - 500, jy + 300, ...items);
      this.loop(item, { targets: glow, alpha: 0.16, duration: 2200, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    } else {
      this.put('deco', jy - 500, jy + 300, ...items);
      // Подсказка, как открыть мир, — под аркой, со стороны предыдущего мира.
      const hint = text(this, W / 2, jy + 250, r.world.id === 'forest' ? t('map_forest_locked') : t('map_more_soon'), 38, C.text, true, { w: W - 110, lines: 2 });
      hint.setShadow(0, 0, '#000000', 12, true, true);
      const lock = this.add.graphics();
      drawIcon(lock, 'lock', 46, 0xc8d0f0);
      lock.setPosition(cx, jy + 20);
      this.put('top', jy - 100, jy + 400, hint, lock);
    }
  }

  /** Ель из трёх ярусов (силуэт), основание в (x, y). */
  private spruce(g: Phaser.GameObjects.Graphics, x: number, y: number, s: number, color: number) {
    g.fillStyle(0x1a120c, 1);
    g.fillRect(x - 5 * s, y - 16 * s, 10 * s, 16 * s);
    g.fillStyle(color, 1);
    for (let k = 0; k < 3; k++) {
      const w = (46 - k * 10) * s;
      const by = y - 12 * s - k * 34 * s;
      g.fillTriangle(x - w, by, x + w, by, x, by - (62 - k * 6) * s);
    }
    // Едва заметный бирюзовый отсвет на одной стороне.
    g.fillStyle(0x5ad6c8, 0.06);
    g.fillTriangle(x, y - 12 * s, x + 46 * s, y - 12 * s, x, y - 140 * s);
  }

  /** Светящийся гриб: ножка и шляпка с пятнышками; закрытый мир — тусклый. */
  private mushroom(g: Phaser.GameObjects.Graphics, x: number, y: number, s: number, color: number, lit: boolean) {
    const a = lit ? 1 : 0.35;
    g.fillStyle(0xe8e0f4, 0.9 * a);
    g.fillRoundedRect(x - 5 * s, y - 20 * s, 10 * s, 20 * s, 4 * s);
    g.fillStyle(color, a);
    g.slice(x, y - 18 * s, 17 * s, Math.PI, 0, false);
    g.fillPath();
    g.fillStyle(0xffffff, 0.7 * a);
    g.fillCircle(x - 6 * s, y - 26 * s, 2.5 * s);
    g.fillCircle(x + 5 * s, y - 29 * s, 2 * s);
  }

  /** Дом без огней (их зажжём позже). */
  private house(g: Phaser.GameObjects.Graphics, hx: number, hy: number, s: number) {
    g.fillStyle(0x000000, 0.28);
    g.fillEllipse(hx, hy + 6, 170 * s, 30 * s);
    g.fillStyle(0x2c2a44, 1);
    g.fillRect(hx - 70 * s, hy - 100 * s, 140 * s, 100 * s);
    g.fillStyle(0x4a2f3a, 1);
    g.fillTriangle(hx - 90 * s, hy - 96 * s, hx + 90 * s, hy - 96 * s, hx, hy - 170 * s);
    g.fillStyle(0x15172b, 1); // тёмные окна — свет погас
    g.fillRect(hx - 50 * s, hy - 78 * s, 34 * s, 30 * s);
    g.fillRect(hx + 16 * s, hy - 78 * s, 34 * s, 30 * s);
    g.fillStyle(0x1c1a30, 1);
    g.fillRoundedRect(hx - 16 * s, hy - 50 * s, 32 * s, 50 * s, 6 * s);
    g.lineStyle(3 * s, 0x5a587a, 0.6);
    g.strokeRect(hx - 50 * s, hy - 78 * s, 34 * s, 30 * s);
    g.strokeRect(hx + 16 * s, hy - 78 * s, 34 * s, 30 * s);
  }

  /** Дом-гриб в лесу: толстая ножка с дверью и окошком, широкая шляпка (огни погасли). */
  private mushroomHouse(g: Phaser.GameObjects.Graphics, hx: number, hy: number, s: number) {
    g.fillStyle(0x000000, 0.28);
    g.fillEllipse(hx, hy + 6, 170 * s, 30 * s);
    g.fillStyle(0x4a4660, 1);
    g.fillRoundedRect(hx - 50 * s, hy - 110 * s, 100 * s, 110 * s, 24 * s);
    g.fillStyle(0x3a2a5a, 1);
    g.slice(hx, hy - 100 * s, 105 * s, Math.PI, 0, false);
    g.fillPath();
    g.fillStyle(0x7a5ab0, 0.5);
    g.fillCircle(hx - 50 * s, hy - 140 * s, 12 * s);
    g.fillCircle(hx + 20 * s, hy - 170 * s, 9 * s);
    g.fillCircle(hx + 60 * s, hy - 130 * s, 10 * s);
    g.fillStyle(0x15172b, 1);
    g.fillRoundedRect(hx - 16 * s, hy - 52 * s, 32 * s, 52 * s, 12 * s);
    g.fillCircle(hx + 28 * s, hy - 74 * s, 10 * s);
  }

  private nodesNear(pos: { x: number; y: number }[], x: number, y: number, d: number) {
    return pos.some((p) => Math.abs(p.y - y) < d + 40 && Math.hypot(p.x - x, p.y + 20 - y) < d);
  }

  // -------------------------------------------------------------------------
  // Участки карты и отсечка невидимого

  /** Добавить объекты в слой карты как участок [y0, y1]. */
  private put(layer: Layer, y0: number, y1: number, ...objs: Phaser.GameObjects.GameObject[]): CullItem {
    this.layers[layer].add(objs);
    const item: CullItem = { y0, y1, objs, tweens: [], on: true };
    this.culled.push(item);
    return item;
  }

  /** Бесконечная анимация участка: на паузе, пока участок не виден; при «меньше движения» — без неё. */
  private loop(item: CullItem, config: Phaser.Types.Tweens.TweenBuilderConfig) {
    if (this.calm) return;
    const tw = this.tweens.add(config);
    item.tweens.push(tw);
    if (!item.on) tw.pause();
  }

  /** Общий Graphics слоя для участка высотой CHUNK, в котором лежит y (рисунки выступают за участок — с запасом). */
  private gfx(layer: Layer, y: number): Phaser.GameObjects.Graphics {
    const c = Math.floor(y / CHUNK);
    const key = `${layer}:${c}`;
    let g = this.chunkGfx.get(key);
    if (!g) {
      g = this.add.graphics();
      this.put(layer, c * CHUNK - 350, (c + 1) * CHUNK + 250, g);
      this.chunkGfx.set(key, g);
    }
    return g;
  }

  /** Показать участки рядом с экраном, остальные скрыть и остановить их анимации. */
  private applyCull() {
    const v = currentView(this);
    const top = v.y - this.map.y - CULL_PAD;
    const bot = v.y + v.h - this.map.y + CULL_PAD;
    for (const it of this.culled) {
      const on = it.y1 >= top && it.y0 <= bot;
      if (on === it.on) continue;
      it.on = on;
      for (const o of it.objs) (o as unknown as { setVisible: (v: boolean) => void }).setVisible(on);
      for (const tw of it.tweens) {
        if (on) tw.resume();
        else tw.pause();
      }
    }
  }

  /** Мир, в котором точка карты y. */
  private regionAt(y: number): Region {
    return this.regions.find((r) => y >= r.top && y < r.bottom) ?? (y < 0 ? this.regions[this.regions.length - 1] : this.regions[0]);
  }

  /** Мир в середине экрана: название в шапке и музыка (только при смене). */
  private updateWorld() {
    if (!this.regions.length) return;
    const world = this.regionAt((this.hudTop + this.hudBottom) / 2 - this.map.y).world;
    if (world.id === this.shownWorld) return;
    this.shownWorld = world.id;
    if (this.title) setFitted(this.title, tk(`world.${world.id}`), { w: W - 420, size: 64, bold: true });
    setMusicMood(world.id === 'forest' ? 'forest' : 'night');
  }

  private drawNode(n: NodePos, i: number, progress: Progress, next: number) {
    const { level } = n;
    const prev = i > 0 ? this.nodes[i - 1].level.id : null;
    const unlocked = isUnlocked(progress, level.id, prev);
    const stars = progress.stars[level.id] ?? 0;
    const skipped = !stars && !!progress.skipped[level.id];
    const passed = stars > 0;
    const current = i === next;
    const challenge = isChallenge(level);
    const r = n.r;

    if (passed) {
      // Пройденный уровень светится тёплым светом.
      const glow = this.add.image(n.x, n.y, 'glow').setTint(C.lanternOn).setBlendMode(Phaser.BlendModes.ADD).setScale((r * 4) / 128).setAlpha(0.32);
      const item = this.put('nodes', n.y - r * 2, n.y + r * 2, glow);
      this.loop(item, { targets: glow, alpha: 0.18, duration: 1800 + (i % 5) * 200, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    }
    if (current) {
      const rays = this.add.container(n.x, n.y);
      for (let k = 0; k < 10; k++) {
        rays.add(
          this.add
            .image(0, 0, 'ray')
            .setOrigin(0.5, 1)
            .setRotation((k / 10) * Math.PI * 2)
            .setScale((r / 80) * 0.8, (r / 80) * 0.75)
            .setTint(C.lanternOn)
            .setBlendMode(Phaser.BlendModes.ADD)
            .setAlpha(0.4),
        );
      }
      const item = this.put('nodes', n.y - r * 2, n.y + r * 2, rays);
      this.loop(item, { targets: rays, angle: 360, duration: 24000, repeat: -1 });
    }

    const c = this.add.container(n.x, n.y);
    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.35);
    g.fillCircle(0, 8, r);
    const fill = !unlocked ? C.cardDisabled : current ? 0x3a46a0 : passed ? 0x5a4a2a : C.card;
    g.fillStyle(fill, 1);
    g.fillCircle(0, 0, r);
    if (passed) {
      g.fillStyle(C.lanternOn, 0.22);
      g.fillCircle(0, -r * 0.15, r * 0.75);
    }
    const edge = current ? C.primary : skipped ? 0x7a6440 : passed ? C.lanternOn : unlocked ? C.cardEdge : 0x2a3160;
    g.lineStyle(challenge ? 9 : 6, edge, 1);
    g.strokeCircle(0, 0, r);
    if (challenge) {
      // «Испытание»: второе кольцо и зубцы-короны по кругу.
      g.lineStyle(4, edge, 0.6);
      g.strokeCircle(0, 0, r + 14);
      g.fillStyle(edge, unlocked ? 0.9 : 0.4);
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        g.fillCircle(Math.cos(a) * (r + 14), Math.sin(a) * (r + 14), 6);
      }
    }
    c.add(g);
    if (unlocked) {
      c.add(text(this, 0, -2, String(numberInWorld(level)), challenge ? 64 : 54, passed ? '#ffe6a8' : C.text));
    } else {
      const lg = this.add.graphics();
      drawIcon(lg, 'lock', challenge ? 56 : 46, C.iconDisabled);
      c.add(lg);
    }
    // Под кружком: звёзды (или значок пропуска); светлячки — маленькими огоньками.
    const sg = this.add.graphics();
    if (skipped) drawIcon(sg, 'skip', 36, 0xd98a1f);
    else if (unlocked) for (let k = 0; k < 3; k++) drawShinyStar(sg, (k - 1) * 40, 0, k === 1 ? 21 : 18, k >= stars, k < stars ? 1 : 0.7);
    sg.setPosition(0, r + 30 - (unlocked && !skipped ? 0 : 0));
    c.add(sg);
    if (level.fireflies.length && unlocked) {
      const got = progress.fireflies[level.id] ?? 0;
      const fg = this.add.graphics();
      drawFireflyIcon(fg, r * 0.78, -r * 0.78, 16, got > 0);
      c.add(fg);
    }
    // «Можно улучшить»: пройден меньше чем на 3 звезды или собраны не все светлячки — значок со стрелкой вверх
    // (такие уровни советует окно «Не хватает»).
    if (passed && (stars < 3 || (progress.fireflies[level.id] ?? 0) < level.fireflies.length)) {
      const ig = this.add.graphics().setPosition(-r * 0.8, -r * 0.8);
      ig.fillStyle(0x000000, 0.4);
      ig.fillCircle(0, 3, 19);
      ig.fillStyle(0x3f9a52, 1);
      ig.fillCircle(0, 0, 19);
      ig.lineStyle(3, 0xc8ffb0, 1);
      ig.strokeCircle(0, 0, 19);
      ig.fillStyle(0xffffff, 1);
      ig.fillTriangle(-9, 2, 9, 2, 0, -10);
      ig.fillRect(-3.5, 1, 7, 9);
      ig.setData('improve', level.id);
      c.add(ig);
    }
    const item = this.put('nodes', n.y - r - 30, n.y + r + 60, c);
    if (current) this.loop(item, { targets: c, scale: 1.08, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    n.r = unlocked ? r : -1; // закрытый уровень не нажимается
  }

  // -------------------------------------------------------------------------
  // Прокрутка

  private mapToWorld(n: { x: number; y: number }) {
    return { x: n.x, y: n.y + this.map.y };
  }

  /** Двигает карту, не давая уехать за верх и низ: надпись наверху карты и дом внизу видны между панелями. */
  private setMapY(y: number) {
    const maxY = this.hudTop - 100; // надпись «Дальше — новые земли…» (y 140) — сразу под верхней панелью
    const minY = this.hudBottom + 80 - this.mapH; // дом Lumo внизу карты — над нижней панелью
    const clamped = minY > maxY ? (minY + maxY) / 2 : Phaser.Math.Clamp(y, minY, maxY);
    if (clamped !== y) this.velocity = 0;
    this.map.y = clamped;
    this.applyCull();
    this.updateWorld();
  }

  /** Прокрутить карту к переходу в мир id (стык миров и начало мира — посередине экрана; для проверки вёрстки). */
  focusWorld(id: string) {
    const r = this.regions.find((x) => x.world.id === id);
    if (!r) return;
    this.velocity = 0;
    this.setMapY((this.hudTop + this.hudBottom) / 2 - (r.bottom - 220));
  }

  private scrollBy(dy: number) {
    this.velocity = 0;
    this.tweens.add({ targets: this.map, y: this.map.y + dy, duration: 250, ease: 'Sine.out', onUpdate: () => this.setMapY(this.map.y) });
  }

  private onDown(p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) {
    if (over.length > 0 || this.scene.isPaused()) return; // нажали кнопку панели
    this.velocity = 0;
    this.drag = { y0: p.worldY, map0: this.map.y, moved: false, lastY: p.worldY, lastT: p.downTime, v: 0 };
  }

  private onMove(p: Phaser.Input.Pointer) {
    const d = this.drag;
    if (!d || !p.isDown) return;
    if (Math.abs(p.worldY - d.y0) > 18) d.moved = true;
    if (!d.moved) return;
    const now = this.time.now;
    const dt = Math.max(1, now - d.lastT);
    d.v = d.v * 0.6 + ((p.worldY - d.lastY) / dt) * 0.4;
    d.lastY = p.worldY;
    d.lastT = now;
    this.setMapY(d.map0 + (p.worldY - d.y0));
  }

  private onUp(p: Phaser.Input.Pointer) {
    const d = this.drag;
    this.drag = null;
    if (!d) return;
    if (d.moved) {
      this.velocity = Phaser.Math.Clamp(d.v, -4, 4);
      return;
    }
    // Тап: ищем кружок уровня под пальцем.
    const lx = p.worldX;
    const ly = p.worldY - this.map.y;
    const hit = this.nodes.find((n) => n.r > 0 && Math.hypot(n.x - lx, n.y - ly) <= n.r + 24);
    if (hit) this.play(hit.index);
  }

  // -------------------------------------------------------------------------

  /** Первый открытый непройденный и непропущенный уровень, иначе последний открытый (индекс в LEVELS, через все миры). */
  private nextLevel(p: Progress): number {
    const levels = LEVELS;
    let lastOpen = 0;
    for (let i = 0; i < levels.length; i++) {
      const id = levels[i].id;
      if (!isUnlocked(p, id, i > 0 ? levels[i - 1].id : null)) break;
      lastOpen = i;
      if (!p.stars[id] && !p.skipped[id]) return i;
    }
    return lastOpen;
  }

  private play(index: number) {
    this.go('Game', { levelIndex: index });
  }

  private go(scene: string, data: object = {}) {
    sfx.tap();
    this.cameras.main.fadeOut(180, 11, 15, 39);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start(scene, data));
  }
}
