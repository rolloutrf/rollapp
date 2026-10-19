# Скругление кнопок — 2026-10-17

Проверяемый HEAD: `710457583a873ce56b93d4eb26849731164f5b2d`; workspace dirty до начала работы, содержит параллельные изменения, которые сохранены.

Исправление: общий слой `src/spacing.css` задаёт всем кнопкам ControlBar радиус 24px (половина общей высоты 48px), включая Save/Back/Delete в MobileFormFooter. Upstream primitives не изменены. Правило добавлено в AGENTS.md и docs/spacing-system.md. В test:form-actions добавлена проверка всех четырёх computed радиусов.

Проверки:
- test:ui — PASS.
- test:form-actions — PASS, exit 0, полная матрица 320/390/640/767/768/820/1024/1440/1920 и 390×400, включая markdown, contact, wish, task и principle.
- test:controls — сценарии полной матрицы прошли до 1920px; завершение процесса проверяется отдельно.
- check:comprehensive — остановлен: порт 5192 занят другим процессом. Отдельные проверки форм и контролов повторены временными копиями скриптов с заменой только портов 5198→5298 и 5192→5292; API fixtures не используют.
- dev:keepalive:status вне sandbox — API/frontend готовы, production-сервис оставлен работающим.
- npm audit: 7 high; npm audit --omit=dev: 0. Зависимости в рамках этой правки не изменялись.
- git diff --check — PASS.

Ограничения: полный comprehensive не завершён; реальный iOS/Telegram и сохранение пользовательских данных не проверялись. Публикация не выполнялась.
