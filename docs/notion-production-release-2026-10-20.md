# Единый выпуск inline editor — 2026-10-20

Итог этого предыдущего выпуска: production/main
`95223417bdd06683875ef7cf273ecab599270779`, CI39402041896 terminal success
(Test/build, immutable image, metadata deploy, exact health, Telegram configure).
Exact public health повторно подтверждён перед caption release. Live UI включал
редактор на8 размерах и unsaved To Do thumbnail flow без создания задачи;
новый caption-кандидат проверяется отдельно:
[captions417/comprehensive10](notion-image-caption-verification-2026-10-20.md).
Далее сохранён исторический ход подготовки952, включая pending формулировки
на момент записи; они не описывают текущее состояние production.

Пользователь разрешил push/deploy и согласование одного rollout с чатом
«Отладь все drag-and-drop». Выпуск ведётся из текущего чата; второй чат сохраняет
свои результаты, не отменяет CI и не меняет production. Все изменения чужой
рабочей копии сохранены, managed dev PID10724 продолжает работать в905f.

## Проверяемый состав

- Frozen `449abb514656db0a12548e9ce5435b7ae1677ca2`, clean at start:
  984 tracked inputs, SHA256 drift0 и clean после всего comprehensive. Полный `check:release`
  PASS/exit0, включая409 editor cases и все обязательные controls/forms/date/UI
  проверки. Десятистадийный `check:comprehensive` завершён PASS/exit0:
  release, navigation, action rails, identity reports, To Do, native form pages,
  catalog pages, Wishlist groups, drawers и contacts; фильтры матриц не применялись.
- Кандидат `508d3e4b6dabe05e5692c7d2b1f4ccd58e01ca7e` clean перед отчётом:
  alignment511 + интегрированный main543 + startup guard268 + test waits819.
  Относительно449 нет изменений `src`, `shared`, `server`, package/lock;
  только deploy guard/документация/его unit и два UI-harness ожидания.
- Fresh `npm ci`, `npm test`:790 total/789 PASS/1SKIP/0FAIL; `npm run test:ui`:
  37 primitives/79 JSX PASS; `npm run build`:PASS. Bundle size warning остаётся.
  Изменённые harnesses отдельно прошли полные styles10/four-document8, exit0,
  на свежих раздельных Vite cache directories без фильтра ширин.
- У449 установлен shadcn CLI4.22.0, а свежий lock-кандидат использует4.22.1.
  Остальные root package versions совпадают; импортированный
  `shadcn/dist/tailwind.css` и58 production build files побайтово идентичны.
  Это не объявляется точным locked install449; финальный кандидат проверен
  свежей установкой, итоговая CI также начинает с `npm ci`.

## Смежные проверки

- Tiny alignment10 и resize8 PASS: реальные first pointer/capture/hit areas,
  обе ручки, exact attrs/history/save/public reload; dark/mobile/short/DPR3.
- To Do53 и Contacts8 PASS на449. «Готово» переносит выбранные snippets с
  миниатюрами в черновик задачи; проверены removal/wrapping/canonical payload.
- Production planning2/2 PASS: только rollback-scoped проверки, без schema init,
  миграций или сохранённых test fixtures. Ненастроенная worktree connection
  сначала явно отказала; затем использована настроенная production connection,
  без mock/demo fallback и без вывода секретов.
- `npm audit`:7 high в dev-only CLI chain; `npm audit --omit=dev`:0.
  Несовместимые downgrade/force не применялись. Runtime image omits dev deps.

## Безопасность production

Обычный Compose теперь задаёт `ROLLAPP_DATABASE_INITIALIZATION=verify`.
READ ONLY existing-schema validation PASS, migrations0, последующая обычная
transaction read-only=off. Official cloud checkOnly PASS, writeRequests0.
Это защита релиза UI от неавторизованных startup migrations/backfill/cleanup,
а не изменение схемы. Детали —
[отчёт startup guard](production-existing-schema-release-verification-2026-10-20.md).

До публикации production healthy наd116857; VM identity/rollback подтверждены,
7.5GB free. Ни restart, ни image cleanup не выполнялись. Старый543 workflow
дважды остановлен до cloud steps после проверки их pending состояния; он не
содержит startup guard. Superseded268 workflow39394498137 остановлен во время
Test/build, все cloud steps были pending; terminal cancelled. Pending819
workflow39399359193 и старый pendinge579 workflow39388109552 также terminal
cancelled, jobs ещё не создавались. Эти прогоны не выполняли deployment.
Финальный SHA, terminal CI и affected live UI будут проверены перед объявлением
выпуска завершённым. Этот раздел пока не является свидетельством deployment.

## Воспроизводимые доказательства

- `/tmp/rollapp-notion-alignment-integrated-v2-comprehensive-2026-10-20.{log,json}`
- `/tmp/rollapp-notion-alignment-integrated-v2-sources-2026-10-20.json`
- `/tmp/rollapp-notion-final-release-refined-{unit,ui,build}-2026-10-20.log`
- `/tmp/rollapp-notion-final-{style,four}-2026-10-20.log`
- `/tmp/rollapp-notion-final-release-output-equivalence-2026-10-20.json`
- `/tmp/rollapp-notion-release-{todo,contacts}-precheck-2026-10-20.log`
- `/tmp/rollapp-notion-release-planning-configured-production-2026-10-20.log`

Ранее прошедший parentbc7 full399/nine-stage comprehensive и baselinee744
full375 являются историческими, не заменяют новый409/ten-stage. Старые timeout,
palette820, reverse paste Undo1024 и occupied5298 failures сохранены в прежних
отчётах; прохождение новых проверок не доказывает причину каждой старой гонки.

Полное равенство Notion не объявляется. Rich captions/viewer/прочие media,
произвольные сложные композиции и actual-device iOS/Telegram/IME остаются
открытыми в [R1–R10](notion-text-experience.md). Использование frontend-design
сохранило существующие Geist18/28,48px controls и минимальный prose UI;
отдельного редизайна и рамок редактирования не добавлялось.
