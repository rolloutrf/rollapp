# Изменение размера изображений: 2026-10-19

Статус: **progress, изолированный source646, не перенесён в приложение**.
Актуальное состояние: main642 full2 terminal failed227/367 (column preview
cancellation). Candidate full375 first attempt failed0 on non-text focus return.
Synchronous model-owned selection restoration then passed native image8 and
selection8. Reviewed portal-owner fix applied only after both terminal results;
native focused-control/other-editor hover probe now2 guides (before4). Fresh
frozen646 gates:711unit/710PASS/1SKIP, UI37/74/buildPASS. Full375 editor matrix
session44250/PID5645 running; no automatic promotion. All earlier running/waiting
statements below describe previous phases. Latest phase lives in this paragraph
and the machine-readable report. Goal/openR1–R10 remain active.
HEAD710457583a873ce56b93d4eb26849731164f5b2d/dirty. Main642 full1 завершился
failed80/367 наустаревшем ожидании последнего имени«Таблица». Runner-only
strict11PASS (8viewport+3shared) исправление перенесено; fresh main full2
367/nine-stage подтверждён live92362/session67234, inputs снова заморожены.
Dev85976/API/frontendready наconfiguredproductionTLS оставлен включённым;
продакшен-записей радиQA не было. Предыдущий turn — progress.


[Официальный Notion media guide](https://www.notion.com/help/images-files-and-media)
описывает две боковые ручки иперетаскивание. Точное anchor/alignment/minimum
поведение этим описанием не доказано и остаётся в аудите совпадения.

Before diagnostic показывает0 resize guides у реально декодированного img.
В isolated source646 добавлены portal-ручки без NodeView/frame и без изменений
типографики/DOM текста. Preview меняет только временный style; commit в одной
транзакции сохраняет attrs/соседей и отделяет Resize Undo от набора. Существующий
канонический width/height adapter используется без изменения схемы/зависимостей.

Prototype2 short PASS (390×400,1440×400) проверил обе ручки, настоящий capture,
пропорции, отсутствие doc writes во время жеста, exact attrs/Undo/Redo.
Unit711/710PASS/1SKIP после исправления fixture expected helper: doc.replaceWith
не существует на PM Node; ожидаемое JSON дерево теперь строится независимо.
Это не продуктовый отказ; все ownership/metadata/Undo assertions сохранены.

Расширенная диагностика ещё выполняется. Её первый expected-caret snapshot
считывал model1 сразу после Tail click при actual native12; guards2 сохраняет
это в логах и сначала ждёт model/native parity, затем проверяет отмену.
Нативный курсор не заменяется устаревшей моделью. Отказы/логи не удалялись.

Следующие обязательные проверки: все cancel/selection/source/access/IME guards,
keyboard/parent bounds, вложенные/table/column owners, один активный editor,
native touch, protected questions, exact save/public/draft/retry, viewport и
compatibility. После полного native8 и gates требуется review перед переносом.
Все открытые R1–R10 сохранены.

[Машиночитаемые доказательства](notion-image-resize-verification-2026-10-19.json).

## Полноразмерные контрпримеры и текущая проверка

Новые short2 после viewport fix проверили настоящий Chromium touch/cancel,
пять nested contexts, protected four-answer save/reload иfailed-save draft/retry,
безframes/API/errors. Shared measureVisualViewport иheader/navigation clearance
исправили guide top63.5 при требуемом64; ширина ограничена реальной content/grid
областью родителя. Stable hover1px image затем воспроизвёл перехватnative click
resize-control. Наружные hit areas иpointer-events:none уline исправили его;
short context2 PASS без force click/увеличения fixture/удаления проверки.

Первая полная67 compatibility остановилась на320×844: оба редактора видны, четыре
рукоятки вместо двух из-за stale NodeSelection первого editor. Это продуктовый
отказ; короткие окна раньше скрывали первое изображение и не доказывали focus
ownership. Исправлены actual DOM focus/hover иfocusin lifecycle. Frozen parent646
проверяет новую67 матрицу;711unit/710PASS/1SKIP, UI37/74/build уже PASS.

Отдельный native-focus-return probe наэтом же замороженном source выявил ещё
один край: первый editor сохранил image NodeSelection после возврата focus, но
его guides отсутствуют из-за старого other-hover flag. Подготовлен2-file fix и
его8-viewport regression; он не внесён поверх текущего родительского прогона.
Guarded controller `/tmp/rollapp-resize-focus-return-gates.py` ждёт parent67PASS,
проверяет exact source/extra hashes, применяет толькоэтотpatch визолированном
дереве иповторяетunit/UI/build +native35. Приfailed parent применение запрещено.
Автоматического переноса вmain нет. Фазы иPASS разных snapshots не суммируются.

Caption/align/file paste-drop, точные Notion edge anchoring/minimum semantics,
произвольные составы иactual-device IME остаются открытыми R1–R10. Новые границы
pixel dimensions не объявляются доказанным совпадением правил Notion.

Основная native resize8 теперь **8PASS** на frozen646:320/390/768/820/1024/1440/
1920×844 и390×400. Parent67 дополнительно завершилcontext8 иimages8; остальные
группы ещё выполняются. Это не закрывает найденный отдельным probe focus-return
случай и не подменяет будущие35/current375 checks. Последний проверенный source/
extra drift0 уmain642 иcandidate646. Parent source не меняется до terminal.

Visual QA просмотрел реальные fixture previews390×400 и1440×400 во время
захваченного жеста: обе ручки, пропорции, обычный текст безframe. Doc/API writes0,
логи `/tmp/rollapp-resize-visual-review.log`, PNG `/tmp/rollapp-resize-current-preview-*`.
Это не пользовательские production данные. Unit711/710PASS/1SKIP, UI37/74/build
наparent focus-owner version прошли; pending focus-return version будет проверена
заново. Source/public/dependency/schema/production data внеавторизованного scope
не изменялись. Main642full2 ещё выполняется, dev85976enabled/API/frontendready.


## Уточнение после terminal родительской матрицы

Родительская67 завершилась **failed41**: resize8/context8/images8/layout8/reader8
прошли, surface320 прошёл, surface390×844 остановился на ожидании панели.
Source/extra/added drift0. Tables/gutter не запускались. Guard95776/session92931
завершился1 **до мутаций**, потому что требовал parent67PASS. Он больше не ждёт.
После terminal исходный reviewed2-file focus-return patch применён вручную как
новая изолированная итерация; backup manifest сохранён в/tmp. Main не менялся.

Повтор surface11 до изменения фокуса прошёл; это показывает непостоянство,
а не исправляет исходный отказ. Отдельный fault-injected native probe устойчиво
воспроизвёл потерю Range41 при задержке selectionchange80ms. Контрпример
сохранился при удалённом resize-компоненте. Встроенная ProseMirror focus-обработка
через20ms восстанавливает старую модель до импорта native range. Изолированный
late-priority adapter сохраняет public Tiptap focus/blur и lifecycle наблюдателя,
пропуская старое восстановление. Probe после фикса: Range41 сохранён на40ms,
после события model22..63 и одна панель. Private adapter guarded и привязан
к установленной версии; broad selection/caret/input compatibility ещё обязательна.
Этот механизм не объявляется доказанным точным объяснением исходного surface41:
у первоначального отказа не было native trace. Матрица selection8 выполняется
с forward/backward/caret, callback/isFocused/class проверками и прежней геометрией.
Симулированная задержка не заменяет actual-device IME. Переноса вmain нет.


## Проверка живой страницы и новые контрпримеры

На main642 с настроенным production API проверена настоящая страница «О себе»
в IAB44 без ввода/сохранения. Desktop: first-line/plus/grip centers **360/360/360**,
control48×48; mobile390×844: body18/28. Border0 со всех сторон, outline:none,
box-shadow:none и root overflow:false в обоих размерах. Скриншоты просмотрены.
Временный viewport сброшен, собственная вкладка закрыта; prodwrites0.

Native first-pointer column regression: before ожидал separator, получил
underlying prose; after3PASS (390×400/1024×844/1440×400), exact captured owner,
source/access cancellation preserved. Main не менялся. Resize full375 затем
failed0 на image selection после native focus return: non-text selection теперь
восстанавливается через public view.focus синхронно, без позднего text reset.
Текущая image8 проверяет это изменение. Отдельный native probe выявил common
portal ownership: focused first guide + hover second image =4 controls. Owner-id
и hover-handoff two-file patch staged за пределами frozen runner; ещё не применён.

Audit:7 high только development chain; omit=dev0. [Primary advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)
не перечисляет patched version. Несовместимый откат shadcn не выполнялся;
зависимости/lockfile не менялись.


Latest source review:13 source/test paths,4 new files; temporary isolated runner
fs allowance removed from proposed main runner only. Exact old/tested/new hashes
in `/tmp/rollapp-resize-focus-final-proposed.json`,654-line review diff in `/tmp`.
Three contract files prepared, main367 remains unchanged. Frozen646 source/extra
drift0 at last observation. Current full375 and future main nine-stage audit
are still required; neither a build nor partial native results count as completion.

2026-10-19: parent375 terminalPASS, merged53/native +716unit/715PASS/1SKIP +UI37/74/buildPASS, source/extra/added drift0. Image/core13 (4new) +3contracts promoted after strict old/new/tested-hash review; storage5/portal2 retained. Main646/default375 fresh comprehensive9 is running (session32893/root14636); not yet an overall PASS. Link-intent candidate649 remains isolated. R1–R10 open.
