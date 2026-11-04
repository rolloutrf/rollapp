# Прямое открытие редактора календарной задачи — 4 ноября 2026

Проверяемая основа: `f55cce47e5718bc411f39cfc9436930deb152f23`, с незакоммиченными изменениями этой задачи. До начала работы checkout был чистым.

Клик по задаче временной сетки, мобильной повестки или списка вызывает общий TaskEditor сразу. Промежуточный Popover и его стили удалены. Enter/Space используют нативное поведение Button. Повторение по-прежнему открывает сохранённую исходную серию; выделенный для отображения слот не попадает в исходные поля расписания. Перетаскивание и ручки изменения длительности сохранены.

Обновлены календарный smoke, проверка геометрии и исторические integration/browser-сценарии, ожидавшие preview. В controls fixture загрузка связанных объектов изолирована на границе presentation data; реальные API-запросы по-прежнему запрещены. Проверяются сохранённые выбранные связи внутри настоящего TaskEditor.

## Выполненные проверки

- `npm ci`: зависимости установлены без изменения lockfile.
- `npm run build`: PASS; стандартное предупреждение о размере JS chunk.
- `npm run check:comprehensive`: первый прогон остановился на устаревшем ожидании preview в controls; сценарий исправлен. Повторный прогон остановлен по прямой просьбе пользователя «Не надо проводить полную проверку» после успешных unit/UI/controls, во время test:details.
- В повторном прогоне: unit — 789 PASS, 1 SKIP; `test:ui` — PASS; `test:controls` — PASS полной матрицы с точными размерами/пикселями и DPR 3.
- `npm run test:calendar`: PASS, exit 0, все 14 сочетаний 320/390/768/820/1024/1440/1920 × 900/400. Клик в day/week/mobile-month, Enter во временной сетке, Space в списке, серия, cancel/no-write, untimed origin, save/failure/retry/delete, keyboard/pointer/touch resize, Escape, range и drag прошли. Первый диагностический запуск выявил необходимость дождаться actionability при keyboard activation после закрытия мобильной формы; дополнительно исправлен неоднозначный locator пяти повторений в списке.
- Скриншоты: `/tmp/rollapp-direct-task-{width}-{height}.png`, календарные виды `/tmp/rollapp-events-*`. Просмотрены mobile 320×400, 390×900 и desktop 768×400, 1440×900; дополнительный 1920×400 просмотрен после завершения матрицы.
- `npm audit`: 11 existing findings (2 low, 5 moderate, 4 high); `npm audit --omit=dev`: 3 high (body-parser, vite, zod). Зависимости этой UI-правкой не менялись. В частности, предложенный откат shadcn на 1.0.0 не применялся. JSON: `/tmp/rollapp-direct-audit.json`, `/tmp/rollapp-direct-audit-production.json`.

## Production и ограничения

В checkout первоначально отсутствовали `.env`/`.env.local`; настройки основной checkout перенесены в игнорируемые файлы с отдельными API/frontend портами 18451/15451. `npm run dev:keepalive` включил launchd-сервис `rf.rollapp.development.2afaa88d5d0b`, однако backend не готов: `Yandex CLI Lockbox request failed` при получении production credentials. Сервис оставлен включённым, demo/local database не использовалась, production schema и записи не изменялись. Живой authenticated UI и rollback integration не проверены. Browser smoke использует только несохранённые presentation props с запрещёнными API, не заменяя production подключение.

Полная comprehensive-проверка не завершена: остановлена по просьбе пользователя; оставшиеся этапы не запускались. Целевой календарный прогон завершён полностью. Финальный `git diff --check` — PASS, diff просмотрен. Release/deploy не выполнялись.

## Подготовка деплоя

По запросу «Деплой» изменение перенесено отдельным cherry-pick поверх актуального `main` `2066aad3ee4cb9d14a1c0f08f841819af2920e27`; прежняя основа имела другую историю. Сохранены новые `useCalendarGesture`, sticky content, click suppression после drag и синхронизация устройства. Прямой TaskEditor применяется к задачам Rollapp; внешние события Apple Calendar сохраняют прежний read-only preview, поскольку редактируются на устройстве.

Повторная `npm ci` и сборка на актуальной основе выполнены. `CALENDAR_WIDTHS=390,1440 npm run test:calendar` проверяет затронутые представления после переноса; это диагностическая, не полная viewport-матрица. Полная проверка приложения не запускается по прямому указанию пользователя.

Локальная ошибка Lockbox впоследствии разрешилась при автоматическом перезапуске: backend вывел `Existing PostgreSQL schema verified without migrations or data cleanup.` и запустил frontend на 15451. Persistent service оставлен включённым.

Для выпуска используется существующий manual `verification=none` после `[skip ci]`, чтобы не запускать отменённый пользователем полный gate. Docker build, read-only schema verification, immutable SHA, OIDC, последовательный rollout и exact-SHA health остаются штатными. Предыдущий успешный production SHA — `2066aad3ee4cb9d14a1c0f08f841819af2920e27`.
