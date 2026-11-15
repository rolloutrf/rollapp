import assert from "node:assert/strict";
import test from "node:test";
import { getSchema } from "@tiptap/core";
import { EditorState } from "@tiptap/pm/state";
import { history, undo } from "@tiptap/pm/history";
import { inlineEditorExtensions } from "./inline-editor-extensions.js";
import { convertListItemToTask, convertParagraphToToggle } from "./inline-symbol-shortcuts.js";

test("typed task conversion splits only its own list item and preserves neighbours, nesting and Undo", () => {
  const schema = getSchema(inlineEditorExtensions());
  const p = text => schema.nodes.paragraph.create(null, text ? schema.text(text) : null);
  for (const type of ["bulletList", "orderedList"]) {
    const first = schema.nodes.listItem.create(null, schema.nodes.paragraph.create(null, schema.text("До", [schema.marks.bold.create()])));
    const current = schema.nodes.listItem.create(null, [p("[X]"), schema.nodes.bulletList.create(null, schema.nodes.listItem.create(null, p("Вложенный")))]);
    const last = schema.nodes.listItem.create(null, p("После"));
    const doc = schema.nodes.doc.create(null, schema.nodes[type].create(type === "orderedList" ? { start: 5 } : null, [first, current, last]));
    let state = EditorState.create({ schema, doc, plugins: [history()] });
    const from = 1 + first.nodeSize + 2;
    const tr = state.tr;
    assert(convertListItemToTask(tr, { from, to: from + 3 }, true));
    state = state.apply(tr);
    state.doc.check();
    assert.equal(state.doc.childCount, 3);
    assert.deepEqual(state.doc.firstChild.firstChild.toJSON(), first.toJSON());
    assert.deepEqual(state.doc.lastChild.firstChild.toJSON(), last.toJSON());
    assert.equal(state.doc.child(1).firstChild.attrs.checked, true);
    assert.equal(state.doc.child(1).firstChild.lastChild.textContent, "Вложенный");
    if (type === "orderedList") assert.equal(state.doc.lastChild.attrs.start, 7);
    assert(undo(state, transaction => { state = state.apply(transaction); }));
    assert.deepEqual(state.doc.toJSON(), doc.toJSON());
  }
});


test("Notion toggle input preserves marked title, line breaks, nested list content and numbering with reversible conversion", () => {
  const schema = getSchema(inlineEditorExtensions());
  const p = text => schema.nodes.paragraph.create(null, text ? schema.text(text) : null);
  const title = schema.nodes.paragraph.create(null, [schema.text(">"), schema.text("Заголовок", [schema.marks.bold.create()]), schema.nodes.hardBreak.create(), schema.text("вторая строка")]);
  for (const listType of [null, "bulletList", "orderedList", "taskList"]) {
    const itemType = listType === "taskList" ? "taskItem" : "listItem";
    const before = schema.nodes[itemType].create(null, p("Перед"));
    const nested = schema.nodes.bulletList.create(null, schema.nodes.listItem.create(null, p("Вложенный")));
    const current = schema.nodes[itemType].create(null, [title, nested]);
    const after = schema.nodes[itemType].create(null, p("После"));
    const doc = schema.nodes.doc.create(null, listType ? schema.nodes[listType].create(listType === "orderedList" ? { start: 5 } : null, [before, current, after]) : [p("Перед"), title, p("После")]);
    let state = EditorState.create({ schema, doc, plugins: [history()] });
    const from = listType ? 1 + before.nodeSize + 2 : p("Перед").nodeSize + 1;
    const tr = state.tr;
    assert(convertParagraphToToggle(tr, { from, to: from + 1 }));
    state = state.apply(tr);
    state.doc.check();
    assert.equal(state.doc.childCount, 3);
    const toggle = state.doc.child(1);
    assert.equal(toggle.type.name, "details");
    assert.equal(toggle.firstChild.textContent, "Заголовоквторая строка");
    assert.equal(toggle.firstChild.firstChild.marks[0].type.name, "bold");
    assert.equal(toggle.firstChild.child(1).type.name, "hardBreak");
    assert.equal(state.selection.$from.parent.type.name, "detailsSummary");
    if (listType) {
      assert.equal(toggle.lastChild.firstChild.textContent, "Вложенный");
      assert.deepEqual(state.doc.firstChild.firstChild.toJSON(), before.toJSON());
      assert.deepEqual(state.doc.lastChild.firstChild.toJSON(), after.toJSON());
      if (listType === "orderedList") assert.equal(state.doc.lastChild.attrs.start, 7);
    }
    assert(undo(state, transaction => { state = state.apply(transaction); }));
    assert.deepEqual(state.doc.toJSON(), doc.toJSON());
  }
});
