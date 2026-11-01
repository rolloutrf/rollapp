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
