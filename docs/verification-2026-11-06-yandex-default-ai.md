# Yandex default AI — проверка 2026-11-06

Исходный checkout: `f55cce47e5718bc411f39cfc9436930deb152f23`, clean.
Перед реализацией ветка `codex/yandex-default-ai` создана от актуального
`origin/main`, `1012857f71b443fd8ffb9af9847fa63f005e044c`, clean.
Проверки ниже выполнены на этом SHA с dirty-изменениями данной интеграции;
это не утверждение о проверке чистого опубликованного SHA.

## Реализовано

- Alice AI LLM Flash в Yandex AI Studio для ассистента и товарного поиска
  до подключения личного OpenRouter. Личный провайдер имеет приоритет;
  его upstream-ошибка не вызывает запрос за счёт общего провайдера.
- Краткоживущий IAM через metadata/локальный yc CLI, обновление токена,
  таймауты, отмена, скрытие ошибок upstream, отключение логирования содержимого.
- Веб-поиск с ограничением доменов/числа вызовов; фильтрация прямых карточек
  по поисковым цитатам. Строгая structured-output схема подавляла поиск в
  части живых проб, поэтому JSON проверяется локально после генерации.
- Runtime SA `ajers2ngi708sf3i1t4g` получила `ai.languageModels.user` и
  `search-api.webSearch.user` на каталоге `b1gebpfrhvkd43r38q98`.
  Постоянных API-ключей, VM/GPU и схем БД не создавали.

## Выполненные проверки

- `npm ci --no-audit --no-fund` — успешно; зависимости не добавлялись.
- `node --test scripts/deploy-vm-metadata.test.js server/yandex-ai.test.js server/messenger-assistant.test.js`
  — 23 passed. Маршрутизация провайдеров, изоляция ключа, обновление IAM,
  отмена, ошибки, ссылки без источника, функция ассистента, deployment guards.
- Unit-этап `check:comprehensive`: 938 tests, 937 passed, 1 skipped, 0 failed.
- `npm run test:messenger` — полная матрица 320, 390, 767, 768, 820, 1024,
  1440, 1920, короткие 390×400 и 1440×400; все проверки пройдены.
- `npm run test:profile` — все 9 viewport-проверок пройдены, включая
  320×568, 390×400 и 1440×400.
- Скриншоты ассистента 390×844 и 1440×844 просмотрены: управление, пояснение
  передачи планирования, действия и поле ввода доступны.
- `npm run build` — успешно, существующее предупреждение о размере chunks.
- `npm run test:openrouter:production` — 7 passed. Configured production
  `rollapp` / `rollapp_app`, direct TLS; все синтетические записи откатились.
- `npm run dev:keepalive:status` — готов, frontend `http://127.0.0.1:15673`,
  API `http://127.0.0.1:18673`. Постоянный сервис оставлен включённым.
  Startup дважды подтвердил `Existing PostgreSQL schema verified without
  migrations or data cleanup`; local health показывает default provider yandex.
- Живые платные запросы с impersonation именно runtime SA: текстовый ответ;
  настоящий assistant handler со всеми четырьмя function schemas вернул
  `open_section(calendar)`; поиск AirPods Pro 2 USB-C вернул прямую цитируемую
  карточку Яндекс Маркета. Приватное планирование/сообщения пользователей не
  отправлялись, тестовые желания/предложения в БД не сохранялись.
- `git diff --check` — успешно.

## Аудит зависимостей

`npm audit --omit=dev`: 0. Полный `npm audit`: 8 (2 low, 4 moderate, 2 high),
только dev dependency tree. Совместимый `npm audit fix --package-lock-only
--ignore-scripts` не изменил lockfile. Несовместимые overrides/downgrades
не применялись. Проверены первоисточники:

- [minimatch](https://github.com/advisories/GHSA-g3hv-75wg-m249): исправление
  в 11.0.1 вне текущего диапазона транзитивного ts-morph.
- [deepmerge](https://github.com/advisories/GHSA-gcqx-w48m-w2h4): нет исправления;
  предлагаемый npm откат shadcn на 1.0.0 не применён.
- [zod](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5): исправление 4.6.6;
  приложение уже на 4.6.7, dev-only `@ton/ton` зависит от zod 3.25.76.

## Незавершённые проверки на момент подготовки выпуска

Полный `npm run check:comprehensive` запущен и ещё выполняется, без фильтров.
Лог `/tmp/rollapp-yandex-check.log`; JSON
`/var/folders/56/y9x0qcp95zs6ctldh56fs6qh0000gq/T/rollapp-check-1793948780107.json`.
Успешные затронутые матрицы и build не заменяют полный релизный набор.

Production до выпуска оставалась здоровой на
`d8b29a24726b5d06406e055bfd2443f6e099f7ab`. Обновление Compose/образа ещё не
подтверждено. SSH probe завершился `Connection closed`; VM не перезапускали,
образы/контейнеры/тома не удаляли. CI обязан сохранить full verification gate,
read-only schema verify и exact-SHA health check. До его успешного окончания
интеграцию нельзя считать выпущенной. После выпуска нужны exact-SHA/default
provider health и проверка доступного живого UI; настоящая пользовательская
сессия в затронутом чате и реальные мобильные устройства пока не проверены.

## Живой UI — дополнительная проверка 2026-11-06

Открыта отдельная вкладка Comet на локальном frontend `localhost:15673`
с настоящим production API и существующей пользовательской сессией. Чат
ассистента отрисован: пояснение Yandex/OpenRouter, отдельное согласие на
планирование, поле ввода, ответ и валидированная ссылка в календарь доступны.
В этой сессии уже настроен личный OpenRouter: его ошибка недостаточного баланса
показана с сохранением черновика. Агент не отключал и не заменял личный ключ,
не отправлял сообщения и не изменял пользовательский черновик. Проверка
не доказывает default-provider path на production: опубликованный SHA по-прежнему
старый, релиз 42179486327 подтверждён как pending за живым run 42177896024.
Локальный полный аудит подтверждён работающим через exec session 7383.

## Исправление области поиска

На `6affb9e` при дополнительном review обнаружено, что усечение шести hostname
до пяти исключало DNS: Wildberries занимал два места (основной домен и global).
Дочерние домены теперь объединяются с уже включённым родительским, все пять
площадок сохранены. Для будущего набора более пяти независимых доменов возвращается
явная ошибка до платного запроса вместо молчаливого исключения площадки.
Проверены точные списки product/grocery/vehicle и отказ oversized scope.
`node --test server/yandex-ai.test.js server/openrouter-marketplace-offers.test.js
server/messenger-assistant.test.js`: 30 passed, 0 failed. UI/схема БД не менялись.

## Повтор поиска при исчерпании баланса OpenRouter

Проверен `5b11efa` с локальным изменением маршрута поиска предложений.
Отказ оплаты HTTP 402 или код 402 в ответе запускает один поиск через
настроенный Yandex AI. Сохраняются исходный товар, площадки и сигнал отмены.
Ключ OpenRouter остаётся в настройках и используется при следующем поиске.
HTTP 429 сохраняет собственную ошибку. Интерфейс и схема БД не менялись.

`node --test server/yandex-ai.test.js server/openrouter-marketplace-offers.test.js`
выполнил 25 тестов. `npm test` выполнил 950 тестов успешно, один сценарий
пропущен. Боевой health подтвердил настроенный Yandex AI. Автоматический
повтор проверен в тесте транспорта. Боевой поиск на обновлённом SHA ещё
предстоит проверить.

## Исторический результат выпуска Yandex AI

[Запуск 42185402110](https://github.com/rolloutrf/rollapp/actions/runs/42185402110) подтвердил точный SHA `92b6ecf3f087e709246a5ffec900f75fb0c68667` и `defaultAiProvider: yandex`. Из рабочего контейнера отдельные проверки Alice Flash и поиска Яндекс Маркета вернули успешные ответы без обращения к данным пользователей. Живой интерфейс ассистента проверен без отправки сообщения. Этап полного CI-тестирования в этом историческом выпуске был пропущен; отдельный локальный comprehensive остановился в `test:text-edit`, ожидая точное сохранение Markdown после Undo на 1024 px.
