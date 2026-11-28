// Окна «Деревни 2.0» (по центру, src/ui/Modal.ts): постройка по уровням (восстановить → улучшить → расцвет),
// «снова горит свет» / «стала краше» (до → после), улица (до → после), выбор украшения в слоте, уют и его награды,
// задания жителей, бонусы деревни, сундук дня. В любом окне покупки при нехватке — «Не хватает N» и подсказки.

import Phaser from 'phaser';
import { sfx } from '../audio';
import { activeBonuses, bonusValue, buildingLevel, coins, nextInDistrict, nextLevelCost, villageById, type Reward, type VillageObject } from '../core/economy';
import type { Quest } from '../core/quests';
import { cozyRewardAt, decorCost, decorOwned, decorPlaced, streetNextPrice, streetStep } from '../core/village';
import { BONUS, BUILDINGS, buildingDef, COZY, decorType, decorVariants, DISTRICTS, type DistrictId } from '../core/villageData';
import { haptics } from '../haptics';
import { t, tk } from '../i18n';
import { buyStreet, canAfford, claimChest, claimCozy, claimQuest, cozy, districtOpen, getEconomy, quests, rerollQuestMeta, rerollsLeft, restoreVillage, setDecor, upgradeVillage, wallet } from '../meta';
import { Button, drawIcon } from './draw';
import { bonusIcon, itemIcon, rewardCaption, rewardIcon } from './itemPreview';
import { buttonRichLabel, drawCoin, drawLight, richText, smartText, toast } from './meta';
import { Modal } from './Modal';
import { addEarnHints } from './notEnough';
import { showBuyCoins } from './storeUi';
import { questRewardText, questText, residentName } from './questText';
import { C } from './theme';
import { uiText } from './UIText';
import { decorIcon, drawBuilding, drawResident, streetSample } from './village';

/** Что окнам нужно от сцены деревни. */
export interface VillageHost extends Phaser.Scene {
  district: DistrictId;
  modal?: Modal;
  refresh(): void;
  closeModal(): void;
}

const name = (id: string) => tk(`building.${id}.name`);
const bonusText = (id: string, n: number) => tk(`bonus.${id}`, { n });
export const restoreCostOf = (id: string) => villageById(id)?.cost ?? 0;

export function toastMsg(host: VillageHost, msg: string) {
  toast(host, msg, host.cameras.main.worldView.centerY);
}

function newModal(host: VillageHost, w = 940): Modal {
  host.closeModal();
  const m = new Modal(host, { w, onClose: () => (host.modal = undefined) });
  host.modal = m;
  return m;
}

// ---------------------------------------------------------------------------
// Иллюстрация постройки

/** Крупная иллюстрация постройки (уровень 0 — заброшена), с подсветкой и оживлением. */
export function illustration(host: Phaser.Scene, id: string, level: number, size = 360) {
  const scene = host;
  const c = scene.add.container(0, 0);
  const lit = level > 0;
  const b = drawBuilding(scene, id, lit, Math.max(1, level));
  const s = Math.min(1.5, size / Math.max(200, b.height + 40), 520 / Math.max(200, (b.width ?? 260) + 60));
  const back = scene.add.graphics();
  back.fillStyle(lit ? 0x2a2440 : 0x111530, 1);
  back.fillEllipse(0, 0, 560, size * 0.95);
  back.fillStyle(lit ? 0x3a2e3a : 0x0b0f22, 1);
  back.fillEllipse(0, size * 0.42, 540, 90);
  c.add(back);
  if (lit) c.add(scene.add.image(0, size * 0.42 - b.height * s * 0.35, 'glow').setTint(0xffb84d).setBlendMode(Phaser.BlendModes.ADD).setScale(3.4 * s + level * 0.3, 2.4 * s + level * 0.2).setAlpha(0.2 + level * 0.04));
  const body = scene.add.container(0, size * 0.42, b.objects).setScale(s);
  c.add(body);
  if (lit) {
    for (const l of b.lights) {
      const img = scene.add.image(l.x * s, size * 0.42 + l.y * s, 'glow').setTint(l.c ?? 0xffc65c).setBlendMode(Phaser.BlendModes.ADD).setScale((l.r * s) / 34).setAlpha(0.75);
      c.add(img);
      if (l.r >= 9) scene.tweens.add({ targets: img, alpha: 0.45, duration: Phaser.Math.Between(900, 1700), yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    }
    if (b.rotor) scene.tweens.add({ targets: b.rotor, angle: 360, duration: 14000, repeat: -1 });
  }
  return { c, body, s };
}

/** Уровень постройки — три огонька с подписью «Уровень 2 из 3». */
function levelPips(host: VillageHost, level: number, width: number) {
  const c = host.add.container(0, 0);
  const g = host.add.graphics();
  for (let k = 0; k < 3; k++) {
    g.fillStyle(k < level ? 0xffd36b : 0x000000, k < level ? 1 : 0.45);
    g.fillCircle(-width / 2 + 30 + k * 44, 0, 14);
    g.lineStyle(3, 0xffd36b, 0.8);
    g.strokeCircle(-width / 2 + 30 + k * 44, 0, 14);
  }
  c.add(g);
  c.add(uiText(host, -width / 2 + 170, 0, t('building_level', { n: level }), { w: width - 190, size: 32, color: C.text, bold: true, originX: 0, align: 'left' }));
  return c;
}

/** Карточки «что даст»: награды и бонусы с иконками и подписями. */
function cards(host: VillageHost, list: { icon: Phaser.GameObjects.GameObject; caption: string; tag?: string; tone?: 'bonus' | 'next' | 'plain' }[], width: number, h = 200) {
  const c = host.add.container(0, 0);
  const gap = 24;
  const cw = Math.min(420, (width - gap * (list.length - 1)) / list.length);
  list.forEach((card, i) => {
    const x = (i - (list.length - 1) / 2) * (cw + gap);
    const g = host.add.graphics();
    const tone = card.tone ?? 'plain';
    g.fillStyle(tone === 'bonus' ? 0x2a3418 : tone === 'next' ? 0x2e2440 : C.card, 1);
    g.fillRoundedRect(x - cw / 2, -h / 2, cw, h, 30);
    g.lineStyle(3, tone === 'bonus' ? 0x9dff5c : tone === 'next' ? 0xd8b8ff : C.cardEdge, 0.7);
    g.strokeRoundedRect(x - cw / 2, -h / 2, cw, h, 30);
    c.add(g);
    (card.icon as unknown as Phaser.GameObjects.Components.Transform).setPosition?.(x, -h / 2 + 70);
    c.add(card.icon);
    if (card.tag) c.add(uiText(host, x, -h / 2 + 22, card.tag, { w: cw - 40, size: 20, color: tone === 'next' ? '#d8b8ff' : '#9dff5c' }));
    c.add(smartText(host, x, h / 2 - 48, card.caption, { w: cw - 30, lines: 3, h: 86, size: 27 }));
  });
  return c;
}

// ---------------------------------------------------------------------------
// Постройка

/** Окно постройки: заброшена — восстановить за свет; восстановлена — уровень, бонус сейчас и на следующем уровне, улучшение. */
export function showBuilding(host: VillageHost, v: VillageObject) {
  const e = getEconomy();
  const def = buildingDef(v.id)!;
  const level = buildingLevel(e, v.id);
  const m = newModal(host);
  m.add(illustration(host, v.id, level).c, 360, 26);
  m.title(name(v.id), 60);
  if (level === 0) {
    const cost = restoreCostOf(v.id);
    const next = nextInDistrict(e, def.district);
    const light = wallet().light;
    m.text(tk(`building.${v.id}.story`), 36, C.textDim, 2);
    m.add(uiText(host, 0, 0, t('restore_gives'), { w: m.inner, size: 34, color: '#ffd36b' }), 46, 14);
    m.add(cards(host, [{ icon: rewardIcon(host, def.reward, 110), caption: rewardCaption(def.reward) }, { icon: bonusIcon(host, v.id, 100), caption: bonusText(v.id, bonusValue(e, v.id, 1)), tag: t('restore_bonus_tag'), tone: 'bonus' }], m.inner), 200, 26);
    m.rich(t('restore_price', { n: cost }), 40);
    if (next?.id !== v.id) m.text(t('restore_first', { name: next ? name(next.id) : '' }), 36, C.text, 2, true);
    else if (light >= cost) m.buttons([buttonRichLabel(new Button(host, 0, 0, { w: 560, h: 130, primary: true, onClick: () => restore(host, v) }), t('restore_button_cost', { n: cost }), 46)]);
    else {
      m.buttons([buttonRichLabel(new Button(host, 0, 0, { w: 560, h: 120, primary: true, onClick: () => undefined }), t('restore_button'), 44).setEnabled(false)]);
      m.rich(t('not_enough_light', { n: cost - light }), 40, '#ff9a8a');
      addEarnHints(host, m, 'light');
    }
    m.open();
    return;
  }
  m.text(tk(`building.${v.id}.lit`), 34, C.textDim, 2);
  m.add(levelPips(host, level, m.inner), 50, 16);
  const list: Parameters<typeof cards>[1] = [{ icon: bonusIcon(host, v.id, 100), caption: bonusText(v.id, bonusValue(e, v.id)), tag: t('bonus_now'), tone: 'bonus' }];
  const c = nextLevelCost(e, v.id);
  if (c) list.push({ icon: bonusIcon(host, v.id, 100), caption: bonusText(v.id, bonusValue(e, v.id, c.level)), tag: t('bonus_next', { n: c.level }), tone: 'next' });
  m.add(cards(host, list, m.inner, 230), 230, 20);
  // Что изменится на вид.
  if (c) m.text(t(c.level === 2 ? 'upgrade_look_2' : 'upgrade_look_3'), 30, '#d8b8ff', 2);
  if (!c) {
    m.text(t('building_max'), 36, '#ffd36b', 2, true);
    m.buttons([new Button(host, 0, 0, { w: 360, h: 110, label: t('rule_ok'), primary: true, onClick: () => host.closeModal() })]);
    m.open();
    return;
  }
  const price = c.light ? t('upgrade_price_both', { n: c.coins, m: c.light }) : t('upgrade_price', { n: c.coins });
  m.rich(price, 40);
  const have = coins(e);
  const light = wallet().light;
  const label = t(c.level === 2 ? 'upgrade_button' : 'bloom_button');
  if (have >= c.coins && light >= c.light) {
    m.buttons([buttonRichLabel(new Button(host, 0, 0, { w: 560, h: 130, primary: true, onClick: () => upgrade(host, v.id) }), label, 46)]);
  } else {
    m.buttons([buttonRichLabel(new Button(host, 0, 0, { w: 560, h: 120, primary: true, onClick: () => undefined }), label, 44).setEnabled(false)]);
    const short = have < c.coins ? 'coins' : 'light';
    m.rich(short === 'coins' ? t('not_enough_coins', { n: c.coins - have }) : t('not_enough_light', { n: c.light - light }), 40, '#ff9a8a');
    addEarnHints(host, m, short);
  }
  m.open();
}

function restore(host: VillageHost, v: VillageObject) {
  host.closeModal();
  const res = restoreVillage(v.id);
  if (!res.ok) {
    sfx.invalid();
    toastMsg(host, t('not_enough_light', { n: restoreCostOf(v.id) - wallet().light }));
    return;
  }
  host.refresh();
  showRestored(host, v, res.value);
}

function upgrade(host: VillageHost, id: string) {
  host.closeModal();
  const res = upgradeVillage(id);
  if (!res.ok) {
    sfx.invalid();
    toastMsg(host, t('unavailable'));
    return;
  }
  host.refresh();
  showUpgraded(host, id, res.value);
}

/** До → после: строительные искры, вспышка, постройка загорается (или становится наряднее). */
function beforeAfter(host: VillageHost, m: Modal, id: string, from: number, to: number) {
  const stage = host.add.container(0, 0);
  const before = illustration(host, id, from);
  const after = illustration(host, id, to);
  after.c.setAlpha(0);
  stage.add([before.c, after.c]);
  m.add(stage, 360, 26);
  sfx.lantern(2);
  haptics.tap();
  const sparks = host.add.particles(0, 0, 'glow', {
    speed: { min: 80, max: 320 },
    scale: { start: 0.35, end: 0 },
    alpha: { start: 1, end: 0 },
    lifespan: 900,
    gravityY: 200,
    blendMode: Phaser.BlendModes.ADD,
    tint: [0xffd36b, 0xfff1cc, 0xffb84d],
    emitting: false,
  });
  stage.add(sparks);
  for (let i = 0; i < 5; i++) host.time.delayedCall(250 + i * 160, () => sparks.explode(18, Phaser.Math.Between(-120, 120), Phaser.Math.Between(-60, 120)));
  host.tweens.add({ targets: before.body, scaleX: before.s * 1.04, scaleY: before.s * 1.04, duration: 160, yoyo: true, repeat: 2, delay: 250 });
  host.time.delayedCall(1100, () => {
    host.tweens.add({ targets: after.c, alpha: 1, duration: 600 });
    host.tweens.add({ targets: before.c, alpha: 0, duration: 600 });
    sfx.win();
    haptics.win();
  });
}

/** «{name}: снова горит свет!» — до → после, награды карточками. */
export function showRestored(host: VillageHost, v: VillageObject, reward: Reward) {
  const m = newModal(host);
  beforeAfter(host, m, v.id, 0, 1);
  m.title(t('restored_title', { name: name(v.id) }), 56);
  m.add(cards(host, [{ icon: rewardIcon(host, reward, 110), caption: rewardCaption(reward) }, { icon: bonusIcon(host, v.id, 100), caption: bonusText(v.id, bonusValue(getEconomy(), v.id, 1)), tag: t('restore_bonus_tag'), tone: 'bonus' }], m.inner), 200, 30);
  m.buttons([new Button(host, 0, 0, { w: 380, h: 120, label: t('restored_ok'), primary: true, onClick: () => host.closeModal() })]);
  m.open();
}

/** Улучшение и расцвет: «стала краше» — до → после, новый бонус. */
export function showUpgraded(host: VillageHost, id: string, level: number) {
  const m = newModal(host);
  beforeAfter(host, m, id, level - 1, level);
  m.title(t(level === 3 ? 'bloom_title' : 'upgraded_title', { name: name(id) }), 54);
  m.text(t(level === 3 ? 'upgrade_look_3' : 'upgrade_look_2'), 34, C.textDim, 2);
  m.add(cards(host, [{ icon: bonusIcon(host, id, 100), caption: bonusText(id, bonusValue(getEconomy(), id, level)), tag: t('bonus_now'), tone: 'bonus' }], m.inner), 200, 30);
  m.buttons([new Button(host, 0, 0, { w: 380, h: 120, label: t('restored_ok'), primary: true, onClick: () => host.closeModal() })]);
  m.open();
}

// ---------------------------------------------------------------------------
// Бонусы деревни: по районам, уровень постройки, что даёт сейчас / что даст

export function showBonuses(host: VillageHost) {
  sfx.tap();
  const e = getEconomy();
  const active = new Map(activeBonuses(e).map((b) => [b.id, b]));
  const m = newModal(host, 960);
  m.title(t('village_bonuses'), 56);
  if (!active.size) m.text(t('village_bonuses_empty'), 34, C.textDim, 3);
  const list = DISTRICTS.filter((d) => districtOpen(d)).flatMap((d) => BUILDINGS.filter((b) => b.district === d && BONUS[b.id]));
  // В открытых районах — все постройки; не больше 12 строк: сначала действующие.
  const rows = [...list.filter((b) => active.has(b.id)), ...list.filter((b) => !active.has(b.id))].slice(0, 12);
  for (const v of rows) {
    const a = active.get(v.id);
    const row = host.add.container(0, 0);
    const ic = bonusIcon(host, v.id, 64).setPosition(-m.inner / 2 + 42, 0).setAlpha(a ? 1 : 0.35);
    const title = a ? `${name(v.id)} · ${t('building_level_short', { n: a.level })}` : name(v.id);
    const nm = uiText(host, -m.inner / 2 + 96, -19, title, { w: m.inner - 110, size: 27, color: a ? '#ffd36b' : C.textDim, originX: 0, align: 'left' });
    const desc = smartText(host, -m.inner / 2 + 96, 19, bonusText(v.id, a ? a.value : bonusValue(e, v.id, 1)), { w: m.inner - 110, size: 25, color: a ? C.text : C.textDim, bold: false, originX: 0, lines: 1 });
    row.add([ic, nm, desc]);
    m.add(row, 78, 6);
  }
  m.open();
}

// ---------------------------------------------------------------------------
// Улицы

export function showStreet(host: VillageHost, i: number) {
  sfx.tap();
  const d = host.district;
  const e = getEconomy();
  const step = streetStep(e, d, i);
  const price = streetNextPrice(e, d, i);
  const m = newModal(host);
  m.title(tk(`street.${d}.${i}`), 56);
  // До → после: кусок улицы сейчас и на следующем шаге.
  const stage = host.add.container(0, 0);
  const w = (m.inner - 120) / 2;
  const a = streetSample(host, step as 0 | 1 | 2 | 3, w, 220).setPosition(-w / 2 - 60, 0);
  stage.add(a);
  stage.add(uiText(host, -w / 2 - 60, 140, tk(`street_step.${step}`), { w, size: 28, color: C.textDim }));
  if (price !== null) {
    const b = streetSample(host, (step + 1) as 0 | 1 | 2 | 3, w, 220).setPosition(w / 2 + 60, 0);
    const arrow = host.add.graphics();
    drawIcon(arrow, 'arrowRight', 60, 0xffd36b);
    stage.add([b, arrow, uiText(host, w / 2 + 60, 140, tk(`street_step.${step + 1}`), { w, size: 28, color: '#ffd36b', bold: true })]);
  } else a.setPosition(0, 0);
  m.add(stage, 320, 24);
  m.text(t('street_text'), 32, C.textDim, 2);
  if (price === null) {
    m.text(t('street_max'), 36, '#ffd36b', 2, true);
    m.buttons([new Button(host, 0, 0, { w: 360, h: 110, label: t('rule_ok'), primary: true, onClick: () => host.closeModal() })]);
  } else if (coins(e) >= price) {
    m.buttons([buttonRichLabel(new Button(host, 0, 0, { w: 560, h: 120, primary: true, onClick: () => buyStreetStep(host, i) }), t('street_button', { n: price }), 42)]);
  } else {
    m.buttons([buttonRichLabel(new Button(host, 0, 0, { w: 560, h: 120, primary: true, onClick: () => undefined }), t('street_button', { n: price }), 42).setEnabled(false)]);
    m.rich(t('not_enough_coins', { n: price - coins(e) }), 40, '#ff9a8a');
    addEarnHints(host, m, 'coins');
  }
  m.open();
}

function buyStreetStep(host: VillageHost, i: number) {
  const res = buyStreet(host.district, i);
  host.closeModal();
  if (!res.ok) return sfx.invalid();
  sfx.lantern(1);
  haptics.place();
  host.refresh();
  toastMsg(host, t('street_done', { step: tk(`street_step.${res.value}`) }));
}

// ---------------------------------------------------------------------------
// Украшения: выбор варианта в слоте

export function showDecor(host: VillageHost, slot: number) {
  sfx.tap();
  const d = host.district;
  const e = getEconomy();
  const type = decorType(slot);
  const n = decorVariants(slot);
  const placed = decorPlaced(e, d, slot);
  const m = newModal(host, 980);
  m.title(tk(`decor.${type}`), 56);
  m.text(t('decor_text'), 30, C.textDim, 2);
  // Сетка вариантов: картинка, название, цена / «Куплено» / «Стоит».
  const cols = n <= 3 ? n : n === 4 ? 2 : 3;
  const rowsN = Math.ceil(n / cols);
  const gap = 20;
  const cw = (m.inner - gap * (cols - 1)) / cols;
  const ch = 300;
  const grid = host.add.container(0, 0);
  for (let v = 0; v < n; v++) {
    const col = v % cols;
    const row = Math.floor(v / cols);
    const x = -m.inner / 2 + cw / 2 + col * (cw + gap);
    const y = -((rowsN - 1) * (ch + gap)) / 2 + row * (ch + gap);
    const owned = decorOwned(e, d, slot, v);
    const isPlaced = placed === v;
    const price = decorCost(e, d, v);
    const g = host.add.graphics();
    g.fillStyle(isPlaced ? 0x3a2e1a : C.card, 1);
    g.fillRoundedRect(x - cw / 2, y - ch / 2, cw, ch, 26);
    g.lineStyle(isPlaced ? 5 : 3, isPlaced ? 0xffd36b : C.cardEdge, isPlaced ? 1 : 0.7);
    g.strokeRoundedRect(x - cw / 2, y - ch / 2, cw, ch, 26);
    grid.add(g);
    grid.add(decorIcon(host, type, v, 150).setPosition(x, y - 58));
    grid.add(uiText(host, x, y + 50, tk(`decor.${type}.${v}`), { w: cw - 24, lines: 2, size: 25, color: C.text, bold: true }));
    let label: string;
    if (isPlaced) label = t('decor_placed');
    else if (owned) label = t('decor_place');
    else label = t(price.currency === 'light' ? 'buy_for_light' : 'buy_for', { n: price.amount });
    const ok = canAfford(price);
    const btn = buttonRichLabel(
      new Button(host, x, y + 108, { w: cw - 30, h: 64, primary: !isPlaced && (owned || ok), maxW: cw - 16, onClick: () => pickDecor(host, slot, v) }),
      label,
      26,
      isPlaced || owned || ok,
    );
    if (isPlaced) btn.setEnabled(false);
    grid.add(btn);
  }
  m.add(grid, rowsN * ch + (rowsN - 1) * gap, 24);
  const list: Button[] = [];
  if (placed >= 0) list.push(new Button(host, 0, 0, { w: 300, h: 100, icon: 'trash', label: t('decor_remove'), fontSize: 32, onClick: () => (setDecor(d, slot, -1), host.closeModal(), host.refresh()) }));
  list.push(new Button(host, 0, 0, { w: 300, h: 100, label: t('rule_ok'), primary: true, onClick: () => host.closeModal() }));
  m.buttons(list);
  m.open();
}

function pickDecor(host: VillageHost, slot: number, v: number) {
  const d = host.district;
  const e = getEconomy();
  const owned = decorOwned(e, d, slot, v);
  const price = decorCost(e, d, v);
  if (!owned && !canAfford(price)) {
    // «Не хватает монет / света» — в этом же окне: заменяем содержимое.
    const m = newModal(host, 920);
    sfx.invalid();
    const light = price.currency === 'light';
    m.add(decorIcon(host, decorType(slot), v, 160), 170, 10);
    m.rich(light ? t('not_enough_light', { n: price.amount - wallet().light }) : t('not_enough_coins', { n: price.amount - coins(e) }), 50, '#ff9a8a');
    addEarnHints(host, m, price.currency);
    // Монеты можно докупить (покупка в приложении; в веб-версии окно скажет «в приложении»).
    if (!light) m.buttons([new Button(host, 0, 0, { w: 380, h: 100, icon: 'bag', label: t('buy_more'), fontSize: 34, primary: true, onClick: () => (host.closeModal(), showBuyCoins(host)) })]);
    m.open();
    return;
  }
  const res = setDecor(d, slot, v);
  if (!res.ok) return sfx.invalid();
  if (res.value) {
    sfx.lantern(1);
    haptics.place();
  } else sfx.tap();
  host.closeModal();
  host.refresh();
}

// ---------------------------------------------------------------------------
// Уют

const cozyRewardIcon = (host: VillageHost, n: number, size: number): Phaser.GameObjects.Graphics => {
  const r = cozyRewardAt(n);
  const g = host.add.graphics();
  if ('coins' in r) drawCoin(g, 0, 0, size * 0.4);
  else if ('light' in r) drawLight(g, 0, 0, size * 0.4);
  else if ('item' in r) drawIcon(g, 'wardrobe', size * 0.8, C.icon);
  else if ('street' in r) drawIcon(g, 'hammer', size * 0.8, C.icon);
  else drawIcon(g, 'chest', size * 0.8, C.icon);
  return g;
};
const cozyRewardText = (n: number, mult: number) => {
  const r = cozyRewardAt(n);
  if ('coins' in r) return t('reward.coins', { n: Math.round((r.coins * mult) / 5) * 5 });
  if ('light' in r) return t('reward.light', { n: r.light });
  if ('street' in r) return t('cozy_reward_street');
  return 'item' in r ? t('cozy_reward_item') : t('cozy_reward_chest');
};

export function showCozy(host: VillageHost) {
  sfx.tap();
  const cz = cozy();
  const e = getEconomy();
  const m = newModal(host);
  m.title(t('cozy_title', { n: cz.level }), 56);
  // Шкала до следующей награды.
  const bar = host.add.container(0, 0);
  const bw = m.inner - 40;
  const g = host.add.graphics();
  g.fillStyle(0x000000, 0.45);
  g.fillRoundedRect(-bw / 2, -22, bw, 44, 22);
  g.fillStyle(0xff8fb8, 1);
  g.fillRoundedRect(-bw / 2, -22, Math.max(44, (bw * cz.into) / cz.step), 44, 22);
  bar.add([g, richText(host, 0, 0, t('cozy_points', { n: cz.into, m: cz.step }), 28, C.text, true, bw - 40)]);
  m.add(bar, 50, 20);
  m.text(t('cozy_how', { b: COZY.building[0], d: COZY.decor, s: COZY.street }), 30, C.textDim, 3);
  // Награды: следующие три (первая — получить, если готова).
  const mult = 1;
  const list = [0, 1, 2].map((k) => {
    const n = e.cozyClaimed + k;
    return { icon: cozyRewardIcon(host, n, 100), caption: cozyRewardText(n, mult), tag: k < cz.pending ? t('cozy_ready') : t('cozy_at_level', { n: n + 2 }), tone: (k < cz.pending ? 'bonus' : 'plain') as 'bonus' | 'plain' };
  });
  m.add(cards(host, list, m.inner), 200, 26);
  if (cz.pending) {
    m.buttons([new Button(host, 0, 0, { w: 460, h: 120, icon: 'gift', label: t('cozy_claim'), primary: true, onClick: () => takeCozy(host) })]);
  } else {
    m.buttons([new Button(host, 0, 0, { w: 360, h: 110, label: t('rule_ok'), primary: true, onClick: () => host.closeModal() })]);
  }
  m.open();
}

function takeCozy(host: VillageHost) {
  const got = claimCozy();
  host.closeModal();
  if (!got) return;
  sfx.win();
  haptics.win();
  host.refresh();
  const m = newModal(host, 820);
  m.title(t('cozy_got_title'), 52);
  if (got.item) {
    m.add(itemIcon(host, got.item, 150), 160, 10);
    m.text(tk(`item.${got.item}`), 36, C.text, 2, true);
  }
  if (got.coins) m.rich(t('reward.coins', { n: got.coins }), 50, '#ffd36b');
  if (got.light) m.rich(t('reward.light', { n: got.light }), 50, '#ffc65c');
  if (got.street) m.text(t('street_free', { name: tk(`street.${got.street.replace(':', '.')}`) }), 36, '#ffd36b', 2, true);
  m.buttons([new Button(host, 0, 0, { w: 360, h: 110, label: t('restored_ok'), primary: true, onClick: () => (host.closeModal(), cozy().pending && showCozy(host)) })]);
  m.open();
}

// ---------------------------------------------------------------------------
// Задания жителей

function questCard(host: VillageHost, m: Modal, q: Quest, weekly: boolean, rerolls: number) {
  const w = m.inner;
  const h = weekly ? 230 : 200;
  const c = host.add.container(0, 0);
  const done = q.progress >= q.target;
  const g = host.add.graphics();
  g.fillStyle(q.claimed ? 0x1a1e3a : weekly ? 0x2e2440 : C.card, 1);
  g.fillRoundedRect(-w / 2, -h / 2, w, h, 30);
  g.lineStyle(3, done && !q.claimed ? 0x9dff5c : weekly ? 0xd8b8ff : C.cardEdge, 0.8);
  g.strokeRoundedRect(-w / 2, -h / 2, w, h, 30);
  c.add(g);
  // Житель слева.
  c.add(drawResident(host, q.resident, 120).setPosition(-w / 2 + 84, -14));
  c.add(uiText(host, -w / 2 + 84, h / 2 - 34, residentName(q.resident), { w: 150, size: 21, color: C.textDim }));
  // Текст задания и прогресс.
  const tx = -w / 2 + 170;
  const tw = w - 170 - 250;
  if (weekly) c.add(uiText(host, tx, -h / 2 + 28, t('quest_weekly'), { w: tw, size: 22, color: '#d8b8ff', bold: true, originX: 0, align: 'left' }));
  c.add(uiText(host, tx, weekly ? -24 : -34, questText(q), { w: tw, lines: 2, size: 31, color: q.claimed ? C.textDim : C.text, bold: true, originX: 0, align: 'left' }));
  const pg = host.add.graphics();
  const py = weekly ? 48 : 38;
  const bw = tw - 100;
  pg.fillStyle(0x000000, 0.45);
  pg.fillRoundedRect(tx, py - 14, bw, 28, 14);
  pg.fillStyle(done ? 0x9dff5c : 0xffd36b, 1);
  pg.fillRoundedRect(tx, py - 14, Math.max(28, (bw * Math.min(q.progress, q.target)) / q.target), 28, 14);
  c.add(pg);
  c.add(uiText(host, tx + bw + 50, py, `${Math.min(q.progress, q.target)}/${q.target}`, { w: 96, size: 26, color: done ? '#9dff5c' : C.text, bold: true }));
  // Награда и кнопка справа.
  const rx = w / 2 - 125;
  c.add(richText(host, rx, -h / 2 + 50, questRewardText(q) + (q.chest ? ` + ${t('quest_chest')}` : ''), 28, '#ffd36b', true, 230, false, 2));
  if (q.chest) c.add(uiText(host, rx, -h / 2 + 108, t('quest_street'), { w: 230, size: 22, color: '#ffd36b' }));
  if (q.claimed) c.add(uiText(host, rx, 30, t('quest_claimed'), { w: 220, size: 28, color: '#9dff5c', bold: true }));
  else if (done) {
    const b = new Button(host, rx, 30, { w: 210, h: 84, label: t('quest_claim'), primary: true, fontSize: 32, maxW: 230, onClick: () => takeQuest(host, q.id) });
    host.tweens.add({ targets: b, scale: 1.06, duration: 500, yoyo: true, repeat: -1 });
    c.add(b);
  } else if (!weekly && rerolls > 0) {
    c.add(new Button(host, rx, 30, { w: 210, h: 76, icon: 'restart', label: t('quest_reroll'), fontSize: 26, maxW: 230, onClick: () => (rerollQuestMeta(q.id) ? (sfx.tap(), showQuests(host)) : sfx.invalid()) }));
  }
  m.add(c, h, 16);
}

export function showQuests(host: VillageHost) {
  sfx.tap();
  const qs = quests();
  const m = newModal(host, 980);
  m.title(t('quests_title'), 56);
  m.text(t('quests_text'), 30, C.textDim, 2);
  const rr = rerollsLeft();
  for (const q of qs.daily) questCard(host, m, q, false, rr);
  if (qs.weekly) questCard(host, m, qs.weekly, true, 0);
  if (rr > 0) m.text(t('quest_rerolls_left', { n: rr }), 26, C.textDim, 1);
  m.open();
}

function takeQuest(host: VillageHost, id: string) {
  const res = claimQuest(id);
  if (!res) return sfx.invalid();
  sfx.win();
  haptics.win();
  host.refresh();
  showQuests(host);
  const parts = [res.coins ? t('reward.coins', { n: res.coins }) : '', res.light ? t('reward.light', { n: res.light }) : '', res.item ? tk(`item.${res.item}`) : '', res.street ? t('street_free', { name: tk(`street.${res.street.replace(':', '.')}`) }) : ''].filter(Boolean).join('  ');
  toastMsg(host, parts);
}

// ---------------------------------------------------------------------------
// Сундук фонарной площади: раз в день — монеты, иногда вещь

export function openChest(host: VillageHost) {
  const res = claimChest();
  if (!res) return;
  sfx.win();
  haptics.win();
  host.refresh();
  const m = newModal(host, 820);
  const ic = host.add.graphics();
  ic.fillStyle(0xffc65c, 0.18);
  ic.fillCircle(0, 0, 110);
  drawIcon(ic, 'chest', 150, 0xd98a1f);
  m.add(ic, 230, 10);
  m.title(t('village_chest_title'), 52);
  m.rich(t('reward.coins', { n: res.coins }), 52, '#ffd36b');
  if (res.item) {
    m.add(itemIcon(host, res.item, 140), 150, 10);
    m.text(t('village_chest_item', { item: tk(`item.${res.item}`) }), 36, C.text, 2, true);
  }
  m.text(t('village_chest_text'), 30, C.textDim, 2);
  m.buttons([new Button(host, 0, 0, { w: 360, h: 110, label: t('restored_ok'), primary: true, onClick: () => host.closeModal() })]);
  m.open();
}
