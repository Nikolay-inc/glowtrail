// npm run sim-economy — экономика на три главы для трёх профилей (слабый, средний, сильный), каждый без
// перепрохождений и с 15 минутами перепрохождений и заданий в день. Печатает таблицу цен, «когда что доступно»
// и где у среднего игрока «впритык»; падает, если цели не выполнены:
//  - средний без перепрохождений: к концу каждой главы 85–90% построек района и их первых улучшений;
//  - в первый час каждой главы новая цель не реже чем раз в 5 минут;
//  - уровни экономика не блокирует (в модели уровень проходится всегда — проверяем, что все 90 пройдены).
// Модель — src/core/economyModel.ts. Флаг --md — таблицы в Markdown.

import { LEVELS } from '../src/levels/index';
import {
  ABILITY_ORDER,
  abilitiesTotal,
  abilityPrice,
  buildingCost,
  CHAPTERS,
  COZY_REWARDS,
  COZY_STEP,
  DAILY_QUESTS,
  DECOR_PRICES,
  DECOR_SLOTS,
  DISTRICT_BUILDINGS,
  PROFILES,
  priceTotals,
  REPLAY_COINS,
  simulate3,
  STREET_PRICES,
  STREETS_PER_DISTRICT,
  WEEKLY_QUEST,
  wardrobeTotal,
  WARDROBE_COIN_ITEMS,
  type ModelLevel,
  type SimResult,
} from '../src/core/economyModel';
import { RARITY_PRICE } from '../src/core/wardrobe';

const ch1: ModelLevel[] = LEVELS.slice(0, 30).map((l) => ({ num: l.num, chapter: 1, rating: l.metrics?.rating ?? 3, fireflies: l.fireflies.length, infinite: l.tileSet !== null }));

const row = (cells: (string | number)[]) => `| ${cells.join(' | ')} |`;
const head = (cells: string[]) => `${row(cells)}\n${row(cells.map(() => '---'))}`;
const out: string[] = [];
const p = (s = '') => out.push(s);

// ---------------------------------------------------------------------------
// Цены

p('## Цены');
p();
p('### Постройки по уровням (свет / монеты)');
p();
for (const c of CHAPTERS) {
  p(`**Глава ${c.id} — ${c.district}** (монеты × ${c.coinMult})`);
  p();
  p(head(['Постройка', 'Ур. 1 восстановить', 'Ур. 2 улучшить', 'Ур. 3 расцвет']));
  DISTRICT_BUILDINGS[c.district].forEach((id, i) => {
    const [a, b, d] = ([1, 2, 3] as const).map((n) => buildingCost(c.district, i, n));
    p(row([id, `${a.light} свет`, `${b.coins} мон.`, `${d.coins} мон. + ${d.light} свет`]));
  });
  p();
}
const totals = priceTotals();
p(head(['Глава', 'Ур. 1 (свет)', 'Ур. 2 (мон.)', 'Ур. 3 (мон. + свет)', `Украшения (${DECOR_SLOTS} слотов, все варианты)`, `Улицы (${STREETS_PER_DISTRICT} × 3 шага)`]));
for (const x of totals) p(row([x.chapter, x.l1Light, x.l2Coins, `${x.l3Coins} + ${x.l3Light}`, x.decor, x.streets]));
p();
p(`Украшения: вариант 1…5 слота — ${DECOR_PRICES.join(' / ')} мон. (× глава), в слоте 3–5 вариантов, покупка один раз, смена бесплатно.`);
p(`Улицы: тропинка → гравий → брусчатка → мощёная с фонарями — ${STREET_PRICES.join(' / ')} мон. (× глава).`);
p(`Улучшения способностей: ${ABILITY_ORDER.map((a) => `${a.id} ${a.level} — ${abilityPrice(a)}`).join(', ')} (всего ${abilitiesTotal()}).`);
const byR: Record<string, number[]> = {};
for (const w of WARDROBE_COIN_ITEMS) (byR[w.rarity] ??= []).push(w.price);
p(`Гардероб за монеты: ${Object.entries(byR).map(([r, v]) => `${r} ${v.length} шт., ${Math.min(...v)}–${Math.max(...v)} (середина ${RARITY_PRICE[r as keyof typeof RARITY_PRICE]})`).join('; ')}; всего ${wardrobeTotal()} мон. Остальные вещи — деревня, награда дня, задания, сундуки, уют; «особые» — Р4.`);
p(`Доходы сверх уровней: задания жителей ${DAILY_QUESTS.map((q) => ('coins' in q ? `${q.coins} мон.` : `${q.light} свет`)).join(' + ')} в день и ${WEEKLY_QUEST.coins} мон. + сундук в неделю; повтор без улучшения — ${REPLAY_COINS.join(' → ')} мон. за уровень в день; уют — награда каждые ${COZY_STEP} очков (${COZY_REWARDS.map((r) => Object.keys(r)[0]).join(', ')}).`);
p();

// ---------------------------------------------------------------------------
// Симуляция

const runs: SimResult[] = [];
for (const prof of PROFILES) for (const extra of [0, 15]) runs.push(simulate3(ch1, prof, extra));
const NAMES: Record<string, string> = { weak: 'слабый (1,8★, 40%)', average: 'средний (2,4★, 65%)', strong: 'сильный (2,9★, 90%)' };

p('## Когда что доступно');
p();
p(head(['Профиль', '+мин/день', 'Глава', 'Пройдена (мин / дней)', 'Ур.1', 'Ур.2', 'Доля 1+2', 'Ур.3', 'Украшения', 'Улицы', 'Гардероб', 'Способности', 'Макс. пауза в 1-й час', 'Осталось мон./свет']));
for (const r of runs) {
  for (const c of r.chapters) {
    p(row([NAMES[r.profile], r.extra, c.chapter, `${c.doneAt} / ${c.days}`, `${c.l1}/10`, `${c.l2}/10`, `${Math.round(c.share * 100)}%`, `${c.l3}/10`, `${c.decor}/${c.decorTotal}`, `${c.streets}/${c.streetsTotal}`, `${c.wardrobe}/${WARDROBE_COIN_ITEMS.length}`, `${c.abilities}/${ABILITY_ORDER.length}`, `${c.maxGapFirstHour} мин (${c.goalsFirstHour} целей)`, `${c.coinsLeft} / ${c.lightLeft}`]));
  }
}
p();
p('### Средний игрок без перепрохождений: минута главы, когда восстановлена / улучшена постройка');
p();
const avg0 = runs.find((r) => r.profile === 'average' && r.extra === 0)!;
p(head(['Глава', ...Array.from({ length: 10 }, (_, i) => String(i + 1))]));
for (const c of avg0.chapters) {
  p(row([`${c.chapter} ур.1`, ...c.l1At.map((x) => (x < 0 ? '—' : Math.round(x)))]));
  p(row([`${c.chapter} ур.2`, ...c.l2At.map((x) => (x < 0 ? '—' : Math.round(x)))]));
}
p();
p('## Где у среднего игрока «впритык»');
p();
for (const w of avg0.waits.slice(0, 8)) p(`- глава ${w.chapter}, уровень ${w.level}: ${w.minutes} мин без новой цели — ждёт ${w.waitingFor}`);
const avg15 = runs.find((r) => r.profile === 'average' && r.extra === 15)!;
p();
p('## Сколько перепрохождений нужно на всё');
p();
p(head(['Профиль', 'Мин. за 3 главы', 'Все постройки ур. 3', 'Все улицы', 'Все способности', 'Все украшения', 'Весь гардероб', 'Всё вместе']));
const dd = (x: number | null) => (x === null ? '—' : x === 0 ? 'к концу гл. 3' : `+${x} дн. (${x * 15} мин)`);
for (const r of runs.filter((x) => x.extra > 0)) {
  const m = r.milestones;
  p(row([NAMES[r.profile], r.extraMinutesTotal, dd(m.buildings), dd(m.streets), dd(m.abilities), dd(m.decor), dd(m.wardrobe), dd(r.tailDays)]));
}
p();

// ---------------------------------------------------------------------------
// Цели

const problems: string[] = [];
for (const c of avg0.chapters) {
  if (c.share < 0.85 || c.share > 0.9) problems.push(`средний без перепрохождений, глава ${c.chapter}: построек и улучшений ${Math.round(c.share * 100)}% (нужно 85–90%)`);
}
for (const r of runs.filter((x) => x.profile === 'average')) {
  for (const c of r.chapters) if (c.maxGapFirstHour > 5) problems.push(`средний +${r.extra}, глава ${c.chapter}: пауза ${c.maxGapFirstHour} мин в первый час (нужно ≤ 5)`);
}
for (const r of runs) if (r.chapters.length !== 3) problems.push(`${r.profile}: пройдены не все главы`);
const value = (c: (typeof avg0.chapters)[number]) => c.l1 + c.l2 + c.l3 + c.abilities + c.wardrobe + c.streets;
if (value(avg15.chapters[2]) <= value(avg0.chapters[2])) problems.push('перепрохождения ничего не дают сверх обычной игры');

console.log(out.join('\n'));
if (problems.length) {
  console.log(`\n✗ Цели экономики не выполнены:\n${problems.map((x) => `  - ${x}`).join('\n')}`);
  process.exit(1);
}
console.log('\n✓ Цели экономики выполнены: 85–90% построек и улучшений без перепрохождений, цель каждые ≤ 5 мин в первый час каждой главы, уровни не блокируются.');
