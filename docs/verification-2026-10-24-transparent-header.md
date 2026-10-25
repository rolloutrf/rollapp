# Прозрачная шапка — 2026-10-24

Базовый commit: c0e068d156ac88a8bc5f6baa472a7c48bc20922c. До правки в checkout находился только untracked отчёт предыдущего запроса; он сохранён. Ветка codex/transparent-header-20261024, проверены незакоммиченные изменения.

По уточнению пользователя шапка не должна иметь собственного фона. Общий слой src/spacing.css явно убирает фон, градиент, border, shadow и backdrop-filter у global-app-chrome и legacy profile-header. Поверхности отдельных контролов сохранены. Правило закреплено в AGENTS.md, spacing-system.md и design-system.md.

Проверки:
- npm run test:ui: PASS.
- npm run test:navigation: PASS, 320/390/640/767/768/820/1024/1440/1920, пять маршрутов, светлая/тёмная тема; вычисленные background/image/border/shadow/backdrop-filter, существующие меню/геометрия/scroll/safe-area/keyboard assertions. Просмотрен /tmp/rollapp-mobile-navigation.png.
- npm run build: PASS, предупреждение о размере chunks.
- npm audit и npm audit --omit=dev: 0 уязвимостей.
- npm run check:comprehensive: запущен; на момент записи продолжается, полный PASS не заявляется. Лог /tmp/rollapp-transparent-header-comprehensive.log, JSON /var/folders/56/y9x0qcp95zs6ctldh56fs6qh0000gq/T/rollapp-check-1792870030256.json. Unit: 830 PASS, 0 FAIL, 1 skip.
- npm run dev:keepalive:status в основной checkout: persistent API/frontend готовы, сервис оставлен работать. В отдельной checkout нет собственного .env; БД не подменялась.
- Read-only просмотр текущего production через существующую авторизованную Comet-сессию: Wishlist и шапка доступны; новый CSS туда ещё не опубликован. Никаких записей/форм не сохранялось.

Ограничения: legacy profile-header отдельно в живом DOM не проверен; полный comprehensive ещё не завершён. Деплой этой правки не выполнялся. Данные и схема production не менялись.
