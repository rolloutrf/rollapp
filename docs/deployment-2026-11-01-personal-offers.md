# Выпуск персональных офферов — 1 ноября 2026

Пользователь запросил деплой и отдельно отменил полный набор проверок. Используется существующий manual `verification=none`, с локальными целевыми проверками. Полный release/comprehensive не повторяется. Сборка образа, OIDC, сериализация rollout, режим schema verify и exact-SHA health сохраняются.

Релиз собран в отдельном worktree с актуальным main `322dac0e58236594e8b0868e52c7eb8afc44464b`. Сохранены подарочные карты, мессенджер, категории бизнеса и Wishlist. Коммит интеграции `543e58b`; во время проверок изменён только presentation fixture: добавлен пустой ответ подарочных карт для нового кошелька. Production API в UI fixtures запрещён.

Персональная рекомендация в действующем Wishlist продавца принимает отдельную цену в роллах и срок. Создаёт фиксированный счёт в той же транзакции, что рекомендация; оплата использует баланс Rollapp и перевод продавцу. Сохранены публикация, собственность товара, seller category/space и согласие покупателя. Отзыв доступа запрещает оплату. Повтор запроса сохраняет ключ; повтор оплаты возвращает прежний результат. Обычный refund не создаёт кредит по персональному заказу без возврата продавцом.

В рамках отдельно разрешённой таблицы `business_personal_offers` явно добавлен источник `wishlist_item_id` с FK и ограничением ровно одного источника; `item_id` допускает NULL для Wishlist. Существующие Wishlist таблицы и данные не изменены. Runtime не выполняет DDL. Реальная READ ONLY проверка production схемы через initializeRuntimeDatabase(mode=verify) прошла, callback миграции запрещён.

Проверки на итоговом дереве:

- 30/30 целевых unit-тестов personal offers/startup/deployment guards — PASS.
- `npm run test:offers:production`: 5/5 PASS на production PostgreSQL; все тестовые записи откатились. Включены Wishlist recommendation, фиксированный snapshot, недостаток средств, повтор, отзыв/восстановление consent, HTTP и пагинация.
- `npm run test:ui` — PASS (37 primitives, 99 application sources).
- `npm run build` — PASS; остаётся предупреждение о размере bundle.
- `npm audit --omit=dev`: 0; полный audit: 8 dev-уязвимостей (2 low, 4 moderate, 2 high), тот же граф актуального main; зависимости не менялись.
- UI offers: восемь viewport, включая 320/390 mobile, 768/820 transition, 1024/1440/1920 desktop и короткое окно. PASS во всех восьми viewport. `npm run test:controls` также PASS, включая pixel/DPR assertions. Проверяемый код/fixture: `f32f76e11898125caac8901c93a6af3a541174bb`, чистое дерево до этой записи.

Один предварительный UI запуск упал из-за отсутствовавшего нового fixture-ответа подарочных карт; исправлен fixture. Следующий запуск прервался ERR_ABORTED при смене URL после закрытия drawer; в smoke добавлено ожидание удаления formScreen из URL после закрытия мобильной формы, без ослабления assertions. Это целевая проверка, не полный аудит приложения.

Исходный dev keepalive сохранён: rf.rollapp.development.92da37f66655, API 8287, frontend 5378, health ready. Release worktree не запускает второй dev service.

Результат rollout и live review записываются после выкладки. Аутентифицированные реальные оплаты не выполняются ради проверки.

Перед rollout подтверждена здоровая версия/rollback `322dac0e58236594e8b0868e52c7eb8afc44464b`, предыдущий workflow 41329088206 завершился success.

## Результат

Выложен immutable SHA `597e064b757aa7345a5b6dd20d82f20f51e0e0fb`. [Workflow 41330063059](https://github.com/rolloutrf/rollapp/actions/runs/41330063059) завершился success в manual verification=none. Public `/api/healthz` подтверждает ok=true, service=rollapp и точный SHA; workflow также проверил канонические redirects. Перезапуск VM вручную не понадобился.

Live browser review 390×844 и 1440×900: закрытая страница кошелька приводит к «Войти в Rollapp», runtime errors и горизонтального overflow нет; screenshots `/tmp/rollapp-offers-production-390.png` и `/tmp/rollapp-offers-production-1440.png`. GET `/api/personal-offers` и `/api/personal-offers/items` возвращают 401 без сессии. Прежний локальный live-review скрипт остановлен из-за неверного ожидаемого заголовка «Вход»; после сверки с исходником использован реальный заголовок, без изменения приложения. Аутентифицированный UI production и реальная оплата не проверялись: нет подходящей бизнес/покупательской сессии; соответствующие сценарии покрыты целевой UI матрицей и rollback-only production DB проверками. Полный аудит намеренно не повторялся.
