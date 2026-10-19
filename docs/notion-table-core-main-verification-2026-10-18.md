# Объединённые команды и таблицы — 18 октября 2026

HEAD `710457583a873ce56b93d4eb26849731164f5b2d`, dirty. [JSON](notion-table-core-main-verification-2026-10-18.json). Main snapshot605 sources.

В main перенесены Cmd/Ctrl+Enter tasks/toggles, shared reload-depth guard и проверка допустимости drop guide, hover table row/column handles, native pointer guides/moves и команды через старое Ctrl/Cmd+/ меню на mobile/desktop. Позиционные headers, spans bands, cell attrs/children/marks, separate Undo и exact reload проверены; permanent toolbar/рамки редактора не добавлялись. Общее управление блока скрывается сразу, без visibility transition у дочерних кнопок.

Предыдущий main snapshot595 прошёл все9этапов comprehensive,195 editorPASS,
drift0. Isolated current-action full editor203PASS, snapshot604 drift0. Safety
candidate653unit/652PASS/1SKIP +21targeted browserPASS. Table candidate656unit/
655PASS/1SKIP, UI/build0,27targeted browserPASS, snapshot611 drift0. Controls
isolated exit0/132records имели264font403 из symlink dependencies; это только
геометрические наблюдения, обязательна повторная проверка в main с реальными
шрифтами. Временные fixturefs.allow/realpath, диагностические скрипты и старые
chart-only отличия не копировались. Существующие main chart/menu fixes сохранены.

Новый main `check:comprehensive` ещё запускается: ожидается216 editorPASS и9этапов.
Он не считается пройденным заранее. Прежние результаты относятся только к своим
snapshot. Service22680 остаётся включённым с configured production directTLS;
fixture API requests запрещены и production test data не записывались.

Цель открыта: R8 duplicate/grow/media и horizontal autoscroll/header composition,
произвольные row groups, nested Enter, clipboard/styles и реальный touch/IME ещё
требуют работы. Ни эти27сценариев, ни зелёный предыдущий baseline не закрывают всю цель.

На основном source605 прошли9axis+2guards+8current-action+2depth=21targeted browserPASS (sequence59577 exit0), unit656/655PASS/1SKIP/0FAIL, UI37primitives/69JSX и132controlPASS с DPR3 и fontServingDenials0. Drift0. Новый comprehensive33199 всё ещё выполняется; ожидается216editorPASS. Его session опрашивает controller2022.

Объединённый main comprehensive terminal: **superseded**, exit143, editorPASS99, source605 drift[], added[], fontDenials0. Этапы: check:release=interrupted, test:navigation=not-run, test:action-rails=not-run, test:identity-reports=not-run, test:todo=not-run, test:form-pages=not-run, test:catalog-page=not-run, test:wish-groups=not-run, test:drawers=not-run. Это доказательство snapshot605, не всей цели Notion.

Уточнение fixture: The initial app-chrome fixture incorrectly combined app-page and sphere-text-page on one element. That text-overlap evidence was fixture-only. Correct nested composition still reproduces the header-selector occlusion on source605. The provisional x=0 gutter change was reverted; production container widths and gutter8 remain unchanged.
