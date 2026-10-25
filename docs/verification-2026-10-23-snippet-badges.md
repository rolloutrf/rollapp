# Бейджи медиакарточек — 2026-10-23

База: 237386530fd11e359f6f997735537b85e6ccb419, dirty snapshot с сохранёнными предыдущими локальными изменениями обзора To Do, шапки и лент.

На screenshot бейдж «Завершена» перекрывался непрозрачным 48px drag handle: оба находились в верхнем левом углу media. Общий `.collection-snippet__badge` перенесён к нижнему краю (12px), не затрагивая handle/capture/сохранение. Правка распространяется на тренировки и все существующие collection snippets. Дополнительно проверка выявила обрезку «Запланирована» на 320px: разрешены перенос и автоматическая высота, icon не сжимается. Upstream Badge/Button сохранены.

Проверки:

- Новый `npm run test:snippet-badges` — PASS, 32 случая: реальная WorkoutCard и три настоящих статуса, восемь viewport 320/390/768/820/1024/1440/1920, включая 390×400 и 820×400; mouse/touch × author/reader. Проверяются границы media, отсутствие текстовой обрезки, пересечения и 48px handle, отсутствие API запросов/ошибок браузера. Лог /tmp/rollapp-snippet-badges.log; screenshots /tmp/rollapp-snippet-badges-390x844.png и -390x400.png визуально проверены для portrait.
- `npm run test:drag-drop` — PASS, полный стандартный набор на 320/390/767/768/820/1024/1440/1920 без фильтров, native mouse/touch, отмена/capture/access, reorder/grouping, rollback и календарь. Лог /tmp/rollapp-badge-drag-drop.log.
- `npm run test:ui` — PASS, 37 UI primitives / 84 JSX.
- `npm run build` — PASS, стандартное chunk-size warning; /tmp/rollapp-badge-build.log.
- `git diff --check` — PASS.

Новый badge check включён в check:release; docs/drag-and-drop.md и docs/verification.md синхронизированы. Все UI fixtures запрещают API. Production записи не изменялись, keepalive готов и оставлен работающим. Полный comprehensive и публикация не выполнялись; физический touch не подтверждён.
