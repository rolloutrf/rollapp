# Разделение Wishlist — 31 октября 2026

Базовый HEAD76d9614; до начала изменений дерево чистое. Изменены переходы из
каждого пространства в бренды/магазин, сохранение tab при выборе бренда, запросы
space, server-side brand availability/count/items и scoped store state.
Поддерживаются все6 существующих пространств, без новых БД/демо/fixtures в runtime.

npm run build, node --check server modules и git diff --check прошли.
Тестовые наборы не запускались по прямому запросу пользователя.
Read-only existing-schema verify на настроенной production PostgreSQL прошёл;
реальные новые SELECT подтвердили: products → BORK/6 позиций; остальные5
пространств →0 брендов/0 позиций BORK. Использован pool1/TLS; DDL/data writes
не выполнялись. Деплой сохраняет pool2/verify и чистую историю.

Импортёр учитывает пустой результат scoped storefront без ошибки при zero total.
Покупки/списания/сохранения/переносы личных записей не выполнялись.
После rollout будут записаны точный health SHA и read-only UI review.
