# Меню и Close в шапке группы — 2026-10-25

База: d35e7146b5d9bc07502b6c2e7b4c79eed50c4344. До начала dirty был только итоговый отчёт предыдущего выпуска `verification-2026-10-25-snippets.md`; он сохранён и не включается в этот commit.

Причина: WishGroupDialog передавал в общий GroupDialogHeader меню с ghost и без data-control-icon, а Close уже использовал outline/bg-card и этот product marker. Меню теперь использует ту же композицию в существующем ControlBar: круг48×48, glyph20, общий фон/рамка/hover/disabled. Upstream primitives и общие размеры не менялись.

Расширен существующий test:controls: экспортируется настоящий WishGroupDialog, проверяются обе соседние кнопки на полной матрице320/390/640/767/768/820/1024/1440/1920 и коротких390/820×400, DPR3 на390, обе темы, normal/hover/disabled, нативное открытие меню/Escape/Close. Прежние geometry/pixel/scroll/keyboard assertions сохранены. API запрещены, фикстура передаёт несохранённые presentation props; обработчики мутаций бросают ошибку.

На dirty snapshot базы: test:controls PASS (полная матрица), test:wish-groups PASS16 owner/read-only cases, test:ui PASS, npm test832 total/831 PASS/1 skip/0 FAIL, build PASS с прежним chunk warning, git diff --check PASS. Screenshots настоящего заголовка на390/1440px просмотрены; native initial focus сохраняет штатное focus-visible кольцо. Логи `/tmp/rollapp-group-menu-{controls,wish-groups,unit,build}.log`.

Сохраняется ранее заданный пользователем целевой выпуск без сложного аудита. В check:release:snippets добавлен существующий test:wish-groups; остальные целевые проверки и полный default release не сокращались. Production existing-schema READ ONLY verify, точный SHA, CI и live UI фиксируются после rollout. Изменения данных/схемы не требуются.

Первый targeted run40202808425 оказался pending за чужим веточным audit40202372810 (codex/consolidate-workspaces-20261025, deploy SKIPPED): старый единый concurrency group ошибочно занимался read-only аудитом. Собственный pending release уже получил cancelled до обработки запроса отмены; чужие запуски из этого чата не отменялись. Очереди разведены: все будущие main-релизы сериализованы через rollapp-production-deploy с cancel-in-progress:false, read-only audits — отдельно по ref. Перед сменой ключа проверено отсутствие других активных production deploy jobs. Guard добавлен в существующую unit-проверку workflow; OIDC/metadata/exact-health assertions сохранены.
