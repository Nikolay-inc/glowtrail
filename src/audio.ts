// Простые синтезированные звуки через WebAudio — без файлов.

import { loadProgress, saveProgress } from './storage';

let ctx: AudioContext | null = null;
let muted = loadProgress().muted;

function ac(): AudioContext | null {
  if (muted) return null;
  try {
    if (!ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      ctx = new Ctor();
    }
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(freq: number, dur = 0.15, type: OscillatorType = 'sine', vol = 0.18, delay = 0, slideTo?: number) {
  const a = ac();
  if (!a) return;
  const t = a.currentTime + delay;
  const osc = a.createOscillator();
  const gain = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(vol, t + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(gain).connect(a.destination);
  osc.start(t);
  osc.stop(t + dur + 0.05);
}

// Пентатоника — любые ноты подряд звучат приятно.
const SCALE = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5, 1174.66, 1318.51, 1567.98, 1760.0];
const note = (i: number) => SCALE[Math.max(0, i) % SCALE.length] * (i >= SCALE.length ? 2 : 1);

export const sfx = {
  /** Плитка легла на дорогу; тон растёт с длиной дороги. */
  place(step: number) {
    tone(note(step), 0.18, 'triangle', 0.16);
    vibrate(8);
  },
  invalid() {
    tone(220, 0.14, 'square', 0.06);
    tone(180, 0.16, 'square', 0.05, 0.07);
    vibrate([10, 40, 10]);
  },
  stash() {
    tone(440, 0.1, 'sine', 0.12, 0, 330);
  },
  undo() {
    tone(660, 0.14, 'sine', 0.12, 0, 440);
  },
  lantern(i: number) {
    tone(note(i + 3), 0.4, 'sine', 0.16);
    tone(note(i + 5), 0.4, 'sine', 0.08, 0.04);
  },
  step(i: number) {
    tone(note(i) / 2, 0.06, 'sine', 0.05);
  },
  win() {
    [0, 2, 4, 5, 7].forEach((n, i) => tone(note(n), 0.35, 'triangle', 0.14, i * 0.09));
  },
  lose() {
    tone(392, 0.25, 'sine', 0.12, 0, 330);
    tone(330, 0.35, 'sine', 0.12, 0.2, 262);
  },
  star(i: number) {
    tone(note(4 + i * 2), 0.3, 'triangle', 0.14);
  },
  tap() {
    tone(880, 0.05, 'sine', 0.07);
  },
};

function vibrate(p: number | number[]) {
  if (muted) return;
  try {
    navigator.vibrate?.(p);
  } catch {
    /* нет вибрации */
  }
}

export function isMuted() {
  return muted;
}

export function setMuted(v: boolean) {
  muted = v;
  const p = loadProgress();
  p.muted = v;
  saveProgress(p);
}
