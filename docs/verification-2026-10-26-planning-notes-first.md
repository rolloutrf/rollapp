# «Заметки» первыми в планировании — 26 октября 2026

База `d5d4741885fac908d267474e7165e9e686050157`. В общем PLANNING_TABS перенесён notes перед kanban/calendar/todo. Один источник используется меню PlanningFab на desktop/mobile. Меняется только отображаемый порядок, URL/выбор/иконки/доступы и существующий fallback kanban сохранены.

## До выпуска

Проверялся dirty source planning-space.jsx и уточнение контракта ui-copy для display order. Ранее изменённые verification reports сохранены отдельно.

- `npm run test:navigation` — PASS46 cases без фильтров:9 ширин320–1920, breakpoint transitions, mobile popup/короткий экран820×414, guest/access, формы/Back и отсутствие API writes. `/tmp/rollapp-notes-first-navigation.log`. Новых зеркальных unit-тестов для простой перестановки нет.
- Production schema preflight — PASS: configured DB/role, authorized TLS, READ ONLY verify, ROLLBACK, pool1. Миграций/записей нет.
- npm audit —2 известных high dev-chain @ton/ton→zod без доступного fix; omit=dev0. Версии/lockfile не менялись.
- git diff --check — PASS.

Standing user request: деплой без сложного аудита. Выпуск через manual ui-copy gate: unit/UI/полный controls/build, затем exact-SHA health и live desktop/mobile order. Full/comprehensive не запускались и не заявляются пройденными. Итоговый SHA/CI/live будут дописаны после выпуска.

До pull production healthy d5d4741, rollback2b04024 сохранён. Рассмотрен cache tag9c9d216856180b705ba8e192b8f01e7a62346350 (id2745f3cc,2026-10-25T18:46): это уже не current/previous, обе последующие healthy версии сохранены, дополнительный3c440c9 и ранние checkpoints также сохранены. Проверены все container refs и remote manifest; удалён только точный неиспользуемый tag, без force/prune/контейнеров/volumes.
