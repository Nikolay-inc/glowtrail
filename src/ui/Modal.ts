// Модальное окно под любой язык: затемнение фона, карточка строго по центру видимой области, содержимое
// складывается сверху вниз, карточка растёт по высоте под текст (длинный перевод — выше окно) и не выходит
// за экран (если не влезает — окно целиком уменьшается). Закрытие — крестиком, тапом по фону или кнопкой.
// Для проверки вёрстки у контейнера data 'panel' = {w, h}: i18n-check требует, чтобы надписи были внутри.

import Phaser from 'phaser';
import { sfx } from '../audio';
import { drawIcon, layoutRow, type Button } from './draw';
import { richText } from './meta';
import { C, H, W } from './theme';
import { uiText } from './UIText';
import { currentView } from './viewport';

export interface ModalOpts {
  w?: number;
  depth?: number;
  /** Крестик в углу и тап по фону закрывают окно. */
  closable?: boolean;
  accent?: number;
  onClose?: () => void;
  /** Внутренние поля. */
  pad?: number;
}

type Item = { obj: Phaser.GameObjects.GameObject & { setPosition: (x: number, y: number) => unknown }; h: number; gap: number; top?: boolean };

export class Modal {
  readonly root: Phaser.GameObjects.Container;
  readonly body: Phaser.GameObjects.Container;
  readonly w: number;
  readonly pad: number;
  private items: Item[] = [];
  private panel: Phaser.GameObjects.Graphics;
  private dim: Phaser.GameObjects.Rectangle;
  private closed = false;
  height = 0;

  constructor(
    readonly scene: Phaser.Scene,
    private opts: ModalOpts = {},
  ) {
    const view = currentView(scene);
    this.w = Math.min(opts.w ?? 920, W - 60);
    this.pad = opts.pad ?? 56;
    this.root = scene.add.container(0, 0).setDepth(opts.depth ?? 70);
    this.dim = scene.add.rectangle(W / 2, H / 2, W * 4, H * 4, 0x060818, 0.72).setInteractive();
    this.root.add(this.dim);
    this.body = scene.add.container(W / 2, view.cy);
    this.panel = scene.add.graphics();
    this.body.add(this.panel);
    this.root.add(this.body);
    if (opts.closable !== false) this.dim.on('pointerup', () => this.close());
  }

  /** Ширина содержимого (без полей). */
  get inner() {
    return this.w - this.pad * 2;
  }

  /** Добавить объект (центр по x = 0) высотой h; gap — отступ после. */
  add<T extends Item['obj']>(obj: T, h: number, gap = 24): T {
    this.body.add(obj);
    this.items.push({ obj, h, gap });
    return obj;
  }

  space(h: number) {
    this.items.push({ obj: this.scene.add.zone(0, 0, 1, 1), h, gap: 0 });
  }

  title(str: string, size = 60, color: string = C.text) {
    const t = uiText(this.scene, 0, 0, str, { w: this.inner - (this.opts.closable !== false ? 120 : 0), lines: 2, size, color });
    return this.add(t, t.height, 18), t;
  }

  text(str: string, size = 38, color: string = C.textDim, lines = 4, bold = false) {
    const t = uiText(this.scene, 0, 0, str, { w: this.inner, lines, size, color, bold, lineSpacing: 4 });
    return this.add(t, t.height, 22), t;
  }

  rich(str: string, size = 40, color: string = C.text) {
    const r = richText(this.scene, 0, 0, str, size, color, true, this.inner);
    return this.add(r, size * 1.4, 22), r;
  }

  /** Ряд кнопок по центру (по фактической ширине, не шире окна). */
  buttons(list: Button[], gap = 30) {
    const c = this.scene.add.container(0, 0, list);
    layoutRow(list, 0, gap, this.inner);
    const h = Math.max(...list.map((b) => b.height * b.scaleY));
    return this.add(c, h + 8, 10), c;
  }

  /** Разложить содержимое, нарисовать карточку по центру экрана, показать. */
  open() {
    const pad = this.pad;
    const total = this.items.reduce((s, it, i) => s + it.h + (i < this.items.length - 1 ? it.gap : 0), 0);
    const h = total + pad * 2;
    this.height = h;
    let y = -h / 2 + pad;
    for (const it of this.items) {
      it.obj.setPosition(0, y + it.h / 2);
      y += it.h + it.gap;
    }
    const g = this.panel;
    const r = 56;
    g.clear();
    g.fillStyle(0x000000, 0.35);
    g.fillRoundedRect(-this.w / 2, -h / 2 + 14, this.w, h, r);
    g.fillStyle(C.panel, 1);
    g.fillRoundedRect(-this.w / 2, -h / 2, this.w, h, r);
    g.lineStyle(6, this.opts.accent ?? C.primary, 0.95);
    g.strokeRoundedRect(-this.w / 2, -h / 2, this.w, h, r);
    // Тап по карточке не закрывает окно.
    const blocker = this.scene.add.zone(0, 0, this.w, h).setInteractive();
    this.body.addAt(blocker, 1);
    if (this.opts.closable !== false) {
      const x = this.w / 2 - 62;
      const cy = -h / 2 + 62;
      const cg = this.scene.add.graphics().setPosition(x, cy);
      cg.fillStyle(0x000000, 0.3);
      cg.fillCircle(0, 0, 38);
      drawIcon(cg, 'close', 44, C.icon);
      const z = this.scene.add.zone(x, cy, 100, 100).setInteractive({ useHandCursor: true });
      z.on('pointerup', () => this.close());
      this.body.add([cg, z]);
    }
    // Не влезает по высоте видимой области — уменьшаем окно целиком.
    const view = currentView(this.scene);
    const k = Math.min(1, (view.safeBottom - view.safeTop - 40) / h, (Math.min(view.w, W) - 30) / this.w);
    this.body.setScale(k);
    this.body.setY((view.safeTop + view.safeBottom) / 2);
    this.body.setData('panel', { w: this.w, h });
    // Проверка вёрстки (?audit=1) меряет окно в финальном виде — без анимации появления.
    if ((globalThis as { __glowAudit?: boolean }).__glowAudit) return this;
    this.root.setAlpha(0);
    this.scene.tweens.add({ targets: this.root, alpha: 1, duration: 200 });
    this.body.setScale(k * 0.92);
    this.scene.tweens.add({ targets: this.body, scale: k, duration: 220, ease: 'Back.out' });
    return this;
  }

  close(silent = false) {
    if (this.closed) return;
    this.closed = true;
    if (!silent) sfx.tap();
    this.scene.tweens.add({ targets: this.root, alpha: 0, duration: 140, onComplete: () => this.root.destroy() });
    this.opts.onClose?.();
  }

  get isClosed() {
    return this.closed;
  }
}
