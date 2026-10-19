# Вложенность, меню и списки — 2026-10-18

Dirty workspace `710457583a873ce56b93d4eb26849731164f5b2d`; зафиксированы 488
code/config source files: `/tmp/rollapp-text-tree-final-sources.json`.
Цель Notion R1–R10 остаётся активной; это отчёт итерации, не заявление полного соответствия.

В основной runtime перенесены меню «Вложить блок»/«Поднять на уровень выше», поиск
и действия над current/hovered/sparse blocks, адаптивные отступы 12-level native
bullet/ordered/task lists и общий read-only parser публичных списков. Сохраняются
точный выбор/caret, checked state, marks, цвета, отдельный Undo и save/reload.
При 320px последний абзац нативного списка раньше становился width 0; теперь
доступен без descendant overflow. Публичное чтение прежде оставляло 0–1 li вместо
12 уровней; теперь сохраняет структуру и состояние чек-листа.

Предыдущий comprehensive session 2099 завершился **FAIL**: 99 editor PASS до
`quote: preserve all four selected block units`, 485 sources не менялись.
Нормализация первого абзаца многоабзацной legacy quote ошибочно выбирала весь
контейнер. Исправление сохраняет отдельные paragraph units и собственные quote
parents с детьми в explicit Nested. Unit и целевой mixed conversion до переноса
следующего набора — 8 PASS. Старый общий аудит не заявляется успешным.

Проверки актуального основного дерева:

- Unit: **623 PASS / 1 SKIP / 0 FAIL**, 624 total; `/tmp/rollapp-text-tree-final-unit.log`.
- UI: PASS, 37 primitives / 68 JSX; `/tmp/rollapp-text-tree-final-ui.log`.
- Build: PASS, прежнее предупреждение chunk >500KB; `/tmp/rollapp-text-tree-final-build.log`.
- `--nesting-only`: **8 PASS**, exit 0; `/tmp/rollapp-text-tree-final-nesting.log`.
  Native Tab/Shift+Tab, cursor/group/parent, drag selected/unselected parent,
  Undo/duplicate/delete, heading/toggle, task children, save/reload/public read,
  heading rhythm, deep12 ordinary hierarchy, menu touch-selection entry/search/groups/hover target.
- `--deep-lists-only`: **8 PASS**, exit 0; `/tmp/rollapp-text-tree-final-deep.log`.
  Три вида × 12 уровней, native typing, точный save/reload/public hierarchy,
  checked state, body 18/28/400, все frames, root и descendant overflow/API guards.
- `--conversion-only` после полного переноса: **8 PASS**, exit 0;
  `/tmp/rollapp-text-tree-final-conversion.log`. Quote regression устранена в текущей
  полной композиции, включая новые menu actions и public renderer.
- Все размеры: 320×844, 390×844/400, 768×844, 820×844, 1024×844, 1440×844, 1920×844.

Новый comprehensive завершился со статусом **failed**, exit 1,
editor PASS до завершения: 42. Source drift: [].
Лог `/tmp/rollapp-text-tree-final-comprehensive.log` и JSON с тем же префиксом.
Успешная общая проверка этой версии не заявляется.

Локальный API обновлён: supervisor **22680**, backend **22683**, frontend **22713**,
keepalive включён, API/frontend готовы. Первый enable успел выполнить bootout,
но его stop-проверка пересеклась с завершением старого PID. Подтверждены отсутствие
старого процесса и штатное удаление его PID-файла; повторный enable восстановил
управляемый сервис. PID-файлы вручную не удалялись, посторонние процессы не затронуты.

Теперь `dev.mjs` принудительно использует `ROLLAPP_DATABASE_INITIALIZATION=verify`.
Startup выполняет READ ONLY transaction, сохраняет reserved-usernames guard,
проверяет auth/document columns через LIMIT 0 и не запускает schema/data migrations,
backfill или reservation cleanup. Функция проверена на exact configured production
через direct TLS: `SHOW transaction_read_only` — on, только SET/SELECT;
`/tmp/rollapp-nesting-existing-database-readonly.log`. Новый backend напечатал
`Existing PostgreSQL schema verified without migrations or data cleanup.`
Это проверка auth/document schema, не аудит всех таблиц. Полный прежний production
migration path сохранён без его выполнения. Новый API validator уже загружен.

Live read-only «Карьера → О себе»: menu rows 48px, toolbar 0, borders/outline 0,
shadow none, Geist 18/28/400, root overflow false. Нативный Cmd+/ сохранил scroll
178 и source top 318; menu top114/bottom704 при viewport720. Escape закрыл меню,
DOM text неизменен, статус «Все изменения сохранены». Собственные вкладки 29/30 закрыты.
Locator.press в первой диагностике фокусировал весь textbox и менял scroll;
нативная проверка устранила этот артефакт тестового взаимодействия.

Dependency graph/lock не менялись: production audit — 0, development — 7 high.
Совместимый audit-fix dry run на независимой package/lock copy оставляет 7 high;
major downgrade shadcn не выполнялся. `git diff --check` PASS перед общим прогоном.
Production test data не сохранялись, схема/данные не изменялись, деплой не выполнялся.

Остаются реальный iOS/Windows/IME, полный аудит вложенных clipboard/цветов/границ,
перенос через fixed answer sections, table/media interactions и остальные R1–R10.
HTTP body limit 256KB прежний: budget валидатора 600000 символов не является
обещанием транспортного размера. Меню/списки прошли указанные сценарии, а не всю цель.
