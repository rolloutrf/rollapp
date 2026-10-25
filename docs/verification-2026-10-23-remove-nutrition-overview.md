# Удаление обзора питания — 2026-10-23

Базовый SHA 237386530fd11e359f6f997735537b85e6ccb419; dirty snapshot содержит сохранённые предыдущие локальные правки To Do, шапки, лент и бейджей.

Удалён весь указанный пользователем блок NutritionTodo: «Питание на день», крупная дата, счётчик, дополнительный desktop date picker, разделитель и контейнер. Неиспользуемый форматтер и общие CSS обзора удалены после проверки отсутствия других потребителей. Итоги/список следуют за лентой или мобильной навигацией без пустого места. docs/spacing-system.md синхронизирован.

Проверки:

- npm run test:health — PASS, полная штатная матрица 320/390/768/820/1024/1440/1920 и 390×400/1024×400, nutrition/sleep, смена дня, ошибки/retry, checkbox/totals, edit/delete/create, readonly и midnight. Лог /tmp/rollapp-remove-nutrition-overview-health-final.log. Проверка удалённого счётчика заменена на видимые итоги и сохранённые checkbox assertions; добавлена проверка отсутствия overview. Первоначальный helper ошибочно ожидал «0 ккал» при отсутствии отмеченных записей; исправлен на существующее семантическое «— ккал», продуктовая логика totals не менялась.
- npm run test:ui — PASS, 37 primitives / 84 JSX.
- npm run build — PASS, стандартное предупреждение о размере chunks; /tmp/rollapp-remove-nutrition-overview-build.log.
- git diff --check — PASS.
- Визуально проверен nutrition screenshot 768×900: overview и разделитель отсутствуют.
- npm run dev:keepalive:status — готов, production TLS connection оставлен работающим.

UI fixtures запрещают реальные API, production данные не изменялись. Полный comprehensive и публикация не выполнялись. Production SHA остаётся прежним.
