// Главное меню — карта мира: вертикальная тропинка с кружками уровней через долину (холмы, деревья, речка,
// дома без огней — их «зажжём» позже). Пройденные уровни светятся, под ними звёзды; текущий пульсирует,
// рядом стоит Lumo; «испытания» — кружки побольше. Карта прокручивается пальцем, колесом и стрелками;
// при открытии — прокручена к текущему уровню. Сверху — профиль, мир и «Войти», снизу — статистика,
// звук, «Играть», вибрация, «Как играть».

import Phaser from 'phaser';
import { currentView, stretchLayout, type ViewRect } from '../ui/viewport';
import { isVibrationOn, setVibration } from '../haptics';
import { isChallenge, LEVELS, numberInWorld, WORLDS, type World } from '../levels/index';
import type { Level } from '../core/types';
import { isMuted, setMuted, sfx } from '../audio';
import { isUnlocked, loadProgress, type Progress } from '../storage';
import { displayName, getProfile } from '../profile';
import { showNameDialog } from '../ui/NameDialog';
import { ALL_RULES, canShowModal, isTutorialDone, modalClosed, modalOpened } from '../tutorial';
import { t } from '../strings';
import { Account } from '../cloud/account';
import { openAuthDialog } from '../ui/AuthDialog';
import { addBackground, Button, createAvatarBadge, createLumo, drawFireflyIcon, drawIcon, drawStar, text } from '../ui/draw';
import { C, FONT, H, W } from '../ui/theme';
import { irisIn, reducedMotion } from '../ui/fx';

/** Шаг между уровнями на карте и размах «змейки» тропинки. */
const STEP = 250;
const SWAY = 290;
const MARGIN_TOP = 420;
const MARGIN_BOTTOM = 420;
const R = 66;
const R_CHALLENGE = 88;

interface NodePos {
  level: Level;
  index: number;
  x: number;
  y: number;
  r: number;
}

/** Где на карте кружок уровня i (0 — внизу). Чистая функция — та же раскладка при каждом открытии. */
export function mapLayout(count: number): { height: number; pos: { x: number; y: number }[] } {
  const height = MARGIN_TOP + MARGIN_BOTTOM + (count - 1) * STEP;
  const pos = Array.from({ length: count }, (_, i) => ({
    x: W / 2 + Math.sin(i * 0.82 + 0.4) * SWAY * (0.75 + 0.25 * Math.sin(i * 0.31)),
    y: height - MARGIN_BOTTOM - i * STEP,
  }));
  return { height, pos };
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

  constructor() {
    super('Menu');
  }

  create() {
    // Высокий экран: профиль и «Войти» — к верху безопасной зоны, нижний ряд кнопок — к низу.
    const bounds = stretchLayout(this);
    const topY = 100 + bounds.top;
    const rowY = 1730 + (bounds.bottom - H);
    addBackground(this, { dust: false });
    const progress = loadProgress();
    const world = WORLDS[0];
    const next = this.nextLevel(progress);

    this.hudTop = topY + 200;
    this.hudBottom = rowY - 190;
    this.buildMap(world, progress, next);

    // --- Верхняя панель: затемнение, профиль, мир и звёзды, вход
    const hud = this.add.graphics().setDepth(20);
    const paintHud = (v: ViewRect) => {
      hud.clear();
      // Сплошная подложка под кнопками и мягкий переход к карте.
      hud.fillStyle(C.bgBottom, 0.94);
      hud.fillRect(v.x, v.y, v.w, topY + 120 - v.y);
      hud.fillGradientStyle(C.bgBottom, C.bgBottom, C.bgBottom, C.bgBottom, 0.94, 0.94, 0, 0);
      hud.fillRect(v.x, topY + 120, v.w, 110);
      hud.fillGradientStyle(C.bgBottom, C.bgBottom, C.bgBottom, C.bgBottom, 0, 0, 0.94, 0.94);
      hud.fillRect(v.x, rowY - 190, v.w, 110);
      hud.fillStyle(C.bgBottom, 0.94);
      hud.fillRect(v.x, rowY - 80, v.w, v.y + v.h - (rowY - 80));
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
    const badge = createAvatarBadge(this, 100, topY, 62, profile.avatar).setDepth(21);
    badge.setSize(140, 140).setInteractive({ useHandCursor: true });
    badge.on('pointerup', () => this.go('Profile'));
    const nameT = this.add
      .text(180, topY, displayName(profile), { fontFamily: FONT, fontSize: '40px', color: C.text, fontStyle: 'bold' })
      .setOrigin(0, 0.5)
      .setDepth(21)
      .setInteractive({ useHandCursor: true });
    nameT.on('pointerup', () => this.go('Profile'));

    // Название мира и звёзды под ним.
    const stars = world.levels.reduce((s, l) => s + (progress.stars[l.id] ?? 0), 0);
    const ff = world.levels.reduce((s, l) => s + (progress.fireflies[l.id] ?? 0), 0);
    const ffTotal = world.levels.reduce((s, l) => s + l.fireflies.length, 0);
    const title = text(this, W / 2, topY + 105, world.name, 64).setDepth(21);
    title.setShadow(0, 0, '#ffc65c', 24, true, true);
    const sub = this.add.graphics().setDepth(21);
    const starsT = text(this, 0, topY + 170, `${stars}/${world.levels.length * 3}`, 36, C.text).setOrigin(0, 0.5).setDepth(21);
    const ffT = text(this, 0, topY + 170, ffTotal ? `${ff}/${ffTotal}` : '', 36, C.text).setOrigin(0, 0.5).setDepth(21);
    const rowW = 50 + starsT.width + (ffTotal ? 70 + 50 + ffT.width : 0);
    let x = W / 2 - rowW / 2;
    drawStar(sub, x + 20, topY + 168, 20, C.star);
    starsT.setX(x + 50);
    x += 50 + starsT.width + 70;
    if (ffTotal) drawFireflyIcon(sub, x + 18, topY + 170, 18, true);
    ffT.setX(x + 50);

    const loggedIn = !!Account.user;
    const authBtn = new Button(this, loggedIn ? W - 100 : W - 150, topY, {
      w: loggedIn ? 130 : 230,
      h: 110,
      icon: loggedIn ? 'cloud' : 'user',
      label: loggedIn ? undefined : 'Войти',
      fontSize: 40,
      onClick: () => {
        sfx.tap();
        openAuthDialog(Account.user ? 'account' : 'login', { onClose: () => this.scene.isActive() && this.scene.restart() });
      },
    });
    authBtn.setDepth(21);
    const offAuth = Account.on((e) => e.type === 'changed' && this.scene.isActive() && this.scene.restart());
    this.events.once('shutdown', offAuth);

    // --- Нижняя панель
    const bottom: Phaser.GameObjects.Container[] = [];
    bottom.push(new Button(this, W / 2 - 420, rowY, { w: 140, h: 130, icon: 'stats', onClick: () => this.go('Stats') }));
    const sound = new Button(this, W / 2 - 260, rowY, {
      w: 140,
      h: 130,
      icon: isMuted() ? 'mute' : 'sound',
      onClick: () => {
        setMuted(!isMuted());
        sound.setIcon(isMuted() ? 'mute' : 'sound');
        sfx.tap();
      },
    });
    bottom.push(sound);
    const playNext = () => this.play(this.nodes[next].index);
    bottom.push(new Button(this, W / 2, rowY, { w: 320, h: 150, icon: 'play', label: 'Играть', primary: true, fontSize: 56, onClick: playNext }));
    const vibro = new Button(this, W / 2 + 260, rowY, {
      w: 140,
      h: 130,
      icon: isVibrationOn() ? 'vibrate' : 'novibrate',
      onClick: () => {
        setVibration(!isVibrationOn());
        vibro.setIcon(isVibrationOn() ? 'vibrate' : 'novibrate');
        sfx.tap();
      },
    });
    bottom.push(vibro);
    bottom.push(
      new Button(this, W / 2 + 420, rowY, {
        w: 140,
        h: 130,
        icon: 'help',
        onClick: () => {
          sfx.tap();
          this.scene.launch('Rules', { cards: [...ALL_RULES], from: 'Menu', menuMode: true });
          this.scene.pause();
        },
      }),
    );
    for (const b of bottom) b.setDepth(21);
    text(this, W / 2 + 420, rowY + 92, t('tutorial_replay'), 26, C.textDim, false).setDepth(21);

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

    // Карта открыта на текущем уровне (он — чуть ниже середины экрана).
    const cur = this.nodes[next];
    const v = currentView(this);
    this.setMapY(v.cy + 160 - cur.y);
    const p = this.mapToWorld(cur);
    irisIn(this, p.x, p.y, 750);

    // Обучение пройдено — мягко знакомимся: имя и аватарка (не вместе с другими окнами).
    if (isTutorialDone() && !profile.nameAsked && canShowModal()) {
      this.time.delayedCall(1100, () => {
        if (!canShowModal() || !this.scene.isActive()) return;
        modalOpened();
        showNameDialog(this, {
          title: 'Как тебя зовут?',
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

  private buildMap(world: World, progress: Progress, next: number) {
    const levels = world.levels;
    const { height, pos } = mapLayout(levels.length);
    this.mapH = height;
    this.map = this.add.container(0, 0).setDepth(0);
    const theme = world.theme;
    const rnd = new Phaser.Math.RandomDataGenerator([world.id]);
    const calm = reducedMotion();
    const XL = -800;
    const XR = W + 800;

    // Небо карты: снизу светлее (долина), к верху — ночь.
    const sky = this.add.graphics();
    sky.fillGradientStyle(theme.skyTop, theme.skyTop, theme.skyBottom, theme.skyBottom, 0.0, 0.0, 0.9, 0.9);
    sky.fillRect(XL, 0, XR - XL, height);
    this.map.add(sky);

    // Тропинка — плавная кривая через все кружки (снизу — от дома Lumo, сверху — уходит в туман).
    const pts = [new Phaser.Math.Vector2(W / 2 - 120, height - 80), ...pos.map((p) => new Phaser.Math.Vector2(p.x, p.y)), new Phaser.Math.Vector2(W / 2, 60)];
    const curve = new Phaser.Curves.Spline(pts);
    const samples = curve.getSpacedPoints(levels.length * 40);
    const near = (x: number, y: number, d: number) => samples.some((s) => Math.abs(s.x - x) < d && Math.abs(s.y - y) < d);

    // Реки: перед первым уровнем с водой и ещё одна — во втором десятке мира (по уровням с водой).
    const rivers: number[] = [];
    const firstWater = levels.findIndex((l) => l.cells.includes('water'));
    if (firstWater > 0) rivers.push((pos[firstWater - 1].y + pos[firstWater].y) / 2);
    const laterWater = levels.findIndex((l, i) => i > firstWater + 8 && l.cells.includes('water'));
    if (laterWater > 0) rivers.push((pos[laterWater - 1].y + pos[laterWater].y) / 2);
    const inRiver = (y: number) => rivers.some((ry) => Math.abs(y - ry) < 80);

    // Холмы по краям: дальние и ближние.
    const hills = this.add.graphics();
    for (let y = height; y > -200; y -= rnd.between(380, 560)) {
      for (const side of [-1, 1]) {
        const cx = W / 2 + side * rnd.between(560, 760);
        hills.fillStyle(theme.hillFar, 0.85);
        hills.fillEllipse(cx + side * 120, y - 40, rnd.between(900, 1300), rnd.between(420, 560));
        hills.fillStyle(theme.hillNear, 0.9);
        hills.fillEllipse(cx, y + 60, rnd.between(700, 1000), rnd.between(320, 420));
      }
    }
    this.map.add(hills);

    // Реки с мостиком там, где их пересекает тропинка.
    for (const ry of rivers) {
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
      waves.lineStyle(6, C.waterLight, 0.5);
      for (let xx = XL; xx < XR; xx += rnd.between(140, 220)) {
        const yy = ry + rnd.between(-20, 20) + Math.sin(xx * 0.008) * 14;
        waves.lineBetween(xx, yy, xx + 60, yy - 8);
      }
      if (!calm) this.tweens.add({ targets: waves, x: 30, alpha: 0.5, duration: 1600, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
      // Мостик
      const cross = samples.reduce((a, b) => (Math.abs(b.y - ry) < Math.abs(a.y - ry) ? b : a));
      g.fillStyle(C.bridge, 1);
      g.fillRoundedRect(cross.x - 62, ry - 66, 124, 132, 16);
      g.fillStyle(C.bridgeLight, 1);
      for (let k = 0; k < 4; k++) g.fillRect(cross.x - 62, ry - 58 + k * 33, 124, 12);
      this.map.add([g, waves]);
    }

    // Сама тропинка: тёмная подложка, утоптанная земля и тёплый свет на пройденной части.
    const pathG = this.add.graphics();
    const stroke = (g: Phaser.GameObjects.Graphics, pts2: Phaser.Math.Vector2[], w: number, color: number, alpha: number) => {
      g.lineStyle(w, color, alpha);
      g.beginPath();
      g.moveTo(pts2[0].x, pts2[0].y);
      for (const q of pts2.slice(1)) g.lineTo(q.x, q.y);
      g.strokePath();
    };
    stroke(pathG, samples, 64, 0x000000, 0.25);
    stroke(pathG, samples, 46, theme.path, 0.55);
    // Пунктир-камешки по тропинке
    for (let k = 0; k < samples.length; k += 3) {
      pathG.fillStyle(0xd8c49a, 0.25);
      pathG.fillCircle(samples[k].x + rnd.between(-8, 8), samples[k].y + rnd.between(-8, 8), 5);
    }
    // Пройденная часть тропинки светится — до текущего уровня.
    const litTo = Math.round(((next + 1) / (levels.length + 1)) * samples.length);
    const lit = samples.slice(0, Math.max(2, litTo));
    stroke(pathG, lit, 40, C.roadGlow, 0.18);
    stroke(pathG, lit, 18, C.road, 0.85);
    stroke(pathG, lit, 6, C.roadCore, 0.9);
    this.map.add(pathG);

    // Деревья — где нет тропинки и реки.
    const trees = this.add.graphics();
    for (let k = 0; k < 280; k++) {
      const tx = rnd.between(XL + 100, XR - 100);
      const ty = rnd.between(80, height - 40);
      if (near(tx, ty, 150) || inRiver(ty)) continue;
      const s = rnd.realInRange(0.7, 1.3);
      trees.fillStyle(0x000000, 0.25);
      trees.fillEllipse(tx, ty + 8, 70 * s, 18 * s);
      if (rnd.frac() < 0.6) {
        // Ель
        trees.fillStyle(theme.tree, 1);
        trees.fillTriangle(tx - 42 * s, ty, tx + 42 * s, ty, tx, ty - 120 * s);
        trees.fillStyle(Phaser.Display.Color.IntegerToColor(theme.tree).lighten(8).color, 1);
        trees.fillTriangle(tx - 30 * s, ty - 50 * s, tx + 30 * s, ty - 50 * s, tx, ty - 140 * s);
      } else {
        // Круглое дерево
        trees.fillStyle(0x3a2c22, 1);
        trees.fillRect(tx - 6 * s, ty - 40 * s, 12 * s, 40 * s);
        trees.fillStyle(theme.tree, 1);
        trees.fillCircle(tx, ty - 70 * s, 44 * s);
        trees.fillStyle(0xffffff, 0.05);
        trees.fillCircle(tx - 12 * s, ty - 84 * s, 22 * s);
      }
    }
    this.map.add(trees);

    // Дома без огней: внизу — дом Lumo, дальше — у каждого пятого уровня (их зажжём в следующих этапах).
    const houses = this.add.graphics();
    const house = (hx: number, hy: number, s: number) => {
      houses.fillStyle(0x000000, 0.28);
      houses.fillEllipse(hx, hy + 6, 170 * s, 30 * s);
      houses.fillStyle(0x2c2a44, 1);
      houses.fillRect(hx - 70 * s, hy - 100 * s, 140 * s, 100 * s);
      houses.fillStyle(0x4a2f3a, 1);
      houses.fillTriangle(hx - 90 * s, hy - 96 * s, hx + 90 * s, hy - 96 * s, hx, hy - 170 * s);
      houses.fillStyle(0x15172b, 1); // тёмные окна — свет погас
      houses.fillRect(hx - 50 * s, hy - 78 * s, 34 * s, 30 * s);
      houses.fillRect(hx + 16 * s, hy - 78 * s, 34 * s, 30 * s);
      houses.fillStyle(0x1c1a30, 1);
      houses.fillRoundedRect(hx - 16 * s, hy - 50 * s, 32 * s, 50 * s, 6 * s);
      houses.lineStyle(3 * s, 0x5a587a, 0.6);
      houses.strokeRect(hx - 50 * s, hy - 78 * s, 34 * s, 30 * s);
      houses.strokeRect(hx + 16 * s, hy - 78 * s, 34 * s, 30 * s);
    };
    house(W / 2 + 120, height - 50, 1.2);
    pos.forEach((p, i) => {
      if ((i + 1) % 5 !== 0) return;
      // Дом — с другой стороны тропинки, чем встаёт Lumo (Lumo — в сторону середины карты).
      const side = p.x > W / 2 ? 1 : -1;
      house(p.x + side * 200, p.y + 40, 0.85);
    });
    this.map.add(houses);

    // Сверху — туман и обещание новых земель.
    this.map.add(text(this, W / 2, 140, 'Дальше — новые земли…', 40, C.textDim, false).setAlpha(0.6));

    // Кружки уровней.
    this.nodes = levels.map((level, i) => ({ level, index: LEVELS.indexOf(level), x: pos[i].x, y: pos[i].y, r: isChallenge(level) ? R_CHALLENGE : R }));
    this.nodes.forEach((n, i) => this.drawNode(n, i, progress, next, calm));

    // Lumo стоит у текущего уровня — со стороны, где больше места.
    const cur = this.nodes[next];
    const side = cur.x > W / 2 ? -1 : 1;
    const lumoX = cur.x + side * (cur.r + 80);
    const pool = this.add.image(lumoX, cur.y + 10, 'glow').setTint(C.lanternOn).setBlendMode(Phaser.BlendModes.ADD).setScale(2.4, 1.6).setAlpha(0.22);
    const lumo = createLumo(this, 130, getProfile().avatar).setPosition(lumoX, cur.y - 10);
    if (side < 0) lumo.setScale(-1, 1);
    this.map.add([pool, lumo]);
    if (!calm) this.tweens.add({ targets: lumo, y: cur.y - 24, duration: 1400, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
  }

  private drawNode(n: NodePos, i: number, progress: Progress, next: number, calm: boolean) {
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
      this.map.add(glow);
      if (!calm) this.tweens.add({ targets: glow, alpha: 0.18, duration: 1800 + (i % 5) * 200, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
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
      this.map.add(rays);
      if (!calm) this.tweens.add({ targets: rays, angle: 360, duration: 24000, repeat: -1 });
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
    else if (unlocked) for (let k = 0; k < 3; k++) drawStar(sg, (k - 1) * 40, 0, k === 1 ? 20 : 17, k < stars ? C.star : C.starEmpty, k < stars ? 1 : 0.7);
    sg.setPosition(0, r + 30 - (unlocked && !skipped ? 0 : 0));
    c.add(sg);
    if (level.fireflies.length && unlocked) {
      const got = progress.fireflies[level.id] ?? 0;
      const fg = this.add.graphics();
      drawFireflyIcon(fg, r * 0.78, -r * 0.78, 16, got > 0);
      c.add(fg);
    }
    this.map.add(c);
    if (current && !calm) this.tweens.add({ targets: c, scale: 1.08, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
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

  /** Первый открытый непройденный и непропущенный уровень, иначе последний открытый (индекс в мире). */
  private nextLevel(p: Progress): number {
    const levels = WORLDS[0].levels;
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
