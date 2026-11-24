// Размеры и цвета. Игра рисуется в виртуальном холсте 1080×1920 и масштабируется под экран.

export const W = 1080;
export const H = 1920;

export const FONT = '"Trebuchet MS", "Avenir Next", "Segoe UI", system-ui, -apple-system, Roboto, sans-serif';
export const MONO = 'Menlo, Consolas, "Roboto Mono", monospace';

export const C = {
  bgTop: 0x161c46,
  bgBottom: 0x0b0f27,
  // Поле «Долины» — тёплый вечер: луговая зелень, золото дороги, закатное небо.
  cell: 0x4f7f3a,
  cellLight: 0x6e9e4b,
  cellEdge: 0x3a6230,
  field: 0x24402a,
  grass: 0x7fb24f,
  grassDark: 0x4a7a32,
  rock: 0x8f8679,
  rockDark: 0x5f574f,
  rockLight: 0xbdb3a3,
  water: 0x2f78ad,
  waterLight: 0x9ad6f5,
  road: 0xe8c07a,
  roadEdge: 0x8a6436,
  cobble: 0xf3d89c,
  cobbleDark: 0xc49a5a,
  roadGlow: 0xffc65c,
  roadCore: 0xfff1cc,
  /** Вечернее небо уровня: сверху сумеречно-синее, к горизонту — закат. */
  eveTop: 0x2b2a62,
  eveMid: 0x7a4a78,
  eveBottom: 0xd07a52,
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
