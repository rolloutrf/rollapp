# Фото препаратов — 23 октября 2026

## Проверяемая версия

Исходный SHA: `237386530fd11e359f6f997735537b85e6ccb419`, исходный worktree чистый.
Изменения находятся в ветке `codex/medication-photos-20261023`.
Полный аудит: чистый `9383c96d1671e4aae92cddf16e8b64815f53d8f6`,
включающий актуальный main `00e71d7726c108bbd3f135ce4d54563117756f80`.
После аудита изменён только этот отчёт. Прогон: 2026-10-23 19:30–21:14 UTC
(завершение 24 октября по Москве), Node v22.22.3.
Личные данные заказа и одноразовый импорт не включены в репозиторий.

## Реализация и обнаруженные ограничения

Добавлены imageUrl в форму/карточку/API и image_url в хранилище. Существующий
image upload сохраняет owner guards; reference check защищает используемые фото.
Отмена и повтор Save не теряют фото; поздний upload не меняет нового владельца
формы. Уже отправленный в Save upload не удаляется при неопределённом результате
запроса. URL может быть HTTP/HTTPS или каноническим local media; небезопасные
схемы отклоняются. Legacy PATCH без imageUrl не очищает существующее фото.

Покупка без назначения сохраняется как planned/custom с пустыми временами:
«Схема не указана». Active/custom по-прежнему требует время. Это устраняет
неверную необходимость указывать as_needed для ещё не назначенного курса.

После отдельного явного согласия пользователя применена только additive миграция
`health_medications.image_url TEXT NOT NULL DEFAULT ''`. Конфигурация проверила
целевую production БД `rollapp`, роль `rollapp_app`; обычный startup остался verify.
Команда без --apply до миграции показала missing image_url, --apply добавила только
этот столбец. Постоянный TLS dev keepalive восстановлен на отдельных портах
5358/8358, без memory/demo fallback и без остановки других сервисов.

## Выполненные проверки

- `npm ci`: успешно; lockfile не изменён.
- `npm test` первоначально: 828 тестов, 827 PASS, 1 предусмотренный SKIP.
  Итоговый интегрированный `check:release`: 829 тестов, 828 PASS, 1 SKIP, 0 FAIL.
- `npm run test:ui`: PASS, 37 upstream primitives/84 JSX sources.
- `npm run test:medication-photos`: PASS всех 9 размеров — 320/390/768/820/1024/
  1440/1920×900, 390/1024×400. Реальные компоненты/CSS, явный fixture transport,
  реальные API/БД не вызываются. Проверены URL/preview, cancel/retry/save/reopen,
  remove/save, SVG rejection, upload, сохранённый asset, late-owner cleanup,
  отсутствие root overflow и ControlBar 48px/четыре радиуса >=24px.
- Проверены screenshot mobile/desktop. Первые диагностические screenshots были
  сняты во время desktop animation; тест теперь дожидается завершения анимации
  и проверяет границы popup, не выдавая промежуточный кадр за итоговый layout.
- `npm run build`: PASS; существующее предупреждение о крупных chunks.
- `npm audit` и `npm audit --omit=dev`: 0 vulnerabilities.
- `git diff --check`: PASS.

Live localhost frontend + production API/БД проверен в существующей сессии:
семь записей в целевой группе, семь реальных фото loaded (naturalWidth>0),
точные варианты упаковок. При первом запуске выявлен конфликт с backend другой
рабочей копии на8088: новый сервис перенесён на проверенные свободные8358/5358;
чужие процессы не останавливались. Read-only verify и keepalive восстановлены.

Живая проверка также выявила intrinsic grid sizing: вертикальный PNG был выше
рамки CollectionSnippetMedia, несмотря на object-fit:contain. Изображение теперь
позиционируется внутри существующей рамки, не участвуя в расчёте её высоты.
Проверка PNG47×69 на всех девяти размерах теперь явно сравнивает границы img/frame.
Photo smoke получил собственный Vite cacheDir, чтобы не перезагружать dev UI.

## Итог полного аудита

`ROLLAPP_CHECK_OUTPUT=/tmp/rollapp-medication-9383c96-comprehensive.json caffeinate -i npm run check:comprehensive`:
PASS всех 11 этапов, без фильтров/исключений: check:release (включая полный
text-edit, controls, details, dates, calendar, form-actions, notes, kanban,
drag-drop, health, medication-photos и build), navigation, action-rails,
identity-reports, todo, form-pages, catalog-page, wish-groups, drawers,
contacts, contact-notes. Лог: `/tmp/rollapp-medication-9383c96-comprehensive.log`.
Версия и dirty=false записаны самим runner в JSON. Полный release занял 84 минуты,
comprehensive — 104 минуты. Отменённые ранние branch CI audits 40002148319 и
40003026412 не считаются PASS; окончательный полный аудит выполнен локально.

Дополнительный read-only fixture smoke прошёл все 9 размеров: изображения loaded
и целиком в рамках, форма редактирования недоступна, transport writes=0.

## Реальные данные и загрузка фото

Для разрешённого пользователем переноса сохранены семь позиций существующего
заказа в целевой группе, без дублей. Семь исходных PNG загружены через настоящий
filechooser и authenticated upload API, затем сохранены штатной формой препарата.
Фото находятся в Rollapp как owner-scoped `/api/media/:id`; зависимости от
внешних ссылок магазина нет. READ ONLY проверка подтвердила одинакового владельца
записи/файла, PNG MIME, точное число байтов и SHA256 оригиналов выбранных вариантов
30/60 капсул, цены/количество/заметки и отсутствие выдуманной схемы/дат.
Личные данные и manifest остаются вне репозитория.

На интегрированном исходном коде9383c96 повторена живая проверка production данных
через5358/8358 на всех9 размерах: все7 локальных фото loaded/fitting, root overflow
отсутствует. Screenshot: `/tmp/rollapp-medication-photos-preview.jpg`.
Результаты: `/tmp/rollapp-medication-owned-live-checks.json`.

Rollback-only production проверка сохранения/default/legacy omission/очистки
поля/перемещения группы/owner и reference guards прошла; временные строки после
ROLLBACK отсутствуют. Реальный existing-schema startup preflight повторно прошёл
READ ONLY, mode=verify, production database/role совпали с конфигурацией.

Реальное устройство, ручное взаимодействие с системным file picker и actual-device
IME не проверены; filechooser→upload→Save проверен на настоящих файлах и записях.
Проверка точного SHA и UI основного сайта будет дописана после обычного выпуска.
