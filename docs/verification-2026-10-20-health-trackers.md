# Проверка пространств «Сон» и «Питание» — 20 октября 2026

Базовый commit: `95223417bdd06683875ef7cf273ecab599270779`. В начале рабочая копия была чистой. Проверяется dirty-состояние с изменениями этой задачи; релиз/публикация приложения не выполнялись.

## Изменения

- В меню «Здоровье» сохранены исходные пункты и раздел по умолчанию «Анализы», после «Препараты» добавлены «Сон» и «Питание». URL и предоставление доступа имеют независимые section=sleep/nutrition.
- Сон: дата пробуждения, время засыпания/пробуждения, качество 1–5, заметки; длительность через полночь и сумма периодов за день.
- Питание: дата/время/тип/название, необязательные калории и БЖУ, заметки. Пустое значение и 0 различаются, итоги складывают заполненные значения.
- Создание, чтение, редактирование, подтверждённое удаление; серверные проверки и ограничение каждой операции владельцем и типом трекера. У читателя отсутствуют действия изменения.
- Формы используют form-surface, MobileFormPages, DrawerFooter и PlanningDatePicker. Ошибки сохраняют черновик. Исправлено влияние legacy-отступов абзацев на новые композиции локальным CSS; общий масштаб типографики не менялся. Основной текст карточек — общий body 18/28.

## Production PostgreSQL

Конфигурация взята из основного checkout этого же репозитория, секреты не выводились и не добавлялись в Git. Использован прямой TLS, без demo/local/memory fallback.

После отдельного явного разрешения пользователя применён `server/migrations/2026-10-20-health-trackers.sql`: новая таблица и индекс. Перед применением сверены точная настроенная база `rollapp` и роль `rollapp_app`; таблица ранее отсутствовала. Пользовательские записи миграцией не менялись. Новая схема также описана в общей схеме для отдельно разрешённой установки. Обычный dev/release startup сохраняет verify/READ ONLY, теперь проверяет и колонки новой таблицы.

`npm run test:health:production` прошёл: настоящие SQL/CRUD-маршруты, точный reload, обновление/удаление, запрет чужих записей и неправильного трекера. Тест использует двух временных пользователей и записи только внутри одной BEGIN → ROLLBACK транзакции; после отката проверено отсутствие всех временных пользователей/записей. Middleware авторизации в этом изолированном тесте задаёт проверяемых пользователей; это не проверка браузерного входа.

`npm run dev:keepalive:status`: автозапуск включён, API/frontend готовы. Для этого checkout использованы отдельные порты 8317/5317, поскольку исходный frontend-порт занят другим процессом. Сервис оставлен работающим. Живые HTTP-проверки: healthz 200, оба GET трекеров и POST без сессии 401.

## Проверки

- `npm test`: 795 тестов, 794 passed, 1 skipped, 0 failed. Все новые unit-проверки включены; production integration исключён из database-free suite.
- `npm run test:ui`: passed, 37 upstream primitives, 80 application JSX sources.
- `npm run test:health:production`: passed, 1 production rollback test.
- `npm run test:health`: полная матрица двух трекеров: 320/390/768/820/1024/1440/1920 × 900, дополнительно 390 × 400 и 1024 × 400. Реальные компоненты и полный shell вкладки, несохранённые props/callbacks, любые API-запросы запрещены. Проверены пункты меню, дневные расчёты/пустой день, даты, редактирование/ошибка/retry, мобильная вложенная дата/Back и черновик, подтверждение/отмена удаления, read-only, создание, отсутствие root/descendant clipping, body 18/28, 48px controls и достижимость последнего действия над мобильной навигацией. Скриншоты: `/tmp/rollapp-health-trackers/`.
- `npm run build`: passed, сохраняется предупреждение о крупных chunks.
- `git diff --check`: passed; итоговый diff проверен, исходно чужих dirty-файлов не было.
- `npm audit --omit=dev`: 0 уязвимостей. `npm audit`: 7 high в существующей dev-цепочке shadcn/fast-glob/micromatch/braces/ts-morph. [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) сообщает об отсутствии исправленной версии braces; предложенный audit откат shadcn на 1.0.0 несовместим и не применялся. Зависимости и lockfile не менялись.

## Общий аудит

`npm run check:comprehensive` запущен без фильтров матрицы. JSON: `/var/folders/56/y9x0qcp95zs6ctldh56fs6qh0000gq/T/rollapp-check-1792519359167.json`. Лог: `/tmp/rollapp-health-comprehensive.log`.

Первый прогон завершился failed на test:todo после успешных release/navigation/action-rails/identity-reports; расследование и повторный полный запуск описаны ниже. Этот запуск начал release-строку до добавления test:health в package.json, поэтому проверка новых трекеров дополнительно запускается отдельно. Не считать запущенный/частичный аудит успешно завершённым полным аудитом.

## Ограничения

При первоначальном просмотре IAB-сессия перенаправляла на вход. После пользовательского входа на том же origin авторизованный UI проверен: настоящая сегодняшняя плашка сна без календаря/добавления, открытие формы нажатием и отмена без сохранения. Cookies между origin не переносились. Скриншот: `/tmp/rollapp-sleep-history-live.png`. Production CRUD проверен изолированным rollback-тестом, представление — полной матрицей UI выше. Физическая мобильная клавиатура/IME и Safari не проверены. Публичный production UI не выкладывался.


## Уточнение интерфейса сна — лента плашек

По просьбе пользователя «Сон» переведён с календаря и кнопки добавления на историю дневных плашек. Сегодняшняя пустая плашка появляется автоматически; исторические данные берутся только из PostgreSQL. Форма открывается нажатием на всю плашку и сохраняет закреплённую дату, без календаря внутри формы. Несколько старых периодов одного дня не теряются. Представление обновляет дату при локальной смене суток, focus и visibilitychange; ни таймер, ни просмотр не пишут записи в БД. Питание сохраняет собственный дневной интерфейс.

Повторно passed: `npm test` (795/794/1 skipped), `npm run test:ui`, `npm run build`, `npm run test:health` (оба трекера на девяти viewport-парах, без фильтров). Сон проверяет всю плашку, отсутствие календаря/добавления на странице и в форме, descending history, существующие записи, ошибку/retry, редактирование/удаление, создание/отмену, пустую ленту и read-only. Отдельный браузерный clock-case прошёл смену 20→21 октября в 00:00 Europe/Moscow: новая плашка появилась автоматически, форма не открылась и API-запросов не было. Логи: `/tmp/rollapp-health-history-unit.log`, `/tmp/rollapp-health-history-smoke.log`, `/tmp/rollapp-health-history-build.log`.

Первый comprehensive-аудит впоследствии остановился на test:todo; его результат не считается полным успешным аудитом. См. повторный прогон ниже.

Финальная повторная проверка keepalive после уточнения интерфейса кратковременно получила timeout PostgreSQL/HTTP; PID и listeners оставались живыми. Сервис не останавливался, PID-файл не удалялся, fallback не использовался. Следующие прямые HTTP-проверки вернули frontend 200 (0.012s), API 200 (0.024s), а повторный `npm run dev:keepalive:status` подтвердил готовность API/frontend с тем же PID 58323.

## Уточнение питания — To Do

По следующей просьбе пользователя питание переведено на дневной checklist. На desktop используется тот же `PlanningDayRibbon`, выделенный без изменения геометрии/поведения из `PlanningDailyTodo`; на телефоне — Previous/гибкая дата с weekday/Next/круглая +, без ленты и встроенного composer. Desktop composer поддерживает Enter, Shift+Enter, IME guard и полную форму через +. Запланированные и съеденные приёмы пищи показаны отдельными группами; галочка зачёркивает название и меняет счётчик. Итоги калорий/БЖУ учитывают только съеденные записи. Редактирование и подтверждённое удаление сохранены, выбранный день остаётся в URL и не меняется при ответе сохранения.

Флаг completed хранится в уже существующем JSON записи. Новые записи UI получают false, старые записи без флага читаются как съеденные (true). Миграции, backfill и массовые изменения не выполнялись. Полная форма позволяет отметить состоявшийся приём сразу; при ошибке переключения прежняя галочка/итоги сохраняются с видимой ошибкой и повтором. Ошибки desktop composer привязаны к дню черновика.

Повторные результаты, без viewport-фильтров:

- `npm test`: passed, 795 total / 794 passed / 1 skipped. Проверена обратная совместимость и строгий boolean completed.
- `npm run test:health:production`: passed, включая сохранение false, повторный GET и полный ROLLBACK/отсутствие временных записей.
- `npm run test:ui`: passed, 82 application JSX sources. Source guard проверяет вынесенную общую ленту и её использование To Do, сохраняя утверждения про content tiles вне ControlBar.
- `npm run test:todo`: passed, полная штатная матрица после выделения PlanningDayRibbon.
- `npm run test:controls`: passed, полная штатная матрица и screenshot-pixel/DPR 3 проверки.
- `npm run test:health`: passed, все 18 комбинаций трекер/viewport и отдельная смена суток сна. Питание проверяет ленту 130×100/мобильную строку, ошибку/повтор галочки, счётчик и итоги, date URL, редактирование/черновик/мобильный date Back, удаление, read-only, планирование через форму и быстрый desktop composer. Лог финальной матрицы: `/tmp/rollapp-nutrition-final-matrix.log`.
- `npm run build`: passed, остаётся исходное предупреждение о крупных chunks. Лог: `/tmp/rollapp-nutrition-final-build.log`.
- `git diff --check`: passed; просмотрены изменённые исходники и diff общих компонентов.

Авторизованный live UI на production API проверен чтением: лента дат, пустой список, composer и открытие/отмена полной формы с флагом «Приём пищи состоялся». Записей в настоящем профиле не создавалось. Скриншот: `/tmp/rollapp-nutrition-todo-live.png`. Сервис перезапущен для нового JSON-валидатора через штатный keepalive, финальный status подтвердил API/frontend готовы, PID 64790; оставлен работающим. Первое enable попало в завершение прежнего процесса после launchd bootout: после проверки отсутствия процесса/listeners и штатного удаления PID-файла самим процессом повторный enable выполнился успешно, вручную PID-файл не удалялся.

Первый comprehensive-аудит впоследствии завершился failed на test:todo; полный comprehensive-pass для него не заявляется. Код интерфейса в публичный production не выкладывался.


## Сбой общего аудита и защита от повторного submit

Первый check:comprehensive (`rollapp-check-1792519359167.json`) завершился exit 1 в test:todo на 1440×400: после сохранения payload.relatedItems оказался пустым вместо выбранного wishlist reference. До этого полностью passed release (включая полный редактор, канбан, Drag-and-Drop и сборку), navigation, action-rails и identity-reports. Остальные стадии первого отчёта помечены not-run. Первый результат не засчитывается как успешный полный аудит; PASS разных snapshots не объединяются в один.

Первоначальный targeted-повтор To Do прошёл и не воспроизвёл потерю ссылки. Дополнительная диагностика выявила отдельное воспроизводимое окно повторной отправки: два настоящих DOM form.requestSubmit в одном кадре вызывали два сохранения до React commit. Регрессия перед исправлением детерминированно дала events=2/calls=2 (`/tmp/rollapp-todo-atomic-before.log`). Это подтверждённая проблема; её связь с исходной потерей related reference напрямую не доказана.

`PlanningDailyTodo` теперь захватывает синхронный submit ref до вызова onSave и освобождает его только после commit состояния успеха/ошибки. Отдельный settled revision обеспечивает разблокировку даже после одинаковой повторной ошибки. Формат полей, геометрия, callback API и обработка related draft не изменены. Fixture регистрирует настоящие callback payload; тест требует ровно одно сохранение и сохраняет исходную строгую проверку canonical related references.

После исправления targeted 1440×844/400 и затем полная штатная матрица `npm run test:todo` passed, включая новую проверку events=2/calls=1, ошибки/retry, related picker Done/cancel, miniatures, удаление одного preview и canonical save. Логи: `/tmp/rollapp-todo-atomic-after.log`, `/tmp/rollapp-todo-atomic-full.log`. `npm run test:ui` и `git diff --check` passed.

Новый полный check:comprehensive запущен на исправленном состоянии без viewport-фильтров и без пропуска редактора. Лог: `/tmp/rollapp-health-comprehensive-final.log`. Новый JSON: `/var/folders/56/y9x0qcp95zs6ctldh56fs6qh0000gq/T/rollapp-check-1792524381396.json`. Прогон впоследствии завершился failed на календаре; детали следующего раздела. Исходники приложения оставались заморожены на время прогона. Дополнительные отдельно запущенные form-pages/catalog-page/wish-groups/drawers/contacts первого расследования не заменяют этот новый единый аудит.

Фиксация исходников повторного прогона: commit `95223417bdd06683875ef7cf273ecab599270779`, dirty=true. SHA-256 совокупности 707 runtime/test/config файлов (src/shared/server/scripts, package/config и AGENTS, без документации): `92170a84ee72e9a075832240f0825f2d1626a81f7f99409bf2ca80e341162962`, зафиксирован 2026-10-20T19:29:27Z. Перед финальным завершением этот fingerprint будет пересверен. JSON: `/tmp/rollapp-health-final-source-fingerprint.json`.


## Повторная диагностика календаря

Второй полный аудит (`rollapp-check-1792524381396.json`) завершился exit 1 на test:calendar, 390×900: ожидание пятой записи после подтверждения удаления истекло. Unit/UI/controls/details/dates до него passed; остальные стадии не пройдены. Исходный первый аудит ранее полностью прошёл эту матрицу. Причина единичного timeout не установлена; исправление продуктового удаления на этом основании не заявляется.

В calendar smoke добавлено сохранение фактических writes, ошибок и screenshot при timeout; строгие assertions и 90-секундный timeout не ослаблены. Фиксированный порт с silent fallback заменён существующим atomic loopback helper; явный CALENDAR_TEST_PORT теперь fail-closed при конфликте. Targeted диагностический прогон 390×900/400 passed (`/tmp/rollapp-calendar-diagnostic.log`), это не полная матрица.

Третий полный аудит запущен без фильтров на статичном состоянии: `/tmp/rollapp-health-comprehensive-verified.log`, JSON `/var/folders/56/y9x0qcp95zs6ctldh56fs6qh0000gq/T/rollapp-check-1792524802956.json`. Fingerprint707 runtime/test/config файлов: `177eb81cd716c4c6adc886b86ea62fb94b9f90ad0ea424ccddfc6dd557597a3a` (commit прежний, dirty=true), `/tmp/rollapp-health-verified-source-fingerprint.json`. Прогон завершился failed на test:drag-drop; детали ниже.


## Итог третьего полного аудита и границы проверки

Третий `check:comprehensive` завершился exit 1 в 2026-10-20T20:48:31Z. Внутри release полностью passed unit/UI/controls/details/dates/calendar/form-actions, полный text-edit (409 PASS records) и Kanban. Drag-and-Drop остановился на 820px в Wishlist failure/reorder case: `locator.boundingBox` не дождался `.wishes-page > .wish-grid [data-group-wish-id="w0"]` (scripts/drag-drop-smoke.mjs:95). Этот сценарий не менялся в задаче; первый полный release ранее его прошёл. Причина этого сбоя не установлена, исправление Wishlist не заявляется. Последующие стадии третьего JSON имеют not-run. Ни один из трёх общих прогонов не объявляется comprehensive-pass, и результаты разных snapshots не складываются в такой результат.

Отдельный ранее запущенный полный набор `test:form-pages && test:catalog-page && test:wish-groups && test:drawers && test:contacts` завершился exit 0. Это самостоятельное дополнительное свидетельство, не продолжение упавшего JSON.

Изменение трекеров готово; остаётся ограничение общего аудита вне изменённых представлений. Для финального состояния отдельно повторяются полные test:health, test:todo и build. Новые исправления в несвязанный Wishlist без установленной причины не вносятся. Production UI не публиковался, чужие данные и настройки не изменялись. Keepalive PID64790 оставлен работающим; status подтвердил API/frontend готовы.


Финальный контроль завершился exit 0: полная матрица `npm run test:health` (18 tracker/viewport cases и midnight), полная `npm run test:todo` (включая native double-submit и canonical related references), `npm run build`. Логи: `/tmp/rollapp-health-final-verification.log`, `/tmp/rollapp-todo-final-verification.log`, `/tmp/rollapp-health-final-verification-build.log`. Build сохраняет предупреждение о chunks >500kB. `git diff --check` passed. Финальная сверка707 runtime/test/config файлов подтвердила неизменный SHA-256 `177eb81cd716c4c6adc886b86ea62fb94b9f90ad0ea424ccddfc6dd557597a3a`; проверена та же dirty-версия commit95223417bdd06683875ef7cf273ecab599270779. Полный comprehensive-pass не заявляется из-за описанного сбоя Wishlist.
