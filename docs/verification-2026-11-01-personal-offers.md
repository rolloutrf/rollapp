# Персональные офферы бизнеса — 1 ноября 2026

Проверяемый HEAD: `f55cce47e5718bc411f39cfc9436930deb152f23`.
Начальное рабочее дерево чистое. Проверяется незакоммиченный diff этой задачи;
это не проверка опубликованного SHA. Изменения не опубликованы.

## Реализовано

- Свои товары/услуги бизнеса: создание позиции, выбор получателя, цена в роллах
  и срок 1–720 часов; стандартные варианты срока в UI.
- Персональный счёт в кошельке обеих сторон. Серверная изоляция получателя,
  неизменяемая цена/название, идемпотентное создание и оплата.
- Атомарный перевод от покупателя бизнесу + заказ; истечение до/после ожидания
  кошельков, откат при недостатке средств/лимите, запрет неверного возврата.
- Отдельный проверяемый schema rollout; обычная инициализация production
  остаётся `verify`, без запуска миграций и backfill.

## Результаты

| Команда | Результат |
| --- | --- |
| `npm ci` | Успешно |
| `npm test` на финальном коде | 800 тестов: 799 pass, 1 штатный skip, 0 fail |
| `node --test server/personal-offers.test.js` | 10 pass, 0 fail |
| `npm run test:offers` | Все 8 viewport: 320×844, 390×844, 768×844, 820×844, 1024×844, 1440×900, 1920×1080, 390×400 |
| `npm run test:ui` | Успешно, 37 primitives / 80 application JSX sources |
| `npm run build` | Успешно; существующее предупреждение о размере chunks |
| `git diff --check` | Успешно |
| `npm audit` после совместимых обновлений | 6 dev-only: 2 low / 4 moderate; high/critical 0 |
| `npm audit --omit=dev` | 0 vulnerabilities |
| `node scripts/personal-offers-schema.mjs --check` до миграции | Read-only: target `rollapp` / `rollapp_app`, таблица офферов отсутствует |
| `npm run test:offers:production` до миграции | Остановился на SELECT отсутствующей таблицы (42P01), до тестовых записей; ROLLBACK выполнен |
| Разрешённая миграция `--apply rollapp rollapp_app` | Успешно, только новая таблица/индекс |
| `npm run test:offers:production` после миграции | 5 pass, 0 fail, общий ROLLBACK |
| Настоящий `initializeRuntimeDatabase` в режиме verify после миграции | Успешно, READ ONLY, migrations callback запрещён |
| Read-only контроль остатков теста | `offers=0`, `test_items=0` |
| `node --test server/database-startup.test.js server/personal-offers.test.js` | 16 pass, 0 fail |
| `npm run check:comprehensive` | Завершился с exit 1 на `test:text-edit`: timeout в проверке двух Undo после вставки блока, `scripts/text-edit-smoke.mjs:218`, 768px. Остальные этапы после этой точки не выполнены; полный green не подтверждён |
| `node scripts/text-edit-smoke.mjs --surface-only` | Все 8 основных viewport прошли; затем отдельный timeout page.goto на readonly/toggleHeading, строка 550, empty root и незавершённые module requests. Assertions/timeout не менялись |
| Повтор полного `check:comprehensive` | Exit 1 на `test:controls`, screenshot timeout 90s в `paintedHeight`, 820px; fonts loaded. До редактора повтор не дошёл |
| Третий `check:comprehensive` | Остановлен по явному требованию пользователя. До остановки check:release, navigation и action-rails прошли; identity-reports прерван; остальные дополнительные этапы не запускались |

Полный JSON: `/tmp/rollapp-personal-offers-comprehensive.json`.
Лог: `/tmp/rollapp-personal-offers-comprehensive.log`.
Новый UI smoke и screenshots: `/tmp/rollapp-personal-offers-ui/`.

UI fixture использует только локальные props/client responses для проверки
представления. Все настоящие `/api/` запросы запрещены, БД не подменяется.
Проверены создание своей позиции, retry с тем же ключом, создание счёта,
отмена подтверждения без запроса, ошибка баланса и повтор, paid/expired/seller,
loading/error/empty, русские подписи Select, форма при коротком viewport,
границы подтверждения внутри viewport, 48px/радиусы ControlBar и 24px padding PageActionButton, root overflow.
Дополнительно проверены настоящие BusinessAccessPage и RollsWallet с их
провайдерами на всех восьми viewport: выбор собственной позиции, ввод цены,
подтверждение/отмена и сохранение баланса над счетами. Проверяются 24px page-stack
и вычисленный h2 30px внутри настоящего кошелька.
Просмотрены скриншоты мобильного/десктопного UI. При визуальном review исправлены
отображение внутренних значений Select вместо русских подписей и общий
семантический масштаб заголовков через typeset. У кошелька убраны взаимно
погашающие внешние typeset/not-typeset обёртки: он остаётся rollapp-body,
а содержательные заголовки нового блока используют свой общий typeset preset. Ошибка оплаты сохраняется
в подтверждении, а не исчезает после обновления списка.

## Production и ограничения

Найдена существующая конфигурация основного checkout; её ignored env-файлы
подключены к текущему worktree без вывода секретов. Прямой TLS PostgreSQL.
Проверены точные database/role и наличие базовых таблиц. Read-only агрегат
подтвердил отсутствие активных товаров бизнеса: поэтому добавлена UI-возможность
создать собственную позицию, без сохранения реальных товаров агентом.

Постоянный dev-service готов на `http://127.0.0.1:5378/login`, API 8287;
keepalive включён, сервис оставлен запущенным. Выполнен живой просмотр login.
Нет авторизованной бизнес/клиентской сессии в отдельном браузере; живой полный
сценарий двух ролей пока не проверен. Cookies между origin не переносились.

Пользователь отдельно разрешил создание таблицы и проверки. Миграция применена
к подтверждённой production-базе, после чего rollback-тесты прошли. Пользовательские
офферы и оплаты не создавались; временные тестовые данные полностью откатились. Настоящая поставка товара, возврат от бизнеса, уведомления вне
приложения и конкурентные платежи независимыми DB-соединениями не проверены.
Счета доступны страницами по 100 с загрузкой следующих и явным обновлением.
Проверено 102 записи в production rollback-тесте, точный стабильный порядок
при одинаковом created_at, обе страницы без потерь и изоляция пользователя.
UI проверяет перекрывающиеся страницы без дубликатов, оплату раннего счёта
с сохранением списка и возврат к свежей странице. Складские остатки не резервируются.

Принудительное несовместимое понижение shadcn для очистки dev audit не применялось.

Код редактора и его Tiptap/ProseMirror зависимости этой задачей не изменялись.
Первый полный прогон сохранил FAILED JSON; диагностический успех отдельного
сценария не заменяет полный прогон и не скрывает исходный отказ.

Повтор полного прогона: `/tmp/rollapp-personal-offers-comprehensive-retry.json`
и `/tmp/rollapp-personal-offers-comprehensive-retry.log`. Исходный FAILED сохранён.

Третий полный прогон: `/tmp/rollapp-personal-offers-comprehensive-final.json`
и `/tmp/rollapp-personal-offers-comprehensive-final.log`. Параллельные процессы
других worktrees не останавливались и не изменялись. Их отсутствие перед
третьим запуском проверено по живому process inventory.

HTTP lifecycle на существующем production PostgreSQL также проверен внутри
общего ROLLBACK: JSON create 201/retry 200 с тем же id, роль бизнеса 403,
self-offer 400, чужая оплата 404, pay 201/retry 200 с прежним purchase id,
точные балансы 99/101 после счёта на 1 ролл, typed 409 для нехватки/истечения
и ровно один заказ. Каждый HTTP mutation использует отдельный savepoint
в общей тестовой транзакции. Реальная cookie-auth сессия этим не проверяется.
Изначальное ожидание 403 для personal/self запроса исправлено на отдельные
сценарии: self validation корректно отвечает 400 ещё до проверки роли.

После расширенных HTTP-тестов выполнен независимый READ ONLY контроль:
`fixture_users=0`, `offers=0`. На настоящем dev API 8287 проверены
анонимные GET /personal-offers, GET /personal-offers/items и POST create/pay:
все 401. Запросы без cookie не создавали счёт и не проводили оплату.

## Аудит требований механики

| Требование | Авторитетное подтверждение | Состояние |
| --- | --- | --- |
| Бизнес выбирает собственный товар/услугу | `createPersonalOfferItem` / `createPersonalOffer`, ownership SQL; реальные BusinessAccessPage/карточка + browser smoke; HTTP personal seller 403 | Подтверждено |
| Назначается конкретный получатель | FK recipient_id, фильтр получателя при оплате и списке; production HTTP для buyer/seller/other и реальный dev API без cookie | Подтверждено |
| Указывается персональная цена в роллах | Strict schema, snapshot price_rolls; изменение каталога перед оплатой не меняет сумму; точные production balances/order | Подтверждено |
| Указывается время действия | durationHours 1–720, серверный clock_timestamp, фиксированное expires_at; повтор create не продлевает срок | Подтверждено |
| Формируется персональный платёжный счёт | Постоянная production-таблица создана по отдельному разрешению; create 201/retry 200 возвращают один id; обе стороны видят счёт | Подтверждено |
| Более старый действующий счёт доступен | Production 102 records / две страницы, стабильный UUID tie-break; UI loading/dedup/pay older/refetch на 8 viewport | Подтверждено |
| Использование счёта проводит транзакцию | Transfer + purchase + offer purchase_id в общем transaction callback; production function/HTTP проверки 201/200, balance/ledger/order | Подтверждено в rollback-проверках; настоящая пользовательская оплата не выполнялась |
| Повторный запрос не списывает деньги снова | Row lock и purchase_id, transfer idempotency; повтор pay возвращает прежний purchase, один заказ и неизменные балансы | Подтверждено последовательными запросами; независимые concurrent DB-соединения отдельно не проверялись |
| Неиспользованный счёт сгорает | Derived expired status, кнопка оплаты отсутствует; API 409 OFFER_EXPIRED и отсутствие изменения денег/заказов | Подтверждено |
| Production не подменяется и не мигрирует при reload | Read-only initializeRuntimeDatabase verify, точный target/role; dev keepalive оставлен запущенным | Подтверждено |
| Release и дополнительные проверки | check:release прошёл; полный comprehensive остановлен по требованию пользователя | Требование продолжать полный набор отозвано пользователем; comprehensive PASS не заявляется |

Цель разработки не включает незаказанную поставку/складскую резервацию товара,
внешние платёжные провайдеры или рассылку сообщений. Развёртывание кода на основном
сайте не выполнялось; действующая версия сайта сохранена.

Финальная проверка responsive edge case: имя из 80 кириллических символов
без пробелов и username из 32 w. В вариантах результата поиска и выбранного
получателя проверены scrollWidth/clientWidth и root overflow на всех 8 viewport.
В новом composer добавлены min-width:0 и штатный Tailwind wrap-anywhere;
одноразовые размеры шрифта, clipping и spacer nodes не добавлялись.
Расширенный `test:offers` выполнен после этой локальной правки; 8/8 pass.

## Оставшиеся предупреждения dev dependencies

После совместимых обновлений установлены shadcn 4.23.0 (dev),
@ts-morph/common 0.27.0 → minimatch 10.2.6 и deepmerge 4.3.1.
`npm ls --omit=dev minimatch deepmerge` возвращает empty: этих пакетов нет
в production dependency tree. Шесть audit-узлов относятся к двум исходным
advisories и их родительским dev-зависимостям, а не к шести разным дефектам.

[Advisory автора minimatch](https://github.com/isaacs/minimatch/security/advisories/GHSA-g3hv-75wg-m249)
указывает исправление в 11.0.1. У установленного @ts-morph/common declared range
`^10.0.1`, поэтому принудительный override на 11 не является совместимым
обновлением в рамках текущего dependency graph.

[Первичный отчёт deepmerge](https://github.com/TehShrike/deepmerge/issues/273)
описывает подмену прототипа возвращаемого merge-объекта;
[GitHub Reviewed advisory](https://github.com/advisories/GHSA-gcqx-w48m-w2h4)
указывает affected 4.2.0–4.3.1 и отсутствие patched version.
Предложенный audit downgrade shadcn до 1.0.0 не применялся, как требует AGENTS.md.
Новых зависимостей для офферов не добавлено; production audit остаётся 0.

## Итог по просьбе пользователя остановить полный набор

Пользователь явно отменил продолжение полного набора проверок. Контроллер
третьего comprehensive и только его 11 принадлежащих процессов завершены
SIGTERM; unified session подтвердила exit 143. Dev keepalive не затронут:
API/frontend готовы, PID 75188, production TLS подключение сохранено.

До остановки третий прогон полностью прошёл check:release (в том числе полный
text-edit, kanban, drag/drop и build), navigation и action-rails. Это доказано
переходами последовательного fail-fast runner к следующим этапам; identity-reports
прерван в Hogan navigation. Todo/form-pages/catalog/wish-groups/drawers/contacts
в этом comprehensive не выполнялись. Последние отдельные проверки офферов
и HTTP/SQL lifecycle пройдены; их результаты описаны выше.

JSON оказался пустым в момент SIGTERM во время записи. Статус остановки и
указанные переходы восстановлены из сохранённого лога с явным признаком
reconstructedFromLog. Итоговая копия: `docs/personal-offers-checks-2026-11-01.json`.
Полный comprehensive не выдаётся за успешно завершённый.

Разработка механики и отдельные проверки завершены. Изменения остаются в
рабочем дереве; код на основной сайт не развёрнут.
