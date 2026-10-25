# Выпуск прозрачных панелей — 2026-10-25

База: c0e068d156ac88a8bc5f6baa472a7c48bc20922c. Ветка codex/transparent-header-20261024. До выпуска dirty только изменения и отчёты запросов этого чата; diff просмотрен, сторонние изменения не включались.

Изменения: прозрачная общая шапка приложения/публичного профиля и прозрачная область вокруг быстрого добавления задачи. Собственные поверхности кнопок, селекторов и поля сохраняются. Контракты записаны в AGENTS.md, docs/spacing-system.md, docs/design-system.md.

Выполнены на рабочем снимке:
- test:ui PASS, test:navigation PASS (9 ширин, 5 маршрутов, обе темы), test:todo PASS (полная матрица); дополнительные вычисленные background/image/border/shadow/backdrop-filter assertions.
- build PASS, предупреждение о chunks; git diff --check PASS.
- npm audit и npm audit --omit=dev: 0 уязвимостей.
- Основной persistent production dev API/frontend готовы, сервис оставлен работать.

Предыдущий локальный check:comprehensive завершился ошибкой в text-caret-scroll-checks.mjs:63 на 320×844: native Selection.focusNode оказался null при Range.setStart. До ошибки прошли unit (830 PASS, 1 skip, 0 FAIL), UI и ранние browser стадии. Лог /tmp/rollapp-transparent-header-comprehensive.log, JSON /var/folders/56/y9x0qcp95zs6ctldh56fs6qh0000gq/T/rollapp-check-1792870030256.json. Во время старого прогона менялся footer, поэтому полный стабильный PASS не заявляется. Проверки и их assertions не ослаблялись. Перед публикацией штатный deploy workflow обязательно заново выполняет полный check:release на точном commit.

Этот документ фиксирует подготовку. Итоговый SHA, CI и health будут подтверждены после rollout. Схема и данные production не меняются.
