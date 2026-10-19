import assert from "node:assert/strict";
import test from "node:test";
import { getSchema } from "@tiptap/core";
import { EditorState, TextSelection } from "@tiptap/pm/state";
import { closeHistory, history, undo } from "@tiptap/pm/history";
import { MarkdownManager } from "@tiptap/markdown";
import { inlineEditorExtensions } from "./inline-editor-extensions.js";
import { changeBlockDepth } from "./inline-block-tree.js";
import { BlockSelection } from "./inline-block-selection.js";
import { handleBlockKeyDown } from "./inline-block-selection-extension.js";
import { convertSeparateBlockTypes } from "./inline-block-types.js";
import { parseBlockHTML } from "./inline-table-markdown.js";
import { createFourQuestionAdapter, questionScopes, validQuestionDocument } from "./four-question-document.js";
import { IDENTITY_QUESTION_TITLES } from "../../shared/identity-questions.js";
const extensions=inlineEditorExtensions(),schema=getSchema(extensions),markdown=new MarkdownManager({extensions});
const p=text=>schema.nodes.paragraph.create(null,text?schema.text(text):null);
const apply=(state,lift=false)=>{const tr=changeBlockDepth(state,lift);assert(tr);return state.apply(closeHistory(tr));};

test("nonadjacent prose forms independent children and restores exact structure and selection through both Undo steps",()=>{
 for(const reverse of [false,true]){
  const doc=schema.nodes.doc.create(null,['A','B','C','D','E'].map(p)),selection=BlockSelection.fromPositions(doc,[3,9],reverse?9:3,reverse?3:9);
  let state=EditorState.create({doc,plugins:[history()],selection});state=apply(state);state=state.apply(closeHistory(state.tr));
  assert.deepEqual(state.doc.content.content.map(n=>n.type.name),['nestedBlock','nestedBlock','paragraph']);assert.deepEqual(state.selection.positions.map(pos=>state.doc.nodeAt(pos).textContent),['B','D']);assert.equal(state.selection.anchorBlock>state.selection.headBlock,reverse);
  assert.deepEqual(schema.nodeFromJSON(markdown.parse(markdown.serialize(state.doc.toJSON()))).toJSON(),state.doc.toJSON());
  const nested=state.doc;state=apply(state,true);state=state.apply(closeHistory(state.tr));assert(state.doc.eq(doc));assert(state.selection.eq(selection));assert(undo(state,tr=>{state=state.apply(tr);}));assert(state.doc.eq(nested));assert(undo(state,tr=>{state=state.apply(tr);}));assert(state.doc.eq(doc));
 }
});

test("sparse list nesting preserves checked state and children; root lifting keeps child ownership and skipped ordered numbers",()=>{
 for(const [listName,itemName]of [['bulletList','listItem'],['orderedList','listItem'],['taskList','taskItem']])for(const reverse of [false,true]){
  const item=(text,children=[],checked=false)=>schema.nodes[itemName].create({checked,blockColor:text==='Second'?'red':null},[p(text),...children]);
  const child=schema.nodes[listName].create(null,item('Child',[],true)),items=[item('First'),item('Second',[child]),item('Gap',[],true),item('Fourth'),item('Tail')],doc=schema.nodes.doc.create(null,schema.nodes[listName].create(listName==='orderedList'?{start:7}:null,items)),second=1+items[0].nodeSize,fourth=second+items[1].nodeSize+items[2].nodeSize;
  const selection=BlockSelection.fromPositions(doc,[second,fourth],reverse?fourth:second,reverse?second:fourth);let state=EditorState.create({doc,plugins:[history()],selection});state=apply(state);state=state.apply(closeHistory(state.tr));assert.equal(state.doc.firstChild.childCount,3);assert.deepEqual(state.selection.positions.map(pos=>state.doc.nodeAt(pos).textContent),['SecondChild','Fourth']);const nested=state.doc;
  state=apply(state,true);state=state.apply(closeHistory(state.tr));assert(state.doc.eq(doc));assert(state.selection.eq(selection));assert(undo(state,tr=>{state=state.apply(tr);}));assert(state.doc.eq(nested));assert(undo(state,tr=>{state=state.apply(tr);}));assert(state.doc.eq(doc));
  state=apply(state,true);assert(state.selection.content().content.textBetween(0,state.selection.content().content.size).includes('Child'));assert.equal(state.doc.child(1).type.name,'nestedBlock');assert.equal(state.doc.child(1).attrs.blockColor,'red');assert.equal(state.doc.child(1).lastChild.textContent,'Child');
  if(listName==='orderedList')assert.deepEqual(state.doc.content.content.filter(n=>n.type.name===listName).map(n=>n.attrs.start),[7,9,11]);assert.deepEqual(schema.nodeFromJSON(markdown.parse(markdown.serialize(state.doc.toJSON()))).toJSON(),state.doc.toJSON());
 }
});

test("duplicated immutable nodes are distinguished by occurrence rather than object identity",()=>{
 const repeated=p('Same'),doc=schema.nodes.doc.create(null,[repeated,repeated,repeated,repeated]),selection=BlockSelection.fromPositions(doc,[6,18]),state=apply(EditorState.create({doc,selection}));assert.equal(state.selection.positions.length,2);assert.deepEqual(state.doc.content.content.map(n=>[n.type.name,n.childCount]),[['nestedBlock',2],['nestedBlock',2]]);
});

test("a native caret keeps its character offset and pending marks while changing depth",()=>{
 const doc=schema.nodes.doc.create(null,[p('First'),p('Second')]);let state=EditorState.create({doc,selection:TextSelection.create(doc,doc.firstChild.nodeSize+4)});state=state.apply(state.tr.setStoredMarks([schema.marks.bold.create()]));const tr=changeBlockDepth(state);assert(tr);assert.equal(tr.selection.$from.parent.textContent,'Second');assert.equal(tr.selection.$from.parentOffset,3);assert.deepEqual(tr.storedMarks,state.storedMarks);
});

test("plain children below a list retain their own text type and can return outside the list",()=>{
 for(const [listName,itemName]of [['bulletList','listItem'],['orderedList','listItem'],['taskList','taskItem']]){
  const list=schema.nodes[listName].create(null,schema.nodes[itemName].createAndFill(null,p('Parent'))),doc=schema.nodes.doc.create(null,[list,p('Child'),p('Tail')]),selection=BlockSelection.create(doc,list.nodeSize);let state=EditorState.create({doc,selection});state=apply(state);assert.deepEqual(schema.nodeFromJSON(markdown.parse(markdown.serialize(state.doc.toJSON()))).toJSON(),state.doc.toJSON());assert.equal(state.doc.firstChild.lastChild.lastChild.type.name,'paragraph');assert.equal(state.doc.firstChild.lastChild.lastChild.textContent,'Child');state=apply(state,true);assert(state.doc.eq(doc));assert(state.selection.eq(selection));
 }
});

test("nesting selected answers preserves immutable prompts, other answers and rich-source round trips",()=>{
 const adapter=createFourQuestionAdapter(),schema=getSchema([...inlineEditorExtensions(undefined,adapter.documentExtension),...adapter.extensions]),value={questions:IDENTITY_QUESTION_TITLES.map((title,index)=>({title,paragraphs:[`A${index}`,`B${index}`]}))},doc=schema.nodeFromJSON(adapter.parse(value)),scopes=questionScopes(doc),positions=[scopes[0].from+doc.child(0).firstChild.nodeSize,scopes[2].from+doc.child(2).firstChild.nodeSize];let state=EditorState.create({doc,selection:BlockSelection.fromPositions(doc,positions)});state=apply(state);assert(validQuestionDocument(state.doc));assert(state.doc.child(1).eq(doc.child(1)));assert(state.doc.child(3).eq(doc.child(3)));const next=createFourQuestionAdapter();assert.deepEqual(schema.nodeFromJSON(next.parse(adapter.serialize(state.doc))).toJSON(),state.doc.toJSON());state=apply(state,true);assert(state.doc.eq(doc));
});

test("parent conversion preserves independent child styles and checked descendants",()=>{
 const head=schema.nodes.paragraph.create({blockColor:'red'},schema.text('Head',[schema.marks.bold.create()])),child=schema.nodes.paragraph.create({blockColor:'green'},schema.text('Child')),tasks=schema.nodes.taskList.create(null,schema.nodes.taskItem.create({checked:true},p('Checked'))),doc=schema.nodes.doc.create(null,schema.nodes.nestedBlock.create({blockColor:'blue_background'},[head,child,tasks]));
 for(const id of ['paragraph','heading2','blockquote','bulletList','orderedList','taskList','details','codeBlock']){
  const state=EditorState.create({doc,selection:BlockSelection.create(doc,0)}),tr=state.tr;assert(convertSeparateBlockTypes(tr,id));tr.doc.check();const children=[];tr.doc.descendants(node=>{if(node.textContent==='Child'&&node.isTextblock)children.push(node);});assert.equal(children.length,1);assert.equal(children[0].attrs.blockColor,'green');let checked=0;tr.doc.descendants(node=>{if(node.type.name==='taskItem'&&node.attrs.checked&&node.textContent==='Checked')checked++;});assert.equal(checked,1);assert.deepEqual(schema.nodeFromJSON(markdown.parse(markdown.serialize(tr.doc.toJSON()))).toJSON(),tr.doc.toJSON());
 }
});

test("invalid nesting is atomic, read-only/IME shortcuts stay untouched and canonical trees reject raw text or scripts",()=>{
 const doc=schema.nodes.doc.create(null,[p('First'),p('Second'),p('Third')]),selection=BlockSelection.fromPositions(doc,[0,doc.firstChild.nodeSize+doc.child(1).nodeSize]),state=EditorState.create({doc,selection});assert.equal(changeBlockDepth(state),null);assert(state.doc.eq(doc));let dispatches=0;const editor={state,isEditable:false,view:{composing:false,dispatch(){dispatches++;}}};assert.equal(handleBlockKeyDown(editor,{key:'Tab'}),false);editor.isEditable=true;assert.equal(handleBlockKeyDown(editor,{key:'Tab',isComposing:true}),false);assert.equal(dispatches,0);
 for(const content of ['naked text','<script>bad()</script>'])assert.throws(()=>parseBlockHTML(`<div data-inline-block="true"><div data-type="nestedBlock">${content}</div></div>`));
});


test("native list parents serialize nested prose children without flattening their hierarchy",()=>{
 for(const [listName,itemName]of [['bulletList','listItem'],['orderedList','listItem'],['taskList','taskItem']]){
  const item=schema.nodes[itemName].createAndFill(null,[p('Parent'),p('Child'),p('Grandchild')]),doc=schema.nodes.doc.create(null,schema.nodes[listName].create(null,item)),last=2+item.child(0).nodeSize+item.child(1).nodeSize;
  const tr=changeBlockDepth(EditorState.create({doc,selection:BlockSelection.create(doc,last)}));assert(tr);assert.equal(tr.doc.firstChild.firstChild.child(1).type.name,'nestedBlock');assert.deepEqual(schema.nodeFromJSON(markdown.parse(markdown.serialize(tr.doc.toJSON()))).toJSON(),tr.doc.toJSON());
 }
});

test("nesting refuses an unroundtrippable canonical depth without modifying a valid source document",()=>{
 let tree=p('Deep');for(let depth=0;depth<97;depth++)tree=schema.nodes.nestedBlock.create(null,[p('Head'),tree]);
 assert.doesNotThrow(()=>parseBlockHTML(markdown.serialize(schema.nodes.doc.create(null,tree).toJSON())));
 const parent=p('Outer'),doc=schema.nodes.doc.create(null,[parent,tree]),state=EditorState.create({doc,selection:BlockSelection.create(doc,parent.nodeSize)});assert.equal(changeBlockDepth(state),null);assert(state.doc.eq(doc));
});


test("a menu target changes only its block and leaves the source state's caret and unrelated text intact",()=>{
 const doc=schema.nodes.doc.create(null,[p("A"),p("B"),p("C")]),state=EditorState.create({doc,selection:TextSelection.create(doc,1)}),tr=changeBlockDepth(state,false,{position:doc.firstChild.nodeSize});assert(tr);assert.equal(state.selection.from,1);assert(state.doc.eq(doc));assert.equal(tr.doc.firstChild.type.name,"nestedBlock");assert.equal(tr.doc.firstChild.textContent,"AB");assert(tr.doc.lastChild.eq(doc.lastChild));assert.deepEqual(tr.selection.positions,[1+doc.firstChild.nodeSize]);
 const selected=BlockSelection.fromPositions(doc,[3,6]);const groupState=EditorState.create({doc,selection:selected});const group=changeBlockDepth(groupState,false,{position:6});assert(group);assert.equal(group.doc.firstChild.childCount,3);assert.equal(group.selection.positions.length,2);
});
