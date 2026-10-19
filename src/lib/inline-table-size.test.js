import assert from "node:assert/strict";
import test from "node:test";
import { getSchema } from "@tiptap/core";
import { MarkdownManager } from "@tiptap/markdown";
import { EditorState, TextSelection } from "@tiptap/pm/state";
import { history, undo, redo } from "@tiptap/pm/history";
import { tableEditing, TableMap } from "@tiptap/pm/tables";
import { inlineEditorExtensions } from "./inline-editor-extensions.js";
import { applyTableAction } from "./inline-table-actions.js";
import { resizeTable } from "./inline-table-size.js";
function setup(headerRow=true,headerColumn=false,merged=false){
 const extensions=inlineEditorExtensions(),schema=getSchema(extensions),markdown=new MarkdownManager({extensions});
 const p=text=>schema.nodes.paragraph.create(null,text?schema.text(text,[schema.marks.bold.create()]):null);
 const cell=(r,c,attrs={})=>schema.nodes[headerRow&&r===0||headerColumn&&c===0?'tableHeader':'tableCell'].create({colwidth:[100+c*40],blockColor:'blue_background',...attrs},[p(`${r}:${c}`),p('Detail')]);
 const rows=merged?[schema.nodes.tableRow.create(null,[cell(0,0,{rowspan:2,colspan:2,colwidth:[100,140]}),cell(0,2)]),schema.nodes.tableRow.create(null,[cell(1,2)]),schema.nodes.tableRow.create(null,[cell(2,0),cell(2,1),cell(2,2)])]:Array.from({length:3},(_,r)=>schema.nodes.tableRow.create(null,Array.from({length:3},(_,c)=>cell(r,c))));
 const table=schema.nodes.table.create({blockColor:'green'},rows),doc=schema.nodes.doc.create(null,[p('Before'),table,p('After')]);
 let state=EditorState.create({doc,selection:TextSelection.create(doc,1),plugins:[history(),tableEditing()]});
 const editor={isEditable:true,get state(){return state;},view:{composing:false,focus(){},dispatch(tr){state=state.applyTransaction(tr).state;state.doc.check();}}};
 const position=doc.firstChild.nodeSize,read=()=>state.doc.nodeAt(position);
 const roundtrip=()=>assert.deepEqual(schema.nodeFromJSON(markdown.parse(markdown.serialize(state.doc.toJSON()))).toJSON(),state.doc.toJSON());
 return {schema,editor,position,doc,table,read,roundtrip};
}
test('grid growth preserves existing content/widths and focuses an empty new row or column with one Undo',()=>{
 for(const focus of ['row','column','corner']){
  const f=setup(),before=f.editor.state;
  assert(resizeTable(f.editor,f.position,4,5,focus,true));assert.equal(f.editor.state,before);
  assert(resizeTable(f.editor,f.position,4,5,focus));const table=f.read(),map=TableMap.get(table);assert.equal(map.height,4);assert.equal(map.width,5);assert.equal(map.problems,null);
  for(let r=0;r<3;r++)for(let c=0;c<3;c++)assert.deepEqual(table.child(r).child(c).toJSON(),f.table.child(r).child(c).toJSON());
  assert.equal(table.child(3).child(1).attrs.colwidth[0],140);assert.equal(f.editor.state.selection.$from.parent.textContent,'');f.roundtrip();
  const grown=f.editor.state.doc;assert(undo(f.editor.state,tr=>f.editor.view.dispatch(tr)));assert(f.editor.state.doc.eq(f.doc));assert(redo(f.editor.state,tr=>f.editor.view.dispatch(tr)));assert(f.editor.state.doc.eq(grown));
 }
});
test('shrink clips spans without losing retained content; Undo restores all removed cells and spans',()=>{
 const f=setup(false,false,true);assert(resizeTable(f.editor,f.position,1,1));const table=f.read(),cell=table.firstChild.firstChild;
 assert.equal(TableMap.get(table).problems,null);assert.equal(cell.attrs.colspan,1);assert.equal(cell.attrs.rowspan,1);assert.deepEqual(cell.attrs.colwidth,[100]);assert.deepEqual(cell.content.toJSON(),f.table.firstChild.firstChild.content.toJSON());f.roundtrip();
 assert(undo(f.editor.state,tr=>f.editor.view.dispatch(tr)));assert(f.editor.state.doc.eq(f.doc));
});
test('header row and column intent survives one-cell shrink, Markdown reload and regrowth',()=>{
 for(const [row,column] of [[true,false],[false,true],[true,true],[false,false]]){
  const f=setup(row,column);assert(resizeTable(f.editor,f.position,1,1));f.roundtrip();assert(resizeTable(f.editor,f.position,3,3));
  f.read().forEach((node,_,r)=>node.forEach((cell,__,c)=>assert.equal(cell.type.name,row&&r===0||column&&c===0?'tableHeader':'tableCell',`${row}/${column} at ${r}:${c}`)));f.roundtrip();
 }
});
test('invalid sizes, unchanged grid, read-only and composition never dispatch',()=>{
 const f=setup();for(const [rows,columns] of [[0,1],[1,0],[-1,3],[NaN,3],[3,Infinity],[1.5,3],[3,3],[1001,1000]]){const state=f.editor.state;assert.equal(resizeTable(f.editor,f.position,rows,columns),false);assert.equal(f.editor.state,state);}
 for(const mode of ['readOnly','composing']){f.editor.isEditable=mode!=='readOnly';f.editor.view.composing=mode==='composing';const state=f.editor.state;assert.equal(resizeTable(f.editor,f.position,4,4),false);assert.equal(f.editor.state,state);}
});


test('single-cell header toggles remain independent through menu edits, reload and regrowth',()=>{
 const f=setup();assert(resizeTable(f.editor,f.position,1,1));
 assert(applyTableAction(f.editor,f.position,'headerRow'));assert.equal(f.read().attrs.headerRow,false);assert.equal(f.read().firstChild.firstChild.type.name,'tableCell');
 assert(applyTableAction(f.editor,f.position,'headerColumn'));assert.equal(f.read().attrs.headerColumn,true);assert.equal(f.read().attrs.headerRow,false);
 assert(applyTableAction(f.editor,f.position,'rowBelow'));assert(applyTableAction(f.editor,f.position,'columnRight'));f.roundtrip();
 assert.equal(f.read().child(1).child(0).type.name,'tableHeader');assert.equal(f.read().child(0).child(1).type.name,'tableCell');
 assert(resizeTable(f.editor,f.position,3,3));f.read().forEach(row=>row.forEach((cell,_,c)=>assert.equal(cell.type.name,c===0?'tableHeader':'tableCell')));f.roundtrip();
});
