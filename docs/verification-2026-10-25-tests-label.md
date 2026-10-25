# Название раздела «Тесты» — 2026-10-25

База acb6528 включает последний UI тестов и catalog-only patch соседнего согласованного чата. Начальная dirty state —4 датированных итоговых отчёта прежних задач, сохранены отдельно.

По прямому запросу пользователя изменён один общий IDENTITY_TABS.label в src/App.jsx: «Gallup + Hogan» → «Тесты». Общий selector/header получает новое название от этого владельца. Идентификатор identity-reports, URL, содержимое и данные не меняются.

Проверки dirty snapshot acb6528 +one-line diff: test:ui PASS; unit862total/861PASS/1skip/0FAIL; build PASS; git diff --check PASS. Новые тесты и повторный большой аудит для замены подписи не добавлялись. Контрольная геометрия общего selector/ControlBar не меняется; полная controls matrix прошла в последнем targeted выпуске ebcddf4. Зависимости/lock не менялись; результаты npm audit предыдущего выпуска (runtime0,2high унаследованной dev-цепочки) сохраняются.

Новый commit передаётся ранее авторизованному соседнему чату для согласованного выпуска поверх acb без прерывания текущего образа; production schema verify, pool2 и exact-SHA/live review обязательны. Итоговый SHA/workflow и реальное меню будут записаны после выкладки. До неё переименование не объявляется опубликованным.

Для собственного copy-only выпуска добавлен явный manual ui-copy: unit/UI/полный controls/build, без повторного reader/form/comprehensive. Mandatory deployment geometry gate сохранён; default/full и существующие targeted режимы не сокращались. Guard проверяет выбор и команды до metadata. Полные unit862total/861PASS/1skip/0FAIL повторно PASS после изменения workflow. Mode none не используется: в этом чате прямой запрос был «без сложного аудита», не «без тестирования».

Production preflight штатным loader: exact configured database/role, authorized TLS, max1, existing-schema/reserved-name guard READ ONLY/ROLLBACK PASS; migration callback запрещён. Лог /tmp/rollapp-tests-label-schema.log. acb/run40221431012 завершён SUCCESS до следующего dispatch. Пользовательские данные не сохранялись.
