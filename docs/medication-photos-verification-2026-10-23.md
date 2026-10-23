# Фото препаратов — 23 октября 2026

## Проверяемая версия

Исходный SHA: `237386530fd11e359f6f997735537b85e6ccb419`, исходный worktree чистый.
Изменения находятся в ветке `codex/medication-photos-20261023`.
Полный SHA реализации и результаты comprehensive будут записаны после прогона.
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
5178/8088, без memory/demo fallback и без остановки других сервисов.

## Выполненные проверки

- `npm ci`: успешно; lockfile не изменён.
- `npm test`: 828 тестов, 827 PASS, 1 предусмотренный SKIP, 0 FAIL.
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

Полный comprehensive и live production UI после выпуска ещё не завершены.
Матрицы отдельных проверок не считаются заменой полного аудита. Реальное устройство,
системный file picker и IME остаются непроверенными.
