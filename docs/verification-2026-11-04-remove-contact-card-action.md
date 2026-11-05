# Удаление отдельной кнопки визитки — 2026-11-04

- SHA: `1bd93fc34dcdaabc684ab0bd1598f5db5a1f8e66`, checkout `04c7` изначально чистая. В исходной checkout чата `03d1` этой кнопки нет; точное совпадение со скриншотом найдено здесь.
- Удалены «Моя визитка» из ContactsProfileControls, её prop и недостижимые после удаления локальные state/dialog/session. Общая визитка в шапке профиля сохранена.
- `dev:keepalive:status`: managed service готов, API/frontend готовы, frontend `http://127.0.0.1:5276/login`. Сервис оставлен работающим.
- `npm run test:ui`, `npm run build`: PASS; предупреждение о крупных chunks. `git diff --check`: PASS; diff просмотрен.
- `npm run test:action-rails`: вариант `320 contacts-real` прошёл; следующий `wishlist-real` выдал ошибку `Cannot destructure property 'user' of 'useSession(...)' as it is null` в WishesProfileControls. Полная матрица не подтверждена; лог `/tmp/rollapp-remove-card-rails.log`. Этот unrelated fixture отказ не скрыт и проверки не ослаблялись.
- Живой авторизованный UI и полная desktop/mobile геометрия не проверены. Пользовательские данные и БД не менялись. Аудиты зависимостей в этой checkout не повторялись, зависимости не менялись.
