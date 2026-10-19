# Отступ панели действий — 2026-10-17

Проверен workspace на HEAD `710457583a873ce56b93d4eb26849731164f5b2d`, dirty до начала работы; параллельные изменения сохранены. Это проверка рабочего дерева, не чистого релизного коммита.

Причина: внешняя панель бизнес/магазин в Four Questions и Values не имела общего gap с вложенным содержимым. В TabsContent этих разделов добавлен существующий `page-stack`: 24px через `--layout-page-gap`. Токены, размеры контролов и типографика не менялись. Контракт дополнен в AGENTS.md и docs/spacing-system.md.

Проверки:
- `npm run dev:keepalive:status` вне sandbox: сервис PID 52615, API/frontend готовы; оставлен работающим.
- `node scripts/check-shadcn.mjs`: PASS.
- `node scripts/action-rails-smoke.mjs` вне sandbox: exit 0, 90 сценариев на 320/390/640/767/768/820/1024/1440/1920px; 820px при высоте 414px. Новый nested-сценарий проверяет точный зазор 24px. Сохранены центрирование, динамические действия, достижимость краёв и прокрутка в потоке.
- Просмотрены screenshots `/tmp/rollapp-toolbar-gap-390.png` и `/tmp/rollapp-toolbar-gap-1440.png`.
- `git diff --check`: PASS. Просмотрен diff затронутых файлов; прочие изменения не отменялись.

Ограничения: browser fixture использует production CSS и отклоняет API; отдельный живой авторизованный просмотр Four Questions/Values и полный check:comprehensive не выполнялись. Production-данные не изменялись. Проверка не является полным аудитом приложения или подтверждением деплоя.
