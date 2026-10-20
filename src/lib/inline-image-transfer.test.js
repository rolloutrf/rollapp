import assert from "node:assert/strict";
import test from "node:test";
import { getSchema } from "@tiptap/core";
import { MarkdownManager } from "@tiptap/markdown";
import { EditorState, TextSelection, NodeSelection } from "@tiptap/pm/state";
import { history, undo, redo } from "@tiptap/pm/history";
import { inlineEditorExtensions } from "./inline-editor-extensions.js";
import { imageTransferTransaction, commitImageTransfer, uploadImageTransfer } from "./inline-image-transfer.js";
import { createFourQuestionAdapter, questionScopes } from "./four-question-document.js";
import { IDENTITY_QUESTION_TITLES } from "../../shared/identity-questions.js";

const extensions = inlineEditorExtensions(), schema = getSchema(extensions), manager = new MarkdownManager({ extensions });
const p = text => schema.nodes.paragraph.create(null, text ? schema.text(text, [schema.marks.bold.create()]) : null);
const attributes = [1, 2].map(n => ({ src: `/api/media/image-${n}`, alt: `Image ${n}` }));
function fixture(doc, from, to = from) {
  let state = EditorState.create({ doc, selection: TextSelection.create(doc, from, to), plugins: [history()] });
  const editor = { schema: doc.type.schema, isEditable: true, isDestroyed: false, get state() { return state; }, view: { composing: false, focus() {}, dispatch(tr) { state = state.applyTransaction(tr).state; } } };
  return { editor, request: { doc, selection: state.selection } };
}

test("a file batch splits its actual native range, preserves rich neighbours and owns its new caret", () => {
  const doc = schema.nodes.doc.create(null, [p("Before target after"), p("Tail")]), f = fixture(doc, 8, 14);
  assert(commitImageTransfer(f.editor, f.request, attributes));
  const inserted = f.editor.state.doc;
  assert.deepEqual(inserted.content.content.map(node => [node.type.name, node.textContent]), [["paragraph", "Before "], ["image", ""], ["image", ""], ["paragraph", ""], ["paragraph", " after"], ["paragraph", "Tail"]]);
  assert.equal(inserted.firstChild.firstChild.marks[0].type.name, "bold");
  assert.equal(inserted.child(4).firstChild.marks[0].type.name, "bold");
  assert.equal(f.editor.state.selection.$from.parent.content.size, 0);
  const reload = schema.nodeFromJSON(manager.parse(manager.serialize(inserted.toJSON())));
  assert(inserted.eq(reload));
  f.editor.view.dispatch(f.editor.state.tr.insertText("Continue"));
  assert(undo(f.editor.state, f.editor.view.dispatch)); assert(f.editor.state.doc.eq(inserted));
  assert(undo(f.editor.state, f.editor.view.dispatch)); assert(f.editor.state.doc.eq(doc));
  assert(redo(f.editor.state, f.editor.view.dispatch)); assert(f.editor.state.doc.eq(inserted));
});

test("a file batch retains cell/list/nested/column owners and their unselected children", () => {
  for (const kind of ["nestedBlock", "listItem", "tableCell", "column"]) {
    const owner = schema.nodes[kind].create(null, [p("Target"), p("Child")]);
    const root = kind === "listItem" ? schema.nodes.bulletList.create(null, owner) : kind === "tableCell" ? schema.nodes.table.create(null, schema.nodes.tableRow.create(null, owner)) : kind === "column" ? schema.nodes.columns.create(null, [owner, schema.nodes.column.create(null, p("Peer"))]) : owner;
    const doc = schema.nodes.doc.create(null, [root, p("Tail")]);
    let from; doc.descendants((node, pos) => { if (from == null && node.type.name === "paragraph") from = pos + 3; });
    const f = fixture(doc, from); assert(commitImageTransfer(f.editor, f.request, attributes), kind);
    let actual; f.editor.state.doc.descendants(node => { if (!actual && node.type.name === kind) actual = node; });
    assert.deepEqual(actual.content.content.map(node => [node.type.name, node.textContent]), [["paragraph", "Ta"], ["image", ""], ["image", ""], ["paragraph", ""], ["paragraph", "rget"], ["paragraph", "Child"]], kind);
    assert.equal(f.editor.state.doc.lastChild.textContent, "Tail");
    assert(undo(f.editor.state, f.editor.view.dispatch)); assert(f.editor.state.doc.eq(doc));
  }
});

test("unsafe URLs, stale owners and composing/read-only states cannot dispatch or focus", () => {
  for (const reason of ["unsafe", "source", "selection", "readOnly", "ime", "destroyed"]) {
    const doc = schema.nodes.doc.create(null, p("Keep")), f = fixture(doc, 2);
    if (reason === "source") f.editor.view.dispatch(f.editor.state.tr.insertText("X"));
    if (reason === "selection") f.editor.view.dispatch(f.editor.state.tr.setSelection(TextSelection.create(doc, 1)));
    if (reason === "readOnly") f.editor.isEditable = false;
    if (reason === "ime") f.editor.view.composing = true;
    if (reason === "destroyed") f.editor.isDestroyed = true;
    let focused = false; f.editor.view.focus = () => { focused = true; };
    const before = f.editor.state;
    assert.equal(commitImageTransfer(f.editor, f.request, reason === "unsafe" ? [{ src: "javascript:alert(1)" }] : attributes), false);
    assert.equal(f.editor.state, before); assert.equal(focused, false);
  }
});

const files = [1, 2].map(n => ({ name: `${n}.png`, type: "image/png", size: 100 }));
test("uploads commit one batch and retain assets across Undo", async () => {
  const doc = schema.nodes.doc.create(null, p("")), f = fixture(doc, 1), released = [];
  const result = await uploadImageTransfer(f.editor, f.request, files, { upload: async file => ({ id: `00000000-0000-4000-8000-00000000000${file.name[0]}`, imageUrl: `/api/media/${file.name}` }), release: id => released.push(id) });
  assert.equal(result.status, "committed"); assert.deepEqual(released, []);
  assert(undo(f.editor.state, f.editor.view.dispatch)); assert(f.editor.state.doc.eq(doc)); assert.deepEqual(released, []);
});

test("failure or cancellation releases only new never-committed files and leaves prose intact", async () => {
  for (const reason of ["error", "source", "selection", "access", "ime", "lifecycle"]) {
    const doc = schema.nodes.doc.create(null, p("Keep")), f = fixture(doc, 2), released = [], id = "00000000-0000-4000-8000-000000000001";
    let current = true, count = 0;
    const result = await uploadImageTransfer(f.editor, f.request, files, { isCurrent: () => current, release: value => released.push(value), upload: async () => {
      count++;
      if (reason === "error" && count === 2) throw new Error("Upload failed");
      if (reason === "source") f.editor.view.dispatch(f.editor.state.tr.insertText("Changed"));
      if (reason === "selection") f.editor.view.dispatch(f.editor.state.tr.setSelection(TextSelection.create(doc, 1)));
      if (reason === "access") f.editor.isEditable = false;
      if (reason === "ime") f.editor.view.composing = true;
      if (reason === "lifecycle") current = false;
      return { id, imageUrl: "/api/media/new" };
    } });
    assert.equal(result.status, reason === "error" ? "error" : "cancelled");
    assert.deepEqual(released, [id]);
    assert.equal(count, reason === "error" ? 2 : 1);
    assert.equal(f.editor.state.doc.textContent, reason === "source" ? "KChangedeep" : "Keep");
  }
});

test("a file batch inside or across answers preserves fixed prompts and unrelated answers", () => {
  const adapter = createFourQuestionAdapter(), value = { questions: IDENTITY_QUESTION_TITLES.map(title => ({ title, paragraphs: ["Alpha target Omega"] })) };
  const currentSchema = getSchema([...inlineEditorExtensions(undefined, adapter.documentExtension), ...adapter.extensions]);
  const doc = currentSchema.nodeFromJSON(adapter.parse(value)), scopes = questionScopes(doc);
  for (const cross of [false, true]) {
    const f = fixture(doc, scopes[0].from + 7, cross ? scopes[1].from + 7 : scopes[0].from + 13);
    assert(commitImageTransfer(f.editor, f.request, attributes));
    const saved = adapter.serialize(f.editor.state.doc);
    assert.deepEqual(saved.questions.map(q => q.title), IDENTITY_QUESTION_TITLES);
    assert.deepEqual(saved.questions.slice(cross ? 2 : 1), value.questions.slice(cross ? 2 : 1));
    assert.deepEqual(currentSchema.nodeFromJSON(adapter.parse(saved)).toJSON(), f.editor.state.doc.toJSON());
    assert(undo(f.editor.state, f.editor.view.dispatch)); assert(f.editor.state.doc.eq(doc));
  }
});

test("validation runs for every selected file before any upload", async () => {
  const doc = schema.nodes.doc.create(null, p("Keep")), f = fixture(doc, 2); let uploaded = false;
  assert.equal((await uploadImageTransfer(f.editor, f.request, [...files, { type: "image/svg+xml", size: 100 }], { upload() { uploaded = true; }, release() {} })).status, "error");
  assert.equal(uploaded, false); assert.equal(f.editor.state.doc, doc);
  assert.equal(imageTransferTransaction(f.editor.state, f.request, []), null);
});

test("dropping next to an image inserts a batch without replacing that authored image", () => {
  const image = schema.nodes.image.create({ src: "/api/media/keep", alt: "Keep", width: 400 });
  const doc = schema.nodes.doc.create(null, [image, p("Tail")]), f = fixture(doc, 2);
  f.editor.view.dispatch(f.editor.state.tr.setSelection(NodeSelection.create(doc, 0)));
  const request = { doc, selection: f.editor.state.selection, insertAt: 1 };
  assert(commitImageTransfer(f.editor, request, attributes));
  assert.equal(f.editor.state.doc.firstChild, image);
  assert.deepEqual(f.editor.state.doc.content.content.map(node => node.type.name), ["image", "image", "image", "paragraph", "paragraph"]);
  assert.equal(f.editor.state.doc.lastChild.textContent, "Tail");
  assert(undo(f.editor.state, f.editor.view.dispatch)); assert(f.editor.state.doc.eq(doc));
});

test("focus-time lifecycle cancellation cannot commit an uploaded asset", async () => {
  const doc = schema.nodes.doc.create(null, p("Keep")), f = fixture(doc, 2), released = [];
  let current = true;
  f.editor.view.focus = () => { current = false; };
  const result = await uploadImageTransfer(f.editor, f.request, files.slice(0,1), { isCurrent: () => current, release: id => released.push(id), upload: async () => ({ id: "00000000-0000-4000-8000-000000000001", imageUrl: "/api/media/new" }) });
  assert.equal(result.status, "cancelled"); assert.equal(f.editor.state.doc, doc);
  assert.deepEqual(released, ["00000000-0000-4000-8000-000000000001"]);
});

test("empty required list anchors and empty cell/column/nested slots retain their owner", () => {
  for (const kind of ["nestedBlock", "listItem", "tableCell", "column"]) {
    const owner = schema.nodes[kind].create(null, [p(""), p("Child")]);
    const root = kind === "listItem" ? schema.nodes.bulletList.create(null, owner) : kind === "tableCell" ? schema.nodes.table.create(null, schema.nodes.tableRow.create(null, owner)) : kind === "column" ? schema.nodes.columns.create(null, [owner, schema.nodes.column.create(null, p("Peer"))]) : owner;
    const doc = schema.nodes.doc.create(null, [root, p("Tail")]);
    let from; doc.descendants((node,pos) => { if (from == null && node.type.name === "paragraph") from = pos + 1; });
    const f = fixture(doc, from); assert(commitImageTransfer(f.editor, f.request, attributes), kind);
    let actual; f.editor.state.doc.descendants(node => { if (!actual && node.type.name === kind) actual = node; });
    assert.equal(actual.content.content.filter(node=>node.type.name==="image").length, 2, kind);
    if (kind === "listItem") assert.equal(actual.firstChild.type.name, "paragraph");
    assert.equal(actual.lastChild.textContent, "Child"); assert.equal(f.editor.state.doc.lastChild.textContent, "Tail");
    assert(undo(f.editor.state, f.editor.view.dispatch)); assert(f.editor.state.doc.eq(doc));
  }
});
