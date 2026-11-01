# Мессенджер — проверка 1 ноября 2026

## Снимок

База checkout: `f55cce47e5718bc411f39cfc9436930deb152f23`, detached HEAD.
Исходный `git status --short` был пуст; проверяются незакоммиченные изменения
мессенджера, документации и совместимых исправлений зависимостей.
Production frontend не развёртывался.

## Реализация

Личные диалоги, поиск публичных профилей участников, текст до 4000 символов,
история по 50 записей, последовательная догрузка новых записей, непрочитанные,
черновики при переходах, idempotent retry, защищённые membership/read endpoints.
Кнопка 48px расположена на 8px выше кнопки планирования в общем ControlBar.
На desktop две панели; mobile отдельные список/чат с VisualViewport-композером.
Не добавлены групповые чаты, файлы, push или presence.

## Production PostgreSQL

Read-only preflight: `node scripts/migrate-messenger.mjs` подтвердил БД
`rollapp`, роль `rollapp_app`, `users`; все три таблицы отсутствовали.
После отдельного явного разрешения пользователя выполнено:
`node scripts/migrate-messenger.mjs --apply --database=rollapp` — PASS.
Повторный read-only preflight нашёл все три таблицы. Обычный startup/deployment
сохранён в verify-режиме; новая схема не подключена к автоматическим миграциям.

`npm run test:messenger:production` — PASS: реальный PostgreSQL, временные
три пользователя/диалоги/сообщения внутри BEGIN → ROLLBACK. Проверены reverse
pair uniqueness, двусторонняя доставка, public-only search, чужой доступ 404,
read/unread и чужие/future cursors, before/after, pagination, idempotency/conflict.
После ROLLBACK проверено отсутствие временных пользователей.

Живой UI с существующей сессией: `/app/messenger` загрузил пустой список,
поиск вернул реального зарегистрированного участника. Диалог не создавался,
реальные сообщения/уведомления не отправлялись. Поиск очищен.

## Выполненные проверки

- `npm test`: 798 tests, 797 PASS, 1 штатный SKIP, 0 FAIL (после исправления cursor guard).
- `npm run test:ui`: PASS, upstream shadcn primitives не изменены.
- `npm run test:messenger`: полная 9-viewport матрица, итог ниже.
- `npm run build`: PASS; остаётся обычное предупреждение о крупных chunks.
- `npm run check:comprehensive`: запущен полный набор без фильтров; итог ниже.
- `git diff --check`: PASS, финальный просмотр diff выполняется перед завершением.

Новый UI smoke использует реальный AppShell/GlobalAppChrome/PlanningFab и только
явный presentation transport; реальные API запрещены. Ширины
320/390/768/820/1024/1440/1920, дополнительно 390×400 и 1440×400. Проверяются
иконка над планированием, поиск/пустой результат, открытие/Back, pagination,
неоднозначный failed send/retry с одним UUID и без дубля, черновик, literal HTML,
Ctrl+Enter/native focus, error/retry истории, 48px/20px/24px/18px/28px,
overflow и composer в эмулированном panned viewport. Это не реальное iOS/IME.
Скриншоты: `/tmp/rollapp-messenger-<width>-<height>.png`.

## Исправленные находки

- Неверный history cursor мог бросить BigInt exception до ответа 400:
  refine сначала проверяет формат; unit и production integration покрывают отказ.
- Первоначальная проверка literal text совпадала с содержимым textarea:
  smoke теперь ждёт именно сохранённый message paragraph и очистку draft.
  Retry assertion также ограничен историей: совпадающий preview в sidebar
  больше не считается вторым сообщением при срабатывании фонового polling.
- Позднее успешное завершение отправки вне чата сохраняет client UUID для
  восстановленного черновика: повтор после возврата не создаёт дубль. Этот
  сценарий добавлен в каждую из девяти viewport-проверок.
- Keyboard send ждёт загрузки истории; composer использует readOnly при send,
  сохраняет native focus и блокирует повторный submit отдельным lock.
- API-порт 8187 принадлежал другой checkout (`38c7`), поэтому health там
  не доказывал готовность этой версии. Её процессы не завершались. Текущий
  persistent service использует свободные API 18277/frontend 15277; оба listener
  проверены по cwd этой checkout. .env остаётся ignored, secrets не записаны в отчёт.
- Первый comprehensive остановлен до окончания при обновлении зависимостей;
  не считается успешным. Повторный полный прогон записан отдельно.

## Зависимости

`npm audit` и `npm audit --omit=dev` выполнены до/после `npm audit fix`.
Совместимые изменения сохранены в lockfile: Vite 8.3.5, Zod 4.6.7,
body-parser 2.4.0 и сопутствующие транзитивные обновления; shadcn остаётся devDependency.
Итог: runtime 0 advisories; все зависимости 6 (2 low, 4 moderate), только dev.
Остались цепочки shadcn → deepmerge и ts-morph → minimatch 10.x.
Повторный `npm audit fix` не устранил их; major override/откат shadcn не применялся.

Первичные advisory references:
[body-parser](https://github.com/advisories/GHSA-27r3-jxmh-p828),
[Zod](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5),
[Vite](https://github.com/advisories/GHSA-9jrq-w75r-8gcw),
[deepmerge](https://github.com/advisories/GHSA-gcqx-w48m-w2h4).

## Итог полного набора

`npm run check:comprehensive` — FAIL в `check:release` на `test:text-edit`:
после 102 editor PASS records навигация `page.goto` в insertion ownership
при 820×844 не завершила `load` за 30s. Диагностика не содержит assertion
или browser pageerror; содержит незавершённые module requests. Это не PASS
полной editor-матрицы или общего аудита. Оставшиеся стадии comprehensive
не запускались; их нельзя суммировать с отдельными диагностиками в полный PASS.

Отдельная `node scripts/text-edit-smoke.mjs --insert-ownership-only`
диагностика — **PASS 8/8**, включая исходный 820×844. Это проверка данного
сценария, а не замена полного редактора/comprehensive. Обновлённый messenger smoke отдельно прошёл
**9/9 на новом холодном кэше** `node_modules/.vite-messenger-cold3-20261101`:
никаких повторных document requests, browser/API errors или пропуска assertions.

При разработке нового smoke исправлены его собственные prebundle/observer
ошибки: явный shared Base UI inventory и `sonner` предотвращают позднюю
пересборку; document guard считает navigation requests, а не SPA history events.
Первоначальные отказы сохранены в `/tmp/rollapp-messenger-smoke-*.log` и не
выдаются за результат приложения. Discovery и прежние timeouts сохранены.


## Финальная сверка

`npm run test:navigation` — PASS полной матрицы; `npm run test:action-rails` —
PASS полной матрицы. `npm run test:ui`, `npm test` (797 PASS/1 SKIP),
`npm run build` повторены на финальном коде — PASS.
`git diff --check` — PASS, итоговый diff и новые файлы просмотрены.
Финальные SHA256 исходников сохранены в соседнем JSON.

Поздняя повторная попытка открыть прежнюю вкладку IAB получила
ERR_EMPTY_RESPONSE, после чего URL policy заблокировала операции с её data: error
page. Это отдельное ограничение повторной live-проверки; прежний authenticated
live search был успешным. HTTP-проверка финального frontend возвращает 200,
production API health — ok; keepalive — ready, оба процесса принадлежат этой
checkout. Сервис оставлен работающим, финальный preview:
`http://127.0.0.1:15277/app/messenger`.

Полный release/comprehensive остаётся **неуспешным/незавершённым** из-за
описанного таймаута. До production deployment нужен новый полный зелёный
прогон; отдельные 8 insertion PASS не закрывают остальные editor cases.
Реальные устройства/iOS keyboard/IME и публичный rollout не проверены.
