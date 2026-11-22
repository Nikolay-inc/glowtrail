/// <reference types="vitest/config" />
import { defineConfig } from 'vite';

export default defineConfig(({ command }) => ({
  // На GitHub Pages игра живёт по адресу /glowtrail/, локально — в корне.
  base: command === 'build' ? '/glowtrail/' : '/',
  build: {
    chunkSizeWarningLimit: 2000,
  },
  test: {
    include: ['tests/**/*.test.ts'],
  },
}));
