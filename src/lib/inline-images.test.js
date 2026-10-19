import assert from "node:assert/strict";
import test from "node:test";
import { getSchema } from "@tiptap/core";
import { MarkdownManager } from "@tiptap/markdown";
import { EditorState, NodeSelection, TextSelection } from "@tiptap/pm/state";
import { history, undo, redo } from "@tiptap/pm/history";
import { inlineEditorExtensions } from "./inline-editor-extensions.js";
import { commitInlineImage } from "./inline-images.js";
import { requestInlineImage, safeImageSource, validateInlineImageFile } from "./inline-image-intent.js";
import { createFourQuestionAdapter } from "./four-question-document.js";
import { IDENTITY_QUESTION_TITLES } from "../../shared/identity-questions.js";

const extensions = inlineEditorExtensions(), schema = getSchema(extensions), manager = new MarkdownManager({ extensions });
const paragraph = text => schema.nodes.paragraph.create(null, text ? schema.text(text) : null);
const source = "/api/media/11111111-1111-4111-8111-111111111111";
function fixture(doc, selection, currentSchema = schema) {
  let state = EditorState.create({ schema: currentSchema, doc, selection, plugins: [history()] });
  const focused = [], editor = {
    schema: currentSchema, isEditable: true, isDestroyed: false,
    get state() { return state; },
    view: { composing: false, focus() { focused.push(state.doc); }, dispatch(tr) { state = state.applyTransaction(tr).state; } },
    chain() { let command; return { command(fn) { command = fn; return this; }, run() {
      const tr = state.tr, result = command({ tr, state });
      if (result && !tr.getMeta("preventDispatch")) editor.view.dispatch(tr);
      return result;
    } }; },
  };
  return { editor, focused, request: options => ({ doc: state.doc, selection: state.selection, ...options }) };
}

test("image sources exclude executable, embedded, credential and network-path URLs", () => {
  for (const value of [source, "https://example.com/a.png?x=1&y=2", "http://127.0.0.1/image.png"]) assert.equal(safeImageSource(value), value);
  for (const value of ["javascript:alert(1)", "data:image/png;base64,a", "blob:https://example.com/id", "//example.com/a.png", "/\\example.com/a.png", "https://user:secret@example.com/a.png", "https://example.com/\nimage.png", "", null]) assert.equal(safeImageSource(value), null, String(value));
  assert.equal(validateInlineImageFile({ type: "image/png", size: 1024 }), "");
  for (const file of [{ type: "image/svg+xml", size: 1024 }, { type: "image/png", size: 0 }, { type: "image/png", size: 8 * 1024 * 1024 + 1 }]) assert(validateInlineImageFile(file));
});

test("opening an image request retains the exact document and selection without history", () => {
  const doc = schema.nodes.doc.create(null, paragraph("Before /image after"));
  const f = fixture(doc, TextSelection.create(doc, 14)); let event;
  f.editor.view.dom = { isConnected: true, ownerDocument: { defaultView: { CustomEvent: class { constructor(type, options) { this.type = type; Object.assign(this, options); } } } }, dispatchEvent(value) { event = value; return false; } };
  assert(requestInlineImage(f.editor, { suggestion: { from: 8, to: 14 } }));
  assert.equal(event.detail.doc, doc); assert.equal(event.detail.selection, f.editor.state.selection);
  assert.equal(event.cancelable, true); assert.equal(f.editor.state.doc, doc); assert.equal(undo(f.editor.state, f.editor.view.dispatch), false);
  f.editor.isEditable = false; assert.equal(requestInlineImage(f.editor), false);
});

test("image insertion owns its following paragraph, leaves neighbours intact and has separate typing Undo", () => {
  for (const side of ["before", "after", "replace"]) {
    const doc = schema.nodes.doc.create(null, [paragraph(side === "replace" ? "" : "Keep"), paragraph("Neighbour")]);
    const f = fixture(doc, TextSelection.create(doc, 1));
    assert(commitInlineImage(f.editor, f.request({ position: 0, side }), { src: source, alt: "Схема", width: 420, height: 240 }));
    const inserted = f.editor.state.doc;
    inserted.check(); assert.equal(inserted.lastChild.textContent, "Neighbour");
    assert.equal(f.editor.state.selection.$from.parent.textContent, "");
    assert.equal(f.focused[0], doc, "Real focus is restored before committing");
    f.editor.view.dispatch(f.editor.state.tr.insertText("Continue"));
    assert(undo(f.editor.state, f.editor.view.dispatch)); assert(f.editor.state.doc.eq(inserted));
    assert(undo(f.editor.state, f.editor.view.dispatch)); assert(f.editor.state.doc.eq(doc));
    assert(redo(f.editor.state, f.editor.view.dispatch)); assert(f.editor.state.doc.eq(inserted));
  }
});

test("image submission removes only its slash query and Undo restores literal text and marks", () => {
  const node = schema.nodes.paragraph.create(null, schema.text("Before /image after", [schema.marks.bold.create()]));
  const doc = schema.nodes.doc.create(null, node), f = fixture(doc, TextSelection.create(doc, 14));
  assert(commitInlineImage(f.editor, f.request({ suggestion: { from: 8, to: 14 } }), { src: source }));
  assert.equal(f.editor.state.doc.firstChild.textContent, "Before  after");
  assert.equal(f.editor.state.doc.firstChild.firstChild.marks[0].type.name, "bold");
  assert.equal(f.editor.state.doc.child(1).type.name, "image");
  assert(undo(f.editor.state, f.editor.view.dispatch)); assert(f.editor.state.doc.eq(doc));
});

test("stale, read-only, composing and unsafe image submissions never change content or focus", () => {
  for (const reason of ["stale", "selection", "readOnly", "composing", "unsafe"]) {
    const doc = schema.nodes.doc.create(null, paragraph("Keep")), f = fixture(doc), request = f.request();
    if (reason === "stale") f.editor.view.dispatch(f.editor.state.tr.insertText("Changed", 1));
    if (reason === "selection") f.editor.view.dispatch(f.editor.state.tr.setSelection(TextSelection.create(doc, 2)));
    if (reason === "readOnly") f.editor.isEditable = false;
    if (reason === "composing") f.editor.view.composing = true;
    const before = f.editor.state.doc;
    assert.equal(commitInlineImage(f.editor, request, { src: reason === "unsafe" ? "javascript:alert(1)" : source }), false);
    assert.equal(f.editor.state.doc, before); assert.equal(f.focused.length, 0);
  }
});

test("editing an image preserves omitted attributes and the neighbouring text with one Undo", () => {
  const image = schema.nodes.image.create({ src: source, alt: "Before", title: "Title", width: "75%", height: 240 });
  const doc = schema.nodes.doc.create(null, [image, paragraph("Keep")]), f = fixture(doc, NodeSelection.create(doc, 0));
  assert(commitInlineImage(f.editor, f.request(), { src: source, alt: "After" }));
  assert.deepEqual({ ...f.editor.state.doc.firstChild.attrs }, { ...image.attrs, alt: "After" });
  assert.equal(f.editor.state.doc.lastChild.textContent, "Keep");
  assert(undo(f.editor.state, f.editor.view.dispatch)); assert(f.editor.state.doc.eq(doc));
});

test("image dimensions, typed legacy attributes and literal alt/title survive canonical reload", () => {
  for (const width of [420, "75%", null]) {
    const image = schema.nodes.image.create({ src: source, alt: 'A [diagram]\n with  spaces', title: 'A "quoted" title', width, height: 240 });
    const doc = schema.nodes.doc.create(null, [image, paragraph("Keep")]);
    const restored = schema.nodeFromJSON(manager.parse(manager.serialize(doc.toJSON())));
    assert.deepEqual(restored.toJSON(), doc.toJSON());
  }
});

test("adding an image to a protected answer preserves every prompt and other answer exactly", () => {
  const adapter = createFourQuestionAdapter();
  const value = { questions: IDENTITY_QUESTION_TITLES.map((title, i) => ({ title, paragraphs: [`Answer ${i}`] })) };
  const currentSchema = getSchema([...inlineEditorExtensions(undefined, adapter.documentExtension), ...adapter.extensions]);
  const doc = currentSchema.nodeFromJSON(adapter.parse(value)), f = fixture(doc, TextSelection.create(doc, 2), currentSchema);
  assert(commitInlineImage(f.editor, f.request(), { src: source, width: 320 }));
  const saved = adapter.serialize(f.editor.state.doc); assert.deepEqual(saved.questions.slice(1), value.questions.slice(1));
  assert.deepEqual(saved.questions.map(q => q.title), IDENTITY_QUESTION_TITLES);
  assert.deepEqual(currentSchema.nodeFromJSON(adapter.parse(saved)).toJSON(), f.editor.state.doc.toJSON());
});

test("caret image insertion keeps its cell, first nested paragraph and list-item parent", () => {
  const cases = [
    { root: { type: "table", content: [{ type: "tableRow", content: [{ type: "tableCell", content: [{ type: "paragraph", content: [{ type: "text", text: "Target" }] }] }, { type: "tableCell", content: [{ type: "paragraph", content: [{ type: "text", text: "Peer" }] }] }] }] }, pos: 4, path: [0, 0, 0] },
    { root: { type: "nestedBlock", content: [{ type: "paragraph", content: [{ type: "text", text: "Target" }] }, { type: "paragraph", content: [{ type: "text", text: "Child" }] }] }, pos: 2, path: [0] },
    { root: { type: "bulletList", content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Target" }] }, { type: "paragraph", content: [{ type: "text", text: "Child" }] }] }] }, pos: 3, path: [0, 0] },
  ];
  for (const item of cases) {
    const doc = schema.nodeFromJSON({ type: "doc", content: [item.root, { type: "paragraph", content: [{ type: "text", text: "Tail" }] }] });
    const f = fixture(doc, TextSelection.create(doc, item.pos));
    assert(commitInlineImage(f.editor, f.request(), { src: source }));
    const expected = JSON.parse(JSON.stringify(doc.toJSON()));
    let parent = expected;
    for (const index of item.path) parent = parent.content[index];
    parent.content.splice(1, 0, schema.nodes.image.create({ src: source, alt: "" }).toJSON(), schema.nodes.paragraph.create().toJSON());
    assert.deepEqual(JSON.parse(JSON.stringify(f.editor.state.doc.toJSON())), JSON.parse(JSON.stringify(expected)), item.root.type);
    assert.equal(f.editor.state.selection.$from.parent.type.name, "paragraph");
    assert(undo(f.editor.state, f.editor.view.dispatch)); assert(f.editor.state.doc.eq(doc));
  }
});

test("an empty required list paragraph stays before media; ordinary nested and cell slots can replace it", () => {
  for (const kind of ["nestedBlock", "listItem", "tableCell"]) {
    const parent = schema.nodes[kind].create(null, paragraph(""));
    const root = kind === "listItem" ? schema.nodes.bulletList.create(null, parent) : kind === "tableCell" ? schema.nodes.table.create(null, schema.nodes.tableRow.create(null, parent)) : parent;
    const doc = schema.nodes.doc.create(null, [root, paragraph("Tail")]);
    let pos; doc.descendants((node, offset) => { if (pos == null && node.type.name === "paragraph") pos = offset + 1; });
    const f = fixture(doc, TextSelection.create(doc, pos));
    assert(commitInlineImage(f.editor, f.request(), { src: source }));
    let owner; f.editor.state.doc.descendants(node => { if (!owner && node.type.name === kind) owner = node; });
    assert.deepEqual(owner.content.content.map(node => node.type.name), kind === "listItem" ? ["paragraph", "image", "paragraph"] : ["image", "paragraph"], kind);
    assert.equal(f.editor.state.doc.lastChild.textContent, "Tail"); f.editor.state.doc.check();
    assert(undo(f.editor.state, f.editor.view.dispatch)); assert(f.editor.state.doc.eq(doc));
  }
});


test("editing a selected nested head image uses its exact node even when the block menu targets its parent", () => {
  const image = schema.nodes.image.create({ src: source, alt: "Before", width: 240, title: "Keep" });
  const doc = schema.nodes.doc.create(null, [schema.nodes.nestedBlock.create(null, [image, paragraph("Child")]), paragraph("Tail")]);
  const f = fixture(doc, NodeSelection.create(doc, 1));
  assert(commitInlineImage(f.editor, f.request({ position: 0 }), { src: source, alt: "After" }));
  const expected = JSON.parse(JSON.stringify(doc.toJSON())); expected.content[0].content[0].attrs.alt = "After";
  assert.deepEqual(JSON.parse(JSON.stringify(f.editor.state.doc.toJSON())), expected);
  assert(undo(f.editor.state, f.editor.view.dispatch)); assert(f.editor.state.doc.eq(doc));
});


test("an explicit table target does not edit the image selected inside one of its cells", () => {
  const image = schema.nodes.image.create({ src: source, alt: "Before" });
  const table = schema.nodes.table.create(null, schema.nodes.tableRow.create(null, schema.nodes.tableCell.create(null, [image, paragraph("Keep")] )));
  const doc = schema.nodes.doc.create(null, [table, paragraph("Tail")]);
  const f = fixture(doc, NodeSelection.create(doc, 3));
  assert(commitInlineImage(f.editor, f.request({ position: 0 }), { src: source, alt: "After" }));
  assert(f.editor.state.doc.firstChild.eq(table));
  assert.equal(f.editor.state.doc.child(1).type.name, "image"); assert.equal(f.editor.state.doc.child(1).attrs.alt, "After");
  assert.equal(f.editor.state.doc.child(2).type.name, "paragraph"); assert.equal(f.editor.state.doc.lastChild.textContent, "Tail");
  assert(undo(f.editor.state, f.editor.view.dispatch)); assert(f.editor.state.doc.eq(doc));
});
