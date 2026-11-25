// Генеративная ночная музыка на WebAudio, без файлов: медленные мягкие аккорды-подушки (меняются раз в 8–12 с),
// редкие колокольчики по пентатонике со случайным ритмом, низкий тихий гул, ночной фон (сверчки, лёгкий ветер)
// и общий ревербератор со сгенерированным импульсом. Настроение — спокойное, чуть мистическое.
//
// Узлы: гул, ветер, сверчки и ревербератор создаются один раз и живут всё время; аккорды и колокольчики
// создаются на время звучания и отключаются по `onended` — число узлов не растёт (счётчик liveNodes, тест).
// Планировщик работает «на шаг вперёд» по часам AudioContext: tick() раскладывает события на 2 с вперёд.

export type Mood = 'night' | 'warm';

/** Громкость музыки по умолчанию (доля от полной). */
export const MUSIC_VOLUME = 0.25;
const FADE_IN = 3;
const LOOKAHEAD = 2;

const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

/** Аккорды (MIDI) и ноты колокольчиков для настроения: ночь — ля минор, деревня — теплее (фа и до мажор). */
const MOODS: Record<Mood, { chords: number[][]; bells: number[]; drone: number }> = {
  night: {
    chords: [
      [57, 60, 64, 67], // Am7
      [53, 57, 60, 64], // Fmaj7
      [55, 59, 62, 67], // G
      [52, 55, 59, 62], // Em7
      [50, 53, 57, 60], // Dm7
    ],
    bells: [81, 84, 86, 88, 91, 93], // A5 C6 D6 E6 G6 A6 — ля-минорная пентатоника
    drone: 33, // A1
  },
  warm: {
    chords: [
      [53, 57, 60, 64], // Fmaj7
      [48, 52, 55, 59], // Cmaj7
      [50, 53, 57, 60], // Dm7
      [55, 59, 62, 65], // G7
      [57, 60, 64, 67], // Am7
    ],
    bells: [84, 86, 88, 91, 93, 96], // до-мажорная пентатоника
    drone: 29, // F1
  },
};

type Ctx = BaseAudioContext;

export class NightMusic {
  private ctx: Ctx | null = null;
  private master: GainNode | null = null;
  private duckGain: GainNode | null = null;
  private dry: GainNode | null = null;
  private wet: GainNode | null = null;
  private droneOscs: OscillatorNode[] = [];
  private cricketGain: GainNode | null = null;
  private mood: Mood = 'night';
  private playing = false;
  private nextChord = 0;
  private nextBell = 0;
  private nextChirp = 0;
  private chordIndex = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private rand: () => number;
  /** Сколько временных узлов (аккорды, колокольчики) сейчас живы — для проверки утечек. */
  liveNodes = 0;
  /** Всего постоянных узлов графа (создаются один раз). */
  persistentNodes = 0;

  constructor(rand: () => number = Math.random) {
    this.rand = rand;
  }

  get isPlaying() {
    return this.playing;
  }

  /** Построить постоянную часть графа (один раз на AudioContext). */
  private build(ctx: Ctx) {
    this.ctx = ctx;
    const node = <T extends AudioNode>(n: T) => {
      this.persistentNodes++;
      return n;
    };
    this.master = node(ctx.createGain());
    this.master.gain.value = 0;
    this.master.connect(ctx.destination);
    this.duckGain = node(ctx.createGain());
    this.duckGain.connect(this.master);
    this.dry = node(ctx.createGain());
    this.dry.gain.value = 0.75;
    this.dry.connect(this.duckGain);
    // Ревербератор: импульс — затухающий стереошум 3,5 с.
    const conv = node(ctx.createConvolver());
    conv.buffer = this.impulse(ctx, 3.5);
    this.wet = node(ctx.createGain());
    this.wet.gain.value = 0.55;
    conv.connect(this.wet);
    this.wet.connect(this.duckGain);
    const send = node(ctx.createGain());
    send.connect(conv);
    this.reverbSend = send;
    // Гул: две низкие синусоиды (тоника и квинта) через фильтр, очень тихо, медленно «дышит».
    const droneGain = node(ctx.createGain());
    droneGain.gain.value = 0.05;
    const lp = node(ctx.createBiquadFilter());
    lp.type = 'lowpass';
    lp.frequency.value = 220;
    droneGain.connect(lp);
    lp.connect(this.dry);
    for (const ratio of [1, 1.5]) {
      const o = node(ctx.createOscillator());
      o.type = 'sine';
      o.frequency.value = midi(MOODS[this.mood].drone) * ratio;
      o.connect(droneGain);
      o.start();
      this.droneOscs.push(o);
    }
    const lfo = node(ctx.createOscillator());
    lfo.frequency.value = 0.07;
    const lfoGain = node(ctx.createGain());
    lfoGain.gain.value = 0.02;
    lfo.connect(lfoGain);
    lfoGain.connect(droneGain.gain);
    lfo.start();
    // Ветер: зацикленный шум через полосовой фильтр, частота медленно плавает.
    const noise = node(ctx.createBufferSource());
    noise.buffer = this.noiseBuffer(ctx, 4);
    noise.loop = true;
    const bp = node(ctx.createBiquadFilter());
    bp.type = 'bandpass';
    bp.frequency.value = 500;
    bp.Q.value = 0.7;
    const windGain = node(ctx.createGain());
    windGain.gain.value = 0.018;
    noise.connect(bp);
    bp.connect(windGain);
    windGain.connect(this.dry);
    windGain.connect(send);
    const windLfo = node(ctx.createOscillator());
    windLfo.frequency.value = 0.05;
    const windDepth = node(ctx.createGain());
    windDepth.gain.value = 260;
    windLfo.connect(windDepth);
    windDepth.connect(bp.frequency);
    noise.start();
    windLfo.start();
    // Сверчки: один высокий тон, огибающую «стрекота» расписываем автоматизацией громкости (узлы не создаются).
    const cricket = node(ctx.createOscillator());
    cricket.type = 'sine';
    cricket.frequency.value = 4600;
    this.cricketGain = node(ctx.createGain());
    this.cricketGain.gain.value = 0;
    cricket.connect(this.cricketGain);
    this.cricketGain.connect(this.dry);
    this.cricketGain.connect(send);
    cricket.start();
  }

  private reverbSend: GainNode | null = null;

  private noiseBuffer(ctx: Ctx, seconds: number): AudioBuffer {
    const len = Math.floor(ctx.sampleRate * seconds);
    const b = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = b.getChannelData(0);
    // Розоватый шум (мягче белого).
    let last = 0;
    for (let i = 0; i < len; i++) {
      last = last * 0.97 + (this.rand() * 2 - 1) * 0.03;
      d[i] = last * 6;
    }
    return b;
  }

  private impulse(ctx: Ctx, seconds: number): AudioBuffer {
    const len = Math.floor(ctx.sampleRate * seconds);
    const b = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (this.rand() * 2 - 1) * Math.pow(1 - i / len, 3);
    }
    return b;
  }

  /** Временный узел: считаем и отключаем по окончании. */
  private temp<T extends AudioScheduledSourceNode>(n: T, extra: AudioNode[]): T {
    this.liveNodes += 1 + extra.length;
    n.onended = () => {
      n.disconnect();
      for (const x of extra) x.disconnect();
      this.liveNodes -= 1 + extra.length;
    };
    return n;
  }

  /** Аккорд-подушка: мягкие треугольники с медленной атакой и долгим затуханием. */
  private pad(at: number, notes: number[], dur: number) {
    const ctx = this.ctx!;
    for (const n of notes) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      const f = ctx.createBiquadFilter();
      o.type = 'triangle';
      o.frequency.value = midi(n);
      o.detune.value = (this.rand() - 0.5) * 12;
      f.type = 'lowpass';
      f.frequency.value = 900;
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(0.035, at + dur * 0.35);
      g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
      o.connect(f);
      f.connect(g);
      g.connect(this.dry!);
      g.connect(this.reverbSend!);
      this.temp(o, [g, f]);
      o.start(at);
      o.stop(at + dur + 0.05);
    }
  }

  /** Колокольчик/челеста: синус с обертоном, быстрая атака, звонкое затухание — в основном в ревербератор. */
  private bell(at: number, note: number) {
    const ctx = this.ctx!;
    for (const [mult, vol] of [
      [1, 0.05],
      [2.76, 0.012],
    ] as const) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = midi(note) * mult;
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(vol, at + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, at + 2.4);
      o.connect(g);
      g.connect(this.dry!);
      g.connect(this.reverbSend!);
      this.temp(o, [g]);
      o.start(at);
      o.stop(at + 2.5);
    }
  }

  /** Стрекот сверчка: серия коротких импульсов громкости. */
  private chirp(at: number) {
    const g = this.cricketGain!.gain;
    const pulses = 3 + Math.floor(this.rand() * 4);
    for (let i = 0; i < pulses; i++) {
      const t = at + i * 0.07;
      g.setValueAtTime(0, t);
      g.linearRampToValueAtTime(0.006, t + 0.01);
      g.linearRampToValueAtTime(0, t + 0.045);
    }
  }

  /** Разложить события на LOOKAHEAD секунд вперёд от текущего времени контекста. */
  tick() {
    const ctx = this.ctx;
    if (!ctx || !this.playing || ctx.state !== 'running') return;
    const until = ctx.currentTime + LOOKAHEAD;
    const m = MOODS[this.mood];
    while (this.nextChord < until) {
      const dur = 8 + this.rand() * 4; // аккорд меняется раз в 8–12 с
      // Соседние аккорды по кругу, иногда — шаг через один.
      this.chordIndex = (this.chordIndex + (this.rand() < 0.7 ? 1 : 2)) % m.chords.length;
      this.pad(this.nextChord, m.chords[this.chordIndex], dur + 3);
      this.nextChord += dur;
    }
    while (this.nextBell < until) {
      // Редкие колокольчики: иногда пара нот подряд, со случайными паузами.
      this.bell(this.nextBell, m.bells[Math.floor(this.rand() * m.bells.length)]);
      if (this.rand() < 0.3) this.bell(this.nextBell + 0.35 + this.rand() * 0.3, m.bells[Math.floor(this.rand() * m.bells.length)]);
      this.nextBell += 2.5 + this.rand() * 6;
    }
    while (this.nextChirp < until) {
      this.chirp(this.nextChirp);
      this.nextChirp += 1.2 + this.rand() * 3.5;
    }
  }

  /** Запустить (или продолжить) с плавным появлением за 3 с. Звать после касания (политика автозапуска iOS). */
  start(ctx: Ctx, interval = true) {
    if (!this.ctx) this.build(ctx);
    if (this.playing) return;
    this.playing = true;
    const now = ctx.currentTime;
    this.nextChord = Math.max(this.nextChord, now + 0.1);
    this.nextBell = Math.max(this.nextBell, now + 1.5);
    this.nextChirp = Math.max(this.nextChirp, now + 0.8);
    const g = this.master!.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(MUSIC_VOLUME, now + FADE_IN);
    this.tick();
    if (interval && !this.timer) this.timer = setInterval(() => this.tick(), 500);
  }

  /** Остановить с затуханием (сворачивание приложения, выключение музыки). Граф остаётся — продолжим без новых узлов. */
  stop(fade = 0.6) {
    if (!this.ctx || !this.playing) return;
    this.playing = false;
    const now = this.ctx.currentTime;
    const g = this.master!.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(0, now + fade);
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** На экране победы музыка мягко приглушается на 2 с. */
  duck(seconds = 2) {
    if (!this.ctx || !this.duckGain) return;
    const now = this.ctx.currentTime;
    const g = this.duckGain.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(0.3, now + 0.3);
    g.setValueAtTime(0.3, now + seconds);
    g.linearRampToValueAtTime(1, now + seconds + 1.2);
  }

  /** Настроение: ночь (карта, уровни) или теплее (деревня). Гул плавно меняет высоту. */
  setMood(mood: Mood) {
    if (mood === this.mood) return;
    this.mood = mood;
    this.chordIndex = 0;
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.droneOscs.forEach((o, i) => o.frequency.linearRampToValueAtTime(midi(MOODS[mood].drone) * (i ? 1.5 : 1), now + 4));
  }

  getMood() {
    return this.mood;
  }
}

export const music = new NightMusic();
