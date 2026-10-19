# Нативное схлопывание выделения — 18 октября 2026

HEAD `710457583a873ce56b93d4eb26849731164f5b2d`, dirty.
[Машиночитаемые результаты](notion-native-caret-verification-2026-10-18.json).

После keyboard apply в палитре plain ArrowRight мог оставлять текстовый диапазон
и toolbar. Comprehensive64616 остановился после42 editorPASS, source488 без drift.
Целевая проверка повторила отказ; расширенный setTimeout0 trace скрывал его
и поэтому не считался исправлением. Нативный Selection.modify теперь выполняет
визуальный переход синхронно и синхронизирует ProseMirror; toolbar следует модели.
Shift/modifiers/IME/read-only и Block/Node/Cell/AllSelection остаются отдельными.

Целевые styles10PASS, native-reference2PASS/32 сравнений с независимым browser
editing host (formatted/RTL/bidi/graphemes, forward/reverse, Left/Right).
После каждого перехода650ms frame-by-frame проверяются точная позиция,
collapsed DOM/model, отсутствие toolbar и неизменность документа.
Unit627:626PASS/1SKIP. Первая общая попытка84157 упала на ошибке нового
CellSelection fixture (пустая table row); fixture исправлен явной ячейкой,
последующий unit pass подтверждён. Это не выдаётся за успешный comprehensive.

Новый полный comprehensive56434 пока выполняется на замороженных587sources;
ожидаемые159 editorPASS и9 этапов не заявляются до terminal result.
Цель Notion остаётся активной. Прототип движения между ответами и упаковки
длинных ответов проверяется отдельно и ещё не включён в основное приложение.

Живая read-only проверка подтвердила ArrowRight → collapsed native selection,
visible toolbar0, saved status и неизменный innerHTML. При этом обнаружен
**другой открытый дефект**: первое выделение вне viewport оставляет upstream
menu position:absolute; следующий visible range после scroll432 получает
fixed toolbar top678 вместо ожидаемых246. Скриншот до исправления:
`/tmp/rollapp-live-toolbar-position-before.jpg`. Изолированная регрессия
воспроизвела смещение2305px на390px (`/tmp/rollapp-first-offscreen-before.log`).
Это не опровергает caret fix, но означает, что полный опыт ещё не достигнут.
Исправление первого измерения проверяется отдельно и пока не в основном коде.

Терминальный результат comprehensive56434: **failed**, exit1, editorPASS159, source drift[], added sources[]. Девять этапов: check:release=passed, test:navigation=passed, test:action-rails=passed, test:identity-reports=failed, test:todo=not-run, test:form-pages=not-run, test:catalog-page=not-run, test:wish-groups=not-run, test:drawers=not-run.
Это регрессия данного snapshot, а не доказательство достижения всей цели Notion; обнаруженный first-offscreen дефект в эту версию ещё не исправлен.
