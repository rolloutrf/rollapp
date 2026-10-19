# Завершение тестового Chrome: 2026-10-19

Статус: отдельный кандидат; в main не перенесён. База76a9f46, managed worktree
`/Users/developer/.codex/worktrees/test-browser-lifecycle/rollapp`.

## Причина и изменение

Main comprehensive остановился после13PASS date cases в browser.close.
Точная принадлежность orphan helpers Node44609 подтверждена по FD/peer sockets,
PPID и времени запуска; послеTERM только принадлежащих тесту44612/44660/44663
Node завершился и main runner продолжил проверки. Доказательства в
`notion-quote-gutter-verification-2026-10-19.md`.

`date-picker-pages-smoke.mjs` использовал свой chromium.launch, обходя существующий
`browser-runtime.mjs`. Кандидат использует общий browserLaunchOptions; на macOS
это отключает crashpad/updater для тестового browser, на CI сохраняет no-sandbox.
CHROME_PATH обрабатывается общим договором (ошибка явно заданного пути остаётся
видимой). Assertions, даты/ширины/высоты/сценарии и безопасная fixture не меняются.
Нет production API/DB writes или schema initialization.

## Проверка

Полный `npm run test:dates` завершён без фильтров: **13PASS, natural exit0**,
session25277, port5197. Лог `/tmp/rollapp-browser-lifecycle-dates.log`;
ручного завершения helpers не потребовалось. Начат с отдельными node_modules (`npm ci
--ignore-scripts`), src/workspace основного прогона не менялись.

Остальные прямые launch в controls/form-actions выявлены, но не изменены:
отказ именно date runner подтверждён, расширение patch без необходимости
не выполняется. Review diff, node --check и git diff --check PASS; candidate
SHA25624e9f87c5a91949889ddcf1c832f32247735a70f7d0c4f0dfc0f9931e5c5161b.
Следующий шаг: перенос после
завершения frozen main comprehensive. Этот фикс не закрывает editor/media,
Linux CI/release или реальные iOS/Telegram/IME проверки.

Изменение committed отдельно: `f1c1d6edd7f485d6d9cf1ebb77c345d01f4a19bb`,
ветка `codex/test-browser-lifecycle`, один файл; push/merge не выполнены.
Main sources сохранены. Повтор GitHub API после transient EOF подтверждает
CI39273880365 in_progress для76a9f46. Main controller43419 и quote editor49510
подтверждены через ps; оба продолжают прогресс в image matrices.

Обновление перед push: основной comprehensive завершился с ошибкой редактора.
После завершения date-lifecycle fix перенесён в main отдельным cherry-pick
`a96c63c0245b82fd94dad4b7862e0f509b0009a5`. Результат dates13/natural exit0
остаётся проверкой только этого изменения, не всего релиза.
