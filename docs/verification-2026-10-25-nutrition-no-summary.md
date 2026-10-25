# Питание без сводки дня — 25 октября 2026

По запросу пользователя удалён показанный блок итогов питания. Верхний overview с крупной датой/счётчиком был удалён в исходном main; теперь также убраны общие калории/БЖУ, подпись итогов и оставшиеся неиспользуемые overview CSS. После общей навигации дня идёт список или пустое состояние. Метаданные отдельных приёмов пищи и поля формы сохранены. Данные/схема не менялись.

## Исходное состояние и проверка

База изменения: `3c440c99d00104b1547fb4b425bc6a730273e161`. Проверка выполнялась с dirty source: nutrition-todo, planning-daily-todo CSS, health smoke, release mode/guard и документация. Ранее изменённые verification-отчёты сохранены отдельно, в этот коммит не включены.

- `npm run test:health` — PASS всей матрицы: 320/390/768/820/1024/1440/1920×900, 390/1024×400; 18 сценариев sleep/nutrition и 2 midnight cases. API-запросов 0. Вместо удалённых totals проверены реальные переходы записи между группами «Запланировано»/«Съедено», ошибка/retry, read-only, создание/редактирование/удаление и отмена вложенной даты.
- Просмотрены screenshots 390×900 и 1440×900: сводки/остаточного разделителя нет, controls и список доступны. Артефакты `/tmp/rollapp-health-trackers/`.
- `git diff --check` — PASS.
- Production DB: точная настроенная БД/роль, authorized TLS, pool1, existing schema verify в READ ONLY с ROLLBACK — PASS; миграций/изменений данных нет. Постоянный dev keepalive PID97527 готов и оставлен работающим.
- `npm audit --omit=dev` — 0 vulnerabilities. Полный audit — 2 известных high в dev-цепочке @ton/ton→zod; lockfile/версии не менялись. Первый сетевой audit400 повторён успешно.

## Выпуск

По ранее данному запросу на деплой без сложного аудита добавлен targeted `verification=health`: unit/UI, полный controls, полный health и build. Default/full не изменён. CI ещё должен подтвердить этот набор на итоговом SHA; далее обязательны exact-SHA health и read-only live review. Comprehensive/editor matrix не запускались и не заявляются пройденными.

Перед выпуском production healthy на 3c440c9, конкурирующих rollout нет. Освобождён только рассмотренный unused registry cache tag `9daf0a4fff52c251eff6c5fa8cebcd55ccae4277` (id ac102e65): проверены все container refs и наличие remote manifest; current/rollback сохранены. Свободно 6744977408 bytes. Без prune/force/удаления контейнеров/volumes/restart.

## Первый CI и исправление проверки

Run40230605487 на e7bda8aec8915858752ea5c303b881c6f8979417: unit864/863PASS/1skip/0fail, UI и полная controls matrix прошли. Health остановился на первом sleep navigation с net::ERR_ABORTED после cold Vite optimizer bundling; image/metadata rollout не запускались, production остался на 3c440c9.

Для health fixture добавлены отдельный cacheDir, явный fixture entry и общий smokeBaseUiDependencies, как в существующих notes/lab проверках: все Base UI imports обнаруживаются до навигации. Assertions/viewport matrix не сокращены, ошибок не подавляем, retry навигации не добавляем. После изменения повторяем полную health matrix на холодном кэше и весь targeted gate в CI.

Первый локальный cold run после явного entry/Base UI прошёл 20 cases, но лог ещё показал позднее обнаружение next-themes/qrcode/sonner. Эти три зависимости также включены заранее; перед финальной проверкой отдельный генерируемый cacheDir перемещён в /tmp, без изменения исходных/пользовательских данных.
