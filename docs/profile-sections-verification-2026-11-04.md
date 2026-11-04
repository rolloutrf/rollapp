# Вложенные настройки профиля — 4 ноября 2026

Исходный commit: `f55cce47e5718bc411f39cfc9436930deb152f23`.
До начала работы дерево было чистым; проверки выполняются с незакоммиченными
изменениями этой задачи. Выпуска/деплоя не выполнялось.

## Изменения

- Четыре независимые секции установленного shadcn Accordion: персональная
  информация, OpenRouter, Yandex ID, заказы. Персональная секция открыта первой.
- Панели остаются смонтированными: переключение сохраняет черновики профиля
  и OpenRouter. Ошибка нативной валидации синхронно раскрывает скрытое поле.
- Общий Save сохраняет профиль; OpenRouter использует прежнее собственное
  сохранение. Провайдер Yandex показывает проверку доступности/недоступность.
- Заказы открывают существующую `/app/orders`; незавершённая операция или
  изменения персональных данных блокируют уход с пояснением.
- Сохранены общие MobileFormPages, ScrollArea и DrawerFooter/ControlBar.
- Добавлена component-only проверка `test:profile` в `check:comprehensive`.

## Проверки

- `npm ci --no-audit --no-fund`: PASS.
- `npm run test:ui`: PASS. Найденное первым полным запуском нарушение
  styled-link контракта исправлено: переход реализован нативным Link с
  `cn(buttonVariants(...))`, без Button render Link.
- `npm run test:profile`: полная матрица 320×568, 390×844, 768×900,
  820×900, 1024×768, 1440×900, 1920×1080, 390×400, 1440×400.
  Проверяются независимые секции, сохранность черновиков, клавиатурное
  раскрытие, валидация скрытого поля, подключённый/недоступный Yandex,
  ошибка OpenRouter, блокировка/переход к заказам, геометрия и достижимость
  logout над фиксированными действиями. Настоящая форма с явным UI transport;
  реальные API запрещены, никаких тестовых записей в БД.
  Лог: `/tmp/rollapp-profile-smoke-final.log`; снимки
  `/tmp/rollapp-profile-menu-{width}x{height}.png` и
  `/tmp/rollapp-profile-{width}x{height}.png`. Снимки desktop/mobile просмотрены.
- Production dev: конфигурация из основного checkout, отдельные PORT=8791 и
  ROLLAPP_DEV_FRONTEND_PORT=5791 в игнорируемых env-файлах этой копии.
  Реальные listener и `dev:keepalive:status` проверены; API health 200.
  Startup: `Existing PostgreSQL schema verified without migrations or data cleanup.`
  Постоянный сервис оставлен включённым.
- `npm run check:comprehensive`: **FAILED**, остановился в календаре на
  390×400: `writes(3)` после ArrowDown на resize-handle, строка 59,
  timeout 90000ms. До остановки: unit 789 PASS / 1 skip / 0 fail,
  shadcn PASS, полные controls/detail-actions/date-picker матрицы PASS.
  Повтор `CALENDAR_WIDTHS=390 npm run test:calendar` прошёл 390×900 и 390×400;
  это диагностика и не заменяет полный comprehensive. Оставшиеся этапы
  comprehensive, включая text-edit/drag-drop/navigation, не выполнены этим запуском.
  Машинный отчёт `/tmp/rollapp-profile-comprehensive.json`, полный лог
  `/tmp/rollapp-profile-comprehensive.log`.
- `npm run test:form-actions`: два отказа; screenshot в catch скрывал исходную
  ошибку ожиданием fonts. Временная диагностическая копия (удалена после проверки)
  показала первичную ошибку: `page.goto` первого task fixture не достиг `load`
  за штатные 10000ms. Тайм-ауты и проверки не ослаблялись. Полная form-actions
  матрица не подтверждена; профильный fixture отдельно проверил сохранность,
  нативную валидацию и достижимость действий на всех девяти размерах.
- `npm run build`: PASS после обновления lockfile (Vite 8.3.5).
- `git diff --check`: PASS.

## Зависимости

Выполнены оба `npm audit` и `npm audit --omit=dev`. После совместимого
`npm audit fix --ignore-scripts` production audit: **0**. Полный audit:
**6** (2 low, 4 moderate), только tooling-цепочка shadcn/ts-morph/minimatch/deepmerge.
Повторный обычный audit fix не исправляет оставшиеся предупреждения;
предлагаемый force откатывает shadcn до 1.0.0 и не применялся.
В lockfile совместимо обновлены Vite 8.1.5→8.3.5, Zod 4.4.3→4.6.7,
body-parser 2.3.0→2.4.0, systeminformation 5.33.1→5.33.19 и shadcn 4.22.1→4.23.0.
Отчёты: `/tmp/rollapp-profile-audit-final.json`,
`/tmp/rollapp-profile-audit-production-final.json`.

## Ограничения

Существующей авторизованной browser-сессии для этой копии нет: authenticated
live-профиль не проверен. Production соединение/схема/health проверены;
поведение настоящей формы проверено отдельно UI transport без записи данных.
Сохранение профиля, реальные загрузки, изменение ключей, Yandex OAuth и операции
с заказами намеренно не выполнялись на пользовательских данных.
Base UI в reduced-motion fixture сообщает о совместном наличии CSS animation
и transition у Accordion (общий upstream preset/reduced-motion CSS); функциональные
проверки раскрытия/скрытия проходят. Реальная мобильная клавиатура не проверена.

Дополнительный полный повтор calendar остановлен по просьбе пользователя:
«Не надо проводить полную диагностику». Последующие общие проверки не запускались.
Итог задачи основан на прошедшей полной профильной матрице (9 viewport),
unit/UI-контрактах, сборке и проверке production-соединения; полный аудит
приложения не заявляется.

## Подготовка production выпуска

По запросу «Деплой», с сохранением просьбы не проводить полную диагностику,
изменение перенесено отдельным commit поверх актуального main2066aad.
Сохранены upstream PlanningDatePicker в профиле, остальные новые функции
и актуальный lockfile main (без отката зависимостей). Добавлен точечный
`verification=profile`: unit/UI/controls/profile/build, без comprehensive.

После переноса на актуальный код: `npm ci`, `test:ui`, `test:profile`
(9 viewport) и `build` PASS. `initializeRuntimeDatabase` выполнен напрямую
на production-конфигурации с `ROLLAPP_DATABASE_INITIALIZATION=verify`,
PG_POOL_SIZE=1 и запрещённым migrate callback: PASS, только READ ONLY.
Навигационный бюджет нового profile fixture приведён к принятому 90s
для холодного App import, interaction assertions остаются 10s.
Перед геометрией fixture ждёт завершения анимации Accordion; все размеры
и прежние границы сохраняются. Upstream4759fc6 с исправлением календаря
также сохраняется при интеграции; новый общий аудит не запускается.
