import { describe, expect, it } from 'vitest';
import { MOOD_FADE, MUSIC_VOLUME, NightMusic, type Mood } from '../src/audio/music';

/** Минимальный поддельный AudioContext: узлы, параметры, буферы; часы двигаем вручную. */
class FakeParam {
  value = 0;
  events: [string, number, number][] = [];
  setValueAtTime(v: number, t: number) {
    this.events.push(['set', v, t]);
    this.value = v;
    return this;
  }
  linearRampToValueAtTime(v: number, t: number) {
    this.events.push(['lin', v, t]);
    return this;
  }
  exponentialRampToValueAtTime(v: number, t: number) {
    this.events.push(['exp', v, t]);
    return this;
  }
  cancelScheduledValues() {
    return this;
  }
}

class FakeNode {
  connected = 0;
  connect() {
    this.connected++;
    return this;
  }
  disconnect() {
    this.connected = 0;
  }
}

class FakeSource extends FakeNode {
  frequency = new FakeParam();
  detune = new FakeParam();
  type = 'sine';
  buffer: unknown = null;
  loop = false;
  stopAt = Infinity;
  onended: (() => void) | null = null;
  start() {}
  stop(t: number) {
    this.stopAt = t;
  }
}

class FakeCtx {
  currentTime = 0;
  sampleRate = 8000;
  state = 'running';
  destination = new FakeNode();
  sources: FakeSource[] = [];
  /** Все созданные источники и узлы громкости (для проверок частот и кроссфейда). */
  created: FakeSource[] = [];
  gains: { gain: FakeParam }[] = [];
  createGain() {
    const g = Object.assign(new FakeNode(), { gain: new FakeParam() });
    this.gains.push(g);
    return g;
  }
  createBiquadFilter() {
    return Object.assign(new FakeNode(), { type: '', frequency: new FakeParam(), Q: new FakeParam() });
  }
  createConvolver() {
    return Object.assign(new FakeNode(), { buffer: null });
  }
  createOscillator() {
    const s = new FakeSource();
    this.sources.push(s);
    this.created.push(s);
    return s;
  }
  createBufferSource() {
    const s = new FakeSource();
    this.sources.push(s);
    return s;
  }
  createBuffer(channels: number, len: number) {
    const data = Array.from({ length: channels }, () => new Float32Array(len));
    return { getChannelData: (c: number) => data[c] };
  }
  /** Сдвинуть часы: доигравшие источники вызывают onended (как в браузере). */
  advance(dt: number) {
    this.currentTime += dt;
    this.sources = this.sources.filter((s) => {
      if (s.stopAt <= this.currentTime) {
        s.onended?.();
        return false;
      }
      return true;
    });
  }
}

let seed = 1;
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

describe('ночная музыка', () => {
  it('10 минут игры — число временных узлов не растёт, постоянные создаются один раз', () => {
    const ctx = new FakeCtx();
    const m = new NightMusic(rand);
    m.start(ctx as unknown as BaseAudioContext, false);
    const persistent = m.persistentNodes;
    const samples: number[] = [];
    for (let t = 0; t < 600; t += 0.5) {
      ctx.advance(0.5);
      m.tick();
      if (t > 60 && t % 30 === 0) samples.push(m.liveNodes);
    }
    expect(m.persistentNodes).toBe(persistent);
    // В любой момент звучит не больше пары аккордов и нескольких колокольчиков.
    expect(Math.max(...samples)).toBeLessThan(60);
    // Нет роста: в конце узлов не больше, чем в начале (с запасом на случайность).
    const first = samples.slice(0, 5).reduce((a, b) => a + b) / 5;
    const last = samples.slice(-5).reduce((a, b) => a + b) / 5;
    expect(last).toBeLessThan(first * 1.6 + 10);
    // Все созданные временные узлы, которые доиграли, отключены.
    expect(m.liveNodes).toBeGreaterThan(0);
  });

  it('плавное появление за 3 с, пауза и продолжение без новых постоянных узлов', () => {
    const ctx = new FakeCtx();
    const m = new NightMusic(rand);
    m.start(ctx as unknown as BaseAudioContext, false);
    expect(m.isPlaying).toBe(true);
    const persistent = m.persistentNodes;
    m.stop();
    expect(m.isPlaying).toBe(false);
    ctx.advance(10);
    m.tick(); // на паузе ничего не планируется
    m.start(ctx as unknown as BaseAudioContext, false);
    expect(m.persistentNodes).toBe(persistent);
    expect(MUSIC_VOLUME).toBeCloseTo(0.25);
  });

  it('аккорды меняются раз в 8–12 с, в деревне — другой набор нот', () => {
    const ctx = new FakeCtx();
    const m = new NightMusic(rand);
    m.start(ctx as unknown as BaseAudioContext, false);
    const pads = () => ctx.sources.filter((s) => s.type === 'triangle').length;
    let changes = 0;
    let before = pads();
    for (let t = 0; t < 120; t += 0.5) {
      ctx.advance(0.5);
      m.tick();
      const now = pads();
      if (now > before) changes++;
      before = now;
    }
    expect(changes).toBeGreaterThanOrEqual(9); // 120 с / 12 с
    expect(changes).toBeLessThanOrEqual(16); // 120 с / 8 с (+ запас)
    m.setMood('warm');
    expect(m.getMood()).toBe('warm');
  });
});

/** Прогнать музыку `seconds` секунд шагами по 0,5 с; `each(t)` — после каждого шага. */
function run(ctx: FakeCtx, m: NightMusic, seconds: number, each?: (t: number) => void) {
  for (let t = 0; t < seconds; t += 0.5) {
    ctx.advance(0.5);
    m.tick();
    each?.(t);
  }
}

const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

describe('лесная музыка', () => {
  it('10 минут в лесу — узлы не растут, совы раз в 15–30 с, аккорды ниже ночных', () => {
    const nightCtx = new FakeCtx();
    const night = new NightMusic(rand);
    night.start(nightCtx as unknown as BaseAudioContext, false);
    run(nightCtx, night, 120);
    const nightPads = avg(nightCtx.created.filter((s) => s.type === 'triangle').map((s) => s.frequency.value));

    const ctx = new FakeCtx();
    const m = new NightMusic(rand);
    m.setMood('forest'); // до первого запуска — граф сразу строится лесным
    m.start(ctx as unknown as BaseAudioContext, false);
    const persistent = m.persistentNodes;
    const samples: number[] = [];
    run(ctx, m, 600, (t) => {
      if (t > 60 && t % 30 === 0) samples.push(m.liveNodes);
    });
    expect(m.persistentNodes).toBe(persistent);
    expect(Math.max(...samples)).toBeLessThan(60);
    expect(avg(samples.slice(-5))).toBeLessThan(avg(samples.slice(0, 5)) * 1.6 + 10);
    // 600 с / 30 с = 20 … 600 с / 15 с = 40.
    expect(m.owlCount).toBeGreaterThanOrEqual(18);
    expect(m.owlCount).toBeLessThanOrEqual(42);
    // Аккорды леса — примерно на октаву ниже ночных.
    const forestPads = avg(ctx.created.filter((s) => s.type === 'triangle').map((s) => s.frequency.value));
    expect(forestPads).toBeLessThan(nightPads / 1.6);
  });

  it('смена настроения — кроссфейд за ~2,5 с без скачков, то же настроение — ничего', () => {
    const ctx = new FakeCtx();
    const m = new NightMusic(rand);
    m.start(ctx as unknown as BaseAudioContext, false);
    run(ctx, m, 30);
    const alive = ctx.sources.filter((s) => s.type === 'triangle');
    expect(alive.length).toBeGreaterThan(0);
    const before = new Map(alive.map((s) => [s, s.stopAt]));
    const t0 = ctx.currentTime;
    m.setMood('forest');
    expect(m.getMood()).toBe('forest');
    // Старые аккорды останавливаются не позже конца кроссфейда (или раньше, если и так доигрывали).
    for (const [s, was] of before) expect(s.stopAt).toBeLessThanOrEqual(Math.min(was, t0 + MOOD_FADE + 0.1));
    // Узлы затухания голосов: от 1 к 0 за MOOD_FADE, ровно один раз.
    const fades = ctx.gains.filter((g) => g.gain.events.some(([k, v, t]) => k === 'lin' && v === 0 && t === t0 + MOOD_FADE));
    expect(fades.length).toBeGreaterThan(0);
    for (const g of fades) expect(g.gain.events).toEqual([['set', 1, t0], ['lin', 0, t0 + MOOD_FADE]]);
    // Шелест листвы плавно поднимается (от текущего значения, без скачка).
    const leaves = ctx.gains.find((g) => g.gain.events.some(([k, v]) => k === 'lin' && v === 0.05));
    expect(leaves?.gain.events.slice(-2)).toEqual([['set', 0, t0], ['lin', 0.05, t0 + MOOD_FADE]]);
    // Новый аккорд начинается сразу, с атакой длиной в кроссфейд.
    const fresh = ctx.created.filter((s) => s.type === 'triangle' && !before.has(s) && s.stopAt > t0 + 5);
    expect(fresh.length).toBeGreaterThanOrEqual(4);
    // Повторный вызов с тем же настроением — ни новых узлов, ни новых событий.
    const created = ctx.created.length;
    const events = ctx.gains.reduce((n, g) => n + g.gain.events.length, 0);
    m.setMood('forest');
    expect(ctx.created.length).toBe(created);
    expect(ctx.gains.reduce((n, g) => n + g.gain.events.length, 0)).toBe(events);
  });

  it('10 минут переключений night ↔ forest ↔ warm (и быстрых туда-обратно) — узлы не растут', () => {
    const ctx = new FakeCtx();
    const m = new NightMusic(rand);
    m.start(ctx as unknown as BaseAudioContext, false);
    const persistent = m.persistentNodes;
    const cycle: Mood[] = ['forest', 'night', 'forest', 'warm', 'forest', 'warm', 'night'];
    let i = 0;
    const samples: number[] = [];
    run(ctx, m, 600, (t) => {
      if (t % 20 === 0) m.setMood(cycle[i++ % cycle.length]);
      if (t % 50 === 10) {
        // Быстро туда-обратно посреди кроссфейда.
        const back = m.getMood();
        m.setMood(back === 'forest' ? 'night' : 'forest');
        m.setMood(back);
      }
      if (t > 60 && t % 30 === 5) samples.push(m.liveNodes);
    });
    expect(m.persistentNodes).toBe(persistent);
    expect(Math.max(...samples)).toBeLessThan(90);
    expect(avg(samples.slice(-5))).toBeLessThan(avg(samples.slice(0, 5)) * 1.6 + 10);
    // Всё, что доиграло, отключено: после остановки и паузы живых голосов не остаётся.
    m.stop();
    run(ctx, m, 30);
    expect(m.liveNodes).toBe(0);
  });
});
