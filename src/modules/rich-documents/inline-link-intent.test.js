import test from "node:test";
import assert from "node:assert/strict";
import { getSchema } from "@tiptap/core";
import { EditorState, TextSelection } from "@tiptap/pm/state";
import { closeHistory, history, undo, redo } from "@tiptap/pm/history";
import { inlineEditorExtensions } from "./inline-editor-extensions.js";
import { BlockSelection } from "./inline-block-selection.js";
import { captureInlineLinkIntent, mapInlineLinkIntent, inlineLinkTransaction, commitInlineLink } from "./inline-link-intent.js";
const schema = getSchema(inlineEditorExtensions());
const p = (text, marks=[]) => schema.nodes.paragraph.create(null, text ? schema.text(text, marks) : null);
const doc = (...blocks) => schema.nodes.doc.create(null, blocks);
const state = (document, anchor=1, head=anchor) => EditorState.create({schema, doc:document, selection:TextSelection.create(document, anchor, head), plugins:[history()]});
const href = "https://example.test/link";

test("a link at an empty caret inserts visible URL text, retains nonlink styles and has one independent Undo", () => {
 let current=state(doc(p("Before")),4);current=current.apply(current.tr.setStoredMarks([schema.marks.italic.create()]));
 const before=current.doc,intent=captureInlineLinkIntent(current),tr=inlineLinkTransaction(current,intent,href);assert(tr);current=current.apply(tr);current=current.apply(closeHistory(current.tr));
 assert.equal(current.doc.textContent,"Bef"+href+"ore");assert.equal(current.doc.firstChild.child(1).text,href);assert(current.doc.firstChild.child(1).marks.some(m=>m.type.name==="italic"));assert(current.doc.firstChild.child(1).marks.some(m=>m.type.name==="link"));assert(!current.storedMarks.some(m=>m.type.name==="link"));
 const inserted=current.doc;current=current.apply(current.tr.insertText(" after"));const dispatch=tr=>{current=current.apply(tr);};assert(undo(current,dispatch));assert(current.doc.eq(inserted));assert(undo(current,dispatch));assert(current.doc.eq(before));assert(redo(current,dispatch));assert(current.doc.eq(inserted));
});

test("editing or removing a link at its caret owns the full link and preserves rich neighbours and link metadata", () => {
 const mark=schema.marks.link.create({href:"/old",title:"Keep title",target:"_self"});
 const document=doc(schema.nodes.paragraph.create(null,[schema.text("Before "),schema.text("target",[mark,schema.marks.bold.create()]),schema.text(" after")]));
 let current=state(document,10),intent=captureInlineLinkIntent(current);assert.equal(intent.target.from,8);assert.equal(intent.target.to,14);
 current=current.apply(inlineLinkTransaction(current,intent,href));const linked=current.doc.firstChild.child(1);assert.equal(linked.marks.find(m=>m.type.name==="link").attrs.title,"Keep title");assert.equal(linked.marks.find(m=>m.type.name==="link").attrs.target,"_self");assert.equal(current.doc.textContent,document.textContent);
 current=current.apply(current.tr.setSelection(TextSelection.create(current.doc,10)));intent=captureInlineLinkIntent(current);current=current.apply(inlineLinkTransaction(current,intent,""));assert.equal(current.doc.firstChild.child(1).marks.length,1);assert.equal(current.doc.firstChild.child(1).marks[0].type.name,"bold");
});

test("a pending link maps edits before and after its target without including inserted neighbours", () => {
 for(const direction of ["forward","backward"]){
  let current=state(doc(p("First target tail")),direction==="forward"?7:13,direction==="forward"?13:7),intent=captureInlineLinkIntent(current);
  for(const [position,text] of [[1,"Prefix "],[current.doc.content.size-1+7," suffix"]]){
   const tr=current.tr.insertText(text,position);intent=mapInlineLinkIntent(intent,tr);assert(intent);current=current.apply(tr);
  }
  current=current.apply(inlineLinkTransaction(current,intent,href));const links=[];current.doc.descendants(node=>{if(node.isText&&node.marks.some(m=>m.type.name==="link"))links.push(node.text);});assert.deepEqual(links,["target"]);
 }
 const current=state(doc(p("First document")),1,15),intent=captureInlineLinkIntent(current),tr=current.tr.insert(15,schema.text(" FIRST"));const mapped=mapInlineLinkIntent(intent,tr);assert(mapped);assert.equal(mapped.target.to,15);assert.equal(tr.doc.textBetween(mapped.target.from,mapped.target.to),"First document");
});

test("replacement, selected text or mark changes and explicit target changes cancel pending intent", () => {
 const current=state(doc(p("Original target"),p("Second")),1,9),intent=captureInlineLinkIntent(current);
 const cases=[current.tr.replaceWith(0,current.doc.content.size,doc(p("Remote replacement")).content),current.tr.insertText("change",4),current.tr.addMark(2,4,schema.marks.bold.create()),current.tr.setSelection(TextSelection.create(current.doc,12))];
 for(const tr of cases)assert.equal(mapInlineLinkIntent(intent,tr),null);
 const remote=state(doc(p("Remote replacement")));assert.equal(inlineLinkTransaction(remote,intent,href),null);assert.equal(inlineLinkTransaction(current,intent,"javascript:alert(1)"),null);
});

test("empty insertion intent follows earlier text but cancels insertion at the caret and full source replacement", () => {
 const current=state(doc(p("Before tail")),7),intent=captureInlineLinkIntent(current),tr=current.tr.insertText("prefix ",1);const mapped=mapInlineLinkIntent(intent,tr);assert(mapped);assert.equal(mapped.target.from,14);
 assert.equal(mapInlineLinkIntent(intent,current.tr.insertText("other",7)),null);assert.equal(mapInlineLinkIntent(intent,current.tr.replaceWith(0,current.doc.content.size,p("Replacement"))),null);
 const code=doc(schema.nodes.codeBlock.create(null,schema.text("literal")));assert.equal(captureInlineLinkIntent(state(code,2)),null);
});

test("a sparse block link applies only to the captured owners and retains an unselected peer", () => {
 const document=doc(p("First"),p("Peer"),p("Third"));let current=state(document);current=current.apply(current.tr.setSelection(BlockSelection.fromPositions(document,[0,13])));
 const intent=captureInlineLinkIntent(current),next=current.apply(inlineLinkTransaction(current,intent,href));assert(next.doc.child(0).firstChild.marks.some(m=>m.type.name==="link"));assert(next.doc.child(1).eq(document.child(1)));assert(next.doc.child(2).firstChild.marks.some(m=>m.type.name==="link"));assert.equal(next.selection.toJSON().type,"rollappBlocks");
});

test("revoked access, composition, destroyed editor and focus-time changes cannot commit stale link intent", () => {
 for(const reason of ["access","ime","destroyed","focus-change"]){
  let current=state(doc(p("Target")),1,7),focuses=0;const before=current.doc,intent=captureInlineLinkIntent(current);
  const editor={isEditable:reason!=="access",isDestroyed:reason==="destroyed",get state(){return current;},view:{composing:reason==="ime",focus(){focuses++;if(reason==="focus-change")current=current.apply(current.tr.insertText("other",2));},dispatch(tr){current=current.apply(tr);}}};
  assert.equal(commitInlineLink(editor,intent,href),false);assert.equal(focuses,reason==="focus-change"?1:0);if(reason!=="focus-change")assert(current.doc.eq(before));assert(!current.storedMarks?.some(m=>m.type.name==="link"));
 }
});
