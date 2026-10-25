# Устройство → Rollapp: проверка 25 октября 2026

Базовый commit `f55cce47e5718bc411f39cfc9436930deb152f23`, detached HEAD, dirty worktree. Предыдущие изменения календарных жестов сохранены. После уточнения пользователя удалены экспорт/публичная подписка Rollapp → Apple и временно исследованный iCloud URL import. Текущее направление — чтение выбранных календарей устройства через нативный companion. Исторический `calendar-sync-verification-2026-10-25.*` не подтверждает эту реализацию.

## Реализовано

Круглая кнопка рядом с плюсом, shared desktop Drawer/native mobile page, код подключения одного устройства к одному календарю, имя устройства/последний снимок, копирование кода, подтверждённое отключение. Браузер прямо объясняет необходимость companion; iOS не выдаётся за опубликованное приложение.

Сервер принимает scoped snapshots, обновляет стабильные импортированные строки без дубликатов и скрывает исчезнувшие только в авторитетном периоде. Личные задачи и данные другого владельца/календаря не затрагиваются. Импорты исключены из To Do/Kanban/занятости списков, защищены от mutation API и отображаются в календаре без editor/drag/resize. Отключение отзывает capability и soft archive только его событий. Новых таблиц, schema migration/backfill и startup initialization не было.

Нативный SwiftUI companion macOS 14+ собран universal arm64/x86_64, с локальной ad hoc подписью. Тот же source/Xcode project подготовлен для iOS 17+, но не скомпилирован для iOS. Keychain ThisDeviceOnly, явный выбор календарей и назначения, EventKit read APIs, проверка разрешения/непустого выбора, foreground auto refresh, bounded snapshot. Redirects и cookie/credential cache выключены. См. [контракт](calendar-sync.md) и [native README](../native/apple-calendar/README.md).

## Пройденные проверки

| Команда | Результат |
| --- | --- |
| `npm test` после последней проверки границ времени | PASS: 793 passed, 1 existing skipped, 0 failed |
| `npm run test:ui` | PASS: 37 primitives, 80 JSX application sources |
| `npm run test:controls` | PASS: полная матрица, 143 отметки с геометрией/pixel paint |
| `npm run test:calendar` | PASS: 46 комбинаций (14 event/form + 16 gesture + 16 device UI) |
| `node scripts/calendar-sync-smoke.mjs` после последней UI-правки | PASS: 16 комбинаций, 320/390/767/768/820/1024/1440/1920 × 900/400, DPR3 на 390 |
| `npm run test:form-actions` | PASS: полная матрица, 101 отметка, включая StrictMode/Enter/busy Back |
| `npm run test:planning:production` | PASS: 3 теста с настоящей настроенной production БД, BEGIN/ROLLBACK, без initialization/migrations |
| `npm audit`, `npm audit --omit=dev` | PASS: 0 vulnerabilities; новых runtime dependencies не осталось |
| `npm run build` | PASS; прежнее предупреждение о размере chunks |
| `zsh native/apple-calendar/test-macos.sh` | PASS: безопасный разбор подключения, ограничение destination, snapshot encoding, Unicode cap; Calendar/Keychain/network не читаются этими pure tests |
| `zsh native/apple-calendar/build-macos.sh` | PASS: arm64 и x86_64, universal Mach-O; zip собран |
| `codesign --verify --strict --verbose=2` | PASS: обе архитектуры, designated requirement |
| `plutil -lint` | PASS: Info.plist, entitlements, Xcode project syntax |
| `git diff --check` | PASS |

Production rollback test подтвердил изоляцию владельцев/spaces, idempotency подключения, невозможность browser login по device credential, привязку к одному deviceId, валидацию полного snapshot без частичных изменений, авторские 10:17/43 минуты, обновление одного UID, исчезновение после пустого авторитетного snapshot, сохранение личной задачи, запрет patch/move/delete импорта, независимость списков и другого календаря, отзыв и общий отзыв сессий. Проверена настоящая authenticated загрузка zip (PK header), а в окружении без архива ожидается явная 503. Последняя временная проверка субминутного/DST fold случая — unit fail-closed до транзакции.

Во время проверок найдены и исправлены: несовместимость добавленного middleware с API fixture регистрацией (`app.use` перенесён в общий mutation guard); throwing expression в Swift assertion; запрет Express static send на доверенном build path под `.codex` (разрешено только скачивание фиксированного архива, без пользовательских путей). Неуспешные production проверки также выполнялись с ROLLBACK.

## Живая проверка и границы

Собранное **приложение Mac запущено** и стартовое окно просмотрено через native accessibility/screenshot. Видны направление, поле кода, кнопка запроса разрешения, отключённая кнопка синхронизации и auto toggle off. Это также проверило начальную генерацию собственного deviceId в Keychain; личного connection token там ещё нет. Системный Calendar access не запрашивался агентом, календари/события не читались и не передавались. Приложение оставлено открытым для действий пользователя.

До реальной синхронизации пользователь должен открыть код из своего Rollapp, проверить назначение, самостоятельно подтвердить системный full access и выбор календарей, затем синхронизацию. Apple требует full access даже для чтения; companion не использует EventKit save/remove.

Не проверены: фактическое разрешение TCC и чтение личных Calendar data, загрузка реальных событий с устройства, credential restore/retry в Keychain после reboot, реальный auto refresh, Intel hardware execution, physical iOS/simulator build, signing/TestFlight/App Store, notarized public installer. На этом Mac есть Command Line Tools, но нет полного Xcode/iOS SDK. Subminute/DST fold с невозрастающим локальным концом явно отклоняются до записи; их полноценная визуальная поддержка требует доработки. Другие DST transitions/Apple timezone override не прошли полноценную native reference проверку. Минимальный визуальный блок timeline для очень короткого внешнего события — 15 минут при сохранении его настоящих минут.

Локальный web service использует production DB с прежним прямым TLS/`verify`; keepalive оставлен включённым. Проверены 401 у нового device API без входа и 404 у удалённого subscription API. Сервис перезапущен штатным keepalive; PID-файл вручную не удалялся. При одном stop guard сохранил файл завершающегося старого PID, повтор выполнен после автоматического удаления PID-файла самим процессом.

Commit/PR/production deployment не выполнялись. Web/native installer доступны локально; build/ игнорируется Git. Для внешнего release архив надо отдельно подписать/нотаризовать и включить в deployment artifact. Полные `check:release`/`check:comprehensive` этой версии не запускались: перечислены только реально пройденные затронутые наборы; прошлый comprehensive относится к состоянию до подключения устройства.

Логи: `/tmp/rollapp-device-calendar-{unit-final,production-final,controls,calendar,form-actions,ui-final,web-build-final,native-tests-final,native-build-final}-2026-10-25.log`; audit JSON — `/tmp/rollapp-device-calendar-audit-{all,prod}-2026-10-25.json`. Хеши runtime/test/docs/native source и готового архива — в `calendar-device-verification-2026-10-25.json`.
