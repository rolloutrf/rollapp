# Проверка отступа в карточке курса — 23 октября 2026

Основа: `237386530fd11e359f6f997735537b85e6ccb419`. До начала работы checkout был чистым; проверяется dirty snapshot с изменением `src/components/courses.jsx`. Изменения не опубликованы. SHA256 окончательного courses.jsx: `6646e98d5c08725bce83f8a4abc143980b7f601bf14cc0c61c48e4534897ce37`.

## Исправление

Название, организатор, описание и дата собраны в одну вертикальную текстовую колонку с gap 8px. Отдельная строка CardHeader с 48px меню и прижатая вниз через mt-auto дата больше не создают пустой промежуток. Описание сохраняет порядок перед датой и ограничение в три строки. Длинное название ограничено шириной колонки и сокращается; дата может переноситься. Меню сохраняет 48×48px. Общие typography/spacing tokens и upstream primitives не изменены.

## Выполнено

- Контроль исходного HEAD на 390×844 с теми же соседними карточками воспроизводит gap 112px (mt-auto растягивает промежуток); после правки gap 8px. Результат /tmp/rollapp-course-spacing-before-geometry.json.
- npm ci --no-audit --no-fund: PASS.
- npm test после окончательной правки: PASS, 822 успешных, 1 пропущен, 0 ошибок (823 tests).
- npm run test:ui после окончательной правки: PASS.
- npm audit и npm audit --omit=dev: по 0 уязвимостей.
- Локальная browser-диагностика реального CourseCard: PASS на восьми размерах 320×844, 390×844, 768×844, 820×844, 1024×844, 1440×844, 1920×1080, 390×400. Проверены точный gap 8px, меню 48×48px, отсутствие пересечения даты с меню и root overflow; API-запросы запрещены, выбор логотипов отключён только в диагностике. Сняты скриншоты с пустой датой, организатором, описанием, длинным названием и датой завершения. Вручную просмотрены все восемь скриншотов, включая 320px, переходы 768/820px, 1920px и короткое окно 390×400. Диагностика лежит в node_modules/course-spacing-check.mjs; результаты /tmp/rollapp-course-spacing-geometry.json, скриншоты /tmp/rollapp-course-spacing-WIDTHxHEIGHT.png.
- npm run dev:keepalive: готов на API 8093 / frontend 5183, production PostgreSQL, existing-schema verify без миграций. Сервис оставлен включённым. Локальный .env скопирован из настроенного checkout, порты записаны отдельно в этом checkout.
- git diff --check: PASS.

## Общая проверка

npm run check:comprehensive: **PASS**, код завершения 0, все 10 этапов без фильтров. Полный text-edit, обязательные geometry/pixel controls, все release/UI/browser/build и дополнительные application matrices прошли. Уточнение границ snapshot: финальный w-full у внутреннего заголовка добавлен во время test:controls; итоговые unit/UI и диагностика CourseCard на восьми размерах повторены после этой правки. Лог /tmp/rollapp-course-spacing-comprehensive.log. Машинный итог сохранён в [course-card-spacing-comprehensive-2026-10-23.json](course-card-spacing-comprehensive-2026-10-23.json).

## Ограничения

Авторизованная живая карточка через production API не проверена: у нового origin нет пользовательской сессии. Production API/frontend health и read-only existing-schema verify успешны. Browser fixture использует только presentation props, не подменяет production БД и не сохраняет данные. Публикация и интеграция не выполнялись.

| Этап | Результат |
| --- | --- |
| `check:release` | PASS |
| `test:navigation` | PASS |
| `test:action-rails` | PASS |
| `test:identity-reports` | PASS |
| `test:todo` | PASS |
| `test:form-pages` | PASS |
| `test:catalog-page` | PASS |
| `test:wish-groups` | PASS |
| `test:drawers` | PASS |
| `test:contacts` | PASS |
