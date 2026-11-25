// Простые синтезированные звуки через WebAudio — без файлов.

import { loadProgress, saveProgress } from './storage';
import { haptics } from './haptics';
import { music, type Mood } from './audio/music';

let ctx: AudioContext | null = null;
// Настройку читаем при каждом звуке: в приложении сохранение подгружается из Preferences уже после
// загрузки этого модуля.
const isMutedNow = () => loadProgress().muted;
const isMusicNow = () => loadProgress().music;

/** Один AudioContext на звуки и музыку. */
function context(): AudioContext | null {
  try {
    if (!ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      ctx = new Ctor();
    }
    if (ctx.state === 'suspended' && !suspended) void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function ac(): AudioContext | null {
  if (isMutedNow() || suspended) return null;
  return context();
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
    haptics.place();
  },
  invalid() {
    tone(220, 0.14, 'square', 0.06);
    tone(180, 0.16, 'square', 0.05, 0.07);
    haptics.error();
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
  /** Свет дотянулся до клетки: мягкое низкое «бум» и тихий звон. */
  thump() {
    tone(140, 0.2, 'sine', 0.18, 0, 90);
    tone(1046.5, 0.25, 'sine', 0.03, 0.03);
  },
  /** Шаг Lumo по дороге (с лёгкой вибрацией). */
  footstep(i: number) {
    tone(i % 2 ? 300 : 340, 0.05, 'sine', 0.05, 0, 220);
    haptics.step();
  },
  /** Прыжок: «вжух» вверх. */
  jump() {
    tone(330, 0.22, 'sine', 0.12, 0, 880);
  },
  /** Серия без ошибок: нота растёт с длиной серии. */
  streak(n: number) {
    tone(note(n + 2), 0.28, 'sine', 0.1);
    tone(note(n + 4), 0.28, 'sine', 0.05, 0.05);
  },
  /** Поворотный мост повернулся — деревянный скрип. */
  creak() {
    tone(180, 0.12, 'sawtooth', 0.025, 0, 140);
  },
  /** Гаснущий фонарь погас. */
  fizzle() {
    tone(500, 0.4, 'sine', 0.1, 0, 120);
  },
  win() {
    [0, 2, 4, 5, 7].forEach((n, i) => tone(note(n), 0.35, 'triangle', 0.14, i * 0.09));
    haptics.win();
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

let suspended = false;

/** Приложение ушло в фон: музыка — пауза, звук выключаем совсем (а не только тише). */
export function suspendAudio() {
  suspended = true;
  music.stop(0.2);
  void ctx?.suspend().catch(() => undefined);
}

/** Возврат из фона: контекст продолжает, музыка плавно появляется снова. */
export function resumeAudio() {
  suspended = false;
  if (!ctx) return;
  void ctx.resume().then(() => startMusic()).catch(() => undefined);
}

/** Музыка стартует только после первого касания (политика автозапуска iOS) и если она включена. */
let gestured = false;
export function startMusic() {
  if (!gestured || suspended || !isMusicNow()) return;
  const a = context();
  if (a) music.start(a);
}

/** Подписаться на первое касание: после него звук разрешён — запускаем музыку. */
export function initMusic() {
  const go = () => {
    gestured = true;
    window.removeEventListener('pointerdown', go);
    window.removeEventListener('touchend', go);
    window.removeEventListener('keydown', go);
    startMusic();
  };
  window.addEventListener('pointerdown', go);
  window.addEventListener('touchend', go);
  window.addEventListener('keydown', go);
}

export function isMusicOn() {
  return isMusicNow();
}

export function setMusicOn(v: boolean) {
  saveProgress({ ...loadProgress(), music: v });
  if (v) startMusic();
  else music.stop(1);
}

/** Победа — музыка мягко приглушается на 2 с. */
export function duckMusic(seconds = 2) {
  music.duck(seconds);
}

/** Настроение музыки: деревня — теплее. */
export function setMusicMood(mood: Mood) {
  music.setMood(mood);
}

export function isMuted() {
  return isMutedNow();
}

export function setMuted(v: boolean) {
  saveProgress({ ...loadProgress(), muted: v });
}
