# Общая модель блоков — 18 октября 2026

HEAD `710457583a873ce56b93d4eb26849731164f5b2d`, dirty. [JSON](notion-logical-block-move-verification-2026-10-18.json).

В основном коде: единый логический rail для текста и пунктов списков; перенос
через fixed questions; восстановление marker attrs/ordered segments/colours/
checked children; соединение новых совместимых списков без переписывания
нетронутых wrappers. Внутренний native drag использует реальные nodes и snap
guide, сохраняет BlockSelection/Undo и отменяется при Escape/doc/access change
без fallback старого HTML. Drag ownership снимается до dispatch; BlockSelection
не выдаётся внутреннему ProseMirror mapper за NodeSelection.

Также перенесены fixed strategy до первого измерения меню и упаковка более30
Markdown storage chunks в прежнюю API shape. Живая read-only последовательность
с offscreen выделением дала ровно8px gap (selectionTop310/toolbarBottom302 при
scroll432), затем collapsed selection/toolbar0/unchanged HTML.

Main unit644:643PASS/1SKIP, UI/buildPASS. Main targets:9 first-selection,8 long
answers,8 question moves,2 native drags,1 guard scenario with3 modes. Кандидат
прошёл по8 размеров logical lists, question moves, nesting и sparse. Часть
кандидатских матриц предшествовала дополнительному drag metadata guard; новый
общий прогон основного кода обязателен и не подменяется этими результатами.

Chart failure в предыдущем comprehensive воспроизведён controlled slow-font
сценарием: после третьего click targetTop624/bottom844 при rail120 и незавершённом
пределе scroll; fonts уже loaded. Предполагается конкуренция native focus/fragment
smooth scroll, а не ошибка чисел/цветов. Переход теперь мгновенно ставит focused
target на rail, сохраняя нативный href/history и modified click. Новые проверки:
2 controlled slow-font PASS и полный reports24PASS. Failure trace/screenshot
остаются в `/tmp/rollapp-report-anchor-1440-_r_0_-2-0-1.*`.

Прежний main comprehensive прошёл release/editor159, navigation и action rails,
затем упал на chart navigation. Отдельный изолированный editor184PASS завершён
без drift598sources. Эти результаты не переносятся автоматически на новую версию.

Новый main comprehensive ожидает195 editorPASS и9 этапов; пока не завершён.
Source snapshot: `595` файлов. Production development TLS service22680
оставлен включённым. Нет production test writes, migrations, commit/deployment.
Enter semantics, arbitrary styles/clipboard, table handles/media и реальные
устройства остаются открытыми; цель Notion не объявляется выполненной.

Audit текущего неизменного dependency graph: production0, development7high.
Совместимый dry-run ранее оставлял7high; несовместимый downgrade не применялся.
Общий прогон session24320 запущен на замороженных595sources.

Терминальный результат нового comprehensive: **passed**, exit0, editorPASS195, drift[], added[]. Этапы: check:release=passed, test:navigation=passed, test:action-rails=passed, test:identity-reports=passed, test:todo=passed, test:form-pages=passed, test:catalog-page=passed, test:wish-groups=passed, test:drawers=passed.
Это проверка snapshot595, не доказательство полной цели Notion.
