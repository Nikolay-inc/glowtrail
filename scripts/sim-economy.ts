// npm run sim-economy — экономика на три главы для трёх профилей (слабый, средний, сильный), каждый без
// перепрохождений и с 15 минутами перепрохождений и заданий в день. Печатает таблицу цен, «когда что доступно»,
// где у среднего игрока «впритык» и сколько дней добирать; падает, если цели не выполнены:
//  - средний без перепрохождений: к концу каждой главы 85–90% построек района и их первых улучшений;
//  - слабый без перепрохождений: не меньше 75% к концу каждой главы;
//  - гардероб (части Lumo, куплено + награды) у среднего без перепрохождений: глава 1 — 3–4, глава 3 — 10–12,
//    с 15 мин в день — примерно вдвое больше (1,6–2,4×); первая покупка вещи — в первые 20 минут;
//  - стили поля (фонари, дороги, арки; куплено + награды) у среднего без перепрохождений: глава 1 — 1–2, глава 3 — 5–6;
//  - свет не копится: у среднего в конце каждой главы ≤ 30 света (с перепрохождениями ≤ 60);
//  - «хвост» у среднего с 15 мин в день: все третьи уровни построек, все улицы и по украшению в каждом слоте —
//    не дольше 45 дней после главы 3;
//  - в первый час каждой главы новая цель не реже чем раз в 5 минут — у слабого и среднего;
//  - уровни экономика не блокирует (в модели уровень проходится всегда — проверяем, что все 90 пройдены);
//  - ролики (Р4, 0 / 2 / 5 в день) и стартовый набор ускоряют, но не ломают: цели выше считаются без роликов и покупок,
//    а «хвост» у среднего с 15 мин и 5 роликами в день — не меньше 14 дней.
// Модель — src/core/economyModel.ts, цены — src/core/villageData.ts и wardrobe.ts (общие с игрой).

import ru from '../src/i18n/ru.json';
import { decorType } from '../src/core/villageData';
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
  DECOR_LIGHT,
  DECOR_PRICES,
  DECOR_SLOTS,
  DISTRICT_BUILDINGS,
  PROFILES,
  priceTotals,
  REPLAY_COINS,
  SHOP_ITEMS,
  simulate3,
  STREET_PRICES,
  STREETS_PER_DISTRICT,
  WEEKLY_QUEST,
  wardrobeTotal,
  type ModelLevel,
  type SimResult,
} from '../src/core/economyModel';

// Настоящие уровни: глава 1 — «Долина» (1–30), глава 2 — «Туманный лес» (31–60); глава 3 — по плану модели.
const ch1: ModelLevel[] = LEVELS.slice(0, 60).map((l) => ({ num: l.num, chapter: l.num <= 30 ? 1 : 2, rating: l.metrics?.rating ?? 3, fireflies: l.fireflies.length, infinite: l.tileSet !== null }));

// Названия — из русских текстов игры (i18n), а не внутренние id.
const RU = ru as Record<string, string>;
const tr = (key: string) => RU[key] ?? key;
const district = (d: string) => tr(`district.${d}`);
const building = (id: string) => tr(`building.${id}.name`);
const ABILITY: Record<string, string> = { stash: 'upgrade.stash.name', rotate: 'upgrade.rotate.name', lantern: 'upgrade.lantern.name' };
const COZY_WORD: Record<string, string> = { coins: 'монеты', light: 'свет', item: 'вещь', street: 'шаг улицы', chest: 'сундук' };
/** Цель симуляции («valley:well», «forest:3.2», «valley:2→1», «rotate→2», id вещи…) — по-человечески. */
function label(what: string): string {
  let m: RegExpMatchArray | null;
  if ((m = what.match(/^(\w+):(\d+)\.(\d+)$/))) {
    const type = decorType(+m[2] - 1);
    return `${district(m[1])}: ${tr(`decor.${type}`)} «${tr(`decor.${type}.${+m[3] - 1}`)}» (слот ${m[2]})`;
  }
  if ((m = what.match(/^(\w+):(\d+)→(\d+)$/))) return `${tr(`street.${m[1]}.${+m[2] - 1}`)} → шаг ${m[3]}`;
  if ((m = what.match(/^(\w+):([\w-]+?)(\+gift)?$/))) return `${district(m[1])}: ${building(m[2])}${m[3] ? ' (подарок за испытание)' : ''}`;
  if ((m = what.match(/^(\w+)→(\d+)$/))) return `${tr(ABILITY[m[1]] ?? m[1])} → ${m[2]}`;
  if ((m = what.match(/^cozy (\d+)$/))) return `награда уюта ${m[1]}`;
  if ((m = what.match(/^quest (\d+)$/))) return `задание жителя ${m[1]}`;
  if ((m = what.match(/^level (\d+)$/))) return `улучшить уровень ${m[1]}`;
  return RU[`item.${what}`] ?? what;
}

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
  p(`**Глава ${c.id} — ${district(c.district)}** (монеты × ${c.coinMult})`);
  p();
  p(head(['Постройка', 'Ур. 1 восстановить', 'Ур. 2 улучшить', 'Ур. 3 расцвет']));
  DISTRICT_BUILDINGS[c.district].forEach((id, i) => {
    const [a, b, d] = ([1, 2, 3] as const).map((n) => buildingCost(c.district, i, n));
    p(row([building(id), `${a.light} свет`, `${b.coins} мон.`, `${d.coins} мон. + ${d.light} свет`]));
  });
  p();
}
const totals = priceTotals();
p(head(['Глава', 'Ур. 1 (свет)', 'Ур. 2 (мон.)', 'Ур. 3 (мон. + свет)', `Украшения (${DECOR_SLOTS} слотов, все варианты: мон. + свет)`, `Улицы (${STREETS_PER_DISTRICT} × 3 шага, мон.)`]));
for (const x of totals) p(row([x.chapter, x.l1Light, x.l2Coins, `${x.l3Coins} + ${x.l3Light}`, `${x.decorCoins} + ${x.decorLight}`, x.streets]));
p();
p(`Украшения: вариант 1…5 слота — ${DECOR_PRICES.map((c, i) => (DECOR_LIGHT[i] ? `${DECOR_LIGHT[i]} свет` : `${c} мон.`)).join(' / ')} (монеты × глава, кроме первого), в слоте 3–5 вариантов, покупка один раз, смена бесплатно.`);
p(`Улицы: тропинка → гравий → брусчатка → мощёная с фонарями — ${STREET_PRICES.join(' / ')} мон. (× глава); шаг улицы — ещё и награда уюта и задания недели.`);
p(`Испытания (уровни 10, 20, 30 каждой главы): шаг улицы сразу и расцвет (3-й уровень) одной постройки на выбор — бесплатно; нет постройки на 2-м уровне — подарок ждёт.`);
p(`Улучшения способностей: ${ABILITY_ORDER.map((a) => `${tr(ABILITY[a.id])} ${a.level} — ${abilityPrice(a)}`).join(', ')} (всего ${abilitiesTotal()}).`);
const wt = wardrobeTotal();
const byR = (r: string, cur: string) => SHOP_ITEMS.filter((w) => w.rarity === r && w.currency === cur);
const fmtR = (r: string, cur: 'coins' | 'light') => {
  const l = byR(r, cur);
  return l.length ? `${l.length} шт. ${Math.min(...l.map((x) => x.amount))}–${Math.max(...l.map((x) => x.amount))} ${cur === 'light' ? 'света' : 'мон.'}` : '';
};
p(`Гардероб: обычные — ${fmtR('common', 'light')}; редкие — ${fmtR('rare', 'light')} и ${fmtR('rare', 'coins')}; эпические — ${fmtR('epic', 'coins')}; всего ${wt.light} света и ${wt.coins} мон. Остальные вещи — награды деревни, дня, заданий, сундуков, уюта; «особые» — Р4.`);
p(`Доходы сверх уровней: задания жителей ${DAILY_QUESTS.map((q) => ('coins' in q ? `${q.coins} мон.` : `${q.light} свет`)).join(' + ')} в день и ${WEEKLY_QUEST.coins} мон. + сундук + шаг улицы в неделю; повтор без улучшения — ${REPLAY_COINS.join(' → ')} мон. за уровень в день; уют — награда каждые ${COZY_STEP} очков (${COZY_REWARDS.map((r) => COZY_WORD[Object.keys(r)[0]]).join(', ')}).`);
p();

// ---------------------------------------------------------------------------
// Симуляция

const runs: SimResult[] = [];
for (const prof of PROFILES) for (const extra of [0, 15]) runs.push(simulate3(ch1, prof, extra));
const NAMES: Record<string, string> = { weak: 'слабый (1,8★, 40%)', average: 'средний (2,4★, 65%)', strong: 'сильный (2,9★, 90%)' };
const wardrobeOf = (c: SimResult['chapters'][number]) => c.wardrobeBought + c.wardrobeRewards;
const fieldOf = (c: SimResult['chapters'][number]) => c.fieldBought + c.fieldRewards;

p('## Когда что доступно');
p();
p(head(['Профиль', '+мин/день', 'Глава', 'Пройдена (мин / дней)', 'Ур.1', 'Ур.2', 'Доля 1+2', 'Ур.3', 'Слотов украшено', 'Вариантов куплено', 'Улицы', 'Гардероб Lumo (куплено / награды)', 'Стили поля (куплено / награды)', 'Расцвет за испытания (получено / выбрано)', 'Способности', 'Макс. пауза в 1-й час', 'Осталось мон.', 'Свет в конце главы']));
for (const r of runs) {
  for (const c of r.chapters) {
    p(row([NAMES[r.profile], r.extra, c.chapter, `${c.doneAt} / ${c.days}`, `${c.l1}/10`, `${c.l2}/10`, `${Math.round(c.share * 100)}%`, `${c.l3}/10`, `${c.decorSlots}/${DECOR_SLOTS}`, `${c.decorBought}/${c.decorTotal}`, `${c.streets}/${c.streetsTotal}`, `${wardrobeOf(c)} (${c.wardrobeBought} / ${c.wardrobeRewards})`, `${fieldOf(c)} (${c.fieldBought} / ${c.fieldRewards})`, `${c.bloomsEarned} / ${c.bloomsUsed}`, `${c.abilities}/${ABILITY_ORDER.length}`, `${c.maxGapFirstHour} мин (${c.goalsFirstHour} целей)`, c.coinsLeft, c.lightLeft]));
  }
}
p();
p(`Первая покупка вещи гардероба: ${runs.map((r) => `${NAMES[r.profile]} +${r.extra} — ${r.firstItemAt === null ? 'нет' : `${Math.round(r.firstItemAt)} мин`}`).join('; ')}.`);
p();
p('### Средний игрок без перепрохождений: минута главы, когда восстановлена / улучшена постройка');
p();
const avg0 = runs.find((r) => r.profile === 'average' && r.extra === 0)!;
const avg15 = runs.find((r) => r.profile === 'average' && r.extra === 15)!;
const weak0 = runs.find((r) => r.profile === 'weak' && r.extra === 0)!;
p(head(['Глава', ...Array.from({ length: 10 }, (_, i) => String(i + 1))]));
for (const c of avg0.chapters) {
  p(row([`${c.chapter} ур.1`, ...c.l1At.map((x) => (x < 0 ? '—' : Math.round(x)))]));
  p(row([`${c.chapter} ур.2`, ...c.l2At.map((x) => (x < 0 ? '—' : Math.round(x)))]));
}
p();
p('## Где у среднего игрока «впритык»');
p();
for (const w of avg0.waits.slice(0, 8)) p(`- глава ${w.chapter}, уровень ${w.level}: ${w.minutes} мин без новой цели — ждёт: ${label(w.waitingFor)}`);
p();
p('## Сколько добирать после главы 3 (15 мин в день)');
p();
p(head(['Профиль', 'Мин. за 3 главы', 'Все постройки ур. 3', 'Все улицы', 'По украшению в каждом слоте', 'Все способности', 'Все варианты украшений', 'Весь гардероб', 'Всё вместе']));
const dd = (x: number | null) => (x === null ? '> 400 дн.' : x === 0 ? 'к концу гл. 3' : `+${x} дн. (${x * 15} мин)`);
for (const r of runs.filter((x) => x.extra > 0)) {
  const m = r.milestones;
  p(row([NAMES[r.profile], r.extraMinutesTotal, dd(m.buildings), dd(m.streets), dd(m.decorOne), dd(m.abilities), dd(m.decor), dd(m.wardrobe), dd(r.tailDays)]));
}
p();

// ---------------------------------------------------------------------------
// Ролики и стартовый набор (Р4)

const tailOf = (r: SimResult) => {
  const ms = r.milestones;
  return ms.buildings === null || ms.streets === null || ms.decorOne === null ? null : Math.max(ms.buildings, ms.streets, ms.decorOne);
};
const adRuns: SimResult[] = [];
for (const prof of PROFILES) for (const extra of [0, 15]) for (const ads of [0, 2, 5]) adRuns.push(ads === 0 ? runs.find((r) => r.profile === prof.id && r.extra === extra)! : simulate3(ch1, prof, extra, { ads }));
const avgP = PROFILES.find((x) => x.id === 'average')!;
for (const extra of [0, 15]) for (const ads of [0, 5]) adRuns.push(simulate3(ch1, avgP, extra, { ads, starterAt: 20 }));
p('## Ролики и стартовый набор');
p();
p('Ролик удваивает монеты: сначала награду дня, потом монеты за уровни этого дня (верхняя оценка: подсказка и «+3 плитки» за ролик монет не дают). Стартовый набор — после уровня 20: 500 мон. и след «Северное сияние» (подсказки и «Без рекламы» на монеты не влияют).');
p();
p(head(['Профиль', '+мин/день', 'Роликов в день', 'Стартовый набор', 'Доля 1+2 (гл. 1 / 2 / 3)', 'Гардероб Lumo к гл. 3', 'Монет за ролики', 'Хвост: постройки ур. 3, улицы, украшение в слоте', 'Всё вместе']));
for (const r of adRuns) {
  const share = r.chapters.map((c) => `${Math.round(c.share * 100)}%`).join(' / ');
  const tail = r.extra > 0 ? dd(tailOf(r)) : '—';
  p(row([NAMES[r.profile], r.extra, r.ads, r.starterAt ? `да (ур. ${r.starterAt})` : 'нет', share, wardrobeOf(r.chapters[2]), r.adCoins, tail, r.extra > 0 ? dd(r.tailDays) : '—']));
}
p();

// ---------------------------------------------------------------------------
// Цели

const problems: string[] = [];
const pct = (x: number) => `${Math.round(x * 100)}%`;
for (const c of avg0.chapters) if (c.share < 0.85 || c.share > 0.9) problems.push(`средний без перепрохождений, глава ${c.chapter}: построек и улучшений ${pct(c.share)} (нужно 85–90%)`);
for (const c of weak0.chapters) if (c.share < 0.75) problems.push(`слабый без перепрохождений, глава ${c.chapter}: построек и улучшений ${pct(c.share)} (нужно ≥ 75%)`);
// 1. Гардероб.
const w1 = wardrobeOf(avg0.chapters[0]);
const w3 = wardrobeOf(avg0.chapters[2]);
const w3x = wardrobeOf(avg15.chapters[2]);
if (w1 < 3 || w1 > 4) problems.push(`гардероб среднего к концу главы 1: ${w1} (нужно 3–4)`);
if (w3 < 10 || w3 > 12) problems.push(`гардероб среднего к концу главы 3: ${w3} (нужно 10–12)`);
if (w3x < w3 * 1.6 || w3x > w3 * 2.4) problems.push(`гардероб среднего с 15 мин к концу главы 3: ${w3x} (нужно примерно вдвое больше ${w3}: ${Math.ceil(w3 * 1.6)}–${Math.floor(w3 * 2.4)})`);
if (avg0.firstItemAt === null || avg0.firstItemAt > 20) problems.push(`первая вещь гардероба у среднего: ${avg0.firstItemAt === null ? 'нет' : `${Math.round(avg0.firstItemAt)} мин`} (нужно ≤ 20 мин)`);
// Стили поля (фонари, дороги, арки), куплено + награды.
const f1 = fieldOf(avg0.chapters[0]);
const f3 = fieldOf(avg0.chapters[2]);
if (f1 < 1 || f1 > 2) problems.push(`стили поля у среднего к концу главы 1: ${f1} (нужно 1–2)`);
if (f3 < 5 || f3 > 6) problems.push(`стили поля у среднего к концу главы 3: ${f3} (нужно 5–6)`);
// 2. Свет не копится.
for (const c of avg0.chapters) if (c.lightLeft > 30) problems.push(`свет у среднего в конце главы ${c.chapter}: ${c.lightLeft} (нужно ≤ 30)`);
for (const c of avg15.chapters) if (c.lightLeft > 60) problems.push(`свет у среднего с 15 мин в конце главы ${c.chapter}: ${c.lightLeft} (нужно ≤ 60)`);
// 3. Хвост.
const m = avg15.milestones;
for (const [k, label] of [['buildings', 'все третьи уровни построек'], ['streets', 'все улицы'], ['decorOne', 'по украшению в каждом слоте']] as const) {
  if (m[k] === null || m[k]! > 45) problems.push(`средний с 15 мин: ${label} — ${dd(m[k])} после главы 3 (нужно ≤ 45 дней)`);
}
// Паузы в первый час — слабый и средний.
for (const r of runs.filter((x) => x.profile !== 'strong')) {
  for (const c of r.chapters) if (c.maxGapFirstHour > 5) problems.push(`${NAMES[r.profile]} +${r.extra}, глава ${c.chapter}: пауза ${c.maxGapFirstHour} мин в первый час (нужно ≤ 5)`);
}
for (const r of runs) if (r.chapters.length !== 3) problems.push(`${r.profile}: пройдены не все главы`);
// Ролики не ломают «хвост»: средний с 15 мин и 5 роликами в день — не меньше 14 дней.
const avgAds5 = adRuns.find((r) => r.profile === 'average' && r.extra === 15 && r.ads === 5 && !r.starterAt)!;
const tail5 = tailOf(avgAds5);
if (tail5 === null || tail5 < 14) problems.push(`средний с 15 мин и 5 роликами: хвост ${dd(tail5)} (нужно не меньше 14 дней)`);

console.log(out.join('\n'));
if (problems.length) {
  console.log(`\n✗ Цели экономики не выполнены:\n${problems.map((x) => `  - ${x}`).join('\n')}`);
  process.exit(1);
}
console.log(
  `\n✓ Цели экономики выполнены: средний ${avg0.chapters.map((c) => pct(c.share)).join('/')} и слабый ${weak0.chapters.map((c) => pct(c.share)).join('/')} построек без перепрохождений; гардероб ${w1} → ${w3} (с 15 мин ${w3x}), стили поля ${f1} → ${f3}, первая вещь на ${Math.round(avg0.firstItemAt!)} мин; свет в конце глав ≤ ${Math.max(...avg0.chapters.map((c) => c.lightLeft))} (с 15 мин ≤ ${Math.max(...avg15.chapters.map((c) => c.lightLeft))}); хвост ${Math.max(m.buildings!, m.streets!, m.decorOne!)} дн. (с 5 роликами в день — ${tail5} дн.); паузы ≤ 5 мин; уровни не блокируются.`,
);
