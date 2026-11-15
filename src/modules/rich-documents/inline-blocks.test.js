import assert from "node:assert/strict";
import test from "node:test";
import { getSchema } from "@tiptap/core";
import { EditorState, TextSelection } from "@tiptap/pm/state";
import { history, undo, redo } from "@tiptap/pm/history";
import { inlineEditorExtensions } from "./inline-editor-extensions.js";
import { createBlockNode } from "./inline-block-types.js";
import { blockAt, changeTextBlock, insertTextBlock, moveTextBlock, selectedBlockPosition } from "./inline-blocks.js";

const schema = getSchema(inlineEditorExtensions());
const text = value => schema.text(value);
const paragraph = value => schema.nodes.paragraph.create(null, value ? text(value) : null);
function fixture(children) {
  let state = EditorState.create({ schema, doc: schema.nodes.doc.create(null, children), plugins: [history()] });
  const editor = { schema, get state() { return state; }, commands: { focus() {} }, view: { focus() {}, dispatch(tr) { state = state.apply(tr); } } };
  return editor;
}

test("block moves preserve structure/marks and undo as one operation", () => {
  const heading = schema.nodes.heading.create({ level: 2 }, text("Заголовок"));
  const marked = schema.nodes.paragraph.create(null, schema.text("Жирный", [schema.marks.bold.create()]));
  const editor = fixture([heading, marked, paragraph("Хвост")]);
  const original = editor.state.doc.toJSON();
  assert(moveTextBlock(editor, heading.nodeSize, -1));
  assert.equal(editor.state.doc.firstChild.firstChild.marks[0].type.name, "bold");
  assert(undo(editor.state, editor.view.dispatch));
  assert.deepEqual(editor.state.doc.toJSON(), original);
  assert(redo(editor.state, editor.view.dispatch));
  assert.equal(editor.state.doc.firstChild.textContent, "Жирный");
  assert(moveTextBlock(editor, 0, 1));
  assert.deepEqual(editor.state.doc.toJSON(), original);
  assert(moveTextBlock(editor, heading.nodeSize, -1));
  editor.view.dispatch(editor.state.tr.insertText("!", 1));
  assert(undo(editor.state, editor.view.dispatch));
  assert.equal(editor.state.doc.firstChild.textContent, "Жирный", "Typing after a move must be a separate undo step");
  assert(undo(editor.state, editor.view.dispatch));
  assert.deepEqual(editor.state.doc.toJSON(), original);
  assert.equal(moveTextBlock(editor, 0, -1), false);
  assert.equal(moveTextBlock(editor, editor.state.doc.content.size - editor.state.doc.lastChild.nodeSize, 1), false);
});

test("moving a list item retains its nested children and checked state", () => {
  const first = schema.nodes.taskItem.create({ checked: true }, [paragraph("Первый"), schema.nodes.bulletList.create(null, schema.nodes.listItem.create(null, paragraph("Вложенный")))]);
  const second = schema.nodes.taskItem.create({ checked: false }, paragraph("Второй"));
  const editor = fixture([schema.nodes.taskList.create(null, [first, second])]);
  const position = 1 + first.nodeSize;
  const selection = TextSelection.create(editor.state.doc, position + 2);
  assert.equal(selectedBlockPosition(selection), position);
  assert(moveTextBlock(editor, position, -1));
  const list = editor.state.doc.firstChild;
  assert.equal(list.firstChild.textContent, "Второй");
  assert.equal(list.lastChild.attrs.checked, true);
  assert.equal(list.lastChild.lastChild.textContent, "Вложенный");
  assert.equal(list.childCount, 2);
});

test("insertion, duplication, deleting the last block remain valid and reversible", () => {
  const editor = fixture([paragraph("Текст")]);
  assert(changeTextBlock(editor, 0, "duplicate"));
  assert.equal(editor.state.doc.childCount, 2);
  assert(changeTextBlock(editor, 0, "before"));
  assert.equal(editor.state.doc.childCount, 3);
  assert.equal(editor.state.doc.firstChild.textContent, "");
  assert(changeTextBlock(editor, 0, "delete"));
  assert.equal(editor.state.doc.childCount, 2);
  assert(changeTextBlock(editor, 0, "delete"));
  assert(changeTextBlock(editor, 0, "delete"));
  assert.equal(editor.state.doc.childCount, 1);
  assert.equal(editor.state.doc.firstChild.textContent, "");
  assert(undo(editor.state, editor.view.dispatch));
  assert.equal(editor.state.doc.firstChild.textContent, "Текст");
  assert.equal(blockAt(editor.state.doc, -1), null);
});

test("typed insertion preserves neighbours, schema and separate undo steps", () => {
  for (const type of ["paragraph", "heading1", "heading2", "heading3", "heading4", "bulletList", "orderedList", "taskList", "details", "blockquote", "codeBlock", "table"]) {
    for (const side of ["before", "after"]) {
      const editor = fixture([paragraph("Соседний текст")]);
      const original = editor.state.doc.toJSON();
      assert(insertTextBlock(editor, 0, side, type));
      editor.state.doc.check();
      const inserted = editor.state.doc.child(side === "before" ? 0 : 1);
      assert.equal(inserted.type.name, type.startsWith("heading") ? "heading" : type);
      assert.equal(editor.state.selection.$from.parent.isTextblock, true, `${type} must accept immediate typing`);
      assert.equal(editor.state.doc.child(side === "before" ? 1 : 0).textContent, "Соседний текст");
      assert(undo(editor.state, editor.view.dispatch));
      assert.deepEqual(editor.state.doc.toJSON(), original);
    }
  }
});

test("inserting inside a list uses valid siblings or its nearest accepting parent", () => {
  const first = schema.nodes.taskItem.create({ checked: true }, paragraph("Сделано"));
  const editor = fixture([schema.nodes.taskList.create(null, first)]);
  assert(insertTextBlock(editor, 1, "after", "paragraph"));
  assert.equal(editor.state.doc.firstChild.childCount, 2);
  assert.equal(editor.state.doc.firstChild.lastChild.attrs.checked, false);
  assert(insertTextBlock(editor, 1, "before", "heading4"));
  editor.state.doc.check();
  assert.equal(editor.state.doc.firstChild.type.name, "heading");
  assert.equal(editor.state.doc.lastChild.firstChild.attrs.checked, true);
});

test("a toggle selected by its title moves with its body and undoes intact", () => {
  const first = paragraph("Перед блоком");
  const toggle = createBlockNode(schema, "details");
  const editor = fixture([first, toggle, paragraph("После блока")]);
  const original = editor.state.doc.toJSON();
  assert.equal(selectedBlockPosition(TextSelection.create(editor.state.doc, first.nodeSize + 2)), first.nodeSize);
  assert(moveTextBlock(editor, first.nodeSize, -1));
  editor.state.doc.check();
  assert.deepEqual(editor.state.doc.firstChild.toJSON(), toggle.toJSON());
  assert(undo(editor.state, editor.view.dispatch));
  assert.deepEqual(editor.state.doc.toJSON(), original);
});


test("divider insertion gives immediate typing its own paragraph without altering either neighbour", () => {
  for (const side of ["before", "after"]) {
    const editor = fixture([paragraph("Сосед")]);
    const original = editor.state.doc.toJSON();
    assert(insertTextBlock(editor, 0, side, "horizontalRule"));
    editor.state.doc.check();
    assert.equal(editor.state.doc.childCount, 3);
    assert.equal(editor.state.doc.child(side === "before" ? 0 : 1).type.name, "horizontalRule");
    editor.view.dispatch(editor.state.tr.insertText("Новая мысль"));
    assert.equal(editor.state.doc.child(side === "before" ? 2 : 0).textContent, "Сосед");
    assert(undo(editor.state, editor.view.dispatch));
    assert(undo(editor.state, editor.view.dispatch));
    assert.deepEqual(editor.state.doc.toJSON(), original);
  }
});


test("structural insertion at the end of a whole-document selection appends after its last block", () => {
  const editor = fixture([paragraph("До"), paragraph("После")]);
  const position = selectedBlockPosition({ $from: editor.state.doc.resolve(editor.state.doc.content.size) });
  assert.equal(position, paragraph("До").nodeSize);
  assert(insertTextBlock(editor, position, "after", "table"));
  editor.state.doc.check();
  assert.deepEqual([editor.state.doc.child(0).textContent, editor.state.doc.child(1).textContent], ["До", "После"]);
  assert.equal(editor.state.doc.lastChild.type.name, "table");
});
