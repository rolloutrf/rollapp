# Курсор, дублирование и графики — 18 октября 2026

HEAD `710457583a873ce56b93d4eb26849731164f5b2d`, dirty.
[JSON](notion-caret-table-anchor-verification-2026-10-18.json).

В main перенесён source611: native caret reveal +дублирование строк/столбцов.
Main targeted29PASS (9caret +2native parity +9offscreen +9duplication), unit660:
659PASS/1SKIP/0FAIL, UI37/69 иbuildPASS. Перед следующей правкой source drift0.

Предыдущий comprehensive608 terminal exit1/drift0: все228editor иrelease,
navigation иaction rails PASS. Identity reports упал на Hogan1024: цель в focus,
font loaded, scrollY64 при максимуме76. Изолированный20-cycle probe повторил
это при стабильной высоте920; принудительный instant scroll достигает76.
Native focus/fragment reconciliation завершался после click. Коррекция через
два кадра привязана к прежнему active target/hash и отменяется на unmount/new jump;
обычный href и browser history сохраняются. Candidate20stressPASS и первоначальный
main Hogan12PASS; теперь дополнительно проверяется реальный Back/Forward.

Main source611 зафиксирован в `/tmp/rollapp-anchor-main-sources.json`.
Supplemental51283 выполняет Hogan12 с history и пять ранее не запущенных gates:
To Do, form pages, catalog, Wishlist groups, drawers. Это не новый полный
comprehensive: всех246editor cases на новом source ещё нет. Goal active.
Production dev22680/API/frontend здоровы; production writes не выполнялись.

Supplemental terminal: {"status": "supplemental-passed", "exitCode": 0, "sourceCount": 611, "sourceDrift": [], "counts": {"/tmp/rollapp-hogan-anchor-main-history.log": 12, "/tmp/rollapp-anchor-main-todo.log": 29, "/tmp/rollapp-anchor-main-form-pages.log": 128, "/tmp/rollapp-anchor-main-catalog.log": 7, "/tmp/rollapp-anchor-main-wish-groups.log": 16, "/tmp/rollapp-anchor-main-drawers.log": 92}, "needsFreshComprehensive": true, "finishedAt": "2026-10-18T17:46:50.411976+00:00"}. Новый полный comprehensive246 ещё нужен.
