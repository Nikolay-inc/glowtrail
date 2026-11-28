// Генеративная музыка на WebAudio, без файлов: медленные мягкие аккорды-подушки (меняются раз в 8–12 с),
// редкие колокольчики по пентатонике со случайным ритмом, низкий тихий гул, ночной фон (сверчки, ветер,
// шелест листвы), в лесу — редкие совиные «уху», и общий ревербератор со сгенерированным импульсом.
//
// Настроения (`setMood`): «night» — карта и уровни Долины, спокойное, чуть мистическое; «warm» — деревня,
// теплее; «forest» — «Туманный лес», ниже и таинственнее (модальный ре минор на октаву ниже, мягкая атака,
// совы, шелест вместо сверчков, колокольчики реже и ниже); «peaks» — «Ледяные вершины», зимнее: светлый ми мажор,
// колокольчики выше и прозрачнее (почти без обертона, звенят дольше), пэд мягче и тише, аккорды реже (раз в
// 12–16 с), вместо сверчков — тонкий свист ветра по склону. Смена настроения — кроссфейд за MOOD_FADE с:
// громкости фоновых слоёв, высота гула и фильтры плавно едут, звучащие голоса старого настроения
// затухают, новые аккорды входят с атакой той же длины.
//
// Узлы: гул, ветер, листва, сверчки и ревербератор создаются один раз и живут всё время; аккорды, колокольчики
// и совы — «голоса»: создаются на время звучания и отключаются по `onended` — число узлов не растёт
// (счётчик liveNodes, тест). Планировщик работает «на шаг вперёд» по часам AudioContext: tick() раскладывает
// события на 2 с вперёд.

export type Mood = 'night' | 'warm' | 'forest' | 'peaks';

/** Громкость музыки по умолчанию (доля от полной). */
export const MUSIC_VOLUME = 0.25;
/** Длительность кроссфейда между настроениями, с. */
export const MOOD_FADE = 2.5;
const FADE_IN = 3;
const LOOKAHEAD = 2;

const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

interface MoodSpec {
  /** Аккорды (MIDI). */
  chords: number[][];
  /** Длина аккорда (темп): min + случайная до range, с. */
  chordDur: { min: number; range: number };
  /** Ноты колокольчиков (MIDI). */
  bells: number[];
  /** Тоника гула (MIDI), вторая синусоида — квинта. */
  drone: number;
  /** Срез фильтра гула, Гц. */
  droneCutoff: number;
  /** Подушки: срез фильтра (Гц), атака (доля длительности), громкость ноты. */
  pad: { cutoff: number; attack: number; vol: number };
  /**
   * Колокольчики: пауза min + случайная до range (с), вероятность второй ноты, громкость (множитель),
   * обертон (доля звонкого неровного обертона: меньше — прозрачнее), затухание (с).
   */
  bell: { min: number; range: number; pair: number; vol: number; overtone: number; decay: number };
  /** Ветер: громкость и центральная частота фильтра. */
  wind: number;
  windFreq: number;
  /** Сверчки (0–1) и шелест листвы (громкость). */
  crickets: number;
  leaves: number;
  /** Совиные «уху» раз в 15–30 с. */
  owl: boolean;
}

/**
 * Ночь — ля минор, деревня — теплее (фа и до мажор), лес — ре минор (эолийский) на октаву ниже ночи,
 * вершины — ми мажор с добавленными нонами, колокольчики на октаву выше ночных.
 */
const MOODS: Record<Mood, MoodSpec> = {
  night: {
    chords: [
      [57, 60, 64, 67], // Am7
      [53, 57, 60, 64], // Fmaj7
      [55, 59, 62, 67], // G
      [52, 55, 59, 62], // Em7
      [50, 53, 57, 60], // Dm7
    ],
    chordDur: { min: 8, range: 4 },
    bells: [81, 84, 86, 88, 91, 93], // A5 C6 D6 E6 G6 A6 — ля-минорная пентатоника
    drone: 33, // A1
    droneCutoff: 220,
    pad: { cutoff: 900, attack: 0.35, vol: 0.035 },
    bell: { min: 2.5, range: 6, pair: 0.3, vol: 1, overtone: 1, decay: 2.4 },
    wind: 0.018,
    windFreq: 500,
    crickets: 1,
    leaves: 0,
    owl: false,
  },
  warm: {
    chords: [
      [53, 57, 60, 64], // Fmaj7
      [48, 52, 55, 59], // Cmaj7
      [50, 53, 57, 60], // Dm7
      [55, 59, 62, 65], // G7
      [57, 60, 64, 67], // Am7
    ],
    chordDur: { min: 8, range: 4 },
    bells: [84, 86, 88, 91, 93, 96], // до-мажорная пентатоника
    drone: 29, // F1
    droneCutoff: 220,
    pad: { cutoff: 900, attack: 0.35, vol: 0.035 },
    bell: { min: 2.5, range: 6, pair: 0.3, vol: 1, overtone: 1, decay: 2.4 },
    wind: 0.018,
    windFreq: 500,
    crickets: 1,
    leaves: 0.012,
    owl: false,
  },
  forest: {
    chords: [
      [38, 45, 50, 53], // Dm (D2 A2 D3 F3)
      [34, 41, 50, 53], // B♭ (B♭1 F2 D3 F3)
      [36, 43, 50, 55], // Csus2 (C2 G2 D3 G3)
      [33, 45, 48, 52], // Am (A1 A2 C3 E3)
      [31, 43, 46, 50], // Gm (G1 G2 B♭2 D3)
    ],
    chordDur: { min: 8, range: 4 },
    bells: [74, 77, 79, 81, 84], // D5 F5 G5 A5 C6 — ре-минорная пентатоника, ниже ночной
    drone: 26, // D1
    droneCutoff: 160,
    pad: { cutoff: 600, attack: 0.5, vol: 0.04 },
    bell: { min: 6, range: 10, pair: 0.15, vol: 0.8, overtone: 1, decay: 2.4 },
    wind: 0.014,
    windFreq: 380,
    crickets: 0.25,
    leaves: 0.05,
    owl: true,
  },
  peaks: {
    chords: [
      [52, 59, 66, 68], // Eadd9 (E3 B3 F♯4 G♯4)
      [49, 56, 59, 64], // C♯m7 (C♯3 G♯3 B3 E4)
      [45, 52, 59, 61], // Aadd9 (A2 E3 B3 C♯4)
      [47, 54, 59, 64], // Bsus4 (B2 F♯3 B3 E4)
      [42, 49, 52, 59], // F♯m11 (F♯2 C♯3 E3 B3)
    ],
    chordDur: { min: 12, range: 4 }, // медленнее: раз в 12–16 с
    bells: [88, 90, 92, 95, 97, 100], // E6 F♯6 G♯6 B6 C♯7 E7 — ми-мажорная пентатоника, выше ночной
    drone: 28, // E1
    droneCutoff: 200,
    pad: { cutoff: 650, attack: 0.55, vol: 0.026 },
    bell: { min: 4, range: 8, pair: 0.35, vol: 0.7, overtone: 0.35, decay: 3.4 },
    wind: 0.026,
    windFreq: 760,
    crickets: 0,
    leaves: 0,
    owl: false,
  },
};

/** Временный голос (аккорд, колокольчик, сова): общий узел затухания для кроссфейда, источники и прочие узлы. */
interface Voice {
  fade: GainNode;
  sources: AudioScheduledSourceNode[];
  nodes: AudioNode[];
  at: number;
  end: number;
  fading: boolean;
}

type Ctx = BaseAudioContext;

export class NightMusic {
  private ctx: Ctx | null = null;
  private master: GainNode | null = null;
  private duckGain: GainNode | null = null;
  private dry: GainNode | null = null;
  private wet: GainNode | null = null;
  private reverbSend: GainNode | null = null;
  private droneOscs: OscillatorNode[] = [];
  private droneLp: BiquadFilterNode | null = null;
  private windGain: GainNode | null = null;
  private windBp: BiquadFilterNode | null = null;
  private cricketGain: GainNode | null = null;
  private cricketBus: GainNode | null = null;
  private leafBus: GainNode | null = null;
  private voices = new Set<Voice>();
  private mood: Mood = 'night';
  private playing = false;
  private nextChord = 0;
  private nextBell = 0;
  private nextChirp = 0;
  private nextOwl = 0;
  private chordIndex = 0;
  /** Атака (с) первого аккорда после смены настроения — чтобы он входил вместе с затуханием старого. */
  private transitionAttack = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private rand: () => number;
  /** Сколько временных узлов (аккорды, колокольчики, совы) сейчас живы — для проверки утечек. */
  liveNodes = 0;
  /** Всего постоянных узлов графа (создаются один раз). */
  persistentNodes = 0;
  /** Сколько совиных «уху» запланировано (без далёких ответов) — для теста. */
  owlCount = 0;

  constructor(rand: () => number = Math.random) {
    this.rand = rand;
  }

  get isPlaying() {
    return this.playing;
  }

  /** Построить постоянную часть графа (один раз на AudioContext). Начальные уровни слоёв — по настроению. */
  private build(ctx: Ctx) {
    this.ctx = ctx;
    const spec = MOODS[this.mood];
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
    this.droneLp = node(ctx.createBiquadFilter());
    this.droneLp.type = 'lowpass';
    this.droneLp.frequency.value = spec.droneCutoff;
    droneGain.connect(this.droneLp);
    this.droneLp.connect(this.dry);
    for (const ratio of [1, 1.5]) {
      const o = node(ctx.createOscillator());
      o.type = 'sine';
      o.frequency.value = midi(spec.drone) * ratio;
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
    this.windBp = node(ctx.createBiquadFilter());
    this.windBp.type = 'bandpass';
    this.windBp.frequency.value = spec.windFreq;
    this.windBp.Q.value = 0.7;
    this.windGain = node(ctx.createGain());
    this.windGain.gain.value = spec.wind;
    noise.connect(this.windBp);
    this.windBp.connect(this.windGain);
    this.windGain.connect(this.dry);
    this.windGain.connect(send);
    const windLfo = node(ctx.createOscillator());
    windLfo.frequency.value = 0.05;
    const windDepth = node(ctx.createGain());
    windDepth.gain.value = 260;
    windLfo.connect(windDepth);
    windDepth.connect(this.windBp.frequency);
    // Шелест листвы: тот же шум через полосу повыше; «порывы» — две медленные несоизмеримые волны громкости
    // (сумма гуляет от тишины до полной), полоса чуть плавает вместе с порывом.
    const leafBp = node(ctx.createBiquadFilter());
    leafBp.type = 'bandpass';
    leafBp.frequency.value = 1400;
    leafBp.Q.value = 0.5;
    const leafEnv = node(ctx.createGain());
    leafEnv.gain.value = 0.5;
    const gust = node(ctx.createOscillator());
    gust.frequency.value = 0.13;
    const gustDepth = node(ctx.createGain());
    gustDepth.gain.value = 0.3;
    const gustTone = node(ctx.createGain());
    gustTone.gain.value = 350;
    const sway = node(ctx.createOscillator());
    sway.frequency.value = 0.037;
    const swayDepth = node(ctx.createGain());
    swayDepth.gain.value = 0.2;
    gust.connect(gustDepth);
    gustDepth.connect(leafEnv.gain);
    gust.connect(gustTone);
    gustTone.connect(leafBp.frequency);
    sway.connect(swayDepth);
    swayDepth.connect(leafEnv.gain);
    this.leafBus = node(ctx.createGain());
    this.leafBus.gain.value = spec.leaves;
    noise.connect(leafBp);
    leafBp.connect(leafEnv);
    leafEnv.connect(this.leafBus);
    this.leafBus.connect(this.dry);
    this.leafBus.connect(send);
    noise.start();
    windLfo.start();
    gust.start();
    sway.start();
    // Сверчки: один высокий тон, огибающую «стрекота» расписываем автоматизацией громкости (узлы не создаются);
    // общий уровень слоя (в лесу тише и дальше) — отдельный узел, чтобы плавно менять его при смене настроения.
    const cricket = node(ctx.createOscillator());
    cricket.type = 'sine';
    cricket.frequency.value = 4600;
    this.cricketGain = node(ctx.createGain());
    this.cricketGain.gain.value = 0;
    this.cricketBus = node(ctx.createGain());
    this.cricketBus.gain.value = spec.crickets;
    cricket.connect(this.cricketGain);
    this.cricketGain.connect(this.cricketBus);
    this.cricketBus.connect(this.dry);
    this.cricketBus.connect(send);
    cricket.start();
  }

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

  /** Новый голос: узел затухания (для кроссфейда) уже подключён к сухому сигналу и ревербератору. */
  private openVoice(at: number, end: number): Voice {
    const fade = this.ctx!.createGain();
    fade.connect(this.dry!);
    fade.connect(this.reverbSend!);
    return { fade, sources: [], nodes: [], at, end, fading: false };
  }

  /** Запустить голос: считаем узлы, источники играют [at, end], после последнего `onended` всё отключаем. */
  private playVoice(v: Voice) {
    const total = v.sources.length + v.nodes.length + 1;
    this.liveNodes += total;
    this.voices.add(v);
    let left = v.sources.length;
    for (const s of v.sources) {
      s.onended = () => {
        s.disconnect();
        if (--left > 0) return;
        for (const n of v.nodes) n.disconnect();
        v.fade.disconnect();
        this.liveNodes -= total;
        this.voices.delete(v);
      };
      s.start(v.at);
      s.stop(v.end);
    }
  }

  /** Аккорд-подушка: мягкие треугольники с медленной атакой и долгим затуханием. */
  private pad(at: number, notes: number[], dur: number, attack: number) {
    const ctx = this.ctx!;
    const spec = MOODS[this.mood].pad;
    const v = this.openVoice(at, at + dur + 0.05);
    for (const n of notes) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      const f = ctx.createBiquadFilter();
      o.type = 'triangle';
      o.frequency.value = midi(n);
      o.detune.value = (this.rand() - 0.5) * 12;
      f.type = 'lowpass';
      f.frequency.value = spec.cutoff;
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(spec.vol, at + attack);
      g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
      o.connect(f);
      f.connect(g);
      g.connect(v.fade);
      v.sources.push(o);
      v.nodes.push(g, f);
    }
    this.playVoice(v);
  }

  /** Колокольчик/челеста: синус с обертоном, быстрая атака, звонкое затухание — в основном в ревербератор. */
  private bell(at: number, note: number) {
    const ctx = this.ctx!;
    const spec = MOODS[this.mood].bell;
    const k = spec.vol;
    const v = this.openVoice(at, at + spec.decay + 0.1);
    for (const [mult, vol] of [
      [1, 0.05],
      [2.76, 0.012 * spec.overtone],
    ] as const) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = midi(note) * mult;
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(vol * k, at + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, at + spec.decay);
      o.connect(g);
      g.connect(v.fade);
      v.sources.push(o);
      v.nodes.push(g);
    }
    this.playVoice(v);
  }

  /**
   * Совиное «уху»: низкий синус, две ноты (короткая и длинная, вторая ниже), каждая чуть съезжает вниз,
   * лёгкое вибрато. `vol` и `shift` (полутоны) — для далёкого ответа другой совы.
   */
  private owl(at: number, vol = 1, shift = 0) {
    const ctx = this.ctx!;
    const v = this.openVoice(at, at + 1.5);
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    const vib = ctx.createOscillator();
    const vibDepth = ctx.createGain();
    o.type = 'sine';
    const f1 = midi(57 + shift); // A3
    const f2 = midi(55 + shift); // G3
    o.frequency.setValueAtTime(f1, at);
    o.frequency.linearRampToValueAtTime(f1 * 0.94, at + 0.42);
    o.frequency.setValueAtTime(f2, at + 0.5);
    o.frequency.linearRampToValueAtTime(f2 * 0.93, at + 1.4);
    vib.frequency.value = 5.5;
    vibDepth.gain.value = 3;
    vib.connect(vibDepth);
    vibDepth.connect(o.frequency);
    const peak = 0.05 * vol;
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(peak, at + 0.08);
    g.gain.exponentialRampToValueAtTime(peak * 0.6, at + 0.28);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.42);
    g.gain.setValueAtTime(0.0001, at + 0.5);
    g.gain.exponentialRampToValueAtTime(peak, at + 0.62);
    g.gain.exponentialRampToValueAtTime(peak * 0.7, at + 1.0);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 1.4);
    o.connect(g);
    g.connect(v.fade);
    v.sources.push(o, vib);
    v.nodes.push(g, vibDepth);
    this.playVoice(v);
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
      const dur = m.chordDur.min + this.rand() * m.chordDur.range; // аккорд меняется раз в 8–12 с (в горах — 12–16)
      // Соседние аккорды по кругу, иногда — шаг через один.
      this.chordIndex = (this.chordIndex + (this.rand() < 0.7 ? 1 : 2)) % m.chords.length;
      const attack = this.transitionAttack || (dur + 3) * m.pad.attack;
      this.transitionAttack = 0;
      this.pad(this.nextChord, m.chords[this.chordIndex], dur + 3, attack);
      this.nextChord += dur;
    }
    const bellNote = () => m.bells[Math.floor(this.rand() * m.bells.length)];
    while (this.nextBell < until) {
      // Редкие колокольчики: иногда пара нот подряд, со случайными паузами.
      this.bell(this.nextBell, bellNote());
      if (this.rand() < m.bell.pair) this.bell(this.nextBell + 0.35 + this.rand() * 0.3, bellNote());
      this.nextBell += m.bell.min + this.rand() * m.bell.range;
    }
    while (this.nextChirp < until) {
      this.chirp(this.nextChirp);
      this.nextChirp += 1.2 + this.rand() * 3.5;
    }
    while (m.owl && this.nextOwl < until) {
      this.owl(this.nextOwl);
      this.owlCount++;
      // Иногда издалека отвечает другая сова — тише и чуть ниже.
      if (this.rand() < 0.25) this.owl(this.nextOwl + 3 + this.rand() * 2, 0.45, -2);
      this.nextOwl += 15 + this.rand() * 15; // раз в 15–30 с
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
    this.nextOwl = Math.max(this.nextOwl, now + 4 + this.rand() * 8);
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

  /** Плавно (за MOOD_FADE) довести параметр от текущего значения до нового — без скачка и щелчка. */
  private glide(p: AudioParam, value: number, now: number) {
    p.cancelScheduledValues(now);
    p.setValueAtTime(p.value, now);
    p.linearRampToValueAtTime(value, now + MOOD_FADE);
  }

  /**
   * Настроение: ночь (карта и уровни Долины), теплее (деревня), лес («Туманный лес»), вершины («Ледяные
   * вершины»). Кроссфейд за MOOD_FADE:
   * слои и гул плавно меняются, голоса старого настроения затухают и останавливаются, первый аккорд нового
   * входит с атакой той же длины. Повторный вызов с тем же настроением ничего не делает.
   */
  setMood(mood: Mood) {
    if (mood === this.mood) return;
    this.mood = mood;
    this.chordIndex = 0;
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const spec = MOODS[mood];
    this.droneOscs.forEach((o, i) => this.glide(o.frequency, midi(spec.drone) * (i ? 1.5 : 1), now));
    this.glide(this.droneLp!.frequency, spec.droneCutoff, now);
    this.glide(this.windGain!.gain, spec.wind, now);
    this.glide(this.windBp!.frequency, spec.windFreq, now);
    this.glide(this.cricketBus!.gain, spec.crickets, now);
    this.glide(this.leafBus!.gain, spec.leaves, now);
    // Звучащие и уже запланированные голоса — затухают. Узел затухания до этого не автоматизировался (стоит на 1),
    // а уже затухающие (быстрое переключение туда-обратно) не трогаем — без скачков громкости.
    const stopAt = now + MOOD_FADE + 0.05;
    for (const v of this.voices) {
      if (v.fading) continue;
      v.fading = true;
      v.fade.gain.setValueAtTime(1, now);
      v.fade.gain.linearRampToValueAtTime(0, now + MOOD_FADE);
      const end = Math.max(stopAt, v.at + 0.05);
      if (end < v.end) {
        v.end = end;
        for (const s of v.sources) s.stop(end);
      }
    }
    // Новое настроение начинается сразу: аккорд с атакой длиной в кроссфейд, колокольчики и совы — по своему ритму.
    this.nextChord = now + 0.05;
    this.transitionAttack = MOOD_FADE;
    this.nextBell = now + 1.5 + this.rand() * spec.bell.min;
    if (spec.owl) this.nextOwl = now + 4 + this.rand() * 8;
    this.tick();
  }

  getMood() {
    return this.mood;
  }
}

export const music = new NightMusic();
