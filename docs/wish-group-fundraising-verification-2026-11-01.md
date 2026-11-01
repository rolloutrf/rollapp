# Проверка сборов роллов — 2026-11-01

Базовый commit: `f55cce47e5718bc411f39cfc9436930deb152f23`.
Перед работой дерево было чистым; проверена рабочая копия с dirty-изменениями
этой задачи до создания коммита. Node `v22.22.3`.

## Результат реализации

В группе товаров владелец открывает сбор с явной целью в роллах, меняет цель,
приостанавливает/возобновляет приём. Участники подтверждают взнос из кошелька;
сумма, прогресс и число уникальных участников показываются над товарами.
Сервер сохраняет атомарный перевод в существующем ledger и отдельную связь
со сбором. Достижение цели останавливает приём, UUID защищает от повторного
списания. Взнос сразу зачисляется владельцу; возврата/конвертации в деньги нет.
Расформирование сохраняет финансовую историю и объясняет это в подтверждении.
Контракт: [wish-group-fundraising.md](wish-group-fundraising.md).

## Production и данные

Использована настроенная production-база `rollapp`, роль `rollapp_app`, direct
TLS. Конфигурация взята из основного checkout в игнорируемые `.env/.env.local`,
без вывода секретов. Для этой рабочей копии выбраны свободные порты 8085/5175.
`npm run dev:keepalive` оставлен включённым; startup подтвердил существующую
схему в `verify` без общей миграции/очистки данных.

Первое read-only обращение обнаружило отсутствие таблиц сборов. После отдельного
явного разрешения пользователя выполнен только
`node scripts/wish-group-fundraising-database.mjs --apply`: две таблицы и один
индекс из подготовленного DDL. База/роль проверены по конфигурации. Повторный
запуск без `--apply` подтвердил колонки в READ ONLY транзакции.

`npm run test:fundraising:production`: 6/6 проверок прошли. Использована
существующая схема, без DDL/initializeDatabase. Тестовые users/lists/wishes/groups,
кошельки, переводы и взносы находились внутри BEGIN → ROLLBACK. Последующее
read-only чтение подтвердило 0 пользователей `@fundraising.invalid` и 0 строк
в обеих новых таблицах. Пользовательские записи и остатки не изменялись.

Проверены owner-only создание/изменение, повтор создания, product-space guard,
обычный ledger, сохранение общей суммы кошельков, повтор UUID и конфликт суммы,
недостаток средств, остаток до цели, self-transfer, закрытый сбор, повтор после
закрытия, лимит получателя с откатом списания, запрет подмены получателя,
private/followers/link и скрытые товары, завершение и сохранение
журнала после удаления группы. HTTP harness использует настоящий PostgreSQL;
авторизация harness задаёт только временные тестовые identity, а проверка
видимости отдельного wish — локальный callback. Настоящий session middleware
и все сложные сочетания privacy этим harness не доказываются.

## UI и команды

| Проверка | Результат |
| --- | --- |
| `npm test` | 791 passed, 1 skipped; 792 всего, без БД |
| `npm run test:ui` | 37 primitives, 80 JSX sources; passed |
| `npm run test:controls` | Полная матрица; passed |
| `npm run test:form-actions` | Полная матрица и StrictMode; passed |
| `npm run test:action-rails` | Полная матрица; passed |
| `npm run test:drag-drop` | Полная матрица; passed |
| `npm run test:wish-groups` | Названия owner/read-only и сборы на восьми размерах; passed |
| `node scripts/wish-group-fundraising-smoke.mjs` | Финальные guards хранения, позднего отказа, 24px gaps; passed |
| `npm run build` | Passed; существующее предупреждение о крупных chunks |
| `node /tmp/rollapp-fundraising-live-review.mjs` | Восемь размеров, production API, только GET; passed |
| `npm run check:comprehensive` | Две незавершённые попытки: browser network error и local page timeout; не считается passed |

Component fixture: 320, 390, 767, 768, 820×450, 1024, 1440, 1920;
mobile DPR 3. HTTP API запрещён; локальный UI transport моделирует состояния,
не подменяя БД. Проверены создание/изменение/пауза, ограничения суммы,
подтверждение/отмена, потерянный ответ, восстановление после reload с прежним
UUID, недоступное sessionStorage и поздний 404 после неизвестного результата,
guest/closed/completed/error/hidden, 18/28 body, pill actions от 48px,
root/descendant bounds, ровно 24px между блоками, последний товар при scroll.
Скриншоты реально просмотрены на 390 и 1440; сохранены для всех размеров в
`/tmp/rollapp-fundraising-*.png`.

Живой read-only проход использует существующую публичную группу через локальный
API с production PostgreSQL. Все не-GET запросы запрещены. На восьми размерах
проверены пустой сбор, отсутствие owner actions у гостя, API 200, header 48px,
24px gap, root/dialog overflow и достижимость хвоста. Скриншоты:
`/tmp/rollapp-fundraising-live-*.png`; результат:
`/tmp/rollapp-fundraising-live-review.json`. Существующая авторизованная сессия
пользователя и создание настоящего сбора через браузер не использовались.

## Исправленные находки

Первый comprehensive остановился после 26 минут в image-layout 390×400:
Chromium `ERR_NETWORK_IO_SUSPENDED`, затем ошибка загрузки локального
`text-chrome-frame.jsx` / `contact-meeting-notes.jsx`. Assertions не менялись.
Результат сохранён в
`wish-group-fundraising-comprehensive-attempt1-2026-11-01.json`; лог —
`/tmp/rollapp-fundraising-comprehensive.log`.
`caffeinate -i node scripts/text-edit-smoke.mjs --image-layout-only` прошёл всю
восьмиразмерную diagnostic-матрицу без изменения runtime/проверок. Это не
подменяет полный прогон. Полный retry с `caffeinate -i`, привязанным только к
процессу проверки, снова остановился: `test:controls`, Career 320px,
`page.goto` timeout 90000ms на локальном fixture URL. Unit/UI этапы прошли,
но control matrix и последующие этапы этого запуска не завершены. Сохранены
`wish-group-fundraising-comprehensive-attempt2-2026-11-01.json` и лог
`/tmp/rollapp-fundraising-comprehensive-retry.log`. Настройки Mac постоянно не
менялись. Причина тайм-аута не доказана; предыдущий отдельный полный
`test:controls` прошёл. Assertions/runtime общих тестов не ослаблялись,
этот результат не выдаётся за полную регрессию или готовый production rollout.

- Upstream `gap-4` у Dialog перекрывал продуктовый gap: композиция группы теперь
  задаёт 24px в общем spacing-слое, siblings не добавляют собственные margins.
  Проверка учитывает sticky-header при прокрутке короткого экрана.
- До отправки взноса сохраняются UUID/сумма; отказ хранилища блокирует запрос.
  Поздний отказ доступа/сессии после неизвестного результата сохраняет UUID,
  чтобы следующая попытка не стала новым платежом.
- Закрывающееся подтверждение сохраняет сумму до следующего открытия;
  screenshots ждут окончания upstream exit animation.
- При обновлении dev-сервиса возникла гонка после launchd bootout: PID-файл
  не удалялся вручную. После завершения собственного процесса его lifecycle
  убрал файл; повторный штатный запуск восстановил сервис. Новый PID 44592,
  API/frontend healthy, строка verify в журнале присутствует.

## Зависимости

До совместимых исправлений: `npm audit` — 11 (4 high),
`npm audit --omit=dev` — 3 high. Выполнен `npm audit fix --ignore-scripts --no-fund`
без force. Lockfile обновлён, включая Vite 8.3.5, Zod 4.6.7, body-parser 2.4.0;
shadcn остаётся devDependency.

После исправлений production audit — 0 (exit 0); полный audit — 6 dev-only
(2 low, 4 moderate), цепочки shadcn → deepmerge и ts-morph → minimatch.
Полный audit и audit fix завершаются exit 1 из-за этих оставшихся предупреждений.
Первичный advisory minimatch указывает исправление в следующей major 11.0.1;
текущая транзитивная зависимость требует `^10.0.1`.
[Advisory проекта](https://github.com/isaacs/minimatch/security/advisories/GHSA-g3hv-75wg-m249).
Для deepmerge проверены [исходное сообщение в проекте](https://github.com/TehShrike/deepmerge/issues/273)
и [reviewed advisory](https://github.com/advisories/GHSA-gcqx-w48m-w2h4), где
исправленная версия не указана. Предлагаемый npm downgrade shadcn до 1.0.0
несовместим; он не применялся. Эти предупреждения не выдаются за нулевой audit.

## Границы проверки

Нет проверки настоящей мобильной клавиатуры/IME, двух параллельных плательщиков
в отдельных commit-транзакциях, бизнес-доступа во всех privacy-композициях,
внешних платежей/возвратов и реального пользовательского сохранения через UI.
Production-схема добавлена с разрешения; в рамках этой задачи публикация
приложения и exact-SHA rollout не выполнялись.
Полный release/comprehensive остаётся непроверенным: обе попытки прерваны,
расширенные этапы после release в этих запусках не выполнялись. Отдельные
успешные матрицы выше не подменяют этот результат. Новая интеграционная
проверка повторена с lock timeout 5s и statement timeout 15s: 6/6 passed,
все записи откатываются.

## Отправка изменений

После проверки пользователь явно запросил отправить все изменения без полной
проверки. Первая попытка push от старой базы остановлена repository pre-push
guard из-за личных файлов в унаследованной истории. Проверки не обходились.

В свежей очищенной `origin/main` (`26bf8aa3e44d239f136ce6a6566689f7686c37fc`)
код, тесты и исходные отчёты этой рабочей копии уже сохранены коммитом
`fe6663c` общей консолидации. Новые модули сборов совпадают с рабочей копией.
Сохранены текущие общие изменения и явно закреплённый в main Vite 8.1.6;
старый lockfile с широким обновлением Vite не накладывался поверх новой базы.

Ветка `codex/wish-group-fundraising-20261101` создана от очищенной main и
добавляет это уточнение отчёта. Старая история не переносится. Полный прогон
повторно не запускается; обе незавершённые попытки и ограничения проверки
сохранены выше.
