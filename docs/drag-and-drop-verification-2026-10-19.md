# Drag-and-drop: отладка и проверка 19–20 октября 2026

Исходный commit: `d116857ce0aadfeb4e1258fdb1a3ae2abf5e958f`. На входе worktree чистый; результат — незакоммиченные изменения поверх этого SHA. Финальный JSON `docs/drag-and-drop-final-audit-2026-10-20.json` содержит результаты, неуспешные попытки и SHA-256 исходников. Это не проверка отдельного чистого релиза.

## Исправления

- Wishlist объединял карточки по hover до задержки/подтверждающей подсветки. Теперь требуется подтверждённая цель той же сессии.
- Добавлена отмена pointer-переноса Wishlist/учебных коллекций по Escape; отмена после перестановки возвращает точный порядок без записи. Отпускание группы вне исходной сетки тоже отменяет перенос.
- Click после Escape и позднего pointerup мог открывать карточку: ранний таймер снимал защиту. Общий guard сохраняет подавление до отпускания исходного pointer.
- Preview в body терял контекстные CSS-правила и прыгал к центру указателя. `createCardDragPreview` сохраняет вычисленные стили, размеры и точку захвата, удаляет повторные id/data-идентификаторы, делает клон inert/aria-hidden. Очистка не удаляет чужие preview.
- Учебные коллекции и тренировки получили отдельную 48px touch-ручку с `touch-action: none`; остальная карточка сохраняет скролл. Scope/access cancellation и синхронный busy guard предотвращают посторонние и повторные операции.
- Поздняя ошибка reorder после смены учебного списка больше не восстанавливает старые карточки в новом `scopeKey`.
- Календарь принимает drop только из собственной активной сессии неизменного источника; MIME/id сами по себе недостаточны. Resize/range отслеживают pointerId и отменяются по Escape, blur, capture loss, смене данных.
- Kanban pointer-перенос отменяется также при capture loss, скрытии страницы и смене tasks.

## Основные результаты

| Команда / область | Результат |
| --- | --- |
| `npm test` на финальном коде | PASS, exit 0: 715 pass, 1 штатный skip, 0 fail |
| `npm run test:ui` | PASS: 37 upstream primitives, 75 application JSX sources |
| `npm run test:drag-drop` | PASS: 80 групп, все 320/390/767/768/820/1024/1440/1920, включая 820×450; mouse/CDP touch, reorder/grouping, отмена, rollback, capture/access, поздняя ошибка после смены списка |
| `npm run test:kanban` | PASS, полная desktop/mobile/short/touch матрица, edge-scroll, меню, busy/ошибка сохранения |
| `npm run test:controls` | PASS, вся матрица, 48px DOM и видимые границы, 20px glyph, 18/28, screenshot-pixel/DPR 3 |
| `test:details`, `test:dates`, `test:form-actions` | PASS, полные матрицы; dates прошёл отдельный полный повтор без изменения native click/assertions |
| `test:navigation`, `test:action-rails`, `test:todo` | PASS, полные матрицы |
| `test:form-pages`, `test:catalog-page`, `test:wish-groups`, `test:drawers` | PASS, полные матрицы |
| `test:identity-reports` | PASS в полном повторе: Hogan/Gallup, charts и chart navigation; первая попытка была timeout |
| `npm run build` | PASS на финальном коде приложения |
| `npm run test:planning:production` | PASS 2/2, только BEGIN/ROLLBACK, без инициализации/миграций |
| `npm audit`, `npm audit --omit=dev` | 7 high только dev-цепочка shadcn → braces; production 0 |

DnD JSON рядом содержит все 80 PASS. Изменённые views просмотрены по desktop/mobile screenshots; реальные mouse/touch жесты выполнялись в Chrome, API в fixtures запрещены. Это несохранённые presentation props, а не подмена production базы.

## Редактор: точная граница проверки

Нативные полные матрицы `--list-drag-only`, `--drag-guards-only`, `--table-handles-only`, `--table-axis-guards-only`, `--table-wide-only`, `--column-contexts-only`, `--relocation-depth-only` — PASS, exit 0, без viewport-фильтров. Проверены реальные block/row/column moves, capture/edge-scroll, structural/access/source guards, вложенность, точные данные и Undo/reload.

Image resize прошёл все восемь предусмотренных viewport-сценариев внутри полного editor retry: native edge/touch capture, восемь отмен, parent/chrome/panned bounds, вложенные владельцы, protected questions/draft/retry/public read и Undo/Redo. Позднейший отдельный повтор также прошёл до 1440px, но остановился **до появления редактора** при загрузке следующей fixture для 1920px. Его exit 1 сохранён, не заменён зелёным статусом.

**Полный `test:text-edit` и единый `check:comprehensive` не получили exit 0.** Последний полный editor retry после успешного resize и части image-contexts остановился по `page.goto` timeout; DOM был `interactive`, root пуст, до исполнения проверяемого взаимодействия. Полная editor-матрица, остальные сложные clipboard/reader-композиции и cold fixture startup не подтверждены. Отдельные drag-проверки не объявляются заменой полного editor suite.

## Проверочный стенд и неуспешные попытки

Установлено `npm ci` из существующего lockfile. Параллельные проверки других checkout занимали общие порты; чужие процессы не останавливались. Добавлен проверяемый `ROLLAPP_SMOKE_PORT_OFFSET`, default-порты сохранены. Финальные независимые команды использовали offset 1000; фильтры ширины/case сбрасывались. Проверены default/смещённый/некорректный TCP-диапазон и синтаксис runners.

Первоначальные comprehensive-попытки останавливались на занятых портах или таймаутах native click/locator screenshot/загрузки fixture. Для фиксированных контролов screenshot теперь снимает видимый clip без предварительной scrollIntoView; сохраняются assertions о неизменности координат, 48px и цвете крайних пикселей/DPR 3. Примитивы и сами контролы не менялись. Fixture редактора предварительно импортирует модуль, сохраняя production React.lazy и код редактора; это убрало гонку с поздним module fetch, но не устранило все последующие navigation timeouts.

В `docs/drag-and-drop-independent-checks-2026-10-20.json` сохранена исходная очередь, включая два failed-этапа; успешный identity retry и отдельные native/editor результаты приведены в финальном JSON. Неуспешные попытки не скрыты и не выданы за общий PASS.

`npm audit fix --dry-run` сохранял 7 dev high; несовместимый downgrade shadcn не применялся. Для [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) опубликованного patched release нет. Lockfile не менялся.

## Production и оставшиеся ограничения

Production dev-сервис поднят с существующими настройками основного checkout, секреты не включены в diff. API `8080` и frontend `5172` проверены как процессы текущего worktree. `dev:keepalive:status` подтверждает готовность; соединение оставлено работать. Инициализация/миграции/очистки не запускались. Постоянные пользовательские перестановки и тестовые загрузки в production не выполнялись.

Живая существующая Comet-сессия прочитана без сохранения данных; дальнейшее управление прервалось изменением окна пользователем и timeout CUA. Полная live production-матрица, физические iOS/Android touch и real-device IME не подтверждены. CDP touch не является проверкой физического устройства. Развёртывание не выполнялось.
