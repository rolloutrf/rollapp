# Границы блочного выбора — проверка 2026-10-18

**Исправление внесено в runtime.** HEAD
`710457583a873ce56b93d4eb26849731164f5b2d`, dirty workspace; чужие изменения
сохранены. Зафиксированы 482 code/config source files, drift отсутствует.
Полная цель Notion остаётся открытой.

## Что изменено и почему

Shift-клик между ответами раньше не создавал BlockSelection: общий предок —
фиксированные `questionSection`, которые нельзя выбирать. Новый
`blockSelectionBetween` сохраняет прежнее поведение соседней группы, а через
защищённые секции собирает точные целые блоки между валидными концами. Включается
промежуточная проза; фиксированные вопросы не выбираются. Направление сохраняется.

Второй случай: native range заканчивается ровно в начале нетронутого ответа.
Escape попадал в закрывающий токен предыдущей секции вместо её последнего блока.
Теперь выбирается последний блок предыдущего ответа, а нетронутый ответ исключён.
Концы на самих фиксированных обёртках по-прежнему отклоняются.

Изменены `src/lib/inline-block-selection.js` и
`src/lib/inline-block-selection-extension.js`; добавлены пять unit-тестов в
`four-question-document.test.js` и `inline-block-selection.test.js` и восьмиразмерная browser-матрица
`text-block-boundary-checks.mjs`, включённая в полный `test:text-edit`.
Исторические прототипы не подменяют проверки реально внесённого кода.

## Отрисовка обнаружила дополнительную ошибку

После первых зелёных assertions screenshot показал белое нативное выделение
вопросов и текстовую панель. Trace `/tmp/rollapp-boundary-selection-timing.log`
подтвердил: `rollappBlocks` с четырьмя позициями через layout превращался в
`text`, декорации исчезали и появлялся toolbar. Это не ошибка screenshot-теста:
состояние оставалось неправильным и через 350ms. Предыдущий полный run 77060
на неизменённых исходниках намеренно прерван (SIGINT exact PID 93994, exit 130).
Сервис 99362 не прерывался. Этот прогон не считается успешным.

`projectedBlockSelection` в `createSelectionBetween` теперь отличает браузерную
проекцию собственных границ от нового частичного text range. Явный mouse/touch
pointer разрешает текстовый курсор; следующая блочная команда сбрасывает intent.
Пустой абзац остаётся выбираемым блоком, а обычный клик сразу разрешает ввод.

Boundary и sparse матрицы теперь проверяют позиции/направление/декорации,
`ProseMirror-hideselection` и отсутствие toolbar **каждый кадр 650ms**.
Обе дали по 8 PASS, exit 0. Более длинная synthetic проза отдельно проверена
до/после screenshot и 350ms на 390×844, 390×400, 1440×844; фактические новые
изображения просмотрены. Лог `/tmp/rollapp-boundary-native-visual.log`.
Предыдущие screenshots без `after-native-fix` показывают контрпример и не
являются результатом исправления. Новые screenshots:

- `/tmp/rollapp-block-boundary-selection-390-844-after-native-fix.png`
- `/tmp/rollapp-block-boundary-selection-390-400-after-native-fix.png`
- `/tmp/rollapp-block-boundary-selection-1440-844-after-native-fix.png`

## Результаты изменённого кода

- `npm run test:unit`: exit 0, **604 total / 603 PASS / 1 SKIP / 0 FAIL**.
  `/tmp/rollapp-boundaries-native-unit-final.log`.
- `npm run test:text-edit -- --boundaries-only`: exit 0, **8 PASS** —
  320, 390, 768, 820, 1024, 1440, 1920 px и 390×400.
  `/tmp/rollapp-boundaries-native-target.log`.
- Матрица использует реальные Shift-клики и native selection в обе стороны.
  Проверены exact copy/delete/type/colour, смена типа, один Undo, Enter,
  native endpoint exclusion, сохранение/reload/read-only, неподвижные вопросы,
  отсутствие рамок и горизонтального переполнения. Fixtures запрещают API.
- Чистые unit cases проверяют partial list endpoint с вложенными детьми и
  semantic copied list wrappers. Отдельный diagnostic текущего runtime прошёл
  все **32** сочетания пустых/непустых ответов и направлений с copy/delete/Undo;
  `/tmp/rollapp-boundary-unit-draft/empty-bodies-audit.mjs`. Это supplemental
  diagnostic, не новая строка repo unit suite.
- `npm run test:ui`: exit 0, 37 primitives / 68 application JSX sources.
  `npm run build`: exit 0; прежнее предупреждение chunk >500kB.
  Логи `/tmp/rollapp-boundaries-native-{ui,build}.log`.
- `git diff --check`: PASS. `package.json` и lockfile не менялись относительно
  завершённого baseline-аудита. Свежие `npm audit --omit=dev` (exit 0) —
  0 vulnerabilities и `npm audit` (exit 1) — 7 high dev/tooling подтверждены
  в `/tmp/rollapp-boundaries-native-{audit,production-audit}.json`. Несовместимый downgrade не выполнялся.

Полный редактор после итогового исправления завершился: session 79276,
**141 PASS, exit 0**. `/tmp/rollapp-boundaries-full-text-native-final.log`.
Проверены все 482 зафиксированных code/config source files: drift отсутствует.
Это полный редактор новой версии; baseline comprehensive выше относится к
предшествующей версии. Полная цель R1–R10 остаётся незавершённой.

## Общий аудит и живой UI

Предшествующий `npm run check:comprehensive` завершился exit 0:
все девять этапов, 133 editor PASS, неизменённые 481 source files.
[Отчёт baseline](notion-comprehensive-verification-2026-10-18.md).
Он выполнен **до** этого runtime patch и не выдаётся за общий аудит новой версии.

В живом UI с настроенным production API после изменения нативный Shift-клик
в обе стороны выбирает пять абзацев через три ответа; все четыре секции на месте,
фиксированные вопросы не выбраны, toolbar отсутствует. Все четыре border и
outline — 0px, shadow — none, root overflow отсутствует. DOM text до/после совпал.
Только клики/Escape/чтение DOM; пользовательский текст не редактировался,
временная вкладка 27 закрыта. Проверена также скрытая native projection;
650ms frame-by-frame проверка относится к fixtures, а живой проход — к отдельным
наблюдениям DOM в обе стороны. Постоянный service PID 99362 с configured production
TLS connection оставлен работающим. Production writes, schema changes,
commit и deployment не выполнялись.

## Оставшиеся взаимодействия

Tab/Shift+Tab несоседнего набора в runtime пока перехватывается без вложения.
Изолированный вариант для списков прошёл шесть nest/unnest cases (bullet,
ordered, task в двух направлениях) и контроль skipped ordered numbering, но
root-lift пункта с детьми теряет блочный выбор. Этот вариант не внесён:
`/tmp/rollapp-sparse-indent-prototype.log` сохраняет контрпример. Произвольное
вложение обычного текста требует полноценного сохранения иерархии и выбора.

Открыты также полный boundary navigation, сложный clipboard/drag между секциями,
media, table handles и настоящие iOS/Telegram/WebKit/Windows/IME. Объём не сужен;
[матрица R1–R10](notion-text-experience.md) остаётся источником незакрытой цели.

[JSON с fingerprints и результатами](notion-block-boundaries-verification-2026-10-18.json).
