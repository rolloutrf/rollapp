# Проверка потребностей и обеспеченных наград, 1–2 ноября 2026

## Проверяемый код и окружение

Основа: `f55cce47e5718bc411f39cfc9436930deb152f23`, ветка `codex/need-rewards-20261101`. Начальный workspace чистый; проверялся dirty-кандидат. Это не проверка закоммиченного или развёрнутого релиза. Хеши исходников и результаты находятся в соседнем JSON-отчёте.

Node v22.22.3. Production PostgreSQL по прямому TLS; DEMO_MODE=false, ROLLAPP_DATABASE_INITIALIZATION=verify, PG_POOL_SIZE=1. Собственная постоянная служба API 8106 / Vite 5206 оставлена включённой. Игнорируемая .env.local содержит конфигурацию без переноса секретов в отчёт. Установлен отдельный игнорируемый Python runtime .runtime-ots.

Миграция отдельно разрешена пользователем. До DDL проверены current_database(), current_user и существующая users. Добавлены только пять feature-таблиц reward_* с индексами/ограничениями; существующие балансы не изменялись. Автоматический startup и обычный deployment остаются read-only verify, без миграций/backfill/cleanup.

## Завершённые проверки

| Проверка | Результат |
| --- | --- |
| npm test, итоговый код | PASS: 801 passed, 0 failed, 1 skipped, 802 total |
| npm run test:ui | PASS: 37 primitives, 80 application JSX sources |
| npm run test:need-rewards | PASS: 96 cases, восемь viewport, API запрещён |
| PG_POOL_SIZE=1 npm run test:need-rewards:production | PASS: 13 subtests + parent, 14 total; реальный PostgreSQL, BEGIN/ROLLBACK, без DDL |
| npm run test:reward-proofs | PASS: 3 Python codec tests |
| npm run build | PASS; остаётся существующее предупреждение большого bundle |
| npm run check:comprehensive | PASS: все 10 этапов, полные матрицы |
| npm audit --omit=dev | PASS: 0 vulnerabilities |
| npm audit | 6 dev findings: 2 low / 4 moderate; 0 high / critical |
| pip-audit pinned runtime | PASS: 0 findings в трёх зависимостях |
| Docker linux/amd64 build и offline runtime | PASS, подробности ниже |
| git diff --check | PASS |
| dev:keepalive:status | PASS, API и frontend готовы; служба оставлена включённой |

Полный comprehensive: 2026-11-01T20:57:55Z–22:26:45Z. Авторитетный результат сохранён в /tmp/rollapp-need-rewards-comprehensive.json и вложен в соседний JSON. Во время общего прогона дорабатывался изолированный новый модуль. Новые rewards/codec команды добавлены в check:release уже после запуска его shell-цепочки; на итоговом коде они, unit, production integration, shadcn audit и build выполнены отдельно. Не выдавать этот набор за один прогон неизменённого committed SHA.

Новая UI-матрица: 320×740, 390×844, 768×1024, 820×1180, 1024×768, 1440×900, 1920×1080, 390×400. Проверены personal/business, формы, согласие, payload, доступность награды/спор, matched, queued/pending/confirmed, empty/loading/error/disabled; размеры 48px, текст 18/28, padding24, overflow/clipping. Просмотрены снимки desktop,390px,320px, включая Bitcoin state. /tmp/rollapp-need-rewards — презентационные fixtures, а не подмена БД приложения.

Production integration покрывает роли/приватность, отсутствие наград за публикацию, лимиты/резерв, replay/conflict, запрет self-offer/двойного выбора, раннюю выплату, спор и оба операторских решения, предельные балансы, выплату/возврат ровно один раз, истечение, ledger/history/feature flags, outbox lease/retry и приватные квитанции.

Дополнительный headless UI использует настоящие NeedRewardsPage, API handlers и production PostgreSQL внутри одной общей BEGIN/ROLLBACK: 55 тестовых потребностей, вторая страница и сохранение черновика, отправка бизнес-оффера, принятие, передача, подтверждение, получение 10 роллов, скачивание JSON и проверка его digest, новая публикация без эмиссии. Семидневный срок сдвинут только у своей временной записи внутри этой транзакции. API responses не имитируются. Аутентификация harness ограничена созданными временными идентичностями через cookie локального тестового сервера; настоящая пользовательская сессия не копируется. Все тестовые записи и переводы откатились; внешний proof worker не запускался на незафиксированных данных.

Первичный live UI проверен в настоящей существующей сессии: загрузка раздела, открытие/закрытие формы, переход из кошелька, 320px geometry без записей данных. Позднее Mac заблокирован, CUA возвращал browser.user is unavailable; финальный ручной просмотр нового Bitcoin текста в этой сессии не заявляется. Headless production UI выше выполнен независимо от неё.

## Bitcoin и runtime

Свежая синтетическая canary, не связанная с аккаунтом/оффером приложения, прошла реальный цикл stamp→pending→upgrade→confirmed. SHA256: `e5c588469ae4599b015ff5b085fe4d3e284f21210ca28923f0c9b48adee15a8f`. JSON и стандартный .ots сохранены в [evidence](evidence/need-rewards-canary-2026-11-02.json) и [доказательстве](evidence/need-rewards-canary-2026-11-02.json.ots).

Итог advanceRewardProof: confirmed, block 974180, hash `000000000000000000008a163ee0232f0d0911abc212c6b1d7f672a3d89a7242`, timestamp1793568628, verification=two-explorer-headers, proof2412bytes. Проверены реальные операции OpenTimestamps до Merkle root, hash/header по Blockstream и mempool, минимум шесть подтверждений. Ранее pending не выдавался за confirmed. Bob tx: `8b95624935d0b44822b265cb5638fc7754fd14a52c509d3053f35eafd745d02b`; alice tx: `dc8e968dde6a8a80642b639a650c10bd6cb9a619ad042495778158265a38362b`. Независимо проверен исторический reference proof из официального OpenTimestamps repo до блока358391.

docker build --platform linux/amd64 --tag rollapp-need-rewards-verification:20261102: PASS. Итоговый image: `sha256:7c5ad508c9bee3bd58ce55b9cfc1794fc97a39a50e5d44579af58f74c5cd6e6e`. ARM Mac/Colima с amd64 эмуляцией; 3 codec tests выполнены в образе после удаления compiler/build packages. Финальный Node→Python bridge в образе с --network none и без БД успешно прочитал реальный confirmed .ots, проверил digest binding и нашёл две Bitcoin attestations. Дополнительные pending leaves в .ots не отменяют проверенные Bitcoin attestations. Один диагностический запуск с пустым attestation был корректно отклонён codec; исправлен вход команды, не validator.

Временные контейнеры удалились через --rm; других запущенных контейнеров перед остановкой Colima не было. Colima возвращена в исходное выключенное состояние. Исходные images/контейнер/том не удалялись; образ не публиковался. Production VM не затрагивалась.

## Найдено и исправлено

- UUID/text mismatch в UNION wallet history: ledger UUID явно cast в text; реальная PostgreSQL проверка повторена.
- Длинные подписи на320px: сокращён видимый текст с полными aria labels, общими PageActionButton padding24 и48px контролами.
- Неопределённый POST и следующий failed GET: intent сохраняется до dispatch и повторяется тем же key/payload; успешная форма очищается независимо от следующего чтения.
- Тихий refresh мог свернуть вторую страницу/сбросить ввод: сохранён загруженный диапазон, refresh приостанавливается для draft/selection/expanded feed; проверено реальным UI.
- Transfer response терял wallet feature flags: GET и POST используют общий features(), проверены transfer/replay.
- Pending OTS commitment бывает52bytes, а не32: отдельно валидируется ограниченное сообщение и SHA256 digest; проверено настоящими календарями.
- Production pool53300: для отдельных integration/migration использовался один клиент и временно останавливалась только своя служба. После проверки восстановлена; чужие службы не завершались, PID-файлы вручную не удалялись.
- Test harness исправлен: ожидание фактического роста DOM после pagination; временная cookie-auth для browser download вместо custom header. Проверки не ослаблены, итоговый полный сценарий прошёл.
- Совместимые npm audit fix без --force устранили production findings. Остаток только dev shadcn4.23.0→ts-morph/common→minimatch и registry→deepmerge. Принудительного несовместимого downgrade нет. Первичные advisories: [deepmerge](https://github.com/advisories/GHSA-gcqx-w48m-w2h4), [minimatch](https://github.com/advisories/GHSA-g3hv-75wg-m249).

## Границы результата

Production UI/VM не развёрнуты: отдельно применена additive schema и проверен локальный код с production БД. Deployment template подготовлен; rollout требует exact SHA health и live проверки по runbook. Рабочие изменения не закоммичены и не отправлены в remote.

Роллы и резерв остаются в PostgreSQL; Bitcoin подтверждает существование файла, а не реальность/качество услуги, денежную оплату, личность эмитента или криптовалютное обеспечение. Проверка использует два обозревателя, собственной Bitcoin Core нет. Выводимой криптовалюты и новой токен-эмиссии нет. Существующие welcome/wishlist акции не изменены.

ROI/retention и устойчивость маховика требуют пилота с настоящими бизнесами. В версии нет автоматического арбитража, проверки внешней доставки/оплаты и полноценной защиты от сговора связанных аккаунтов. Реальные устройства/IME и финальная существующая CUA-сессия при заблокированном Mac не проверены.
