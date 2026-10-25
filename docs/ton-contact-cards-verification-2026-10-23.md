# TON Testnet визитки — проверка 2026-10-23

Base commit `237386530fd11e359f6f997735537b85e6ccb419`, ветка
`codex/portable-contact-card`, dirty workspace. Точные SHA-256 исходников и
машиночитаемый статус: [JSON](ton-contact-cards-verification-2026-10-23.json).
Отчёт продолжает неподписанный этап; его незавершённый полный прогон был
остановлен при переходе к новой реализации и не считается PASS.

## Выполнено

- `npm test`: 840 tests, 839 pass, 1 skip; база данных не используется.
- `npm run test:ui`: PASS, общие shadcn primitives сохранены.
- `npm run build`: PASS, остаётся предупреждение о больших chunks.
- `npm run test:contact-cards`: PASS всех девяти размеров 320×844, 390×844,
  768×844, 820×844, 1024×844, 1440×844, 1920×844, 1440×400, 390×400.
  Реальные HTTP обработчики/Ed25519; синтетический кошелёк и RPC заданы явно.
  Проверены Mainnet rejection, отказ и повтор, подмена подписи, настоящий download,
  проверка загруженного файла, связанное обновление версии, отдельный запрос
  транзакции и отсутствие ложного подтверждения, гостевой доступ и геометрия.
- Офлайн CLI: валидный синтетический файл exit 0, подменённый exit 1, без БД/сети.
- `npm audit` и `npm audit --omit=dev`: 0 vulnerabilities.
- `npm run test:contacts`: PASS 18 records, девять размеров в обеих темах.
- `npm run test:action-rails`: PASS 90 records.
- `git diff --check`: PASS на момент записи.

Unit suite включает воспроизводимость компиляции Tolk 1.5.0, права и версии
реестра, смену владельца, recovery/veto/ожидание, bounced messages, отказ при
чужом bytecode и положительный/отрицательный matching ответа RPC. Исправлены
ошибки самих проверок: сравнение Address через raw representation, корректный
bounced Message и текущее время исторического fixture в RPC тесте.

Код контракта SHA-256:
`3c56f5f3eb0c21f0061137182c0800170453d27e7903c8f411c7d911ae78983c`.
Runtime проверяет актуальность source/artifact; Docker включает оба файла.

## Live review

Перезапущен только dev service этой checkout, сохранён production PostgreSQL
direct TLS / initialization=verify, API 8340 и frontend 5340. Keepalive подтверждает
готовность обоих сервисов. Схема, контакты, профиль и доступы не изменялись.
Production deployment не выполнялся.
В существующем dev log встречались временные PostgreSQL pool-limit ошибки
53300 (20 active clients). Текущий read-only `/api/healthz` повторно выполнил
`SELECT 1` и вернул HTTP 200 / ok=true в 20:43 UTC. Чужие сессии не завершались,
лимиты не менялись, fallback database не использовалась.

Настоящая сессия владельца открыла визитку и экран TON: Tonkeeper и My Wallet
доступны после проверки публичного manifest. Подключение реального кошелька,
подпись и отправка транзакций не выполнялись. Сохранён и просмотрен screenshot
`/tmp/rollapp-ton-card-live-2026-10-23.png`; также визуально просмотрен 320×844
fixture с полным review реестра. Прокручивается только тело Dialog, footer доступен.

## Полная матрица

`ROLLAPP_CHECK_OUTPUT=/tmp/rollapp-ton-card-comprehensive.json npm run check:comprehensive`
запущена без фильтров. Лог `/tmp/rollapp-ton-card-comprehensive.log`.
[Живой JSON полного прогона](ton-contact-cards-comprehensive-2026-10-23.json)
обновляется самим runner; это источник его текущего статуса.
На момент записи выполняется; завершённый PASS не заявляется. Итог будет
перенесён в этот отчёт и JSON после окончания.

## Границы

Реальный Testnet deploy и on-chain confirmation, реальный семидневный recovery,
телефонный QR, импорт в адресную книгу и системный Share iOS/Android не проверены.
Внешнего аудита контракта нет. Mainnet недоступен в реализации.

UI поддерживает первичное развёртывание реестра. UPDATE/ROTATE/RECOVER контракта
проверены в sandbox; UI этих действий и перехода истории файлов после смены
ключа ещё нет. Подписанное обновление файла создаёт новый registry при подготовке,
не изменяет существующий контракт. Нет импорта в БД, автоматических обновлений
чужих контактов, DID или независимой доставки файлов.

Подпись подтверждает контроль ключа в момент подписания, не личность человека.
Advisory registry locator не подписан; любое утверждение о текущей регистрации
требует свежей проверки Testnet RPC. Запрос транзакции и подтверждение разделены.
Nonce/ticket Map не является БД, теряется при restart и fail-closed между workers.

Технический контракт и операции: [contact-cards.md](contact-cards.md).
