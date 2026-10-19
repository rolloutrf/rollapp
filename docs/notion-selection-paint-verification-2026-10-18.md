# Оформление выбранных блоков — 18 октября 2026

Проверяется dirty tree на HEAD `710457583a873ce56b93d4eb26849731164f5b2d`.
Предыдущая goal-итерация — progress: исправлены преобразования групп, добавлены
10 unit-тестов, полный редактор дал 107 PASS. Полная цель R1–R10 остаётся активной;
новая итерация не заменяет её отдельной проверкой цвета.

## Воспроизведение и изменение

Последний screenshot показывал зелёный текст вместо отдельного purple mark.
Перед исправлением CSSOM для девяти inline цветов при скрытом selection выдавал
одинаковый green RGB (137,188,155), хотя исходные цвета различались.
Counterexample: `/tmp/rollapp-selection-paint-before.log`.

`ProseMirror-hideselection ::selection` больше не устанавливает `color:
var(--foreground)` всего блока: используется currentColor. В соответствии с
[CSS Pseudo-Elements](https://www.w3.org/TR/css-pseudo/) это сохраняет исходный
цвет рисуемого текста. Обычное видимое текстовое выделение не менялось.

BlockSelection, NodeSelection и selectedCell больше не заменяют фон на accent.
Они добавляют background-image с полупрозрачным ink-blue 18% поверх авторского
background-color, под текстом. Border/outline/shadow не добавляются. Модель,
очередь сохранения, размеры, typography и layout CSS не менялись.

## Авторитетная проверка отрисовки

На currentColor наблюдалось отличие CSSOM от paint: computedStyle(::selection)
показывал gray RGB первой подсветки и для purple-фрагмента, но реальных purple
пикселей было 355 против исходных 352. Лог:
`/tmp/rollapp-selection-paint-diagnostic.log`.
Поэтому новая проверка сравнивает **пиксели всех девяти цветов**, а не ослабляет
требование до сохранённых атрибутов/одного общего foreground. Для каждого цвета
baseline должен содержать >10 точных glyph pixels и девять разных RGB; после
выбора — не менее половины исходного числа с допуском для anti-aliasing.
Также проверяются inline highlights, исходный blue background, различие выбранного
blue/default, видимость выбора без авторского фона, все четыре границы/outline/
shadow, неизменность JSON и нулевые сохранения/API.

NodeSelection создаётся на цветном абзаце. Табличный столбец проверяет сохранность
orange header / blue cell фонов и purple glyphs; неподсвеченные ячейки не меняются.
Картинки и другие заменяемые элементы этой проверкой не покрываются.

## Проверки

Focused `--paint-only`: 18 PASS, код 0,
`/tmp/rollapp-selection-paint-second.log`. Матрица: dark/light × 320×844, 390×844,
390×400, 768×844, 820×844, 1024×844, 1440×844, 1920×844; дополнительно 390×844
DPR 3 в обеих темах. Вся матрица включена в основной `test:text-edit`.

Финальный `npm run test:text-edit` завершился с кодом 0: **125 PASS**,
включая 18 новых selection-paint сценариев. Лог:
`/tmp/rollapp-selection-paint-full-text.log`. Все 18 source SHA256 из
`/tmp/rollapp-selection-paint-tested-sources.json` совпали после завершения.
Модель и команды из предыдущего 21-file snapshot не менялись, кроме намеренно
изменённых editor CSS и smoke runner. Машиночитаемый результат:
[JSON](notion-selection-paint-verification-2026-10-18.json).
`test:ui` прошёл (37 primitives, 68 application JSX); build прошёл с прежним
chunk >500kB warning. Общий check:comprehensive останавливается на прежнем
Gallup DNA assertion: 584 теста, 582 PASS, 1 SKIP, 1 FAIL; это не успешный
аудит приложения. Дальнейшие этапы общего аудита не запускались.
Логи: `/tmp/rollapp-selection-paint-comprehensive.{log,json}`,
`/tmp/rollapp-selection-paint-build.log`, `/tmp/rollapp-selection-paint-ui.log`.

Первый audit/npm audit --omit=dev оборвался до получения результата из-за TLS
к registry. Оба повторных запроса завершились: 7 high dev/tooling, 0 production.
`/tmp/rollapp-selection-paint-audit-retry.json`,
`/tmp/rollapp-selection-paint-production-audit-retry.json`.
Dependency graph не менялся. Advisory-ответы совпадают с предыдущей итерацией,
где compatible fix dry-run дал 0 changed; несовместимый downgrade shadcn не применялся.
Общий typography/layout и навигационные контролы не менялись, отдельный controls
smoke в этом проходе не запускался.

Read-only live review career/about при 1280px через production connection:
нативный Escape выбирает один блок, фон остаётся transparent и появляется
blue gradient alpha .18, border/outline 0, shadow none, root без overflow.
Повторный Escape снимает выбор. Текст не менялся, команды сохранения не применялись.
Временная вкладка закрыта, persistent dev service не останавливался.

`git diff --check` и whitespace-проверка нового smoke helper прошли.
Persistent service PID 99362 остаётся готовым: API/frontend доступны.

## Ограничения и остаток цели

Непоследовательные группы, произвольное вложение и стили при изменении контейнеров,
обратные преобразования сложных toggle, media, ручки/drag/рост таблиц и полный
clipboard-аудит через ответы остаются в `docs/notion-text-experience.md`.
Реальные iOS/Telegram и WebKit/IME не проверены; DPR 3 — Chromium-эмуляция.
Никаких production writes, schema changes, commit или deployment не выполнялось.
Чужие изменения сохранены.
