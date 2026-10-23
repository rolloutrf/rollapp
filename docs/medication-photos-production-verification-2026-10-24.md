# Фото препаратов: production verification, 24 октября 2026

Опубликован и проверен полный SHA `18bb093354bb8ea5c36f2696c6321381d8cd68a5`.
`/api/healthz` возвращает ok=true, service=rollapp и точно этот SHA.
Контейнер использует immutable tag18bb093; 7,2 ГБ свободно на boot disk.
Canonical host/profile redirects и public profile200 прошли. У legacy profile
Location относительный `/koloskof`; сравнивается разрешённый URL, как в CI curl.
Первоначальная overly-strict диагностическая проверка буквального absolute
Location исправлена без изменения приложения.

Полный локальный comprehensive на чистом9383c96 описан в
[отчёте реализации](medication-photos-verification-2026-10-23.md).
После него до merge18bb093 изменён только отчёт. CI run
[40025620661](https://github.com/rolloutrf/rollapp/actions/runs/40025620661)
успешно завершил Install, полный Test and build и registry login, но упал при
push большого слоя: Yandex Registry HTTP503. Этот workflow целиком НЕ PASS.
Код и release gate не менялись; VM оставалась здоровой на00e71d7.

Повторная локальная сборка exact git archive18bb093 штатным Dockerfile прошла
после transient TLS ошибки Alpine, но push большого dependency layer снова
получил503. Для восстановления публикации использован здоровый предыдущий
runtime image00e71d7, pinned digest
`sha256:27cf6d7a365803928e88f9f46397a1b423315b90c53aa5f01cea8c4cdb4ce4e7`.
Автоматическая сверка подтвердила неизменность Dockerfile, lockfile и всех
наборов dependencies/devDependencies/optionalDependencies/overrides/engines.
Build stage выполнен из exact archive18bb093; runtime app directories заменены
целиком (dist/server/shared/certs), package files и Caddyfile скопированы из
того же commit. Системные зависимости и CMD/ENV наследуются здоровому образу.
Проверка Linux/amd64 и SHA256285 runtime source files внутри image совпала с Git.
Recovery Dockerfile, logs и приватные операции сохранены вне репозитория в/tmp.

Опубликованный digest:
`sha256:3e8fb4c49d0507498221ff8187b7fcbb850c29c49e82a5060aabab27e8dc4541`.
Совпадение registry/local image подтверждено до metadata mutation.
VM/folder/runtime-SA, metadata endpoints и отсутствие conflicting declaration
проверены штатным deployVmMetadata check-only. Старый Compose сохранён0600 вне
репозитория. Применён штатный metadata-only upsert и проверен точный Compose;
startup verify сохранён, миграции/инициализации/данные не запускались.
VM автоматически согласовала новый образ; reboot/restart не выполнялись.

Перед rollout свободно было4,9 ГБ. Все контейнеры проверены: один, образ00e71d7.
В registry подтверждены две неиспользуемые старые версии7104575 иd116857;
удалены только эти точные локальные tags без force. Сохранены00e71d7,
2373865 и5ab7f67 и все container-referenced images. Свободно стало7,3 ГБ;
после rollout7,2 ГБ. Containers/volumes/registry images/данные не удалялись.
Фильтр COI pull errors не показал ошибок; полный COI log/env не выводились.

## Реальная опубликованная UI

В существующей authenticated session повторно открыта целевая группа и
проверены все семь карточек с original owned PNG. На320/390/768/820/1024/
1440/1920×900 и390/1024×400 все7 изображений complete/naturalWidth>0,
каждое `/api/media/:id`, границы img внутри рамки, root overflow отсутствует.
Изменения данных при проверке не выполнялись. Screenshot desktop/full-page и
mobile просмотрены; упаковки30/60 капсул сохранены точно.

Evidence вне репозитория:
`/tmp/rollapp-medication-production-photo-checks.json`,
`/tmp/rollapp-medication-photos-production.jpg`,
`/tmp/rollapp-medication-photos-production-mobile.jpg`.
Постоянный production TLS dev keepalive на5358/8358 оставлен включённым.
Actual-device IME и ручной системный file picker не проверены; настоящий
filechooser→upload→Save подтверждён в предыдущем отчёте.

Первичный npm audit показывал0. При повторном аудите после обновления advisory
базы обнаружены body-parser/zod high advisories. Совместимые исправления с
lockfile и проверками подготовлены в отдельной ветке; deployed18bb093 их ещё не
содержит. Точные версии и результаты — в
[dependency security report](dependency-security-verification-2026-10-24.md).
