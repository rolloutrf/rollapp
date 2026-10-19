# Индивидуальное оформление при смене типа — 18 октября 2026

HEAD `710457583a873ce56b93d4eb26849731164f5b2d`, dirty tree. Чужие изменения
сохранены. Коммит/deployment, schema changes и production writes не выполнялись.
Предыдущая goal-итерация дала прогресс: поиск Cmd/Ctrl+/ и проверенные 99 сценариев.
Цель целиком остаётся активной, её объём — `docs/notion-text-experience.md`.

## Воспроизведение и исправление

До исправления четыре блока с red / blue_background / default / green после
смены типа на h2 становились все green — цветом последнего блока выбора.
Counterexample: `/tmp/rollapp-mixed-conversion-before-second.log`.
`applyBlockType` теперь сохраняет цвета каждого выбранного textblock, включая
унаследованный цвет при поднятии из контейнера. Mapping начинается после уже
выполненных шагов общей команды (например, удаления slash-query), а не от
исходного документа. Пустые и одинаковые блоки не сопоставляются по строкам.
Маркер и фон простого пункта принадлежат item, а не только его абзацу.

Групповой Turn into toggle обрабатывает все выбранные блоки, сохраняет их
заголовки, marks, цвета и вложенные пункты. Существующие toggle не получают
лишних дочерних блоков. Прямая группа сохраняет направление BlockSelection;
CellSelection сохраняется при преобразовании столбца. История отменяет всю
операцию одной командой.

Аудит выявил необходимость отдельных selection.ranges для столбца: bounding
from/to включал промежуточные ячейки. Снимок цветов и toggle conversion теперь
используют только реальные диапазоны. Десять новых unit-тестов покрывают эти
случаи, включая вложенные пункты у обоих элементов группы.

Первый общий прогон `/tmp/rollapp-mixed-conversion-full-text.log` остановлен
осознанно после нахождения range-case: конкретный owned node PID 59246,
terminal exit 143 подтверждён до нового запуска. Это не успешный полный прогон.
Второй полный прогон `/tmp/rollapp-mixed-conversion-full-text-final.log` также
остановлен через owned PTY (terminal exit 130): обнаружено смещение одиночного
курсора при новом Turn into toggle. Unit-counterexample:
`/tmp/rollapp-mixed-conversion-caret-before.log` — offset 0 вместо исходного.
Исправление хранит source offset; новый browser case проверяет следующий символ
через меню и slash на всех восьми размерах. Последний focused run:
`/tmp/rollapp-mixed-conversion-caret-focused.log`, 8 PASS, код 0.
Persistent dev service не останавливался.

## Проверки

**Финальный `npm run test:text-edit`: 107 PASS, код 0**, включая восемь новых
сценариев преобразования. Все 21 source hashes остались неизменными за прогон.
[Машиночитаемый отчёт](notion-mixed-conversion-verification-2026-10-18.json).
Лог:
`/tmp/rollapp-mixed-conversion-full-text-verified.log`.
Остальные результаты финальных исходников:

- `npm run check:comprehensive`: 584 unit tests — 582 PASS, 1 SKIP, 1 FAIL,
  прежний «Gallup DNA labels must use shrinkable grid tracks». Все десять новых
  тестов проходят. Дальнейшие этапы общего аудита не запускались.
  `/tmp/rollapp-mixed-conversion-comprehensive-verified.{log,json}`.
- `npm run test:ui`: 37 primitives, 68 application JSX, код 0.
  `/tmp/rollapp-mixed-conversion-ui-verified.log`.
- `npm run build`: код 0, прежнее предупреждение chunk >500kB.
  `/tmp/rollapp-mixed-conversion-build-verified.log`.
- `npm audit`: 7 high dev/tooling; `npm audit --omit=dev`: 0 production.
  `/tmp/rollapp-mixed-conversion-audit.json` и
  `/tmp/rollapp-mixed-conversion-production-audit.json`.
  Dependency graph и advisories идентичны предыдущей итерации с compatible fix
  dry-run 0 changed; несовместимый shadcn 1.0 downgrade не применялся.
- `git diff --check`: PASS. Навигационные компоненты, размеры контролов и общий
  typography/layout CSS не менялись; отдельный controls smoke в этой итерации
  не запускался.

Источники зафиксированы в
`/tmp/rollapp-mixed-conversion-tested-sources.json` (21 SHA256).
Отдельная расширенная матрица — 8 PASS, код 0:
`/tmp/rollapp-mixed-conversion-cells-focused.log`; после неё уточнён выбор
внешних toggle для группы с вложенными блоками, покрытый unit-тестом и финальной
регрессией. Размеры: 320×844, 390×844, 390×400, 768×844, 820×844, 1024×844,
1440×844, 1920×844. Новая матрица включена в `npm run test:text-edit`.

Проверяется группа с разными цветами и inline mark: h2, текст, bulleted,
h4, quote, numbered, todo, code и toggle; Undo/Redo, exact save/reload,
публичное чтение, столбец без изменений соседей, прямое/обратное выделение
через два фиксированных ответа, отсутствие frames/root overflow. Для кода
отдельно проверяются цвет, тип и Undo; это не утверждение сохранения bold в
plain code. Fixtures отклоняют API-запросы; сохранения выполняются только там.

Живая career/about проверена через configured production connection:
один editable editor, Ctrl/Cmd+/ → heading 2 → Escape без применения команды,
border 0 / outline none / shadow none, root без overflow при ширине 1280px.
Временная вкладка закрыта; persistent connection оставлена работающей.

## Остаток исходной цели

Это не доказательство полного совпадения с Notion. Остаются непоследовательное
выделение, произвольное вложение/границы, все сочетания унаследованных текстовых
и фоновых стилей при изменении контейнеров, обратные преобразования сложных
toggle, media, ручки/drag/рост таблиц и полный clipboard-аудит через ответы.
Реальные iOS/Telegram keyboards и IME не проверены. Полный R1–R10 contract сохранён.

Ориентир: [Notion writing and editing basics](https://www.notion.com/help/writing-and-editing-basics)
и [customize and style](https://www.notion.com/help/customize-and-style-your-content).
