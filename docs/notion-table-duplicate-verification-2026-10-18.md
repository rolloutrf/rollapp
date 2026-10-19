# Дублирование строк и столбцов — 18 октября 2026

HEAD `710457583a873ce56b93d4eb26849731164f5b2d`, dirty.
[JSON](notion-table-duplicate-verification-2026-10-18.json).

Предыдущая итерация дала progress: воспроизведено скрытие native caret и
проверен исправленный source610 на20cases; это изменение пока не в main.
Текущий source611 наследует его в новой изолированной копии, production API
не запускается, UI fixture блокирует все API requests. Main608 остаётся неизменным,
его comprehensive72580/controller2055 подтверждён живым по PID93451/94826 и log.

В контекстное меню таблицы и hover-меню строки/столбца добавлено дублирование.
Одна транзакция копирует содержимое и attrs, выделяет новую полосу и оставляет
один Undo. Объединённые ячейки копируются целыми connected bands: ни одна
не разрезается и не теряет детей. Заголовки первой строки/столбца сохраняют
позиционную роль; ширины, цвета, marks и нетронутые соседи остаются точными.
Произвольный прямоугольный CellSelection дублирует все выбранные rows/columns;
read-only/composition/неверные indices не вызывают dispatch.

Unit включает обычные и Four Questions документы, полные/multi-row/merged bands,
пересечение row/column headers, rich tasks/toggles/links и literal code whitespace,
Markdown roundtrip и один Undo. Финальный unit660 завершён exit0:659PASS/1SKIP/0FAIL.
Browser duplication19748 завершён exit0/9PASS на320/390/768/820/1024/1440/1920×844
и390/1440×400. Через настоящие keyboard/context и desktop hover menus проверены
обе оси, spans/два абзаца/цвета/links, native Undo/Redo, точный save/reload,
border/outline/shadow0, отсутствие overflow и API/errors.

UI37/69 и buildPASS. Frozen source611 проходит дополнительные19совместимых
cases:9existing table handles/drag и10real app chrome; session6204. Они пока
pending. Текущий main comprehensive остаётся228cases, а не246: новые функции
ещё не перенесены, его результат не подменяется результатом кандидата.

R8 grid growth/media, сложные nested clipboard/styles/Enter ownership и real device
IME остаются открытыми. [Официальное описание simple tables](https://www.notion.com/help/columns-headings-and-dividers#simple-tables)
отдельно описывает создание строк/столбцов через hover-plus и изменение сетки
углом; эти возможности не считаются выполненными наличием кнопок в меню.

Финальный targeted candidate611: duplication9 +axis9 +chrome10=28browserPASS, unit660/659PASS/1SKIP, UI/buildPASS. Compatibility6204 завершён exit0; source611 drift0, main608 drift0. Кандидат сохранён, переноса и полной регрессии нового source ещё нет.
