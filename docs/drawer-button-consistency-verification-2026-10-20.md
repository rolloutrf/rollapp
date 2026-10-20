# Единообразие штор и кнопок — 2026-10-19–20

База: `d116857ce0aadfeb4e1258fdb1a3ae2abf5e958f`, исходный worktree чистый.
Проверяется dirty worktree этой задачи; релиз/публикация не выполнялись.

## Изменения

- `form-surface` задаёт всем настольным шторам направление справа без отдельной
  полосы swipe-handle; мобильные формы сохраняют native-page поведение.
- Общий `DrawerFooter` и нестандартные футеры контакта/желания используют
  `ControlBar` и `app-form-actions`: кнопки 48px, четыре радиуса 24px, иконки
  20px, текст 18/28px, gap 8px, единые inset 16px/разделитель/поверхность.
- Primary идёт первым в DOM и занимает свободную ширину; Save/Cancel больше
  не расходятся по форме и раскладке. Убраны дублирующие стили футеров.
- Задача, желание и группа препаратов используют круглую корзину с полным
  accessible name/title. Destructive/disabled поверхности остаются непрозрачными.
- Круглое закрытие использует тот же ControlBar; upstream primitives не менялись.
- Реальные формы drawer smoke расширены на все размеры; legacy fixture Wishlist
  переведён на общий футер. Проверяются геометрия, все радиусы, opacity/alpha,
  метрики текста, glyphs и промежутки. Отдельно добавлен fullscreen wish-edit.
- Smoke-скрипты controls/details/dates/kanban допускают свои порты через env,
  чтобы проверки разных worktree не мешали друг другу. Ассерты не ослаблены.

## Окружение и безопасность данных

Локальные `.env`/`.env.local` взяты из основного checkout (игнорируются Git).
Основной production keepalive на 5172/8080 оставлен работающим, direct TLS,
`ROLLAPP_DATABASE_INITIALIZATION=verify`; healthz возвращает `ok: true`.
Frontend этого worktree работает на 5272 с тем же production API.
Попытка отдельного keepalive этого worktree конфликтовала с 5172 и затем
падала на 15-секундном CLI Lockbox timeout. Неуспешный дубликат отключён;
здоровый основной production-сервис не останавливался. Контрольное чтение
настроенного Lockbox с увеличенным timeout успешно, значения не печатались.

Живой read-only просмотр на 5272: Wishlist, настройки профиля (disabled Save),
создание желания, открытие/закрытие без сохранения. Статус основного keepalive
проверен отдельно. UI fixtures запрещают API, production записи не создавались,
миграции/инициализация/очистка данных не запускались.

## Проверки

- `npm ci` — успешно; lockfile не изменён.
- `npm test` — 715 passed, 1 skipped, 0 failed.
- `npm run test:ui` — успешно, 37 upstream primitives / 74 application JSX.
- `npm run test:controls` — полная штатная матрица успешно, включая paint и DPR 3.
- `npm run test:form-actions` — штатная матрица успешно; повтор с wish-edit и
  дополнительными desktop geometry checks также успешен.
- `npm run test:form-pages` — полная штатная матрица успешно, nested/draft/busy,
  source document и page/browser Back без скачков.
- `npm run test:action-rails` — полная штатная матрица успешно.
- `npm run test:dates` — полная штатная матрица успешно.
- `DETAIL_ACTION_PORT=5293 npm run test:details` — полная матрица успешно.
- `npm run build` — успешно (предупреждение о размере chunk).
- `git diff --check` — успешно.
- `npm run test:drawers` — 280 successful checks: 40 compositions + 240 real
  form states (24 forms × 10 viewports), 320–1920px, including 390×400.
- Final contact inset review: `FORM_ACTION_CASES=contact FORM_ACTION_PORT=5398
  npm run test:form-actions` — full default width/short-window matrix successful.
  This local desktop-only inset correction happened during release verification
  and was separately rechecked; mobile responsive page insets remain unchanged.

Полный итоговый release завершился с exit 1. Unit/UI/controls/details/dates/
form-actions прошли. `test:text-edit` дошёл до `checkTableDuplicate`, где на
1440×844 повторная загрузка объединённой таблицы осталась в состоянии
«Загружаем текст…» и превысила 30s timeout (`text-table-duplicate-checks.mjs:56`).
Ассерты не менялись, timeout не увеличивался, ошибки не подавлялись.

Изолированный повтор `TEXT_EDIT_PORT=5399
TEXT_EDIT_CACHE_DIR=node_modules/.vite-text-duplicate-recheck
node scripts/text-edit-smoke.mjs --table-duplicate-only` прошёл все девять
размеров, включая 1440×844/400 и 1920×844 (exit 0). Сбой полного прогона отдельно
не воспроизвёлся; его причина не установлена. Этот повтор не заменяет полный
`test:text-edit` и не делает неуспешный `check:release` успешным.

Оставшиеся после table-duplicate блоки `test:text-edit` в полном прогоне не
выполнялись: plain caret, caret scroll, tables, slash, block colors/menu,
conversion, sparse/deep lists/nesting/boundaries и selection paint. Они не
выдаются за проверенные. Kanban/build из прерванной цепочки выполнены отдельно:
`KANBAN_DRAG_PORT=5294 npm run test:kanban` и `npm run build` — exit 0.
Расширенная drawer-матрица завершена успешно. Промежуточные запуски release имели
конфликт чужих портов 5192/5193. Первый расширенный drawer-прогон выявил legacy
wish footer/лишний handle rail на 768px; исправлено, целевая проверка успешна.
Это не были успешные полные прогоны, они не заменяют итоговый результат.

## Зависимости

`npm audit` и `npm audit --omit=dev` выполнены до/после: 7 high в dev-цепочке
shadcn, 0 runtime. `npm audit fix` завершился ошибкой audit endpoint 400;
совместимый `npm update ts-morph @ts-morph/common --ignore-scripts --no-audit`
не нашёл обновлений в допустимом дереве. npm предлагает откат shadcn до 1.0.0;
несовместимый downgrade/force не применялись. Пакеты и lockfile не менялись.

## Ограничения

Это проверка оформления и поведения, без production сохранения/удаления,
платежей, загрузки файлов и реального iOS/Telegram keyboard/IME.
Эмуляция VisualViewport не выдаётся за реальное устройство.
`check:comprehensive` отдельно не запускался; release attempt и drawer suite
не называются полной проверкой всех экранов приложения. Полный release gate
остаётся красным из-за указанного timeout; зелёный релиз не заявляется.
Снимки fixture лежат в `/tmp/rollapp-form-consistency-*` и
`/tmp/rollapp-form-actions-*`; персональные live-снимки не добавлены в Git.

Итоговый diff просмотрен; изменения upstream primitives, API, схемы/данных и
зависимостей отсутствуют. Финальный `test:ui` и `git diff --check` успешны.

Контроль исходного `d116857ce0aadfeb4e1258fdb1a3ae2abf5e958f` из временного
`git archive HEAD`: тот же `--table-duplicate-only` прошёл все девять размеров
(exit 0), с теми же зависимостями/шрифтами и запретом API. Для symlink-зависимостей
настроен только fs allow list временного Vite; код приложения не менялся.
Предварительные baseline-запуски с ошибочной fs allow list (отказ доступа к
шрифтам/модулю) исключены из доказательств. Полный timeout не воспроизвёлся
ни на изменённом, ни на исходном коде в изоляции; причина не установлена.
Временная baseline-копия удалена после завершения её fixture server.

Итог: задача оформления выполнена и проверена своей полной матрицей. Полный
release gate не зелёный; оставшаяся часть общего редакторного suite не заявляется
проверенной. Публикации не было. Основной production keepalive и frontend 5272
оставлены работающими.

Финальная проверка окружения 2026-10-20: в ходе параллельной работы другой
worktree `905f` стал владельцем 8080/5172. Его `dev:keepalive:status` показывает
готовый persistent service (PID 10724), API/frontend готовы; healthz `ok: true`.
У основного checkout в этот момент PID-файл отсутствует, хотя launchd включён.
Здоровый активный сервис `905f` не перезапускался и не останавливался. Frontend
этой задачи 5272 остаётся в `f604` и использует этот же активный production API.
Таким образом production development connection оставлен работающим; финальная
готовность не приписывается уже не владеющему портами основному checkout.
