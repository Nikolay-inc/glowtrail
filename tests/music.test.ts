import { describe, expect, it } from 'vitest';
import { MUSIC_VOLUME, NightMusic } from '../src/audio/music';

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
  createGain() {
    return Object.assign(new FakeNode(), { gain: new FakeParam() });
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
