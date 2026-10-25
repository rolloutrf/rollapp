# Бюджет соединений PostgreSQL

Production и постоянные preview используют одну настроенную PostgreSQL и роль.
Odyssey ограничивает `rollapp.rollapp_app` двадцатью соединениями. Лимит одного
node-postgres Pool не является общим лимитом всех процессов.

Production Compose задаёт `PG_POOL_SIZE=2`; один managed development preview —
`PG_POOL_SIZE=1`. `pg.Pool` ставит параллельные запросы в очередь при достижении
локального max. Не увеличивать размер на отдельной копии без проверки суммарного
бюджета всех работающих процессов и резерва для operator READ ONLY соединения.

Применение настройки требует штатного rolling restart соответствующего сервиса.
Постоянные preview после изменения оставляются включёнными. Сохранять индивидуальные
PORT/frontend port, direct TLS, production target и startup `verify`; не менять
общий env через symlink. Конфигурационные backups содержат секреты: хранить вне Git
с правами 0600. Отсутствующий checkout не является разрешением убить его процесс
или удалить PID-файл. Не завершать сессии PostgreSQL, не менять managed user pool,
схему и пользовательские данные ради освобождения соединений.

Для emergency config-only rollout сохранять текущие image/APP_VERSION и остальные
поля Compose, менять только PG_POOL_SIZE через штатный metadata guard. Следующий
обычный выпуск использует то же ограничение из template. См. [случай 25 октября](wishlist-pool-recovery-2026-10-25.md).

После `launchctl bootout` старый PID может ещё завершаться. Перед повторным enable
дождаться подтверждённого выхода owned PID; сбой ps/lsof или EPERM не означает
устаревший процесс. Использовать штатный controller и сохранять PID-файл, пока
владелец не проверен. Не подменять readiness одной копии ответом другой на общем порту.
