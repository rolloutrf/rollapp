# Комплексная проверка сниппетов — 2026-10-25

База: `9daf0a4fff52c251eff6c5fa8cebcd55ccae4277`. Локальные проверки выполнены на dirty snapshot этой базы; commit полного CI-прогона и итог будут записаны отдельно. Исходный dirty-отчёт выпуска прозрачных панелей сохранён. Основной checkout с чужими изменениями не редактировался.

## Найдено и исправлено

1. Реальные production-карточки Go Practive и Product Star подтвердили перекрытие статуса ручкой. Legacy display:none проигрывал inline-flex utility. Общая видимость ручки теперь принадлежит product utilities, а badge при наличии touch-ручки расположен внизу. Перенос, auto height и несжимаемая иконка сохраняют каждую букву всех статусов пяти семейств.
2. Внешние ссылки курсов и коучинга выходили за узкие карточки. Общий CollectionSnippetLink сохраняет native anchor, 18/28, минимум 48px и перенос внутри карточки.
3. Меню коллекций и препаратов имели 36px hit target. Теперь используется общий токен 48px и glyph 20px.
4. Длинные слова метаданных коучинга/препаратов расширяли контент. Добавлены min-width:0, перенос и несжимаемые иконки.
5. Ошибка изображения оставляла прежний fallback index при новом URL. Новая последовательность источников теперь владеет собственным loading/error состоянием. Тематическая заглушка остаётся до загрузки и после отказа; поздний запрос старого владельца не подменяет новый источник.
6. Для сокращённых заголовков/подписей добавлен полный title; read-only объявления открывают карточку без обещания редактирования.

Upstream shadcn primitives, схема и пользовательские данные не изменялись. Контракты: `docs/collection-snippets.md`, `docs/spacing-system.md`, `docs/drag-and-drop.md`, `docs/design-system.md`, `AGENTS.md`.

## Проверки до CI

- Полный `npm run test:snippets`: **352 PASS**, 0 failures, diagnostic=false. JSON: `/tmp/rollapp-snippets/final-local.json`. Пять настоящих Card компонентов, все статусы, owner/read-only/busy, светлая/тёмная темы, mouse/CDP touch, 11 размеров от320 до1920 и короткие окна. Native menu/link/keyboard/focus, drag preview/cancel, длинные/пустые сведения, loading/fallback/source replacement/stale image response; API-запросы запрещены. Финальный повтор добавляет ожидание завершения theme transition и проверку foreground, без ослабления прежних assertions.
- `npm run test:drag-drop`: PASS всей восьмиразмерной матрицы; новые проверки статусов плюс прежние reorder/group/cancel/access/failure rollback/calendar. Лог `/tmp/rollapp-snippets-drag-final.log`.
- `npm test`: 830 PASS, 1 skip, 0 FAIL; `npm run test:ui`: PASS; `npm run build`: PASS с прежним предупреждением о размере chunks.
- `npm audit` и `npm audit --omit=dev`: по0 уязвимостей. Первый audit столкнулся с TLS/network failure, успешный повтор получен отдельно; ошибка соединения не была принята за нулевые advisories.
- Основной `npm run dev:keepalive:status`: production API/frontend готовы, сервис PID60108 оставлен работать.
- `git diff --check`: PASS. Просмотрены мобильные/desktop screenshots обеих тем. Theme-transition снимки переснимаются после стабилизации цвета.

## Полный аудит и ограничения

Подготовлен веточный запуск `check:comprehensive` без фильтров. `test:snippets` добавлен в release gate; audit artifact сохраняет его JSON и failure screenshots. Веточный job имеет contents:read и не публикует production. Ожидается итог всех11 этапов на одном commit; отдельные локальные PASS не выдаются за полный comprehensive.

Production до нового явно запрошенного rollout остаётся на `9daf0a4`. Живой UI прочитан в существующей production-сессии без сохранений. Физические iOS/Android touch/IME не проверены; CDP touch не заменяет устройство.

## Запрос на целевой выпуск

Пользователь затем явно запросил: «Задеплой без сложного аудита». Comprehensive run40194923881 на чистом `a2a2c488c67589aba69df6e290f68a7cc6fabd95` отменён по этому запросу во время test:text-edit; полного comprehensive PASS нет. До отмены прошли unit/UI, все352 snippet records, page scrollers, lab results, controls, details, dates, calendar, form actions. Локальный финальный `test:snippets` на том же чистом SHA также дал352 PASS (`/tmp/rollapp-snippets/final-stable-theme.json`). Дополнительно просмотрены все пять типов на390/1440px в обеих темах, включая native touch screenshots.

Для явно запрошенного UI-выпуска добавлен manual `verification=snippets` с unit/UI/controls/snippets/drag-drop/build. Полный default release и comprehensive не меняются. Схема проверяется в READ ONLY перед rollout, без миграций. Итоговый SHA и production health будут записаны после выпуска.
