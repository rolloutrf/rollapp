import { CellSelection } from "@tiptap/pm/tables";
import test from "node:test";
import assert from "node:assert/strict";
import { getSchema } from "@tiptap/core";
import { AllSelection, EditorState, NodeSelection, TextSelection } from "@tiptap/pm/state";
import { inlineEditorExtensions } from "./inline-editor-extensions.js";
import { BlockSelection } from "./inline-block-selection.js";
import { collapseInlineTextSelection, observeInlineNativeSelection } from "./inline-native-selection.js";
const schema=getSchema(inlineEditorExtensions());
function fixture(reverse=false){
 const doc=schema.nodes.doc.create(null,schema.nodes.paragraph.create(null,schema.text("Text")));let state=EditorState.create({doc,selection:TextSelection.create(doc,reverse?5:1,reverse?1:5)});const node={},calls=[];
 const native={anchorNode:node,focusNode:node,anchorOffset:reverse?4:0,focusOffset:reverse?0:4,isCollapsed:false,modify(mode,direction,unit){calls.push([mode,direction,unit]);this.anchorOffset=this.focusOffset=direction==="right"?4:0;this.isCollapsed=true;}};
 const view={editable:true,composing:false,domObserver:{flushingSoon:-1,pendingRecords:()=>[]},get state(){return state;},dom:{contains:target=>target===node,ownerDocument:{getSelection:()=>native}},posAtDOM:(_node,offset)=>offset+1,dispatch:tr=>{state=state.apply(tr);}};
 return {view,native,calls,doc};
}
test("native horizontal collapse commits the caret before delayed focus work without changing text",()=>{
 for(const reverse of [false,true])for(const key of ["ArrowLeft","ArrowRight"]){const {view,calls,doc}=fixture(reverse);assert(collapseInlineTextSelection(view,{key}));assert.equal(view.state.selection.empty,true);assert.equal(view.state.selection.head,key==="ArrowRight"?5:1);assert(view.state.doc.eq(doc));assert.deepEqual(calls,[["move",key==="ArrowRight"?"right":"left","character"]]);}
});
test("selection extension, shortcuts, IME and read-only keys retain their native semantics",()=>{
 for(const modifier of ["shiftKey","metaKey","ctrlKey","altKey","isComposing"]){const f=fixture();assert.equal(collapseInlineTextSelection(f.view,{key:"ArrowRight",[modifier]:true}),false);assert.equal(f.calls.length,0);assert.equal(f.view.state.selection.empty,false);}
 for(const property of ["composing","editable"]){const f=fixture();f.view[property]=property==="composing";assert.equal(collapseInlineTextSelection(f.view,{key:"ArrowRight"}),false);assert.equal(f.calls.length,0);}
});
test("custom block ranges, outside selections and browsers without visual movement are untouched",()=>{
 const block=fixture();block.view.dispatch(block.view.state.tr.setSelection(BlockSelection.create(block.doc,0)));assert.equal(collapseInlineTextSelection(block.view,{key:"ArrowRight"}),false);assert.equal(block.calls.length,0);
 for(const make of [doc=>new AllSelection(doc),doc=>NodeSelection.create(doc,0)]){const f=fixture();const selection=make(f.doc);f.view.dispatch(f.view.state.tr.setSelection(selection));assert.equal(collapseInlineTextSelection(f.view,{key:"ArrowRight"}),false);assert(f.view.state.selection.eq(selection));assert.equal(f.calls.length,0);}
 const cells=fixture(),table=schema.nodes.table.create(null,schema.nodes.tableRow.create(null,schema.nodes.tableCell.createAndFill())),tableDoc=schema.nodes.doc.create(null,table);let cellPosition;tableDoc.descendants((node,pos)=>{if(node.type.name==="tableCell"&&cellPosition==null)cellPosition=pos;});const cellSelection=new CellSelection(tableDoc.resolve(cellPosition));const cellState=EditorState.create({doc:tableDoc,selection:cellSelection});const cellView={...cells.view,state:cellState};assert.equal(collapseInlineTextSelection(cellView,{key:"ArrowRight"}),false);assert.equal(cells.calls.length,0);assert(cellView.state.selection.eq(cellSelection));
 const outside=fixture();outside.native.focusNode={};assert.equal(collapseInlineTextSelection(outside.view,{key:"ArrowRight"}),false);assert.equal(outside.calls.length,0);
 const unsupported=fixture();delete unsupported.native.modify;assert.equal(collapseInlineTextSelection(unsupported.view,{key:"ArrowRight"}),false);assert.equal(unsupported.view.state.selection.empty,false);
});


test("native selection capture commits the explicit range before bubble observers and detaches",()=>{
 const f=fixture(),doc=f.view.dom.ownerDocument;let listener;const phases=[];
 doc.activeElement=f.view.dom;doc.addEventListener=(event,fn,capture)=>{assert.equal(event,"selectionchange");listener=fn;phases.push(capture);};doc.removeEventListener=(event,fn,capture)=>{assert.equal(event,"selectionchange");assert.equal(fn,listener);phases.push(capture);listener=null;};
 const detach=observeInlineNativeSelection(f.view);f.native.anchorOffset=f.native.focusOffset=0;listener();assert.equal(f.view.state.selection.anchor,1);assert.equal(f.view.state.selection.head,1);assert(f.view.state.doc.eq(f.doc));assert.deepEqual(f.calls,[]);detach();assert.equal(listener,null);assert.deepEqual(phases,[true,true]);
});
test("native capture respects focus, access, IME and block-selection ownership",()=>{
 for(const setup of [f=>{f.view.dom.ownerDocument.activeElement={};},f=>{f.view.editable=false;},f=>{f.view.composing=true;},f=>{f.view.dispatch(f.view.state.tr.setSelection(BlockSelection.create(f.doc,0)));}]){
  const f=fixture(),doc=f.view.dom.ownerDocument;let listener;doc.activeElement=f.view.dom;doc.addEventListener=(_event,fn)=>{listener=fn;};doc.removeEventListener=()=>{};setup(f);const before=f.view.state.selection;observeInlineNativeSelection(f.view);f.native.anchorOffset=f.native.focusOffset=0;listener();assert(f.view.state.selection.eq(before));assert(f.view.state.doc.eq(f.doc));
 }
});


test("native capture defers pending DOM input and scheduled parses, but ignores root focus attributes",()=>{
 for(const mode of ["text","scheduled","suppressed","unavailable","focus"]){
  const f=fixture(),doc=f.view.dom.ownerDocument;let listener;doc.activeElement=f.view.dom;doc.addEventListener=(_event,fn)=>{listener=fn;};doc.removeEventListener=()=>{};
  if(mode==="text")f.view.domObserver.pendingRecords=()=>[{type:"characterData",target:{}}];
  if(mode==="scheduled")f.view.domObserver.flushingSoon=1;
  if(mode==="suppressed")f.view.domObserver.suppressingSelectionUpdates=true;
  if(mode==="unavailable")delete f.view.domObserver.pendingRecords;
  if(mode==="focus")f.view.domObserver.pendingRecords=()=>[{type:"attributes",target:f.view.dom,attributeName:"class"}];
  const before=f.view.state.selection;observeInlineNativeSelection(f.view);f.native.anchorOffset=f.native.focusOffset=0;listener();
  if(mode==="focus")assert.equal(f.view.state.selection.head,1);else assert(f.view.state.selection.eq(before));assert(f.view.state.doc.eq(f.doc));
 }
});
