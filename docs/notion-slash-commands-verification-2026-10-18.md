# Команды в существующем тексте — 18 октября 2026

Проверено dirty-дерево на HEAD
`710457583a873ce56b93d4eb26849731164f5b2d`. Чужие изменения сохранены.
Коммит, deployment, изменения API/схемы и synthetic-записи в production не выполнялись.
Полная цель остаётся открытой: [notion-text-experience.md](notion-text-experience.md).

## Изменения

`/` в начале строки, после пробела или Shift+Enter открывает команды в уже
существующем тексте. Каталог типов дополнен `/duplicate` и `/delete` с русскими
aliases; удаление имеет destructive variant. Меню поддерживает стрелки, Enter,
Tab к активной кнопке, roving focus со стрелками/Home/End и Escape. Это расширяет прежний ввод только в начале
абзаца; официальный источник для slash-действий —
[Writing & editing basics](https://www.notion.com/help/writing-and-editing-basics).

Жизненный цикл меню связан с конкретным набранным slash. Дismissal, уход курсора,
Undo/Redo, загруженный/pasted текст не открывают его повторно; URL/пути без пробела
перед slash, ссылки, code и read-only остаются буквальными. Перемещение курсора
внутри query сохраняет полный диапазон замены. Текст по обе стороны и marks
сохраняются. Меню действий/ссылки скрывает slash, не дублируя панели.

Удаление query и изменение структуры выполняются одной транзакцией. Это важно
для дублирования и вставки таблицы после непустого абзаца: не соседние изменения
иначе разделяются PM history. Общие команды работают с той же staged transaction;
их внутренний focus отложен до dispatch, чтобы не разрешать старое выделение
относительно нового документа. Один Undo возвращает исходный блок и query;
следующий ввод имеет свой шаг истории. Вложенное содержимое/checked state
дублируются вместе с пунктом. В ячейке действие касается текстового блока;
четыре фиксированных вопроса остаются защищёнными.

При проверке reload обнаружена потеря крайнего пробела обычным Markdown.
`inline-rich-code.js` теперь использует существующий безопасный inline HTML
fallback также для обычной прозы с крайними/повторными пробелами, CR/LF/табами
и marks на hard break. Также сохранены ведущие/конечные/повторные soft breaks
и переносы внутри heading/semantic roles: стандартный Markdown раньше терял их
или менял структуру блоков. Code mark не добавляется. Публичный лёгкий renderer
сохраняет visible whitespace через pre-wrap и marks на `<br>`. Unit сравнивает
точный JSON; browser проверяет public rendering и реальное расстояние строк.

Slash/link FloatingMenu подписаны на VisualViewport resize/scroll и обновляются
после shared CSS layout. Cross-axis shift и учёт последующего offset сохраняют
16px поля на коротком panned viewport. Рамок у prose по-прежнему нет.

## Проверки

| Команда | Результат |
| --- | --- |
| `npm run test:text-edit -- --slash-only` | PASS: 8 размеров, включая текущие keyboard/literal/soft-break/public/nested проверки; exit 0 |
| `npm run test:text-edit` | PASS: 83 сценария, включая полную slash/table матрицу; exit 0 |
| `npm run check:comprehensive` | FAIL на прежнем Gallup CSS assertion: 569 тестов, 567 PASS, 1 SKIP, 1 FAIL |
| `npm run test:ui` | PASS: 37 primitives, 68 application JSX sources |
| `npm run build` | PASS, exit 0; остаётся предупреждение chunk >500kB |
| `npm audit` / `npm audit --omit=dev` | 7 high dev/tooling; 0 production vulnerabilities. Dependency graph не менялся |

Матрица: 320×844, 390×844, 390×400, 768×844, 820×844, 1024×844,
1440×844, 1920×844. На коротком экране — VisualViewport 220px / offsetTop 96px.
Fixtures запрещают API. Проверяются реальные клавиши, кнопки, native DOM ranges,
атомарный Undo/Redo, дальнейший ввод, сохранение/reload, буквальный/dismissed ввод,
inline/soft-break/cell/four-answer scope, public whitespace и marked breaks,
вложенный checked list item и достижимость последней destructive-команды.

Промежуточные проверки нашли потерю пробела при reload и старое положение меню
после panning; обе находки исправлены. Тест возврата фокуса теперь ждёт реальный
focus после штатного Tiptap requestAnimationFrame. Проверка soft break считает
документные узлы, исключая view-only caret placeholder. Fixture вложенного списка
исправлена с шести пробелов (это code) на два. У `<br>` нулевая площадь, поэтому
публичный тест проверяет attachment под strong и фактическую разницу координат
строк вместо Playwright visibility самого br. Assertions результата не удалялись.
Дополнительная DOM-free проверка подтвердила потерю trailing hardBreak в P/H2;
добавлен точный round trip для ведущих/конечных/повторных переносов в трёх
типах блоков и настоящий browser save/reload после Shift+Enter → heading.
До финального прогона также исправлен roving focus общего picker: при стрелках
фокус кнопки теперь следует за активной подсветкой, Home/End доступны вне search
input. Предварительный полный прогон намеренно остановлен (exit 130) для этого
изменения, после чего выполнен заново; его частичный результат не считается
полной проверкой. Остальные промежуточные остановки также выполнены явно
только для принадлежащих этому smoke процессов, перед финальными исправлениями;
production dev service не останавливался. Tab с пустым результатом теперь закрывает
меню без потери текста; Enter после pointer movement выбирает подсвеченный item,
включая случай, когда прежняя кнопка сохраняет клавиатурный фокус.

Живая страница career/about прочитана с configured production API: один редактор,
0 toolbar/slash menus, border 0 / outline none / shadow none, root overflow нет.
Ничего не вводилось и не сохранялось. Временная вкладка закрыта, persistent dev
service PID 99362 оставлен работать. Source hashes и логи — в одноимённом JSON.
Полный прогон завершился с 83 PASS на неизменных исходниках; source snapshot
проверен после завершения. Частичные запуски не подменяют этот результат.

## Незавершённое

Slash-цвета/фон целого блока и оставшиеся текстовые действия Notion ещё нужны.
Не подтверждены настоящие iOS/Telegram keyboards и IME; guards не заменяют эту
проверку. Табличные hover/touch-ручки, перенос/дублирование строк/столбцов, media,
произвольные вложенные clipboard-сценарии и прочие открытые R5–R10 сохранены в
полной матрице. Общий аудит приложения не пройден из-за существующего Gallup
assertion; готовность идентичного опыта Notion не заявляется.
