# Сторис только в «Друзьях» — 1 ноября 2026

Основа: f55cce47e5718bc411f39cfc9436930deb152f23. Рабочее дерево dirty: сохранена предшествующая реализация сторис и её отчёты; новая правка ограничивает UI-маршруты. Деплой не выполнялся, данные/схема БД в этой правке не менялись.

PersistentProfileHero и компактная аватарка предоставляют сторис только для точного раздела `/app/friends` и вложенных путей. Похожие префиксы вроде `/app/friendship` не включают сторис. Вне раздела своя аватарка открывает ProfileSettingsModal; публичный профиль восстановил исходную композицию без StoryAvatar. Контракт обновлён в docs/stories.md и AGENTS.md.

Проверки:

- npm run test:ui — PASS; добавлен запрет StoryAvatar в PublicProfile.
- npm run test:stories — PASS: 49 переходов через реальный PersistentProfileHero на 7 размерах 320–1920px, плюс 16 случаев записи/просмотра на восьми размерах в обеих темах. Routes: friends root/slash/subscriptions/followers → stories; wishes/identity/friendship → profile. API fixture запрещены.
- npm run build — PASS (обычное предупреждение о chunks).
- git diff --check — PASS.
- dev:keepalive:status — API и frontend готовы, сервис оставлен работающим.

Живой local UI с production API в существующей сессии: `/app/friends/` перенаправился на subscriptions, аватарка открыла «Новая сторис»; на `/app/wishes` нет story-avatar, та же аватарка открыла «Изменить профиль». Оба экрана закрыты без сохранения; камера и публикация не запускались. Прежние ограничения общего comprehensive-аудита не снимаются этими целевыми проверками; предыдущие отчёты сохранены отдельно.
