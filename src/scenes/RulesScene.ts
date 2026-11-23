// Карточки правил поверх игры: заголовок, живая анимация на мини-поле (настоящая логика игры) и одна фраза.
// Запускается поверх уровня (перед первым знакомством с элементом) или из меню («Как играть» — все карточки).

import Phaser from 'phaser';
import { canPlace, createGame, previewTile, type GameState } from '../core/game';
import type { TileKind } from '../core/types';
import { sfx } from '../audio';
import { getProfile } from '../profile';
import { demoLevel, demoPlace, RULE_CARDS, type DemoPhase } from '../rules';
import { t } from '../strings';
import { markRulesSeen, restartTutorial, type RuleId } from '../tutorial';
import { BoardView } from '../ui/BoardView';
import { Button, text } from '../ui/draw';
import { C, FONT, H, W } from '../ui/theme';
import { TileCard } from '../ui/TileCard';

export interface RulesData {
  cards: RuleId[];
  /** Сцена, поверх которой показываем (она на паузе). */
  from: string;
  /** Из меню: показать ссылку «Пройти обучение с начала». */
  menuMode?: boolean;
  index?: number;
  phase?: number;
  loop?: number;
}

/** Событие на game.events, когда карточки закрыты. */
export const RULES_CLOSED = 'rules-closed';

const PANEL_W = 920;
const PANEL_H = 1330;

export class RulesScene extends Phaser.Scene {
  private data0!: RulesData;
  private board!: BoardView;
  private card!: TileCard;
  private finger!: Phaser.GameObjects.Text;
  private alive = false;

  constructor() {
    super('Rules');
  }

  init(data: RulesData) {
    this.data0 = { index: 0, phase: 0, loop: 0, ...data };
  }

  create() {
    const { cards, index = 0, phase = 0 } = this.data0;
    const rule = RULE_CARDS[cards[index]];
    const ph = rule.phases[phase % rule.phases.length];
    const top = H / 2 - PANEL_H / 2;
    this.alive = true;
    this.events.once('shutdown', () => (this.alive = false));

    this.add.rectangle(W / 2, H / 2, W, H, 0x04061a, 0.78).setInteractive();
    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.35);
    g.fillRoundedRect(W / 2 - PANEL_W / 2, top + 14, PANEL_W, PANEL_H, 60);
    g.fillStyle(C.panel, 1);
    g.fillRoundedRect(W / 2 - PANEL_W / 2, top, PANEL_W, PANEL_H, 60);
    g.lineStyle(6, C.primary, 0.9);
    g.strokeRoundedRect(W / 2 - PANEL_W / 2, top, PANEL_W, PANEL_H, 60);
    text(this, W / 2, top + 85, t(rule.title), 64);

    // Мини-поле: то же, что в игре, но без темноты — чтобы всё было хорошо видно.
    this.board = new BoardView(this, demoLevel(ph), { x: W / 2 - 390, y: top + 140, w: 780, h: 530 }, { avatar: getProfile().avatar, dark: false });
    this.card = new TileCard(this, W / 2, top + 770, 0);
    this.card.disableInteractive();
    this.card.setScale(0.8);
    this.finger = this.add.text(W / 2, top + 790, '👆', { fontSize: '96px' }).setOrigin(0.3, 0.05).setDepth(30).setAlpha(0);

    this.add
      .text(W / 2, top + 965, t(rule.text), { fontFamily: FONT, fontSize: '44px', color: C.text, align: 'center', wordWrap: { width: 780 } })
      .setOrigin(0.5, 0.5);

    // Точки: какая карточка из скольких
    if (cards.length > 1) {
      const dots = this.add.graphics();
      cards.forEach((_, i) => {
        dots.fillStyle(i === index ? C.primary : C.starEmpty, 1);
        dots.fillCircle(W / 2 + (i - (cards.length - 1) / 2) * 44, top + 1090, i === index ? 13 : 10);
      });
    }
    const last = index >= cards.length - 1;
    const next = () => (last ? this.close() : this.scene.restart({ ...this.data0, index: index + 1, phase: 0, loop: 0 }));
    new Button(this, W / 2, top + 1180, { w: 520, h: 130, label: last ? t('rule_ok') : t('rule_next'), primary: true, onClick: next });
    if (this.data0.menuMode && last) {
      const link = text(this, W / 2, top + 1280, t('rule_replay_tutorial'), 36, C.textDim, false).setInteractive({ useHandCursor: true });
      link.on('pointerup', () => {
        restartTutorial();
        this.scene.stop(this.data0.from);
        this.scene.start('Intro');
      });
    }
    this.input.keyboard?.once('keydown-ENTER', next);

    void this.runPhase(ph);
  }

  update(time: number) {
    this.board?.update(time);
  }

  /** Пауза на анимациях Phaser (не на таймерах) — шаги не расходятся с движением. */
  private wait(ms: number): Promise<void> {
    return new Promise((res) => this.tweens.addCounter({ from: 0, to: 1, duration: ms, onComplete: () => res() }));
  }

  /** Палец нажимает на плитку. */
  private async tap(kind: TileKind, state: GameState) {
    this.card.setTile(kind, canPlace(state, kind), state.dir, true);
    this.finger.setPosition(this.card.x, this.card.y + 30).setAlpha(1);
    await this.wait(350);
    if (!this.alive) return;
    this.tweens.add({ targets: this.finger, y: this.card.y + 5, duration: 150, yoyo: true });
    this.tweens.add({ targets: this.card, scale: 0.72, duration: 120, yoyo: true });
    await this.wait(300);
  }

  private async runPhase(ph: DemoPhase) {
    const loud = (this.data0.loop ?? 0) === 0; // звуки только при первом показе
    const level = demoLevel(ph);
    let state = createGame(level);
    this.board.setRoad(state);
    this.board.setHead(state);
    this.board.updateLanterns(state);
    await this.wait(700);
    for (const step of ph.steps) {
      if (!this.alive) return;
      if ('place' in step) {
        await this.tap(step.place, state);
        if (!this.alive) return;
        const next = demoPlace(state, step.place);
        const newCells = next.road.length - state.road.length;
        state = next;
        if (loud) sfx.place(state.road.length - 1);
        this.board.setRoad(state, newCells, () => this.alive && this.board.updateLanterns(state));
        this.board.setHead(state);
        await this.wait(650);
      } else if ('fail' in step) {
        await this.tap(step.fail, state);
        if (!this.alive) return;
        // Плитка не встаёт: красный крестик, у запертой двери вздрагивает замок.
        const p = previewTile(state, step.fail);
        this.board.showGhost(state, p);
        if (p.reason === 'exitClosed') this.board.shakeLock();
        if (loud) sfx.invalid();
        this.tweens.add({ targets: this.card, x: this.card.x + 14, duration: 45, yoyo: true, repeat: 3 });
        await this.wait(1400);
        if (!this.alive) return;
        this.board.showGhost(state, null);
      } else {
        await this.wait(300);
        if (!this.alive) return;
        state = createGame(level);
        this.board.setRoad(state);
        this.board.setHead(state);
        this.board.updateLanterns(state);
        await this.wait(500);
      }
    }
    if (!this.alive) return;
    this.finger.setAlpha(0);
    if (state.status === 'won') {
      await new Promise<void>((res) =>
        this.board.walkLumo(
          state,
          (i) => loud && sfx.step(i),
          (n) => loud && sfx.lantern(n),
          () => res(),
        ),
      );
    }
    await this.wait(900);
    if (!this.alive) return;
    // Следующая фаза (или эта же заново) — по кругу, пока игрок читает.
    const phases = RULE_CARDS[this.data0.cards[this.data0.index ?? 0]].phases.length;
    this.scene.restart({ ...this.data0, phase: ((this.data0.phase ?? 0) + 1) % phases, loop: (this.data0.loop ?? 0) + 1 });
  }

  private close() {
    markRulesSeen(this.data0.cards);
    sfx.tap();
    const from = this.data0.from;
    this.scene.resume(from);
    this.game.events.emit(RULES_CLOSED, from);
    this.scene.stop();
  }
}
