import assert from "node:assert/strict";
import test from "node:test";
import { getSchema } from "@tiptap/core";
import { MarkdownManager } from "@tiptap/markdown";
import { EditorState, TextSelection } from "@tiptap/pm/state";
import { history, undo, redo, closeHistory } from "@tiptap/pm/history";
import { inlineEditorExtensions } from "./inline-editor-extensions.js";
import { imageAlignmentTransaction, commitInlineImageAlignment } from "./inline-image-alignment.js";
const extensions=inlineEditorExtensions(),schema=getSchema(extensions),markdown=new MarkdownManager({extensions});
const p=text=>schema.nodes.paragraph.create(null,text?schema.text(text):null),image=()=>schema.nodes.image.create({src:"/image.png",alt:"Diagram",title:'A "title"',width:"120",height:60});
function fixture(wrapper=x=>x,alignment=null){const doc=schema.nodes.doc.create(null,[p("Before"),wrapper(schema.nodes.image.create({...image().attrs,alignment})),p("After")]);let position;doc.descendants((node,pos)=>{if(node.type.name==="image")position=pos;});const state=EditorState.create({schema,doc,selection:TextSelection.create(doc,2),plugins:[history()]});return {state,request:{doc,position,node:doc.nodeAt(position),selection:state.selection}};}
test("alignment preserves complete image attributes, prose selection and composite neighbours through exact history and Markdown",()=>{
 const wrappers=[x=>x,x=>schema.nodes.nestedBlock.create(null,[x,p("Child")]),x=>schema.nodes.columns.create(null,[schema.nodes.column.create(null,[x,p("Child")]),schema.nodes.column.create(null,p("Peer"))]),x=>schema.nodes.table.create(null,schema.nodes.tableRow.create(null,[schema.nodes.tableCell.create({colwidth:[180]},[x,p("Child")]),schema.nodes.tableCell.create(null,p("Peer"))])),x=>schema.nodes.details.create({open:true},[schema.nodes.detailsSummary.create(null,schema.text("Summary")),schema.nodes.detailsContent.create(null,[x,p("Child")])])];
 for(const wrapper of wrappers)for(const alignment of ["left","center","right"]){
  const {state,request}=fixture(wrapper,alignment==="left"?"right":null);let next=state.apply(imageAlignmentTransaction(state,request,alignment));next=next.apply(closeHistory(next.tr));const expected=JSON.parse(JSON.stringify(state.doc.toJSON()));const visit=node=>{if(node.type==="image")node.attrs.alignment=alignment;for(const child of node.content||[])visit(child);};visit(expected);assert(next.doc.eq(schema.nodeFromJSON(expected)));assert(next.selection.eq(state.selection));const restored=schema.nodeFromJSON(markdown.parse(markdown.serialize(next.doc.toJSON())));assert(restored.eq(next.doc));const apply=tr=>{next=next.apply(tr);};assert(undo(next,apply));assert(next.doc.eq(state.doc));assert(next.selection.eq(state.selection));assert(redo(next,apply));assert(next.doc.eq(restored));
 }
});
test("alignment rejects stale media, source or selection and never writes invalid or duplicate values",()=>{
 const {state,request}=fixture();for(const alignment of [null,"", "top", "CENTER", "center; color:red"])assert.equal(imageAlignmentTransaction(state,request,alignment),null);
 for(const invalid of [{...request,node:schema.nodes.image.create({src:"/other"})},{...request,position:0},{...request,doc:schema.nodeFromJSON(state.doc.toJSON())},{...request,selection:TextSelection.create(state.doc,3)}])assert.equal(imageAlignmentTransaction(state,invalid,"center"),null);
 const tr=imageAlignmentTransaction(state,request,"center"),next=state.apply(tr),same={...request,doc:next.doc,selection:next.selection,node:next.doc.nodeAt(request.position)};assert.equal(imageAlignmentTransaction(next,same,"center"),null);
});
test("alignment honors access and composition without stealing focus",()=>{
 const {state,request}=fixture();for(const flags of [{isDestroyed:true},{isEditable:false},{composing:true}]){
  let writes=0;const editor={isDestroyed:false,isEditable:true,state,view:{composing:false,dispatch(){writes++;}},...flags};if(flags.composing)editor.view.composing=true;assert.equal(commitInlineImageAlignment(editor,request,"right"),false);assert.equal(writes,0);
 }
 let current=state;const editor={isDestroyed:false,isEditable:true,get state(){return current;},view:{composing:false,dispatch(tr){current=current.apply(tr);}}};assert(commitInlineImageAlignment(editor,request,"right"));assert(current.selection.eq(state.selection));assert.equal(current.doc.nodeAt(request.position).attrs.alignment,"right");
});

test("image alignment retains explicit normal quote text and exact rich link metadata nearby", () => {
 const marks=[schema.marks.bold.create(),schema.marks.normalText.create(),schema.marks.link.create({href:"https://example.test/a)b",title:'A "title"',target:"_self",rel:"author",class:"authored-link"})];
 const doc=schema.nodes.doc.create(null,[p("Before"),image(),schema.nodes.blockquote.create(null,schema.nodes.paragraph.create(null,schema.text("фрагмент",marks))),p("After")]);
 const state=EditorState.create({schema,doc,selection:TextSelection.create(doc,2)}),position=doc.child(0).nodeSize,request={doc,position,node:doc.nodeAt(position),selection:state.selection};
 const next=state.apply(imageAlignmentTransaction(state,request,"center"));
 assert(next.doc.child(2).eq(doc.child(2)));assert(schema.nodeFromJSON(markdown.parse(markdown.serialize(next.doc.toJSON()))).eq(next.doc));
});
