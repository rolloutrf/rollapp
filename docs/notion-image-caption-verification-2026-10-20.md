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

## Второй промежуточный этап: UI и native browser checks

Проверяемая основа `b5aaa156914d71fea92ab7da641465d70608a7af`, с dirty
UI/runtime/test/docs diff второго этапа. Это targeted-проверки рабочего дерева,
не чистый release snapshot. Перед integration нужен frozen полный набор.

Добавление/повторное открытие подписи доступно из transient image controls,
включая full-width image. Реальный caret, inline marks и общий save queue;
нет отдельного поля или рамки. Подпись следует ширине/выравниванию изображения;
для tiny image минимальная читаемая ширина ограничена родителем. Изменение
размера сохраняет подпись, capture и прежний lifecycle самого image DOM.

- Последний `npm test`:803 total/802 PASS/1 SKIP/0 FAIL.
- `npm run test:ui`:37 primitives/79 JSX PASS; `npm run build` PASS,
  прежнее предупреждение о крупных chunks остаётся.
- `--image-captions-only`:8 PASS на320/390/768/820/1024/1440/1920 и390×400.
  Native focus/typing/selection/bold, creation/typing/Paste Undo boundaries,
  whole-figure Delete/Cut/HTML paste и partial-caption plaintext clipboard,
  save/reload/public read, draft failure/retry, full-width/tiny image,
  nested parent/columns/table/protected four questions, resize capture/preview,
  Enter/Backspace/Escape и malformed external HTML paste.
- Совместимость:alignment10 PASS иresize8 PASS, завершение обоих exit0.
  Эти targeted-запуски пересекались с caption-only guard правками: они не
  заменяют проверку одного frozen полного snapshot.
- Логи последнего этапа:`/tmp/rollapp-caption-stage2-{unit,ui,build,native}-2026-10-20.log`.
  Совместимость:`/tmp/rollapp-caption-compat-{alignment,resize}-2026-10-20.log`.
- Скриншоты визуально просмотрены:390×400 и1440×844,
  `/tmp/rollapp-caption-{width}-{height}.png`; без рамки/переполнения.
- `npm audit`:7 high dev-only; `npm audit --omit=dev`:0.
  Зависимости не менялись, несовместимых downgrade/force-fix не было.

### Найденные дефекты и уточнения проверок

Удаление выбранного дочернего image могло синтезировать image с пустым src:
selection теперь нормализуется в целую фигуру без authored/history writes.
Backspace в начале подписи второго nested child мог вынести фигуру из parent:
общий structural handler делегирует caption keymap. Malformed orphan caption
в native HTML paste не должен запускать schema fitter с пустым image:
DOM parsing проверяет полную пару image+caption и безопасный src.
Tiny1px caption имел descendant overflow: исправлен локальной минимальной
шириной и переносом. Enter создаёт собственный пустой paragraph, не дописывает
существующий непустой соседний текст.

Сохранены первоначальные неуспешные диагностические логи. Проверка identity
после resize commit была уточнена сравнением с неизменённым legacy image:
ProseMirror заменяет leaf DOM после commit и до captions; captured preview
обязан сохранять DOM. Escape использует существующий BlockSelection, не
придуманный тестом NodeSelection; resize chrome поддерживает одиночную фигуру.
Один Enter-check отправлял клавишу body после model-only selection:
добавлены native click и проверка фактического фокуса, не маскировка runtime.

Полный editor ожидает417 PASS records (409 baseline +8 captions), затем все
10 этапов comprehensive. Пока это pending, подписи не заявлены готовыми к
production. Public-reader проверки подтверждают содержимое/marks/read-only,
но не исчерпывают сложные media/column compositions и все geometry cases.
Enter/minimum/edge semantics не объявляются точным поведением Notion.
Viewer/другие media и физический iOS/Telegram/IME остаются в goal audit.
Production документы/схема/данные в этом этапе не менялись.
