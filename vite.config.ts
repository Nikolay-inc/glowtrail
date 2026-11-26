/// <reference types="vitest/config" />
import { existsSync, readFileSync } from 'node:fs';
import { defineConfig, loadEnv, type Plugin } from 'vite';

// Версия и номер сборки (scripts/app-version.ts) — показываем в профиле и прикладываем к отзыву.
const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string };
const appBuild = existsSync('app-build.json') ? (JSON.parse(readFileSync('app-build.json', 'utf8')) as { build: number }).build : 0;

/**
 * Страница политики конфиденциальности: site/privacy.html → privacy.html в сборке (и в dev-сервере),
 * контактный адрес подставляется из VITE_CONTACT_EMAIL (в репозитории адреса нет).
 */
function privacyPage(mode: string): Plugin {
  const render = () => {
    const email = loadEnv(mode, process.cwd(), 'VITE_').VITE_CONTACT_EMAIL ?? '';
    const html = readFileSync('site/privacy.html', 'utf8');
    return email
      ? html.split('%CONTACT_EMAIL%').join(email)
      : html.replace(/<a href="mailto:%CONTACT_EMAIL%">%CONTACT_EMAIL%<\/a>/g, '«Отправить отзыв» в профиле игры / “Send feedback” in the game profile');
  };
  return {
    name: 'privacy-page',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'privacy.html', source: render() });
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url?.endsWith('/privacy.html')) return next();
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.end(render());
      });
    },
  };
}

export default defineConfig(({ command, mode }) => ({
  plugins: [privacyPage(mode)],
  // GitHub Pages: игра живёт по адресу /glowtrail/. Приложение (Capacitor, mode app): относительные пути.
  // Локально — в корне.
  base: command !== 'build' ? '/' : mode === 'app' ? './' : '/glowtrail/',
  build: {
    chunkSizeWarningLimit: 2000,
  },
  // npm run i18n-check: без перезагрузки страницы при правке файлов во время проверки.
  server: process.env.GLOW_NO_HMR ? { hmr: false, watch: { ignored: ['**/*'] } } : undefined,
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __APP_BUILD__: JSON.stringify(appBuild),
  },
  test: {
    include: ['tests/**/*.test.ts'],
    // Тесты с решателем проходят все 30 уровней — на CI это дольше стандартных 5 с.
    testTimeout: 60_000,
  },
}));
