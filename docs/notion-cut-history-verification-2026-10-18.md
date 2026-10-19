# История вырезания и быстрый выбор текста — 18 октября2026

HEAD `710457583a873ce56b93d4eb26849731164f5b2d`, dirty workspace.
[JSON с путями и ограничениями](notion-cut-history-verification-2026-10-18.json).

В изолированной копии воспроизведено слияние native Cut и последующего ввода:
один Undo возвращал вырезанное слово и убирал новое сразу. Кандидат ставит границы
истории до непустого редактируемого Cut и после его native uiEvent; прежние paste
rules, обычный ввод и владение custom four-question cut сохранены.

Восемь viewport cases прошли native Cut обычного и rich текста внутри колонок,
несоседних групп и сквозного диапазона двух ответов. Проверены отдельные Undo/Redo
предыдущего ввода/вырезания/следующего ввода, exact marks/ширины/соседи, возвращённое
выделение и save/reload. Fixtures отклоняют API. Unit680:679PASS/1SKIP/0FAIL,
UI37/71 и buildPASS. Первый UI запуск был ошибкой неполной копииjsconfig.json;
копия исправлена без изменения проверок. Compatibility32 завершилась: exit0,32PASS,source drift[].

Расширенный первый прогон выявил отдельную гонку до Cut: шестая Shift+ArrowLeft
могла пропасть. Trace показывает native remove→emove после keyup. Первое stress
воспроизведение упало на managed repeat9; следующий control дал30 unmanaged и30
managedPASS, что не доказывает устранение intermittent ошибки. Вторая изолированная
копия добавила синхронизацию на keyup, прошла unit682/UI/build, но stress снова упал
на managed repeat28 после30 unmanagedPASS. Этот недостаточный вариант НЕ переносится.
Его дополнительный Cut smoke не считается доказательством исправления выбора.

Pure inherited-colour probe показывает red→default при выходе неокрашенного ребёнка
из red родителя. Явный child blockColor был null. Семантика такого наследования Notion
пока не установлена; материализация цвета не внедряется на основании догадки.

Main629 comprehensive287 terminal: invalidated, exit1 после77 editorPASS. Во время
прогона изменились6 исходников и появилсяcollection-snippet-media.jsx; эти изменения
сохранены. Сам отказ — fixture question-move ожидает start-of-line от bareHome наmacOS.
Источник, команды и все исходные offset1/structure/Undo assertions сохранены;
корректный OS-specific start-of-line setup прошёл8 viewport cases в isolated копии.
Production keepalive22680 оставлен включённым. Кандидат Cut пока не promoted.
Полная цель и все открытые строки R1–R10 сохраняются.

После неуспешного keyup-only варианта подготовлен native-extension кандидат:
Selection.modify(extend,left/right,character) вычисляет диапазон браузером, редактор
фиксирует его в том же событии.30 unmanaged и30 managed стресс-повторов прошли;
unit682:681PASS/1SKIP, reference390×400 со styled/RTL/bidi/graphemes и650ms stability
прошёл. Desktop reference и свежие UI/build ещё выполняются. Это кандидат, не main.

Native-extension prototype не прошёл desktop RTL collapsed-range проверку:
ожидался anchor0/focus1, полученanchor6/focus1.30+30 stressPASS не доказали полной
семантики; вариант отклонён и сохранён отдельно. Следующий кандидат сохраняет
обычный native Shift+Arrow и переносит синхронизацию диапазона в
handleDOMEvents.keydown. По исходнику ProseMirror этот callback идёт раньше
forceFlush; прежний handleKeyDown — позже. Reference/stress проверки выполняются;
успех не заявляется до результатов.

Ранняя синхронизация до ProseMirror forceFlush прошла30 unmanaged+30 managed
stress и2 native reference viewport cases (390/1440×400) со всеми styled/RTL/bidi/
grapheme ranges и650ms stability. Этот вариант и Cut boundaries перенесены вmain;
отклонённые keyup-only/manual-extension варианты не переносились.9 целевых путей
проверены на отсутствие конкурентного изменения перед копией;6 других изменённых
исходников и новыйcollection-snippet-media.jsx сохранены. Свежий main unit/UI/build,
18 целевых browser cases и full295 ещё требуются.

Main631 targeted terminal: {"status": "failed", "records": 8, "results": [{"flag": "--cut-history-only", "exitCode": 0, "expected": 8, "records": 8}, {"flag": "--native-caret-only", "exitCode": 1, "expected": 2, "records": 0}], "sourceDrift": []}. Full295 result is separate.

Живая configured-production страница career/about1280×720 после переноса:
6 native Shift+ArrowLeft выбрали6 символов; последующая проверка подтвердила тот
же диапазон и неизменный textContent. Одна панель: bottom370.5 приselectionTop378.5,
ровно8px gap; border/outline0px,box-shadow none. Не было команд редактирования/
сохранения, собственная вкладка38 закрыта. Main631 targeted18 иcomprehensive295
идут через единыйcontroller2472; источник заморожен новымsnapshot.

Main631 targeted terminal:8 CutPASS, затем expanded native referenceFAIL на390×400,
source drift[]. У collapsed0 formatted-text range Shift+ArrowLeft ожидался collapsed0,
но появился anchor29/focus0 (выделен весь текст). Ранняя синхронизация и isolated
60stress/2referencePASS не закрывают этот контрпример. В main targeted вопросные
переносы не достигнуты; isolated8PASS сохранены отдельно. Main comprehensive631
продолжает работать через controller2472/session14201; не остановлен по таймауту.
Следующая диагностика должна записать native Selection write stacks и dispatch/
updateState вокруг focus/range reset, прежде чем добавлять очередной механизм.
Полное соответствие и R2/R6/R9 остаются явно открытыми.

Main631 Cut/preflush comprehensive terminal: {"status": "cancelled", "exitCode": 130, "editorPassRecords": 15, "sourceCount": 631, "sourceDrift": [], "addedSources": [], "finishedAt": "2026-10-18T20:03:00.195802+00:00", "stages": [{"name": "check:release", "status": "interrupted", "startedAt": "2026-10-18T19:55:50.087Z", "finishedAt": "2026-10-18T20:02:59.971121+00:00"}, {"name": "test:navigation", "status": "not-run"}, {"name": "test:action-rails", "status": "not-run"}, {"name": "test:identity-reports", "status": "not-run"}, {"name": "test:todo", "status": "not-run"}, {"name": "test:form-pages", "status": "not-run"}, {"name": "test:catalog-page", "status": "not-run"}, {"name": "test:wish-groups", "status": "not-run"}, {"name": "test:drawers", "status": "not-run"}], "fontServingDenials": 0}. Remaining goal matrix stays open.
