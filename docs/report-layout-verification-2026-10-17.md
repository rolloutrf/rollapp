# Компоновка Gallup / Hogan — 17 октября 2026

Рабочий каталог поверх commit `710457583a873ce56b93d4eb26849731164f5b2d`; dirty до начала работы, многочисленные посторонние изменения сохранены. Это проверка рабочего каталога, не чистого релизного commit.

## Изменение

Структура повторяет Wishlist: профиль → действия → плитки → отчёт. Общий `identity-report-workspace` сохраняет ширину коллекции и промежутки 24 px. `IdentityReportControls` использует общий `PageActionButton` и принимает навигацию после действий, перед исходными файлами. Состояния отчётов подняты в `IdentityReportsPage`, переключатель находится вне сменяемого `TabsContent` и сохраняет фокус. В loading/error удаление недоступно. Контракт записан в `docs/spacing-system.md`.

## Выполненная проверка

- `npm run dev:keepalive:status`: API/frontend готовы, постоянный сервис с настроенной production БД оставлен работающим.
- `npm run test:ui`: passed.
- `npm run build`: exit 0; предупреждение о крупных JS chunks.
- `node scripts/action-rails-smoke.mjs`: exit 0, полная матрица 320/390/640/767/768/820/1024/1440/1920, все варианты действий и края прокрутки.
- Живой production API через `127.0.0.1:5172`, без сохранения/удаления данных: Gallup → Hogan → Gallup; ArrowLeft + Enter; Hogan сохраняется после reload.
- DOM на 320, 390, 768, 820×414, 1024, 1440, 1920 px: действия 48 px, центр группы совпадает с центром окна (погрешность <0.01 px), действия → плитки и плитки → отчёт по 24 px, обе плитки 130×100 внутри viewport, переполнения документа нет.
- Проверены реальные screenshots 390 и 1440 px. Снимки: `/tmp/rollapp-report-layout-mobile.png`, `/tmp/rollapp-report-layout-desktop.png`, `/tmp/rollapp-report-layout-result.png`.
- Текстовая кнопка: 18/28 px, padding 24 px с каждой стороны, высота 48 px.
- `npm audit --omit=dev`: 0 уязвимостей. `npm audit`: 7 high в существующей dev-цепочке; зависимости не менялись в рамках этой правки.
- `git diff --check`: passed.

`npm run check:comprehensive`: завершился с exit 1 на запуске `test:text-edit`: `Port 5199 is already in use` (одновременно в каталоге выполнялись другие проверки). Unit/UI/controls/details/dates/form-actions до этого этапа прошли. Расширенные этапы после release не запускались; action-rails отдельно прошёл полностью. Машинный результат: `docs/report-layout-verification-2026-10-17.json`. Это не полный успешный аудит приложения. Состояния loading/error/empty/read-only и операции загрузки/удаления PDF в живом UI не проверялись.
