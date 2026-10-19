import assert from "node:assert/strict";
import { IDENTITY_QUESTION_TITLES } from "../shared/identity-questions.js";

export async function checkTextBlockColors(browser,origin) {
  for(const [width,height] of [[320,844],[390,844],[390,400],[768,844],[820,844],[1024,844],[1440,844],[1920,844]]) {
    const page=await browser.newPage({viewport:{width,height}}),errors=[];
    page.on("pageerror",error=>errors.push(error.message));await page.route("**/api/**",route=>{errors.push("Unexpected API request");return route.abort();});
    const url=(value,extra="")=>`${origin}/__text-edit?source=${encodeURIComponent(value)}${extra}`;
    const editor=page.getByRole("textbox",{name:"О себе",exact:true}),slash=page.getByRole("group",{name:"Команды блока",exact:true});
    const json=()=>editor.evaluate(el=>el.editor.getJSON());
    const end=async locator=>{await locator.click();await editor.press(process.platform==="darwin"?"Meta+ArrowRight":"End");};
    const blockMenu=page.getByRole("dialog",{name:"Действия текстового блока",exact:true});
    const palette=page.getByRole("dialog",{name:"Цвет блока",exact:true});
    const openColor=async()=>{await editor.press("ControlOrMeta+/");await blockMenu.getByRole("button",{name:"Цвет блока",exact:true}).click();await palette.waitFor();};
    const source='До\n\n**Мысль** и <span data-inline-color="blue">синий</span>\n\nПосле';
    await page.goto(url(source));await end(editor.locator("p").nth(1));
    await editor.pressSequentially(" /red");await slash.getByRole("button",{name:"Красный текст блока",exact:true}).waitFor();
    assert.equal(await slash.locator('button[aria-pressed="true"]').textContent(),"Красный текст блока","A direct colour command must win over the red substring in numbered");
    const before=await json();await editor.press("Enter");
    const red=await json();assert.equal(red.content[1].attrs.blockColor,"red");assert.equal(red.content[0].attrs.blockColor,null);assert.equal(red.content[2].attrs.blockColor,null);
    assert.equal(await editor.locator("p").nth(1).textContent(),"Мысль и синий ");
    const colors=await editor.locator("p").nth(1).evaluate(el=>({body:getComputedStyle(el).color,bold:getComputedStyle(el.querySelector('strong')).color,inline:getComputedStyle(el.querySelector('[data-inline-color="blue"]')).color}));
    assert.equal(colors.body,colors.bold);assert.notEqual(colors.body,colors.inline,"Explicit inline colour remains independent");
    await editor.press("ControlOrMeta+z");assert.deepEqual(await json(),before);await editor.press("ControlOrMeta+Shift+z");assert.deepEqual(await json(),red);
    await editor.pressSequentially(" ещё");assert.equal((await json()).content[1].attrs.blockColor,"red");
    await editor.press("ControlOrMeta+z");assert.deepEqual(await json(),red);
    await editor.pressSequentially("/h2");await slash.getByRole("button",{name:"Заголовок 2",exact:true}).waitFor();await editor.press("Enter");
    await editor.locator("h2").waitFor();assert.equal((await json()).content[1].attrs.blockColor,"red","Type conversion retains whole block colour");
    await openColor();await palette.getByRole("radio",{name:"Фон блока: Зелёный",exact:true}).click();await palette.waitFor({state:"hidden"});
    const background=await json();assert.equal(background.content[1].attrs.blockColor,"green_background");
    assert(await editor.locator("h2").evaluate(el=>{const s=getComputedStyle(el);return s.backgroundColor!=="rgba(0, 0, 0, 0)"&&s.boxShadow==="none"&&s.outlineStyle==="none"&&parseFloat(s.borderTopWidth)===0;}));
    await editor.press("ControlOrMeta+s");await page.locator('[data-save-status="saved"]').waitFor();const stored=await page.evaluate(()=>window.inlineTest.saved);
    await page.goto(url(stored));await editor.locator('h2[data-block-color="green_background"]').waitFor();assert.deepEqual(await json(),background);assert.equal(await page.evaluate(()=>window.inlineTest.saves.length),0);
    await page.goto(url(stored,"&public=1"));const publicDoc=page.getByRole("textbox",{name:"Опубликованный текст",exact:true});await publicDoc.locator('h2[data-block-color="green_background"]').waitFor();assert.deepEqual(await publicDoc.evaluate(el=>el.editor.getJSON()),background);assert.equal(await page.locator('[contenteditable="true"]').count(),0);assert.equal(await page.evaluate(()=>window.inlineTest.saves.length),0);
    await page.goto(url(stored));await end(editor.locator("h2"));await editor.pressSequentially("/default");await slash.getByRole("button",{name:"Обычный цвет блока",exact:true}).waitFor();await editor.press("Enter");assert.equal((await json()).content[1].attrs.blockColor,null);assert.equal(await editor.locator('[data-inline-color="blue"]').count(),1);

    await page.goto(url("Первый\n\nВторой\n\nТретий"));await editor.locator("p").first().click();await editor.press("Escape");await editor.press("Shift+ArrowDown");await openColor();await palette.getByRole("radio",{name:"Цвет блока: Фиолетовый",exact:true}).click();
    let group=await json();assert.equal(group.content[0].attrs.blockColor,"purple");assert.equal(group.content[1].attrs.blockColor,"purple");assert.equal(group.content[2].attrs.blockColor,null);
    await editor.press("ControlOrMeta+z");assert((await json()).content.every(node=>node.attrs.blockColor===null));

    await page.goto(url("| A | B |\n| --- | --- |\n| C | D |"));await editor.locator("td p").first().click();await editor.press("ControlOrMeta+/");await blockMenu.getByRole("button",{name:"Выделить столбец",exact:true}).click();await editor.press("ControlOrMeta+/");await blockMenu.getByRole("button",{name:"Цвет ячеек",exact:true}).click();
    const cellPalette=page.getByRole("dialog",{name:"Цвет ячеек",exact:true});await cellPalette.getByRole("radio",{name:"Фон ячеек: Жёлтый",exact:true}).click();
    const cellDoc=await json();for(const row of cellDoc.content[0].content){assert.equal(row.content[0].attrs.blockColor,"yellow_background");assert.equal(row.content[1].attrs.blockColor,null);}
    await editor.press("ControlOrMeta+s");await page.locator('[data-save-status="saved"]').waitFor();await page.goto(url(await page.evaluate(()=>window.inlineTest.saved)));assert.deepEqual(await json(),cellDoc);
    const cellPaint=await editor.locator("table").evaluate(el=>({header:getComputedStyle(el.rows[0].cells[0]).backgroundColor,body:getComputedStyle(el.rows[1].cells[0]).backgroundColor,neighbour:getComputedStyle(el.rows[1].cells[1]).backgroundColor}));assert.equal(cellPaint.header,cellPaint.body);assert.notEqual(cellPaint.body,cellPaint.neighbour,"The whole cell background must paint in both headers and ordinary cells");

    await page.goto(url("\n"));await editor.click();await editor.pressSequentially("/blue background");await slash.getByRole("button",{name:"Синий фон блока",exact:true}).waitFor();await editor.press("Enter");assert.equal(await editor.locator("p").getAttribute("data-block-color"),"blue_background");assert(await editor.locator("p").evaluate(el=>el.getBoundingClientRect().height>=28));await editor.pressSequentially("Запись");assert.equal(await editor.locator("p").getAttribute("data-block-color"),"blue_background");await editor.press("Enter");assert((await json()).content.every(node=>node.attrs.blockColor==="blue_background"),"The new paragraph inherits the selected block colour");

    const questions={questions:IDENTITY_QUESTION_TITLES.map((title,index)=>({title,paragraphs:[index?`Ответ ${index}`:"Первая мысль"]}))};await page.goto(`${origin}/__text-edit?four=1&questions=${encodeURIComponent(JSON.stringify(questions))}`);
    const four=page.getByRole("textbox",{name:"Ответы на четыре вопроса",exact:true});await four.locator("p").first().click();await four.press(process.platform==="darwin"?"Meta+ArrowRight":"End");await four.pressSequentially(" /blue background");await slash.getByRole("button",{name:"Синий фон блока",exact:true}).waitFor();const beforeFour=await four.evaluate(el=>el.editor.getJSON());await four.press("Enter");
    assert.equal(await four.locator('[data-question-index]').count(),4);assert.equal(await four.locator('p[data-block-color="blue_background"]').count(),1);await four.press("ControlOrMeta+z");assert.deepEqual(await four.evaluate(el=>el.editor.getJSON()),beforeFour);
    await four.locator("p").evaluateAll(nodes=>{const editor=nodes[0].closest('[contenteditable]');editor.focus();getSelection().setBaseAndExtent(nodes[1].firstChild,3,nodes[0].firstChild,1);});
    const crossBefore=await four.evaluate(el=>el.editor.getJSON());await four.press("ControlOrMeta+/");await blockMenu.getByRole("button",{name:"Цвет блока",exact:true}).click();await palette.getByRole("radio",{name:"Цвет блока: Фиолетовый",exact:true}).click();
    const cross=await four.evaluate(el=>el.editor.getJSON());assert.equal(cross.content[0].content[0].attrs.blockColor,"purple");assert.equal(cross.content[1].content[0].attrs.blockColor,"purple");assert.equal(cross.content[2].content[0].attrs.blockColor,null);assert.equal(await four.locator('h3[contenteditable="false"]').count(),4);await four.press("ControlOrMeta+z");assert.deepEqual(await four.evaluate(el=>el.editor.getJSON()),crossBefore);

    if(width===390||width===1440) {
      await page.goto(url(stored));const html=await editor.locator("h2").evaluate(el=>el.outerHTML);await page.goto(url("До вставки"));await end(editor.locator("p"));await editor.press("Enter");await editor.evaluate((el,html)=>{const clipboardData=new DataTransfer();clipboardData.setData("text/html",html);clipboardData.setData("text/plain","Мысль и синий");el.dispatchEvent(new ClipboardEvent("paste",{clipboardData,bubbles:true,cancelable:true}));},html);await editor.locator('h2[data-block-color="green_background"]').waitFor();assert.deepEqual((await json()).content.find(node=>node.type==="heading"),background.content[1],"HTML clipboard retains block attributes and mixed inline marks");
      await page.goto(url("Первый документ","&twins=1"));await end(editor.locator("p"));await editor.pressSequentially(" /red");await slash.getByRole("button",{name:"Красный текст блока",exact:true}).waitFor();await editor.press("Enter");
      const second=page.getByRole("textbox",{name:"Второй документ",exact:true});await second.click();await second.press("ControlOrMeta+Shift+h");assert.equal(await second.locator("p").getAttribute("data-block-color"),"red","Last colour crosses editor instances");
      await page.reload();await second.click();await second.press("ControlOrMeta+Shift+h");assert.equal(await second.locator("p").getAttribute("data-block-color"),"red","Last colour survives reload in the same browser");
      await page.goto(url("Черновик","&error=1"));await end(editor.locator("p"));await editor.pressSequentially(" /purple background");await slash.getByRole("button",{name:"Фиолетовый фон блока",exact:true}).waitFor();await editor.press("Enter");const draft=await json();await editor.press("ControlOrMeta+s");await page.getByRole("button",{name:"Повторить сохранение",exact:true}).waitFor();await page.reload();await editor.locator('[data-block-color="purple_background"]').waitFor();assert.deepEqual(await json(),draft);assert.equal(await page.evaluate(()=>window.inlineTest.saves.length),0,"Restored draft must not silently save itself");await page.evaluate(()=>{window.inlineTest.fail=false;});await page.getByRole("button",{name:"Повторить сохранение",exact:true}).click();await page.locator('[data-save-status="saved"]').waitFor();
      await page.goto(url("Только чтение","&access=1"));await end(editor.locator("p"));await openColor();await palette.press("Escape");await page.getByRole("button",{name:"Только чтение",exact:true}).click();const readOnly=await json();await editor.press("ControlOrMeta+Shift+h");assert.deepEqual(await json(),readOnly);assert.equal(await page.evaluate(()=>window.inlineTest.saves.length),0);
      await page.goto(url("Первый документ","&twins=1"));await page.evaluate(()=>Object.defineProperty(window,"localStorage",{configurable:true,get(){throw new DOMException("Blocked","SecurityError");}}));await end(editor.locator("p"));await editor.pressSequentially(" /green");await slash.getByRole("button",{name:"Зелёный текст блока",exact:true}).waitFor();await editor.press("Enter");await second.click();await second.press("ControlOrMeta+Shift+h");assert.equal(await second.locator("p").getAttribute("data-block-color"),"green","Blocked preference storage must keep typing and repetition usable");
    }

    await page.goto(url(stored));await end(editor.locator("h2"));await openColor();
    if(width===390&&height===400){await page.evaluate(()=>{Object.defineProperty(visualViewport,"height",{configurable:true,value:220});Object.defineProperty(visualViewport,"offsetTop",{configurable:true,value:96});visualViewport.dispatchEvent(new Event("resize"));visualViewport.dispatchEvent(new Event("scroll"));});await page.waitForFunction(()=>{const r=document.querySelector('.inline-editor__color-menu')?.getBoundingClientRect();return r&&r.top>=111&&r.bottom<=301;});}
    const box=await palette.boundingBox();assert(box.x>=0&&box.x+box.width<=width+1&&box.y>=0&&box.y+box.height<=height+1);
    await palette.getByRole("button",{name:"Закрыть",exact:true}).scrollIntoViewIfNeeded();
    if(width===390||width===1440)await page.screenshot({path:`/tmp/rollapp-block-colors-${width}-${height}.png`});
    await palette.press("Escape");await palette.waitFor({state:"hidden"});assert(await editor.evaluate(el=>document.documentElement.scrollWidth<=innerWidth+1));
    assert.deepEqual(errors,[]);await page.close();console.log(`PASS block colours ${width}×${height}: slash/default, marks/typing/conversion, group/cell scopes, atomic Undo, save/reload/public read, fixed questions and keyboard viewport`);
  }
}
