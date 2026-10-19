# Ручки строк и столбцов — 18 октября 2026

Изолированный кандидат, пока не перенесён в main. [JSON](notion-table-axis-verification-2026-10-18.json). HEAD `710457583a873ce56b93d4eb26849731164f5b2d`, dirty. Snapshot611 sources.

Официальные [простые таблицы Notion](https://www.notion.com/help/guides/simple-tables-vs-databases) описывают ручки и drag строк/столбцов. Кандидат добавляет эти действия в Rollapp: hover-ручки на desktop, меню выбранной оси, прямое pointer-перемещение с синей линией, доступные команды через существующее Ctrl/Cmd+/ на всех размерах. Постоянной панели и рамки редактора нет. ControlBar задаёт48px, четыре радиуса24px и glyph20px.

Использованы установленные ProseMirror table commands. Merged cells образуют связанный band: перенос не разрезает spans. Сохраняются cell attrs, marks, дочерние блоки, позиционные header roles и соседние блоки/фиксированные ответы. Перенос отделён в Undo. API/DB schema и зависимости не менялись.

Исправлены ошибки UI-кандидата: view ещё не готов при mount; measurement нужно брать из явно переданной ячейки; после закрытия popup нужен синхронный focus редактора для немедленного Undo. Скриншоты обнаружили общие grip/plus поверх ячеек: CSS visibility родителя не скрывала кнопку до завершения transition-all. Пока axis controls занимают gutter, suppression применяется к descendants без transition; после выхода обычный handle возвращается. Menus сохраняют opaque фон после анимации.

Frozen unit suite656:655PASS/1SKIP/0FAIL, UI/build exit0. Девять axis viewport cases и два guard cases проходят native pointer, guides, отсутствие дублирующихся контролов, keyboard activation после drag, Undo, exact Markdown reload, Escape/doc/access guards. Window blur синтетический; capture loss нативный, с последующим pointer event. Старые table cases8, basic-block cases8 и mandatory test:controls ещё выполняются в одной последовательности73217. До её завершения общий target результат не заявлен.

Изолированный источник сохраняет временные fixture fs.allow/realpath и старые chart-only отличия; их не переносить в main. Public assets скопированы без изменений, чтобы mandatory control test использовал реальные существующие шрифты. Горизонтальный autoscroll, живой header/table composition, реальные устройства, duplication/grow/media и полный объединённый прогон ещё нужны. Цель Notion открыта.

Перенесено в main 2026-10-18T16:17:21.116279+00:00. Новая объединённая версия ещё требует полного прогона; предыдущие comprehensive195 / isolated203 относятся к своим snapshot. Изолированный control run блокировал dependency fonts и не служит окончательным font/appearance доказательством.
