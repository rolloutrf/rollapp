# Вставка изображений в inline-документ: 2026-10-19

Статус: **progress, в локальном приложении; первый full failed80, новый full2 выполняется**.
Проверен HEAD `710457583a873ce56b93d4eb26849731164f5b2d` с dirty workspace.
Основное дерево source634 заморожено для текущего comprehensive; его исходники
и десять дополнительных входов не изменились. Полная цель Notion остаётся активной.

Последнее состояние: image642 вmain. Первый fresh full завершился failed80/367
из-за ожидания «Таблица» какпоследнего пункта после добавления «Изображение».
Изолированный runner-only surface check дал11PASS:8viewport+3shared, source642
drift0. Dynamic catalogue length/last label/aria-pressed/full visibility сохранили
семантические assertions. Initial controller ожидал8 вместо11, исходный metadata
сохранён; reclassification сделана после source inspection без rerun/изменения.
Перенесены только runner иdiagnostic docs. Fresh full2 ожидает367/9stages,
source642+10extra заморожены, процесс92362/session67234 подтверждён live.
Resizer646 остаётся изолированным; его результаты не суммируются сmain.


Кандидат source642 добавляет изображение через slash и общее меню действий,
загрузку JPEG/PNG/WebP существующим API, URL, описание и ширину. Вставка создаёт
собственный следующий абзац; набор и вставка отменяются отдельно. Параметры
изображения, типы числовых размеров, буквальное описание и соседний текст
сохраняются при Markdown/HTML clipboard, сохранении и публичном чтении.
Схема БД и существующий API загрузки не менялись.

Запрос меню сам не меняет документ. Отмена, изменившийся исходник, доступ или
IME запрещают позднюю вставку. Отменённая загрузка может освобождать только
свой новый неиспользованный asset; вставленные assets остаются доступны Undo.
Проверка удаления старого asset дополнена ссылками из career/identity prose.
Все семь SQL-проверок параметризованы и ограничены владельцем; ошибку нельзя
превратить в разрешение удаления. Межпользовательские ссылки и полный жизненный
цикл вложений этой проверкой не доказаны.

## Выполнено

- `npm test`: **702 total, 701 PASS, 1 SKIP, 0 FAIL**.
- `npm run test:ui`: **37 primitives / 73 application JSX**, PASS.
- `npm run build`: PASS, существующее предупреждение о размере chunks.
- `node scripts/text-edit-smoke.mjs --images-only`: **8 PASS**, exit0,
  320/390/768/820/1024/1440/1920×844 и390×400; source642 drift0.
- Диагностика390×400/1440×400: **2 PASS**, exit0. Нативные window errors и
  unhandled rejections собираются отдельно от pageerror, ошибок0.
- Нативные filechooser/clipboard, error/retry, поздний ответ upload после Cancel
  или смены источника, metadata/move, отдельный Undo, точный save/reload/public
  и восстановление failed-save draft проверены. Все реальные API запрещены;
  транспорт upload/delete — явно включённый fixture, не подмена БД.
- Контролы48px, Geist18/28, отсутствие рамок у прозы и overflow проверены.
  Геометрия измеряется после окончания штатной анимации, граница48px сохранена.
- Настроенная production БД проверена через стандартный Lockbox bootstrap и
  точную БД/роль: `BEGIN READ ONLY`,7 SELECT,0 writes/DDL,ROLLBACK. Сервис22680
  здоров и оставлен включённым. Реальные загрузки/удаления не выполнялись.
- `npm audit`:7 high в development toolchain; `--omit=dev`:0. Зависимости
  в этой итерации не менялись. `git diff --check` PASS.

## Найденные отказы

Стандартная image Markdown-сериализация теряла width/height. Исправлена
каноническая сериализация; старый legacy roundtrip остаётся проверяемым.
Первый always-rich вариант добавлял nullable attrs и был отклонён.

Первое открытие меню читало editor.view до mount в React StrictMode.
Подключение обработчиков перенесено в lifecycle mount/create/unmount.

Предыдущая восьмёрка PASS сопровождалась реальной ошибкой ResizeObserver и
**не считается чистым результатом**. Диагностика связала её с autoUpdate
позиционера при изменении высоты busy/error/disclosure. Удаление ограничения
available-height не помогло. Теперь только image picker использует существующий
опциональный disableAnchorTracking: локальный ResizeObserver обновляет anchor
через следующий RAF, вне доставки уведомлений. Остальные popovers сохраняют
штатные defaults. Новая восьмёрка и короткие окна прошли с полным сбором ошибок.

Два отказа fixture сохранены: измерение46.1px во время штатного scale-enter
и очистка sessionStorage draft при reload. Исправлены ожидание анимации и
различение новой навигации/reload; assertions размера и точного черновика
не удалялись. Подробные логи всех отказов и исправлений — в JSON-отчёте.

## Что ещё требуется

Поздняя загрузка самого изображения исправлена и проверена следующей итерацией
ниже; требуется её совмещённая проверка с последним public-reader patch. Нужны
нативные плюс/Alt-плюс, сложные вложенные контексты, protected answers в UI,
доступ/IME во время upload, VisualViewport panning и compatibility соседних
меню/selection/table/clipboard. Pointer resize, file paste/drop и полный каталог
media ещё не реализованы. Реальные iOS/Telegram keyboard не проверены.

MAIN634 comprehensive продолжается: ожидается335 редакторских записей и9 этапов.
Отдельные целевые результаты не заменяют его terminal и не закрывают старый
main633 group/menu indent820 отказ. Переноса image-кандидата не было; до него
обязательны review, синхронизация контрактов и новая общая проверка будущего
main с343 editor records. Временные realpathSync/fs.allow из isolated runner
никогда не переносятся в основное дерево.

Машиночитаемое доказательство, hashes и ограничения:
[JSON](notion-inline-images-verification-2026-10-19.json).

## Следующая итерация: поздняя загрузка самого изображения

Held-response проверка воспроизвела реальный сбой: при390×400 курсор был y261,
после загрузки360×1500 стал y1752.66 при navigationTop336 и неизменном scroll588.
Это не UI-upload lateness: загрузка asset отдельно меняет раскладку документа.
Лог: `/tmp/rollapp-inline-images-layout-before.log` (FAIL, сохранён).

Изолированный observer теперь отслеживает незагруженные img перед нативным
курсором в момент авторского действия. Load/error и завершение шрифта вызывают
повторный RAF-замер только для того же диапазона. Wheel/touch отменяют намерение,
новая selection/access не позволяют старому продолжению прокрутить документ;
печать формирует новое намерение. Содержимое не меняется.

Диагностика390×400/1440×400 дала2PASS ×5режимов: settle, печать до загрузки,
wheel, новый caret, read-only. Лог `/tmp/rollapp-inline-images-layout-fixed1.log`.
Новая единая42-record compatibility выполняется на замороженном642; отчёт
`/tmp/rollapp-inline-images-layout-compat.json`, snapshot с тем же префиксом.
Unit702/701PASS/1SKIP, UI37/73/build повторно PASS. Предыдущая8-record image
матрица относится к предшествующей версии и не заменяет новую compatibility.
Ожидаемый будущий полный редактор после переноса теперь351, а не343.

[Официальная справка Notion по медиа](https://www.notion.com/help/images-files-and-media)
подтверждает создание через плюс/slash, upload/URL, перестановку и изменение
размера за края; подпись отличается от alt. Также описаны replace и original/
full-screen. Это сохраняется в открытом аудите R4/R8: только URL-форма не
доказывает идентичность работы с медиа. Collaboration/workspace функции,
исключённые основным текстовым scope, этим перечнем не возвращаются.

Полная native late-image матрица теперь **8PASS /40подсценариев** (source642,
`/tmp/rollapp-inline-images-layout-compat-image-layout.log`). Единая совместимость
ещё выполняется; main634 всё ещё неизменён.

Отдельно подтверждён markup-контрпример публичного age accordion: реальный
MarkdownDocument рендерит canonical image как буквальный data-inline-block,
img отсутствует. SSR-лог `/tmp/rollapp-inline-images-accordion-public-before3.log`;
это доказательство структуры разметки, не проверка browser layout. Первые два
SSR-запуска упали из-за tooling CSS/CJS и не считаются продуктовыми отказами.
Исправление центрального renderSourceBlocks подготовлено вне замороженного
кандидата (`/tmp/rollapp-inline-images-reader-proposed.json`), не применено.
Нужны browser-проверка с раскрытием секции и совместимость rich accordion.

## Итог текущего продолжения

Parent callback/image phase: **44PASS**, exit0/source642 drift0, включая8held-image
×5режимов,8image authoring,8offscreen insertion/8font guard subcases,9rich caret,
9plaintext caret,2native macOS page-key. Controller изначально ожидал8 вместо9
уcaret/plain и остановился на count mismatch при exit0. Старый metadata report
сохранён; исправлен только ожидаемый счётчик, выполнены только две ещё не
запускавшиеся группы. Семантические assertions не менялись, PASS не повторялись.
Логи `/tmp/rollapp-inline-images-layout-compat*.json/log`.

Public-reader browser baseline подтвердил отсутствие обеих картинок и потерю
структуры колонок после раскрытия45y.o.; виден только alt/plain text. Это точнее
SSR-наблюдения оliteral markup: в браузере InlineMarkdown съедает HTML-разметку.
Baseline `/tmp/rollapp-inline-images-reader-native-before4.log` (FAIL0vs2),
снимок `/tmp/rollapp-image-reader-before-ages-390-400.png`.

Reader patch применён в изолированном дереве строго после terminal44 и проверки
всех hashes. renderSourceBlocks использует общий rich reader для неинтерактивного
содержимого age/strategy groups; старый callback путь task checkbox сохранён.
Native short2 PASS, затем интегрированная **8viewport ×2 disclosure contexts PASS**:
фактический img.decode, обе картинки/alt/размеры, соседний текст, columns,
mobile stacking, отсутствиеeditable полей/рамок/API/overflow/errors. Это проверка
данного состава, не всех accordion/interactive task вариантов. Результат
`/tmp/rollapp-inline-images-reader-native-full2.log`, source snapshot с префиксом
`/tmp/rollapp-inline-images-reader-final2-sources.json`.
Первый integrated runner упал на shadowing локального const frames; переменная
проверяемых стилей переименована в frameStyles, все assertions сохранены.

Внешний native harness сначала имел tooling отказы (cold optimizer, отсутствующий
fixture export и HTML-proxy inline script). Они не считаются продуктовыми отказами.
Успешная интегрированная проверка использует стандартный text-edit fixture и
обычный runner, явно запрещает реальные API. Снимки320/1440 просмотрены;
fixture-only отсутствие app shell не выдаётся заlive проверку public header.
Unit/UI/build повторно PASS после reader runtime patch; последнее изменение —
только имя локальной переменной browser assertion, build/production inputs те же.

Main335/editor теперь PASS, включая nesting820; приложение всё ещё проходит
kanban/остальные comprehensive stages. Source634/10extra inputs drift0. Старый
main633 failed281 сохранён, успешный повтор не выдаётся за объяснение его причины.
В приложение images/reader ещё не перенесены. Синхронизация контрактов,
нативные plus/Alt-plus/upload-access/IME/viewport/nested-context guards иновый
main359/nine-stage full остаются обязательными. R1–R10 не закрывались.

## Контексты вставки: следующее продолжение

MAIN634 теперь **полностью PASS:9этапов comprehensive,335editor records**, source/
contracts drift0/added0/font denials0. Terminal `cross-clipboard-main-full-terminal.json`
иJSON исходного аудита сохраняют exact dirty commit. Это baseline перед images,
не доказательство новой версии. Production keepalive22680 не останавливался.

Нативная baseline-проверка ячейки подтвердила вставку картинки снаружи таблицы
(`/tmp/rollapp-inline-images-context-before2.log`). В первом expected alt былnull,
тогда как picker создаёт empty string; исправлен fixture, baseline повторён до
изменения runtime. Реальный defect location остался и сохранён.

В изолированном642 `inlineImagePosition` выбирает исходный text block для
caret/slash, сохраняя явные структурные цели. Common insert валидирует реальный
before/after/replace индекс и весь Fragment вместо проверки before-индекса для
каждого случая. Пустой обязательный list paragraph сохраняется, ordinary empty
nested/cell slot может заменяться. Все существующие704unit:703PASS/1SKIP/0FAIL.
Новые unit fixtures сначала имели null-prototype JSON и неверное предположение о
NestedBlock: его schema `block+`, требование first paragraph есть уlistItem.
Fixtures приведены креальной схеме ссохранением точных owner/neighbour assertions.
Это не два чистых продуктовых baseline failures; native cell baseline — основное
доказательство дефекта. Логи всех попыток находятся вJSON-отчёте.

Проверены8размеров native contexts: desktop+/Option before/after, narrow action
menu, cell exactsave/reload/typingUndo, nested child/first parent/list parent,
column owner/ratios/peers искрытие/возврат resize separators, protected answers
exact Undo/Redo/API shape/save/reload, fixed prompts/чужие ответы, read-only/loading,
late upload приaccess revocation, VisualViewport220/panning96 ивидимый caret.
Log `/tmp/rollapp-inline-images-final-compat-image-context.log`. UI37/73/buildPASS.

На этом642 выполняется отдельная64-record compatibility (8групп), session85160,
controller70426; snapshot/report `/tmp/rollapp-inline-images-final-compat*`.
Пока source заморожен,3контракта подготовлены только в/tmp, не применены.
Ожидаемый будущий default editor теперь367=335+4×8 image suites.

Найдены ещё2чистых model counterexamples: same-document selection change допускает
старую pending image insertion (`selection-before.log`); metadata выбранной head
image внутри nested parent дублируется снаружи вместо редактирования
(`nested-edit-before.log`). Оба лога с префиксом `/tmp/rollapp-inline-images-`.
Это **ещё не исправлено в замороженном642**. Комбинированный4-file patch подготовлен
в `/tmp/rollapp-inline-images-selection-guard-proposed.json`: compare selection owner
наopen/invalidate/commit, metadata exact selected image при logical parent target,
сохранение явно другого structural table target. Добавлены model/native regressions.

Session66515 ждётterminal64, затем только приPASS64/drift0/exactold-new hashes
применит patch **ккандидату**, создаст backup/snapshot, выполнит unit706/UI/build и
native16(context8+authoring8), остановится наошибке. Report
`/tmp/rollapp-inline-images-guard-gates.json` — authoritative состояние этой фазы.
Автоматического переноса вmain нет. После gates нужны combined diff review,
контракты иfresh main367/nine-stage audit. Успехи разных snapshots не суммируются.

Placeholders/cancel parity, captions/align/resize/file paste-drop, произвольные
составы/interactive task callbacks иactual iOS/Telegram IME/device остаются вR4/R8/R10.
Данные проверки не объявляют идентичность Notion или завершение общей цели.

## Курсор, общий ритм и передача контекстного меню

Parent64 завершился PASS без drift. Новый selection-owner guard запрещает
вставку после смены selection даже без изменения документа; metadata выбранной
head image остаются у неё внутри nested parent. Unit706/705PASS/1SKIP и native16
прошли на следующем снимке. Проверка каждого кадра затем выявила6 кадров с двумя
popup: старое block menu оставалось в closing animation. Первый fix скрывал его
при передаче, но возвращал после Cancel. Active-only mount и layout-effect owner
убрали оба сбоя в короткой диагностике.

Регрессия41 остановилась на390×400 при клике по nested-head1px image. Это
продуктовый отказ, не списанный на flaky тест. Контрпример GapCursor показал
неизменный документ и перемещение image(14,72) →(41,94.5): widget занимал
:first-child и менял shared heading/first-block margins и grid column. Shared
селекторы теперь выбирают первый authored child, исключая ProseMirror-widget,
с прежней specificity. Новая проверка намеренно создаёт реальный GapCursor,
сравнивает image/child rects, затем нативно кликает tiny image и редактирует
metadata без создания дубликата. Размер fixture1px не увеличивался.

После исправления: diagnostic2PASS;706unit/705PASS/1SKIP, UI37/73, buildPASS.
Новая compatibility ожидает72 записи (9групп ×8), исходники642 и10дополнительных
входов заморожены. Изначально controller ошибочно ожидал9 selection records,
хотя её source задаёт8viewport; exit0/8PASS сохранены, исходный report count
mismatch сохранён отдельно, продолжены только ещё не запускавшиеся три группы.
Семантические assertions и исходники не менялись. Результат до terminal не заявлен.
Логи и snapshots: `/tmp/rollapp-inline-images-gap-compat*`.

## Следующий реальный отказ: ранний фокус другого поля

`/tmp/rollapp-inline-images-gap-compat-images.log` сохранил точный JSON390×844:
вместо alt Updated изменился URL, alt Diagram не изменился. Parent72 имеет
source/extra/added drift0, но failed57/72; tables ещё не запускались. Автоматические
final-review gates отказали до любых изменений. Короткий повтор без изменений
прошёл2PASS (`focus-before.log`); это ограниченный repeat и не устранение причины.
Добавлена детерминированная ранняя фокусировка alt сразу после появления popup,
далее настоящие keyboard typing и проверка полного документа. Без unconditional
RAF auto-focus это должно сохранять намерение пользователя. До исправления
перенос не выполняется.

Детерминированный `focus-deterministic-before.log` завершился FAIL уже на первом
окне: поле alt потеряло focus после своего раннего выбора. После исправления
`focus-deterministic-fixed.log` дал2PASS с настоящим набором и точным JSON.
Собственный RAF удалён; primitive initialFocus возвращаетfalse, если focus уже
внутри popup, а штатная очередь охраняет последующую смену поля. Нельзя исправлять
такой сбой ожиданием автофокуса в тесте: early-choice assertion сохранён в images8.
Финальные unit706/705PASS/1SKIP, UI37/73/buildPASS относятся к этой новой версии.
Fresh audit:7high dev toolchain, production0; lockfile без изменений. Audit предлагает
major downgrade shadcn1.0.0, он не выполнялся. Новый native32 gate ещё выполняется;
его результат и будущий main367 фиксируются отдельно.

## Перенос в основное приложение и живое чтение

Финальный native32 gate PASS: images8 с deterministic early-field focus,
contexts8 с gap-caret/native hit/metadata ипокадровым single-popup handoff,
block-menu8, tables8. Snapshot642+10extra, source/extra/added drift0.
`/tmp/rollapp-inline-images-focus-compat.json`. Финальные706unit/705PASS/1SKIP,
UI37/73/buildPASS относятся кэтому же неизменному candidate. Результаты прежних
64/16/failed57 phases не добавляются к32 как единый аудит.

После review перенесены25code/test paths (8new) и4контракта по exact old-hash
checks. `/tmp/rollapp-inline-images-main-backup/manifest.json` сохраняет прежние
байты, `/tmp/rollapp-inline-images-final-promotion.diff` — проверенный diff.
Temporary realpathSync/fs.allow изsymlink isolated runner не переносились.
Commit по-прежнему710457583a873ce56b93d4eb26849731164f5b2d/dirty; чужие правки
сохранены, commit/PR/deploy не выполнялись.

Reload persistent local dev понадобился для server image-reference guard
(API вdev.mjs безwatch). Первый enable встретил race graceful exit старого PID:
команда сохранила PID-файл; затем владелец завершился и сам его удалил. После
проверки отсутствия старых процессов и штатногоstatus повторный enable прошёл.
Ручногоunlink PID/kill не было. Новыйservice85976, API/frontendready,
LaunchAgentenabled, production directTLS/verify, сервис оставлен включённым.

Live IAB43: reload сохранил10456chars/43p/FNV2967052693. Keyboard block menu→image
иnative координатный плюс→image показали ровноодин popup, начальныйfocusнаUpload.
Cancel обоих путей вернул неизменный текст, saveStatus saved, menus0/toolbar0,
Geist18/28 иborder0/outline0/shadownone, overflowfalse. Реальные uploads/deletes и
набор впрозе не выполнялись. Два role-locator нажатия плюса ранее не оставили
меню: причина не установлена; screenshot-grounded native click(180,400) открыл
его. Это записано как различие автоматизированного live взаимодействия, без
заявления об исправленной причине. Fixture native plus/Option прошёл contexts8.

Fresh main642 comprehensive начат с frozen642source+10extra, ожидаются367editor
и9stages, безfilter. `/tmp/rollapp-inline-images-main-full-sources.json`,
`/tmp/rollapp-inline-images-main-full-comprehensive.json`, логтотжепрефикс.
Terminal ещё не получен. Проверка targeted32 и candidatebuild не объявляются
полным аудитом приложения. Дальше сохраняются все открытыеR1–R10.

Images main comprehensive terminal: {"status": "failed", "exitCode": 1, "editorPassRecords": 80, "expectedEditorRecords": 367, "sourceCount": 642, "comprehensiveStageCount": 9, "allStagesPass": false, "sourceDrift": [], "extraInputDrift": [], "addedSources": [], "fontServingDenials": 0, "finishedAt": "2026-10-19T09:37:41.299525+00:00"}. Полная цель и открытые R1–R10 сохраняются до отдельного аудита.

Fresh main642 terminal: failed80/367 наsurface keyboard last-option assertion.
Лог `/tmp/rollapp-inline-images-main-full.log`, source/extra/added drift0.
Вариант толькоrunner проверяется отдельно source642: actual catalogue length,
actual last label, aria-pressed иполная видимость последнего пункта приArrowUp.
`--surface-only` не заменяет367/nine-stage.

Catalogue runner-only исправление прошло strict11/source642 drift0.
Promotion overlay `/tmp/rollapp-image-catalogue-overlay-proposed.json`, backup
`/tmp/rollapp-image-catalogue-main-backup/manifest.json`. App/API code не менялись,
повторный dev-restart не нужен. Main full2 `/tmp/rollapp-inline-images-main-full2*`
запущен заново с полными367records/nine stages; предыдущийfailed80 сохранён.

Images main comprehensive terminal: {"status": "failed", "exitCode": 1, "editorPassRecords": 227, "expectedEditorRecords": 367, "sourceCount": 642, "comprehensiveStageCount": 9, "allStagesPass": false, "sourceDrift": [], "extraInputDrift": [], "addedSources": [], "fontServingDenials": 0, "finishedAt": "2026-10-19T10:22:44.149093+00:00"}. Полная цель и открытые R1–R10 сохраняются до отдельного аудита.


Main642 full2 terminal: **failed227/367**, nine-stage audit stopped in check:release; all later stages not-run. Source/extra/added drift0, font denials0. Failure: changed document during column-width preview cancels resize assertion at1440×400; actual extra nested columns appeared after mouse release. Isolated focus-adapter version repeats context3PASS, which alone does not establish a fix. Native first-pointer ownership is being isolated. Controller92357/npm92362/session67234 terminated; do not describe them as running. Production keepalive left running; no QA production writes. Exact terminal: `/tmp/rollapp-inline-images-main-full2-terminal.json`.

2026-10-19: parent375 terminalPASS, merged53/native +716unit/715PASS/1SKIP +UI37/74/buildPASS, source/extra/added drift0. Image/core13 (4new) +3contracts promoted after strict old/new/tested-hash review; storage5/portal2 retained. Main646/default375 fresh comprehensive9 is running (session32893/root14636); not yet an overall PASS. Link-intent candidate649 remains isolated. R1–R10 open.
