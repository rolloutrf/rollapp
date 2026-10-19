# Точность хранения форматирования: 2026-10-19

Статус: **progress; storage5 перенесён в main642**, image/core13 остаются
в isolated646. Пять подтверждённых потерь хранения исправлены в локальном
приложении после child716unit/715PASS/1SKIP, UI/build, model10000, native29 и
long-answer8PASS/source-extra drift0. На main прошли711unit/710PASS/1SKIP,
UI37/73/build и native styles10 с точными save/reload/public assertions.
Main default367 не менялся; parent default375 ещё идёт. Полного объединённого
comprehensive результата пока нет. Пять source/test paths + только storage
параграфы трёх контрактов перенесены сexact hashes/backup, без parent-focus/
resize-contract claims. Все ранние pending/running ниже относятся к прежним фазам.
HEAD710457583a873ce56b93d4eb26849731164f5b2d/dirty. Предыдущий goal-turn был
progress: native focus/portal ownership и first-pointer column counterexamples
исправлены в изолированной версии; parent375 сейчас выполняется. В этой итерации
родительские источники заморожены; child меняет только хранение inline-форматирования.

Детерминированная генерация валидных schema документов нашла три контрпримера:

- Seed66: пробел в конце курсивного фрагмента внутри абзаца теряет курсив после
  reload. Старый test helper сравнивал whitespace без marks и скрывал потерю.
- Diverse seed33: буквальный URL, у которого нет link mark, превращается в ссылку
  при GFM reload. Это нарушает явное снятие ссылки автором.
- Diverse seed657: bold `**literal**` рядом с italic текстом превращается в
  неоднозначную цепочку Markdown delimiter; reload меняет текст и теряет bold.

Первые два исправления внесены только в child: канонический inline HTML
сохраняет собственные marks пробелов и явно нессылочный текст. Обычный Markdown
import продолжает autolinking. Test helper теперь сравнивает marks каждого
символа. Unit713/712PASS/1SKIP, diverse500exact round tripsPASS; расширенные10000
остановились на seed657. Это отдельные выборки, не доказательство всех составов.
Native style10 выполняется: восемь размеров с настоящими Cmd+I, link form,
Undo/Redo, save/reload и public rendering; два прежних light-reader cases сохранены.
Третий fix будет внесён только после terminal style10, без мутации frozen run.

DB/API в этих проверках не используются, browser fixtures отклоняют API.
Configured production keepalive85976 оставлен, тестовых production записей нет.
Полный goal и R1–R10 остаются открытыми. [Точные логи и фазы](notion-inline-storage-verification-2026-10-19.json).


## Следующая итерация: границы marks, literal ++ и дочерние блоки

Seed657 сведен к отдельному minimal before артефакту: heading4 с bold literal
stars сразу перед italic emoji. Source/actual/expected подтверждены повторно на
старом parent, new canonical run-boundary storage сохраняет точную границу.
Первый 10000-run перезаписал общий файл следующей ошибкой; прежний log657
сохранён, минимальная репродукция находится в отдельном versioned JSON.
Теперь имена контрпримеров различаются, исходный отказ не считается исчезнувшим.

Seed753 показывает structural потерю: uncoloured list item p+hr превращается
в p с буквальным newline---. Для extra paragraph/divider/heading/code/media
детей используется существующий strict canonical HTML adapter. Вложенные
внешние владельцы и простые p+sublist сохраняются. Unit715 выявил следующий
реальный случай literal++ → underline; delimiter теперь сохраняется явно, а
существующий Markdown import++ по-прежнему создаёт underline. Оба исходных
отказа сохранены в логах/JSON, assertions не удалялись.

Последняя child версия:716unit/715PASS/1SKIP, UI37/74/buildPASS,10000 diverse
schema-valid model casesPASS. Generator coverage:23 node types incl.doc, six
mark types;1–4root blocks, depth<=11, max721nodes,149132uncoloured/446369coloured
blocks. Link mark combinations отдельно покрываются unit fixtures. Это конечная
выборка, а не доказательство всех допустимых документов.

Native29 включает прежние style cases и реальные Cmd+I/Undo, снятие ссылки через
форму, adjacent bold/italic literal delimiters, literal++ после набора, три вида
list item с отдельнымhr: exact save/reload/Undo/public и сохранение соседей.
Отдельные long-answer8 проверяют packing/drafts/retry, поскольку canonical HTML
может увеличить размер источника. Main не изменялся;5source/test paths/192-line
review diff и3contract files подготовлены. Source/extra hashes контролируются,
external model script hash сохранён отдельно. Нужны terminal результатов,
review совместного overlay и fresh main comprehensive после переноса.


## Перенос и проверка main

Независимый storage overlay5 не пересекается с13 ещё изолированными image/core
файлами. Перед переносом проверены child final29, external model script hash,
long8 и полный старый main snapshot/10extra inputs; backup иmanifest сохранены
в `/tmp/rollapp-inline-storage-main-backup`. Контракты main получили только
storage paragraph, current367 сохранён. Будущие image contracts rebased наэто
добавление; родительский375 код иextra inputs не менялись. Commit/PR/deploy нет.

Fresh main gates:711/710PASS/1SKIP, UI37/73/buildPASS, native10PASS, source/extra/
added drift0. Это целевой storage audit, не comprehensive приложения. Финальный
main comprehensive нужен после объединения подтверждённых image/core изменений;
предыдущая642 full2failed227 наcolumn resize остаётся историей, не зелёнымрелизом.

Live current main review:configured-production page открыта в temporaryIAB45
без ввода/Save. Desktop43paragraphs/7headings/29links, body18/28; mobile390×844
scale1/contenteditable=true. Frames0/outline:none/shadow:none/root overflow0.
Оба окончательных screenshot просмотрены; первый переходный screenshot при
сменеviewport не использован как layout proof. Viewport сброшен, tab45 закрыт.
Keepalive85976/API/frontendready оставлен. QA prodwrites0. Goal/R1–R10 активны.

Mobile engine availability checked read-only: simctl utility is unavailable and the configured Playwright WebKit executable is absent. No Simulator/WebKit/physical-device IME result is claimed. This does not block other open goal work. Main/parent source+extra drift0; parent process5645 remains live.
