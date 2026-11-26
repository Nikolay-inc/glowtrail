// npm run i18n-check — переводы и вёрстка под любой язык:
//  1) все ключи есть во всех языках (ru, en, uk), подстановки совпадают, нет неиспользуемых ключей,
//     у всех данных (вещи, наборы, постройки, улучшения, миры) есть тексты, в коде нет русского текста;
//  2) Playwright открывает каждый экран и окно на псевдо-языке qps (английский +40%, акценты, [скобки])
//     на 375x667 и проверяет, что текст не выходит за свой контейнер и за экран (src/debug/audit.ts);
//     нарушения — список «экран + ключ», тогда скрипт падает. Там же: надписи с внутренним id (постройки, районы,
//     вещи, наборы, украшения) вместо названия и ключи без перевода. Скриншоты — artifacts/i18n.
// Флаги: --static (без браузера), --lang qps|ru|en|uk, --size 375x667, --only map,village.

import { spawn } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';
import ru from '../src/i18n/ru.json';
import en from '../src/i18n/en.json';
import uk from '../src/i18n/uk.json';
import { SETS, WARDROBE } from '../src/core/wardrobe';
import { UPGRADES, defaultEconomy } from '../src/core/economy';
import { QUEST_KINDS } from '../src/core/questState';
import { BUILDINGS, DECOR_TYPE_ORDER, DISTRICTS, STREETS_PER_DISTRICT } from '../src/core/villageData';
import { WORLDS, LEVELS } from '../src/levels/index';
import { emptySave } from '../src/save/SaveService';

const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const errors: string[] = [];
const warn: string[] = [];

// ---------------------------------------------------------------------------
// 1. Ключи

const TABLES: Record<string, Record<string, string>> = { ru, en, uk };

/** Имена подстановок шаблона (с вложенными формами plural). */
function vars(s: string): string[] {
  const out: string[] = [];
  const match = (i: number) => {
    let d = 0;
    for (let j = i; j < s.length; j++) {
      if (s[j] === '{') d++;
      else if (s[j] === '}' && --d === 0) return j;
    }
    return -1;
  };
  for (let i = 0; i < s.length; i++) {
    if (s[i] !== '{') continue;
    const end = match(i);
    if (end < 0) {
      out.push('<unbalanced>');
      break;
    }
    const body = s.slice(i + 1, end);
    const pl = /^\s*(\w+)\s*,\s*plural\s*,(.*)$/s.exec(body);
    if (pl) {
      out.push(pl[1]);
      const re = /(=?\w+)\s*\{/g;
      let m: RegExpExecArray | null;
      const forms = pl[2];
      while ((m = re.exec(forms))) {
        const open = m.index + m[0].length - 1;
        let d = 0;
        let close = -1;
        for (let j = open; j < forms.length; j++) {
          if (forms[j] === '{') d++;
          else if (forms[j] === '}' && --d === 0) {
            close = j;
            break;
          }
        }
        if (close < 0) break;
        out.push(...vars(forms.slice(open + 1, close)));
        re.lastIndex = close + 1;
      }
    } else if (/^\s*\w+\s*$/.test(body)) out.push(body.trim());
    i = end;
  }
  return [...new Set(out)].sort();
}

const keys = Object.keys(ru);
for (const [lang, tbl] of Object.entries(TABLES)) {
  if (lang === 'ru') continue;
  for (const k of keys) if (!(k in tbl)) errors.push(`${lang}: нет ключа ${k}`);
  for (const k of Object.keys(tbl)) if (!(k in ru)) errors.push(`${lang}: лишний ключ ${k}`);
  for (const k of keys) {
    if (!(k in tbl)) continue;
    const a = vars(ru[k as keyof typeof ru]).join(',');
    const b = vars(tbl[k]).join(',');
    if (a !== b) errors.push(`${lang}: ${k} — подстановки {${b}} вместо {${a}}`);
  }
}

// Использование ключей: строковые литералы в коде и семейства `prefix.${id}`.
function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : /\.ts$/.test(f) ? [p] : [];
  });
}
const files = walk('src');
const code = files.map((f) => readFileSync(f, 'utf8')).join('\n');
const prefixes = [...code.matchAll(/`([a-z_.]+)\$\{/g)].map((m) => m[1]);
for (const k of keys) {
  const literal = code.includes(`'${k}'`) || code.includes(`"${k}"`) || code.includes(`\`${k}\``);
  if (!literal && !prefixes.some((p) => k.startsWith(p))) errors.push(`ключ не используется: ${k}`);
}
// У данных есть тексты.
const need = [
  ...WARDROBE.map((w) => `item.${w.id}`),
  ...SETS.map((s) => `set.${s.id}`),
  ...BUILDINGS.filter((b) => b.district === 'mountain').map((v) => `building.${v.id}.name`),
  ...BUILDINGS.filter((b) => b.district !== 'mountain').flatMap((v) => [`building.${v.id}.name`, `building.${v.id}.story`, `building.${v.id}.lit`, `bonus.${v.id}`, `resident.${v.id}`]),
  ...DISTRICTS.map((d) => `district.${d}`),
  ...DECOR_TYPE_ORDER.flatMap((d) => [`decor.${d}`, ...[0, 1, 2, 3, 4].map((v) => `decor.${d}.${v}`)]),
  ...(['valley', 'forest'] as const).flatMap((d) => Array.from({ length: STREETS_PER_DISTRICT }, (_, i) => `street.${d}.${i}`)),
  ...[0, 1, 2, 3].map((i) => `street_step.${i}`),
  ...QUEST_KINDS.map((k) => `quest.${k}`),
  ...Object.keys(UPGRADES).flatMap((u) => [`upgrade.${u}.name`, `upgrade.${u}.descr`, `upgrade.${u}.value`]),
  ...WORLDS.map((w) => `world.${w.id}`),
  ...[...new Set(WARDROBE.map((w) => w.source))].map((s) => `source_${s}`),
];
for (const k of need) if (!(k in ru)) errors.push(`нет текста для данных: ${k}`);
// Русский текст в коде (кроме комментариев, отладочных отчётов и данных для разработчика).
const ALLOW = /src\/(editor|levels\/curve|core\/level|core\/solver|core\/economySim|core\/avatars|storage|levels\/worlds|debug|main)\.ts$|src\/editor\//;
for (const f of files) {
  if (ALLOW.test(f)) continue;
  readFileSync(f, 'utf8')
    .split('\n')
    .forEach((line, i) => {
      const noComment = line.replace(/\/\/.*$/, '').replace(/\/\*.*$/, '').replace(/^\s*\*.*$/, '');
      if (/['"`][^'"`]*[А-Яа-яЁё]/.test(noComment) && !/e\.key ===/.test(noComment)) errors.push(`русский текст в коде: ${f}:${i + 1}: ${line.trim().slice(0, 80)}`);
    });
}
console.log(`Ключей: ${keys.length} × ${Object.keys(TABLES).length} языка.`);

// ---------------------------------------------------------------------------
// 2. Вёрстка в браузере

async function layout() {
  const lang = flag('lang') ?? 'qps';
  const [vw, vh] = (flag('size') ?? '375x667').split('x').map(Number);
  const only = flag('only')?.split(',');
  const port = 5199;
  const out = `artifacts/i18n${lang === 'qps' ? '' : `-${lang}`}`;
  mkdirSync(out, { recursive: true });
  // Своя группа процессов: npx запускает vite дочерним процессом, и kill одного npx оставлял vite
  // жить — открытые каналы не давали скрипту завершиться (в CI шаг висел часами).
  const vite = spawn('npx', ['vite', '--port', String(port), '--strictPort'], { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, GLOW_NO_HMR: '1' }, detached: true });
  const stopVite = () => {
    try {
      if (vite.pid) process.kill(-vite.pid, 'SIGTERM');
    } catch {
      /* уже завершён */
    }
    vite.stdout.destroy();
    vite.stderr.destroy();
  };
  process.once('exit', stopVite);
  await new Promise<void>((resolve, reject) => {
    const to = setTimeout(() => reject(new Error('vite не запустился')), 30000);
    vite.stdout.on('data', (d: Buffer) => {
      if (d.toString().includes('Local')) {
        clearTimeout(to);
        resolve();
      }
    });
  });
  // Сохранение для проверки: обучение пройдено, окна знакомства показаны, часть уровней и деревни, монеты.
  const save = emptySave();
  save.profile.tutorialDone = true;
  save.profile.nameAsked = true;
  save.profile.authPrompted = true;
  save.profile.name = 'Wolfeschlegelsteinhausen';
  save.profile.tipsSeen = ['intro:currency', 'undo', 'hint', 'restart', 'stash', 'turn', 'rock', 'water', 'lantern', 'side_entry', 'drag', 'turnbridge', 'fade', ...['road', 'lantern', 'side', 'rock', 'water', 'firefly', 'jump', 'ffgoal', 'turnbridge', 'fade'].map((r) => `rule:${r}`)];
  LEVELS.slice(0, 14).forEach((l, i) => {
    save.progress.stars[l.id] = 1 + (i % 3);
    save.progress.unlocked.push(l.id);
  });
  save.economy = { ...defaultEconomy(), coinsEarned: 260, buildings: { well: 2, bakery: 1, workshop: 1, bridge: 2 }, upgrades: { stash: 0, rotate: 1, lantern: 1 } };
  save.economy.wardrobe.owned.push('hat-brim', 'outfit-jacket', 'pet-firefly', 'trail-sparks');
  // Деревня 2.0: улица и украшения, часть построек улучшена.
  save.economy.streets = { 'valley:0': 2, 'valley:1': 1 };
  save.economy.decor = { owned: ['valley:0:0', 'valley:1:2', 'valley:7:1'], placed: { 'valley:0': 0, 'valley:1': 2, 'valley:7': 1 } };
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: vw, height: vh }, deviceScaleFactor: 2 });
  page.on('pageerror', (e) => errors.push(`ошибка на странице: ${e.message}`));
  await page.addInitScript((s) => localStorage.setItem('glowtrail.save', s), JSON.stringify(save));
  await page.goto(`http://localhost:${port}/?audit=1&lang=${lang}`);
  await page.waitForFunction(() => !!(window as unknown as { __audit?: unknown }).__audit, null, { timeout: 30000 });
  const names: string[] = await page.evaluate(() => (window as unknown as { __audit: { views: string[] } }).__audit.views);
  const found: { view: string; key: string; text: string; reason: string; over: number }[] = [];
  for (const name of names) {
    if (only && !only.includes(name)) continue;
    await page.evaluate((n) => (window as unknown as { __audit: { open: (n: string) => Promise<void> } }).__audit.open(n), name);
    const v = await page.evaluate((n) => (window as unknown as { __audit: { check: (n: string) => unknown[] } }).__audit.check(n), name);
    found.push(...(v as typeof found));
    const el = await page.evaluate(() => (window as unknown as { __audit: { ellipsis: () => { text: string; key?: string }[] } }).__audit.ellipsis());
    for (const e of el) warn.push(`${name}: многоточие ${e.key ?? ''} «${e.text.slice(0, 60)}»`);
    const miss: string[] = await page.evaluate(() => (window as unknown as { __audit: { missing: () => string[] } }).__audit.missing());
    for (const k of miss) errors.push(`нет перевода (показан ключ): ${name} · ${k}`);
    await page.screenshot({ path: `${out}/${name}.png` });
    process.stdout.write(`  ${name}: ${(v as unknown[]).length ? `✗ ${(v as unknown[]).length}` : '✓'}\n`);
  }
  await browser.close();
  stopVite();
  // Один и тот же ключ на одном экране — одной строкой.
  const seen = new Set<string>();
  for (const f of found) {
    const id = `${f.view}|${f.key}|${f.reason}`;
    if (seen.has(id)) continue;
    seen.add(id);
    errors.push(f.reason === 'rawid' ? `id вместо названия: ${f.view} · ${f.key} «${f.text}»` : `вёрстка: ${f.view} · ${f.key} · ${f.reason} +${f.over}px «${f.text}»`);
  }
  console.log(`Экранов: ${names.filter((n) => !only || only.includes(n)).length}, скриншоты — ${out}/`);
}

if (!args.includes('--static')) await layout();
for (const w of warn) console.log(`⚠ ${w}`);
if (errors.length) {
  for (const e of errors) console.log(`✗ ${e}`);
  console.log(`\n✗ i18n-check: ${errors.length} ошибок`);
  process.exit(1);
}
console.log('✓ i18n-check: всё в порядке');
process.exit(0);
