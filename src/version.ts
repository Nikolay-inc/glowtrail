// Версия приложения и номер сборки: подставляет Vite (vite.config.ts → define) из package.json и app-build.json.

declare const __APP_VERSION__: string;
declare const __APP_BUILD__: number;

export const APP_VERSION: string = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0';
export const APP_BUILD: number = typeof __APP_BUILD__ === 'number' ? __APP_BUILD__ : 0;

/** «0.1.0 (сборка 26)» */
export const versionLabel = () => `${APP_VERSION} (сборка ${APP_BUILD})`;
