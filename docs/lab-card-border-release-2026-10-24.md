# Выпуск контура карточек анализов — 2026-10-24

Релиз подготовлен в отдельном чистом checkout от
`cae73c33ca6ce19890a718ad88d3afb377e6788c`, без незавершённых изменений
основной рабочей папки. Изменение: запас 1px со всех четырёх сторон карточек
в обрезающем аккордеоне. Upstream primitives сохранены.

Локальная проверка релизного кандидата:

- `npm ci` — PASS.
- `npm run test:lab-results` — 32 PASS: light/dark, DPR 1/3, восемь viewport
  от 320 до 1920px, включая 390×400; первый render и close/reopen,
  геометрия clipping ancestors и реальные пиксели верхней/нижней линии.
- `npm run test:ui` — PASS: 37 primitives / 85 application JSX sources.
- `npm run build` — PASS.
- `npm audit` и `npm audit --omit=dev` — 0 vulnerabilities после совместимого
  обновления dev-only fast-uri 3.1.8 → 3.1.9.
- `initializeRuntimeDatabase` из release checkout с `verify`, настроенной
  production TLS БД и credential из существующего Lockbox — PASS:
  реальная проверка существующей схемы в READ ONLY, без миграций/записи.
- `git diff --check` — PASS.

Прежний негативный прогон с возвратом `px-px` отклонил исходную вёрстку:
`light/1/320: card ring clipped` на первом и последнем рядах. Тест включён
в обязательный check:release и CI до сборки и публикации образа.

Полный release suite выполняется в GitHub Actions до выкладки immutable image.
Состояние production до выпуска: healthy,
`18bb093354bb8ea5c36f2696c6321381d8cd68a5` (rollback reference).
Результат CI и точный deployed SHA нужно сверить отдельно после завершения.
Авторизованного живого просмотра личных анализов в текущей браузерной сессии нет;
UI-проверка использует реальные компоненты с явными props и запретом API.
