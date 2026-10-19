import assert from "node:assert/strict";

const sizes = [[320,844],[390,844],[390,400],[768,844],[820,844],[1024,844],[1440,844],[1920,844]];
const listTypes = [["bulletList","listItem"],["orderedList","listItem"],["taskList","taskItem"]];

async function checkLayout(root) {
  const result = await root.evaluate(el => {
    const paragraphs = [...el.querySelectorAll("p")], style = getComputedStyle(el);
    const last = paragraphs.at(-1), text = getComputedStyle(last);
    return {
      rootOverflow: document.documentElement.scrollWidth > innerWidth + 1,
      descendantOverflow: paragraphs.some(p => p.scrollWidth > p.clientWidth + 1),
      lastWidth: last.getBoundingClientRect().width,
      frames: [style.borderTopWidth,style.borderRightWidth,style.borderBottomWidth,style.borderLeftWidth,style.outlineWidth,style.boxShadow],
      body: [text.fontSize,text.lineHeight,text.fontWeight],
      listItems: el.querySelectorAll("li").length,
      maxDepth: [...el.querySelectorAll("li")].reduce((maximum,item) => {
        let depth = 0;
        for(let node=item;node&&node!==el;node=node.parentElement) if(node.tagName==="LI") depth++;
        return Math.max(maximum,depth);
      },0),
    };
  });
  assert.equal(result.rootOverflow,false,JSON.stringify(result));
  assert.equal(result.descendantOverflow,false,JSON.stringify(result));
  assert(result.lastWidth>=100,JSON.stringify(result));
  assert.deepEqual(result.frames,["0px","0px","0px","0px","0px","none"]);
  assert.deepEqual(result.body,["18px","28px","400"]);
  assert.equal(result.listItems,12);
  assert.equal(result.maxDepth,12);
}

export async function checkTextDeepLists(browser,origin) {
  for(const [width,height] of sizes) {
    const page=await browser.newPage({viewport:{width,height}}),errors=[];
    page.on("pageerror",error=>errors.push(error.message));
    await page.route("**/api/**",route=>{errors.push("Unexpected API request");return route.abort();});
    const url=source=>`${origin}/__text-edit?source=${encodeURIComponent(source)}`;
    for(const [list,item] of listTypes) {
      await page.goto(url("Исходный текст"));
      const editor=page.getByRole("textbox",{name:"О себе",exact:true});
      await editor.waitFor();
      const source=await editor.evaluate((el,{list,item})=>{
        let child=null;
        for(let level=12;level>0;level--) {
          const own={type:"paragraph",content:[{type:"text",text:`Уровень ${level}: текст остаётся доступным для чтения и редактирования.`}]};
          child={type:list,content:[{type:item,attrs:item==="taskItem"?{checked:level%2===0}:undefined,content:[own,...(child?[child]:[])]}]};
        }
        el.editor.commands.setContent({type:"doc",content:[child]});
        return el.editor.getMarkdown();
      },{list,item});
      await page.goto(url(source));
      const last=editor.locator("p").nth(11);
      await last.waitFor({state:"attached"});
      await checkLayout(editor);
      const bounds=await last.boundingBox();
      await last.click({position:{x:bounds.width-1,y:bounds.height-1}});
      await page.keyboard.press("End");
      await page.keyboard.type(" Дополнение");
      assert((await last.textContent()).endsWith(" Дополнение"));
      const edited=await editor.evaluate(el=>el.editor.getJSON());
      await page.keyboard.press("ControlOrMeta+s");
      const saved=await editor.evaluate(el=>el.editor.getMarkdown());
      await page.waitForFunction(value=>window.inlineTest.saved===value,saved);
      await page.goto(url(saved));
      await last.waitFor({state:"attached"});
      assert.deepEqual(await editor.evaluate(el=>el.editor.getJSON()),edited);
      await checkLayout(editor);
      await page.goto(url(saved)+"&public=1");
      const article=page.getByRole("article",{name:"Опубликованный текст",exact:true});
      const reading=article.locator(".inline-editor__content");
      await reading.locator("li").nth(11).waitFor({state:"attached"});
      await checkLayout(reading);
      assert((await reading.locator("p").nth(11).textContent()).endsWith(" Дополнение"));
      assert.equal(await page.locator('[contenteditable="true"]').count(),0);
      if(list==="taskList") assert.equal(await reading.locator('input:checked').count(),6);
      assert.deepEqual(errors,[]);
    }
    await page.close();
    console.log(`PASS deep lists ${width}x${height}: bullet/ordered/task 12 levels, native typing, exact save/reload/public hierarchy, checked state, geometry/frames/API`);
  }
}
