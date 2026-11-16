# Ограничения RPC служебного TON-кошелька, 2026-11-16

Проверена ветка `codex/rollapp-finance-system-20261116` на базе
`22625385` с изменениями клиента служебного кошелька, тестов и lockfile.
В текущем `@ton/ton@16.3.0` устанавливается `zod@3.25.76`. GitHub
указывает первое исправление в Zod 4.6.6. Проверка реестра и аудита
не нашла совместимого обновления TON SDK.
[Зависимости TON SDK](https://github.com/ton-org/ton/blob/main/package.json)
[Описание уязвимости](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5)

Клиент использует Axios 1.21.1 из lockfile. Перед проверкой в SDK он
ограничивает распакованный ответ RPC одним МиБ, отклоняет перенаправления,
проверяет размер списка дополнительных валют и формат результата
`seqno` служебного кошелька V4.
[Параметры Axios](https://axios.rest/pages/advanced/request-config)

| Команда | Результат |
| --- | --- |
| `npm ci --ignore-scripts --no-audit --no-fund`, `npm ls axios @ton/ton zod` | Чистая установка, один экземпляр Axios 1.21.1. |
| `node --test server/member-ton-anchor.test.js` | 7 пройдено. Локальный HTTP подтвердил чтение состояния, баланса, `seqno`, запрос `sendBoc`, отказ при переполнении, перенаправлении и неверной коллекции. |
| `npm test` | 1072 пройдено, 2 пропущены. |
| `npm run test:ton-topup:production` | 10 пройдено с откатом на production PostgreSQL и тестовым транспортом TON. |
| `npm run build`, `git diff --check` | Пройдены. |
| `npm audit --json`, `npm audit --omit=dev --json` | 8 записей в полном дереве, 2 в runtime. Обе runtime-записи относятся к Zod 3 внутри TON SDK. |

В production-шаблоне служебная TON-запись выключена. Формат запроса
`sendBoc` проверен на локальном HTTP-сервере. Реальная отправка
остаётся непроверенной. Полный браузерный прогон базового кандидата
`db9c7951` продолжался.
