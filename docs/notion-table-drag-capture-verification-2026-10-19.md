# Сохранение pointer capture при переносе таблицы — 2026-10-19

Commit `710457583a873ce56b93d4eb26849731164f5b2d`, dirty workspace. Кандидат
изолирован, не перенесён. Предыдущий goal turn дал progress (native capture в main);
текущий также progress: новые insertion/font проверки и воспроизводимый отказ
переноса столбца с подтверждённым исправлением двух исходных случаев.

Main632 fresh comprehensive завершился exit1 после142 editor PASS, source/extra
drift0, added0, font denials0. Stage check:release failed, остальные8 stages not-run.
Native reference2 и все предшествующие editor assertions прошли; это не полный
успех редактора. Отказ: `text-table-wide-checks.mjs:20`, distant R0C4 не вошёл
полностью в viewport с48px clearance для drop. Standalone main50192 воспроизвёл
тот же отказ,0 PASS, exit1. `/tmp/rollapp-native-capture-main-wide-control.log`.

## Доказательство

Изолированная копия main632:
`/var/folders/56/y9x0qcp95zs6ctldh56fs6qh0000gq/T/rollapp-wide-drag-audit-1t1vawmd`.
Трасса document pointer/selection/scroll записана в
`/tmp/rollapp-wide-drag-audit-1024-844.json`, screenshot с тем же stem `.png`.
Wrapper left172/right852/client680, scrollWidth1201. После18 шагов по12px
scrollLeft216 происходит native lostpointercapture, автопрокрутка прекращается.
R0C4 right956.5 остаётся дальше разрешённого804. CellSelection48/414 сохраняется;
нет доказательства потери native TextSelection или изменения содержимого.

Handle geometry пересчитывалась во время drag: источник уезжает в clipped часть
таблицы, свободная область controls меняется, рендер мог удалить capturing button.
Кандидат держит исходный active/geometry пока hook владеет pointer, включая
отложенный measure frame, и на это время приостанавливает competing grid growth.
Hook сообщает начало/окончание gesture. **Native capture loss не игнорируется**:
Escape, изменённый source/access, blur и release/capture loss сохраняют отмену.

Исходные два native edge-scroll случая теперь проходят: scrollLeft372, точный
порядок `[0,2,3,4,1,5]`, attrs/widths/rich children, один Undo/Redo и save/reload.
`/tmp/rollapp-wide-drag-fixed.log`, exit0,2 PASS. Это подтверждение кандидата,
не main или всей table матрицы.

Verifier возвращён к исходным assertions и дополнительно проверяет, что старый
button остаётся connected и реально имеет pointer capture, а его ControlBar rail
остаётся на исходном месте до pointerup. Первая строгая геометрическая проба
измеряла сам button и обнаружила предусмотренный Base Nova pressed translateY1px
(54 вместо53); этот fixture assertion заменён точным измерением rail, upstream
pressed state не переопределялся. Failed report сохранён:
`/tmp/rollapp-wide-drag-compatibility.json`,0 PASS/source drift0.

## Проверки и дальнейшая работа

Final source632 snapshot: `/tmp/rollapp-wide-drag-final-sources.json`.
Compatibility34 выполняется (69846): wide2, axes9, axis guards2, real chrome10,
grid growth9, growth guards2. Логи/JSON: `/tmp/rollapp-wide-drag-compatibility2.*`.
Unit/UI/build выполняются отдельно в той же неизменной копии.

Параллельный insertion/font кандидат633 уже имеет8 viewport/64 insertion cases
+8 actual delayed-font guards PASS, unit683/682PASS/1SKIP, UI37/72/build.
Его compatibility90 (64557) ещё выполняется; предыдущая staged slash regression
не скрыта и исправлена до переноса. Эти две версии требуют совместной проверки
перед main promotion и новым311-editor comprehensive. Временные runner fs.allow,
native event instrumentation и trace fixtures не переносятся.

Production keepalive22680/API/frontend сохранены, никаких production test записей,
DDL, удалений или deployment. Dependency lockfile прежний: последний полный
audit7 high в dev tooling, omit=dev0; несовместимые downgrade не выполнялись.
Реальные устройства/IME и остальные открытые R1–R10 остаются открытыми, goal active.

Current promotion: оба кандидата прошли combined63/source drift0/added0 иперенесены вmain633 через10 reviewed source paths. Main targeted14 иfresh311/nine-stage comprehensive выполняются; authoritative текущий статус — notion-text-authoring-combined-verification-2026-10-19.json. Исторические failed/running записи выше не заменяют этот результат.
