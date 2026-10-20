# Сниппеты в поле новой задачи — 2026-10-19

Исходный HEAD `d116857ce0aadfeb4e1258fdb1a3ae2abf5e958f`, рабочее дерево dirty
до начала: восстановление связанных объектов/API/выбора, новый InputGroup-композер,
планирование и их проверки. Эти изменения сохранены; текущая задача расширяет
их, не приписывает себе всю исходную дельту. Push/deploy в этой задаче не выполнялись.

## Изменение

Десктопный плюс открывает существующий picker в режиме выбора, не полную форму
создания. Готово возвращает сниппеты с миниатюрой, названием и описанием в
InputGroup. Повторный выбор начинает с подтверждённых связей, Back/Escape/закрытие
не применяют черновой выбор. Карточка с destructive-действием убирает только
связь из локального черновика. Отправка сохраняет канонические kind/id/title,
не отправляя imageUrl/snippet/прочие presentation-поля в strict API. Ошибка
сохранения сохраняет текст и сниппеты; успешная отправка очищает оба. Дата/список
разделяют черновик связей. Мобильная отдельная страница TaskEditor сохранена.

Общий RelatedChoiceCard извлечён без смены внешнего вида picker. В поле он
компактный, с горизонтальной прокруткой вместо высоких изображений, чтобы
оставить действия доступными на коротком экране. Выбор контактов сохраняет
presentation-метаданные даже после смены поисковой выдачи. Контракт обновлён
в docs/spacing-system.md. Frontend-design использован для сохранения общего
компонента карточки и согласованной компактной композиции, не смены дизайн-системы.

## Проверки

- Финальный `node scripts/daily-todo-ribbon-smoke.mjs`: terminal exit0, 39 PASS.
  Полная штатная матрица 320/390/640/767/768/820/1024/1440/1920, высоты844/400,
  пустые/длинные списки; новый сценарий на всех пяти desktop-ширинах/двух высотах.
  Подтверждены cancel/Done/reopen/removal, сохранность названия, thumbnail/описание,
  отсутствие преждевременного сохранения, failed-save/retry, канонический payload,
  очистка после успеха и доступность последнего сниппета при overflow.
- Первый прогон выявил overflow при768×400 от высоких карточек (bottom458).
  После compact rail diagnostic768 PASS и финальный полный39 PASS. Это реальное
  исправление геометрии, не ослабление проверок доступности.
- Финальные unit:717 total / 716 PASS / 1 SKIP / 0 FAIL; UI37 primitives /
  75 application JSX PASS; build PASS, штатное предупреждение о крупных чанках.
- `test:controls`:143 PASS; `test:form-actions`:91 PASS, полная матрица,
  включая итоговый StrictMode/native Enter/busy Back. `test:form-pages`:
  полная штатная матрица PASS, включая StrictMode, nested draft и source-scroll
  restoration. Последовательная команда трёх проверок завершилась terminal exit0.
- `npm audit`:7 high в dev tooling; `npm audit --omit=dev`:0. Lockfile и
  зависимости не менялись; несовместимый downgrade инструментов не применялся.
- `dev:keepalive:status`: production development service91967, API/frontend готовы,
  оставлен работающим. Данные/схема не менялись, fake DB не использовалась.
- Live UI review через Comet прерван пользовательским управлением браузером;
  после обнаружения смены страницы дальнейшие действия прекращены. Подтверждение
  нового потока на production API не заявляется. Browser fixtures проверяют
  представления, scoped read responses предоставлены только в тестах, записи API запрещены.

Логи `/tmp/rollapp-related-composer-{todo-final,unit-final,ui-final,build-final,controls,form-actions,form-pages}.log`.
Скриншоты `/tmp/rollapp-related-composer-{width}-{height}.png`;768×400 просмотрен.
`git diff --check`:PASS; итоговый diff просмотрен, пять приведённых source hashes
повторно совпали после проверок. Production dev91967 по завершении готов.
Полный check:comprehensive не запускался и не подменяется перечисленными проверками; общий
editor goal и actual-device IME остаются открытыми.

## Снимок исходников после исправления

SHA256:

- planning-related-card.jsx: `7af82ac288e7df2bd083a83022e74865859ae69a8e62bd74b8304a403d434133`
- planning-daily-todo.jsx: `9dea1ceef4507b49325aecff447ef8eac0d8455b05b26b5b01f3697dc9bde624`
- planning-daily-todo.css: `a63e411203de627a62cfeaa9d7a71372eca9ad1c7a4362cfedc4235407240942`
- planning-space.jsx: `2be1a1bcc2982f55c689c69988745f39964ea8f6ddcec0dcdee1efac33077066`
- daily-todo-ribbon-smoke.mjs: `eb4290b8f772e477775b0ce2dcc245856b5b194319ca3f4e4085d15a2dcaa199`
