# Выпуск горизонтальных лент — 2026-10-24

Выпущен `71dcc8e7e8e7af4c2351fd6d3be7a3a4ef7cc82f`.
CI: https://github.com/rolloutrf/rollapp/actions/runs/40067426398 — success.
Production health: ok=true, service=rollapp, version точно совпадает с SHA.
Предыдущая здоровая версия/rollback: `18bb093354bb8ea5c36f2696c6321381d8cd68a5`.

## Проверки

- Чистый `a378af9fd93c939929f729a6c7daf75e82dcaee5` прошёл все 11 этапов `npm run check:comprehensive`, terminal exit 0. Начало 04:00:50 UTC, конец 05:50:50 UTC. JSON: `docs/page-scroller-comprehensive-2026-10-24.json`.
- Финальный SHA наследует исправление через c192bbe/a378af9; `src/spacing.css` и `src/components/gallup-profile.jsx` в финальном релизе совпадают с проверенным кодом. Позднейшие main-коммиты других задач включены в единый релиз. Полный comprehensive выше относится к a378af9, не выдаётся за второй полный comprehensive на 71dcc8e.
- Финальный CI 71dcc8e успешно выполнил весь обязательный check:release, сборку и публикацию immutable образа, проверку metadata через FULL Instance.Get, rollout, exact-SHA health, canonical redirects/profile и Telegram configure.
- Оба npm audit на изолированной версии — 0 vulnerabilities; lockfile с финальным релизом совпадает.
- Существующая production-схема проверена штатным verify-helper через TLS/Lockbox в READ ONLY, без migrate/backfill/cleanup. Первоначальный probe без загрузки Lockbox не подключился; исправленный штатный probe прошёл. Схему и пользовательские записи эта задача не меняла.
- Живые production-анализы: 320×844, 390×844, 768×844, 820×414, 1024×844, 1440×900, 1920×900. До релиза на 390px viewport был 16–374; после — 0–390. На мобильной матрице left=0/right=ширина окна, нет clipping ancestors/root overflow; на desktop сохранён content rail. После настоящего горизонтального scroll на 390px: scrollLeft=48, first.left=-32, last.right=374. Частичная первая плитка обрезается экраном, последняя целиком доступна с внутренним полем 16px. Просмотрены мобильные и desktop скриншоты.
- Живой Wishlist 390×844: viewport 0–390, без root overflow. Временный viewport браузера сброшен. Записей/загрузок/удалений для проверки не выполнялось.
- VM: fv4chl6pdb4lnhsj7139 / rollapp-recovery-20261010; folder b1gebpfrhvkd43r38q98; runtime SA ajers2ngi708sf3i1t4g. Read-only SSH: новый контейнер на точном SHA, свободно 6.0 GB; pull/no-space/unauthorized ошибок в проверенном COI журнале нет. CLI BASIC view не содержит Compose и не использовался для вывода о metadata; подтверждение FULL metadata выполнено штатным CI deploy-script. Рестарт VM, очистка images/containers/volumes не выполнялись.
- Постоянный dev-сервис готов, PID 60108, API/frontend готовы; оставлен работать. Исходные чужие dirty-изменения сохранены. `git diff --check` изолированного checkout — PASS.

## История и ограничения

Старые запуски отменялись до облачных шагов при объединении параллельных задач; они не считаются успешными релизами. Финальный запуск указан выше, он завершён успешно. Данные пользователя и production screenshots в репозиторий не добавлялись. Физические iPhone/Safari/IME не проверялись. Полный локальный аудит и финальный CI относятся к разным, явно указанным SHA.
