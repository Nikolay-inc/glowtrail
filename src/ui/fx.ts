// Атмосфера: темнота и свет. Виньетка, медленный туман, пылинки в воздухе, раскрытие сцены из темноты,
// лучи при зажигании фонаря. Всё рисуется кодом, без картинок.

import Phaser from 'phaser';

import { currentView, type ViewRect } from './viewport';

/** Игрок попросил систему меньше анимаций — фон делаем спокойным. */
export function reducedMotion(): boolean {
  try {
    return typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/** Текстуры для эффектов (вызывается один раз при загрузке). */
export function createFxTextures(scene: Phaser.Scene) {
  if (!scene.textures.exists('vignette')) {
    // Тёмные края экрана, прозрачный центр.
    const w = 270;
    const h = 480;
    const tex = scene.textures.createCanvas('vignette', w, h)!;
    const ctx = tex.getContext();
    const grd = ctx.createRadialGradient(w / 2, h * 0.45, h * 0.18, w / 2, h * 0.45, h * 0.72);
    grd.addColorStop(0, 'rgba(3,4,16,0)');
    grd.addColorStop(0.6, 'rgba(3,4,16,0.35)');
    grd.addColorStop(1, 'rgba(3,4,16,0.85)');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, w, h);
    tex.refresh();
  }
  if (!scene.textures.exists('cone')) {
    // Конус света фонаря: вершина слева посередине, луч уходит вправо (поворачивается по направлению дороги).
    const w = 256;
    const h = 256;
    const tex = scene.textures.createCanvas('cone', w, h)!;
    const ctx = tex.getContext();
    const grd = ctx.createRadialGradient(0, h / 2, 0, 0, h / 2, w);
    grd.addColorStop(0, 'rgba(255,255,255,0.95)');
    grd.addColorStop(0.5, 'rgba(255,255,255,0.4)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.moveTo(0, h / 2);
    const spread = Math.tan((28 * Math.PI) / 180);
    ctx.lineTo(w, h / 2 - w * spread);
    ctx.quadraticCurveTo(w * 1.08, h / 2, w, h / 2 + w * spread);
    ctx.closePath();
    ctx.fill();
    tex.refresh();
  }
  if (!scene.textures.exists('ray')) {
    // Луч света: узкий клин, яркий у основания.
    const w = 64;
    const h = 256;
    const tex = scene.textures.createCanvas('ray', w, h)!;
    const ctx = tex.getContext();
    const grd = ctx.createLinearGradient(0, h, 0, 0);
    grd.addColorStop(0, 'rgba(255,255,255,0.9)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.moveTo(w / 2 - 6, h);
    ctx.lineTo(w / 2 + 6, h);
    ctx.lineTo(w, 0);
    ctx.lineTo(0, 0);
    ctx.closePath();
    ctx.fill();
    tex.refresh();
  }
}

/** Затемнение по краям экрана — поверх фона, под полем и кнопками. */
export function addVignette(scene: Phaser.Scene, v: ViewRect = currentView(scene)) {
  return scene.add.image(v.x + v.w / 2, v.y + v.h / 2, 'vignette').setDisplaySize(v.w, v.h).setDepth(-7);
}

/** Медленно плывущий туман: огромные мягкие пятна холодных цветов. */
export function addFog(scene: Phaser.Scene, v: ViewRect = currentView(scene)) {
  const colors = [0x3b2a80, 0x1c3f7a, 0x4a2468, 0x153a5c];
  const calm = reducedMotion();
  colors.forEach((tint, i) => {
    const fog = scene.add
      .image(Phaser.Math.Between(v.x, v.x + v.w), Phaser.Math.Between(v.y + 200, v.y + v.h - 200), 'glow')
      .setTint(tint)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setScale(Phaser.Math.FloatBetween(7, 10), Phaser.Math.FloatBetween(4, 6))
      .setAlpha(0.16)
      .setDepth(-8.5);
    if (calm) return;
    const drift = () => {
      scene.tweens.add({
        targets: fog,
        x: Phaser.Math.Between(v.x - 100, v.x + v.w + 100),
        y: Phaser.Math.Between(v.y + 150, v.y + v.h - 150),
        alpha: Phaser.Math.FloatBetween(0.1, 0.22),
        duration: Phaser.Math.Between(14000, 22000),
        ease: 'Sine.inOut',
        onComplete: drift,
      });
    };
    scene.time.delayedCall(i * 700, drift);
  });
}

/** Пылинки в луче света: тёплые точки медленно поднимаются и гаснут. */
export function addDust(scene: Phaser.Scene, v: ViewRect = currentView(scene), depth = -6) {
  if (reducedMotion()) return;
  scene.add
    .particles(0, 0, 'dot', {
      x: { min: v.x, max: v.x + v.w },
      y: { min: v.y + v.h * 0.15, max: v.y + v.h },
      speedY: { min: -28, max: -10 },
      speedX: { min: -8, max: 8 },
      scale: { min: 0.08, max: 0.22 },
      alpha: { values: [0, 0.6, 0.6, 0], interpolation: 'linear' } as unknown as Phaser.Types.GameObjects.Particles.EmitterOpOnEmitType,
      tint: [0xffe0a0, 0xfff1cc, 0xc9d1ff],
      lifespan: { min: 6000, max: 10000 },
      frequency: 260,
      blendMode: Phaser.BlendModes.ADD,
      advance: 8000,
    })
    .setDepth(depth);
}

/**
 * Сцена появляется из темноты: тёмный экран, и из точки (x, y) расходится круг света.
 * Используется вместо обычного затемнения камеры.
 */
export function irisIn(scene: Phaser.Scene, x: number, y: number, duration = 650) {
  // Темнота на всю видимую область (на высоких экранах она больше раскладки 1080×1920).
  const v = currentView(scene);
  const rt = scene.add.renderTexture(v.x, v.y, Math.ceil(v.w), Math.ceil(v.h)).setOrigin(0).setDepth(100);
  const light = scene.make.image({ x: 0, y: 0, key: 'glow' }, false);
  const state = { r: 0.2 };
  const redraw = () => {
    rt.clear();
    rt.fill(0x0b0f27, 1);
    light.setScale(state.r);
    rt.erase(light, x - v.x, y - v.y);
  };
  redraw();
  scene.tweens.add({
    targets: state,
    r: 40,
    duration,
    ease: 'Cubic.in',
    onUpdate: redraw,
    onComplete: () => {
      rt.destroy();
      light.destroy();
    },
  });
}

/** Вспышка лучей — когда зажигается фонарь или открывается выход. */
export function raysBurst(scene: Phaser.Scene, x: number, y: number, tint: number, size: number, depth = 8) {
  const count = 10;
  const group: Phaser.GameObjects.Image[] = [];
  for (let i = 0; i < count; i++) {
    const ray = scene.add
      .image(x, y, 'ray')
      .setOrigin(0.5, 1)
      .setTint(tint)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setRotation((i / count) * Math.PI * 2 + Math.random() * 0.3)
      .setScale(0.5, 0)
      .setAlpha(0.9)
      .setDepth(depth);
    group.push(ray);
  }
  scene.tweens.add({
    targets: group,
    scaleY: size / 256,
    alpha: 0,
    angle: '+=25',
    duration: 900,
    ease: 'Quad.out',
    onComplete: () => group.forEach((r) => r.destroy()),
  });
}
