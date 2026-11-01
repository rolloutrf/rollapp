# Объединение рабочих копий — 1 ноября 2026

База: origin/main `9551ed2`. Все исходные рабочие копии сохранены без изменений.
Dirty-копии дополнительно сохранены локальными ветками `codex/snapshot-all-20261101-*`;
они содержат старую историю и не предназначены для push. Новые изменения перенесены
отдельными коммитами поверх очищенного main, без merge старой истории.

## Состав

- cc34: библиотека заметок shadcn с шаблонами (3b98878).
- 8c91: сборы роллов в товарных группах Wishlist, API/UI и тесты.
- fb72: Stories в разделе друзей, FFmpeg в runtime/CI, переход к профилю.
- 6a23: реализация уже включена в production; сохранены дополнительные отчёты.
- main-copy, cf99, d33e: изменения уже включены в production и развиты последующими релизами. Старые варианты не заменяют текущие guard/композиции/приватное хранение.
- 57d0, c2bd: оставшиеся изменения относятся к историческим отчётам; новые функции отсутствуют.
- Остальные чистые копии: прошлые релизы/снимки, уже включённые в актуальный main.

## Инвентаризация

| Рабочая копия | Dirty tracked | Untracked |
| --- | ---: | ---: |
| `/Users/mokoloskov/Desktop/Git/rollout/rollapp` | 22 | 22 |
| `/private/tmp/rollapp-personal-offers-release-20261101` | 0 | 0 |
| `/Users/mokoloskov/.codex/worktrees/04c7/rollapp` | 0 | 0 |
| `/Users/mokoloskov/.codex/worktrees/1931/rollapp` | 0 | 0 |
| `/Users/mokoloskov/.codex/worktrees/539f/rollapp` | 0 | 0 |
| `/Users/mokoloskov/.codex/worktrees/57d0/rollapp` | 0 | 1 |
| `/Users/mokoloskov/.codex/worktrees/5b7f/rollapp` | 0 | 0 |
| `/Users/mokoloskov/.codex/worktrees/64e9/rollapp` | 0 | 0 |
| `/Users/mokoloskov/.codex/worktrees/6a23/rollapp` | 24 | 4 |
| `/Users/mokoloskov/.codex/worktrees/7afb/rollapp` | 0 | 0 |
| `/Users/mokoloskov/.codex/worktrees/8c91/rollapp` | 9 | 12 |
| `/Users/mokoloskov/.codex/worktrees/c2bd/rollapp` | 10 | 1 |
| `/Users/mokoloskov/.codex/worktrees/cc34/rollapp` | 0 | 0 |
| `/Users/mokoloskov/.codex/worktrees/cf99/rollapp` | 10 | 14 |
| `/Users/mokoloskov/.codex/worktrees/d33e/rollapp` | 2 | 2 |
| `/Users/mokoloskov/.codex/worktrees/fb72/rollapp` | 16 | 18 |
| `/Users/mokoloskov/.codex/worktrees/fe47/rollapp` | 0 | 0 |
| `/Users/mokoloskov/.codex/worktrees/production-all-20261031/rollapp` | 0 | 0 |

## Проверка перед выпуском

Unit предварительно: 911 всего, 910 passed, 1 skipped, 0 failed. Shadcn: passed.
Production direct TLS, rollapp/rollapp_app: существующая схема сборов проверена read-only.
Preview 8184/5276 включён через keepalive, startup verify; миграции не запускались.
Startup дополнительно проверяет Stories и обе таблицы сборов SELECT LIMIT 0, READ ONLY.
npm audit: 8 замечаний в dev graph (2 low, 4 moderate, 2 high), production audit: 0.
Совместимый npm audit fix выполнен; lockfile не изменился, несовместимые исправления не применялись.

Полная матрица и итог rollout будут записаны после выполнения; на этом этапе выпуск не подтверждён.

## Уточнение объёма проверок и найденные проблемы

Первый локальный comprehensive на чистом `a6485ef8c677254a64b354ba04d0f582fab4522c` остановился в slash-матрице на `page.goto` timeout 30s. Отдельный `--slash-only` прошёл все восемь размеров с exit 0 без изменения runtime или assertions. Причина первого тайм-аута не установлена; полный локальный прогон не объявляется успешным. JSON сохранён рядом.

Первый CI run `41332822232` прошёл полный редактор, заметки и Kanban, затем остановился в drag/drop на противоречивом ожидании: одна проверка запрещала reorder при быстром drop в центр группы, тогда как отдельная двухплиточная матрица требовала его. Runtime оставлен без изменений. Проверка теперь требует точный единственный reorder с сохранением всех id для быстрого drop и точный membership-запрос без reorder для подтверждённого объединения; оба результата проверяются после canonical reload. Локально весь 320px drag/drop, включая touch и stateful-сценарии, прошёл; последующий широкий прогон остановлен по указанию пользователя, это не полная drag/drop матрица.

Stories: исправлен непереносимый hardcoded macOS Chrome path в smoke; используется общий browser runtime. Выделен независимый Vite cache и prebundle всех фактически догружавшихся зависимостей. Холодная первая попытка явно показала late optimization/reload; после добавления найденных зависимостей новая холодная матрица прошла. Runtime Stories не менялся. Предыдущий отдельный тайм-аут закрытия не выдаётся за доказанный дефект приложения.

Пользователь явно потребовал только проверки нужных функций и отменил повтор полного набора. Дальнейшая проверка ограничена Notes, Stories и fundraiser, затем build и deployment preflight. CI будет запущен вручную с `verification=none`, поскольку целевые проверки выполняются локально. Это не утверждение о полном comprehensive PASS.

Notes: восемь viewport cases прошли (`npm run test:notes`). Stories: 49 friends-only route transitions и 16 camera/preview/retry/MP4/geometry cases прошли на новом холодном кэше. Тесты запрещают реальные API и используют явно заданный test transport; реальные production записи/камеры/публикации не выполнялись.

Production rollback fundraising: 6/6 passed; existing-schema preflight: rollapp/rollapp_app, verify, migration callback запрещён, passed. Сервис keepalive PID 79822 остаётся готовым, frontend 5276/API 8184. Последний release gate не меняет схему и не запускает DDL.

Непроверенные случаи: реальные мобильные устройства/IME/разрешения камеры, фактическая публикация видео, параллельные финансовые commit-транзакции. Полный audit приложения остаётся неполным и не подменяется суммой частичных PASS.

Финальная целевая цепочка: `STORIES_CACHE_DIR=/tmp/rollapp-consolidation-20261101/stories-cold-cache-2 npm run test:stories && node scripts/wish-group-fundraising-smoke.mjs && npm run build` — exit 0. Stories: 49 переходов + 16 cases; fundraiser: все 8 viewport cases 320/390/767/768/820/1024/1440/1920. Build passed (только существующее предупреждение о крупных chunks). Прогон выполнялся на runtime-коде a6485ef с dirty test/doc-only исправлениями, включёнными в следующий release commit; приложение после a6485ef не менялось.
