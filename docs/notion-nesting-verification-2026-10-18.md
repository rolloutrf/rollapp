# Вложенность блоков — 2026-10-18

Проверен dirty workspace на `710457583a873ce56b93d4eb26849731164f5b2d`.
Снимок 485 code/config sources: `/tmp/rollapp-nesting-tested-sources.json`.
Другие изменения сохранены. Цель Notion R1–R10 остаётся активной.

В runtime внесён логический `nestedBlock`: Tab/Shift+Tab для обычного текста,
последовательных/несоседних групп, списков и детей. Сохраняются направление выбора,
caret offset, pending marks, независимые цвета, checked state и номера пропущенных
ordered-сегментов. Родитель переносится/дублируется/удаляется вместе с детьми;
смена типа на heading/list/quote/toggle/code не теряет детей. Один Undo возвращает
структуру и выбор. Markdown безопасно сохраняет и читает новую иерархию; rich
родители list/quote/toggle сериализуются целиком. API Four Questions сохраняет
форму и прежний суммарный бюджет ответа; схема БД не меняется.

В изолированной модели воспроизведены и исправлены реальные дефекты: исчезновение
текста на 12 уровнях при 320px; heading gap 52.5→22.5px; drag собственного текста
без детей; неподвижный логический выбор после drag/Undo/click; уплощение Nested
внутри обычного list; root-lift с потерей выбора. Диагностики в `/tmp/rollapp-nesting-*`.
Ранний drag test с x=20 попадал в начало соседнего абзаца, то есть перед ним;
финальный тест направляет drop в конец его текста и проверяет реальную перестановку.

Подтверждённые проверки основного дерева:

- `npm run test:unit`: 616 total / 615 PASS / 1 SKIP / 0 FAIL, exit 0.
- `npm run test:text-edit -- --nesting-only`: 8 PASS, exit 0. Размеры 320×844,
  390×844/400, 768×844, 820×844, 1024×844, 1440×844, 1920×844. Реальные Tab/Shift+Tab,
  Escape, keyboard move, desktop parent drag выбранного и невыбранного родителя,
  Undo/duplicate/delete, heading/toggle, save/reload/public read, root task children,
  checked state, 650ms stable selection, heading rhythm и deep12 geometry.
- `npm run test:ui`: PASS, 37 primitives / 68 JSX. Static heading rule обновлён под
  проекцию через logical wrapper; реальная геометрия подтверждается browser matrix.
- `npm run build`: PASS; прежнее предупреждение chunk >500KB.
- `npm audit`: 7 high в dev graph; `npm audit --omit=dev`: 0 уязвимостей.
  Dependency graph и lockfile не менялись в этой итерации; несовместимый downgrade
  shadcn не применялся.
- `git diff --check`: PASS на момент запуска comprehensive.

Все browser writes — только штатный unsaved fixture; API requests отвергаются.
Production dev service PID 99362 остаётся готовым, direct TLS, не останавливался.
Сохранений тестовых данных и изменений схемы БД не было. Live mutation не выполнялась. Дополнительно проверен живой «Карьера → О себе»:
Geist 18/28/400, все borders/outline 0 и shadow none, root overflow false,
Escape выбирает блок, обычный клик снимает его; панель 0, DOM text неизменен,
статус «Все изменения сохранены». Собственная вкладка 28 закрыта.

Общий аудит новой версии завершился со статусом **failed**,
exit 1; успешным не заявляется. Лог `/tmp/rollapp-nesting-comprehensive.log`,
JSON `/tmp/rollapp-nesting-comprehensive.json`. Source drift: [].

Ограничения: реальный iOS/Windows/IME не проверен; отдельного mobile indent/outdent
нет; полный аудит вложенного clipboard/цветов/границ, жесты глубины и tables/media
остаются открытыми. Reader ограничен 100 уровнями HTML тегов, включая marks; команда
не создаёт заведомо нечитабельную глубину. 600000 символов — budget валидатора
одного ответа, а не обещание HTTP transport: body limit остаётся 256KB. Новой версии
читателя требуют новые вложенные документы. Деплой не выполнялся.

Дополнительный открытый контрпример: 12 уровней нативных bullet/ordered/task list
после save/reload при 320px дают последнему абзацу ширину 0 и descendant overflow,
хотя root overflow отсутствует. При 390px bullet/ordered тоже дают 0; task даёт
только 26px. Это прежняя композиция списков, а не исправленная выше модель обычных
Nested-блоков. `/tmp/rollapp-nesting-native-deep-before.log`. В основном дереве
контрпример пока не исправлен; проход целевой Nested-матрицы его не закрывает.

Проверка процесса API: локальный backend PID 99383 запущен 2026-10-17 23:19:49,
`dev.mjs` намеренно не использует Node watch. Новое правило budget валидатора
подтверждено unit-тестами, но этот уже работающий backend ещё его не загрузил.
Перед окончательной передачей потребуется контролируемое обновление локального
процесса с восстановлением configured direct TLS; оно пока не выполнялось.
Это не означает проблему соединения или необходимость перезапуска production VM.

Исключённые диагностические запуски: дублирующий main session 68866 (PID 12198)
и дублирующий isolated session 14593 (listener PID 15426, port 5210) прерваны
адресным SIGINT, exit 130. Они не заменяют завершённые проверки; PID 99362/99383 и
comprehensive 2099 не затрагивались.

В изолированном кандидате подготовлены следующие исправления: menu indent/outdent
(8 размеров, включая поиск/группы/hover-target), адаптивный отступ трёх типов
нативных списков и shared rendering списков в публичном MarkdownDocument.
Публичный контрпример до исправления: вместо 12 li/12 уровней — 0–1 li и глубина
0–1 на 320/390/1440. `/tmp/rollapp-nesting-public-native-before.log`.
После исправлений 24 edit-layout и 24 public-layout diagnostics прошли; новый
`text-deep-list-checks.mjs` дополнительно проверил native typing, точный save/reload,
public hierarchy, checked state, 18/28/400, все frames и отсутствие API на восьми
размерах: `/tmp/rollapp-nesting-deep-list-candidate-final.log`, 8 PASS, exit 0.
Candidate unit: 616 PASS / 1 SKIP / 0 FAIL (617 total); UI PASS. Это изолированные
проверки, а не новая версия основного дерева. Меню-матрица предшествует последним
CSS/public изменениям; после переноса нужна регрессия актуального основного дерева.
Кандидат и hashes: `/tmp/rollapp-nesting-next-work.json`. Main 485 sources неизменны.

Совместимый `npm audit fix --dry-run --ignore-scripts` проверен на отдельной копии
package/lock без общего node_modules: остаются те же 7 high dev. Изменений графа
основного workspace нет; принудительный major downgrade shadcn не применялся.
