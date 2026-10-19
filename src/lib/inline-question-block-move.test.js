import assert from "node:assert/strict";
import test from "node:test";
import { getSchema } from "@tiptap/core";
import { EditorState, NodeSelection, TextSelection } from "@tiptap/pm/state";
import { history, undo } from "@tiptap/pm/history";
import { CellSelection } from "@tiptap/pm/tables";
import { inlineEditorExtensions } from "./inline-editor-extensions.js";
import { BlockSelection } from "./inline-block-selection.js";
import { canMoveTextBlock, moveTextBlock, selectedBlockPosition } from "./inline-blocks.js";
import { createFourQuestionAdapter, questionScopes, validQuestionDocument } from "./four-question-document.js";
import { IDENTITY_QUESTION_TITLES } from "../../shared/identity-questions.js";

function fixture(groups) {
  const adapter=createFourQuestionAdapter(),schema=getSchema([...inlineEditorExtensions(undefined,adapter.documentExtension),...adapter.extensions]);
  adapter.parse({questions:IDENTITY_QUESTION_TITLES.map(title=>({title,paragraphs:[]}))});
  const p=text=>schema.nodes.paragraph.create(null,text?schema.text(text):null);
  const content=groups.map((group,index)=>schema.nodes.questionSection.create({index},group.length?group.map(value=>typeof value==="string"?p(value):schema.nodeFromJSON(value)):[p("")]));
  let state=EditorState.create({doc:schema.nodes.doc.create(null,content),plugins:[history()]});
  const editor={schema,isEditable:true,get state(){return state;},view:{dispatch(tr){state=state.apply(tr);assert(validQuestionDocument(state.doc));}},commands:{focus(){}}};
  return {editor,adapter,p,position:(section,index)=>questionScopes(state.doc)[section].from+state.doc.child(section).content.content.slice(0,index).reduce((n,node)=>n+node.nodeSize,0)};
}
const texts=doc=>doc.content.content.map(section=>section.content.content.map(block=>block.textContent));
const select=(editor,selection)=>editor.view.dispatch(editor.state.tr.setSelection(selection));
const move=(editor,direction)=>moveTextBlock(editor,selectedBlockPosition(editor.state.selection),direction);
const roundTrip=(editor,adapter)=>assert.deepEqual(editor.schema.nodeFromJSON(createFourQuestionAdapter().parse(adapter.serialize(editor.state.doc))).toJSON(),editor.state.doc.toJSON());

test("cross-answer moves retain native caret/marks, node/block selections and one-step Undo in both directions",()=>{
  for(const direction of [-1,1]) for(const kind of ["caret","block","node"]) {
    const {editor,adapter,position}=fixture([["AA","BB"],["CC","DD"],[],["EE"]]);
    const source=direction<0?position(1,0):position(0,1),doc=editor.state.doc;
    const selection=kind==="caret"?TextSelection.create(doc,source+2):kind==="node"?NodeSelection.create(doc,source):BlockSelection.create(doc,source);
    select(editor,selection);if(kind==="caret")editor.view.dispatch(editor.state.tr.setStoredMarks([editor.schema.marks.bold.create()]));
    assert(canMoveTextBlock(editor.state.doc,source,editor.state.selection,direction));assert(move(editor,direction));
    assert.deepEqual(texts(editor.state.doc).slice(0,2),direction<0?[["AA","BB","CC"],["DD"]]:[["AA"],["BB","CC","DD"]]);
    if(kind==="caret"){assert.equal(editor.state.selection.$from.parentOffset,1);assert.deepEqual(editor.state.storedMarks,[editor.schema.marks.bold.create()]);}
    else assert.equal(editor.state.selection.toJSON().type,kind==="node"?"node":"rollappBlocks");
    roundTrip(editor,adapter);assert(undo(editor.state,tr=>editor.view.dispatch(tr)));assert(editor.state.doc.eq(doc));assert(editor.state.selection.eq(selection));
  }
});

test("sparse cross-answer groups preserve occurrence identity, direction and untouched gaps",()=>{
  for(const direction of [-1,1])for(const reverse of [false,true]){
    const {editor,adapter,position}=fixture([["First","Same"],["Same","Gap"],["Same","End"],["Last"]]);
    const original=editor.state.doc,positions=[position(0,1),position(1,0),position(2,0)],selection=BlockSelection.fromPositions(original,positions,reverse?positions[2]:positions[0],reverse?positions[0]:positions[2]);select(editor,selection);assert(move(editor,direction));
    assert.equal(editor.state.selection.positions.length,3);assert.deepEqual(editor.state.selection.positions.map(pos=>editor.state.doc.nodeAt(pos).textContent),["Same","Same","Same"]);assert.equal(editor.state.selection.anchorBlock>editor.state.selection.headBlock,reverse);
    assert.deepEqual(texts(editor.state.doc),direction<0?[["Same","First","Same"],["Gap","Same"],["End"],["Last"]]:[["First"],["Same","Gap","Same"],["End","Same"],["Last"]]);
    roundTrip(editor,adapter);assert(undo(editor.state,tr=>editor.view.dispatch(tr)));assert(editor.state.doc.eq(original));assert(editor.state.selection.eq(selection));
  }
});

test("moving an entire answer leaves a real empty input and replaces only a canonical destination placeholder",()=>{
 const {editor,adapter,position}=fixture([["Only"],[],[{type:"paragraph",attrs:{blockColor:"red"}}],["Tail"]]);const original=editor.state.doc;select(editor,BlockSelection.create(original,position(0,0)));assert(move(editor,1));assert.deepEqual(texts(editor.state.doc),[[""],["Only"],[""],["Tail"]]);assert.deepEqual(adapter.serialize(editor.state.doc).questions[0].paragraphs,[]);roundTrip(editor,adapter);
 assert(move(editor,1));assert.deepEqual(texts(editor.state.doc)[2],["Only",""]);assert.equal(editor.state.doc.child(2).child(1).attrs.blockColor,"red");roundTrip(editor,adapter);assert(undo(editor.state,tr=>editor.view.dispatch(tr)));assert(undo(editor.state,tr=>editor.view.dispatch(tr)));assert(editor.state.doc.eq(original));
});

test("a moved parent carries rich children and a moved table retains its rectangular cell selection",()=>{
 const nested={type:"nestedBlock",content:[
   {type:"heading",attrs:{level:2,blockColor:"red"},content:[{type:"text",text:"Parent",marks:[{type:"bold"}]}]},
   {type:"paragraph",attrs:{blockColor:"green"},content:[{type:"text",text:"Child",marks:[{type:"italic"}]}]},
   {type:"taskList",content:[{type:"taskItem",attrs:{checked:true},content:[{type:"paragraph",content:[{type:"text",text:"Checked"}]}]}]},
 ]};
 const table={type:"table",content:[0,1].map(row=>({type:"tableRow",content:[0,1].map(col=>({type:"tableCell",content:[{type:"paragraph",content:[{type:"text",text:`${row}${col}`}]}]}))}))};
 const {editor,adapter,position}=fixture([[nested,table],[],["Other"],["Last"]]);const original=editor.state.doc,cells=[];original.descendants((node,pos)=>{if(node.type.name==="tableCell")cells.push(pos);});select(editor,new CellSelection(original.resolve(cells[0]),original.resolve(cells[3])));assert(move(editor,1));assert.equal(editor.state.selection.toJSON().type,"cell");assert.equal(editor.state.selection.$anchorCell.node(1).attrs.index,1);assert(editor.state.doc.child(1).firstChild.eq(original.child(0).child(1)));assert(editor.state.doc.child(0).firstChild.eq(original.child(0).firstChild));roundTrip(editor,adapter);assert(undo(editor.state,tr=>editor.view.dispatch(tr)));assert(editor.state.doc.eq(original));
 select(editor,BlockSelection.create(editor.state.doc,position(0,0)));assert(move(editor,-1)===false);assert(move(editor,1));assert(move(editor,1));assert.equal(editor.state.doc.child(1).lastChild.textContent,"ParentChildChecked");assert(editor.state.doc.child(1).lastChild.eq(original.child(0).firstChild));roundTrip(editor,adapter);
});

test("question edges and nested own text remain fixed; unrelated hover moves focus only the moved block",()=>{
 const {editor,position}=fixture([["First"],["Other"],["Third"],["Last"]]);select(editor,BlockSelection.create(editor.state.doc,position(0,0)));assert.equal(move(editor,-1),false);select(editor,BlockSelection.create(editor.state.doc,position(3,0)));assert.equal(move(editor,1),false);
 select(editor,TextSelection.create(editor.state.doc,position(3,0)+2));assert(moveTextBlock(editor,position(1,0),-1));assert.equal(editor.state.selection.$from.parent.textContent,"Other");
 editor.isEditable=false;const before=editor.state.doc;assert.equal(move(editor,1),false);assert(editor.state.doc.eq(before));
 const nested={type:"nestedBlock",content:["Parent","Child","Next"].map(text=>({type:"paragraph",content:[{type:"text",text}]}))};const own=fixture([[nested],["Other"],[],[]]);select(own.editor,BlockSelection.create(own.editor.state.doc,own.position(0,0)+1+own.editor.state.doc.child(0).firstChild.firstChild.nodeSize));const unchanged=own.editor.state.doc;assert.equal(move(own.editor,-1),false);assert(own.editor.state.doc.eq(unchanged));assert(move(own.editor,1));assert.equal(own.editor.state.doc.child(0).firstChild.firstChild.textContent,"Parent");
});
