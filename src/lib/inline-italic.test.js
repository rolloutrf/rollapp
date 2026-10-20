import test from "node:test";
import assert from "node:assert/strict";
import { getSchema } from "@tiptap/core";
import { MarkdownManager } from "@tiptap/markdown";
import { EditorState, TextSelection } from "@tiptap/pm/state";
import { history, undo, redo } from "@tiptap/pm/history";
import { inlineEditorExtensions } from "./inline-editor-extensions.js";
import { hasEffectiveItalic, italicStyleTransaction, toggleEffectiveItalic } from "./inline-italic.js";
import { parseInlineMarkdown } from "./inline-markdown.js";
import { parseBlockHTML } from "./inline-table-markdown.js";

const extensions = inlineEditorExtensions(), schema = getSchema(extensions), manager = new MarkdownManager({ extensions });
const p = (text, marks = []) => schema.nodes.paragraph.create(null, schema.text(text, marks));
const quote = (...children) => schema.nodes.blockquote.create(null, children);
const document = (...children) => schema.nodes.doc.create(null, children);
function fixture(doc, anchor, head = anchor) {
  let state = EditorState.create({ doc, selection: TextSelection.create(doc, anchor, head), plugins: [history()] });
  const editor = { isEditable: true, isDestroyed: false, get state() { return state; }, view: { composing: false, focus() {}, dispatch(tr) { state = state.applyTransaction(tr).state; } } };
  return editor;
}

test("quote italic toggles the actual effective style, preserving its default, other marks and neighbours", () => {
  const doc = document(quote(p("Before target after", [schema.marks.bold.create(), schema.marks.underline.create()]), p("Neighbour")), p("Tail"));
  const editor = fixture(doc, 9, 15);
  assert(hasEffectiveItalic(editor.state));assert(toggleEffectiveItalic(editor));assert(!hasEffectiveItalic(editor.state));
  const text = editor.state.doc.firstChild.firstChild.child(1);
  assert.equal(text.text, "target");assert.deepEqual(text.marks.map(m => m.type.name), ["bold", "underline", "normalText"]);
  assert.equal(editor.state.doc.textContent, doc.textContent);
  assert.equal(editor.state.doc.firstChild.type.name, "blockquote");assert(editor.state.doc.firstChild.child(1).eq(doc.firstChild.child(1)));
  assert(toggleEffectiveItalic(editor));assert(hasEffectiveItalic(editor.state));assert(editor.state.doc.eq(doc));
});

test("ordinary text still uses ordinary italic, without new override marks or storage changes", () => {
  const doc = document(p("Plain text")), editor = fixture(doc, 1, 6);
  assert(!hasEffectiveItalic(editor.state));assert(toggleEffectiveItalic(editor));assert(hasEffectiveItalic(editor.state));
  assert.equal(editor.state.doc.firstChild.firstChild.marks[0].type.name, "italic");
  assert(toggleEffectiveItalic(editor));assert(editor.state.doc.eq(doc));
  const old = manager.parse('> Plain quote\n\n*Italic* **bold** ++underline++');
  assert(!JSON.stringify(old).includes('normalText'));
});

test("normal quote exceptions have exact Markdown and public mark reload, including edge spaces and rich code", () => {
  for (const marks of [[schema.marks.bold.create()], [schema.marks.inlineStyle.create({ color: "red", background: "yellow" }), schema.marks.code.create()]]) {
    const doc = document(quote(p(" edge  spaces\t ", marks))), editor = fixture(doc, 2, doc.content.size - 2);
    assert(toggleEffectiveItalic(editor));const changed = editor.state.doc;
    const saved = manager.serialize(changed.toJSON());assert(saved.includes('data-inline-normal="true"'));
    assert(schema.nodeFromJSON(manager.parse(saved)).eq(changed), saved);
    const inline = saved.split('data-inline-rich>')[1]?.split('</p>')[0];assert(inline);
    assert(parseInlineMarkdown('<span data-inline-rich><span data-inline-normal="true">Normal</span></span>')[0].content[0].marks.some(m => m.type === 'normalText'));
  }
});

test("mixed quote/ordinary and reverse ranges toggle together without moving the selection", () => {
  const doc = document(quote(p("Quote")), p("Plain"));
  for (const reverse of [false, true]) {
    const editor = fixture(doc, reverse ? doc.content.size - 1 : 2, reverse ? 2 : doc.content.size - 1);
    const selected = editor.state.selection.toJSON();assert(!hasEffectiveItalic(editor.state));
    assert(toggleEffectiveItalic(editor));assert(hasEffectiveItalic(editor.state));assert.deepEqual(editor.state.selection.toJSON(), selected);
    assert(toggleEffectiveItalic(editor));assert(!hasEffectiveItalic(editor.state));
    assert.equal(editor.state.doc.firstChild.firstChild.firstChild.marks[0].type.name, "normalText");
    assert.equal(editor.state.doc.lastChild.firstChild.marks.length, 0);
  }
});

test("formatting and subsequent typing have separate Undo steps with exact Redo", () => {
  const doc = document(quote(p("Target"))), editor = fixture(doc, 2, 8);
  assert(toggleEffectiveItalic(editor));const formatted = editor.state.doc;
  editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(formatted, 5)).insertText("X"));
  assert(undo(editor.state, editor.view.dispatch));assert(editor.state.doc.eq(formatted));
  assert(undo(editor.state, editor.view.dispatch));assert(editor.state.doc.eq(doc));
  assert(redo(editor.state, editor.view.dispatch));assert(editor.state.doc.eq(formatted));
});

test("a quote caret stores only the explicit normal exception, retaining the other stored marks", () => {
  const doc = document(quote(p("Text"))), editor = fixture(doc, 4);
  editor.view.dispatch(editor.state.tr.setStoredMarks([schema.marks.bold.create()]));
  assert(hasEffectiveItalic(editor.state));assert(toggleEffectiveItalic(editor));
  assert.deepEqual(editor.state.storedMarks.map(m => m.type.name), ["bold", "normalText"]);
  editor.view.dispatch(editor.state.tr.insertText("New"));assert(!hasEffectiveItalic(editor.state));
  assert.equal(editor.state.doc.firstChild.firstChild.child(1).text, "New");
});

test("code, read-only, composing, destroyed and focus-time owner changes cannot apply stale formatting", () => {
  const code = fixture(document(schema.nodes.codeBlock.create(null, schema.text("Code"))), 1, 5);
  assert.equal(italicStyleTransaction(code.state), null);
  for (const reason of ["access", "ime", "destroyed", "focus-source"]) {
    const doc = document(quote(p("Target"))), editor = fixture(doc, 2, 8);let focused = false;
    if (reason === "access") editor.isEditable = false;
    if (reason === "ime") editor.view.composing = true;
    if (reason === "destroyed") editor.isDestroyed = true;
    editor.view.focus = () => { focused = true; if (reason === "focus-source") editor.view.dispatch(editor.state.tr.insertText("Changed")); };
    assert.equal(toggleEffectiveItalic(editor), false);assert.equal(focused, reason === "focus-source");
    if (reason !== "focus-source") assert.equal(editor.state.doc, doc);
  }
});

test("nested explicit emphasis and normal exceptions resolve to the inner authoring style, never conflicting marks", () => {
  for (const [html, expected] of [
    ['<span data-inline-normal="true"><em>Text</em></span>', 'italic'],
    ['<em><span data-inline-normal="true">Text</span></em>', 'normalText'],
  ]) {
    const inline = schema.nodeFromJSON({ type: 'doc', content: parseInlineMarkdown(`<span data-inline-rich>${html}</span>`) });
    inline.check();assert.deepEqual(inline.firstChild.firstChild.marks.map(m => m.type.name), [expected]);
    const block = schema.nodeFromJSON(parseBlockHTML(`<div data-inline-block="true"><blockquote><p>${html}</p></blockquote></div>`));
    block.check();assert.deepEqual(block.firstChild.firstChild.marks.map(m => m.type.name), [expected]);
  }
});

test("removing inherited italic keeps complete link metadata and quoted titles through storage", () => {
  const link = schema.marks.link.create({ href: 'https://example.test/a)b', title: 'A "quoted" title', target: '_self', rel: 'author', class: 'author-link' });
  const doc = document(quote(p(' linked ', [link, schema.marks.bold.create()]))), editor = fixture(doc, 2, 10);
  assert(toggleEffectiveItalic(editor));const formatted = editor.state.doc;
  const stored = manager.serialize(formatted.toJSON());assert(schema.nodeFromJSON(manager.parse(stored)).eq(formatted));
});
