import { convertSeparateBlockTypes, convertSelectedBlocksToToggles } from "./inline-block-types.js";
import assert from "node:assert/strict";
import test from "node:test";
import { getSchema } from "@tiptap/core";
import { MarkdownManager } from "@tiptap/markdown";
import { AllSelection, EditorState, TextSelection } from "@tiptap/pm/state";
import { CellSelection,TableMap } from "@tiptap/pm/tables";
import { closeHistory,history,undo } from "@tiptap/pm/history";
import { inlineEditorExtensions } from "./inline-editor-extensions.js";
import { createBlockNode } from "./inline-block-nodes.js";
import { BlockSelection } from "./inline-block-selection.js";
import { blockColorTypes,safeBlockColor } from "./inline-block-color-values.js";
import { colorBlocks,inheritedBlockColor,setBlockColor,blockSelectionColor,captureBlockColors,restoreBlockColors } from "./inline-block-color.js";
import { createFourQuestionAdapter } from "./four-question-document.js";
import { IDENTITY_QUESTION_TITLES } from "../../shared/identity-questions.js";

const extensions=inlineEditorExtensions(),schema=getSchema(extensions),markdown=new MarkdownManager({extensions});
const p=value=>schema.nodes.paragraph.create(null,value?schema.text(value):null);
function editor(children){let state=EditorState.create({schema,doc:schema.nodes.doc.create(null,children),plugins:[history()]});return{schema,isEditable:true,get state(){return state;},commands:{focus(){}},view:{dispatch(tr){state=state.apply(tr);}}};}
const roundTrip=node=>{const doc=schema.nodes.doc.create(null,[p("До"),node,p("После")]).toJSON(),stored=markdown.serialize(doc);const restored=schema.nodeFromJSON(markdown.parse(stored));restored.check();assert.deepEqual(restored.toJSON(),doc,stored);return stored;};

test("type conversion restores independent colours of duplicate and empty blocks without touching neighbours",()=>{
  const children=["red","blue_background",null,"green"].map((blockColor,index)=>schema.nodes.paragraph.create({blockColor},index===1?null:schema.text("Одинаковый текст")));
  const e=editor([...children,p("Сосед")]);
  const head=children.slice(0,-1).reduce((sum,node)=>sum+node.nodeSize,0);
  e.view.dispatch(e.state.tr.setSelection(BlockSelection.create(e.state.doc,0,head)));
  const tr=e.state.tr,snapshot=captureBlockColors(tr);let pos=0;
  for(const child of children){tr.setNodeMarkup(pos,schema.nodes.heading,{level:2});pos+=child.nodeSize;}
  restoreBlockColors(tr,snapshot);tr.doc.check();
  assert.deepEqual(Array.from({length:4},(_,index)=>tr.doc.child(index).attrs.blockColor),["red","blue_background",null,"green"]);
  assert(tr.doc.lastChild.eq(e.state.doc.lastChild));
});

test("colour snapshots map only subsequent steps in a shared command transaction",()=>{
  const e=editor([schema.nodes.paragraph.create({blockColor:"purple"},schema.text("Мысль /h2")),p("Сосед")]);
  let tr=e.state.tr.setSelection(TextSelection.create(e.state.doc,10));
  tr.delete(7,10);const snapshot=captureBlockColors(tr);
  tr.setNodeMarkup(0,schema.nodes.heading,{level:2});restoreBlockColors(tr,snapshot);
  assert.equal(tr.doc.firstChild.attrs.blockColor,"purple");assert(tr.doc.lastChild.eq(e.state.doc.lastChild));
});

test("list wrapping restores the item colour so markers and backgrounds follow the text",()=>{
  const e=editor([schema.nodes.paragraph.create({blockColor:"blue_background"},schema.text("Пункт")),p("Сосед")]);
  const tr=e.state.tr,snapshot=captureBlockColors(tr);
  tr.setNodeMarkup(0,undefined,{blockColor:null});
  tr.wrap(tr.doc.resolve(0).blockRange(tr.doc.resolve(tr.doc.firstChild.nodeSize)),[{type:schema.nodes.bulletList},{type:schema.nodes.listItem}]);
  restoreBlockColors(tr,snapshot);tr.doc.check();
  assert.equal(tr.doc.firstChild.firstChild.attrs.blockColor,"blue_background");
  assert.equal(tr.doc.firstChild.firstChild.firstChild.attrs.blockColor,null);
  assert(tr.doc.lastChild.eq(e.state.doc.lastChild));
});

test("lifting an inherited colour out of a quote retains it in every resulting block",()=>{
  const quote=schema.nodes.blockquote.create({blockColor:"purple"},[p("Первый"),p("Второй")]);
  const e=editor([quote,p("Сосед")]);
  const tr=e.state.tr.setSelection(TextSelection.create(e.state.doc,2,quote.nodeSize-2));
  const snapshot=captureBlockColors(tr);
  tr.lift(tr.selection.$from.blockRange(tr.selection.$to),0);restoreBlockColors(tr,snapshot);tr.doc.check();
  assert.equal(tr.doc.childCount,3);assert.equal(tr.doc.child(0).attrs.blockColor,"purple");assert.equal(tr.doc.child(1).attrs.blockColor,"purple");
  assert(tr.doc.lastChild.eq(e.state.doc.lastChild));
});

test("colour restoration respects disjoint column ranges without restyling intervening cells",()=>{
  const cell=color=>schema.nodes.tableCell.create(null,schema.nodes.bulletList.create(null,schema.nodes.listItem.create(null,schema.nodes.paragraph.create({blockColor:color},schema.text(color)))));
  const table=schema.nodes.table.create(null,[["red","purple"],["blue_background","green"]].map(row=>schema.nodes.tableRow.create(null,row.map(cell))));
  const e=editor([table,p("Сосед")]),map=TableMap.get(table);
  e.view.dispatch(e.state.tr.setSelection(CellSelection.colSelection(e.state.doc.resolve(1+map.map[0]))));
  const tr=e.state.tr,snapshot=captureBlockColors(tr);assert.equal(snapshot.blocks.length,2);
  e.state.selection.forEachCell((node,pos)=>node.descendants((child,offset)=>{if(child.isTextblock)tr.setNodeMarkup(pos+1+offset,undefined,{blockColor:null});}));
  restoreBlockColors(tr,snapshot);tr.doc.check();
  for(const index of [1,3])assert(tr.doc.nodeAt(1+map.map[index]).eq(e.state.doc.nodeAt(1+map.map[index])));
  assert.equal(tr.doc.firstChild.child(0).child(0).firstChild.firstChild.attrs.blockColor,"red");
  assert.equal(tr.doc.firstChild.child(1).child(0).firstChild.firstChild.attrs.blockColor,"blue_background");
});

test("block colours round trip every supported node, including nested lists, toggles and cells",()=>{
  for(const type of blockColorTypes) {
    let node=type==="typographyBlock"?schema.nodes.typographyBlock.create({role:"statement"},schema.text("Мысль"))
      :type==="listItem"||type==="taskItem"?schema.nodes[type].create(null,p("Пункт"))
      :type==="tableCell"||type==="tableHeader"?schema.nodes[type].create(null,p("Ячейка"))
      :type==="detailsSummary"?schema.nodes.detailsSummary.create(null,schema.text("Название"))
      :type==="image"?schema.nodes.image.create({src:"https://example.test/image.png",width:320,height:"180"}):createBlockNode(schema,type==="heading"?"heading2":type);
    node=node.type.create({...node.attrs,blockColor:"green_background"},node.content,node.marks);
    if(type==="listItem"||type==="taskItem")node=schema.nodes[type==="listItem"?"bulletList":"taskList"].create(null,node);
    if(type==="tableCell"||type==="tableHeader")node=schema.nodes.table.create(null,schema.nodes.tableRow.create(null,node));
    if(type==="detailsSummary")node=schema.nodes.details.create({open:true},[node,schema.nodes.detailsContent.create(null,p("Внутри"))]);
    assert(roundTrip(node).includes('data-block-color="green_background"'),type);
  }
  for(const invalid of ["default","blue_background_extra","javascript:alert(1)","red\" onclick=\"x",{},1])assert.equal(safeBlockColor(invalid),null);
});

test("uncoloured Markdown stays unchanged and unsafe styled HTML stays literal",()=>{
  const legacy="## Заголовок\n\nТекст\n\n- Пункт";assert.equal(markdown.serialize(markdown.parse(legacy)),legacy);
  for(const html of ['<li><p>Пункт без списка</p></li>','<summary>Название без toggle</summary>','<p data-block-color="javascript:alert(1)">Текст</p>','<script>alert(1)</script>','<p onclick="alert(1)">Текст</p>','<img src="https://example.test/a" width="bad" data-width-number="true"/>']) {
    const source=`<div data-inline-block="true">${html}</div>`;assert.equal(markdown.parse(source).content[0].content[0].text,source);
  }
});

test("whole block colour changes attributes, preserves text/marks, and has a separate Undo",()=>{
  const e=editor([p("Первый"),p("Второй")]),before=e.state.doc.toJSON();
  e.view.dispatch(e.state.tr.setSelection(TextSelection.create(e.state.doc,2)));
  assert(setBlockColor(e,"red"));assert.equal(e.state.doc.firstChild.attrs.blockColor,"red");assert.equal(e.state.doc.lastChild.attrs.blockColor,null);
  e.view.dispatch(e.state.tr.insertText("!"));assert(undo(e.state,tr=>e.view.dispatch(tr)));assert.equal(e.state.doc.firstChild.attrs.blockColor,"red");
  assert(undo(e.state,tr=>e.view.dispatch(tr)));assert.deepEqual(e.state.doc.toJSON(),before);
  e.isEditable=false;assert(!setBlockColor(e,"red"));assert.deepEqual(e.state.doc.toJSON(),before);
});

test("block groups and cell selections apply once without touching neighbours or stored inline marks",()=>{
  const e=editor([p("A"),p("B"),p("C")]);e.view.dispatch(e.state.tr.setSelection(BlockSelection.create(e.state.doc,0,3)));
  assert(setBlockColor(e,"blue_background"));assert.equal(blockSelectionColor(e.state),"blue_background");assert.equal(e.state.doc.lastChild.attrs.blockColor,null);
  const table=createBlockNode(schema,"table"),f=editor([table,p("После")]),map=TableMap.get(table);
  f.view.dispatch(f.state.tr.setSelection(CellSelection.colSelection(f.state.doc.resolve(1+map.map[0]))));
  assert(setBlockColor(f,"yellow_background",{cells:true}));
  assert.equal(blockSelectionColor(f.state,{cells:true}),"yellow_background");
  f.state.doc.firstChild.forEach(row=>{assert.equal(row.child(0).attrs.blockColor,"yellow_background");assert.equal(row.child(1).attrs.blockColor,null);});
  assert.equal(f.state.storedMarks,null);roundTrip(f.state.doc.firstChild);
});

test("text ranges across protected answers colour their blocks without changing any fixed prompt",()=>{
  const adapter=createFourQuestionAdapter(),schema=getSchema([...inlineEditorExtensions(undefined,adapter.documentExtension),...adapter.extensions]);
  const content={questions:IDENTITY_QUESTION_TITLES.map((title,index)=>({title,paragraphs:[`Ответ ${index}`]}))};
  let state=EditorState.create({schema,doc:schema.nodeFromJSON(adapter.parse(content)),plugins:[history(),adapter.extensions.at(-1).config.addProseMirrorPlugins.call({})[0]]});
  const starts=[];state.doc.forEach((node,pos)=>starts.push(pos+2));
  state=state.apply(state.tr.setSelection(TextSelection.create(state.doc,starts[1]+3,starts[0]+1)));
  const before=state.doc.toJSON(),e={isEditable:true,get state(){return state;},commands:{focus(){}},view:{dispatch(tr){state=state.apply(tr);}}};
  assert(setBlockColor(e,"red"));assert.equal(state.doc.childCount,4);assert.equal(state.doc.child(0).firstChild.attrs.blockColor,"red");assert.equal(state.doc.child(1).firstChild.attrs.blockColor,"red");assert.equal(state.doc.child(2).firstChild.attrs.blockColor,null);assert.deepEqual(adapter.serialize(state.doc).questions.map(q=>q.title),IDENTITY_QUESTION_TITLES);
  assert(undo(state,tr=>e.view.dispatch(tr)));assert.deepEqual(state.doc.toJSON(),before);
  e.view.dispatch(state.tr.setSelection(new AllSelection(state.doc)));assert(setBlockColor(e,"green_background"));state.doc.forEach(section=>assert.equal(section.firstChild.attrs.blockColor,"green_background"));assert.deepEqual(adapter.serialize(state.doc).questions.map(q=>q.title),IDENTITY_QUESTION_TITLES);
});


test("converted sparse container colours repaint their own text and markers without changing a skipped block",()=>{
 for(const id of ["paragraph","heading2","bulletList","orderedList","taskList","blockquote","codeBlock","details"]){
  const nodes=[schema.nodes.paragraph.create({blockColor:"red"},schema.text("A",[schema.marks.bold.create()])),p("B"),schema.nodes.paragraph.create({blockColor:"green"},schema.text("C"))];
  const doc=schema.nodes.doc.create(null,nodes),last=nodes[0].nodeSize+nodes[1].nodeSize;
  let state=EditorState.create({doc,plugins:[history()],selection:BlockSelection.fromPositions(doc,[0,last])});
  const converted=closeHistory(state.tr);assert(id==="details"?convertSelectedBlocksToToggles(converted):convertSeparateBlockTypes(converted,id));converted.doc.check();state=state.apply(converted);state=state.apply(closeHistory(state.tr));
  const before=state.doc,selection=state.selection,snapshots=[state.doc];
  for(const colour of ["blue",null]){
   const tr=closeHistory(state.tr);assert(colorBlocks(tr,colour));tr.doc.check();const actual=[];
   tr.doc.descendants((node,pos)=>{if(node.isTextblock)actual.push({text:node.textContent,colour:inheritedBlockColor(tr.doc.resolve(pos+1))});});
   assert.deepEqual(actual.filter(n=>["A","C"].includes(n.text)).map(n=>n.colour),[colour,colour],id);
   assert(tr.doc.child(1).eq(nodes[1]),id);assert(tr.selection.eq(selection),id);
   state=state.apply(tr);state=state.apply(closeHistory(state.tr));snapshots.push(state.doc);
  }
  assert(undo(state,tr=>{state=state.apply(tr);}));assert(state.doc.eq(snapshots[1]),`${id}: reset has its own Undo`);
  assert(undo(state,tr=>{state=state.apply(tr);}));assert(state.doc.eq(before),`${id}: recolour has its own Undo`);
  assert(undo(state,tr=>{state=state.apply(tr);}));assert(state.doc.eq(doc),`${id}: conversion Undo retains the original`);
 }
});

test("recolour clears a container's old first-line block style and retains independent nested colours and inline marks",()=>{
 const purple=schema.marks.inlineStyle.create({color:"purple"});
 const title=schema.nodes.paragraph.create({blockColor:"red"},schema.text("Свой текст",[purple]));
 const child=schema.nodes.paragraph.create({blockColor:"pink"},schema.text("Дочерний"));
 for(const type of ["blockquote","listItem","taskItem"]){
  const container=schema.nodes[type].create({blockColor:"green"},[title,child]);
  const outer=type==="blockquote"?container:schema.nodes[type==="taskItem"?"taskList":"bulletList"].create(null,container);
  const doc=schema.nodes.doc.create(null,[outer,p("Сосед")]),position=type==="blockquote"?0:1;
  const state=EditorState.create({doc,selection:BlockSelection.create(doc,position)}),tr=state.tr;assert(colorBlocks(tr,"blue"));
  const changed=tr.doc.nodeAt(position);assert.equal(changed.attrs.blockColor,"blue");assert.equal(changed.firstChild.attrs.blockColor,null);assert(changed.firstChild.content.eq(title.content));assert(changed.child(1).eq(child));assert(tr.doc.lastChild.eq(doc.lastChild));
 }
});


test("uncoloured list items preserve separate rich child blocks, including dividers and extra paragraphs",()=>{
 const extensions=inlineEditorExtensions(),schema=getSchema(extensions),manager=new MarkdownManager({extensions});
 const paragraph=schema.nodes.paragraph.create(null,schema.text(" leading",[schema.marks.strike.create()]));
 const children=[schema.nodes.horizontalRule.create(),schema.nodes.paragraph.create(null,schema.text("Second paragraph")),schema.nodes.heading.create({level:3},schema.text("Child heading")),schema.nodes.codeBlock.create({language:"js"},schema.text("const x = 1;")),schema.nodes.image.create({src:"https://example.com/image.png",alt:"Child image"}),schema.nodes.blockquote.create(null,schema.nodes.paragraph.create(null,schema.text("Child quote")))];
 for(const type of ["bulletList","orderedList","taskList"])for(const child of children){
  const item=schema.nodes[type==="taskList"?"taskItem":"listItem"].create(type==="taskList"?{checked:true}:null,[paragraph,child]);
  const list=schema.nodes[type].create(type==="orderedList"?{start:3,type:"a"}:null,item);
  for(const root of [list,schema.nodes.blockquote.create(null,list)]){
   const doc=schema.nodes.doc.create(null,root);doc.check();const stored=manager.serialize(doc.toJSON()),restored=schema.nodeFromJSON(manager.parse(stored));restored.check();assert(restored.eq(doc),`${type}/${child.type.name}: ${stored}`);
  }
 }
});
