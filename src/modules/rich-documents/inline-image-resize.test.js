import assert from "node:assert/strict";
import test from "node:test";
import { getSchema } from "@tiptap/core";
import { MarkdownManager } from "@tiptap/markdown";
import { EditorState, NodeSelection, TextSelection } from "@tiptap/pm/state";
import { closeHistory, history, redo, undo } from "@tiptap/pm/history";
import { inlineEditorExtensions } from "./inline-editor-extensions.js";
import { commitInlineImageResize, imageResizeDimensions, imageResizeTransaction } from "./inline-image-resize.js";

const extensions=inlineEditorExtensions(),schema=getSchema(extensions),manager=new MarkdownManager({extensions});
const p=text=>schema.nodes.paragraph.create(null,text?schema.text(text,[schema.marks.bold.create()]):null);
const image=()=>schema.nodes.image.create({src:"/api/media/11111111-1111-4111-8111-111111111111",alt:"A [diagram]",title:'A "quoted" title',width:"240",height:"120",blockColor:"red_background"});
function fixture(doc,position=0){
 let state=EditorState.create({schema,doc,selection:TextSelection.atEnd(doc),plugins:[history()]});let focuses=0;
 const editor={schema,isEditable:true,isDestroyed:false,get state(){return state;},view:{composing:false,focus(){focuses++;},dispatch(tr){state=state.applyTransaction(tr).state;}}};
 return {editor,request:()=>({doc:state.doc,selection:state.selection,position,node:state.doc.nodeAt(position)}),focuses:()=>focuses};
}

test("image edge resize preserves the displayed ratio in both directions and rejects invalid measurements",()=>{
 assert.deepEqual(imageResizeDimensions(240,120,40,"right"),{width:280,height:140});
 assert.deepEqual(imageResizeDimensions(240,120,-40,"left"),{width:280,height:140});
 assert.deepEqual(imageResizeDimensions(240,120,40,"left"),{width:200,height:100});
 assert.deepEqual(imageResizeDimensions(100,300,50,"right"),{width:150,height:450});
 assert.deepEqual(imageResizeDimensions(240,120,500,"right",300),{width:300,height:150});
 assert.equal(imageResizeDimensions(240,120,10,"right",0),null);
 for(const args of [[0,100,20,"right"],[100,0,20,"right"],[NaN,100,20,"right"],[100,100,Infinity,"left"],[100,100,20,"bottom"],[1,1000000,20,"right"]])assert.equal(imageResizeDimensions(...args),null);
 for(const [w,h] of [[3,2],[120,240],[864,432]]){
  const size=imageResizeDimensions(w,h,1e6,"right");assert(Number.isInteger(size.width));assert(Number.isInteger(size.height));assert(size.width<=100000&&size.height<=100000);assert(Math.abs(size.width/size.height-w/h)<0.001);
 }
});

test("resize changes only the addressed image attributes in roots, nested heads, columns and table cells",()=>{
 const pictures=[
  schema.nodes.doc.create(null,[image(),p("Tail")]),
  schema.nodes.doc.create(null,[schema.nodes.nestedBlock.create(null,[image(),p("Child")]),p("Tail")]),
  schema.nodes.doc.create(null,[schema.nodes.columns.create(null,[schema.nodes.column.create(null,[image(),p("Left child")]),schema.nodes.column.create(null,p("Right peer"))]),p("Tail")]),
  schema.nodes.doc.create(null,[schema.nodes.table.create(null,schema.nodes.tableRow.create(null,[schema.nodes.tableCell.create(null,[image(),p("Cell child")]),schema.nodes.tableCell.create(null,p("Peer"))])),p("Tail")]),
 ];
 for(const doc of pictures){
  let position;doc.descendants((node,pos)=>{if(node.type.name==="image")position=pos;});const f=fixture(doc,position),before=f.request();
  assert(commitInlineImageResize(f.editor,before,{width:320,height:160}));f.editor.state.doc.check();
  const expectedJSON=JSON.parse(JSON.stringify(doc.toJSON()));const update=node=>{if(node.type==="image")Object.assign(node.attrs,{width:320,height:160});for(const child of node.content||[])update(child);};update(expectedJSON);const expected=schema.nodeFromJSON(expectedJSON);
  assert(f.editor.state.doc.eq(expected));assert(f.editor.state.selection instanceof NodeSelection);assert.equal(f.editor.state.selection.from,position);
  assert(undo(f.editor.state,f.editor.view.dispatch));assert(f.editor.state.doc.eq(doc));assert(f.editor.state.selection.eq(before.selection));
  assert(redo(f.editor.state,f.editor.view.dispatch));assert(f.editor.state.doc.eq(expected));
 }
});

test("stale source, selection, owner, access and IME cannot commit or focus an image resize",()=>{
 for(const reason of ["source","selection","owner","access","ime","destroyed","position"]){
  const doc=schema.nodes.doc.create(null,[image(),p("Tail")]),f=fixture(doc),request=f.request();
  if(reason==="source")f.editor.view.dispatch(f.editor.state.tr.insertText("Changed",3));
  if(reason==="selection")f.editor.view.dispatch(f.editor.state.tr.setSelection(NodeSelection.create(doc,0)));
  if(reason==="owner")request.node=image();
  if(reason==="access")f.editor.isEditable=false;
  if(reason==="ime")f.editor.view.composing=true;
  if(reason==="destroyed")f.editor.isDestroyed=true;
  if(reason==="position")request.position=1;
  const before=f.editor.state.doc;assert.equal(commitInlineImageResize(f.editor,request,{width:320,height:160}),false,reason);assert.equal(f.editor.state.doc,before);assert.equal(f.focuses(),0);
 }
});

test("no-op and invalid sizes keep legacy attribute types and do not add Undo events",()=>{
 const doc=schema.nodes.doc.create(null,[image(),p("Tail")]),f=fixture(doc);
 for(const size of [{width:240,height:120},{width:0,height:120},{width:240.5,height:120},{width:240,height:Infinity},{width:100001,height:120}])assert.equal(imageResizeTransaction(f.editor.state,f.request(),size),null);
 assert.equal(f.editor.state.doc,doc);assert.equal(f.editor.state.doc.firstChild.attrs.width,"240");assert.equal(undo(f.editor.state,f.editor.view.dispatch),false);
});

test("one resize Undo is separate from prior and subsequent typing and survives canonical reload",()=>{
 const doc=schema.nodes.doc.create(null,[image(),p("Tail")]),f=fixture(doc);
 f.editor.view.dispatch(closeHistory(f.editor.state.tr).insertText(" before"));const prior=f.editor.state.doc;
 assert(commitInlineImageResize(f.editor,f.request(),{width:320,height:160}));const resized=f.editor.state.doc;
 assert(schema.nodeFromJSON(manager.parse(manager.serialize(resized.toJSON()))).eq(resized));
 f.editor.view.dispatch(f.editor.state.tr.setSelection(TextSelection.atEnd(resized)).insertText(" after"));
 assert(undo(f.editor.state,f.editor.view.dispatch));assert(f.editor.state.doc.eq(resized));
 assert(undo(f.editor.state,f.editor.view.dispatch));assert(f.editor.state.doc.eq(prior));
 assert(undo(f.editor.state,f.editor.view.dispatch));assert(f.editor.state.doc.eq(doc));
});
