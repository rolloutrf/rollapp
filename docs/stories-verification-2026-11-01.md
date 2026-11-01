# Сторис — проверка 1 ноября 2026

Основа: `f55cce47e5718bc411f39cfc9436930deb152f23`, рабочее дерево изначально чистое, итог проверяется с незакоммиченными изменениями. Выпуска/деплоя приложения не было. Точный список реализаций и SHA256 финального кандидата записан в соседнем JSON.

## Реализация

- Запись со своей аватарки, остановка на 60 секундах, предпросмотр и отдельная публикация. Ошибка сохраняет blob для повтора. Можно выбрать готовое видео; сервер независимо перекодирует первые 60 секунд в MP4. Вход ограничен контейнерами MP4/MOV/WebM, без playlist/сетевых протоколов.
- Оранжевое кольцо при активных сторис, просмотр последовательности, серверный срок 24 часа. И metadata, и прямое видео проверяют срок, возвращают no-store; video поддерживает Range. Истёкшие записи логически недоступны, физическая очистка отдельно не выполняется.
- Мобильный экран/настольная штора используют form-surface и 48px Footer. В живом тёмном UI найден и исправлен невидимый primary: действие стало form-owned submit. До старта камеры вместо пустого error video показан placeholder.
- Найден и исправлен пустой экран при переходе к профилю: onAfterClose восстанавливает историю перед открытием, общий MobileFormPages теперь охватывает ProfileEditorProvider. Имя профиля сохраняет семантику h1 и доступ к редактированию.
- Камера освобождается при остановке/уходе/отмене; позднее разрешение не может возобновить закрытую запись. Таймеры принадлежат конкретному MediaRecorder.

## Production

Пользователь отдельно разрешил создание stories в ответе «Да, создать таблицу stories». Настройки цели сверены с основным репозиторием; сертификат TLS проверен. Отпечаток database/role: `66207e5a4c8b49fb`. Применён только `server/migrations/20261101-stories.sql`; существующие записи не менялись. Столбцы повторно проверены в READ ONLY транзакции. Startup сохраняет verify без migrations/backfill/cleanup.

Первый диагностический запрос без runtime Lockbox credential не подключился; credential загружен штатным loadLockboxValue без вывода. pg_stat_ssl за управляемым endpoint не предоставил состояние frontend TLS, поэтому миграция была остановлена до проверки реального TLS socket (encrypted/authorized). Эти неуспешные подключения схему не меняли.

Живой local UI с production API просмотрен в существующей IAB-сессии: собственная аватарка → запись → отмена на 320×740, 390×844, 768×1024, 820×1180, 1024×768, 1440×900, 1920×1080 и 390×400. Нет горизонтального overflow или ошибок загрузки; аватарка круглая, все действия 48px и внутри viewport. Переход сторис → профиль → Back повторён после исправления провайдера, форма действительно открылась; ничего не сохранено. Камера/микрофон в живой сессии не включались, тестовые сторис в production не публиковались.

Dev keepalive оставлен работающим: API 8096, frontend 5196, direct TLS production. Порты исходного рабочего дерева не останавливались. Локальная установленная FFmpeg была неисправна из-за отсутствующей dylib; восстановлена переустановкой Homebrew FFmpeg. Для Docker и CI FFmpeg установлен явно.

## Команды и результаты

- `npm test`: 799 тестов, 798 PASS, 0 FAIL, 1 штатный SKIP production TON integration. Включены transport-проверка MIME MediaRecorder с codecs, реальное 61-секундное видео → ≤60 секунд, невалидные media/playlist, авторизованный owner, expiry и byte ranges. Без БД.
- `npm run test:ui`: PASS, 37 primitives, 80 application JSX sources; добавлен guard порядка провайдеров.
- `npm run test:stories`: PASS всех 16 cases: восемь viewport в светлой и тёмной темах. Настоящие fake-device MediaRecorder/stream Chromium, preview/retry, кольцо, круглая геометрия, 48px pill actions, Back и after-close callback. Дополнительно virtual-clock deadline, отказ камеры, поздний getUserMedia после отмены. Любой API request fixture запрещён; публикация — явно включённый test-only transport. Снимки `/tmp/rollapp-stories`.
- `npm run build`: PASS; остаётся стандартное предупреждение о размере chunks.
- `npm run test:navigation`: PASS 46 records.
- `npm run test:action-rails`: PASS 90 records.
- `npm run test:form-actions`: PASS 101 records, включая StrictMode, native Enter, busy Back.
- `npm run test:drawers`: PASS всех 270 records на полной матрице 10 viewport cases 320–1920px, включая короткие окна. Финальный запуск завершился с кодом 0.
- `npm audit` и `npm audit --omit=dev`: выполнены до и после совместимого `npm audit fix`. Production: 0; полный граф: 6 (2 low, 4 moderate), только dev tool chain shadcn/registry/ts-morph/deepmerge/minimatch. Несовместимый downgrade shadcn не выполнялся. Lockfile обновлён.
- `git diff --check`, syntax checks server modules: PASS.

## Полный аудит: не PASS

`npm run check:comprehensive` запускался дважды, оба раза останавливался внутри check:release. JSON каждого запуска сохранён рядом. Первый прошёл unit/UI/controls/details/dates/calendar/form-actions, затем text-image-alignment (dark 320/390/short) и остановился на 30s page.goto timeout: пустой fixture root с pending Vite dependency requests. Второй остановился в controls на `net::ERR_ABORTED` при переходе к guest fixture. Эти ошибки воспроизводились в других сценариях, а не в stories; причина не доказана. Параллельные browser checks других рабочих деревьев замечены, их процессы не останавливались. Объединять частичные результаты в полный comprehensive PASS нельзя. Финальные story/формы/навигация/build проверены отдельно после исправлений; неподнятые этапы общего аудита остаются непроверенными.

Настоящие iPhone/Safari, Android, Telegram WebView, реальные разрешения/прерывания камеры и звук устройств не проверены. Нет проверки реальной публикации production видео, ожидания физических 24 часов или удаления старых байтов. Это реализованный и локально проверенный кандидат, не утверждение о завершённом production rollout.
