// Редактор уровней — только для разработки: открывается по ?editor=1 при npm run dev.
// В продакшен-сборку не попадает: main.ts подключает его через import.meta.env.DEV (Vite вырезает ветку).
//
// Сетка выбранного размера, рисование клеток тапом (пусто, камень, вода, фонарь, старт с направлением, выход,
// светлячок), колода, кнопки «Проверить» (метрики решателя), «Сыграть» (пройти уровень в игре),
// «Показать решение», «Экспорт JSON» (в буфер) и «Загрузить» (вставить JSON или открыть уровень игры).
// Обычный HTML поверх игры; черновик сохраняется в localStorage.

import type Phaser from 'phaser';
import { analyzeLevel } from '../core/difficulty';
import { starThresholds } from '../core/game';
import { parseLevel } from '../core/level';
import { easeDeck, solutionOf } from '../core/solver';
import { CELL_BY_CHAR, CHAR_BY_CELL, TILE_KINDS, type CellType, type LevelData, type TileKind } from '../core/types';
import { LEVELS } from '../levels/index';
import { EDITOR_RETURN } from '../scenes/GameScene';

type Tool = CellType;
const DIRS = ['N', 'E', 'S', 'W'] as const;
const ARROW = { N: '⬆', E: '➡', S: '⬇', W: '⬅' } as const;
const CELL_VIEW: Record<CellType, { label: string; bg: string; title: string }> = {
  empty: { label: '', bg: '#232c5e', title: 'Пусто' },
  rock: { label: '🪨', bg: '#3c4062', title: 'Камень' },
  water: { label: '〰', bg: '#1d4d8f', title: 'Вода' },
  lantern: { label: '🏮', bg: '#3a3350', title: 'Фонарь' },
  start: { label: '⬆', bg: '#7a5a1f', title: 'Старт (тап ещё раз — повернуть)' },
  exit: { label: '🚪', bg: '#1d6b66', title: 'Выход' },
  firefly: { label: '✨', bg: '#2f4a2a', title: 'Светлячок' },
};
const TILE_VIEW: Record<TileKind, string> = { straight: '↑', straight2: '⇈', left: '↰', right: '↱', bridge: '═' };
const TILE_RU: Record<TileKind, string> = { straight: 'прямо', straight2: 'прямо ×2', left: 'налево', right: 'направо', bridge: 'мост' };
const STORE_KEY = 'glowtrail.editor';

interface Draft {
  id: string;
  name: string;
  width: number;
  height: number;
  cells: CellType[];
  startDir: LevelData['startDir'];
  deck: TileKind[];
  tileSet?: TileKind[];
  allowStash: boolean;
  night: boolean;
}

function emptyDraft(width = 5, height = 7): Draft {
  const cells: CellType[] = new Array(width * height).fill('empty');
  cells[(height - 1) * width + Math.floor(width / 2)] = 'start';
  cells[Math.floor(width / 2)] = 'exit';
  return { id: 'valley-99', name: 'Новый уровень', width, height, cells, startDir: 'N', deck: ['straight', 'straight', 'left', 'right', 'straight', 'straight2'], allowStash: true, night: false };
}

function fromData(d: LevelData): Draft {
  const height = d.grid.length;
  const width = d.grid[0].length;
  const cells = d.grid.flatMap((row) => [...row].map((ch) => CELL_BY_CHAR[ch] ?? 'empty'));
  return { id: String(d.id), name: d.name, width, height, cells, startDir: d.startDir, deck: [...d.deck], tileSet: d.tileSet ? [...d.tileSet] : undefined, allowStash: d.allowStash ?? true, night: !!d.night };
}

function toData(dr: Draft): LevelData {
  const grid: string[] = [];
  for (let y = 0; y < dr.height; y++) grid.push(dr.cells.slice(y * dr.width, (y + 1) * dr.width).map((c) => CHAR_BY_CELL[c]).join(''));
  const d: LevelData = { id: dr.id, name: dr.name, grid, startDir: dr.startDir, deck: [...dr.deck], stars: { two: 0, three: 0 } };
  if (dr.tileSet) d.tileSet = [...dr.tileSet];
  if (!dr.allowStash) d.allowStash = false;
  if (dr.night) d.night = true;
  return d;
}

const CSS = `
.gte{position:fixed;inset:0;z-index:50;overflow:auto;background:#0b0f27;color:#fff1cc;font:16px "Trebuchet MS",system-ui,sans-serif;padding:16px}
.gte h1{font-size:22px;margin:0 0 12px}
.gte .row{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:8px 0}
.gte button,.gte select,.gte input{font:inherit;color:#fff1cc;background:#2b3470;border:2px solid #4a57a8;border-radius:10px;padding:6px 10px}
.gte button{cursor:pointer}
.gte button.on{background:#ffb84d;color:#2a1a05;border-color:#ffd36b}
.gte button.primary{background:#ffb84d;color:#2a1a05}
.gte input[type=checkbox]{width:auto}
.gte .wrap{display:flex;flex-wrap:wrap;gap:24px;align-items:flex-start}
.gte .grid{display:grid;gap:4px;background:#121845;padding:8px;border-radius:14px;touch-action:none}
.gte .cell{width:56px;height:56px;border-radius:10px;border:none;font-size:26px;display:flex;align-items:center;justify-content:center;position:relative;padding:0}
.gte .cell .n{position:absolute;right:3px;bottom:1px;font-size:12px;color:#ffd36b;font-weight:bold}
.gte .cell.path{outline:3px solid #ffc65c}
.gte .deck{display:flex;flex-wrap:wrap;gap:6px;max-width:520px}
.gte .chip{min-width:42px;font-size:22px}
.gte .chip.sel{outline:3px solid #ffd36b}
.gte pre{background:#121845;border-radius:12px;padding:10px;white-space:pre-wrap;max-width:560px;font:14px Menlo,monospace}
.gte textarea{width:min(560px,100%);height:180px;background:#121845;color:#fff1cc;border-radius:12px;border:2px solid #4a57a8;font:13px Menlo,monospace}
.gte .muted{color:#9aa3d6}
`;

export function startEditor(game: Phaser.Game) {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
  const root = document.createElement('div');
  root.className = 'gte';
  document.body.appendChild(root);

  let draft: Draft = emptyDraft();
  try {
    const saved = localStorage.getItem(STORE_KEY);
    if (saved) draft = JSON.parse(saved) as Draft;
  } catch {
    /* черновика нет */
  }
  let tool: Tool = 'rock';
  let selected = -1;
  let solution: number[][] = [];
  let report = '';
  let loadOpen = false;

  const save = () => {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(draft));
    } catch {
      /* без сохранения */
    }
  };

  const level = () => parseLevel(toData(draft));

  function setCell(i: number) {
    const cur = draft.cells[i];
    solution = [];
    if (tool === 'start' && cur === 'start') {
      draft.startDir = DIRS[(DIRS.indexOf(draft.startDir) + 1) % 4];
    } else if (tool === 'start' || tool === 'exit') {
      // Старт и выход — по одному: старый становится пустой клеткой.
      draft.cells = draft.cells.map((c) => (c === tool ? 'empty' : c));
      draft.cells[i] = tool;
    } else {
      draft.cells[i] = cur === tool ? 'empty' : tool;
    }
    save();
    render();
  }

  function check() {
    try {
      const l = level();
      const t0 = performance.now();
      const r = analyzeLevel(l);
      const m = r.metrics;
      const stars = starThresholds(r.maxLeftover);
      report = r.solvable
        ? [
            `Решается ✓ (${Math.round(performance.now() - t0)} мс)`,
            `Рейтинг сложности: ${m.rating} из 10`,
            `Решений: ${m.roads >= 500 ? '500+' : m.roads}`,
            `Минимум плиток: ${m.minTiles}, запас: ${m.reserve < 0 ? '∞' : m.reserve}`,
            `Тупиковых ходов: ${Math.round(m.trap * 100)}%`,
            l.fireflies.length ? `Светлячков: ${l.fireflies.length}, собрать можно ${r.maxFireflies}` : 'Светлячков нет',
            l.tileSet ? 'Звёзды — по отменам' : `Звёзды: 2★ от ${stars.two}, 3★ от ${stars.three} (макс. остаток ${r.maxLeftover})`,
            r.solvableWithoutStash ? '«Отложить» не обязателен' : '⚠ без «отложить» не решить',
            m.roads < 2 ? '⚠ одно решение — в мире таких уровней нет' : '',
          ]
            .filter(Boolean)
            .join('\n')
        : 'Не решается ✗';
    } catch (e) {
      report = `Ошибка: ${(e as Error).message}`;
    }
    render();
  }

  function showSolution() {
    try {
      const steps = solutionOf(level());
      solution = steps.map((s) => s.cells);
      report = steps.length
        ? 'Решение:\n' + steps.map((s, i) => `${i + 1}. ${TILE_VIEW[s.kind]} ${TILE_RU[s.kind]}${s.from === 'swap' ? ' (обмен с отложенной)' : s.from === 'stash' ? ' (из «отложить»)' : s.from === 'toStash' ? ' — отложить' : ''}`).join('\n')
        : 'Не решается ✗';
    } catch (e) {
      report = `Ошибка: ${(e as Error).message}`;
    }
    render();
  }

  /** Полный JSON уровня: звёзды, колоды облегчения и метрики посчитаны. */
  function fullJson(): string {
    const data = toData(draft);
    const l = parseLevel(data);
    const r = analyzeLevel(l);
    if (!l.tileSet && r.solvable) {
      data.stars = starThresholds(r.maxLeftover);
      const one = easeDeck(l, 1);
      data.easeDecks = [one, easeDeck(l, 1, one)];
    }
    data.metrics = r.metrics;
    return JSON.stringify(data, null, 2);
  }

  async function exportJson() {
    try {
      const json = fullJson();
      try {
        await navigator.clipboard.writeText(json);
        report = 'JSON скопирован в буфер ✓\nПоложи его в src/levels/<мир>/NN.json, затем npm run ease и npm run verify.';
      } catch {
        report = 'Не удалось скопировать — выдели текст ниже:\n\n' + json;
      }
    } catch (e) {
      report = `Ошибка: ${(e as Error).message}`;
    }
    render();
  }

  function play() {
    try {
      const l = level();
      root.style.display = 'none';
      game.events.once(EDITOR_RETURN, () => {
        root.style.display = '';
        render();
      });
      game.scene.stop('Boot');
      game.scene.start('Game', { custom: l });
    } catch (e) {
      report = `Ошибка: ${(e as Error).message}`;
      render();
    }
  }

  function load(json: string) {
    try {
      const d = JSON.parse(json) as LevelData;
      parseLevel(d); // проверка
      draft = fromData(d);
      solution = [];
      report = `Загружен уровень «${d.name}»`;
      loadOpen = false;
      save();
    } catch (e) {
      report = `Не получилось загрузить: ${(e as Error).message}`;
    }
    render();
  }

  function render() {
    const l = (() => {
      try {
        return level();
      } catch {
        return null;
      }
    })();
    const order = new Map<number, number>();
    solution.forEach((cells, i) => cells.forEach((c) => order.set(c, i + 1)));
    root.innerHTML = '';
    const h = (tag: string, attrs: Record<string, string> = {}, text = '') => {
      const el = document.createElement(tag);
      for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
      if (text) el.textContent = text;
      return el;
    };
    const btn = (label: string, on: () => void, cls = '') => {
      const b = h('button', cls ? { class: cls } : {}, label) as HTMLButtonElement;
      b.onclick = on;
      return b;
    };

    root.append(h('h1', {}, 'Редактор уровней Glowtrail'));
    root.append(h('div', { class: 'muted' }, 'Только для разработки. Тап по клетке — нарисовать выбранное; повторный тап — стереть. Старт: тап по старту поворачивает его.'));

    // Название, id, размер
    const meta = h('div', { class: 'row' });
    const idIn = h('input', { value: draft.id, size: '10', title: 'id уровня' }) as HTMLInputElement;
    idIn.onchange = () => ((draft.id = idIn.value.trim()), save());
    const nameIn = h('input', { value: draft.name, size: '22', title: 'Название' }) as HTMLInputElement;
    nameIn.onchange = () => ((draft.name = nameIn.value), save());
    const wSel = h('select') as HTMLSelectElement;
    const hSel = h('select') as HTMLSelectElement;
    for (let n = 3; n <= 8; n++) wSel.append(new Option(String(n), String(n), false, n === draft.width));
    for (let n = 3; n <= 10; n++) hSel.append(new Option(String(n), String(n), false, n === draft.height));
    const resize = () => {
      const w = Number(wSel.value);
      const hh = Number(hSel.value);
      const cells: CellType[] = new Array(w * hh).fill('empty');
      for (let y = 0; y < Math.min(hh, draft.height); y++) for (let x = 0; x < Math.min(w, draft.width); x++) cells[y * w + x] = draft.cells[y * draft.width + x];
      draft = { ...draft, width: w, height: hh, cells };
      solution = [];
      save();
      render();
    };
    wSel.onchange = resize;
    hSel.onchange = resize;
    meta.append('id', idIn, 'название', nameIn, 'поле', wSel, '×', hSel, btn('Очистить', () => ((draft = { ...emptyDraft(draft.width, draft.height), id: draft.id, name: draft.name }), (solution = []), save(), render())));
    root.append(meta);

    // Палитра
    const pal = h('div', { class: 'row' });
    for (const t of Object.keys(CELL_VIEW) as CellType[]) {
      const v = CELL_VIEW[t];
      pal.append(btn(`${t === 'start' ? ARROW[draft.startDir] : v.label || '▢'} ${v.title.split(' (')[0]}`, () => ((tool = t), render()), tool === t ? 'on' : ''));
    }
    root.append(pal);

    const wrap = h('div', { class: 'wrap' });
    // Сетка
    const grid = h('div', { class: 'grid' });
    grid.style.gridTemplateColumns = `repeat(${draft.width}, 56px)`;
    draft.cells.forEach((c, i) => {
      const v = CELL_VIEW[c];
      const cell = btn(c === 'start' ? ARROW[draft.startDir] : v.label, () => setCell(i), `cell${order.has(i) ? ' path' : ''}`);
      cell.style.background = v.bg;
      cell.title = v.title;
      if (order.has(i)) cell.append(h('span', { class: 'n' }, String(order.get(i))));
      grid.append(cell);
    });
    wrap.append(grid);

    // Колода
    const side = h('div');
    side.append(h('div', {}, draft.tileSet ? `Бесконечная колода из набора: ${draft.tileSet.map((k) => TILE_VIEW[k]).join(' ')}` : `Колода (${draft.deck.length}), сверху вниз — первые 3 сразу в лотке:`));
    const deck = h('div', { class: 'deck' });
    draft.deck.forEach((k, i) => deck.append(btn(TILE_VIEW[k], () => ((selected = selected === i ? -1 : i), render()), `chip${selected === i ? ' sel' : ''}`)));
    side.append(deck);
    const add = h('div', { class: 'row' });
    for (const k of TILE_KINDS) {
      add.append(
        btn(`+ ${TILE_VIEW[k]} ${TILE_RU[k]}`, () => {
          // Новая плитка — после выбранной или в конец.
          const at = selected >= 0 ? selected + 1 : draft.deck.length;
          draft.deck.splice(at, 0, k);
          if (selected >= 0) selected = at;
          solution = [];
          save();
          render();
        }),
      );
    }
    side.append(add);
    const move = h('div', { class: 'row' });
    const shift = (d: number) => {
      const j = selected + d;
      if (selected < 0 || j < 0 || j >= draft.deck.length) return;
      [draft.deck[selected], draft.deck[j]] = [draft.deck[j], draft.deck[selected]];
      selected = j;
      save();
      render();
    };
    move.append(
      btn('◀ раньше', () => shift(-1)),
      btn('позже ▶', () => shift(1)),
      btn('✕ убрать', () => {
        if (selected < 0) return;
        draft.deck.splice(selected, 1);
        selected = Math.min(selected, draft.deck.length - 1);
        save();
        render();
      }),
    );
    const stash = h('input', { type: 'checkbox' }) as HTMLInputElement;
    stash.checked = draft.allowStash;
    stash.onchange = () => ((draft.allowStash = stash.checked), save());
    const night = h('input', { type: 'checkbox' }) as HTMLInputElement;
    night.checked = draft.night;
    night.onchange = () => ((draft.night = night.checked), save());
    const l1 = h('label');
    l1.append(stash, ' «отложить»');
    const l2 = h('label');
    l2.append(night, ' ночь');
    move.append(l1, l2);
    side.append(move);

    // Действия
    const act = h('div', { class: 'row' });
    act.append(btn('Проверить', check), btn('▶ Сыграть', play, 'primary'), btn('Показать решение', showSolution), btn('Экспорт JSON', () => void exportJson()), btn('Загрузить', () => ((loadOpen = !loadOpen), render())));
    side.append(act);
    if (loadOpen) {
      const box = h('div');
      const ta = h('textarea', { placeholder: 'Вставь JSON уровня' }) as HTMLTextAreaElement;
      const pick = h('select') as HTMLSelectElement;
      pick.append(new Option('— открыть уровень игры —', ''));
      LEVELS.forEach((lv) => pick.append(new Option(`${lv.num}. ${lv.name}`, lv.id)));
      pick.onchange = async () => {
        const lv = LEVELS.find((x) => x.id === pick.value);
        if (!lv) return;
        const world = lv.id.split('-')[0];
        const num = lv.id.split('-')[1];
        const mod = (await import(`../levels/${world}/${num}.json`)) as { default: LevelData };
        load(JSON.stringify(mod.default));
      };
      box.append(ta, h('br'), btn('Загрузить JSON', () => load(ta.value)), ' ', pick);
      side.append(box);
    }
    if (!l) side.append(h('pre', {}, 'Поле пока не готово: нужен старт и выход.'));
    if (report) side.append(h('pre', {}, report));
    wrap.append(side);
    root.append(wrap);
  }

  render();
}
