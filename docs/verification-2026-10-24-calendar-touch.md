# Перенос календарных событий пальцем — 24 октября 2026

Начальный commit: `95223417bdd06683875ef7cf273ecab599270779`. Проверяется dirty workspace, не отдельный commit. Во время параллельной работы HEAD сменился на `f55cce47e5718bc411f39cfc9436930deb152f23`; финальная матрица выполняется поверх него. В начале уже изменены package.json и lab-results; во время проверки появились параллельные изменения планирования, общего layout и identity reports. Они сохранены. Удаление кнопки To Do из календаря относится к параллельной работе, не к этому исправлению.

## Исправление

Раньше события использовали только HTML drag-and-drop; повторения исключались полностью. Дневная/недельная сетка теперь принимает touch/pen pointer-перенос, с capture исходного DOM, порогом 4px, сохранением точки захвата/длительности и шагом 15 минут. Preview не переносит DOM-владельца в другую колонку. Пустая сетка сохраняет native scroll; тап открывает детали. После drag/cancel случайный click не открывает popover, клавиатурное открытие остаётся доступным.

Повторяющееся событие переносится по времени также мышью; один patch идёт исходному sourceId. Начало/окончание серии и завершённые даты сохраняются. Изменение даты серии остаётся в редакторе. Escape, pointercancel, lost capture, blur, смена периода/источника отменяют pointer-сессию. Undo использует исходный id и сохранённое расписание.

По обязательному правилу аудита выполнен `npm audit fix --ignore-scripts` (12 совместимых обновлений, включая Vite/zod/body-parser/fast-uri и транзитивные зависимости); изменения записаны в package-lock.json, без принудительного major downgrade.

## Проверки

- `npm run dev:keepalive:status`: готов; API/frontend готовы, постоянный production dev service оставлен работающим. Первый sandbox-check не смог проверить PID; повтор вне sandbox успешен, PID-файл не удалялся.
- Read-only live review через существующую авторизованную браузерную сессию: календарь production dev, 24.10.2026, дневной вид, «Препараты, 10:00–10:30» загружен, computed touch-action=none. Реальные события не сохранялись.
- `npm test`: 791 passed, 1 skipped, 0 failed (792 total) после обновления зависимостей. Первоначальные четыре EPERM listener failures в sandbox устранены повтором вне sandbox.
- `npm run test:ui`: passed.
- `npm run build`: passed, остаётся предупреждение о размере chunks.
- `npm audit --json`, `npm audit --omit=dev --json`: 0 vulnerabilities после совместимых обновлений.
- Первая полная матрица календаря: passed, 7 ширин × 2 высоты. Дополнительный mouse-series/keyboard/Undo diagnostic: passed на 320×900 и 320×400. При написании проверки Undo выбран старый toast; исправлен выбор последнего уведомления серии. На коротком экране уведомления перекрывали mouse-target; событие явно прокручивается в центр перед жестом. Первая полная drag-drop матрица: passed, 8 ширин. Финальный повтор после обновления зависимостей и добавления mouse-series/keyboard/Undo regression: **passed**, все 14 случаев календаря (320/390/768/820/1024/1440/1920 × 900/400), exit 0. Полная drag-drop матрица после обновления зависимостей: **passed**, все 8 ширин, exit 0. Финальные UI audit/build и git diff --check: passed.

Логи: `/tmp/rollapp-calendar-{touch-full,drag-full,unit,ui,build}.log`, аудиты `/tmp/rollapp-calendar-audit{,-production}.json`. Снимки календаря: `/tmp/rollapp-events-*.png`; просмотрены mobile 390×900 и desktop 1440×400. Fixture запрещает API и передаёт несохранённые props, не заменяя production database.

## Границы

Реальный iPhone/Safari hardware touch не подтверждён: браузерные touch-тесты используют native CDP input в Chromium. Перенос всей серии на другую дату, edge-scroll во время захваченного touch-жеста, полный check:release/check:comprehensive и deployment не проверялись/не выполнялись в этой задаче.

## SHA-256 проверенного изменения

```text
b9036f634b0fd750ed7e31a34c15085551b202f3e3435d76a1e9357c8ab699aa  src/components/planning-calendar.jsx
66f3480e5c5ee6d0de175bad86a443fe00d07938b1b9f0bed2aea54b818db856  src/components/planning-calendar.css
f6770a905c7f9d5c726aab9023921591467a2fd3b667ba1aa62b25c902ee5771  scripts/calendar-events-smoke.mjs
93e55e4479fba2719d70c25c42c0d38ed01dbae7065ab7bbc6b147836e6327e8  package-lock.json
```
