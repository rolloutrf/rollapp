# Проверка каталога мест «Жду на Роллапп» — 2026-11-20

Ветка `codex/shozhu-places-20261120` (worktree `/Users/mokoloskov/Desktop/Git/rollout/rollapp-places`), база `origin/main` (275e20f2). Состояние: изменения не закоммичены, diff соответствует фиче (серверный модуль `place-listings`, клиентский модуль, миграция, сид, фикстуры и смоуки, точечные правки `mobile-catalog-page-smoke` / `business-catalog-smoke` / `server/index.js` / `server/schema.js` / `server/account-backup.js` / `wish-catalog.jsx` / `catalog-brands.jsx` / `package.json` / `docs/modules/16-catalog-marketplace.md`).

## Что проверено

| Проверка | Команда | Результат |
|---|---|---|
| Юнит-тесты (после фикса `Array.isArray` в загрузке списка мест) | `npm test` | 1100 тестов, 1098 pass, 0 fail, 2 skipped |
| Смоук бизнес-аккаунтов | `node scripts/business-accounts-smoke.mjs` | PASS на 8 вьюпортах |
| Смоук каталога (карточки мест, цикл кнопки «Жду на Роллапп») | `node scripts/business-catalog-smoke.mjs` | PASS на 8 вьюпортах + loading/empty/retry |
| Смоук профиля, секция продаж | `node scripts/business-profile-smoke.mjs --sales-only` | PASS |
| Смоук профиля, секция объявлений | `node scripts/business-profile-smoke.mjs --announcements-only` | PASS |
| Смоук профиля, секция витрины | `node scripts/business-profile-smoke.mjs --storefront-only` | PASS |
| Смоук страницы каталога | `npm run test:catalog-page` | PASS на всех вьюпортах |
| Production-сборка | `npm run build` | успешно (4 с) |
| Живой dev-сервер против production БД (verify-режим) | `npm run dev` | frontend `/` → 200; `GET /api/wishlist-business/places/places` без куки → 401 «Сначала войдите в аккаунт» |
| Миграция и сид production БД | `node scripts/migrate-place-listings.mjs --apply`, `node scripts/seed-place-listings.mjs --apply` | таблицы `place_listings`/`place_waitlist` созданы; засеяно 336 мест (space=places, source=shozhu) |

Исправленные находки в ходе работы: `COUNT(*)::int` в списке мест (счётчик приходил строкой и склеивался при конкатенации); защита `Array.isArray(places)` перед setState — без неё ответ фикстуры без массива `places` ронял всё дерево React («Cannot read properties of undefined (reading 'length')»), что проявлялось в `business-accounts-smoke` как «element was detached»; `mobile-catalog-page-smoke` приведён к сортированному массиву ожидаемых запросов.

## Непроверенные случаи

- Авторизованный live-клик по кнопке «Жду на Роллапп» на production-данных: пароля пользователя нет; полный цикл клика покрыт смоуком `business-catalog-smoke` (wait → «Ждёте (N)» → отмена) с мок-API. Фича станет видна на проде после push и деплоя ветки.
- Эмулированные профили смоуков не заменяют проверку на реальном устройстве.

Серверы остановлены: постоянный `dev:keepalive` основного checkout не затрагивался; временный dev-сервер worktree остановлен после проверки.
