# Страничные ленты всегда до краёв viewport — 26 октября 2026

База `45546f837de06e7f46206cfe0f5d03d408be01a9`. Запрос: вернуть выход горизонтальных лент к краям экрана на всех страницах и ширинах.

Причина: commit0aa9934 ограничил tile rails на desktop родительским100%; общий breakout применялся только до820px. Простого100vw было недостаточно: обычный app-main с16px оболочкой сам обрезал выступающую ленту.

Общий viewport rule в spacing.css теперь действует без media cutoff на Wishlist/публичные списки, группы, даты отчётов/анализов/перфоманса, дни To Do/питания, page-edge-scroller и action rails. Width100vw/симметричная компенсация родителя; поля внутри скролла16/24/40/48px с учётом внешней оболочки. Обычный app-main пропускает ленты через свою рамку. Fullscreen planning сохраняет свои scroll owners. Ширины текста/карточек, wraps обычных вкладок, локальные таблицы/код/меню/формы не менялись; root clipping не добавлялся, upstream primitives не менялись.

Обновлены AGENTS/design/spacing/container contracts и live layout checker: desktop inset теперь тоже ошибка.

## Проверки dirty source

Изменялись spacing.css, профильные fixture/checkers и release gate/документация. Старые verification reports сохранены отдельно.

- `npm run test:ui` — PASS.
- Первичный `test:page-scrollers` — PASS252 cases всех9 ширин: добавлены реальные EducationListNavigation/IdentityReportNavigation/PlanningDayRibbon, публичный Wishlist, ряды32 плиток для гарантированного overflow на1920. Промежуточная матрица повторяла63 дня под четырьмя count labels; финальный CI использует ровно225 случаев (остальные роли1/2/12/32, дни63 один раз на ширину), сохраняя все реальные compositions и viewport cases. Лог `/tmp/rollapp-viewport-rails-page-scrollers.log`.
- Первичный полный `test:action-rails` — PASS144 cases. Финальный CI дополнительно включает вариант20 text actions для принудительного overflow на1920 и проверку шага64px за новым48px gutter; исходная матрица сохранена. `/tmp/rollapp-viewport-rails-actions.log`.
- `test:todo` — PASS63; `/tmp/rollapp-viewport-rails-todo.log`.
- `test:health` — PASS20; `/tmp/rollapp-viewport-rails-health.log`.
- `test:navigation` — PASS46; `/tmp/rollapp-viewport-rails-navigation.log`.
- Полный `test:identity-reports` — PASS35 (report render/charts/navigation/anchors + custom tests/forms); `/tmp/rollapp-viewport-rails-identity.log`.
- Production DB preflight — PASS exact configured DB/role, authorized TLS, READ ONLY existing-schema verify, ROLLBACK/pool1. Миграций/данных не меняли.
- Audit runtime0, full dev warnings проверены отдельно; первоначальный сетевой full audit TLS failure не засчитан и повторён. Зависимости/lockfile не менялись.
- git diff --check — PASS.

## Выпуск

Standing user request: деплой без сложного аудита. Новый manual page-rails gate: unit/UI, полный controls, полный page-scrollers225, полный action-rails153 и build; затронутые профильные полные matrices проверены локально до commit. Default/full/WebKit/editor/comprehensive сохранены. Schema verify, immutable SHA, pool2, сериализация и exact-SHA/live review обязательны. Итоговый SHA/результатыCI/live будут дописаны после выпуска. Comprehensive и реальные iOS/Telegram keyboards не проверены.

Production healthy45546f8. Рассмотрен superseded cache tag3c440c99d00104b1547fb4b425bc6a730273e161 (id73cda3a9,2026-10-25T19:29), уже не current/previous: ни один контейнер не использует, remote manifest доступен. Удалён только этот tag без force/prune/контейнеров/volumes. Current45546f8, rollbackd5d4741, дополнительный2b04024 и ранние checkpoints сохранены; свободно6756352000bytes до pull.
