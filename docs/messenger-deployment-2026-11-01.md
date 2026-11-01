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
