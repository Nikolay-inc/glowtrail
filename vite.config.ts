/// <reference types="vitest/config" />
import { defineConfig } from 'vite';

export default defineConfig(({ command, mode }) => ({
  // GitHub Pages: игра живёт по адресу /glowtrail/. Приложение (Capacitor, mode app): относительные пути.
  // Локально — в корне.
  base: command !== 'build' ? '/' : mode === 'app' ? './' : '/glowtrail/',
  build: {
    chunkSizeWarningLimit: 2000,
  },
  test: {
    include: ['tests/**/*.test.ts'],
    // Тесты с решателем проходят все 30 уровней — на CI это дольше стандартных 5 с.
    testTimeout: 60_000,
  },
}));
