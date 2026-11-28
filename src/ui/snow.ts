// «Ледяные вершины»: снегопад и северное сияние — общие для фона (addBackground({ peaks })), карты мира,
// сцены входа в горы и игрового поля (BoardView может звать addSnowfall для своей области).
//
// Снег — два слоя частиц Phaser (дальний: мелкие, медленные, тусклые; ближний: крупнее и быстрее). Снежинки
// появляются в любой точке области с плавным проявлением и гаснут к концу жизни; вышедшие за область —
// исчезают (deathZone), поэтому область можно двигать и менять (setArea) — например, только часть экрана, где
// горы. Плотность — по площади области; на слабых устройствах вдвое меньше; при «меньше движения» снега нет.
// Сияние — лента из вертикальных полос с градиентом (ярко снизу, к верху тает) вдоль мягкой волны, ADD-смешение;
// медленно «дышит» (прозрачность) и чуть плывёт вбок.

import Phaser from 'phaser';
import { reducedMotion } from './fx';

/** Прямоугольная область в координатах сцены (как ViewRect, без масштаба). */
export interface Area {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Слабое устройство (простой признак): не больше 4 ядер или не больше 3 ГБ памяти. Тогда эффектов
 * (снежинок) — вдвое меньше. nav — для теста; по умолчанию navigator.
 */
export function isLowEndDevice(nav: { hardwareConcurrency?: number; deviceMemory?: number } | undefined = globalThis.navigator as never): boolean {
  if (!nav) return false;
  const cores = nav.hardwareConcurrency;
  const mem = nav.deviceMemory;
  return (typeof cores === 'number' && cores > 0 && cores <= 4) || (typeof mem === 'number' && mem > 0 && mem <= 3);
}

/** Снежинок в секунду на полный экран раскладки (1080×1920) при density 1: ~60–70 одновременно — «редкий снег». */
const BASE_RATE = 9;
const FULL_AREA = 1080 * 1920;

export interface SnowOptions {
  /** Глубина отрисовки (по умолчанию -6 — над фоном, под интерфейсом). */
  depth?: number;
  /** Множитель плотности: 1 — редкий снег (фон), 2–3 — снегопад (заставка). */
  density?: number;
  /** Ветер: снос по горизонтали, px/с (плюс — вправо). */
  wind?: number;
  /** Множитель размера снежинок (поле с мелкими клетками — меньше). */
  size?: number;
  /** Заполнять область снегом сразу, как только она появилась (иначе снег «начинается»). По умолчанию true. */
  prefill?: boolean;
  /** Принудительно как на слабом устройстве (для проверки); по умолчанию — isLowEndDevice(). */
  lowEnd?: boolean;
}

export interface SnowHandle {
  /** Слои частиц (пусто при «меньше движения»). Можно положить в контейнер или маску. */
  emitters: Phaser.GameObjects.Particles.ParticleEmitter[];
  /** Новая область (null — снег прекращается, видимые снежинки исчезают). */
  setArea(area: Area | null): void;
  setDepth(depth: number): void;
  destroy(): void;
}

/**
 * Редкий снегопад в области area (координаты сцены). Плотность — по площади области, на слабых устройствах
 * вдвое меньше. Возвращает управление: setArea (сменить/убрать область — например, при прокрутке или resize),
 * setDepth, destroy. При «меньше движения» (prefers-reduced-motion) ничего не создаёт.
 */
export function addSnowfall(scene: Phaser.Scene, area: Area | null, opts: SnowOptions = {}): SnowHandle {
  const handle: SnowHandle = { emitters: [], setArea: () => {}, setDepth: () => {}, destroy: () => {} };
  if (reducedMotion()) return handle;
  const density = (opts.density ?? 1) * ((opts.lowEnd ?? isLowEndDevice()) ? 0.5 : 1);
  const size = opts.size ?? 1;
  const wind = opts.wind ?? 14;
  const zone = new Phaser.Geom.Rectangle(0, 0, 1, 1);
  const alive = new Phaser.Geom.Rectangle(0, 0, 1, 1);
  // Два слоя: доля частиц, размер, скорость падения (px/с), яркость, жизнь (мс).
  const layers = [
    { share: 0.6, scale: [0.25, 0.42], fall: [35, 60], alpha: 0.5, life: [6000, 9000], sway: 10 },
    { share: 0.4, scale: [0.5, 0.8], fall: [70, 120], alpha: 0.85, life: [4500, 7000], sway: 18 },
  ];
  const emitters = layers.map((l) =>
    scene.add.particles(0, 0, 'dot', {
      emitZone: { type: 'random', source: zone as unknown as Phaser.Types.GameObjects.Particles.RandomZoneSource },
      deathZone: { type: 'onLeave', source: alive as unknown as Phaser.Types.GameObjects.Particles.DeathZoneSource },
      speedY: { min: l.fall[0], max: l.fall[1] },
      speedX: { min: wind - l.sway, max: wind + l.sway },
      scale: { min: l.scale[0] * size, max: l.scale[1] * size },
      alpha: { values: [0, l.alpha, l.alpha, 0], interpolation: 'linear' } as unknown as Phaser.Types.GameObjects.Particles.EmitterOpOnEmitType,
      tint: [0xffffff, 0xe8f2ff, 0xd0e4ff],
      lifespan: { min: l.life[0], max: l.life[1] },
      frequency: 1000,
      quantity: 1,
      emitting: false,
    }),
  );
  /** Высота области, до которой она уже заполнена снегом (0 — снега нет). */
  let filled = 0;
  const setArea = (a: Area | null) => {
    const ok = !!a && a.w > 4 && a.h > 4;
    if (!ok) {
      emitters.forEach((e) => e.stop(true));
      filled = 0;
      return;
    }
    zone.setTo(a.x, a.y, a.w, a.h);
    // Снежинка живёт, пока в области (с запасом по бокам на снос ветром).
    alive.setTo(a.x - 40, a.y - 10, a.w + 80, a.h + 20);
    emitters.forEach((e, i) => {
      const rate = BASE_RATE * density * layers[i].share * ((a.w * a.h) / FULL_AREA);
      e.frequency = rate > 0 ? Math.max(16, 1000 / rate) : 1e9;
      // Область выросла (прокрутка) — не ждать конца старого, длинного интервала.
      e.flowCounter = Math.min(e.flowCounter, e.frequency);
      if (!e.emitting) e.start();
    });
    // Снег появился или область заметно выросла (прокрутка) — сразу заполнить её, а не ждать, пока снежинки «начнутся».
    if (opts.prefill !== false && a.h > filled + 300) emitters.forEach((e) => e.fastForward(filled ? 1500 : 4000));
    filled = Math.max(filled, a.h);
  };
  setArea(area);
  const depth = opts.depth ?? -6;
  emitters.forEach((e) => e.setDepth(depth));
  handle.emitters = emitters;
  handle.setArea = setArea;
  handle.setDepth = (d) => emitters.forEach((e) => e.setDepth(d));
  handle.destroy = () => emitters.forEach((e) => e.destroy());
  return handle;
}

// ---------------------------------------------------------------------------
// Северное сияние

/** Цвета сияния: зелёный, бирюзовый, фиолетовый. */
export const AURORA_COLORS = [0x5cffb0, 0x4ad8e8, 0xa06cff] as const;

export interface AuroraBand {
  /** Левый и правый край ленты. */
  x0: number;
  x1: number;
  /** Нижний край ленты (средняя линия волны) и высота «занавеса». */
  y: number;
  h: number;
  color: number;
  /** Яркость нижнего края (0–1). */
  alpha?: number;
  /** Размах и длина волны нижнего края. */
  amp?: number;
  wave?: number;
  /** Сдвиг фазы волны (разные ленты не повторяют друг друга). */
  phase?: number;
}

/**
 * Нарисовать ленту сияния в Graphics: узкие вертикальные полосы вдоль волны, снизу ярко (с тонкой светлой
 * кромкой), к верху прозрачно; «лучи» — разная высота полос. Graphics лучше ставить с ADD-смешением.
 */
export function drawAuroraBand(g: Phaser.GameObjects.Graphics, b: AuroraBand) {
  const alpha = b.alpha ?? 0.35;
  const amp = b.amp ?? b.h * 0.35;
  const wave = b.wave ?? 900;
  const phase = b.phase ?? 0;
  const step = 18;
  const edge = Phaser.Display.Color.IntegerToColor(b.color).lighten(25).color;
  for (let x = b.x0; x < b.x1; x += step) {
    const t = (x - b.x0) / Math.max(1, b.x1 - b.x0);
    // Края ленты тают.
    const fade = Math.min(1, t * 5, (1 - t) * 5);
    const y = b.y + Math.sin((x / wave) * Math.PI * 2 + phase) * amp + Math.sin((x / wave) * 5.3 + phase * 2) * amp * 0.25;
    const rays = 0.75 + 0.25 * Math.sin(x * 0.037 + phase * 3) * Math.sin(x * 0.011 + phase);
    const hh = b.h * rays;
    const a = alpha * fade;
    g.fillGradientStyle(b.color, b.color, b.color, b.color, 0, 0, a, a);
    g.fillRect(x, y - hh, step, hh);
    g.fillStyle(edge, a * 0.9);
    g.fillRect(x, y - 6, step, 6);
  }
}

export interface AuroraOptions {
  /** Глубина (по умолчанию -9.5 — над небом, под звёздами и туманом). */
  depth?: number;
  /** Множитель яркости. */
  alpha?: number;
  /** Сколько лент (1–3). */
  bands?: number;
  /** Зерно случайности — тот же рисунок при каждом открытии. */
  seed?: string;
}

export interface AuroraHandle {
  /** Ленты (по Graphics на ленту, ADD). */
  objects: Phaser.GameObjects.Graphics[];
  /** Перерисовать под новую область (resize). */
  redraw(area: Area): void;
  destroy(): void;
}

/**
 * Северное сияние в верхней части области area: 1–3 ленты (зелёная, бирюзовая, фиолетовая), медленно
 * «дышат» и чуть плывут вбок. При «меньше движения» — неподвижные.
 */
export function addAurora(scene: Phaser.Scene, area: Area, opts: AuroraOptions = {}): AuroraHandle {
  const n = Phaser.Math.Clamp(opts.bands ?? 3, 1, 3);
  const k = opts.alpha ?? 1;
  const depth = opts.depth ?? -9.5;
  const objects = Array.from({ length: n }, () => scene.add.graphics().setDepth(depth).setBlendMode(Phaser.BlendModes.ADD));
  const draw = (a: Area) => {
    const rnd = new Phaser.Math.RandomDataGenerator([opts.seed ?? 'aurora']);
    objects.forEach((g, i) => {
      g.clear();
      drawAuroraBand(g, {
        x0: a.x - 200,
        x1: a.x + a.w + 200,
        y: a.y + a.h * (0.2 + i * 0.08) + rnd.between(-30, 30),
        h: a.h * (0.16 - i * 0.03),
        color: AURORA_COLORS[i % AURORA_COLORS.length],
        alpha: (0.3 - i * 0.07) * k,
        amp: a.h * 0.04,
        wave: a.w * rnd.realInRange(0.8, 1.3),
        phase: rnd.realInRange(0, Math.PI * 2),
      });
    });
  };
  draw(area);
  if (!reducedMotion()) {
    objects.forEach((g, i) => {
      scene.tweens.add({ targets: g, alpha: 0.45, duration: 3800 + i * 1300, yoyo: true, repeat: -1, ease: 'Sine.inOut', delay: i * 900 });
      scene.tweens.add({ targets: g, x: (i % 2 ? -1 : 1) * 90, duration: 11000 + i * 2500, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    });
  }
  return { objects, redraw: draw, destroy: () => objects.forEach((g) => g.destroy()) };
}
