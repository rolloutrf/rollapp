# Проверка объединения исходников клиентов Rollapp, 20 ноября 2026

Основа интеграции — `main` на `08dd7cb7`. Исходники iOS перенесены из `2cc2eea7`. Дерево `ios/` совпадает с этим коммитом и с локальным снимком `dad3f8b6`, на котором выполнены обе сборки. Отслеживаемые файлы в исходном worktree iOS были чистыми. Интеграционный worktree на момент проверки содержал изменения README и iOS workflow.

| Проверка | Результат |
| --- | --- |
| `xcodebuild` Debug для `generic/platform=iOS Simulator` с Xcode 27.2 | Собран `Rollapp.app`. |
| `xcodebuild` Release archive для `generic/platform=iOS` с `CODE_SIGNING_ALLOWED=NO` | Собран архив с идентификатором `rf.rollapp.ios`. |
| `plutil -lint` проекта Xcode, разбор YAML, проверка событий workflow и `bash -n` для его shell-шагов | Пройдены. |
| `npm run test:macos` на `275e20f2` | Пройдены 15 сценариев WebKit. Исходники `macos/` совпадают с `08dd7cb7`. В worktree использовалась неотслеживаемая ссылка `node_modules`. |
| Android CI на `092837c8` | Успешный [Build Android](https://github.com/rolloutrf/rollapp/actions/runs/44593664197). Исходники и workflow Android совпадают с `08dd7cb7`. |

В предыдущем [iOS workflow](https://github.com/rolloutrf/rollapp/actions/runs/44589783843) архив и приложение собраны, а симулятор iPhone прервался по тайм-ауту `simctl bootstatus` до установки приложения. Проверка симулятора доступна вручную через `simulator_smoke`. Локальный runtime симулятора отсутствовал. Запуск на симуляторе и физическом устройстве, подпись, TestFlight и публикация в магазинах остаются отдельными проверками.
