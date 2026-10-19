# Нативный курсор и контексты таблицы — 18 октября 2026

HEAD `710457583a873ce56b93d4eb26849731164f5b2d`, dirty.
[JSON](notion-native-caret-table-context-verification-2026-10-18.json).

Предыдущая итерация — progress: main получил caret/duplication/anchor fixes,
а growth616 реализован и reader regression исправлен. Main611 supplemental
завершён exit0/drift0: Hogan12 с Back/Forward, To Do29, form pages128, catalog7,
Wishlist groups16, drawers92. Это дополняет старый source608 release/editor228,
но не является свежим полным comprehensive нового исходника.

Native plaintext probe на1024×844 воспроизвёл caret y30…53 под header bottom72,
offset1867, неизменно после650ms. Первое нулевое Range measurement на пустой строке
было measurement artifact; диагноз основан на положительной native glyph rect.
Общий observer теперь обслуживает rich и InlineTextField, учитывает IME/access,
отменяет pending reveal при wheel/touch intent и не слушает manual scroll.
Пустой rich paragraph получает PM fallback; plaintext blank line — native range
без изменения selection. Root auto-scroll/padding scoped на focus обоих host типов.

Plain9 PASS:320/390/768/820/1024/1440/1920×844 и390/1440×400; native arrows/Shift,
unchanged string/no inputs, manual scroll650ms, no border/outline/shadow/API.
Пустые строки дополнительно проверены реальными screenshot pixels каретки
(`caret: initial`), а position oracle опирается на соседний glyph/line height.

Context audit нашёл offscreen far column: resize transaction шла до focus editor,
поэтому PM игнорировал scroll при focus на внешней кнопке. Теперь focus precedes
transaction, stale doc/access проверяются заново.2context PASS: Four Questions
native plus/typing/Undo, API-valid exact reload и неизменные prompts/neighbours;
wide horizontal reveal; nested cell peer-text protection и nearest-table menu fallback.

Совмещённый source618 сохранён в отдельной копии. Unit665:664PASS/1SKIP,
UI37/70 иbuildPASS. Дополнительные38cases (2native parity +9offscreen +9rich
caret +9plaintext +9growth) ещё выполняются; session50601. Переноса нет.
Physical iOS/Telegram, side-by-side document columns, menu insertion caret ownership,
media/arbitrary clipboard/styles и остальные открытые строки матрицы не исключены.
Xcode runtime и Playwright WebKit не установлены; это не считается device coverage.

Main promotion завершён после38compat +2context browserPASS, unit665/664PASS/1SKIP, UI37/70 иbuildPASS. Copy изменил19source files; temporary fs.allow/realpath из isolated runner не перенесён. Новый main618 frozen snapshot иfresh comprehensive82677 ожидают268editorPASS и9этапов. Production readonly CUA:1280×720, editable true, border/outline/shadow0, Geist18/28, width768, overflowfalse, visible toolbars0, saved; data edits0, temporary tab34 закрыт. Это не actual iOS/IME verification. Следующие edge audit cases: first table row offscreen при новом столбце, menu-insertion caret ownership и wheel/touch intent до pending reveal.

Main618 comprehensive terminal: {"status": "failed", "exitCode": 1, "editorPassRecords": 128, "sourceCount": 618, "sourceDrift": [], "addedSources": [], "finishedAt": "2026-10-18T18:27:18.724587+00:00", "stages": [{"name": "check:release", "status": "failed", "startedAt": "2026-10-18T18:07:23.551Z", "exitCode": 1, "finishedAt": "2026-10-18T18:27:16.229Z", "durationMs": 1192678}, {"name": "test:navigation", "status": "not-run"}, {"name": "test:action-rails", "status": "not-run"}, {"name": "test:identity-reports", "status": "not-run"}, {"name": "test:todo", "status": "not-run"}, {"name": "test:form-pages", "status": "not-run"}, {"name": "test:catalog-page", "status": "not-run"}, {"name": "test:wish-groups", "status": "not-run"}, {"name": "test:drawers", "status": "not-run"}], "fontServingDenials": 0}. Remaining goal matrix stays open.
