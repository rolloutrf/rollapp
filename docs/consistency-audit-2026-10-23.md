# Аудит консистентности Rollapp — 23 октября 2026

Статус: аудит завершён с явным исключением `test:text-edit` по указанию
пользователя. Все остальные 22 команды проверки и сборки прошли на одном
неизменном снимке исходников. Редакторный прогон остановлен; его частичные результаты не
засчитываются. Это не подтверждение полного release gate. Постоянные
`check:release` и `check:comprehensive` сохраняют обязательный редакторный этап.

## Проверяемое состояние

- Рабочая ветка: `codex/consistency-system-20261023`.
- Базовый SHA: `237386530fd11e359f6f997735537b85e6ccb419`.
- В начале checkout был чистым; проверяется dirty snapshot, без деплоя.
- Source SHA-256 (761 файлов src/scripts/server/shared/public и конфигурации):
  `f9b8decc84f3252275c1bf20fbb75477136c2a20d3b864dd47ef3595aa201396`.
- Node: 22.22.3. Production PostgreSQL, direct TLS, initialization=verify.
- Во время работы параллельно изменились presentation и тесты performance-review.
  Изменения сохранены; финальная матрица проверяет объединённое состояние.
  Повторный `data-tab-scroller` удалён без изменения поведения.

## Исправления

1. Четырнадцать текстовых действий контактов, личного/публичного Wishlist,
   образования, препаратов, перфоманс-ревью и анализов используют общий
   `PageActionButton`. Удалён локальный `shape` из upstream Button и его
   потребителей; icon-only delete сохраняет круг через композицию.
2. Общие действия сохраняют 24px с обеих сторон также с inline-start/inline-end
   иконками и loading spinner. Live CV/performance выявили прежние 8px слева.
   Удалена локальная белая/чёрная тема CareerEditAction; цвета принадлежат variant.
3. Удаление одного PDF и всего отчёта использует одинаковый destructive variant,
   включая подтверждение. Удаление желания из группы согласовано с образованием.
4. Все десять оставшихся browser-native date inputs заменены PlanningDatePicker:
   день рождения, событие Wishlist, курс/конференция, коучинг, препарат, тренировка.
   Общий picker поддерживает включительные min/max, disabled, aria-invalid,
   optional clear и применение после закрытия mobile history entry. День рождения
   ограничен локальной датой, без UTC-сдвига. Дата тренировки не очищается.
5. ListTileContent объединяет название, приватность и счётчик Wishlist,
   образовательных списков и групп препаратов. Удалены две копии LIST_TILE_STYLE
   и inline typography. Размер/flex basis/типографика принадлежат index.css.
   Удалены скрытые устаревшие mobile overrides 80×70px/12px corners, ранее
   перекрывавшиеся inline стилями: сохраняются реальные прежние 130×100px/18px.
6. При отказе dashboard API Wishlist показывает ошибку и Retry вместо ложного
   пустого списка. При фоновой ошибке сохраняются уже загруженные данные с Alert.
7. `check:comprehensive` включает существовавший отдельно `test:contact-notes` и
   очищает report-review filters наряду с viewport/case filters.
8. Создан docs/design-system.md с картой владельцев и порядком общих изменений;
   синхронизированы AGENTS.md, typography, spacing, mobile-overlays и verification.
   `test:ui` запрещает native dates, Button shape, локальную геометрию/заливку
   PageActionButton и копии содержимого плиток.

## Сверка shadcn

Проверены официальные docs, theming, Button, Field, Typeset и текущий реестр
`https://ui.shadcn.com/r/styles/base-nova/<component>.json` для установленных
компонентов. Конфигурация: Base Nova, Base UI, neutral variables, Tailwind v4,
JavaScript, Lucide. Не смешиваются Radix и Base UI. UI checker сканирует 37 UI
модулей и 85 прикладных JSX.

Сверка строк реестра учитывает удаление TS types, icon placeholders, настроенные
aliases/font-heading и LTR/menu configuration. Это не заявление о побайтовом
равенстве всех файлов. Button возвращён к upstream variants/default sizes.
Существующие интеграционные адаптации Select (portal elevation, ItemText),
ScrollArea (flex viewport), Combobox (русское имя) и собственный ScreenPortal
явно перечислены в design-system.md. Продуктовые 48px/18px/28px и prose preset
сохраняются централизованной темой, как допускает модель shadcn.

Источники:
- https://ui.shadcn.com/docs
- https://ui.shadcn.com/docs/theming
- https://ui.shadcn.com/docs/components/base/button
- https://ui.shadcn.com/docs/components/base/field
- https://ui.shadcn.com/docs/typeset

## Проверки

- `npm ci`: успешно; lockfile не изменён.
- `npm audit` и `npm audit --omit=dev`: 0 vulnerabilities; повторены после правок.
- `npm run test:ui`: PASS после окончательных правок.
- `test:action-rails`: расширен реальными contact/Wishlist/education headers,
  inline icons, geometry shared tiles и отказом/Retry dashboard API. Диагностика
  320px с connection failure → failed Retry → successful empty response: PASS.
  Полная матрица: PASS, 126 случаев на девяти ширинах.
- `test:identity-reports`: PASS на 320/390/768/820/1024/1440/1920, включая новую
  проверку одинаковых destructive colors и cancel подтверждения PDF.
- Диагностика `DATE_WIDTHS=390,1440 npm run test:dates`: PASS для семи реальных
  несохранённых форм, short mobile/desktop, cancel/select/clear/parent drafts,
  диапазонов и keyboard/disabled. Это не замена полной матрице.
- `git diff --check`: PASS.
- Исходный прогон `/tmp/rollapp-consistency-verified-2026-10-23.{json,log}`
  остановлен по указанию пропустить редактор. До редактора успешно завершены
  unit (823 PASS, один optional TON integration SKIP), UI, controls, details,
  dates (85 случаев), calendar и form-actions.
- Продолжение на том же source hash: одноразовый runner вне репозитория;
  `/tmp/rollapp-consistency-without-editor-2026-10-23.{json,log}`. Все матрицы
  оставшихся этапов выполняются без viewport/case filters; постоянные release
  scripts не ослаблены.
  Ранние прогоны consistency/final/complete/release были остановлены или
  инвалидированы дальнейшими исправлениями и не являются release evidence.

## Живой UI

Использована существующая сессия с настоящим production API на
`http://127.0.0.1:53197`. Пользовательские формы не отправлялись; удаления,
оплаты, сообщения, загрузки файлов и изменения доступа не выполнялись.

- Все 23 раздела сфер: 320 и 390px (46 измерений); initial desktop review 1440px.
- Шесть разделов Wishlist, пять видов календаря, To Do, Kanban, заметки и три
  страницы друзей: 390 и 1440px (34 измерения).
- После финальной централизации: реальные плитки образования и препаратов на
  320/390/768/820/1024/1440/1920 (14 измерений), все 130×100px, corners18,
  label16/count24, без inline geometry и выходящего счётчика.
- Итоговый Wishlist после восстановления API: 11 реальных плиток на
  320/390/768/820/1024/1440/1920 и 1440×400. Все 130×100px/corners18,
  нулевой root overflow, текстовые actions48 с padding24. Mobile390/desktop1440
  скриншоты просмотрены.
- Настоящая mobile форма препарата: открыть вложенный календарь, Back к форме,
  Back к источнику без сохранения. Оба возврата успешны.

На части live прохода production PostgreSQL вернул 53300 (лимит 20 clients).
Подмена БД не применялась. Только локальный пул этого checkout уменьшен с8 до2;
другие сервисы/конфигурация production не изменялись. Persistent service снова
готов и оставлен работающим. В момент graceful restart PID исчез между
проверками; ручного удаления PID не было. Последующий штатный enable успешен.

Wishlist при mount имеет существующий background preview-backfill effect.
Live navigation может запускать этот существующий эффект; данный аудит не
утверждает полное отсутствие автоматических application writes. UI fixture
делает именно этот эффект inert и запрещает реальные API requests. Ручные
операции автора и тестовые записи в production не выполнялись.

## Границы результата

Chrome/IAB responsive emulation не доказывает actual-device IME, экранную
клавиатуру Safari, Telegram WebView или весь физический safe-area hardware.
Внешние платежи, доставка и авторизация провайдеров не выполнялись. Редакторный тест исключён пользователем, поэтому полный release gate не
заявляется. Не заявляется абсолютная идентичность каждого экрана на каждом устройстве;
результат ограничен описанными сценариями и живой проверкой.


## Итоговый результат

Завершение: 2026-10-23 19:12 UTC (22:12 Europe/Moscow).
Source SHA-256 до и после: `f9b8decc84f3252275c1bf20fbb75477136c2a20d3b864dd47ef3595aa201396`,
761 файл, HEAD `237386530fd11e359f6f997735537b85e6ccb419`, dirty=true.
Документация и AGENTS не входят в этот source hash; их финальный diff проверен.
Постоянный результат: [consistency-audit-2026-10-23.results.json](consistency-audit-2026-10-23.results.json).
JSON содержит длительности, коды выхода, исключение и SHA-256 исходных логов.

| Команда npm run | Результат |
| --- | --- |
| test:unit | PASS: 823, 0 failures; один optional TON production integration SKIP |
| test:ui | PASS: 37 UI modules, 85 application JSX |
| test:controls | PASS: полная матрица, screenshot-pixel/DPR checks |
| test:details | PASS |
| test:dates | PASS: 85 случаев, включая семь реальных форм и ограничения |
| test:calendar | PASS |
| test:form-actions | PASS, включая StrictMode |
| test:text-edit | EXCLUDED по указанию пользователя; частичный прогон не засчитывается |
| test:notes | PASS |
| test:kanban | PASS |
| test:drag-drop | PASS: полная матрица |
| test:health | PASS |
| build | PASS |
| test:navigation | PASS |
| test:action-rails | PASS: 126 случаев |
| test:identity-reports | PASS: PDF actions, source report layout, Hogan scales |
| test:todo | PASS |
| test:form-pages | PASS, включая источник/scroll restoration |
| test:catalog-page | PASS |
| test:wish-groups | PASS |
| test:drawers | PASS: все реальные формы, полная матрица без фильтров |
| test:contacts | PASS |
| test:contact-notes | PASS: девять viewport cases |

Оба dependency audit: 0 vulnerabilities. Финальные `git diff --check` и
проверка keepalive успешны; API/frontend готовы, persistent service оставлен
работающим. Изменения не закоммичены и не развёрнуты. Полный обычный release gate
не объявляется пройденным из-за явного исключения редакторного теста.
