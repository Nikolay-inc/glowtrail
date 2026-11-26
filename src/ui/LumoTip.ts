// Подсказки Lumo: облачко с лицом фонарщика и стрелкой на элемент. Одна за раз, закрывается тапом.
// Подсказка с id показывается один раз за всю игру (запоминается в сохранении); реплики без id —
// короткая реакция на действие (например, «Сначала зажги все фонари») и исчезают сами.

import { currentLook } from './skins';
import Phaser from 'phaser';
import { hasSeenTip, markTipSeen, type TipId } from '../tutorial';
import { createLumo } from './draw';
import { C, FONT, W } from './theme';

export interface TipOptions {
  /** Подсказка из обучения: показывается один раз. Без id — реплика, можно повторять. */
  id?: TipId;
  text: string;
  /** Куда указывает стрелка. */
  target: { x: number; y: number };
  /** Облачко над целью или под ней. */
  side?: 'above' | 'below';
  /** Через сколько мс закрыть само (реплики). Без значения — висит до тапа или следующего хода. */
  autoCloseMs?: number;
  /** Вызывается, когда облачко появилось (например, подсветить элемент). */
  onShow?: () => void;
  onClose?: () => void;
}

const PAD = 34;
const ARROW = 30;
const MARGIN = 24;

export class TipManager {
  private current: { opts: TipOptions; node: Phaser.GameObjects.Container; timer?: Phaser.Time.TimerEvent } | null = null;
  private queue: TipOptions[] = [];

  constructor(private scene: Phaser.Scene) {
    scene.events.once('shutdown', () => {
      this.queue = [];
      this.current = null;
    });
  }

  get visible(): boolean {
    return this.current !== null;
  }

  /** Показать подсказку (или поставить в очередь, если сейчас видна другая). Возвращает, будет ли она показана. */
  show(opts: TipOptions): boolean {
    if (opts.id && (hasSeenTip(opts.id) || this.queue.some((q) => q.id === opts.id) || this.current?.opts.id === opts.id)) return false;
    if (this.current) {
      // Реплика заменяет другую реплику, а подсказки обучения ждут своей очереди.
      if (!opts.id && !this.current.opts.id) this.dismiss();
      else {
        if (opts.id) this.queue.push(opts);
        return !!opts.id;
      }
    }
    this.open(opts);
    return true;
  }

  /** Закрыть текущую подсказку (тап, ход игрока) и показать следующую из очереди. */
  dismiss() {
    const cur = this.current;
    if (!cur) return;
    this.current = null;
    cur.timer?.remove();
    this.scene.tweens.add({ targets: cur.node, alpha: 0, scale: 0.9, duration: 160, onComplete: () => cur.node.destroy() });
    cur.opts.onClose?.();
    const next = this.queue.shift();
    if (next) this.scene.time.delayedCall(250, () => this.show(next));
  }

  /** Закрыть только реплику (подсказки обучения остаются до тапа). */
  dismissTransient() {
    if (this.current && !this.current.opts.id) this.dismiss();
  }

  private open(opts: TipOptions) {
    const scene = this.scene;
    if (opts.id) markTipSeen(opts.id);
    const side = opts.side ?? 'above';

    const label = scene.add.text(0, 0, opts.text, {
      fontFamily: FONT,
      fontSize: '40px',
      color: '#2a1a05',
      fontStyle: 'bold',
      wordWrap: { width: 600 },
      align: 'left',
    });
    const face = 96;
    const w = Math.min(W - MARGIN * 2, label.width + face + PAD * 3);
    const h = Math.max(label.height, face * 0.9) + PAD * 1.6;
    // Облачко по горизонтали — над целью, но не за краем экрана.
    const bx = Phaser.Math.Clamp(opts.target.x, MARGIN + w / 2, W - MARGIN - w / 2);
    const by = side === 'above' ? opts.target.y - ARROW - h / 2 - 16 : opts.target.y + ARROW + h / 2 + 16;

    const node = scene.add.container(bx, by).setDepth(45);
    const g = scene.add.graphics();
    g.fillStyle(0x000000, 0.35);
    g.fillRoundedRect(-w / 2, -h / 2 + 8, w, h, 34);
    g.fillStyle(0xfff1cc, 1);
    g.fillRoundedRect(-w / 2, -h / 2, w, h, 34);
    g.lineStyle(5, C.primary, 1);
    g.strokeRoundedRect(-w / 2, -h / 2, w, h, 34);
    // Стрелка на элемент
    const ax = Phaser.Math.Clamp(opts.target.x - bx, -w / 2 + 50, w / 2 - 50);
    g.fillStyle(0xfff1cc, 1);
    if (side === 'above') g.fillTriangle(ax - 26, h / 2 - 3, ax + 26, h / 2 - 3, ax, h / 2 + ARROW);
    else g.fillTriangle(ax - 26, -h / 2 + 3, ax + 26, -h / 2 + 3, ax, -h / 2 - ARROW);
    node.add(g);

    const lumo = createLumo(scene, face, currentLook(), false).setPosition(-w / 2 + PAD + face / 2, 10);
    node.add(lumo);
    label.setPosition(-w / 2 + PAD * 2 + face, -label.height / 2);
    node.add(label);

    node.setSize(w, h).setInteractive({ useHandCursor: true });
    node.on('pointerup', () => this.dismiss());
    node.setAlpha(0).setScale(0.85);
    scene.tweens.add({ targets: node, alpha: 1, scale: 1, duration: 260, ease: 'Back.out' });
    // Лёгкое покачивание — облачко «живое».
    scene.tweens.add({ targets: node, y: by - 8, duration: 1200, yoyo: true, repeat: -1, ease: 'Sine.inOut', delay: 300 });

    const timer = opts.autoCloseMs ? scene.time.delayedCall(opts.autoCloseMs, () => this.current?.node === node && this.dismiss()) : undefined;
    this.current = { opts, node, timer };
    opts.onShow?.();
  }
}
