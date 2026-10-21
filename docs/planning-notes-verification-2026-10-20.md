# Заметки — проверка 2026-10-20

Исходный commit: `95223417bdd06683875ef7cf273ecab599270779`.
Начальное дерево чистое. Проверен dirty working tree с реализацией «Заметок»;
коммит не создавался. Source-specific контракт: `docs/planning-notes.md`.

## Реализованный результат

Четвёртый пункт меню планирования, список и отдельные документы с общим
InlineRichTextEditor. Название и canonical Markdown сохраняются одной очередью,
включая retry и owner/id session draft. Прямые ссылки, Back, создание,
destructive удаление с подтверждением. Обычный document scroller, общий 18/28
body и 48px ControlBar, 24px между toolbar и документом. Shared editor и
типографические primitives не менялись. Authenticated owner-scoped API, отдельная
таблица, read-only startup guard и защита использования изображений.

На этапе UI проверки исправлены сброс текста после acknowledgement названия
(стабильный saved snapshot), лишний первый heading margin (собственный typeset
preset вложенного article) и перенаправление после позднего создания при unmount.

## Согласованная production миграция и интеграция

После явного сообщения пользователя «Даю согласие» выполнено:
`node scripts/migrate-planning-notes.mjs --apply` — PASS.
Точная database=`rollapp`, role=`rollapp_app` сверены с конфигурацией.
Созданы только planning_notes и индекс user_id/created_at/id. Существующие
пользовательские записи не изменялись; общий initializer/backfill не запускался.
До согласия read-only проверки возвращали notes_table=null и production gate
завершался PostgreSQL 42P01 до первого INSERT. Этот блокер устранён.

- `npm run test:notes:production` — PASS, exit 0. Реальные authenticated HTTP
  CRUD + production PostgreSQL: anonymous 401, чужие GET/PATCH/DELETE 404, owner
  query не меняет владельца, validation, whitespace/rich storage, title trim/
  default, полный кириллический документ 200 000 символов через JSON parser,
  список без содержимого всех документов, owner-scoped media references,
  удаление без последующего воскрешения через PATCH.
- `npm run test:notes:production:ui` — PASS, exit 0. Настоящий dev frontend,
  настоящий AppShell/PlanningSpace/общий редактор; только session/notes HTTP API
  перенаправлены в тот же production transaction server. Данные не подменялись.
  Native создание, название, текст, bold, checklist, autosave, browser reload,
  переоткрытие и delete/cancel проверены на 320×740, 390×844, 768×1024, 820×414,
  1024×768, 1440×900, 1920×1080 и 390×400. После ROLLBACK подтверждено отсутствие
  тестовых пользователей/заметок. Пользовательские записи не затрагивались.
  Финальный запуск с вычисленными padding 24px с обеих сторон у PageActionButton,
  точными 48×48/20px и всеми четырьмя радиусами 24px у note ControlBar также PASS
  (exit 0; `/tmp/rollapp-notes-production-ui-final.log`).
- Реальная `initializeRuntimeDatabase` из нового исходника в READ ONLY
  транзакции — `verify PASS`, без migrations/cleanup.
- Собственный dev keepalive перезапущен после миграции. В логе подтверждены
  existing-schema verify и API 53777 / Vite 53778. `dev:keepalive:status` — готов;
  сервис оставлен работать. Чужие checkout/services не останавливались.
- Скриншоты настоящего приложения 390×844 и 1440×900 просмотрены:
  `/tmp/rollapp-notes-production-390-844.png`,
  `/tmp/rollapp-notes-production-1440-900.png`.

## Release и UI проверки

- `npm ci --no-audit --no-fund` — PASS, зависимости из lockfile.
- `npm test` — 794 tests: 793 PASS, 1 штатный SKIP, 0 FAIL; notes/schema/media
  guards включены. Production integration test исключён из database-free suite.
- `npm run test:ui` — PASS, 37 upstream primitives / 80 application JSX sources.
- `npm run build` — PASS; предупреждение о bundle >500 kB сохраняется.
- `npm run test:notes` — PASS на всех восьми размерах. Дополнительно к live
  сценариям проверены load/save failure, retry, delayed queue, empty state,
  48px controls, отсутствие editor frame, точные 24px/нулевой heading margin,
  menu viewport и доступный конец документа. Presentation fixture запрещает
  реальные API и не подменяет production persistence.
- `npm run test:controls` — PASS, 143 records, exact geometry, screenshot-pixel
  assertions и mobile DPR3.
- `npm run test:navigation` — PASS, 46 records, breakpoint/menu/keyboard/safe-area
  и scroll tail. `npm run test:action-rails` — PASS полная матрица.
- Полный `check:release` исходной реализации — PASS, exit 0 в comprehensive JSON. Включает все unit,
  UI/control/detail/date/calendar/form-action, **409** records общего
  `test:text-edit`, notes, kanban, drag/drop и build. Никаких viewport/mode
  фильтров: comprehensive runner удаляет partial env flags. Ранее отдельный
  ручной запуск text-edit прерывался; этот полный завершённый прогон заменяет
  его как итоговое доказательство.
  После него добавлены только изолированные guards поздней навигации в notes
  container: создание теряет intent при любом переходе (включая Back к старому
  history key), удаление не меняет маршрут после unmount своего редактора.
  Shared editor, общая навигация/геометрия и API не менялись. Для финального
  notes snapshot отдельно повторены unit/UI/build, notes eight-viewport и
  production UI eight-viewport — все PASS, exit 0. Финальные журналы:
  `/tmp/rollapp-notes-unit-final-v2.log`, `/tmp/rollapp-notes-ui-final-v2.log`,
  `/tmp/rollapp-notes-build-final-v2.log`, `/tmp/rollapp-notes-lifecycle-final-v2.log`,
  `/tmp/rollapp-notes-production-ui-final-v2.log`.
  Notes matrix дополнительно проверяет delayed create → открыть другую заметку
  → browser Back к исходному history key и delayed delete → browser Back →
  открыть другой документ: поздний ответ не меняет новый маршрут/редактор.
  Полный check:release после этих изолированных guards повторно
  не запускался. Не приписывать ему последующий source snapshot.
- `npm audit` / `npm audit --omit=dev`: production 0 уязвимостей; весь граф
  7 high в dev-only shadcn/registry/ts-morph/glob chain. Совместимый audit fix
  выполнен, lockfile не изменился; force downgrade shadcn 4→1 не применялся.

## Расширенный аудит и ограничения

Полный `check:comprehensive` завершился FAIL в `test:identity-reports` после
успешных check:release/navigation/action-rails. Конкретный отказ: в существующем
Hogan anchor stability 1440×400 после 650ms `document.getElementById(id)` вернул
null (`scripts/identity-report-chart-checks.mjs:36`). На 1024×844 прошли десять
повторов; основные графики прошли всю матрицу, navigation 320/1440 также PASS.
Соответствующие Hogan component/fixture/test исходники не менялись. Это не
ошибка notes gate и не разрешает назвать comprehensive зелёным.

Исходный JSON сохранён как `docs/planning-notes-comprehensive-2026-10-20.json`
(его FAIL сохранён без переинтерпретации); журнал:
`/tmp/rollapp-notes-comprehensive.log`. Полный identity-reports повторно запущен
без изменений assertions/timeout. Оставшиеся todo/form-pages/catalog-page/
wish-groups/drawers/contacts проверены отдельно. Во время исходного прогона менялись только notes integration harness,
его npm-команды и документация; production UI/API implementation не менялся.

Повторный полный `npm run test:identity-reports` — PASS, exit 0, включая обе
anchor stability матрицы по десять повторов. Исходники и assertions не менялись;
первый сбой не воспроизвёлся. Это отдельный успешный повтор, не ретроспективный
PASS первоначального comprehensive JSON. Журнал:
`/tmp/rollapp-notes-identity-repeat.log`.

Отдельные полные `test:todo`, `test:form-pages`, `test:catalog-page`,
`test:wish-groups` — PASS, exit 0. `test:contacts` — PASS, exit 0, восемь
viewport cases. Журналы `/tmp/rollapp-notes-remaining.log` и
`/tmp/rollapp-notes-contacts-final.log`.

Полный `test:drawers` — FAIL в существующей Markdown форме на 1024×768 при
эмулированной keyboard height 428: footer box y=687, height=81 оказался вне
0..428 (`scripts/drawer-smoke.mjs:256`). Проверки дошли от 390/320/414/768/820/
896 до 1024; последующие формы/1440/1920 в этом запуске не проверены.
`DRAWER_WIDTHS=1024 DRAWER_MODES= DRAWER_CASES=markdown DRAWER_REAL_FORMS=1 node
scripts/drawer-smoke.mjs` — PASS, exit 0 без изменений исходников/ассертов.
Это только диагностический повтор одного case, не полная зелёная матрица.
FormSurface/overlay/Markdown drawer исходники в задаче не менялись; не обобщать
этот transient failure на Notes, не объявлять весь расширенный аудит успешным.
Журнал `/tmp/rollapp-notes-drawer-diagnostic.log`.

В рамках исходной задачи нет незавершённых требований к «Заметкам»: menu,
тот же shared editor, persistence/owner isolation, создание/переименование/
удаление, draft/retry, responsive UI и текущие lifecycle guards подтверждены
соответствующими source/fixture/real PostgreSQL/native browser проверками.
Остаточная нестабильность широкого аудита относится к неизменённым Hogan/drawer
проверкам и не скрывается под общей отметкой PASS.

Настоящие iOS/Telegram IME/hardware keyboards, реальные file uploads и rollout
на VM не выполнялись. Общий редактор сохраняет свои существующие ограничения;
эта задача не заявляет полное Notion parity. Подтверждены локальное приложение
с production DB и rollback persistence; remote production UI release не заявляется.
