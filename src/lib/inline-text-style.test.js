import assert from "node:assert/strict";
import test from "node:test";
import { getSchema } from "@tiptap/core";
import { MarkdownManager } from "@tiptap/markdown";
import { inlineEditorExtensions } from "./inline-editor-extensions.js";
import { inlineColors, safeInlineColor } from "./inline-text-style.js";
import { isSafeInlineLink, parseInlineMarkdown } from "./inline-markdown.js";

const extensions = inlineEditorExtensions();
const schema = getSchema(extensions);
const markdown = new MarkdownManager({ extensions });
const canonical = doc => schema.nodeFromJSON(doc).toJSON();
const text = node => node.text || (node.content || []).map(text).join("");
const semantics = node => node.type === "text"
  ? [...node.text].map(char => ({ char, marks: [...(node.marks || [])].sort((a, b) => a.type.localeCompare(b.type)) }))
  : (node.content || []).flatMap(semantics);
function document(value, marks) { return schema.nodes.doc.create(null, schema.nodes.paragraph.create(null, schema.text(value, marks))).toJSON(); }
function roundTrip(doc) {
  const stored = markdown.serialize(doc), restored = canonical(markdown.parse(stored));
  assert.equal(text(restored), text(doc), stored);
  assert.deepEqual(semantics(restored), semantics(doc), stored);
  return stored;
}

test("all 127 combinations of text marks survive Markdown storage, including inline code", () => {
  const marks = [schema.marks.bold.create(), schema.marks.italic.create(), schema.marks.underline.create(), schema.marks.strike.create(), schema.marks.code.create(), schema.marks.inlineStyle.create({ color: "red", background: "yellow" }), schema.marks.link.create({ href: "https://example.com" })];
  for (let subset = 1; subset < 1 << marks.length; subset += 1) roundTrip(document("Выделенный текст", marks.filter((_, index) => subset & (1 << index))));
});

test("ordinary prose preserves edge spaces, repeated spaces and literal line endings without code marks", () => {
  for (const value of [" leading", "trailing ", "  ", "two  spaces", "a\tb", "a\nb", "a\rb"]) {
    for (const [type,attrs] of [["paragraph",null],["heading",{level:2}],["typographyBlock",{role:"statement"}]]) {
      const node=schema.nodes[type].create(attrs,schema.text(value,[schema.marks.bold.create()]));
      const doc=schema.nodes.doc.create(null,node).toJSON();
      const stored=roundTrip(doc);
      assert.deepEqual(canonical(markdown.parse(stored)),doc,"All characters and marks must survive a real save/reload");
      const prefix=type==="heading"?/^## /:type==="typographyBlock"?/^:::statement /:/^/;
      assert.equal(text({content:parseInlineMarkdown(stored.replace(prefix,""))}),value,"Public inline reading preserves the same whitespace");
    }
  }
});

test("internal styled run boundaries preserve the exact formatting of spaces through save/reload and public reading", () => {
  const options=[schema.marks.bold.create(),schema.marks.italic.create(),schema.marks.underline.create(),schema.marks.strike.create(),schema.marks.code.create(),schema.marks.inlineStyle.create({color:"red",background:"blue"}),schema.marks.link.create({href:"https://example.com"})];
  for(let subset=1;subset<1<<options.length;subset++)for(const value of [" leading","trailing "," both "," "]){
    const marks=options.filter((_,index)=>subset&(1<<index));
    for(const [type,attrs,prefix] of [["paragraph",null,/^/],["heading",{level:3},/^### /],["typographyBlock",{role:"statement"},/^:::statement /]]){
      const content=[schema.text("Before"),schema.text(value,marks),schema.text("After")];
      const doc=schema.nodes.doc.create(null,schema.nodes[type].create(attrs,content)).toJSON();
      const stored=roundTrip(doc);assert.deepEqual(canonical(markdown.parse(stored)),doc,"Whitespace retains its own selected formatting");
      assert.deepEqual(semantics({content:parseInlineMarkdown(stored.replace(prefix,""))}),semantics(doc),"Public rendering retains every styled space");
    }
  }
});

test("literal URLs and emails explicitly left unlinked do not acquire marks during storage or public reading", () => {
  for(const value of ["https://example.test/path?x=1&y=2","www.example.test","user@example.test","ftp://example.test","[x](https://example.test)"]){
    for(const marks of [[],[schema.marks.strike.create()],[schema.marks.bold.create(),schema.marks.underline.create()]]){
      const doc=schema.nodes.doc.create(null,schema.nodes.paragraph.create(null,[schema.text("Before "),schema.text(value,marks),schema.text(" after")])).toJSON();
      const stored=roundTrip(doc);assert.deepEqual(canonical(markdown.parse(stored)),doc);assert.deepEqual(semantics({content:parseInlineMarkdown(stored)}),semantics(doc));
    }
  }
  const imported=canonical(markdown.parse("https://example.test"));assert(imported.content[0].content[0].marks.some(mark=>mark.type==="link"),"Ordinary Markdown imports retain GFM autolinking");
});

test("adjacent differently marked runs retain literal delimiters and their exact boundary", () => {
  const options=[schema.marks.bold.create(),schema.marks.italic.create(),schema.marks.underline.create(),schema.marks.strike.create(),schema.marks.code.create(),schema.marks.inlineStyle.create({color:"red",background:"blue"}),schema.marks.link.create({href:"https://example.com"})];
  for(const left of options)for(const right of options)for(const value of ["**literal**","_literal_","~~literal~~","++literal++","`literal`","слово"]){
    const content=[schema.text(value,[left]),schema.text("emoji 👨‍👩‍👦",[right])];
    for(const [type,attrs,prefix] of [["paragraph",null,/^/],["heading",{level:4},/^#### /],["typographyBlock",{role:"statement"},/^:::statement /]]){
      const doc=schema.nodes.doc.create(null,schema.nodes[type].create(attrs,content)).toJSON();const stored=roundTrip(doc);assert.deepEqual(canonical(markdown.parse(stored)),doc);assert.deepEqual(semantics({content:parseInlineMarkdown(stored.replace(prefix,""))}),semantics(doc));
    }
  }
});

test("literal underline delimiters remain literal with or without other marks", () => {
  for(const value of ["++literal++","C++ and C++","before ++text++ after"]){
    for(const marks of [[],[schema.marks.bold.create()],[schema.marks.italic.create()],[schema.marks.underline.create()],[schema.marks.code.create()]]){
      const doc=document(value,marks),stored=roundTrip(doc);assert.deepEqual(canonical(markdown.parse(stored)),doc);assert.deepEqual(semantics({content:parseInlineMarkdown(stored)}),semantics(doc));
    }
  }
  assert(canonical(markdown.parse("++formatted++")).content[0].content[0].marks.some(mark=>mark.type==="underline"),"Existing Markdown underline imports remain supported");
});

test("soft breaks at edges, repeated breaks and multiline headings keep their exact block structure", () => {
  const br=()=>schema.nodes.hardBreak.create(),text=()=>schema.text("Строка");
  for(const content of [[br()],[text(),br()],[br(),text()],[text(),br(),text()],[text(),br(),br(),text()],[br(),br()]]) {
    for(const [type,attrs] of [["paragraph",null],["heading",{level:2}],["typographyBlock",{role:"statement"}]]) {
      const doc=schema.nodes.doc.create(null,schema.nodes[type].create(attrs,content)).toJSON();
      const stored=markdown.serialize(doc);assert.deepEqual(canonical(markdown.parse(stored)),doc,stored);
    }
  }
});

test("every foreground/background combination preserves marks and safe palette IDs", () => {
  for (const [color] of inlineColors) for (const [background] of inlineColors) {
    if (!color && !background) continue;
    const stored = roundTrip(document("Цвет и фон", [schema.marks.inlineStyle.create({ color, background }), schema.marks.bold.create()]));
    assert(stored.includes("<span data-inline-"));
  }
  for (const value of ["__proto__", "transparent", "url(javascript:alert(1))", "red\" onclick=\"x", "#fff", {}, 1]) assert.equal(safeInlineColor(value), null);
});

test("mixed styles inside a continuous code range retain text, URLs, whitespace and partial marks", () => {
  const options = [schema.marks.bold.create(), schema.marks.italic.create(), schema.marks.underline.create(), schema.marks.strike.create(), schema.marks.inlineStyle.create({ color: "purple", background: "green" }), schema.marks.link.create({ href: "https://example.com/?x=1&y=2", title: 'Текст "ссылки"' })];
  for (let subset = 1; subset < 1 << options.length; subset += 1) {
    const code = schema.marks.code.create();
    const content = [schema.text("**до** ", [code]), schema.text("<span>середина</span>", [code, ...options.filter((_, index) => subset & (1 << index))]), schema.text(" https://literal.example \nконец  ", [code])];
    for (const [type, attrs] of [["paragraph", null], ["heading", { level: 4 }], ["typographyBlock", { role: "statement" }]]) {
      const doc = schema.nodes.doc.create(null, schema.nodes[type].create(attrs, content)).toJSON();
      const stored = roundTrip(doc);
      assert(stored.includes("data-inline-rich"));
      assert.deepEqual(semantics(canonical({ type: "doc", content: parseInlineMarkdown(stored.replace(/^#### |^:::statement /, "")) })), semantics(doc));
    }
  }
});

test("literal closing spans, escapes, backticks and hard breaks cannot terminate a style", () => {
  for (const value of ["</span>", "<span>код</span>", "` и ``", "**буквально**", "& < >", "  пробелы  "]) {
    roundTrip(document(value, [schema.marks.code.create(), schema.marks.bold.create(), schema.marks.underline.create(), schema.marks.inlineStyle.create({ color: "blue", background: "pink" })]));
  }
  const style = schema.marks.inlineStyle.create({ color: "green" });
  const doc = schema.nodes.doc.create(null, schema.nodes.paragraph.create(null, [schema.text("Первая", [style]), schema.nodes.hardBreak.create(null, null, [style]), schema.text("Вторая", [style])])).toJSON();
  const restored = canonical(markdown.parse(markdown.serialize(doc)));
  assert.equal(restored.content[0].content.filter(node => node.type === "hardBreak").length, 1);
  assert.equal(text(restored), "ПерваяВторая");
  assert.deepEqual(semantics(restored), semantics(doc));
});

test("rich code in multiple table paragraphs and a toggle title retains pipes, spaces and styles", () => {
  const code = schema.marks.code.create(), style = schema.marks.inlineStyle.create({ color: "orange", background: "gray" });
  const content = [schema.text("  До | ", [code, style]), schema.text("после\t** | **", [code, style, schema.marks.bold.create()])];
  const paragraph = schema.nodes.paragraph.create(null, content);
  for (const children of [[paragraph], [paragraph, paragraph]]) {
    const table = schema.nodes.table.create(null, schema.nodes.tableRow.create(null, schema.nodes.tableHeader.create(null, children)));
    roundTrip(schema.nodes.doc.create(null, table).toJSON());
  }
  const toggle = schema.nodes.details.create({ open: true }, [schema.nodes.detailsSummary.create(null, content), schema.nodes.detailsContent.create(null, schema.nodes.paragraph.create())]);
  roundTrip(schema.nodes.doc.create(null, toggle).toJSON());
});

test("uniform inline code retains literal whitespace in every serializing container", () => {
  const code = schema.marks.code.create();
  for (const value of ["line1\nline2", "\tconst  x = 1;", " leading", "trailing ", "  keep  ", "two  spaces", "\n\n", "code\rnext"]) {
    const paragraph = schema.nodes.paragraph.create(null, schema.text(value, [code]));
    const containers = [
      paragraph,
      schema.nodes.heading.create({ level: 3 }, paragraph.content),
      schema.nodes.typographyBlock.create({ role: "statement" }, paragraph.content),
      schema.nodes.bulletList.create(null, schema.nodes.listItem.create(null, paragraph)),
      schema.nodes.table.create(null, schema.nodes.tableRow.create(null, schema.nodes.tableHeader.create(null, paragraph))),
      schema.nodes.details.create({ open: true }, [schema.nodes.detailsSummary.create(null, paragraph.content), schema.nodes.detailsContent.create(null, schema.nodes.paragraph.create())]),
    ];
    for (const container of containers) {
      const doc = schema.nodes.doc.create(null, container).toJSON();
      const stored = roundTrip(doc);
      assert(stored.includes(container.type.name === "table" ? "data-inline-table" : "data-inline-rich"));
      assert.deepEqual(canonical(markdown.parse(stored)), doc, stored);
    }
  }
});

test("public inline parser retains the editor's styled text without an editor or browser DOM", () => {
  for (const source of [
    '<span data-inline-color="red" data-inline-background="yellow">**Цвет** *и* ++линия++ ~~нет~~ `код`</span>',
    '**[Ссылка](https://example.com)** и &lt;текст&gt; &amp; символы',
    'Соседи <span data-inline-color="green">один</span> <span data-inline-background="pink">два</span>',
  ]) {
    assert.deepEqual(semantics({ content: parseInlineMarkdown(source) }), semantics(canonical(markdown.parse(source))));
  }
  for (const href of ["javascript:alert(1)", "//example.com", "data:text/html,x"]) assert.equal(isSafeInlineLink(href), false);
  for (const href of ["https://example.com", "/app", "#fragment", "mailto:user@example.com", "tel:+123"]) assert.equal(isSafeInlineLink(href), true);
});

test("public inline parsing never drops text that resembles a block or changes the editor's lexer", () => {
  for (const source of ["1. Номер", "- Буквальная строка", "# Метка", "```", "***", "| Ячейка |", "    Отступ"]) {
    assert.equal(text({ content: parseInlineMarkdown(source) }), source);
  }
  const original = markdown.parse("# Заголовок\n\n- Пункт\n\n```js\nconst value = 1;\n```");
  assert.deepEqual(original.content.map(node => node.type), ["heading", "bulletList", "codeBlock"]);
});
