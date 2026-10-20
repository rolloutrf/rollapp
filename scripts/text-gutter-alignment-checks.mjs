import assert from "node:assert/strict";
import {getSchema} from "@tiptap/core";
import {inlineEditorExtensions} from "../src/lib/inline-editor-extensions.js";
import {blockHTML} from "../src/lib/inline-table-markdown.js";
const extensions=inlineEditorExtensions(),schema=getSchema(extensions);
const p=text=>({type:"paragraph",content:text?[{type:"text",text}]:[]});
const content=[...[1,2,3,4,5,6].map(level=>({type:"heading",attrs:{level},content:[{type:"text",text:`Заголовок ${level}: Расскажи про свой самый крутой проект? Почему он?`}]})),p("Обычный абзац с длинным текстом, который переносится на несколько строк, чтобы ручка оставалась рядом с первой строкой, а не с центром всего блока. ".repeat(3)),p(""),{type:"nestedBlock",content:[{type:"heading",attrs:{level:3},content:[{type:"text",text:"Родитель с дочерним текстом"}]},p("Дочерний абзац")]},{type:"columns",content:[{type:"column",content:[{type:"heading",attrs:{level:2},content:[{type:"text",text:"Левая колонка"}]}]},{type:"column",content:[p("Правая колонка")]}]}];
content.push({type:"blockquote",content:[p("Одна цитата, одна направляющая")]},{type:"blockquote",content:[p("Цитата из нескольких абзацев"),p("Второй абзац цитаты")]});
const source=content.map(value=>blockHTML(schema.nodeFromJSON(value).toJSON())).join("\n\n");
const frames=page=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
export async function checkGutterAlignment(browser,origin){
 for(const [width,height] of [[320,844],[390,844],[768,844],[820,844],[1024,844],[1440,844],[1440,400],[1920,844]]){
  const page=await browser.newPage({viewport:{width,height}}),errors=[];page.on("pageerror",e=>errors.push(e.message));await page.route("**/api/**",r=>{errors.push("Unexpected API request");return r.abort();});
  await page.goto(`${origin}/__text-edit?source=${encodeURIComponent(source)}`);const editor=page.getByRole("textbox",{name:"О себе",exact:true});await editor.locator('[data-type="columns"]').waitFor();await page.evaluate(()=>document.fonts.ready);const original=await editor.evaluate(el=>el.editor.getJSON());
  if(width>=1024){
   const targets=[...await editor.locator(':scope > :is(h1,h2,h3,h4,h5,h6,p)').all(),editor.locator('[data-type="nestedBlock"] > h3'),editor.locator('[data-type="nestedBlock"] > p'),editor.locator('[data-type="column"] > h2'),editor.locator('[data-type="column"] > p')];
   for(let i=0;i<targets.length;i++){
    const target=targets[i];await target.hover({position:{x:80,y:14}});const grip=page.getByRole("button",{name:"Переместить блок или открыть меню",exact:true});await grip.waitFor();await frames(page);
    const line=await target.evaluate(el=>{const b=el.getBoundingClientRect(),s=getComputedStyle(el);const range=document.createRange();range.selectNodeContents(el);const first=[...range.getClientRects()].find(rect=>rect.width&&rect.height);return{center:b.top+parseFloat(s.borderTopWidth)+parseFloat(s.paddingTop)+parseFloat(s.lineHeight)/2,glyphCenter:first?first.top+first.height/2:null,left:b.left};});
    const controls=await page.locator('.inline-editor__drag-handle button').evaluateAll(nodes=>nodes.map(el=>{const b=el.getBoundingClientRect(),g=el.querySelector('svg').getBoundingClientRect();return{center:b.top+b.height/2,width:b.width,height:b.height,glyphWidth:g.width,glyphHeight:g.height,glyphCenter:g.top+g.height/2};}));
    for(const control of controls){assert.equal(control.width,48);assert.equal(control.height,48);assert.equal(control.glyphWidth,20);assert.equal(control.glyphHeight,20);assert(Math.abs(control.center-line.center)<=1,`${width} target${i}: control center${control.center}, first line center${line.center}`);assert(Math.abs(control.glyphCenter-line.center)<=1);if(line.glyphCenter!=null)assert(Math.abs(control.glyphCenter-line.glyphCenter)<=1,`glyph centre must align with actual text range`);}
    const rail=await page.locator('.inline-editor__drag-handle').boundingBox();assert(rail.x+rail.width<=line.left+1,'controls do not cover text');
    if(i===0&&width===1440&&height===844)await page.screenshot({path:'/tmp/rollapp-gutter-alignment-1440-844.png'});
   }
   // The quote padding and its text are the same visible authoring block.
   // Native pointer movement must not shift its external rail by that padding.
   for(const quote of await editor.locator(':scope > blockquote').all()){
    await quote.scrollIntoViewIfNeeded();await frames(page);
    const q=await quote.boundingBox(),p=await quote.locator('p').first().boundingBox(),positions=[];
    for(const x of [q.x+2,p.x+4,p.x+80,q.x+2]){
     await page.mouse.move(x,p.y+14);await frames(page);
     const rail=await page.locator('.inline-editor__drag-handle').boundingBox();
     assert(rail,'quote rail is present');positions.push(rail.x);
     assert(Math.abs(rail.x+rail.width-q.x)<=1,`quote rail ends at container edge, not child text: ${JSON.stringify({width,height,x,rail,q,p})}`);
     assert(Math.abs(rail.y+rail.height/2-(p.y+14))<=1,'quote rail retains first-line centring');
    }
    assert(positions.every(x=>Math.abs(x-positions[0])<=1),'quote padding/text hover keeps a stable horizontal rail');
    if(width===1440&&height===844)await page.screenshot({path:'/tmp/rollapp-stable-quote-gutter-fixed.png'});
   }
  }else{await editor.locator('h1').hover();await frames(page);assert.equal(await page.locator('.inline-editor__drag-handle').isVisible(),false);}
  assert.deepEqual(await editor.evaluate(el=>el.editor.getJSON()),original);assert.equal(await page.evaluate(()=>window.inlineTest.saves.length),0);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);assert.deepEqual(errors,[]);await page.close();console.log(`PASS gutter alignment ${width}×${height}: first-line centres, headings1–6/paragraph/blank/nested/columns,48px controls/20px glyphs, no overlap/content change/API`);
 }
}
