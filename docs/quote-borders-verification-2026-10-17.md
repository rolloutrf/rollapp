# Удаление левых границ у цитат — 2026-10-17

Проверяемый HEAD: `710457583a873ce56b93d4eb26849731164f5b2d`. Рабочее дерево было dirty до начала задачи: многочисленные изменения приложения, редактора, документации и проверок. Они сохранены; это не проверка чистого релиза.

## Изменение

В общем правиле `blockquote` в `src/typeset.css` задано `border-inline-start: 0`. Курсив, `1em` внутреннего отступа и ритм цитат сохранены. Правило действует в чтении и inline-редакторе, включая тезисы. Синхронизированы `docs/typography.md`, `AGENTS.md` и пункт проверки в `docs/verification.md`.

## Проверки

- `npm run dev:keepalive:status`: API и frontend готовы, постоянный production-backed сервис оставлен работающим.
- `npm run test:ui`: passed, 37 primitives / 64 application JSX sources.
- `npm run test:text-edit`: passed (exit 0), полная матрица 320/390/768/820/1024/1440/1920 × 844 и 390 × 400, состояния read-only/loading, редактирование, Markdown, автосохранение/восстановление, блоки, положение выделения и символьные сокращения.
- Отдельный browser-проход на существующей text-edit fixture с двумя цитатами: 320, 390, 768, 820, 1024, 1440, 1920 × 844. Везде `borderInlineStartWidth=0px`, `paddingInlineStart=18px`, italic, 18px/28px, без горизонтального переполнения. Запросы к API блокировались; БД не подменялась. Скриншоты 390 и 1440 просмотрены.
- `npm run build`: passed; предупреждение о крупных chunks.
- `npm run check:comprehensive`: остановлен на unit-тесте `identity reports keep their narrow-screen layout contract` (`src/components/identity-reports.test.js`): `Gallup DNA labels must use shrinkable grid tracks`. Это отдельный контракт Gallup, не затронутый удалением границ цитат. Unit: 513 passed, 1 failed, 1 skipped. Остальные этапы comprehensive не выполнялись.
- `npm audit`: 7 high в dev-цепочке braces/micromatch/fast-glob/shadcn; предложено несовместимое понижение shadcn. Зависимости не менялись.
- `npm audit --omit=dev`: 0 vulnerabilities.
- `git diff --check`: passed.

## Ограничения

Read-only просмотр живой страницы через существующую сессию Comet не завершён: native browser tool дважды вернул timeout. Визуальная проверка выполнена на компоненте с production CSS. Production-данные не изменялись. Полная проверка приложения не заявляется; публикация не выполнялась.

Логи: `/tmp/rollapp-quote-borders-check.log`, `/tmp/rollapp-quote-borders-comprehensive-2026-10-17.json`, `/tmp/rollapp-quote-borders-text-edit.log`, `/tmp/rollapp-quote-borders-build.log`. Геометрия: `/tmp/rollapp-borderless-quotes-results.json`; скриншоты: `/tmp/rollapp-borderless-quotes-{width}.png`.
