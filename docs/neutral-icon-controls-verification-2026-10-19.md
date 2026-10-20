# Единый стиль круглых кнопок — 2026-10-19

Проверяемая база: `76a9f46d354178814f4a4b13ab3ef4b40bb57f81`.
Исходное рабочее дерево чистое; проверка выполняется с незакоммиченными изменениями этого задания.

Нейтральные icon-кнопки в ControlBar получают общую обводку 1px `--input` поверх существующей непрозрачной заливки `--card`. Примитивы shadcn, размеры 48px/20px, акцентные и destructive роли сохранены. Документирован общий контракт; существующая control-матрица дополнена сравнением secondary-меню и outline-закрытия.

Проверки:

- `npm ci --ignore-scripts`: PASS, lockfile не изменён.
- `npm run test:ui`: PASS.
- Unit stage полного прогона: 716 tests, 715 pass, 0 fail, 1 skip.
- `npm run test:controls` внутри comprehensive: PASS, 132 viewport/route records; без фильтра ширин, включая DPR 3 и короткие экраны.
- `npm run test:details` внутри comprehensive: PASS.
- `npm run test:dates` внутри comprehensive: PASS.
- `npm run test:form-actions` внутри comprehensive: PASS, включая все computed corner radii, opaque disabled и destructive цвета.
- `npm run build`: PASS, стандартное предупреждение о размере chunks.
- Визуально просмотрены снимки пары secondary/outline на 390px и 1440px: одинаковые круги, заливка и обводка. Дополнительно проверены computed hover fill/border в обеих темах на 390px; поверхности совпадают.
- `npm audit --omit=dev`: 0 vulnerabilities. Полный `npm audit`: 7 high в существующей цепочке devDependencies shadcn/registry/ts-morph/fast-glob/braces/micromatch. Автоматический предлагаемый downgrade shadcn на 1.0.0 несовместим и не применялся; зависимости не менялись.
- `git diff --check`: PASS на текущем этапе.

`npm run check:comprehensive` запущен без фильтров и завершился exit 1: этап `test:text-edit` не смог запустить Vite, потому что порт 5199 занят другим процессом. Чужой процесс не останавливался. Поэтому полный comprehensive не пройден: редактор, Kanban и последующие расширенные этапы этим запуском не проверены. Все предыдущие этапы release (unit/UI/controls/details/dates/form-actions) прошли. Отдельная production сборка прошла. Изменений редактора/истории/документов в задании нет. Лог: `/tmp/rollapp-neutral-controls-comprehensive.log`; JSON: `/var/folders/56/y9x0qcp95zs6ctldh56fs6qh0000gq/T/rollapp-check-1792423010366.json`.

Живой UI с production API не проверен: `dev:keepalive:status` изначально сообщил отключённое автовосстановление и отсутствие dotenv до установки зависимостей; после установки `npm run dev:keepalive` отказал с «Production PostgreSQL не настроен: укажите DATABASE_URL или PGHOST. Демо-база отключена». В этом checkout нет настроенного production подключения; локальная/демо БД не создавалась. Данные production не изменялись. UI smoke использует предусмотренные репозиторием presentation fixtures с запретом API-запросов.

## Уточнение: прямые углы на десктопе

По следующему явному запросу пользователя только действия внутри карточки желания получили `data-desktop-square-actions`. В общем spacing-слое от 768px все четыре радиуса этих кнопок равны 0; ниже 768px сохранён радиус 24px. Каталог и прочая навигация не получили этого исключения. Предыдущие пользовательские изменения сохранены.

- `npm run test:ui`: PASS после уточнения.
- `npm run test:details`: PASS после уточнения, 72 viewport/variant records; проверка всех четырёх радиусов добавлена для owner/guest/fulfilled/reservation состояний от 320px до 1920px, включая 390×400.
- `npm run build`: PASS после уточнения.
- Снимки реального WishDetailsModal screen-content просмотрены при 1440px и 390px: desktop — прямые углы, mobile — капсула/круг, одинаковая заливка/обводка сохранены.
- `npm run test:controls` после уточнения: все 132 records полной матрицы без фильтров завершились PASS, но runner остался в shutdown (Chrome уже закрыт, Vite продолжал слушать 5192). Завершён только собственный PID 77568 сигналом TERM после ожидания; чистый exit 0 этого повторного запуска не подтверждён. Лог `/tmp/rollapp-square-wish-controls.log`.
- `git diff --check`: PASS. Живой production UI и полный comprehensive по-прежнему не подтверждены по описанным выше ограничениям; успешная сборка и целевые матрицы за полный аудит не выдаются.
