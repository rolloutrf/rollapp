# Rollapp Calendar — календарь устройства → Rollapp

Нативный companion читает выбранные календари через EventKit, включая локальные «На моём Mac», и отправляет авторитетный снимок в выбранный календарь Rollapp. Он не использует EventKit save/remove и не изменяет Apple Calendar. Публикация iCloud и Apple Account/password не нужны.

## macOS

Требуются macOS 14+ и Command Line Tools для сборки:

```sh
zsh native/apple-calendar/test-macos.sh
zsh native/apple-calendar/build-macos.sh
```

Результат: `build/Rollapp Calendar.app`, universal arm64/x86_64, и `build/RollappCalendar-macOS.zip`. Сборка подписывается ad hoc для локального использования. Это не Developer ID/notarized release. Не обходите системные security warnings: для публичного распространения нужна нормальная подпись/нотаризация.

1. Открыть приложение самостоятельно.
2. В Rollapp открыть круглую кнопку рядом с плюсом → «Подключить».
3. Нажать «Открыть приложение» либо вставить код в companion и нажать «Применить код». Проверить сервер и календарь назначения.
4. В companion запросить доступ к календарям и самостоятельно ответить на системный запрос macOS. Выбрать только нужные календари.
5. При необходимости включить автообновление и нажать «Синхронизировать». Здесь подтверждается передача названий/описаний/мест/дат/времени выбранных событий в показанный Rollapp.

Выбор календарей сам отключает автообновление до нового подтверждения. Локальный сервер `http://127.0.0.1:5177` поддерживается только на том же Mac; публичный сервер требует HTTPS. Допустимы только штатные домены Rollapp и loopback. HTTP redirects не выполняются, чужие cookies/credentials не используются.

Код доступа и случайный deviceId хранятся в Keychain с `ThisDeviceOnly`. После успешной передачи там сохраняются выбранные календари/auto setting. Пустой выбор или потеря разрешения не отправляют пустой снимок. Пустой **доступный выбранный** календарь может отправить пустой снимок — исчезнувшие события скрываются в Rollapp.

Автообновление: EventKit change notification с debounce 2с и timer 5 минут, пока приложение открыто; Rollapp перечитывает снимок каждые 30с/при возвращении страницы. Фоновой launchd-службы companion не создаёт. При локальном отключении код удаляется с устройства; серверный отзыв/скрытие всех импортированных событий выполняется кнопкой «Отключить устройство» в Rollapp.

Период — от 30 дней назад до 365 дней вперёд. Максимум 5000 исходных событий и 4 MiB JSON; лимит проверяется до отправки. Повторы раскрывает сам EventKit; detached occurrences передаются как их фактические экземпляры. Сервер обновляет только отдельные `apple-device:` записи. Обычные задачи и Apple Calendar не затрагиваются.

## iOS

`RollappCalendar.xcodeproj` содержит общий SwiftUI source и настройки iOS 17+/macOS 14+. Открыть в **полном Xcode**, выбрать Team и iPhone destination, собрать/подписать и установить обычным способом. Дополнительные web APIs не могут заменить установку и системное разрешение. На iOS обновление реализовано в активном приложении; гарантированного background refresh нет.

В текущем окружении установлен только Command Line Tools, без Xcode/iOS SDK. Проверены сборка/чистые тесты **macOS**, plist/project syntax. iOS compilation, simulator/device, signing, TestFlight/App Store distribution и реальные EventKit/TCC/Keychain сценарии требуют отдельной проверки. Не называйте этот исходник готовой опубликованной iPhone-версией.

## Раздача установщика

Локальный web endpoint `/api/planning/calendar-device/macos` после входа отдаёт созданный zip из `build/`. Для отдельного production release архив нужно собрать на Mac, подписать/нотаризовать и включить в артефакт сервера либо задать `ROLLAPP_CALENDAR_MACOS_ARCHIVE`. Git игнорирует `build/`; Linux web build не собирает Mac-приложение. Отсутствующий архив возвращает явную 503, без подставного установщика.

## Разрешение Apple

EventKit не предоставляет read-only authorization. Для чтения событий Apple требует **full access**; это явно объяснено в UI и `NSCalendarsFullAccessUsageDescription`, а код использует только чтение. Для sandbox macOS target указан calendars entitlement и network client. Системное разрешение выдаёт сам пользователь. [Документация Apple](https://developer.apple.com/documentation/eventkit/accessing-the-event-store).
