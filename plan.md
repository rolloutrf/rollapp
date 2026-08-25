# План: Telegram-бот @rollappRFbot с Mini App

## Цель
Бот @rollappRFbot (токен проверен через getMe) открывает приложение Rollapp
(https://xn--80avakiab.xn--p1ai = https://роллапп.рф) как Telegram Mini App:
кнопка меню бота + ответ на /start с inline-кнопкой web_app.

## Архитектурное решение
- **Webhook-режим**: эндпоинт `POST /api/telegram/webhook` в существующем Express-сервере
  (`server/index.js`), защищён заголовком `x-telegram-bot-api-secret-token` (env `TELEGRAM_WEBHOOK_SECRET`).
  Отдельный процесс/лонг-поллинг не нужен — прод уже за HTTPS-Caddy.
- Бот выключен (маршрут 404), если `TELEGRAM_BOT_TOKEN` не задан — локальная разработка не ломается.
- URL Mini App — env `TELEGRAM_WEBAPP_URL` (дефолт `https://xn--80avakiab.xn--p1ai`).
- Никаких новых npm-зависимостей: Bot API через глобальный `fetch` (Node 22).
- Скрипт `scripts/telegram-setup.mjs`: setWebhook (с secret_token), setChatMenuButton (дефолтная
  кнопка меню web_app для всех чатов), setMyCommands, getWebhookInfo; флаги setup/status/unset.
- Фронт: `telegram-web-app.js` в index.html + `src/telegram.js` (ready/expand/цвета под тёмную тему),
  инициализация только внутри Telegram, в обычном браузере — no-op.
- Секреты: токен только в локальном `.env` (в .gitignore) и в Lockbox/ENV прода — не в git.
  `.env.example` и `deploy/docker-compose.template.yml` получают плейсхолдеры.

## Стадии (параллельно, непересекающиеся файлы)

### Воркер 1 — Backend_Бот (coder)
- `server/telegram-bot.js`: модуль (config из env, sendMessage, обработка update: /start и любой
  текст → ответ с inline_keyboard web_app-кнопкой «Открыть Rollapp»).
- `server/index.js`: регистрация маршрута `POST /api/telegram/webhook` (проверка secret header,
  быстрый 200, ошибки Bot API только в лог). Перед правкой прочитать структуру файла (66 КБ).
- `server/telegram-bot.test.js`: юнит-тесты с моком fetch по паттерну существующих тестов.
- Прогон: `node --test server/telegram-bot.test.js`.

### Воркер 2 — Frontend_MiniApp (coder)
- `index.html`: подключить https://telegram.org/js/telegram-web-app.js.
- `src/telegram.js`: инициализация WebApp (ready, expand, header/background #0a0a0a,
  theme params), безопасный no-op вне Telegram.
- `src/main.jsx`: вызвать init до рендера (прочитать файл перед правкой).
- Проверка: `npm run build`.

### Воркер 3 — Скрипт_Конфиг_Доки (coder)
- `scripts/telegram-setup.mjs`: setup/status/unset для webhook + меню + команд бота.
- `.env.example`: TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET, TELEGRAM_WEBAPP_URL.
- `deploy/docker-compose.template.yml`: плейсхолдеры env (пустые значения, без секретов).
- `README.md`: раздел «Telegram-бот» — настройка, деплой, команды скрипта.

## Финал (оркестратор)
- Записать реальный токен и сгенерированный webhook-secret в локальный `.env`.
- Прогнать `npm test` (бот-тесты) и `npm run build`.
- Установить кнопку меню бота через Bot API (работает сразу, без деплоя).
- setWebhook — только после деплоя прода (endpoint должен существовать).
