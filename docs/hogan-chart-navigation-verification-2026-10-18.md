# Переходы к графикам Hogan — 18 октября 2026

HEAD `710457583a873ce56b93d4eb26849731164f5b2d`, общее dirty-дерево.
[JSON с командами и ограничениями](hogan-chart-navigation-verification-2026-10-18.json).

Графики уже были восстановлены из оригинала, но находились после длинного Summary.
Над исходным содержимым добавлены нативные ссылки «Шкалы» и «Субшкалы».
Имена файлов разделяют несколько комплектов; исходные документы и их блоки
не переставляются. Цель получает фокус и использует общий отступ от chrome.
Применён PageActionButton без переопределения его геометрии.

`npm run test:identity-reports`: 24 PASS — 14 текстовых сценариев, 8 chart-размеров
и 2 сценария нескольких файлов/текстового PDF. Source-review: ещё 8 PASS на
реальных 28 полосах, 125 субшкалах и 500 сегментах. Проверены Enter, независимые
цели, фокус, достижимость после нативного скролла, 48px/24px, порядок, значения,
цвета и overflow. API во fixtures отклоняется.

Unit: 626 PASS / 1 SKIP, 627 всего. UI и build PASS; прежнее предупреждение о
крупных chunks остаётся. Audit: production 0, development 7 high, зависимости
не менялись; совместимость рекомендаций уже рассмотрена в предыдущих отчётах.

Живая configured production-сессия: 28/125/500, без сохранений. На desktop
1280×720 переход к шкалам дал top119.83/focus; на mobile390×844 к субшкалам —
top95.77/focus. На 8 размерах подтверждены responsive columns и отсутствие
root overflow. Быстрая смена viewport давала промежуточные положения smooth
scroll; эти измерения не заявляются как settled anchor proof на всех размерах.

Общий comprehensive session56434 пока выполняется; исходники заморожены
по snapshot587. Отдельные успешные проверки не объявляются полным аудитом.
Persistent production development service22680 оставлен включённым.
Нет deployment, миграций, загрузок/удалений PDF и записей тестовых данных.

Терминальный результат comprehensive56434: **failed**, exit1, editorPASS159, source drift[], added sources[]. Девять этапов: check:release=passed, test:navigation=passed, test:action-rails=passed, test:identity-reports=failed, test:todo=not-run, test:form-pages=not-run, test:catalog-page=not-run, test:wish-groups=not-run, test:drawers=not-run.
Это регрессия данного snapshot, а не доказательство достижения всей цели Notion; обнаруженный first-offscreen дефект в эту версию ещё не исправлен.
