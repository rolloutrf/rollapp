# Стабильная направляющая цитат: 2026-10-19

Статус: исправление в отдельном managed worktree, полный editor run выполняется;
в main и production ещё не перенесено. Цель R1–R10 остаётся активной.

База `76a9f46d354178814f4a4b13ab3ef4b40bb57f81`, worktree:
`/Users/mokoloskov/.codex/worktrees/stable-quote-gutter/rollapp`.
Main documentation dirty сохранены. Production writes0, schema/DDL0.

## До и после

Read-only live principles: quote left256, paragraph left274, padding18.
Handle right256 над отступом и right274 над тем же текстом. Это native hover
scoring контейнера/дочернего абзаца и использование selected DOM node left.

Новая native hover sweep на исходном runtime воспроизвела18px jump:
1024px, quote left172, paragraph left190, rail right190 над текстом вместо172.
`/tmp/rollapp-stable-quote-gutter-before.log`, exit1. Проверки не ослаблялись.

Кандидат привязывает горизонтальную координату к ближайшему контейнеру цитаты.
Настоящий hovered node остаётся целью menu/drag. Существующий внешний gutter
колонок имеет приоритет; вертикальная координата первой строки и48/20 unchanged.
Обновлён контракт `docs/inline-editing.md`. Сценарий включает single/multi-paragraph
quotes, переходы padding→near text→text centre→padding, точную горизонтальную
позицию и первую строку; прежние headings1–6/blank/multiline/nesting/columns,
API/saves/overflow assertions сохранены.

## Gates

- Unit716:715PASS/1SKIP/0FAIL; UI37primitives/74JSX PASS; buildPASS (chunk warning).
- Initial fixed gutter8PASS/exit0. Добавлена только запись screenshot;
  final8 **PASS/exit0** с неизменным runtime (session97936, port5332), log
  `/tmp/rollapp-stable-quote-gutter-final.log`.
- Native list drag2PASS, cross-question movement8PASS, block-menu8PASS;
  controller session23365 terminal0. Это targeted compatibility, не full proof.
- Complete `npm run test:text-edit`: session63654/port5331, log
  `/tmp/rollapp-stable-quote-gutter-full.log`. Sources frozen после запуска.
- `git diff --check`:PASS; native/real-device IME и оставшиеся R1–R10 открыты.

SHA256 candidate inputs:

| Файл | SHA256 |
| --- | --- |
| src/components/inline-block-controls.jsx | bb692fbf61abcaae19e5409eafa75f9b5dec0e1b7c340623152f02d4d051e576 |
| scripts/text-gutter-alignment-checks.mjs | 8d58be71feccfa75a0e9c8eda617b666c7b075e2192212eb69b02177dbc4f343 |
| docs/inline-editing.md | 507eedd03c9f5c43d7fc5873b9698c872bec35e5b587ea46ccba2f2b10d83a98 |

## Основной прогон

Main comprehensive session25527/controller43419 подтверждён живым. Dates все
13cases PASS, но browser.close ожидал orphan pipe. Доказательство ownership:
Node44609 FD28 unix0x9907a1fdf8fc8596 →peer0xd7138c64f0d316f5;
crashpad44612 FD2 и updater44660/44663 FD2 на exact peer. PPID1, start times
совпадают с own test launch; живого test browser нет. Только эти три helper
получилиTERM. Node44609 завершился, runner продолжил form-actions. Это recovery
описанное docs/verification.md, без изменения frozen sources или restart.
Пользовательские browser/helper и dev85976 не изменялись.

Linux CI39273880365 для76a9f46 ещё in_progress. Main sources не меняются, пока
его comprehensive работает. Перенос кандидата требует terminal full editor,
review diff/hashes и свежего combined comprehensive; проход targeted8 не заменяет
весь аудит. Metadata650/alignment653 failures также остаются открытыми.

## Статус перед push

Полный isolated editor run завершился ошибкой: timeout `locator.press` в
`text-question-move-checks.mjs:46` после успешных cross-answer cases до 768px
включительно. Лог `/tmp/rollapp-stable-quote-gutter-full.log`.
Это не полный PASS; targeted gutter8 и movement18 не заменяют полный gate.
По запросу пользователя сохранить всё кандидат публикуется отдельной WIP-веткой
`codex/stable-quote-gutter`, без переноса в main и без заявления о готовом релизе.
