# Glowtrail

Головоломка: фонарщик Lumo прокладывает дорогу из плиток к арке-выходу и по пути зажигает фонари.
TypeScript + Phaser 3 + Vite. Веб-версия: https://nikolay-inc.github.io/glowtrail/.
Мобильное приложение собирается из той же игры через Capacitor (iOS и Android).

## Веб

```bash
npm install
```

```bash
npm run dev
```

Откроется http://localhost:5173 (`?level=N` открывает уровень сразу).

- `npm test` — тесты (Vitest)
- `npm run sim-economy` — симуляция экономики первых 2 часов игры
- `npm run verify` — таблица метрик и проверка всех уровней и кривой сложности
- `npm run ease` — пересчитать колоды облегчения и метрики уровней (после изменения уровня)
- `npm run gen -- --count 300 --size 5x6 --features lantern,rock,water,firefly,jump,turnbridge,fade --seed 1 [--goal fireflies]` — сгенерировать кандидатов в уровни (`generated/`)
- `npm run pick` — подобрать из кандидатов уровни 11–30 под план мира (`src/levels/curve.ts`)
- Редактор уровней: `npm run dev` и открыть http://localhost:5173/?editor=1 (только при разработке)
- `npm run build` — сборка для GitHub Pages в `dist/`
- Деплой: пуш в `main` → GitHub Actions → GitHub Pages

## Приложение (Capacitor)

- `npm run build:app` — сборка для приложения (относительные пути, ключи Supabase из `.env.app`)
- `npm run cap:sync` — сборка и копирование в `ios/` и `android/`
- `npm run cap:ios` — то же и открыть проект в Xcode
- `npm run cap:android` — то же и открыть проект в Android Studio
- `npm run icons` — заново нарисовать иконку и заставку (`assets/`) и нарезать все размеры

appId: `com.severgames.glowtrail`. Его нельзя менять после публикации в App Store и Google Play.

### Запуск на iPhone по кабелю

Нужны Mac, iPhone и кабель. Платный аккаунт разработчика не нужен: подойдёт бесплатный Apple ID (Personal Team).

1. **Установи Xcode** из App Store (это бесплатно, около 10 ГБ). Запусти его один раз и согласись с лицензией.
   Если Xcode попросит установить компоненты (iOS platform), установи их.
2. **Сделай Xcode основным** для командной строки (спросит пароль от Mac):
   ```bash
   sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
   ```
3. **Собери игру и открой проект:**
   ```bash
   npm run cap:ios
   ```
   Откроется Xcode с проектом `ios/App`. Подожди, пока внизу закончится «Resolving Package Graph»:
   Xcode скачивает Capacitor через Swift Package Manager, только при первом открытии.
4. **Войди со своим Apple ID:** Xcode → Settings… → Accounts → «+» → Apple ID.
5. **Выбери команду:** слева нажми синий значок **App**, затем вверху вкладку **Signing & Capabilities**.
   Включи «Automatically manage signing», в поле **Team** выбери «*Твоё имя* (Personal Team)».
   - Если Xcode пишет, что Bundle Identifier занят, поменяй его на уникальный, например `com.severgames.glowtrail.dev`.
     Это нужно только для личных сборок.
6. **Подключи iPhone кабелем** и разблокируй его. На вопрос «Доверять этому компьютеру?» ответь «Доверять».
7. **Включи режим разработчика на iPhone** (iOS 16 и новее): Настройки → Конфиденциальность и безопасность →
   Режим разработчика → включить. Телефон перезагрузится, после этого подтверди включение.
8. **Выбери iPhone** в списке устройств вверху окна Xcode (рядом с «App») и нажми ▶ (Run, ⌘R).
9. **Разреши запуск** при первом запуске: на iPhone открой Настройки → Основные → VPN и управление устройством →
   твой Apple ID → «Доверять». Потом снова нажми ▶ в Xcode.

После изменений в игре запусти `npm run cap:sync` и снова нажми ▶ в Xcode.

Ограничения бесплатной команды (Personal Team): приложение на телефоне работает 7 дней, потом его нужно
снова запустить из Xcode. Одновременно можно держать до 3 таких приложений. Для TestFlight и App Store
нужен платный Apple Developer Program.

Без телефона игру можно запустить в симуляторе: выбери вверху любой iPhone-симулятор и нажми ▶.

### TestFlight (iOS): архив и загрузка в App Store Connect

Версия — `0.1.0` (из `package.json`), номер сборки растёт сам при каждом `npm run build:app` (`app-build.json`,
скрипт `scripts/app-version.ts`) и пишется в iOS- и Android-проекты. В игре версия видна внизу профиля.

**Один раз — подготовка**

1. Адрес для «Отправить отзыв» и контакта в политике конфиденциальности:
   - локально — строка `VITE_CONTACT_EMAIL=твой@адрес` в `.env.local` (файл не коммитится);
   - для сайта — секрет репозитория `VITE_CONTACT_EMAIL` (GitHub → Settings → Secrets and variables → Actions →
     New repository secret). Страница появится по адресу https://nikolay-inc.github.io/glowtrail/privacy.html.
2. В [App Store Connect](https://appstoreconnect.apple.com) → «Приложения» → «+» → «Новое приложение»:
   платформа iOS, имя **«Glowtrail: Light the Path»** (название в App Store; под иконкой на телефоне будет
   просто «Glowtrail» — это `CFBundleDisplayName` и `appName`), основной язык — русский, Bundle ID `com.severgames.glowtrail`
   (если его нет в списке — зарегистрируй в developer.apple.com → Identifiers), SKU — например `glowtrail`.
3. Там же в приложении: «Конфиденциальность приложения» → ссылка на политику
   `https://nikolay-inc.github.io/glowtrail/privacy.html` и ответы «Какие данные собираются» — см. раздел
   «Аналитика и ошибки» ниже (почта, ID пользователя, игровой контент — связаны с пользователем; взаимодействие,
   ID устройства, приблизительное местоположение, сбои и диагностика — не связаны; отслеживания нет).
   Это совпадает с `ios/App/App/PrivacyInfo.xcprivacy`.
4. Firebase и Sentry (раздел «Аналитика и ошибки»): `GoogleService-Info.plist` перетащи в Xcode в папку App
   (галочка «Copy items if needed», цель App), DSN Sentry — в `.env.app`.

**Каждая сборка**

```bash
npm run cap:sync
```

```bash
npm run ios:check
```

1. `npm run cap:sync` собирает игру (номер сборки +1) и копирует её в `ios/`. `npm run ios:check` проверяет
   версию, номер сборки, команду и Bundle ID, privacy manifest, флаг шифрования, иконку, адрес для отзывов,
   `GoogleService-Info.plist` и DSN Sentry. С `SENTRY_AUTH_TOKEN` в `.env.local` сборка сама загружает source maps.
2. Открой проект: `npm run cap:ios` (или `open ios/App/App.xcodeproj`).
3. В Xcode вверху выбери схему **App** и устройство **Any iOS Device (arm64)**.
4. Signing & Capabilities (цель App): Team — твоя команда (R457T4MLSR), «Automatically manage signing» включено.
5. Меню **Product → Archive**. Через пару минут откроется окно **Organizer** с новым архивом.
6. **Distribute App → App Store Connect → Upload** → оставь галочки по умолчанию → **Upload**.
   Вопроса про шифрование не будет: в `Info.plist` стоит `ITSAppUsesNonExemptEncryption = NO`.
7. Через 5–30 минут сборка появится в App Store Connect → приложение → **TestFlight** (статус «Обработка» →
   «Готово к тестированию»). Если пришло письмо о проблеме с privacy manifest или иконкой — поправь и собери снова
   (номер сборки уже будет новым).

**Тестеры в TestFlight**

- **Внутренние** (до 100 человек из твоей команды App Store Connect): TestFlight → «Внутреннее тестирование» → «+» →
  создай группу → добавь людей (их нужно сначала пригласить в «Пользователи и доступ»). Сборка доступна сразу,
  без проверки Apple.
- **Внешние** (до 10 000, по почте или публичной ссылке): TestFlight → «Внешнее тестирование» → «+» → группа →
  добавь сборку → заполни «Что тестировать» и контакт → отправь на проверку бета-версии (обычно до суток).
  Потом добавь тестеров по почте или включи публичную ссылку.
- Тестеры ставят приложение **TestFlight** из App Store и открывают приглашение. Отзывы — кнопкой
  «Отправить отзыв» в профиле игры (письмо со статистикой и версией) или скриншотом в TestFlight.

### Android

Нужны Android Studio (в ней есть JDK и Android SDK).

```bash
npm run cap:android
```

В Android Studio дождись синхронизации Gradle и нажми ▶. Подойдёт эмулятор или телефон с включённой
отладкой по USB. Собрать отладочный APK без Android Studio можно командой
`cd android && ./gradlew assembleDebug` (нужны JDK 21 и Android SDK).

### Что делает приложение

- **Весь экран:** фон на всю высоту, кнопки и поле — в безопасной зоне (вырез, Dynamic Island, полоска «домой»).
  Расчёт — `src/ui/viewport.ts`.
- **Только портретная ориентация, светлый статус-бар** на тёмном фоне.
- **Сворачивание:** пауза, звук выключается, сохранение дописывается на диск и в облако. При возврате игра
  продолжается, время в фоне в попытку не считается (`src/lifecycle.ts`). На Android кнопка «Назад»
  ведёт с уровня в меню, а из меню сворачивает приложение.
- **Сохранение** в приложении хранится в `@capacitor/preferences`, в браузере — в localStorage. Вход в
  аккаунт и синхронизация с Supabase работают и там, и там.
- **Вибрация:** лёгкая при постановке плитки, короткая при ошибке, радостная при победе. Выключается в меню.

## Аналитика и ошибки (Firebase, Sentry)

Код — `src/analytics/`: `events.ts` (события и свойства игрока, согласие — чистые функции с тестами),
`firebase.ts` (Analytics и Remote Config: в приложении — `@capacitor-firebase/*`, в вебе — Firebase JS SDK),
`sentry.ts` (`@sentry/capacitor`: ошибки JS, необработанные исключения и нативные сбои), `remoteConfig.ts`
(значения по умолчанию), `index.ts` (связка с логом событий). Экран согласия — `src/scenes/ConsentScene.ts`.

- **Без ключей всё выключено**, игра работает как раньше. В iOS без `GoogleService-Info.plist` плагины Firebase не
  запускаются (патч в `patches/`, ставится сам при `npm install`: иначе `FirebaseApp.configure()` роняет приложение).
- **Без рекламного идентификатора и трекинга:** в iOS — `FirebaseAnalyticsCore` (без IDFA, без on-device conversion),
  в `Info.plist` выключены сбор, IDFV, рекламные сигналы и регистрация в рекламных сетях; в Android удалено разрешение
  `AD_ID`; рекламные согласия всегда «запрещено», Google Signals выключены. Запрос ATT не нужен.
- **Согласие:** в ЕС/ЕЭЗ, Великобритании и Швейцарии (по часовому поясу, иначе по региону языка) при первом запуске —
  окно «Помогать улучшать игру?»; без «да» статистика не собирается. В других странах включена по умолчанию.
  Выбор — `progress.analytics` в сохранении (v9), меняется в профиле («Анонимная статистика»). Sentry работает и без
  согласия — без персональных данных (это сказано в политике).
- **События:** каждая новая запись лога (`SaveService.onLog`) уходит в Firebase с теми же именами и параметрами
  (+ `level_num` — номер уровня). Переименованы только `start/win/lose/abandon` → `level_start/level_win/level_lose/
  level_abandon` и `session` → `game_session_start` (`session_start` в Firebase зарезервировано и пишется само).
  У попыток: `level`, `level_num`, `attempt`, `stars`, `tilesLeft`, `hints`, `undos`, `ms` (время), `moves`.
  Новые события: `tutorial_complete`, `settings_change` (`item`: music/sounds/vibration/analytics, `value`), `skin_buy`
  (стили поля), `wardrobe_buy` (вещи Lumo).
- **Свойства игрока:** `chapter`, `total_stars`, `cozy_level`, `game_language`, `game_version`.
- **Remote Config** (заготовки, пока ни на что не влияют): `ads_interstitial_from_level` 15,
  `ads_interstitial_every_n_levels` 3, `ads_rewarded_daily_cap` 5, `economy_coin_multiplier` 1, `quests_enabled` true.
  Загружаются при старте параллельно со шрифтами, ждём не дольше 2 с. В коде — `remote('quests_enabled')`.
- **Локальная статистика** («Статистика» → «Скопировать», «Отправить отзыв») осталась как была.

### Ключи: куда что положить

| Что | Куда | В git? |
| --- | --- | --- |
| Веб-конфиг Firebase (`VITE_FIREBASE_*`, 7 значений) | `.env.production` (сайт) и `.env.app` (приложение) | да, значения публичные |
| `GoogleService-Info.plist` | `ios/App/App/` + перетащить в Xcode в цель App | нет (`.gitignore`) |
| `google-services.json` | `android/app/` | нет (`.gitignore`) |
| `VITE_SENTRY_DSN` | `.env.production` и `.env.app` | да, DSN публичный |
| `SENTRY_ORG`, `SENTRY_PROJECT` | `.env.production` и `.env.app` | да, не секрет |
| `SENTRY_AUTH_TOKEN` (source maps) | `.env.local` и секрет репозитория `SENTRY_AUTH_TOKEN` | **нет, секрет** |

Чтобы сайт тоже загружал source maps, в `.github/workflows/deploy.yml` в шаг `npm run build` добавь
`SENTRY_AUTH_TOKEN: ${{ secrets.SENTRY_AUTH_TOKEN }}` рядом с `VITE_CONTACT_EMAIL` (без токена сайт собирается без карт).
Карты собираются скрытыми, загружаются в Sentry и удаляются из `dist` — на сайт и в приложение не попадают.

В Firebase: Analytics → Admin → Data settings → **Data retention — 2 months** (как в политике), Google Signals — выкл.
В Sentry: Project settings → Security & Privacy → **Prevent Storing of IP Addresses** — вкл., Data Scrubber — вкл.

### Проверка событий (DebugView)

- **Веб:** открой игру с `?analytics_debug=1` (например, `https://nikolay-inc.github.io/glowtrail/?analytics_debug=1`) →
  Firebase → Analytics → DebugView. В `npm run dev` события ещё и печатаются в консоль (`[analytics] level_start …`).
- **iOS:** Xcode → Product → Scheme → Edit Scheme → Run → Arguments → `-FIRDebugEnabled`, запусти на телефоне.
- **Android:** `adb shell setprop debug.firebase.analytics.app com.severgames.glowtrail`.
- Пройди обучение и уровень: должны прийти `game_session_start`, `tutorial_step`, `level_start`, `level_win`,
  `currency_earn`, `tutorial_complete`; в свойствах пользователя — `chapter`, `total_stars` и т. д.
  Sentry: в консоли браузера `setTimeout(() => { throw new Error('sentry test') })` → Issues.

### Дашборды

Сначала: Admin → Custom definitions → зарегистрируй параметры событий как **custom dimensions** (`level`, `level_num`,
`step`, `item`, `source`, `currency`, `value`) и **custom metrics** (`stars`, `tilesLeft`, `hints`, `undos`, `ms`,
`amount`, `attempt`), свойства пользователя `chapter`, `total_stars`, `cozy_level`, `game_language`, `game_version` —
как user-scoped dimensions. Данные в отчётах появляются через сутки после регистрации.

1. **Воронка: обучение → уровень 10 → 30 → 31.** Explore → Funnel exploration, шаги: `first_open` (в вебе
   `first_visit`) → `tutorial_complete` → `level_win` с `level_num = 10` → `level_win` с `level_num = 30` →
   `level_start` с `level_num = 31` (глава 2, когда появится). Разбивка — по `game_version` или платформе.
   Внутри обучения смотри `tutorial_step` по `step` (rule_*, done).
2. **Доля проигрышей по уровням.** Explore → Free form: строки — `level_num`, столбцы — Event name (фильтр
   `level_start`, `level_win`, `level_lose`, `level_abandon`), значение — Event count. Доля проигрышей =
   `level_lose / level_start`, бросили — `level_abandon / level_start`. Рядом — `hint_used`, `auto_ease`,
   `level_skipped` по `level_num`: где застревают. Средние `ms`, `hints`, `undos` на `level_win` — сложность.
3. **Удержание D1/D7.** Reports → Engagement → Retention (или Firebase → Analytics → Dashboard → Retention cohorts);
   точнее — Explore → Cohort exploration: включение — `first_open`, возврат — `game_session_start`, шаг — по дням,
   смотри столбцы Day 1 и Day 7. Разбивка — по `chapter` или `game_version`.

Для своих запросов без ограничений GA4 — бесплатный экспорт в BigQuery (Project settings → Integrations → BigQuery).
