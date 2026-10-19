import assert from "node:assert/strict";
import { IDENTITY_QUESTION_TITLES } from "../shared/identity-questions.js";
import { assertStableBlockSelection } from "./text-block-boundary-checks.mjs";

export async function checkTextSparseBlocks(browser, origin) {
  for (const [width,height] of [[320,844],[390,844],[390,400],[768,844],[820,844],[1024,844],[1440,844],[1920,844]]) {
    const page=await browser.newPage({viewport:{width,height},permissions:["clipboard-read","clipboard-write"]}),errors=[];
    page.on("pageerror",error=>errors.push(error.message));
    await page.route("**/api/**",route=>{errors.push("Unexpected API request");return route.abort();});
    const source=['<p data-block-color="red"><strong>Первый</strong></p>','<p>Пропуск</p>','<p data-block-color="green">Третий <span data-inline-color="purple">цветной</span></p>','<p>Сосед</p>'].map(block=>`<div data-inline-block="true">${block}</div>`).join("\n\n");
    const url=value=>`${origin}/__text-edit?source=${encodeURIComponent(value)}`;
    await page.addInitScript(platform=>Object.defineProperty(navigator,"platform",{get:()=>platform}),width===320||width===820?"Win32":"MacIntel");
    await page.goto(url(source));
    const editor=page.getByRole("textbox",{name:"О себе",exact:true});await editor.locator("p").nth(3).waitFor();
    const modifiers=await page.evaluate(()=>/Mac|iPhone|iPad/.test(navigator.platform)?["Meta","Shift"]:["Alt","Shift"]);
    const mod=modifiers.includes("Meta")?"Meta":"Control",press=(target,key)=>target.press(key.replace("ControlOrMeta",mod));
    const selected=editor.locator(".inline-editor__block-selected"),json=()=>editor.evaluate(el=>el.editor.getJSON());
    const original=await json();
    const choose=async()=>{await editor.locator("p").first().click();await editor.press("Escape");await editor.locator("p").nth(2).click({modifiers});};
    const checkSelection=async()=>{
      assert.deepEqual(await selected.allTextContents(),["Первый","Третий цветной"]);
      assert.equal(await page.getByRole("toolbar").count(),0);
      const geometry=await selected.evaluateAll(nodes=>nodes.map(node=>{const s=getComputedStyle(node);return [s.borderTopWidth,s.borderRightWidth,s.borderBottomWidth,s.borderLeftWidth,s.outlineWidth,s.boxShadow];}));
      for(const frame of geometry)assert.deepEqual(frame,["0px","0px","0px","0px","0px","none"]);
    };
    await choose();await checkSelection();await assertStableBlockSelection(editor);
    const selection=await editor.evaluate(el=>el.editor.state.selection.toJSON());
    await editor.locator("p").nth(2).click({modifiers});assert.deepEqual(await selected.allTextContents(),["Первый"]);
    await editor.locator("p").nth(2).click({modifiers});await checkSelection();
    await page.waitForTimeout(900);assert.equal(await page.evaluate(()=>window.inlineTest.saves.length),0);
    const clipboard=async type=>editor.evaluate((el,type)=>{const clipboardData=new DataTransfer();el.dispatchEvent(new ClipboardEvent(type,{clipboardData,bubbles:true,cancelable:true}));return{text:clipboardData.getData("text/plain"),html:clipboardData.getData("text/html")};},type);
    const copied=await clipboard("copy");assert.equal(copied.text,"Первый\n\nТретий цветной");assert(copied.html.includes("<strong>Первый</strong>"));assert(!copied.html.includes("Пропуск"));assert(copied.html.includes('data-inline-color="purple"'));
    if(width===1440){await editor.press("ControlOrMeta+c");assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),copied.text);}
    const menu=page.getByRole("dialog",{name:"Действия текстового блока",exact:true}),search=menu.getByRole("searchbox",{name:"Поиск действий блока",exact:true});
    const command=async query=>{await press(editor,"ControlOrMeta+/");await search.fill(query);await search.press("Enter");await menu.waitFor({state:"hidden"});};
    await command("blue background");
    const colored=await json();assert.deepEqual(colored.content.map(node=>node.attrs.blockColor),["blue_background",null,"blue_background",null]);assert.deepEqual(colored.content[1],original.content[1]);await checkSelection();
    await press(editor,"ControlOrMeta+z");assert.deepEqual(await json(),original);await checkSelection();
    for(const [query,type] of [["heading 2","heading"],["bulleted","bulletList"],["numbered","orderedList"],["todo","taskList"],["quote","blockquote"],["codeblock","codeBlock"],["toggle","details"],["text","paragraph"]]){
      await command(query);const result=await json();
      assert.deepEqual(result.content.filter(node=>node.type==="paragraph"&&["Пропуск","Сосед"].includes(node.content?.[0]?.text)),[original.content[1],original.content[3]],`${query}: skipped blocks stay exact`);
      assert.equal(result.content[0].type,type,`${query}: first selected type`);assert.equal(result.content[2].type,type,`${query}: last selected type`);
      const effectiveColour=(node,inherited=null)=>node.content?.length?effectiveColour(node.content[0],node.attrs?.blockColor||inherited):node.attrs?.blockColor||inherited;
      const textBlock=node=>["paragraph","heading","codeBlock","detailsSummary"].includes(node.type)?node:node.content?.map(textBlock).find(Boolean);
      assert.equal(effectiveColour(result.content[0]),"red",`${query}: selected colour`);assert.equal(effectiveColour(result.content[2]),"green",`${query}: selected colour`);
      for(const index of [0,2]) { const expected=type==="codeBlock"?[{type:"text",text:original.content[index].content.map(node=>node.text).join("")}]:original.content[index].content;assert.deepEqual(textBlock(result.content[index]).content,expected,`${query}: preserve rich text or explicit plain code semantics`); }
      assert.equal(await selected.count(),2,`${query}: highlight only the selected units`);
      assert.deepEqual(await editor.evaluate(el=>el.editor.state.selection.positions.map(pos=>el.editor.state.doc.nodeAt(pos).textContent)),["Первый","Третий цветной"],`${query}: retain exact sparse selection`);
      await command("blue color");
      const ink=await editor.evaluate(el=>{const out=[];el.editor.state.doc.descendants((node,pos)=>{if(node.isTextblock&&node.textContent){const inside=el.editor.state.doc.resolve(pos+1);let colour=null;for(let d=1;d<=inside.depth;d+=1)colour=inside.node(d).attrs.blockColor||colour;out.push([node.textContent,colour]);}});return out;});
      assert.deepEqual(ink,[["Первый","blue"],["Пропуск",null],["Третий цветной","blue"],["Сосед",null]],`${query}: subsequent recolour must reach the converted block's own text`);
      assert.equal(await selected.count(),2);await press(editor,"ControlOrMeta+z");assert.deepEqual(await json(),result,`${query}: recolour is one separate Undo`);
      await press(editor,"ControlOrMeta+z");assert.deepEqual(await json(),original,`${query}: one Undo`);await checkSelection();
    }
    await press(editor,"ControlOrMeta+Shift+ArrowUp");assert.deepEqual(await editor.locator(":scope > p").allTextContents(),["Первый","Третий цветной","Пропуск","Сосед"]);
    await press(editor,"ControlOrMeta+z");assert.deepEqual(await json(),original);await checkSelection();
    await press(editor,"ControlOrMeta+d");assert.deepEqual(await editor.locator(":scope > p").allTextContents(),["Первый","Первый","Пропуск","Третий цветной","Третий цветной","Сосед"]);await checkSelection();
    await editor.press("Backspace");assert.deepEqual(await json(),original,"Delete only the sparse duplicates");
    await press(editor,"ControlOrMeta+z");await press(editor,"ControlOrMeta+z");assert.deepEqual(await json(),original);await checkSelection();
    const cut=await clipboard("cut");assert.equal(cut.text,copied.text);assert.deepEqual(await editor.locator(":scope > p").allTextContents(),["Пропуск","Сосед"]);
    await press(editor,"ControlOrMeta+z");assert.deepEqual(await json(),original);await checkSelection();
    for(const [text,html,type] of [["Вставка","<p><strong>Вставка</strong></p>","paragraph"],["## Вставка","","heading"]]) {
      await editor.evaluate((el,{text,html})=>{const clipboardData=new DataTransfer();clipboardData.setData("text/plain",text);if(html)clipboardData.setData("text/html",html);el.dispatchEvent(new ClipboardEvent("paste",{clipboardData,bubbles:true,cancelable:true}));},{text,html});
      const pasted=await json();assert.deepEqual(pasted.content.map(node=>node.type),[type,"paragraph","paragraph"]);assert.equal(pasted.content[0].content[0].text,"Вставка");assert.deepEqual(pasted.content.slice(1),[original.content[1],original.content[3]],"Paste replaces only selected ranges");
      await press(editor,"ControlOrMeta+z");assert.deepEqual(await json(),original);await checkSelection();
    }
    await editor.pressSequentially("Замена");assert.deepEqual(await editor.locator(":scope > p").allTextContents(),["Замена","Пропуск","Сосед"]);
    await press(editor,"ControlOrMeta+z");assert.deepEqual(await json(),original);await checkSelection();
    await page.waitForTimeout(900);const beforeComposition=await page.evaluate(()=>window.inlineTest.saves.length);
    await editor.dispatchEvent("compositionstart",{data:""});await editor.dispatchEvent("compositionend",{data:""});
    assert.deepEqual(await json(),original);await checkSelection();await page.waitForTimeout(900);assert.equal(await page.evaluate(()=>window.inlineTest.saves.length),beforeComposition,"Cancelled composition must not publish its temporary deletion");
    await editor.locator("p").last().click({modifiers:["Shift"]});assert.equal(await selected.count(),4,"Shift-click retains contiguous range semantics");
    await editor.press("Escape");await editor.locator("p").nth(2).click({modifiers});assert.deepEqual(await selected.allTextContents(),["Третий цветной"],"Starting sparse selection does not include a former caret's block");
    await editor.press("Escape");await choose();
    if(width>=1024){
      await editor.locator("p").nth(1).hover();const gapGrip=page.getByRole("button",{name:"Переместить блок или открыть меню",exact:true});await gapGrip.waitFor();await gapGrip.click();await search.fill("pink color");await search.press("Enter");await menu.waitFor({state:"hidden"});
      assert.deepEqual((await json()).content.map(node=>node.attrs.blockColor),["red","pink","green",null],"A hovered gap's command acts on that block only");await press(editor,"ControlOrMeta+z");assert.deepEqual(await json(),original);await checkSelection();
      await editor.locator("p").nth(2).hover();const grip=page.getByRole("button",{name:"Переместить блок или открыть меню",exact:true});await grip.waitFor();
      await grip.click({modifiers});assert.deepEqual(await selected.allTextContents(),["Первый"]);assert.equal(await menu.count(),0,"Modified grip click selects instead of opening the menu");
      await grip.click({modifiers});await checkSelection();
      await grip.dragTo(editor.locator("p").last(),{targetPosition:{x:20,y:1}});
      assert.deepEqual(await editor.locator(":scope > p").allTextContents(),["Пропуск","Первый","Третий цветной","Сосед"],"Drag carries selected blocks without the gap");await checkSelection();
      await press(editor,"ControlOrMeta+z");assert.deepEqual(await json(),original);await checkSelection();
    }
    if(width===390||width===1440)await page.screenshot({path:`/tmp/rollapp-sparse-blocks-${width}-${height}.png`,fullPage:true});
    await command("heading 2");const final=await json(),markdown=await editor.evaluate(el=>el.editor.getMarkdown());
    await page.waitForFunction(value=>window.inlineTest.saved===value,markdown);
    await page.goto(url(markdown));await editor.locator("h2").nth(1).waitFor();assert.deepEqual(await json(),final);
    await page.goto(`${url(markdown)}&public=1`);await page.locator("h2").nth(1).waitFor();assert.equal(await page.locator('[contenteditable="true"]').count(),0);assert.deepEqual(await page.locator("h2").allTextContents(),["Первый","Третий цветной"]);assert.equal(await page.getByText("Пропуск",{exact:true}).count(),1);
    await page.goto(url("- [ ] Первый\n  - [x] Внутри\n- [x] Пропуск\n- [ ] Третий\n\nСосед"));await editor.locator("li").nth(3).waitFor();
    const listBefore=await json();
    await editor.locator("li p").filter({hasText:/^Первый$/}).click({modifiers});await editor.locator("li p").filter({hasText:/^Третий$/}).click({modifiers});
    assert.equal(await selected.count(),2);
    for(const type of ["heading 3","toggle"]) {
      await command(type);const nodes=await editor.evaluate(el=>{const nodes=[];el.editor.state.doc.descendants(node=>{if(node.type.name==="taskItem"&&node.textContent==="Пропуск")nodes.push(node.toJSON());});return nodes;});
      assert.deepEqual(nodes,[listBefore.content[0].content[1]],`${type}: skipped checked item is untouched`);
      assert.equal(await editor.locator("p").filter({hasText:/^Сосед$/}).count(),1);
      await press(editor,"ControlOrMeta+z");assert.deepEqual(await json(),listBefore,`${type}: nested structure and checked state return in one Undo`);assert.equal(await selected.count(),2);
    }
    const questions={questions:IDENTITY_QUESTION_TITLES.map((title,index)=>({title,paragraphs:[`Ответ ${index}`,`Хвост ${index}`]}))};
    await page.goto(`${origin}/__text-edit?four=1&questions=${encodeURIComponent(JSON.stringify(questions))}`);
    const four=page.getByRole("textbox",{name:"Ответы на четыре вопроса",exact:true});await four.locator('[data-question-body="3"]').waitFor();
    const first=four.locator('[data-question-body="0"] p').first(),third=four.locator('[data-question-body="2"] p').first();
    await first.click({modifiers});await third.click({modifiers});assert.deepEqual(await four.locator(".inline-editor__block-selected").allTextContents(),["Ответ 0","Ответ 2"]);
    const beforeFour=await four.evaluate(el=>el.editor.getJSON());
    await press(four,"ControlOrMeta+/");await search.fill("heading 2");await search.press("Enter");await menu.waitFor({state:"hidden"});
    const changed=await four.evaluate(el=>el.editor.getJSON());assert.deepEqual(changed.content.map(node=>node.content[0].type),["heading","paragraph","heading","paragraph"]);assert.deepEqual(changed.content[1],beforeFour.content[1]);assert.deepEqual(changed.content[3],beforeFour.content[3]);
    await press(four,"ControlOrMeta+z");assert.deepEqual(await four.evaluate(el=>el.editor.getJSON()),beforeFour);
    const copiedFour=await four.evaluate(el=>{const clipboardData=new DataTransfer();el.dispatchEvent(new ClipboardEvent("copy",{clipboardData,bubbles:true,cancelable:true}));return clipboardData.getData("text/plain");});assert.equal(copiedFour,"Ответ 0\n\nОтвет 2");
    await four.press("Backspace");const deleted=await four.evaluate(el=>el.editor.getJSON());assert.deepEqual(deleted.content.map(node=>node.content.map(n=>n.content?.map(t=>t.text).join("")).join("|")),["Хвост 0","Ответ 1|Хвост 1","Хвост 2","Ответ 3|Хвост 3"]);
    await press(four,"ControlOrMeta+z");assert.deepEqual(await four.evaluate(el=>el.editor.getJSON()),beforeFour);
    await four.pressSequentially("Новая запись");const typed=await four.evaluate(el=>el.editor.getJSON());assert.deepEqual(typed.content[1],beforeFour.content[1]);assert.deepEqual(typed.content[3],beforeFour.content[3]);assert.equal(await four.locator('[data-question-body="0"] p').first().textContent(),"Новая запись");assert.deepEqual(await four.locator('[data-question-body="2"] p').allTextContents(),["Хвост 2"]);
    await press(four,"ControlOrMeta+z");assert.deepEqual(await four.evaluate(el=>el.editor.getJSON()),beforeFour,"Cross-answer sparse typing and its replacement share one Undo");
    await four.press("Enter");assert.equal(await four.evaluate(el=>el.editor.state.selection.$from.parent.textContent),"Ответ 2");assert.deepEqual(await four.evaluate(el=>el.editor.getJSON()),beforeFour,"Enter edits head without deleting cross-answer selection");
    assert.deepEqual(await four.locator('h3[contenteditable="false"]').allTextContents(),IDENTITY_QUESTION_TITLES);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
    assert.deepEqual(errors,[]);await page.close();console.log(`PASS sparse blocks ${width}×${height}: native toggle/range clicks, exact copy/cut/typing/IME cancel, colour/types, moves/drag/duplicates/delete, one Undo, protected answers, save/reload/public, no frames/API`);
  }
}
