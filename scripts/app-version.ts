// npm run version:bump — номер сборки приложения (CFBundleVersion / versionCode) увеличивается при каждой
// сборке приложения (npm run build:app). Хранится в app-build.json (в git); стартует не ниже числа коммитов.
// Версия (CFBundleShortVersionString / versionName) — из package.json (0.1.0). Пишет оба значения в iOS- и
// Android-проекты; игра показывает их в профиле (vite.config.ts → __APP_VERSION__, __APP_BUILD__).

import { execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const FILE = 'app-build.json';
const version: string = JSON.parse(readFileSync('package.json', 'utf8')).version;
let commits = 0;
try {
  commits = Number(execSync('git rev-list --count HEAD').toString().trim()) || 0;
} catch {
  /* без git — от сохранённого номера */
}
const prev = existsSync(FILE) ? (JSON.parse(readFileSync(FILE, 'utf8')) as { build: number }).build : 0;
const build = Math.max(prev, commits) + 1;
writeFileSync(FILE, JSON.stringify({ version, build }, null, 2) + '\n');

// iOS: MARKETING_VERSION и CURRENT_PROJECT_VERSION во всех конфигурациях.
const pbx = 'ios/App/App.xcodeproj/project.pbxproj';
if (existsSync(pbx)) {
  const s = readFileSync(pbx, 'utf8')
    .replace(/MARKETING_VERSION = [^;]+;/g, `MARKETING_VERSION = ${version};`)
    .replace(/CURRENT_PROJECT_VERSION = [^;]+;/g, `CURRENT_PROJECT_VERSION = ${build};`);
  writeFileSync(pbx, s);
}
// Android: versionCode и versionName.
const gradle = 'android/app/build.gradle';
if (existsSync(gradle)) {
  const s = readFileSync(gradle, 'utf8')
    .replace(/versionCode \d+/, `versionCode ${build}`)
    .replace(/versionName "[^"]*"/, `versionName "${version}"`);
  writeFileSync(gradle, s);
}
console.log(`Версия ${version}, сборка ${build}`);
