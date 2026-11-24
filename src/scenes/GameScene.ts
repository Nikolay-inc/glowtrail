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
  tilesPlaced,
} from '../core/game';
import { easeDeck, findExtraTiles, findHint, nearestSolvable } from '../core/solver';
import type { Level, TileKind } from '../core/types';
import { LEVELS, nextLevelOf, numberInWorld } from '../levels/index';
import { sfx } from '../audio';
import { logEvent, lossStreak, recordLoss, recordSkip, recordWin, startAttempt, type LogEvent } from '../storage';
import { countHint, getProfile, markAuthPrompted, recordPlayDay, shouldPromptAuth } from '../profile';
import { Account } from '../cloud/account';
import { openAuthDialog } from '../ui/AuthDialog';
import { BoardView } from '../ui/BoardView';
import { addBackground, Button, createAvatarBadge, drawFireflyIcon, drawPortalIcon, drawStar, text } from '../ui/draw';
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
import { C, H, W } from '../ui/theme';
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

type SlotId = number | 'stash';

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

function plural(n: number, one: string, few: string, many: string) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

export class GameScene extends Phaser.Scene {
  private levelIndex = 0;
  /** Свой уровень из редактора: прогресс и лог не пишем, выход — обратно в редактор. */
  private custom: Level | null = null;
  private state!: GameState;
  private board!: BoardView;
  private cards: TileCard[] = [];
  private stashCard!: TileCard;
  private previews: MiniCard[] = [];
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
  /** Подсказка, которую игрок попросил кнопкой; держится до следующего хода. */
  private activeHint: Action | null = null;
  private extraUsed = false;
  private streak = 0;
  /** Ходов подряд без отмены (серия без ошибок). */
  private cleanRun = 0;
  /** Раскладка нижней панели: зависит от того, есть ли на уровне слот «отложить». */
  private L: TrayLayout = trayLayout(true);

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
    addBackground(this, { evening: !level.night });
    this.streak = this.custom ? 0 : lossStreak(level.id);

    // Верхняя панель: уровень и строка цели (арка + фонари «зажжено/всего»)
    new Button(this, 90, this.topY, { w: 130, h: 130, icon: 'menu', onClick: () => this.leave('Menu') });
    text(this, W / 2, this.topY - 22, this.custom ? 'Свой уровень' : `Уровень ${numberInWorld(level)}`, 50);
    this.badgesG = this.add.graphics().setDepth(1);
    this.goalText = text(this, 0, this.topY + 58, '', 40).setOrigin(0, 0.5).setDepth(2);
    this.ffText = text(this, 0, this.topY + 58, '', 40).setOrigin(0, 0.5).setDepth(2);
    this.undoBtn = new Button(this, 840, this.topY, { w: 130, h: 130, icon: 'undo', onClick: () => this.onUndo() });
    this.restartBtn = new Button(this, 990, this.topY, { w: 130, h: 130, icon: 'restart', onClick: () => this.restart() });

    recordPlayDay(); // если сессия перешла через полночь
    this.board = new BoardView(this, level, { x: 40, y: BOARD_Y - up, w: 1000, h: BOARD_H + up + down }, { avatar: getProfile().avatar, maxCell: 250, sound: true });

    // Лоток
    const slotsG = this.add.graphics();
    slotsG.fillStyle(0x000000, 0.22);
    slotsG.fillRoundedRect(this.L.slotX[0] - CARD / 2 - 24, this.trayY - CARD / 2 - 24, this.L.slotX[2] - this.L.slotX[0] + CARD + 48, CARD + 48, 50);
    for (const x of this.L.slotX) {
      slotsG.lineStyle(4, C.cardEdge, 0.25);
      slotsG.strokeRoundedRect(x - CARD / 2, this.trayY - CARD / 2, CARD, CARD, CARD * 0.2);
    }
    this.stashGlow = this.add.graphics().setDepth(9);
    this.stashCard = new TileCard(this, this.stashX, this.trayY, 'stash');
    // Слот «отложить» появляется с уровня, где его учат.
    this.stashCard.setVisible(level.allowStash);
    this.cards = this.L.slotX.map((x, i) => new TileCard(this, x, this.trayY, i));
    this.deckG = this.add.graphics();
    this.deckText = text(this, this.L.deckX, this.trayY + 8, '0', 56);
    this.previews = this.L.previewX.map((x) => new MiniCard(this, x, this.previewY, 72));

    // Нижняя панель: подсказка и (после серии поражений) пропуск уровня
    const showSkip = this.streak >= STUCK.skip;
    const hintX = showSkip ? W / 2 - 190 : W / 2;
    this.hintBtn = new Button(this, hintX, this.bottomY, { w: 340, h: 116, icon: 'bulb', label: 'Подсказка', fontSize: 40, onClick: () => this.onHint() });
    if (showSkip) {
      new Button(this, W / 2 + 190, this.bottomY, { w: 340, h: 116, icon: 'skip', label: 'Пропустить', fontSize: 40, onClick: () => this.skipLevel() });
    }

    this.hintRing = this.add.graphics().setDepth(9);
    this.tweens.add({ targets: this.hintRing, alpha: 0.25, duration: 600, yoyo: true, repeat: -1 });
    this.hand = this.add.text(0, 0, '👆', { fontSize: '120px' }).setOrigin(0.3, 0.05).setDepth(30).setVisible(false);

    this.tips = new TipManager(this);
    for (const card of [...this.cards, this.stashCard]) this.bindCard(card);
    this.input.on('pointermove', this.onPointerMove, this);
    this.input.on('pointerup', this.onPointerUp, this);
    this.input.keyboard?.on('keydown', this.onKey, this);
    // Игрок закрыл вкладку посреди уровня — всё равно запишем время попытки.
    const onHide = () => {
      if (this.ended) return;
      this.log({ ev: 'abandon', level: this.state.level.id, attempt: this.attempt, ms: this.elapsed(), moves: this.state.moves });
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
    this.state = createGame(level, deck, Math.floor(Math.random() * 2 ** 31));
    const m = level.metrics;
    this.attempt = this.custom ? 1 : startAttempt(level.id, { ...(m ? { rating: m.rating, trap: m.trap, roads: m.roads } : {}), goal_type: level.goal });
    if (extra > 0) this.log({ ev: 'auto_ease', level: level.id, attempt: this.attempt, added: extra, streak: this.streak });
    this.t0 = Date.now();
    this.board.setRoad(this.state);
    this.refresh(false);
    // Уровень появляется из темноты — свет расходится от фонаря Lumo.
    irisIn(this, this.board.lumo.x, this.board.lumo.y);
    if (this.streak >= STUCK.pulseHint) this.pulse(this.hintBtn);
    if (isTutorialActive(level.num)) logTutorialStep(`level_${level.num}_start`, level.id);
    // Новый элемент на уровне — сначала карточка правила с живой анимацией; потом карточка цели и подсказки.
    const rules = this.custom ? [] : pendingRules(level);
    if (rules.length) {
      this.time.delayedCall(650, () => {
        this.game.events.once(RULES_CLOSED, () => {
          this.showGoalCard();
          this.time.delayedCall(1950, () => this.startTips());
        });
        this.scene.launch('Rules', { cards: rules, from: 'Game' });
        this.scene.pause();
      });
    } else {
      this.time.delayedCall(650, () => this.showGoalCard());
      this.time.delayedCall(2600, () => this.startTips());
    }
    this.resetIdle();
    this.input.on('pointerdown', this.resetIdle, this);
    this.events.once('shutdown', () => this.input.off('pointerdown', this.resetIdle, this));
    if (this.state.status === 'lost') this.onLose();
  }

  // -------------------------------------------------------------------------
  // Цель уровня и подсказки Lumo

  /** Карточка цели на 1,5 с: «Доведи Lumo до двери», «Зажги все фонари: N». Тап закрывает раньше. */
  private showGoalCard() {
    if (this.state.status !== 'playing') return;
    const n = this.state.level.lanterns.length;
    const ff = this.state.level.fireflies.length;
    const rows: { icon: 'portal' | 'lantern' | 'firefly'; label: string }[] = [];
    if (this.state.level.goal === 'fireflies') {
      // Цель «светлячки»: двери нет, нужно собрать всех.
      rows.push({ icon: 'firefly', label: t('goal_all_fireflies', { n: ff }) });
    } else {
      rows.push({ icon: 'portal', label: t('goal_door') });
      if (n > 0) rows.push({ icon: 'lantern', label: t('goal_lanterns', { n }) });
      if (ff > 0) rows.push({ icon: 'firefly', label: t('goal_fireflies', { n: ff }) });
    }
    const h = 90 + rows.length * 110;
    const c = this.add.container(W / 2, 780).setDepth(35);
    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.35);
    g.fillRoundedRect(-400, -h / 2 + 10, 800, h, 50);
    g.fillStyle(C.panel, 0.96);
    g.fillRoundedRect(-400, -h / 2, 800, h, 50);
    g.lineStyle(6, C.primary, 0.9);
    g.strokeRoundedRect(-400, -h / 2, 800, h, 50);
    c.add(g);
    rows.forEach((r, i) => {
      const y = -h / 2 + 100 + i * 110;
      const ig = this.add.graphics();
      if (r.icon === 'portal') drawPortalIcon(ig, -300, y, 32, false);
      else if (r.icon === 'firefly') drawFireflyIcon(ig, -300, y, 30, true);
      else this.drawLanternIcon(ig, -300, y + 4, true, 1.5);
      c.add(ig);
      c.add(text(this, -230, y, r.label, 52).setOrigin(0, 0.5));
    });
    c.setAlpha(0).setScale(0.8);
    this.goalCard = c;
    this.tweens.add({ targets: c, alpha: 1, scale: 1, duration: 280, ease: 'Back.out' });
    const hide = () => {
      if (this.goalCard !== c) return;
      this.goalCard = undefined;
      this.tweens.add({ targets: c, alpha: 0, scale: 0.9, y: 740, duration: 300, onComplete: () => c.destroy() });
    };
    this.time.delayedCall(1800, hide);
    this.input.once('pointerdown', hide);
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
    // Две неудачи подряд — показываем, где подсказка.
    if (this.streak >= STUCK.pulseHint) this.tip('hint', { x: this.hintBtn.x, y: this.bottomY - 58 }, 'above');
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
      if (this.state.status === 'playing' && !this.overlay && !this.busy) this.tip('hint', { x: this.hintBtn.x, y: this.bottomY - 58 }, 'above');
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
    const next = upcoming(s, 2);
    this.previews.forEach((p, i) => p.setTile(next[i] ?? null, s.dir, animate));
    this.drawDeck();
    this.undoBtn.setEnabled(canUndo(s));
    this.hintBtn.setAlpha(playing ? 1 : 0.45);
    this.drawBadges();
    this.board.setHead(s);
    this.board.updateLanterns(s);
    this.board.updateFireflies(s);
    this.updateHints();
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
    const lit = n - lanternsLeft(this.state);
    const ff = firefliesOnRoad(this.state);
    this.goalText.setText(n > 0 ? `${lit}/${n}` : '');
    this.ffText.setText(ffTotal > 0 ? `${ff}/${ffTotal}` : '');
    // Ширина строки: арка, [фонарь + текст], [светлячок + текст].
    const lanternW = n > 0 ? 30 + 50 + this.goalText.width : 0;
    const ffW = ffTotal > 0 ? 40 + 50 + this.ffText.width : 0;
    const door = level.goal === 'classic';
    const total = (door ? 44 : -40) + lanternW + ffW;
    let x = W / 2 - total / 2;
    if (door) {
      drawPortalIcon(g, x + 22, y, 22, open);
      x += 44;
    } else x -= 40; // цель «светлячки»: арки нет, в строке цели только светлячки
    if (n > 0) {
      this.drawLanternIcon(g, x + 66, y + 4, lit === n);
      this.goalText.setX(x + 96).setColor(lit === n ? '#ffd36b' : C.text);
      x += lanternW;
    }
    if (ffTotal > 0) {
      drawFireflyIcon(g, x + 76, y, 20, ff > 0);
      this.ffText.setX(x + 106).setColor(ff === ffTotal ? '#c8ff7a' : C.text);
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
    const key = `${JSON.stringify(hint)}|${s.moves}|${s.deckIndex}|${s.stash}`;
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
      this.ring(this.stashX, this.trayY);
      this.showHandDrag(this.stashX, this.trayY, head.x, head.y);
      this.board.showGhost(s, previewTile(s, s.stash!), 'hint');
      return;
    }
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

  private onHint() {
    if (this.busy || this.overlay || this.state.status !== 'playing') return;
    if (this.activeHint) return; // подсказка уже показана
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

  /** Подсказки бесплатные и без ограничений — просто записываем в лог. */
  private spendHint(rollback: number) {
    this.log({ ev: 'hint_used', level: this.state.level.id, attempt: this.attempt, rollback: rollback || undefined });
    countHint();
    this.stopPulse(this.hintBtn);
    sfx.tap();
  }

  private showRollbackPanel(steps: number, onConfirm: () => void) {
    const { o, top } = this.makeOverlay('rollback', 600);
    const confirm = () => {
      this.closeOverlay();
      onConfirm();
    };
    o.add(text(this, W / 2, top + 110, 'Отсюда не дойти', 64));
    o.add(text(this, W / 2, top + 200, `Вернуться на ${steps} ${plural(steps, 'ход', 'хода', 'ходов')} назад?`, 44, C.textDim, false));
    o.add(new Button(this, W / 2, top + 350, { w: 520, h: 140, icon: 'undo', label: 'Вернуться', primary: true, onClick: confirm }));
    o.add(new Button(this, W / 2, top + 500, { w: 300, h: 100, label: 'Нет', fontSize: 40, onClick: () => this.closeOverlay() }));
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
      if (!card.kind && card.slot !== 'stash') return;
      const press: Press = { slot: card.slot, card, x0: p.worldX, y0: p.worldY, dragging: false };
      if (card.kind) press.timer = this.time.delayedCall(220, () => this.previewSlot(card.slot));
      this.press = press;
      this.tweens.add({ targets: card, scale: 1.07, duration: 90 });
    });
  }

  private kindAt(slot: SlotId): TileKind | null {
    return slot === 'stash' ? this.state.stash : this.state.tray[slot];
  }

  private previewSlot(slot: SlotId) {
    const kind = this.kindAt(slot);
    this.board.showGhost(this.state, kind ? previewTile(this.state, kind) : null);
  }

  private overStash(x: number, y: number) {
    return Math.abs(x - this.stashX) < CARD * 0.75 && Math.abs(y - this.trayY) < CARD * 0.9;
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
      if (typeof pr.slot === 'number' && this.overStash(p.worldX, p.worldY)) {
        this.stashGlow.lineStyle(10, C.lanternOn, 0.9);
        this.stashGlow.strokeRoundedRect(this.stashX - CARD / 2 - 12, this.trayY - CARD / 2 - 12, CARD + 24, CARD + 24, CARD * 0.25);
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
    this.tweens.add({ targets: pr.card, scale: 1, duration: 90 });
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
        if (this.overStash(p.worldX, p.worldY)) {
          this.doAction(this.state.stash === null ? { type: 'stash', slot: pr.slot } : { type: 'swap', slot: pr.slot });
          return;
        }
        snapBack();
        return;
      }
      // Отложенную плитку перетащили: на плитку лотка — обмен, вверх на поле — поставить.
      const slot = this.traySlotAt(p.worldX, p.worldY);
      if (slot >= 0 && this.state.tray[slot]) {
        this.doAction({ type: 'swap', slot });
        return;
      }
      if (p.worldY < this.trayY - CARD * 0.75) {
        pr.card.setPosition(pr.card.homeX, pr.card.homeY);
        this.tryPlace('stash', 'drag');
        return;
      }
      snapBack();
      return;
    }
    if (!pr.card.isInside(p.worldX, p.worldY, 40)) return;
    if (pr.slot === 'stash') this.tapStash();
    else this.tryPlace(pr.slot);
  }

  /** Тап по слоту «отложить»: пустой — убрать туда крайнюю левую плитку, занятый — поменять с ней. */
  private tapStash() {
    if (this.busy || this.state.status !== 'playing') return;
    const slot = leftmostTile(this.state);
    if (this.state.stash === null) {
      if (slot < 0) return;
      this.doAction({ type: 'stash', slot });
    } else {
      this.doAction({ type: 'swap', slot: slot < 0 ? 0 : slot });
    }
  }

  private onKey(e: KeyboardEvent) {
    if (e.target instanceof HTMLInputElement) return; // печатают имя
    if (this.overlay) {
      if (e.key === 'Enter' || e.key === ' ') this.overlay.emit('primary');
      return;
    }
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
    this.doAction(slot === 'stash' ? { type: 'placeStash' } : { type: 'place', slot });
  }

  private invalid(slot: SlotId) {
    const card = slot === 'stash' ? this.stashCard : this.cards[slot];
    sfx.invalid();
    const kind = this.kindAt(slot);
    if (kind) {
      const p = previewTile(this.state, kind);
      this.board.showGhost(this.state, p);
      this.explainBlock(p);
    }
    this.tweens.killTweensOf(card);
    card.setPosition(card.homeX, card.homeY).setScale(1);
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

    if (action.type === 'stash') {
      const card = this.cards[action.slot];
      sfx.stash();
      this.tweens.add({
        targets: card,
        x: this.stashX,
        y: this.trayY,
        duration: 200,
        ease: 'Quad.out',
        onComplete: () => {
          this.stashCard.setTile(next.stash, false, next.dir, false);
          this.tweens.add({ targets: this.stashCard, scale: { from: 1.15, to: 1 }, duration: 200, ease: 'Back.out' });
          this.dealInto(card, next.tray[action.slot], finish);
        },
      });
      return;
    }

    if (action.type === 'swap') {
      const card = this.cards[action.slot];
      sfx.stash();
      this.tweens.add({ targets: card, x: this.stashX, y: this.trayY, duration: 220, ease: 'Quad.inOut' });
      this.tweens.add({
        targets: this.stashCard,
        x: card.homeX,
        y: card.homeY,
        duration: 220,
        ease: 'Quad.inOut',
        onComplete: () => {
          card.setPosition(card.homeX, card.homeY);
          this.stashCard.setPosition(this.stashX, this.trayY);
          card.setTile(next.tray[action.slot], false, next.dir, false);
          this.stashCard.setTile(next.stash, false, next.dir, false);
          finish();
        },
      });
      return;
    }

    // Плитка улетает на конец дороги, дорога вырастает.
    const headPos = this.board.center(next.head);
    const card = action.type === 'place' ? this.cards[action.slot] : this.stashCard;
    const newCells = next.road.length - prev.road.length;
    const placed = next.road[next.road.length - 1];
    if (placed.kind === 'jump') this.log({ ev: 'tile_jump_used', level: next.level.id, attempt: this.attempt, tile: placed.step });
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
          card.setPosition(card.homeX, card.homeY).setScale(1).setAlpha(1);
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
    this.stashCard.setPosition(this.stashX, this.trayY).setScale(1).setAlpha(1);
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

  private logAbandon() {
    if (this.ended) return;
    this.log({ ev: 'abandon', level: this.state.level.id, attempt: this.attempt, ms: this.elapsed(), moves: this.state.moves });
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
      stars,
      tilesLeft: isInfinite(s.level) ? undefined : tilesLeft(s),
      undos: s.undosUsed,
    });
    if (s.level.fireflies.length > 0) {
      this.log({ ev: 'fireflies_collected', level: s.level.id, attempt: this.attempt, fireflies: ff, firefliesTotal: s.level.fireflies.length });
    }
    if (!this.custom) recordWin(s.level.id, stars, nextLevelOf(s.level)?.id ?? null, ff);
    this.hideHints();
    this.stopPulse(this.hintBtn);
    this.tweens.add({ targets: [...this.cards, this.stashCard, ...this.previews], alpha: 0.25, duration: 300 });
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
    this.log({ ev: 'lose', level: s.level.id, attempt: this.attempt, ms: this.elapsed(), moves: s.moves, streak: this.streak });
    if (this.streak >= STUCK.pulseHint) this.pulse(this.hintBtn);
    this.time.delayedCall(450, () => {
      if (this.state !== s) return;
      sfx.lose();
      this.showLosePanel();
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
    const ffRow = ffTotal > 0 ? 90 : 0;
    const { o, top: top0 } = this.makeOverlay('win', 910 + ffRow);
    // Строка светлячков встаёт под звёздами — кнопки ниже на её высоту.
    const top = top0;
    // Аватарка игрока — значком на верхнем краю окна.
    o.add(createAvatarBadge(this, W / 2, top, 86, getProfile().avatar, { selected: true, animate: true }).setData('avatarBadge', true));
    o.add(text(this, W / 2, top + 130, isLast ? 'Все фонари зажжены!' : this.custom ? 'Свой уровень' : `Уровень ${numberInWorld(this.level)}`, isLast ? 56 : 46, C.textDim));
    o.add(text(this, W / 2, top + 205, 'Пройден!', 84));
    const starG = this.add.graphics();
    o.add(starG);
    const xs = [W / 2 - 190, W / 2, W / 2 + 190];
    const ys = [top + 400, top + 360, top + 400];
    xs.forEach((x, i) => drawStar(starG, x, ys[i], 82, C.starEmpty));
    for (let i = 0; i < stars; i++) {
      const sg = this.add.graphics().setPosition(xs[i], ys[i]).setScale(0);
      drawStar(sg, 0, 0, 86, C.star);
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
    // Последний обучающий уровень: обучение закончено — дальше экран уровней.
    const num = this.state.level.num;
    const tutorialEnd = !this.custom && isTutorialActive(num) && num === TUTORIAL_LAST_LEVEL;
    if (!this.custom && isTutorialActive(num)) logTutorialStep(`level_${num}_done`, this.state.level.id);
    if (tutorialEnd) completeTutorial();
    const toMenu = isLast || tutorialEnd || !!this.custom;
    const next = () => (toMenu ? this.go('Menu') : this.go('Game', { levelIndex: this.levelIndex + 1 }));
    const by = top + 610 + ffRow;
    o.add(new Button(this, W / 2, by, { w: 520, h: 140, icon: 'play', label: this.custom ? 'В редактор' : isLast ? 'Меню' : 'Дальше', primary: true, onClick: next }));
    // Маленькие кнопки — заметно ниже главной, чтобы не слипались.
    o.add(new Button(this, W / 2 - 160, by + 185, { w: 120, h: 100, icon: 'restart', onClick: () => this.go('Game', this.again()) }));
    o.add(new Button(this, W / 2 + 160, by + 185, { w: 120, h: 100, icon: 'menu', onClick: () => this.go('Menu') }));
    o.on('primary', next);
    // После уровня 6 гостю один раз предлагаем войти или зарегистрироваться (можно «Позже»).
    // Не одновременно с другими окнами и не сразу после другого окна.
    if (!this.custom && authPromptDue(num, { promptAllowed: shouldPromptAuth({ configured: Account.configured, signedIn: !!Account.user }) })) {
      this.time.delayedCall(1500, () => {
        if (this.overlay !== o || !canShowModal()) return;
        markAuthPrompted();
        modalOpened();
        openAuthDialog('register', {
          intro: { title: 'Сохрани прогресс', text: 'Зарегистрируйся или войди — звёзды и уровни сохранятся в облаке, и можно продолжить на любом устройстве.' },
          later: true,
          onClose: () => modalClosed(),
        });
      });
    }
  }

  /** Экран «Почти!»: сколько фонарей зажжено, сколько осталось до выхода, +3 плитки, заново, отменить. */
  private showLosePanel() {
    const s = this.state;
    const extra = this.extraUsed ? null : findExtraTiles(s, 3);
    const showSkip = this.streak >= STUCK.skip;
    const total = s.level.lanterns.length;
    const lit = lanternsOnRoad(s);
    const dist = distanceToExit(s);

    // Раскладка по вертикали считается заранее, чтобы панель была ровно по содержимому.
    const infoRel = total > 0 ? 350 : 210;
    const btnRel = infoRel + 150;
    const twoBig = !!extra || canUndo(s);
    const rowRel = btnRel + (twoBig ? 345 : 190);
    const panelH = (showSkip ? rowRel + 140 : rowRel) + 110;
    const { o, top } = this.makeOverlay('lose', panelH);
    o.add(text(this, W / 2, top + 100, 'Почти!', 84));
    let y = top + 210;
    if (total > 0) {
      const g = this.add.graphics();
      const gap = 70;
      const x0 = W / 2 - ((total - 1) * gap) / 2;
      // Гаснущий фонарь, который погас, — снова не горит.
      s.level.lanterns.forEach((idx, i) => this.drawLanternIcon(g, x0 + i * gap, y, s.onRoad[idx] && (s.level.fade[idx] === 0 || fadeLeftAt(s, idx) > 0)));
      o.add(g);
      o.add(text(this, W / 2, y + 70, `Фонари: ${lit} из ${total}`, 44, C.text, false));
      y += 140;
    }
    // Дорога упёрлась в закрытую арку: объясняем, почему войти нельзя.
    const w = s.level.width;
    const facingExit =
      s.level.goal === 'classic' &&
      (s.head % w) + DX[s.dir] === s.level.exit.x && Math.floor(s.head / w) + DY[s.dir] === s.level.exit.y && lanternsLeft(s) > 0;
    if (facingExit) {
      o.add(text(this, W / 2, y, t('tip_door_locked'), 46, '#ffd36b'));
      this.board.shakeLock();
      this.log({ ev: 'door_locked_attempt', level: s.level.id, attempt: this.attempt });
    } else {
      const what = s.level.goal === 'fireflies' ? 'До светлячка' : 'До выхода';
      o.add(text(this, W / 2, y, `${what}: ${dist} ${plural(dist, 'клетка', 'клетки', 'клеток')}`, 44, C.textDim, false));
    }

    const again = () => this.restart();
    const plus3 = () => {
      if (!extra) return;
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
      o.add(new Button(this, W / 2, btnY, { w: 560, h: 140, icon: 'undo', label: 'Отменить ход', primary: true, onClick: back }));
      o.add(new Button(this, W / 2, btnY + 175, { w: 420, h: 110, icon: 'restart', label: 'Заново', fontSize: 42, onClick: again }));
      o.on('primary', back);
    } else if (extra) {
      o.add(new Button(this, W / 2, btnY, { w: 560, h: 140, icon: 'plus', label: '+3 плитки', primary: true, onClick: plus3 }));
      o.add(new Button(this, W / 2, btnY + 175, { w: 420, h: 110, icon: 'restart', label: 'Заново', fontSize: 42, onClick: again }));
      o.on('primary', plus3);
    } else {
      o.add(new Button(this, W / 2, btnY, { w: 560, h: 140, icon: 'restart', label: 'Заново', primary: true, onClick: again }));
      o.on('primary', again);
    }
    const rowY = top + rowRel;
    if (undoable && !undoPrimary) o.add(new Button(this, W / 2 - 160, rowY, { w: 120, h: 100, icon: 'undo', onClick: () => this.onUndo() }));
    o.add(new Button(this, undoable && !undoPrimary ? W / 2 + 160 : W / 2, rowY, { w: 120, h: 100, icon: 'menu', onClick: () => this.leave('Menu') }));
    if (showSkip) {
      o.add(new Button(this, W / 2, rowY + 140, { w: 520, h: 100, icon: 'skip', label: 'Пропустить уровень', fontSize: 36, onClick: () => this.skipLevel() }));
    }
  }
}
