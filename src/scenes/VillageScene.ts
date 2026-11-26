// «Деревня 2.0»: районы (Долина, Лесной квартал за мостом — с главой 2, Горный город — «скоро»), переключение
// свайпом или стрелками у названия. В районе 10 построек трёх уровней (восстановить за свет → улучшить за монеты →
// расцвет), 4 улицы (тропинка → гравий → брусчатка → мощёная с фонарями) и 24 слота украшений (режим «Украсить»).
// Сверху — валюты, уют (уровень деревни и награды) и ближайшая цель; снизу — Мастерская, Задания жителей, Украсить
// и сундук дня. Окна построек, улиц, украшений, уюта и заданий — src/ui/villagePanels.ts. Уровни деревня не блокирует.

import Phaser from 'phaser';
import { setMusicMood, sfx } from '../audio';
import { buildingLevel, coins, nextInDistrict, nextLevelCost, type Reward, type VillageObject } from '../core/economy';
import { decorPlaced, streetStep } from '../core/village';
import { DECOR_SLOTS, decorType, districtBuildings, STREETS_PER_DISTRICT, type DistrictId } from '../core/villageData';
import { t, tk } from '../i18n';
import { bloomGift, chestAvailable, cozy, districtOpen, getEconomy, questsToClaim, syncChallenges, wallet } from '../meta';
import { showBloomGift } from '../ui/bloomGift';
import { addBackground, Button, createLumo, drawIcon, layoutRow, text } from '../ui/draw';
import { addTabBar, addWallet, buttonRichLabel, drawLight, richText } from '../ui/meta';
import type { Modal } from '../ui/Modal';
import { currentLook } from '../ui/skins';
import { uiText } from '../ui/UIText';
import { drawBuilding, drawDecor, drawSilhouette, drawStreet, type BuildingView } from '../ui/village';
import * as P from '../ui/villagePanels';
import { BRIDGE_X, drawCrossing, drawRiver, RIVER_HW_BRIDGE, riverShape } from '../ui/villageRiver';
import { currentView, edgeRows, stretchLayout } from '../ui/viewport';

/** Какая постройка района — мост через реку: долина — мост (5-я), лес — мост-качели (9-я). */
const BRIDGE_INDEX: Partial<Record<DistrictId, number>> = { valley: 4, forest: 8 };
import { C, H, W } from '../ui/theme';

/** Название постройки и тексты — по ключам i18n. */
export const buildingName = (id: string) => tk(`building.${id}.name`);
export const bonusText = (id: string, n: number) => tk(`bonus.${id}`, { n });
export const districtName = (d: DistrictId) => tk(`district.${d}`);

type Spot = { x: number; f: number; s: number };

/** Где стоят постройки (x, доля высоты свободной области, масштаб) — по порядку восстановления. */
const LAYOUT: Record<DistrictId, Spot[]> = {
  // колодец, пекарня, мастерская, мельница, мост, сад, часовня, площадь, дом Lumo, маяк
  valley: [
    { x: 390, f: 1, s: 0.85 },
    { x: 210, f: 0.81, s: 0.78 },
    { x: 870, f: 0.81, s: 0.72 },
    { x: 800, f: 0.43, s: 0.66 },
    { x: 540, f: 0.58, s: 0.85 },
    { x: 545, f: 0.83, s: 0.76 },
    { x: 220, f: 0.2, s: 0.78 },
    { x: 250, f: 0.41, s: 0.8 },
    { x: 545, f: 0.2, s: 0.78 },
    { x: 870, f: 0.2, s: 0.7 },
  ],
  // травница, обсерватория, совиная почта, грибная ферма, лесопилка, мастерская фонарей, чайная, лесник, мост-качели, озеро
  forest: [
    { x: 390, f: 1, s: 0.82 },
    { x: 870, f: 0.2, s: 0.7 },
    { x: 870, f: 0.81, s: 0.72 },
    { x: 210, f: 0.81, s: 0.76 },
    { x: 800, f: 0.43, s: 0.66 },
    { x: 250, f: 0.41, s: 0.78 },
    { x: 545, f: 0.83, s: 0.74 },
    { x: 220, f: 0.2, s: 0.76 },
    { x: 540, f: 0.58, s: 0.85 },
    { x: 545, f: 0.2, s: 0.8 },
  ],
  mountain: [
    { x: 390, f: 1, s: 0.85 },
    { x: 210, f: 0.81, s: 0.78 },
    { x: 870, f: 0.81, s: 0.72 },
    { x: 820, f: 0.48, s: 0.7 },
    { x: 540, f: 0.58, s: 0.85 },
    { x: 545, f: 0.83, s: 0.76 },
    { x: 220, f: 0.2, s: 0.78 },
    { x: 250, f: 0.46, s: 0.8 },
    { x: 545, f: 0.2, s: 0.78 },
    { x: 870, f: 0.2, s: 0.72 },
  ],
};

/** 24 слота украшений: между постройками, у тропинок и по краям (x, доля высоты). */
const SLOTS: [number, number][] = [
  [70, 0.24], [380, 0.24], [700, 0.24], [1005, 0.26],
  [415, 0.34], [690, 0.35],
  [60, 0.43], [430, 0.42], [650, 0.43], [1000, 0.44],
  [140, 0.67], [300, 0.67], [780, 0.67], [940, 0.67],
  [60, 0.84], [350, 0.85], [725, 0.85], [1015, 0.84],
  [120, 1.03], [245, 1.04], [600, 1.04], [735, 1.04], [880, 1.03], [1005, 1.01],
];

const DISTRICT_ORDER: DistrictId[] = ['valley', 'forest', 'mountain'];

/** Палитра земли района. */
const GROUND: Record<DistrictId, { far: number; near: number; water: number; ripple: number; tree: number }> = {
  valley: { far: 0x0d1a1a, near: 0x112220, water: 0x173a66, ripple: 0x5a9ad6, tree: 0x08110f },
  forest: { far: 0x0a1712, near: 0x0e1f17, water: 0x0f4a52, ripple: 0x5ad6c8, tree: 0x050d09 },
  mountain: { far: 0x10121e, near: 0x161826, water: 0x1a2a4a, ripple: 0x6a8ad6, tree: 0x0a0c16 },
};

export class VillageScene extends Phaser.Scene implements P.VillageHost {
  district: DistrictId = 'valley';
  editMode = false;
  modal?: Modal;
  private wallet!: { refresh: () => void };
  private header!: Phaser.GameObjects.Container;
  private map!: Phaser.GameObjects.Container;
  private labels!: Phaser.GameObjects.Container;
  private bottom: Button[] = [];
  private topY = 0;
  private rowY = 0;
  private goalY = 275;
  /** Свободная область для построек (между шапкой и нижним рядом кнопок). */
  private yTop = 430;
  private yBot = 1450;
  private swipe: { x: number; y: number; t: number } | null = null;

  constructor() {
    super('Village');
  }

  init(data: { district?: DistrictId; panel?: 'quests' | 'cozy' }) {
    this.district = data?.district && districtOpen(data.district) ? data.district : this.district;
    this.editMode = false;
    this.registry.set('villagePanel', data?.panel ?? null);
  }

  create() {
    const bounds = stretchLayout(this);
    // В деревне музыка теплее; уходя — снова ночь.
    setMusicMood('warm');
    this.events.once('shutdown', () => setMusicMood('night'));
    addBackground(this, { evening: true, dust: false });
    this.cameras.main.fadeIn(200, 11, 15, 39);
    this.modal = undefined;
    // Награды испытаний, пройденных раньше (старое сохранение, другое устройство).
    syncChallenges();
    const { topY, rowY } = edgeRows(bounds);
    this.topY = topY;
    this.rowY = rowY;
    // Постройки занимают всё место между шапкой (район, валюты, уют, цель) и нижним рядом кнопок.
    this.yTop = topY + 420;
    this.yBot = rowY - 330;
    this.goalY = topY + 262;
    this.header = this.add.container(0, 0).setDepth(22);
    this.wallet = addWallet(this, W / 2, topY + 84);
    this.drawMap(0);
    this.drawHeader();
    this.drawBottom();
    addTabBar(this, 'Village', rowY + 40, (k) => this.go(k));
    this.setupSwipe();
    const panel = this.registry.get('villagePanel');
    if (panel === 'quests') this.time.delayedCall(250, () => P.showQuests(this));
    else if (panel === 'cozy') this.time.delayedCall(250, () => P.showCozy(this));
  }

  // -------------------------------------------------------------------------
  // VillageHost — для окон

  /** Перерисовать всё после покупки (карта, шапка, кнопки). */
  refresh() {
    this.wallet.refresh();
    this.drawMap(0);
    this.drawHeader();
    this.drawBottom();
  }

  closeModal() {
    this.modal?.close(true);
    this.modal = undefined;
  }

  // -------------------------------------------------------------------------
  // Шапка: район со стрелками, уют, бонусы, ближайшая цель

  private drawHeader() {
    const h = this.header;
    h.removeAll(true);
    const y = this.topY;
    const title = text(this, W / 2, y, districtName(this.district), 56, C.text, true, { w: W - 320 }).setShadow(0, 0, '#ffc65c', 20, true, true);
    h.add(title);
    const idx = DISTRICT_ORDER.indexOf(this.district);
    if (idx > 0) h.add(new Button(this, 90, y, { w: 96, h: 90, icon: 'arrowLeft', onClick: () => this.switchDistrict(-1) }));
    if (idx < DISTRICT_ORDER.length - 1) {
      const nextOpen = districtOpen(DISTRICT_ORDER[idx + 1]);
      const b = new Button(this, W - 90, y, { w: 96, h: 90, icon: 'arrowRight', onClick: () => this.switchDistrict(1) });
      if (!nextOpen) b.setAlpha(0.6);
      h.add(b);
    }
    // Уют: уровень деревни, шкала до следующей награды, подарок, если награда ждёт. Справа — бонусы.
    const cz = cozy();
    const cy = y + 172;
    const row = this.add.container(0, cy);
    const barW = 380;
    const label = uiText(this, 0, 0, t('cozy_level', { n: cz.level }), { w: 240, lines: 2, size: 32, color: '#ffb3cf', bold: true, originX: 0, align: 'left' });
    const hg = this.add.graphics();
    drawIcon(hg, 'heart', 46, 0xff8fb8);
    const bar = this.add.graphics();
    bar.fillStyle(0x000000, 0.45);
    bar.fillRoundedRect(0, -16, barW, 32, 16);
    bar.fillStyle(0xff8fb8, 1);
    bar.fillRoundedRect(0, -16, Math.max(32, (barW * cz.into) / cz.step), 32, 16);
    const val = text(this, barW / 2, 0, `${cz.into}/${cz.step}`, 24, C.text, true);
    // Раскладка: [сердце][Уют · ур. N][шкала] по центру строки.
    const lw = label.width * label.scaleX;
    const total = 46 + 14 + lw + 20 + barW + (cz.pending ? 110 : 0);
    let x = W / 2 - 70 - total / 2;
    hg.setPosition(x + 23, 0);
    x += 60;
    label.setPosition(x, 0);
    x += lw + 20;
    bar.setPosition(x, 0);
    val.setPosition(x + barW / 2, 0);
    row.add([hg, label, bar, val]);
    const zone = this.add.zone(W / 2 - 70, 0, total, 70).setInteractive({ useHandCursor: true });
    zone.on('pointerup', () => P.showCozy(this));
    row.add(zone);
    if (cz.pending) {
      const gift = new Button(this, x + barW + 60, 0, { w: 90, h: 80, icon: 'gift', primary: true, onClick: () => P.showCozy(this) });
      this.tweens.add({ targets: gift, scale: 1.1, duration: 500, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
      row.add(gift);
    }
    row.add(new Button(this, W - 90, 0, { w: 110, h: 86, icon: 'bulb', onClick: () => this.showBonuses() }));
    h.add(row);
    this.drawGoal();
  }

  /** Ближайшая цель района: восстановить следующую постройку, иначе — самое дешёвое улучшение. */
  private drawGoal() {
    const y = this.goalY;
    const g = this.add.container(0, 0);
    this.header.add(g);
    const d = this.district;
    if (!districtOpen(d)) {
      g.add(text(this, W / 2, y, t(d === 'forest' ? 'district_locked_forest' : 'district_soon'), 34, C.textDim, true, { w: W - 120, lines: 2 }));
      return;
    }
    const e = getEconomy();
    const next = nextInDistrict(e, d);
    const { light } = wallet();
    const pill = (str: string, onTap: () => void) => {
      const label = richText(this, W / 2, y, str, 36, C.text, true, W - 160);
      const w = Math.min(W - 80, label.width * label.scaleX + 80);
      const bg = this.add.graphics();
      bg.fillStyle(0x000000, 0.35);
      bg.fillRoundedRect(W / 2 - w / 2, y - 36, w, 72, 36);
      const z = this.add.zone(W / 2, y, w, 72).setInteractive({ useHandCursor: true });
      z.on('pointerup', onTap);
      g.add([bg, label, z]);
    };
    // Награда испытания: расцвет постройки на выбор — главная цель, пока не выбран; нет постройки на 2-м
    // уровне — подсказка вместо цели «не хватает» (подарок ждёт).
    const gift = bloomGift();
    const openGift = () => {
      this.closeModal();
      showBloomGift(this, { track: (m) => (this.modal = m), onBloom: () => this.refresh() });
    };
    if (gift.pending && gift.candidates.length) {
      const b = new Button(this, W / 2, y + 4, { w: 720, h: 96, icon: 'gift', label: t('bloom_gift_goal'), primary: true, fontSize: 36, onClick: openGift });
      this.tweens.add({ targets: b, scale: 1.04, duration: 600, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
      g.add(b);
      return;
    }
    const waitPill = () => gift.pending > 0 && (pill(t('bloom_gift_wait_short'), openGift), true);
    if (next) {
      const v = next;
      if (light >= v.cost) g.add(buttonRichLabel(new Button(this, W / 2, y + 4, { w: 720, h: 96, primary: true, onClick: () => this.showBuilding(v) }), t('village_goal_restore', { name: buildingName(v.id), n: v.cost }), 36));
      else if (!waitPill()) pill(t('village_goal_more', { name: buildingName(v.id), n: v.cost - light }), () => this.showBuilding(v));
      return;
    }
    // Всё восстановлено — самое дешёвое следующее улучшение.
    const ups = districtBuildings(d)
      .map((b) => ({ b, c: nextLevelCost(e, b.id) }))
      .filter((x) => x.c)
      .sort((a, z) => a.c!.coins - z.c!.coins);
    if (!ups.length) {
      g.add(text(this, W / 2, y, t('village_bloom_all'), 38, '#ffd36b', true, { w: W - 100, lines: 2 }));
      return;
    }
    const { b, c } = ups[0];
    const obj: VillageObject = { id: b.id, cost: 0, reward: b.reward };
    const have = coins(e);
    if (have >= c!.coins && light >= c!.light) g.add(buttonRichLabel(new Button(this, W / 2, y + 4, { w: 720, h: 96, primary: true, onClick: () => this.showBuilding(obj) }), t('village_goal_upgrade', { name: buildingName(b.id), n: c!.coins }), 36));
    else if (!waitPill()) pill(t('village_goal_upgrade_more', { name: buildingName(b.id), n: Math.max(0, c!.coins - have) }), () => this.showBuilding(obj));
  }

  // -------------------------------------------------------------------------
  // Нижний ряд: Мастерская, Задания (с числом готовых), Украсить / Готово, сундук дня

  private drawBottom() {
    for (const b of this.bottom) b.destroy();
    const y = this.rowY - 150;
    const open = districtOpen(this.district);
    const ready = questsToClaim();
    const quests = new Button(this, 0, y, { w: 290, h: 110, icon: 'scroll', label: t('quests_title_short'), fontSize: 36, onClick: () => P.showQuests(this) });
    if (ready) {
      const badge = this.add.container(quests.buttonWidth / 2 - 14, -44);
      const bg = this.add.graphics();
      bg.fillStyle(0xd04a5e, 1);
      bg.fillCircle(0, 0, 24);
      badge.add([bg, text(this, 0, -1, String(ready), 28, '#ffffff', true)]);
      quests.add(badge);
      this.tweens.add({ targets: badge, scale: 1.15, duration: 500, yoyo: true, repeat: -1 });
    }
    const row: Button[] = [new Button(this, 0, y, { w: 290, h: 110, icon: 'hammer', label: t('village_workshop'), fontSize: 36, onClick: () => this.go('Workshop') }), quests];
    if (open) {
      row.push(
        new Button(this, 0, y, {
          w: 270,
          h: 110,
          icon: this.editMode ? undefined : 'brush',
          label: this.editMode ? t('decor_done') : t('decor_mode'),
          primary: this.editMode,
          fontSize: 36,
          onClick: () => this.toggleEdit(),
        }),
      );
    }
    if (chestAvailable()) {
      const chest = new Button(this, 0, y, { w: 110, h: 110, icon: 'chest', primary: true, onClick: () => P.openChest(this) });
      this.tweens.add({ targets: chest, angle: { from: -4, to: 4 }, duration: 260, yoyo: true, repeat: -1, repeatDelay: 1400 });
      row.push(chest);
    }
    row.forEach((b) => b.setDepth(21));
    layoutRow(row, W / 2, 18);
    this.bottom = row;
  }

  private toggleEdit() {
    sfx.tap();
    this.editMode = !this.editMode;
    this.drawMap(0);
    this.drawBottom();
  }

  // -------------------------------------------------------------------------
  // Районы: переключение свайпом и стрелками

  private setupSwipe() {
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (this.modal || p.worldY < this.yTop - 120 || p.worldY > this.yBot + 140) return;
      this.swipe = { x: p.worldX, y: p.worldY, t: this.time.now };
    });
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      const s = this.swipe;
      this.swipe = null;
      if (!s || this.modal) return;
      const dx = p.worldX - s.x;
      const dy = p.worldY - s.y;
      if (Math.abs(dx) > 140 && Math.abs(dx) > Math.abs(dy) * 1.5 && this.time.now - s.t < 800) this.switchDistrict(dx < 0 ? 1 : -1);
    });
  }

  /** Касание было свайпом (не тапом по постройке). */
  private wasSwipe(p: Phaser.Input.Pointer) {
    return Math.abs(p.worldX - p.downX) > 30 || Math.abs(p.worldY - p.downY) > 30;
  }

  switchDistrict(dir: -1 | 1) {
    const i = DISTRICT_ORDER.indexOf(this.district) + dir;
    if (i < 0 || i >= DISTRICT_ORDER.length) return;
    sfx.tap();
    this.district = DISTRICT_ORDER[i];
    this.editMode = false;
    this.drawMap(dir);
    this.drawHeader();
    this.drawBottom();
  }

  // -------------------------------------------------------------------------
  // Карта района

  private spot(i: number) {
    const l = LAYOUT[this.district][i];
    // Чем выше свободная область, тем крупнее постройки (на коротких экранах — помельче, без наложений).
    const k = Phaser.Math.Clamp((this.yBot - this.yTop) / 1000, 0.85, 1.25);
    // Мост (5-я постройка долины и леса) стоит поперёк реки: точка постройки — ближний конец на южном берегу.
    if (this.isBridge(i)) return { x: BRIDGE_X, y: this.riverCY() + RIVER_HW_BRIDGE + 16, s: 1 };
    return { x: l.x, y: this.yTop + (this.yBot - this.yTop) * l.f, s: l.s * k };
  }

  private isBridge(i: number) {
    return this.hasRiver() && BRIDGE_INDEX[this.district] === i;
  }

  /** Река есть в долине и в лесу (в Горном городе — нет). */
  private hasRiver() {
    return this.district !== 'mountain';
  }

  /** Середина реки у моста. */
  private riverCY() {
    return this.yTop + (this.yBot - this.yTop) * 0.55;
  }

  /** Длина моста — от берега до берега. */
  private bridgeLen() {
    return 2 * RIVER_HW_BRIDGE + 32;
  }

  private slotPos(i: number) {
    const [x, f] = SLOTS[i];
    const k = Phaser.Math.Clamp((this.yBot - this.yTop) / 1000, 0.85, 1.25);
    return { x, y: this.yTop + (this.yBot - this.yTop) * f, s: 0.8 * k };
  }

  /** Точки тропинки снизу вверх; 4 улицы — 4 отрезка. */
  private streetPoints(): Phaser.Math.Vector2[][] {
    const V = Phaser.Math.Vector2;
    const sp = (i: number) => this.spot(i);
    // Через реку тропинка идёт прямо по мосту: от ближнего конца к дальнему.
    const near = this.riverCY() + RIVER_HW_BRIDGE + 16;
    const far = near - this.bridgeLen();
    const pts = this.hasRiver()
      ? [new V(545, this.yBot + 80), new V(500, this.yTop + (this.yBot - this.yTop) * 0.83 + 20), new V(BRIDGE_X, near + 40), new V(BRIDGE_X, far - 30), new V(520, this.yTop + (this.yBot - this.yTop) * 0.41 + 20), new V(545, this.yTop + (this.yBot - this.yTop) * 0.2 + 30)]
      : [new V(545, this.yBot + 80), new V(500, sp(5).y + 20), new V(560, sp(4).y - 10), new V(520, sp(7).y + 20), new V(545, sp(8).y + 30)];
    void sp;
    const all = new Phaser.Curves.Spline(pts).getPoints(80);
    const n = all.length - 1;
    return Array.from({ length: STREETS_PER_DISTRICT }, (_, k) => all.slice(Math.round((k * n) / 4), Math.round(((k + 1) * n) / 4) + 1));
  }

  private drawMap(dir: number) {
    const old = this.map;
    const oldLabels = this.labels;
    this.map = this.add.container(0, 0).setDepth(5);
    this.labels = this.add.container(0, 0).setDepth(30);
    const d = this.district;
    const open = districtOpen(d);
    this.drawGround(d);
    const e = getEconomy();
    // Улицы.
    const sg = this.add.graphics();
    this.map.add(sg);
    this.streetPoints().forEach((pts, i) => {
      const step = open ? streetStep(e, d, i) : 0;
      const res = drawStreet(sg, pts, step as 0 | 1 | 2 | 3, 44);
      for (const l of res.lamps) this.map.add(this.add.image(l.x, l.y - 40, 'glow').setTint(0xffd27a).setBlendMode(Phaser.BlendModes.ADD).setScale(0.9).setAlpha(0.55));
      if (this.editMode && open) this.streetMarker(pts[Math.floor(pts.length * [0.45, 0.25, 0.75, 0.6][i])], i, step);
    });
    // Река поверх тропинки (под мостом тропинки не видно), на всю видимую ширину — за края экрана.
    if (this.hasRiver()) {
      const view = currentView(this);
      const rg = this.add.graphics();
      this.map.add(rg);
      const glints = drawRiver(this, rg, this.riverCY(), Math.min(-40, view.x - 60), Math.max(W + 40, view.x + view.w + 60), GROUND[d]);
      for (const img of glints) this.map.add(img);
    }
    // Постройки, украшения — по глубине (ниже на экране — ближе).
    const items: { y: number; obj: Phaser.GameObjects.GameObject }[] = [];
    districtBuildings(d).forEach((b, i) => items.push({ y: this.spot(i).y, obj: d === 'mountain' ? this.drawSilhouetteAt(i) : this.drawBuildingAt(b.id, i, open) }));
    if (open) {
      for (let s = 0; s < DECOR_SLOTS; s++) {
        const v = decorPlaced(e, d, s);
        const p = this.slotPos(s);
        if (v >= 0) {
          const art = drawDecor(this, decorType(s), v);
          const c = this.add.container(p.x, p.y, art.objects).setScale(p.s);
          for (const l of art.lights ?? []) c.add(this.add.image(l.x, l.y, 'glow').setTint(0xffc65c).setBlendMode(Phaser.BlendModes.ADD).setScale(l.r / 30).setAlpha(0.6));
          items.push({ y: p.y, obj: c });
        }
        if (this.editMode) this.slotMarker(s, p, v >= 0);
      }
      if (d === 'valley' || d === 'forest') items.push({ y: this.spot(0).y + 30, obj: this.addWalker() });
    } else {
      this.lockedPlaque(d);
    }
    items.sort((a, b) => a.y - b.y).forEach((x) => this.map.add(x.obj));
    // Сдвиг при смене района.
    if (old) {
      if (dir) {
        this.map.x = dir * W;
        this.labels.x = dir * W;
        this.tweens.add({ targets: [this.map, this.labels], x: 0, duration: 320, ease: 'Cubic.out' });
        this.tweens.add({ targets: [old, oldLabels], x: -dir * W, alpha: 0, duration: 320, ease: 'Cubic.out', onComplete: () => (old.destroy(), oldLabels.destroy()) });
      } else {
        old.destroy();
        oldLabels.destroy();
      }
    }
  }

  private drawGround(d: DistrictId) {
    const pal = GROUND[d];
    const g = this.add.graphics();
    this.map.add(g);
    const top = this.yTop - 260;
    g.fillStyle(pal.far, 1);
    g.fillEllipse(540, top + 260, 1500, 420);
    g.fillRect(-200, top + 260, 1480, H * 2);
    g.fillStyle(pal.near, 1);
    g.fillEllipse(540, (top + this.yBot) / 2 + 200, 1600, this.yBot - top + 400);
    if (d === 'mountain') {
      // Горы на горизонте.
      g.fillStyle(0x1c2034, 1);
      for (const [x, w, h] of [[120, 420, 300], [520, 520, 380], [900, 460, 320]] as const) g.fillTriangle(x - w / 2, top + 280, x + w / 2, top + 280, x, top + 280 - h);
      g.fillStyle(0xdfe6ff, 0.5);
      for (const [x, h] of [[120, 300], [520, 380], [900, 320]] as const) g.fillTriangle(x - 40, top + 280 - h + 60, x + 40, top + 280 - h + 60, x, top + 280 - h);
    }
    // Река рисуется в drawMap (поверх тропинки). Ели по краям (в лесу — гуще и выше), не в русле.
    const river = this.hasRiver() ? riverShape(this.riverCY()) : null;
    const inRiver = (x: number, y: number) => !!river && y > river.y(x) - river.hw(x) - 8 && y < river.y(x) + river.hw(x) + 18;
    const rnd = new Phaser.Math.RandomDataGenerator([`village-${d}`]);
    const n = d === 'forest' ? 30 : 18;
    for (let i = 0; i < n; i++) {
      const x = i % 2 ? rnd.between(1000, 1070) : rnd.between(10, 70);
      const y = rnd.between(top + 200, this.yBot + 60);
      const s = rnd.realInRange(0.6, 1) * (d === 'forest' ? 1.25 : 1);
      if (inRiver(x, y)) continue;
      g.fillStyle(pal.tree, 1);
      g.fillTriangle(x - 36 * s, y, x + 36 * s, y, x, y - 100 * s);
      g.fillTriangle(x - 28 * s, y - 40 * s, x + 28 * s, y - 40 * s, x, y - 128 * s);
    }
    if (d === 'forest') {
      // Светящиеся грибы и мох по краям.
      for (let i = 0; i < 14; i++) {
        const x = i % 2 ? rnd.between(960, 1050) : rnd.between(30, 120);
        const y = rnd.between(this.yTop, this.yBot + 40);
        if (inRiver(x, y)) continue;
        g.fillStyle(0x3a2a40, 1);
        g.fillRect(x - 2, y - 10, 4, 10);
        g.fillStyle(0x5ad6c8, 0.8);
        g.fillEllipse(x, y - 11, 16, 8);
        this.map.add(this.add.image(x, y - 10, 'glow').setTint(0x5ad6c8).setBlendMode(Phaser.BlendModes.ADD).setScale(0.35).setAlpha(0.5));
      }
    }
  }

  /** Постройка с уровнем: рисунок, свет, дым, жители, подпись (название, уровень или цена). */
  private drawBuildingAt(id: string, i: number, open: boolean): Phaser.GameObjects.Container {
    const sp = this.spot(i);
    const e = getEconomy();
    const level = open ? buildingLevel(e, id) : 0;
    const lit = level > 0;
    const c = this.add.container(sp.x, sp.y);
    // Мост через реку — вид сверху, поперёк русла (в окне постройки — обычный рисунок сбоку).
    const b = this.isBridge(i) ? drawCrossing(this, this.district === 'forest' ? 'rope' : 'stone', lit, Math.max(1, level), this.bridgeLen()) : drawBuilding(this, id, lit, Math.max(1, level));
    if (lit) c.add(this.add.image(0, -b.height * sp.s * 0.35, 'glow').setTint(0xffb84d).setBlendMode(Phaser.BlendModes.ADD).setScale(3.4 + level * 0.4, 2.4 + level * 0.3).setAlpha(0.18 + level * 0.04));
    const body = this.add.container(0, 0, b.objects).setScale(sp.s);
    if (!open) body.setAlpha(0.55);
    c.add(body);
    if (lit) decorateLit(this, c, b, sp.s, 0, id);
    // Подпись под постройкой — отдельным слоем поверх всех построек.
    const lab = this.add.container(sp.x, sp.y);
    this.labels.add(lab);
    if (open) {
      const next = nextInDistrict(e, this.district);
      const isNext = !lit && next?.id === id;
      const name = uiText(this, 0, 22, buildingName(id), { w: 250, lines: 2, size: 26, color: lit ? '#ffd36b' : isNext ? C.text : '#9aa3d6', bold: true, originY: 0 });
      lab.add(name);
      const below = 22 + name.height * name.scaleY + 22;
      if (lit) {
        // Уровень постройки — три огонька; можно улучшить — стрелка вверх.
        const pg = this.add.graphics();
        for (let k = 0; k < 3; k++) {
          pg.fillStyle(k < level ? 0xffd36b : 0x000000, k < level ? 1 : 0.45);
          pg.fillCircle((k - 1) * 26, below, 9);
          pg.lineStyle(2, 0xffd36b, 0.8);
          pg.strokeCircle((k - 1) * 26, below, 9);
        }
        lab.add(pg);
        const cost = nextLevelCost(e, id);
        if (cost && coins(e) >= cost.coins && wallet().light >= cost.light) {
          const up = this.add.graphics().setPosition(58, below);
          up.fillStyle(0x3f9a52, 1);
          up.fillCircle(0, 0, 15);
          up.fillStyle(0xffffff, 1);
          up.fillTriangle(-7, 2, 7, 2, 0, -8);
          up.fillRect(-2.5, 1, 5, 7);
          lab.add(up);
          this.tweens.add({ targets: up, y: below - 6, duration: 600, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
        }
      } else {
        const cost = P.restoreCostOf(id);
        const tag = this.add.container(0, below + 6);
        const tg = this.add.graphics();
        tg.fillStyle(isNext ? 0x3a2a10 : 0x000000, isNext ? 0.92 : 0.45);
        tg.fillRoundedRect(-52, -20, 104, 40, 20);
        if (isNext) {
          tg.lineStyle(3, C.primary, 1);
          tg.strokeRoundedRect(-52, -20, 104, 40, 20);
        }
        drawLight(tg, -24, 0, 12);
        tag.add([tg, text(this, 14, 0, String(cost), 28, isNext ? '#ffd36b' : C.textDim)]);
        tag.setAlpha(isNext ? 1 : 0.7);
        lab.add(tag);
        if (isNext) this.tweens.add({ targets: tag, scale: 1.08, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
      }
    }
    // Касание постройки (вместе с подписью)
    const zone = this.add.zone(0, -b.height * sp.s * 0.4, Math.max(200, (b.width ?? 220) * sp.s), b.height * sp.s + 120).setInteractive({ useHandCursor: true });
    zone.on('pointerup', (p: Phaser.Input.Pointer) => {
      if (this.wasSwipe(p) || this.modal) return;
      if (!open) return this.lockedTap();
      sfx.tap();
      this.showBuilding({ id, cost: P.restoreCostOf(id), reward: districtBuildings(this.district)[i].reward });
    });
    c.add(zone);
    c.once('destroy', () => lab.destroy());
    return c;
  }

  private drawSilhouetteAt(i: number): Phaser.GameObjects.Container {
    const sp = this.spot(i);
    const art = drawSilhouette(this, i);
    const c = this.add.container(sp.x, sp.y, art.objects).setScale(sp.s);
    const zone = this.add.zone(0, -art.height * 0.4, Math.max(200, art.width), art.height + 80).setInteractive();
    zone.on('pointerup', (p: Phaser.Input.Pointer) => !this.wasSwipe(p) && !this.modal && this.lockedTap());
    c.add(zone);
    return c;
  }

  private lockedTap() {
    sfx.invalid();
    P.toastMsg(this, t(this.district === 'forest' ? 'district_locked_forest' : 'district_soon'));
  }

  /** Плашка закрытого района по центру карты. */
  private lockedPlaque(d: DistrictId) {
    const y = (this.yTop + this.yBot) / 2 - 40;
    const c = this.add.container(W / 2, y);
    const msg = t(d === 'forest' ? 'district_locked_forest' : 'district_soon');
    const label = uiText(this, 0, 30, msg, { w: 720, lines: 3, size: 38, color: C.text, bold: true });
    const title = uiText(this, 0, -60, districtName(d), { w: 720, size: 54, color: '#ffd36b', bold: true });
    const h = 120 + label.height * label.scaleY + 60;
    const bg = this.add.graphics();
    bg.fillStyle(0x05060f, 0.82);
    bg.fillRoundedRect(-400, -h / 2 - 20, 800, h, 40);
    bg.lineStyle(4, 0x6a7ad6, 0.7);
    bg.strokeRoundedRect(-400, -h / 2 - 20, 800, h, 40);
    const lg = this.add.graphics().setPosition(0, -h / 2 - 20);
    lg.fillStyle(0x05060f, 1);
    lg.fillCircle(0, 0, 52);
    drawIcon(lg, 'lock', 56, 0xc8d0ff);
    c.add([bg, lg, title, label]);
    this.labels.add(c);
  }

  /** Маркер слота украшения в режиме «Украсить»: «+» для пустого, кольцо — для занятого. */
  private slotMarker(slot: number, p: { x: number; y: number }, filled: boolean) {
    const c = this.add.container(p.x, p.y - (filled ? 60 : 20));
    const g = this.add.graphics();
    if (filled) {
      g.lineStyle(4, 0xffd36b, 0.9);
      g.strokeCircle(0, 0, 34);
      g.fillStyle(0x3a2a10, 0.9);
      g.fillCircle(24, -24, 16);
      drawIconAt(g, 'brush', 24, -24, 20, 0xffd36b);
    } else {
      g.fillStyle(0x000000, 0.5);
      g.fillCircle(0, 0, 32);
      g.lineStyle(4, 0xffd36b, 0.95);
      g.strokeCircle(0, 0, 32);
      drawIconAt(g, 'plus', 0, 0, 34, 0xffd36b);
    }
    c.add(g);
    this.tweens.add({ targets: c, scale: 1.08, duration: 650 + (slot % 4) * 80, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    const z = this.add.zone(0, filled ? 20 : 0, 96, filled ? 140 : 96).setInteractive({ useHandCursor: true });
    z.on('pointerup', (ptr: Phaser.Input.Pointer) => !this.wasSwipe(ptr) && !this.modal && P.showDecor(this, slot));
    c.add(z);
    this.labels.add(c);
  }

  /** Знак улицы в режиме «Украсить» — круглая табличка прямо на тропинке: шаг улицы, тап — окно улицы. */
  private streetMarker(p: Phaser.Math.Vector2, i: number, step: number) {
    const c = this.add.container(p.x, p.y);
    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.4);
    g.fillCircle(0, 4, 34);
    g.fillStyle(0x6a4a2a, 1);
    g.fillCircle(0, 0, 34);
    g.lineStyle(4, 0xffd36b, 0.95);
    g.strokeCircle(0, 0, 34);
    for (let k = 0; k < 3; k++) {
      g.fillStyle(k < step ? 0xffd36b : 0x000000, k < step ? 1 : 0.5);
      g.fillCircle((k - 1) * 18, 0, 7);
    }
    c.add(g);
    this.tweens.add({ targets: c, scale: 1.08, duration: 700 + i * 60, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    const z = this.add.zone(0, 0, 100, 100).setInteractive({ useHandCursor: true });
    z.on('pointerup', (ptr: Phaser.Input.Pointer) => !this.wasSwipe(ptr) && !this.modal && P.showStreet(this, i));
    c.add(z);
    this.labels.add(c);
  }

  /** Lumo в надетом образе (с питомцем) прогуливается по тропинке у первой постройки. */
  private addWalker() {
    const y = this.spot(0).y + 30;
    const lumo = createLumo(this, 110, currentLook(), true, { withPet: true }).setPosition(620, y);
    const walk = (to: number) => {
      if (!lumo.active) return;
      lumo.face(to > lumo.x ? 1 : -1);
      lumo.walk(true);
      this.tweens.add({
        targets: lumo,
        x: to,
        duration: Math.abs(to - lumo.x) * 9,
        ease: 'Sine.inOut',
        onComplete: () => {
          if (!lumo.active) return;
          lumo.walk(false);
          if (Math.random() < 0.5) lumo.wave();
          this.time.delayedCall(Phaser.Math.Between(1500, 3500), () => walk(to > 640 ? 560 : 860));
        },
      });
    };
    this.time.delayedCall(800, () => walk(860));
    return lumo;
  }

  // -------------------------------------------------------------------------
  // Окна (для аудита вёрстки и кнопок) — src/ui/villagePanels.ts

  showBuilding(v: VillageObject) {
    P.showBuilding(this, v);
  }

  showRestored(v: VillageObject, reward: Reward) {
    P.showRestored(this, v, reward);
  }

  showUpgraded(id: string, level: number) {
    P.showUpgraded(this, id, level);
  }

  showBonuses() {
    P.showBonuses(this);
  }

  showQuests() {
    P.showQuests(this);
  }

  showCozy() {
    P.showCozy(this);
  }

  showStreet(i: number) {
    P.showStreet(this, i);
  }

  showDecor(slot: number) {
    P.showDecor(this, slot);
  }

  go(scene: string, data?: object) {
    this.cameras.main.fadeOut(180, 11, 15, 39);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start(scene, data));
  }
}

function drawIconAt(g: Phaser.GameObjects.Graphics, name: Parameters<typeof drawIcon>[1], x: number, y: number, s: number, color: number) {
  g.save();
  g.translateCanvas(x, y);
  drawIcon(g, name, s, color);
  g.restore();
}

/** Горящая постройка оживает: свет в окнах мерцает, дым из труб, лопасти и луч крутятся, жители у входа. */
export function decorateLit(scene: Phaser.Scene, c: Phaser.GameObjects.Container, b: BuildingView, s: number, groundY: number, id: string) {
  void id;
  for (const l of b.lights) {
    const img = scene.add.image(l.x * s, groundY + l.y * s, 'glow').setTint(l.c ?? 0xffc65c).setBlendMode(Phaser.BlendModes.ADD).setScale((l.r * s) / 34).setAlpha(0.75);
    c.add(img);
    // Мелкие огоньки гирлянд не мерцают по отдельности (их десятки) — только окна и фонари.
    if (l.r >= 9) scene.tweens.add({ targets: img, alpha: 0.45, duration: Phaser.Math.Between(900, 1700), yoyo: true, repeat: -1, ease: 'Sine.inOut' });
  }
  for (const ch of b.chimneys) {
    c.add(
      scene.add.particles(ch.x * s, groundY + ch.y * s, 'glow', {
        lifespan: 2800,
        speedY: { min: -38, max: -22 },
        speedX: { min: -4, max: 14 },
        scale: { start: 0.22 * s, end: 0.75 * s },
        alpha: { start: 0.28, end: 0 },
        tint: 0xa8aec4,
        frequency: 380,
      }),
    );
  }
  if (b.rotor) scene.tweens.add({ targets: b.rotor, angle: 360, duration: 14000, repeat: -1 });
  if (b.beam) {
    const beam = scene.add.image(b.beam.x * s, groundY + b.beam.y * s, 'cone').setOrigin(0, 0.5).setTint(0xffe2a0).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.4).setScale(2.6 * s, 1.1 * s);
    c.add(beam);
    scene.tweens.add({ targets: beam, angle: 360, duration: 9000, repeat: -1 });
  }
  // Жители-силуэты у входа (на высоких уровнях — больше).
  const n = b.residents ?? 1;
  const w = (b.width ?? 200) * 0.5 + 30;
  for (let i = 0; i < n; i++) {
    const fig = scene.add.graphics();
    fig.fillStyle(0x070a18, 1);
    fig.fillCircle(0, -44, 9);
    fig.fillTriangle(-15, 0, 15, 0, 0, -38);
    const side = i % 2 ? 1 : -1;
    fig.setPosition(side * (w + Math.floor(i / 2) * 36) * s, groundY + 4).setScale(Math.max(1, s));
    c.add(fig);
    scene.tweens.add({ targets: fig, y: groundY, duration: 1100 + i * 300, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
  }
}
