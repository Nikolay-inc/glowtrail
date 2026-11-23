import type { CapacitorConfig } from '@capacitor/cli';

// Мобильное приложение Glowtrail. appId закреплён за приложением в App Store и Google Play — не менять.
const config: CapacitorConfig = {
  appId: 'com.severgames.glowtrail',
  appName: 'Glowtrail',
  // Сборка для приложения — npm run build:app (относительные пути, base './').
  webDir: 'dist',
  backgroundColor: '#0b0f27',
  ios: {
    // Веб-вью под вырезом и полоской «домой»: безопасную зону игра считает сама (env(safe-area-inset-*)).
    contentInset: 'never',
    backgroundColor: '#0b0f27',
  },
  android: {
    backgroundColor: '#0b0f27',
    // Android 15 рисует приложение под системными панелями — Capacitor сдвигает веб-вью внутрь.
    adjustMarginsForEdgeToEdge: 'auto',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      launchAutoHide: false, // прячем сами, когда игра готова
      backgroundColor: '#0b0f27',
      showSpinner: false,
    },
    StatusBar: {
      style: 'DARK', // светлый текст на тёмном фоне
      backgroundColor: '#0b0f27',
      // iOS: фон игры виден и под статус-баром; на Android веб-вью под статус-баром не заходит (main.ts).
      overlaysWebView: true,
    },
  },
};

export default config;
