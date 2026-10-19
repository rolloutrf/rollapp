# Продолжение цели Notion: 2026-10-19

Проверенный исходный commit: `fb508f2db73652ad723292e7d5a2fc417dc3cb52`.
До начала работы dirty: 5 tracked documentation files, 6 untracked documentation
files; src/scripts совпадали с HEAD. Полная цель остаётся активной.

## Повторная проверка внешних результатов

- CI `39251525717` terminal **failure**, до deployment. Ошибка:
  `Shift+ArrowDown caret top 0 below chrome 56` в `text-caret-scroll-checks.mjs`.
- Metadata650 full383 terminal **failed253/383**, source/extra/added drift0.
  Assertion: после native column-growth click таблица имеет3 вместо4 столбцов.
  `/tmp/rollapp-link-metadata-full383.json` и соответствующий editor log.
- Alignment653 full393 terminal **failed337/393**, source/extra/added drift0.
  Timeout при native click «Выделить столбец» на390×400 в conversion matrix.
  `/tmp/rollapp-image-alignment-full393.json` и соответствующий editor log.
- Эти процессы отсутствуют в `ps`; старые записи running в отчётах относятся к
  предыдущему checkpoint и не доказывают текущую активность.
- Production dev keepalive PID85976 готов, оставлен включённым. QA writes0.

## Текущая диагностика

Caret helper теперь измеряет соседний authored glyph, если native collapsed
Range на границе элемента не имеет геометрии. Измерение не использует
ProseMirror coordsAtPos, не меняет native selection и требует положительной
высоты. Верхняя/нижняя границы и native/model parity assertions сохранены.
Это кандидат исправления измерения; Linux отказ ещё не считается исправленным.
Лог полной9viewport caret matrix:
`/tmp/rollapp-caret-scroll-boundary-2026-10-19.log`.

Native table-insert повтор на текущем main прошёл2/2 viewport cases; это
воспроизведение для диагностики, не устранение причины isolated failed253.
Лог `/tmp/rollapp-table-insert-current-2026-10-19.log`. Первый запуск этого
диагностического теста остановился на занятом5199; повтор использовал5323.

`npm audit`:7 high в dev dependency chain shadcn/braces; production
`npm audit --omit=dev`:0 vulnerabilities. Несовместимый downgrade не применялся.

Открыты: причины двух isolated regressions, fresh combined comprehensive,
Linux release/exact production SHA, media/caption/file-paste/drop и прочие
R1–R10, actual iOS/Telegram keyboard/IME. Диагностические PASS не закрывают их.

## Завершённые проверки и текущие процессы

- Final caret matrix: **9PASS/exit0**, дополнительно18 native element-boundary
  probes с rawHeight0 и измеренной glyph-height23, неизменёнными endpoints.
  `/tmp/rollapp-caret-scroll-boundary-final-2026-10-19.log`.
- Current main conversion: **8PASS/exit0**; unchanged isolated alignment653
  conversion: **8PASS/exit0**. Metadata650 native table insert: **2PASS/exit0**.
  Повторы не объясняют исходные full383/full393 failures.
- `node --check scripts/text-caret-scroll-checks.mjs`, `git diff --check`:PASS.
- Review завершён; только test helper committed/pushed:
  `76a9f46d354178814f4a4b13ab3ef4b40bb57f81` →origin/main.
  Остальные документационные правки не включены. SHA256 helper:
  `9409feba7844e80dabc3a5b838bb1890b72c69b88c840d8956a4933ad544e3d8`.
- Новый Linux CI39273880365 подтверждён GitHub как in_progress для этого SHA.
  Health read после подготовки: healthy710457583a873ce56b93d4eb26849731164f5b2d.
  Новый выпуск ещё не подтверждён.
- Fresh `npm run check:comprehensive`: session25527/controllerPID43419,
  подтверждён живым процессом; unit716/715PASS/1SKIP, UI PASS, controls идут.
  JSON `/tmp/rollapp-notion-continuation-comprehensive-2026-10-19.json`, log
  `/tmp/rollapp-notion-continuation-comprehensive-2026-10-19.log`.
  Начат на fb508f2+единственный code/test diff helper; commit менялся во время
  прогона без изменения src/scripts/server/shared/package/vite. Это dirty
  проверка исходных bytes, не заменяет exact-commit Linux CI.

Следующее действие: проверить terminal двух полных jobs по этим handles,
сохранить причины отказов и продолжить remaining media/links integration.
Не переносить isolated кандидаты по одному успешному повтору и не закрывать
R1–R10 без полного аудита требований.

## Новый подтверждённый дефект: горизонтальный gutter jump цитат

Пользовательские снимки17:56:40/17:56:49. Read-only live review
`http://127.0.0.1:5172/app/spheres/identity?tab=principles`, IAB1280px:
одна цитата имеет left256, вложенный paragraph left274 (padding-inline-start18).
Pointer/click на внешнем отступе даёт handle left156/right256, над текстом
той же строки — left174/right274. Top436/height48 одинаковы. Разница18px точно
совпадает с quote padding. Только нативные clicks/focus, authored data не менялись.

Причина: nested drag scoring меняет target между blockquote и paragraph;
`gutterAnchor` в `inline-block-controls.jsx` берёт left выбранного DOM node.
Горизонтальная геометрия меняется вместе с semantic hover target. Нужна стабильная
rail policy для контейнера/его первого текстового блока с сохранением корректной
структурной цели действий, вложенности и column gutters. Исправление ещё не
применено; текущий comprehensive на прежних sources продолжает работу.
