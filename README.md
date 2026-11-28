# Glowtrail

Головоломка: фонарщик Lumo прокладывает дорогу из плиток к арке-выходу и по пути зажигает фонари.
Три мира: «Долина» (уровни 1–30), «Туманный лес» (31–60: грибные кольца-телепорты, туман, тень, цель «Побег») и «Ледяные вершины» (61–90: лёд, сугробы и тёплые фонари, ветер, цель «Сигнальные огни»).
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
- `npm run verify` — таблица метрик и проверка всех уровней и кривой сложности (`--world forest --md` — таблица леса в Markdown, `--world peaks --md` — вершин)
- `npm run ease` — пересчитать колоды облегчения и метрики уровней (после изменения уровня)
- `npm run gen -- --count 300 --size 5x6 --features lantern,rock,water,firefly,jump,turnbridge,fade,ring,fog,shadow --seed 1 [--goal fireflies|escape]` — сгенерировать кандидатов в уровни (`generated/`)
- `npm run pick` — подобрать из кандидатов уровни 11–30 под план мира (`src/levels/curve.ts`); `--world forest` — уровни 31–60, `--world peaks` — 61–90
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

## Реклама и покупки (Р4)

Только в приложении (в веб-версии рекламы и покупок нет — витрина пишет «доступно в приложении»). Код — `src/monetization/`:
`config.ts` (ID, `TEST_MODE`), `ads.ts` (AdMob за интерфейсом, веб-заглушка), `store.ts` (RevenueCat за интерфейсом, тестовый
магазин, веб-заглушка), `rules.ts` (частота рекламы, лимиты, стартовый набор — чистые функции), `index.ts` (связка с сохранением
и логом). Сохранение — `economy.shop` (v11, `src/core/shop.ts`): «Без рекламы», обработанные транзакции (начисление один раз,
в облаке — объединение), счётчики роликов.

- **Ролики** — только по кнопке с иконкой ролика: «Подсказка за ролик», «+3 плитки за ролик» (первые «+3 плитки» в день —
  бесплатно, потом часовня, потом ролик), «×2 монеты» в окне победы (только монеты за уровень), «Удвоить за ролик» в награде
  дня. Лимит `ads_rewarded_daily_cap` (5) на все места; не загрузился — сообщение, награды нет, кнопки прячутся на 60 с.
- **Межуровневая** — по «Дальше»/«На карту» в окне победы: с уровня `ads_interstitial_from_level` (15), раз в
  `ads_interstitial_every_n_levels` (3) побед, не чаще `ads_interstitial_min_gap_sec` (180), не в первые
  `ads_session_grace_sec` (180) сессии, не через 2 минуты после ролика, не в обучении и не на знакомствах с механикой,
  никогда у «Без рекламы». `ads_enabled` — выключатель всей рекламы. Всё — Remote Config.
- **Согласие**: первый запуск — форма Google UMP (в ЕС/ЕЭЗ/UK/CH), решение о статистике — из неё (TCF: цели 1 и 8; своим
  методом `getTcfConsent`, патч `patches/@capacitor-community+admob+7.2.0.patch`), затем запрос ATT. Профиль →
  «Настройки конфиденциальности» — форма UMP снова. Текст ATT на всех языках — `npm run ios:strings` (из i18n).
- **Покупки** (`<bundle id>.<имя>`): `noads` (непотребляемая), `starter` (непотребляемая: без рекламы + 20 подсказок +
  500 монет + след «Северное сияние»), `hints_10`, `hints_30`, `coins_s` (800), `coins_l` (2500). Цены — только из стора.
  Магазин → «Покупки», «Восстановить покупки» — там и в профиле. Вход в аккаунт — `Purchases.logIn(user.id)`, выход — `logOut`.

### Тестовый режим и проверка

- Ролики — официальные тестовые ID Google (надпись «Test Ad»). В браузере при разработке: `?ads=fake` (ролик-заглушка),
  `?ads=fail` (не загружается), `?store=fake` (тестовый магазин).
- Нет ключа RevenueCat — в приложении работает тестовый магазин: подтверждение покупки системным окном, цены с пометкой
  «(test)», история покупок на устройстве (проверка начисления и «Восстановить покупки»).
- С ключом RevenueCat (`VITE_REVENUECAT_IOS_KEY` в `.env.app`) в симуляторе — StoreKit-файл `ios/App/Glowtrail.storekit`
  (все 6 товаров), он уже выбран в общей схеме `App` (Product → Scheme → Edit Scheme → Run → Options → StoreKit
  Configuration). Покупки и восстановление — Xcode → Debug → StoreKit → Manage Transactions. Для RevenueCat товары нужно
  завести в проекте RevenueCat (или ключ Test Store `test_…`), право `no_ads` — у `noads` и `starter`.
- RevenueCat для iOS пропатчен (`patches/@revenuecat+purchases-capacitor+11.3.3.patch`): purchases-hybrid-common 18.12.0
  вместо 17.55.2 — SDK purchases-ios 5.67 не собирается Swift из Xcode 27 (исправлено в 5.78).

### Когда появятся боевые ID и Paid Apps Agreement

1. App Store Connect: подписать **Paid Apps Agreement** (Business → Agreements), банк и налоги; завести 6 товаров с теми же
   id (`com.severgames.glowtrail.noads` …) и ценами (3.99 / 4.99 / 1.99 / 4.99 / 1.99 / 4.99), локализации и скриншот для ревью.
2. RevenueCat: проект, приложение iOS (App Store Connect API key / In-App Purchase key), товары, право `no_ads` (noads и
   starter), публичный ключ `appl_…` → `VITE_REVENUECAT_IOS_KEY` в `.env.app`. Android — то же с Google Play (`goog_…`).
3. AdMob: приложение iOS и Android, блоки rewarded и interstitial → `VITE_ADMOB_*` в `.env.app`, `VITE_ADMOB_TEST=0`;
   ID приложения — в `Info.plist` (`GADApplicationIdentifier`) и `AndroidManifest.xml`. Privacy & messaging: сообщение
   GDPR (с IDFA-пояснением не нужно — ATT игра спрашивает сама), app-ads.txt на сайте.
4. App Store Connect → App Privacy: реклама сторонних (Device ID, Advertising Data, Product Interaction, Coarse Location —
   с отслеживанием), Purchase History — связана с пользователем. Возраст 4+ остаётся (реклама PG), но в анкете — «есть
   реклама». Firebase/Remote Config: при желании поменять `ads_*`.
