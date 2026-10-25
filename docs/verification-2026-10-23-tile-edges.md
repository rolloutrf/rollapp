# Общие края лент плиток — 2026-10-23

База: 237386530fd11e359f6f997735537b85e6ccb419, dirty snapshot; предыдущие локальные правки обзора To Do и прозрачной шапки сохранены.

Причина расхождения: PlanningDayRibbon использовал локальную mask-image с fade 8%/92%, Wishlist — нативный hard clip; лента питания дополнительно ограничивалась внутренним контейнером.

Wishlist navigation, групповые списки образования и общий PlanningDayRibbon (To Do/питание) подключены к horizontal-tile-scroller. Геометрия viewport (100vw, симметричный выход из родителя), внутренние поля, scroll-padding, overflow и отсутствие fade централизованы в src/spacing.css. Локальная маска удалена; авторский выбор/центрирование/keyboard callbacks сохранены. AGENTS.md запрещает локальные варианты, docs/spacing-system.md синхронизирован.

Проверки финальной геометрии:

- npm run test:todo — PASS, полный стандартный набор 9 ширин 320–1920 × 844/400. Добавлены shared-class/mask/overflow/padding assertions. Лог /tmp/rollapp-tile-edges-todo-geometry.log.
- npm run test:health — PASS, питание/сон 320/390/768/820/1024/1440/1920 и короткие окна; live data не изменялись. Лог /tmp/rollapp-tile-edges-health-final.log.
- npm run test:action-rails — PASS, полная матрица страницы действий; /tmp/rollapp-tile-edges-actions.log.
- npm run test:ui — PASS; статические guards требуют общую композицию Wishlist/групп/дней и запрещают локальную mask в day CSS. Старый literal class regex обновлён для дополнительного общего класса, div и data-list-tile assertions сохранены.
- npm run build — PASS, стандартное chunk-size warning; /tmp/rollapp-tile-edges-build-final.log.
- git diff --check — PASS.

Визуально просмотрены To Do 820×844 и питание 1440×900: чёткие края без затемнения; питание выходит за ширину внутреннего контейнера к общему краю страницы. UI fixtures запрещают реальные API. Полный comprehensive и публикация не выполнялись; текущий production SHA не менялся. Production keepalive оставлен работающим.
