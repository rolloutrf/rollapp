# Добавление ссылок: 2026-10-19

Статус: **progress, изолированный кандидат**. Main646/default375 уже получил
image/core13 и проходит fresh comprehensive9; новые ссылки в main не перенесены.
HEAD710457583a873ce56b93d4eb26849731164f5b2d, dirty357paths до новых отчётов.

Реальные Chrome keys воспроизвели два отказа: Cmd+K в пустом блоке создаёт только
невидимый stored mark, а открытая pending форма переживает полную замену текста
и может установить stored link в чужом контексте. Это API-blocked fixture,
production writes0. Native Safari ранее не проверял эти последовательности.

Кандидат фиксирует диапазон исходного текста, аккуратно отображает внешние
изменения координат и отменяет устаревшее намерение после замены текста, изменения
самого диапазона, явного перемещения selection или отзыва доступа. Пустой caret
получает видимый URL одной Undo-операцией; rich attrs и остальные marks сохранены.
Точные пустые-caret правила Notion ещё не сверены: официальная
[справка](https://www.notion.com/help/keyboard-shortcuts) описывает Cmd+K для
выделенного текста, поэтому это улучшение Rollapp не объявляется идентичностью.

Новые7unit проверяют историю/marks/metadata, пустую вставку, mapping до/после
диапазона, source/selection/marks invalidation, sparse owners и focus-time guards.
Первый прогон выявил ошибку новой fixture: transaction.insertText сам явно
перемещает range selection при вставке на его границе. Для фонового append
fixture использует raw transaction.insert; отдельно explicit-selection cancel
остаётся обязательным. Второй npm test:723total/722PASS/1SKIP/0FAIL.

Native links8 уже PASS: caret URL, reverse selection, внешние edits, четыре
stale guards, existing bold link/title/unlink, exact Undo/Redo/reload/public read,
invalid URL/Escape и отсутствие frames/API. Unit/UI/build прошли; styles10 и
selection8 ещё выполняются в frozen649sources/10extra snapshot. Результат26
не объявляется до terminal и drift audit. Portal Save проверка дополнительно
применяет pending URL после фонового append и проверяет исходный текст отдельно.

Потребуется review IME/Escape, закрытия формы и целого383-case editor перед
будущим переносом. Полная цель R1–R10 открыта.
[Машинный отчёт](notion-link-intent-verification-2026-10-19.json).

Phase1 завершилась: **26/26PASS**, 723unit/722PASS/1SKIP, UI37/74/buildPASS,
source/extra/added drift0. После этого отдельная native Chrome проба показала:
клик во второй документ оставлял первую форму, Cmd+K открывал вторую одновременно
(2visible). Ещё explicit synthetic composing Escape закрывал адресную форму;
editor composition уже подавляла её открытие. Нельзя выдавать эти guards за
реальную IME/device проверку.

Phase1 сохранена в backup. Изолированный follow-up добавляет закрытие по внешнему
pointer/focus без применения адреса и без возврата фокуса, а composing Escape
оставляет форме ввод. Новая native8 regression проверяет оба outside способа,
неизменность двух документов, фокус назначения и одну следующую форму. Новый
frozen649 unit/UI/build/native26 прогон (session25217) выполняется заново;
прошлый26 к изменённой версии не приписывается. Main646 не менялся.
Own temporary fixture17911 остановлен после exact argv check, terminal143.

Follow-up phase2 завершилась **26/26PASS**, unit723/722PASS/1SKIP, UI37/74/buildPASS, source/extra/added drift0. Exact frozen649 full383 стартовал (session10842/PID20167); нового общего результата ещё нет. Six-path355-line diff reviewed, temporary runner fs adaptation excluded from proposal. Main646 checkpoint6fa269b pushed, CI39248087440 выполняется; links649 в нём нет.

Isolated649 full383 завершён PASS:383/383, exit0, source/extra/added drift0, font denials0; controller10842 terminal0 получен. В main не перенесён: поверх него найден и исправляется отдельный metadata round-trip defect;650/383 и653/393 требуют своих полных подтверждений. Main comprehensive9 уже PASS; runtime main не менялся.
