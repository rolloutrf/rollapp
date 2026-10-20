# Rollapp typography

`src/index.css` and `src/typeset.css` are the implementation source of truth for typography.

## Primary text

- Family: `Geist Variable` through `--font-sans` and `--font-body`.
- Size: `1.125rem` (`18px`).
- Line height: `1.75rem` (`28px`).
- Weight: `400`.
- Style: normal.
- Tracking: `0`.
- Color: `--foreground`.
- Viewports: the same `18px/28px` baseline applies on desktop and mobile.

Use `--text-rollapp-body` and `--text-rollapp-body--line-height`; do not repeat numeric body sizes in components. Readable documents use `typeset typeset-rollapp`. Application and portalled surfaces use `rollapp-body`.

Geist normal and italic variable faces are loaded from the installed font package.
Semantic emphasis (`em`/`i`, italic quotations) uses the real italic face; the primary
body remains normal. Keep `font-synthesis: none` rather than synthesizing italics.

Block quotations retain their italic face and `1em` start padding, with no vertical
border beside the text. This applies to reading and inline editing, including theses.

The italic quotation treatment is a default, not an unchangeable text mark.
Explicitly removing italic from selected quote text writes `normalText`, rendered
as `span[data-inline-normal="true"]` with `font-style: normal` in the shared preset.
The quote container, its padding, rhythm, family, weight and size stay unchanged.
The contextual italic control reflects the effective authored/inherited style.

## Semantic exceptions

Headings use the semantic scale in `src/typeset.css`. Captions and secondary microcopy use the shared `--text-xs` role. Primary controls and menu or select rows use the primary `18px/28px` text with the product Large geometry defined in `src/index.css`.

Rich image captions use semantic `figcaption` and the shared13px/16px caption
role in reading/editing, without a field frame or separate editor. The figure
measures actual image width for the caption; this transient layout is not saved
as authored metadata. Extremely narrow media retain a readable caption minimum
of3em, bounded by the container and aligned to the same edge/centre, with anywhere
wrapping. This is a verified local1px-media exception, not a new font/control
size or a claim about Notion's exact minimum. Shared figure/caption flow remains.

Standard content tiles use the shared `list-tile-label` and `list-tile-count` roles in `src/index.css`: a 16px/19px label and a 24px/29px semibold numeric value. Desktop daily To Do dates reuse these roles, with the weekday above the date number; they are separate from the 18px/28px navigation control role.

The document renderer preserves ordered-list HTML `type` and mirrors it in
`data-list-marker` (`a`, `A`, `i`, `I`), which the typography preset styles in
reading and editing. The data attribute avoids case-insensitive HTML `type`
selectors conflating lowercase and uppercase markers. Their markers use alphabetic/Roman numbering without changing the
shared list rhythm or body metrics; ordinary ordered lists remain decimal.

## Редактирование внутри документа

`EditableTextBlock` сохраняет `typeset typeset-rollapp typeset-document` на корне
редактора Tiptap. Абзацы, заголовки, списки, цитаты, ссылки и подписи используют ту
же шкалу, что чтение; переключение фокуса не меняет размеры текста. В Markdown
сохраняются `:::label` и `:::statement`. Панели форматирования и состояния
сохранения исключены из prose через `not-typeset`; статус использует caption.
`InlineTextField` наследует семантическую роль родителя в структурированном плане
развития. Отдельных размеров шрифта для редактирования нет.

Раскрывающиеся блоки редактора (`[data-type="details"]`) используют общий
ритм `details`/`dl` в `typeset.css`: первый блок без верхнего отступа,
после заголовка — принадлежащий заголовку более тесный промежуток,
в остальных случаях — `--typeset-flow`. Компонент не задаёт prose-отступы.

Поведение и границы: [inline-editing.md](inline-editing.md).

В inline-таблицах обычные абзацы ячеек сохраняют 18px/28px/400. Прямые абзацы
семантических `th` используют 600 и muted-поверхность как заголовки данных;
размер и высота строки не меняются. Обычные опубликованные документы с таблицами
или fenced code используют тот же read-only рендерер и тот же prose-ритм.

## Выбранный пользователем цвет текста

`src/typeset.css` содержит общую палитру `--typeset-ink-{gray,brown,orange,yellow,green,blue,purple,pink,red}`
с отдельными значениями для светлой и тёмной темы. Она применяется только к
явным `data-inline-color` / `data-inline-background`, выбранным автором текста.
Обычная проза сохраняет `--foreground`, Geist 18/28, вес 400 и прежний ритм.
Подсветка использует 24% соответствующего ink через `color-mix`, без рамки.
Цвет наследуют вложенные strong/link/code; inline code с выбранным фоном не
перекрывает его собственным непрозрачным серым фоном. Ни размер, ни семейство
шрифта, ни вертикальные отступы цветом не изменяются. Code сохраняет существующую
семантическую mono-роль; underline/strike добавляют только оформление линии.
Строчный code использует `white-space: pre-wrap` в редакторе и чтении:
буквальные переносы, табы и повторные пробелы видны после сохранения, а длинные
строки продолжают переноситься в доступной ширине страницы.

В чтении `InlineMarkdown` применяет те же marks и токены, в том числе смешанные
стили, подчёркивание, цвет и фон. Заголовки 1–6 сохраняют общую семантическую шкалу;
редакторский picker предлагает уровни 1–4, а сохранённые h5/h6 не превращаются в абзацы.

## PDF reports

Hogan and Gallup render each source file as an open semantic article without a card background, ring or inset panel. Source-file links and delete controls use transparent shadcn ghost variants. Readable content uses `typeset typeset-rollapp` inside a `typeset-document` article: source headings become h3/h4/h5 below the file h2, with small source section labels using h6 and the shared label role, body text remains 18px/28px, and source footers use the shared caption role. Paragraphs, lists and score tables use the shared prose rhythm. Page dividers derive their spacing from `--typeset-flow`. Source column order, paragraph breaks, list numbers and score values come from PDF text positions and font changes; formatting must not invent titles, translations or interpretations.

Source fidelity: PDF font names preserve actual strong/italic emphasis and superscripts without changing the Geist family. Same-size bold subsection headings use h5; their following paragraph starts at `0.4 * --typeset-flow` to retain the tighter heading-to-copy relationship in the source. Repeated mastheads, participant metadata and footers do not become section headings. Native three-column scale tables expand to the collection rail; below 641px each description follows its original label and score. Source bar charts and segmented subscale charts retain source values, segment counts and colors. Three subscale columns stack below 821px. Source-highlighted Gallup paragraphs use only the original colored leading rule, with a transparent background; the 34-position ribbon is reconstructed from its painted rectangles. No card backgrounds are introduced.

## Цвет блоков

`src/typeset.css` применяет safe `data-block-color` enum через те же девять цветовых
токенов, что и inline marks. Foreground меняет локальный `--foreground` блока,
поэтому headings/strong/links/list markers наследуют его; явный inline color
остаётся независимым. Background задаёт `--inline-block-background` и заливку
полной поверхности без border/outline/ring/shadow. Шрифты, размер, leading и
ритм не меняются. Table header background переопределяется локальным правилом
`inline-editor.css`, чтобы общий цвет ячеек был виден и в th. Plain и read-only
рендереры используют один контракт.

## Иерархия текстовых блоков

`nestedBlock` — логическая обёртка без собственного prose-отступа. Первый
семантический ребёнок сохраняет исходный margin-block-start; заголовок
продолжает владеть тесным промежутком после себя, включая соседнюю обёртку.
Правила первого блока article/section/header/group и нативных контейнеров
проецируются через обёртку. Не добавлять `data-typeset-group` каждому такому
родителю: это ошибочно обнулит отступ его заголовка. Leaf-маркеры на обёртке
сохраняют семантику heading/label при её собственном фоне.

Дети занимают вторую grid-колонку с обычным отступом 1.5em. На глубоко вложенном
узком экране колонка отступа уменьшается через clamp, оставляя место для текста;
это не меняет размер шрифта, line-height или тройку rhythm inputs. У обёртки и
текста нет border/outline/ring/shadow. Геометрия проверяется редакторской матрицей,
включая 12 уровней при 320px и исходные gaps после label/heading/paragraph.

Нативные ul/ol и li используют адаптивный clamp для прежних отступов 1.5em/0.4em:
при обычной ширине оформление прежнее, глубоко вложенный текст получает доступную
ширину без clipping и без изменения шрифта. Inline task item — grid 20px +
minmax(0,1fr) с gap 8px; label принадлежит первой строке собственного текста,
дочерние списки используют всю полосу пункта и адаптивный отступ 1.5em.
Обёртка Tiptap div имеет display:contents; это не добавляет spacer или второй
скроллер. Контракт одинаков при редактировании и публичном read-only rendering.

Колонки документа сохраняют общую типографику Geist18/28. Строка [data-type="columns"] владеет только margin-block-start:var(--typeset-flow), margin-block-end:0. Каждый несемантический column wrapper несёт data-typeset-group для независимого trim первого блока через typeset-document. Локальная шкала шрифта/ритма не вводится.


Первый семантический ребёнок исключает `.ProseMirror-widget`: gap caret и другие
редакторские decoration nodes не являются authored content. Они не меняют grid
rail/margin первого nested header, trimmed first block или следующий tight gap.
Селекторы используют `:nth-child(1 of :not(:where(.ProseMirror-widget)))` с прежней
специфичностью; не возвращать физический `:first-child` для prose rhythm.
Размеры/leading/flow и все semantic heading/body roles остаются прежними.
Gap-caret marker использует foreground в обеих темах; это курсор, не поле или рамка.
Проверять включение/снятие gap selection без изменения JSON, image/child rects,
native hit target и metadata command на mobile/desktop.

Изображения с `data-image-align="left|center|right"` сохраняют общий media rhythm. Меняются только inline margins и grid justify-self; legacy без атрибута остаётся прежним. Нет нового размера текста, line-height, нижних margins или spacers. Общий normalText/blockquote и остальные typography roles не меняются.
