# Безопасная глубина drag-and-drop — 18 октября 2026

Изолированный кандидат, не перенесён в main. [JSON](notion-relocation-depth-verification-2026-10-18.json). HEAD `710457583a873ce56b93d4eb26849731164f5b2d`, dirty.

Counterprobe двух независимо загружаемых цепочек по55 уровней подтвердил потерю структуры при переносе одной внутрь другой: до переноса reload exact, после него в исходном JSON110 nestedBlock, после загрузки0 и literal HTML. Production data не менялись. `/tmp/rollapp-relocation-depth-probe.json`.

Существующая защита Tab на границе canonical HTML reader (100 tags, включая marks) вынесена в общий `canReloadNestedBlocks`. Оба плана перемещения применяют её до создания transaction. Это сохраняет действующий reader limit и API; не увеличивает ограничения и не обрезает документ. Валидные80 уровней точно roundtrip; опасный110-level combined move возвращает null, не трогая source или selection. Проверены обычный документ и fixed question sections. Source unit suite:653 total,652PASS/1SKIP/0FAIL.

Drag теперь проверяет валидность текущего логического target до показа guide; последнее target/side кэшируются, геометрия обновляется при scroll. Реальный held-pointer drag на1024×844 и1440×400 дал по одному native dragstart/drop на нужном distant target, no guide, document mutation, save, API, preview residue или HTML fallback. Для прокрутки к далёкой цели fixture использует Playwright scrollIntoViewIfNeeded во время удержанного drag. Это desktop mouse proof; mobile handles скрыты по текущему контракту, touch/устройство не проверены.

Дополнительные positive native drag, Escape/doc/access guards, nesting, Cmd/Ctrl+Enter и UI/build пока выполняются. Main comprehensive24320 (595sources/195 expected editorPASS) и полный Cmd/Ctrl+Enter candidate (604sources/203 expectedPASS) не включают эту защиту. Цель Notion остаётся открытой.

Дополнительные проверки завершены:2 positive native drag +1 guard +8 nesting +8 Mod/Ctrl+Enter PASS; последняя команда exit0. UI/build exit0; snapshot606 sourceDrift[]. Вместе с2 depth cases это21 browser PASS; это целевая проверка, не полный editor/comprehensive run. Ни один файл этой версии ещё не перенесён в main.

Перенесено в main 2026-10-18T16:17:21.116279+00:00. Новая объединённая версия ещё требует полного прогона; предыдущие comprehensive195 / isolated203 относятся к своим snapshot. Изолированный control run блокировал dependency fonts и не служит окончательным font/appearance доказательством.
