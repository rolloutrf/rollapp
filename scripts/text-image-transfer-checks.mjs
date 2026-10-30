import assert from "node:assert/strict";
import { imageFixturePNG } from "./text-image-checks.mjs";
import { getSchema } from "@tiptap/core";
import { inlineEditorExtensions } from "../src/lib/inline-editor-extensions.js";
import { blockHTML } from "../src/lib/inline-table-markdown.js";
const schema = getSchema(inlineEditorExtensions());
// Browser transport returns JSON objects; model attrs use a null prototype.
// Compare their complete serialized schema values, not JS realm/prototypes.
const nodeJSON = node => JSON.parse(JSON.stringify(node.toJSON()));
const bytes = Buffer.from(imageFixturePNG).toString("base64");
const frames = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));

// File payload delivery is injected at the DOM boundary. Carets, typing,
// focus, history and popup actions use the real browser. This is not physical
// OS clipboard/desktop file-manager or actual-device IME evidence.
export async function checkImageTransfer(browser, origin) {
  for (const [width,height] of [[320,844],[390,844],[390,400],[768,844],[820,844],[1024,844],[1440,844],[1920,844]]) {
    const page = await browser.newPage({ viewport: { width,height } }), errors = [], lifecycle = [];
    page.on('framenavigated', frame => { if (frame === page.mainFrame()) lifecycle.push({ event: 'navigation', url: frame.url() }); });
    page.on('console', message => { if (['error','warning'].includes(message.type())) lifecycle.push({ event: message.type(), text: message.text() }); });
    page.on("pageerror", error => errors.push(error.message));
    await page.route("**/api/**", route => { errors.push("Unexpected API request"); return route.abort(); });
    await page.addInitScript(() => { window.inlineImageFixture = { instance: crypto.randomUUID(), uploads: [], pending: [], releases: [], slow: false, fail: false }; });
    const editor = page.getByRole("textbox", {name:"О себе",exact:true});
    const goto = async (source, extra="") => { await page.goto(`${origin}/__text-edit?source=${encodeURIComponent(source)}${extra}`); await editor.waitFor(); await page.evaluate(() => document.fonts.ready); };
    const deliver = async (count=1, drop=false) => editor.evaluate((el,{count,drop,bytes}) => {
      const data = new DataTransfer();
      for(let n=0;n<count;n++)data.items.add(new File([Uint8Array.from(atob(bytes),c=>c.charCodeAt(0))],`${n+1}.png`,{type:"image/png"}));
      if(drop){const p=el.querySelector(drop==='image'?'img':'p'),rect=p.getBoundingClientRect();p.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:data,clientX:rect.left+Math.min(30,rect.width/2),clientY:rect.top+rect.height*0.75}));}
      else el.dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:data}));
    },{count,drop,bytes});
    await goto("Before target after\n\nTail");
    const original = await editor.evaluate(el=>el.editor.getJSON());
    await editor.locator('p').first().evaluate(p=>{p.closest('[contenteditable]').focus();getSelection().setBaseAndExtent(p.firstChild,7,p.firstChild,13);});
    await deliver(2); await editor.locator('img').nth(1).waitFor(); await frames(page);
    const inserted = await editor.evaluate(el=>el.editor.getJSON());
    assert.deepEqual(inserted.content.map(node=>node.type),['paragraph','image','image','paragraph','paragraph','paragraph']);
    assert.deepEqual(inserted.content.filter(node=>node.type==='paragraph').map(node=>(node.content||[]).map(child=>child.text||'').join('')),['Before ','',' after','Tail']);
    assert.equal(await page.evaluate(()=>window.inlineImageFixture.uploads.length),2);
    await page.keyboard.type('Continue'); assert.equal(await editor.locator('p').nth(1).textContent(),'Continue');
    await editor.press('ControlOrMeta+z');assert.deepEqual(await editor.evaluate(el=>el.editor.getJSON()),inserted);
    await editor.press('ControlOrMeta+z');assert.deepEqual(await editor.evaluate(el=>el.editor.getJSON()),original);
    await editor.press('ControlOrMeta+Shift+z');assert.deepEqual(await editor.evaluate(el=>el.editor.getJSON()),inserted);
    assert.deepEqual(await page.evaluate(()=>window.inlineImageFixture.releases),[]);
    await editor.press('ControlOrMeta+s');await page.locator('[data-save-status="saved"]').waitFor();const saved=await page.evaluate(()=>window.inlineTest.saved);
    await goto(saved);assert.deepEqual(await editor.evaluate(el=>el.editor.getJSON()),inserted);
    await goto('Drop here\n\nTail');await deliver(1,true);await editor.locator('img').waitFor();assert.equal(await editor.locator('p').last().textContent(),'Tail');
    await goto('![Keep](/__inline-image.png)\n\nTail');await editor.locator('img').waitFor();await deliver(1,'image');await editor.locator('img').nth(1).waitFor();assert.equal(await editor.locator('img[alt="Keep"]').count(),1);assert.equal(await editor.locator('p').last().textContent(),'Tail');
    for(const reason of ['cancel','source','selection','access','ime']){
      await goto('Keep target',reason==='access'?'&access=1':'');await editor.click();await page.evaluate(()=>{window.inlineImageFixture.slow=true;});await deliver();
      await page.waitForFunction(()=>window.inlineImageFixture.pending.length===1);
      const popup=page.getByRole('dialog',{name:'Загрузка изображений',exact:true});await popup.waitFor();
      const box=await popup.boundingBox();assert(box.x>=0&&box.y>=0&&box.x+box.width<=width+1&&box.y+box.height<=height+1);
      if(reason==='cancel'){await popup.getByRole('button',{name:'Отмена',exact:true}).click();assert(await editor.evaluate(el=>document.activeElement===el),'Explicit cancel restores its owning editor focus');}
      if(reason==='source')await editor.evaluate(el=>el.editor.commands.setContent('Remote source',{contentType:'markdown'}));
      if(reason==='selection')await editor.evaluate(el=>el.editor.commands.setTextSelection(1));
      if(reason==='access')await page.getByRole('button',{name:'Только чтение',exact:true}).dispatchEvent('click');
      if(reason==='ime')await editor.dispatchEvent('compositionstart',{data:''});
      const before=await editor.evaluate(el=>el.editor.getJSON());
      await page.evaluate(()=>window.inlineImageFixture.pending.shift()());await page.waitForFunction(()=>window.inlineImageFixture.releases.length===1);await frames(page);
      assert.deepEqual(await editor.evaluate(el=>el.editor.getJSON()),before,reason);assert.equal(await editor.locator('img').count(),0);
    }
    await goto('Keep while composing');await editor.click();const composingBefore=await editor.evaluate(el=>el.editor.getJSON());await editor.dispatchEvent('compositionstart',{data:''});await deliver();await frames(page);assert.equal(await page.evaluate(()=>window.inlineImageFixture.uploads.length),0);assert.deepEqual(await editor.evaluate(el=>el.editor.getJSON()),composingBefore);await editor.dispatchEvent('compositionend',{data:''});
    await goto('Retry upload');await editor.click();await page.evaluate(()=>{window.inlineImageFixture.fail=true;});await deliver();const failed=page.getByRole('dialog',{name:'Загрузка изображений',exact:true});await failed.getByRole('alert').waitFor();await page.evaluate(()=>{window.inlineImageFixture.fail=false;});await failed.getByRole('button',{name:'Повторить',exact:true}).click();await editor.locator('img').waitFor();assert.equal(await page.evaluate(()=>window.inlineImageFixture.uploads.length),2);
    // Keep the outside-pointer destination beyond the pending upload panel.
    await goto('First editor',`&twins=1&secondSource=${encodeURIComponent('Первый абзац второго документа\n\nСередина второго документа\n\nВнешняя цель')}`);const other=page.getByRole('textbox',{name:'Второй документ',exact:true});await other.waitFor();await editor.click();await page.evaluate(()=>{window.inlineImageFixture.slow=true;});await deliver();await page.waitForFunction(()=>window.inlineImageFixture.pending.length===1);
    const firstBefore=await editor.evaluate(el=>el.editor.getJSON()), otherBefore=await other.evaluate(el=>el.editor.getJSON()), pendingOwner=await page.evaluate(()=>({instance:window.inlineImageFixture.instance,pending:window.inlineImageFixture.pending.length,uploads:window.inlineImageFixture.uploads.length}));
    const destination=other.locator('p').last();
    assert(await destination.evaluate(el=>{const r=el.getBoundingClientRect();return el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));}),'The native focus destination must be visible outside the upload panel');
    await destination.click();
    const afterFocus=await page.evaluate(()=>({instance:window.inlineImageFixture.instance,pending:window.inlineImageFixture.pending.length,uploads:window.inlineImageFixture.uploads.length}));
    assert.deepEqual(afterFocus,pendingOwner,`Focus handoff replaced the pending fixture at ${width}x${height}: ${JSON.stringify(lifecycle.slice(-8))}`);
    await page.evaluate(()=>window.inlineImageFixture.pending.shift()());await page.waitForFunction(()=>window.inlineImageFixture.releases.length===1);assert.deepEqual(await editor.evaluate(el=>el.editor.getJSON()),firstBefore);assert.deepEqual(await other.evaluate(el=>el.editor.getJSON()),otherBefore);assert(await other.evaluate(el=>document.activeElement===el),'A cancelled upload cannot reclaim another editor');
    await goto(Array.from({length:40},(_,n)=>`Long paragraph ${n}`).join('\n\n'),'&chrome=1');await editor.locator('p').last().click();await page.evaluate(()=>{window.inlineImageFixture.slow=true;});await deliver();await page.waitForFunction(()=>window.inlineImageFixture.pending.length===1);const pending=page.getByRole('dialog',{name:'Загрузка изображений',exact:true});await pending.waitFor();const bounds=await pending.boundingBox(),chrome=await page.evaluate(()=>({top:document.querySelector('.global-app-chrome').getBoundingClientRect().bottom,bottom:document.querySelector('.mobile-app-navigation')?.getBoundingClientRect().top||innerHeight}));assert(bounds.y>=chrome.top-1&&bounds.y+bounds.height<=chrome.bottom+1,'Upload feedback clears actual app chrome');await page.mouse.wheel(0,-180);await frames(page);const manual=await page.evaluate(()=>scrollY);await page.evaluate(()=>window.inlineImageFixture.pending.shift()());await editor.locator('img').waitFor();await page.waitForTimeout(350);assert(Math.abs(await page.evaluate(()=>scrollY)-manual)<=1,'Late upload preserves manual scroll');
    const p = text => ({type:'paragraph',content:[{type:'text',text,marks:[{type:'bold'}]}]});
    for (const kind of ['nestedBlock','listItem','tableCell','column','blockquote']) {
      const owner = {type:kind,content:[p('Target after'),p('Child')]};
      const root = kind==='listItem'?{type:'bulletList',content:[owner]}:kind==='tableCell'?{type:'table',content:[{type:'tableRow',content:[owner]}]}:kind==='column'?{type:'columns',content:[owner,{type:'column',content:[p('Peer')]}]}:owner;
      const source = [root,p('Tail')].map(node=>blockHTML(schema.nodeFromJSON(node).toJSON())).join('\n\n');
      await goto(source);
      const before=await editor.evaluate(el=>el.editor.getJSON());
      await editor.getByText('Target after',{exact:true}).evaluate(el=>{
        const root=el.closest('[role="textbox"]'),walker=document.createTreeWalker(el,NodeFilter.SHOW_TEXT),text=walker.nextNode();
        root.focus();getSelection().setBaseAndExtent(text,2,text,4);
      });
      await deliver();await editor.locator('img').waitFor();
      const actual=await editor.evaluate(el=>el.editor.getJSON());
      const image=nodeJSON(schema.nodes.image.create({src:'/__inline-image.png',alt:'1.png'}));
      const expected=structuredClone(before);
      const replace=node=>{for(let i=0;i<(node.content||[]).length;i++){const child=node.content[i];if(child.type==='paragraph'&&child.content?.[0]?.text==='Target after'){
        const prefix=structuredClone(child),suffix=structuredClone(child);prefix.content[0].text='Ta';suffix.content[0].text='et after';
        node.content.splice(i,1,prefix,image,nodeJSON(schema.nodes.paragraph.create()),suffix);return true;
      }if(replace(child))return true;}return false;};
      assert(replace(expected));assert.deepEqual(actual,expected,`${kind}: native paste must preserve its exact structural owner, marks and neighbours`);
      await page.keyboard.type('Continue');await editor.press('ControlOrMeta+z');assert.deepEqual(await editor.evaluate(el=>el.editor.getJSON()),actual,`${kind}: typing is a separate Undo`);
      await editor.press('ControlOrMeta+z');assert.deepEqual(await editor.evaluate(el=>el.editor.getJSON()),before,`${kind}: one paste Undo`);
      await editor.press('ControlOrMeta+Shift+z');assert.deepEqual(await editor.evaluate(el=>el.editor.getJSON()),actual);
      await editor.press('ControlOrMeta+s');await page.locator('[data-save-status="saved"]').waitFor();
      const saved=await page.evaluate(()=>window.inlineTest.saved);await goto(saved);
      assert.deepEqual(await editor.evaluate(el=>el.editor.getJSON()),actual,`${kind}: canonical save/reload`);
    }
    assert.deepEqual(errors,[]);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
    await page.close();console.log(`PASS image file transfer ${width}x${height}: multi-file paste/drop, five nested owners with exact marks/neighbours, native caret/typing and separate Undo, canonical reload, pending owner/access/IME/cancel and cleanup, viewport and no API/errors`);
  }
}
