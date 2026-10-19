# Регламент проверки Rollapp

Этот документ — действующий порядок проверки и выпуска. `AGENTS.md` задаёт обязательные правила работы; отчёты `docs/*audit*` и датированные verification-документы фиксируют прошлые проверки, а не заменяют текущие контракты.

## Источники UI-контрактов

| Область | Реализация | Документация |
| --- | --- | --- |
| Текст и семантические роли | `src/typeset.css`, токены `src/index.css` | `docs/typography.md` |
| Отступы, навигация, размер контролов | `src/spacing.css`, `ControlBar`, `PageActionButton` | `docs/spacing-system.md` |
| Максимальные ширины | `src/containers.css` | `docs/container-system.md` |
| Порталы, safe area, клавиатура | `src/overlays.css`, `use-visual-viewport.js` | `docs/mobile-overlays.md` |
| Мобильные формы и действия | `MobileFormPages`, `MobileFormFooter`, `ContentPageActions` | `docs/mobile-overlays.md` |

При изменении контракта синхронно обновлять реализацию, соответствующий документ, `AGENTS.md` и проверку поведения. Новый локальный CSS не должен переопределять общий контракт ради одного экрана.

## Безопасная последовательность

1. Прочитать `AGENTS.md`, проверить `git status --short`; сохранить чужие незакоммиченные изменения. Записать SHA и наличие dirty-файлов, чтобы результат не выдавался за проверку чистого релиза.
2. Проверить `npm run dev:keepalive:status`. На этом Mac постоянный сервис использует настроенный production PostgreSQL по TLS. При сбое восстановить соединение, не подменять БД. Ограничение sandbox на `ps`/`lsof` требует повторения с разрешениями и не означает устаревший PID. После проверки сервис оставить работающим.
3. Запустить `npm run check:comprehensive`. Он последовательно выполняет полный безопасный набор ниже, сбрасывает фильтры частичных матриц и останавливается на первой ошибке. Путь к JSON-отчёту печатается в начале; `ROLLAPP_CHECK_OUTPUT=/absolute/path/report.json` задаёт своё имя. Отчёт содержит SHA, dirty-флаг, версии Node, коды завершения и длительность этапов; приватные данные приложения в него не попадают.
4. Проверить живой UI в существующей сессии с production API. Открытие, выбор вкладок, скролл и отмена форм допустимы. Не сохранять тестовые данные, не отправлять сообщения, не выполнять оплату или удаление пользовательских записей. Для входа без авторизации использовать отдельную сессию/локальный клиент с той же настроенной production API; не переносить cookies между origin.
5. При необходимости проверить планирование командой `npm run test:planning:production`. Проверить точную настроенную БД/роль; все временные записи только внутри `BEGIN` → `ROLLBACK`, с ограничениями ожидания блокировок и выполнения запросов. Проверка не запускает миграции/инициализацию схемы. Не включать другие mutating integration-флаги без чтения сценария и проверки его границ отката.
6. Выполнить `npm audit` и отдельно `npm audit --omit=dev`: различать инструменты разработки и зависимости рабочего образа. Проверять advisories по первоисточникам, обновлять совместимые версии и lockfile, затем повторять затронутые проверки. Не запускать `npm audit fix --force` и не откатывать shadcn на несовместимую старую версию ради зелёного счётчика.
7. Записать найденные проблемы, исправления, выполненные команды, результаты и ограничения в датированный отчёт. `git diff --check`; просмотреть diff перед фиксацией. В итоговом сообщении сообщить фактический результат и оставшиеся ограничения.

## Команды

| Команда | Назначение |
| --- | --- |
| `npm test`, `npm run test:unit` | Только тесты без БД; runner исключает integration и старые memory-fixtures, проверяет прямые импорты БД |
| `npm run test:text-edit` | Полная матрица inline-документов: ввод без рамок, selection toolbar, блоки/группы, символы, стили/цвета, save/reload, очереди/draft/retry и доступ. Включает native clipboard и буквальные Markdown/HTML/whitespace в строчном коде, отдельный Undo и сохранение соседей; единый редактор четырёх ответов со сквозными диапазонами, фиксированными вопросами и общей историей. Block-colour матрица включает slash/palette, группы/ячейки/диапазоны через ответы, пустой блок/Enter/type, exact reload/public read, HTML clipboard, draft/retry, общий browser preference и его отказ, read-only/viewport. Slash-матрица проверяет команды в существующем тексте, middle-of-line/Shift+Enter, dismissal/clipboard/history guards, атомарные duplicate/delete/type, cell/four-answer scope и panning. Табличная матрица включает команды, merge/split, native resize, spans/ширины/вложенные блоки, public read, draft/retry и отзыв доступа во время drag. Контракт: `docs/inline-editing.md` |
| `npm run check`, `npm run check:release` | Unit, UI-контракты, геометрия контролов, detail actions, даты, синхронность Back/Save, редактирование текста, Drag-n-Drop канбан-колонок, production build; этот же набор обязателен в CI |
| `npm run check:comprehensive` | Release-набор плюс все расширенные UI-проверки ниже; без запросов к API/БД |
| `npm run test:navigation` | Верхняя/нижняя навигация, полноширинные меню, safe area, короткий экран и клавиатура |
| `npm run test:action-rails` | Центрирование, динамические действия, оба края горизонтального скролла и вертикальный скролл |
| `npm run test:kanban` | Перетаскивание колонок: короткие/пустые/свёрнутые списки, промежутки, начало/конец, edge-scroll, отмена и ошибка сохранения, touch и меню на телефоне; входит в `check:release` |
| `npm run test:todo` | Пустой/длинный To Do, дата, создание и отмена отдельной страницы задачи, mobile/desktop ribbon |
| `npm run test:form-pages` | Все реальные формы на телефоне, desktop Drawer, история, вложенный черновик, busy/Enter guards; восстановление прокрутки исходного документа через page/browser Back без последующих скачков |
| `npm run test:catalog-page` | Независимый экран карточки каталога, reload, Back, скролл до конца |
| `npm run test:wish-groups` | Реальные карточки групп Wishlist: троеточие в длинных названиях, границы текста и счётчика, клавиатура, отмена переименования, owner/read-only на полной матрице |
| `npm run test:identity-reports` | PDF-содержимое Hogan/Gallup без добавленных интерпретаций, заголовки/абзацы/списки/таблицы, исходные диаграммы и сегменты, точная длина полос 0/37/100, пустые/полные сегменты, типографика 18/28, перенос длинных строк и отсутствие переполнения на 320–1920 px и 390×400; без запросов к API/БД. Контракт: `docs/identity-report-charts.md` |
| `npm run test:drawers` | Реальные формы и оставшиеся overlay-композиции, фокус, touch, dismiss, keyboard/panning, снятие scroll lock |
| `npm run test:planning:production` | Проверки API и изоляции владельцев на настроенном production PostgreSQL, с откатом |

Расширенные UI-сценарии запускают временные Vite-серверы на loopback и настоящий Chrome с production CSS. Они передают несохранённые props компонентам и отклоняют все `/api/` запросы. Это проверка представления, а не замена production БД. Нужен установленный Chrome/Chromium; `CHROME_PATH` задаёт executable. `node scripts/check-comprehensive.mjs --list` выводит этапы без запуска.

Не запускать общий `node --test` или исторический `npm run test:visual` в качестве обычной проверки: они включают старые сценарии с memory-серверами или сохранением данных. `npm test` и `npm run check` перенаправлены на безопасные наборы. Индивидуальные smoke-фильтры годятся для диагностики, но не заменяют полный итоговый прогон.

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
records, всего11. ArrowUp из начала должен выбирать последний элемент актуального
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
