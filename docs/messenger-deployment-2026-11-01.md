# Выпуск мессенджера — 1 ноября 2026

Пользователь отдельно поручил выкатить реализацию после её локального завершения.
Изолированный commit мессенджера перенесён поверх актуального main `d017f05`;
история старого checkout не переносилась, изменения остальных задач сохранены.
Конфликты разрешены с сохранением текущих main routes, schema guards, scripts
и lockfile. Ранее созданные verification-документы остаются историческими
свидетельствами исходного checkout, а не проверкой новой main-базы.

Предыдущий production health: `1531e984d25f0ae9e8b63d083a225ee9a433fcf2`, ok.
Никаких новых миграций в ходе выпуска: таблицы мессенджера уже созданы по
отдельному разрешению пользователя в предыдущем этапе.

Перед публикацией проверены:

- `npm test`: 879 tests, 878 PASS, 1 штатный SKIP, 0 FAIL.
- `npm run test:ui` и `npm run build`: PASS.
- `npm run test:messenger`: полная 9-viewport матрица после переноса на main;
  cold prebundle включает qrcode, добавленный в app chrome новой main-версии.
- Реальная существующая production auth/document/planning/private schema
  проверена через initializeRuntimeDatabase в READ ONLY транзакции: PASS,
  БД rollapp / роль rollapp_app, migration callback запрещён.
- `npm audit` / `npm audit --omit=dev`: 8 development advisories / 0 runtime;
  npm audit fix не изменил lockfile. Принудительные несовместимые изменения
  не применялись.

Выкатка — штатный GitHub Actions, полный режим проверки. Старый сервис
сохраняется до успешных проверок и immutable image build/push. Release не
считается завершённым до public health с точным ожидаемым SHA и проверки UI.

Первый CI `41317841617` остановился до публикации образа на UI contract guard:
текущий main WishlistBusiness импортировал ui/drawer напрямую и использовал
native button. Исправлены реальные композиции: общий form-surface и Button
с сохранением полноразмерного клика по карточке. Guard не ослаблялся.
Повторный локальный `npm run test:ui` — PASS (97 application sources).


## Фактический результат

Пользователь явно отменил полный набор проверок. Полный run41318114646
отменён и дождался terminal cancelled до запуска следующего релиза, чтобы
его deploy-step не мог позже конфликтовать с новой выкладкой.

Штатный сокращённый `verification=ui-copy` запускает unit, UI contract,
полную control-size матрицу и build. Он завершился **success**:
https://github.com/rolloutrf/rollapp/actions/runs/41323746540
Дополнительно после отмены полного набора отдельно повторён messenger UI:
9/9 PASS, реальные API в fixture запрещены. Это не полный comprehensive PASS.

Immutable runtime SHA: `918285ed8be1cdcc8d0a71d42d56c156957e7d91`.
Публичный health подтвердил ok=true, service=rollapp и точное совпадение SHA.
CI image build/push, metadata identity verification, public health/canonical
redirects и Telegram configuration прошли. VM не перезагружалась.

Read-only VM preflight подтвердил id/folder/runtime-SA и строгий SSH host key;
свободно7815311360 байт перед выкладкой, старый image1531e98 работал.
Никаких удалений Docker images, контейнеров, volumes или данных БД не было.

Реальная authenticated production UI проверена в IAB: на Wishlist появилась
кнопка сообщений48×48px на8px выше планирования48×48px. Переход открыл
мессенджер и пустой список без API-ошибок; поиск нашёл зарегистрированного
участника. Поиск очищен. Диалоги и сообщения для QA не создавались.
Production вкладка оставлена на /app/messenger. Управляемый preview оставлен
работающим на15277/18277 с production TLS/pool1/verify.

Этот последующий отчёт не меняет runtime-код; в production остаётся указанный
immutable SHA. Полные прогоны остаются остановленными/неуспешными, а не зелёными.
