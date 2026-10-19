# Таблицы, шапка и edge-scroll — 18 октября 2026

HEAD `710457583a873ce56b93d4eb26849731164f5b2d`, dirty. [JSON](notion-table-chrome-verification-2026-10-18.json). Main snapshot608; expected editor228.

С корректной реальной вложенностью app-page → sphere-text-page источник605
воспроизводит недоступную ручку столбца: её rect y32…80, центр под app selector
y24…72, native elementFromPoint hit=false. `/tmp/rollapp-table-header-faithful-before.log`.
Теперь placement резервирует bottom настоящей GlobalAppChrome, а при нехватке
места над таблицей использует отдельные gutter slots. Высокая header cell в
коротком viewport не складывает row/column handles друг на друга. 48px/20px
геометрия, gutters8px, fonts, page width/insets и постоянная панель не менялись.

Ранняя версия fixture ошибочно объединяла shell и reading классы на одном элементе.
Ложное перекрытие текста не объявляется production дефектом. Fixture теперь
проверяет реальную вложенность и max reading width768; временный x=0 gutter
сдвиг отменён. Верный fixture всё равно подтверждает исходный header hit failure.

Окончательные изолированные target checks23PASS:10chrome cases (включая mobile keyboard menu,
1024×400 one-row table,1440×400 tall header),2wide pointer edge-scroll,9axis и2guard.
Native column drag прокрутил единственный horizontal owner на372px к невидимому
столбцу; attrs/widths/children, Undo/Redo и reload точны. UI проверяет control
hit-testing, pair/header overlap, Range overlap с текстом, menu cancel, no writes/API
и root overflow. Unit656/655PASS/1SKIP, UI/build exit0; код перенесён в main.

Предыдущий comprehensive605 намеренно остановлен после99editorPASS (exit143,
drift0), потому что найден настоящий header defect. Он не является завершённой
регрессией. Остановлены только12принадлежавших тесту процессов после проверки
PID/команды/cwd/дерева; production dev22680/API22683/frontend22713 исключены и
остались здоровы. Новый source608 full228 и9этапов ещё нужно проверить; goal active.

R8 duplicate/grow/media/arbitrary groups, nested Enter, полный clipboard/styles
и настоящий device keyboard/IME остаются открытыми. Этот отчёт не закрывает всю цель.

Окончательный corrected fixture + первоначальный gutter8px перенесены в main.
Таблица с единственной header row на1024×400 и высокий header на1440×400 включены
в10chrome cases; mobile проверяет открытие/отмену настоящего Ctrl/Cmd+/ меню.
Нет изменений production widths/page insets. Fresh run72580 ожидает228editorPASS;
main targeted sequence22348 ожидает12PASS. Полная цель остаётся открытой.

Main source608 targeted sequence22348 завершён exit0:10chrome+2wide=12PASS, drift0. Controller2055 опрашивает comprehensive72580; полный228результат ещё pending.

Main comprehensive terminal: **failed**, exit1, editorPASS228, source608 drift[], added[], fontDenials0. Stages: check:release=passed, test:navigation=passed, test:action-rails=passed, test:identity-reports=failed, test:todo=not-run, test:form-pages=not-run, test:catalog-page=not-run, test:wish-groups=not-run, test:drawers=not-run. Goal remains active unless separately proven complete.
