# Рост сетки таблицы — 18 октября 2026

HEAD `710457583a873ce56b93d4eb26849731164f5b2d`, dirty.
[JSON](notion-table-growth-verification-2026-10-18.json).

Изолированный source616 наследует main caret/duplication и anchor correction.
Реализованы hover-plus у нижнего/правого края и corner resize мышью/клавиатурой.
Все контролы48px/20px/radius24, реальные chrome bounds и проверка соседнего текста.
Когда места в nested gutter нет, меню сохраняет доступ к действиям. Мобильные
hover controls не рисуются; существующее контекстное меню остаётся доступным.

Preview меняет только transient state; pointerup/Enter/Space делает одну transaction
и один Undo. Новая строка/столбец получает focus для немедленного набора. Shrink
обрезает spans, сохраняет anchor content и восстанавливает удалённые ячейки Undo.
Shrinking использует destructive variant и явную подпись удаления. Escape,
смена документа/доступа, blur и native capture loss отменяют жест без save.

Kernel prototype выявил потерю header intent при one-cell shrink/regrowth.
Теперь независимые nullable headerRow/headerColumn сериализуются строгим HTML,
старые Markdown таблицы остаются читаемыми. Header toggles/menu edits учитывают
эти flags и нормализуют роли крайних ячеек. Rowspan/colspan, widths, children,
marks и соседний документ сохраняются; лимит1M cells совпадает с reader contract.
Unit665/664PASS/1SKIP/0FAIL. Unit fixture использует настоящий tableEditing
appendTransaction для width repair; runtime не принимает повреждённую сетку.

Initial growth9 +held-pointer guards2 PASS, UI37/70 иbuildPASS. Final source616
зафиксирован, sequence53149 повторяет growth9 (добавлено Space activation),
сохраняет duplication9, table editing8 иreal chrome10: ожидается36 browserPASS,
после нихunit/UI/build. Последовательность пока pending, переноса в main нет.
Wide/nested contexts, native Four Questions growth, real device IME и остальная
матрица ещё открыты. Это не доказательство завершения всей Notion цели.

Source616 terminal: {"status": "failed", "exitCode": 1, "sourceCount": 616, "sourceDrift": [], "counts": {"/tmp/rollapp-table-growth-final-browser.log": 9, "/tmp/rollapp-table-growth-duplicate-compat.log": 9, "/tmp/rollapp-table-growth-tables-compat.log": 0, "/tmp/rollapp-table-growth-chrome-compat.log": null}, "promoted": false, "fullEditorPending": true, "finishedAt": "2026-10-18T17:41:51.762676+00:00"}. Полная матрица не закрыта; переноса нет.

616 compatibility выявил настоящее reader regression: root table с header flags не распознавался старым exact marker и печатался как literal HTML. Не объявлен успешным и не перенесён. Reader prefix исправлен в кандидате, strict canonical validator сохранён; добавлен public-read после native grid growth. Новый snapshot public-fixed и27targetcases (table8 +growth9 +chrome10) проверяются заново; перед ними18cases иguard2 не подменяют полный результат.

Public-reader repair terminal: {"status": "targeted-passed", "exitCode": 0, "sourceCount": 616, "sourceDrift": [], "counts": {"/tmp/rollapp-table-growth-public-fixed-tables.log": 8, "/tmp/rollapp-table-growth-public-fixed-browser.log": 9, "/tmp/rollapp-table-growth-public-fixed-chrome.log": 10}, "promoted": false, "finishedAt": "2026-10-18T17:46:25.162554+00:00"}. Остальные открытые пункты не закрыты.
