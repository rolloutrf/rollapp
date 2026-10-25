# Выпуск прозрачных панелей — 2026-10-25

База: c0e068d156ac88a8bc5f6baa472a7c48bc20922c. Ветка codex/transparent-header-20261024. До выпуска dirty только изменения и отчёты запросов этого чата; diff просмотрен, сторонние изменения не включались.

Изменения: прозрачная общая шапка приложения/публичного профиля и прозрачная область вокруг быстрого добавления задачи. Собственные поверхности кнопок, селекторов и поля сохраняются. Контракты записаны в AGENTS.md, docs/spacing-system.md, docs/design-system.md.

Выполнены на рабочем снимке:
- test:ui PASS, test:navigation PASS (9 ширин, 5 маршрутов, обе темы), test:todo PASS (полная матрица); дополнительные вычисленные background/image/border/shadow/backdrop-filter assertions.
- build PASS, предупреждение о chunks; git diff --check PASS.
- npm audit и npm audit --omit=dev: 0 уязвимостей.
- Основной persistent production dev API/frontend готовы, сервис оставлен работать.

Предыдущий локальный check:comprehensive завершился ошибкой в text-caret-scroll-checks.mjs:63 на 320×844: native Selection.focusNode оказался null при Range.setStart. До ошибки прошли unit (830 PASS, 1 skip, 0 FAIL), UI и ранние browser стадии. Лог /tmp/rollapp-transparent-header-comprehensive.log, JSON /var/folders/56/y9x0qcp95zs6ctldh56fs6qh0000gq/T/rollapp-check-1792870030256.json. Во время старого прогона менялся footer, поэтому полный стабильный PASS не заявляется. Проверки и их assertions не ослаблялись. Перед публикацией штатный deploy workflow обязательно заново выполняет полный check:release на точном commit.

Этот документ фиксирует подготовку. Итоговый SHA, CI и health будут подтверждены после rollout. Схема и данные production не меняются.

## Выпуск завершён

Production SHA: `9daf0a4fff52c251eff6c5fa8cebcd55ccae4277`. Выпуск завершён 25 октября 2026 около 14:51 МСК. [Workflow 40182554841](https://github.com/rolloutrf/rollapp/actions/runs/40182554841): deploy SUCCESS, все его шаги SUCCESS; отдельный audit job штатно skipped для main. Полный `check:release` прошёл на точном чистом commit: unit (831 total, 830 PASS, 1 skip, 0 FAIL), UI, page scrollers, lab results, controls, details, dates, calendar, form actions, text editing, notes, kanban, drag/drop, health, medication photos, build. Образ опубликован с immutable SHA; rollout, exact-SHA health, canonical redirects/profile и Telegram configure прошли.

Дополнительно на этом commit: `--caret-scroll-only` PASS на всех девяти размерах; `test:action-rails` PASS. Assertions не ослаблялись, код редактора не менялся. Предыдущий локальный comprehensive остаётся неуспешной попыткой, полный comprehensive PASS не заявляется.

Перед rollout выполнен реальный `initializeRuntimeDatabase` в режиме verify на настроенной production PostgreSQL: сверены database/role с конфигурацией, подтверждены encrypted/authorized у клиентского TLS-сокета, reserved-username guard и все existing-schema queries пройдены в `BEGIN READ ONLY` с ограниченными statement/lock timeouts и `ROLLBACK`. Миграции запрещены throw-guard. Лог `/tmp/rollapp-transparent-production-schema.log`. Одноразовый диагностический pool закрыт; основной persistent dev API/frontend оставлен работать.

После rollout отдельный GET `/api/healthz` подтвердил `ok: true`, `service: rollapp` и точный полный SHA выше. В существующей авторизованной IAB-сессии read-only просмотрены реальный публичный профиль и To Do за 24 октября. На desktop 1280×720 вычисленные background шапки и footer — `rgba(0, 0, 0, 0)`, background-image/shadow/backdrop-filter — none. Поле сохраняет `--muted`; удалённый overview отсутствует, root overflow отсутствует. На mobile 390×844 footer также прозрачный, desktop composer и верхняя шапка штатно отсутствуют; overflow отсутствует. Оба вида просмотрены на screenshots. Временный viewport восстановлен. Задачи/формы не изменялись и не сохранялись. Приватные screenshots/содержимое задач в репозиторий не добавлялись.

На момент проверки runtime-исходники были чистыми; после неё изменён только этот отчёт с результатами. Временный обрыв локального GitHub API (EOF) обойдён read-only GitHub connector; он не трактовался как сбой job. CI завершился без перезапуска или повторного rollout. Данные и схема production не менялись.
