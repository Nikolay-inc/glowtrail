// «Деревня в долине»: вечерняя деревня из 10 объектов без огней. Свет, собранный на уровнях, восстанавливает их
// по порядку (по цене): строительные искры → в окнах зажигается тёплый свет, дым из трубы, жители-силуэты.
// Каждый объект даёт награду (монеты, скин, способность). Всегда видна ближайшая цель. Уровни деревня не блокирует.

import Phaser from 'phaser';
import { sfx } from '../audio';
import { nextVillageObject, skinById, VILLAGE, type Reward, type VillageObject } from '../core/economy';
import { getEconomy, restoreVillage, wallet } from '../meta';
import { addBackground, Button, text } from '../ui/draw';
import { addTabBar, addWallet, drawCoin, drawLight, toast } from '../ui/meta';
import { stretchLayout } from '../ui/viewport';
import { C, H, W } from '../ui/theme';


/** Где стоит объект и где у него окна/труба (для огней и дыма). */
interface Spot {
  x: number;
  y: number;
  /** Масштаб (дальние объекты меньше). */
  s: number;
}

const SPOTS: Record<string, Spot> = {
  lighthouse: { x: 540, y: 610, s: 0.85 },
  square: { x: 250, y: 770, s: 0.8 },
  lumo: { x: 830, y: 780, s: 0.85 },
  chapel: { x: 540, y: 910, s: 0.9 },
  mill: { x: 190, y: 1060, s: 0.95 },
  garden: { x: 880, y: 1080, s: 0.95 },
  bridge: { x: 540, y: 1175, s: 1 },
  bakery: { x: 250, y: 1360, s: 1.05 },
  workshop: { x: 830, y: 1360, s: 1.05 },
  well: { x: 540, y: 1470, s: 1.1 },
};

const DARK = { wall: 0x1c2140, roof: 0x141834, window: 0x0c0f22, wood: 0x241c2e };
const WARM = { wall: 0x5a4a6e, roof: 0x7a3f4a, window: 0xffd36b, wood: 0x6a4a34 };

export class VillageScene extends Phaser.Scene {
  private views = new Map<string, Phaser.GameObjects.Container>();
  private wallet!: { refresh: () => void };
  private goal!: Phaser.GameObjects.Container;
  private goalY = 275;

  constructor() {
    super('Village');
  }

  create() {
    const bounds = stretchLayout(this);
    addBackground(this, { evening: true, dust: false });
    this.cameras.main.fadeIn(200, 11, 15, 39);
    this.views.clear();
    this.drawGround();
    const e = getEconomy();
    for (const v of VILLAGE) this.views.set(v.id, this.drawObject(v, e.village.includes(v.id)));

    const topY = 100 + bounds.top;
    text(this, W / 2, topY, 'Деревня в долине', 60).setDepth(21).setShadow(0, 0, '#ffc65c', 20, true, true);
    this.wallet = addWallet(this, W / 2, topY + 80);
    this.goal = this.add.container(0, 0).setDepth(22);
    this.goalY = topY + 175;
    this.drawGoal();

    const rowY = 1730 + (bounds.bottom - H);
    new Button(this, W / 2, rowY - 150, { w: 460, h: 120, icon: 'plus', label: 'Мастерская', fontSize: 44, onClick: () => this.go('Workshop') }).setDepth(21);
    addTabBar(this, 'Village', rowY + 40, (k) => this.go(k));
  }

  // -------------------------------------------------------------------------
  // Земля: холмы, тропинка, ручей под мостом

  private drawGround() {
    const g = this.add.graphics().setDepth(1);
    g.fillStyle(0x0f1d1c, 1);
    g.fillEllipse(540, 1250, 1900, 1500);
    g.fillStyle(0x132621, 1);
    g.fillEllipse(540, 1450, 1700, 1100);
    g.fillStyle(0x0c1714, 1);
    g.fillEllipse(540, 650, 700, 300); // холм маяка
    // Тропинка от колодца к маяку
    g.lineStyle(46, 0x2a2a3a, 1);
    const pts = [new Phaser.Math.Vector2(540, 1560), new Phaser.Math.Vector2(560, 1300), new Phaser.Math.Vector2(520, 1100), new Phaser.Math.Vector2(560, 880), new Phaser.Math.Vector2(520, 760), new Phaser.Math.Vector2(540, 640)];
    g.strokePoints(new Phaser.Curves.Spline(pts).getPoints(60), false);
    // Ручей поперёк
    g.lineStyle(70, 0x173a66, 1);
    g.strokePoints(new Phaser.Curves.Spline([new Phaser.Math.Vector2(-40, 1225), new Phaser.Math.Vector2(300, 1155), new Phaser.Math.Vector2(780, 1195), new Phaser.Math.Vector2(1120, 1135)]).getPoints(40), false);
    g.lineStyle(6, 0x5a9ad6, 0.5);
    for (const x of [120, 380, 700, 960]) g.lineBetween(x - 30, 1175 + (x % 3) * 8, x + 30, 1175 + (x % 3) * 8);
    // Деревья по краям
    const rnd = new Phaser.Math.RandomDataGenerator(['village']);
    for (let i = 0; i < 22; i++) {
      const x = rnd.pick([rnd.between(20, 120), rnd.between(960, 1060)]);
      const y = rnd.between(680, 1560);
      const s = rnd.realInRange(0.7, 1.2);
      g.fillStyle(0x0a1412, 1);
      g.fillTriangle(x - 40 * s, y, x + 40 * s, y, x, y - 110 * s);
      g.fillTriangle(x - 32 * s, y - 45 * s, x + 32 * s, y - 45 * s, x, y - 140 * s);
    }
  }

  // -------------------------------------------------------------------------
  // Объекты деревни (простые фигуры): тёмный силуэт или восстановленный с огнями

  private drawObject(v: VillageObject, lit: boolean): Phaser.GameObjects.Container {
    const sp = SPOTS[v.id];
    const c = this.add.container(sp.x, sp.y).setDepth(5 + sp.y / 1000);
    const g = this.add.graphics();
    const p = lit ? WARM : DARK;
    const windows: { x: number; y: number; w: number; h: number }[] = [];
    let chimney: { x: number; y: number } | null = null;
    const house = (x: number, y: number, w: number, h: number, roofH: number, win: number) => {
      g.fillStyle(0x000000, 0.35);
      g.fillEllipse(x, y + 6, w * 1.2, 22);
      g.fillStyle(p.wall, 1);
      g.fillRect(x - w / 2, y - h, w, h);
      g.fillStyle(p.roof, 1);
      g.fillTriangle(x - w / 2 - 14, y - h, x + w / 2 + 14, y - h, x, y - h - roofH);
      for (let i = 0; i < win; i++) windows.push({ x: x - w / 2 + (w / (win + 1)) * (i + 1), y: y - h * 0.55, w: 22, h: 26 });
      g.fillStyle(p.wood, 1);
      g.fillRect(x - 13, y - 38, 26, 38); // дверь
    };
    switch (v.id) {
      case 'well':
        g.fillStyle(0x000000, 0.35);
        g.fillEllipse(0, 8, 130, 26);
        g.fillStyle(lit ? 0x6e6a7e : 0x262a40, 1);
        g.fillRoundedRect(-55, -50, 110, 52, 12);
        g.fillStyle(p.wood, 1);
        g.fillRect(-50, -120, 10, 72);
        g.fillRect(40, -120, 10, 72);
        g.fillStyle(p.roof, 1);
        g.fillTriangle(-70, -112, 70, -112, 0, -160);
        windows.push({ x: 0, y: -40, w: 70, h: 12 });
        break;
      case 'bakery':
        house(0, 0, 170, 120, 70, 2);
        chimney = { x: 50, y: -175 };
        g.fillStyle(p.roof, 1);
        g.fillRect(40, -195, 22, 50);
        break;
      case 'workshop':
        house(0, 0, 190, 110, 60, 2);
        g.fillStyle(p.wood, 1);
        g.fillRect(-120, -60, 30, 60); // поленница
        chimney = { x: -50, y: -165 };
        g.fillStyle(p.roof, 1);
        g.fillRect(-60, -185, 22, 50);
        break;
      case 'mill':
        house(0, 0, 110, 150, 50, 1);
        g.fillStyle(p.wood, 1);
        for (let i = 0; i < 4; i++) {
          const a = (i * Math.PI) / 2 + Math.PI / 4;
          const bx = Math.cos(a) * 95;
          const by = -170 + Math.sin(a) * 95;
          g.lineStyle(14, p.wood, 1);
          g.lineBetween(0, -170, bx, by);
        }
        g.fillCircle(0, -170, 14);
        break;
      case 'bridge':
        g.fillStyle(p.wood, 1);
        g.fillRoundedRect(-150, -40, 300, 34, 10);
        g.lineStyle(10, p.wood, 1);
        g.beginPath();
        g.arc(0, 40, 140, Math.PI * 1.15, Math.PI * 1.85, false);
        g.strokePath();
        for (const x of [-140, 140]) {
          g.fillRect(x - 6, -90, 12, 55);
          windows.push({ x, y: -96, w: 22, h: 22 }); // фонарики на перилах
        }
        break;
      case 'garden':
        g.fillStyle(lit ? 0x2f5a3a : 0x18261f, 1);
        for (const [x, y, r] of [[-60, -40, 50], [10, -70, 60], [70, -35, 45]] as const) g.fillCircle(x, y, r);
        g.fillStyle(p.wood, 1);
        g.fillRect(-100, -10, 200, 10);
        if (lit) for (const [x, y] of [[-70, -60], [0, -100], [60, -55], [30, -30]] as const) windows.push({ x, y, w: 14, h: 14 }); // яблоки-огоньки
        else windows.push({ x: 0, y: -60, w: 1, h: 1 });
        break;
      case 'chapel':
        house(0, 0, 130, 150, 50, 1);
        g.fillStyle(p.roof, 1);
        g.fillTriangle(-26, -195, 26, -195, 0, -290);
        g.fillStyle(p.wall, 1);
        g.fillRect(-20, -205, 40, 30);
        windows.push({ x: 0, y: -232, w: 18, h: 22 });
        break;
      case 'square':
        g.fillStyle(lit ? 0x3a3a52 : 0x1a1d33, 1);
        g.fillEllipse(0, 0, 230, 60);
        for (const x of [-80, 0, 80]) {
          g.fillStyle(0x2a2440, 1);
          g.fillRect(x - 5, -110, 10, 110);
          windows.push({ x, y: -122, w: 24, h: 26 });
        }
        break;
      case 'lumo':
        house(0, 0, 150, 120, 80, 2);
        chimney = { x: -40, y: -185 };
        g.fillStyle(p.roof, 1);
        g.fillRect(-52, -205, 22, 50);
        break;
      case 'lighthouse':
        g.fillStyle(0x000000, 0.35);
        g.fillEllipse(0, 6, 140, 26);
        g.fillStyle(lit ? 0xc9c3d8 : 0x22263e, 1);
        g.fillPoints([new Phaser.Math.Vector2(-50, 0), new Phaser.Math.Vector2(50, 0), new Phaser.Math.Vector2(30, -260), new Phaser.Math.Vector2(-30, -260)], true);
        g.fillStyle(lit ? 0xa8404a : 0x1a1d33, 1);
        for (const y of [-70, -170]) g.fillRect(-45 + (y === -170 ? 8 : 0), y - 20, 90 - (y === -170 ? 16 : 0), 26);
        g.fillStyle(p.roof, 1);
        g.fillTriangle(-40, -300, 40, -300, 0, -345);
        windows.push({ x: 0, y: -280, w: 46, h: 34 });
        break;
    }
    // Окна: тёмные или тёплые со свечением
    const glow: Phaser.GameObjects.Image[] = [];
    for (const w of windows) {
      g.fillStyle(p.window, 1);
      g.fillRect(w.x - w.w / 2, w.y - w.h / 2, w.w, w.h);
      if (lit) {
        const img = this.add.image(w.x, w.y, 'glow').setTint(0xffc65c).setBlendMode(Phaser.BlendModes.ADD).setScale(Math.max(w.w, w.h) / 45).setAlpha(0.8);
        glow.push(img);
      }
    }
    // Восстановленный объект освещает землю вокруг тёплым светом.
    if (lit) c.add(this.add.image(0, -40, 'glow').setTint(0xffb84d).setBlendMode(Phaser.BlendModes.ADD).setScale(3.2, 1.8).setAlpha(0.28));
    c.add([g, ...glow]);
    for (const img of glow) this.tweens.add({ targets: img, alpha: 0.5, duration: Phaser.Math.Between(900, 1600), yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    if (lit) {
      if (v.id === 'lighthouse') {
        // Луч маяка медленно вращается.
        const beam = this.add.image(0, -280, 'cone').setOrigin(0, 0.5).setTint(0xffe2a0).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.35).setScale(2.4, 1.2);
        c.add(beam);
        this.tweens.add({ targets: beam, angle: 360, duration: 9000, repeat: -1 });
      }
      if (chimney) {
        const smoke = this.add.particles(chimney.x, chimney.y, 'glow', {
          lifespan: 2600,
          speedY: { min: -40, max: -25 },
          speedX: { min: -6, max: 14 },
          scale: { start: 0.25, end: 0.7 },
          alpha: { start: 0.22, end: 0 },
          tint: 0x9aa0b8,
          frequency: 420,
        });
        c.add(smoke);
      }
      // Жители-силуэты рядом с объектом
      for (const dx of [-70, 80].slice(0, v.id === 'well' || v.id === 'square' ? 2 : 1)) {
        const fig = this.add.graphics();
        fig.fillStyle(0x0a0d1e, 1);
        fig.fillCircle(0, -46, 10);
        fig.fillTriangle(-16, 0, 16, 0, 0, -40);
        fig.setPosition(dx + (v.id === 'bridge' ? 0 : 0), 10);
        c.add(fig);
        this.tweens.add({ targets: fig, y: 6, duration: 1200 + dx * 3, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
      }
    }
    c.setScale(sp.s);
    // Касание объекта
    const zone = this.add.zone(0, -100, 260, 260).setInteractive({ useHandCursor: true });
    zone.on('pointerup', () => this.tap(v));
    c.add(zone);
    // Цена у ближайшей цели и подпись у остальных
    const e = getEconomy();
    const next = nextVillageObject(e);
    if (!lit) {
      const isNext = next?.id === v.id;
      const tag = this.add.container(0, 40);
      const tg = this.add.graphics();
      tg.fillStyle(isNext ? 0x3a2a10 : 0x000000, isNext ? 0.92 : 0.5);
      tg.fillRoundedRect(-78, -26, 156, 52, 26);
      if (isNext) {
        tg.lineStyle(4, C.primary, 1);
        tg.strokeRoundedRect(-78, -26, 156, 52, 26);
      }
      drawLight(tg, -40, 0, 16);
      tag.add([tg, text(this, 18, 0, String(v.cost), 34, isNext ? '#ffd36b' : C.textDim)]);
      tag.setAlpha(isNext ? 1 : 0.6);
      c.add(tag);
      if (isNext) this.tweens.add({ targets: tag, y: 32, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    }
    return c;
  }

  /** Плашка ближайшей цели: «Мельница — ещё 6 света» или кнопка «Восстановить». */
  private drawGoal() {
    const y = this.goalY;
    this.goal.removeAll(true);
    const e = getEconomy();
    const next = nextVillageObject(e);
    if (!next) {
      this.goal.add(text(this, W / 2, y, 'Деревня восстановлена — в долине светло!', 40, '#ffd36b'));
      return;
    }
    const light = wallet().light;
    if (light >= next.cost) {
      this.goal.add(new Button(this, W / 2, y + 10, { w: 760, h: 110, label: `Восстановить: ${next.name} (${next.cost})`, primary: true, fontSize: 40, onClick: () => this.tap(next) }));
      return;
    }
    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.35);
    g.fillRoundedRect(W / 2 - 400, y - 40, 800, 80, 40);
    this.goal.add(g);
    this.goal.add(text(this, W / 2, y, `${next.name} — ещё ${next.cost - light} света`, 40));
  }

  private tap(v: VillageObject) {
    const e = getEconomy();
    if (e.village.includes(v.id)) {
      sfx.tap();
      toast(this, `${v.name} — ${rewardText(v.reward)}`);
      return;
    }
    const next = nextVillageObject(e)!;
    if (next.id !== v.id) {
      sfx.invalid();
      toast(this, `Сначала: ${next.name}`);
      return;
    }
    const res = restoreVillage(v.id);
    if (!res.ok) {
      sfx.invalid();
      toast(this, `Ещё ${v.cost - wallet().light} света — проходи уровни и собирай светлячков`);
      return;
    }
    this.celebrate(v, res.value);
  }

  /** Восстановление: строительные искры, объект загорается, награда. */
  private celebrate(v: VillageObject, reward: Reward) {
    const sp = SPOTS[v.id];
    const old = this.views.get(v.id)!;
    sfx.lantern(2);
    const sparks = this.add
      .particles(sp.x, sp.y - 90 * sp.s, 'glow', {
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
    this.tweens.add({ targets: old, scale: sp.s * 1.08, duration: 160, yoyo: true, repeat: 2 });
    this.time.delayedCall(900, () => {
      old.destroy();
      const view = this.drawObject(v, true);
      this.views.set(v.id, view);
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
  if ('ability' in r) return 'Новая способность: «Поворот плитки»';
  const s = skinById(r.skin);
  const kind = s?.kind === 'costume' ? 'Костюм' : s?.kind === 'road' ? 'Дорога' : s?.kind === 'arch' ? 'Арка' : 'Фонарь';
  return `${kind} «${s?.name ?? r.skin}»`;
}
