# Произвольные личностные тесты — 2026-10-24

Код подготовлен, production-схема **не изменена**. Включение функции ожидает
отдельного разрешения на миграцию двух CHECK. Существующие данные не изменялись,
тестовые данные и PDF в production не сохранялись. Deployment не выполнялся.

## Состояние workspace

Полный прогон начат на `95223417bdd06683875ef7cf273ecab599270779`, dirty=true.
Во время работы в общем workspace другие задачи меняли календарь, стили,
зависимости и документацию и создали коммит
`f55cce47e5718bc411f39cfc9436930deb152f23`. Финальное состояние также dirty.
Проверки относятся к рабочему дереву во время соответствующих запусков, а не к
чистому релизному SHA. Чужие изменения сохранены; финальный diff просмотрен.

## Изменение

- Создание/переименование/удаление приватных тестов, выбор плиткой и параметр `report`.
- До 8 PDF на тест через существующий защищённый upload API; немедленный серверный
  разбор и общий renderer исходного содержания. Исходный файл доступен отдельно.
- Generic PDF не получает профили Hogan/таланты Gallup. Текст/структура извлекаются
  существующим parser; психологические интерпретации не генерируются. Скан без
  текстового слоя получает явную ошибку; OCR отсутствует.
- Блокировка строки своего теста сериализует загрузку, переименование и удаление;
  название сохраняется после удаления последнего/всех PDF. Разделы пользователя
  изолированы по user_id; старые Gallup/Hogan grants не открывают custom-тесты.
- Мобильная форма использует общий native form host/footer. Выбор созданного
  теста применяется после возврата из history entry формы.

## Проверки

| Команда | Результат |
| --- | --- |
| `npm run dev:keepalive:status` вне sandbox | PASS в начале и конце; PID 60108, API/frontend готовы; сервис оставлен работающим |
| `node scripts/identity-tests-schema.mjs` | PASS READ ONLY: БД `rollapp`, роль `rollapp_app`, обе реальные секции CHECK допускают только Hogan/Gallup. Через штатный TLS/Lockbox и проверку точного configured database/role; без миграций |
| `npm run build` | PASS; предупреждение о размере chunks |
| `npm run test:ui` | PASS: 37 upstream primitives, 80 JSX sources |
| `npm run check:comprehensive` | FAIL на календаре 320×400: `writes`, `page.waitForFunction` timeout 90000 ms. Полный аудит не завершён |
| Unit-этап внутри comprehensive | PASS: 792 tests, 791 pass, 1 skipped, 0 fail; в том числе новый generic PDF parser и название/порядок документов |
| Controls, details, dates внутри comprehensive | PASS до остановки на calendar |
| `npm run test:identity-reports` | Source renderer + Hogan scales/navigation прошли полные матрицы. Новая UI-часть первого комбинированного запуска остановилась на неоднозначном тестовом селекторе кнопки в закрывающемся Drawer; селектор уточнён и новая матрица повторена отдельно |
| `node scripts/identity-tests-smoke.mjs` после исправления селекторов | PASS 320×844, 390×844, 768×844, 820×844, 1024×844, 1440×844, 1920×1000, 1024×400: создание, ошибка/повтор, отмена формы без записи, переименование, восстановленный URL, PDF reader, выбор, отмена/подтверждение удаления, root overflow. Кнопки footer: 48px и все четыре радиуса 24px. Все API-запросы fixture запрещены |
| `node scripts/action-rails-smoke.mjs` | PASS полная матрица, включая icons/mixed/dynamic/overflow/scroll/nested |
| `npm run test:form-actions` | PASS полная матрица и StrictMode/native Enter/busy Back |
| `npm audit --json`, `npm audit --omit=dev --json` | PASS, оба 0 vulnerabilities на момент проверки; зависимости параллельно менялись другой задачей |
| `git diff --check` | PASS |

Первоначальный `npm test` в sandbox получил 4 EPERM из-за открытия локальных
портов; повтор внутри comprehensive вне sandbox прошёл. Первоначальный прямой
schema probe без штатной загрузки Lockbox не подключился; исправленный probe
использует существующий production helper и прошёл. Подмена БД не использовалась.

Скриншоты нового reader и формы на 390/1440 просмотрены; desktop Drawer и native
mobile page без пересечений. Остальные размеры проверены браузерной матрицей.
Логи: `/tmp/rollapp-custom-tests-{smoke,reports,rails,forms,build,comprehensive}.log`.
JSON полного незавершённого прогона: `/tmp/rollapp-custom-tests-comprehensive.json`.

## Ограничения и следующий шаг

Native live-review существующей пользовательской сессии недоступен: Mac заблокирован,
подключённых браузерных вкладок нет. Реальные iOS/Telegram клавиатуры не проверялись.
Проверки callbacks не доказывают сохранение custom-теста в production, пока его
схема не включена. Произвольные сканы и все возможные структуры PDF не поддерживаются.
Полный comprehensive после calendar-ошибки не выдаётся за успешный.

После отдельного явного разрешения выполнить
`node scripts/identity-tests-schema.mjs --apply`: транзакционно расширить
`identity_generated_reports_section_check` и `identity_report_uploads_section_check`
из `server/migrations/2026-10-24-custom-identity-tests.sql`. Таймаут ожидания блокировки
3s, statement timeout 15s. Строки не меняются/не удаляются. Обычные startup/release
остаются `ROLLAPP_DATABASE_INITIALIZATION=verify`. Затем обновить API-процесс
постоянного dev-сервиса и проверить существующую схему/доступность; пользовательские
PDF не загружать ради проверки без отдельной необходимости.
