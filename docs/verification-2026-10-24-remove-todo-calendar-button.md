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
