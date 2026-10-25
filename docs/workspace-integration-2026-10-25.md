# Объединение рабочих версий — 25 октября 2026

Статус: полный аудит отменён по прямому запросу пользователя «Заддеплой без тестирования». Успех comprehensive не заявляется. Выпуск выполняется отдельно в явном manual mode `verification=none`.

## Проверяемая версия

- Ветка: `codex/consolidate-workspaces-20261025`; PR: https://github.com/rolloutrf/rollapp/pull/13.
- Зафиксированный код: `38cecf62f6a16817b25b32f8a0fece4f57ab3016`.
- Исходная интеграционная копия была чистой, HEAD `f55cce47e5718bc411f39cfc9436930deb152f23`.
- После fetch обнаружен более новый main `9daf0a4`; затем включены `d35e714` и `aaaba0b`.
- Проверены 21 зарегистрированная рабочая копия, 11 с незакоммиченными файлами.
  Снимки и исходные копии сохранены; исходные ветки не сбрасывались и не очищались.
- Полный список копий, исходных SHA, файлов и решений: [JSON](workspace-integration-2026-10-25.json).
- SHA-256 824 исходных/тестовых/конфигурационных файлов:
  `634a9acc7797bc2f9ada9711f43021776211857c2b6e9c5c151b0afeacf6f56f`.
  Датированные отчёты не входят в этот fingerprint.

## Собранные изменения

| Область | Результат |
| --- | --- |
| Характер | Быстрое добавление одним полем, ширина 576px, одна/две колонки, детали личной черты через общий form-surface, отмена/retry/access guards |
| Ценности | Более нового отдельного UI в рабочих копиях не обнаружено; текущий выбор/сохранение сохранены |
| Сон | Общая ширина формы, без лишней вводной шапки и вложенных действий на плашках |
| Питание | Удалён повторный обзор дня, сохранены общая лента дней, итоги и список |
| Wishlist | Общие ленты; корректный смешанный порядок карточки/группы, подтверждение группировки, совпадение меню группы с Close |
| Образование/тренировки/препараты | Общие media/badge/link, корректные статусы/ручки, действия 48px, источники изображений и native drag guards |
| Курсы | Название, организатор, описание и дата с gap 8px; длинные слова/даты остаются внутри узкой колонки |
| Контакты | Цифровая визитка, vCard/JSON, независимая подпись и явный пилотный Testnet registry flow |
| ИПР | Отдельный личный ИПР Идентичности, независимо от карьерного документа |
| Календарь | Захват/preview/grab point/edge-scroll/Undo, сохранение authored minutes и отсутствующего времени, native touch scroll, read-only события устройства |
| Apple companion | Исходники Mac/iOS, scoped device intake, Keychain/EventKit boundaries, pure tests и universal Mac build |
| Общие панели/ленты | Прозрачный фон верхней/нижней навигации; общие tile rails с нативным обрезанием, до 820px от края экрана, на desktop в пределах родителя |
| Поля времени | Общая border-box/appearance композиция, WebKit + Chromium проверки |

Уже опубликованные отчёты личности, перформанс, редактор и горизонтальные ленты
сверены с main. Старые версии общих компонентов/проверок не заменяли новые.
Удалён неиспользуемый статический Hogan/Gallup presentation path с личными данными.

Старые remote `agent/*` проверены через `git cherry`: все исправления эквивалентны
уже имеющимся patch, кроме общего августовского feature commit. Его актуальные
Yandex ID/retailer modules присутствуют; старый ZIP и устаревшие варианты кода
повторно не добавлялись.

## Личные тексты

По прямому уточнению пользователя все личные тексты хранятся в БД. Проверена
настроенная production PostgreSQL: database `rollapp`, role `rollapp_app`, direct TLS.
Существующие career/identity документы и два generated report уже сохранены.
Их содержимое не перезаписывалось. Личный ИПР отсутствовал: импортирована одна
owner-scoped запись `identity/personal-development-plan`; повторный READ ONLY
импорт подтвердил `sameContent: true`. Нужный CHECK уже существовал: DDL,
инициализация схемы, backfill и cleanup не выполнялись.

Личные Markdown, исходные ответы, CV и feedback больше не используются как общий
fallback и не входят в текущую клиентскую сборку. При отсутствии записи остаётся
пустой документ; ошибки API/БД видимы. Проверены семь уникальных текстовых markers
и ещё 749 длинных фрагментов прежних ответов/планов/feedback/отчётов
в 28 JS/sourcemap/HTML файлах сборки: совпадений нет. Личные исходники сохранены приватно вне
репозитория; новый личный Markdown никогда не добавлялся в Git. Старую публичную
историю Git эта работа не переписывает. PDF parser fixtures не импортируются клиентом.

## Найденные при объединении проблемы

1. Старый `touch-action: none` конфликтовал с новой нативной прокруткой календаря.
   Полная gesture матрица воспроизвела отказ на 320px; старое правило удалено,
   отдельная resize-ручка сохраняет собственный touch owner.
2. В компактной карточке курса длинное описание/дата давали scrollWidth 1279px
   при ширине 138px. Сохранены gap и меню; дочерние элементы получили ограничение
   ширины и перенос. Полная матрица snippets прошла без ослабления assertions.
3. Общий tile rail унаследовал 100vw также на desktop. `test:page-scrollers`
   обнаружил clipping ancestor на 1024px, несмотря на отсутствие root overflow.
   Desktop теперь ограничен родителем, screen-edge rule действует до 820px.
4. Объединённые package scripts сохраняют все действующие release/comprehensive
   этапы. Сохранена атомарная изоляция loopback ports для calendar smoke.
5. Полный прогон на чистом `1aebc7f` остановился после 48 минут: старый fixture
   ИПР ожидал личный h3 из удалённого fallback. Fixture теперь явно получает
   синтетический учебный документ; assertions сохранены, product fallback остаётся
   пустым. Изолированный повтор исходного сценария прошёл без API. Qrcode
   добавлен в prebundle редакторного fixture, чтобы новая визитка не вызывала
   позднюю перезагрузку графа модулей. Старый прогон записан как FAILED:
   [JSON](workspace-integration-comprehensive-failed-2026-10-25.json); новый
   comprehensive выполняется с начала, прежний branch run отменён.
6. CI на `7616088` остановился в calendar-gestures 320×900 при ожидании записи
   переноса между днями; локальная матрица до этого проходила. В fixture начальное
   размещение ScrollArea/ResizeObserver могло конкурировать с ручной установкой
   координат. Тест теперь дожидается двух кадров после готовности шрифтов,
   размещает границу дней в доступной ширине и явно подтверждает native hit/capture
   источника и видимость цели. Таймауты и сохранность schedule assertions не
   ослаблены; добавлен failure screenshot/geometry. Причина CI остаётся гипотезой
   до повторного полного immutable run. [Failed CI JSON](workspace-integration-comprehensive-ci-failed-2026-10-25.json).

Локальный повтор начат на чистом `05545e4`. После его календарного этапа изменён
только `scripts/calendar-gestures-smoke.mjs`; код приложения/БД/сборки не менялся.
Этот локальный результат не объявляется полным PASS финального SHA. Новая полная
календарная матрица выполняется отдельно на Mac, а окончательный comprehensive
запущен на неизменяемом `38cecf6` в CI.

## Проверки

| Команда/проверка | Результат |
| --- | --- |
| npm test | 860 pass, 1 existing skip, 0 fail после последней правки прикладного JS; окончательный набор повторяется в comprehensive |
| npm run test:ui | PASS; 37 primitives / 92 application JSX |
| npm run build | PASS; обычное предупреждение о крупных chunks |
| npm run test:calendar | PASS: 14 event + 16 gesture + 16 device UI combinations |
| npm run test:snippets | Полная матрица PASS после исправления курса |
| npm run test:page-scrollers | Полная матрица PASS после desktop rail fix |
| npm run test:action-rails | Полная матрица PASS после desktop rail fix |
| npm run test:todo | Полная матрица PASS после desktop rail fix |
| npm run test:wish-groups | Полная owner/read-only матрица PASS на `7616088` |
| npm run test:contact-cards | PASS на девяти размерах: реальные signature routes, синтетический кошелёк/RPC, file/tamper/retry/mainnet guards |
| npm run test:planning:production | 3 PASS, BEGIN/ROLLBACK, включая device intake/download и изоляцию владельцев |
| zsh native/apple-calendar/test-macos.sh | PASS; без Calendar/Keychain/network access |
| zsh native/apple-calendar/build-macos.sh | PASS, universal arm64/x86_64, ad hoc local signature |
| npm audit --omit=dev | 0 vulnerabilities |
| npm audit | 2 high в dev-only @ton/ton → Zod 3; совместимого исправления нет |
| npm run dev:keepalive:status | Готов, API 8491 / frontend 5491, verify initialization; оставлен работающим |
| git diff --check | PASS |
| check:comprehensive | CANCELLED по прямому запросу пользователя; локальный и [branch audit](https://github.com/rolloutrf/rollapp/actions/runs/40210690011) не объявляются PASS |

SDK wallet constructors перенесены в devDependencies; runtime проверяет те же
четыре официальных bytecode hashes. Unit suite независимо сверяет их с SDK и
проверяет извлечение настоящего public key каждого поддерживаемого кошелька.
Major override уязвимой транзитивной зависимости не применялся.
Источники: [TON wallet hashes](https://docs.ton.org/contracts/standard/wallets/history),
[Zod advisory](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5).

## Живой UI

Существующая авторизованная сессия и настоящий production API, отдельный preview
`http://127.0.0.1:5491`. Проверены все 24 раздела четырёх сфер и calendar/To Do/
Kanban/notes: 320×844, 390×844, 768×844, 820×414, 1024×844, 1440×900,
1920×900 и 1440×400. Документы проверялись после загрузки из API, включая новый
личный ИПР. У контактов ожидались настоящие карточки, а не toolbar/loading shell.
Root overflow и alerts не обнаружены. Для общих лент образования и питания
после последнего CSS fix дополнительно выполнены 32 проверки clipping ancestors.
Просмотрены mobile/desktop screenshots; календарные icon controls имеют 48px.
Окно Apple Calendar открыто и отменено: mobile Back и desktop right Drawer576px.

Личные события/контакты/задачи через UI не сохранялись, device connection не
создавалось, доступ EventKit и реальный кошелёк не подключались. Новые credential
или on-chain операции не выполнялись. Wishlist проверяется полной безопасной
fixture matrix: live mount имеет существующий mutating preview-backfill effect,
поэтому его не запускали ради проверки.

## Ограничения и дальнейшая фиксация

Реальный iPhone/IME/системная клавиатура, EventKit permission и передача личных
календарей, signing/notarization/distribution installer, TON Testnet transaction
и внешний аудит контракта не проверены. Mac artifact собран локально и не
публиковался как installer в production. Полный итоговый comprehensive PASS отсутствует: пользователь явно остановил проверки и запросил выпуск без тестирования. Предыдущие failed/cancelled результаты сохранены как evidence, а не release gate.


## Выпуск по последнему запросу

Пользователь прямо запросил «Заддеплой без тестирования». Локальный audit process
и веточный CI остановлены; постоянный production-connected dev service оставлен.
Полная отдельная календарная матрица на `38cecf6` успела пройти 14+16+16 случаев;
`test:drawers` — 280 PASS, включая десять character-trait layouts. Тесты для нового
выпуска больше не запускаются. Перед rollout реальный existing-schema verify
выполнен READ ONLY, миграции и cleanup запрещены. Предыдущая здоровая production
версия — `315f3ebce4a626a3c61f891db2cb013805883a74`.
