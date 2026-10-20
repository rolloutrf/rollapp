# Независимые порты UI-проверок — 2026-10-20

Продолжение цели Notion и запроса постепенно пушить готовые части. Base bf6a8a1,
dirty до фиксации только port helper/6 unit tests,14 smoke entry points и контракт.
Editor runtime/продуктовые компоненты/матрицы/assertions не менялись этой дельтой.

Предыдущий comprehensive bf6a8a1 завершился failure на test:details:
Port5193 already in use, до запуска399 editor cases; остальные8 stages not-run.
Нельзя останавливать listener другой работы или считать этот прогон успешным.

## Реализация и red check

`smokePort` по умолчанию0; `listenSmokeServer` использует публичный HTTP server
Vite для атомарного bind0 на127.0.0.1. URL вычисляется только после фактического
listen. Явный диагностический порт проходит проверку и strictPort, без fallback.
Ошибка startup закрывает только собственный Vite server, чужой listener не трогает.

Первый вариант со стандартным Vite.listen и config port0 оказался неверным:
закреплённый Vite нормализует0 в5173. Оба реальных target запуска failed с занятым
5173; логи `...-details-2026-10-20.log` и `...-wish-groups-2026-10-20.log` сохранены.
Вместо приватных Vite fields/port probing добавлен прямой public HTTP.listen0,
сохраняющий Vite initialization/close lifecycle. Unit теперь запускает именно
два настоящих pinned Vite и проверяет независимые ответы. Отдельный guard
сохраняет занятый listener после explicit-port failure.

## Подтверждено

- npm test:767 total/766 PASS/1 SKIP/0 FAIL, terminal0;6 новых helper/entrypoint
  tests, включая real Vite ownership и строгие fixed-port guards.
- test:details:72 PASS/exit0, полная desktop/mobile/short матрица, одновременно
  с test:wish-groups:16 PASS/exit0 в собственном fixture/cache.
- UI/build выполняются отдельно. git diff --check PASS.
- Логи `/tmp/rollapp-notion-port-isolation-{unit-final,details-final,wish-groups-final,ui,build}-2026-10-20.log`.
- Все14 entry points сохраняют прежние cases,API guards,48/20px/DOM/pixel/history
  assertions. Новый full399/nine-stage comprehensive требуется после фиксации.

Это изоляция портов независимых worktrees, не разрешение делить один Vite cache.
Нет production API/DB запросов, migrations, user data writes, остановки чужих
процессов. Причины прежнего clipboard Undo и style failures остаются открытыми.

## Отдельная готовая ветка для push

Дельта отделена от кандидата редактора поверх clean main d116857 в ветке
`codex/smoke-port-isolation`, source commit5fc303d. В runner сохранены именно
исходные375 cases и optimizer этой базы: новые quote/link/media checker imports
из combined ветки не переносились. Runtime редактора не изменён.

На этой точной базе повторно прошли npm test722 total/721 PASS/1SKIP/0FAIL,
UI37/74, build и полный test:details72, terminal0.
Логи `/tmp/rollapp-notion-port-baseline-{unit,ui,build,details}-2026-10-20.log`.
Расширенный combined399/nine-stage audit выполняется отдельно на cleanbc7fb04,
648 input hashes; здесь он не объявляется прошедшим.
