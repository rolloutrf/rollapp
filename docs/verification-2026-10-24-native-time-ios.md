# Поля времени: выход за правый край на iOS, 2026-10-24

Исходный HEAD при осмотре: `95223417bdd06683875ef7cf273ecab599270779`, dirty до начала работы. Runner comprehensive зафиксировал HEAD `f55cce47e5718bc411f39cfc9436930deb152f23`, dirty: параллельная работа в общей checkout изменила HEAD между осмотром и запуском. Поэтому это не immutable snapshot. В ней уже были несвязанные изменения календаря, лабораторных результатов, отчётов, server/schema, package files и документации; они сохранены. Отчёт не доказывает состояние чистого релиза или production.

## Наблюдение и причина пробела

На пользовательском скриншоте формы «Записать сон» правые границы обоих time input выходят за экран, тогда как select/textarea остаются на странице. Действовавшие browser smoke используют Chromium. Само наличие мобильных viewport не означает проверку iOS RenderTheme. Дополнительно прочитан `scripts/health-trackers-smoke.mjs` той же 38c7 checkout: `assertGeometry` вызывается для списка сна до открытия EntryForm; сценарий открывает форму, изменяет заметки и сохраняет, но не проверяет bounds time input в открытой форме. Снимок sleep-history также делается до открытия. Это конкретный пробел и сценария, и платформенного покрытия.

В исходнике [WebKit RenderThemeIOS](https://github.com/WebKit/WebKit/blob/main/Source/WebCore/rendering/ios/RenderThemeIOS.mm) `adjustInputElementButtonStyle` устанавливает intrinsic minimum и `ContentBox` для нативных date/time с процентной шириной. Это соответствует наблюдаемому выезду на padding/border. Реальное устройство и его конкретная версия WebKit здесь недоступны: это диагноз по скриншоту и исходнику движка, не выполненный native-device before/after.

До исправления новая композиция полей успешно прошла геометрию на desktop WebKit и Chromium при всех восьми размерах. Это зафиксированный пример недостаточности эмуляции: macOS WebKit не воспроизводит iOS native theme. Лог `/tmp/rollapp-native-time-before.log`.

## Изменение

В product layer `src/index.css` для `input[data-slot="input"][type="time"]` заданы `appearance: none` (включая WebKit prefix), `border-box`, нулевой minimum и максимум по ширине родителя. Type/value/picker сохранены; upstream Input и обрезание root не менялись.

Добавлены `scripts/native-time-inputs-smoke.mjs` и fixture, npm `test:time-inputs`, обязательный запуск в `check:release` и установка WebKit в deploy workflow. Проверка охватывает не только document scrollWidth, но края каждого Input относительно Field и page rail, высоту 48px, ввод, сохранность соседнего значения, ошибки и запрещённые API-запросы. Вычисленный `appearance: none` проверяется отдельно, поскольку геометрия desktop WebKit сама по себе не выявляет iOS adjustment.

## Проверки

- `npm run dev:keepalive:status` вне sandbox: ready, API/frontend ready, постоянный production dev service оставлен работающим. Sandbox не позволял проверить PID; PID-файл не удалялся.
- `node scripts/native-time-inputs-smoke.mjs`: 16 PASS — WebKit/Chromium × 320/390/768/820/1024/1440/1920 и 390×400; mobile DPR 3. Логи `/tmp/rollapp-native-time-after.log` и финального повтора `/tmp/rollapp-native-time-final.log` (16 PASS после отрицательного контроля), снимки `/tmp/rollapp-native-time-{engine}-{width}x{height}.png`.
- В этой main checkout нет `health-tracker.jsx`. Для дополнительного диагностического просмотра прочитана существующая настоящая `EntryForm` из `/Users/mokoloskov/.codex/worktrees/38c7/rollapp/src/components/health-tracker.jsx` (SHA256 `022b6f3c823b1a23c93092f5cf9962737cafb141eb54727d4047aa805f1ea580`). Она собрана с текущими общими компонентами/CSS без изменения чужой checkout. API запрещены, onSave запрещён. Это комбинированный диагностический snapshot, не проверка полного приложения из другой ветки. 14 PASS (семь ширин, два движка). Диагностический скрипт сохранён в `/tmp/rollapp-sleep-form-ios-check.mjs` (relative imports от `scripts/`). Лог `/tmp/rollapp-real-sleep-ios.log`, снимки `/tmp/rollapp-real-sleep-{engine}-{width}.png`. Визуально просмотрены WebKit 390px и 1440px: оба поля внутри страницы.
- Отрицательный контроль: та же проверка с удалением поправки только Vite transform в отдельной тестовой сборке упала на `appearance: auto !== none` в WebKit 320px (exit 1 ожидаем). Основной CSS не изменялся. Лог `/tmp/rollapp-time-negative-control.log`. Это проверка opt-out guard, не воспроизведение iOS native theme.
- `npm audit --json`, `npm audit --omit=dev --json`: 0 vulnerabilities. Логи `/tmp/rollapp-time-audit.json`, `/tmp/rollapp-time-audit-prod.json`.
- `npm run check:comprehensive`: **PASS, exit 0, все 10 этапов**. Начало `2026-10-24T03:54:30.582Z`, завершение `2026-10-24T05:37:45.783Z`. JSON `/tmp/rollapp-native-time-comprehensive.json`, лог `/tmp/rollapp-native-time-comprehensive.log`.
- Финальный `git diff --check`: PASS. Финальный keepalive status: API/frontend ready, PID 60108; сервис оставлен работающим.

| Этап | Результат |
| --- | --- |
| `check:release` | PASS |
| `test:navigation` | PASS |
| `test:action-rails` | PASS |
| `test:identity-reports` | PASS |
| `test:todo` | PASS |
| `test:form-pages` | PASS |
| `test:catalog-page` | PASS |
| `test:wish-groups` | PASS |
| `test:drawers` | PASS |
| `test:contacts` | PASS |

Проверенные файлы поправки (SHA256):

- `src/index.css`: `f21dae588ee856f0fd430c6fb7e4986634799c73ba2bace870cae6a2a386815a`
- `scripts/native-time-inputs-smoke.mjs`: `d442cac09057ddd7b9fcbd624824c26625dedff07002c313657d701a843d05e1`
- `scripts/fixtures/native-time-inputs.jsx`: `d364c16c056ebb77673ff0c201f3c301a2b2e2dffe237dbfe9607b3d7a16d376`

## Ограничения

Реальный iPhone/Telegram, работа native picker на нём и production rollout пока не проверены. Через computer use нет доступной авторизованной browser session, Mac заблокирован; live UI не проверен. Исправление находится в текущей рабочей копии. Нельзя выдавать эти результаты за исправление уже развёрнутого сайта.
