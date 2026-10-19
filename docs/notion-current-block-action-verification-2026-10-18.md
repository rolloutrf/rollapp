# Cmd/Ctrl+Enter текущего блока — 18 октября 2026

Изолированный кандидат, пока не перенесён в основной код. [JSON](notion-current-block-action-verification-2026-10-18.json). HEAD `710457583a873ce56b93d4eb26849731164f5b2d`, dirty.

Официальные [клавиатурные команды Notion](https://www.notion.com/help/keyboard-shortcuts) обещают отметку текущей задачи и раскрытие/сворачивание текущего toggle через Cmd/Ctrl+Enter. Исходный браузерный counterprobe воспроизвёл `checked:false` и вставку `hardBreak` вместо отметки: `/tmp/rollapp-mod-enter-before.log`.

Кандидат меняет только checked/open у текущего taskItem/details, сохраняя остальные attributes, descendants, marks и соседей. Undo/Redo отделены от предшествующего и следующего ввода. Attribute-only transaction явно восстанавливает bookmark: обычный replacement mapping терял NodeSelection на изменённом opening token. Сохраняются TextSelection, одиночный BlockSelection/NodeSelection и pending marks. Multi-block ranges, изменённые сочетания, composition и read-only не запускают команду.

Database-free unit suite: **651 total, 650 PASS / 1 SKIP / 0 FAIL**, UI/build exit0. Восемь целевых browser cases (320/390/390×400/768/820/1024/1440/1920) прошли native shortcuts, parent/child tasks, open/closed toggle, точный caret, block selection, Undo/Redo, Markdown save/reload и guards. Все API requests блокируются. IME здесь синтетический, это не проверка устройства.

Запущен полный editor run кандидата, ожидается **203 PASS**, snapshot604 sources; screenshot-only hook добавлен после целевого прогона и проверяется этим полным запуском. Main comprehensive24320 проверяет snapshot595 и остаётся замороженным: туда это исправление ещё не входит. Временные fixture fs.allow / realpath конфигурации не предназначены для переноса; дополнительные диагностические файлы и chart-only отличия перечислены в JSON.

Цель Notion остаётся открытой; наличие этой команды не закрывает аудит вложенного Enter, таблиц/media, clipboard и реального мобильного ввода. Production data не изменялись.

Полный изолированный editor run terminal: **passed**, exit0, PASS203, sourceDrift[], added[]. Это snapshot604, без новой relocation-depth защиты; перенос в main и объединённая регрессия отдельно.

Перенесено в main 2026-10-18T16:17:21.116279+00:00. Новая объединённая версия ещё требует полного прогона; предыдущие comprehensive195 / isolated203 относятся к своим snapshot. Изолированный control run блокировал dependency fonts и не служит окончательным font/appearance доказательством.
