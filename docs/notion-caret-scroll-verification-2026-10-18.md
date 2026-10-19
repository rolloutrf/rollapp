# Курсор и панели приложения — 18 октября 2026

HEAD `710457583a873ce56b93d4eb26849731164f5b2d`, dirty.
[Машиночитаемый отчёт](notion-caret-scroll-verification-2026-10-18.json).

На исходном main608 воспроизведено перекрытие native ArrowUp cursor верхней
панелью в настоящей композиции Career: caret y58.5…81.5, header bottom72.
После650ms курсор всё ещё перекрыт; native/PM head708 совпадают. Это дефект
видимости, не потеря выделения. `/tmp/rollapp-caret-scroll-before.log`.
Самый ранний probe не запускался из-за431/слишком длинного URL; источник
сокращён без изменения структуры70абзацев, этот запуск не считается UI evidence.

Кандидат находится только в изолированной копии
`/var/folders/56/y9x0qcp95zs6ctldh56fs6qh0000gq/T/rollapp-caret-scroll-8dcjkrtm`.
Scoped CSS отключает smooth scrolling только при focus editable prose и задаёт
native scroll-padding через существующие chrome/navigation tokens. Hook после
нативного keyboard/input события читает focus caret и корректирует только scroll;
он не записывает selection/document/history. Два кадра нужны, чтобы дождаться
нативного scroll/selection reconciliation. Нет подписки на manual document scroll.
Mount/unmount подписки учитывают React StrictMode и Tiptap view lifecycle.

Кандидат проверяется на320/390/768/820/1024/1440/1920×844 и390/1440×400:
ArrowUp/Down, Shift+ArrowUp/Down, native/PM cursor parity, header/footer bounds
на каждом шаге, manual scroll650ms, CSS restoration после blur, неизменный JSON,
ноль сохранений/API и browser errors. Диагностический прогон9410 завершён exit0/9PASS. Console probes удалены;
чистый source610 зафиксирован и проверяется заново:9caret +2native browser parity
+9first-offscreen selection cases, session19166. Этот targeted набор не является
полным редакторским или comprehensive проходом.

Main608 не менялся: comprehensive72580/controller2055 продолжает228editor
cases и9этапов. Новый кандидат не подменяет этот snapshot. Реальные iOS/Telegram
keyboard/IME и оставшиеся пункты Notion matrix ещё не проверены; цель активна.

Чистый кандидат terminal: {"status": "passed", "exitCode": 0, "sourceCount": 610, "sourceDrift": [], "logs": {"/tmp/rollapp-caret-scroll-clean.log": {"records": 9, "expected": 9}, "/tmp/rollapp-caret-native-compat.log": {"records": 2, "expected": 2}, "/tmp/rollapp-caret-selection-compat.log": {"records": 9, "expected": 9}}, "records": 20, "promoted": false, "finishedAt": "2026-10-18T17:10:44.891516+00:00", "ui": "passed37/69", "build": "passed"}. Runtime main608 пока не менялся.
