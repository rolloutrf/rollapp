# План развития: свободный документ — 2026-10-19

Проверяемый HEAD: `76a9f46d354178814f4a4b13ab3ef4b40bb57f81`.
Начальное рабочее дерево чистое; проверялась незакоммиченная дельта этого отчёта.

## Изменение

Структурированные InlineTextField, категории Select, кнопки пунктов и неиспользуемый
EntryEditor заменены одним InlineDocument. Существующий серверный Markdown не
разбирается в ограниченную модель групп и не пересобирается при открытии.
Сохранены API `career/content/development`, ключ очереди/черновика, права доступа,
загрузка и явная ошибка с повтором. Старые объектные sessionStorage-черновики
преобразуются в Markdown перед монтированием; сервер при этом не изменяется.
Удалены локальные CSS overrides прежней формы и устаревший drawer fixture.
Контракт docs/inline-editing.md и затронутые проверки синхронизированы.

## Завершённые проверки

- `npm test`: exit 0; 716 passed, 1 skipped, 0 failed (после добавления переноса черновика).
- `npm run test:ui`: passed в comprehensive.
- `npm run build`: exit 0; обычное предупреждение о размере чанков.
- `TEXT_EDIT_PORT=5299 npm run test:text-edit -- --surface-only`: exit 0,
  восемь viewport cases плюс deep-document, creation и общий history/save case.
  Последний проверяет реальный DevelopmentPlan: один rich textbox, отсутствие
  категорий и plaintext-полей, отсутствие рамки, правку заголовка/пункта,
  новую строку через Enter, autosave и отсутствие drawer/native form page.
- `npm run test:action-rails`: exit 0, полная матрица.
- `git diff --check`: passed; итоговая дельта просмотрена.
- `npm audit`: 7 high в dev-цепочке shadcn/registry/ts-morph/glob.
  `npm audit --omit=dev`: 0 vulnerabilities. Несовместимый откат shadcn не применялся.

Первый comprehensive остановился на устаревшем source-contract assertion,
требовавшем удалённую development-plan-editor CSS-композицию. Assertion обновлён
на InlineDocument; повторные unit tests проходят. Первая попытка surface smoke
не стартовала из-за занятого 5199; повтор на 5299 завершился exit 0.

## Живой UI и production-соединение

5172 обслуживается основным checkout `/Users/mokoloskov/Desktop/Git/rollout/rollapp`.
Его `npm run dev:keepalive:status`: автозапуск включён, API/frontend готовы.
`GET http://127.0.0.1:8080/api/healthz`: ok. Постоянный сервис не останавливался.
В этой рабочей копии собственная конфигурация БД отсутствует: запуск keepalive
отказал явно, без demo/local fallback. Для просмотра запущен Vite на 5173 с
существующим proxy на тот же production API 8080.

Живая страница `http://127.0.0.1:5173/app/spheres/career?tab=development-plan`
загрузила сохранённый документ. Выполнен только просмотр: никаких тестовых записей.
DOM проверен при 320,390,768,820,1024,1440,1920×844: contenteditable=true,
основной текст 18/28, border 0, outline none, shadow none, document overflow false.
Визуально просмотрены обычный desktop и короткий mobile 390×400.
Это не полная screenshot-матрица всех descendants/ошибок/клавиатуры.

## Незавершённые проверки на момент отчёта

Полный `TEXT_EDIT_PORT=5298 npm run test:text-edit` продолжает выполняться;
лог `/tmp/rollapp-plan-editor.log`. Полный comprehensive тоже выполняется:
`/tmp/rollapp-plan-comprehensive.log`, JSON
`/var/folders/56/y9x0qcp95zs6ctldh56fs6qh0000gq/T/rollapp-check-1792422630074.json`.
Их запуск и отдельные PASS не считаются полным успешным аудитом.
В comprehensive стандартный editor-порт 5199 может конфликтовать с другим
процессом; отдельный полный editor использует 5298. Unit/build после последнего
изменения выполнены отдельно. Реальный production Save намеренно не проверялся,
физические iOS/IME/клавиатура не проверены. Публикация/перенос в main не выполнялись.
