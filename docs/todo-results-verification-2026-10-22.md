# To Do — ожидаемый результат и факт

Дата: 2026-10-22, Europe/Moscow. Branch `codex/todo-result-fields-20261022`.
Base: clean `07d86e7d70885a8b69eb7716831e3c832735e407`; checks below were run
with this task's changes dirty. No unrelated edits included.

## Реализация

- В общем TaskEditor после описания добавлены необязательные Textarea
  «Ожидаемый результат» / «Факт»: существующие Field/FieldLabel, rows4/max5000,
  без новой типографики, CSS или изменения footer/scroll ownership.
- Независимые expectedResult/actualResult в create/read/patch API. Отсутствие
  поля при PATCH не сбрасывает значение; пустая строка явно очищает.
- Старые задачи получают пустые значения. Смена статуса/списка/представления
  сохраняет оба поля; Markdown export содержит непустые результаты.
- Обычный startup остаётся verify/READ ONLY и проверяет новые столбцы LIMIT0.

## Отдельно разрешённая миграция

Пользователь явно разрешил добавление двух столбцов после уточнения.
Перед применением выполнен READ ONLY inspection настроенного PostgreSQL:
database=rollapp, role=rollapp_app, оба столбца отсутствовали.
`scripts/migrate-planning-results.mjs --apply` выполнен успешно: только
expected_result/actual_result TEXT NOT NULL DEFAULT '' в public.planning_tasks.
Без UPDATE/DELETE/INSERT/backfill, cleanup, иных migrations или рестарта VM.
Проверены типы/default/not-null, недостающая/несовместимая схема fail closed.
Повторная настоящая проверка initializeRuntimeDatabase: результат `verify`.
Общий migration startup не запускался. Keepalive905f PID92146 оставлен готовым.

## Завершённые проверки

- `npm test`:819 tests,818PASS/1SKIP/0FAIL, exit0.
  `/tmp/rollapp-todo-results-unit-20261022.log`
- `npm run test:ui`:37 primitives/84 application JSX sources, exit0.
- `npm run test:todo`:полная существующая матрица +9 outcome viewport cases,
  exit0. Новые случаи:320/390/768/820/1024/1440/1920px,390×400/1440×400;
  legacy defaults, cancel без callback, Unicode/multiline, failed-save draft,
  independent save/reopen/clear, одинаковая ширина/порядок/maxlength/rows,
  root overflow, запрет реальных API. Старые сценарии не удалены/не ослаблены.
  `/tmp/rollapp-todo-results-ui-20261022.log`
- `npm run test:planning:production`:2 production PostgreSQL integration
  tests PASS/exit0. Настоящие routes, create/patch/read/clear, empty legacy,
  length guards, owner и named To Do isolation, status-preservation, recurrence.
  Все fixture users/tasks/sessions только внутри BEGIN→ROLLBACK; без DDL.
  `/tmp/rollapp-todo-results-production-api-20261022.log`
- `npm run build`:exit0, только существующее предупреждение chunk size.
  `/tmp/rollapp-todo-results-build-20261022.log`
- `npm audit --omit=dev`:первая попытка registry400, повтор exit0/0 vulnerabilities.
  `/tmp/rollapp-todo-results-audit-production-retry-20261022.json`
- `npm audit`:7high development findings в прежней tooling цепочке;
  dependencies/lockfile не изменялись, force downgrade не выполнялся.
  `/tmp/rollapp-todo-results-audit-all-20261022.json`
- `git diff --check`:PASS; runtime diff просмотрен.
- Скриншоты390×844 и1440×844 визуально просмотрены, поля соответствуют
  существующему оформлению. `/tmp/rollapp-todo-results-{width}-{height}.png`.

## Не завершено / границы доказательства

Полный `check:comprehensive` должен быть отдельно завершён на замороженном
кандидате; результаты выше не означают полный аудит. Общий rich editor не
менялся. Реальный пользовательский профиль не использовался для test saves,
uploads/deletes. Разрешение миграции не является доказательством выкладки
frontend/API: на момент этого отчёта новый commit в main не отправлен,
новый CI/deploy не запускался. Физические устройства/IME не проверены.
