# Safari и сохранение из панелей: 2026-10-19

Статус: **progress**, main642/storage5+portal2. HEAD710457583a873ce56b93d4eb26849731164f5b2d/dirty.
Предыдущий turn был progress: storage5 перенесён и проверен вmain. Этот turn
добавил настоящую native Safari проверку и исправил подтверждённую keyboard ошибку.

## Нативный Safari

В отдельном private window через cua проверен реальный desktop Safari, без
safaridriver и без включения Remote Automation. Test host наlocalhost перехватывал
все используемые /api/ paths до proxy; onSave отправлял только fixture source
на отдельный локальный endpoint. Production API requests/writes0. Captured source
подтвердил Cmd+I на `middle ` с пробелом, native Undo/Redo (redo byte-identical),
Cmd+K/unlink с сохранением соседнего курсива, editor reopen и public reading
без возвращённой ссылки. Единственная formatting toolbar визуально примыкает
к native selection; рамки текста нет. Screenshot сохранён без редактирования.

Кириллица дала trusted native insertText events и exact source. Emoji появился
через native clipboard; отдельные Undo/Redo сохранили соседний текст. Сам
cua typeText не доставил non-BMP emoji events; это ограничение ввода в harness,
а не доказанная потеря в редакторе. Clipboard operation была прервана, после
чего свежий AX показал ровно ожидаемый emoji; посторонний текст не вставился.
Option+E в текущем input source ввёл `ќ`, composition events0/isComposing=false.
Это **не IME и не iOS/Telegram/device proof**. Исходный input source не менялся.

Поздние user-change guards прервали focused-panel пробу. Попытка закрыть только
созданное private window привела к AX timeout; закрытие не подтверждено. Safari
не завершался, не перезапускался и не убивался. Два собственных fixture hosts
11612/12148 остановлены после проверки exact argv; terminal143 сохранён. Постоянный
production keepalive85976 и родительский test5645 не затрагивались.

## Сохранение из портала

Независимый Chrome native-key counterexample: при реальном focus в link input
Ctrl/Cmd+S даёт defaultPrevented=false и не flush-ит dirty document. После фикса
true, ровно `First document FIRST` сохранён сразу, другой editor сохраняет
свою очередь, pending address остаётся без применения. Safari panel probe была
прервана и не используется для объяснения этой ошибки.

Section React capture сохраняет portal owner, обрабатывает Save только за
пределами ProseMirror DOM и вызывает очередь именно этого документа. Внутри
редактора остаётся прежняя native-input/mutation обработка. Новая regression
проверяет два одновременно dirty editors и pending metadata на8viewport;
main default367 не изменён. Backup5paths содержит2source/test+3contracts.
Main unit711/710PASS/1SKIP, UI37/73/build/native10 завершились PASS; source/extra/added drift0.

Отдельный combined child646 (после terminal прежних29+long8) получил эту же
обработку, browser regression и Save из image resize control. Его unit716/715PASS/1SKIP и UI37/74/build завершились PASS; native53 продолжается.
Parent375 завершился PASS, exit0, source/extra/added drift0; это отдельная версия
до storage5+portal2 и не результат полного merged375.
Historical13 proposal сохранён; merged RichTextEditor row имеет testedHash=null
и requiresMergedVerification=true. Нельзя переносить эту merged версию как
автоматически проверенную старым375. После обоих terminalPASS нужны review,
точный перенос оставшихся image/core13+rebased contracts и fresh main375/9stages.

Полный goal/R1–R10 сохраняется. [Точные фазы, пути и результаты](notion-safari-keyboard-verification-2026-10-19.json).

Новые Chrome native-key counterexamples сохранены отдельно: Cmd+K в пустом
блоке оставляет невидимый stored link mark без текста; после полной замены
документа pending форма остаётся и может назначить stored mark уже чужому
контексту. Probe `/tmp/rollapp-link-intent-probe.mjs` воспроизвёл оба отказа.
Это пока открытые ошибки, не Safari evidence и не исправление.

Combined child завершился **53/53 native PASS**, unit716/715PASS/1SKIP,
UI37/74/buildPASS; source/extra/added drift0. После review657diff lines и
строгой проверки старых/новых/проверенных hashes перенесены оставшиеся13paths
(4new files) +3contracts; storage5/portal2 сохранены. Runner временный realpath/fs
allow изолированного дерева не перенесён; остальные12paths byte-identical tested.
Main теперь646sources/default375. **Fresh check:comprehensive запущен**,
controller session32893/root14636, snapshot10extra inputs, dirty357paths;
общего результата ещё нет. Предыдущий375 не выдаётся за merged comprehensive.

Повторный npm audit:7high в dev tooling chain, production audit0. Последняя
braces3.0.3 всё ещё входит в advisory range; несовместимый force downgrade shadcn
не выполнялся. Постоянный dev85976/API/frontendready оставлен; own fixture12674
остановлен с exact argv check/session84053 terminal143.

Живой main646 review после переноса:1440×844 first-line centre422 и оба control centres422, controls48px; 390×844 body18/28. На обоих frame0/outline0/shadow none/root overflow false, idle toolbar0 и saved status. Текст не менялся, production writes0; own IAB46 закрыта, viewport reset. Screenshots без редактирования `/tmp/rollapp-image-core-live-desktop.jpg` и `/tmp/rollapp-image-core-live-mobile.jpg`.
