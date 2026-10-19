# Создание текстовых блоков — проверка 2026-10-17

Проверено: `710457583a873ce56b93d4eb26849731164f5b2d`, dirty workspace. Дата: 2026-10-17T20:59:19.311513+03:00. Чужие изменения сохранены; коммит и deployment не выполнялись.

«+» открывает поисковый выбор типа для вставки ниже, Alt/Option+«+» — выше. На узких экранах те же действия находятся в меню блока. Открытие, поиск, отсутствие результатов и отмена не меняют документ. После выбора курсор получает новый блок; создание и ввод отменяются отдельно.

Каталог: текст, заголовки 1–4, маркированный/нумерованный списки, чек-лист, раскрывающийся список и цитата. Общий picker обслуживает создание, смену типа и slash-команды. Перевод списка/toggle в текст сохраняет содержимое. Markdown сохраняет вложенные блоки, отметки задач, семантические директивы и код. Пустое содержимое toggle остаётся редактируемым после загрузки.

Рамок вокруг редактируемого текста нет. Отступы toggle принадлежат shared typeset; preview использует семантическую шкалу. Закрытие popup не сбивает курсор, Alt не скрывает «+», прокрутка стрелками не переключает выбор из-за неподвижной мыши, изменение высоты клавиатурой не анимирует max-height.

## Результаты

| Команда | Результат |
| --- | --- |
| `TEXT_EDIT_PORT=5299 npm run test:text-edit` | passed: full 8-viewport matrix and advanced scenarios |
| `TEXT_EDIT_PORT=5299 TEXT_EDIT_WIDTHS=1440 npm run test:text-edit` | passed: supplemental advanced cases, including shared toggle typography at 390/1440 × 400 |
| `npm run test:ui` | passed: 37 primitives, 64 application JSX sources |
| `npm run test:controls` | passed: 132 cases including screenshot pixels and DPR 3 |
| `npm run test:dates` | passed: full 13-case configured matrix |
| `npm run build` | passed; existing chunk-size warning remains |
| `npm run check:comprehensive` | failed on release unit stage: 512 passed, 1 skipped, 1 unrelated failure in src/components/identity-reports.test.js (Gallup DNA labels must use shrinkable grid tracks). Later comprehensive stages not run. Editor unit cases all passed. |
| `npm audit` | 7 existing high-severity development-tool dependencies; no forced incompatible downgrade |
| `npm audit --omit=dev` | 0 vulnerabilities |
| `git diff --check` | passed |
| `npm run dev:keepalive:status` | ready; persistent service PID 52615, configured production TLS connection retained |

Полная матрица редактора: 320×844, 390×844, 390×400, 768×844, 820×844, 1024×844, 1440×844, 1920×844. Проверены создание выше/ниже, реальный Alt-клик, поиск и пустой результат, Escape без сохранения, фокус/ввод, Undo/Redo, drag/menu/keyboard movement, глубоко прокрученный документ, links, Markdown paste, буквальный slash в коде, неизвестная slash-команда с обычным Enter, save races/retry/draft recovery, общая очередь четырёх ответов и план развития.

Дополнительный прогон последней версии smoke отдельно проверил отступы toggle на 390/1440×400: первым блоком 0px, после заголовка 18px; read-only раскрытие не записывает состояние. Дополнительные assertions добавлены после старта полной матрицы, реализация в обоих прогонах одинакова.

## Живая проверка и ограничения

Production-connected document loaded; opened creation/type picker, searched heading 1, checked 36/40 preview, cancelled with caret restored. Menu 672×560 at (256,144) fits viewport; prose border 0, outline none, shadow none. No creation, conversion, deletion or test-text save performed. Temporary browser tab closed.

UI fixtures отклоняют API-запросы и не используют БД. Живая проверка использовала настроенную production API без тестовых записей. Постоянное соединение оставлено работающим.

Общую проверку нельзя считать пройденной: она остановилась на существующем тесте Gallup. Не проверены реальные клавиатуры iOS/Telegram и touch drag. Это блочный редактор с автосохранением, без совместного слияния правок между устройствами.

Команды, пути логов и SHA-256 исходников: [JSON](block-creation-verification-2026-10-17.json). Предыдущие неудачные прогоны использовались для исправления фокуса, Alt, клавиатурной геометрии и pointer/keyboard conflict; итоговые логи указаны в JSON.
