# Rollapp для iOS

Клиент открывает адаптивное приложение на [роллапп.рф](https://роллапп.рф) через WebKit. Для работы нужен интернет. Сессия хранится в системном хранилище клиента. Вход через Яндекс использует ту же сессию WebKit для перенаправления в Rollapp. Внешние ссылки открываются в системном браузере или соответствующем приложении.

## Сборка для симулятора

Нужны Xcode с платформой iOS и установленный runtime симулятора. Минимальная версия системы приложения — iOS 17. Откройте `ios/Rollapp.xcodeproj`, выберите схему **Rollapp** и запустите её на симуляторе iPhone или iPad.

Из корня репозитория можно собрать приложение командой

```sh
xcodebuild -project ios/Rollapp.xcodeproj -scheme Rollapp \
  -configuration Debug -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath ios/build/simulator build
```

Готовый пакет появится в `ios/build/simulator/Build/Products/Debug-iphonesimulator/Rollapp.app`.

## Запуск на iPhone

Добавьте Apple Account в Xcode, выберите свою команду в **Signing & Capabilities** у цели Rollapp и запустите схему на подключённом iPhone. Идентификатор пакета по умолчанию — `rf.rollapp.ios`. Для распространения через TestFlight нужен архив, подписанный командой Apple Developer.
