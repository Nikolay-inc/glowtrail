// «Деревня в долине»: вечерняя деревня из 10 построек без огней. Свет, собранный на уровнях, восстанавливает их
// по порядку (по цене): строительные искры → в окнах зажигается тёплый свет, дым из трубы, жители-силуэты.
// Каждая постройка даёт награду (монеты, скин, способность). Под постройкой — название и цена; тап по
// невосстановленной — плашка «Название · награда · цена». Всегда видна ближайшая цель. Уровни деревня не блокирует.

import Phaser from 'phaser';
import { setMusicMood, sfx } from '../audio';
import { nextVillageObject, skinById, VILLAGE, type Reward, type VillageObject } from '../core/economy';
import { getEconomy, restoreVillage, wallet } from '../meta';
import { addBackground, Button, text } from '../ui/draw';
import { addTabBar, addWallet, drawCoin, drawLight, toast } from '../ui/meta';
import { drawBuilding } from '../ui/village';
import { stretchLayout } from '../ui/viewport';
import { C, FONT, H, W } from '../ui/theme';

/** Где стоит постройка: x, доля высоты свободной области (0 — верх, 1 — низ), масштаб. */
const LAYOUT: Record<string, { x: number; f: number; s: number }> = {
  chapel: { x: 220, f: 0.2, s: 0.78 },
  lumo: { x: 545, f: 0.2, s: 0.78 },
  lighthouse: { x: 870, f: 0.2, s: 0.7 },
  square: { x: 250, f: 0.46, s: 0.8 },
  mill: { x: 820, f: 0.48, s: 0.68 },
  bridge: { x: 540, f: 0.58, s: 0.85 },
  bakery: { x: 210, f: 0.81, s: 0.78 },
  garden: { x: 545, f: 0.83, s: 0.76 },
  workshop: { x: 870, f: 0.81, s: 0.72 },
  well: { x: 390, f: 1, s: 0.85 },
};

export class VillageScene extends Phaser.Scene {
  private views = new Map<string, Phaser.GameObjects.Container>();
  private wallet!: { refresh: () => void };
  private goal!: Phaser.GameObjects.Container;
  private goalY = 275;
  private plaque?: Phaser.GameObjects.Container;
  /** Свободная область для построек (между шапкой и кнопкой «Мастерская»). */
  private yTop = 430;
  private yBot = 1450;

  constructor() {
    super('Village');
  }

  create() {
    const bounds = stretchLayout(this);
    // В деревне музыка теплее; уходя — снова ночь.
    setMusicMood('warm');
    this.events.once('shutdown', () => setMusicMood('night'));
    addBackground(this, { evening: true, dust: false });
    this.cameras.main.fadeIn(200, 11, 15, 39);
    this.views.clear();
    this.plaque = undefined;
    const topY = 100 + bounds.top;
    const rowY = 1730 + (bounds.bottom - H);
    // Постройки занимают всё место между шапкой (заголовок, валюты, цель) и кнопкой «Мастерская».
    this.yTop = topY + 360;
    this.yBot = rowY - 300;
    this.drawGround();
    const e = getEconomy();
    for (const v of VILLAGE) this.views.set(v.id, this.drawObject(v, e.village.includes(v.id)));

    text(this, W / 2, topY, 'Деревня в долине', 60).setDepth(21).setShadow(0, 0, '#ffc65c', 20, true, true);
    this.wallet = addWallet(this, W / 2, topY + 80);
    this.goal = this.add.container(0, 0).setDepth(22);
    this.goalY = topY + 175;
    this.drawGoal();

    new Button(this, W / 2, rowY - 150, { w: 460, h: 110, icon: 'plus', label: 'Мастерская', fontSize: 42, onClick: () => this.go('Workshop') }).setDepth(21);
    addTabBar(this, 'Village', rowY + 40, (k) => this.go(k));
    // Тап мимо плашки — закрыть её.
    this.input.on('pointerdown', (_p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
      if (this.plaque && !over.length) this.hidePlaque();
    });
  }

  private spot(id: string) {
    const l = LAYOUT[id];
    // Чем выше свободная область, тем крупнее постройки (на коротких экранах — помельче, без наложений).
    const k = Phaser.Math.Clamp((this.yBot - this.yTop) / 1000, 0.85, 1.25);
    return { x: l.x, y: this.yTop + (this.yBot - this.yTop) * l.f, s: l.s * k };
  }

  // -------------------------------------------------------------------------
  // Земля: холмы, тропинка, ручей под мостом, ели по краям

  private drawGround() {
    const g = this.add.graphics().setDepth(1);
    const top = this.yTop - 260;
    const bridgeY = this.spot('bridge').y;
    g.fillStyle(0x0d1a1a, 1);
    g.fillEllipse(540, top + 260, 1500, 420);
    g.fillRect(-200, top + 260, 1480, H * 2);
    g.fillStyle(0x112220, 1);
    g.fillEllipse(540, (top + this.yBot) / 2 + 200, 1600, this.yBot - top + 400);
    // Тропинка от колодца наверх, к дому Lumo
    g.lineStyle(44, 0x24243a, 1);
    const pts = [
      new Phaser.Math.Vector2(545, this.yBot + 80),
      new Phaser.Math.Vector2(500, this.spot('garden').y + 20),
      new Phaser.Math.Vector2(560, bridgeY - 10),
      new Phaser.Math.Vector2(520, this.spot('square').y + 20),
      new Phaser.Math.Vector2(545, this.spot('lumo').y + 30),
    ];
    g.strokePoints(new Phaser.Curves.Spline(pts).getPoints(60), false);
    // Ручей поперёк — под мостом
    g.lineStyle(64, 0x173a66, 1);
    g.strokePoints(new Phaser.Curves.Spline([new Phaser.Math.Vector2(-60, bridgeY - 10), new Phaser.Math.Vector2(300, bridgeY - 40), new Phaser.Math.Vector2(780, bridgeY + 10), new Phaser.Math.Vector2(1140, bridgeY - 30)]).getPoints(40), false);
    g.lineStyle(5, 0x5a9ad6, 0.45);
    for (const x of [120, 330, 760, 960]) g.lineBetween(x - 28, bridgeY - 18 + (x % 3) * 6, x + 28, bridgeY - 18 + (x % 3) * 6);
    // Ели по краям (не заслоняют постройки)
    const rnd = new Phaser.Math.RandomDataGenerator(['village']);
    for (let i = 0; i < 18; i++) {
      const x = i % 2 ? rnd.between(1000, 1070) : rnd.between(10, 70);
      const y = rnd.between(top + 200, this.yBot + 60);
      const s = rnd.realInRange(0.6, 1);
      g.fillStyle(0x08110f, 1);
      g.fillTriangle(x - 36 * s, y, x + 36 * s, y, x, y - 100 * s);
      g.fillTriangle(x - 28 * s, y - 40 * s, x + 28 * s, y - 40 * s, x, y - 128 * s);
    }
  }

  // -------------------------------------------------------------------------
  // Постройка: рисунок, свет, дым, жители, подпись и ценник

  private drawObject(v: VillageObject, lit: boolean): Phaser.GameObjects.Container {
    const sp = this.spot(v.id);
    const c = this.add.container(sp.x, sp.y).setDepth(5 + sp.y / 1000);
    const b = drawBuilding(this, v.id, lit);
    const body = this.add.container(0, 0, b.objects).setScale(sp.s);
    if (lit) {
      // Тёплое свечение вокруг постройки
      c.add(this.add.image(0, -b.height * sp.s * 0.35, 'glow').setTint(0xffb84d).setBlendMode(Phaser.BlendModes.ADD).setScale(3.4, 2.4).setAlpha(0.22));
    }
    c.add(body);
    if (lit) {
      for (const l of b.lights) {
        const img = this.add.image(l.x * sp.s, l.y * sp.s, 'glow').setTint(0xffc65c).setBlendMode(Phaser.BlendModes.ADD).setScale((l.r * sp.s) / 34).setAlpha(0.75);
        c.add(img);
        this.tweens.add({ targets: img, alpha: 0.45, duration: Phaser.Math.Between(900, 1700), yoyo: true, repeat: -1, ease: 'Sine.inOut' });
      }
      for (const ch of b.chimneys) {
        c.add(
          this.add.particles(ch.x * sp.s, ch.y * sp.s, 'glow', {
            lifespan: 2800,
            speedY: { min: -38, max: -22 },
            speedX: { min: -4, max: 14 },
            scale: { start: 0.22, end: 0.75 },
            alpha: { start: 0.28, end: 0 },
            tint: 0xa8aec4,
            frequency: 380,
          }),
        );
      }
      if (b.rotor) this.tweens.add({ targets: b.rotor, angle: 360, duration: 14000, repeat: -1 });
      if (b.beam) {
        const beam = this.add.image(b.beam.x * sp.s, b.beam.y * sp.s, 'cone').setOrigin(0, 0.5).setTint(0xffe2a0).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.4).setScale(2.6, 1.1);
        c.add(beam);
        this.tweens.add({ targets: beam, angle: 360, duration: 9000, repeat: -1 });
      }
      // Жители-силуэты у входа
      const n = v.id === 'square' || v.id === 'well' ? 2 : 1;
      for (let i = 0; i < n; i++) {
        const fig = this.add.graphics();
        fig.fillStyle(0x070a18, 1);
        fig.fillCircle(0, -44, 9);
        fig.fillTriangle(-15, 0, 15, 0, 0, -38);
        fig.setPosition((i ? 1 : -1) * 90 * sp.s, 4);
        c.add(fig);
        this.tweens.add({ targets: fig, y: 0, duration: 1100 + i * 300, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
      }
    }
    // Подпись под постройкой: название и (для невосстановленной) цена — отдельным слоем поверх всех построек
    const labels = this.add.container(sp.x, sp.y).setDepth(30);
    c.once('destroy', () => labels.destroy());
    const next = nextVillageObject(getEconomy());
    const isNext = !lit && next?.id === v.id;
    labels.add(
      this.add
        .text(0, 22, v.name, { fontFamily: FONT, fontSize: '26px', color: lit ? '#ffd36b' : isNext ? C.text : '#9aa3d6', fontStyle: 'bold' })
        .setOrigin(0.5, 0),
    );
    if (!lit) {
      const tag = this.add.container(0, 76);
      const tg = this.add.graphics();
      tg.fillStyle(isNext ? 0x3a2a10 : 0x000000, isNext ? 0.92 : 0.45);
      tg.fillRoundedRect(-52, -20, 104, 40, 20);
      if (isNext) {
        tg.lineStyle(3, C.primary, 1);
        tg.strokeRoundedRect(-52, -20, 104, 40, 20);
      }
      drawLight(tg, -24, 0, 12);
      tag.add([tg, text(this, 14, 0, String(v.cost), 28, isNext ? '#ffd36b' : C.textDim)]);
      tag.setAlpha(isNext ? 1 : 0.7);
      labels.add(tag);
      if (isNext) this.tweens.add({ targets: tag, scale: 1.08, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    }
    // Касание постройки (вместе с подписью)
    const zone = this.add.zone(0, -b.height * sp.s * 0.4, 230, b.height * sp.s + 120).setInteractive({ useHandCursor: true });
    zone.on('pointerup', () => this.tap(v));
    c.add(zone);
    return c;
  }

  /** Ближайшая цель вверху: «Мельница — ещё 6 света» или кнопка «Восстановить». */
  private drawGoal() {
    const y = this.goalY;
    this.goal.removeAll(true);
    const next = nextVillageObject(getEconomy());
    if (!next) {
      this.goal.add(text(this, W / 2, y, 'Деревня восстановлена — в долине светло!', 40, '#ffd36b'));
      return;
    }
    const light = wallet().light;
    if (light >= next.cost) {
      this.goal.add(new Button(this, W / 2, y + 6, { w: 720, h: 100, label: `Восстановить: ${next.name} (${next.cost})`, primary: true, fontSize: 38, onClick: () => this.restore(next) }));
      return;
    }
    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.35);
    g.fillRoundedRect(W / 2 - 380, y - 38, 760, 76, 38);
    this.goal.add(g);
    this.goal.add(text(this, W / 2, y, `${next.name} — ещё ${next.cost - light} света`, 38));
  }

  /** Тап по постройке: восстановленная — что она дала; невосстановленная — плашка «Название · награда · цена». */
  private tap(v: VillageObject) {
    sfx.tap();
    if (getEconomy().village.includes(v.id)) {
      toast(this, `${v.name} — ${rewardText(v.reward)}`, this.goalY + 120);
      return;
    }
    this.showPlaque(v);
  }

  private hidePlaque() {
    const p = this.plaque;
    this.plaque = undefined;
    if (p) this.tweens.add({ targets: p, alpha: 0, duration: 150, onComplete: () => p.destroy() });
  }

  private showPlaque(v: VillageObject) {
    this.hidePlaque();
    const sp = this.spot(v.id);
    const next = nextVillageObject(getEconomy());
    const light = wallet().light;
    const can = next?.id === v.id && light >= v.cost;
    const second = next && next.id !== v.id ? `Сначала: ${next.name}` : !can ? `Ещё ${v.cost - light} света — проходи уровни и собирай светлячков` : '';
    const w = 820;
    const h = can ? 220 : 160;
    // Плашка над постройкой, но в пределах экрана и не на шапке
    const y = Phaser.Math.Clamp(sp.y - 230 * sp.s - h / 2, this.goalY + 80 + h / 2, H - 420);
    const p = this.add.container(W / 2, y).setDepth(50);
    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.4);
    g.fillRoundedRect(-w / 2, -h / 2 + 8, w, h, 30);
    g.fillStyle(C.panel, 0.98);
    g.fillRoundedRect(-w / 2, -h / 2, w, h, 30);
    g.lineStyle(4, can ? C.primary : C.cardEdge, 1);
    g.strokeRoundedRect(-w / 2, -h / 2, w, h, 30);
    p.add(g);
    const title = `${v.name} · ${rewardText(v.reward)} · ${v.cost} света`;
    p.add(this.add.text(0, -h / 2 + 48, title, { fontFamily: FONT, fontSize: '32px', color: C.text, fontStyle: 'bold', align: 'center', wordWrap: { width: w - 60 } }).setOrigin(0.5));
    if (second) p.add(text(this, 0, -h / 2 + 108, second, 26, C.textDim, false).setWordWrapWidth(w - 60));
    if (can) p.add(new Button(this, 0, h / 2 - 55, { w: 420, h: 80, label: 'Восстановить', primary: true, fontSize: 36, onClick: () => this.restore(v) }));
    p.setAlpha(0);
    this.tweens.add({ targets: p, alpha: 1, duration: 160 });
    this.plaque = p;
  }

  private restore(v: VillageObject) {
    this.hidePlaque();
    const res = restoreVillage(v.id);
    if (!res.ok) {
      sfx.invalid();
      toast(this, `Ещё ${v.cost - wallet().light} света — проходи уровни и собирай светлячков`, this.goalY + 120);
      return;
    }
    this.celebrate(v, res.value);
  }

  /** Восстановление: строительные искры, постройка загорается, награда. */
  private celebrate(v: VillageObject, reward: Reward) {
    const sp = this.spot(v.id);
    const old = this.views.get(v.id)!;
    sfx.lantern(2);
    const sparks = this.add
      .particles(sp.x, sp.y - 110 * sp.s, 'glow', {
        speed: { min: 80, max: 320 },
        scale: { start: 0.35, end: 0 },
        alpha: { start: 1, end: 0 },
        lifespan: 900,
        gravityY: 200,
        blendMode: Phaser.BlendModes.ADD,
        tint: [0xffd36b, 0xfff1cc, 0xffb84d],
        emitting: false,
      })
      .setDepth(40);
    for (let i = 0; i < 5; i++) this.time.delayedCall(i * 160, () => sparks.explode(18));
    this.tweens.add({ targets: old, scale: 1.06, duration: 160, yoyo: true, repeat: 2 });
    this.time.delayedCall(900, () => {
      old.destroy();
      const view = this.drawObject(v, true);
      this.views.set(v.id, view);
      // Ценник «следующей» постройки переехал — перерисуем её подпись.
      const next = nextVillageObject(getEconomy());
      if (next) {
        this.views.get(next.id)?.destroy();
        this.views.set(next.id, this.drawObject(next, false));
      }
      view.setAlpha(0);
      this.tweens.add({ targets: view, alpha: 1, duration: 500 });
      sfx.win();
      this.wallet.refresh();
      this.drawGoal();
      this.showReward(v, reward);
    });
  }

  private showReward(v: VillageObject, r: Reward) {
    const o = this.add.container(0, 0).setDepth(60);
    const dim = this.add.rectangle(W / 2, H / 2, W * 4, H * 4, 0x060818, 0.55).setInteractive();
    const g = this.add.graphics();
    g.fillStyle(C.panel, 1);
    g.fillRoundedRect(W / 2 - 400, 700, 800, 480, 50);
    g.lineStyle(6, C.primary, 1);
    g.strokeRoundedRect(W / 2 - 400, 700, 800, 480, 50);
    if ('coins' in r) drawCoin(g, W / 2, 900, 46);
    else drawLight(g, W / 2, 900, 46);
    o.add([dim, g, text(this, W / 2, 790, `${v.name}: снова горит свет!`, 46), text(this, W / 2, 990, rewardText(r), 44, '#ffd36b')]);
    o.add(new Button(this, W / 2, 1100, { w: 360, h: 110, label: 'Ура!', primary: true, onClick: () => o.destroy() }));
    o.setAlpha(0);
    this.tweens.add({ targets: o, alpha: 1, duration: 250 });
  }

  private go(scene: string) {
    this.cameras.main.fadeOut(180, 11, 15, 39);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start(scene));
  }
}

export function rewardText(r: Reward): string {
  if ('coins' in r) return `+${r.coins} монет`;
  if ('ability' in r) return 'способность «Поворот плитки»';
  const s = skinById(r.skin);
  const kind = s?.kind === 'costume' ? 'костюм' : s?.kind === 'road' ? 'дорога' : s?.kind === 'arch' ? 'арка' : 'фонарь';
  return `${kind} «${s?.name ?? r.skin}»`;
}
