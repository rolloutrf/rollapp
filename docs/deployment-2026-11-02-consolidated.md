# Общая выкладка рабочих копий — 2 ноября 2026

Runtime commit: `26bf8aa3e44d239f136ce6a6566689f7686c37fc`.
[Workflow 41349377686](https://github.com/rolloutrf/rollapp/actions/runs/41349377686) завершился success. Production health подтвердил `ok=true`, `service=rollapp` и точное совпадение полного SHA; контейнер на VM использует тот же immutable image. Выпуск выполнен из чистого commit.

Включены все новые функции из существующих рабочих копий: библиотека заметок с шаблонами, Stories в «Друзьях» и сборы роллов в товарных группах Wishlist. Прежние релизы сохранены, старая история с личными файлами не объединялась. Все исходные рабочие копии и локальные snapshots сохранены. Инвентаризация и предыдущие неуспешные попытки: [consolidation-2026-11-01.md](consolidation-2026-11-01.md).

По прямому указанию пользователя полный набор повторно не запускался. Ручной workflow использовал `verification=none`, после выполненных локально целевых проверок:

- `npm run test:notes`: 8 viewport cases passed.
- Stories на новом отдельном холодном Vite cache: 49 route transitions + 16 recording/viewer cases passed; исправлены portable Chrome path и late dependency optimization в smoke.
- `node scripts/wish-group-fundraising-smoke.mjs`: 8 viewport cases passed.
- `npm run build`: passed; существующее предупреждение о размере chunks.
- Production fundraising integration: 6/6 passed ранее в этой задаче, только BEGIN → ROLLBACK; existing-schema preflight прошёл в READ ONLY с запрещённой миграцией.

Предыдущие failed comprehensive результаты сохранены, не объявляются PASS и не складываются в полный аудит. В приложении не менялось поведение быстрого drag/drop: противоречивая старая проверка теперь строго проверяет отдельные запросы/order/reload быстрого переноса и подтверждённого объединения.

## Live review

В существующей авторизованной production-сессии просмотрены Notes, форма Stories и реальная товарная группа со сбором на 320/390/768/820/1024/1440/1920px и коротком mobile 390×400; 820px также проверен при высоте450. Root overflow отсутствует. Stories: все видимые действия48px, в пределах viewport, камера не включалась; каждая форма отменена Back/Close. В Wishlist Stories не отображаются. Fundraiser: owner empty state, реальные данные API, gap24px до сетки на всех размерах. Скриншоты мобильных/настольных вариантов просмотрены. Заметки/сборы не создавались, видео не публиковались, переводы и удаления не выполнялись. Временный viewport override сброшен.

## Эксплуатационные находки

После rollout живая загрузка сбора выявила PostgreSQL53300: общий лимит20 соединений роли был исчерпан постоянными preview-сервисами. Проверены точные production database/role и кластер `c9q73m0flac0ai0kj468` в folder `b1gebpfrhvkd43r38q98`; configured PGHOST соответствует кластеру. В launchd настроено29 dev-сервисов. На существующем кластере2vCPU/8GiB поднят только `rollapp_app.conn_limit` с20 до40. API before/after подтвердил единственное изменённое поле `conn_limit`; credentials, grants, permissions и timeout settings совпадают. Кластер и сервисы не останавливались; схема и пользовательские записи не изменялись. Повторная загрузка сбора прошла и все восемь live размеров проверены после изменения.

До pull VM имела6506893312 свободных bytes; после нового image —5183586304, ниже консервативного5GiB запаса. После проверки registry, всех контейнерных ссылок и пяти protected current/rollback images удалён только неиспользуемый локальный cache tag `05264a5796932d842a1d5f70b74da7dd5275c675`. Без force/prune, удаления контейнеров/volumes или registry images. Итог:6490714112 свободных bytes. Current26bf8aa, rollback597e064/322dac0 и дополнительные6dd0105/918285e сохранены. Ручных VM/container restart не было; rollout согласован штатным контроллером.

Production startup сохранил `ROLLAPP_DATABASE_INITIALIZATION=verify`; migrations/backfill/cleanup не выполнялись. Постоянный preview этой checkout оставлен включённым на8184/5276 с pool1.

`npm audit --omit=dev`:0; полный audit:8 dev-only замечаний (2low,4moderate,2high). Совместимый audit fix не изменил lockfile; несовместимые откаты не применялись. Реальные устройства/IME/камера, фактическая публикация видео и параллельные финансовые commit-транзакции не проверены. Это целевая проверка и успешно подтверждённый rollout, а не полный аудит приложения.
