# Снятие курсива в цитате — 2026-10-19

Кандидат изолирован в attached worktree test-browser-lifecycle, ветка
`codex/quote-italic-style`, исходная база3ab1e18. Проверенный normalText
зафиксирован9a3ed5c, затем link intent объединён вfb22260; последующая
link-metadata delta пока dirty и проверяется отдельно. Main пока не получает новый
storage vocabulary. Исходное замечание пользователя: I переключается, но текст
остаётся курсивным из-за наследования blockquote. Цитата должна сохранить
свой default, но явное форматирование выделенных букв должно быть видимым.

## Реализация

`hasEffectiveItalic` учитывает явный mark и наследование от quote. Кнопка,
keyboard Mod-I и оформление ячеек используют один transaction helper. Снятие
в quote добавляет нормальный `normalText` mark, снятие в обычном абзаце сохраняет
старый Markdown. Включение в quote возвращает default, не добавляя избыточный
italic. Пустой caret сохраняет прочие stored marks. Перед focus/dispatch проверены
doc/selection/access/IME/lifecycle owners, history отделяет форматирование от ввода.

Обычные документы не приобретают новые attrs или marks. Schema order прежних
marks сохранён через замену Italic внутри StarterKit, а не перенос в конец.
Новый mark хранится в безопасном canonical HTML, поддержан rich inline/block/table
адаптером и лёгким публичным reader. Default blockquote/Geist/rhythm/inset/размеры
контролов не изменены. Общий typeset задаёт только font-style для явно выбранного
исключения; typography и inline-editing contracts синхронизированы.

## Доказательства и найденный крайний случай

- Первая версия unit733 total/732 PASS/1 SKIP, UI/build PASS; quote-native8 и
  compatibility styles10 прошли. Это исторический snapshot до guard ниже.
- Pure probe и отдельный сохранённый red test подтвердили конфликт marks при
  HTML `normalText` внутри em и наоборот. `doc.check()` отвергал документ.
  `/tmp/rollapp-notion-resume-italic-nested-before.log`, fail1 — не скрыт.
- Разбор теперь выбирает самый внутренний явный emphasis/normal mark, не создавая
  взаимно исключающий набор. Exact original/невыбранные neighbours сохраняются.
- После guard: unit734 total/733 PASS/1 SKIP/0 FAIL, UI37/74 и build PASS;
  новый native quote8 terminal этап завершён. Проверены actual computed glyph style,
  active control, reverse native selection, сохранение bold/соседей, keyboard,
  отдельные Undo/Redo печати и форматирования, exact save/reload и public read
  на320/390/390×400/768/820/1024/1440/1920. Final styles10 завершился terminal0:
  те же marks/цвета/whitespace/unlink/Undo/portal-Save/reload/public read,
  включая две light-theme проверки. Финальная последовательная команда
  unit/UI/build/quote8/styles10 завершилась exit0; это18 native records,
  не полный editor/comprehensive. Перед фиксацией diff whitespace PASS.
- Скриншот `/tmp/rollapp-quote-normal-390-400.png` просмотрен: выделенный bold
  target обычный, остальная цитата курсивная; полей/рамок у prose нет.

Логи `/tmp/rollapp-notion-resume-italic-{unit-final,ui-final,build-final,native-final,styles-final}.log`.
Синтетические model/DOM native ranges не являются реальным iOS/Telegram/IME.

## Ограничения перед переносом

Нужны общий полный text/editor и comprehensive после совместного включения
с текущими media/link изменениями. Текущий frozen391 run не содержит этот
кандидат: к нему добавятся8 новых viewport records, ожидаемый объём станет399.
Новый mark требует compatible reader в развёрнутой версии прежде, чем можно
сохранять его в production-документы из локального UI. До готового rollout
кандидат не переносится в основную папку с production connection.
Аудит произвольных вложенных составов остаётся открытым вместе с остальными
R1–R10; target8 не доказывает полную Notion fidelity.

## Совмещение с link metadata

После интеграции link intent контрпример подтвердил потерю нестандартных attrs
при снятии курсива и canonical reload. Red log:
`/tmp/rollapp-notion-resume-quote-link-metadata-before.log` (terminal1).
В normal-aware rich/table adapters добавлен reviewed link-attributes helper:
он различает legacy defaults и явно отсутствующие/null/пустые attrs, сохраняет
кавычки/разделители в title/URL через canonical HTML. Normal parser и приоритет
вложенных emphasis/normal marks сохранены. Public reader продолжает применять
свою безопасную политику target/rel, не переносит authored class на внешний DOM.

Объединённый unit:746 total/745 PASS/1 SKIP/0 FAIL;
`/tmp/rollapp-notion-resume-quote-link-metadata-unit.log`. UI37/74 и build PASS.
Новый native quote matrix включает для каждого viewport две rich Cyrillic
link-metadata композиции, реальное переключение Mod-I, exact Undo/Redo,
save/reload и безопасный public read. Последовательность quote8/links8/styles10
ещё выполняется; первый320px PASS не считается итоговым результатом всей матрицы.
Логи `/tmp/rollapp-notion-resume-quote-link-{ui,build,native,links,styles}.log`.

2026-10-20: native quote первый раз failed public page.goto1440 после6 PASS,
повтор8 PASS terminal0 на том же runtime. Links8 terminal0. Styles failed на390
click stability; повтор failed на390×400 `li hr` visibility после reload (узел
divider присутствовал в failure roots). Ни один styles run не объявлен PASS.
Metadata+failure diagnostics зафиксированы7699678 и объединены в frozen candidate
bf6a8a1 для нового полного399/comprehensive. Подробности и ограничения:
`notion-combined-verification-2026-10-20.md`.
