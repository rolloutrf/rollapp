# Курсор нового блока после меню — 2026-10-18

Commit `710457583a873ce56b93d4eb26849731164f5b2d`, dirty workspace. Предыдущий
goal turn: progress — native selection capture перенесён после63 compatibility,
2 main native-reference и живой проверки без ввода. Текущий turn: progress —
подтверждён новый counterexample создания блока; исправление и расширенная
проверка выполняются изолированно.

Main632 с native capture заморожен. Его fresh comprehensive session27645/root
PID99570 подтверждён живым polling; terminal успех пока не заявлен. Этот кандидат
не перенесён и не изменяет исходники/контракты текущего main прогона.

Изолированная копия:
`/var/folders/56/y9x0qcp95zs6ctldh56fs6qh0000gq/T/rollapp-insert-ownership-unb4lkz3`.
Собственный порт5292 и абсолютный Vite cache исключают изменение main cache.
Fixtures используют несохранённые props и блокируют API; production БД не
подменяется, test записи не создаются.

## Подтверждённая ошибка

В настоящей app-header/editor композиции390×400 длинный code block прокручен к
середине. Через Ctrl/Cmd+/ → «Добавить блок выше» → Text создаётся новый абзац.
После650ms фокус и DOM/model caret принадлежат новому абзацу (head9), но его
top4.5 находится под header bottom56. Писать вслепую не должно требоваться.
Baseline exit1: `/tmp/rollapp-insert-ownership-before.log`; screenshot
`/tmp/rollapp-insert-ownership-before-390-400.png`.

Кандидат возвращает focus перед dispatch успешной insertion transaction и
использует общий explicit authoring caret intent после неё. Не selectionchange,
scroll или отмена меню. Существующие schema/depth/readonly guards и границы Undo
сохраняются. Для новых ячеек раскрывается их собственный scroll owner.

Первый вариант выявил fractional scroll rounding: top63.5 вместо минимум64.
Общий observer теперь округляет scroll delta наружу (floor отрицательного,
ceil положительного), сохраняя8px clearance. Две исходные проверки проходят:
390 top64.5/header56 и1440 top80.5/header72; native caret parity, немедленный ввод,
нетронутый code/neighbours и отдельные Undo. Exit0:
`/tmp/rollapp-insert-ownership-fixed2.log`.

## Незавершённые проверки

Расширенная матрица дополнительно проверяет код, большие таблицы, колонки,
произвольное вложение, toggle и четыре ответа, создание выше/ниже, несколько
типов, save/reload и сохранность исходных text blocks/marks/attrs на8 размерах.
Первая диагностическая версия показала bottom772.125 при границе772; требуется
сверить native Range с PM coords и проверить реальный context клика в таблице.
До такой сверки она не доказывает table-context coverage. Не ослаблять assertions
молча и не объявлять частичный результат полной матрицей.

Unit683 дал5 отказов: существующие fake EditorView не реализовали focus API,
теперь используемый командой. Обновление fixture API и повторный прогон ещё
нужны; продуктовый guard нельзя заменять optional call ради зелёного mock.
UI37/72 и build прошли, но сами по себе не доказывают исправление. Логи:
`/tmp/rollapp-insert-ownership-unit.log`, `...-ui.log`, `...-build.log`,
`...-matrix.log`, `...-matrix2.log`.

После финальной версии нужны стабильный source snapshot, подходящая совместимость
и fresh main full при переносе. R1–R10, реальные device/IME, media и произвольный
clipboard/styles остаются открытыми. Цель active, разрешения на deployment нет.

## Дальнейшие доказательства

Native trace подтвердил причину нижнего расхождения: новый blockquote впервые
загружает italic Geist. Первая layout высота caret21, после fontDone23; scroll
уже выполнен, поэтому bottom меняется с771.125 на772.125. Это не PM/native
разница: collapsed native Range пустой, fallback PM coords используется и самим
observer. Исправление сначала раскрывает caret, затем сверяет окончательные
метрики шрифта только для того же native range/intent. Generation, wheel/touch,
новый selection, blur/access/destroy отменяют устаревшую работу. Трасса исправления
показывает дополнительный1px scroll и bottom771.125; текст/selection не меняются.

Final unit683/682PASS/1SKIP, UI37/72 и build PASS на этом hook. Расширенная новая
матрица использует64 subcases на8 размерах; реальные held italic font responses
на390×400/1440×400 проверяют settle, wheel, новый click selection и отзыв доступа.
В первой font-cancel fixture model был прочитан раньше native click selectionchange:
ожидался устаревшийhead1051, фактически корректныйhead7. Теперь setup ждёт2frames
и явно подтверждает другой DOM/model caret до разрешения font response. Assertions
сохранности документа/range/scroll не удалены. На390 все четыре режима прошли.

Compatibility выявил runtime регрессию до переноса: `executeBlockCommand` создаёт
настоящий staged editor facade с `view.dispatch()` без `view.focus()`. Прямой новый
focus в helper бросает TypeError при slash divider; это **не** unit mock failure.
`/tmp/rollapp-insert-ownership-compatibility.log/json`: exit1,0 PASS,source drift0.
Нужны no-op focus у staged view и реальный focus/reveal владельца при успешном
commit, сохраняя единую transaction/Undo. Candidate не перенесён; следующий
compatibility должен включить basic blocks, slash и block action menus.

Текущий точный статус процессов/снимков — в соседнем JSON. Предыдущая compatibility
ошибка не переименовывается в PASS. Для следующего controller byte offset log.tell
нужно читать из bytes, а не срезать decoded Unicode строку; первая ошибка здесь
произошла на runtime TypeError, до проявления возможного дефекта счётчика.

Final isolated633: staged facade теперь имеет no-op focus; реальный view получает
focus только после успешного построения команды, перед owning transaction dispatch,
а caret intent — после commit. Basic8 и slash8 снова PASS, общая compatibility90
ещё выполняется (64557). Byte-offset reader исправлен; прежний failed report сохранён.

Новая полная матрица завершилась exit0:8 viewport records,64 insertion subcases и8
настоящих delayed-font/cancel scenarios. Source633 drift0. Лог:
`/tmp/rollapp-insert-ownership-final-matrix3.log`. Final unit683/682PASS/1SKIP,
UI37/72/build exit0; соответствующие `...-final-unit/ui/build.log`.
Desktop неоднозначность «Добавить блок ниже» (gutter icon и menu row) исправлена
семантическим scope actual «Действия текстового блока» dialog; не first()/force.
Предыдущий failed matrix2 сохранён. Просмотрен screenshot320×844; курсор находится
над нижней навигацией, текстовых рамок не добавлялось.

Main632 fresh comprehensive завершился exit1 после142 editor PASS на wide table
edge-scroll wait (R0C4 right <= wrapper right−48). Source/extra drift0, added0,
font denials0; остальные8 comprehensive stages не запускались. Main native2, styles,
question moves и axis controls/guards прошли в этом прогоне, но общий успех не
заявляется. Контрольный main `--table-wide-only`50192 выполняется отдельно, с новым
портом/кэшем. Кандидат633 пока не перенесён; seven-path diff и runner без временного
fs.allow находятся в `/tmp/rollapp-insert-ownership-proposed.diff` и `...-proposed-paths.json`.

Current promotion: оба кандидата прошли combined63/source drift0/added0 иперенесены вmain633 через10 reviewed source paths. Main targeted14 иfresh311/nine-stage comprehensive выполняются; authoritative текущий статус — notion-text-authoring-combined-verification-2026-10-19.json. Исторические failed/running записи выше не заменяют этот результат.
