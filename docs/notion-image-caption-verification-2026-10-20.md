# Rich image captions — промежуточный прогресс 2026-10-20

Ветка `codex/notion-image-captions-20261020`, base production9522341.
Это НЕ production release и не завершение R8/Notion fidelity. Remote main952
и post-deploy proofafddc50 проверены до начала работы.

Первый слой: schema nodes `captionedImage` (figure) и `imageCaption` (inline).
Старый leaf image и его attrs сохранены внутри одной перемещаемой единицы.
Подпись — часть общего документа/range/marks/history/save queue, не alt/title
и не отдельный input/editor. Основание:
[официальная справка Notion](https://www.notion.com/help/images-files-and-media).

Canonical HTML сохраняет marks, edge spaces, hard breaks, метаданные и numeric/
legacy dimensions. Orphan/reordered/nested-block caption markup отклоняется.
Creation guarded by exact doc/selection/node, editable/IME/lifecycle и reload
depth. Создание и набор — разные Undo; reopen меняет selection, не document.

- Initial targeted:5PASS/1FAIL — тест сравнивал identity с состоянием до Undo/Redo,
  а не непосредственно до reopen. Исправлена только проверяемая точка: strict
  identity до/после reopen; semantic equality Undo/Redo проверяется отдельно.
- `npm test`:796 total/795PASS/1SKIP/0FAIL, exit0.
- `npm run test:ui`:37 primitives/79 JSX PASS; build exit0, bundle warning остаётся.
- Шесть новых cases: marks/whitespace/link metadata, columns/tables/lists/toggles,
  empty caption, malformed input, source/selection/node/access/IME guards,
  creation/typing Undo/Redo, reopening и block movement/reload.
- Логи `/tmp/rollapp-caption-phase1-{unit,ui,build}-2026-10-20.log`.

UI добавления/фокуса ещё в работе. Layout/alignment/resize, native clipboard,
draft/retry/public reader, protected questions/short viewport требуют browser
coverage и полного text/comprehensive до integration. Enter-exit не объявляется
точным поведением Notion. Production документы/схема/данные не менялись;
физический iOS/Telegram/IME остаётся непроверенным.
