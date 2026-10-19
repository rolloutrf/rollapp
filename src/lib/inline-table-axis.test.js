import assert from "node:assert/strict";
import test from "node:test";
import { getSchema } from "@tiptap/core";
import { MarkdownManager } from "@tiptap/markdown";
import { EditorState, TextSelection } from "@tiptap/pm/state";
import { history, undo } from "@tiptap/pm/history";
import { TableMap, CellSelection } from "@tiptap/pm/tables";
import { inlineEditorExtensions } from "./inline-editor-extensions.js";
import { duplicateTableAxis, moveTableAxis, selectTableAxis, tableAxisBand } from "./inline-table-axis.js";
import { createFourQuestionAdapter } from "./four-question-document.js";
import { IDENTITY_QUESTION_TITLES } from "../../shared/identity-questions.js";

function fixture(make, four = false) {
  const adapter = four ? createFourQuestionAdapter() : null;
  const extensions = adapter ? [...inlineEditorExtensions(undefined, adapter.documentExtension), ...adapter.extensions] : inlineEditorExtensions();
  const schema = getSchema(extensions), markdown = new MarkdownManager({ extensions });
  const p = value => schema.nodes.paragraph.create(null, value ? schema.text(value, [schema.marks.bold.create()]) : null);
  const cell = (value, attrs = {}, header = false) => schema.nodes[header ? "tableHeader" : "tableCell"].create({ blockColor: "blue_background", colwidth: [100], ...attrs }, [p(value), p("Деталь " + value)]);
  const row = children => schema.nodes.tableRow.create(null, children);
  const table = schema.nodes.table.create({ blockColor: "green" }, make({ p, cell, row }));
  const value = { questions: IDENTITY_QUESTION_TITLES.map((title,index) => ({ title, paragraphs: index ? ["Ответ " + index] : [] })) };
  if (adapter) adapter.parse(value);
  const doc = schema.nodes.doc.create(null, adapter ? IDENTITY_QUESTION_TITLES.map((_,index) => schema.nodes.questionSection.create({ index }, index ? [p("Ответ " + index)] : [p("До"),table,p("После")])) : [p("До"),table,p("После")]);
  let position;doc.descendants((node,pos)=>{if(node===table)position=pos;});
  let state = EditorState.create({ doc, selection: TextSelection.create(doc, four ? 2 : 1), plugins: [history()] });
  const editor = { isEditable:true,get state(){return state;},view:{composing:false,dispatch(tr){state=state.apply(tr);state.doc.check();}} };
  const roundTrip = () => assert.deepEqual(adapter ? schema.nodeFromJSON(createFourQuestionAdapter().parse(adapter.serialize(state.doc))).toJSON() : schema.nodeFromJSON(markdown.parse(markdown.serialize(state.doc.toJSON()))).toJSON(),state.doc.toJSON());
  return { editor, schema, table, doc, position, roundTrip };
}
const square = ({cell,row}) => ['ABC','DEF','GHI'].map((values,index)=>row([...values].map((value,col)=>cell(value,{colwidth:[100+col*40]},index===0))));
const values = table => table.content.content.map(row=>row.content.content.map(cell=>cell.firstChild.textContent).join(''));

test("moving rows/columns keeps cell content, marks, attrs, positional headers, neighbours and a single Undo",()=>{
 for(const axis of ['row','column'])for(const [from,to] of [[0,2],[2,0],[1,2]])for(const four of [false,true]){
  const f=fixture(square,four),before=f.editor.state;assert(moveTableAxis(f.editor,f.position,axis,from,to,true));assert.equal(f.editor.state,before);
  assert(moveTableAxis(f.editor,f.position,axis,from,to));const table=f.editor.state.doc.nodeAt(f.position),order=[0,1,2];order.splice(to,0,order.splice(from,1)[0]);
  assert.deepEqual(values(table),axis==='row'?order.map(index=>values(f.table)[index]):values(f.table).map(value=>order.map(index=>value[index]).join('')));
  table.forEach((row,_,rowIndex)=>row.forEach(cell=>assert.equal(cell.type.name,rowIndex===0?'tableHeader':'tableCell')));
  for(const node of table.content.content.flatMap(row=>row.content.content)){assert.equal(node.attrs.blockColor,'blue_background');assert(node.firstChild.firstChild.marks.some(mark=>mark.type.name==='bold'));assert.equal(node.childCount,2);}
  assert(f.editor.state.selection instanceof CellSelection);f.roundTrip();
  assert(undo(f.editor.state,tr=>f.editor.view.dispatch(tr)));assert(f.editor.state.doc.eq(f.doc));f.roundTrip();
 }
});

test("merged spans move as connected bands in both axes without splitting cells or losing their children",()=>{
 for(const axis of ['row','column']){
  const f=fixture(({cell,row})=>axis==='row'?[row([cell('A',{rowspan:2}),cell('B')]),row([cell('C')]),row([cell('D'),cell('E')])]:[row([cell('A',{colspan:2,colwidth:[100,100]}),cell('B')]),row([cell('C'),cell('D'),cell('E')])]);
  const band=tableAxisBand(f.table,axis,0);assert.equal(band.start,0);assert.equal(band.end,2);
  assert.equal(moveTableAxis(f.editor,f.position,axis,0,1),false);
  assert(moveTableAxis(f.editor,f.position,axis,0,2));assert.equal(TableMap.get(f.editor.state.doc.nodeAt(f.position)).problems,null);f.roundTrip();
  assert(f.editor.state.selection instanceof CellSelection);assert.equal(axis==='row'?f.editor.state.selection.isRowSelection():f.editor.state.selection.isColSelection(),true);
  const next=f.editor.state.doc.nodeAt(f.position);assert.equal(next.textContent.split('Деталь').length,f.table.textContent.split('Деталь').length);
  assert(undo(f.editor.state,tr=>f.editor.view.dispatch(tr)));assert(f.editor.state.doc.eq(f.doc));
 }
});

test("axis selection is not a content change and invalid indices, read-only and IME never dispatch",()=>{
 const f=fixture(square),initial=f.editor.state;
 for(const axis of ['row','column']){
  assert(selectTableAxis(f.editor,f.position,axis,1));assert(f.editor.state.doc.eq(f.doc));
  for(const [from,to] of [[-1,0],[0,3],[0,0],[0,NaN]])assert.equal(moveTableAxis(f.editor,f.position,axis,from,to),false);
 }
 for(const position of [-1,NaN,initial.doc.content.size+100]){const before=f.editor.state;assert.equal(moveTableAxis(f.editor,position,'row',0,1),false);assert.equal(selectTableAxis(f.editor,position,'column',0),false);assert.equal(f.editor.state,before);}
 for(const mode of ['readonly','composing']){f.editor.isEditable=mode!=='readonly';f.editor.view.composing=mode==='composing';const before=f.editor.state;assert.equal(selectTableAxis(f.editor,f.position,'row',0),false);assert.equal(moveTableAxis(f.editor,f.position,'column',0,1),false);assert.equal(f.editor.state,before);}
 assert(initial.doc.eq(f.doc));
});


test("duplicating rows and columns preserves rich cells, widths, neighbours, selection and one Undo",()=>{
 for(const axis of ['row','column'])for(const index of [0,1,2])for(const four of [false,true]){
  const f=fixture(square,four),before=f.editor.state;
  assert(duplicateTableAxis(f.editor,f.position,axis,index,index+1,true));assert.equal(f.editor.state,before);
  assert(duplicateTableAxis(f.editor,f.position,axis,index));
  const table=f.editor.state.doc.nodeAt(f.position);
  const order=[0,1,2];order.splice(index+1,0,index);
  assert.deepEqual(values(table),axis==='row'?order.map(i=>values(f.table)[i]):values(f.table).map(value=>order.map(i=>value[i]).join('')));
  table.forEach((row,_,r)=>row.forEach(cell=>assert.equal(cell.type.name,r===0?'tableHeader':'tableCell')));
  const cells=table.content.content.flatMap(row=>row.content.content);
  for(const cell of cells){assert.equal(cell.attrs.blockColor,'blue_background');assert(cell.firstChild.firstChild.marks.some(mark=>mark.type.name==='bold'));assert.equal(cell.childCount,2);}
  assert(f.editor.state.selection instanceof CellSelection);assert.equal(axis==='row'?f.editor.state.selection.isRowSelection():f.editor.state.selection.isColSelection(),true);
  assert.equal(TableMap.get(table).problems,null);f.roundTrip();
  assert(undo(f.editor.state,tr=>f.editor.view.dispatch(tr)));assert(f.editor.state.doc.eq(f.doc));f.roundTrip();
 }
});

test("duplication carries connected merged bands, multi-row selections and positional header columns",()=>{
 for(const axis of ['row','column']){
  const f=fixture(({cell,row})=>axis==='row'?[row([cell('A',{rowspan:2}),cell('B')]),row([cell('C')]),row([cell('D'),cell('E')])]:[row([cell('A',{colspan:2,colwidth:[100,100]}),cell('B')]),row([cell('C'),cell('D'),cell('E')])]);
  assert(duplicateTableAxis(f.editor,f.position,axis,0));const table=f.editor.state.doc.nodeAt(f.position),map=TableMap.get(table);
  assert.equal(axis==='row'?map.height:map.width,5);assert.equal(map.problems,null);
  for(const text of ['A','B','C','D','E'])assert.equal(table.textContent.split('Деталь '+text).length-1,(axis==='row'?['A','B','C']:['A','C','D']).includes(text)?2:1);
  f.roundTrip();assert(undo(f.editor.state,tr=>f.editor.view.dispatch(tr)));assert(f.editor.state.doc.eq(f.doc));
 }
 const f=fixture(({cell,row})=>['AB','CD','EF'].map(value=>row([...value].map((text,col)=>cell(text,{},col===0)))));
 assert(duplicateTableAxis(f.editor,f.position,'column',0));
 assert.deepEqual(values(f.editor.state.doc.nodeAt(f.position)),['AAB','CCD','EEF']);
 f.editor.state.doc.nodeAt(f.position).forEach(row=>{assert.equal(row.child(0).type.name,'tableHeader');assert.equal(row.child(1).type.name,'tableCell');});f.roundTrip();
 for(const axis of ['row','column']){
  const both=fixture(({cell,row})=>['AB','CD'].map((value,r)=>row([...value].map((text,c)=>cell(text,{},r===0||c===0)))));
  assert(duplicateTableAxis(both.editor,both.position,axis,0));
  both.editor.state.doc.nodeAt(both.position).forEach((row,_,r)=>row.forEach((cell,__,c)=>assert.equal(cell.type.name,r===0||c===0?'tableHeader':'tableCell')));both.roundTrip();
 }
 const multi=fixture(square);assert(duplicateTableAxis(multi.editor,multi.position,'row',1,3));
 assert.deepEqual(values(multi.editor.state.doc.nodeAt(multi.position)),['ABC','DEF','GHI','DEF','GHI']);multi.roundTrip();
});

test("invalid duplicate targets, read-only and composition preserve the exact state",()=>{
 const f=fixture(square);
 for(const args of [[-1,'row',0],[f.position,'cell',0],[f.position,'row',-1],[f.position,'column',3],[f.position,'row',0,4],[f.position,'row',1,1],[f.position,'column',NaN]]){
  const state=f.editor.state;assert.equal(duplicateTableAxis(f.editor,...args),false);assert.equal(f.editor.state,state);
 }
 for(const mode of ['readonly','composing']){f.editor.isEditable=mode!=='readonly';f.editor.view.composing=mode==='composing';const state=f.editor.state;assert.equal(duplicateTableAxis(f.editor,f.position,'row',0),false);assert.equal(f.editor.state,state);}
});

test("duplicate cells retain nested tasks, open toggles, code whitespace, links and block colours",()=>{
 for(const axis of ['row','column'])for(const four of [false,true]){
  const f=fixture(({cell,row,p})=>{
   const original=cell('Deep'),schema=original.type.schema;
   const children=[p('Deep'),schema.nodes.taskList.create(null,[schema.nodes.taskItem.create({checked:true},[p('Done')])]),schema.nodes.details.create({open:true},[schema.nodes.detailsSummary.create(null,schema.text('Summary',[schema.marks.link.create({href:'https://example.com'})])),schema.nodes.detailsContent.create(null,[p('Body')])]),schema.nodes.codeBlock.create({language:'text'},schema.text('  literal **code**\n\tend  '))];
   return [row([cell('A'),cell('B')]),row([original.type.create(original.attrs,children),cell('C')])];
  },four);
  assert(duplicateTableAxis(f.editor,f.position,axis,axis==='row'?1:0));
  const table=f.editor.state.doc.nodeAt(f.position),original=table.child(1).child(0),copy=axis==='row'?table.child(2).child(0):table.child(1).child(1);
  assert.deepEqual(copy.toJSON(),original.toJSON());f.roundTrip();assert(undo(f.editor.state,tr=>f.editor.view.dispatch(tr)));assert(f.editor.state.doc.eq(f.doc));
 }
});
