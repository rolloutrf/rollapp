import { wrapInList } from "@tiptap/pm/schema-list";
import assert from "node:assert/strict";
import test from "node:test";
import { getSchema } from "@tiptap/core";
import { AllSelection, EditorState, Selection, TextSelection } from "@tiptap/pm/state";
import { history, undo, redo } from "@tiptap/pm/history";
import { inlineEditorExtensions } from "./inline-editor-extensions.js";
import { BlockSelection, blockRange, isBlockSelection, prepareBlockComposition } from "./inline-block-selection.js";
import { blockToggleModifier, toggleBlockSelection, handleBlockKeyDown, projectedBlockSelection, InlineBlockSelection } from "./inline-block-selection-extension.js";
import { changeTextBlock, insertTextBlock, moveTextBlock, selectedBlockPosition } from "./inline-blocks.js";

const schema = getSchema(inlineEditorExtensions());
const p = text => schema.nodes.paragraph.create(null, text ? schema.text(text) : null);
function fixture(children) {
  let state = EditorState.create({ schema, doc: schema.nodes.doc.create(null, children), plugins: [history()] });
  return { schema, isEditable: true, get state() { return state; }, commands: { focus() {} }, view: { focus() {}, composing: false, get state() { return state; }, dispatch(tr) { state = state.apply(tr); } } };
}
const key = (editor, value, modifiers = {}) => handleBlockKeyDown(editor, { key: value, ...modifiers });
const names = editor => Array.from({ length: editor.state.doc.childCount }, (_, i) => editor.state.doc.child(i).textContent);

test("browser text-boundary normalization retains exact sparse blocks, their gaps and direction", () => {
  const editor = fixture([p("First"), p("Gap"), p("Last")]);
  const doc = editor.state.doc, last = doc.firstChild.nodeSize + doc.child(1).nodeSize;
  for (const reverse of [false, true]) {
    const selection = BlockSelection.fromPositions(doc, [0, last], reverse ? last : 0, reverse ? 0 : last);
    editor.view.dispatch(editor.state.tr.setSelection(selection));
    const anchor = Selection.findFrom(selection.$anchor, reverse ? -1 : 1, true).$head;
    const head = Selection.findFrom(selection.$head, reverse ? 1 : -1, true).$head;
    assert.equal(projectedBlockSelection(editor.view, anchor, head), selection);
    assert.equal(projectedBlockSelection(editor.view, selection.$anchor, selection.$head), selection);
    assert.equal(projectedBlockSelection(editor.view, anchor, doc.resolve(head.pos + (reverse ? 1 : -1))), null, "An actual partial text range remains native");
    assert.equal(projectedBlockSelection(editor.view, anchor, anchor), null);
    assert.deepEqual(editor.state.selection.positions, [0, last]);
  }
});

test("an empty block projection is retained until native pointer intent, and explicit block commands reset that intent", () => {
  const doc = schema.nodes.doc.create(null, [p(""), p("Next")]);
  let state;
  const view = { composing: false, posAtCoords: () => ({ pos: 1 }), dom: { ownerDocument: { defaultView: { navigator: { platform: "MacIntel" } } } }, dispatch(tr) { state = state.apply(tr); } };
  const editor = { isEditable: true, get state() { return state; }, view };
  const plugin = InlineBlockSelection.config.addProseMirrorPlugins.call({ editor })[0];
  state = EditorState.create({ doc, plugins: [plugin], selection: BlockSelection.create(doc, 0) });
  Object.defineProperty(view, "state", { get: () => state });
  const cursor = doc.resolve(1);
  assert.equal(plugin.props.createSelectionBetween(view, cursor, cursor), state.selection);
  assert.equal(plugin.props.handleDOMEvents.mousedown(view, { button: 0 }), false);
  assert(state.selection instanceof TextSelection, "Explicit pointer intent must synchronously clear the logical group even at an unchanged projected cursor");
  assert.equal(plugin.props.createSelectionBetween(view, cursor, cursor), null, "Clicking the empty block must allow a native caret");
  view.dispatch(state.tr.setSelection(TextSelection.create(doc, 1)));
  assert(plugin.props.handleKeyDown(view, { key: "Escape" }));
  assert.equal(plugin.props.createSelectionBetween(view, cursor, cursor), state.selection);
  plugin.props.handleDOMEvents.pointerdown(view, { pointerType: "touch" });
  assert.equal(plugin.props.createSelectionBetween(view, cursor, cursor), null);
  view.dispatch(state.tr.setSelection(BlockSelection.create(doc, 0)));
  assert.equal(plugin.props.createSelectionBetween(view, cursor, cursor), state.selection);
});

test("Escape, directional expansion and Enter select blocks without changing the document", () => {
  const editor = fixture([p("Один"), p("Два"), p("Три")]);
  const original = editor.state.doc.toJSON();
  editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, 7)));
  assert(key(editor, "Escape"));
  assert(isBlockSelection(editor.state.selection));
  assert.equal(editor.state.selection.content().content.textBetween(0, editor.state.selection.content().content.size), "Два");
  assert(key(editor, "ArrowDown", { shiftKey: true }));
  assert.equal(blockRange(editor.state.doc, editor.state.selection.anchorBlock, editor.state.selection.headBlock).count, 2);
  assert(key(editor, "ArrowUp", { shiftKey: true }));
  assert.equal(editor.state.selection.anchorBlock, editor.state.selection.headBlock);
  assert(key(editor, "ArrowUp", { shiftKey: true }));
  assert(editor.state.selection.anchor > editor.state.selection.head);
  assert(key(editor, "Enter"));
  assert(editor.state.selection instanceof TextSelection);
  assert.equal(editor.state.selection.$from.parent.textContent, "Один");
  assert.deepEqual(editor.state.doc.toJSON(), original);
  assert.equal(undo(editor.state, editor.view.dispatch), false);
});

test("select all progresses from the current paragraph to the document", () => {
  const editor = fixture([p("Один"), p("Два")]);
  editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, 2)));
  assert(key(editor, "a", { metaKey: true }));
  assert.equal(editor.state.doc.textBetween(editor.state.selection.from, editor.state.selection.to), "Один");
  assert(key(editor, "a", { ctrlKey: true }));
  assert(editor.state.selection instanceof AllSelection);
  assert(key(editor, "Escape"));
  assert.equal(editor.state.selection.from, 0);
  assert.equal(editor.state.selection.to, editor.state.doc.content.size);
  assert(key(editor, "Escape"));
  assert(editor.state.selection.empty);
  const empty = fixture([p(""), p("Сосед")]);
  assert(key(empty, "a", { metaKey: true }));
  assert(isBlockSelection(empty.state.selection));
  assert.equal(empty.state.selection.to, 2);
  assert(key(empty, "a", { metaKey: true }));
  assert.equal(empty.state.selection.to, empty.state.doc.content.size);
});

test("Escape excludes the next paragraph when a native range ends at its text start", () => {
  for (const reverse of [false, true]) {
    const editor = fixture([p("Первый"), p("Второй"), p("Третий")]);
    const end = editor.state.doc.firstChild.nodeSize + 1;
    editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, reverse ? end : 2, reverse ? 2 : end)));
    assert(key(editor, "Escape"));
    assert.equal(editor.state.selection.from, 0);
    assert.equal(editor.state.selection.to, editor.state.doc.firstChild.nodeSize, "Do not include a neighbour without selected text");
  }
  const first = p("Перед"), list = schema.nodes.bulletList.create(null, schema.nodes.listItem.create(null, p("Список")));
  const editor = fixture([first, list]);
  editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, 2, first.nodeSize + 3)));
  assert(key(editor, "Escape"));
  assert.equal(editor.state.selection.to, first.nodeSize, "An endpoint at the first nested item's start must exclude its list");
});

test("duplicating a whole-document selection duplicates its entire structure", () => {
  const editor = fixture([p("Первый"), p("Второй")]);
  editor.view.dispatch(editor.state.tr.setSelection(new AllSelection(editor.state.doc)));
  assert(key(editor, "d", { metaKey: true }));
  assert.deepEqual(names(editor), ["Первый", "Второй", "Первый", "Второй"]);
  assert(isBlockSelection(editor.state.selection));
  assert.equal(editor.state.selection.from, 16);
  assert(undo(editor.state, editor.view.dispatch));
  assert.deepEqual(names(editor), ["Первый", "Второй"]);
  assert(editor.state.selection instanceof AllSelection);
});

test("moving a backwards group retains direction, marks and its own Undo step", () => {
  const bold = schema.nodes.paragraph.create(null, schema.text("Два", [schema.marks.bold.create()]));
  const editor = fixture([p("Один"), bold, p("Три"), p("Четыре")]);
  const original = editor.state.doc.toJSON();
  const second = editor.state.doc.firstChild.nodeSize, third = second + bold.nodeSize;
  editor.view.dispatch(editor.state.tr.setSelection(BlockSelection.create(editor.state.doc, third, second)));
  assert.equal(selectedBlockPosition(editor.state.selection), second);
  assert(moveTextBlock(editor, second, -1));
  assert.deepEqual(names(editor), ["Два", "Три", "Один", "Четыре"]);
  assert.equal(editor.state.doc.firstChild.firstChild.marks[0].type.name, "bold");
  assert(editor.state.selection.anchor > editor.state.selection.head);
  assert(undo(editor.state, editor.view.dispatch));
  assert.deepEqual(editor.state.doc.toJSON(), original);
  assert(isBlockSelection(editor.state.selection));
  assert.equal(editor.state.selection.headBlock, second);
  assert(redo(editor.state, editor.view.dispatch));
  assert(moveTextBlock(editor, editor.state.selection.headBlock, 1));
  assert.deepEqual(editor.state.doc.toJSON(), original);
});

test("duplicate/delete a group preserve block bookmarks, including deleting the entire document", () => {
  const editor = fixture([p("Один"), p("Два")]);
  const original = editor.state.doc.toJSON();
  editor.view.dispatch(editor.state.tr.setSelection(BlockSelection.create(editor.state.doc, 0, editor.state.doc.firstChild.nodeSize)));
  assert(key(editor, "d", { metaKey: true }));
  assert.deepEqual(names(editor), ["Один", "Два", "Один", "Два"]);
  assert.equal(editor.state.selection.from, 11);
  assert(key(editor, "Delete"));
  assert.deepEqual(editor.state.doc.toJSON(), original);
  assert(undo(editor.state, editor.view.dispatch));
  assert(isBlockSelection(editor.state.selection));
  assert.equal(editor.state.selection.from, 11);
  assert(undo(editor.state, editor.view.dispatch));
  assert.equal(editor.state.selection.from, 0);
  assert(key(editor, "Backspace"));
  editor.state.doc.check();
  assert.deepEqual(names(editor), [""]);
  assert(undo(editor.state, editor.view.dispatch));
  assert.deepEqual(editor.state.doc.toJSON(), original);
  assert(isBlockSelection(editor.state.selection));
});

test("a list-item group moves/duplicates with checked state and nested children", () => {
  const item = (text, checked = false, nested = null) => schema.nodes.taskItem.create({ checked }, [p(text), ...(nested ? [nested] : [])]);
  const nested = schema.nodes.taskList.create(null, item("Внутри"));
  const first = item("Один", true, nested), second = item("Два"), third = item("Три");
  const editor = fixture([schema.nodes.taskList.create(null, [first, second, third])]);
  const secondPos = 1 + first.nodeSize, thirdPos = secondPos + second.nodeSize;
  editor.view.dispatch(editor.state.tr.setSelection(BlockSelection.create(editor.state.doc, secondPos, thirdPos)));
  assert(moveTextBlock(editor, secondPos, -1));
  editor.state.doc.check();
  assert.equal(editor.state.doc.firstChild.lastChild.attrs.checked, true);
  assert.equal(editor.state.doc.firstChild.lastChild.lastChild.textContent, "Внутри");
  assert(changeTextBlock(editor, editor.state.selection.headBlock, "duplicate"));
  assert.equal(editor.state.doc.firstChild.childCount, 5);
  assert(undo(editor.state, editor.view.dispatch));
  assert(undo(editor.state, editor.view.dispatch));
  assert.equal(editor.state.doc.firstChild.firstChild.attrs.checked, true);
});

test("range normalization lifts a nested endpoint and ignores structural table cells", () => {
  const list = schema.nodes.bulletList.create(null, schema.nodes.listItem.create(null, p("Список")));
  const editor = fixture([p("Перед"), list, p("После")]);
  const listPos = editor.state.doc.firstChild.nodeSize;
  const range = blockRange(editor.state.doc, 0, listPos + 1);
  assert.equal(range.count, 2);
  assert.equal(range.headBlock, listPos);
  assert.equal(blockRange(editor.state.doc, -1), null);
  assert.equal(blockRange(editor.state.doc, editor.state.doc.content.size), null);
});

test("Tab and Shift+Tab nest a selected list group with reversible structure", () => {
  for (const [listName, itemName] of [["bulletList", "listItem"], ["taskList", "taskItem"]]) {
    const item = text => schema.nodes[itemName].createAndFill(null, p(text));
    const first = item("Первый"), second = item("Второй"), third = item("Третий");
    const editor = fixture([schema.nodes[listName].create(null, [first, second, third])]);
    const original = editor.state.doc.toJSON();
    editor.view.dispatch(editor.state.tr.setSelection(BlockSelection.create(editor.state.doc, 1 + first.nodeSize, 1 + first.nodeSize + second.nodeSize)));
    assert(key(editor, "Tab"));
    editor.state.doc.check();
    assert.equal(editor.state.doc.firstChild.childCount, 1);
    assert.equal(editor.state.doc.firstChild.firstChild.lastChild.childCount, 2);
    assert(isBlockSelection(editor.state.selection), "Nesting must retain the selected group");
    assert(key(editor, "Tab", { shiftKey: true }));
    assert.deepEqual(editor.state.doc.toJSON(), original);
    assert(isBlockSelection(editor.state.selection));
    assert(undo(editor.state, editor.view.dispatch));
    assert.equal(editor.state.doc.firstChild.childCount, 1);
    assert(undo(editor.state, editor.view.dispatch));
    assert.deepEqual(editor.state.doc.toJSON(), original);
  }
});

test("group JSON/bookmark mapping survives changes before the selection", () => {
  const editor = fixture([p("Один"), p("Два"), p("Три")]);
  const second = editor.state.doc.firstChild.nodeSize;
  const selection = BlockSelection.create(editor.state.doc, second, second + editor.state.doc.child(1).nodeSize);
  assert(selection.eq(Selection.fromJSON(editor.state.doc, selection.toJSON())));
  editor.view.dispatch(editor.state.tr.setSelection(selection).insertText("!", 1));
  assert.equal(editor.state.selection.anchorBlock, second + 1);
  assert(isBlockSelection(editor.state.selection));
});

test("insertion relative to a group happens outside the full selection", () => {
  for (const side of ["before", "after"]) {
    const editor = fixture([p("Один"), p("Два"), p("Три")]);
    editor.view.dispatch(editor.state.tr.setSelection(BlockSelection.create(editor.state.doc, 0, editor.state.doc.firstChild.nodeSize)));
    assert(insertTextBlock(editor, editor.state.selection.headBlock, side, "paragraph"));
    assert.deepEqual(names(editor), side === "before" ? ["", "Один", "Два", "Три"] : ["Один", "Два", "", "Три"]);
  }
});

test("moving an individual text block keeps the caret offset and stored marks", () => {
  const editor = fixture([p("Один"), p("Два")]);
  editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, 3)));
  editor.view.dispatch(editor.state.tr.setStoredMarks([schema.marks.bold.create()]));
  assert(moveTextBlock(editor, 0, 1));
  assert.equal(editor.state.selection.from, 8);
  assert.equal(editor.state.selection.$from.parent.textContent, "Один");
  assert.equal(editor.state.storedMarks[0].type.name, "bold");
});

test("block shortcuts do not mutate read-only documents or interrupt composition", () => {
  const editor = fixture([p("Текст")]);
  const original = editor.state.doc.toJSON();
  editor.isEditable = false;
  assert.equal(key(editor, "d", { metaKey: true }), false);
  assert.equal(key(editor, "Escape"), false);
  editor.isEditable = true;
  assert.equal(key(editor, "Escape", { isComposing: true }), false);
  editor.view.composing = true;
  assert.equal(key(editor, "d", { ctrlKey: true }), false);
  assert.deepEqual(editor.state.doc.toJSON(), original);
});

test("sparse selection normalizes parent/child overlap, copies only selected blocks and serializes exact positions", () => {
  const editor = fixture([p("Один"), p("Пропуск"), p("Три"), p("Конец")]);
  const third = editor.state.doc.child(0).nodeSize + editor.state.doc.child(1).nodeSize;
  const selection = BlockSelection.fromPositions(editor.state.doc, [third, 0, third], third, 0);
  assert(selection.disjoint);assert.equal(selection.ranges.length, 2);
  assert.deepEqual(selection.positions, [0, third]);assert(selection.anchor > selection.head);
  assert.equal(selection.content().content.textBetween(0, selection.content().size, "|"), "Один|Три");
  assert(selection.eq(Selection.fromJSON(editor.state.doc, selection.toJSON())));
  const list = schema.nodes.bulletList.create(null, schema.nodes.listItem.create(null, p("Дочерний")));
  const nested = fixture([list, p("Конец")]);
  assert.deepEqual(BlockSelection.fromPositions(nested.state.doc, [0,1,2]).positions, [0]);
});

test("sparse replacement deletes no intervening blocks and Undo restores the exact selected set", () => {
  const editor = fixture([p("Один"), p("Пропуск"), p("Три"), p("Конец")]);
  const third = editor.state.doc.child(0).nodeSize + editor.state.doc.child(1).nodeSize;
  const selection = BlockSelection.fromPositions(editor.state.doc, [0, third]);
  editor.view.dispatch(editor.state.tr.setSelection(selection));
  editor.view.dispatch(editor.state.tr.replaceSelectionWith(schema.text("З")));
  editor.view.dispatch(editor.state.tr.insertText("амена"));
  assert.deepEqual(names(editor), ["Замена", "Пропуск", "Конец"]);
  assert(undo(editor.state, editor.view.dispatch));assert(editor.state.selection.eq(selection));
  assert.deepEqual(names(editor), ["Один", "Пропуск", "Три", "Конец"]);
});

test("sparse move, duplicate and deletion preserve gaps, source order and independent history", () => {
  const editor = fixture([p("Один"), p("Пропуск"), p("Три"), p("Конец")]);
  const third = editor.state.doc.child(0).nodeSize + editor.state.doc.child(1).nodeSize;
  const selection = BlockSelection.fromPositions(editor.state.doc, [0, third]);
  editor.view.dispatch(editor.state.tr.setSelection(selection));
  assert(moveTextBlock(editor, third, -1));assert.deepEqual(names(editor), ["Один", "Три", "Пропуск", "Конец"]);
  assert(undo(editor.state, editor.view.dispatch));assert(editor.state.selection.eq(selection));
  assert(changeTextBlock(editor, third, "duplicate"));assert.deepEqual(names(editor), ["Один", "Один", "Пропуск", "Три", "Три", "Конец"]);
  assert.deepEqual(editor.state.selection.positions.map(pos => editor.state.doc.nodeAt(pos).textContent), ["Один", "Три"]);
  assert(changeTextBlock(editor, editor.state.selection.headBlock, "delete"));assert.deepEqual(names(editor), ["Один", "Пропуск", "Три", "Конец"]);
  assert(undo(editor.state, editor.view.dispatch));assert(undo(editor.state, editor.view.dispatch));assert(editor.state.selection.eq(selection));
  assert(moveTextBlock(editor, third, 1));assert.deepEqual(names(editor), ["Пропуск", "Один", "Конец", "Три"]);
  assert(undo(editor.state, editor.view.dispatch));assert(editor.state.selection.eq(selection));
});

test("a sparse bookmark drops deleted entries instead of selecting their former neighbours", () => {
  const editor = fixture([p("Один"), p("Пропуск"), p("Три"), p("Конец")]);
  const third = editor.state.doc.child(0).nodeSize + editor.state.doc.child(1).nodeSize;
  editor.view.dispatch(editor.state.tr.setSelection(BlockSelection.fromPositions(editor.state.doc, [0, third])));
  editor.view.dispatch(editor.state.tr.delete(third, third + editor.state.doc.nodeAt(third).nodeSize));
  assert.deepEqual(editor.state.selection.positions, [0]);
  editor.view.dispatch(editor.state.tr.insertText("!", 1));assert.deepEqual(editor.state.selection.positions, [0]);
  assert.equal(editor.state.selection.content().content.textBetween(0, editor.state.selection.content().size), "!Один");
});


test("Notion block toggle modifiers distinguish Mac and Windows/Linux without hijacking link clicks", () => {
  assert(blockToggleModifier({metaKey:true,shiftKey:true},"MacIntel"));
  assert(blockToggleModifier({altKey:true,shiftKey:true},"Linux x86_64"));
  assert(!blockToggleModifier({metaKey:true},"MacIntel"));
  assert(!blockToggleModifier({ctrlKey:true,shiftKey:true},"Linux x86_64"));
  assert(!blockToggleModifier({altKey:true,shiftKey:true},"MacIntel"));
  const editor=fixture([p("Один"),p("Пропуск"),p("Три")]);
  const third=editor.state.doc.child(0).nodeSize+editor.state.doc.child(1).nodeSize;
  assert(toggleBlockSelection(editor,0));assert(toggleBlockSelection(editor,third));
  assert.deepEqual(editor.state.selection.positions,[0,third]);
  assert(toggleBlockSelection(editor,0));assert.deepEqual(editor.state.selection.positions,[third]);
  assert(toggleBlockSelection(editor,third));assert(editor.state.selection.empty);
  assert.equal(undo(editor.state,editor.view.dispatch),false);
  editor.isEditable=false;assert.equal(toggleBlockSelection(editor,0),false);
});

test("sparse list item actions keep the intervening checked item and every nested child", () => {
  const item=(name,checked=false,nested=null)=>schema.nodes.taskItem.create({checked},[p(name),...(nested?[nested]:[])]);
  const nested=schema.nodes.taskList.create(null,item("Внутри",true));
  const first=item("Один",false,nested),middle=item("Пропуск",true),last=item("Три");
  const editor=fixture([schema.nodes.taskList.create(null,[first,middle,last]),p("Конец")]);
  const third=1+first.nodeSize+middle.nodeSize;
  editor.view.dispatch(editor.state.tr.setSelection(BlockSelection.fromPositions(editor.state.doc,[1,third])));
  const original=editor.state.doc;
  assert(changeTextBlock(editor,third,"duplicate"));editor.state.doc.check();
  assert.equal(editor.state.doc.firstChild.childCount,5);
  assert(editor.state.doc.firstChild.child(1).eq(first));assert(editor.state.doc.firstChild.child(2).eq(middle));assert(editor.state.doc.firstChild.child(4).eq(last));
  assert(undo(editor.state,editor.view.dispatch));assert(editor.state.doc.eq(original));
  assert(changeTextBlock(editor,third,"delete"));assert.equal(editor.state.doc.firstChild.childCount,1);assert(editor.state.doc.firstChild.firstChild.eq(middle));
  assert(undo(editor.state,editor.view.dispatch));assert(editor.state.doc.eq(original));
  assert(moveTextBlock(editor,third,-1));assert(editor.state.doc.firstChild.child(2).eq(middle));assert(editor.state.doc.firstChild.firstChild.eq(first));
});


test("composition replaces sparse blocks in their own paragraph instead of merging into an untouched gap",()=>{
 const editor=fixture([p("Первый"),p("Пропуск"),p("Третий"),p("Конец")]);
 const doc=editor.state.doc,third=doc.child(0).nodeSize+doc.child(1).nodeSize;
 editor.view.dispatch(editor.state.tr.setSelection(BlockSelection.fromPositions(doc,[0,third])));
 editor.view.dispatch(prepareBlockComposition(editor.state.tr));assert.deepEqual(names(editor),["","Пропуск","Конец"]);
 assert.equal(editor.state.selection.$from.parent.textContent,"");editor.view.dispatch(editor.state.tr.insertText("漢"));assert.deepEqual(names(editor),["漢","Пропуск","Конец"]);
 assert(undo(editor.state,editor.view.dispatch));assert(editor.state.doc.eq(doc));assert.deepEqual(editor.state.selection.positions,[0,third]);
});


test("node attribute changes preserve sparse selection even when markup replaces opening tokens",()=>{
 const editor=fixture([p("Первый"),p("Пропуск"),p("Третий"),p("Конец")]);const doc=editor.state.doc,third=doc.child(0).nodeSize+doc.child(1).nodeSize;
 const selection=BlockSelection.fromPositions(doc,[0,third],third,0);editor.view.dispatch(editor.state.tr.setSelection(selection));
 editor.view.dispatch(editor.state.tr.setNodeMarkup(0,undefined,{blockColor:"red"}).setNodeMarkup(third,undefined,{blockColor:"red"}));
 assert(editor.state.selection.eq(selection));
 editor.view.dispatch(editor.state.tr.setNodeMarkup(0,undefined,{blockColor:"blue_background"}).setNodeMarkup(third,undefined,{blockColor:"blue_background"}));
 assert(editor.state.selection.eq(selection));assert(editor.state.doc.child(1).eq(doc.child(1)));assert(editor.state.doc.lastChild.eq(doc.lastChild));
});


test("wrapping a selected paragraph group retains list-item units, direction and nested contents",()=>{
 const editor=fixture([p("Первый"),p("Второй"),p("Третий"),p("Сосед")]);const doc=editor.state.doc,third=doc.child(0).nodeSize+doc.child(1).nodeSize;
 editor.view.dispatch(editor.state.tr.setSelection(BlockSelection.create(doc,third,0)));
 assert(wrapInList(schema.nodes.bulletList)(editor.state,editor.view.dispatch));
 assert(isBlockSelection(editor.state.selection));assert.equal(editor.state.selection.ranges.length,1);assert(editor.state.selection.anchor>editor.state.selection.head);
 assert.deepEqual(editor.state.selection.positions.map(pos=>editor.state.doc.nodeAt(pos).type.name),["listItem","listItem","listItem"]);
 assert.deepEqual(editor.state.selection.positions.map(pos=>editor.state.doc.nodeAt(pos).textContent),["Первый","Второй","Третий"]);
 assert(editor.state.doc.lastChild.eq(doc.lastChild));
});


test("a converted multi-paragraph quote retains each selected unit while an explicit nested quote parent keeps its children",()=>{
 const quote=schema.nodes.blockquote.create(null,[p("A"),p("B"),p("C")]),doc=schema.nodes.doc.create(null,[quote,p("Tail")]),selection=BlockSelection.create(doc,1,7);assert.deepEqual(selection.positions,[1,4,7]);assert.deepEqual(selection.positions.map(pos=>doc.nodeAt(pos).textContent),["A","B","C"]);
 const single=schema.nodes.doc.create(null,schema.nodes.blockquote.create(null,p("A")));assert.deepEqual(BlockSelection.create(single,1).positions,[0]);
 const parent=schema.nodes.doc.create(null,schema.nodes.nestedBlock.create(null,[quote,p("Child")]));const group=BlockSelection.create(parent,2);assert.deepEqual(group.positions,[0]);assert.equal(group.content().content.firstChild.textContent,"ABCChild");
});
