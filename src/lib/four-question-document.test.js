import { handleBlockKeyDown } from "./inline-block-selection-extension.js";
import { BlockSelection, blockSelectionBetween, isBlockSelection } from "./inline-block-selection.js";
import assert from "node:assert/strict";
import test from "node:test";
import { getSchema, getTextBetween, getTextSerializersFromSchema } from "@tiptap/core";
import { CellSelection } from "@tiptap/pm/tables";
import { EditorState, TextSelection, AllSelection, Selection } from "@tiptap/pm/state";
import { history, undo } from "@tiptap/pm/history";
import { inlineEditorExtensions } from "./inline-editor-extensions.js";
import { createFourQuestionAdapter, copiedQuestionSlice, questionClipboardText, deleteQuestionRange, selectedQuestionScopes, questionScopes, validQuestionDocument } from "./four-question-document.js";
import { IDENTITY_QUESTION_TITLES } from "../../shared/identity-questions.js";

const original = () => ({ questions: ["Alpha one", "Beta two", "Gamma three", "Delta four"].map((text, index) => ({ title: IDENTITY_QUESTION_TITLES[index], paragraphs: [text] })) });
function setup(value = original()) {
  const adapter = createFourQuestionAdapter();
  const input = adapter.parse(value);
  const extensions = [...inlineEditorExtensions(undefined, adapter.documentExtension), ...adapter.extensions];
  const schema = getSchema(extensions);
  const doc = schema.nodeFromJSON(input);
  const plugin = adapter.extensions.at(-1).config.addProseMirrorPlugins.call({})[0];
  return { adapter, schema, doc, plugin };
}
const cursor = (doc, index, offset = 0) => questionScopes(doc)[index].from + 1 + offset;

function textPosition(doc,text){let result;doc.descendants((node,pos)=>{if(node.isText&&node.text===text)result=pos;});assert.notEqual(result,undefined);return result;}
const tableSource='| Header A | Header B |\n| --- | --- |\n| Alpha | Beta |';
function tableSetup(){const value=original();value.questions[0].paragraphs=[tableSource];value.questions[1].paragraphs=['Tail'];return setup(value);}
test('cross-answer clipboard from a deep cell has no synthetic leading separators in either direction',()=>{
 const {doc,schema}=tableSetup(),plainSchema=getSchema(inlineEditorExtensions());
 const flat=plainSchema.nodeFromJSON({type:'doc',content:[...doc.child(0).content.toJSON(),plainSchema.nodes.heading.create({level:3},plainSchema.text(IDENTITY_QUESTION_TITLES[1])).toJSON(),...doc.child(1).content.toJSON()]});
 const expected=getTextBetween(flat,{from:textPosition(flat,'Header A'),to:textPosition(flat,'Tail')+4},{textSerializers:getTextSerializersFromSchema(plainSchema)});
 for(const reverse of [false,true]){const from=textPosition(doc,'Header A'),to=textPosition(doc,'Tail')+4,state=EditorState.create({doc,selection:TextSelection.create(doc,reverse?to:from,reverse?from:to)}),slice=copiedQuestionSlice(state.selection.content(),state);assert.equal(questionClipboardText(slice,state),expected);assert(state.doc.eq(doc));}
});
test('clipboard of text inside one cell starts with the selected character',()=>{
 const {doc}=tableSetup(),from=textPosition(doc,'Header A')+2,state=EditorState.create({doc,selection:TextSelection.create(doc,from,from+6)});assert.equal(questionClipboardText(copiedQuestionSlice(state.selection.content(),state),state),'ader A');
});
test('cell clipboard text contains only selected cells in document order without structural padding',()=>{
 const {doc}=tableSetup();let first,last;doc.descendants((node,pos)=>{if(node.type.spec.tableRole==='header_cell'&&node.textContent==='Header A')first=pos;if(node.type.spec.tableRole==='cell'&&node.textContent==='Beta')last=pos;});
 for(const reverse of [false,true]){const selection=CellSelection.create(doc,reverse?last:first,reverse?first:last),state=EditorState.create({doc,selection});assert.equal(questionClipboardText(copiedQuestionSlice(selection.content(),state),state),'Header A\n\nHeader B\n\nAlpha\n\nBeta');}
});
test('sparse cross-answer block clipboard retains content order and excludes protected prompts',()=>{
 const {doc}=setup(),scopes=questionScopes(doc),selection=BlockSelection.fromPositions(doc,[scopes[0].from,scopes[2].from],scopes[2].from,scopes[0].from),state=EditorState.create({doc,selection});assert.equal(questionClipboardText(copiedQuestionSlice(selection.content(),state),state),'Alpha one\n\nGamma three');
});
test('clipboard boundary correction preserves literal leading newlines spaces and tabs in code',()=>{
 const value=original(),literal='\n\n \t**literal**\n ';value.questions[0].paragraphs=['```text\n'+literal+'\n```'];const {doc}=setup(value);let from;doc.descendants((node,pos)=>{if(node.type.name==='codeBlock')from=pos+1;});const state=EditorState.create({doc,selection:TextSelection.create(doc,from,from+literal.length)});assert.equal(questionClipboardText(copiedQuestionSlice(state.selection.content(),state),state),literal);
});

test("four answers have one schema and preserve untouched legacy source exactly", () => {
  const value = original();
  value.questions[1].paragraphs = ["  Отступы  ", "", "```txt\n\nкод\n\n```", "Последний абзац "];
  const { adapter, doc } = setup(value);
  assert(validQuestionDocument(doc));
  assert.deepEqual(adapter.serialize(doc), value);
  const state = EditorState.create({ doc, selection: TextSelection.create(doc, cursor(doc, 0, 3)) });
  const changed = state.tr.insertText("!").doc;
  assert.equal(adapter.serialize(changed).questions[0].paragraphs[0], "Alp!ha one");
  assert.deepEqual(adapter.serialize(changed).questions.slice(1), value.questions.slice(1));
});

test("a cross-answer deletion retains all prompts, untouched answers and each surviving tail", () => {
  const { adapter, doc } = setup();
  const state = EditorState.create({ doc, selection: TextSelection.create(doc, cursor(doc, 0, 3), cursor(doc, 2, 3)) });
  const tr = deleteQuestionRange(state);
  assert(validQuestionDocument(tr.doc));
  assert.deepEqual(adapter.serialize(tr.doc).questions.map(q => q.paragraphs), [["Alp"], [], ["ma three"], ["Delta four"]]);
});

test("cross-answer formatting and Undo share one history without touching prompts", () => {
  const { adapter, doc, schema, plugin } = setup();
  let state = EditorState.create({ doc, plugins: [history(), plugin], selection: TextSelection.create(doc, cursor(doc, 0, 3), cursor(doc, 1, 3)) });
  state = state.apply(state.tr.addMark(state.selection.from, state.selection.to, schema.marks.bold.create()));
  assert.deepEqual(adapter.serialize(state.doc).questions.map(q => q.paragraphs), [["Alp**ha one**"], ["**Bet**a two"], ["Gamma three"], ["Delta four"]]);
  assert(undo(state, tr => { state = state.apply(tr); }));
  assert(state.doc.eq(doc));
});

test("clearing all answers retains four editable empty bodies and reverses in one Undo", () => {
  const { adapter, doc, plugin } = setup();
  let state = EditorState.create({ doc, plugins: [history(), plugin], selection: new AllSelection(doc) });
  state = state.apply(deleteQuestionRange(state));
  assert.deepEqual(adapter.serialize(state.doc).questions.map(q => q.paragraphs), [[], [], [], []]);
  assert.equal(state.doc.childCount, 4);
  assert(undo(state, tr => { state = state.apply(tr); }));
  assert(state.doc.eq(doc));
});

test("copying across answers includes only the prompts inside the actual range", () => {
  const { doc } = setup();
  const state = EditorState.create({ doc, selection: TextSelection.create(doc, cursor(doc, 0, 3), cursor(doc, 1, 3)) });
  const slice = copiedQuestionSlice(state.selection.content(), state);
  assert.deepEqual(slice.content.content.map(node => node.type.name), ["paragraph", "heading", "paragraph"]);
  assert.deepEqual(slice.content.content.map(node => node.textContent), ["ha one", IDENTITY_QUESTION_TITLES[1], "Bet"]);
  assert.equal(slice.openStart, 1);
  assert.equal(slice.openEnd, 1);
});

test("protected document rejects accidental prompt deletion or reordering", () => {
  const { doc, plugin } = setup();
  const state = EditorState.create({ doc, plugins: [plugin], selection: TextSelection.create(doc, cursor(doc, 0, 3), cursor(doc, 1, 3)) });
  const rejected = state.applyTransaction(state.tr.deleteSelection());
  assert.equal(rejected.transactions.length, 0);
  assert(rejected.state.doc.eq(doc));
});

test("cancelled cross-answer composition restores the original text without publishing its temporary deletion", () => {
  const { doc, plugin } = setup();
  let state = EditorState.create({ doc, plugins: [history(), plugin], selection: TextSelection.create(doc, cursor(doc, 0, 3), cursor(doc, 1, 3)) });
  const transactions = [];
  const view = { editable: true, get state() { return state; }, dispatch(tr) { transactions.push(tr); state = state.apply(tr); } };
  plugin.props.handleDOMEvents.compositionstart(view, {});
  assert(!state.doc.eq(doc));
  plugin.props.handleDOMEvents.compositionend(view, { data: "" });
  assert(state.doc.eq(doc));
  assert(transactions.every(tr => tr.getMeta("preventUpdate")));
});

test("arrow keys collapse a whole-document selection into an editable answer without changing text", () => {
  const { doc, plugin } = setup();
  for (const key of ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"]) {
    let state = EditorState.create({ doc, plugins: [plugin], selection: new AllSelection(doc) });
    const view = { editable: true, get state() { return state; }, dispatch(tr) { assert(!tr.docChanged); state = state.apply(tr); } };
    assert(plugin.props.handleKeyDown(view, { key }));
    assert(state.selection instanceof TextSelection);
    assert(state.selection.empty);
    const expected = ["ArrowLeft", "ArrowUp"].includes(key) ? Selection.atStart(doc) : Selection.atEnd(doc);
    assert(state.selection.eq(expected));
    assert(state.doc.eq(doc));
  }
});


test("sparse blocks across answers preserve unselected answers and immutable prompts on copy/delete/Undo",()=>{
  const {doc,plugin,adapter}=setup();const scopes=questionScopes(doc);
  const selection=BlockSelection.fromPositions(doc,[scopes[0].from,scopes[2].from]);
  let state=EditorState.create({doc,plugins:[history(),plugin],selection});
  assert.deepEqual(selectedQuestionScopes(state).map(scope=>scope.node.attrs.index),[0,2]);
  const slice=copiedQuestionSlice(selection.content(),state);
  assert.deepEqual(slice.content.content.map(node=>node.textContent),["Alpha one","Gamma three"]);
  state=state.apply(deleteQuestionRange(state));assert(validQuestionDocument(state.doc));
  assert.deepEqual(adapter.serialize(state.doc).questions.map(q=>q.paragraphs),[[],["Beta two"],[],["Delta four"]]);
  assert(undo(state,tr=>{state=state.apply(tr);}));assert(state.doc.eq(doc));assert(state.selection.eq(selection));
});


test("native sparse replacement across answers keeps untouched tails separate and shares Undo with typing",()=>{
 const value=original();value.questions[0].paragraphs.push("Хвост");const {doc,plugin}=setup(value),scopes=questionScopes(doc);
 let state=EditorState.create({doc,plugins:[history(),plugin],selection:BlockSelection.fromPositions(doc,[scopes[0].from,scopes[2].from])});
 const view={editable:true,get state(){return state;},dispatch(tr){state=state.apply(tr);}};
 let prevented=false;assert(plugin.props.handleDOMEvents.beforeinput(view,{inputType:"insertText",data:"Новый",cancelable:true,preventDefault(){prevented=true;}}));assert(prevented);
 assert.equal(state.doc.firstChild.childCount,2);assert.equal(state.doc.firstChild.firstChild.textContent,"Новый");assert.equal(state.doc.firstChild.lastChild.textContent,"Хвост");
 state=state.apply(state.tr.insertText(" текст"));assert(undo(state,tr=>{state=state.apply(tr);}));assert(state.doc.eq(doc));assert.deepEqual(state.selection.positions,[scopes[0].from,scopes[2].from]);
});

test("a block range across protected answers includes intervening prose and keeps its direction, clipboard and one Undo", () => {
  const value = original();
  value.questions.forEach((question, index) => question.paragraphs.push(`Tail ${index}`));
  const { doc, plugin, adapter } = setup(value), scopes = questionScopes(doc);
  const first = scopes[0].from + doc.firstChild.firstChild.nodeSize, last = scopes[2].from;
  for (const reverse of [false, true]) {
    const selection = blockSelectionBetween(doc, reverse ? last : first, reverse ? first : last);
    assert(isBlockSelection(selection));
    assert.deepEqual(selection.positions.map(pos => doc.nodeAt(pos).textContent), ["Tail 0", "Beta two", "Tail 1", "Gamma three"]);
    assert.equal(selection.anchorBlock > selection.headBlock, reverse);
    assert.equal(selection.ranges.length, 3);
    let state = EditorState.create({ doc, plugins: [history(), plugin], selection });
    const copied = copiedQuestionSlice(selection.content(), state);
    assert.deepEqual(copied.content.content.map(node => node.textContent), ["Tail 0", "Beta two", "Tail 1", "Gamma three"]);
    assert(copied.content.content.every(node => node.type.name !== "questionSection" && node.type.name !== "heading"));
    state = state.apply(state.tr.deleteSelection());
    assert(validQuestionDocument(state.doc));
    assert.deepEqual(adapter.serialize(state.doc).questions.map(question => question.paragraphs), [["Alpha one"], [], ["Tail 2"], ["Delta four", "Tail 3"]]);
    assert(undo(state, tr => { state = state.apply(tr); }));
    assert(state.doc.eq(doc));
    assert(state.selection.eq(selection));
  }
  assert.equal(blockSelectionBetween(doc, 0, scopes[3].pos), null, "Fixed section wrappers are never selectable blocks");
});

test("Escape across answer boundaries excludes a native endpoint at the next answer's untouched start", () => {
  const value = original();
  value.questions.forEach((question, index) => question.paragraphs.push(`Tail ${index}`));
  const { doc, plugin } = setup(value), scopes = questionScopes(doc);
  const first = scopes[0].from + doc.firstChild.firstChild.nodeSize;
  const start = first + 3, end = scopes[2].from + 1;
  for (const reverse of [false, true]) {
    let state = EditorState.create({ doc, plugins: [history(), plugin], selection: TextSelection.create(doc, reverse ? end : start, reverse ? start : end) });
    const editor = { isEditable: true, get state() { return state; }, view: { composing: false, dispatch(tr) { state = state.apply(tr); } } };
    assert(handleBlockKeyDown(editor, { key: "Escape" }));
    assert(isBlockSelection(state.selection));
    assert.deepEqual(state.selection.positions.map(pos => doc.nodeAt(pos).textContent), ["Tail 0", "Beta two", "Tail 1"]);
    assert.equal(state.selection.anchorBlock > state.selection.headBlock, reverse);
    assert(state.doc.eq(doc));
    assert.equal(undo(state, editor.view.dispatch), false, "Choosing blocks creates no history or save operation");
    assert(handleBlockKeyDown(editor, { key: "Enter" }));
    assert.equal(state.selection.$from.parent.textContent, reverse ? "Tail 0" : "Tail 1");
  }
});

test("cross-answer block range retains partial endpoint lists, nested children and semantic copied list wrappers", () => {
  const { schema, doc, plugin } = setup();
  const p = text => schema.nodes.paragraph.create(null, schema.text(text));
  const item = (text, children = []) => schema.nodes.listItem.create(null, [p(text), ...children]);
  const child = schema.nodes.bulletList.create(null, item("Nested"));
  const list = schema.nodes.orderedList.create({ start: 7 }, [item("Before"), item("Selected", [child]), item("Last")]);
  const listDoc = schema.nodes.doc.create(null, [schema.nodes.questionSection.create({ index: 0 }, list), ...doc.content.content.slice(1)]);
  const scopes = questionScopes(listDoc), first = 2 + list.firstChild.nodeSize, last = scopes[1].from;
  for (const reverse of [false, true]) {
    const selection = blockSelectionBetween(listDoc, reverse ? last : first, reverse ? first : last);
    assert.deepEqual(selection.positions.map(pos => listDoc.nodeAt(pos).textContent), ["SelectedNested", "Last", "Beta two"]);
    const state = EditorState.create({ doc: listDoc, plugins: [history(), plugin], selection });
    const copied = copiedQuestionSlice(selection.content(), state);
    assert.equal(copied.content.firstChild.type.name, "orderedList");
    assert.equal(copied.content.firstChild.childCount, 2);
    assert.equal(copied.content.firstChild.firstChild.lastChild.textContent, "Nested");
    const changed = state.apply(state.tr.deleteSelection());
    assert(validQuestionDocument(changed.doc));
    assert.equal(changed.doc.firstChild.firstChild.childCount, 1);
    assert.equal(changed.doc.firstChild.firstChild.firstChild.textContent, "Before");
    assert.equal(changed.doc.firstChild.firstChild.attrs.start, 7);
    assert(changed.doc.child(2).eq(listDoc.child(2)));
    assert(changed.doc.child(3).eq(listDoc.child(3)));
  }
});


test("editing more than thirty answer paragraphs fits the API shape and reloads every block", async () => {
  const { identityFourQuestionsSchema } = await import("../../server/identity-content-schema.js");
  for (const count of [30, 31, 75]) {
    const value = original();
    const { adapter, doc, schema } = setup(value);
    const paragraphs = Array.from({ length: count - 1 }, (_, index) => schema.nodes.paragraph.create(null, schema.text(`Абзац ${index + 2} 👩🏽‍💻`)));
    const changed = EditorState.create({ doc }).tr.insert(questionScopes(doc)[0].to, paragraphs).doc;
    assert.equal(changed.child(0).childCount, count);
    const saved = adapter.serialize(changed);
    assert.deepEqual(identityFourQuestionsSchema.parse(saved), saved);
    assert.equal(saved.questions[0].paragraphs.length, count > 30 ? 1 : count);
    assert.deepEqual(saved.questions.slice(1), value.questions.slice(1));
    const restored = schema.nodeFromJSON(adapter.parse(saved));
    assert(restored.eq(changed));
    assert.deepEqual(adapter.serialize(restored), saved, "untouched packed source stays byte-exact");
    const shortened = EditorState.create({ doc: restored }).tr.delete(questionScopes(restored)[0].from + restored.child(0).child(0).nodeSize, questionScopes(restored)[0].to).doc;
    assert.deepEqual(adapter.serialize(shortened).questions[0].paragraphs, value.questions[0].paragraphs);
  }
});

test("packed long answers preserve blank lines inside code and rich Markdown independently of other answers", async () => {
  const { identityFourQuestionsSchema } = await import("../../server/identity-content-schema.js");
  const { adapter, doc, schema } = setup();
  const rich = [
    schema.nodes.heading.create({ level: 2 }, schema.text("Заголовок", [schema.marks.bold.create()])),
    schema.nodes.codeBlock.create({ language: "js" }, schema.text("const a = 1;\n\n\nconst b = 2;")),
    ...Array.from({ length: 35 }, (_, index) => schema.nodes.paragraph.create(null, schema.text(`Текст ${index}`, [schema.marks.italic.create()]))),
  ];
  const changed = EditorState.create({ doc }).tr.insert(questionScopes(doc)[1].to, rich).doc;
  const saved = adapter.serialize(changed);
  assert.equal(saved.questions[1].paragraphs.length, 1);
  assert(saved.questions[1].paragraphs[0].includes("const a = 1;\n\n\nconst b = 2;"));
  assert.deepEqual(identityFourQuestionsSchema.parse(saved), saved);
  assert(schema.nodeFromJSON(adapter.parse(saved)).eq(changed));
  assert.deepEqual(saved.questions.filter((_, index) => index !== 1), original().questions.filter((_, index) => index !== 1));
});
