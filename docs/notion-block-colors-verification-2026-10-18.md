# Цвет блоков — 18 октября 2026

Проверено dirty-дерево на HEAD
`710457583a873ce56b93d4eb26849731164f5b2d`. Чужие изменения сохранены.
Коммит, deployment, миграции и synthetic production-записи не выполнялись.
Общая цель остаётся открытой в [notion-text-experience.md](notion-text-experience.md).

## Результат

Добавлены цвет текста или фон целого блока: меню «Цвет блока», `/red`,
`/blue background`, `/default`, русские aliases и отдельный Undo. Модель блока
использует один enum, как описано в
[Notion block API](https://developers.notion.com/reference/block#paragraph);
способы вызова соответствуют
[Style & customize](https://www.notion.com/help/customize-and-style-your-content)
и [Keyboard shortcuts](https://www.notion.com/help/keyboard-shortcuts).

Цвет — атрибут узла, а не mark всех имеющихся букв. Он работает у пустого блока,
сохраняется при вводе, Enter и смене типа. Независимые inline marks остаются.
Группы и текстовые диапазоны, в том числе обратные через ответы, меняются одной
транзакцией; защищённые вопросы не затрагиваются. «Цвет ячеек» окрашивает всю
выбранную ячейку/колонку, включая header cells. Изображения и разделители не
предлагают текстовое действие цвета; их импортированные метаданные сохраняются.

Обычный Markdown остаётся прежним. Цветные блоки хранятся читаемым canonical HTML
под `<div data-inline-block="true">`, который при разборе не добавляет узел в
документ. Общий table/block кодек сохраняет вложенные структуры, marks, whitespace,
spans, атрибуты и числовые/строковые image sizes. Неизвестные/опасные/повреждённые
теги, enum и standalone structural children остаются буквальным текстом.

Ctrl/Cmd+Shift+H использует общий последний цвет браузера между редакторами и
после reload. Предпочтение содержит только enum/scope, без текста; отказ
LocalStorage переключает его на память страницы. Это не серверная синхронизация
между устройствами. Inline/text selection и block/cell selection сохраняют
свои режимы. Read-only не применяет форматирование.

`src/typeset.css` использует прежние ink-токены. Локальный foreground наследуется
strong/heading/link/marker, явные inline цвета независимы. Полный фон не добавляет
border/outline/ring/shadow и не меняет размеры/ритм Geist. Ячейки используют
локальное правило, перекрывающее стандартный muted background th.

## Проверки

| Команда | Результат |
| --- | --- |
| `npm run test:text-edit -- --block-colors-only` | PASS: 8 размеров; последующие небольшие проверки codec/eligibility входят в итоговый full run |
| `npm run test:text-edit` | PASS: полный прогон 91 case, включая восемь размеров новых block colours; exit 0 |
| `npm run check:comprehensive` | FAIL на прежнем Gallup assertion: 574 теста, 572 PASS, 1 SKIP, 1 FAIL |
| `npm run test:ui` | PASS: 37 primitives, 68 application JSX sources |
| `npm run test:controls` | PASS: полная повторная матрица 132 cases, включая видимые pixel bounds / DPR 3; exit 0 |
| `npm run build` | PASS; прежнее предупреждение chunk >500kB |
| `npm audit` / `npm audit --omit=dev` | 7 high dev/tooling, 0 production; compatible dry-run: 0 changed, те же 7 high; dependency graph не менялся |

Матрица: 320×844, 390×844, 390×400, 768×844, 820×844, 1024×844,
1440×844, 1920×844. VisualViewport: 220px, offsetTop 96px. Проверяются настоящий
ввод/кнопки, текущий selected color, пустой блок/Enter/type, neighbours, смешанные
marks, одно Undo, группы/ячейки, exact save/reload/public read, обратное выделение
через вопросы, HTML clipboard, draft/retry, read-only, два независимых editor
instances и preference reload/storage failure. API в fixtures запрещён.

Проверка HTML paste обнаружила потерю конечного пробела. Clipboard parser теперь
использует `preserveWhitespace: "full"` для собственного HTML с безопасными
метками/PM slice, оставляя стандартный разбор обычному внешнему HTML. Regression
сравнивает весь pasted heading с оригиналом, включая marks и пробел.

Первый controls run завершился сигналом (exit 143) после части матрицы, без
assertion stack. После terminal результата запущен полный повтор; частичный
прогон не считается проверкой всей матрицы. Повтор завершён: 132 PASS, exit 0. Точные логи и hashes — в JSON.

Живая career/about с configured production API прочитана без ввода: один editor,
0 toolbar, border 0 / outline none / shadow none, root overflow нет. Отдельно
в публичном fixture светлой темы при 1280px проверены red/strong inheritance,
независимый blue, background alpha 0.24 и 18/28. Это статическая desktop сверка,
не полная светлая interaction matrix. Временные вкладки закрыты. Persistent dev
service PID 99362 оставлен работать. Итоговый full run завершился с 91 PASS
на неизменных исходниках; source hashes проверены после завершения.

## Незавершённое

Прямое соответствие Notion для наследования цвета после Enter ещё не подтверждено;
текущее поведение проверено только как контракт Rollapp. Полный arbitrary nested
clipboard/style audit, Ctrl/Cmd+/ action search и остальные открытые R4–R10,
table hover/touch handles/media и реальные iOS/Telegram keyboards остаются в
общей матрице. Не заявляется ни готовность идентичного Notion, ни успешный общий
аудит приложения: его по-прежнему останавливает существующий Gallup assertion.
