# Выпуск редактора: 2026-10-19

По запросу пользователя текущая рабочая версия main646 готовится к push в main.
Она включает блочный inline-редактор, сохранение и выделение, выравнивание ручек,
изображения/таблицы/столбцы, шкалы отчётов и накопленные UI-исправления с тестами.
Изолированный link-intent649 в этот выпуск не входит; полная цель R1–R10 открыта.

Parent375 PASS относится к версии до storage/portal overlay; merged53, unit716/
715PASS/1SKIP, UI37/74/build PASS относятся к перенесённому сочетанию. Новый
main375 comprehensive9 ещё выполняется с неизменными646source/10extra hashes;
он не объявляется завершённым. Живые1440/390 проверены без изменения данных.

Push main запускает CI с полным `npm run check:release`. Лимит job увеличен с25
до120минут для расширенной браузерной матрицы; проверки не сокращены. Выпуск
считается завершённым лишь после точного SHA в production health и живой UI сверки.
Исходная здоровая версия/rollback710457583a873ce56b93d4eb26849731164f5b2d.
Постоянное production development соединение остаётся включённым.

[Точный статус](notion-release-2026-10-19.json).

Push подтверждён: `6fa269b4383950785b67e34fc48ec18f80a4140f` →origin/main. CI39248087440 завершился ошибкой до развёртывания; production пока ещё7104575, выпуск не объявляется завершённым. Единственная разница release646 с running snapshot — удаление пробела в `text-caret-scroll-checks.mjs` через index-only normalization; inputs локального375 не менялись. Exact clean SHA проверяет CI.

Первый Linux CI остановился в image-layout768: Ctrl+Left переместил курсор по слову, `/image` оказался внутри `layout.`. Runtime правильно не открыл slash-команду. Исправляется только нативная установка курсора в трёх fixture-путях с проверкой границы и выбранной команды до Enter; все24 затронутых сценария проходят повторно. Первоначальная ошибка CI и раннее чтение model selection в новом тесте сохранены в логах. Проверки выпуска остаются полными.

Portability-кандидат прошёл24/24 native cases на macOS: image-layout8, image-context8, images8. Linux-подтверждение ожидается в exact-commit CI; локальный прогон его не заменяет. В release индекс переносится только `scripts/text-image-checks.mjs`; временный Vite realpath adapter исключён. Рабочие646source/10extra оставлены byte-identical для уже запущенного comprehensive; после его окончания рабочий тестовый файл нужно привести к HEAD.

Повторный push подтверждён: `fb508f2db73652ad723292e7d5a2fc417dc3cb52` →origin/main. [CI39251525717](https://github.com/rolloutrf/rollapp/actions/runs/39251525717) запущен с обязательным полным check:release. Развёртывание и exact-SHA health ещё не подтверждены.

Основной frozen646/10extra comprehensive завершился PASS: все9 stages, editor375, exit0, source/extra/added drift0, font denials0 (12:50:17Z). Controller32893 получен terminal0. Только после этого два рабочих тестовых файла приведены к уже опубликованному HEADfb508f2: trailing-space normalization и проверенный24native portability helper. Tracked src/scripts/server/shared/package/vite теперь совпадают с HEAD. Этот macOS результат не заменяет exact-SHA Linux CI.

Актуальная проверка: CI39251525717 terminal **failure** в13:12:14Z, до deployment;
native caret-scroll assertion на320px получил нулевой collapsed Range при
Shift+ArrowDown. Разрабатывается независимое DOM-измерение соседнего glyph без
ослабления viewport/native-parity guards. Изолированные metadata650/full383 и
alignment653/full393 также terminalfailed (253 и337 records соответственно),
не ожидающие процессы. Подробности: `notion-continuation-verification-2026-10-19.md`.
