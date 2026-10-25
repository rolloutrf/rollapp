> Исторический снимок первого, неподписанного этапа. Его full comprehensive run
> был остановлен при переходе к разрешённому TON Testnet пилоту; статуса полного
> PASS нет. Актуальное продолжение: [ton-contact-cards-verification-2026-10-23.md](ton-contact-cards-verification-2026-10-23.md).

# Проверка цифровой визитки — 2026-10-23

База: `237386530fd11e359f6f997735537b85e6ccb419`, ветка
`codex/portable-contact-card`, dirty candidate. До начала рабочая копия была
чистой. Изменения ограничены визиткой, интеграцией контактов/профиля,
соответствующим fixture и документацией; schema/API не менялись.

## Реализовано

- «Моя визитка» в собственных контактах, общий диалог для существующего QR,
  «Визитка» на публичном профиле, доступная гостю.
- Локальный QR, копирование/Share ссылки, vCard 4.0 и JSON version 1.
- Явный список публичных полей; данные входа и личные записи не сериализуются.
- Общие Dialog/VisualViewport/ControlBar, неподвижные шапка и footer внутри
  popup, один body scroller, восстановление фокуса и стандартные контролы.

## Проверки

- `npm ci`: PASS, 558 пакетов установлены из lockfile без его изменения.
- `npm test`: PASS, 826 tests, 825 pass, 1 skip, 0 fail. Новый сериализатор
  проверяет приватные поля, CRLF injection, Unicode/UTF-8 folding, URL и filename.
- `npm run test:ui`: PASS, 37 upstream primitives, 85 application JSX sources.
- `npm run build`: PASS; остаётся предупреждение о крупных chunks.
- `npm run test:contacts`: PASS, девять размеров, 18 итоговых записей, две темы.
  Реальные downloads и проверка их содержимого, гостевой PublicProfile,
  Clipboard fail/retry и Web Share success/cancel, focus restoration,
  точные 48px и четыре радиуса 24px, отсутствие внешних запросов и переполнения.
  Сохраняются прежние append/retry/end/favorite-scroll/filter/stale-response cases.
- `npm run test:action-rails`: PASS, полный набор размеров/вариантов, включая
  dynamic, overflow, vertical-scroll и nested composition.
- На окончательном UI после ограничения размера QR повторены `test:ui`, `build`
  и полный `test:contacts`; все PASS. Контрольные суммы runtime/test source
  сохранены в сопровождающем JSON и проверены на отсутствие изменений.
- `npm audit` и `npm audit --omit=dev`: PASS, 0 vulnerabilities.
- `git diff --check`: PASS.
- `npm run check:comprehensive`: **ещё выполняется; полного PASS нет**. На момент
  передачи прототипа прошли unit/UI/controls/details/dates/calendar/form-actions;
  полный `test:text-edit` ещё идёт, последующие этапы не подтверждены.
  Результат не является разрешением на интеграцию или production release.
  Процесс оставлен работающим и обновляет свой машинный отчёт:
  `/tmp/rollapp-contact-card-comprehensive-final.json`.

Первая диагностическая проверка карточки измерила 47px во время scale-анимации
открытия. Проверка теперь ожидает завершения собственной анимации Dialog перед
измерением; точное требование 48px сохранено. После этого полная девятиразмерная
матрица контактов прошла. Первый общий запуск остановлен до окончательной
интеграции PublicProfile. При live review обнаружен QR высотой 256px, который
не помещался целиком в body короткого окна. Добавлено локальное ограничение
размера по VisualViewport (144px при высоте 400px) и проверка полной видимости
кода после прокрутки. Промежуточный общий запуск остановлен; окончательный полный
прогон запущен заново после исправления. Результаты разных snapshots не складываются.

## Production-backed live review

Для этой checkout сохранены копии существующей конфигурации в игнорируемых
`.env`/`.env.local`; credentials не внесены в репозиторий. Отдельные порты:
API 8340, frontend 5340. `dev:keepalive:status` подтверждает готовность API/frontend
и постоянный launchd service; соединение direct TLS, initialization=verify.
Production schema, данные и доступы не изменялись.

Изначальная самостоятельная SELECT-диагностика не загрузила runtime password
из Lockbox и завершилась SASL error. Повтор использовал существующий
`loadLockboxValue`, выполнил SELECT в `BEGIN READ ONLY`/`ROLLBACK` и прошёл.
Это не было сбоем работающего dev service; fallback database не использовалась.

Живой браузер с существующей сессией открыл публичный профиль и раздел контактов
через production API. Подтверждены реальные 1659 контактов/14 избранных,
кнопки «Визитка»/«Моя визитка», корректные имя/username и локально построенный QR.
Скачан настоящий `/Users/developer/Downloads/example-owner.vcf`; содержимое проверено
на точный список полей BEGIN/VERSION/FN/NICKNAME/URL/END. Контакты, профиль,
избранное и настройки доступа при live review не сохранялись и не изменялись.

Снимки fixture: `/tmp/rollapp-contact-card-{width}-{height}.png` и
`/tmp/rollapp-contact-card-light-{width}-{height}.png`. Визуально просмотрены
390×844, 390×400 и light 1440×400; также просмотрен live screenshot на production
данных. На коротком экране тело прокручивается, footer остаётся доступен.
Повторный live review на 390×400 подтвердил QR 144px внутри body 192px;
временный viewport override после проверки снят.
Сохранён снимок финального живого UI:
`/tmp/rollapp-contact-card-live-2026-10-23.png`.

## Непроверенное и границы

Нет криптографической подписи, ключей пользователя, DID, blockchain, импорта,
автоматических обновлений или независимого сервиса хранения. Файл — снимок
публичного имени и ссылки; он не доказывает личность. В локальном preview URL
ведёт на localhost. Экспорт всех контактов/личных записей не добавлялся.

Не проверены сканирование физическим телефоном, импорт в системные адресные
книги и настоящий системный Share на iOS/Android. В UI fixtures Clipboard и
Share эмулированы явно. Production deployment не выполнялся. Постоянный dev
service оставлен работающим.
