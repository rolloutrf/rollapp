# Проверка Android — 19.11.2026

- Основа: `f55cce47e5718bc411f39cfc9436930deb152f23`. До работы дерево было чистым; проверялось дерево с незакоммиченными изменениями Android и маршрута Digital Asset Links.
- В production `/api/healthz` вернул `ok: true`, SHA `fe20732cf70fa675a6206a8dd3a9f7d92ffe7810`. Постоянное подключение в основном рабочем дереве подтвердилось через `npm run dev:keepalive:status`; сервис оставлен включённым. Данные и схема не изменялись.
- Гостевой read-only проход в Chromium на 320×844, 390×844 и 390×400, DPR 3: в production `/` открывает список ожидания, поэтому Android стартует с `/app/wishes`. Этот маршрут приводит на обычный экран входа через Яндекс ID, ширина документа совпадает с шириной viewport. Это браузерная эмуляция, не проверка на Android.
- `npm test`: 790 успешно, 1 пропущен. Новый HTTP-тест Android association подтверждает JSON без перенаправления и без immutable-кэша. `npm run test:ui` и `npm run build` прошли; файл Digital Asset Links перенесён в `dist/.well-known/`.
- `npm run check:comprehensive` остановлен на `test:form-actions`: предыдущие тесты контролов, деталей, дат и календаря завершились успешно; вся матрица не завершена.
- `npm audit` и `npm audit --omit=dev`: соответственно 12 и 4 предупреждения в существующем lockfile. Зависимости npm не менялись.
- Android SDK 36, JDK 17 и Gradle Wrapper 8.13 подготовлены; SHA-256 Gradle и Wrapper сверены, `aapt2 compile` проверил XML ресурсов и изображения. Команда `./gradlew :app:lintDebug :app:assembleDebug :app:bundleRelease` заблокирована обрывом TLS при скачивании Gradle-зависимостей с Google Maven. APK и AAB не получены.
- Production не обновлялся: действующий `/.well-known/assetlinks.json` пока отдаёт HTML старого веб-релиза. Релизная подпись, привязка домена, фактическая установка, вход, Android Back, IME и выбор файла на устройстве не проверены.

## GitHub Actions

- Чистая база `951c29e5eafd9a4581703db8eb1f054e56ee8f7d`, проверяемый commit `719dfe0282cad0a5d5e02367e7f447bb784710ca` в `codex/android-apk`. В ветку отправлены только Android-модуль и workflow; незакоммиченные веб-правки исходного worktree сохранены. `main` и production не изменялись.
- Запуск [44589267099](https://github.com/rolloutrf/rollapp/actions/runs/44589267099) остановился из-за отсутствующего `sdkmanager`. Workflow теперь устанавливает Android SDK на runner.
- В запуске [44589641255](https://github.com/rolloutrf/rollapp/actions/runs/44589641255) установка SDK прошла, шаг `Lint and build` завершился ошибкой. Получить подробный журнал пока не удалось: запросы к GitHub API обрываются (EOF). Подписанный APK не опубликован.

## Слияние в main

- Ошибки GitHub Actions исправлены: минимальный API поднят до 24 по требованию Android Browser Helper, настройка панели навигации вынесена в ресурсы API 27+. Автосборка больше не ограничена списком изменённых файлов при push в `main`.
- [PR #15](https://github.com/rolloutrf/rollapp/pull/15) слит на проверенной базе `af73ae845f6e5e1c7f38db3d5f99c60ffb83eaae` из `f2ee3ac7b9852b919511c743ef6baec6f19db794`. Точный merge SHA — `092837c8cbe0da428c1840241bd11461cfcae96c`. Исходное локальное рабочее дерево с веб-правками не использовалось для слияния.
- До слияния проверены настроенная production БД, роль и существующая схема в `READ ONLY`, включая защищённые покупки, награды, бэкап, оповещения и хранилища Диска; миграций и записей не выполнялось. Keepalive оставлен работающим.
- [APK из main](https://github.com/rolloutrf/rollapp/actions/runs/44593664197/artifacts/14564922137) собран после push от merge. Actions успешно выполнил lint, debug APK, release AAB и проверку подписи. Скачанный APK повторно проверен `shasum -a 256 -c` и `apksigner verify`; `aapt2 dump badging` подтвердил имя Rollapp Debug и API 24. Установка на физическое устройство не проверялась.
- [Веб-выкладка](https://github.com/rolloutrf/rollapp/actions/runs/44593663994) поставлена в очередь на тот же merge SHA. На момент проверки production health оставался на `f72d935e318d3f76d32f2dfe59a4b023e3ce9210`; завершение rollout не подтверждено.
