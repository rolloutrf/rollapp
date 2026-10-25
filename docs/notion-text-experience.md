# Соответствие работы с текстом Notion

Цель пользователя — идентичный опыт работы с текстом. Это открытая цель;
прохождение отдельных тестов редактора не доказывает её выполнение.
Сохраняются явные требования Rollapp: Geist 18/28, общая семантическая шкала,
контролы 48px, отсутствие рамок у текста и постоянной панели форматирования.

Сопоставление опирается на пользовательские примеры и официальные страницы
[ввода и редактирования](https://www.notion.com/help/writing-and-editing-basics),
[клавиатурных команд](https://www.notion.com/help/keyboard-shortcuts) и
[оформления](https://www.notion.com/help/customize-and-style-your-content).
Полный объём возможностей ниже сохраняется между итерациями.

Release checkpoint 2026-10-20: production9522341 подтверждён успешным
CI39402041896 и exact public health/live UI. Следующий caption-кандидат
`08e878a6ef4ae355a143bc7efc6ca7bcb6a23172` прошёл полный frozen comprehensive:
417 editor PASS, все10 этапов exit0,990 tracked inputs drift0 и clean start/end.
Подписи — rich inline content в общей истории/очереди документа; проверены
native clipboard, resize, nested/column/table/fixed-question contexts и draft/retry.
Перед публикацией добавлена только документация, без runtime/package/lock правок.
Новый rollout требует отдельного exact SHA health и live UI; локальный PASS
не заменяет production proof. [Caption report](notion-image-caption-verification-2026-10-20.md).
R1–R10 остаются открытыми: viewer/прочие media, полный аудит произвольных составов,
точные Notion edge/minimum/key semantics и реальные iOS/Telegram/IME.

История предыдущего объединения 2026-10-20: совмещены inline styles/quote/link metadata,
native clipboard/history/focus, file paste/drop и image alignment с tiny-media
hit-area исправлением. Clean `449abb5` прошёл полный `check:release`, включая
409 native editor cases; расширенный десятистадийный comprehensive завершён
PASS/exit0 на том же frozen снимке,984 inputs drift0 и clean на выходе.
Кандидат `508d3e4` дополнительно включает production startup `verify` и две
правки ожидания готовности UI-тестов из `819f5cb`; клиентские/API исходники и
production build идентичны проверяемому `449abb5`. Fresh locked install:
790 unit total / 789 PASS / 1 SKIP, UI37/79 и build PASS. Два обновлённых
harnesses отдельно прошли полные styles10 и four-document8, terminal exit0.
Связанные объекты To Do проверены в полной53-case матрице: «Готово» переносит
выбранные карточки/миниатюры в черновик задачи; сохранение остаётся явным.
Production9522341 теперь подтверждён exact health и terminal CI success всех
шагов; реальный editor8/toolbar/ToDo Done-thumbnail также PASS без сохранения
тестовых данных. [Post-deploy proof](notion-production-result-2026-10-20.md)
сохранён отдельно от runtime952, чтобы не перезапускать релиз ради отчёта.
R1–R10 остаются
открытыми: viewer/прочие media, произвольные сложные составы и
реальные iOS/Telegram/IME нельзя объявлять проверенными по fixture-тестам.
Результаты выпуска: [единая проверка](notion-production-release-2026-10-20.md).

Исторический снимок до этого объединения (не текущее состояние): Production health
подтвердил `d116857ce0aadfeb4e1258fdb1a3ae2abf5e958f`; его CI прошёл Test/build,
deploy и health, но завершился failure на сетевом соединении с Telegram API.
Combined media/link/gutter candidate379a35b завершил comprehensive с отказом
на external-typing-undo после77 editor PASS, source drift0; остальные8 stages
not-run. Добавляется failure-only native/input/history диагностика, причина
ещё не установлена. Quote inherited-italic исправление9a3ed5c и link metadata
проверены отдельно: unit745PASS/1SKIP, quote8 и links8 PASS после сохранённого
первого таймаута; styles compatibility дважды failed (click stability/разделитель
после reload). В main этот storage/runtime не перенесён. Единый clean candidate
bf6a8a1 прошёл760unit PASS/1SKIP, UI/build; новый полный399/comprehensive выполняется
на646 замороженных inputs. Остальные media/вложенные составы,
реальные iOS/Telegram/IME и live UI новой версии ещё не подтверждены.
Подробности: [продолжение проверки](notion-resume-verification-2026-10-19.md)
и [единый снимок 2026-10-20](notion-combined-verification-2026-10-20.md).

Предыдущий снимок на 2026-10-19: **main646/storage5+portal2+image/core13**. Перенесены
ручки размеров изображений, сохранение native selection при возврате фокуса и
первый pointer capture границы столбцов; storage/portal исправления сохранены.
Parent full375 завершился PASS до storage5/portal2. Совместная версия прошла
53native +716unit/715PASS/1SKIP +UI37/74/build, source/extra/added drift0.
После строгого review/hashes перенесены13source/testpaths (4new) и3contracts.
Fresh main375/nine-stage comprehensive выполняется на frozen646sources/10extra
inputs, session32893/root14636, HEAD71045758/dirty357. Это ещё не общий PASS.
Native Safari проверил italic trailing space/Undo/Redo/unlink/reopen/public read,
одну соседнюю toolbar и отсутствие рамки; Кириллица/clipboard emoji прошли.
Composition events0: IME/iOS не подтверждены. Открыты Chrome counterexamples
невидимой ссылки в пустом блоке и pending link после замены source; новый
кандидат изолирован, вmain его нет. Точное empty-link поведение Notion требует
прямой сверки: официальная справка описывает Cmd+K для выделенного текста.
Старый main642full2 failed227 исторический. R1–R10 не закрыты. Dev85976 оставлен,
prodwrites0. Подробности — resize/Safari verification reports за2026-10-19.

| Требование | Текущее состояние | Что подтверждает / чего ещё нет |
| --- | --- | --- |
| R1. Сразу писать в документе, без формы и рамок | Реализовано в прозовых разделах | `InlineDocument`, `EditableTextBlock`, `InlineTextField`; `test:text-edit` проверяет ввод, стили, loading/read-only |
| R2. Одна панель рядом с выделением | Базовое поведение проверено | Native Range, отдельный portal, scroll/viewport/offscreen; `text-selection-position-checks.mjs`. First-offscreen initialization исправлен в main;9 viewport cases и живая последовательность при scroll432 подтверждают8px до selection, без изменения текста. Дополнительные inline-стили доступны в той же панели; на телефоне палитра и типы заменяют её, а не дублируют. Меню проверены при VisualViewport 220px с panning 96px |
| R3. Префиксы при наборе | Расширено в этой итерации | `>` — toggle, `"` — quote, `a.`/`i.` — списки, marks/задачи/код. `text-symbol-shortcuts-checks.mjs` использует реальные клавиши; сохранённый Markdown остаётся совместимым |
| R4. Создание через + и slash, выбор типа | Блоки и основные slash-действия реализованы | Добавлены код, разделитель и таблица; `text-basic-blocks-checks.mjs` проверяет курсор, соседей, Undo и загрузку. Slash теперь отслеживает набранный trigger в существующем тексте, в том числе в середине строки и после Shift+Enter; добавлены duplicate/delete с единым Undo. Полный прогон редактора дал 133 PASS, включая восемь размеров slash и block colours. Добавлены `/red`, `/blue background`, `/default` и меню цвета блока; проверены восемью размерами. Поиск действий, типов и цветов через Cmd/Ctrl+/ реализован и проверен на восьми размерах: группы, меню наведённого блока, Undo, synthetic IME guard, короткий viewport и deep-document переход к созданию/отмена без потери курсора. Полный каталог действий и media ещё требуют работы |
| R5. Перемещение и действия с блоками | Одиночные, последовательные и несоседние группы реализованы | Escape/Shift+стрелки/Shift+клик; перенос, drag, дублирование/удаление группы и Undo. Несоседний выбор через Cmd+Shift/Alt+Shift+клик и grip, точный clipboard, замена/цвет/типы/дублирование/удаление, Undo и выбор через ответы проверены восемью размерами. Номера пропущенных ordered-list сегментов и наследуемые цвета детей подтверждены unit-тестами. Tab несоседней группы и произвольное вложение внесены в runtime. В main единый логический rail для текста/list items, перенос через fixed questions и actual-node drag с guide/guards. Целевые question moves/native drag/guards и базовый полный main595 прошли; свежий общий прогон текущей версии требуется. Document columns, side drag, common picker, keyboard boundary moves, resize, unwrap/delete реализованы в main629; native clipboard/draft/retry проверены. MAIN633 full311 завершился failed281 на group/menu indent820; отдельные повторные сценарии и новый полный аудит требуются. Произвольные вложенные составы и контексты ещё требуют аудита. Clipboard произвольного вложенного состава и inherited style при смене контекста требуют дальнейшего аудита |
| R6. Клавиатурное редактирование структуры | Расширено, частично проверено | Escape → выбор блока → Shift+стрелки → Enter, ступенчатый Ctrl/Cmd+A, группа пунктов через Tab/Shift+Tab. Enter/Shift+Enter, toggle и Tab в таблице сохранены. Добавлено групповое преобразование в toggle с сохранением заголовков/цветов, вложенных пунктов и направления выбора; столбцы сохраняют CellSelection, одиночная команда — точный offset курсора. Shift-клик и Escape через фиксированные секции реализованы: точные блоки, оба направления, native endpoint exclusion, цвет/тип/clipboard/замена, один Undo и save/reload проверены восемью размерами. Произвольное вложение обычного текста и Tab несоседней группы внесены в runtime; их итоговый аудит ещё выполняется. Мобильные действия вложения, sparse/native Tab, родитель с детьми и 12 уровней native lists в editor/public read проверены восемью размерами; macOS Home/End сверены с unmanaged native host, сохраняют selection без конкурирующей анимации; полный аудит остальных переходов по границам ещё нужен. MAIN633 group/menu indent820 failed281 остаётся открытым до воспроизведения и повторного общего прогона |
| R7. Полный набор текстовых стилей | Inline и блочные стили реализованы, аудит продолжается | Bold/italic/underline/strike/code/link, цвет/фон, смешанные диапазоны, сброс, shortcuts, save/reload и публичное inline-чтение. Проверены комбинированные и частичные marks, включая непрерывный code. Четыре ответа теперь разделяют один редактор; сквозной Bold/Undo проверяется. Добавлены цвет/фон целого блока и ячеек, общий последний цвет в браузере, сохранение пустых блоков и обратный диапазон через ответы. Смена типа группы теперь сохраняет независимые red/background/default/green вместо цвета активного блока; проверены списки/маркеры, quote, code, toggle, столбцы без изменения соседей, диапазоны через ответы в обе стороны, save/reload/public read и один Undo на восьми размерах. Полный прогон редактора — 133 PASS. Выделение больше не заменяет авторский фон и цвет фрагментов: 18 проверок dark/light, включая короткий viewport и DPR 3, сравнивают реальные glyph pixels всех девяти цветов, BlockSelection/NodeSelection абзаца/CellSelection и отсутствие рамок; media не покрыты. Counterexample red/green sparse абзацы → quote → blue recolour исправлен: собственный paragraph/summary больше не перекрывает цвет контейнера; составная цепочка через восемь типов прошла все восемь размеров в новой UI-матрице. Полный аудит произвольных смешанных/вложенных стилей и Enter-семантики Notion ещё нужен |
| R8. Таблицы и прочие блоки документа | Таблицы и document columns реализованы; цель частично выполнена | Табличные оси/drag/merge/split/resize/duplication/growth сохраняют spans, widths и rich children; native caret и public reader проверены целевыми матрицами. Main629 добавляет semantic columns, side drag, widths, mobile flow, exact draft/native clipboard и shared Undo. Исправлены реальные glyph collisions вложенных table controls. MAIN633 включает native focus/caret ownership создания и8viewport/64insertion+8font guards, а также сохранение pointer capture широких table-axis drag. Full311 failed281; единый успешный аудит требуется. Image upload/URL/metadata, owned insertion и public age/strategy readers внесены в main642 после native32/unit/UI/build; main646 теперь содержит pointer/keyboard resize с exact history/draft/access/source guards; parent375 и merged53 PASS, fresh main375/comprehensive9 выполняется. Placeholders/cancel, caption/align/file paste-drop, точные Notion edge anchors/minimum rules, прочие media, интерактивный accordion и произвольные вложенные/смешанные структуры остаются открытыми |
| R9. Clipboard, selection и Undo на любом составе текста | Частично проверено | Markdown/HTML paste, ссылки, copy/cut групп с marks, Undo группы и вложенных пунктов. Буквальная вставка в inline code сохраняет Markdown/HTML-текст, whitespace, marks назначения, соседей и отдельный Undo; добавлен native clipboard smoke. Четыре ответа объединены: нативное сквозное выделение, копирование/вырезание/вставка, замена, Enter и Undo сохраняют фиксированные вопросы. Таблица внутри ответа поддерживает обычные команды с сохранением фиксированных вопросов и остальных ответов. HTML clipboard цветных блоков сохраняет literal whitespace и marks. Column full-document native HTML clipboard и отдельная история paste/последующей печати проверены. Изолированный634 проверяет mixed8, partial8 с48native reference comparisons и cell8; подтверждённые leading LF/CellSelection paste-history исправления перенесены вmain634 после69compatibility PASS; свежий полный335 audit требуется. Полного аудита всех составов и внешних приложений ещё нет |
| R10. Надёжные записи и мобильный ввод | Базовая защита проверена | Serial save queue, drafts/retry, IME, owners/access. Длинные ответы свыше30 Markdown chunks пакуются в прежнюю API shape без потери блоков;8 viewport cases проверили native Enter/save/reload/drafts. Actual iOS/Telegram keyboard и весь набор новых взаимодействий на реальном устройстве не проверены |

Уточнение R8 для текущего кандидата: left/center/right image alignment и native
file paste/drop уже реализованы и прошли полный409 editor. Tiny image action
не перекрывает изображение и первую pointer-цель resize; alignment10/resize8
дополнительно PASS. Rich captions добавлены в417-case frozen кандидате выше;
открыты viewer/прочие media и полный аудит Notion, а не align/file transfer. Исторические
счётчики/отказы в таблице выше сохраняют происхождение прежних доказательств;
текущий объединённый результат указан в начале страницы и отчёте выпуска.

Префиксы `a.`/`i.` уже создают ordered list; текущий renderer сохраняет
буквенный/римский тип. Точное соответствие того, как Notion выбирает вид маркера
при вводе и вложении, не подтверждено первичным описанием (оно обещает только
создание numbered list). До прямой сверки это часть R3/R6 с неполным доказательством,
а не основание считать формат списков идентичным.

У четырёх ответов один редактор, одна история Undo и общая очередь сохранения.
Фиксированные вопросы защищены по серверному контракту; прежняя модель данных
сохранена через Markdown-адаптер. `text-four-document-checks.mjs` проверяет
сквозные диапазоны в обе стороны, форматирование, clipboard, Enter, отмену
композиции, перемещение абзацев, draft/retry и поздние ответы сохранения.
Это закрывает прежний разрыв между независимыми редакторами, но не заменяет
аудит произвольных вложенных блоков и переноса групп через границы ответов.

Крайние/повторные пробелы, literal CR/LF/табы, ведущие/конечные/повторные soft
breaks и переносы внутри headings/semantic roles теперь сохраняются без code mark.
Публичное inline-чтение сохраняет pre-wrap и marks переноса. Точный JSON и
реальный browser save/reload подтверждены в
[slash verification](notion-slash-commands-verification-2026-10-18.md); это не
закрывает оставшийся аудит arbitrary clipboard/вложенных блоков.

Серверная синхронизация между пользователями, комментарии, AI и продуктовые
возможности workspace Notion не являются доказательством готовности самого
текстового взаимодействия; их наличие или отсутствие не закрывает строки выше.

Очередность дальнейшей работы: вложение несоседних групп и границы вложенных
блоков; расширенное форматирование; slash в существующем тексте; таблицы и
clipboard; сквозные сценарии четырёх ответов; итоговая проверка всей матрицы.
Порядок не уменьшает исходную цель. Ни одна строка со статусом «частично»
не может быть исключена ради зелёного прогона.

Доказательства отдельных итераций хранятся в датированных verification-отчётах.
Устаревшие Gallup layout assertions обновлены под действующий source renderer:
unit suite даёт 598 PASS / 1 SKIP / 0 FAIL, browser reports — 22 PASS. Свежий
`check:comprehensive` после editor run с 133 PASS завершился успешно: все девять
этапов, exit 0, без изменений 481 code/config source. Это baseline до следующего
исправления границ блоков, а не доказательство достижения всей цели.
[Отчёт полного аудита](notion-comprehensive-verification-2026-10-18.md).

Исправление границ блоков уже внесено после успешного baseline-аудита: новый
unit suite — 603 PASS / 1 SKIP / 0 FAIL (604 total); `--boundaries-only` и
`--sparse-only` — по 8 PASS, UI/build — PASS. Задержанная нормализация DOM раньше
превращала группу в TextSelection с панелью: это исправлено через проверку
проекции и явного pointer intent; обе группы проверены каждый кадр 650 мс,
клик по пустому блоку сохраняет немедленный ввод. Прежний full run 77060
прерван из-за этого подтверждённого дефекта (exit 130). Финальный полный редактор
session 79276 завершился с **141 PASS, exit 0**; 482 code/config source files
не менялись во время прогона. Это не закрывает оставшиеся строки R1–R10.
[Проверка границ](notion-block-boundaries-verification-2026-10-18.md).

Модель произвольной иерархии `nestedBlock` внесена в основной редактор после
изолированных проверок. Она сохраняет детей при root lift и parent conversion,
точный блочный выбор и номера пропущенных ordered-сегментов; прежний контрпример
list-only prototype больше не описывает текущий runtime. Обнаруженные на прототипе
потеря ширины на 12 уровнях, изменение heading gap и отделение собственного текста
при drag исправлены. Исправлен явный клик по проекции после drag/Undo. Unit/UI и
восьмиразмерная матрица основного дерева проверяются отдельно; до завершения их
результат не заявлен. Полная цель R1–R10 остаётся открытой.
[Отчёт вложенности](notion-nesting-verification-2026-10-18.md).

Исторический контрпример R6 (исправлен следующей итерацией): нативные bullet/ordered/task списки на 12 уровнях при
320px скрывают последний абзац (width 0); при 390px bullet/ordered также скрывают
его, task оставляет только 26px. Root overflow false не означает доступность
потомков. Проверено на изолированной копии того же runtime через save/reload;
исправление и мобильные indent/outdent действия уже перенесены и прошли по восемь
размеров в основном дереве. Новая общая регрессия ещё выполняется.

В том же изолированном кандидате исправлено публичное чтение обычных Markdown
списков: раньше вместо 12 уровней оставалось 0–1 li. Новый позитивный deep-list
сценарий проходит восемь размеров с реальным вводом, save/reload, public read,
checked state и отсутствием frames. Кандидат затем перенесён в основной runtime; целевые матрицы меню и native/public
списков прошли по восемь размеров. Новый comprehensive проверяет 488 sources,
его полный результат пока не заявлен.

Comprehensive первой версии иерархии завершился с ошибкой: session 2099,
99 editor PASS до отказа mixed quote conversion; все 485 source hashes неизменны.
Причина — нормализация первого абзаца многоабзацной quote в общий контейнер.
Исправление сохраняет отдельные legacy quote units и явное владение детьми
в Nested; unit и mixed-conversion на восьми размерах прошли. Результат старого
comprehensive не заявляется успешным и не переносится на новую версию.

Следующий подготовленный набор уже внесён в основной runtime: mobile menu
indent/outdent, адаптивные native lists, shared public list parser и read-only
production development startup для применения нового API без startup migrations.
Новый unit suite: 623 PASS / 1 SKIP / 0 FAIL (624 total), UI/build PASS.
Целевые матрицы основного дерева и новая общая регрессия ещё должны завершиться.
Открытые пункты R1–R10 остаются обязательными; сам факт переноса их не закрывает.

Текущее доказательство по runtime/menu/lists и неуспешному предыдущему общему
прогону: [итог текущей итерации](notion-nesting-lists-verification-2026-10-18.md).
Локальный backend 22683 уже загрузил новый validator через READ ONLY verify startup;
keepalive supervisor 22680 готов и оставлен включённым. Live native Cmd+/ не меняет
scroll или текст; новые строки меню имеют 48px. Это не заменяет оставшиеся R1–R10.

В основной композиции после полного переноса `--conversion-only` также дал
8 PASS, exit 0: исправление quote selection подтверждено на актуальном runtime,
не только до добавления menu/public changes. Все 488 source hashes стабильны.
Официальная [справка клавиатуры Notion](https://www.notion.com/help/keyboard-shortcuts)
подтверждает Tab/Shift+Tab и выбор родителя с потомками. Точная передача детей при
Enter внутри собственного текста родителя по этому описанию не установлена;
её нельзя объявлять идентичной без прямой проверки. Это остаётся частью R6/R7.

Общий прогон session 64616 завершился: failed, exit 1, editor PASS 42, source drift []. Полная цель остаётся открытой.

Общий прогон 64616 завершился FAIL после 42 editor PASS: после keyboard apply цвета
ArrowRight иногда оставлял старый диапазон и панель. Снимок 488 sources стабилен.
Повтор `--styles-only` воспроизвёл отказ на 390×844; дополнительная задерживающая
диагностика могла его скрыть и не считалась исправлением. Runtime теперь сразу
фиксирует нативный визуальный caret после Left/Right, не скрывая панель искусственно.
Десять style scenarios с 650ms frame checks и два native-reference viewport cases
прошли. Полная новая регрессия этой версии ещё нужна; R1–R10 остаются открытыми.

2026-10-18: R2 reopened for a first-offscreen-selection sequence. Live native
selection after scroll432 places the toolbar at y678 for a selection at y310;
isolated regression reproduces a +2305px scroll offset. Tiptap React initializes
absolute positioning before fixed-strategy measurement. Main code remains frozen
for comprehensive56434; a component CSS initialization fix is isolated only.
Long-answer packing (legacy array max30) and direct cross-answer moves also have
isolated passing tests and are not yet promoted. Goal remains active.

Comprehensive56434 terminal: {"status": "failed", "exitCode": 1, "editorPassRecords": 159, "sourceCount": 587, "sourceDrift": [], "addedSources": [], "finishedAt": "2026-10-18T15:05:51.204664+00:00"}. Source-first menu fix, long-answer packing and cross-answer movement remain isolated; goal active.

2026-10-18: first-offscreen fixed initialization, long-answer packing and direct
cross-answer moves are now in the main source. The isolated full editor passed
184 scenarios with all598 source hashes stable. Main targeted checks passed
9 first-selection +8 long-answer +8 question-move scenarios, unit634 has
633PASS/1SKIP, UI/build pass. Live exact native sequence gives selectionTop310,
toolbarBottom302 at scroll432; ArrowRight leaves toolbar0 and unchanged HTML.
The previous main comprehensive passed release/editor159, navigation and action
rails, then failed a multi-file chart anchor wait at1440. A fresh comprehensive
of the promoted version is still required. Generic list-boundary movement and
actual-node drag/drop remain isolated candidates. R1–R10 and the goal stay open.

2026-10-18, объединённая модель: `inline-block-move.js` заменяет отдельный
question-only mover и прежние локальные перестановки. Обычный текст и отдельные
native list items движутся по одному логическому sibling rail, в том числе через
фиксированные вопросы. Новые совместимые списки соединяются, исходные номера/
цвета/checked children сохраняются; own-text родителей и selected descendants
защищены. Внутренний drag переносит реальные узлы, показывает snap guide и имеет
guards отмены/изменения doc/доступа без HTML fallback. Целевые unit644 и UI
матрицы кандидата прошли; версия перенесена в main и перепроверяется там. Это
прогресс R5/R6/R9, не доказательство полной Enter/clipboard/style семантики.

Chart timeout воспроизведён с trace: третий переход после focus/navigation
останавливался с targetTop624/bottom844 при rail120, хотя document end ещё не
достигнут. Шрифты к этому переходу были loaded, поэтому одной readiness недостаточно.
Click/Enter теперь мгновенно ставит focused target на rail, сохраняя native href/
history; controlled slow-font navigation и обычный полный reports smoke прошли.
Новый общий аудит объединённой версии ещё нужен. Цель остаётся активной.

2026-10-18, изолированные follow-ups: официальный Cmd/Ctrl+Enter для текущих tasks/toggles теперь реализован и прошёл7 новых unit +8 browser viewport cases, включая caret/BlockSelection/Undo/save/reload/guards. Полный кандидат203 ещё выполняется; main snapshot595 заморожен. Отдельный pure counterprobe выявил потерю nested структуры при55+55-level relocation; общий reload-depth guard и проверка guide до обещания допустимого drop прошли unit и2 native desktop cases в третьей изолированной копии. Ничто из этих двух follow-ups пока не перенесено в main; актуальные статусы — в датированных current-block-action / relocation-depth verification. Actual touch/IME, Enter ownership и R8/R9 остаются открытыми.

Объединённый comprehensive24320 terminal: {"status": "passed", "exitCode": 0, "editorPassRecords": 195, "sourceCount": 595, "sourceDrift": [], "addedSources": [], "finishedAt": "2026-10-18T16:11:17.850359+00:00"}. Goal remains active; requirements with incomplete evidence remain open.

2026-10-18: comprehensive snapshot595 прошёл все9этапов,195 editorPASS, drift0;
отдельный current-block-action snapshot604 — полный editor203PASS, drift0.
Cmd/Ctrl+Enter, общий reload-depth guard и table-axis handles/moves теперь
перенесены в main. Table candidate snapshot611 дал unit656/655PASS/1SKIP,
UI/build0 и27 targeted browserPASS. Controls в изолированной копии имели font403,
поэтому окончательный main control/font review ещё требуется. Новая объединённая
версия ожидает216 editorPASS и полного аудита; прежние зелёные прогоны не
переносятся автоматически. R8 ещё включает duplication/grow/media, arbitrary
row groups и широкий edge-scroll audit; nested Enter/clipboard/device проверки
и общая цель остаются открытыми.

Main source605 targeted verification:21browserPASS, unit656/655PASS/1SKIP,
UI37/69,132controlsPASS/DPR3 и fontServingDenials0. Всё ещё нужен terminal
comprehensive216; его успех заранее не заявлен. Table row/column drag и commands
в main, а R8 growth/duplication/media/arbitrary groups/horizontal edge audit,
R6 Enter ownership и R9/R10 полное соответствие остаются открытыми.

Объединённый table/core main comprehensive terminal: {"status": "superseded", "exitCode": 143, "editorPassRecords": 99, "sourceCount": 605, "sourceDrift": [], "addedSources": [], "finishedAt": "2026-10-18T16:35:53.997974+00:00", "fontServingDenials": 0, "interruption": {"reason": "Superseded after a new real-application-chrome counterexample: column handle hidden below header selector and 48px controls covering cell text. Verified candidate fixes both; start a fresh combined source run.", "rootPid": 83192, "ownedPids": [83192, 83266, 83307, 85529, 85574, 85575, 85580, 85581, 85583, 89625, 89626, 89627], "observedCommand": "node scripts/check-comprehensive.mjs", "cwd": "/Users/mokoloskov/Desktop/Git/rollout/rollapp", "verifiedBeforeStopAt": "2026-10-18T16:35:23.560240+00:00", "sourceCount": 605, "sourceDrift": [], "beforeLogs": ["/tmp/rollapp-table-chrome-before.log", "/tmp/rollapp-table-chrome-text-before.log"], "candidatePassRecords": 22, "productionDevPidsExcluded": [22680, 22683, 22713], "stoppedAt": "2026-10-18T16:35:53.844320+00:00", "signalledPids": [83192, 83266, 83307, 85529, 85574, 85575, 85580, 85581, 85583, 89648, 89649, 89650]}}. Цель остаётся активной; открытые пункты не исключались.

2026-10-18: правильный app-header/editor fixture подтвердил новый source605
header hit failure. Общий605прогон остановлен после99editorPASS, exit143/drift0,
и заменяется проверкой608; его успех не заявлен. Ошибочная ранняя композиция
fixture давала ложные text-overlap findings — исправлена, x=0 gutter отменён,
reading/page contract сохранён. Header placement fix +23candidate browserPASS
перенесены в main; wide edge-scroll и настоящая header композиция теперь имеют
proof, но full228 pending и R6/R8/R9/R10 оставшиеся пункты не исключены.

2026-10-18: выявлен ещё один R6/R10 counterexample main608: native ArrowUp
оставлял caret y58.5 под header bottom72 даже после650ms. Изолированный
source610 исправляет native scroll visibility, сохраняя browser caret/selection.
Чистый targeted прогон19166 завершён exit0:9 viewport arrow/Shift cases,
2native bidi/grapheme parity и9first-offscreen selection cases=20PASS,
source drift0; UI37/69 иbuildPASS. Кандидат пока не перенесён в main:
comprehensive608/228 ещё выполняется. Это не закрывает реальный device IME
или прочие открытые строки матрицы.
[Отчёт курсора](notion-caret-scroll-verification-2026-10-18.md).

2026-10-18: R8 axis duplication добавлена в изолированном source611 поверх
проверенного caret610. Дублируются complete merged bands и arbitrary rich children,
сохраняются attrs/ширины/позиционные headers, новая CellSelection и один Undo.
Unit660/659PASS/1SKIP, duplication9 +existing axis9 +real chrome10=28browserPASS,
UI/buildPASS, source611/main608 drift0. Этот candidate ещё не в main, текущий
comprehensive608/228 остаётся живым. Grid growth/media/real-device IME и прочие
открытые строки не исключались.
[Отчёт дублирования таблиц](notion-table-duplicate-verification-2026-10-18.md).

Header/wide main comprehensive terminal: {"status": "failed", "exitCode": 1, "editorPassRecords": 228, "sourceCount": 608, "sourceDrift": [], "addedSources": [], "finishedAt": "2026-10-18T17:31:13.067884+00:00", "fontServingDenials": 0}. Открытые требования сохранены.

2026-10-18: main608 comprehensive terminalfailed только на Hogan navigation,
после228editor/release/navigation/action-rails PASS; остальные5gates не запускались.
Caret+duplication перенесены в main611 и проверены29cases, unit660. Native Hogan
focus-reconciliation counterexample исправлен,20stress+12main charts PASS;
добавлена проверка Back/Forward. Supplemental51283 ещё выполняется. Growth616
реализует edge-plus/corner resize и header intent, isolated11browser/665unit proof;
финальная compatibility53149 pending. Media, native Four Questions growth,
wide/nested growth, arbitrary clipboard/styles иreal-device IME не исключались.

Growth616 compatibility поймал публичный reader marker regression до переноса. Исправление проверяется отдельным27case sequence73547/controller2200; предыдущий failed53149 не переименован в PASS. Main611 supplemental51283/controller2194 продолжает проверки, native chart Back/Forward включены. Новый comprehensive246 ещё нужен. Отдельный дальнейший R10 audit: native visibility long InlineTextField, помимо проверенного rich editor.

2026-10-18: main611 supplemental terminalPASS/drift0, но fresh comprehensive не подменён
этими частями. Combined618 закрывает plaintext native caret counterexample y30<72,
проверяет actual blank-line caret pixels на9viewports, отменяет pending reveal по
wheel/touch, сохраняет IME/read-only/native history. Native Four Questions growth,
wide new-column horizontal reveal и nested menu fallback прошли2cases; исправлен
focus-before-transaction scroll defect. Unit665/664PASS/1SKIP, UI/buildPASS;
combined38 sequence50601 ещё pending. Side-by-side document columns и menu-insertion
caret ownership явно остаются в полном объёме цели вместе с остальными open rows.

Combined618 перенесён в main после40browser (38compat +2contexts), unit665/664PASS/1SKIP, UI/buildPASS. Fresh comprehensive82677 проверяет268editor и9gates; его успех заранее не заявлен. Read-only live Career1280×720 подтверждает editable prose, Geist18/28/width768, border/outline/shadow0, no toolbar/overflow, saved; ни одного test write. Tall-header caret reveal и menu insertion ownership ещё требуют прямого аудита.

Main618 comprehensive terminal: {"status": "failed", "exitCode": 1, "editorPassRecords": 128, "sourceCount": 618, "sourceDrift": [], "addedSources": [], "finishedAt": "2026-10-18T18:27:18.724587+00:00", "fontServingDenials": 0}. Цель не завершена без отдельного полного аудита R1–R10.

2026-10-18, source620: исправлены два подтверждённых дефекта высокой/широкой таблицы. После edge-plus курсор и новая ячейка больше не остаются под шапкой/за правым краем, а Undo/Redo раскрывают восстановленный курсор. Изолированно44 browser PASS (2 новых +42 compatibility), unit665/664PASS/1SKIP, UI/buildPASS, source drift0. Перенесены только5 reviewed файлов; временный fs.allow не переносился. Main618 full завершился exit1 на dynamic import после128 editor PASS, не на продуктовом assertion; совместный кэш больше не используется. Следующий270 full не считается успешным заранее. [Отчёт](notion-table-caret-intent-verification-2026-10-18.md). R5/R6/R8/R9/R10 открытые пункты сохраняются.

Main620 fresh comprehensive запущен (session93676/controller2279), ожидает270 editor PASS и9этапов на620 замороженных source hashes; standalone main12 PASS не заменяет этот результат.

2026-10-18: в изолированном source625 реализованы document columns (side drag, common picker, keyboard boundary moves, width resize, unwrap/delete, mobile flow). Базовые9 +контекстные3 browser cases прошли, unit676/675PASS/1SKIP; найдено и исправлено перекрытие table axis controls соседним текстом. В main620 ничего не перенесено, его full270 остаётся замороженным. Final77 compatibility и будущий full282 требуются. [Отчёт колонок](notion-document-columns-verification-2026-10-18.md); R5/R8 не объявляются завершёнными до комбинированной проверки и оставшихся контекстов.

Main620 comprehensive terminal: {"status": "failed", "exitCode": 1, "editorPassRecords": 174, "sourceCount": 620, "sourceDrift": [], "addedSources": [], "finishedAt": "2026-10-18T18:56:04.292606+00:00", "fontServingDenials": 0}. Цель не завершена без отдельного полного аудита R1–R10.

Main629 перенесён после ancestor625/76,628/44 и combined629/56 targeted cases, portable native-key2, unit679/678PASS/1SKIP, UI/buildPASS. Это частичные доказательства разных версий, не их сумма как полный аудит. Новый full287 запускается на замороженном629; остальные R1–R10 пункты сохраняются.

Main629 fresh comprehensive287 запущен (session51806/controller2394), source/contracts frozen. Main standalone5 PASS не заменяют полный результат9этапов.

2026-10-18: native Cut + последующая печать сливались в один Undo. Изолированный
кандидат с границами истории прошёл8 viewport cases (plain/rich column/sparse/cross-answer,
exact Undo/Redo/save/reload), unit680/UI/build. Main629 заморожен, перенос не выполнен.
Новый stress counterexample: rapid Shift+ArrowLeft может терять последний символ
выделения; keyup-only prototype тоже воспроизводит отказ и не считается исправлением.
Это явный открытый пункт R2/R6/R9. См. notion-cut-history-verification-2026-10-18.md.

Main629 comprehensive terminal: {"status": "invalidated", "exitCode": 1, "editorPassRecords": 77, "sourceCount": 629, "sourceDrift": ["src/components/coaching-sessions.jsx", "src/components/conferences.jsx", "src/components/courses.jsx", "src/components/medications.jsx", "src/components/workouts.jsx", "src/styles.css"], "addedSources": ["src/components/collection-snippet-media.jsx"], "finishedAt": "2026-10-18T19:46:53.321915+00:00", "fontServingDenials": 0}. Полная цель остаётся незавершённой без отдельного аудита всех открытых R1–R10.

2026-10-18: Cut boundaries и early native selection sync перенесены вmain после
8 Cut cases/32 compatibility cases и60 native stress+2 expanded native-reference cases.
Вызов sync перенесён вhandleDOMEvents.keydown доPM forceFlush, движение Shift+Arrow
остаётся нативным. Keyup-only иmanual extend отвергнуты поcounterexamples. Main629
full invalidated/exit1/editor77:6 source changes+added1 иHome fixture assumption;
проверка начала строки наmacOS исправлена без удаления offset1/Undo assertions.
Новая полная матрица295 требуется; R1–R10 остаются открытыми.

Main631 targeted:8 native CutPASS, expanded native referenceFAIL при formatted
collapsed0 +Shift+ArrowLeft (anchor29 вместо0), drift[]. Это сохраняет R2/R6/R9
открытыми несмотря на isolated60stress/2referencePASS и успешный live6-character
выбор с одной панелью и8px gap. Cut history исправлен; preflush sync не считается
достаточным доказательством полной корректности selection. Full631/295 ещё идёт.

Main631 Cut/preflush comprehensive terminal: {"status": "cancelled", "exitCode": 130, "editorPassRecords": 15, "sourceCount": 631, "sourceDrift": [], "addedSources": [], "finishedAt": "2026-10-18T20:03:00.195802+00:00", "fontServingDenials": 0}. Полная цель остаётся незавершённой без отдельного аудита всех открытых R1–R10.

Main632 full editor terminal: {"status": "failed", "exitCode": 1, "editorPassRecords": 57, "sourceCount": 632, "sourceDrift": [], "addedSources": [], "fontServingDenials": 0, "finishedAt": "2026-10-18T20:14:04.061790+00:00"}. Полная цель и открытые строки R1–R10 сохраняются.

2026-10-18: подтверждён actual native selection reset доkeydown изDOMObserver recent-focus heuristic; pre-key sync недостаточен. Capture сpending-input guard перенесён вmain после63compatibility PASS/source drift0 и60stress, unit683/682PASS/1SKIP, UI37/72/build. Naive capture давалcaret7 вместо13 и отклонён; pending/scheduled/suppressed DOM work теперь сохраняетвладельца. Native2 включаютexplicit start/focus и4queued-input режима, движение браузерное. Новыйmain303 comprehensive требуется; R2/R6/R9 иполныйR1–R10 не закрыты. Отчёт: notion-native-selection-capture-verification-2026-10-18.md.

Native capture main comprehensive terminal: {"status": "failed", "exitCode": 1, "editorPassRecords": 142, "expectedEditorRecords": 303, "sourceCount": 632, "sourceDrift": [], "extraInputDrift": [], "addedSources": [], "fontServingDenials": 0, "finishedAt": "2026-10-18T20:56:23.463205+00:00"}. Полная цель остаётся активной до аудита всех открытых требований.

2026-10-19: main632 comprehensive terminal failed142/source drift0 наwide-column drag. Standalone подтверждает потерюpointer capture приscrollLeft216; native selection2/стили иостальныепредшествующиегейты прошли. Изолированный table-handle ownership candidate даёт2 native wide PASS;34compatibility pending. Отдельный insertion/font633:8viewport/64creation+8real font guards PASS, unit683/UI/build; staged slash regression исправлена,90compatibility pending. Кандидаты не перенесены, combined/fresh311 ещё нужны. R8 wide drag ивсеостальныеopen R1–R10 сохраняются. Отчёты: notion-block-insert-caret-verification-2026-10-18.md и notion-table-drag-capture-verification-2026-10-19.md.

2026-10-19: insertion/font иtable-drag ownership перенесены вmain послеparent90/34, new8+8font guards иcombined63 (drift0/added0). Source633/full311 запущен5882/root14198; main targeted14 выполняется26399. Unit683/682PASS/1SKIP, UI37/72/build; live1280 no frames/one selection toolbar/text unchanged. Это не полныйmain audit и не закрытиеR1–R10; actual devices/media/remaining contexts сохранены.

Main633 targeted14 terminalPASS, source/contracts drift0; fresh311/nine-stage comprehensive5882 продолжаетпроверки. Исправления authoring/font/table capture находятся вприложении, но полнаяцельR1–R10 ещё не доказана.

2026-10-19: изолированный clipboard634 исправляет подтверждённые extra leading LF в частичном table→cross-answer Copy и слияние native CellSelection Paste со следующей печатью в Undo. Baseline3 unit failures/real native failures сохранены; candidate691unit (690PASS/1SKIP), UI37/72/buildPASS, начальные native12partial comparisons и2cell cases PASS. Финальные24 viewport records+45compatibility выполняются; MAIN633/full311 source/contracts drift0, кандидат ещё не перенесён. R9 и остальные открытые R1–R10 сохранены. Отчёт: notion-cross-clipboard-verification-2026-10-19.md.

Combined authoring/table main comprehensive terminal: {"status": "failed", "exitCode": 1, "editorPassRecords": 281, "expectedEditorRecords": 311, "sourceCount": 633, "sourceDrift": [], "extraInputDrift": [], "addedSources": [], "fontServingDenials": 0, "finishedAt": "2026-10-18T22:00:38.060012+00:00"}. Открытые R1–R10 иполнаяцель сохраняются.

2026-10-19: clipboard634 перенесён вmain после69native browser PASS/source drift0, parent cell8/nesting8 и1368model comparisons, unit691/690PASS/1SKIP, UI/buildPASS. Это не сумма как полный аудит. Предыдущий main633 failed281 наnesting820 остаётся открытым до fresh335/nine-stage comprehensive. Backup и hashes: notion-cross-clipboard-verification-2026-10-19.json. Остальные R1–R10 не исключались.

2026-10-19: R4/R8 media-кандидат source642 остаётся изолированным, не перенесён.
Вставка/загрузка изображения, метаданные и точный canonical/native clipboard
roundtrip, отдельный Undo и draft retry прошли8viewport cases без API и window
errors после исправления реального ResizeObserver loop. Предыдущие8 PASS с
этой ошибкой отклонены. Unit702/701PASS/1SKIP, UI37/73/buildPASS; production SQL
reference guards проверены7SELECT вREAD ONLY/ROLLBACK,0writes/DDL.
MAIN634/full335 остаётся замороженным и выполняется, source/contracts drift0.
Late image layout/caret, plus/Alt-plus и сложные контексты, real devices, file
paste/drop/resize иполный media catalogue сохраняются открытыми. Это progress,
не закрытие R1–R10. См. [image report](notion-inline-images-verification-2026-10-19.md).

2026-10-19, следующая image-итерация: actual held asset360×1500 воспроизводит
уход caret y261→1752.66 при390×400. Изолированный authoring observer исправлен:
8viewport/40subcases PASS, включая печать доload иwheel/selection/access cancel;
соседняя42-record compatibility выполняется, unit702/UI/buildPASS. Main634 не
менялся. Публичный collapsibleAges canonical image отдельно подтверждён как
literal prose вреальном SSR markup; browser proof/fix ещё нужны. Reader patch
подготовлен вне frozen642 и не применён. R4/R8/R9/R10 иполный R1–R10 открыты;
это progress, ане готовность main. См. notion-inline-images-verification-2026-10-19.md.

2026-10-19, итог image layout/reader продолжения: parent isolated642 даёт44PASS
(8late asset/40subcases +8images +8insertion +9caret +9plaintext +2mac native),
source drift0. Count metadata8→9 исправлена пофактическим viewport arrays; только
две незапускавшиеся группы продолжены, assertions сохранены. После terminal44
применён central rich public source-group reader: native baseline0images/flat
columns, затем2short и8full age/strategy cases PASS, unit702/UI/buildPASS.
Это разныеверсии, несуммарный полныйаудит. Default будущейверсии359; main634
закончила335editor PASS ипродолжаетcomprehensive, source/contracts drift0.
Images/reader не перенесены. Открытые plus/Alt-plus/access/IME/viewport/nested
contexts, arbitrary compositions/media/device ивсеостальные R1–R10 сохранены.
Отчёт notion-inline-images-verification-2026-10-19.json содержитточные hashes/фазы.

Clipboard main comprehensive terminal: {"status": "passed", "exitCode": 0, "editorPassRecords": 335, "expectedEditorRecords": 335, "sourceCount": 634, "sourceDrift": [], "extraInputDrift": [], "addedSources": [], "fontServingDenials": 0, "finishedAt": "2026-10-19T08:07:55.997276+00:00"}. Полная цель и открытые R1–R10 сохраняются до отдельного аудита.

2026-10-19, контекстная image-итерация: main634 comprehensivePASS9/335 иdrift0.
Кандидат642 исправляет реальную cell image outside-table вставку иactual Fragment
validation/parent ownership; контекстная8viewport матрица,704unit/UI/buildPASS.
64compat session85160 выполняется. Ещёоткрыты stale same-doc selection иnested
head-image metadata model counterexamples;4-file patch staged, gate66515 ждёт
parent64 и затем706unit/native16, безmain promotion. Контракты367 подготовлены
в/tmp. Placeholder/cancel fidelity ивсеостальныеmedia/context/device/R1–R10
пункты сохраняются; полныйпереходнеобъявлен. Подробности: notion-inline-images-verification-2026-10-19.json.

Следующая изолированная итерация — native image edge resize: baseline0 guides,
prototype2 short PASS,711unit/710PASS/1SKIP. Расширенные cancel/keyboard/context/
focused-editor/touch guards ещё проверяются, переноса нет. Main642367/9stages
продолжает работать на frozen sources. Evidence: `notion-image-resize-verification-2026-10-19.json`.

Images main comprehensive terminal: {"status": "failed", "exitCode": 1, "editorPassRecords": 80, "expectedEditorRecords": 367, "sourceCount": 642, "comprehensiveStageCount": 9, "allStagesPass": false, "sourceDrift": [], "extraInputDrift": [], "addedSources": [], "fontServingDenials": 0, "finishedAt": "2026-10-19T09:37:41.299525+00:00"}. Полная цель и открытые R1–R10 сохраняются до отдельного аудита.

Resize646 continuation: native8 по всем viewportPASS, parent67 compatibility ещё
выполняется (context8/images8 такжеPASS). Выявлены иисправлены clipping guides,
hover1px image interception иstale controls двух видимых editors; отдельный native
focus-return counterexample имеет staged2-file fix, не внесённый поверхfrozen parent.
Guard95776/session92931 применит его только послеparent67PASS иexact source/extra
checks, затемunit/UI/build/native35. Автопереноса вmain нет. Current main642full2
session67234/root92362 иparent646 session25192 подтверждены живыми процессами;
readonly production service85976 оставлен включённым. Goal/R1–R10 остаются активными.


2026-10-19, актуализация resize646: parent67 terminal **failed41**, drift0;
queued guard95776 завершился1 до мутации. Он больше не работает. После terminal
reviewed2-file focus-return fix применён вручную в новой isolated iteration.
Отдельный delayed-selection native probe доказывает потерюRange при fresh focus
даже безresize; late-priority pinned focus adapter даётRange41/model22..63/one
panelPASS. Selection8 forward/backward/caret/public focus lifecycle сейчас идёт.
Повтор старой surface11PASS сам по себе не считается фиксом initial failed41.
Main642full2 продолжает check:release; product/main contracts не менялись.
Все открытые R1–R10 остаются. Подробности в notion-image-resize-verification-2026-10-19.json.

Images main comprehensive terminal: {"status": "failed", "exitCode": 1, "editorPassRecords": 227, "expectedEditorRecords": 367, "sourceCount": 642, "comprehensiveStageCount": 9, "allStagesPass": false, "sourceDrift": [], "extraInputDrift": [], "addedSources": [], "fontServingDenials": 0, "finishedAt": "2026-10-19T10:22:44.149093+00:00"}. Полная цель и открытые R1–R10 сохраняются до отдельного аудита.


Images main642 full2 terminal: failed227/367 in column-context changed-source resize cancellation1440×400; source/extra/added drift0, fonts0, other eight stages not-run. Main no longer running. Native boundary first-pointer ownership being isolated; context3 repeatPASS alone is not a fix. Open R1–R10 and active goal retained.


2026-10-19, актуальная isolated646 итерация: delayed native selection/focus
проверки8PASS, non-text synchronous focus return native image8PASS. Native first
column boundary hit regression beforeFAIL/after3PASS; owner-scoped image portal
before4guides/after2PASS. Эти результаты относятся к разным последовательным
версиям, не суммарной полной матрице. Последний reviewed owner patch внесён после
terminal8+8, fresh646unit711/710PASS/1SKIP/UI37/74/buildPASS. Полный375 редактор
session44250/PID5645 выполняется на frozen sources+10extra inputs; drift0.
No main promotion/commit/PR/deploy; основная642 full2 terminalfailed227, other8
stagesnot-run. Живая main страница readonly проверена desktop и390: first-line/
plus/grip360/360/360, body18/28, frames0/overflow0, temporaryIAB44closed. Dev85976
оставлен. Все открытыеR1–R10 иactivegoal сохранены. Следующее действие: дождаться
terminal375, просмотреть exact hashes/diff; приPASS перенести и запустить свежий
maincomprehensive. ПриFAIL сначала исправить реальную причину без ослабленияassertions.


2026-10-19: новая storage-итерация проверяет точное сохранение marks на каждом
символе, включая пробелы; старый helper игнорировал их marks. Counterexamples66,
33 и657 сохранены в/tmp, child fixes первых двух дают713unit и500 diverse model
PASS; native10 идёт, delimiter ambiguity pending. Parent646/375 frozen иmain642
не менялись. Это новое доказательство для открытыхR7/R9, не завершение цели.


2026-10-19: storage5/source642 перенесён вmain сbackup/exacthash после716childunit,
native29+long8 иmodel10000PASS. Fresh main711unit/710PASS/1SKIP/UI37/73/build/native10
PASS/source/extra/added drift0. Это разные scopes иверсии; не суммарный общийpass.
Main live readonly desktop+390: frames0/body18/28/overflow0; tab45closed.
Parent image/core646375 всё ещёlive5645/source-extraunchanged, не переносился.
Next: дождатьсяterminal375, приPASSreview13source+rebased3contracts иперенести,
затемfresh combined main646/default375/comprehensive9; приFAILисправитьпричину.
Notion image alignment/anchor/minimum, placeholder/cancel/caption/filepaste-drop,
arbitrary mixed contexts иactual-deviceIME остаются открытыми; goalactive.

Mobile runtime audit: `xcrun --find simctl` returned utility unavailable; configured Playwright WebKit executable absent. Actual iOS/Telegram/device IME remains unverified. Do not replace that requirement with Chrome touch or synthetic composition proof. Other goal work continues.

2026-10-19: live main646 review desktop1440 gives first-line centre422 and both gutter-control centres422 (48px boxes); mobile390 has 18/28, no frame/outline/shadow/root overflow, no idle formatting toolbar. Temporary tab46 closed and viewport reset, production writes0. New links649 candidate passed native8 but styles/selection compatibility still pending; it is not in main.

Выпуск-checkpoint: `6fa269b` и тестовый portability-fix `fb508f2` отправлены в main. Первый Linux CI остановился до deployment на word-navigation fixture; локальный fix прошёл все24 image cases. Повторный [CI39251525717](https://github.com/rolloutrf/rollapp/actions/runs/39251525717) ещё выполняется; production остаётся7104575 до точного health подтверждения. Runtime646 не менялся. Link intent649 и metadata650 остаются изолированными: оба targeted26 PASS, metadata unit727/726PASS/1SKIP/UI/build PASS; отдельные full383 ещё выполняются. [Текущий выпуск](notion-release-2026-10-19.md), [metadata](notion-link-metadata-verification-2026-10-19.md), [подтверждённые media-различия](notion-image-options-audit-2026-10-19.md).

2026-10-19 12:50Z: fresh main646 comprehensive9 завершён PASS: editor375, source/extra/added drift0, font denials0, controller32893 terminal0. После завершения рабочие test inputs восстановлены к published HEADfb508f2; runtime не менялся. Linux release CI39251525717 ещё выполняется. Новые isolated649/650 full383 и alignment653 с расширенным native10 ещё не означают завершения R1–R10.

12:56Z checkpoint: isolated link-intent649 full383 PASS/terminal0, drift0. Он ещё не перенесён: metadata650 full383 и alignment653 full393 выполняются на отдельных frozen sources/10extra. Alignment добавляет10 native cases и optional canonical attribute, shared ControlBar, различимый selected state и фактическую chrome/VisualViewport границу; отдельные native10 и730unit/729PASS/1SKIP/UI/build прошли, но full393 ещё не PASS. [Доказательства и сохранённые отказы](notion-image-alignment-verification-2026-10-19.md). Actual-device IME, captions/file paste-drop, exact edge anchors/minimum и полный R1–R10 остаются открытыми.
