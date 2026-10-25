# Каталог только в Wishlist — 25 октября 2026

Исходный commit: `acb652863a6df34570c994a9d7657ec21ef4f075`, рабочее дерево
чистое после commit. Он основан на `ebcddf4`: настройки тестов личности и
production PG_POOL_SIZE=2 сохранены.

Общий `SphereBusinessControls` больше не содержит ShoppingBag/catalog. Во всех
сферах остался только магазин за роллы. Generic React route
`/app/spheres/:sphereId/business/catalog` и соответствующий GET API удалены;
shared route builder/enum больше не разрешают этот режим. Wishlist сохраняет
свой `/app/wishes/catalog`, каталог брендов, item routes и API.

`npm run build` завершился успешно (обычное предупреждение о больших chunks),
`git diff --check` прошёл. Существующие model tests обновлены под новый контракт,
но тестовые наборы не запускались по прямому указанию пользователя о выпуске без
тестирования; это не comprehensive PASS. Production existing-schema verify и
marketplace LIMIT 0 прошли в READ ONLY transaction на настроенной базе/роли.
Первый запрос через CLI Lockbox не прошёл; повтор через штатный IAM loader
успешен. Миграции и записи в БД запрещены и не выполнялись.

Старые строки прежнего business/catalog не удаляются и не читаются приложением;
деструктивной очистки данных или изменения production constraint не было.
Новый schema template допускает только store; startup/deployment остаётся verify.
Покупки, переводы, редактирование личных документов и сохранение тестовых данных
не выполнялись.

Перед двумя последовательными image pulls проверены VM/container references и
наличие registry-копий. Удалены только два неиспользуемых локальных Rollapp tags
`c0e068d156ac88a8bc5f6baa472a7c48bc20922c` и
`71dcc8e7e8e7af4c2351fd6d3be7a3a4ef7cc82f`, без force/prune/удаления containers
или volumes. Текущий образ8559466, rollback58d71a1 и315f3eb/d35e714 сохранены;
свободно9364234240 bytes. Релизы сериализованы штатной production concurrency group.

Manual release без тестов: [run40221431012](https://github.com/rolloutrf/rollapp/actions/runs/40221431012).
Run завершился SUCCESS. Независимый production health вернул ok=true и точный
`acb652863a6df34570c994a9d7657ec21ef4f075`; runtime APP_VERSION совпал,
PG_POOL_SIZE=2 и ROLLAPP_DATABASE_INITIALIZATION=verify сохранены. После rollout
свободно6744367104 bytes, VM не перезапускалась вручную.

В авторизованном живом UI просмотрены Values, образование/курсы,
здоровье/препараты, карьера/контакты и навигация To Do: каталогов сфер нет;
панели сфер сохраняют магазин. Wishlist сохраняет отдельные ссылки на ленту,
каталог брендов и магазин. Старый identity/business/catalog в UI перенаправляет
на Wishlist; GET /api/business-marketplace/identity/catalog возвращает404.
Сохранён screenshot Values без кнопки каталога. Это read-only affected review,
не полная viewport/regression matrix. Покупки, сохранение и удаление не выполнялись.

Последующие main commits ced1e94/9c9d216 (label «Тесты» и отдельный ui-copy release
mode из связанного чата) сохранены при fast-forward. Этот отчёт — docs-only,
новый image rollout из этого чата после acb не запускался.
