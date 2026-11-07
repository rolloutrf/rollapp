# Переключение ассистента на Алису при исчерпании баланса OpenRouter

Дата проверки — 2026-11-08. Исходный checkout `f55cce47e5718bc411f39cfc9436930deb152f23`
был чистым и предшествовал интеграции Алисы. Ветка `codex/assistant-yandex-fallback`
создана от актуального `origin/main`, `1cc1c4ee374440ad18c0ea4c40316dfbff78b079`.
Команды выполнялись с незакоммиченными изменениями исправления поверх этого SHA.

Товарный поиск уже повторял запрос через Yandex AI при исчерпании баланса
OpenRouter. Маршрут чата возвращал 503 при HTTP 402. Теперь чат использует
тот же принцип и один раз вызывает настроенную базовую модель с исходными
сообщениями, инструментами и общим таймаутом. Поддерживаются HTTP 402 и
`error.code: 402` в успешном HTTP-ответе. Тест воспроизвёл исходный 503 до правки.

## Результаты

- `node --test server/messenger-assistant.test.js server/yandex-ai.test.js server/openrouter-marketplace-offers.test.js` — 32 прошли. Проверены обе формы 402, один повтор, общий сигнал отмены, отсутствие настроенной Алисы, обычная ошибка 429, действия ассистента и существующий поиск предложений.
- `npm test` — 975 прошли, 1 пропущен, 0 ошибок.
- `npm run test:messenger` — ассистент и мессенджер прошли проверки на всех 10 размерах, от 320 до 1920 px, включая 390×400 и 1440×400. Просмотрены скриншоты ассистента на 390×844 и 1440×844.
- `npm run build` — успешно, с существующим предупреждением о размере чанков.
- Локальный HTTP-маршрут ассистента с имитацией HTTP 402 передал короткий синтетический запрос реальной Alice AI LLM Flash через Yandex AI Studio с `YANDEX_AI_AUTH=cli`. Маршрут вернул HTTP 200 и ответ Алисы. Данные пользователя в пробе не участвовали.
- `npm run dev:keepalive` и `npm run dev:keepalive:status` — превью на `127.0.0.1:15674` готово и оставлено включённым. API использует настроенный production PostgreSQL по direct TLS, `PG_POOL_SIZE=1` и `ROLLAPP_DATABASE_INITIALIZATION=verify`. Startup подтвердил проверку существующей схемы без миграций или очистки. В существующей сессии открыт чат ассистента, доступность формы и выключенный по умолчанию переключатель планирования проверены без отправки сообщения.
- `npm audit` — 8 предупреждений (2 low, 4 moderate, 2 high). `npm audit --omit=dev` — 2 high, связанные с `zod@3.25.76` в `@ton/ton@16.3.0`. Для этой цепочки npm не предложил исправления. Прямой `zod@4.6.7` выше исправленной версии 4.6.6. Lockfile не менялся. [Advisory Zod](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5)
- `git diff --check` — успешно.

## Границы проверки

Полный `npm run check:comprehensive` остановлен по запросу на выпуск без тестов.
Он не завершился. JSON — `/tmp/rollapp-assistant-fallback-comprehensive.json`,
лог — `/tmp/rollapp-assistant-fallback-comprehensive.log`.

Для выпуска пользователь выбрал ручной режим `verification=none`. Перед
публикацией `initializeRuntimeDatabase` проверил настроенный production PostgreSQL
`rollapp` / `rollapp_app` по прямому TLS в транзакции READ ONLY, с включёнными
проверками наград и резервного копирования. Production до публикации отвечал с
`912c48d67a5d6c8f4d8801c3fd50c3d03f22ef0d` и `defaultAiProvider: "yandex"`.
