import assert from 'node:assert/strict';
import { MarkdownManager } from '@tiptap/markdown';
import { inlineEditorExtensions } from '../src/lib/inline-editor-extensions.js';
const p = value => ({ type:'paragraph',content:[{type:'text',text:value}] });
const chain = (depth, value) => depth ? { type:'nestedBlock',content:[p('Родитель'),chain(depth-1,value)] } : p(value);
const source = new MarkdownManager({extensions:inlineEditorExtensions()}).serialize({type:'doc',content:[chain(55,'Перемещаемый'),chain(55,'Назначение'),p('Сосед')]});
export async function checkRelocationDepth(browser, origin) {
  for(const [width,height] of [[1024,844],[1440,400]]) {
    const page=await browser.newPage({viewport:{width,height}}),errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.route('**/api/**',route=>{errors.push('Unexpected API request');return route.abort();});
    await page.goto(`${origin}/__text-edit?source=${encodeURIComponent(source)}`);
    const editor=page.getByRole('textbox',{name:'О себе',exact:true});
    await editor.locator(':scope > p').last().waitFor();await page.evaluate(()=>document.fonts.ready);
    const initial=await editor.evaluate(el=>el.editor.getJSON());
    await page.evaluate(()=>{
      window.dragDepthProof={starts:0,drops:0,target:null,guideAtTarget:null};
      document.addEventListener('dragstart',()=>{window.dragDepthProof.starts++;},true);
      document.addEventListener('drop',event=>{window.dragDepthProof.drops++;window.dragDepthProof.target=event.target.textContent;},true);
      document.addEventListener('dragover',event=>{
        if(event.target.textContent==='Назначение')window.dragDepthProof.guideAtTarget=!!document.querySelector('.inline-editor__drop-guide:not([hidden])');
      },true);
    });
    await editor.locator(':scope > [data-type="nestedBlock"]').first().locator('p').first().hover();
    const grip=page.getByRole('button',{name:'Переместить блок или открыть меню',exact:true});
    await grip.waitFor();await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    const target=editor.locator('p').filter({hasText:/^Назначение$/});
    const handle=await grip.boundingBox();
    await page.mouse.move(handle.x+handle.width/2,handle.y+handle.height/2);await page.mouse.down();
    await page.mouse.move(handle.x+handle.width/2+12,handle.y+handle.height/2+8,{steps:5});
    await page.locator('.inline-editor__drag-preview').waitFor({state:'attached'});
    // Keep the native drag held while bringing a distant destination into view.
    await target.scrollIntoViewIfNeeded();const box=await target.boundingBox();
    await page.mouse.move(box.x+20,box.y+box.height-1,{steps:10});
    await page.mouse.move(box.x+21,box.y+box.height-1);await page.mouse.up();
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    const proof=await page.evaluate(()=>window.dragDepthProof);
    assert.equal(proof.starts,1,JSON.stringify(proof));assert.equal(proof.drops,1,JSON.stringify(proof));assert.equal(proof.target,'Назначение');assert.equal(proof.guideAtTarget,false,'no valid-position guide for an unroundtrippable depth');
    assert.deepEqual(await editor.evaluate(el=>el.editor.getJSON()),initial,'invalid move is consumed without HTML fallback or partial mutation');
    assert.equal(await page.locator('.inline-editor__drop-guide,.inline-editor__drag-preview').count(),0);
    assert.equal(await page.evaluate(()=>window.inlineTest.saves.length),0);
    assert.deepEqual(errors,[]);await page.close();
    console.log(`PASS relocation depth ${width}×${height}: native 55-level parent drop into another 55-level chain has no guide, write, HTML fallback or document mutation`);
  }
}
