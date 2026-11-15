# 30 Запуск и эксплуатация

[Клиент](../../src/modules/runtime/) · [Сервер](../../server/modules/runtime/)

**В коде.** Клиентский API-транспорт, Express, PostgreSQL, конфигурация и проверка схемы, production health, dev keepalive, Docker, CI/CD, внешние фоновые задачи. `/api/healthz` связывает проверку живого сервиса с настроенной БД.

**Владение.** Платформа предоставляет конфигурацию, `query/transaction`, формат ошибок, маршрутизацию, обработку запросов и жизненный цикл процессов. Политики данных и операции остаются у модулей. Секреты читаются существующими путями, клиенту отдаётся минимальная конфигурация.

**Подключение.** Передавайте серверной регистрации модуля зависимости явно, как в `registerPlanningRoutes` и `registerCdekRoutes`. Клиент использует общий API-транспорт. В live-проверке держите настроенный production PostgreSQL по TLS и read-only verify на старте. Следуйте отдельной процедуре для миграций, бэкфиллов и операторских импортов.

**Приёмка.** Штатная проверка схемы без записи, понятная ошибка недоступности, активный dev keepalive, health с ожидаемым SHA после релиза и проверка затронутого UI на production API. Используйте `npm test`, `npm run check:release` и последовательность выпуска из [регламента](../verification.md).

[Проверка БД](../../server/modules/runtime/database-startup.js) · [Клиентский транспорт](../../src/modules/runtime/api.js) · [Контейнер](../../deploy/docker-compose.template.yml) · [Выпуск](../../.github/workflows/deploy-yandex-cloud.yml) · [Telegram worker](../../.github/workflows/telegram-bot.yml)
