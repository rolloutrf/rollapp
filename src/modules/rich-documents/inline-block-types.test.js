import assert from "node:assert/strict";
import test from "node:test";
import { getSchema } from "@tiptap/core";
import { EditorState, TextSelection } from "@tiptap/pm/state";
import { history, closeHistory, undo } from "@tiptap/pm/history";
import { inlineEditorExtensions } from "./inline-editor-extensions.js";
import { BlockSelection, isBlockSelection } from "./inline-block-selection.js";
import { convertSeparateBlockTypes, convertSelectedBlocksToToggles } from "./inline-block-types.js";
import { CellSelection, TableMap } from "@tiptap/pm/tables";

const schema = getSchema(inlineEditorExtensions());
const p = (text, blockColor = null) => schema.nodes.paragraph.create({ blockColor }, text ? schema.text(text) : null);
const toggle = (text, body = [p("Внутри")]) => schema.nodes.details.create({ open: true, blockColor: "blue_background" }, [schema.nodes.detailsSummary.create(null, schema.text(text)), schema.nodes.detailsContent.create(null, body)]);

test("turning a mixed group into toggles retains every title, colour, direction and one Undo", () => {
  const children = [p("Красный", "red"), schema.nodes.heading.create({ level: 2, blockColor: "blue_background" }, schema.text("Синий", [schema.marks.bold.create()])), p(""), p("Сосед")];
  let state = EditorState.create({ schema, doc: schema.nodes.doc.create(null, children), plugins: [history()] });
  state = state.apply(state.tr.setSelection(BlockSelection.create(state.doc, children[0].nodeSize + children[1].nodeSize, 0)));
  const before = state.doc.toJSON(), tr = closeHistory(state.tr);
  assert(convertSelectedBlocksToToggles(tr));tr.doc.check();
  assert.deepEqual(Array.from({ length: 3 }, (_, index) => tr.doc.child(index).type.name), Array(3).fill("details"));
  assert.deepEqual(Array.from({ length: 3 }, (_, index) => tr.doc.child(index).attrs.blockColor), ["red", "blue_background", null]);
  assert(tr.doc.child(1).firstChild.content.eq(children[1].content));
  assert(tr.doc.lastChild.eq(children[3]));
  assert(isBlockSelection(tr.selection));assert(tr.selection.anchorBlock > tr.selection.headBlock);
  state = state.apply(tr);state = state.apply(closeHistory(state.tr));
  assert(undo(state, transaction => { state = state.apply(transaction); }));assert.deepEqual(state.doc.toJSON(), before);
});

test("turning list items into toggles preserves nested children and their own colours", () => {
  const inner = schema.nodes.bulletList.create(null, schema.nodes.listItem.create({ blockColor: "purple" }, p("Дочерний")));
  const first = schema.nodes.listItem.create({ blockColor: "red" }, [p("Первый"), inner]);
  const second = schema.nodes.listItem.create({ blockColor: "green" }, [p("Второй"), inner]);
  const list = schema.nodes.bulletList.create(null, [first, second]);
  const state = EditorState.create({ schema, doc: schema.nodes.doc.create(null, [list, p("Сосед")]) });
  const tr = state.tr.setSelection(BlockSelection.create(state.doc, 1, 1 + first.nodeSize));
  assert(convertSelectedBlocksToToggles(tr));tr.doc.check();
  assert.equal(tr.doc.childCount, 3);assert.equal(tr.doc.firstChild.type.name, "details");
  assert.equal(tr.doc.firstChild.attrs.blockColor, "red");
  const nested = tr.doc.firstChild.child(1).firstChild;
  assert.equal(nested.type.name, "details");assert.equal(nested.attrs.blockColor, "purple");assert.equal(nested.firstChild.textContent, "Дочерний");
  assert.equal(tr.doc.child(1).attrs.blockColor, "green");assert.equal(tr.doc.child(1).firstChild.textContent, "Второй");
  assert.equal(tr.doc.child(1).child(1).firstChild.type.name,"details");assert(isBlockSelection(tr.selection));
  assert(tr.doc.lastChild.eq(state.doc.lastChild));
});

test("existing toggles and their bodies remain intact when a partial summary and the next block are converted", () => {
  const existing = toggle("Готовый toggle");
  const state = EditorState.create({ schema, doc: schema.nodes.doc.create(null, [existing, p("Новый", "green"), p("Сосед")]) });
  const tr = state.tr.setSelection(TextSelection.create(state.doc, 3, existing.nodeSize + 4));
  assert(convertSelectedBlocksToToggles(tr));tr.doc.check();
  assert(tr.doc.firstChild.eq(existing));assert.equal(tr.doc.childCount, 3);
  assert.equal(tr.doc.child(1).type.name, "details");assert.equal(tr.doc.child(1).attrs.blockColor, "green");
  assert.equal(tr.doc.child(1).firstChild.textContent, "Новый");assert(tr.doc.lastChild.eq(state.doc.lastChild));
});

test("a column turns into toggles without changing unselected cells and retains cell selection", () => {
  const table = schema.nodes.table.create(null, [["red","purple"],["blue_background","green"]].map(row => schema.nodes.tableRow.create(null,row.map(color => schema.nodes.tableCell.create(null,p(color,color))))));
  const state=EditorState.create({schema,doc:schema.nodes.doc.create(null,[table,p("Сосед")])}),map=TableMap.get(table);
  const tr=state.tr.setSelection(CellSelection.colSelection(state.doc.resolve(1+map.map[0])));
  assert(convertSelectedBlocksToToggles(tr));tr.doc.check();assert(tr.selection instanceof CellSelection);
  const changed=tr.doc.firstChild;
  assert.equal(changed.child(0).child(0).firstChild.type.name,"details");assert.equal(changed.child(1).child(0).firstChild.type.name,"details");
  assert.equal(changed.child(0).child(0).firstChild.attrs.blockColor,"red");assert.equal(changed.child(1).child(0).firstChild.attrs.blockColor,"blue_background");
  for(const row of [0,1])assert(changed.child(row).child(1).eq(table.child(row).child(1)));
  let count=0;tr.selection.forEachCell(()=>{count+=1;});assert.equal(count,2);assert(tr.doc.lastChild.eq(state.doc.lastChild));
});

test("turning a single paragraph into a toggle preserves the caret within its title", () => {
  const state=EditorState.create({schema,doc:schema.nodes.doc.create(null,[p("Начало и конец","red"),p("Сосед")])});
  const tr=state.tr.setSelection(TextSelection.create(state.doc,8));
  const offset=tr.selection.$from.parentOffset;
  assert(convertSelectedBlocksToToggles(tr));
  assert.equal(tr.selection.$from.parent.type.name,"detailsSummary");assert.equal(tr.selection.$from.parentOffset,offset);
  assert.equal(tr.doc.firstChild.firstChild.textContent,"Начало и конец");assert.equal(tr.doc.firstChild.attrs.blockColor,"red");
});

test("sparse toggle conversion retains only converted nodes instead of their mapped neighbours", () => {
  const children=[p("Первый","red"),p("Пропуск"),p("Третий","green"),p("Сосед")];
  const doc=schema.nodes.doc.create(null,children),third=children[0].nodeSize+children[1].nodeSize;
  let state=EditorState.create({schema,doc,plugins:[history()],selection:BlockSelection.fromPositions(doc,[0,third],third,0)});
  const tr=closeHistory(state.tr);assert(convertSelectedBlocksToToggles(tr));tr.doc.check();
  assert(tr.doc.child(1).eq(children[1]));assert(tr.doc.child(3).eq(children[3]));
  assert.deepEqual(tr.selection.positions.map(pos=>tr.doc.nodeAt(pos).firstChild.textContent),["Первый","Третий"]);
  assert(tr.selection.disjoint);assert(tr.selection.anchor>tr.selection.head);
  state=state.apply(tr);assert(undo(state,transaction=>{state=state.apply(transaction);}));
  assert(state.doc.eq(doc));assert.deepEqual(state.selection.positions,[0,third]);
});


test("sparse type conversion splits a nested ordered list without rewriting skipped items or their numbering",()=>{
  for(const id of ["heading2","paragraph","blockquote","bulletList","taskList","codeBlock"]){
    const nested=schema.nodes.bulletList.create(null,schema.nodes.listItem.create(null,p("Дочерний")));
    const first=schema.nodes.listItem.create({blockColor:"red"},[p("Первый","green"),nested]);
    const middle=schema.nodes.listItem.create({blockColor:"blue_background"},p("Пропуск")),last=schema.nodes.listItem.create(null,p("Третий"));
    const list=schema.nodes.orderedList.create({start:5},[first,middle,last]),doc=schema.nodes.doc.create(null,[list,p("Сосед")]);
    const third=1+first.nodeSize+middle.nodeSize;
    let state=EditorState.create({schema,doc,plugins:[history()],selection:BlockSelection.fromPositions(doc,[1,third])});
    const tr=closeHistory(state.tr);assert(convertSeparateBlockTypes(tr,id));tr.doc.check();
    const skipped=[];tr.doc.descendants(node=>{if(node.type.name==="orderedList"&&node.firstChild.eq(middle))skipped.push(node);});
    assert.equal(skipped.length,1,id);assert.equal(skipped[0].attrs.start,6,id);assert(skipped[0].firstChild.eq(middle),id);assert(tr.doc.lastChild.eq(doc.lastChild));
    assert(!tr.selection.content().content.textBetween(0,tr.selection.content().size).includes("Пропуск"),id);
    const child=[];tr.doc.descendants((node,pos)=>{if(node.isTextblock&&node.textContent==="Дочерний")child.push({node,pos});});assert.equal(child.length,1,id);
    const inside=tr.doc.resolve(child[0].pos+1);let colour=null;for(let depth=1;depth<=inside.depth;depth+=1)colour=inside.node(depth).attrs.blockColor||colour;
    assert.equal(colour,"red",`${id}: inherited child colour survives changing its parent type`);
    state=state.apply(tr);assert(undo(state,t=>{state=state.apply(t);}));assert(state.doc.eq(doc),id);assert.deepEqual(state.selection.positions,[1,third]);
  }
});
