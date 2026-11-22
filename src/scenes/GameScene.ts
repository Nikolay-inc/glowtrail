// Экран уровня: поле, лоток плиток, слот «отложить», отмена, победа и поражение.

import Phaser from 'phaser';
import {
  applyAction,
  canPlace,
  canUndo,
  createGame,
  deckLeft,
  previewTile,
  starsFor,
  tilesLeft,
  undo,
  type Action,
  type GameState,
} from '../core/game';
import { findHint } from '../core/solver';
import type { TileKind } from '../core/types';
import { LEVELS } from '../levels/index';
import { sfx } from '../audio';
import { logEvent, recordWin, startAttempt } from '../storage';
import { BoardView } from '../ui/BoardView';
import { addBackground, Button, drawStar, text } from '../ui/draw';
import { C, H, W } from '../ui/theme';
import { CARD, TileCard } from '../ui/TileCard';

const TOP_Y = 105;
const TRAY_Y = 1640;
const SLOT_X = [400, 610, 820];
const STASH_X = 150;
const DECK_X = 990;

type SlotId = number | 'stash';

interface Press {
  slot: SlotId;
  card: TileCard;
  x0: number;
  y0: number;
  dragging: boolean;
  timer?: Phaser.Time.TimerEvent;
}

export class GameScene extends Phaser.Scene {
  private levelIndex = 0;
  private state!: GameState;
  private board!: BoardView;
  private cards: TileCard[] = [];
  private stashCard!: TileCard;
  private deckG!: Phaser.GameObjects.Graphics;
  private deckText!: Phaser.GameObjects.Text;
  private undoBtn!: Button;
  private undoBadge!: Phaser.GameObjects.Text;
  private restartBtn!: Button;
  private lanternIcons!: Phaser.GameObjects.Graphics;
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

  constructor() {
    super('Game');
  }

  init(data: { levelIndex?: number }) {
    this.levelIndex = Phaser.Math.Clamp(data.levelIndex ?? 0, 0, LEVELS.length - 1);
    this.cards = [];
    this.press = null;
    this.busy = false;
    this.ended = false;
    this.overlay = undefined;
    this.hintKey = '';
  }

  create() {
    const level = LEVELS[this.levelIndex];
    addBackground(this);
    this.cameras.main.fadeIn(250, 11, 15, 39);

    // Верхняя панель
    new Button(this, 90, TOP_Y, { w: 130, h: 130, icon: 'menu', onClick: () => this.leave('Menu') });
    text(this, W / 2, TOP_Y - 14, `Уровень ${level.id}`, 54);
    this.lanternIcons = this.add.graphics().setDepth(1);
    this.undoBtn = new Button(this, 840, TOP_Y, { w: 130, h: 130, icon: 'undo', onClick: () => this.onUndo() });
    this.undoBadge = text(this, 840 + 52, TOP_Y - 52, '1', 32, '#2a1a05').setDepth(2);
    this.restartBtn = new Button(this, 990, TOP_Y, { w: 130, h: 130, icon: 'restart', onClick: () => this.restart() });

    this.board = new BoardView(this, level, { x: 40, y: 250, w: 1000, h: 1200 });

    // Лоток
    const slotsG = this.add.graphics();
    slotsG.fillStyle(0x000000, 0.22);
    slotsG.fillRoundedRect(SLOT_X[0] - CARD / 2 - 24, TRAY_Y - CARD / 2 - 24, SLOT_X[2] - SLOT_X[0] + CARD + 48, CARD + 48, 50);
    for (const x of SLOT_X) {
      slotsG.lineStyle(4, C.cardEdge, 0.25);
      slotsG.strokeRoundedRect(x - CARD / 2, TRAY_Y - CARD / 2, CARD, CARD, CARD * 0.2);
    }
    this.stashGlow = this.add.graphics().setDepth(9);
    this.stashCard = new TileCard(this, STASH_X, TRAY_Y, 'stash');
    this.cards = SLOT_X.map((x, i) => new TileCard(this, x, TRAY_Y, i));
    this.deckG = this.add.graphics();
    this.deckText = text(this, DECK_X, TRAY_Y + 8, '0', 56);

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

    this.state = createGame(level);
    this.attempt = startAttempt(level.id);
    this.t0 = Date.now();
    this.board.setRoad(this.state);
    this.refresh(false);
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
    this.drawDeck();
    this.undoBtn.setEnabled(canUndo(s));
    this.undoBadge.setText(String(s.undoLeft)).setAlpha(s.undoLeft > 0 ? 1 : 0.4);
    this.drawUndoBadge();
    this.drawLanternIcons();
    this.board.setHead(s);
    this.board.updateLanterns(s);
    this.updateHints();
  }

  private drawUndoBadge() {
    // Кружок под цифрой счётчика отмен
    const g = this.lanternIcons;
    g.clear();
    g.fillStyle(this.state.undoLeft > 0 ? C.primary : C.starEmpty, 1);
    g.fillCircle(840 + 52, TOP_Y - 52, 26);
  }

  private drawLanternIcons() {
    const level = this.state.level;
    const n = level.lanterns.length;
    if (!n) return;
    const g = this.lanternIcons;
    const gap = 70;
    const x0 = W / 2 - ((n - 1) * gap) / 2;
    level.lanterns.forEach((idx, i) => {
      const on = this.state.onRoad[idx];
      const x = x0 + i * gap;
      const y = TOP_Y + 62;
      if (on) {
        g.fillStyle(C.lanternOn, 0.25);
        g.fillCircle(x, y, 30);
      }
      g.fillStyle(on ? C.lanternOn : C.lanternOff, on ? 1 : 0.7);
      g.fillRoundedRect(x - 14, y - 16, 28, 30, 7);
      g.fillStyle(C.post, 1);
      g.fillTriangle(x - 18, y - 15, x + 18, y - 15, x, y - 28);
      g.fillRect(x - 3, y + 14, 6, 12);
    });
  }

  private drawDeck() {
    const n = deckLeft(this.state);
    const g = this.deckG;
    g.clear();
    const w = 120;
    const h = 150;
    const layers = Math.min(3, n);
    for (let i = layers - 1; i >= 0; i--) {
      const x = DECK_X - w / 2 + i * 8;
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
      g.strokeRoundedRect(DECK_X - w / 2, TRAY_Y - h / 2, w, h, 24);
    }
    this.deckText.setText(String(n)).setAlpha(n ? 1 : 0.35);
  }

  // -------------------------------------------------------------------------
  // Подсказки обучения (без текста)

  private updateHints() {
    const level = this.state.level;
    const s = this.state;
    if (!level.tutorial || s.status !== 'playing' || this.busy) {
      this.hideHints();
      return;
    }
    const hint = findHint(s);
    const key = JSON.stringify(hint) + s.moves;
    if (key === this.hintKey) return;
    this.hintKey = key;
    this.hideHints();
    if (!hint) {
      // Тупик впереди — мягко подсвечиваем «отменить» или «заново».
      const btn = canUndo(s) ? this.undoBtn : this.restartBtn;
      this.tweens.add({ targets: btn, scale: 1.15, duration: 450, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
      return;
    }
    if (hint.type === 'stash') {
      const from = this.cards[hint.slot];
      this.showHandDrag(from.homeX, from.homeY, STASH_X, TRAY_Y);
      this.ring(from.homeX, from.homeY);
      return;
    }
    if (level.tutorial !== 'place') return;
    const card = hint.type === 'place' ? this.cards[hint.slot] : this.stashCard;
    this.ring(card.homeX, card.homeY);
    this.showHandTap(card.homeX, card.homeY);
    this.board.showGhost(s, previewTile(s, card.kind!), 'hint');
  }

  private hideHints() {
    this.tweens.killTweensOf(this.hand);
    this.hand.setVisible(false);
    this.hintRing.clear();
    this.board.showGhost(this.state, null, 'hint');
    for (const b of [this.undoBtn, this.restartBtn]) {
      this.tweens.killTweensOf(b);
      b.setScale(1);
    }
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

  // -------------------------------------------------------------------------
  // Ввод: тап — поставить, долгое нажатие / наведение — предпросмотр, перетаскивание в слот — отложить

  private bindCard(card: TileCard) {
    card.on('pointerover', (p: Phaser.Input.Pointer) => {
      if (!p.wasTouch && !this.press && !this.busy) this.previewSlot(card.slot);
    });
    card.on('pointerout', (p: Phaser.Input.Pointer) => {
      if (!p.wasTouch && !this.press) this.board.showGhost(this.state, null);
    });
    card.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (this.busy || this.overlay || this.state.status !== 'playing' || !card.kind) return;
      const press: Press = { slot: card.slot, card, x0: p.x, y0: p.y, dragging: false };
      press.timer = this.time.delayedCall(220, () => this.previewSlot(card.slot));
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

  private canStashNow() {
    return this.state.stash === null && this.state.status === 'playing';
  }

  private overStash(x: number, y: number) {
    return Math.abs(x - STASH_X) < CARD * 0.75 && Math.abs(y - TRAY_Y) < CARD * 0.9;
  }

  private onPointerMove(p: Phaser.Input.Pointer) {
    const pr = this.press;
    if (!pr) return;
    if (!pr.dragging && pr.slot !== 'stash' && Phaser.Math.Distance.Between(p.x, p.y, pr.x0, pr.y0) > 28) {
      pr.dragging = true;
      pr.timer?.remove();
      this.previewSlot(pr.slot);
      pr.card.setDepth(25);
    }
    if (pr.dragging) {
      pr.card.setPosition(p.x, p.y - 30);
      this.stashGlow.clear();
      if (this.canStashNow() && this.overStash(p.x, p.y)) {
        this.stashGlow.lineStyle(10, C.lanternOn, 0.9);
        this.stashGlow.strokeRoundedRect(STASH_X - CARD / 2 - 12, TRAY_Y - CARD / 2 - 12, CARD + 24, CARD + 24, CARD * 0.25);
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

    if (pr.dragging) {
      if (typeof pr.slot === 'number' && this.canStashNow() && this.overStash(p.x, p.y)) {
        this.doAction({ type: 'stash', slot: pr.slot });
        return;
      }
      if (pr.card.isInside(p.x, p.y, 20)) {
        pr.card.setPosition(pr.card.homeX, pr.card.homeY);
        this.tryPlace(pr.slot);
        return;
      }
      this.tweens.add({ targets: pr.card, x: pr.card.homeX, y: pr.card.homeY, duration: 200, ease: 'Back.out' });
      return;
    }
    if (pr.card.isInside(p.x, p.y, 40)) this.tryPlace(pr.slot);
  }

  private onKey(e: KeyboardEvent) {
    if (this.overlay) {
      if (e.key === 'Enter' || e.key === ' ') this.overlay.emit('primary');
      return;
    }
    if (['1', '2', '3'].includes(e.key)) this.tryPlace(Number(e.key) - 1);
    else if (e.key === '0' || e.key === 's') this.tryPlace('stash');
    else if (e.key === 'z' || e.key === 'я') this.onUndo();
    else if (e.key === 'r' || e.key === 'к') this.restart();
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
    this.hideHints();
    this.board.showGhost(next, null);

    const headPos = this.board.center(next.head);
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
        x: STASH_X,
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

    // Плитка улетает на конец дороги, дорога вырастает.
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
        this.board.setRoad(next, newCells, () => {
          this.board.updateLanterns(next);
        });
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
    card.setVisible(true).setPosition(DECK_X, TRAY_Y).setScale(0.6).setAlpha(1);
    this.tweens.add({ targets: card, x: card.homeX, y: card.homeY, scale: 1, duration: 230, ease: 'Back.out', onComplete: done });
  }

  private onUndo() {
    if (this.busy || !canUndo(this.state)) return;
    const prev = this.state;
    this.state = undo(prev);
    this.ended = false;
    this.closeOverlay();
    sfx.undo();
    this.board.setRoad(this.state);
    this.cards.forEach((c) => c.setPosition(c.homeX, c.homeY).setScale(1).setAlpha(1));
    this.stashCard.setPosition(STASH_X, TRAY_Y).setScale(1).setAlpha(1);
    this.refresh();
  }

  // -------------------------------------------------------------------------
  // Конец уровня

  private elapsed() {
    return Date.now() - this.t0;
  }

  private leave(scene: 'Menu' | 'Game', data: object = {}) {
    if (!this.ended) {
      logEvent({ ev: 'abandon', level: this.state.level.id, attempt: this.attempt, ms: this.elapsed(), moves: this.state.moves });
      this.ended = true;
    }
    sfx.tap();
    this.cameras.main.fadeOut(180, 11, 15, 39);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start(scene, data));
  }

  private restart() {
    if (this.state.status === 'won') return;
    this.leave('Game', { levelIndex: this.levelIndex });
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
      tilesLeft: tilesLeft(s),
      undo: s.undoLeft === 0,
    });
    recordWin(s.level.id, stars, LEVELS.length);
    this.hideHints();
    this.tweens.add({ targets: [...this.cards, this.stashCard], alpha: 0.25, duration: 300 });
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
    logEvent({ ev: 'lose', level: s.level.id, attempt: this.attempt, ms: this.elapsed(), moves: s.moves });
    this.time.delayedCall(450, () => {
      if (this.state.status !== 'lost') return;
      sfx.lose();
      this.showLosePanel(tilesLeft(s) === 0);
    });
  }

  private makeOverlay(kind: 'win' | 'lose', panelH: number) {
    this.closeOverlay();
    const o = this.add.container(0, 0).setDepth(40);
    o.setData('kind', kind);
    const dim = this.add.rectangle(W / 2, H / 2, W, H, 0x060818, 0.6).setInteractive();
    const panel = this.add.graphics();
    const pw = 860;
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
    const { o, top } = this.makeOverlay('win', 820);
    o.add(text(this, W / 2, top + 110, isLast ? 'Все фонари зажжены!' : `Уровень ${this.state.level.id}`, isLast ? 60 : 50, C.textDim));
    o.add(text(this, W / 2, top + 190, 'Пройден!', 84));
    const starG = this.add.graphics();
    o.add(starG);
    const xs = [W / 2 - 190, W / 2, W / 2 + 190];
    const ys = [top + 380, top + 340, top + 380];
    xs.forEach((x, i) => drawStar(starG, x, ys[i], 82, C.starEmpty));
    for (let i = 0; i < stars; i++) {
      const sg = this.add.graphics().setPosition(xs[i], ys[i]).setScale(0);
      drawStar(sg, 0, 0, 86, C.star);
      o.add(sg);
      this.tweens.add({ targets: sg, scale: 1, duration: 380, delay: 300 + i * 260, ease: 'Back.out', onStart: () => sfx.star(i) });
    }
    const next = () => (isLast ? this.scene.start('Menu') : this.scene.start('Game', { levelIndex: this.levelIndex + 1 }));
    o.add(new Button(this, W / 2, top + 560, { w: 520, h: 140, icon: 'play', label: isLast ? 'Меню' : 'Дальше', primary: true, onClick: next }));
    o.add(new Button(this, W / 2 - 160, top + 700, { w: 120, h: 100, icon: 'restart', onClick: () => this.scene.start('Game', { levelIndex: this.levelIndex }) }));
    o.add(new Button(this, W / 2 + 160, top + 700, { w: 120, h: 100, icon: 'menu', onClick: () => this.scene.start('Menu') }));
    o.on('primary', next);
  }

  private showLosePanel(noTiles: boolean) {
    const { o, top } = this.makeOverlay('lose', 680);
    o.add(text(this, W / 2, top + 120, noTiles ? 'Плитки кончились' : 'Тупик', 76));
    o.add(text(this, W / 2, top + 210, 'Попробуй по-другому', 42, C.textDim, false));
    const again = () => this.restart();
    o.add(new Button(this, W / 2, top + 380, { w: 520, h: 140, icon: 'restart', label: 'Заново', primary: true, onClick: again }));
    if (canUndo(this.state)) {
      o.add(new Button(this, W / 2 - 160, top + 530, { w: 120, h: 100, icon: 'undo', onClick: () => this.onUndo() }));
    }
    o.add(new Button(this, canUndo(this.state) ? W / 2 + 160 : W / 2, top + 530, { w: 120, h: 100, icon: 'menu', onClick: () => this.leave('Menu') }));
    o.on('primary', again);
  }
}
