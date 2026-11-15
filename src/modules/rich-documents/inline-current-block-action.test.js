import assert from "node:assert/strict";
import test from "node:test";
import { getSchema } from "@tiptap/core";
import { MarkdownManager } from "@tiptap/markdown";
import { EditorState, NodeSelection, TextSelection } from "@tiptap/pm/state";
import { history, undo, redo } from "@tiptap/pm/history";
import { inlineEditorExtensions } from "./inline-editor-extensions.js";
import { BlockSelection } from "./inline-block-selection.js";
import { currentBlockAction } from "./inline-current-block-action.js";
import { handleBlockKeyDown } from "./inline-block-selection-extension.js";

const extensions = inlineEditorExtensions(), schema = getSchema(extensions), markdown = new MarkdownManager({ extensions });
const p = text => schema.nodes.paragraph.create(null, text ? schema.text(text) : null);
const task = (text, checked = false, children = []) => schema.nodes.taskItem.create({ checked, blockColor: "red" }, [p(text), ...children]);
const tasks = children => schema.nodes.taskList.create(null, children);
const toggle = (open = false) => schema.nodes.details.create({ open, blockColor: "blue_background" }, [schema.nodes.detailsSummary.create(null, schema.text("Название", [schema.marks.bold.create()])), schema.nodes.detailsContent.create(null, p("Дочерний текст"))]);
function fixture(children) {
  let state = EditorState.create({ schema, doc: schema.nodes.doc.create(null, children), plugins: [history()] });
  return { isEditable: true, get state() { return state; }, view: { composing: false, dispatch(tr) { state = state.apply(tr); } } };
}
const select = (editor, from, to = from) => editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, from, to)));
const key = (editor, overrides = {}) => handleBlockKeyDown(editor, { key: "Enter", metaKey: true, ...overrides });

test("Mod+Enter toggles a to-do twice while preserving its caret, attributes, descendants and neighbours", () => {
  const e = fixture([tasks([task("Задача", false, [tasks([task("Дочерняя", true)])]), task("Сосед")]), p("После")]);
  select(e, 5, 7); const before = e.state.doc, selection = e.state.selection;
  assert(key(e)); assert.equal(e.state.doc.firstChild.firstChild.attrs.checked, true);
  assert.equal(e.state.doc.firstChild.firstChild.attrs.blockColor, "red");
  assert(e.state.doc.firstChild.firstChild.content.eq(before.firstChild.firstChild.content));
  assert(e.state.doc.firstChild.child(1).eq(before.firstChild.child(1))); assert(e.state.doc.lastChild.eq(before.lastChild));
  assert(e.state.selection.eq(selection)); assert(key(e, { metaKey: false, ctrlKey: true })); assert(e.state.doc.eq(before));
});

test("current nested to-do toggles independently from its parent", () => {
  const e = fixture([tasks([task("Родитель", false, [tasks([task("Дочерняя")])])])]);
  let childPos; e.state.doc.descendants((node, pos) => { if (node.type.name === "paragraph" && node.textContent === "Дочерняя") childPos = pos + 2; });
  select(e, childPos); assert(currentBlockAction(e));
  assert.equal(e.state.doc.firstChild.firstChild.attrs.checked, false);
  assert.equal(e.state.doc.firstChild.firstChild.lastChild.firstChild.attrs.checked, true);
});

test("summary Mod+Enter opens/closes a toggle without changing its text, selection or Markdown semantics", () => {
  const e = fixture([toggle(), p("После")]); select(e, 4, 7); const before = e.state.doc, selection = e.state.selection;
  assert(key(e)); assert.equal(e.state.doc.firstChild.attrs.open, true); assert(e.state.selection.eq(selection));
  assert(e.state.doc.firstChild.content.eq(before.firstChild.content)); assert(e.state.doc.lastChild.eq(before.lastChild));
  assert.deepEqual(schema.nodeFromJSON(markdown.parse(markdown.serialize(e.state.doc.toJSON()))).toJSON(), e.state.doc.toJSON());
  assert(key(e)); assert(e.state.doc.eq(before));
});

test("explicit single task/toggle selections remain selected after the action", () => {
  for (const type of ["task", "toggle"]) for (const kind of ["node", "block"]) {
    const e = fixture([type === "task" ? tasks([task("Задача")]) : toggle(), p("После")]), pos = type === "task" ? 1 : 0;
    e.view.dispatch(e.state.tr.setSelection(kind === "node" ? NodeSelection.create(e.state.doc, pos) : BlockSelection.create(e.state.doc, pos)));
    const selection = e.state.selection; assert(key(e), `${type}/${kind}`); assert(e.state.selection.eq(selection), `${type}/${kind}`);
    assert.equal(e.state.doc.nodeAt(pos).attrs[type === "task" ? "checked" : "open"], true);
  }
});

test("block action has its own Undo/Redo, separate from text before and after it", () => {
  const e = fixture([tasks([task("Задача")])]); select(e, 5);
  e.view.dispatch(e.state.tr.insertText("А")); const before = e.state.doc;
  assert(key(e)); const changed = e.state.doc;
  e.view.dispatch(e.state.tr.insertText("Б"));
  const dispatch = tr => e.view.dispatch(tr);
  assert(undo(e.state, dispatch)); assert(e.state.doc.eq(changed));
  assert(undo(e.state, dispatch)); assert(e.state.doc.eq(before));
  assert(redo(e.state, dispatch)); assert(e.state.doc.eq(changed));
});

test("action ignores ordinary blocks, multi-block ranges, composition, modified variants and read-only access", () => {
  const e = fixture([tasks([task("Задача")]), p("После"), toggle(true)]);
  const first = e.state.doc.firstChild.nodeSize;
  for (const mode of ["plain", "range", "sparse", "readonly", "ime", "view-ime", "shift", "alt"]) {
    e.isEditable = true; e.view.composing = false; select(e, 4);
    if (mode === "plain") select(e, first + 2);
    if (mode === "range") select(e, 4, first + 3);
    if (mode === "sparse") e.view.dispatch(e.state.tr.setSelection(BlockSelection.fromPositions(e.state.doc, [1, first])));
    if (mode === "readonly") e.isEditable = false;
    if (mode === "view-ime") e.view.composing = true;
    const before = e.state;
    assert.equal(key(e, { isComposing: mode === "ime", shiftKey: mode === "shift", altKey: mode === "alt" }), false, mode);
    assert.equal(e.state, before, mode);
  }
});


test("toggling a task retains the pending inline marks for subsequent typing", () => {
  const e = fixture([tasks([task("Задача")])]); select(e, 5);
  const marks = [schema.marks.bold.create(), schema.marks.inlineStyle.create({ color: "purple" })];
  e.view.dispatch(e.state.tr.setStoredMarks(marks));
  assert(key(e)); assert.deepEqual(e.state.storedMarks, marks);
  e.view.dispatch(e.state.tr.insertText("!"));
  const inserted = e.state.doc.nodeAt(5); assert.equal(inserted.text[0], "!"); assert.deepEqual(inserted.marks, marks);
});
