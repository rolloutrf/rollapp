import test from "node:test";
import assert from "node:assert/strict";
import {getSchema} from "@tiptap/core";
import {EditorState,Plugin,TextSelection} from "@tiptap/pm/state";
import {history,closeHistory,undo,redo} from "@tiptap/pm/history";
import {inlineEditorExtensions} from "./inline-editor-extensions.js";
import {pasteHistoryBoundary} from "./inline-paste-history.js";
const schema=getSchema(inlineEditorExtensions()),paragraph=text=>schema.nodes.paragraph.create(null,schema.text(text));

test("paste and its appended marks undo together, separately from subsequent typing",()=>{
  const doc=schema.nodes.doc.create(null,paragraph("Before"));
  const rules=new Plugin({appendTransaction(transactions,_old,state){return transactions.some(tr=>tr.getMeta("uiEvent")==="paste")?state.tr.addMark(7,13,schema.marks.bold.create()):null;}});
  let state=EditorState.create({schema,doc,selection:TextSelection.create(doc,7),plugins:[history(),rules,pasteHistoryBoundary()]});
  const dispatch=tr=>{state=state.applyTransaction(tr).state;};
  dispatch(closeHistory(state.tr));dispatch(state.tr.insertText(" paste").setMeta("uiEvent","paste"));const pasted=state.doc;
  assert(state.doc.rangeHasMark(7,13,schema.marks.bold));dispatch(state.tr.insertText("!"));assert(undo(state,dispatch));assert(state.doc.eq(pasted));assert(undo(state,dispatch));assert(state.doc.eq(doc));assert(redo(state,dispatch));assert(state.doc.eq(pasted));
});

test("ordinary contiguous typing still has its native shared Undo group",()=>{
  const doc=schema.nodes.doc.create(null,paragraph("Before"));let state=EditorState.create({schema,doc,selection:TextSelection.create(doc,7),plugins:[history(),pasteHistoryBoundary()]}),dispatch=tr=>{state=state.applyTransaction(tr).state;};
  dispatch(state.tr.insertText("a"));dispatch(state.tr.insertText("b"));assert(undo(state,dispatch));assert(state.doc.eq(doc));
});


test("cut and its appended transforms stay between previous and subsequent typing history",()=>{
 const doc=schema.nodes.doc.create(null,paragraph("Before"));
 let state=EditorState.create({schema,doc,selection:TextSelection.create(doc,7),plugins:[history(),pasteHistoryBoundary()]}),dispatch=tr=>{state=state.applyTransaction(tr).state;};
 dispatch(state.tr.insertText(" remove"));const beforeCut=state.doc;
 dispatch(closeHistory(state.tr).setSelection(TextSelection.create(state.doc,8,14)));
 dispatch(state.tr.deleteSelection().setMeta("uiEvent","cut"));const afterCut=state.doc;
 dispatch(state.tr.insertText("after"));const typed=state.doc;
 assert(undo(state,dispatch));assert(state.doc.eq(afterCut));assert(undo(state,dispatch));assert(state.doc.eq(beforeCut));assert(undo(state,dispatch));assert(state.doc.eq(doc));
 assert(redo(state,dispatch));assert(state.doc.eq(beforeCut));assert(redo(state,dispatch));assert(state.doc.eq(afterCut));assert(redo(state,dispatch));assert(state.doc.eq(typed));
});

test("native paste handled without uiEvent stays separate from prior and subsequent typing",()=>{
 const doc=schema.nodes.doc.create(null,paragraph("Before")),boundary=pasteHistoryBoundary();
 let state=EditorState.create({schema,doc,selection:TextSelection.create(doc,7),plugins:[history(),boundary]}),dispatch=tr=>{state=state.applyTransaction(tr).state;};
 dispatch(state.tr.insertText(" prior"));const prior=state.doc;
 const view={editable:true,get state(){return state;},dispatch};
 assert.equal(boundary.props.handleDOMEvents.paste(view,{}),false);
 dispatch(state.tr.insertText(" pasted"));const pasted=state.doc;
 dispatch(state.tr.insertText("!"));
 assert(undo(state,dispatch));assert(state.doc.eq(pasted));
 assert(undo(state,dispatch));assert(state.doc.eq(prior));
 assert(undo(state,dispatch));assert(state.doc.eq(doc));
 assert(redo(state,dispatch));assert(state.doc.eq(prior));
 assert(redo(state,dispatch));assert(state.doc.eq(pasted));
});

test("an unhandled native paste does not split later ordinary typing",async()=>{
 const doc=schema.nodes.doc.create(null,paragraph("Before")),boundary=pasteHistoryBoundary();
 let state=EditorState.create({schema,doc,selection:TextSelection.create(doc,7),plugins:[history(),boundary]}),dispatch=tr=>{state=state.applyTransaction(tr).state;};
 const view={editable:true,get state(){return state;},dispatch};
 boundary.props.handleDOMEvents.paste(view,{});await Promise.resolve();
 dispatch(state.tr.insertText("a"));dispatch(state.tr.insertText("b"));
 assert(undo(state,dispatch));assert(state.doc.eq(doc));
});

test("read-only paste neither dispatches nor leaves a history intent",()=>{
 const boundary=pasteHistoryBoundary();let count=0;
 assert.equal(boundary.props.handleDOMEvents.paste({editable:false,dispatch(){count++;}},{}),false);
 assert.equal(count,0);
});
