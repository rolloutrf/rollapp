# Удаление кнопки To Do из календаря — 2026-10-24

Базовый commit: `95223417bdd06683875ef7cf273ecab599270779`; dirty до начала и во время задачи, чужие изменения сохранены.

В `src/components/planning-calendar.jsx` удалены только кнопка «Открыть To Do», её обработчик `openTodo` и импорт `ListTodo`. Кнопка создания задачи остаётся.

- `npm run test:ui`: PASS.
- `git diff --check`: PASS.
- `npm run dev:keepalive:status` вне sandbox: API и frontend готовы, сервис оставлен работать.
- Просмотрен актуальный `/tmp/rollapp-events-320-900.png`: кнопки списка нет, верхний ряд содержит предыдущий период, дату, следующий период и добавление.
- `npm run test:calendar`: PASS, полная матрица 320/390/768/820/1024/1440/1920 × 900/400; лог `/tmp/rollapp-remove-todo-button-calendar.log`.
- `npm run test:controls`: PASS, полная матрица; лог `/tmp/rollapp-remove-todo-button-controls.log`.
- Общий comprehensive, начатый предыдущей задачей, продолжает выполняться; он не считается проверкой стабильного снимка, так как дерево изменялось.

Аудит npm выполнен предыдущей задачей в этой сессии: 3 high и 1 moderate, production: 3 high. Зависимости в этой задаче не менялись. Live production UI не просмотрен: доступной авторизованной сессии нет, Mac заблокирован. Данные БД не менялись, деплой не выполнялся.

## Перенос перед push

Первый push отклонён (non-fast-forward). В отдельной чистой рабочей копии коммит перенесён на `cae73c3` из origin/main. Конфликт разрешён сохранением нового общего `PlanningDayRibbon` и удалением только overview; удалён оставшийся неиспользуемый `dateLabel`. Исходная рабочая папка и её чужие dirty-файлы не изменялись при переносе.

Проверенный перенесённый commit: `2c72bc7`, чистое дерево перед проверками. `npm ci --ignore-scripts`, `npm run test:ui` и `npm run build`: PASS. `TODO_WIDTHS=390,1440 npm run test:todo`: PASS; это повторная диагностическая матрица двух ширин × 844/400, а не полный повтор 320–1920. Дополнительные встроенные task-outcome cases выполнялись по собственному набору сценария. Логи: `/tmp/rollapp-push-install.log`, `/tmp/rollapp-push-build.log`, `/tmp/rollapp-push-todo.log`. Полный release/comprehensive на перенесённом снимке локально не выполнялся; release выполняется workflow после push. npm ci сообщает одну moderate advisory на новой базе. Проверки предыдущего снимка выше сохранены как исторические результаты.
