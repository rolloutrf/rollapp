import assert from "node:assert/strict";
import { IDENTITY_QUESTION_TITLES } from "../shared/identity-questions.js";

export async function checkTextSlashCommands(browser, origin) {
  for (const [width,height] of [[320,844],[390,844],[390,400],[768,844],[820,844],[1024,844],[1440,844],[1920,844]]) {
    const page = await browser.newPage({ viewport: { width,height } }), errors=[];
    page.on("pageerror",error=>errors.push(error.message));
    await page.route("**/api/**",route=>{errors.push("Unexpected API request");return route.abort();});
    const url=(source,extra="")=>`${origin}/__text-edit?source=${encodeURIComponent(source)}${extra}`;
    const editor=page.getByRole("textbox",{name:"О себе",exact:true});
    const menu=page.getByRole("group",{name:"Команды блока",exact:true});
    const end=async locator=>{await locator.click();await editor.press(process.platform==="darwin"?"Meta+ArrowRight":"End");};
    const json=()=>editor.evaluate(el=>el.editor.getJSON());
    const source="До\n\n**Мысль** и конец\n\nПосле";
    await page.goto(url(source));
    await end(editor.locator("p").nth(1));
    await editor.pressSequentially(" /h2");
    await menu.getByRole("button",{name:"Заголовок 2",exact:true}).waitFor();
    assert.equal(await page.getByRole("toolbar").count(),0,"A slash menu must not duplicate selection formatting");
    const before=await json();
    await editor.press("Enter");
    await editor.locator("h2").waitFor();
    assert.equal(await editor.locator("h2").textContent(),"Мысль и конец ");
    assert.equal(await editor.locator("h2 strong").textContent(),"Мысль");
    await editor.press("ControlOrMeta+z");assert.deepEqual(await json(),before,"One Undo restores the full typed query and block structure");
    await menu.waitFor({state:"hidden"});
    await editor.press("ControlOrMeta+Shift+z");
    const converted=await json();
    await editor.pressSequentially("!"); await editor.press("ControlOrMeta+z"); assert.deepEqual(await json(),converted,"Further typing has its own history event");
    await editor.press("ControlOrMeta+s");await page.locator('[data-save-status="saved"]').waitFor();
    const stored=await page.evaluate(()=>window.inlineTest.saved);
    await page.goto(url(stored));
    assert.deepEqual(await json(),converted);assert.equal(await page.evaluate(()=>window.inlineTest.saves.length),0);
    await page.goto(url(stored,"&public=1"));
    const publicHeading=page.getByRole("heading",{name:"Мысль и конец",level:2,exact:true});await publicHeading.waitFor();
    assert.equal(await publicHeading.textContent(),"Мысль и конец ");
    assert.equal(await publicHeading.locator(":scope > span").evaluate(el=>getComputedStyle(el).whiteSpace),"pre-wrap","Public reading must visibly retain literal whitespace");
    assert.equal(await page.locator('[contenteditable="true"]').count(),0);assert.equal(await page.evaluate(()=>window.inlineTest.saves.length),0);

    for (const action of ["duplicate","delete"]) {
      await page.goto(url(source)); await end(editor.locator("p").nth(1)); await editor.pressSequentially(` /${action}`);
      const label=action==="delete"?"Удалить блок":"Дублировать блок";
      const button=menu.getByRole("button",{name:label,exact:true});await button.waitFor();
      const original=await json();
      if(action==="delete") assert(await button.evaluate(el=>{const probe=document.createElement("span");probe.style.color="var(--destructive)";el.append(probe);const expected=getComputedStyle(probe).color;probe.remove();return getComputedStyle(el).color===expected;}),"Delete keeps its warning color");
      if(action==="duplicate") { await editor.press("Tab"); assert(await button.evaluate(el=>document.activeElement===el),"Tab must focus the active slash command"); await button.press("Enter"); }
      else await button.click();
      await menu.waitFor({state:"hidden"});
      const result=await json();
      assert.equal(result.content.length,action==="duplicate"?4:2);
      assert.equal(result.content[0].content[0].text,"До");assert.equal(result.content.at(-1).content[0].text,"После");
      if(action==="duplicate") {assert.deepEqual(result.content[1],result.content[2]);assert.equal(result.content[1].content[0].marks[0].type,"bold");}
      assert(!(await editor.textContent()).includes(`/${action}`));
      await page.waitForFunction(()=>document.activeElement===document.querySelector('[role="textbox"][aria-label="О себе"]'));
      await editor.press("ControlOrMeta+z");assert.deepEqual(await json(),original,`${action}: a single Undo must restore the query, text and neighbours`);
      await menu.waitFor({state:"hidden"});await editor.press("ControlOrMeta+Shift+z");assert.deepEqual(await json(),result);
    }

    await page.goto(url("Мысль"));await end(editor.locator("p"));await editor.pressSequentially(" /du");await menu.waitFor();
    await editor.press("Escape");await menu.waitFor({state:"hidden"});await editor.pressSequentially("plicate");
    assert.equal(await menu.count(),0,"A dismissed query must stay dismissed while typing");assert.equal(await editor.textContent(),"Мысль /duplicate");
    await editor.pressSequentially(" /h2");await menu.getByRole("button",{name:"Заголовок 2",exact:true}).waitFor();
    await editor.press("ArrowLeft");await editor.press("Enter");assert.equal(await editor.locator("h2").textContent(),"Мысль /duplicate ","Executing inside the query removes its whole range");

    await page.goto(url("Первая мысль. Последний хвост."));
    await editor.locator("p").evaluate(el=>{el.closest('[contenteditable]').focus();const range=document.createRange();range.setStart(el.firstChild,13);range.collapse(true);const selection=getSelection();selection.removeAllRanges();selection.addRange(range);});
    await editor.pressSequentially(" /h3");await menu.getByRole("button",{name:"Заголовок 3",exact:true}).waitFor();await editor.press("Enter");
    assert.equal(await editor.locator("h3").textContent(),"Первая мысль.  Последний хвост.","Text on both sides of an inline query must survive");
    await page.goto(url("Строка"));await end(editor.locator("p"));await editor.press("Shift+Enter");await editor.pressSequentially("/h2");await menu.getByRole("button",{name:"Заголовок 2",exact:true}).waitFor();await editor.press("Enter");
    assert.equal((await json()).content[0].content.filter(node=>node.type==="hardBreak").length,1,"The document retains one soft break; the view may also render its caret placeholder");assert.equal(await editor.locator("h2").textContent(),"Строка");
    const softBreak=await json();await editor.press("ControlOrMeta+s");await page.locator('[data-save-status="saved"]').waitFor();await page.goto(url(await page.evaluate(()=>window.inlineTest.saved)));assert.deepEqual(await json(),softBreak,"A terminal soft break must survive an actual save/reload");

    await page.goto(url("Мысль","&access=1"));await end(editor.locator("p"));await editor.pressSequentially(" /du");await menu.waitFor();
    await page.getByRole("button",{name:"Только чтение",exact:true}).click();await menu.waitFor({state:"hidden"});
    assert.equal(await editor.getAttribute("contenteditable"),"false");

    if (width===390 || width===1440) {
      for(const [value,type] of [["/h2","p"],["file/path","p"],["https://example.com/path","p"],["`код`","code"],["```txt\nКод\n```","pre"]]) {
        await page.goto(url(value));await end(editor.locator(type));await editor.pressSequentially(type==="p"&&value==="/h2"?"x":"/delete");
        assert.equal(await menu.count(),0,`Literal input must not become a command: ${value}`);
      }
      await page.goto(url("Текст "));await end(editor.locator("p"));
      await editor.evaluate(el=>{const clipboardData=new DataTransfer();clipboardData.setData("text/plain","/delete");el.dispatchEvent(new ClipboardEvent("paste",{clipboardData,bubbles:true,cancelable:true}));});
      assert.equal(await menu.count(),0);await editor.pressSequentially("x");assert.equal(await menu.count(),0);
      await page.goto(url("Мысль"));await end(editor.locator("p"));await editor.pressSequentially(" /несуществующаякоманда");await menu.getByRole("status").waitFor();await editor.press("Tab");await menu.waitFor({state:"hidden"});assert.equal(await editor.textContent(),"Мысль /несуществующаякоманда","Tab with no result must dismiss without consuming the text");
      await page.goto(url(source));await end(editor.locator("p").nth(1));await editor.pressSequentially(" /");await menu.waitFor();await editor.press("Tab");
      const headingCommand=menu.getByRole("button",{name:"Заголовок 2",exact:true});await headingCommand.hover();await page.waitForFunction(()=>document.querySelector('.inline-editor__menu button[aria-pressed="true"]')?.textContent.includes("Заголовок 2"));await page.keyboard.press("Enter");await editor.locator("h2").waitFor();assert.equal(await editor.locator("h2").textContent(),"Мысль и конец ","Enter must choose the highlighted command after pointer movement");
      for(const alias of ["table","divider"]) {
        await page.goto(url(source));await end(editor.locator("p").nth(1));await editor.pressSequentially(` /${alias}`);await menu.waitFor();const original=await json();await editor.press("Enter");
        await editor.locator(alias==="table"?"table":"hr").waitFor();await editor.press("ControlOrMeta+z");assert.deepEqual(await json(),original,"Structural insertion must remove the query in the same transaction");
      }
      await page.goto(url("- [x] Родитель\n  - Ребёнок\n- [ ] Сосед"));await editor.locator('li[data-type="taskItem"] ul').waitFor();await end(editor.locator('li[data-type="taskItem"] p').first());await editor.pressSequentially(" /duplicate");await menu.getByRole("button",{name:"Дублировать блок",exact:true}).waitFor();
      const nestedBefore=await json();await editor.press("Enter");const items=(await json()).content[0].content;assert.equal(items.length,3);assert.deepEqual(items[0],items[1]);assert.equal(items[0].attrs.checked,true);assert.equal(items[0].content[1].type,"bulletList");await editor.press("ControlOrMeta+z");assert.deepEqual(await json(),nestedBefore);
      await page.goto(url('## <span data-inline-rich><strong>Первая<br>Вторая</strong></span>',"&public=1"));
      const multiline=page.getByRole("heading",{level:2});await multiline.locator("strong br").waitFor({state:"attached"});
      assert(await multiline.evaluate(el=>{const walker=document.createTreeWalker(el,NodeFilter.SHOW_TEXT),nodes=[];while(walker.nextNode())nodes.push(walker.currentNode);const a=document.createRange(),b=document.createRange();a.selectNodeContents(nodes[0]);b.selectNodeContents(nodes.at(-1));return b.getBoundingClientRect().top-a.getBoundingClientRect().top>=parseFloat(getComputedStyle(el).lineHeight)-1;}),"A marked public hard break must visibly separate the two lines");
      assert.equal(await page.locator('[contenteditable="true"]').count(),0);
      await page.goto(url("| A | B |\n| --- | --- |\n| C | D |"));await end(editor.locator("td p").first());await editor.pressSequentially(" /delete");await menu.getByRole("button",{name:"Удалить блок",exact:true}).click();
      assert.equal(await editor.locator("table").count(),1);assert.equal(await editor.locator("td").first().textContent(),"","Cell actions must preserve the surrounding table");
      const questions={questions:IDENTITY_QUESTION_TITLES.map((title,index)=>({title,paragraphs:[`Ответ ${index}`]}))};
      await page.goto(`${origin}/__text-edit?four=1&questions=${encodeURIComponent(JSON.stringify(questions))}`);
      const four=page.getByRole("textbox",{name:"Ответы на четыре вопроса",exact:true});await four.locator("p").first().click();await four.press(process.platform==="darwin"?"Meta+ArrowRight":"End");await four.pressSequentially(" /duplicate");await menu.getByRole("button",{name:"Дублировать блок",exact:true}).waitFor();const original=await four.evaluate(el=>el.editor.getJSON());await four.press("Enter");
      assert.equal(await four.locator('[data-question-index]').count(),4);await four.press("ControlOrMeta+z");assert.deepEqual(await four.evaluate(el=>el.editor.getJSON()),original);
    }

    await page.goto(url("Мысль"));await end(editor.locator("p"));await editor.pressSequentially(" /");await menu.waitFor();
    if(width===390&&height===400) {
      await page.evaluate(()=>{Object.defineProperty(visualViewport,"height",{configurable:true,value:220});Object.defineProperty(visualViewport,"offsetTop",{configurable:true,value:96});visualViewport.dispatchEvent(new Event("resize"));visualViewport.dispatchEvent(new Event("scroll"));});
      await page.waitForFunction(()=>{const r=document.querySelector('.inline-editor__menu')?.getBoundingClientRect();return r&&r.top>=111&&r.bottom<=301;}).catch(async error=>{throw new Error(`Slash viewport bounds: ${JSON.stringify(await menu.boundingBox())}; ${error.message}`);});
    }
    await editor.press("ArrowUp");const last=menu.getByRole("button",{name:"Удалить блок",exact:true});await last.waitFor();
    assert(await last.evaluate(el=>{const a=el.getBoundingClientRect(),b=el.parentElement.getBoundingClientRect();return el.getAttribute("aria-pressed")==="true"&&a.top>=b.top-1&&a.bottom<=b.bottom+1&&a.height>=48;}));
    const rect=await menu.boundingBox();assert(rect.x>=0&&rect.x+rect.width<=width+1&&rect.y>=0&&rect.y+rect.height<=height+1);
    if(width===390||width===1440) await page.screenshot({path:`/tmp/rollapp-slash-commands-${width}-${height}.png`});
    await editor.press("Tab");assert(await last.evaluate(el=>document.activeElement===el));
    await page.keyboard.press("ArrowUp");assert(await menu.getByRole("button",{name:"Дублировать блок",exact:true}).evaluate(el=>document.activeElement===el&&el.getAttribute("aria-pressed")==="true"),"Arrow navigation after Tab must move focus as well as the active highlight");
    await page.keyboard.press("Home");assert(await menu.getByRole("button",{name:"Текст",exact:true}).evaluate(el=>document.activeElement===el));
    await page.keyboard.press("End");assert(await last.evaluate(el=>document.activeElement===el));
    await page.keyboard.press("Escape");await menu.waitFor({state:"hidden"});
    assert(await editor.evaluate(el=>{const s=getComputedStyle(el);return s.outlineStyle==="none"&&s.boxShadow==="none"&&parseFloat(s.borderTopWidth)===0&&document.documentElement.scrollWidth<=innerWidth+1;}));
    assert.deepEqual(errors,[]);await page.close();
    console.log(`PASS slash commands ${width}×${height}: existing/inline text, keyboard actions, atomic Undo/Redo, literal/dismissal guards, save/reload, four-answer/cell scopes and viewport geometry`);
  }
}
