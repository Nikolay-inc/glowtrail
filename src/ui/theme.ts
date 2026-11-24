// Размеры и цвета. Игра рисуется в виртуальном холсте 1080×1920 и масштабируется под экран.

export const W = 1080;
export const H = 1920;

export const FONT = '"Trebuchet MS", "Avenir Next", "Segoe UI", system-ui, -apple-system, Roboto, sans-serif';
export const MONO = 'Menlo, Consolas, "Roboto Mono", monospace';

export const C = {
  bgTop: 0x161c46,
  bgBottom: 0x0b0f27,
  // Поле «Долины» — сумерки: тёмная трава и вода, дорога — лента света, которую несёт Lumo.
  cell: 0x1e3a2e,
  cellLight: 0x2a4f3c,
  cellEdge: 0x152a22,
  field: 0x0c1a17,
  grass: 0x3e6e4a,
  grassDark: 0x22442f,
  rock: 0x5a5f72,
  rockDark: 0x3a3e50,
  rockLight: 0x7e8498,
  water: 0x173a66,
  waterLight: 0x5a9ad6,
  road: 0xf0bd6e,
  roadGlow: 0xffc65c,
  roadCore: 0xfff1cc,
  /** Сумеречное небо уровня: тёмно-синее, у горизонта — едва тёплая полоса. */
  eveTop: 0x0d1130,
  eveMid: 0x1a1a44,
  eveBottom: 0x3a2848,
  bridge: 0x8a5a33,
  bridgeLight: 0xb57b4a,
  lanternOff: 0x6d6150,
  lanternOn: 0xffd36b,
  post: 0x3a3350,
  exitClosed: 0x3b3566,
  exitOpen: 0x8ef0c8,
  card: 0x2b3470,
  cardEdge: 0x4a57a8,
  cardDisabled: 0x1e2448,
  icon: 0xfff1cc,
  iconDisabled: 0x5a6290,
  ghost: 0xffe2a0,
  bad: 0xff6b6b,
  button: 0x2b3470,
  buttonEdge: 0x4a57a8,
  primary: 0xffb84d,
  primaryDark: 0xd98a1f,
  text: '#fff1cc',
  textDim: '#9aa3d6',
  star: 0xffd36b,
  starEmpty: 0x3a4278,
  panel: 0x1a2150,
  /** Светлячок: жёлто-зелёный огонёк — отличается и от жёлтой дороги, и от оранжевых фонарей. */
  firefly: 0xc8ff7a,
  fireflyGlow: 0x9dff5c,
};

export const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;
