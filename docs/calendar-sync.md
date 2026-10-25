# Календарь устройства → Rollapp

Круглая кнопка CalendarSync расположена сразу после плюса в календаре. Общий ControlBar сохраняет 48×48px, значки 20px, промежуток 8px. На 320px скрывается только короткая подпись weekday; полная дата остаётся в доступном имени.

Направление — **Apple Calendar устройства → Rollapp**. Экспорт/публичная подписка Rollapp → Apple удалены после уточнения пользователя. iCloud-публикация, Apple Account и пароль не нужны. Браузер не может читать EventKit: кнопка открывает shared Drawer/MobileFormPages с подключением отдельного нативного companion.

## Подключение

1. Скачать собранный macOS companion (или установить подписанную iOS-сборку).
2. Нажать «Подключить» в Rollapp. Открытие окна само создаёт только GET; код появляется после явного действия.
3. Передать код в Rollapp Calendar через custom URL scheme либо скопировать его в приложение.
4. В companion проверить адрес/календарь, самостоятельно дать системное разрешение, выбрать календари и нажать «Синхронизировать». Передаются названия, описания, места, даты и время выбранных событий.

В Rollapp отображаются последнее обновление, имя устройства и число исходных событий. До первого snapshot показывается «Ожидаем устройство», а не успешная синхронизация. «Проверить обновление» перечитывает серверный снимок; данные с устройства поступают только от companion. «Отключить устройство» с подтверждением отзывает код и мягко скрывает только импортированные события выбранного календаря. Apple Calendar и собственные задачи сохраняются.

На Mac companion читает любой доступный EventKit календарь, включая «На моём Mac». Обновление — по EKEventStoreChanged с debounce 2с и таймеру 5мин, пока приложение открыто. На iOS исходник поддерживает foreground/возврат приложения, без обещания background refresh. Для iPhone нужны полная Xcode/iOS SDK, подпись и установка; в текущем окружении они отсутствуют. В web UI это прямо указано. Нативная установка не имитируется ссылкой webcal.

## API и хранение

- `GET/POST/DELETE /api/planning/calendar-device?space=…` — собственный статус, идемпотентное создание кода, отзыв и soft archive только импортов.
- `POST /api/calendar-device/snapshot` — принимает полный snapshot с отдельным `Authorization: Bearer` capability; browser login не заменяется.
- `GET /api/planning/calendar-device/events?space=…` — только владелец; read-only внешние события.
- `GET /api/planning/calendar-device/macos` — только после входа, готовый zip из `native/apple-calendar/build/` либо `ROLLAPP_CALENDAR_MACOS_ARCHIVE`. Если архив не включён в серверный artifact, явно возвращается 503.

Используется настроенная production БД и существующая схема, без миграций. В `sessions` отдельное пространство ключей `calendar-device:v1:<sha256(space)>:<nonce>:<state>`, несовместимое с hex SHA-256 browser session key. Долгоживущий scoped token подписывается HMAC-SHA256 с отдельным контекстом от USER_CREDENTIALS_SECRET. Отсутствующий secret — явная 503. Код даёт право передавать снимки только в один календарь одного владельца; не позволяет читать другие данные и входить в аккаунт. После первого snapshot код привязан к deviceId; второе устройство отклоняется до отключения/нового подключения. Общий отзыв сессий отзывает и устройство. Ни один bearer token не передаётся в HTTP URL snapshot endpoint.

Снимки сериализуются блокировкой владельца. События хранятся отдельными `apple-device:` строками в planning_tasks, с owner/space-bound ID. В пределах авторитетного периода: совпадающие обновляются/upsert, отсутствующие soft archive. Личные задачи не входят в этот namespace. Обычный planning API исключает такие строки из To Do/Kanban и не позволяет patch/move/delete этих событий. Импорты не занимают списки доски. В календаре они объединяются с личными задачами, без editor/duplicate/drag/resize.

Web перечитывает данные каждые 30с и при возвращении окна. Cleanup снимает listeners/timer; поздний ответ не переходит в другой space. Ошибка видна рядом с календарём с retry; ранее полученный реальный снимок может оставаться до повторной успешной загрузки. UI fixture не является БД и блокирует реальные API.

## Нативная часть

Исходники, Xcode project, команды сборки и ограничения — [native/apple-calendar/README.md](../native/apple-calendar/README.md). macOS universal arm64/x86_64 собирается на Mac 14+, локальная подпись ad hoc, без notarization. Для production installer нужны отдельная подпись/нотаризация и включение архива в release; Linux web build его не создаёт.

EventKit не имеет read-only authorization: для чтения Apple требует full access. UI/Info.plist это объясняют; companion использует только чтение. Ни save, ни remove в EventKit не вызываются. Коды хранятся в Keychain ThisDeviceOnly. Пустой выбор или потеря разрешения не отправляют пустой snapshot. Смена выбранных календарей приостанавливает auto setting до нового явного подтверждения. Разрешены штатные домены Rollapp с HTTPS и loopback HTTP для preview; redirects отключены, cookies/credential cache не используются.

Период — 30 дней назад / 365 вперёд, максимум 401 день, 5000 исходных событий, 4 MiB JSON и 12000 дневных сегментов. Повторы/исключения раскрывает EventKit, а не самодельный RRULE parser. Сервер использует IANA timeZone устройства и дробит ночные/многодневные события по локальным датам. Date-only/all-day — реальные сутки, а не искусственная длительность для untimed To Do. Длинные Unicode поля обрезаются в native по UTF-16 границе сервера без разрыва grapheme. Очень короткие события сохраняют исходные минуты; текущий timeline имеет минимальную визуальную длительность 15 минут. DST fold и timezone override приложения Apple требуют отдельной проверки.

## Проверки

`npm test`; `npm run test:planning:production` с BEGIN/ROLLBACK и без schema initialization; `npm run test:calendar`, включая 16 комбинаций device UI; `npm run test:controls`; `npm run test:form-actions`; `zsh native/apple-calendar/test-macos.sh`; `zsh native/apple-calendar/build-macos.sh`. Native pure tests не читают Calendar/Keychain и не ходят в сеть. Compiler/lint не заменяют пользовательское разрешение, фактическую передачу личных событий и проверку iOS.

Источники: [Apple: Accessing the event store](https://developer.apple.com/documentation/eventkit/accessing-the-event-store), [Apple: calendar change notifications](https://developer.apple.com/documentation/eventkit/updating-with-notifications), [Apple: permission migration](https://developer.apple.com/documentation/technotes/tn3152-migrating-to-the-latest-calendar-access-levels).
