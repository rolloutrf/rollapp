# Горизонтальные ленты до краёв экрана — 2026-10-24

Проверяемый HEAD: `95223417bdd06683875ef7cf273ecab599270779`, dirty workspace до и после изменений. Параллельно менялись календарь, To Do, анализы, отчёты личности, сервер и lockfile; эти изменения не принадлежат данной задаче и сохранены. Прогоны ниже не являются comprehensive-проверкой всех параллельных изменений.

Исправление: viewport ленты анализов был ограничен текстовым контейнером. В `src/spacing.css` объединён мобильный выход к краям окна для действий, Wishlist, отчётов/дат, групп образования/препаратов и Gallup. Поля остаются внутри прокрутки. Gallup использует `.page-edge-scroller`. Контракт закреплён в AGENTS.md и docs/spacing-system.md. `test:page-scrollers` добавлен в check:release.

Проверки:

- `node scripts/page-scrollers-smoke.mjs`: exit 0, 108 PASS; 320/390/640/767/768/820/1024/1440/1920, 820×414, 1/2/12 элементов, отчёты/Wishlist/группы/таланты. Проверены геометрия viewport, обрезающие предки, крайние элементы, реальный проход за край и root overflow. Fixture не подключается к БД, API запрещены; это проверка CSS-композиций и настоящих примитивов, а не полная загрузка всех страниц приложения.
- `node scripts/action-rails-smoke.mjs`: exit 0, 90 PASS, полная стандартная матрица; центрирование, начало/конец, смешанные/короткие/динамические группы, вертикальная прокрутка и расстояние до содержимого.
- `npm run test:ui`: exit 0, shadcn audit passed, повторён после изменения конфигурации.
- `npm run test:identity-reports`: exit 0; полные матрицы PDF-содержимого и диаграмм Hogan/Gallup, включая короткое окно и keyboard navigation; `/tmp/rollapp-scroll-identity.log`.
- `npm run build`: exit 0; стандартное предупреждение о крупных chunks.
- `git diff --check`: exit 0.
- `npm run dev:keepalive:status` вне sandbox: frontend/API готовы, persistent service оставлен работать.
- Живая read-only проверка через браузер и настроенную production-связь: Wishlist и реальные анализы на 390×844. Обе ленты имеют left=0/right=390, root overflow отсутствует; у анализов нет обрезающего предка. После реальной горизонтальной прокрутки scrollLeft=48, правая граница последней плитки=374 (16px внутреннего поля), первая плитка проходит за экран. Записей/загрузок/удалений не выполнялось. Временный размер браузера сброшен.
- `npm audit --json` / `npm audit --omit=dev --json`: после повторения вне sandbox получены 4/3 замечания соответственно (body-parser, vite, zod; только полный набор также fast-uri). Зависимости этой задачей не менялись; lockfile параллельно менялся другой работой, поэтому эти результаты относятся к моменту запроса. Отчёты `/tmp/rollapp-scroll-audit*.json`.

Логи: `/tmp/rollapp-page-scrollers.log`, `/tmp/rollapp-action-edges.log`, `/tmp/rollapp-scroll-build.log`. Просмотрен screenshot `/tmp/rollapp-page-scrollers-390.png` и живые скриншоты анализов до/после прокрутки.

Ограничения: весь check:release/check:comprehensive не запускался; все страницы с production-данными, физический iPhone/Safari и реальный touch не проверены. Desktop сохраняет границы контентного rail; выход к физическим краям относится к мобильному контракту до 820px.
