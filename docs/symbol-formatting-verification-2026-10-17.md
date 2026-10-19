# Форматирование символами — 2026-10-17

Проверено: `710457583a873ce56b93d4eb26849731164f5b2d`, dirty workspace; 2026-10-17T21:13:02.798174+03:00. Чужие изменения сохранены. Коммит и deployment не выполнялись.

Форматирование выполняется input rules редактора при реальном наборе, без повторного разбора всего документа. Основные Markdown-сочетания сохранены; включены Markdown-ссылки, одинарная тильда, `[X]`, неразрывный пробел и Enter после кодового fence с языком. Преобразование пункта в задачу разделяет только текущий список вокруг этого пункта и сохраняет вложенное содержимое/порядковые номера.

## Проверки

| Команда | Результат |
| --- | --- |
| `TEXT_EDIT_PORT=5299 npm run test:text-edit` | passed: full editor matrix and advanced cases plus 33 typed shortcuts + 4 literal/unsafe cases at each of 390/1440×400 |
| `TEXT_EDIT_PORT=5300 npm run test:text-edit -- --symbols-only` | passed: targeted symbols only, including formatted autosave before Backspace/Undo |
| `npm run check:comprehensive` | failed at release unit stage: 513 passed, 1 skipped, 1 unrelated failure in src/components/identity-reports.test.js, Gallup DNA labels must use shrinkable grid tracks. Later comprehensive stages not run. Shortcut/list-splitting and Markdown unit cases passed. |
| `npm run test:ui` | passed: 37 primitives / 64 application JSX sources |
| `npm run build` | passed; existing chunk-size warning |
| `npm audit` | 7 existing high vulnerabilities in development tooling; dependencies unchanged in this task |
| `npm audit --omit=dev` | 0 vulnerabilities |
| `git diff --check` | passed |
| `npm run dev:keepalive:status` | ready; service PID 52615 retained, production TLS database configured |

Общий editor smoke проверен на 320×844, 390×844, 390×400, 768×844, 820×844, 1024×844, 1440×844 и 1920×844. Новые наборные сценарии выполняются на 390/1440×400: 33 сочетания на каждой ширине, включая заголовки 1–6, три маркера списка, номера 1/3, задачи с x/X/обычным и неразрывным пробелом, цитату, три разделителя, парные знаки, ссылку и три кодовых fence. Для каждого проверены преобразованный DOM, отправленный Markdown, Backspace или Undo/Redo; отдельно проверены буквальный код, четыре отрицательных случая, смешанное форматирование и загрузка без записи.

Unit-проверка сохраняет соседние пункты, жирное выделение, вложенный список, отметку задачи и номера при разделении bullet/ordered list; Undo возвращает исходный документ. Исходные Markdown-документы продолжают проходить round trips.

Read-only load of production-connected document: updated Bold/Italic symbol hints visible, prose border 0px / outline none / shadow none. No text typed, no data saved; temporary tab closed.

UI fixtures отклоняют API-запросы и не используют БД. Живое приложение использует настроенный production API; тестовые данные не сохранялись. Постоянный сервис оставлен работающим. Не проверены реальные IME/клавиатуры iOS/Telegram. Полный comprehensive нельзя считать пройденным из-за существующего Gallup-теста.

Поддерживаемые сочетания: [контракт редактора](inline-editing.md). Одинарная тильда согласуется с [документацией Notion](https://www.notion.com/help/writing-and-editing-basics); каноническое хранение остаётся Markdown с двойной тильдой. Логи и SHA-256: [JSON](symbol-formatting-verification-2026-10-17.json).
