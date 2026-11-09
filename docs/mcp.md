# Rollapp MCP

Rollapp поддерживает Streamable HTTP по адресу `https://роллапп.рф/mcp` и локальный транспорт stdio. Оба транспорта обращаются к существующему API и используют права подключённого аккаунта. Для команд из репозитория нужны Node.js 22.12+ и macOS или Linux.

## Подключение по HTTPS

Выполните из корня репозитория. Токен получает права чтения и действует 30 дней.

```bash
npm ci
npm run mcp:auth -- login
export ROLLAPP_MCP_TOKEN="$(npm run --silent mcp:auth -- token)"
codex mcp add rollapp --url https://xn--80avakiab.xn--p1ai/mcp --bearer-token-env-var ROLLAPP_MCP_TOKEN
```

Запускайте Codex из окружения, где задан `ROLLAPP_MCP_TOKEN`. Для другого клиента передайте токен в заголовке `Authorization: Bearer …`. Чтобы получить права записи, выпустите токен командой `npm run --silent mcp:auth -- token --write`. Для отзыва текущего токена выполните `npm run mcp:auth -- revoke` из того же окружения. Выход из локальной сессии и отзыв HTTPS-токена выполняются отдельно. [OpenAI Docs о подключении MCP](https://developers.openai.com/codex/mcp/), [MCP SDK о Streamable HTTP](https://ts.sdk.modelcontextprotocol.io/v2/serving/http).

## Подключение по stdio

Выполните команды в терминале из корня репозитория.

```bash
npm ci
npm run mcp:auth -- login
codex mcp add rollapp -- "$(command -v node)" "$PWD/scripts/mcp/server.mjs"
```

Вход требует аккаунт Rollapp с email и паролем. Терминал скрывает ввод пароля. После входа отдельная сессия сохраняется в `~/.config/rollapp/mcp-session.json` с правами `0600`. Пароль не сохраняется.

Перезапустите MCP-клиент после входа или смены аккаунта. Для завершения отдельной сессии выполните `npm run mcp:auth -- logout`. Команда отзывает её через API и удаляет файл после ответа Rollapp. Если после принудительного завершения `mcp:auth` остался пустой каталог `mcp-session.json.lock`, удалите его после проверки, что другая команда авторизации не работает.

При запуске stdio с `--write` сервер публикует инструменты записи. Чтобы включить их в Codex, обновите команду.

```bash
codex mcp add rollapp -- "$(command -v node)" "$PWD/scripts/mcp/server.mjs" --write
```

Для другого клиента укажите абсолютные пути к `node` и `scripts/mcp/server.mjs`. При запуске через npm используйте `npm run --silent mcp`, чтобы stdout содержал только сообщения MCP. [Официальная документация Codex по MCP](https://developers.openai.com/codex/mcp/), [документация MCP SDK по stdio](https://ts.sdk.modelcontextprotocol.io/v2/serving/stdio).

Для отдельной локальной сессии задайте абсолютный `ROLLAPP_MCP_SESSION_FILE`. Для подключения к настроенному dev API задайте `ROLLAPP_MCP_URL`, например `http://127.0.0.1:8080`, и отдельный файл сессии. Передайте оба значения при входе и в конфигурации MCP-клиента. Сессия привязана к origin. HTTP разрешён для loopback, остальные адреса требуют HTTPS. Dev API должен использовать настроенную production PostgreSQL.

## Инструменты

| Инструмент | Действие |
| --- | --- |
| `get_service_status` | Проверить `/api/healthz`. Для вызова через HTTPS MCP требуется токен |
| `get_account` | Показать имя, username и тип подключённого аккаунта |
| `list_planning_spaces` | Получить пространства `todo`, `calendar` или `kanban` по `kind` |
| `list_tasks` | Получить колонки и задачи по `spaceId`, с поиском и фильтром по завершённости. Архив скрыт по умолчанию. Повторы возвращаются в виде исходных записей |
| `list_wishlists` | Получить свои вишлисты |
| `list_wishes` | Получить свои желания, включая приватные. Поддерживает поиск и фильтры по списку и статусу |
| `create_task` | Создать задачу. Нужны `spaceId`, `columnId` и `title` |
| `update_task` | Обновить поля из `patch` по `spaceId` и `taskId`. Для завершения отдельного повтора передайте только `occurrenceDate` и `completed` в `patch` |
| `create_wish` | Создать желание. По умолчанию желание приватное |
| `set_wish_fulfilled` | Установить статус по `wishId` и `fulfilled` |

Последние четыре инструмента доступны с токеном `write` по HTTPS или с аргументом `--write` по stdio.
Для списков задач, вишлистов и желаний передавайте `nextOffset` как `offset`, пока `nextOffset` не станет `null`. При таймауте создания сначала проверьте список, чтобы повторный вызов не создал дубликат.

## Проверка

`node --test server/mcp-http.test.js scripts/mcp/mcp.test.js` проверяет оба транспорта, маршрутизацию, валидацию, scope, отзыв и истечение токенов через изолированные HTTP fixture. В production ответ `/api/healthz` должен показывать точный SHA выпуска, а `/mcp` без токена — HTTP `401`. Для проверки с токеном вызовите `get_service_status`, `get_account` и `list_planning_spaces`. Эти вызовы не меняют данные аккаунта.
