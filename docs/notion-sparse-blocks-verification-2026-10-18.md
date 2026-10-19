# Несоседние блоки — 18 октября 2026

Проверяется dirty tree на HEAD `710457583a873ce56b93d4eb26849731164f5b2d`.
Предыдущая итерация — progress: оформление выбора сохраняет цвета/фоны,
полный редактор дал 125 PASS. Текущая итерация реализует точное множество
несоседних блоков; полная цель R1–R10 остаётся активной.

## Поведение и реализация

[Официальная справка Notion](https://www.notion.com/help/keyboard-shortcuts)
документирует Cmd+Shift+click на Mac и Alt+Shift+click на Windows/Linux для
select/de-select блока; обычный Shift+click выбирает промежуток.
Toggle реализован для текста и desktop grip; обычный Shift-range работает
внутри общего выбираемого родителя. Сквозной block-range через фиксированные
секции остаётся незавершённым. Обычный Cmd/Ctrl+click
ссылки не перехватывается этим сочетанием.

BlockSelection хранит positions и точные ranges, нормализует parent/child
перекрытия, сохраняет набор/направление в JSON/bookmark. Удалённая позиция не
заменяется соседним узлом. Подсветка рисуется только на выбранных узлах прежним
прозрачным слоем: CSS, typography и геометрия контролов не менялись.

Copy/cut, HTML/Markdown paste, замена набираемым текстом, удаление, дублирование,
цвет и смена типа исключают пропущенные блоки. Команда наведённого пропущенного
блока адресует его одного. Копии вставляются рядом с исходными выбранными
последовательностями; ↑/↓ двигают каждую последовательность внутри её родителя,
оставляя упёршуюся в край на месте. Drag собирает выбранное содержимое вместе.
Структурное изменение — один Undo с восстановлением точного выбора.

Смена типа sparse списка использует разбиения вокруг выбранных пунктов;
mapping пропущенных пунктов и номера оставшихся ordered-list сегментов
сохраняются. Дети, checked state, marks и унаследованные цвета сохраняются.
При типе, не допускающем вложения, дети остаются следующими выбранными блоками.
Code block намеренно получает обычный текст по его схеме, Undo возвращает marks.

Четыре ответа поддерживают sparse выбор через разные секции: фиксированные
вопросы, пропущенные ответы и хвосты остаются точными. Enter входит в head,
а не удаляет cross-answer выбор. Ввод/IME-подготовка создают свой абзац,
не присоединяя замену к нетронутому хвосту. Отмена композиции не публикует
временное удаление.

## Найденные и исправленные ошибки

- Toggle менял текст правильно, но восстанавливал выбор на соседях из-за
  заменённых text positions. Теперь используются реальные созданные toggle nodes.
  Counterexample: `/tmp/rollapp-sparse-sixth.log`.
- Последующее слово отделялось от первого символа при Undo: последним шагом
  multi-range replace было удаление в другом месте. Теперь остальные диапазоны
  удаляются с конца, последняя операция — замена у места ввода.
  Counterexample: `/tmp/rollapp-sparse-seventh.log`.
- Upstream clearNodes падал на nested checklist и мог адресовать контейнер
  вместо нужного text block. Sparse преобразование теперь изолирует выбранный
  item и сохраняет нетронутые узлы через mapped gaps.
  Counterexamples: `/tmp/rollapp-sparse-ninth.log`, `/tmp/rollapp-sparse-eleventh.log`.
- Обычная Markdown insertContent адресовала главный диапазон. Sparse paste
  теперь использует настоящий multi-range replaceSelection.
- Cross-answer beforeinput сначала удалял абзац, затем набирал текст в его
  нетронутом хвосте. Применяется замена выбранных узлов; IME имеет собственный
  пустой абзац. Counterexample: `/tmp/rollapp-sparse-fourteenth.log`.

- Изменение атрибутов заменяет opening tokens; bookmark ошибочно считал
  выбранные узлы удалёнными. Прямой диагностический пример A/B/C: selection
  positions [0,6] после двух setNodeMarkup становился text selection 7.
  Теперь bookmark отслеживает весь интервал узла с противоположными
  associations. Замена wrapper tokens не снимает выбор, а настоящее
  удаление схлопывает интервал и исключает узел. Первые абзацы пунктов
  нормализуются в listItem/taskItem; вложенные item не поднимаются к родителю.

## Проверки

Первый focused проход дал 8 PASS, но дополнительные проверки выявили потерю
выбора при смене атрибутов, затем регрессию цепочки преобразований. Добавлены
проверки сохранности выбранных единиц после каждого типа и составная цепочка
тип → blue recolour → Undo цвета → Undo типа.
Финальные targeted проверки: `/tmp/rollapp-sparse-composed-ui.log` и
`/tmp/rollapp-sparse-conversion-verified.log`: оба завершились кодом 0,
по 8 viewport cases.

Полный `test:text-edit` завершился кодом 0: **133 PASS**, включая восемь
sparse viewport cases и 18 dark/light selection-paint cases.
`/tmp/rollapp-sparse-full-text-final.log`; все 64 editor fingerprints совпадают.
Первый полный прогон был намеренно остановлен (130) после обнаружения colour
bookmark bug; второй завершился кодом 1 на mixed code conversion. Логи
`/tmp/rollapp-sparse-full-text-superseded.log` и
`/tmp/rollapp-sparse-full-text-before-conversion-fix.log` сохранены как counterexamples,
не как успешные проверки. Исправления проверены финальным полным прогоном.

Восемь sparse viewport cases: 320×844, 390×844, 390×400, 768×844, 820×844,
1024×844, 1440×844, 1920×844. Все используют native pointer/keyboard events,
точный JSON пропущенных блоков, проверки marks/цветов/типов, Copy/Cut/Paste,
замены/отмены композиции/Undo, вложенных списков, четырёх ответов,
autosave/reload/public read, нулевых рамок/overflow/API.
Desktop drag/grip проверяются от 1024px, native clipboard copy — при 1440px.
Win32 navigator.platform подставляется при 320/820px, MacIntel — на остальных:
это Chromium fixture simulation, не реальная Windows.

15 новых unit-тестов проверяют набор/перекрытия, bookmark/JSON, удалённые позиции,
направление, точный clipboard content, последовательность typing/Undo, nested
checked items, цвета детей и номера пропущенного ordered-list сегмента,
защищённые ответы и IME-подготовку.
До независимого обновления Gallup assertions check:comprehensive завершился
кодом 1: 599 тестов, 597 PASS, 1 SKIP,
1 прежний FAIL — `Gallup DNA labels must use shrinkable grid tracks`.
Остальные стадии comprehensive не запускались. Это не успешный общий аудит.
Логи `/tmp/rollapp-sparse-comprehensive-composed.{log,json}`.

Финальные build и test:ui прошли; 37 primitives / 68 JSX, прежний chunk >500kB
warning. Логи `/tmp/rollapp-sparse-build-composed.log`,
`/tmp/rollapp-sparse-ui-final.log`. Control geometry smoke завершился кодом 0: 132 PASS, включая screenshot-pixel
проверки и mobile DPR 3. Лог `/tmp/rollapp-sparse-controls-final.log`. Этот smoke и статический UI audit
завершены до изолированного bookmark-fix; CSS, JSX и размеры после них не менялись.
Оба audit завершились: 7 high dev/tooling, 0 production. Advisory-объекты равны
предыдущей итерации, package/lock не менялись; ранее compatible fix dry-run дал
0 changed. Не применялся несовместимый downgrade shadcn до 1.0.0.
Логи `/tmp/rollapp-sparse-{audit,production-audit}.json`.

Read-only live CUA review реальной career/about: native Cmd+Shift выбирает
два несоседних абзаца, все четыре border/outline 0, shadow none, root overflow
false. Escape снимает выбор. Сохранение/изменение текста не вызывалось, собственная
вкладка 24 закрыта; вкладка пользователя не менялась. Production direct TLS
service остаётся работающим.

## Составное форматирование и исправление регрессии

Диагностика red A / green C → quote → blue воспроизвела наложение старого
paragraph.blockColor на новый цвет контейнера:
`/tmp/rollapp-sparse-quote-recolour-diagnostic.json`.
Исправлено владение цветом собственного первого paragraph/summary у quote,
list item, task item и toggle. Независимые вложенные блоки и inline marks
сохраняют оформление. Выбор целого list container окрашивает его прямые пункты
и маркеры, включая reset; нормальная CellSelection сохраняет собственную семантику.
После исправления тот же пример даёт blue/default/blue:
`/tmp/rollapp-sparse-quote-recolour-after.json`. Добавлены два чистых теста и
нативная составная цепочка для восьми типов на каждом viewport; все 8 cases прошли.

Второй полный прогон обнаружил потерю группы при lifting list items: преобразование
heading/quote/paragraph/code оставляло часть выбора. Диагностика:
`/tmp/rollapp-sparse-conversion-diagnostic.log` и последующие diagnostic логи.
Интервальный bookmark и нормализация именно первого paragraph пункта
восстанавливают все выбранные units; wrapping/nested Tab и направление проверены
unit-тестами. Предыдущий диагностический conversion проход уже дал 8 PASS
(`/tmp/rollapp-sparse-conversion-fourth-diagnostic.log`), финальный повторяет его
без instrumentation и с прямым assert всех четырёх выбранных units.

## Остаток цели и ограничения

Несоседний Tab/Shift+Tab пока не выполняется; обычный Shift block-range через
фиксированные секции ещё не реализован. Произвольное вложение прозы,
полный обратный аудит сложных toggle, drag через фиксированные секции,
весь sparse/mixed table clipboard, media и ручки/рост/перенос таблиц остаются
в `docs/notion-text-experience.md`. Windows и реальные iOS/Telegram/WebKit/IME
не проверены; synthetic composition — только часть доказательства.
Sparse commands здесь проверены в тёмной теме; светлая/тёмная отрисовка выбора
по-прежнему входит отдельными 18 сценариями в полный редактор.

Никаких production test writes, schema changes, commit/deployment не было.
Чужие изменения сохранены. Цель не объявляется достигнутой.

[Машиночитаемый текущий результат](notion-sparse-blocks-verification-2026-10-18.json).
Полный редактор в JSON помечен passed. Общая цель R1–R10 остаётся active.

После этого исправлены независимые устаревшие Gallup assertions: unit suite
даёт 598 PASS / 1 SKIP / 0 FAIL, browser reports — 22 PASS. Исторический
comprehensive FAIL выше относится к прежнему тесту; свежий полный аудит
запускается отдельно и ещё не считается успешным.
[Текущий report contract](report-contract-verification-2026-10-18.md).

Свежий общий аудит фактически запущен: session 37512,
`/tmp/rollapp-notion-comprehensive-after-contract.{log,json}`. Зафиксированы
481 code/config source files; их mtime не позднее запуска. До авторитетного
завершения этот аудит имеет статус running, не PASS.

Итог повторного общего аудита: **все 9 этапов PASS, exit 0**; 481 исходник
не менялся. Это baseline до подготовленного исправления границ блоков.
[Полный результат](notion-comprehensive-verification-2026-10-18.md). Общая цель R1–R10 остаётся открытой.
