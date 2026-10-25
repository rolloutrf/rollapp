# Выпуск собранных рабочих версий — 25 октября 2026

Production работает на `58d71a14b20a55ddbb14b8bc76b1de455f173d94`.
Подтверждено `/api/healthz` (`ok: true`, точный SHA) 25 октября в 20:35:17 МСК.
В существующей авторизованной сессии открыты реальные «Характер» и «Ценности»:
данные production API загружены, действия сохранения не выполнялись.

[PR #13](https://github.com/rolloutrf/rollapp/pull/13) объединён в main.
По прямому запросу «Заддеплой без тестирования» использован явный manual mode
`verification=none`; автоматические тесты и WebKit пропущены. Полные локальный
и веточный аудиты отменены, comprehensive PASS не заявляется. Результаты до отмены,
инвентаризация 21 рабочей копии и ограничения — в
[интеграционном отчёте](workspace-integration-2026-10-25.md).

[Workflow](https://github.com/rolloutrf/rollapp/actions/runs/40214821300) успешно
собрал/отправил immutable image и обновил точный Compose metadata. Его первый
health deadline завершился ошибкой: COI не мог распаковать новый образ на диске
19 GB с остатком 416 MB (`no space left on device`, 46 событий в просмотренном
журнале). Старая версия `315f3eb` продолжала отвечать.

Перед восстановлением подтверждены VM/folder/runtime-SA, metadata IAM endpoints,
точные image/APP_VERSION и `ROLLAPP_DATABASE_INITIALIZATION=verify`. Реальный
existing-schema check на `rollapp`/`rollapp_app` выполнен READ ONLY; DDL, миграции,
backfill и cleanup пользовательских данных не запускались.

Проверены все контейнеры, ссылки на образы, unique/shared disk usage и наличие
immutable тегов в registry. Удалены только шесть явно просмотренных старых локальных
Rollapp image tags, перечисленных в [JSON](workspace-deployment-2026-10-25.json).
Текущий/rollback `315f3eb`, предыдущий `d35e714` и все container-referenced images
сохранены. Без force/prune, удаления контейнеров/volumes и действий над БД.
После очистки COI сам загрузил образ и заменил контейнер; VM/service restart и
ручной pull не потребовались. После rollout свободно 7.5 GB по `df -h`.

Точный registry digest и cleanup evidence записаны в JSON. Workflow не перезапускался
ради зелёного счётчика и повторной сборки уже опубликованного immutable тега;
успех выпуска подтверждён фактическим health и production UI после восстановления.
Telegram configure был пропущен после первоначального timeout; существующая ссылка
не менялась. Реальные EventKit/iOS/TON операции остаются за рамками этого выпуска.
Постоянный dev service `8491/5491` оставлен работающим с production PostgreSQL.
