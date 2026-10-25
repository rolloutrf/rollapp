# Выпуск личностных тестов — 2026-10-24

Статус: DEPLOYED. CI и production health подтверждают точный final SHA
`71dcc8e7e8e7af4c2351fd6d3be7a3a4ef7cc82f`.

- Feature commit: `689df9218d1125d7fe2290647910a9798079ee23`.
- Final candidate: `71dcc8e7e8e7af4c2351fd6d3be7a3a4ef7cc82f`.
- Между ними main включает performance release `49946b9`; файлы API/новых тестов
  там не менялись. Последующий 71dcc8e исправляет только перенос длинных названий
  и прокрутку подтверждений, дополняет regression и документацию.
- CI: https://github.com/rolloutrf/rollapp/actions/runs/40067426398
- CI завершился SUCCESS в 07:44:28 UTC. Mandatory Test and build прошёл
  05:46:10–07:41:26 UTC; immutable image push, проверка/обновление metadata,
  exact health/canonical redirects/public profile и Telegram configure прошли.
- До выпуска production здоров на `18bb093354bb8ea5c36f2696c6321381d8cd68a5`.

## База и эксплуатация

Применена отдельно согласованная миграция
`server/migrations/2026-10-24-custom-identity-tests.sql` через
`node scripts/identity-tests-schema.mjs --apply`. Точная настроенная TLS/Lockbox
БД и роль проверены helper: `rollapp` / `rollapp_app`. Расширены только два CHECK;
строки не изменялись/не удалялись. Повторный READ ONLY probe подтвердил новые
условия. Актуальный existing-schema guard релиза также прошёл READ ONLY.
Обычный release/startup остаётся `ROLLAPP_DATABASE_INITIALIZATION=verify`.

Read-only VM preflight: 19 GB boot disk, 7.2 GB свободно; один работающий контейнер
на 18bb093, 8 image tags. Текущий образ сохранён для rollback. Развёртывание идёт
последовательно через CI, без пересечения metadata updates. Предыдущие запуски
заменены после объединения main и UI-исправления; старый 49946b9 отменён только
когда его единственный активный шаг был Test and build, до обновления VM.
Перед переключением повторно проверены VM/folder/runtime-SA, IAM metadata
endpoints, отсутствие conflicting declaration и точное равенство Compose
шаблону final commit. Новый контейнер запущен штатно, свободно 6.0 GB.
Ручной restart/reboot/очистка образов не потребовались.

## Проверки

- Полный локальный comprehensive чистого 689df92: PASS, все 11 этапов,
  04:06:50–05:56:08 UTC. JSON: `identity-tests-release-comprehensive-2026-10-24.json`.
- Final UI delta на 71dcc8e: PASS source PDF/Hogan charts/anchors и 9 viewports
  новых тестов, включая названия 80 W, длинное имя PDF и 390×400.
- Final delta: `npm test` 830 PASS / 1 skipped / 0 fail; `test:ui` PASS; build PASS.
- Оба audit: 0 vulnerabilities; package/lockfile после них не менялись.
- Source diff просмотрен; `git diff --check` PASS.
- Primary workspace с чужими dirty-правками сохранён. Сборка выполняется из
  чистого отдельного Git checkout, а не из общего dirty-каталога.

## Production review

После exact health SHA в существующей авторизованной сессии проверены:

- Desktop 1280×720: доступна «Добавить тест», открывается drawer с названием,
  пустой submit disabled; закрытие возвращает отчёты.
- Gallup сохранил 2 исходных PDF и 2 документа, 0 alerts; root overflow нет.
- Mobile 390×844: native form page с `formScreen`, поле названия и disabled submit;
  Back 48×48, submit 302×48, radius 24px; screenshots/DOM просмотрены.
- Short mobile 320×400: scrollWidth 320, Back 48×48 и submit 232×48 полностью
  видны (bottom384). Browser Back удаляет `formScreen`, восстанавливает отчёты.
- Временный viewport override сброшен. Полная fixture-матрица девяти viewports
  описана выше; live-проверка — этот указанный subset, не полный live matrix.

Тестовые записи и личные PDF в production для проверки не сохранялись.
OCR не реализован; реальные iOS/Telegram клавиатуры и mutating production
end-to-end upload не проверены. Необработанный/сканированный PDF без текстового
слоя возвращает явную ошибку вместо выдуманного результата.

Primary workspace остаётся dirty с несвязанными изменениями других задач.
В production собран чистый CI checkout final SHA; чужие изменения не включались.
