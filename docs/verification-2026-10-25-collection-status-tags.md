# Теги статуса карточек — 2026-10-25

Базовый commit: `9daf0a4fff52c251eff6c5fa8cebcd55ccae4277`. Проверены dirty-изменения на ветке codex/transparent-header-20261024. До начала был изменён только отчёт предыдущего выпуска; он сохранён и не относится к этому исправлению.

Причина: badge и 48px touch-ручка занимали верхний левый угол. Legacy display:none ручки также проигрывал upstream inline-flex utility и показывал её при работе мышью. Badge с фиксированной высотой/nowrap и непосредственным текстовым flex-узлом мог обрезать длинный статус в узкой карточке.

Исправления:
- Общий CollectionSnippetBadge использует неизменённый официальный Badge: переносимый span с min-width:0, auto height, несжимаемая 12px иконка, полный title.
- Тренировки, курсы, конференции, коучинг и препараты используют одну композицию.
- Видимость ручки перенесена в продуктовый utilities слой spacing.css. При mouse-only она скрыта, на touch/coarse остаётся 48px. Когда ручка показана, badge владельца находится внизу изображения; read-only карточки сохраняют прежнее верхнее положение. Условие учитывает широкие touch-устройства.
- Обновлены docs/design-system.md и docs/drag-and-drop.md. Guard test:ui проверяет официальный Badge внутри общего компонента и использование этого компонента всеми пятью поверхностями; остальные primitive assertions сохранены.

Проверки:
- npm run test:drag-drop: PASS, полная матрица 320/390/767/768/820/1024/1440/1920, включая короткий 820×450. Добавлены реальные WorkoutCard: все три статуса × owner/read-only × mouse/touch × обе темы. Проверяются каждый native glyph rect, отсутствие обрезания/пересечения badge и ручки, 12px иконка, границы media и root overflow. Все прежние native reorder/cancel/grouping/rollback/access/calendar assertions сохранены. Лог /tmp/rollapp-status-tags-full-drag.log.
- DRAG_WIDTHS=320: диагностический PASS, не замена полной матрицы. Во время разработки диагностикой пойманы приоритет legacy/utility display и приоритет unlayered badge top; оба исправлены без ослабления assertions.
- npm run test:ui: PASS.
- npm test: 830 PASS, 1 skip, 0 FAIL.
- npm run build: PASS, предупреждение о chunks.
- npm audit / npm audit --omit=dev: 0 уязвимостей.
- git diff --check: PASS.

Просмотрены актуальные screenshots: /tmp/rollapp-drag-drop/status-tags-touch-390.png, status-tags-mouse-390.png, status-tags-touch-1440.png. Снимки содержат несохранённые fixture props; реальные API запрещены. Полный comprehensive и физическое touch-устройство в этой задаче не проверены. Новый production rollout не выполнялся; production остаётся на 9daf0a4. Данные и схема БД не менялись. Основной persistent dev API/frontend проверен и оставлен работать.
