# Выпуск эмулятора виртуальной карты — 4 ноября 2026

Пользователь явно запросил: «Деплой без полного теста».
Полная release/comprehensive матрица повторно не запускается.

Runtime commit: `87d8bb5e4ec6834b52a44d0b6f12d141c79f1bee`.
Интеграция приложения до исправления workflow: `5534903`.
Изменение карты: `45499f9`; актуальный `origin/main` с need rewards объединён
без конфликтов, чтобы сохранить новые функции production. До выпуска рабочая
копия чистая; diff приложения с предыдущим main содержит девять файлов задачи; дополнительно
обновлены workflow и его контракт, чтобы none пропускал тестовое окружение.

Предыдущая здоровая production-версия (rollback):
`29611cbd41db358682d3a2f6e939c622435b6c6d`.
VM: `fv4chl6pdb4lnhsj7139`, folder `b1gebpfrhvkd43r38q98`,
runtime SA `ajers2ngi708sf3i1t4g`, статус RUNNING.
Read-only cloud inspection подтвердил immutable image предыдущей версии.

[Workflow 41894632396](https://github.com/rolloutrf/rollapp/actions/runs/41894632396)
запущен через `workflow_dispatch` на main с `verification=none`.
Push-коммиты имеют `[skip ci]`, чтобы не запускать полный тестовый набор.
GitHub connector не предоставляет dispatch; использован авторизованный `gh`.

Перед выпуском `initializeRuntimeDatabase` реально проверил production
`rollapp` / `rollapp_app` в режиме `verify`, READ ONLY, с запрещённым callback
миграции. Схема, записи и остатки не менялись. Preview остаётся включённым:
pool1, direct TLS, verify, API8187 / Vite5187.

Предыдущая профильная проверка описана в
[virtual-card-verification-2026-11-03.md](virtual-card-verification-2026-11-03.md).
Эмулятор использует только тестовую сессию вкладки, без реальных платежей,
банковских реквизитов и списаний роллов.

Первая попытка [41893070772](https://github.com/rolloutrf/rollapp/actions/runs/41893070772)
остановлена до cloud deployment: runner завис при скачивании FFmpeg с Ubuntu
mirror. Проверено, что Deploy image to production VM оставался pending.
После обычного cancel потребовался force-cancel только этого runner;
дождались terminal `completed/cancelled`, затем запустили новый workflow.
`verification=none` теперь пропускает FFmpeg и Python codec на runner;
Dockerfile/runtime dependencies не менялись. Узкая проверка
`node --test scripts/deploy-vm-metadata.test.js`: 13/13 PASS.

## Состояние rollout

Workflow `41894632396` завершился `completed/success`.
Production `/api/healthz`: `ok=true`, `service=rollapp`,
`version=87d8bb5e4ec6834b52a44d0b6f12d141c79f1bee` — точное совпадение.
HTTP `/app/wishes`: 200. Опубликованный `/assets/index-CHhMpjRL.js` содержит
кнопку эмуляции покупки и provider key `rollapp:virtual-card-sandbox:`.
Сборка, push immutable image, metadata update, exact-SHA health,
canonical redirects/profile и Telegram configure завершились успешно.
Полные/целевые browser suites workflow пропустил по выбранному none.

Сборка и отправка образа заняли больше обычного; до переключения предыдущая
версия продолжала отвечать успешно. Ограниченные окна опроса health до
завершения push показывали прежний SHA; итоговая проверка после rollout
подтвердила новый SHA и новый frontend asset.

После rollout во встроенном браузере открыта существующая авторизованная
production-сессия: Wishlist → Уход → группа «Зубная щетка». Сбор загрузился
без ошибки, статус «Приостановлен», 0 из 10 000 роллов; ранней кнопки выпуска
нет, что соответствует условию completed. При 1280px root overflow=false;
скриншот просмотрен. Формы/взносы/покупки не сохранялись.

## Ограничения проверки

Повторный полный тест/аудит не выполнялся по прямому указанию пользователя.
Первоначальная попытка native Comet review встретила ошибку ScreenCaptureKit
и timeout; проверка продолжена успешно в IAB с существующей авторизацией.
Завершённый production-сбор и выпуск карты в нём не создавались ради проверки;
сценарий выпуска/покупки покрыт ранее выполненными fixture/unit тестами.
Повторная полная viewport-матрица в этой выкладке не выполнялась.
SSH read-only diagnostics двумя существующими ключами завершились закрытием
соединения; ручные рестарты, чистка образов/диска и удаление данных не выполнялись.
