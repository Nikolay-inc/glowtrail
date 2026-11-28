// Экран уровня: поле, лоток плиток, превью колоды, слот «отложить», отмена, подсказки,
// защита от застревания (+3 плитки, облегчение, пропуск уровня), победа и поражение.

import { APP_BACK, APP_PAUSE, APP_RESUME } from '../lifecycle';
import Phaser from 'phaser';
import {
  applyAction,
  canPlace,
  canUndo,
  createGame,
  deckLeft,
  distanceToExit,
  firefliesOnRoad,
  isInfinite,
  lanternsOnRoad,
  leftmostTile,
  previewTile,
  starsFor,
  tilesLeft,
  undo,
  upcoming,
  type Action,
  type GameState,
  expiredLantern,
  fadeLeftAt,
  rotateKind,
  stashAt,
  tilesPlaced,
  lossReason,
  timeOf,
  signalsLit,
  type StashIndex,
} from '../core/game';
import { driftMelted, shadowDelay, shadowGap, shadowIn } from '../core/tiles';
import { FIRE } from '../ui/peaks';
import { drawRingBase, paletteOf } from '../ui/forest';
import { abilities, buyHint, adDoubleCoins, adHint, chapelAvailable, challengeReward, freePlus3Available, getEconomy, hintsLeft, questEvent, recordWinRewards, spendChapel, spendFreePlus3, spendHint, type ChallengeReward } from '../meta';
import { onLevelWin, rewardedReady, starterOfferAfterAlmost, starterOfferAfterWin } from '../monetization/index';
import { plus3Offer, type Plus3Offer } from '../monetization/rules';
import { interstitialThen, rewardedButton, rewardedRichButton } from '../ui/adButton';
import { showStarterOffer } from '../ui/storeUi';
import { slotOf } from '../levels/curve';
import { showBloomGift } from '../ui/bloomGift';
import { showNotEnough } from '../ui/notEnough';
import { archStyleOf, currentLook, roadStyleOf } from '../ui/skins';
import { buttonRichLabel, drawCoin, drawLight, toast } from '../ui/meta';
import { coins, freeHintsPerDay, HINT_PRICE, villageBonuses } from '../core/economy';
import { easeDeck, findExtraTiles, findHint, nearestSolvable } from '../core/solver';
import type { Level, TileKind } from '../core/types';
import { LEVELS, nextLevelOf, worldOf } from '../levels/index';
import { sfx, duckMusic, setMusicMood } from '../audio';
import type { Quest } from '../core/quests';
import { hasEnteredWorld, loadProgress, logEvent, lossStreak, recordLoss, recordSkip, startAttempt, type LogEvent } from '../storage';
import { countHint, markAuthPrompted, recordPlayDay, shouldPromptAuth } from '../profile';
import { Account } from '../cloud/account';
import { openAuthDialog } from '../ui/AuthDialog';
import { BoardView } from '../ui/BoardView';
import { addBackground, Button, createAvatarBadge, drawFireflyIcon, drawPortalIcon, drawShinyStar, layoutRow, text } from '../ui/draw';
import { lanternsLeft } from '../core/portal';
import { DX, DY } from '../core/types';
import { t } from '../strings';
import { TipManager } from '../ui/LumoTip';
import {
  authPromptDue,
  canShowModal,
  completeTutorial,
  hasSeenTip,
  IDLE_HINT_SECONDS,
  isTutorialActive,
  logTutorialStep,
  modalClosed,
  modalOpened,
  TIP_TEXT,
  TUTORIAL_LAST_LEVEL,
  pendingRules,
  type TipId,
} from '../tutorial';
import { RULES_CLOSED } from './RulesScene';
import { C, FONT, H, W } from '../ui/theme';
import { CARD, MiniCard, TileCard } from '../ui/TileCard';
import { trayLayout, type TrayLayout } from '../ui/layout';
import { irisIn } from '../ui/fx';
import { stretchLayout } from '../ui/viewport';

// Позиции панелей в раскладке 1080×1920; на высоком экране верх поднимается, низ опускается (stretchLayout).
const TOP_Y = 105;
const TRAY_Y = 1640;
const PREVIEW_Y = 1492;
const BOTTOM_Y = 1835;
const BOARD_Y = 250;
const BOARD_H = 1190;

/** Сколько поражений подряд нужно для каждой меры защиты от застревания. */
export const STUCK = { pulseHint: 2, ease: 2, skip: 4 } as const;
/** Сколько лишних плиток незаметно добавляет облегчение. */
export const EASE_TILES = 2;

type SlotId = number | 'stash' | 'stash2';

interface Press {
  slot: SlotId;
  card: TileCard;
  x0: number;
  y0: number;
  dragging: boolean;
  timer?: Phaser.Time.TimerEvent;
}

/** Событие на game.events: свой уровень из редактора закончен — вернуться в редактор. */
export const EDITOR_RETURN = 'editor-return';

/** Данные сцены: уровень из списка (по индексу) или свой уровень из редактора. */
export interface GameSceneData {
  levelIndex?: number;
  custom?: Level;
}

/** Облегчённые колоды считаются один раз за сессию. */
const easedDecks = new Map<string, TileKind[]>();


export class GameScene extends Phaser.Scene {
  private levelIndex = 0;
  /** Свой уровень из редактора: прогресс и лог не пишем, выход — обратно в редактор. */
  private custom: Level | null = null;
  private state!: GameState;
  private board!: BoardView;
  private cards: TileCard[] = [];
  private stashCard!: TileCard;
  /** Второй слот «отложить» (прокачка): две карточки поменьше одна над другой. */
  private stashCard2!: TileCard;
  private previews: MiniCard[] = [];
  /** Кнопка «Поворот плитки» и режим поворота (следующий тап по плитке лотка поворачивает её). */
  private rotateBtn?: Button;
  private rotateMode = false;
  private rotateText?: Phaser.GameObjects.Text;
  private deckG!: Phaser.GameObjects.Graphics;
  private deckText!: Phaser.GameObjects.Text;
  private undoBtn!: Button;
  private restartBtn!: Button;
  private hintBtn!: Button;
  private badgesG!: Phaser.GameObjects.Graphics;
  private goalText!: Phaser.GameObjects.Text;
  private ffText!: Phaser.GameObjects.Text;
  private tips!: TipManager;
  private idleTimer?: Phaser.Time.TimerEvent;
  private goalCard?: Phaser.GameObjects.Container;
  /** Последняя кнопка «Заново» на экране тупика — на неё указывает подсказка. */
  private loseRestartPos: { x: number; y: number } | null = null;
  private hand!: Phaser.GameObjects.Text;
  private hintRing!: Phaser.GameObjects.Graphics;
  private stashGlow!: Phaser.GameObjects.Graphics;
  private press: Press | null = null;
  private busy = false;
  private ended = false;
  private attempt = 0;
  private topY = TOP_Y;
  private trayY = TRAY_Y;
  private previewY = PREVIEW_Y;
  private bottomY = BOTTOM_Y;
  private t0 = 0;
  private overlay?: Phaser.GameObjects.Container;
  private hintKey = '';
  /** В этой попытке была подсказка (задание «пройди без подсказок»). */
  private usedHint = false;
  /** Подсказок за эту попытку (в лог победы, поражения и выхода). */
  private hintsUsed = 0;
  /** Задания жителей, выполненные этой победой (показываем на экране победы). */
  private questsDone: Quest[] = [];
  /** Награда испытания этой победы (уровни 10, 20, 30): шаг улицы выдан, расцвет — на выбор в окне. */
  private challengeGift: ChallengeReward | null = null;
  /** Подсказка, которую игрок попросил кнопкой; держится до следующего хода. */
  private activeHint: Action | null = null;
  private extraUsed = false;
  private chapelUsed = false;
  private streak = 0;
  /** Ходов подряд без отмены (серия без ошибок). */
  private cleanRun = 0;
  /** Награда за победу: монеты и свет (показывается в окне победы). */
  private reward = { coins: 0, light: 0, bonusCoins: 0, bonusLight: 0 };
  /** Раскладка нижней панели: зависит от того, есть ли на уровне слот «отложить». */
  private L: TrayLayout = trayLayout(true);
  /** Туман: сколько клеток было скрыто на старте и какие из них уже открывались (в лог fog_revealed). */
  private fogHidden = new Set<number>();
  private fogOpened = new Set<number>();
  private shadowText!: Phaser.GameObjects.Text;
  /** Сигнальные огни «горит/всего» в строке цели. */
  private fireText!: Phaser.GameObjects.Text;

  private get stashX() {
    return this.L.stashX ?? -CARD * 2;
  }

  constructor() {
    super('Game');
  }

  init(data: GameSceneData) {
    this.custom = data.custom ?? null;
    this.levelIndex = Phaser.Math.Clamp(data.levelIndex ?? 0, 0, LEVELS.length - 1);
    this.cards = [];
    this.previews = [];
    this.press = null;
    this.busy = false;
    this.ended = false;
    this.overlay = undefined;
    this.hintKey = '';
    this.activeHint = null;
    this.extraUsed = false;
    this.chapelUsed = false;
    this.rotateMode = false;
    this.rotateBtn = undefined;
  }

  private get level(): Level {
    return this.custom ?? LEVELS[this.levelIndex];
  }

  /** Данные, чтобы начать этот же уровень заново. */
  private again(): GameSceneData {
    return this.custom ? { custom: this.custom } : { levelIndex: this.levelIndex };
  }

  /** Лог событий (для своего уровня из редактора — не пишем). */
  private log(e: Omit<LogEvent, 't'>) {
    if (!this.custom) logEvent(e);
  }

  create() {
    const level = this.level;
    this.L = trayLayout(level.allowStash);
    // Высокий экран: верхняя панель — к верху безопасной зоны, лоток и подсказка — к низу, поле крупнее.
    const bounds = stretchLayout(this);
    const up = -bounds.top;
    const down = bounds.bottom - H;
    this.topY = TOP_Y - up;
    this.trayY = TRAY_Y + down;
    this.previewY = PREVIEW_Y + down;
    this.bottomY = BOTTOM_Y + down;
    const pal = paletteOf(level);
    const forest = pal === 'forest';
    const peaks = pal === 'peaks';
    addBackground(this, { evening: !level.night && !peaks, forest, peaks });
    // Лес и вершины — своя музыка (лес глубже, вершины — зимняя, прозрачнее); на выходе — обратно ночная.
    if (forest || peaks) {
      setMusicMood(pal);
      this.events.once('shutdown', () => setMusicMood('night'));
    }
    this.streak = this.custom ? 0 : lossStreak(level.id);

    // Верхняя панель: уровень и строка цели (арка + фонари «зажжено/всего»)
    new Button(this, 90, this.topY, { w: 130, h: 130, icon: 'menu', onClick: () => this.leave('Menu') });
    text(this, W / 2, this.topY - 22, this.custom ? t('custom_level') : t('level_n', { n: level.num }), 50, C.text, true, { w: 460 });
    this.badgesG = this.add.graphics().setDepth(1);
    this.goalText = text(this, 0, this.topY + 58, '', 40).setOrigin(0, 0.5).setDepth(2);
    this.ffText = text(this, 0, this.topY + 58, '', 40).setOrigin(0, 0.5).setDepth(2);
    this.shadowText = text(this, 0, this.topY + 58, '', 40).setOrigin(0, 0.5).setDepth(2);
    this.fireText = text(this, 0, this.topY + 58, '', 40).setOrigin(0, 0.5).setDepth(2);
    this.undoBtn = new Button(this, 840, this.topY, { w: 130, h: 130, icon: 'undo', onClick: () => this.onUndo() });
    this.restartBtn = new Button(this, 990, this.topY, { w: 130, h: 130, icon: 'restart', onClick: () => this.restart() });

    recordPlayDay(); // если сессия перешла через полночь
    const look = currentLook();
    const ab = abilities();
    this.board = new BoardView(this, level, { x: 40, y: BOARD_Y - up, w: 1000, h: BOARD_H + up + down }, { look, road: roadStyleOf(look), arch: archStyleOf(look), brightFireflies: this.custom ? 0 : villageBonuses(getEconomy()).brightFireflies, nightLight: this.custom ? 0 : villageBonuses(getEconomy()).nightLight, maxCell: 250, sound: true });

    // Лоток
    const slotsG = this.add.graphics();
    slotsG.fillStyle(0x000000, 0.22);
    slotsG.fillRoundedRect(this.L.slotX[0] - CARD / 2 - 24, this.trayY - CARD / 2 - 24, this.L.slotX[2] - this.L.slotX[0] + CARD + 48, CARD + 48, 50);
    for (const x of this.L.slotX) {
      slotsG.lineStyle(4, C.cardEdge, 0.25);
      slotsG.strokeRoundedRect(x - CARD / 2, this.trayY - CARD / 2, CARD, CARD, CARD * 0.2);
    }
    this.stashGlow = this.add.graphics().setDepth(9);
    // Слот «отложить» появляется с уровня, где его учат; после прокачки — два слота поменьше.
    const two = level.allowStash && ab.stashSlots >= 2;
    const half = CARD * 0.26 + 6;
    this.stashCard = new TileCard(this, this.stashX, two ? this.trayY - half : this.trayY, 'stash');
    this.stashCard2 = new TileCard(this, this.stashX, this.trayY + half, 'stash2');
    for (const c of [this.stashCard, this.stashCard2]) {
      c.baseScale = two ? 0.5 : 1;
      c.setScale(c.baseScale);
    }
    this.stashCard.setVisible(level.allowStash);
    this.stashCard2.setVisible(two);
    this.cards = this.L.slotX.map((x, i) => new TileCard(this, x, this.trayY, i));
    this.deckG = this.add.graphics();
    this.deckText = text(this, this.L.deckX, this.trayY + 8, '0', 56);
    // «Фонарик»: сколько следующих плиток видно (2 → 3 → 4 → 5). Больше двух — ряд поменьше у колоды.
    const n = ab.preview;
    // Ряд выровнен по правому краю колоды (а не по краю экрана), шаг — как у сетки мини-карточек.
    const step = n <= 2 ? 84 : 70;
    const px = Array.from({ length: n }, (_, i) => this.L.deckX + 30 - (n - 1 - i) * step);
    this.previews = px.map((x) => new MiniCard(this, x, this.previewY, n <= 2 ? 72 : 60));

    // Нижняя панель: подсказка и (после серии поражений) пропуск уровня
    const showSkip = this.streak >= STUCK.skip;
    const hintX = showSkip ? W / 2 - 190 : W / 2;
    this.hintBtn = new Button(this, hintX, this.bottomY, { w: 340, h: 116, icon: 'bulb', label: this.hintLabel(), fontSize: 40, onClick: () => this.onHint() });
    if (showSkip) {
      const skip = new Button(this, W / 2 + 190, this.bottomY, { w: 340, h: 116, icon: 'skip', label: t('skip'), fontSize: 40, onClick: () => this.skipLevel() });
      // Кнопки растут под текст — ставим их рядом по фактической ширине.
      layoutRow([this.hintBtn, skip], W / 2, 30);
    }

    this.hintRing = this.add.graphics().setDepth(9);
    this.tweens.add({ targets: this.hintRing, alpha: 0.25, duration: 600, yoyo: true, repeat: -1 });
    this.hand = this.add.text(0, 0, '👆', { fontSize: '120px' }).setOrigin(0.3, 0.05).setDepth(30).setVisible(false);

    this.tips = new TipManager(this);
    for (const card of [...this.cards, this.stashCard, this.stashCard2]) this.bindCard(card);
    // «Поворот плитки» (способность из деревни): кнопка рядом с меню, на ней — сколько зарядов осталось.
    if (ab.rotations > 0) {
      this.rotateBtn = new Button(this, 240, this.topY, { w: 130, h: 130, icon: 'rotate', onClick: () => this.toggleRotate() });
      this.rotateText = text(this, 290, this.topY + 50, String(ab.rotations), 34, '#ffd36b').setDepth(5);
    }
    this.input.on('pointermove', this.onPointerMove, this);
    this.input.on('pointerup', this.onPointerUp, this);
    this.input.keyboard?.on('keydown', this.onKey, this);
    // Игрок закрыл вкладку посреди уровня — всё равно запишем время попытки.
    const onHide = () => {
      if (this.ended) return;
      this.log({ ev: 'abandon', level: this.state.level.id, attempt: this.attempt, ms: this.elapsed(), moves: this.state.moves, ...this.attemptStats(0) });
      this.ended = true;
    };
    window.addEventListener('pagehide', onHide);
    // Приложение свернули: время в фоне не засчитываем в попытку. «Назад» на Android — в меню.
    let pausedAt = 0;
    const onPause = () => (pausedAt = Date.now());
    const onResume = () => {
      if (pausedAt) this.t0 += Date.now() - pausedAt;
      pausedAt = 0;
    };
    const onBack = () => this.leave('Menu');
    this.game.events.on(APP_PAUSE, onPause);
    this.game.events.on(APP_RESUME, onResume);
    this.game.events.on(APP_BACK, onBack);
    this.events.once('shutdown', () => {
      window.removeEventListener('pagehide', onHide);
      this.game.events.off(APP_PAUSE, onPause);
      this.game.events.off(APP_RESUME, onResume);
      this.game.events.off(APP_BACK, onBack);
      this.input.off('pointermove', this.onPointerMove, this);
      this.input.off('pointerup', this.onPointerUp, this);
      this.input.keyboard?.off('keydown', this.onKey, this);
    });

    // Незаметное облегчение после серии поражений (только для уровней с колодой).
    const extra = !level.tileSet && this.streak >= STUCK.ease ? EASE_TILES : 0;
    let deck = level.deck;
    if (extra > 0) {
      // Обычно колоды посчитаны заранее (npm run ease); если нет — считаем на месте один раз.
      const key = `${level.id}:${extra}`;
      if (!easedDecks.has(key)) easedDecks.set(key, level.easeDecks?.[extra - 1] ?? easeDeck(level, extra));
      deck = easedDecks.get(key)!;
    }

    // Для бесконечной колоды — своё случайное зерно на каждую попытку.
    // Лес: травница задерживает тень, обсерватория — обзор в тумане дальше (бонусы деревни).
    const vb = this.custom ? null : villageBonuses(getEconomy());
    this.state = createGame(level, deck, Math.floor(Math.random() * 2 ** 31), {
      stashSlots: ab.stashSlots,
      rotations: ab.rotations,
      charms: vb?.shadowCharms ?? 0,
      fogBonus: vb?.fogSight ?? 0,
    });
    this.fogHidden.clear();
    this.fogOpened.clear();
    const m = level.metrics;
    this.usedHint = false;
    this.hintsUsed = 0;
    this.attempt = this.custom ? 1 : startAttempt(level.id, { ...(m ? { rating: m.rating, trap: m.trap, roads: m.roads } : {}), goal_type: level.goal });
    if (extra > 0) this.log({ ev: 'auto_ease', level: level.id, attempt: this.attempt, added: extra, streak: this.streak });
    this.t0 = Date.now();
    this.board.setRoad(this.state);
    if (level.fog) this.board.visibleCells().forEach((v, i) => !v && this.fogHidden.add(i));
    this.refresh(false);
    // Уровень появляется из темноты — свет расходится от фонаря Lumo.
    irisIn(this, this.board.lumo.x, this.board.lumo.y);
    if (this.streak >= STUCK.pulseHint) this.pulse(this.hintBtn);
    if (isTutorialActive(level.num)) logTutorialStep(`level_${level.num}_start`, level.id);
    // Новый элемент на уровне — сначала карточка правила с живой анимацией; потом карточка цели и подсказки.
    const rules = this.custom ? [] : pendingRules(level);
    if (rules.length) {
      this.time.delayedCall(650, () => {
        this.game.events.once(RULES_CLOSED, () => this.showGoalCard(() => this.startTips()));
        this.scene.launch('Rules', { cards: rules, from: 'Game' });
        this.scene.pause();
      });
    } else {
      this.time.delayedCall(650, () => this.showGoalCard(() => this.startTips()));
    }
    this.resetIdle();
    this.input.on('pointerdown', this.resetIdle, this);
    this.events.once('shutdown', () => this.input.off('pointerdown', this.resetIdle, this));
    if (this.state.status === 'lost') this.onLose();
  }

  // -------------------------------------------------------------------------
  // Цель уровня и подсказки Lumo

  /**
   * Карточка цели перед уровнем: «Доведи Lumo до двери», «Зажги все фонари: N», светлячки и пояснения к
   * хитрым элементам уровня (гаснущий фонарь, поворотный мост). Не исчезает сама — закрывается кнопкой
   * «Старт» (или Enter/пробел), чтобы успеть прочитать. onStart — после закрытия (подсказки Lumo).
   */
  private showGoalCard(onStart?: () => void) {
    if (this.state.status !== 'playing') return;
    const level = this.state.level;
    const n = level.lanterns.length;
    const ff = level.fireflies.length;
    type Row = { icon: 'portal' | 'lantern' | 'firefly' | 'fade' | 'bridge' | 'ring' | 'fog' | 'shadow' | 'herb' | 'eye' | 'fire' | 'ice' | 'drift' | 'wind'; label: string; note?: string };
    const rows: Row[] = [];
    if (level.goal === 'fireflies') {
      // Цель «светлячки»: двери нет, нужно собрать всех.
      rows.push({ icon: 'firefly', label: t('goal_all_fireflies', { n: ff }) });
    } else if (level.goal === 'escape') {
      // «Побег»: арка открыта, фонари — по желанию (задерживают тень).
      rows.push({ icon: 'portal', label: t('goal_escape') });
      if (n > 0) rows.push({ icon: 'lantern', label: t('goal_escape_lanterns', { n }) });
      if (ff > 0) rows.push({ icon: 'firefly', label: t('goal_fireflies', { n: ff }) });
    } else {
      rows.push({ icon: 'portal', label: t('goal_door') });
      // «Сигнальные огни»: костры по порядку номеров.
      if (level.fires.length) rows.push({ icon: 'fire', label: t('goal_signals', { n: level.fires.length }) });
      if (n > 0) rows.push({ icon: 'lantern', label: t('goal_lanterns', { n }) });
      if (ff > 0) rows.push({ icon: 'firefly', label: t('goal_fireflies', { n: ff }) });
    }
    // Хитрые элементы — объясняем на каждом уровне, где они есть (не только при первой встрече).
    const fadeN = level.fades.length ? level.fade[level.fades[0]] : 0;
    if (fadeN) rows.push({ icon: 'fade', label: t('goal_fade_title'), note: t('goal_fade_text') });
    if (level.turnBridges.length) rows.push({ icon: 'bridge', label: t('goal_bridge_title'), note: t('goal_bridge_text') });
    if (level.rings.length) rows.push({ icon: 'ring', label: t('goal_ring_title'), note: t('goal_ring_text') });
    if (level.cells.includes('ice')) rows.push({ icon: 'ice', label: t('goal_ice_title'), note: t('goal_ice_text') });
    if (level.cells.includes('drift')) rows.push({ icon: 'drift', label: t('goal_drift_title'), note: t('goal_drift_text') });
    if (level.cells.includes('wind')) rows.push({ icon: 'wind', label: t('goal_wind_title'), note: t('goal_wind_text') });
    if (level.fog) {
      rows.push({ icon: 'fog', label: t('goal_fog_title'), note: t('goal_fog_text') });
      // Обсерватория: обзор в тумане дальше.
      if (this.state.sight > 1) rows.push({ icon: 'eye', label: t('goal_observatory', { n: this.state.sight - 1 }) });
    }
    if (level.shadow) {
      rows.push({ icon: 'shadow', label: t('goal_shadow_title'), note: t('goal_shadow_text', { n: level.shadow }) });
      // Травница: сколько раз задержит тень на этом уровне.
      if (this.state.charms > 0) rows.push({ icon: 'herb', label: t('goal_herbalist', { n: this.state.charms }) });
    }

    const ICON = 80;
    const GAP = 40;
    const PAD = 64;
    const maxW = W - 60;
    const labels = rows.map((r) => text(this, 0, 0, r.label, 52).setOrigin(0, 0));
    const longest = Math.max(...labels.map((l) => l.width));
    const textMax = maxW - PAD * 2 - ICON - GAP;
    const fit = Math.min(1, textMax / longest);
    // Пояснения переносятся по словам; ширина окна — по самой длинной строке, не шире экрана.
    const hasNotes = rows.some((r) => r.note);
    const textW = hasNotes ? textMax : longest * fit;
    const notes = rows.map((r) =>
      r.note
        ? this.add
            .text(0, 0, r.note, { fontFamily: FONT, fontSize: '40px', color: C.textDim, wordWrap: { width: textW } })
            .setOrigin(0, 0)
            .setLineSpacing(4)
        : null,
    );
    const contentW = ICON + GAP + textW;
    const pw = Math.max(800, contentW + PAD * 2);
    const rowH = rows.map((_, i) => Math.max(ICON, labels[i].height * fit + (notes[i] ? notes[i]!.height + 8 : 0)));
    const ROW_GAP = 34;
    const BTN = 130;
    const ph = PAD + rowH.reduce((a, b) => a + b, 0) + ROW_GAP * (rows.length - 1) + 50 + BTN + 44;

    const c = this.add.container(W / 2, H / 2 - 40).setDepth(35);
    // Затемнение и окно: до «Старт» по полю не нажать.
    const dim = this.add.rectangle(0, 0, W * 4, H * 4, 0x04061a, 0.55).setInteractive();
    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.35);
    g.fillRoundedRect(-pw / 2, -ph / 2 + 10, pw, ph, 50);
    g.fillStyle(C.panel, 0.98);
    g.fillRoundedRect(-pw / 2, -ph / 2, pw, ph, 50);
    g.lineStyle(6, C.primary, 0.9);
    g.strokeRoundedRect(-pw / 2, -ph / 2, pw, ph, 50);
    c.add([dim, g]);
    const left = -contentW / 2;
    const ix = left + ICON / 2;
    const tx = left + ICON + GAP;
    let y = -ph / 2 + PAD;
    rows.forEach((r, i) => {
      const cy = y + rowH[i] / 2;
      const ig = this.add.graphics();
      const iy = notes[i] ? y + 30 : cy;
      if (r.icon === 'portal') drawPortalIcon(ig, ix, iy, 32, false);
      else if (r.icon === 'firefly') drawFireflyIcon(ig, ix, iy, 30, true);
      else if (r.icon === 'lantern') this.drawLanternIcon(ig, ix, iy + 4, true, 1.5);
      else if (r.icon === 'fade') this.drawFadeIcon(ig, ix, iy + 10, fadeN);
      else if (r.icon === 'ring') drawRingBase(ig, ix, iy, ICON * 1.05, 1);
      else if (r.icon === 'fog') this.drawFogIcon(ig, ix, iy);
      else if (r.icon === 'shadow') this.drawShadowIcon(ig, ix, iy, 1.6);
      else if (r.icon === 'herb') this.drawHerbIcon(ig, ix, iy);
      else if (r.icon === 'eye') this.drawEyeIcon(ig, ix, iy);
      else if (r.icon === 'fire') this.drawFireIcon(ig, ix, iy, true, 1.5);
      else if (r.icon === 'ice') this.drawIceIcon(ig, ix, iy);
      else if (r.icon === 'drift') this.drawDriftIcon(ig, ix, iy);
      else if (r.icon === 'wind') this.drawWindIcon(ig, ix, iy);
      else this.drawTurnBridgeIcon(ig, ix, iy + 10);
      c.add(ig);
      const label = labels[i].setScale(fit);
      if (notes[i]) {
        label.setPosition(tx, y);
        c.add([label, notes[i]!.setPosition(tx, y + label.height * fit + 8)]);
      } else {
        c.add(label.setPosition(tx, cy - (label.height * fit) / 2));
      }
      if (r.icon === 'fade') {
        // Число на табличке — как на поле.
        const badge = text(this, ix + 26, iy - 18, String(fadeN), 30, '#fff1cc');
        c.add(badge);
      }
      y += rowH[i] + ROW_GAP;
    });
    const shownAt = Date.now();
    let done = false;
    const start = () => {
      if (done) return;
      done = true;
      sfx.tap();
      this.goalCard = undefined;
      this.input.keyboard?.off('keydown-ENTER', start);
      this.input.keyboard?.off('keydown-SPACE', start);
      // Время уровня считаем с «Старт» — чтение правил не в счёт.
      this.t0 += Date.now() - shownAt;
      this.tweens.add({ targets: c, alpha: 0, scale: 0.95, duration: 220, onComplete: () => c.destroy() });
      this.resetIdle();
      if (onStart) this.time.delayedCall(350, onStart);
    };
    c.add(new Button(this, 0, ph / 2 - 44 - BTN / 2, { w: 420, h: BTN, icon: 'play', label: t('goal_start'), primary: true, fontSize: 52, onClick: start }));
    this.input.keyboard?.on('keydown-ENTER', start);
    this.input.keyboard?.on('keydown-SPACE', start);
    this.events.once('shutdown', () => {
      this.input.keyboard?.off('keydown-ENTER', start);
      this.input.keyboard?.off('keydown-SPACE', start);
    });
    c.setAlpha(0).setScale(0.85);
    this.goalCard = c;
    this.tweens.add({ targets: c, alpha: 1, scale: 1, duration: 280, ease: 'Back.out' });
  }

  /** Гаснущий фонарь в карточке цели: фонарь на постаменте и табличка с числом (число рисуется текстом). */
  private drawFadeIcon(g: Phaser.GameObjects.Graphics, x: number, y: number, _n: number) {
    this.drawLanternIcon(g, x - 6, y, true, 1.4);
    g.fillStyle(0x1a2150, 1);
    g.fillCircle(x + 26, y - 28, 22);
    g.lineStyle(4, C.primary, 1);
    g.strokeCircle(x + 26, y - 28, 22);
  }

  /** Костёр: камни, поленья и (если горит) пламя. */
  private drawFireIcon(g: Phaser.GameObjects.Graphics, x: number, y: number, on: boolean, k = 1) {
    if (on) {
      g.fillStyle(FIRE.glow, 0.25);
      g.fillCircle(x, y - 4 * k, 26 * k);
    }
    g.fillStyle(FIRE.stone, 1);
    g.fillEllipse(x, y + 14 * k, 40 * k, 12 * k);
    g.lineStyle(6 * k, FIRE.log, 1);
    g.lineBetween(x - 14 * k, y + 14 * k, x + 6 * k, y - 8 * k);
    g.lineBetween(x + 14 * k, y + 14 * k, x - 6 * k, y - 8 * k);
    if (!on) return;
    g.fillStyle(FIRE.flame, 1);
    g.fillTriangle(x - 12 * k, y + 8 * k, x + 12 * k, y + 8 * k, x, y - 24 * k);
    g.fillStyle(FIRE.core, 1);
    g.fillTriangle(x - 6 * k, y + 8 * k, x + 6 * k, y + 8 * k, x, y - 10 * k);
  }

  /** Лёд: голубая плитка с бликом. */
  private drawIceIcon(g: Phaser.GameObjects.Graphics, x: number, y: number) {
    g.fillStyle(0x5aa6d6, 1);
    g.fillRoundedRect(x - 34, y - 34, 68, 68, 14);
    g.fillStyle(0x9fd8f2, 1);
    g.fillRoundedRect(x - 31, y - 31, 62, 58, 12);
    g.fillStyle(0xffffff, 0.7);
    g.fillTriangle(x - 18, y + 4, x + 2, y - 20, x + 10, y - 20);
    g.fillTriangle(x - 18, y + 4, x - 10, y + 4, x + 10, y - 20);
  }

  /** Сугроб: снежная горка. */
  private drawDriftIcon(g: Phaser.GameObjects.Graphics, x: number, y: number) {
    g.fillStyle(0xb8d4ec, 1);
    g.fillEllipse(x, y + 14, 72, 30);
    g.fillStyle(0xe6f2ff, 1);
    g.fillEllipse(x - 14, y + 2, 38, 32);
    g.fillEllipse(x + 14, y + 4, 40, 28);
    g.fillEllipse(x, y - 10, 36, 30);
  }

  /** Ветер: две стрелки-галочки и завиток. */
  private drawWindIcon(g: Phaser.GameObjects.Graphics, x: number, y: number) {
    g.lineStyle(6, 0xbfefff, 1);
    for (const dx of [-14, 8]) {
      g.beginPath();
      g.moveTo(x + dx - 10, y - 14);
      g.lineTo(x + dx + 6, y);
      g.lineTo(x + dx - 10, y + 14);
      g.strokePath();
    }
    g.lineStyle(4, 0xdff4ff, 0.7);
    g.lineBetween(x - 34, y - 24, x + 22, y - 24);
    g.lineBetween(x - 30, y + 24, x + 26, y + 24);
  }

  /** Туман: три облачка. */
  private drawFogIcon(g: Phaser.GameObjects.Graphics, x: number, y: number) {
    g.fillStyle(0x9aa0d0, 0.9);
    g.fillEllipse(x - 14, y + 6, 54, 30);
    g.fillEllipse(x + 16, y + 2, 50, 34);
    g.fillStyle(0xc8c8f0, 1);
    g.fillEllipse(x, y - 10, 46, 32);
  }

  /** Тень: тёмный сгусток с глазами. k — масштаб. */
  private drawShadowIcon(g: Phaser.GameObjects.Graphics, x: number, y: number, k = 1) {
    g.fillStyle(0x6a2cff, 0.25);
    g.fillCircle(x, y, 26 * k);
    g.fillStyle(0x0c0618, 1);
    g.fillEllipse(x, y - 2 * k, 30 * k, 32 * k);
    for (let i = -1; i <= 1; i++) g.fillCircle(x + i * 8 * k, y + 13 * k, 6 * k);
    g.fillStyle(0xe8d8ff, 1);
    g.fillEllipse(x - 6 * k, y - 4 * k, 5 * k, 7 * k);
    g.fillEllipse(x + 6 * k, y - 4 * k, 5 * k, 7 * k);
  }

  /** Травница: листик. */
  private drawHerbIcon(g: Phaser.GameObjects.Graphics, x: number, y: number) {
    g.fillStyle(0x5ed06a, 1);
    g.fillEllipse(x - 8, y + 4, 52, 28);
    g.fillStyle(0x8af08a, 1);
    g.fillEllipse(x + 10, y - 10, 40, 22);
    g.lineStyle(4, 0x2a6a30, 1);
    g.lineBetween(x - 30, y + 10, x + 26, y - 12);
  }

  /** Обсерватория: глаз-телескоп. */
  private drawEyeIcon(g: Phaser.GameObjects.Graphics, x: number, y: number) {
    g.fillStyle(0xfff1cc, 1);
    g.fillEllipse(x, y, 64, 34);
    g.fillStyle(0x3a46a0, 1);
    g.fillCircle(x, y, 13);
    g.fillStyle(0x0b0f27, 1);
    g.fillCircle(x, y, 6);
  }

  /** Поворотный мост в карточке цели: мост сейчас и полупрозрачный — каким станет после плитки. */
  private drawTurnBridgeIcon(g: Phaser.GameObjects.Graphics, x: number, y: number) {
    const plank = (alpha: number, vertical: boolean) => {
      const w = vertical ? 30 : 70;
      const h = vertical ? 70 : 30;
      g.fillStyle(0x8a5a32, alpha);
      g.fillRoundedRect(x - w / 2, y - h / 2, w, h, 6);
      g.lineStyle(3, 0x5a3a1e, alpha);
      for (let k = -1; k <= 1; k++) {
        if (vertical) g.lineBetween(x - w / 2 + 4, y + k * 18, x + w / 2 - 4, y + k * 18);
        else g.lineBetween(x + k * 18, y - h / 2 + 4, x + k * 18, y + h / 2 - 4);
      }
    };
    g.fillStyle(0x24508a, 0.9);
    g.fillRoundedRect(x - 40, y - 40, 80, 80, 14);
    plank(0.35, true);
    plank(1, false);
  }

  /** Подсказки в начале уровня (каждая — один раз за игру). */
  private startTips() {
    if (this.state.status !== 'playing' || this.overlay) return;
    const level = this.state.level;
    const tip = level.tip as TipId | undefined;
    // Фонари, вход сбоку и вода объясняются карточками правил перед уровнем; здесь — только то, что
    // удобнее показать прямо на игровом экране.
    if (tip === 'stash' && level.allowStash) {
      this.tip('stash', { x: this.stashX, y: this.trayY - CARD / 2 }, 'above');
    } else if (tip === 'water') {
      // Первая вода: подсвечиваем мост в лотке.
      const slot = this.state.tray.indexOf('bridge');
      if (slot >= 0) {
        const card = this.cards[slot];
        this.ring(card.homeX, card.homeY);
        this.tip('water', { x: card.homeX, y: this.trayY - CARD / 2 }, 'above');
      }
    }
    // Вершины: подсказка Lumo у элемента, когда он встречается впервые (каждая — один раз за игру).
    const first = (pred: (c: string, i: number) => boolean) => level.cells.findIndex(pred);
    const above = (idx: number) => {
      const c = this.board.center(idx);
      return { x: c.x, y: c.y - this.board.cell * 0.4 };
    };
    const peaksTip = level.goal === 'signals' && !hasSeenTip('signals') ? (['signals', level.fires[0]] as const)
      : first((c) => c === 'wind') >= 0 && !hasSeenTip('wind') ? (['wind', first((c) => c === 'wind')] as const)
      : first((c) => c === 'drift') >= 0 && !hasSeenTip('drift') ? (['drift', first((c) => c === 'drift')] as const)
      : first((c) => c === 'ice') >= 0 && !hasSeenTip('ice') ? (['ice', first((c) => c === 'ice')] as const)
      : null;
    if (peaksTip) this.tip(peaksTip[0], above(peaksTip[1]), 'above');
    // Две неудачи подряд — показываем, где подсказка.
    else if (this.streak >= STUCK.pulseHint) this.tip('hint', { x: this.hintBtn.x, y: this.bottomY - 58 }, 'above');
  }

  /** Подсказка обучения по id (один раз за игру). */
  private tip(id: TipId, target: { x: number; y: number }, side: 'above' | 'below') {
    return this.tips.show({ id, text: t(TIP_TEXT[id]), target, side });
  }

  /** Бездействие 15 с — подсказка про кнопку «Подсказка». */
  private resetIdle() {
    this.idleTimer?.remove();
    if (hasSeenTip('hint')) return;
    this.idleTimer = this.time.delayedCall(IDLE_HINT_SECONDS * 1000, () => {
      if (this.state.status === 'playing' && !this.overlay && !this.busy && !this.goalCard) this.tip('hint', { x: this.hintBtn.x, y: this.bottomY - 58 }, 'above');
    });
  }

  update(time: number) {
    this.board?.update(time);
  }

  // -------------------------------------------------------------------------
  // Отображение состояния

  private refresh(animate = true) {
    const s = this.state;
    const playing = s.status === 'playing';
    this.cards.forEach((card, i) => {
      const kind = s.tray[i];
      card.setTile(kind, playing && canPlace(s, kind), s.dir, animate);
      card.setVisible(kind !== null);
    });
    this.stashCard.setTile(s.stash, playing && canPlace(s, s.stash), s.dir, animate);
    this.stashCard.setVisible(s.level.allowStash);
    this.stashCard2.setTile(s.stash2, playing && canPlace(s, s.stash2), s.dir, animate);
    this.stashCard2.setVisible(s.level.allowStash && s.stashSlots >= 2);
    if (this.rotateBtn) {
      this.rotateBtn.setEnabled(playing && s.rotations > 0);
      this.rotateText?.setText(String(s.rotations));
      if (s.rotations === 0 && this.rotateMode) this.setRotateMode(false);
    }
    const next = upcoming(s, this.previews.length);
    this.previews.forEach((p, i) => p.setTile(next[i] ?? null, s.dir, animate));
    this.drawDeck();
    this.undoBtn.setEnabled(canUndo(s));
    this.hintBtn.setAlpha(playing ? 1 : 0.45);
    this.drawBadges();
    this.board.setHead(s);
    this.board.updateLanterns(s);
    this.board.updateFireflies(s);
    if (s.level.fog) this.board.visibleCells().forEach((v, i) => v && this.fogHidden.has(i) && this.fogOpened.add(i));
    this.updateHints();
  }

  /** Туман: сколько клеток игрок открыл за попытку (в лог при конце уровня). */
  private logFog() {
    if (!this.state.level.fog || !this.fogHidden.size) return;
    this.log({ ev: 'fog_revealed', level: this.state.level.id, attempt: this.attempt, cells: this.fogOpened.size, total: this.fogHidden.size });
  }

  /** Строка цели под заголовком: арка (с замком, пока не все фонари), фонари и светлячки «собрано/всего». */
  private drawBadges() {
    const g = this.badgesG;
    g.clear();
    const level = this.state.level;
    const n = level.lanterns.length;
    const ffTotal = level.fireflies.length;
    const y = this.topY + 58;
    const open = lanternsLeft(this.state) === 0;
    // «Побег»: фонари не обязательны — считаем, сколько зажжено на самом деле.
    const lit = lanternsOnRoad(this.state);
    const ff = firefliesOnRoad(this.state);
    const fires = level.fires.length;
    const firesLit = signalsLit(this.state);
    this.goalText.setText(n > 0 ? `${lit}/${n}` : '');
    this.fireText.setText(fires > 0 ? `${firesLit}/${fires}` : '');
    this.ffText.setText(ffTotal > 0 ? `${ff}/${ffTotal}` : '');
    // Тень: через сколько ходов появится или сколько клеток до неё.
    const ts = level.shadow ? timeOf(this.state) : null;
    const gap = ts ? shadowGap(ts) : -1;
    this.shadowText.setText(!ts ? '' : gap < 0 ? t('shadow_in', { n: shadowIn(level, ts) }) : t('shadow_gap', { n: gap }));
    this.shadowText.setColor(gap >= 0 && gap <= 2 ? '#ff8a7a' : '#d8c8ff');
    // Ширина строки: арка, [фонарь + текст], [светлячок + текст], [тень + текст].
    const door = level.goal !== 'fireflies';
    // Строка между кнопками (поворот слева, отмена справа): если не влезает — шрифт мельче.
    const parts = [n > 0, ffTotal > 0, !!ts, fires > 0].filter(Boolean).length;
    const fs = parts >= 3 ? 34 : 40;
    for (const tx of [this.goalText, this.ffText, this.shadowText, this.fireText]) tx.setFontSize(fs);
    const fireW = fires > 0 ? 30 + 50 + this.fireText.width : 0;
    const lanternW = n > 0 ? 30 + 50 + this.goalText.width : 0;
    const ffW = ffTotal > 0 ? 40 + 50 + this.ffText.width : 0;
    const shW = ts ? 40 + 50 + this.shadowText.width : 0;
    const total = (door ? 44 : -40) + fireW + lanternW + ffW + shW;
    let x = W / 2 - total / 2;
    if (door) {
      drawPortalIcon(g, x + 22, y, 22, open);
      x += 44;
    } else x -= 40; // цель «светлячки»: арки нет, в строке цели только светлячки
    if (fires > 0) {
      this.drawFireIcon(g, x + 66, y + 2, firesLit === fires, 0.9);
      this.fireText.setX(x + 96).setColor(firesLit === fires ? '#ffb070' : C.text);
      x += fireW;
    }
    if (n > 0) {
      this.drawLanternIcon(g, x + 66, y + 4, lit === n);
      this.goalText.setX(x + 96).setColor(lit === n ? '#ffd36b' : C.text);
      x += lanternW;
    }
    if (ffTotal > 0) {
      drawFireflyIcon(g, x + 76, y, 20, ff > 0);
      this.ffText.setX(x + 106).setColor(ff === ffTotal ? '#c8ff7a' : C.text);
      x += ffW;
    }
    if (ts) {
      this.drawShadowIcon(g, x + 76, y, 0.85);
      this.shadowText.setX(x + 106);
    }
  }

  private drawLanternIcon(g: Phaser.GameObjects.Graphics, x: number, y: number, on: boolean, k = 1) {
    if (on) {
      g.fillStyle(C.lanternOn, 0.25);
      g.fillCircle(x, y, 30 * k);
    }
    g.fillStyle(on ? C.lanternOn : C.lanternOff, on ? 1 : 0.7);
    g.fillRoundedRect(x - 14 * k, y - 16 * k, 28 * k, 30 * k, 7 * k);
    g.fillStyle(C.post, 1);
    g.fillTriangle(x - 18 * k, y - 15 * k, x + 18 * k, y - 15 * k, x, y - 28 * k);
    g.fillRect(x - 3 * k, y + 14 * k, 6 * k, 12 * k);
  }

  private drawDeck() {
    const n = deckLeft(this.state);
    const g = this.deckG;
    g.clear();
    const w = 120;
    const h = 150;
    const layers = Math.min(3, n === Infinity ? 3 : n);
    for (let i = layers - 1; i >= 0; i--) {
      const x = this.L.deckX - w / 2 + i * 8;
      const y = this.trayY - h / 2 - i * 10;
      g.fillStyle(0x000000, 0.25);
      g.fillRoundedRect(x, y + 8, w, h, 24);
      g.fillStyle(i === 0 ? C.card : 0x232b5e, 1);
      g.fillRoundedRect(x, y, w, h, 24);
      g.lineStyle(4, C.cardEdge, 0.8);
      g.strokeRoundedRect(x, y, w, h, 24);
    }
    if (n === 0) {
      g.lineStyle(4, C.cardEdge, 0.3);
      g.strokeRoundedRect(this.L.deckX - w / 2, this.trayY - h / 2, w, h, 24);
    }
    this.deckText
      .setText(n === Infinity ? '∞' : String(n))
      .setFontSize(n === Infinity ? 90 : 56)
      .setAlpha(n ? 1 : 0.35);
  }

  private pulse(target: Phaser.GameObjects.Container) {
    this.tweens.killTweensOf(target);
    target.setScale(1);
    this.tweens.add({ targets: target, scale: 1.1, duration: 550, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
  }

  private stopPulse(target: Phaser.GameObjects.Container) {
    this.tweens.killTweensOf(target);
    target.setScale(1);
  }

  // -------------------------------------------------------------------------
  // Подсказки: обучение без текста и кнопка «Подсказка»

  private updateHints() {
    const level = this.state.level;
    const s = this.state;
    if (s.status !== 'playing' || this.busy || (!level.tutorial && !this.activeHint)) {
      this.hideHints();
      return;
    }
    const hint = this.activeHint ?? findHint(s);
    const key = `${JSON.stringify(hint)}|${s.moves}|${s.deckIndex}|${s.stash}|${s.stash2}`;
    if (key === this.hintKey) return;
    this.hintKey = key;
    this.hideHints();
    if (!hint) {
      // Тупик впереди (только в обучении) — мягко подсвечиваем «отменить» или «заново».
      this.pulse(canUndo(s) ? this.undoBtn : this.restartBtn);
      return;
    }
    // В обучении «отложить» рука появляется только там, где нужно отложить.
    if (!this.activeHint && level.tutorial === 'stash' && hint.type !== 'stash' && hint.type !== 'swap') return;
    this.showHint(hint);
  }

  private showHint(hint: Action) {
    const s = this.state;
    if (hint.type === 'stash' || hint.type === 'swap') {
      const from = this.cards[hint.slot];
      this.ring(from.homeX, from.homeY);
      this.showHandDrag(from.homeX, from.homeY, this.stashX, this.trayY);
      return;
    }
    if (hint.type === 'placeStash') {
      // Отложенную плитку ставят, перетащив её на поле.
      const head = this.board.center(s.head);
      const sc = hint.from === 1 ? this.stashCard2 : this.stashCard;
      this.ring(sc.homeX, sc.homeY);
      this.showHandDrag(sc.homeX, sc.homeY, head.x, head.y);
      this.board.showGhost(s, previewTile(s, (hint.from === 1 ? s.stash2 : s.stash)!), 'hint');
      return;
    }
    if (hint.type === 'rotate') return;
    const card = this.cards[hint.slot];
    this.ring(card.homeX, card.homeY);
    this.showHandTap(card.homeX, card.homeY);
    this.board.showGhost(s, previewTile(s, card.kind!), 'hint');
  }

  private hideHints() {
    this.tweens.killTweensOf(this.hand);
    this.hand.setVisible(false);
    this.hintRing.clear();
    this.board.showGhost(this.state, null, 'hint');
    this.stopPulse(this.undoBtn);
    this.stopPulse(this.restartBtn);
  }

  private ring(x: number, y: number) {
    const g = this.hintRing;
    g.clear();
    g.lineStyle(10, C.lanternOn, 1);
    g.strokeRoundedRect(x - CARD / 2 - 14, y - CARD / 2 - 14, CARD + 28, CARD + 28, CARD * 0.26);
  }

  private showHandTap(x: number, y: number) {
    this.hand.setPosition(x, y + 20).setVisible(true).setAlpha(1);
    this.tweens.add({ targets: this.hand, y: y + 60, duration: 500, yoyo: true, repeat: -1, ease: 'Sine.inOut', delay: 300 });
  }

  private showHandDrag(x1: number, y1: number, x2: number, y2: number) {
    this.hand.setPosition(x1, y1 + 20).setVisible(true).setAlpha(0);
    this.tweens.chain({
      targets: this.hand,
      loop: -1,
      tweens: [
        { alpha: 1, duration: 250, x: x1, y: y1 + 20 },
        { y: y1 + 40, duration: 200 },
        { x: x2, y: y2 + 40, duration: 800, ease: 'Sine.inOut' },
        { alpha: 0, duration: 300, delay: 250 },
      ],
    });
  }

  /** Подсказки бесплатны на обучающих уровнях и в своём уровне из редактора. */
  private get freeHints() {
    return !!this.custom || isTutorialActive(this.state?.level.num ?? this.level.num) || this.level.num <= 4;
  }

  private hintLabel() {
    return this.freeHints ? t('hint') : t('hint_count', { n: hintsLeft() });
  }

  private onHint() {
    if (this.busy || this.overlay || this.state.status !== 'playing') return;
    if (this.activeHint) return; // подсказка уже показана
    // Подсказки кончились (3 бесплатные в день + запас) — купить за монеты или «за рекламу».
    if (!this.freeHints && hintsLeft() <= 0) {
      this.showBuyHintPanel();
      return;
    }
    const hint = findHint(this.state);
    if (hint) {
      this.spendHint(0);
      this.activeHint = hint;
      this.hintKey = '';
      this.refresh();
      return;
    }
    // Из текущего положения до выхода не дойти — предлагаем вернуться назад.
    const back = nearestSolvable(this.state);
    if (!back) return;
    this.showRollbackPanel(back.steps, () => {
      this.spendHint(back.steps);
      this.state = { ...back.state, undosUsed: this.state.undosUsed };
      this.cleanRun = 0;
      this.board.setRoad(this.state);
      this.resetCards();
      this.activeHint = findHint(this.state);
      this.hintKey = '';
      sfx.undo();
      this.refresh();
    });
  }

  /** Подсказка потрачена: из бесплатных на сегодня или из запаса (на обучающих уровнях — бесплатно). */
  private spendHint(rollback: number) {
    this.log({ ev: 'hint_used', level: this.state.level.id, attempt: this.attempt, rollback: rollback || undefined });
    this.usedHint = true;
    this.hintsUsed++;
    countHint();
    if (!this.freeHints) spendHint();
    this.hintBtn.setLabel(this.hintLabel());
    this.stopPulse(this.hintBtn);
    sfx.tap();
  }

  /** Подсказки кончились: купить за монеты, «Подсказка за ролик» (если ролик доступен) или закрыть. */
  private showBuyHintPanel() {
    const adOk = rewardedReady();
    const { o, top } = this.makeOverlay('rollback', adOk ? 640 : 530);
    o.add(text(this, W / 2, top + 100, t('hints_out'), 60, C.text, true, { w: 860 }));
    o.add(text(this, W / 2, top + 180, t('hints_out_sub', { n: freeHintsPerDay(getEconomy()) }), 40, C.textDim, false, { w: 860 }));
    const done = () => {
      this.closeOverlay();
      this.hintBtn.setLabel(this.hintLabel());
      this.onHint();
    };
    const buy = new Button(this, W / 2, top + 320, {
      w: 600,
      h: 130,
      primary: true,
      fontSize: 46,
      onClick: () => {
        const r = buyHint();
        if (!r.ok) {
          showNotEnough(this, 'coins', HINT_PRICE - coins(getEconomy()));
          return;
        }
        sfx.star(1);
        done();
      },
    });
    buttonRichLabel(buy, t('buy_for', { n: HINT_PRICE }), 46);
    o.add(buy);
    const ad = adOk
      ? rewardedButton(this, W / 2, top + 470, {
          place: 'hint',
          level: this.state.level.id,
          label: t('hint_for_ad'),
          w: 600,
          h: 110,
          fontSize: 38,
          onReward: () => {
            adHint();
            sfx.star(0);
            done();
          },
        })
      : null;
    if (ad) o.add(ad);
    o.add(new Button(this, W / 2, top + (ad ? 585 : 465), { w: 300, h: 90, label: t('close'), fontSize: 36, onClick: () => this.closeOverlay() }));
    o.on('primary', () => this.closeOverlay());
  }

  private showRollbackPanel(steps: number, onConfirm: () => void) {
    const { o, top } = this.makeOverlay('rollback', 600);
    const confirm = () => {
      this.closeOverlay();
      onConfirm();
    };
    o.add(text(this, W / 2, top + 110, t('rollback_title'), 64, C.text, true, { w: 860 }));
    o.add(text(this, W / 2, top + 200, t('rollback_ask', { n: steps }), 44, C.textDim, false, { w: 860, lines: 2 }));
    o.add(new Button(this, W / 2, top + 350, { w: 520, h: 140, icon: 'undo', label: t('rollback_go'), primary: true, onClick: confirm }));
    o.add(new Button(this, W / 2, top + 500, { w: 300, h: 100, label: t('no'), fontSize: 40, onClick: () => this.closeOverlay() }));
    o.on('primary', confirm);
  }

  // -------------------------------------------------------------------------
  // Ввод: тап — поставить, долгое нажатие / наведение — предпросмотр,
  // тап по слоту «отложить» — убрать туда / поменять, перетаскивание — то же самое

  private bindCard(card: TileCard) {
    card.on('pointerover', (p: Phaser.Input.Pointer) => {
      if (!p.wasTouch && !this.press && !this.busy) this.previewSlot(card.slot);
    });
    card.on('pointerout', (p: Phaser.Input.Pointer) => {
      if (!p.wasTouch && !this.press) this.board.showGhost(this.state, null);
    });
    card.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (this.busy || this.overlay || this.state.status !== 'playing') return;
      if (!card.kind && typeof card.slot === 'number') return;
      // Режим поворота: тап по плитке лотка поворачивает её.
      if (this.rotateMode && typeof card.slot === 'number') {
        this.doAction({ type: 'rotate', slot: card.slot });
        return;
      }
      const press: Press = { slot: card.slot, card, x0: p.worldX, y0: p.worldY, dragging: false };
      if (card.kind) press.timer = this.time.delayedCall(220, () => this.previewSlot(card.slot));
      this.press = press;
      this.tweens.add({ targets: card, scale: card.baseScale * 1.07, duration: 90 });
    });
  }

  private kindAt(slot: SlotId): TileKind | null {
    return slot === 'stash' ? this.state.stash : slot === 'stash2' ? this.state.stash2 : this.state.tray[slot];
  }

  private stashIndex(slot: SlotId): StashIndex {
    return slot === 'stash2' ? 1 : 0;
  }

  private cardOf(slot: SlotId): TileCard {
    return slot === 'stash' ? this.stashCard : slot === 'stash2' ? this.stashCard2 : this.cards[slot];
  }

  private previewSlot(slot: SlotId) {
    const kind = this.kindAt(slot);
    this.board.showGhost(this.state, kind ? previewTile(this.state, kind) : null);
  }

  /** Над каким слотом «отложить» точка: 0, 1 или -1. */
  private overStash(x: number, y: number): number {
    if (this.stashCard2.visible) {
      if (this.stashCard.isInside(x, y, 30)) return 0;
      if (this.stashCard2.isInside(x, y, 30)) return 1;
      return -1;
    }
    return this.stashCard.visible && Math.abs(x - this.stashX) < CARD * 0.75 && Math.abs(y - this.trayY) < CARD * 0.9 ? 0 : -1;
  }

  private traySlotAt(x: number, y: number): number {
    return this.cards.findIndex((c) => c.isInside(x, y, 10));
  }

  private onPointerMove(p: Phaser.Input.Pointer) {
    const pr = this.press;
    if (!pr || !pr.card.kind) return;
    if (!pr.dragging && Phaser.Math.Distance.Between(p.worldX, p.worldY, pr.x0, pr.y0) > 28) {
      pr.dragging = true;
      pr.timer?.remove();
      this.previewSlot(pr.slot);
      pr.card.setDepth(25);
    }
    if (pr.dragging) {
      pr.card.setPosition(p.worldX, p.worldY - 30);
      // Конец дороги — зона, куда можно бросить плитку; над ней — предпросмотр.
      const over = this.board.isOverDropZone(this.state, p.worldX, p.worldY);
      this.board.showDropZone(this.state, over);
      this.stashGlow.clear();
      const si = typeof pr.slot === 'number' ? this.overStash(p.worldX, p.worldY) : -1;
      if (si >= 0) {
        const sc = si === 1 ? this.stashCard2 : this.stashCard;
        const sz = CARD * sc.baseScale;
        this.stashGlow.lineStyle(10, C.lanternOn, 0.9);
        this.stashGlow.strokeRoundedRect(sc.homeX - sz / 2 - 12, sc.homeY - sz / 2 - 12, sz + 24, sz + 24, sz * 0.25);
      }
    }
  }

  private onPointerUp(p: Phaser.Input.Pointer) {
    const pr = this.press;
    if (!pr) return;
    this.press = null;
    pr.timer?.remove();
    this.stashGlow.clear();
    this.board.showDropZone(null);
    pr.card.setDepth(10);
    this.tweens.add({ targets: pr.card, scale: pr.card.baseScale, duration: 90 });
    if (!p.wasTouch && pr.card.isInside(p.worldX, p.worldY)) this.previewSlot(pr.slot);
    else this.board.showGhost(this.state, null);

    const snapBack = () => this.tweens.add({ targets: pr.card, x: pr.card.homeX, y: pr.card.homeY, duration: 200, ease: 'Back.out' });

    if (pr.dragging) {
      // Бросили на конец дороги — плитка ложится; вне зоны — возвращается в лоток.
      if (this.board.isOverDropZone(this.state, p.worldX, p.worldY)) {
        pr.card.setPosition(pr.card.homeX, pr.card.homeY);
        this.tryPlace(pr.slot, 'drag');
        return;
      }
      if (typeof pr.slot === 'number') {
        // Плитку лотка бросили на слот «отложить»: в пустой — отложить, в занятый — обменять.
        const si = this.overStash(p.worldX, p.worldY);
        if (si >= 0) {
          const i = si as StashIndex;
          this.doAction(stashAt(this.state, i) === null ? { type: 'stash', slot: pr.slot, to: i } : { type: 'swap', slot: pr.slot, with: i });
          return;
        }
        snapBack();
        return;
      }
      // Отложенную плитку перетащили: на плитку лотка — обмен, вверх на поле — поставить.
      const slot = this.traySlotAt(p.worldX, p.worldY);
      if (slot >= 0 && this.state.tray[slot]) {
        this.doAction({ type: 'swap', slot, with: this.stashIndex(pr.slot) });
        return;
      }
      if (p.worldY < this.trayY - CARD * 0.75) {
        pr.card.setPosition(pr.card.homeX, pr.card.homeY);
        this.tryPlace(pr.slot, 'drag');
        return;
      }
      snapBack();
      return;
    }
    if (!pr.card.isInside(p.worldX, p.worldY, 40)) return;
    if (pr.slot === 'stash' || pr.slot === 'stash2') this.tapStash(this.stashIndex(pr.slot));
    else this.tryPlace(pr.slot);
  }

  /** Тап по слоту «отложить»: пустой — убрать туда крайнюю левую плитку, занятый — поменять с ней. */
  private tapStash(i: StashIndex = 0) {
    if (this.busy || this.state.status !== 'playing') return;
    const slot = leftmostTile(this.state);
    if (stashAt(this.state, i) === null) {
      if (slot < 0) return;
      this.doAction({ type: 'stash', slot, to: i });
    } else {
      this.doAction({ type: 'swap', slot: slot < 0 ? 0 : slot, with: i });
    }
  }

  // -------------------------------------------------------------------------
  // «Поворот плитки»

  private toggleRotate() {
    if (this.busy || this.overlay || this.state.status !== 'playing' || this.state.rotations <= 0) return;
    sfx.tap();
    this.setRotateMode(!this.rotateMode);
    if (this.rotateMode) toast(this, t('rotate_tap'), this.trayY - CARD);
  }

  private setRotateMode(on: boolean) {
    this.rotateMode = on;
    this.rotateBtn?.setPrimary(on);
    for (const c of this.cards) {
      this.tweens.killTweensOf(c);
      c.setAngle(0);
      if (on && c.kind && rotateKind(c.kind)) this.tweens.add({ targets: c, angle: { from: -3, to: 3 }, duration: 160, yoyo: true, repeat: -1 });
    }
  }

  private onKey(e: KeyboardEvent) {
    if (e.target instanceof HTMLInputElement) return; // печатают имя
    if (this.overlay) {
      if (e.key === 'Enter' || e.key === ' ') this.overlay.emit('primary');
      return;
    }
    if (this.goalCard) return; // карточка цели: сначала «Старт»
    if (['1', '2', '3'].includes(e.key)) this.tryPlace(Number(e.key) - 1);
    else if (e.key === '0') this.tryPlace('stash');
    else if (e.key === 's' || e.key === 'ы') this.tapStash();
    else if (e.key === 'z' || e.key === 'я') this.onUndo();
    else if (e.key === 'r' || e.key === 'к') this.restart();
    else if (e.key === 'h' || e.key === 'р') this.onHint();
  }

  private tryPlace(slot: SlotId, source: 'tap' | 'drag' = 'tap') {
    if (this.busy || this.state.status !== 'playing') return;
    const kind = this.kindAt(slot);
    if (!kind) return;
    if (!canPlace(this.state, kind)) {
      this.invalid(slot);
      return;
    }
    this.log({ ev: source === 'drag' ? 'drag_place' : 'tap_place', level: this.state.level.id, attempt: this.attempt });
    this.doAction(typeof slot === 'number' ? { type: 'place', slot } : { type: 'placeStash', from: this.stashIndex(slot) });
  }

  private invalid(slot: SlotId) {
    const card = this.cardOf(slot);
    sfx.invalid();
    const kind = this.kindAt(slot);
    if (kind) {
      const p = previewTile(this.state, kind);
      this.board.showGhost(this.state, p);
      this.explainBlock(p);
    }
    this.tweens.killTweensOf(card);
    card.setPosition(card.homeX, card.homeY).setScale(card.baseScale);
    this.tweens.add({ targets: card, x: card.homeX + 14, duration: 45, yoyo: true, repeat: 3 });
    this.time.delayedCall(650, () => {
      if (!this.press) this.board.showGhost(this.state, null);
    });
  }

  /** Почему плитка не встаёт: правила элементов при первом знакомстве и реплика у закрытой двери. */
  private explainBlock(p: ReturnType<typeof previewTile>) {
    const s = this.board.cell;
    const at = p.blocked ? { x: this.board.ox + (p.blocked.x + 0.5) * s, y: this.board.oy + (p.blocked.y + 0.5) * s - s * 0.35 } : null;
    if (p.reason === 'exitClosed') {
      const e = this.board.exitCenter();
      this.board.shakeLock();
      this.log({ ev: 'door_locked_attempt', level: this.state.level.id, attempt: this.attempt });
      this.tips.show({ text: t('tip_door_locked'), target: { x: e.x, y: e.y - s * 0.4 }, side: 'above', autoCloseMs: 2600 });
    } else if (p.reason === 'rock' && at) {
      this.tip('rock', at, 'above');
    } else if (p.reason === 'water' && at) {
      this.tip('water', at, 'above');
    } else if (p.reason === 'bridgeTurned') {
      this.log({ ev: 'bridge_rotated_blocked', level: this.state.level.id, attempt: this.attempt, tile: tilesPlaced(this.state) });
      if (at) this.tip('turnbridge', at, 'above');
    } else if (p.reason === 'drift' && at) {
      this.tip('drift', at, 'above');
    } else if (p.reason === 'fireOrder' && p.fire !== undefined) {
      // Не тот костёр: вежливо мигает номером, Lumo подсказывает, какой сначала. Это не проигрыш.
      this.board.blinkFire(p.fire);
      const need = signalsLit(this.state) + 1;
      this.log({ ev: 'fire_order_blocked', level: this.state.level.id, attempt: this.attempt, fire: this.state.level.fireNo[p.fire], need });
      const c = this.board.center(p.fire);
      this.tips.show({ text: t('tip_fire_order', { n: need }), target: { x: c.x, y: c.y - s * 0.4 }, side: 'above', autoCloseMs: 2200 });
    }
    // Первая ошибка — показываем, что ход можно вернуть.
    if (canUndo(this.state)) this.tip('undo', { x: this.undoBtn.x, y: this.topY + 70 }, 'below');
  }

  // -------------------------------------------------------------------------
  // Ходы

  private doAction(action: Action) {
    if (this.busy) return;
    const prev = this.state;
    const next = applyAction(prev, action);
    if (next === prev) return;
    this.state = next;
    this.busy = true;
    this.activeHint = null;
    this.tips.dismiss();
    this.resetIdle();
    this.hideHints();
    this.board.showGhost(next, null);
    // Первый поворот: иконки в лотке поворачиваются вместе с дорогой — подсвечиваем их и объясняем.
    if (next.dir !== prev.dir && !hasSeenTip('turn')) {
      this.time.delayedCall(450, () => this.explainTurn());
    }
    // После первой плитки на первом уровне — подсказка, что плитку можно и перетащить.
    if (action.type === 'place' && next.level.num === 1 && next.moves === 1) {
      this.time.delayedCall(700, () => this.tip('drag', { x: this.L.slotX[1], y: this.trayY - CARD / 2 }, 'above'));
    }

    const finish = () => {
      this.busy = false;
      this.refresh();
      if (next.status === 'won') this.onWin();
      else if (next.status === 'lost') this.onLose();
    };

    if (action.type === 'rotate') {
      // Плитка поворачивается на глазах: карточка делает четверть оборота.
      const card = this.cards[action.slot];
      sfx.stash();
      this.setRotateMode(false);
      this.tweens.add({
        targets: card,
        angle: 90,
        duration: 220,
        ease: 'Back.in',
        onComplete: () => {
          card.setAngle(0).setTile(next.tray[action.slot], canPlace(next, next.tray[action.slot]), next.dir, false);
          this.tweens.add({ targets: card, scale: { from: 1.15, to: 1 }, duration: 200, ease: 'Back.out', onComplete: finish });
        },
      });
      return;
    }

    if (action.type === 'stash') {
      if (!this.custom) questEvent({ type: 'stash' });
      const card = this.cards[action.slot];
      const toTwo = prev.stash !== null || action.to === 1;
      const sc = toTwo && next.stash2 !== null && prev.stash2 === null ? this.stashCard2 : this.stashCard;
      sfx.stash();
      this.tweens.add({
        targets: card,
        x: sc.homeX,
        y: sc.homeY,
        scale: sc.baseScale,
        duration: 200,
        ease: 'Quad.out',
        onComplete: () => {
          sc.setTile(sc === this.stashCard2 ? next.stash2 : next.stash, false, next.dir, false);
          this.tweens.add({ targets: sc, scale: { from: sc.baseScale * 1.15, to: sc.baseScale }, duration: 200, ease: 'Back.out' });
          card.setScale(1);
          this.dealInto(card, next.tray[action.slot], finish);
        },
      });
      return;
    }

    if (action.type === 'swap') {
      const card = this.cards[action.slot];
      const two = action.with === 1;
      const sc = two ? this.stashCard2 : this.stashCard;
      sfx.stash();
      this.tweens.add({ targets: card, x: sc.homeX, y: sc.homeY, scale: sc.baseScale, duration: 220, ease: 'Quad.inOut' });
      this.tweens.add({
        targets: sc,
        x: card.homeX,
        y: card.homeY,
        scale: 1,
        duration: 220,
        ease: 'Quad.inOut',
        onComplete: () => {
          card.setPosition(card.homeX, card.homeY).setScale(1);
          sc.setPosition(sc.homeX, sc.homeY).setScale(sc.baseScale);
          card.setTile(next.tray[action.slot], false, next.dir, false);
          sc.setTile(two ? next.stash2 : next.stash, false, next.dir, false);
          finish();
        },
      });
      return;
    }

    // Плитка улетает на конец дороги, дорога вырастает.
    const headPos = this.board.center(next.head);
    const card = action.type === 'place' ? this.cards[action.slot] : action.from === 1 ? this.stashCard2 : this.stashCard;
    const newCells = next.road.length - prev.road.length;
    const placed = next.road[next.road.length - 1];
    if (placed.kind === 'jump') this.log({ ev: 'tile_jump_used', level: next.level.id, attempt: this.attempt, tile: placed.step });
    if (next.road.slice(prev.road.length).some((r) => r.portal === 'in')) this.log({ ev: 'teleport_used', level: next.level.id, attempt: this.attempt, tile: placed.step });
    if (next.level.shadow) {
      // Тень: задержал фонарь или травница — подпись над тенью; догнала — бросок и «Тень настигла».
      const why = next.status === 'won' ? null : shadowDelay(timeOf(prev), timeOf(next));
      if (why) {
        this.board.shadowDelayed(t(why === 'herbalist' ? 'shadow_delayed_herbalist' : 'shadow_delayed_lantern'), why === 'herbalist');
        this.log({ ev: 'shadow_delayed', level: next.level.id, attempt: this.attempt, source: why, tile: placed.step });
      }
      if (lossReason(next) === 'shadow') {
        this.board.shadowCaught();
        this.log({ ev: 'shadow_caught', level: next.level.id, attempt: this.attempt, tile: placed.step });
      }
    }
    // Вершины: скольжение, ветер, растаявшие сугробы, зажжённые сигнальные огни.
    const fresh = next.road.slice(prev.road.length);
    const slid = fresh.filter((r) => r.forced === 'ice').length;
    if (slid) this.log({ ev: 'ice_slide', level: next.level.id, attempt: this.attempt, tile: placed.step, cells: slid });
    if (fresh.some((r) => r.forced === 'wind')) this.log({ ev: 'wind_push', level: next.level.id, attempt: this.attempt, tile: placed.step });
    const melted = next.level.cells.reduce((n, c, i) => n + (c === 'drift' && driftMelted(next.level, (j) => next.onRoad[j], i) && !driftMelted(prev.level, (j) => prev.onRoad[j], i) ? 1 : 0), 0);
    if (melted) this.log({ ev: 'drift_melted', level: next.level.id, attempt: this.attempt, tile: placed.step, cells: melted });
    if (signalsLit(next) > signalsLit(prev)) this.log({ ev: 'signal_lit', level: next.level.id, attempt: this.attempt, tile: placed.step, fire: signalsLit(next), total: next.level.fires.length });
    if (!this.custom) questEvent({ type: 'tile', jump: placed.kind === 'jump' });
    const expired = expiredLantern(next);
    if (next.status !== 'won' && expired >= 0 && expiredLantern(prev) < 0) {
      this.log({ ev: 'lantern_expired', level: next.level.id, attempt: this.attempt, tile: placed.step });
      const c = this.board.center(expired);
      this.time.delayedCall(500, () => this.tip('fade', { x: c.x, y: c.y - this.board.cell * 0.4 }, 'above'));
    }
    // Серия без отмен: с третьего хода подряд — искры на дороге и нарастающая нота.
    this.cleanRun++;
    if (this.cleanRun >= 3 && next.status === 'playing') {
      const n = this.cleanRun - 2;
      this.time.delayedCall(280, () => {
        this.board.sparkle(next, n);
        sfx.streak(n);
      });
    }
    this.tweens.add({
      targets: card,
      x: headPos.x,
      y: headPos.y,
      scale: 0.3,
      alpha: 0,
      duration: 180,
      ease: 'Quad.in',
      onComplete: () => {
        this.board.setRoad(next, newCells, () => this.board.updateLanterns(next));
        if (action.type === 'place') {
          this.dealInto(card, next.tray[action.slot], finish);
        } else {
          card.setTile(null, false, next.dir, false);
          card.setPosition(card.homeX, card.homeY).setScale(card.baseScale).setAlpha(1);
          this.time.delayedCall(120, finish);
        }
      },
    });
  }

  /** Стрелки поворачиваются вместе с дорогой: вспышка над плитками лотка и реплика Lumo. */
  private explainTurn() {
    if (this.state.status !== 'playing') return;
    const g = this.add.graphics().setDepth(11).setBlendMode(Phaser.BlendModes.ADD);
    for (const card of this.cards) {
      if (!card.visible) continue;
      g.lineStyle(10, C.lanternOn, 1);
      g.strokeRoundedRect(card.homeX - CARD / 2 - 10, this.trayY - CARD / 2 - 10, CARD + 20, CARD + 20, CARD * 0.24);
    }
    this.tweens.add({ targets: g, alpha: { from: 1, to: 0 }, duration: 700, repeat: 2, yoyo: true, onComplete: () => g.destroy() });
    // Иконки ещё раз «докручиваются» на глазах у игрока.
    for (const card of this.cards) this.tweens.add({ targets: card, scale: 1.08, duration: 200, yoyo: true, repeat: 1 });
    this.tip('turn', { x: this.L.slotX[1], y: this.trayY - CARD / 2 - 10 }, 'above');
  }

  /** Новая плитка приезжает из колоды в слот. */
  private dealInto(card: TileCard, kind: TileKind | null, done: () => void) {
    card.setTile(kind, canPlace(this.state, kind), this.state.dir, false);
    if (!kind) {
      card.setVisible(false).setPosition(card.homeX, card.homeY).setScale(1).setAlpha(1);
      done();
      return;
    }
    card.setVisible(true).setPosition(this.L.deckX, this.trayY).setScale(0.6).setAlpha(1);
    this.tweens.add({ targets: card, x: card.homeX, y: card.homeY, scale: 1, duration: 230, ease: 'Back.out', onComplete: done });
  }

  private resetCards() {
    this.cards.forEach((c) => c.setPosition(c.homeX, c.homeY).setScale(1).setAlpha(1));
    for (const sc of [this.stashCard, this.stashCard2]) sc.setPosition(sc.homeX, sc.homeY).setScale(sc.baseScale).setAlpha(1);
  }

  private onUndo() {
    if (this.busy || !canUndo(this.state)) return;
    this.state = undo(this.state);
    this.cleanRun = 0;
    this.ended = false;
    this.activeHint = null;
    this.closeOverlay();
    sfx.undo();
    this.board.setRoad(this.state);
    this.resetCards();
    this.refresh();
  }

  // -------------------------------------------------------------------------
  // Конец уровня

  private elapsed() {
    return Date.now() - this.t0;
  }

  /** Итог попытки для лога (и аналитики): звёзды, плиток осталось (у бесконечной колоды — нет), подсказки, отмены. */
  private attemptStats(stars: number): Pick<LogEvent, 'stars' | 'tilesLeft' | 'hints' | 'undos'> {
    const s = this.state;
    return { stars, tilesLeft: isInfinite(s.level) ? undefined : tilesLeft(s), hints: this.hintsUsed, undos: s.undosUsed };
  }

  private logAbandon() {
    if (this.ended) return;
    this.logFog();
    this.log({ ev: 'abandon', level: this.state.level.id, attempt: this.attempt, ms: this.elapsed(), moves: this.state.moves, ...this.attemptStats(0) });
    this.ended = true;
  }

  private leave(scene: 'Menu' | 'Game', data: GameSceneData = {}) {
    this.logAbandon();
    sfx.tap();
    this.cameras.main.fadeOut(180, 11, 15, 39);
    this.cameras.main.once('camerafadeoutcomplete', () => this.go(scene, data));
  }

  /** Перейти на сцену; свой уровень из редактора вместо меню возвращается в редактор. */
  private go(scene: 'Menu' | 'Game', data: GameSceneData = {}) {
    if (this.custom && scene === 'Menu') {
      this.scene.stop();
      this.game.events.emit(EDITOR_RETURN);
      return;
    }
    this.scene.start(scene, data);
  }

  private restart() {
    if (this.state.status === 'won') return;
    this.leave('Game', this.again());
  }

  private skipLevel() {
    const id = this.state.level.id;
    const next = nextLevelOf(this.level);
    this.logAbandon();
    if (!this.custom) recordSkip(id, next?.id ?? null);
    this.log({ ev: 'level_skipped', level: id, attempt: this.attempt, streak: this.streak });
    this.leave(next && !this.custom ? 'Game' : 'Menu', { levelIndex: this.levelIndex + 1 });
  }

  private onWin() {
    duckMusic(2);
    this.busy = true;
    this.ended = true;
    const s = this.state;
    const stars = starsFor(s);
    const ff = firefliesOnRoad(s);
    this.log({
      ev: 'win',
      level: s.level.id,
      attempt: this.attempt,
      ms: this.elapsed(),
      moves: s.moves,
      ...this.attemptStats(stars),
    });
    this.logFog();
    if (s.level.fireflies.length > 0) {
      this.log({ ev: 'fireflies_collected', level: s.level.id, attempt: this.attempt, fireflies: ff, firefliesTotal: s.level.fireflies.length });
    }
    const prog = this.custom ? null : loadProgress();
    const before = prog ? { stars: prog.stars[s.level.id] ?? 0, ff: prog.fireflies[s.level.id] ?? 0 } : null;
    this.reward = this.custom ? { coins: 0, light: 0, bonusCoins: 0, bonusLight: 0 } : recordWinRewards(s.level.id, stars, ff, nextLevelOf(s.level)?.id ?? null);
    this.challengeGift = this.custom ? null : challengeReward(s.level.id);
    // Межуровневая реклама: счётчик пройденных уровней (обучение и уровни до 15 не считаются).
    if (!this.custom) onLevelWin(s.level.num, isTutorialActive(s.level.num));
    if (before) {
      // Задания жителей: победа, звёзды, светлячки, улучшенный результат, механики уровня.
      const improved = before.stars > 0 && (stars > before.stars || ff > before.ff);
      this.questsDone = questEvent({ type: 'win', stars, fireflies: ff, improved, hint: this.usedHint, night: s.level.night, turnbridge: s.level.turnBridges.length > 0, fade: s.level.fades.length > 0 });
    }
    this.hideHints();
    this.stopPulse(this.hintBtn);
    this.tweens.add({ targets: [...this.cards, this.stashCard, this.stashCard2, ...this.previews], alpha: 0.25, duration: 300 });
    this.board.walkLumo(
      s,
      (i) => sfx.step(i),
      (n) => sfx.lantern(n),
      () => {
        sfx.win();
        // Короткая пауза: игрок видит поле, залитое светом, — и только потом окно победы.
        this.time.delayedCall(700, () => this.showWinPanel(stars));
      },
    );
  }

  private onLose() {
    this.ended = true;
    const s = this.state;
    this.streak = this.custom ? this.streak + 1 : recordLoss(s.level.id);
    this.log({ ev: 'lose', level: s.level.id, attempt: this.attempt, ms: this.elapsed(), moves: s.moves, streak: this.streak, ...this.attemptStats(0) });
    this.logFog();
    if (this.streak >= STUCK.pulseHint) this.pulse(this.hintBtn);
    // Тень догнала — сначала показываем бросок и надпись «Тень настигла!», потом «Почти!».
    const caught = lossReason(s) === 'shadow';
    if (caught) {
      this.time.delayedCall(700, () => {
        if (this.state !== s) return;
        const c = this.board.center(s.head);
        const banner = text(this, W / 2, c.y - this.board.cell * 0.9, t('shadow_caught'), 64, '#e8d8ff', true, { w: W - 120 }).setDepth(30);
        banner.setStroke('#0b0f27', 10).setScale(0.6).setAlpha(0);
        this.tweens.add({ targets: banner, scale: 1, alpha: 1, duration: 260, ease: 'Back.out' });
        this.tweens.add({ targets: banner, alpha: 0, duration: 300, delay: 900, onComplete: () => banner.destroy() });
      });
    }
    this.time.delayedCall(caught ? 1900 : 450, () => {
      if (this.state !== s) return;
      sfx.lose();
      this.showLosePanel();
      // Второе «Почти!» за день — предложить стартовый набор (не чаще раза в 3 дня, не больше 3 раз).
      if (!this.custom && starterOfferAfterAlmost(canShowModal())) {
        const o = this.overlay;
        modalOpened();
        this.time.delayedCall(1200, () => {
          if (!o || this.overlay !== o) return modalClosed();
          showStarterOffer(this, 'almost', () => modalClosed());
        });
      }
      // Тупик — подсказка «Заново» (один раз за игру).
      // Облачко под кнопкой «Заново», чтобы не закрывать главную кнопку окна.
      if (this.loseRestartPos) this.time.delayedCall(500, () => this.overlay && this.tip('restart', { x: this.loseRestartPos!.x, y: this.loseRestartPos!.y + 58 }, 'below'));
    });
  }

  private makeOverlay(kind: 'win' | 'lose' | 'rollback', panelH: number) {
    this.closeOverlay();
    const o = this.add.container(0, 0).setDepth(40);
    o.setData('kind', kind);
    const dim = this.add.rectangle(W / 2, H / 2, W * 4, H * 4, 0x060818, 0.6).setInteractive();
    const panel = this.add.graphics();
    const pw = 880;
    const py = H / 2 - panelH / 2;
    panel.fillStyle(0x000000, 0.35);
    panel.fillRoundedRect(W / 2 - pw / 2, py + 14, pw, panelH, 60);
    panel.fillStyle(C.panel, 1);
    panel.fillRoundedRect(W / 2 - pw / 2, py, pw, panelH, 60);
    panel.lineStyle(6, C.cardEdge, 1);
    panel.strokeRoundedRect(W / 2 - pw / 2, py, pw, panelH, 60);
    o.add([dim, panel]);
    o.setAlpha(0);
    this.tweens.add({ targets: o, alpha: 1, duration: 220 });
    this.overlay = o;
    return { o, top: py };
  }

  private closeOverlay() {
    this.overlay?.destroy();
    this.overlay = undefined;
  }

  private showWinPanel(stars: number) {
    const isLast = !this.custom && !nextLevelOf(this.level);
    const ffTotal = this.state.level.fireflies.length;
    const rewardRow = this.reward.coins + this.reward.bonusCoins > 0 || this.reward.light + this.reward.bonusLight > 0 ? 90 : 0;
    // «×2 монеты за ролик»: только монеты за уровень (без бонусов деревни и без света), один раз за победу.
    const doubleCoins = !this.custom && this.reward.coins > 0 && rewardedReady() ? this.reward.coins : 0;
    const adRow = doubleCoins ? 150 : 0;
    const ffRow = (ffTotal > 0 ? 90 : 0) + rewardRow + adRow;
    const { o, top: top0 } = this.makeOverlay('win', 910 + ffRow);
    // Строка светлячков встаёт под звёздами — кнопки ниже на её высоту.
    const top = top0;
    // Аватарка игрока — значком на верхнем краю окна.
    o.add(createAvatarBadge(this, W / 2, top, 86, currentLook(), { selected: true, animate: true }).setData('avatarBadge', true));
    o.add(text(this, W / 2, top + 130, isLast ? t('all_lit') : this.custom ? t('custom_level') : t('level_n', { n: this.level.num }), isLast ? 56 : 46, C.textDim, true, { w: 860 }));
    o.add(text(this, W / 2, top + 205, t('passed'), 84, C.text, true, { w: 860 }));
    const starG = this.add.graphics();
    o.add(starG);
    const xs = [W / 2 - 190, W / 2, W / 2 + 190];
    const ys = [top + 400, top + 360, top + 400];
    xs.forEach((x, i) => drawShinyStar(starG, x, ys[i], 82, true));
    for (let i = 0; i < stars; i++) {
      const sg = this.add.graphics().setPosition(xs[i], ys[i]).setScale(0);
      drawShinyStar(sg, 0, 0, 86);
      o.add(sg);
      this.tweens.add({ targets: sg, scale: 1, duration: 380, delay: 300 + i * 260, ease: 'Back.out', onStart: () => sfx.star(i) });
    }
    if (ffTotal > 0) {
      const ff = firefliesOnRoad(this.state);
      const label = text(this, W / 2 + 30, top + 520, t('fireflies_count', { n: ff, total: ffTotal }), 46, ff === ffTotal ? '#c8ff7a' : C.text);
      const fg = this.add.graphics();
      drawFireflyIcon(fg, label.x - label.width / 2 - 45, top + 520, 26, ff > 0);
      o.add([fg, label]);
    }
    // Награда: монеты и свет (свет — только за улучшение лучшего результата).
    if (rewardRow) {
      const ry = top + 520 + (ffTotal > 0 ? 90 : 0);
      const parts: { icon: 'coin' | 'light'; n: number }[] = [];
      // Бонусы деревни (мельница, мост, колодец) — сразу в сумме.
      if (this.reward.coins + this.reward.bonusCoins > 0) parts.push({ icon: 'coin', n: this.reward.coins + this.reward.bonusCoins });
      if (this.reward.light + this.reward.bonusLight > 0) parts.push({ icon: 'light', n: this.reward.light + this.reward.bonusLight });
      const rg = this.add.graphics();
      o.add(rg);
      parts.forEach((p, i) => {
        const x = W / 2 + (i - (parts.length - 1) / 2) * 260;
        if (p.icon === 'coin') drawCoin(rg, x - 60, ry, 26);
        else drawLight(rg, x - 60, ry, 26);
        const label = text(this, x - 20, ry, t('plus_n', { n: p.n }), 48, p.icon === 'coin' ? '#ffd45a' : '#ffc65c').setOrigin(0, 0.5);
        o.add(label);
        label.setScale(0);
        this.tweens.add({ targets: label, scale: 1, duration: 300, delay: 1100 + i * 200, ease: 'Back.out' });
      });
    }
    // Последний обучающий уровень: обучение закончено — дальше экран уровней.
    const num = this.state.level.num;
    const tutorialEnd = !this.custom && isTutorialActive(num) && num === TUTORIAL_LAST_LEVEL;
    if (!this.custom && isTutorialActive(num)) logTutorialStep(`level_${num}_done`, this.state.level.id);
    if (tutorialEnd) completeTutorial();
    // Следующий уровень — в новом мире, куда игрок ещё не входил: сначала карта (там сцена входа в мир).
    const nextLv = this.custom ? null : nextLevelOf(this.level);
    const newWorld = !!nextLv && worldOf(nextLv).id !== worldOf(this.level).id && !hasEnteredWorld(worldOf(nextLv).id);
    const toMenu = isLast || tutorialEnd || !!this.custom || newWorld;
    // «Дальше» / «На карту»: между уровнями — редкая межуровневая реклама (правила — src/monetization/rules.ts).
    const adCtx = { levelNum: num, tutorial: !!this.custom || isTutorialActive(num), intro: !!slotOf(num)?.intro || (!!nextLv && !!slotOf(nextLv.num)?.intro), level: this.state.level.id };
    let leaving = false;
    const between = (go: () => void) => {
      if (leaving) return;
      leaving = true;
      if (this.custom) return go();
      interstitialThen(adCtx, go);
    };
    const next = () => between(() => (toMenu ? this.go('Menu') : this.go('Game', { levelIndex: this.levelIndex + 1 })));
    if (doubleCoins) {
      const ay = top + 610 + ffRow - adRow;
      const ad = rewardedRichButton(this, W / 2, ay, {
        place: 'double_coins',
        level: this.state.level.id,
        rich: t('double_coins_ad', { n: doubleCoins }),
        w: 520,
        h: 110,
        fontSize: 40,
        toastY: top - 70,
        onReward: () => {
          adDoubleCoins(this.state.level.id, doubleCoins);
          sfx.star(2);
          toast(this, t('double_coins_done', { n: doubleCoins }), top - 70);
        },
      });
      if (ad) o.add(ad);
    }
    const by = top + 610 + ffRow;
    o.add(new Button(this, W / 2, by, { w: 520, h: 140, icon: 'play', label: this.custom ? t('to_editor') : isLast ? t('menu') : t('next'), primary: true, onClick: next }));
    // Маленькие кнопки — заметно ниже главной, чтобы не слипались.
    o.add(new Button(this, W / 2 - 160, by + 185, { w: 120, h: 100, icon: 'restart', onClick: () => this.go('Game', this.again()) }));
    o.add(new Button(this, W / 2 + 160, by + 185, { w: 120, h: 100, icon: 'menu', onClick: () => between(() => this.go('Menu')) }));
    o.on('primary', next);
    // Задания жителей, выполненные этой победой, — короткое сообщение (забрать награду — в деревне).
    if (this.questsDone.length) {
      const n = this.questsDone.length;
      this.questsDone = [];
      this.time.delayedCall(1700, () => this.overlay === o && toast(this, t('quest_done_toast', { n }), top - 70));
    }
    // Испытание: окно награды — шаг улицы и расцвет постройки на выбор (или «подарок ждёт»).
    if (this.challengeGift) {
      const gift = this.challengeGift;
      this.challengeGift = null;
      modalOpened();
      this.time.delayedCall(1300, () => {
        if (this.overlay !== o) return modalClosed();
        this.events.once('shutdown', () => modalClosed());
        showBloomGift(this, { street: gift.street, coins: gift.coins, onClose: () => modalClosed() });
      });
    }
    // Стартовый набор: после уровня 20 (не чаще раза в 3 дня, не больше 3 раз, не при «Без рекламы»).
    if (!this.custom && !this.challengeGift && canShowModal() && starterOfferAfterWin(num)) {
      modalOpened();
      this.time.delayedCall(1800, () => {
        if (this.overlay !== o) return modalClosed();
        showStarterOffer(this, 'win', () => modalClosed());
      });
    }
    // После уровня 6 гостю один раз предлагаем войти или зарегистрироваться (можно «Позже»).
    // Не одновременно с другими окнами и не сразу после другого окна.
    if (!this.custom && authPromptDue(num, { promptAllowed: shouldPromptAuth({ configured: Account.configured, signedIn: !!Account.user }) })) {
      this.time.delayedCall(1500, () => {
        if (this.overlay !== o || !canShowModal()) return;
        markAuthPrompted();
        modalOpened();
        openAuthDialog('register', {
          intro: { title: t('save_progress_title'), text: t('save_progress_text') },
          later: true,
          onClose: () => modalClosed(),
        });
      });
    }
  }

  /** Экран «Почти!»: сколько фонарей зажжено, сколько осталось до выхода, +3 плитки, заново, отменить. */
  private showLosePanel() {
    const s = this.state;
    // «+3 плитки»: первый за попытку — бесплатно раз в день, потом от часовни, потом за ролик;
    // второй за попытку — только от часовни. Свой уровень из редактора — бесплатно, раз за попытку.
    const offer: Plus3Offer = this.custom
      ? this.extraUsed
        ? null
        : 'free'
      : plus3Offer({ usedInAttempt: this.extraUsed ? (this.chapelUsed ? 2 : 1) : 0, chapelUsedInAttempt: this.chapelUsed, freeToday: freePlus3Available(), chapelLeft: chapelAvailable() ? 1 : 0, adReady: rewardedReady() });
    const chapelPlus = offer === 'chapel';
    const extra = offer ? findExtraTiles(s, 3) : null;
    const showSkip = this.streak >= STUCK.skip;
    // «Сигнальные огни»: вместо фонарей (их на таких уровнях обычно нет) — костры «горит из всех».
    const fires = s.level.fires.length;
    const total = fires > 0 ? fires : s.level.lanterns.length;
    const lit = fires > 0 ? signalsLit(s) : lanternsOnRoad(s);
    const dist = distanceToExit(s);

    // Раскладка по вертикали считается заранее, чтобы панель была ровно по содержимому.
    // Тень догнала: пояснение в три строки — место под ним.
    const shadowLoss = lossReason(s) === 'shadow';
    const infoRel = (total > 0 ? 350 : 210) + (shadowLoss ? 90 : 0);
    const btnRel = infoRel + 150;
    const twoBig = !!extra || canUndo(s);
    const rowRel = btnRel + (twoBig ? 345 : 190);
    const panelH = (showSkip ? rowRel + 140 : rowRel) + 110;
    const { o, top } = this.makeOverlay('lose', panelH);
    o.add(text(this, W / 2, top + 100, t('almost'), 84, C.text, true, { w: 860 }));
    let y = top + 210;
    if (total > 0) {
      const g = this.add.graphics();
      const gap = 70;
      const x0 = W / 2 - ((total - 1) * gap) / 2;
      // Гаснущий фонарь, который погас, — снова не горит.
      if (fires > 0) s.level.fires.forEach((_, i) => this.drawFireIcon(g, x0 + i * gap, y, i < lit, 1.1));
      else s.level.lanterns.forEach((idx, i) => this.drawLanternIcon(g, x0 + i * gap, y, s.onRoad[idx] && (s.level.fade[idx] === 0 || fadeLeftAt(s, idx) > 0)));
      o.add(g);
      o.add(text(this, W / 2, y + 70, t(fires > 0 ? 'fires_lit' : 'lanterns_lit', { n: lit, total }), 44, C.text, false, { w: 860 }));
      y += 140;
    }
    // Дорога упёрлась в закрытую арку: объясняем, почему войти нельзя.
    const w = s.level.width;
    const facingExit =
      s.level.goal !== 'fireflies' &&
      (s.head % w) + DX[s.dir] === s.level.exit.x && Math.floor(s.head / w) + DY[s.dir] === s.level.exit.y && lanternsLeft(s) > 0;
    if (shadowLoss) {
      o.add(text(this, W / 2, y + 50, t('lose_shadow'), 44, '#d8c8ff', true, { w: 800, lines: 3 }));
    } else if (facingExit) {
      o.add(text(this, W / 2, y, t('tip_door_locked'), 46, '#ffd36b', true, { w: 860, lines: 2 }));
      this.board.shakeLock();
      this.log({ ev: 'door_locked_attempt', level: s.level.id, attempt: this.attempt });
    } else {
      o.add(text(this, W / 2, y, t(s.level.goal === 'fireflies' ? 'dist_firefly' : 'dist_exit', { n: dist }), 44, C.textDim, false, { w: 860, lines: 2 }));
    }

    const again = () => this.restart();
    const plus3 = () => {
      if (!extra) return;
      if (chapelPlus) {
        this.chapelUsed = true;
        spendChapel();
      } else if (offer === 'free' && !this.custom) spendFreePlus3();
      this.extraUsed = true;
      this.ended = false;
      this.state = extra.state;
      this.activeHint = null;
      this.log({ ev: 'extra_tiles', level: s.level.id, attempt: this.attempt, added: extra.kinds.length, rollback: extra.rollback || undefined });
      this.closeOverlay();
      sfx.stash();
      this.board.setRoad(this.state);
      this.resetCards();
      this.busy = true;
      let pending = this.cards.length;
      this.cards.forEach((card, i) =>
        this.time.delayedCall(i * 90, () =>
          this.dealInto(card, this.state.tray[i], () => {
            if (--pending === 0) {
              this.busy = false;
              this.refresh();
            }
          }),
        ),
      );
    };

    const btnY = top + btnRel;
    const undoable = canUndo(s);
    this.loseRestartPos = { x: W / 2, y: undoable || extra ? btnY + 175 : btnY };
    const undoPrimary = !extra && undoable;
    if (undoPrimary) {
      // Отмена без ограничений — самый короткий путь назад, она и главная кнопка.
      const back = () => this.onUndo();
      o.add(new Button(this, W / 2, btnY, { w: 560, h: 140, icon: 'undo', label: t('undo_move'), primary: true, onClick: back }));
      o.add(new Button(this, W / 2, btnY + 175, { w: 420, h: 110, icon: 'restart', label: t('again'), fontSize: 42, onClick: again }));
      o.on('primary', back);
    } else if (extra) {
      const big =
        offer === 'ad'
          ? rewardedButton(this, W / 2, btnY, { place: 'plus3', level: s.level.id, label: t('plus3_ad'), w: 560, h: 140, primary: true, toastY: top - 70, onReward: plus3 })
          : new Button(this, W / 2, btnY, { w: 560, h: 140, icon: 'plus', label: chapelPlus ? t('plus3_chapel') : t('plus3'), primary: true, onClick: plus3 });
      if (big) o.add(big);
      o.add(new Button(this, W / 2, btnY + 175, { w: 420, h: 110, icon: 'restart', label: t('again'), fontSize: 42, onClick: again }));
      // Ролик — только по нажатию: Enter / пробел здесь — «Заново».
      o.on('primary', offer === 'ad' ? again : plus3);
    } else {
      o.add(new Button(this, W / 2, btnY, { w: 560, h: 140, icon: 'restart', label: t('again'), primary: true, onClick: again }));
      o.on('primary', again);
    }
    const rowY = top + rowRel;
    if (undoable && !undoPrimary) o.add(new Button(this, W / 2 - 160, rowY, { w: 120, h: 100, icon: 'undo', onClick: () => this.onUndo() }));
    o.add(new Button(this, undoable && !undoPrimary ? W / 2 + 160 : W / 2, rowY, { w: 120, h: 100, icon: 'menu', onClick: () => this.leave('Menu') }));
    if (showSkip) {
      o.add(new Button(this, W / 2, rowY + 140, { w: 520, h: 100, icon: 'skip', label: t('skip_level'), fontSize: 36, onClick: () => this.skipLevel() }));
    }
  }
}
