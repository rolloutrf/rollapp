import test from "node:test";
import assert from "node:assert/strict";
import { getSchema } from "@tiptap/core";
import { MarkdownManager } from "@tiptap/markdown";
import { EditorState, TextSelection } from "@tiptap/pm/state";
import { inlineEditorExtensions } from "./inline-editor-extensions.js";
import { blockRelocationPlan, blockRelocationTransaction } from "./inline-block-move.js";
import { BlockSelection, blockRange } from "./inline-block-selection.js";
import { blockHTML, parseBlockHTML } from "./inline-table-markdown.js";

const extensions = inlineEditorExtensions(), schema = getSchema(extensions), manager = new MarkdownManager({ extensions });
const p = text => schema.nodes.paragraph.create(null, text ? schema.text(text) : null);
const doc = (...content) => schema.nodes.doc.create(null, content);
const position = (document, text) => { let result; document.descendants((node, pos) => { if (node.isTextblock && node.textContent === text) { result = pos; return false; } }); return result; };
const texts = node => node.content.content.map(child => child.textContent);

test("columns keep rich block content, literal whitespace, widths and exact canonical Markdown", () => {
  const text = schema.text("  Keep\nspacing  ", [schema.marks.bold.create(), schema.marks.inlineStyle.create({color:"red"})]);
  const columns = schema.nodes.columns.create(null, [schema.nodes.column.create({width:1.25}, schema.nodes.heading.create({level:2,blockColor:"blue"},text)),schema.nodes.column.create({width:0.75},[p("Right"),schema.nodes.bulletList.create(null,schema.nodes.listItem.create(null,p("Item")))])]);
  const source = manager.serialize(doc(columns).toJSON());
  assert.deepEqual(schema.nodeFromJSON(manager.parse(source)).toJSON(), doc(columns).toJSON());
  assert.deepEqual(schema.nodeFromJSON(parseBlockHTML(blockHTML(columns.toJSON()))).toJSON(), columns.toJSON());
  for (const width of ["0","-1","NaN","Infinity","1000001"]) assert.throws(() => parseBlockHTML(blockHTML(columns.toJSON()).replace('data-column-width="1.25"',`data-column-width="${width}"`)));
});

for (const side of ["left", "right"]) test(`side drop ${side} moves real blocks and creates columns without losing neighbours`, () => {
  const original = doc(p("Before"),p("Target"),p("Moving"),p("After")), from = position(original,"Moving");
  const plan = blockRelocationPlan(original,blockRange(original,from),position(original,"Target"),side);
  assert(plan); assert.deepEqual(texts(plan.doc),["Before",side === "left" ? "MovingTarget" : "TargetMoving","After"]);
  assert.equal(plan.doc.child(1).type.name,"columns"); assert.equal(plan.doc.child(1).childCount,2);
  const state=EditorState.create({schema,doc:original,selection:TextSelection.create(original,from+3)});
  const tr=blockRelocationTransaction(state,blockRange(original,from),position(original,"Target"),side);
  assert.equal(tr.selection.$from.parent.textContent,"Moving");assert.equal(tr.selection.$from.parentOffset,2);
  assert.deepEqual(schema.nodeFromJSON(manager.parse(manager.serialize(plan.doc.toJSON()))).toJSON(),plan.doc.toJSON());
});

test("side drop beside an existing column adds a peer; moving its final block out unwraps the sole peer", () => {
  const column = (...nodes)=>schema.nodes.column.create(null,nodes);
  const original=doc(schema.nodes.columns.create(null,[column(p("Left")),column(p("Right"))]),p("Third"));
  const from=position(original,"Third"),plan=blockRelocationPlan(original,blockRange(original,from),position(original,"Right"),"right");
  assert(plan);assert.equal(plan.doc.firstChild.childCount,3);assert.deepEqual(texts(plan.doc.firstChild),["Left","Right","Third"]);
  const second=blockRelocationPlan(original,blockRange(original,position(original,"Right")),position(original,"Third"),"before");
  assert(second);assert.deepEqual(texts(second.doc),["Left","Right","Third"]);assert.equal(second.doc.firstChild.type.name,"paragraph");
});

test("side drop preserves ordered markers and children instead of flattening list HTML", () => {
  const item=(own,child)=>schema.nodes.listItem.create({blockColor:"green"},[p(own),schema.nodes.bulletList.create(null,schema.nodes.listItem.create(null,p(child)))]);
  const list=schema.nodes.orderedList.create({start:4,type:"a"},[item("Target","Keep target child"),item("Moving","Keep moved child"),item("Neighbour","Keep neighbour child")]);
  const original=doc(list),source=position(original,"Moving")-1;
  const plan=blockRelocationPlan(original,blockRange(original,source),position(original,"Target")-1,"right");
  assert(plan);const columns=plan.doc.firstChild;assert.equal(columns.type.name,"columns");
  assert.equal(columns.child(0).firstChild.attrs.start,4);assert.equal(columns.child(1).firstChild.attrs.start,5);
  assert.equal(columns.child(1).firstChild.firstChild.child(1).textContent,"Keep moved child");assert.equal(plan.doc.child(1).attrs.start,6);
  assert.deepEqual(schema.nodeFromJSON(manager.parse(manager.serialize(plan.doc.toJSON()))).toJSON(),plan.doc.toJSON());
});

test("deleting a whole column removes its layout, partial text deletion retains it", async () => {
  const {removeColumnContent}=await import("./inline-column-structure.js");
  const column=text=>schema.nodes.column.create(null,p(text));
  for(const count of [2,3]){
    const original=doc(p("Before"),schema.nodes.columns.create(null,Array.from({length:count},(_,i)=>column(`Column ${i}`))),p("After"));
    const start=position(original,"Column 1"),state=EditorState.create({schema,doc:original});
    const partial=state.tr;assert.equal(removeColumnContent(partial,start+1,start+2),null);assert.equal(partial.docChanged,false);
    const tr=state.tr;assert.notEqual(removeColumnContent(tr,start,start+original.nodeAt(start).nodeSize),null);
    tr.doc.check();if(count===2)assert.deepEqual(texts(tr.doc),["Before","Column 0","After"]);else assert.deepEqual(texts(tr.doc.child(1)),["Column 0","Column 2"]);
  }
});

test("pair resizing retains neighbours, rich content, native cursor and canonical reload",async()=>{
  const {resizeColumnPairTransaction}=await import("./inline-column-structure.js");
  const columns=schema.nodes.columns.create(null,[1,2,3].map(i=>schema.nodes.column.create({width:1},p(`Column ${i}`)))),original=doc(p("Before"),columns,p("After")),start=position(original,"Column 2")+4;
  const state=EditorState.create({schema,doc:original,selection:TextSelection.create(original,start)}),rowPosition=original.firstChild.nodeSize;
  const tr=resizeColumnPairTransaction(state,rowPosition,0,1.3,0.7);
  assert(tr);assert.equal(tr.selection.head,start);assert.equal(tr.selection.$from.parent.textContent,"Column 2");
  assert.equal(tr.doc.child(1).child(2),columns.child(2));assert.deepEqual(texts(tr.doc),texts(original));
  assert.deepEqual(schema.nodeFromJSON(manager.parse(manager.serialize(tr.doc.toJSON()))).toJSON(),tr.doc.toJSON());
  for(const pair of [[0,2],[-1,3],[NaN,2],[Infinity,1],[1,2]])assert.equal(resizeColumnPairTransaction(state,rowPosition,0,...pair),null);
  assert.equal(resizeColumnPairTransaction(state,rowPosition,2,1,1),null);assert.equal(resizeColumnPairTransaction(state,rowPosition,0,1,1),null);
});

for(const direction of [-1,1])test(`keyboard movement crosses a column boundary ${direction}`,async()=>{
  const {blockMoveTransaction}=await import("./inline-block-move.js");
  const original=doc(schema.nodes.columns.create(null,[schema.nodes.column.create(null,p("Left")),schema.nodes.column.create(null,p("Right"))]));
  const from=position(original,direction<0?"Right":"Left"),state=EditorState.create({schema,doc:original,selection:TextSelection.create(original,from+2)});
  const tr=blockMoveTransaction(state,blockRange(original,from),direction);assert(tr);tr.doc.check();assert.equal(tr.doc.firstChild.type.name,"paragraph");assert.deepEqual(texts(tr.doc),["Left","Right"]);assert.equal(tr.selection.$from.parent.textContent,direction<0?"Right":"Left");
});

for(const all of [false,true])test(`deleting column block groups removes only selected columns, all=${all}`,()=>{
  const original=doc(schema.nodes.columns.create(null,["A","B","C"].map(text=>schema.nodes.column.create(null,p(text)))));
  const positions=(all?["A","B","C"]:["A","C"]).map(text=>position(original,text));
  const state=EditorState.create({schema,doc:original,selection:BlockSelection.fromPositions(original,positions)}),tr=state.tr.deleteSelection();
  tr.doc.check();assert.equal(tr.doc.firstChild.type.name,"paragraph");assert.equal(tr.doc.textContent,all?"":"B");
});

test("structural insertion refuses trees that the canonical reader cannot reload",async()=>{
  const {canReloadNestedBlocks}=await import("./inline-block-depth.js"),{insertTextBlock}=await import("./inline-blocks.js");
  let nested=p("");for(let depth=0;depth<48;depth++)nested=schema.nodes.columns.create(null,[schema.nodes.column.create(null,nested),schema.nodes.column.create(null,p(`Peer ${depth}`))]);
  const original=doc(nested);assert(canReloadNestedBlocks(original));assert.deepEqual(schema.nodeFromJSON(manager.parse(manager.serialize(original.toJSON()))).toJSON(),original.toJSON());
  let target;original.descendants((node,pos)=>{if(node.type.name==="paragraph"&&!node.content.size)target=pos;});
  for(const type of ["columns","table","details"]){
    let state=EditorState.create({schema,doc:original,selection:TextSelection.create(original,target+1)}),writes=0;
    const editor={schema,isEditable:true,get state(){return state;},view:{composing:false,dispatch(tr){writes++;state=state.apply(tr);}},commands:{focus(){}}};
    const applied=insertTextBlock(editor,target,"replace",type),reload=schema.nodeFromJSON(manager.parse(manager.serialize(state.doc.toJSON())));
    console.log('STRUCTURAL DEPTH',JSON.stringify({type,applied,reloadable:canReloadNestedBlocks(state.doc),exactReload:reload.eq(state.doc),writes}));
    assert.equal(applied,false,`${type} cannot introduce a document the canonical reader rejects`);assert.equal(writes,0);assert.equal(state.doc,original);
  }
});
