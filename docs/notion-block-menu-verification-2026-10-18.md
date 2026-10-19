# Поиск действий блока — 18 октября 2026

Проверено dirty-дерево на HEAD `710457583a873ce56b93d4eb26849731164f5b2d`.
Чужие изменения сохранены; коммит, deployment и записи в production не выполнялись.
Общая цель Notion остаётся активной; этот отчёт фиксирует одну её часть.

## Изменение

Ctrl/Cmd+/ и меню ручки блока имеют поиск действий, типов и цветов по общему
со slash каталогу. Перемещение вверх/вниз и вставка выше/ниже также находятся
по русским и английским названиям. Пустой запрос оставляет прежние действия
и инструменты таблицы. Неизвестный запрос не изменяет документ.

Стрелки выбирают результат, Enter применяет его, Escape возвращает курсор
в документ. Устранена найденная проверкой потеря позиции после закрытия поиска:
native selection восстанавливается синхронно через `editor.view.focus()`,
до следующего keydown. Асинхронный `commands.focus()` оставлял окно для потери
позиции при быстром повторном открытии меню.
Тип, цвет, duplicate/delete применяются общим transaction executor без вставки
запроса в текст, с отдельным Undo. У наведённого блока и выбранной группы
сохраняется собственный target. Снимок документа запрещает устаревшее действие.
Read-only и synthetic IME guard не применяют команду.

Поведение сопоставлено с первичным описанием
[Notion keyboard shortcuts](https://www.notion.com/help/keyboard-shortcuts):
Ctrl/Cmd+/ открывает меню с поиском действия, типа или цвета.

## Проверки

Финальный `npm run test:text-edit`: **99 PASS, код 0**, включая восемь
сценариев нового поиска и deep-document переход/отмену создания. Лог:
`/tmp/rollapp-command-search-full-text-second-final.log`.
22 source hashes не изменились за финальный прогон.
[Машиночитаемый отчёт](notion-block-menu-verification-2026-10-18.json).
Остальные проверки финальных исходников:
- `test:controls`: 132 PASS, код 0; `/tmp/rollapp-command-search-controls-frozen.log`.
- `test:ui`: 37 primitives, 68 JSX, код 0; `/tmp/rollapp-command-search-ui-frozen.log`.
- `build`: код 0, прежнее предупреждение chunk >500kB;
  `/tmp/rollapp-command-search-build-frozen.log`.
- `check:comprehensive`: 574 unit tests, 572 PASS, 1 SKIP, 1 FAIL — прежний
  Gallup CSS assertion «Gallup DNA labels must use shrinkable grid tracks»;
  прочие этапы общего аудита не запускались. Лог/JSON:
  `/tmp/rollapp-command-search-comprehensive-frozen.{log,json}`.
- `npm audit`: 7 high dev/tooling; `npm audit --omit=dev`: 0.
  `/tmp/rollapp-command-search-audit.json`,
  `/tmp/rollapp-command-search-production-audit.json`.
  Compatible fix dry-run даёт 0 changed и те же 7 high; 78 optional/platform
  additions лишь предложены dry-run. Graph и lockfile не менялись;
  принудительный несовместимый shadcn 1.0 downgrade не применялся.
  `/tmp/rollapp-command-search-audit-dry-run.json` содержит npm log prefix перед JSON.
- `git diff --check`: PASS. Исходники зафиксированы SHA256 в
  `/tmp/rollapp-block-menu-tested-sources.json` (22 файла).
Отдельная расширенная матрица `--block-menu-only` прошла 8 размеров:
320×844, 390×844, 390×400, 768×844, 820×844, 1024×844, 1440×844, 1920×844.
Проверены cancel без сохранения, смена типа/цвета, duplicate/delete/move,
Undo, стрелки с реальной клавиатуры, достижимость последнего результата, группы (включая смену
типа), grip target на desktop, save/reload, frameless prose, отказ доступа,
synthetic IME, VisualViewport 220px/offset 96px, обратимый цвет через два ответа
и сохранность четырёх фиксированных вопросов. Все fixture API отклоняются.
Первоначальная матрица: `/tmp/rollapp-block-menu-browser-third.log` (8 PASS).
Первый полный прогон обнаружил deep-document handoff за пределами короткого
viewport. Добавлена отдельная проверка: открыть/закрыть поиск у 24-го абзаца,
перейти к вставке, отменить её и сохранить исходную позицию без записи.
Прокрутка активного пункта теперь меняет только scrollTop списка;
`scrollIntoView` больше не прокручивает за ним весь документ.
ScrollTop вычисляется через layout offsets и высоту списка, без масштабированных
getBoundingClientRect: это сохраняет достижимость последнего пункта во время
анимации открытия. Исходная строгая проверка последнего пункта не ослаблялась. Фокус полей поиска
использует preventScroll. Picker также восстанавливает native selection
синхронно. Ранние неуспешные логи сохранены в `/tmp/rollapp-command-search-full-text.log`
и `/tmp/rollapp-block-menu-browser-{fourth,fifth,sixth,diagnostic}.log`.

На живой странице career/about через настроенное production-соединение проверены
открытие Ctrl/Cmd+/, поиск heading 2 и отмена. Команда не применялась.
При 1280px — один редактор, border 0, outline none, shadow none, root без overflow;
меню после Escape закрыто. После финального исправления повторно проверены
нативные Ctrl/Cmd+/ → Escape → Ctrl/Cmd+/ → поиск → Escape у последнего абзаца:
его нижняя граница остаётся 616px на всех шагах. Все временные вкладки закрыты,
persistent service оставлен.

## Ограничения

Это не подтверждение полного совпадения с Notion. Остаток исходного объёма —
в `docs/notion-text-experience.md`: непоследовательные группы, произвольное
вложение и смешанные стили при смене типа, media, ручки строк/столбцов,
полный clipboard-аудит структур через ответы и реальные iOS/Telegram keyboards.
Реальная IME и live-проверка команд с записью в production не проводились.
