# Проверка native selection capture — 2026-10-18

Commit `710457583a873ce56b93d4eb26849731164f5b2d`, dirty workspace. Чужие изменения
сохранены. Это продолжение активной цели Notion-like editing, не заявление о
полном соответствии R1–R10. Предыдущая итерация дала реальный прогресс: gutter
перенесён в main, 27 целевых случаев и живая проверка заголовка прошли.

Main632 full editor завершился exit1 после 57 PASS: RTL collapsed0 + Shift+Left
получал anchor6 вместо0. Source drift и added sources отсутствовали. Это
редакторский прогон, не завершённый девятиэтапный comprehensive.

## Причина и кандидат

Минимальная инструментальная трасса записала `Selection.collapse/extend` из
`NodeViewDesc.setSelection → selectionToDOM → DOMObserver.flush →
DOMObserver.onSelectionChange`. Установленный prosemirror-view1.42.6 считает
явный collapsed range в начале документа недавним автоматическим focus reset и
восстанавливает прежнее выделение **до keydown**. Ранее добавленный pre-key sync
этот порядок исправить не мог. Детерминированный baseline оставлял model22/2 и
непустой native range после явного native0/0; capture-кандидат оставляет1/1 и
collapsed native range.

Кандидат слушает document selectionchange в capture phase и переносит только
явный native TextSelection активного editable host. IME, read-only и кастомные
Block/Node/Cell/AllSelection сохраняют владельца. Подписка снимается при destroy.
Движение Shift+стрелок остаётся браузерным, без ручной эмуляции и таймеров.

Первый capture-прототип выявил собственный дефект: selectionchange мог опередить
разбор native DOM input, оставляя caret7 вместо13 после `Before typed`. Контроль
без capture сохранял13. Исправленный кандидат сначала проверяет очередь и
отложенную/подавленную обработку DOMObserver; при незавершённом вводе core
разбирает его первым. Проба снова даёт model13/native12. Read-only адаптер к
закреплённой версии DOMObserver не очищает очередь и не вызывает forceFlush.
При отсутствии API он отказывается от ранней синхронизации; обновление PM должно
пройти native regression. Root focus/contenteditable и пустой style attr
игнорируются по тем же правилам, что upstream observer.

Изолированная копия:
`/var/folders/56/y9x0qcp95zs6ctldh56fs6qh0000gq/T/rollapp-selection-writes-xt02u9wf`.
Перед переносом разрешены только четыре reviewed пути: native selection module,
extension registration, его unit-тест и native-caret browser test. Diagnostic
trace/probes и временные runner fs.allow/imports в main не переносятся.

## Доказательства

- Actual failing write trace: `/tmp/rollapp-selection-native-writes-formal-failure.json`
  и `...-formal.log`, exit1. Более тяжёлая trace100 без воспроизведения не
  считается опровержением минимального counterexample.
- Baseline: `/tmp/rollapp-native-focus-range-before.log`, exit1; capture:
  `/tmp/rollapp-native-focus-range-fixed.log`, exit0.
- Pending-input counterexample/control/fix:
  `/tmp/rollapp-native-capture-pending-caret-before.log`,
  `/tmp/rollapp-native-capture-pending-control.log`,
  `/tmp/rollapp-native-capture-pending-fixed.log`. Первоначальная проверка только
  текста была недостаточна и усилена проверкой обоих caret offsets.
- Final native reference: `/tmp/rollapp-native-capture-final-reference2.log`,
  2 PASS на390×400 и1440×400. Styled/LTR/RTL/bidi/graphemes, два направления,
  прямой/обратный диапазон, collapsed endpoints,650ms frame stability, возврат
  фокуса, explicit start; четыре queued input режима (append/middle/delete/markup)
  сохраняют caret/marks/соседей. Existing native keyboard assertions сохранены.
- Native stress: `/tmp/rollapp-native-capture-stress.log`, exit0,60 PASS
  (30 unmanaged +30 managed повторов).
- Final candidate unit:683 tests/682 PASS/1 SKIP/0 FAIL,
  `/tmp/rollapp-native-capture-ready-unit.log`.
- UI audit37 primitives/72 JSX и build PASS:
  `/tmp/rollapp-native-capture-ready-ui.log`, `...-ready-build.log`.
  Предупреждение размера build chunks сохранено.
- Native fixture setup errors (закрытый временный сервер и scope локатора)
  исправлены отдельно; они не считаются продуктовыми counterexamples.

Compatibility63 завершился exit0,63 PASS, frozen644-file source drift0.
Четыре reviewed пути перенесены в main; backup/hash guard и diff записаны
в соседнем JSON. Native2 +styles10 +first-selection9 +block-menu8 +four-document8
+sparse8 +tables8 +native-page-keys2 +cut-history8. Это частичная совместимость,
не замена fresh main303 editor и `check:comprehensive`.

`npm audit`:7 high в dev tooling chain (shadcn/ts-morph/glob/braces),
`npm audit --omit=dev`:0. Полные данные в `/tmp/rollapp-native-capture-audit.json`
и `...-audit-production.json`. Не выполнялся предлагаемый несовместимый downgrade
shadcn1.0.0. Production keepalive22680/API/frontend healthy и оставлены запущенными;
ни одной production test записи, миграции, удаления или публикации.

Реальные iOS/Telegram/Windows keyboard и hardware IME не проверены. Media/catalog,
произвольные вложенные clipboard/style/Enter контексты и общий R1–R10 аудит
остаются открытыми. Цель active.

Main promoted live review1280×720: Career/about на configured production API, после reload тот же10554-character текст. Нативные6 Shift+Right дали6 символов иодну панель; ArrowLeft свернул selection ипогасил панель. Focused prose: Geist18/28, border0/outline none/shadow none. Только click/клавишинавигации; ввода/сохранения нет, временный tab40 закрыт. Main native2 завершился exit0,2 PASS. Fresh303/nine-stage comprehensive запущен; его terminal успех пока не заявлен. Source632 иконтракты заморожены.

Main fresh comprehensive terminal: `{"status": "failed", "exitCode": 1, "editorPassRecords": 142, "expectedEditorRecords": 303, "sourceCount": 632, "sourceDrift": [], "extraInputDrift": [], "addedSources": [], "fontServingDenials": 0, "finishedAt": "2026-10-18T20:56:23.463205+00:00"}`. Открытые R1–R10 требования и активная цель сохраняются.
