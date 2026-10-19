import { blockRelocationTransaction } from "./inline-block-move.js";
import assert from "node:assert/strict";
import test from "node:test";
import { getSchema } from "@tiptap/core";
import { EditorState, TextSelection, NodeSelection } from "@tiptap/pm/state";
import { closeHistory, history, undo } from "@tiptap/pm/history";
import { CellSelection } from "@tiptap/pm/tables";
import { MarkdownManager } from "@tiptap/markdown";
import { Marked } from "marked";
import { inlineEditorExtensions } from "./inline-editor-extensions.js";
import { BlockSelection } from "./inline-block-selection.js";
import { canMoveTextBlock, moveTextBlock, selectedBlockPosition, selectedBlockRange } from "./inline-blocks.js";
import { createFourQuestionAdapter, validQuestionDocument } from "./four-question-document.js";
import { IDENTITY_QUESTION_TITLES } from "../../shared/identity-questions.js";

function fixture(make, four = false) {
  const adapter = four ? createFourQuestionAdapter() : null;
  const extensions = adapter ? [...inlineEditorExtensions(undefined, adapter.documentExtension), ...adapter.extensions] : inlineEditorExtensions();
  const schema = getSchema(extensions);
  const p = (text, marks = [], attrs = null) => schema.nodes.paragraph.create(attrs, text ? schema.text(text, marks) : null);
  const item = (kind, text, children = [], attrs = null) => schema.nodes[kind === "taskList" ? "taskItem" : "listItem"].create(attrs, [p(text, [schema.marks.bold.create()]), ...children]);
  const list = (kind, children, attrs = null) => schema.nodes[kind].create(attrs, children);
  const content = make({ schema, p, item, list });
  if (adapter) adapter.parse({ questions: IDENTITY_QUESTION_TITLES.map(title => ({ title, paragraphs: [] })) });
  const doc = schema.nodes.doc.create(null, four ? content.map((children, index) => schema.nodes.questionSection.create({ index }, children.length ? children : [p("")])) : content);
  let state = EditorState.create({ schema, doc, plugins: [history()] });
  const editor = { schema, isEditable: true, get state() { return state; }, commands: { focus() {} }, view: { dispatch(tr) { state = state.apply(tr); state.doc.check(); if (four) assert(validQuestionDocument(state.doc)); } } };
  const select = selection => editor.view.dispatch(editor.state.tr.setSelection(selection));
  const position = (text, type) => { let result; state.doc.descendants((node, pos) => { if (result == null && node.textContent === text && (!type || node.type.name === type)) result = pos; }); assert.notEqual(result, undefined, `missing ${type} ${text}`); return result; };
  const move = direction => moveTextBlock(editor, selectedBlockPosition(editor.state.selection), direction);
  const roundTrip = () => {
    if (adapter) assert(schema.nodeFromJSON(createFourQuestionAdapter().parse(adapter.serialize(state.doc))).eq(state.doc));
    else {
      const manager = new MarkdownManager({ extensions, marked: new Marked() });
      const source = manager.serialize(state.doc.toJSON());
      assert.deepEqual(schema.nodeFromJSON(manager.parse(source)).toJSON(), state.doc.toJSON(), source);
    }
  };
  return { editor, doc, schema, select, position, move, roundTrip };
}

test("list edge moves retain marker/attrs, rich children, native selections and one Undo", () => {
  for (const kind of ["bulletList", "orderedList", "taskList"]) for (const direction of [-1, 1]) for (const selection of ["caret", "node", "block"]) {
    const f = fixture(({ p, item, list }) => [p("Before"), list(kind, [item(kind, "First"), item(kind, "Middle"), item(kind, "Last", [list("taskList", [item("taskList", "Child", [], { checked: true })])], { checked: true })], { start: 7, blockColor: "blue" }), p("After")]);
    const label = direction < 0 ? "First" : "LastChild", source = f.position(label, kind === "taskList" ? "taskItem" : "listItem");
    const originalItem = f.editor.state.doc.nodeAt(source);
    f.select(selection === "caret" ? TextSelection.create(f.doc, source + 3) : selection === "node" ? NodeSelection.create(f.doc, source) : BlockSelection.create(f.doc, source));
    const before = f.editor.state.selection;
    if (selection === "caret") f.editor.view.dispatch(f.editor.state.tr.setStoredMarks([f.schema.marks.italic.create()]));
    assert(canMoveTextBlock(f.doc, source, f.editor.state.selection, direction));
    assert(f.move(direction));
    assert.deepEqual(f.editor.state.doc.content.content.map(node => node.type.name), direction < 0 ? [kind, "paragraph", kind, "paragraph"] : ["paragraph", kind, "paragraph", kind]);
    const moved = f.editor.state.doc.child(direction < 0 ? 0 : 3);
    assert(moved.firstChild.eq(originalItem));
    assert.equal(moved.attrs.blockColor, "blue");
    if (kind === "orderedList") {
      assert.equal(moved.attrs.start, direction < 0 ? 7 : 9);
      assert.equal(f.editor.state.doc.child(direction < 0 ? 2 : 1).attrs.start, direction < 0 ? 8 : 7);
    }
    if (selection === "caret") { assert.equal(f.editor.state.selection.$from.parentOffset, 1); assert.deepEqual(f.editor.state.storedMarks, [f.schema.marks.italic.create()]); }
    else assert.equal(f.editor.state.selection.toJSON().type, selection === "node" ? "node" : "rollappBlocks");
    f.roundTrip();
    assert(undo(f.editor.state, f.editor.view.dispatch));
    assert(f.editor.state.doc.eq(f.doc)); assert(f.editor.state.selection.eq(before));
  }
});

test("ordinary text moves past one logical list item and keeps original ordered segments", () => {
  for (const direction of [-1, 1]) {
    const f = fixture(({ p, item, list }) => direction > 0 ? [p("Text"), list("orderedList", [item("orderedList", "A"), item("orderedList", "B")], { start: 7 })] : [list("orderedList", [item("orderedList", "A"), item("orderedList", "B")], { start: 7 }), p("Text")]);
    f.select(BlockSelection.create(f.doc, f.position("Text", "paragraph")));
    assert(f.move(direction));
    assert.deepEqual(f.editor.state.doc.content.content.map(node => node.textContent), ["A", "Text", "B"]);
    assert.equal(f.editor.state.doc.firstChild.attrs.start, 7); assert.equal(f.editor.state.doc.lastChild.attrs.start, 8);
    f.roundTrip(); assert(undo(f.editor.state, f.editor.view.dispatch)); assert(f.editor.state.doc.eq(f.doc));
  }
});

test("a boundary item crosses one item of a different list without inheriting its marker or colour", () => {
  const f = fixture(({ item, list }) => [list("orderedList", [item("orderedList", "A"), item("orderedList", "B")], { start: 7, blockColor: "red" }), list("bulletList", [item("bulletList", "C"), item("bulletList", "D")], { blockColor: "green" })]);
  f.select(BlockSelection.create(f.doc, f.position("B", "listItem"))); assert(f.move(1));
  assert.deepEqual(f.editor.state.doc.content.content.map(node => [node.type.name, node.textContent, node.attrs.blockColor]), [["orderedList", "A", "red"], ["bulletList", "C", "green"], ["orderedList", "B", "red"], ["bulletList", "D", "green"]]);
  assert.equal(f.editor.state.doc.child(2).attrs.start, 8); f.roundTrip();
  assert(undo(f.editor.state, f.editor.view.dispatch)); assert(f.editor.state.doc.eq(f.doc));
});

test("sparse list items cross fixed answers independently with direction, children and exact reload", () => {
  for (const reverse of [false, true]) {
    const f = fixture(({ p, item, list }) => [[list("orderedList", [item("orderedList", "A"), item("orderedList", "B")], { start: 7 })], [p("Gap")], [list("taskList", [item("taskList", "C"), item("taskList", "D", [], { checked: true })])], [p("Tail")]], true);
    const positions = [f.position("B", "listItem"), f.position("D", "taskItem")];
    const selection = BlockSelection.fromPositions(f.doc, positions, positions[reverse ? 1 : 0], positions[reverse ? 0 : 1]);
    f.select(selection); assert(f.move(1));
    assert.deepEqual(f.editor.state.doc.content.content.map(section => section.content.content.map(node => node.textContent)), [["A"], ["B", "Gap"], ["C"], ["D", "Tail"]]);
    assert.deepEqual(f.editor.state.selection.positions.map(pos => f.editor.state.doc.nodeAt(pos).textContent), ["B", "D"]);
    assert.equal(f.editor.state.selection.anchorBlock > f.editor.state.selection.headBlock, reverse);
    assert.equal(f.editor.state.doc.child(1).firstChild.attrs.start, 8);
    assert.equal(f.editor.state.doc.child(3).firstChild.firstChild.attrs.checked, true);
    f.roundTrip(); assert(undo(f.editor.state, f.editor.view.dispatch)); assert(f.editor.state.doc.eq(f.doc)); assert(f.editor.state.selection.eq(selection));
  }
});

test("nested own text and selected descendants are movement barriers without partial list splitting", () => {
  const f = fixture(({ schema, p, item, list }) => [schema.nodes.nestedBlock.create(null, [p("Parent"), list("bulletList", [item("bulletList", "A"), item("bulletList", "B")])]), p("After")]);
  const a = f.position("A", "listItem"), after = f.position("After", "paragraph");
  f.select(BlockSelection.fromPositions(f.doc, [a, after])); assert.equal(f.move(-1), false); assert(f.editor.state.doc.eq(f.doc));
  f.select(BlockSelection.create(f.doc, f.position("B", "listItem"))); assert.equal(f.move(1), false); assert(f.editor.state.doc.eq(f.doc));
  f.editor.isEditable = false; assert.equal(f.move(-1), false); assert(f.editor.state.doc.eq(f.doc));
});

test("mixed native list/text groups keep order while whole-list and table selections remain whole", () => {
  const f = fixture(({ p, item, list }) => [list("bulletList", [item("bulletList", "A"), item("bulletList", "B")]), p("Text"), p("Tail")]);
  const positions = [f.position("A", "listItem"), f.position("Text", "paragraph")];
  f.select(BlockSelection.fromPositions(f.doc, positions)); assert(f.move(1));
  assert.deepEqual(f.editor.state.doc.content.content.map(node => node.textContent), ["BA", "Tail", "Text"]);
  assert.deepEqual(f.editor.state.doc.firstChild.content.content.map(node => node.textContent), ["B", "A"]);
  f.roundTrip(); assert(undo(f.editor.state, f.editor.view.dispatch)); assert(f.editor.state.doc.eq(f.doc));
  f.select(NodeSelection.create(f.editor.state.doc, 0)); assert(f.move(1));
  assert.deepEqual(f.editor.state.doc.content.content.map(node => node.textContent), ["Text", "AB", "Tail"]);
  assert(f.editor.state.doc.child(1).eq(f.doc.firstChild));
  const t = fixture(({ schema, p, item, list }) => [schema.nodes.table.create(null, [schema.nodes.tableRow.create(null, [schema.nodes.tableCell.create(null, p("Cell A")), schema.nodes.tableCell.create(null, p("Cell B"))])]), list("orderedList", [item("orderedList", "One"), item("orderedList", "Two")], { start: 5 })]);
  const cells = []; t.doc.descendants((node, pos) => { if (node.type.name === "tableCell") cells.push(pos); });
  t.select(new CellSelection(t.doc.resolve(cells[0]), t.doc.resolve(cells[1]))); assert(t.move(1));
  assert.deepEqual(t.editor.state.doc.content.content.map(node => node.type.name), ["orderedList", "table", "orderedList"]);
  assert.equal(t.editor.state.selection.toJSON().type, "cell"); assert.equal(t.editor.state.selection.$anchorCell.nodeAfter.textContent, "Cell A");
  t.roundTrip(); assert(undo(t.editor.state, t.editor.view.dispatch)); assert(t.editor.state.doc.eq(t.doc));
});


test("newly adjacent compatible marker runs join without rewriting untouched adjacent source lists", () => {
  const f = fixture(({ p, item, list }) => [list("bulletList", [item("bulletList", "A")]), p("Text"), list("bulletList", [item("bulletList", "B")])]);
  f.select(BlockSelection.create(f.doc, f.position("Text", "paragraph"))); assert(f.move(1));
  assert.deepEqual(f.editor.state.doc.content.content.map(node => node.textContent), ["AB", "Text"]);
  assert.deepEqual(f.editor.state.doc.firstChild.content.content.map(node => node.textContent), ["A", "B"]);
  f.roundTrip(); assert(undo(f.editor.state, f.editor.view.dispatch)); assert(f.editor.state.doc.eq(f.doc));
  const untouched = fixture(({ p, item, list }) => [list("bulletList", [item("bulletList", "A")]), list("bulletList", [item("bulletList", "B")]), p("C"), p("D")]);
  untouched.select(BlockSelection.create(untouched.doc, untouched.position("D", "paragraph"))); assert(untouched.move(-1));
  assert(untouched.editor.state.doc.child(0).eq(untouched.doc.child(0))); assert(untouched.editor.state.doc.child(1).eq(untouched.doc.child(1)));
  assert.equal(untouched.editor.state.doc.childCount, 4);
});


function drop(f, target, side) {
  const range = selectedBlockRange(f.editor.state.doc, f.editor.state.selection.headBlock, f.editor.state.selection);
  const tr = blockRelocationTransaction(f.editor.state, range, target, side);
  if (!tr) return false;
  f.editor.view.dispatch(closeHistory(tr));
  f.editor.view.dispatch(closeHistory(f.editor.state.tr));
  return true;
}

test("drag relocation uses source list metadata rather than HTML fitting and retains one block Undo", () => {
  for (const kind of ["bulletList", "orderedList", "taskList"]) for (const side of ["before", "after"]) {
    const f = fixture(({ p, item, list }) => [p("Before"), list(kind, [item(kind, "A"), item(kind, "B", [list("taskList", [item("taskList", "Child", [], { checked: true })])], { checked: true })], { start: 7, blockColor: "red" }), p("After")]);
    const source = f.position("BChild", kind === "taskList" ? "taskItem" : "listItem");
    const selection = BlockSelection.create(f.doc, source), item = f.doc.nodeAt(source);
    f.select(selection);
    assert(drop(f, f.position(side === "before" ? "Before" : "After", "paragraph"), side));
    const list = f.editor.state.doc.child(side === "before" ? 0 : 3);
    assert.equal(list.type.name, kind); assert.equal(list.attrs.blockColor, "red"); assert(list.firstChild.eq(item));
    if (kind === "orderedList") assert.equal(list.attrs.start, 8);
    assert.equal(f.editor.state.selection.toJSON().type, "rollappBlocks"); assert.equal(f.editor.state.selection.positions.length, 1);
    f.roundTrip(); assert(undo(f.editor.state, f.editor.view.dispatch)); assert(f.editor.state.doc.eq(f.doc)); assert(f.editor.state.selection.eq(selection));
  }
});

test("sparse drag retains occurrence order and markers across answers while replacing only blank inputs", () => {
  const f = fixture(({ p, item, list }) => [[list("orderedList", [item("orderedList", "Same"), item("orderedList", "Gap")], { start: 7 })], [p("Middle")], [list("taskList", [item("taskList", "Same", [], { checked: true })])], []], true);
  const positions = [f.position("Same", "listItem"), f.position("Same", "taskItem")];
  const selection = BlockSelection.fromPositions(f.doc, positions, positions[1], positions[0]); f.select(selection);
  let blank; f.doc.descendants((node, pos) => { if (node.type.name === "paragraph" && !node.textContent) blank = pos; });
  assert(drop(f, blank, "after"));
  assert.deepEqual(f.editor.state.doc.content.content.map(section => section.content.content.map(node => node.textContent)), [["Gap"], ["Middle"], [""], ["Same", "Same"]]);
  assert.deepEqual(f.editor.state.doc.child(3).content.content.map(node => node.type.name), ["orderedList", "taskList"]);
  assert.equal(f.editor.state.doc.child(0).firstChild.attrs.start, 8); assert.equal(f.editor.state.doc.child(3).firstChild.attrs.start, 7);
  assert.deepEqual(f.editor.state.selection.positions.map(pos => f.editor.state.doc.nodeAt(pos).type.name), ["listItem", "taskItem"]);
  assert(f.editor.state.selection.anchorBlock > f.editor.state.selection.headBlock);
  f.roundTrip(); assert(undo(f.editor.state, f.editor.view.dispatch)); assert(f.editor.state.doc.eq(f.doc)); assert(f.editor.state.selection.eq(selection));
});

test("drag rejects descendants/self/no-op and preserves required empty cell bodies when moving text out", () => {
  const f = fixture(({ schema, p }) => [schema.nodes.nestedBlock.create(null, [p("Parent"), p("Child")]), p("Tail")]);
  f.select(BlockSelection.create(f.doc, 0));
  assert.equal(drop(f, f.position("Child", "paragraph"), "after"), false); assert(f.editor.state.doc.eq(f.doc));
  assert.equal(drop(f, 0, "before"), false); assert(f.editor.state.doc.eq(f.doc));
  f.select(BlockSelection.create(f.editor.state.doc, f.position("Tail", "paragraph")));
  assert.equal(drop(f, 0, "after"), false); assert(f.editor.state.doc.eq(f.doc));
  const t = fixture(({ schema, p }) => [schema.nodes.table.create(null, [schema.nodes.tableRow.create(null, [schema.nodes.tableCell.create(null, p("Cell"))])]), p("Outside")]);
  t.select(BlockSelection.create(t.doc, t.position("Cell", "paragraph")));
  assert(drop(t, t.position("Outside", "paragraph"), "after"));
  assert.equal(t.editor.state.doc.firstChild.firstChild.firstChild.childCount, 1);
  assert.equal(t.editor.state.doc.firstChild.firstChild.firstChild.firstChild.type.name, "paragraph");
  assert.equal(t.editor.state.doc.firstChild.firstChild.firstChild.textContent, "");
  assert.equal(t.editor.state.doc.lastChild.textContent, "Cell");
  t.roundTrip(); assert(undo(t.editor.state, t.editor.view.dispatch)); assert(t.editor.state.doc.eq(t.doc));
});

test("relocation rejects combined canonical depth that would reload as literal HTML, preserving both source sections", () => {
  for (const four of [false, true]) {
    const f = fixture(({ schema, p }) => {
      const chain = (depth, text) => depth ? schema.nodes.nestedBlock.create(null, [p("Родитель"), chain(depth - 1, text)]) : p(text);
      return four ? [[chain(55, "Moving")], [chain(55, "Target")], [p("Third")], [p("Fourth")]] : [chain(55, "Moving"), chain(55, "Target"), p("After")];
    }, four);
    const source = four ? 1 : 0, target = f.position("Target", "paragraph");
    f.select(BlockSelection.create(f.doc, source)); f.roundTrip();
    const before = f.editor.state;
    for (const side of ["before", "after"]) assert.equal(blockRelocationTransaction(before, selectedBlockRange(before.doc, source, before.selection), target, side), null);
    assert.equal(f.editor.state, before); f.roundTrip();
  }
});

test("relocation below the canonical depth bound retains every parent, child and selection after reload", () => {
  const f = fixture(({ schema, p }) => {
    const chain = (depth, text) => depth ? schema.nodes.nestedBlock.create(null, [p("Родитель"), chain(depth - 1, text)]) : p(text);
    return [chain(40, "Moving"), chain(40, "Target"), p("After")];
  });
  f.select(BlockSelection.create(f.doc, 0)); const before = f.editor.state.doc;
  const tr = blockRelocationTransaction(f.editor.state, selectedBlockRange(before, 0, f.editor.state.selection), f.position("Target", "paragraph"), "after");
  assert(tr); f.editor.view.dispatch(tr); f.roundTrip();
  let parents = 0; f.editor.state.doc.descendants(node => { if (node.type.name === "nestedBlock") parents++; });
  assert.equal(parents, 80); assert.equal(f.editor.state.selection.positions.length, 1); assert(f.editor.state.doc.lastChild.eq(before.lastChild));
});
