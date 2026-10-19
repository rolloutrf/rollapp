# Явное раскрытие курсора таблицы — 2026-10-18

SHA `710457583a873ce56b93d4eb26849731164f5b2d`, dirty workspace. Изолированная версия 620 исходников; в main ещё не перенесена. Основной comprehensive 618/268 продолжает работать на неизменных исходниках. Это целевая проверка исправления, не полный аудит приложения.

В высокой таблице добавление столбца оставляло курсор на y=4.5–27.5 при нижней границе шапки 72px; новая ячейка выходила справа за собственный scroller на 82.5px. После отдельной отмены роста курсор предыдущего абзаца оставался на y=31–54. Оба состояния подтверждены через 650ms.

Явная команда роста и Undo/Redo теперь раскрывают свою ячейку и нативный курсор. Слушатель не реагирует на обычные изменения выделения или прокрутку. Проверяются доступ, текущий фокус, IME и TextSelection. На 1024×844 и 1440×400 курсор после роста находится на y=90.5–113.5, после Undo — y=80–103; новая ячейка целиком видима.

`--table-insert-caret-only`: exit 0, 2 PASS. Проверены немедленный ввод, точный JSON, отдельная отмена ввода/роста, оба Redo shortcut и совпадение DOM/model. `npm test`: 665 всего, 664 PASS, 1 SKIP; `npm run test:ui`: 37 primitives/70 JSX; `npm run build`: PASS. API-запросы fixture запрещены, production-записей нет.

Совместимость с caret/selection/plaintext/grid growth проверяется отдельно. Первый запуск не открыл браузер из-за занятого порта 5199; повтор использует собственные 5293/cache. Основной процесс не прерывался. Точные команды, пути и состояния — в соседнем JSON.

До переноса требуется завершить совместимость; после переноса — новый полный прогон с 270 editor records. Настоящие iOS/Telegram IME, document columns/media и оставшиеся строки матрицы R6/R8/R9 не проверены этим исправлением.

Main618 завершился exit 1 после 128 editor PASS: динамический импорт `text-chrome-frame.jsx` не загрузился при совпавшем по времени запуске изолированного Vite с общим кэшем. Source drift 0; полный результат не засчитан, остальные этапы не запущены. Следующий запуск получает отдельный cacheDir.

Изолированная совместимость terminal: {"status": "passed", "records": 42, "sourceDrift": [], "checks": [{"flag": "--native-caret-only", "exitCode": 0, "passRecords": 2, "log": "/tmp/rollapp-table-intent-native-caret-only.log"}, {"flag": "--first-selection-only", "exitCode": 0, "passRecords": 9, "log": "/tmp/rollapp-table-intent-first-selection-only.log"}, {"flag": "--caret-scroll-only", "exitCode": 0, "passRecords": 9, "log": "/tmp/rollapp-table-intent-caret-scroll-only.log"}, {"flag": "--plain-caret-only", "exitCode": 0, "passRecords": 9, "log": "/tmp/rollapp-table-intent-plain-caret-only.log"}, {"flag": "--table-growth-only", "exitCode": 0, "passRecords": 9, "log": "/tmp/rollapp-table-intent-table-growth-only.log"}, {"flag": "--table-growth-guards-only", "exitCode": 0, "passRecords": 2, "log": "/tmp/rollapp-table-intent-table-growth-guards-only.log"}, {"flag": "--table-growth-contexts-only", "exitCode": 0, "passRecords": 2, "log": "/tmp/rollapp-table-intent-table-growth-contexts-only.log"}], "finishedAt": "2026-10-18T18:31:32.939242+00:00"}.

Изолированное исправление перенесено в main620 после44 целевых browser PASS, unit/UI/build. Из5 reviewed файлов временный fs.allow исключён. До свежего270 comprehensive полная проверка текущего main остаётся незавершённой.

Main620 targeted terminal: exit0, 12 PASS (10 real chrome +2 new caret intent), source drift0. Fresh comprehensive270 запущен с отдельным cacheDir; результат ожидается.

Read-only live main620 Career1280×720: editable=true, width768, Geist18/28, borders/outline0, shadow none, toolbar0, root overflowfalse; без click/focus/type/save. Временная вкладка35 закрыта. Source drift на контрольной точке: []. Итог этого goal-turn — progress, цель активна.

Main620 comprehensive terminal: {"status": "failed", "exitCode": 1, "editorPassRecords": 174, "sourceCount": 620, "sourceDrift": [], "addedSources": [], "finishedAt": "2026-10-18T18:56:04.292606+00:00", "stages": [{"name": "check:release", "status": "failed", "startedAt": "2026-10-18T18:32:38.188Z", "exitCode": 1, "finishedAt": "2026-10-18T18:56:04.070Z", "durationMs": 1405881}, {"name": "test:navigation", "status": "not-run"}, {"name": "test:action-rails", "status": "not-run"}, {"name": "test:identity-reports", "status": "not-run"}, {"name": "test:todo", "status": "not-run"}, {"name": "test:form-pages", "status": "not-run"}, {"name": "test:catalog-page", "status": "not-run"}, {"name": "test:wish-groups", "status": "not-run"}, {"name": "test:drawers", "status": "not-run"}], "fontServingDenials": 0}. Remaining goal matrix stays open.
