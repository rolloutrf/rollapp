import assert from "node:assert/strict";
import test from "node:test";
import { getSchema } from "@tiptap/core";
import { EditorState, TextSelection } from "@tiptap/pm/state";
import { history, undo } from "@tiptap/pm/history";
import { TableMap, CellSelection } from "@tiptap/pm/tables";
import { inlineEditorExtensions } from "./inline-editor-extensions.js";
import { applyTableAction, headerEnabled } from "./inline-table-actions.js";
import { createFourQuestionAdapter } from "./four-question-document.js";
import { IDENTITY_QUESTION_TITLES } from "../../shared/identity-questions.js";

function setup() {
  const schema = getSchema(inlineEditorExtensions());
  const p = text => schema.nodes.paragraph.create(null, text ? schema.text(text) : null);
  const table = schema.nodes.table.create(null, ["AB", "CD"].map((values, row) => schema.nodes.tableRow.create(null, [...values].map(value => schema.nodes[row ? "tableCell" : "tableHeader"].create(null, p(value))))));
  const doc = schema.nodes.doc.create(null, [p("До"), table, p("После")]);
  const position = doc.firstChild.nodeSize;
  let state = EditorState.create({ doc, plugins: [history()], selection: TextSelection.create(doc, 1) });
  return { position, original: doc, isEditable: true, get state() { return state; }, view: { dispatch(tr) { state = state.apply(tr); } } };
}

test("table menus stage their cell selection without mutating a dry run", () => {
  const editor = setup(), initial = editor.state;
  for (const action of ["rowAbove", "rowBelow", "columnLeft", "columnRight", "deleteRow", "deleteColumn", "headerRow", "headerColumn", "clear", "deleteTable", "selectRow", "selectColumn", "selectTable"]) assert(applyTableAction(editor, editor.position, action, true));
  assert.equal(editor.state, initial);
  editor.isEditable = false;
  assert(!applyTableAction(editor, editor.position, "rowBelow"));
  assert.equal(editor.state, initial);
});

test("row, column, header and deletion commands preserve neighbours and have separate Undo", () => {
  for (const action of ["rowAbove", "rowBelow", "columnLeft", "columnRight", "deleteRow", "deleteColumn", "headerRow", "headerColumn", "clear", "deleteTable"]) {
    const editor = setup();
    assert(applyTableAction(editor, editor.position, action), action);
    editor.state.doc.check();
    assert.equal(editor.state.doc.firstChild.textContent, "До");
    assert.equal(editor.state.doc.lastChild.textContent, "После");
    assert(undo(editor.state, tr => editor.view.dispatch(tr)), action);
    assert(editor.state.doc.eq(editor.original), action);
  }
});

test("whole row/column selection is not a content change and header toggles address the table edges", () => {
  const editor = setup();
  assert(headerEnabled(editor.state, editor.position, "row"));
  assert(!headerEnabled(editor.state, editor.position, "column"));
  for (const action of ["selectRow", "selectColumn", "selectTable"]) {
    assert(applyTableAction(editor, editor.position, action));
    assert(editor.state.selection instanceof CellSelection);
    assert(editor.state.doc.eq(editor.original));
  }
  applyTableAction(editor, editor.position, "headerColumn");
  assert(headerEnabled(editor.state, editor.position, "column"));
  applyTableAction(editor, editor.position, "headerRow");
  assert(!headerEnabled(editor.state, editor.position, "row"));
  assert(headerEnabled(editor.state, editor.position, "column"), "Toggling the header row must preserve the intersecting header column");
});

test("merge keeps the top-left content; Undo restores every cleared cell and split restores the grid", () => {
  const editor = setup();
  applyTableAction(editor, editor.position, "selectTable");
  assert(applyTableAction(editor, editor.position, "merge"));
  const merged = editor.state.doc.nodeAt(editor.position);
  assert.equal(merged.textContent, "A");
  assert.equal(merged.firstChild.firstChild.attrs.colspan, 2);
  assert.equal(merged.firstChild.firstChild.attrs.rowspan, 2);
  assert.equal(TableMap.get(merged).problems, null);
  assert(applyTableAction(editor, editor.position, "split"));
  assert.equal(TableMap.get(editor.state.doc.nodeAt(editor.position)).map.length, 4);
  assert.equal(TableMap.get(editor.state.doc.nodeAt(editor.position)).problems, null);
  assert.equal(editor.state.doc.nodeAt(editor.position).textContent, "A");
  assert(undo(editor.state, tr => editor.view.dispatch(tr)));
  assert(editor.state.doc.nodeAt(editor.position).eq(merged));
  assert(undo(editor.state, tr => editor.view.dispatch(tr)));
  assert(editor.state.doc.eq(editor.original));
});

test("deleting the only table in a fixed answer keeps all four prompts and restores in one Undo", () => {
  const adapter = createFourQuestionAdapter();
  const value = { questions: IDENTITY_QUESTION_TITLES.map((title,index) => ({ title, paragraphs: [index ? `Ответ ${index}` : "| A | B |\n| --- | --- |\n| C | D |"] })) };
  const input = adapter.parse(value), schema = getSchema([...inlineEditorExtensions(undefined,adapter.documentExtension),...adapter.extensions]);
  const doc = schema.nodeFromJSON(input), guard = adapter.extensions.at(-1).config.addProseMirrorPlugins.call({})[0];
  let state = EditorState.create({doc,plugins:[history(),guard]});
  const editor = { isEditable:true, get state() { return state; }, view:{dispatch(tr) {state=state.apply(tr);}} };
  assert(applyTableAction(editor,1,"deleteTable"));
  assert.equal(state.doc.childCount,4);
  assert.deepEqual(adapter.serialize(state.doc).questions[0].paragraphs,[]);
  assert.deepEqual(adapter.serialize(state.doc).questions.slice(1),value.questions.slice(1));
  assert(undo(state,tr=>editor.view.dispatch(tr)));
  assert(state.doc.eq(doc));
});
