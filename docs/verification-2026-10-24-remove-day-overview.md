# Удаление блока «План на день» — 2026-10-24

Базовый commit: `95223417bdd06683875ef7cf273ecab599270779`, рабочее дерево dirty до начала задачи. В процессе другие изменения продолжали появляться; они сохранены и не относятся к этому исправлению.

Удалены overview с датой, прогрессом, кнопкой календаря и разделителем, его обработчик и неиспользуемые стили. Обновлены контракт spacing и существующая To Do проверка: overview отсутствует, календарное отображение проверяется прямым переходом.

## Результаты

- `node scripts/daily-todo-ribbon-smoke.mjs`: PASS, полная матрица 320/390/640/767/768/820/1024/1440/1920 × 844/400, пустые/заполненные дни, выбор дат, скролл, создание/отмена задач; fixture блокирует реальные API. Лог: `/tmp/rollapp-remove-day-overview-todo.log`.
- `npm run test:ui`: PASS.
- `npm run build`: PASS, предупреждение о размере chunks.
- `git diff --check`: PASS.
- `npm run dev:keepalive:status` вне sandbox: API/frontend готовы; persistent service оставлен работать.
- `npm audit`: 3 high, 1 moderate; `npm audit --omit=dev`: 3 high. Зависимости в этой задаче не менялись. JSON: `/tmp/rollapp-remove-day-overview-audit{,-prod}.json`.
- `npm run check:comprehensive`: первая попытка остановилась на sandbox EPERM локальных listeners; повтор вне sandbox запущен, но на момент отчёта ещё выполняется. Полный PASS не заявляется. Лог: `/tmp/rollapp-remove-day-overview-comprehensive.log`.

Просмотрен актуальный desktop screenshot `/tmp/rollapp-date-tiles-768.png`: после плиток идут задачи, overview и его пустого контейнера нет. Все размеры проверены DOM smoke; отдельная ручная визуальная проверка каждого viewport не выполнялась. Live UI с production API не просмотрен: в доступном браузере нет существующей авторизованной сессии, native UI недоступен из-за блокировки Mac. Production данные не менялись; деплой не выполнялся.

## Хеши проверенных исходников

- `src/components/planning-daily-todo.jsx`: `0858521b45ffff8cd83595bd9379b05e559439fe35c5473aa4280c2468251b6b`
- `src/components/planning-daily-todo.css`: `741bdf5bc039b9aff4598ea3df3af0a50b54567858494dcd9896d8c7f433b917`
- `scripts/daily-todo-ribbon-smoke.mjs`: `46cbab5c6edbc2f0258aae534d70ac1225f866724ab69a462577ea348e5d6ea5`
