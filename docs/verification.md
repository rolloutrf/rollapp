# Регламент проверки Rollapp

Этот документ — действующий порядок проверки и выпуска. `AGENTS.md` задаёт обязательные правила работы; отчёты `docs/*audit*` и датированные verification-документы фиксируют прошлые проверки, а не заменяют текущие контракты.

## Источники UI-контрактов

Фото препаратов: [medication-photos.md](medication-photos.md).
`npm run test:medication-photos` входит в release gate; production-поле image_url
добавляется только отдельной явно разрешённой миграцией
`node scripts/migrate-medication-photo.mjs --apply` (без --apply — READ ONLY).
Обычный startup/deploy использует verify и не меняет схему.

Общая карта владельцев, граница upstream shadcn и продуктовых композиций,
а также порядок централизованного изменения: [design-system.md](design-system.md).

В «Характере» быстрое добавление содержит только поле «Черта». Название своей
черты открывает детали через общий form-surface: справа на десктопе, нативная
страница формы на телефоне. Название и личное описание сохраняются вместе с
текущим выбором в существующий identity/character документ; отмена не пишет данные,
ошибка сохраняет набранные поля для повтора. Checkbox остаётся независимым от
открытия деталей. Реальная форма входит в полную матрицу `test:drawers` как
`character-trait`; ширина раздела и шторы использует `--layout-form-width`.

Задачи To Do используют общий TaskEditor: после «Описания» идут независимые
необязательные многострочные поля «Ожидаемый результат» и «Факт» (до5000 знаков).
Общий planning API сохраняет их как expectedResult/actualResult; смена статуса,
списка и представления не очищает их. Старая задача получает пустые значения.
`test:todo` проверяет legacy/cancel/retry/save/reopen/clear и геометрию на320–1920px
и коротких окнах; `test:planning:production` — API/owner/space isolation сROLLBACK.
Для первого подключения нужна отдельно разрешённая additive миграция
`node scripts/migrate-planning-results.mjs --apply` (без --apply только READ ONLY).
Она добавляет только expected_result/actual_result TEXT NOT NULL DEFAULT ''; обычный
verify startup проверяет их через LIMIT0, не создаёт и не изменяет записи.

Заметки: [planning-notes.md](planning-notes.md). `npm run test:notes` проверяет
новую поверхность на восьми размерах и входит в `check:release`. До первого
запуска требуется отдельно разрешённая миграция `planning_notes`; read-only
проверка — `node scripts/migrate-planning-notes.mjs`, применение после разрешения —
та же команда с `--apply`. Обычный verify startup таблицу не создаёт.
После миграции выполнить `npm run test:notes:production`: HTTP CRUD, owner isolation,
Unicode payload и media guards на production PostgreSQL с обязательным ROLLBACK,
без DDL и инициализации схемы.
`npm run test:notes:production:ui` дополнительно открывает настоящий dev frontend
на всех восьми размерах; session/notes API идут в ту же production rollback-only
транзакцию. Нужен готовый keepalive; адрес можно задать `NOTES_TEST_BASE_URL`.

| Область | Реализация | Документация |
| --- | --- | --- |
| Текст и семантические роли | `src/typeset.css`, токены `src/index.css` | `docs/typography.md` |
| Отступы, навигация, размер контролов | `src/spacing.css`, `ControlBar`, `PageActionButton` | `docs/spacing-system.md` |
| Максимальные ширины | `src/containers.css` | `docs/container-system.md` |
| Порталы, safe area, клавиатура | `src/overlays.css`, `use-visual-viewport.js` | `docs/mobile-overlays.md` |
| Мобильные формы и действия | `MobileFormPages`, `MobileFormFooter`, `ContentPageActions` | `docs/mobile-overlays.md` |

При изменении контракта синхронно обновлять реализацию, соответствующий документ, `AGENTS.md` и проверку поведения. Новый локальный CSS не должен переопределять общий контракт ради одного экрана.

## Безопасная последовательность

Подсказки пустых блоков: default `test:text-edit` дополнительно выполняет
8 случаев `text-placeholder-checks.mjs` (433 records вместо425 до Enter-итерации). Нативные клики
между соседними пустыми/заполненными абзацами оставляют только текущую подсказку,
ограниченную одной строкой, без document/save/API writes. Пустой блок кода
сохраняет свои внутренние отступы и видимые glyphs. Диагностический
`--surface-only` включает эти случаи, но не заменяет полную матрицу.

Мобильный Enter: default `test:text-edit` также выполняет 8 случаев
`text-mobile-enter-checks.mjs` (441 records суммарно). Проверяется нативный
DOM-first `insertParagraph` без keydown, а не только desktop press Enter:
точное разделение текста/диапазона, курсор, Undo, ввод и save/reload.
`--mobile-enter-only` — диагностика; отдельный WebKit с iPhone UA не является
проверкой настоящей экранной клавиатуры/IME. Воспроизводимая дополнительная
диагностика: `npx playwright-core install webkit`, затем
`node scripts/text-edit-smoke.mjs --mobile-enter-webkit`.
После исправления требуется
новый полный comprehensive на новом SHA, старый audit не разрешает выпуск.

Rich captions: `--image-captions-only` — diagnostic8 viewports, не release
gate. Общий default `test:text-edit` включает captions перед baseline409 и
давал417 PASS records до viewer-итерации. Теперь общий default также включает
8 viewer cases (425 суммарно); `--image-reader-only` проверяет viewer и rich
reader на восьми размерах, но остаётся diagnostic. `check:comprehensive` сохраняет все11 этапов без
фильтров. Targeted captions/alignment/resize разных dirty snapshots нельзя
складывать в полный PASS. Подробности и непроверенные случаи:
`docs/notion-image-caption-verification-2026-10-20.md`.

1. Прочитать `AGENTS.md`, проверить `git status --short`; сохранить чужие незакоммиченные изменения. Записать SHA и наличие dirty-файлов, чтобы результат не выдавался за проверку чистого релиза.
2. Проверить `npm run dev:keepalive:status`. На этом Mac постоянный сервис использует настроенный production PostgreSQL по TLS. При сбое восстановить соединение, не подменять БД. Ограничение sandbox на `ps`/`lsof` требует повторения с разрешениями и не означает устаревший PID. После проверки сервис оставить работающим.
3. Запустить `npm run check:comprehensive`. Он последовательно выполняет полный безопасный набор ниже, сбрасывает фильтры частичных матриц и останавливается на первой ошибке. Путь к JSON-отчёту печатается в начале; `ROLLAPP_CHECK_OUTPUT=/absolute/path/report.json` задаёт своё имя. Отчёт содержит SHA, dirty-флаг, версии Node, коды завершения и длительность этапов; приватные данные приложения в него не попадают.
4. Проверить живой UI в существующей сессии с production API. Открытие, выбор вкладок, скролл и отмена форм допустимы. Не сохранять тестовые данные, не отправлять сообщения, не выполнять оплату или удаление пользовательских записей. Для входа без авторизации использовать отдельную сессию/локальный клиент с той же настроенной production API; не переносить cookies между origin.
5. При необходимости проверить планирование командой `npm run test:planning:production`. Проверить точную настроенную БД/роль; все временные записи только внутри `BEGIN` → `ROLLBACK`, с ограничениями ожидания блокировок и выполнения запросов. Проверка не запускает миграции/инициализацию схемы. Не включать другие mutating integration-флаги без чтения сценария и проверки его границ отката.
6. Выполнить `npm audit` и отдельно `npm audit --omit=dev`: различать инструменты разработки и зависимости рабочего образа. Проверять advisories по первоисточникам, обновлять совместимые версии и lockfile, затем повторять затронутые проверки. Не запускать `npm audit fix --force` и не откатывать shadcn на несовместимую старую версию ради зелёного счётчика.
7. Записать найденные проблемы, исправления, выполненные команды, результаты и ограничения в датированный отчёт. `git diff --check`; просмотреть diff перед фиксацией. В итоговом сообщении сообщить фактический результат и оставшиеся ограничения.

На Mac закрытие крышки может прервать даже loopback-загрузку Chromium с
`ERR_NETWORK_IO_SUSPENDED`; пустой fixture после сна не доказывает дефект UI.
`caffeinate -i` защищает только от idle sleep, не от закрытия крышки. Для
непрерывного полного прогона можно отправить проверяемую ветку и выполнить
`gh workflow run deploy-yandex-cloud.yml --ref <ветка>`: веточный manual job
запускает весь `check:comprehensive` и сохраняет JSON/log artifact. Он имеет
только contents:read и не публикует приложение; production job разрешён только
для main и сохраняет обязательный release gate. Интегрировать затем тот же SHA.

Бейджи общих медиакарточек: `npm run test:snippet-badges` входит в release-набор. Проверяет реальную WorkoutCard на восьми размерах с mouse/touch и author/reader: статус целиком внутри медиа, без пересечения с 48px drag handle. Общий контракт — `docs/drag-and-drop.md`.

## Команды

`npm run test:time-inputs` входит в `check:release`: общий `Input type="time"`
в `Field` и одно-/двухколоночной сетке на 320/390/768/820/1024/1440/1920px
и 390×400, WebKit и Chromium (16 случаев), mobile DPR 3. Проверяет края
каждого поля относительно Field и страницы, 48px, ввод и сохранность соседнего
значения, отсутствие API, ошибки и opt-out из iOS native appearance.
Установка WebKit: `npx playwright-core install --with-deps webkit` (также в CI).
Это изолированная композиция общих контролов, не полная форма сна. macOS WebKit
не воспроизводит iOS RenderTheme; реальный iPhone/Telegram требует отдельной
проверки. Результат comprehensive не означает покрытие всех платформ/экранов.


`npm run test:lab-results` входит в `check:release`: реальный `LabReportPanel`,
первое раскрытие и повторное открытие, все четыре края внешнего 1px ring карточек
относительно clipping ancestors, пиксели верхней/нижней линии и отсутствие
горизонтального переполнения. Матрица: 320/390/768/820/1024/1440/1920px и 390×400,
светлая/тёмная темы, DPR 1/3 (32 случая). UI fixture запрещает API-запросы.
Внутри обрезающего аккордеона внешний ring требует запаса со всех четырёх сторон;
одного горизонтального padding недостаточно. Upstream Card/Accordion не менять
ради этой композиции.


| Команда | Назначение |
| --- | --- |
| `npm test`, `npm run test:unit` | Только тесты без БД; runner исключает integration и старые memory-fixtures, проверяет прямые импорты БД |
| `npm run test:text-edit` | Полная матрица inline-документов: ввод без рамок, selection toolbar, блоки/группы, символы, стили/цвета, save/reload, очереди/draft/retry и доступ. Включает native clipboard и буквальные Markdown/HTML/whitespace в строчном коде, отдельный Undo и сохранение соседей; единый редактор четырёх ответов со сквозными диапазонами, фиксированными вопросами и общей историей. Block-colour матрица включает slash/palette, группы/ячейки/диапазоны через ответы, пустой блок/Enter/type, exact reload/public read, HTML clipboard, draft/retry, общий browser preference и его отказ, read-only/viewport. Slash-матрица проверяет команды в существующем тексте, middle-of-line/Shift+Enter, dismissal/clipboard/history guards, атомарные duplicate/delete/type, cell/four-answer scope и panning. Табличная матрица включает команды, merge/split, native resize, spans/ширины/вложенные блоки, public read, draft/retry и отзыв доступа во время drag. Контракт: `docs/inline-editing.md` |
| `npm run check`, `npm run check:release` | Unit, UI-контракты, геометрия контролов, detail actions, даты, события календаря, синхронность Back/Save, редактирование текста, Drag-n-Drop канбан-колонок, трекеры сна/питания, production build; этот же набор обязателен в CI |
| `npm run check:comprehensive` | Release-набор плюс все расширенные UI-проверки ниже; без запросов к API/БД |
| `npm run test:navigation` | Верхняя/нижняя навигация, полноширинные меню, safe area, короткий экран и клавиатура |
| `npm run test:action-rails` | Центрирование, динамические действия, оба края горизонтального скролла и вертикальный скролл |
| `npm run test:drag-drop` | Wishlist, группы, коллекции, публичный список владельца и календарь: порядок/отмена/rollback, подтверждение группировки, native mouse и touch handles на 8 ширинах; входит в `check:release`. Контракт: `docs/drag-and-drop.md` |
| `npm run test:kanban` | Перетаскивание колонок: короткие/пустые/свёрнутые списки, промежутки, начало/конец, edge-scroll, отмена и ошибка сохранения, touch и меню на телефоне; входит в `check:release` |
| `npm run test:contact-notes` | Выбор/удаление участников, поиск/ошибка/пустой результат и сохранение формы встречи; отдельные личные заметки и история To Do в настоящей форме контакта, 320–1920px и короткие экраны; несохранённые props, API запрещён; входит в `check:comprehensive` |
| `npm run test:todo` | Пустой/длинный To Do, дата, создание и отмена отдельной страницы задачи, mobile/desktop ribbon, два нативных submit в одном кадре → одно сохранение после commit, canonical related references |
| `npm run test:form-pages` | Все реальные формы на телефоне, desktop Drawer, история, вложенный черновик, busy/Enter guards; восстановление прокрутки исходного документа через page/browser Back без последующих скачков |
| `npm run test:catalog-page` | Независимый экран карточки каталога, reload, Back, скролл до конца |
| `npm run test:contacts` | Бесконечная лента реального ContactsSpherePage: добавление страниц без перемонтирования, ошибка/повтор, конец списка, кадры прокрутки при избранном, отказ сохранения, фильтры и устаревшие ответы; 320–1920px и короткий desktop. Только явный UI transport, реальные API запрещены. |
| `npm run test:wish-groups` | Реальные карточки групп Wishlist: троеточие в длинных названиях, границы текста и счётчика, клавиатура, отмена переименования, owner/read-only на полной матрице |
| `npm run test:identity-reports` | PDF-содержимое Hogan/Gallup без добавленных интерпретаций, заголовки/абзацы/списки/таблицы, исходные диаграммы и сегменты, точная длина полос 0/37/100, пустые/полные сегменты, типографика 18/28, перенос длинных строк и отсутствие переполнения на 320–1920 px и 390×400; без запросов к API/БД. Контракт: `docs/identity-report-charts.md` |
| `npm run test:drawers` | Реальные формы и оставшиеся overlay-композиции, фокус, touch, dismiss, keyboard/panning, снятие scroll lock |
| `npm run test:calendar` | События календаря на 320/390/768/820/1024/1440/1920 px при высоте 900/400: видимые названия, точная 15-минутная геометрия, формы/дубликат/удаление, ошибки/retry, исходная дата серии и отсутствие времени, resize/Undo/Escape/range/drag, native touch-перенос обычного события и времени серии (sourceId/исходная дата/одна запись/cancel), mouse-перенос серии и клавиатурное открытие после отмены, четыре вида без root overflow. Fixture блокирует API; входит в `check:release` |
| `npm run test:health` | Сон/питание: меню, автоматическая сегодняшняя плашка/смена дня и история сна без календаря/добавления; питание как To Do с общей лентой/мобильной строкой, галочками/итогами и composer, формы, черновик/retry, вложенная дата/Back, создание/удаление, read-only и геометрия 320–1920px/короткие окна; API запрещён. |
| `npm run test:health:production` | Реальные CRUD-маршруты сна/питания на настроенном production PostgreSQL: reload, изоляция владельца/трекера. Только отдельная BEGIN → ROLLBACK транзакция, без инициализации схемы; отсутствие временных записей проверяется после отката. |
| `npm run test:planning:production` | Проверки API и изоляции владельцев на настроенном production PostgreSQL, с откатом |

Расширенные UI-сценарии запускают временные Vite-серверы на loopback и настоящий Chrome с production CSS. Они передают несохранённые props компонентам и отклоняют все `/api/` запросы. Это проверка представления, а не замена production БД. Нужен установленный Chrome/Chromium; `CHROME_PATH` задаёт executable. `node scripts/check-comprehensive.mjs --list` выводит этапы без запуска.

Общие smoke entry points используют `scripts/smoke-server.mjs`: по умолчанию
bind `127.0.0.1:0` атомарно получает свободный порт, а URL вычисляется из реального
адреса после listen. Не искать свободный фиксированный порт с последующим
освобождением и не останавливать чужой listener ради проверки. Явные диагностические
`*_TEST_PORT`, `TEXT_EDIT_PORT` и `FORM_ACTION_PORT` сохраняют strictPort: ошибка
занятого/некорректного порта остаётся видимой, без перехода на чужой сервер.
Это изоляция портов независимых worktrees, а не разрешение параллельно использовать
один Vite cache. Кэши разных worktrees/диагностик должны оставаться раздельными.
Матрицы размеров, API guards, screenshot/DOM assertions и состав release/comprehensive
не сокращаются; collision/owner guards входят в `npm test`.

Лента контактов также использует атомарный loopback port0 и фактический адрес
своего listener; `CONTACTS_PORT` задаёт только строгий диагностический override.
Она не занимает фиксированный dev-порт5196. Drawer smoke при невалидной геометрии,
включая отсутствующий popup, сохраняет screenshot и bounded DOM/focus/open-event/
network diagnostics. Наблюдатели не меняют ожидания, фокус или assertions.

Не запускать общий `node --test` или исторический `npm run test:visual` в качестве обычной проверки: они включают старые сценарии с memory-серверами или сохранением данных. `npm test` и `npm run check` перенаправлены на безопасные наборы. Индивидуальные smoke-фильтры годятся для диагностики, но не заменяют полный итоговый прогон.

Основные browser smoke-серверы используют `scripts/smoke-server.mjs`: ОС атомарно выделяет свободный loopback-порт, а URL выводится из фактически открытого listener. Для диагностики можно явно задать поддерживаемый `*_PORT`; занятый порт должен завершиться ошибкой, без остановки чужого процесса. DnD и оставшиеся legacy runners поддерживают отдельный диапазон через `ROLLAPP_SMOKE_PORT_OFFSET`; это не меняет API/production dev-сервис и не сокращает матрицу. Проверки разных checkout не должны обращаться к fixture-серверу соседа.

На macOS Chrome может завершить все сценарии, но зависнуть в `browser.close()` из-за orphan crash-handler/GoogleUpdater, удерживающего stderr pipe. Общий launcher расширенных проверок использует только для принадлежащего тесту Chrome флаги `--disable-crashpad-for-testing` и `--disable-updater-scheduler` ([Chromium switches](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/chrome/common/chrome_switches.h)). При повторении проблемы `PASS` в логе ещё не означает exit 0. Сначала проверить точный тестовый Node PID, отсутствие живого headless Chrome и через `lsof -U` сопоставить его peer socket с FD 2 осиротевшего helper; сверить время запуска/PPID. Допустимо завершить только доказанно принадлежащий тесту helper, после чего дождаться кода завершения. Не использовать общий `pkill Chrome/Node` и не завершать пользовательские браузеры или постоянный dev-сервис.

## Матрица UI и критерии приёмки

Проверять 320/390 px portrait, границы 767/768 и 820 px, 1024/1440/1920 px; для планирования и overlays — также высоту менее 500 px. Дождаться окончания загрузки и шрифтов. Смотреть DOM-геометрию и реальные скриншоты. Переполнение проверять у документа и потомков; намеренные board/list scrollers должны оставлять весь контент достижимым.

- **Контролы:** один `--layout-control-size: 3rem` (48 px), без mobile/desktop переопределений; круглые иконки 48×48, glyph 20 px, текст 18/28. У filled/outline совпадают видимые границы, что проверяется пикселями скриншота при DPR 3. Disabled-контролы используют сплошной muted-фон и muted-текст, сохраняя `opacity: 1`; контент не просвечивает сквозь закреплённые действия. Calendar tabs и внешний rail — 48 px без добавочной рамки padding. Calendar cells, аватары, контентные строки и многострочные семантические элементы имеют отдельные роли.
- **Шапка и меню:** прозрачная общая подложка, непрозрачные кнопки. До 768 px основные переключатели внизу; меню сфер/разделов/планирования занимают ширину между полями страницы и раскрываются вверх. Все действия доступны без пересечений и обрезки.
- **Панели действий:** группа центрирована, пока помещается; на телефоне горизонтальный viewport достигает обоих краёв. При переполнении доступны начало и конец с равными полями. Эти панели находятся в document flow и скроллятся с текстом; вертикальный скролл не меняет горизонтальное выравнивание.
- **Текст:** одна панель форматирования только при выделении, без постоянной строки, дублирующихся кнопок и пустого места; снятие выделения скрывает её. Проверять привязку к реальному выделению (8px), первое открытие глубоко в документе, единый редактор четырёх ответов, сквозное выделение в обе стороны, прокрутку, уход/возврат за экран и VisualViewport keyboard/panning. Geist Variable, 18/28, общие заголовки и ритм typeset. Для inline-стилей проверять underline/strike/code и их shortcuts, смешанные marks и цвета, независимые фоны фрагментов, сброс/Undo, активный индикатор при keyboard focus, палитру на коротком экране, last-color, сохранение/перезагрузку и публичное чтение в обеих темах. Непрерывный code с частичным оформлением должен сохранять текст, а не показывать Markdown-разделители. Текстовые документы редактируются прямо в странице через `EditableTextBlock`, с автосохранением и восстановлением черновика. Проверять ввод, Enter, undo/redo, slash-команды, символьное форматирование реальным набором (заголовки, списки/задачи, парные знаки, ссылки, код), Backspace/Undo автопреобразования, буквальный код, ссылки, выделение, перетаскивание блоков и Undo, Escape/Shift+стрелки/Shift+клик для групп, Ctrl/Cmd+A по ступеням, перенос/дублирование/удаление и drag диапазона, copy/cut с marks и восстановлением выбора, Tab/Shift+Tab вложенных пунктов, отсутствие рамок и читаемый цвет текста при скрытой нативной подсветке, меню и клавиатурное перемещение, создание через «+»/Alt+«+» и меню, код/разделитель/таблицу с немедленным вводом и отдельным Undo, Tab по ячейкам, преобразование и вложение toggle с сохранением marks/переносов, поиск типов и отмену без записи, заголовки 1–4, списки/чек-листы/toggle и загрузку сохранённого Markdown, задержанные/ошибочные сохранения и общую очередь четырёх ответов; loading/error/read-only не редактируются. Контракт: `docs/inline-editing.md`.
- **Формы на телефоне:** отдельный `formScreen` в истории, скрытый/inert исходный экран, один document scroller. Back + Save + optional Delete находятся в одной fixed-строке, на одной высоте и синхронно двигаются при VisualViewport panning. Submit остаётся в исходном HTML form. Проверять начало/конец и каждый кадр анимированного скролла, клавиатуру, короткий экран, busy, validation, Enter, вложенный экран, оба вида Back и reload. Последнее поле может прокрутиться выше действий. Для контакта проверять полный `contact-detail-drawer` с правым Drawer, шапкой, фото и принадлежащим форме `ScrollArea`; нижние действия — его сосед вне прокрутки: вложенный viewport не скроллится, добавление ссылки не сдвигает действия; Back/Save/Delete сохраняют геометрию в каждом кадре прокрутки вверх и вниз.
- **Удаление:** все кнопки удаления и подтверждения используют `destructive`, включая удаление вложенных полей и фото. Проверять предупреждающий цвет в обычном и hover-состояниях на mobile/desktop; нижний `ControlBar` не должен заменять его нейтральным стилем.
- **Принципы и тезисы:** корзина без видимой подписи находится в общей строке с сохранением, на мобильном — также с Back. Проверять 48×48 px, совпадение высоты кнопок, доступное имя и открытие/отмену подтверждения без вызова удаления; `test:form-actions` включает редактор принципа на полной матрице.
- **Цитаты:** в чтении и inline-редакторе, включая тезисы, нет вертикальной границы слева (`border-inline-start-width: 0px`); курсив, общий отступ и текст 18/28 сохраняются на мобильном и десктопе.
- **Детали:** Back + гибкая акцентная кнопка + optional overflow в одной нижней строке 48 px с gap 8 px. Полные accessible names при компактных подписях; overflow и возврат фокуса работают.
- **Планирование:** одинаковые верхние и нижние контролы. От 768 px единственный селектор пространства находится в общей верхней шапке, как селектор главной страницы; меню открывается вниз. До 768 px селектор остаётся в нижней навигации и открывается вверх. Проверять положение до и после прокрутки и отсутствие дублирования. На телефоне нет круглой ленты дат To Do, наверху Previous/date/Next/Plus; Add открывает общий TaskEditor с выбранной датой и списком. При смене/создании To Do-листа дата сохраняется. На десктопе лента остаётся. Задачи без времени занимают последовательные свободные получасовые слоты, пропуская явные события; проверять отдельные даты, повторения, полночь и полностью занятый день без исчезновения задач. В ежедневном To Do проверить отсутствие промежутка между активными и выполненными, отсутствие фонового hover и последовательные свободные получасовые интервалы для новых задач с 09:00 на мобильном и десктопе. Сравнить время задач без явного часа в календаре и To Do; при открытии редактора расчётный слот не должен заменять исходное отсутствие времени. Calendar tiles целиком интерактивны, независимые действия сохраняют семантику.
- **Выбор даты:** общий shadcn Calendar; desktop Popover, mobile отдельный экран. Русские подписи, timezone-safe ключи, leap day, очистка, клавиатура. Выбор применяется после возврата истории; Back сохраняет черновик родительской формы.
- **Состояния:** данные, пустой список, загрузка, ошибка с retry, длинные подписи, read-only. Проверять keyboard focus и доступное имя у icon-only действий. Повторное открытие не дублирует операцию.
- **Названия групп Wishlist:** одна строка с троеточием на текстовом элементе внутри flex-кнопки. Полное название остаётся в доступном имени и `title`. Заголовок использует ширину карточки; меню над изображением не резервирует место в тексте. Высота метаданных определяется содержимым, счётчик не пересекается с названием и не выходит за карточку.

Живой проход охватывает Wishlist/каталог/store/orders/rolls, друзей, все вкладки identity/career/education/health, три вида планирования, публичный профиль, auth/error pages и затронутые формы/детали. Непроверенные роли, платежи, загрузки файлов, реальные iOS/Telegram keyboards и любые операции сохранения отдельно отмечать как ограничения; эмуляция VisualViewport их не заменяет.

Поиск в меню Ctrl/Cmd+/ проверяется `scripts/text-block-menu-checks.mjs` в составе
`test:text-edit` на восьми размерах: отмена без записи, смена типа/цвета, поиск
действий, отдельный Undo, группы, grip-target, ввод и стрелки, IME guard,
VisualViewport, сохранение/reload и фиксированные вопросы. Диагностический
`--block-menu-only` не заменяет полную регрессию.

Смешанные цвета при смене типа проверяет `scripts/text-block-conversion-checks.mjs`
в составе `test:text-edit`: независимые red/background/default/green с inline mark,
оборачивание/поднятие списков, цитаты, код, групповые toggle, один Undo/Redo,
exact save/reload/public read, столбцы без изменения соседних ячеек и диапазоны
через ответы в обе стороны. `--conversion-only` — диагностический режим,
не замена полному прогону. Чистые unit-тесты включают пустые/одинаковые блоки,
начатую транзакцию, наследование, вложенные списки, существующие toggle и CellSelection.

`scripts/text-selection-paint-checks.mjs` включён в `test:text-edit`: 18 случаев
(светлая/тёмная тема, восемь размеров, дополнительные mobile DPR 3). Сравнивает
реальные glyph pixels девяти цветов до/после выбора, сохранность inline/block/cell
фонов, различимую подсветку, отсутствие frames и неизменность JSON/сохранений.
NodeSelection проверяется на цветном абзаце; изображения этим не покрываются.
`--paint-only` — диагностический режим, не замена полной регрессии.

`scripts/text-sparse-block-checks.mjs` входит в полный `test:text-edit`: восемь
размеров 320–1920 px, включая 390×400. Нативные modified clicks проверяют
Cmd+Shift и Alt+Shift в Chromium с fixture-only navigator.platform; это не
проверка реального Windows. Точный JSON пропущенных блоков, rich marks/цвета,
типы, clipboard, Undo, IME cancel, nested checklist, номера ordered-list,
автосохранение/reload/public read и защита четырёх ответов дополняются unit-тестами.
На desktop проверяется drag и modified grip; native clipboard copy — при 1440px.
`--sparse-only` — диагностический режим; полный прогон обязателен. Ограничения
вложений, mixed-table clipboard и настоящего IME остаются в матрице соответствия.

## Выпуск и восстановление

Обычный production release задаёт в Compose
`ROLLAPP_DATABASE_INITIALIZATION: "verify"`. Backend проверяет существующую
auth/document/planning схему в READ ONLY транзакции, сохраняя reserved-username
guard; отсутствие таблиц/колонок — ошибка запуска без миграции или demo fallback.
Не запускать `initializeDatabase`/backfill/очистку резервирований ради обновления
UI. Изменения схемы/данных выполняются только отдельной явно разрешённой операцией.
Template guard в `scripts/deploy-vm-metadata.test.js` входит в `npm test`/release.

CI обновляет только ключ `docker-compose` через
`scripts/deploy-vm-metadata.mjs`: официальный REST Instance.Get с `view=FULL`,
UpdateMetadata с одним `upsert`, ожидание конкретной Operation.Get и повторная
проверка VM/точного Compose. Загрузка CLI больше не является шагом выпуска.
Проверки VM/folder/runtime-SA, metadata IAM endpoints и отсутствия конфликтующей
container declaration остаются обязательными. Скрипт не перезапускает VM,
не удаляет metadata, не повторяет мутацию после сетевой ошибки и не печатает
токен или Compose. HTTP timeout15s, общий бюджет180s, шаг CI4min.
Флаг `--check-only` делает один проверенный read без записи. Он не доказывает
готовность образа или deployment; обязательная проверка public health exact SHA
остаётся следующим отдельным шагом. Unit-проверки содержатся в
`scripts/deploy-vm-metadata.test.js` и входят в обязательный release suite.

Последующий Telegram configure читает Lockbox через `YC_LOCKBOX_SOURCE=iam`
с тем же краткоживущим `YC_IAM_TOKEN`, без Cloud CLI или VM metadata endpoint
на GitHub runner. Используется официальный Payload.Get, без перенаправлений,
вывода payload/токена или повторов после сетевой ошибки. VM runtime по умолчанию
по-прежнему получает собственный токен из metadata; CLI остаётся только явным
локальным режимом. `server/lockbox.test.js` проверяет изоляцию источников,
ошибки/таймауты, отсутствие утечек и неоднозначные/пустые/binary entries.

- Публиковать только проверенный commit и immutable image с его полным SHA. Не собирать релиз из dirty-workspace и не включать чужие изменения в коммит. Сохранить SHA предыдущего работающего образа для отката.
- Один rollout за раз. CI использует `cancel-in-progress: false`; перед ручной операцией убедиться, что конкурирующий workflow завершён и его deploy-step не продолжится позже. Сбой чтения GH API не означает сбой job; повторить чтение статуса с новым запросом.
- Скачивание YC CLI ограничено временем и повторами. Не печатать IAM/OIDC/Lockbox tokens, Compose с секретами, env контейнера или полный журнал COI. Если нужен временный Compose-backup, права 0600 и вне репозитория.
- До ручного рестарта проверить целевую VM, runtime service account, существующие Compose metadata и отсутствие конфликтующей container declaration; выполнить read-only `df -h /`, `docker system df`, `docker ps -a` и просмотр отфильтрованных COI pull errors. На 19 GB boot disk сохранять минимум 5 GB свободного места; при недостатке места остановить выпуск и сначала восстановить запас. Здоровая старая версия не является основанием автоматического reboot: нехватка места при pull может превратить её в простой.
- Кэш чистить только по точному перечню старых Rollapp image tags после проверки ссылок **всех**, включая остановленные, контейнеров и доступности immutable образов в registry. Сохранять текущий и предыдущий рабочий образ, а также все используемые контейнерами. Без `--force`, удаления контейнеров/volumes, `docker system prune` и операций над PostgreSQL. Диск с данными и сертификатами не трогать.
- При healthy-but-stale CI завершается ошибкой и сохраняет работающий сервис. После диагностики возможен один контролируемый restart/повтор согласования; не устраивать цикл reboot. Если прежний контейнер остановлен и новый pull не удался, сначала вернуть доступность проверенным прежним образом.
- Успех означает `/api/healthz`: `ok: true`, `service: rollapp`, `version` **точно** совпадает с полным SHA. Затем проверить canonical redirects, публичный профиль и затронутые реальные экраны. HTTP 200 старой версии не подтверждает выпуск.

История инцидентов и результаты проверок не дают бессрочного разрешения на удаление данных, изменение схемы, доступов или публикацию приватных материалов.

Для визуальной сверки с реальным PDF `test:identity-reports` принимает `IDENTITY_REPORT_REVIEW_LAYOUT=/absolute/path/report.json` с несохранённым report-object и `IDENTITY_REPORT_REVIEW_PAGES=3,7`. Этот режим подставляет локальные props во fixture, сохраняет проверки геометрии/типографики и запрет API, проходит всю матрицу 320–1920 px и пишет screenshots выбранных страниц в `/tmp`. Приватные PDF/JSON и screenshots не добавлять в репозиторий. Он дополняет стандартный smoke, но не заменяет его проверки известных сценариев.

Статический report layout contract должен следовать действующему Gallup →
`IdentityGeneratedDocuments` пути и source-chart CSS в `src/index.css`.
`test:identity-reports` дополнительно проверяет полную 34-ячеечную rank ribbon
и неразрывную длинную подпись на всей chart-матрице. Изменение assertions не
достаточно: требуются реальные DOM размеры, цвет, отсутствие ellipsis/clipping
и root/descendant overflow; см. `docs/report-contract-verification-2026-10-18.md`.

Навигация «Шкалы»/«Субшкалы» входит в chart smoke: keyboard Enter, точные
независимые fragment targets, перенос фокуса, достижимость цели после нативного
скролла, сохранение исходного порядка и общий 48px/24px control contract на
восьми размерах. Дополнительные случаи 320/1440px проверяют два графических
файла после длинного Summary, полные имена и отсутствие навигации без графики.
Source-review матрица повторяет переходы на реальном извлечённом layout без API.

`scripts/text-block-boundary-checks.mjs` входит в `test:text-edit`: восемь размеров,
Shift-клик через три ответа в обе стороны, точные clipboard/delete/type/colour,
один Undo, Enter, native endpoint в начале нетронутого ответа, save/reload/read-only
и фиксированные вопросы. `--boundaries-only` — диагностическая матрица, не замена
полной регрессии. Чистые тесты также проверяют частичные list endpoints и вложенных
детей; [датированный отчёт](notion-block-boundaries-verification-2026-10-18.md)
различает завершённый baseline comprehensive и новую изменённую версию.

Устойчивость BlockSelection проверяется после layout/DOM normalization каждый
кадр 650 мс, в том числе для sparse группы: точные позиции/направление, hidden
native projection и отсутствие текстового toolbar должны сохраняться. Одной
проверки сразу после клика недостаточно. Отдельно проверяются empty-block click
и немедленный ввод, чтобы защита проекции не блокировала явный native pointer.

Вложение обычных блоков проверяет `scripts/text-nesting-checks.mjs` в составе
`test:text-edit`: native Tab/Shift+Tab, caret/marks, несоседние группы,
родитель с детьми при keyboard/drag/duplicate/delete/Undo, тип/toggle,
save/reload/public read, task children/checked state, отсутствие frames/API,
12 уровней и heading rhythm на всей восьмиразмерной матрице. Сценарий drag →
Undo → click → Escape не должен оставлять скрытый логический выбор. Целевой
`--nesting-only` не заменяет полный редактор или `check:comprehensive`.

Глубину нативных списков проверяет `scripts/text-deep-list-checks.mjs` в составе
`test:text-edit`: вся восьмиразмерная матрица, три типа × 12 уровней, native typing,
точный save/reload/public read и checked state, реальная ширина последнего абзаца,
root/descendant overflow и frames. Один root scrollWidth недостаточен: потомок
может стать нулевой ширины при отсутствии root overflow. `--deep-lists-only` —
диагностика, не замена полному прогону.

Production development startup принудительно задаёт
`ROLLAPP_DATABASE_INITIALIZATION=verify`. `initializeRuntimeDatabase` в READ ONLY
транзакции сохраняет guard reserved usernames и проверяет реальные auth/document
columns через LIMIT 0; migrations, backfill, reservation cleanup не запускаются.
Ошибки существующей схемы/подключения возвращаются без создания demo/local базы.
Обычный production startup без этого режима сохраняет прежний migration path;
он не даёт агенту разрешение запускать мутации. При обновлении локального API
использовать управляемый `npm run dev:keepalive`, сохранить auto-recovery и после
проверить статус, PID, новую startup запись verify и affected live read-only UI.
Не останавливать постоянное подключение после проверки.

После keyboard apply в inline-палитре `text-inline-style-checks.mjs` проверяет
ArrowRight и весь последующий кадр за кадром интервал 650ms: точный конец прежнего
диапазона, collapsed DOM/model, toolbar 0, без изменения текста. При отказе пишет
focus/selection trace и screenshot в `/tmp/rollapp-inline-style-focus-*`.
`scripts/text-native-caret-checks.mjs` включён в `test:text-edit`; 390×400 и 1440×400,
formatted/LTR/RTL/bidi/graphemes, forward/reverse и Left/Right сравниваются с
независимым нативным editing host браузера. `--native-caret-only` — диагностика,
не полный редактор/общий аудит. Guards оставляют Shift/modifiers/IME/readonly и
Block/Node/Cell/AllSelection неизменными.

`test:text-edit` также включает первое offscreen выделение (9 размеров), длинные
ответы и перемещение между вопросами (по 8), логические list-item границы (8),
native list drag (2) и guards реального жеста на 1440×400. Общий прогон текущей
композиции ожидает 375 PASS records. Целевые `--first-selection-only`,
`--long-answers-only`, `--question-moves-only`, `--list-moves-only`,
`--list-drag-only`, `--drag-guards-only`, `--mod-enter-only`, `--relocation-depth-only`,
`--table-handles-only` и `--table-axis-guards-only` не заменяют полный editor/comprehensive.
`--table-handles-diagnostic` ограничивает только table-handles матрицу до1024px;
его нельзя считать полной матрицей. Table-axis coverage включает клавиатурное
меню на всех размерах,48px/20px/four radii, desktop pointer guides/moves,
keyboard activation после drag, Undo/reload, Escape/doc/access/blur/capture guards.
Fixture валидирует четыре ответа настоящей pure API schema и заранее оптимизирует
zod, чтобы холодная загрузка зависимости не перезагружала React во время проверки.

Chart navigation ждёт загрузки шрифтов перед обычной multi-file матрицей.
Диагностические `--navigation-only --slow-fonts` дополнительно активируют ссылки
во время задержанной загрузки шрифтов, затем проверяют конечный rail/focus.
При timeout записываются target/scroll/font event trace и screenshot в `/tmp`;
слабый положительный результат до завершения layout не заменяет проверку после него.


`--table-wide-only` проверяет2 desktop pointer/edge-scroll cases с exact reload.
`--table-chrome-only` проверяет10 реальных app-header/editor compositions, включая
высокую header cell на1440×400, hit-testing/DOM Range/отмену меню. Fixtures
передают presentation contexts и блокируют API; production БД не подменяется.
`--table-chrome-diagnostic` / `--table-chrome-short-diagnostic` — одиночные
диагностические подмножества, не полная10-размерная матрица.
`--table-chrome-single-row-diagnostic` — одиночный compact table case, также не полный прогон. Тогда полный editor ожидал268 records; актуальный375-case editor и combined comprehensive обязательны после изменений.

`--caret-scroll-only`:9cases с настоящими chrome/navigation, native arrows/Shift, manual scroll и blur; `--table-duplicate-only`:9cases для обеих осей/merged bands, hover/context menus, Undo и reload. Исторический source618 ожидал268 PASS после переноса combined source618; предыдущий source608 дал228 PASS и releasePASS, но comprehensive остановлен на Hogan navigation, поэтому всего9этапов не прошли.

Source618 объединяет grid growth9 +guards2 +contexts2 и plaintext native caret9; тот editor ожидал268 PASS. `--plain-caret-only` включает actual blank-line caret pixels и native navigation, `--table-growth-contexts-only` — Four Questions/широкую/вложенную таблицы. Полный comprehensive запускается заново на618 source hashes; supplemental611 не заменяет этот результат.

Исторический source620 ожидал **270 editor PASS**: добавлен `--table-insert-caret-only` (2 desktop cases с offscreen первой строкой, целой видимой ячейкой, нативным курсором, вводом и отдельными Undo/Redo). Main618 остановился после128 editor PASS на загрузке динамического fixture-модуля; полный прогон не засчитан. Отчёт: `notion-table-caret-intent-verification-2026-10-18.md`.

При параллельной диагностике в изолированной копии с symlink `node_modules` обязательно задавать отдельные `TEXT_EDIT_PORT` и абсолютный `TEXT_EDIT_CACHE_DIR` вне общего node_modules. Даже неудачный listen может успеть переоптимизировать зависимости и нарушить динамический импорт другого Vite. Основной comprehensive и диагностика не должны делить кэш; провал загрузки модуля не считать успешной UI-проверкой.

Исторический source629 ожидал **287 editor PASS**: к main620/270 добавлены9 document columns,3 column contexts,3 column persistence и2 native page-key cases. Диагностические --columns-only, --column-contexts-only, --column-persistence-only, --native-page-keys-only не заменяют полный прогон. Последний сравнивает фактический unmanaged native Home/End текущего OS; macOS endpoints/BlockSelection branch проверяется на Mac. Физические другие платформы не имитируются объявлением platform. Main620 full завершился failed174 на caret после Home/Shift+Up, поэтому новый полный comprehensive обязателен.

2026-10-18, Cut/native-selection delta: текущий редактор содержит8 новых viewport cases `text-cut-history-checks.mjs` — раньше ввод, Cut и новый ввод сливались в Undo. С этой дельтой полный editor ожидал295PASS records (прежние287+8); native-caret2 расширен на Shift+Arrow forward/reverse/collapsed/styled/RTL/bidi/graphemes без уменьшения прежних assertions. Question moves/nesting/Mod+Enter используют Meta+ArrowLeft для начала строки наmacOS иHome на остальных ОС; bareHome/End отдельно проверяют native page-scroll semantics. Main629 full завершилсяinvalidated/exit1/editor77 из-за source drift6+added1 и старого Home fixture setup, не считается успешным. Новый результат записывается отдельно.

Gutter alignment delta:8 новых случаев `text-gutter-alignment-checks.mjs` включены
в `test:text-edit`; с этим добавлением полный editor ожидал303PASS records (295+8). Desktop
1024/1440/1920 проверяет h1–h6, пустую и многострочную прозу, nested/columns, фактические
text Range centres и48px/20px; 320/390/768/820 сохраняют hidden hover controls. Включён
1440×400. Остальная матрица и исходные JSON/Undo/drag assertions не удаляются.

Native selection capture расширяет существующие2 native-caret cases (тогда объём303
records не менялся): explicit collapsed start послеfocus, возврат owned range и
queued native DOM append/middle/delete/markup проверяются с обоими caret offsets,
marks и соседями. Reference native Shift+стрелки и650ms frame stability остаются.
При изменении/обновлении DOMObserver адаптера обязателен этот smoke, включая
pending/scheduled/suppressed input; отдельная диагностика не заменяет полный
`test:text-edit` и `check:comprehensive`. Trace, naive-capture counterexample и
исправленный guard: `notion-native-selection-capture-verification-2026-10-18.md`.


В authoring/table версии историческая сумма311: к прежним303
добавлены8 `text-insert-ownership-checks.mjs` (64 insertion subcases и8 real
delayed-font guards внутри viewport cases). Проверяются empty native caret до
ввода, исходные text/marks/attrs, отдельные Undo, exact save/reload и fixed prompts;
settle/wheel/new-selection/access при задержанном italic font — на390×400/1440×400.
`--insert-ownership-only` не заменяет полный editor или nine-stage comprehensive.

Wide-table smoke дополнительно сохраняет reference capturing button и проверяет
connected/hasPointerCapture и исходный ControlBar rail до pointerup. Base Nova
pressed translateY1px не является смещением rail и не должен исправляться CSS.
Axis guards по-прежнему проверяют реальные release/capture loss, Escape, source/
access и blur. После изменения owner lifecycle запускать также axes, chrome и
grid-growth/guards; актуальный полный editor и comprehensive обязательны. Источники
доказательств: `notion-text-authoring-combined-verification-2026-10-19.md`,
`notion-table-drag-capture-verification-2026-10-19.md`.

Историческая clipboard/authoring/table версия содержала **335 editor PASS records**:
к предыдущим311 добавлены24 native clipboard viewport cases из
`text-cross-clipboard-checks.mjs`. Mixed8 проверяют оба направления сквозного
Copy/Cut/Paste со сложным rich составом, точный Undo/Redo и reload. Partial8
содержат48 сравнений с обычным native editor для table/list/task/code endpoints.
Cell8 проверяют merged rectangle, plaintext/HTML parity и отдельные history events
для cut/paste/typing в обычном и protected editor. Clipboard text не обрезает
буквальный whitespace. Непринятый native paste и read-only покрыты unit guards.
После clipboard/history изменений запускать весь test:text-edit и nine-stage
check:comprehensive; целевые clipboard flags — только диагностика.


Image/context/layout/reader baseline ожидает **367 editor PASS records**:
к clipboard baseline335 добавлены4×8 сценариев `text-image-checks.mjs`.
`--images-only`, `--image-layout-only`, `--image-reader-only` и `--image-context-only`
запускают соответствующие полные8-viewport подматрицы; `*-diagnostic` используют
только390×400/1440×400. Ни один фильтр не заменяет актуальный полный editor и9этапов comprehensive.

Image authoring проверяет реальный filechooser с явно включённым fixture transport,
URL/metadata/тип числовых размеров, native image HTML clipboard, отдельный Undo,
ошибку/повтор upload, поздние ответы и точный failed-save draft/reload/public read.
Held-asset сценарии выпускают фактический browser response360×1500 после вставки/
печати и проверяют видимость native caret, неизменные JSON/selection и отмену при
wheel/new caret/access. Public reader раскрывает age/strategy секции, декодирует
обе картинки, проверяет columns/размеры/alt/соседей, mobile flow и отсутствие рамок.
Contexts используют настоящие plus/Option-click на desktop и общее меню на узком
экране, проверяют cell/nested/list/column owner, protected questions API shape,
точные Undo/save/reload, loading/read-only/pending-upload access и keyboard/panning
220px/96px. Реальные API запрещены; unit tests и7SELECT READ ONLY/ROLLBACK проверяют
media-reference guards. Не выполнять реальные production uploads/deletes ради QA.

После changes insertion/ownership повторить basic blocks/offscreen creation/four
answers/tables и полный editor/comprehensive. Repeated PASS разных snapshots не
суммировать как единый аудит. Исторический main634/source335 editor полный9-stage
PASS хранится в `notion-cross-clipboard-verification-2026-10-19.json`; он не доказывает
новую image-версию. Целевые результаты/отказы/hashes — в `notion-inline-images-verification-2026-10-19.json`.


При image handoff context8 также собирает каждый RAF во время block→image→cancel:
все видимые контекстные popup classes считаются вместе (не только formatting bar),
максимум один слой. Keyboard Tab/URL input сохраняют текст и тот же native range.
В nested image case сначала включается настоящий GapCursor: widget не меняет
header/child rects, foreground marker виден, image выбирается реальным кликом и
metadata не создаёт дубликат. Прямой deterministic before-probe сохраняет дефект
x14→41/y72→94.5; контракты источника/проверки обновляются вместе.

`--surface-only` проверяет существующий основной inline-document сценарий отдельно:
8viewport records (320–1920px и390×400) и3общих deep-document/creation/history/save
records, всего11 основных случаев плюс8 placeholder cases (19 суммарно).
ArrowUp из начала должен выбирать последний элемент актуального
`blockTypes`, а весь каталог должен быть отрисован; aria-pressed и полная видимость
выбранного пункта внутри собственного scroller обязательны. Не привязывать эту
проверку к прежнему последнему имени «Таблица». Диагностика не заменяет полный
375-record editor и9-stage comprehensive.

Текущая media/resize версия ожидает **375 editor PASS records**: к367baseline
добавлена8-viewport матрица `text-image-resize-checks.mjs`. `--image-resize-only`
проверяет обе ручки реальным mouse/touch pointer capture, отсутствие doc writes
при preview, пропорции, родительские bounds, keyboard, Escape/captureloss/pointercancel/
source/selection/access/IME/blur cancellation, пять nested owners, protected four
answers, exact Undo/Redo/save/public read/draft/retry, границы chrome иkeyboard/panning.
`--image-resize-diagnostic` — только390×400 и1440×400, не вся матрица. Touch получен
через настоящие Chromium CDP touch events, аIME/blur/panned keyboard эмулированы
явно; это не проверка реального iOS/Telegram устройства.

Image contexts также ждут стабильного hover над1px nested head image перед
нативным click. Узкие изображения сохраняют собственный hit target: боковые зоны
захвата расположены снаружи; декоративная линия не перехватывает pointer events.
Capture control остаётся смонтированным до release/cancel, readonly/loading не
создают guides. Preview иcommit сохраняют type/alt/title/block colours/соседей,
integer dimensions проходят прежний canonical adapter без нового формата/схемы.
После resize/shared editor изменений нужны полный375 иnine-stage comprehensive,
а не сумма target PASS разных snapshots. Caption/align/file paste-drop, exact
Notion edge anchoring/minimum rules иactual-device IME остаются вgoal audit.


Native editor focus preserves a newly placed DOM caret or forward/backward range while selectionchange is delayed. The pinned late-priority ProseMirror focus adapter runs after Tiptap public FocusEvents, retaining focus/blur callbacks, isFocused and focus class lifecycle; unsupported adapter shape falls back to upstream behavior. Explicit EditorView.focus() still restores model-owned selections. `--selection-only` tests all eight viewports with a simulated delayed native event, exact offsets/direction, one anchored toolbar, public callbacks, no document/save/API writes. This does not substitute for actual-device IME verification.

Column-width separators own the narrow inter-column gutter before hover state renders. The first native pointer must hit the separator and be captured by that same control; revoking access or changing the document during preview cancels without a native prose drag or document mutation. `--column-contexts-only` includes first-hit/capture checks and exact changed-source cancellation at short desktop and mobile widths.

Native focus restoration is synchronous for model-owned image/cell/block selections; it must not schedule a later reset over a newly placed text range. Image resize controls carry their own editor instance owner, not shared-portal ownership; hovering another image retires previously focused image chrome, and returning native editor focus restores only its selected image guides. Native resize tests cover focus/hover/portal handoff with both editors simultaneously visible.

Inline Markdown storage preserves marks on every character, including selected edge spaces and adjacent differently styled runs. Explicitly removed links and literal ++ delimiters stay literal after reload; normal Markdown imports keep their existing syntax. Rich list-item child blocks (extra paragraphs, dividers, headings, code and media) retain their own structure through canonical HTML instead of compact continuation lines. Native style checks include actual formatting/unlink/typing, independent Undo/Redo, exact editor reload/public reading at eight viewports. Model tests compare whitespace marks rather than discarding them.

Ctrl/Cmd+S from portalled editor controls prevents the browser Save Page action and flushes only the owning document queue. React capture keeps portal ownership local to each InlineRichTextEditor; key events inside the editable DOM retain ProseMirror native input/mutation handling. Saving a document does not apply or close an unconfirmed link form. The native style matrix checks two simultaneously dirty editors and pending metadata on all eight viewports.

`text-image-alignment-checks.mjs` добавляет10 default cases: восемь размеров320–1920, light390×400/1440×844 и short DPR3. Native клики проверяют положения, exact JSON/selection/neighbours, Undo/Redo/save/public read, nested/columns/table/fixed questions, twins, stale source/selection/access, no-op/full-width, selected state,48/20px/radius24 и chrome/panned bounds. Изолированная quote/link/alignment версия ожидает401 records; после совмещения с file-transfer candidate399 потребуется409, не сумма targeted PASS. Неизвестные/множественные CLI modes fail до запуска fixture. Caption/viewer/прочие media и actual-device IME сохраняются в goal audit.


## Лента контактов

Цифровая визитка: [contact-cards.md](contact-cards.md). Тот же `test:contacts`
дополнительно проверяет локальный QR, реальные vCard/JSON downloads с явным списком
публичных полей, clipboard error/retry, share/cancel, восстановление фокуса,
48px/24px контролы и гостевой публичный профиль в обеих темах. Матрица включает
девять размеров, в том числе 390×400 и 1440×400. TON Testnet подпись и подготовка первоначальной регистрации проверяются отдельным
`npm run test:contact-cards`, включённым в `check:release`: реальные HTTP обработчики
и Ed25519 verification, явно синтетический кошелёк, девять размеров, отказ/повтор,
Mainnet rejection, цепочка обновлений, файлы и отсутствие ложного подтверждения RPC.
Unit suite воспроизводит Tolk artifact и проверяет права/ротацию/семидневное
восстановление в TON Sandbox. Это не проверка реального Testnet-развёртывания;
реальная подпись/деплой требуют кошелька владельца. Схема и данные БД не меняются.

Контакты загружаются порциями по 48 с автоматической подгрузкой в пределах
500px от нижнего края. Кнопка «Загрузить ещё» сохраняет ручной/клавиатурный доступ;
ошибка следующей страницы не убирает уже загруженные карточки и требует явного
повтора. Конец списка убирает подгрузку. Поиск/компания/направление/избранное/владелец
начинают новую ленту; ответы предыдущей ленты не могут добавить карточки.

Лента запрашивает `order=source`: избранное меняет звезду и счётчик на месте,
без перемещения карточки, перезагрузки сетки и команды прокрутки. Старый API-порядок
с избранным в начале сохраняется для клиентов без этого параметра. В фильтре
избранного удаление обновляет загруженный диапазон в фоне для корректных смещений.
`test:contacts` входит в `check:comprehensive`.

При одновременной работе нескольких checkout назначать свободные собственные
`PORT` (API) и `ROLLAPP_DEV_FRONTEND_PORT` (Vite) в игнорируемом окружении этой
checkout, не меняя общий файл через symlink. Dev API и manifest proxy используют
`PORT` (по умолчанию 8080); browser-facing Host сохраняется для CSRF. Проверять
оба реальных listener и `dev:keepalive:status`, а затем содержимое раздела:
успешный health другого процесса на общих портах не доказывает готовность этой
checkout. Не завершать чужие сервисы ради освобождения порта.

Единообразие штор проверяет `npm run test:drawers`: все реальные form cases на
320/390/414/768/820/896/1024/1440/1920px и 390×400, общий `ControlBar`, четыре
радиуса 24px, точные 48px/20px/18px/28px, gap 8px, непрозрачные disabled-кнопки,
полная подпись и отсутствие горизонтального переполнения. Снимки основных форм
сохраняются в `/tmp/rollapp-form-consistency-*.png`; они дополняют проверки
клавиатуры/прокрутки и обязательные `test:controls`/`test:form-actions`.

При параллельной проверке разных worktree можно задать отдельные fixture-порты:
`CONTROL_SIZE_PORT`, `DETAIL_ACTION_PORT`, `DATE_PICKER_PORT`, `FORM_ACTION_PORT`,
`TEXT_EDIT_PORT`, `KANBAN_DRAG_PORT`. Это меняет только порт локального smoke
server; набор сценариев/ассерты и production API остаются прежними.

## Холодный запуск редакторного fixture

Lazy/transformed app chrome требует предварительной оптимизации всех фактически
импортируемых Base UI subpaths, а не только корневого пакета. Shared inventory
`scripts/smoke-dependencies.mjs` проверяется по исходным imports в `src`; новый
UI import без prebundle делает unit красным. Это предотвращает позднее обновление
графа зависимостей/перезагрузку в середине authoring scenario. Discovery остаётся
включённым, root/error/geometry/history assertions и прежние timeout не меняются.

`smoke-browser-diagnostics.mjs` только наблюдает события публичных browser/page
API. На отказе сохраняются bounded pageerror/console/HTTP/pending module requests
с удалёнными URL query strings. Он не фокусирует DOM, не ждёт/retry и не подавляет
ошибки. Холодную проверку выполнять в новом отдельном cache directory; успешный
повтор на старом кэше не подтверждает исправление startup.

### Консистентность дат во всех формах

`test:dates` дополнительно вызывает `date-field-consistency-checks.mjs`:
семь реальных несохранённых форм (курс, конференция, коучинг, препарат,
тренировка, профиль, событие Wishlist) на девяти ширинах 320–1920px.
Проверяются отмена, выбор, очистка, вложенная mobile history, сохранение
родительского черновика и ограничение окончания началом курса/события.
Отдельная матрица проверяет keyboard, включительные min/max и disabled.
Read effects этих форм отклоняются без подмены ответа, любые API mutations
запрещены. Нативные date inputs запрещены для всего src через `test:ui`.

`npm run test:page-scrollers` входит в `check:release`: полная матрица горизонтальных лент и обоих краёв; контракт в `docs/spacing-system.md`.


### Произвольные личностные тесты (2026-10-24)

`test:identity-reports` также выполняет `scripts/identity-tests-smoke.mjs`: девять
размеров, новая форма/ошибка/повтор/переименование, выбор теста после закрытия
mobile history, PDF reader, отмена и подтверждение удаления; запросы к API
запрещены. Парсер проверяется в database-free unit suite. Перед включением на
существующей БД отдельно согласовать и выполнить миграцию двух CHECK по порядку,
описанному в `docs/identity-report-charts.md`; обычный запуск остаётся `verify`.

## Проверка сниппетов коллекций

`npm run test:snippets` входит в `check:release`: реальные карточки курсов, конференций, коучинга, тренировок и препаратов, все статусы, owner/read-only/busy, обе темы, mouse/touch, 11 размеров 320–1920px и короткие окна. Проверяются glyph/badge bounds, ручки и native drag preview/cancel, меню/ссылки/клавиатура, overflow, изображения/loading/fallback/source replacement и отказ старого запроса. JSON и screenshots сохраняются в `/tmp/rollapp-snippets/`; веточный comprehensive job включает JSON/failure screenshots в artifact. `--diagnostic` запускает только 320px и не заменяет полный прогон. Контракт: [collection-snippets.md](collection-snippets.md).

Релиз прозрачных панелей занял 117 минут. С добавлением обязательной матрицы сниппетов deploy job имеет 180 минут, как веточный audit; это запас времени, assertions и состав release не сокращаются.
## Персональный План Развития в Идентичности

Раздел `personal-development-plan` использует общий `EditableMarkdownDocument`
и отдельный ключ `identity:personal-development-plan`, независимо от карьерного ИПР.
Личный исходник Obsidian не входит в публичный репозиторий или клиентскую сборку.
Экран показывает только документ владельца из authenticated API; пустой источник
не подставляет чей-либо личный текст другим пользователям.
Навигация и права доступа зарегистрированы в общей карте разделов.
Для сохранения нужна отдельно разрешённая миграция ограничения `identity_content`:
`node scripts/migrate-personal-development-plan.mjs` проверяет production READ ONLY;
`node scripts/migrate-personal-development-plan.mjs --apply` расширяет только список
разделов после отдельного разрешения, без изменений существующих документов.
Обычный startup/deploy остаётся в режиме verify.

## Личные тексты и public source

Личные документы сфер читаются только через authenticated content/report API.
Не добавляйте личный Markdown, ответы, CV, планы или архивы feedback в src/data
и не используйте их как общий fallback. При отсутствии записи показывается пустой
документ; ошибки БД/API сохраняются видимыми. Синтетические тестовые props не
являются production storage. Старые PDF используются только parser fixtures,
не импортируются клиентом и не заменяют загруженные отчёты владельца.

`node scripts/import-identity-document.mjs --username OWNER --section SECTION
--file /private/document.md` проверяет точную production БД/роль и читает состояние
без записи. Отдельный `--apply` создаёт только отсутствующий документ выбранного
владельца через ON CONFLICT DO NOTHING. Существующие и параллельно созданные
документы не перезаписываются; schema initialization/migrations не запускаются.
Локальный Obsidian performance export по умолчанию сохраняется вне публичного
репозитория с правами 0600, в формате JSON для последующего явного импорта.

По прямому запросу пользователя 25 октября «Задеплой без сложного аудита» для UI-сниппетов добавлен явный manual release mode `verification=snippets`: `check:release:snippets` выполняет unit, UI, полный test:controls, полный test:snippets, полный drag/drop и build. Default и push-релизы сохраняют полный check:release. Веточный comprehensive не публикует приложение. Этот выбор разрешён только при явном запросе целевого выпуска; незавершённый comprehensive отмечается как отменённый, а не PASS. Schema verify, OIDC, сериализация rollout и exact-SHA health остаются обязательными.
