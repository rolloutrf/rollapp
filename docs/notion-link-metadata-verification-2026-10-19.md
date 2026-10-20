# Сохранение атрибутов ссылок: 2026-10-19

Изолированный кандидат; в main и текущий выпуск не перенесён. Найдены потери target/rel/class при reload и буквальный Markdown вместо ссылки при кавычках в title. Canonical HTML сохраняет полные атрибуты и явные null/пустые значения; старые документы совместимы. Публичная политика target/rel и игнорирования импортированного CSS class сохранена.

Unit727:726PASS/1SKIP после двух сохранённых диагностических падений. Новая native-проверка URL editing/Undo/save/reload прошла8/8 размеров без изменения исходных hashes; полный combined regression ещё предстоит. [Машиночитаемый отчёт](notion-link-metadata-verification-2026-10-19.json).

Целевые gates завершились: native8 +styles10 +selection8 =26PASS, UI37/74/build PASS; источник650 не менялся во время них. После этого в отдельную новую версию включён проверенный24case portability fixture и договор атрибутов. Frozen650/10extra full383 завершился **failed253/383** (13:01:50Z): native table growth ожидал4 столбца, получил3. Source/extra/added drift0; unit/UI/build PASS. PID25730 отсутствует. Диагностический повтор той же table-insert матрицы дал2PASS; это не установление причины исходного отказа. Кандидат не перенесён; следующий общий PASS требуется после расследования.

Продолжение расследования:8 последовательных запусков с native pointer/transaction
trace дали16PASS, terminal0. `/tmp/rollapp-table-insert-trace-1.log` … `-8.log`
сохраняют готовую таблицу, pointerdown/up/click, focus и точную growth transaction.
Отдельная ревизия с1200ms дополнительной паузой после вставки дала2PASS/exit0:
`/tmp/rollapp-table-insert-trace-settled.log`. Это включает время для autosave,
но не доказывает исправление первоначального отказа. Node model probe для
24×3 таблицы с400px widths: resize→24×4→Markdown→reload exact=true,4columns.
Гипотеза постоянной потери пустого четвёртого столбца сериализатором не
подтвердилась. Файлы диагностики не перенесены вmain. Временный checker после
terminal восстановлен через apply_patch; SHA256 снова
`6e85f4ca28c4c46ee280c48a510d0ef7863b520ccc37f9b337325e2f845a1cc4`,
cmp сmain идентичен. Runtime кандидата не менялся. Следующий отказ требует
состояния полной последовательности, а не объявления одиночного PASS фиксом.
