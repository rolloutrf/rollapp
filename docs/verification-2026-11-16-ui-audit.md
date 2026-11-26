# Интерфейсный аудит РОЛЛАПП · 16 ноября 2026

## Область и исходное состояние

Проверяется только приложение РОЛЛАПП и его самостоятельный Storybook: 29 групп модулей, 177 историй. Каталог РОЛЛАУТ, Figma-витрины и Laravel в этот набор не включаются.

- Рабочее приложение: `f55cce47e5718bc411f39cfc9436930deb152f23`, дерево с незакоммиченными изменениями до начала аудита.
- Ветка Storybook: `0825a3282c4606a8484efea3f57dd242efd85645`, `codex/rollapp-storybook`, также dirty до начала работ. Она содержит более широкий набор продуктовых сценариев; общие исправления внесены в обе рабочие копии, специфичные — в соответствующий компонент.
- В основной рабочей копии параллельно менялись другие файлы. Они сохранены; результат нельзя трактовать как проверку чистого коммита или как выпуск всего приложения.
- Источники дизайна: [shadcn/ui](https://ui.shadcn.com/docs), [CSS variables](https://ui.shadcn.com/docs/theming), локальные `components.json`, `docs/design-system.md`, `src/index.css`, `src/typeset.css`, `src/spacing.css`, `src/containers.css` и модульные инструкции.

## Что исправлено

1. **Контраст и темы.** Светлый вторичный текст использует общий `muted-foreground`, ошибки — уточнённый `destructive`. Цены и адреса не приглушаются прозрачностью. У выполненного желания приглушено изображение, текст остаётся читаемым. Доходы PFM/истории получили отдельный цвет для светлой темы. Число выбранного дня наследует цвет выбранной поверхности; соседние дни года сохраняют контраст.
2. **Подписи и управление.** Доступные имена включают видимые подписи, инициалы, дату и выбранное пространство. События календаря и строки операций читаются в порядке отображения. Кнопка очистки Combobox получила русское имя. При недоступности списка городов поле действительно disabled.
3. **Загрузка изображения.** Кнопка shadcn и скрытый file input стали соседними элементами. Устранены вложенные интерактивные элементы и лишняя Tab-остановка; Enter/Space и filechooser проверяются автоматически.
4. **Стабильность Storybook.** Отсутствующий `lists` в деталях карточки больше не создаёт новый массив на каждом рендере. Исправлен формат данных «Четырёх вопросов» и контекст гостевого профиля. Добавлен контроль циклических ошибок React.
5. **Редактор.** Исправлен воспроизводимый сбой немедленного ввода после преобразования текста в раскрывающийся блок: нативный фокус возвращается до применения проверенной транзакции. Проверка дополнительно утверждает реальную вложенность; заголовок, переносы и соседи сохраняются. Два первоначальных прогона падали на reload, после исправления вся матрица базовых блоков прошла на восьми размерах. Промежуточный таймаут загрузки сохранён как непройденный диагностический запуск.
6. **Повторяемая проверка.** Добавлены общий `storybook-readiness.mjs` и `test:storybook:a11y` с axe-core 4.14.0: все истории, две темы, WCAG 2 A/AA и 2.1 A/AA, ошибки рендера и неожиданные запросы к API. JSON отдельно сохраняет случаи, требующие ручной оценки. Проверки ждут реального содержимого lazy-редактора и загрузки продуктового CSS/Geist до измерений; наличие оболочки или раннее разрешение `document.fonts.ready` не считается готовностью. Обновлены модульные инструкции и контракты.

7. **Перетаскивание.** В актуальной ветке Storybook движение карточки к центру цели больше не считается неподвижным удержанием у края. Сохранены обычная перестановка, подтверждение группировки, отмена и обработка ошибки; добавлены медленные непрерывные жесты в полную матрицу.

Сохранены Base Nova / Base UI, Geist, семантическая типографика, 48px ControlBar, общие радиусы и шаблон WishlistSnippet. Изменения цветов выполнены через продуктовую тему shadcn; геометрия upstream-примитивов не переписана.

## Проверки

Полный Storybook smoke: все 177 историй на 390px; десять основных сценариев в восьми размерах (320, 390, 390×400, 768, 820, 1024, 1440, 1920); обзор и по одной истории каждого модуля в светлой теме на 1440px. Всего 277 браузерных проверок. Axe отдельно проходит 354 комбинации: каждая история на тёмном телефоне и светлом desktop.

Первичный статический axe-аудит: 140 из 354 комбинаций с замечаниями, 182 нарушения правил / 519 затронутых узлов. Это диагностическая исходная точка; автоматическая проверка не является сертификацией доступности.

| Проверка | Последний результат | Журнал |
| --- | --- | --- |
| shadcn, приложение | shadcn audit passed (37 UI primitives; 146 application JSX sources scanned). | `shadcn-final-main.log` |
| shadcn, Storybook | shadcn audit passed (37 UI primitives; 197 application JSX sources scanned). | `shadcn-final-storybook.log` |
| Storybook: полная матрица до исправления редактора | 277 browser checks passed. | `storybook-final.log` |
| Storybook: итоговая полная матрица | 277 browser checks passed. | `storybook-public-complete.log` |
| Storybook: итоговая доступность | 354 accessibility checks passed. Automated checks do not replace keyboard and visual review. | `accessibility-public-styles-final.log` |
| Storybook: исправленные dev-сценарии | 4 browser checks passed. | `dev-regressions.log` |
| Storybook: календарь после последней правки | 5 browser checks passed. | `calendar-stories-final.log` |
| Даты, приложение: полная матрица | PASS 1920×844: desktop popover, leap day, clearing, history | `dates-final-main.log` |
| Live login: восемь размеров | PASS live production-backed login 1920 1080 | `live-login.log` |
| Приглашения: полная матрица | PASS draw reduce | `member-invites-final.log` |
| ControlBar: полная матрица и видимые границы | PASS 1920x844: real WishGroupDialog menu/Close share normal, hover and disabled surfaces in both themes; native menu and close | `controls-final.log` |
| Редактор: полная матрица базовых блоков | PASS Notion basic blocks 1920x844: code/divider/table via slash and shared picker, immediate typing, native Tab, separate Undo, saved Markdown reload | `editor-basic-blocks-final-main.log` |
| Даты, Storybook: полная матрица | PASS date-bounds 1920: keyboard, inclusive min/max, disabled and no writes | `dates-final-storybook.log` |
| Сон и питание: полная матрица | PASS sleep midnight (2200ms startup delay): selection follows today automatically without API writes | `health-final.log` |
| Формат доказательств наград | OK | `reward-proofs-final.log` |
| Панели действий: полная матрица | Action-rail fixture closed | `action-rails-final.log` |
| Отчёты личности: полная матрица | PASS 390x400: create/error/rename/PDF/selection/delete/cancel/overflow | `identity-reports-final.log` |
| Сборка приложения после исправления редактора | ✓ built in 2.96s | `build-post-editor-main.log` |
| Сборка приложения в ветке Storybook | ✓ built in 15.09s | `build-post-drag-storybook.log` |

`npm test` основной копии: 798 тестов, 797 passed, 1 skipped, 0 failed. Unit-матрица ветки Storybook: 1075 тестов, 1073 passed, 2 skipped, 0 failed. Обе сборки приложения выполнены; предупреждения о размере bundle не скрыты.

Первоначальный `check:comprehensive` основной копии (`comprehensive-before.log/json`) остановился на воспроизводимом дефекте преобразования текста во вложенный раскрывающийся блок. Повтор подтвердил дефект; после исправления полный набор базовых блоков прошёл в `editor-basic-blocks-final-main.log` (восемь размеров, включая 390×400). Промежуточный запуск остановился на загрузке страницы и сохранён отдельно. Полный `test:text-edit` ветки Storybook запущен заново с начала и завершён успешно, включая все основные и короткие размеры, обе темы и пиксельную проверку выделения при DPR 3.

Первоначальный полный запуск ветки Storybook (`comprehensive-storybook.log/json`) выявил устаревшее ожидание подписи регистрации. После исправления `test:member-invites` повторён целиком. Продолжение (`comprehensive-continuation.log/json`) обнаружило гонку ожидания возврата формы в проверке ControlBar и старую подпись пустой даты; обе проверки исправлены без ослабления геометрии/сценариев и повторены полностью. Матрица действий форм завершилась успешно. Проверка сна обновлена для сохранённого статуса в `aria-description` и повторена полностью вместе с питанием: `health-final.log`. Первый drag/drop-прогон остановился на подтверждении группировки 768px, следующий — на 767px. Отдельные диагностические матрицы прошли, однако полного успешного результата тогда не было. Проверка непрерывного 24-шагового движения также воспроизвела преждевременную перестановку. В ветке Storybook исправлено различение движения к центру и удержания у края: накопленное продвижение внутрь более 2 CSS px обновляет период ожидания, касательное движение и дрожание сохраняют его. Исходные 24-шаговые проверки восстановлены полностью; на 320/1440px добавлен медленный путь с 35ms на шаг. 12 unit-проверок логики и вся unit-матрица прошли. Первый полный повтор после исправления прошёл 320px, но остановился на смешанной сетке 390px; восемь отдельных повторов этого сценария прошли. Итоговая полная матрица прошла на 320, 390, 767, 768, 820 (короткий экран), 1024, 1440 и 1920px: `drag-intent-full-trace-2.log`, exit 0. Исполнялась точная копия полного `drag-drop-smoke.mjs` с дополнительной записью геометрии указателя, без фильтров или сокращения утверждений; копия и SHA исходного теста сохранены в `drag-full-instrumented.mjs` и `drag-final-result.json`. Первый диагностический запуск остановился из-за временного обработчика логирования без null-guard, что исправлено только в диагностике. Первоначальные таймауты сохранены; один успешный прогон не доказывает отсутствие всех редких зависимостей от тайминга. В основную ветку приложения новая логика не переносилась.

В профиле первоначальная проверка горизонтального переполнения ошибочно считала `sr-only`-подписи квитанций видимым контентом. Диагностика вывела точные элементы и размеры. Исключение ограничено фактически скрытыми абсолютными элементами 1×1px с каноническим clip/clip-path; обычный видимый и обрезанный контент проверяется без изменений. Полный повтор — `profile-final-recheck.log`.

Полные повторы панелей действий и отчётов личности прошли после обновления ожиданий доступных имён/описаний и наследуемого цвета выбранного дня. Геометрия, типографика, клавиатура, сохранение, ошибки и сценарии отмены в тестах не сокращались. В сценариях публикаций/настроения профиля зафиксированы таймауты при высокой нагрузке; выполнены полные повторы с отдельными журналами и статусами ниже. После форм только начавшийся редактор был остановлен для перераспределения проверки и запущен целиком с начала. `comprehensive-parallel.json` фиксирует остальные команды и повторы, выполненные по две одновременно, без фильтров viewport; отдельные диагностические повторы имеют собственные журналы. `comprehensive-aggregate.json` объединяет результаты, сохраняя ссылки на исходные неуспешные журналы; это не доказательство единого чистого release-коммита.

Визуально просмотрены мобильные и настольные формы входа, доставка, карточки, чекаут, To Do и календарь; изображения сохранены в `final-screens`, `mobile-review.png`, `desktop-review.png`. Живая страница входа на production-backed dev проверена во всех восьми размерах без записи данных. Авторизованный рабочий вишлист просмотрен только read-only. Keepalive оставлен включённым; API и frontend подтвердили готовность после временной задержки ответа при проверках.

## Зависимости

| Область | Low | Moderate | High | Critical |
| --- | ---: | ---: | ---: | ---: |
| Приложение, все зависимости | 2 | 4 | 0 | 0 |
| Приложение, production | 0 | 0 | 0 | 0 |
| Storybook, все зависимости | 2 | 7 | 2 | 0 |
| Storybook, production | 0 | 0 | 2 | 0 |

Совместимые обновления tooling применены с lockfile; принудительные понижения shadcn/Storybook и несовместимая подмена вложенного Zod не выполнялись. В ветке Storybook остаётся предупреждение цепочки `@ton/ton → zod`, для которой npm не предлагает исправления; это отдельная зависимость приложения, не работа публичного статического Storybook. Полные результаты — четыре `audit-*-after.json`.

Проверка `test:reward-proofs` первоначально не нашла Python runtime по серверному пути. Установка в новом venv остановилась на TLS-соединении с PyPI; проверка сертификатов не отключалась. Найдено существующее `/tmp/rollapp-modules-release-tools/ots-venv` с точными opentimestamps 0.4.5, python-bitcoinlib 0.12.2 и pycryptodomex 3.24.1. С `ROLLAPP_OTS_PYTHON=/tmp/rollapp-modules-release-tools/ots-venv/bin/python` все три codec-теста прошли; сеть и БД им не нужны. Пустое окружение не оставлено в рабочей копии.

## Уточнение проверки опубликованной версии

Визуальный просмотр обнаружил слишком ранний снимок редактора — ещё со статусом загрузки. Введено общее ожидание содержимого для редактора, «Четырёх вопросов» и текстовых разделов карьеры. Первая усиленная публичная smoke-матрица выявила ошибку диагностического селектора reader (он выбирал скрытый служебный h1 Storybook) и таймаут начальной загрузки; селектор ограничен `#storybook-root`. Следующая полная матрица прошла.

Первая полная публичная axe-матрица с ожиданием редактора дала 353/354: в каталоге модулей один раз отсутствовал продуктовый CSS, что воспроизвёл отдельный снимок. Повторное открытие показало правильный CSS и Geist, без ошибок сети. Добавлена обязательная проверка фактического CSS/шрифта перед сканированием; повторная полная публичная smoke-матрица дала 277/277. Итоговый полный публичный axe-повтор — **354/354, 0 нарушений и 0 ошибок** (`accessibility-public-styles-final.log/json`); финальный smoke после ожидания CSS и шрифтов — **277/277** (`storybook-public-complete.log`). Исходные ошибки не удалены и не маскируются автоматическими retry. При проверке публикации редактор и вопросы также дожидаются реального содержимого; снимки в `release-drag/` обновлены.

## Границы результата

OAuth у внешних провайдеров, реальные платежи, отправка приглашений, фактическая загрузка файлов и аппаратная клавиатура/IME мобильных устройств не выполнялись. Storybook использует явные UI-сценарии и блокирует API; они не подменяют production БД приложения. Миграции, backfill и запись проверочных данных не запускались. Работа с БД ограничена существующим подключением и read-only диагностикой.

Для публикации подготовлено 183 файла статического Storybook (без архива расширения, wallet manifest и source maps). SHA-256 `index.json`: `b37a70d36f374a8845f24eab86f8344f7ac69bc5b816166767fd02ee907e19c9`. Ресурсы загружаются перед входными файлами; прежние ресурсы сохраняются для восстановления. Публикация и итоговые полные проверки зафиксированы ниже.

Локальные доказательства аудита: `/tmp/rollapp-ui-audit-2026-11-16/`. Файлы `status-before.txt`, `diff-before.patch`, `before/` и `our-diff.patch` сохраняют исходное состояние и изменения аудита.

## Публикация

Обновлён [сторибук.роллапп.рф](https://сторибук.роллапп.рф/). HTTPS-проверка 2026-11-16T13:42:00.956Z: все четыре входных файла совпали со сборкой по SHA-256, имеют `Cache-Control: no-cache`. Проверены шесть историй через настоящую оболочку Storybook и iframe, без ошибок JavaScript. Файлы предыдущей версии сохранены в `release-drag/rollback/`; старые ресурсы не удалялись. Основное приложение на production этим действием не выпускалось.

Финальный автоматический результат: **354 / 354 пройдены, 0 нарушений правил, 0 ошибок загрузки**. Сохранены 217 записей `manualReview`: контраст на сложных поверхностях, семантика подписанных контейнеров, скрытые фокусируемые элементы в закрытых/модальных состояниях, условные `aria-controls`, графические ссылки и отдельные loading-экраны. Это не подтверждение полного соответствия WCAG; ручная оценка всего набора со скринридером и реальным устройством остаётся вне выполненной проверки. Первый повтор имел один таймаут локальной навигации. После финального исправления редактора первая повторная матрица остановила два сценария входа на загрузке при высокой нагрузке; ещё один полный запуск прошёл все 354 комбинации без изменения правил и таймаутов. Все журналы сохранены.

## Статус расширенного набора

Обновлено: 2026-11-16T13:49:06.048763+00:00. Полные команды по состояниям: passed: 52.

| Команда | Статус | Журнал |
| --- | --- | --- |
| `test:unit` | passed | `unit-post-drag-storybook.log` |
| `test:private-data` | passed | `comprehensive-storybook.log` |
| `test:private-history` | passed | `comprehensive-storybook.log` |
| `test:ui` | passed | `comprehensive-storybook.log` |
| `test:product-suggestions` | passed | `comprehensive-storybook.log` |
| `test:stars` | passed | `comprehensive-storybook.log` |
| `test:ton-topup` | passed | `comprehensive-storybook.log` |
| `test:gifts` | passed | `comprehensive-storybook.log` |
| `test:business-accounts` | passed | `comprehensive-storybook.log` |
| `test:member-invites` | passed | `parallel/29-test-member-invites.log` |
| `test:accounts` | passed | `comprehensive-continuation.log` |
| `test:snippets` | passed | `comprehensive-continuation.log` |
| `test:page-scrollers` | passed | `comprehensive-continuation.log` |
| `test:lab-results` | passed | `comprehensive-continuation.log` |
| `test:controls` | passed | `controls-final.log` |
| `test:details` | passed | `comprehensive-continuation.log` |
| `test:offers` | passed | `comprehensive-continuation.log` |
| `test:dates` | passed | `dates-final-storybook.log` |
| `test:time-inputs` | passed | `comprehensive-continuation.log` |
| `test:calendar` | passed | `comprehensive-continuation.log` |
| `test:profile-publications` | passed | `parallel/30-test-profile-publications.log` |
| `test:profile-mood` | passed | `parallel/31-test-profile-mood.log` |
| `test:form-actions` | passed | `comprehensive-continuation.log` |
| `test:text-edit` | passed | `parallel/00-test-text-edit.log` |
| `test:notes` | passed | `parallel/01-test-notes.log` |
| `test:kanban` | passed | `parallel/02-test-kanban.log` |
| `test:drag-drop` | passed | `drag-intent-full-trace-2.log` |
| `test:snippet-badges` | passed | `parallel/04-test-snippet-badges.log` |
| `test:health` | passed | `health-final.log` |
| `test:medication-photos` | passed | `parallel/06-test-medication-photos.log` |
| `test:contact-cards` | passed | `parallel/07-test-contact-cards.log` |
| `test:stories` | passed | `parallel/08-test-stories.log` |
| `test:need-rewards` | passed | `parallel/09-test-need-rewards.log` |
| `test:reward-proofs` | passed | `reward-proofs-final.log` |
| `build` | passed | `build-post-drag-storybook.log` |
| `test:applications` | passed | `parallel/12-test-applications.log` |
| `test:private-notes` | passed | `parallel/13-test-private-notes.log` |
| `test:navigation` | passed | `parallel/14-test-navigation.log` |
| `test:action-rails` | passed | `action-rails-final.log` |
| `test:identity-reports` | passed | `identity-reports-final.log` |
| `test:todo` | passed | `todo-final.log` |
| `test:form-pages` | passed | `parallel/18-test-form-pages.log` |
| `test:catalog-page` | passed | `parallel/19-test-catalog-page.log` |
| `test:wish-groups` | passed | `parallel/20-test-wish-groups.log` |
| `test:profile-wishlists` | passed | `parallel/21-test-profile-wishlists.log` |
| `test:drawers` | passed | `parallel/22-test-drawers.log` |
| `test:orders` | passed | `parallel/23-test-orders.log` |
| `test:purchase-history` | passed | `parallel/24-test-purchase-history.log` |
| `test:contacts` | passed | `parallel/25-test-contacts.log` |
| `test:contact-notes` | passed | `parallel/26-test-contact-notes.log` |
| `test:messenger` | passed | `parallel/27-test-messenger.log` |
| `test:profile` | passed | `profile-final-recheck.log` |
