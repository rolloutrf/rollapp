import assert from "node:assert/strict";
import test from "node:test";
import { getSchema } from "@tiptap/core";
import { MarkdownManager } from "@tiptap/markdown";
import { inlineEditorExtensions } from "./inline-editor-extensions.js";
import { needsRichTable } from "./inline-table-markdown.js";

const extensions = inlineEditorExtensions(), schema = getSchema(extensions), markdown = new MarkdownManager({ extensions });
const p = text => schema.nodes.paragraph.create(null, text ? schema.text(text) : null);
const cell = (type, content, attrs) => schema.nodes[type].create(attrs, content);
const row = content => schema.nodes.tableRow.create(null, content);
const table = rows => schema.nodes.table.create(null, rows);
function roundTrip(node) {
  const doc = schema.nodes.doc.create(null, [p("До"), node, p("После")]);
  const stored = markdown.serialize(doc.toJSON());
  const restored = schema.nodeFromJSON(markdown.parse(stored));
  restored.check();
  assert.deepEqual(restored.toJSON(), doc.toJSON(), stored);
  return stored;
}

test("simple tables keep GFM; header columns, headerless rows and spans keep their exact structure", () => {
  const simple = table([row([cell("tableHeader", p("A")), cell("tableHeader", p("B"))]), row([cell("tableCell", p("C")), cell("tableCell", p("D"))])]);
  assert(!needsRichTable(simple.toJSON()));
  assert(roundTrip(simple).includes("|"));
  for (const type of ["tableCell", "tableHeader"]) {
    const rich = table([row([cell(type, [p("Один"), p("Два")], { colspan: 2, colwidth: [120,180] })]), row([cell("tableHeader", p("Три")), cell("tableCell", p("Четыре"), { align: "right" })])]);
    assert(roundTrip(rich).includes('data-inline-table="true"'));
  }
  roundTrip(table([row([cell("tableHeader", p("Высота"), { rowspan: 2 }), cell("tableCell", p("A"))]), row([cell("tableCell", p("B"))])]));
  roundTrip(table([row([cell("tableHeader", p("Общая"), { rowspan: 2, colspan: 2, colwidth: [1200,0] })]), row([])]));
});

test("table cells preserve nested blocks, rich text, literal code and empty paragraphs without a DOM", () => {
  const code = schema.marks.code.create(), color = schema.marks.inlineStyle.create({ color: "red", background: "yellow" });
  const rich = schema.nodes.paragraph.create(null, [schema.text('  ** <td> | & "\n\t', [code, color, schema.marks.bold.create()]), schema.nodes.hardBreak.create(null,null,[code,color]), schema.text("конец")]);
  const nested = table([row([cell("tableHeader", p("Вложенная"))])]);
  const toggle = schema.nodes.details.create({ open: true }, [schema.nodes.detailsSummary.create(null, schema.text("Название")), schema.nodes.detailsContent.create(null, [schema.nodes.codeBlock.create({ language: "html" }, schema.text('<table>\n</table>')), nested])]);
  const list = schema.nodes.taskList.create(null, schema.nodes.taskItem.create({ checked: true }, [p("Сделано"), schema.nodes.orderedList.create({ type: "i", start: 3 }, schema.nodes.listItem.create(null, p("Пункт")))]));
  roundTrip(table([row([cell("tableHeader", [rich, p(""), toggle, list])])]));
  for (const value of ["  пробелы  ", "до\tпосле", "первая\nвторая", "</table><script>alert(1)</script>"]) roundTrip(table([row([cell("tableCell", p(value))])]));
});

test("malformed or executable canonical HTML becomes literal text", () => {
  for (const body of ['<script>alert(1)</script>', '<p>Нельзя непосредственно в table</p>', '<tr></tr>', '<tr><td rowspan="2"><p>A</p></td></tr>', '<tr><td><p>A</p></td><td><p>B</p></td></tr><tr><td><p>C</p></td></tr>', '<tr onclick="alert(1)"><td><p>A</p></td></tr>', '<tr><td><iframe src="https://example.com"/></td></tr>', '<tr><td colspan="99999999"><p>A</p></td></tr>']) {
    const source = `<table data-inline-table="true">${body}</table>`;
    const parsed = markdown.parse(source);
    assert.equal(parsed.content[0].type, "paragraph");
    assert.equal(parsed.content[0].content[0].text, source);
  }
});
