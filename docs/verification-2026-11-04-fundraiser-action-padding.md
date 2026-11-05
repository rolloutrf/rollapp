# Отступы действий сбора — 2026-11-04

- Checkout `04c7`, базовый SHA `1bd93fc34dcdaabc684ab0bd1598f5db5a1f8e66`. Dirty до правки: удаление отдельной кнопки визитки и его отчёт; сохранены.
- «Изменить цель» и «Приостановить/Возобновить» используют общий PageActionButton: 24px слева/справа, высота 48px, pill. Логика сбора и upstream primitives не менялись.
- `npm run test:ui`, `npm run build`, `git diff --check`: PASS. Сборка предупреждает о крупных chunks.
- `node scripts/wish-group-fundraising-smoke.mjs`: PASS на всех восьми ширинах 320/390/767/768/820/1024/1440/1920, включая 820×450. Добавлена проверка точных computed padding 24px у обеих кнопок после приостановки, геометрия и screenshots owner-состояния. Существующие create/edit/pause/resume, contribution confirmation/cancel/retry/guards и scroll checks сохранены.
- Визуально просмотрены `/tmp/rollapp-fundraising-owner-320.png` и `/tmp/rollapp-fundraising-owner-1440.png`: кнопки с отступами, на телефоне переносятся и помещаются в карточке. Лог `/tmp/rollapp-fundraiser-padding-check.log`.
- Проверки используют существующий presentation fixture, реальные API запрещены. Production-БД не менялась; реальный платёж не выполнялся. Живой UI и полный comprehensive этой версии не проверены. Managed production development service проверен в предыдущей правке и оставлен работающим.
