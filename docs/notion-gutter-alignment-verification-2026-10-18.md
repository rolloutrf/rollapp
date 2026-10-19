# Центрирование плюса и grip — 18 октября2026

HEAD `710457583a873ce56b93d4eb26849731164f5b2d`, dirty tree.
[JSON с командами и ограничениями](notion-gutter-alignment-verification-2026-10-18.json).

У48px controls прежняя привязка left-start ставила центр ниже строки: baseline
1024px/h1 дал24 вместо20. Теперь left placement получает anchor первой semantic
строки, включая её padding; multiline block не центрируется целиком. Внешний
column gutter сохранён. Media без text line сохраняет top через измеренный control.
Типографика, области48px иglyph20px не менялись. Исправление перенесено вmain.

Isolated8 viewport cases иmain8 alignment cases прошли; усиленная проверка сравнивает
actual text Range centre и control/glyph centre. Четыре ответа сохраняют исходные
JSON/Undo/защиту секций; старый top-edge assertion заменён first-line centre assertion
по новому контракту. Main27 compatibility ещё выполняется. UI37/72 иbuildPASS.

Живая production-connected career/about1280×720: ваш первыйh3 и оба glyph/control
имеютцентр360. TextContent до/после совпал, редактирования и сохранения не было;
вкладка39 закрыта. PNG из безопасного fixture хранится в/tmp и визуально проверен.

Прежний full631 остановлен после подтверждённого дефекта и нового запроса: exit130,
15 editorPASS, drift[]. Остановлена только проверенная process group83144; production
keepalive22680 не затронут. Это не успешный полный аудит. Новый editor303 ещё требуется.
Открытый selection counterexample из Cut report сохраняется и этой правкой не закрывается.

Main compatibility завершилась:27PASS,exit0 (alignment8,four-document8,columns9,
native list drag2),source drift[]. UI/buildPASS. Свежий полный `npm run test:text-edit`
303 запущен на632 source snapshot,session97619; результат ещё не заявлен. Это
дополняет проверку конкретного выравнивания, а не объявляет всю цель Notion готовой.

Main632 full editor terminal: {"status": "failed", "exitCode": 1, "editorPassRecords": 57, "sourceCount": 632, "sourceDrift": [], "addedSources": [], "fontServingDenials": 0, "finishedAt": "2026-10-18T20:14:04.061790+00:00"}. This is the editor suite only; the complete R1–R10 goal is still open.
