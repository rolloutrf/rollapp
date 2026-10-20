# Постепенные push по цели Notion — 20 октября 2026

Пользователь запросил продолжить и постепенно пушить готовые части. Готовые
части отделены от prototype media, чужие planning/contact/navigation изменения
не откатывались и не присваивались этому изменению.

## Отправленные части

1. codex/deploy-rest-iam,50da865: REST Compose update и явный IAM Lockbox вместо
   CLI. На чистой базе d116857:731 unit/730 PASS/1SKIP, UI37/74/build PASS.
2. codex/smoke-port-isolation,0543083 (source5fc303d): atomic loopback ports,
   pinned Vite HTTP-listener guard, ownership/invalid-port/entrypoint tests.
   На чистой базе d116857:722 unit/721 PASS/1SKIP, UI/build PASS, details72 PASS.
   В combined candidate дополнительно details72 и wish-groups16 одновременно PASS.

Оба remote refs проверены через ls-remote; затем они уже вошли в main через
параллельную общую интеграцию. Ancestry50da865/0543083/e74459d/bc7fb04 проверена.
Наши две feature-ветки не запускают production rollout; push общего main выполнен
параллельной интеграцией, без force/reset или удаления исходных снимков.

## Следующая отдельная часть

codex/smoke-cold-dependencies, code d7ca20e поверх39da4fe: общий проверяемый
inventory23 Base UI imports и bounded browser diagnostics. Эквивалентный список
уже был расширен в main; здесь добавлены защита от drift и наблюдение ошибок.
App JSX/model/schema/API не меняются. Проверки:783 unit/782 PASS/1SKIP,
UI37/79/build PASS, новый cold images16 PASS/exit0, без late optimization reload
или Invalid hook call. Предыдущий конкретный cold error/2 red unit сохранены.
Новые native image alignment controls в эту часть не включены.

## Незавершённое

- Full399/comprehensive combined bc7fb04,648 frozen inputs, session53976;
  baseline375/comprehensive e74459d,637 inputs, session16957. На последней
  промежуточной сверке drift0; общего terminal PASS ещё нет. Эти снимки старше
  нового интегрированного main и не объявляются его полной проверкой.
- Прежний mixed paste Undo не воспроизвёлся в10×1024 native forward/reverse
  diagnostic и пока пройден в новом full; конкретная причина ещё не установлена.
- Alignment prototype13c0f71/f92ada8:751 unit PASS/1SKIP и native10 на старой
  базе; после совмещения с main/cold guards unit786 PASS/1SKIP и cold native10.
  Нужны полный409/comprehensive и resize compatibility на окончательном снимке,
  перед переносом в main. Rich captions/viewer/прочие media и actual-device IME
  остаются в R1–R10; цель не закрывается.
- Main integration2a6aa7e comprehensive failed до editor completion на пустом
  fixture root. Main39da4fe содержит cold dependency fix и targeted повтор,
  но не общий PASS всех стадий.

Production read-only health на последней проверке healthy d116857. CI0a7f645
39384621258 ещё running,39da4fe39385448628 pending; это не deployed exact SHA.
Нет ручного restart/reconfigure, DB schema/data mutations или настоящих uploads.
Managed dev10724 в905f готов, API/frontend оставлены работать.

Audit:7 high только dev chain, production0. Совместимый dry-run предлагает только
shadcn4.22.0→4.22.1 и оставляет те же7 high; несовместимый downgrade1.0.0 не
выполнялся. Dry-run не менял lockfile/node_modules. Full/targeted логи и source
hashes хранятся под `/tmp/rollapp-notion-*`; точные команды/ограничения — в
соседних port/cold/alignment verification reports.
