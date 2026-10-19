# File paste/drop: 2026-10-19

Изолированный кандидат на базе76a9f46; ещё не перенесён и не опубликован.
Managed worktree `/Users/developer/.codex/worktrees/inline-file-transfer/rollapp`.
Полная цель R1–R10 сохраняется, как и проверки реальных устройств.

## Реализация

Общая image batch transaction использует native ProseMirror slice fitting,
сохраняет rich prefix/suffix и соседей, проверяет canonical depth, own caret и
фиксированные questions. Несколько файлов — один Undo с отдельным последующим
набором. Полный список JPEG/PNG/WEBP до8МБ валидируется до первого API вызова;
структурный план предварительно проверяется и затем проверяется повторно с
реальными upload URLs. Используется прежний authenticated upload/release API,
никакой schema initialization/production QA writes.

Capture обработчики принимают clipboard files и внешние file drops; внутренний
rich block drag без files остаётся upstream. Пока API выполняется, native
doc/range/editor/focus/access/IME/lifecycle владеют разрешением commit. Смена
владельца и Cancel исключают позднюю вставку и освобождают только новые
never-committed assets. Успешно вставленные файлы остаются в истории послеUndo.
Временный popup не фокусирует другой field; ручной wheel запрещает поздний reveal.
Он учитывает настоящий app chrome и VisualViewport, отмена кнопкой возвращает
фокус своему editor, внешний переход сохраняет фокус назначения.

## Попытки и доказательства

- Первый unit run выявил лишний пустой paragraph из ошибочного дополнительного
  bridge; исправлен closed Slice без bridge, прежние expected neighbours сохранены.
- Second unit:723 total/722PASS/1SKIP. Third unit:725/724PASS/1SKIP/0FAIL после
  отдельных empty list/cell/nested/column и drop-next-to-media guards.
- Browser first failed на320px: старый native offset13 стал больше длины node7
  при замене source. `/tmp/rollapp-file-transfer-browser-first.log` сохранён.
  Anchor теперь хранит последнюю валидную геометрию и не измеряет устаревший range.
- Browser second:16PASS/exit0 (new transfer8 + existing images8), отдельная версия
  до следующих IME/cancel/preflight/drop revisions; не общий combined proof.
  `/tmp/rollapp-file-transfer-browser-second.log`.
- Fresh third browser session50063, port5334: новая8viewport transfer matrix
  плюс existing image8; выполняется. Дополнены upload retry, fresh IME rejection,
  two-editor focus, drop preserving image, actual chrome и manual-scroll guards.
  `/tmp/rollapp-file-transfer-browser-third.log`.
- Fresh UI37/75JSX/buildPASS в session23752. Это не заменяет полный editor audit.
- Third browser terminalfailed после5transfer PASS: загрузка lazy text-chrome-frame
  дала module fetch error при Vite dependency reoptimization. Error assertion
  сохранён, результат не объявлен8PASS. Fourth attempt добавил optimizer entries,
  но зафиксировал тот же reoptimization reload с явным списком новых dependency
  paths. Нужно завершить инфраструктурную диагностику перед новым полным gate.
- Дополнен focus-time ownership guard и prior-to-upload structural plan;
  latest unit726/725PASS/1SKIP. Pending current fourth browser не подтверждает
  эту функциональность шире завершённых unit и предыдущих targeted scopes.
- Контракт обновлён в worktree `docs/inline-editing.md`. Другие active frozen
  source roots не меняются.

File events содержат внедрённые DataTransfer/File payloads. Native ranges,
typing/history/menu/focus/scroll идут через Chrome, но физический clipboard,
desktop file manager и actual-device IME не проверены. Не выдавать эти cases за
полную Notion fidelity. Ещё нужны native сложные контексты, protected answers,
проверки pending source/font/viewport/layout, совместимость остальных editor
взаимодействий и полный text/comprehensive после integration. Captions, прочие
media, точные reference resize anchors/minimum и все остальные R1–R10 открыты.

## Статус перед push

Fifth targeted run завершился ошибкой на 768px после трёх PASS:
`window.inlineImageFixture.pending.shift(...) is not a function` в
`text-image-transfer-checks.mjs:56`. Лог
`/tmp/rollapp-file-transfer-browser-fifth.log`. Причина пока не установлена;
прежний успешный повтор не подтверждает текущий кандидат. Полный editor и
comprehensive для него не завершены. По запросу сохранить всё публикуется
отдельная WIP-ветка `codex/inline-file-transfer`, не включённая в main.
