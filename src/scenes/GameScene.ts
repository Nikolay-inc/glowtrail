// Экран уровня: поле, лоток плиток, превью колоды, слот «отложить», отмена, подсказки,
// защита от застревания (+3 плитки, облегчение, пропуск уровня), победа и поражение.

import Phaser from 'phaser';
import {
  applyAction,
  canPlace,
  canUndo,
  createGame,
  deckLeft,
  distanceToExit,
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
} from '../core/game';
import { easeDeck, findExtraTiles, findHint, nearestSolvable } from '../core/solver';
import type { TileKind } from '../core/types';
import { LEVELS } from '../levels/index';
import { sfx } from '../audio';
import { logEvent, lossStreak, recordLoss, recordSkip, recordWin, startAttempt } from '../storage';
import { countHint, getProfile, recordPlayDay, shouldAskName } from '../profile';
import { showNameDialog } from '../ui/NameDialog';
import { BoardView } from '../ui/BoardView';
import { addBackground, Button, createAvatarBadge, drawStar, text } from '../ui/draw';
import { C, H, W } from '../ui/theme';
import { CARD, MiniCard, TileCard } from '../ui/TileCard';
import { trayLayout, type TrayLayout } from '../ui/layout';

const TOP_Y = 105;
const TRAY_Y = 1640;
const PREVIEW_Y = 1492;
const BOTTOM_Y = 1835;

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
  private hand!: Phaser.GameObjects.Text;
  private hintRing!: Phaser.GameObjects.Graphics;
  private stashGlow!: Phaser.GameObjects.Graphics;
  private press: Press | null = null;
  private busy = false;
  private ended = false;
  private attempt = 0;
  private t0 = 0;
  private overlay?: Phaser.GameObjects.Container;
  private hintKey = '';
  /** Подсказка, которую игрок попросил кнопкой; держится до следующего хода. */
  private activeHint: Action | null = null;
  private extraUsed = false;
  private streak = 0;
  /** Раскладка нижней панели: зависит от того, есть ли на уровне слот «отложить». */
  private L: TrayLayout = trayLayout(true);

  private get stashX() {
    return this.L.stashX ?? -CARD * 2;
  }

  constructor() {
    super('Game');
  }

  init(data: { levelIndex?: number }) {
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

  create() {
    const level = LEVELS[this.levelIndex];
    this.L = trayLayout(level.allowStash);
    addBackground(this);
    this.cameras.main.fadeIn(250, 11, 15, 39);
    this.streak = lossStreak(level.id);

    // Верхняя панель
    new Button(this, 90, TOP_Y, { w: 130, h: 130, icon: 'menu', onClick: () => this.leave('Menu') });
    text(this, W / 2, TOP_Y - 14, `Уровень ${level.id}`, 54);
    this.badgesG = this.add.graphics().setDepth(1);
    this.undoBtn = new Button(this, 840, TOP_Y, { w: 130, h: 130, icon: 'undo', onClick: () => this.onUndo() });
    this.restartBtn = new Button(this, 990, TOP_Y, { w: 130, h: 130, icon: 'restart', onClick: () => this.restart() });

    recordPlayDay(); // если сессия перешла через полночь
    this.board = new BoardView(this, level, { x: 40, y: 250, w: 1000, h: 1190 }, { avatar: getProfile().avatar });

    // Лоток
    const slotsG = this.add.graphics();
    slotsG.fillStyle(0x000000, 0.22);
    slotsG.fillRoundedRect(this.L.slotX[0] - CARD / 2 - 24, TRAY_Y - CARD / 2 - 24, this.L.slotX[2] - this.L.slotX[0] + CARD + 48, CARD + 48, 50);
    for (const x of this.L.slotX) {
      slotsG.lineStyle(4, C.cardEdge, 0.25);
      slotsG.strokeRoundedRect(x - CARD / 2, TRAY_Y - CARD / 2, CARD, CARD, CARD * 0.2);
    }
    this.stashGlow = this.add.graphics().setDepth(9);
    this.stashCard = new TileCard(this, this.stashX, TRAY_Y, 'stash');
    // Слот «отложить» появляется с уровня, где его учат.
    this.stashCard.setVisible(level.allowStash);
    this.cards = this.L.slotX.map((x, i) => new TileCard(this, x, TRAY_Y, i));
    this.deckG = this.add.graphics();
    this.deckText = text(this, this.L.deckX, TRAY_Y + 8, '0', 56);
    this.previews = this.L.previewX.map((x) => new MiniCard(this, x, PREVIEW_Y, 72));

    // Нижняя панель: подсказка и (после серии поражений) пропуск уровня
    const showSkip = this.streak >= STUCK.skip;
    const hintX = showSkip ? W / 2 - 190 : W / 2;
    this.hintBtn = new Button(this, hintX, BOTTOM_Y, { w: 340, h: 116, icon: 'bulb', label: 'Подсказка', fontSize: 40, onClick: () => this.onHint() });
    if (showSkip) {
      new Button(this, W / 2 + 190, BOTTOM_Y, { w: 340, h: 116, icon: 'skip', label: 'Пропустить', fontSize: 40, onClick: () => this.skipLevel() });
    }

    this.hintRing = this.add.graphics().setDepth(9);
    this.tweens.add({ targets: this.hintRing, alpha: 0.25, duration: 600, yoyo: true, repeat: -1 });
    this.hand = this.add.text(0, 0, '👆', { fontSize: '120px' }).setOrigin(0.3, 0.05).setDepth(30).setVisible(false);

    for (const card of [...this.cards, this.stashCard]) this.bindCard(card);
    this.input.on('pointermove', this.onPointerMove, this);
    this.input.on('pointerup', this.onPointerUp, this);
    this.input.keyboard?.on('keydown', this.onKey, this);
    // Игрок закрыл вкладку посреди уровня — всё равно запишем время попытки.
    const onHide = () => {
      if (this.ended) return;
      logEvent({ ev: 'abandon', level: this.state.level.id, attempt: this.attempt, ms: this.elapsed(), moves: this.state.moves });
      this.ended = true;
    };
    window.addEventListener('pagehide', onHide);
    this.events.once('shutdown', () => {
      window.removeEventListener('pagehide', onHide);
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
    this.attempt = startAttempt(level.id);
    if (extra > 0) logEvent({ ev: 'auto_ease', level: level.id, attempt: this.attempt, added: extra, streak: this.streak });
    this.t0 = Date.now();
    this.board.setRoad(this.state);
    this.refresh(false);
    if (this.streak >= STUCK.pulseHint) this.pulse(this.hintBtn);
    if (this.state.status === 'lost') this.onLose();
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
    this.updateHints();
  }

  private drawBadges() {
    const g = this.badgesG;
    g.clear();
    // Фонари уровня под заголовком: зажжённые — те, через которые уже прошла дорога.
    const level = this.state.level;
    const n = level.lanterns.length;
    const gap = 70;
    const x0 = W / 2 - ((n - 1) * gap) / 2;
    level.lanterns.forEach((idx, i) => this.drawLanternIcon(g, x0 + i * gap, TOP_Y + 62, this.state.onRoad[idx]));
  }

  private drawLanternIcon(g: Phaser.GameObjects.Graphics, x: number, y: number, on: boolean) {
    if (on) {
      g.fillStyle(C.lanternOn, 0.25);
      g.fillCircle(x, y, 30);
    }
    g.fillStyle(on ? C.lanternOn : C.lanternOff, on ? 1 : 0.7);
    g.fillRoundedRect(x - 14, y - 16, 28, 30, 7);
    g.fillStyle(C.post, 1);
    g.fillTriangle(x - 18, y - 15, x + 18, y - 15, x, y - 28);
    g.fillRect(x - 3, y + 14, 6, 12);
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
      const y = TRAY_Y - h / 2 - i * 10;
      g.fillStyle(0x000000, 0.25);
      g.fillRoundedRect(x, y + 8, w, h, 24);
      g.fillStyle(i === 0 ? C.card : 0x232b5e, 1);
      g.fillRoundedRect(x, y, w, h, 24);
      g.lineStyle(4, C.cardEdge, 0.8);
      g.strokeRoundedRect(x, y, w, h, 24);
    }
    if (n === 0) {
      g.lineStyle(4, C.cardEdge, 0.3);
      g.strokeRoundedRect(this.L.deckX - w / 2, TRAY_Y - h / 2, w, h, 24);
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
      this.showHandDrag(from.homeX, from.homeY, this.stashX, TRAY_Y);
      return;
    }
    if (hint.type === 'placeStash') {
      // Отложенную плитку ставят, перетащив её на поле.
      const head = this.board.center(s.head);
      this.ring(this.stashX, TRAY_Y);
      this.showHandDrag(this.stashX, TRAY_Y, head.x, head.y);
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
    logEvent({ ev: 'hint_used', level: this.state.level.id, attempt: this.attempt, rollback: rollback || undefined });
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
      const press: Press = { slot: card.slot, card, x0: p.x, y0: p.y, dragging: false };
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
    return Math.abs(x - this.stashX) < CARD * 0.75 && Math.abs(y - TRAY_Y) < CARD * 0.9;
  }

  private traySlotAt(x: number, y: number): number {
    return this.cards.findIndex((c) => c.isInside(x, y, 10));
  }

  private onPointerMove(p: Phaser.Input.Pointer) {
    const pr = this.press;
    if (!pr || !pr.card.kind) return;
    if (!pr.dragging && Phaser.Math.Distance.Between(p.x, p.y, pr.x0, pr.y0) > 28) {
      pr.dragging = true;
      pr.timer?.remove();
      this.previewSlot(pr.slot);
      pr.card.setDepth(25);
    }
    if (pr.dragging) {
      pr.card.setPosition(p.x, p.y - 30);
      this.stashGlow.clear();
      if (typeof pr.slot === 'number' && this.overStash(p.x, p.y)) {
        this.stashGlow.lineStyle(10, C.lanternOn, 0.9);
        this.stashGlow.strokeRoundedRect(this.stashX - CARD / 2 - 12, TRAY_Y - CARD / 2 - 12, CARD + 24, CARD + 24, CARD * 0.25);
      }
    }
  }

  private onPointerUp(p: Phaser.Input.Pointer) {
    const pr = this.press;
    if (!pr) return;
    this.press = null;
    pr.timer?.remove();
    this.stashGlow.clear();
    pr.card.setDepth(10);
    this.tweens.add({ targets: pr.card, scale: 1, duration: 90 });
    if (!p.wasTouch && pr.card.isInside(p.x, p.y)) this.previewSlot(pr.slot);
    else this.board.showGhost(this.state, null);

    const snapBack = () => this.tweens.add({ targets: pr.card, x: pr.card.homeX, y: pr.card.homeY, duration: 200, ease: 'Back.out' });

    if (pr.dragging) {
      if (typeof pr.slot === 'number') {
        // Плитку лотка бросили на слот «отложить»: в пустой — отложить, в занятый — обменять.
        if (this.overStash(p.x, p.y)) {
          this.doAction(this.state.stash === null ? { type: 'stash', slot: pr.slot } : { type: 'swap', slot: pr.slot });
          return;
        }
        if (pr.card.isInside(p.x, p.y, 20)) {
          pr.card.setPosition(pr.card.homeX, pr.card.homeY);
          this.tryPlace(pr.slot);
          return;
        }
        snapBack();
        return;
      }
      // Отложенную плитку перетащили: на плитку лотка — обмен, вверх на поле — поставить.
      const slot = this.traySlotAt(p.x, p.y);
      if (slot >= 0 && this.state.tray[slot]) {
        this.doAction({ type: 'swap', slot });
        return;
      }
      if (p.y < TRAY_Y - CARD * 0.75) {
        pr.card.setPosition(pr.card.homeX, pr.card.homeY);
        this.tryPlace('stash');
        return;
      }
      snapBack();
      return;
    }
    if (!pr.card.isInside(p.x, p.y, 40)) return;
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

  private tryPlace(slot: SlotId) {
    if (this.busy || this.state.status !== 'playing') return;
    const kind = this.kindAt(slot);
    if (!kind) return;
    if (!canPlace(this.state, kind)) {
      this.invalid(slot);
      return;
    }
    this.doAction(slot === 'stash' ? { type: 'placeStash' } : { type: 'place', slot });
  }

  private invalid(slot: SlotId) {
    const card = slot === 'stash' ? this.stashCard : this.cards[slot];
    sfx.invalid();
    const kind = this.kindAt(slot);
    if (kind) this.board.showGhost(this.state, previewTile(this.state, kind));
    this.tweens.killTweensOf(card);
    card.setPosition(card.homeX, card.homeY).setScale(1);
    this.tweens.add({ targets: card, x: card.homeX + 14, duration: 45, yoyo: true, repeat: 3 });
    this.time.delayedCall(650, () => {
      if (!this.press) this.board.showGhost(this.state, null);
    });
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
    this.hideHints();
    this.board.showGhost(next, null);

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
        y: TRAY_Y,
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
      this.tweens.add({ targets: card, x: this.stashX, y: TRAY_Y, duration: 220, ease: 'Quad.inOut' });
      this.tweens.add({
        targets: this.stashCard,
        x: card.homeX,
        y: card.homeY,
        duration: 220,
        ease: 'Quad.inOut',
        onComplete: () => {
          card.setPosition(card.homeX, card.homeY);
          this.stashCard.setPosition(this.stashX, TRAY_Y);
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
    sfx.place(next.road.length - 1);
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

  /** Новая плитка приезжает из колоды в слот. */
  private dealInto(card: TileCard, kind: TileKind | null, done: () => void) {
    card.setTile(kind, canPlace(this.state, kind), this.state.dir, false);
    if (!kind) {
      card.setVisible(false).setPosition(card.homeX, card.homeY).setScale(1).setAlpha(1);
      done();
      return;
    }
    card.setVisible(true).setPosition(this.L.deckX, TRAY_Y).setScale(0.6).setAlpha(1);
    this.tweens.add({ targets: card, x: card.homeX, y: card.homeY, scale: 1, duration: 230, ease: 'Back.out', onComplete: done });
  }

  private resetCards() {
    this.cards.forEach((c) => c.setPosition(c.homeX, c.homeY).setScale(1).setAlpha(1));
    this.stashCard.setPosition(this.stashX, TRAY_Y).setScale(1).setAlpha(1);
  }

  private onUndo() {
    if (this.busy || !canUndo(this.state)) return;
    this.state = undo(this.state);
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
    logEvent({ ev: 'abandon', level: this.state.level.id, attempt: this.attempt, ms: this.elapsed(), moves: this.state.moves });
    this.ended = true;
  }

  private leave(scene: 'Menu' | 'Game', data: object = {}) {
    this.logAbandon();
    sfx.tap();
    this.cameras.main.fadeOut(180, 11, 15, 39);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start(scene, data));
  }

  private restart() {
    if (this.state.status === 'won') return;
    this.leave('Game', { levelIndex: this.levelIndex });
  }

  private skipLevel() {
    const id = this.state.level.id;
    this.logAbandon();
    recordSkip(id, LEVELS.length);
    logEvent({ ev: 'level_skipped', level: id, attempt: this.attempt, streak: this.streak });
    const isLast = this.levelIndex >= LEVELS.length - 1;
    this.leave(isLast ? 'Menu' : 'Game', { levelIndex: this.levelIndex + 1 });
  }

  private onWin() {
    this.busy = true;
    this.ended = true;
    const s = this.state;
    const stars = starsFor(s);
    logEvent({
      ev: 'win',
      level: s.level.id,
      attempt: this.attempt,
      ms: this.elapsed(),
      moves: s.moves,
      stars,
      tilesLeft: isInfinite(s.level) ? undefined : tilesLeft(s),
      undos: s.undosUsed,
    });
    recordWin(s.level.id, stars, LEVELS.length);
    this.hideHints();
    this.stopPulse(this.hintBtn);
    this.tweens.add({ targets: [...this.cards, this.stashCard, ...this.previews], alpha: 0.25, duration: 300 });
    this.board.walkLumo(
      s,
      (i) => sfx.step(i),
      (n) => sfx.lantern(n),
      () => {
        sfx.win();
        this.showWinPanel(stars);
      },
    );
  }

  private onLose() {
    this.ended = true;
    const s = this.state;
    this.streak = recordLoss(s.level.id);
    logEvent({ ev: 'lose', level: s.level.id, attempt: this.attempt, ms: this.elapsed(), moves: s.moves, streak: this.streak });
    if (this.streak >= STUCK.pulseHint) this.pulse(this.hintBtn);
    this.time.delayedCall(450, () => {
      if (this.state !== s) return;
      sfx.lose();
      this.showLosePanel();
    });
  }

  private makeOverlay(kind: 'win' | 'lose' | 'rollback', panelH: number) {
    this.closeOverlay();
    const o = this.add.container(0, 0).setDepth(40);
    o.setData('kind', kind);
    const dim = this.add.rectangle(W / 2, H / 2, W, H, 0x060818, 0.6).setInteractive();
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
    const isLast = this.levelIndex >= LEVELS.length - 1;
    const { o, top } = this.makeOverlay('win', 860);
    // Аватарка игрока — значком на верхнем краю окна.
    o.add(createAvatarBadge(this, W / 2, top, 86, getProfile().avatar, { selected: true, animate: true }).setData('avatarBadge', true));
    o.add(text(this, W / 2, top + 130, isLast ? 'Все фонари зажжены!' : `Уровень ${this.state.level.id}`, isLast ? 56 : 46, C.textDim));
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
    const next = () => (isLast ? this.scene.start('Menu') : this.scene.start('Game', { levelIndex: this.levelIndex + 1 }));
    o.add(new Button(this, W / 2, top + 610, { w: 520, h: 140, icon: 'play', label: isLast ? 'Меню' : 'Дальше', primary: true, onClick: next }));
    o.add(new Button(this, W / 2 - 160, top + 750, { w: 120, h: 100, icon: 'restart', onClick: () => this.scene.start('Game', { levelIndex: this.levelIndex }) }));
    o.add(new Button(this, W / 2 + 160, top + 750, { w: 120, h: 100, icon: 'menu', onClick: () => this.scene.start('Menu') }));
    o.on('primary', next);
    // Мягкое знакомство: после уровня 3 спрашиваем имя и аватарку (можно пропустить).
    if (shouldAskName(this.state.level.id)) {
      this.time.delayedCall(1500, () => {
        if (this.overlay !== o) return;
        showNameDialog(this, { title: 'Как тебя зовут?', withAvatars: true, secondary: 'skip', onClose: () => this.refreshWinAvatar(o, top) });
      });
    }
  }

  /** После знакомства аватарка в окне победы могла смениться. */
  private refreshWinAvatar(o: Phaser.GameObjects.Container, top: number) {
    if (this.overlay !== o) return;
    const old = o.list.find((c) => c.getData?.('avatarBadge'));
    old?.destroy();
    const badge = createAvatarBadge(this, W / 2, top, 86, getProfile().avatar, { selected: true, animate: true });
    badge.setData('avatarBadge', true);
    o.add(badge);
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
    const rowRel = btnRel + (twoBig ? 290 : 170);
    const panelH = (showSkip ? rowRel + 130 : rowRel) + 110;
    const { o, top } = this.makeOverlay('lose', panelH);
    o.add(text(this, W / 2, top + 100, 'Почти!', 84));
    let y = top + 210;
    if (total > 0) {
      const g = this.add.graphics();
      const gap = 70;
      const x0 = W / 2 - ((total - 1) * gap) / 2;
      s.level.lanterns.forEach((idx, i) => this.drawLanternIcon(g, x0 + i * gap, y, s.onRoad[idx]));
      o.add(g);
      o.add(text(this, W / 2, y + 70, `Фонари: ${lit} из ${total}`, 44, C.text, false));
      y += 140;
    }
    o.add(text(this, W / 2, y, `До выхода: ${dist} ${plural(dist, 'клетка', 'клетки', 'клеток')}`, 44, C.textDim, false));

    const again = () => this.restart();
    const plus3 = () => {
      if (!extra) return;
      this.extraUsed = true;
      this.ended = false;
      this.state = extra.state;
      this.activeHint = null;
      logEvent({ ev: 'extra_tiles', level: s.level.id, attempt: this.attempt, added: extra.kinds.length, rollback: extra.rollback || undefined });
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
    const undoPrimary = !extra && undoable;
    if (undoPrimary) {
      // Отмена без ограничений — самый короткий путь назад, она и главная кнопка.
      const back = () => this.onUndo();
      o.add(new Button(this, W / 2, btnY, { w: 560, h: 140, icon: 'undo', label: 'Отменить ход', primary: true, onClick: back }));
      o.add(new Button(this, W / 2, btnY + 160, { w: 420, h: 110, icon: 'restart', label: 'Заново', fontSize: 42, onClick: again }));
      o.on('primary', back);
    } else if (extra) {
      o.add(new Button(this, W / 2, btnY, { w: 560, h: 140, icon: 'plus', label: '+3 плитки', primary: true, onClick: plus3 }));
      o.add(new Button(this, W / 2, btnY + 160, { w: 420, h: 110, icon: 'restart', label: 'Заново', fontSize: 42, onClick: again }));
      o.on('primary', plus3);
    } else {
      o.add(new Button(this, W / 2, btnY, { w: 560, h: 140, icon: 'restart', label: 'Заново', primary: true, onClick: again }));
      o.on('primary', again);
    }
    const rowY = top + rowRel;
    if (undoable && !undoPrimary) o.add(new Button(this, W / 2 - 160, rowY, { w: 120, h: 100, icon: 'undo', onClick: () => this.onUndo() }));
    o.add(new Button(this, undoable && !undoPrimary ? W / 2 + 160 : W / 2, rowY, { w: 120, h: 100, icon: 'menu', onClick: () => this.leave('Menu') }));
    if (showSkip) {
      o.add(new Button(this, W / 2, rowY + 130, { w: 520, h: 100, icon: 'skip', label: 'Пропустить уровень', fontSize: 36, onClick: () => this.skipLevel() }));
    }
  }
}
