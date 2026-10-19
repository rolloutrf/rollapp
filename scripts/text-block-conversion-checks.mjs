import assert from "node:assert/strict";
import { IDENTITY_QUESTION_TITLES } from "../shared/identity-questions.js";

export async function checkTextBlockConversion(browser, origin) {
  for (const [width,height] of [[320,844],[390,844],[390,400],[768,844],[820,844],[1024,844],[1440,844],[1920,844]]) {
    const page=await browser.newPage({viewport:{width,height}}), errors=[];
    page.on("pageerror", error=>errors.push(error.message));
    await page.route("**/api/**",route=>{errors.push("Unexpected API request");return route.abort();});
    const source='<p data-block-color="red"><strong>Красный</strong> текст</p><p data-block-color="blue_background">Синий фон</p><p>Обычный текст</p><p data-block-color="green">Зелёный <span data-inline-color="purple">фрагмент</span></p><p>Сосед</p>'.match(/<p(?: [^>]*)?>[\s\S]*?<\/p>/g).map(block=>`<div data-inline-block="true">${block}</div>`).join('\n\n');
    const editor=page.getByRole("textbox",{name:"О себе",exact:true});
    const menu=page.getByRole("dialog",{name:"Действия текстового блока",exact:true});
    const search=menu.getByRole("searchbox",{name:"Поиск действий блока",exact:true});
    const json=()=>editor.evaluate(el=>el.editor.getJSON());
    await page.goto(`${origin}/__text-edit?source=${encodeURIComponent(source)}`);await editor.locator("p").nth(4).waitFor();
    const original=await json();
    await editor.locator("p").first().click();await editor.press("Escape");
    for(let count=0;count<3;count+=1)await editor.press("Shift+ArrowDown");
    const convert=async query=>{await editor.press("ControlOrMeta+/");await search.fill(query);await search.press("Enter");await menu.waitFor({state:"hidden"});};
    await convert("heading 2");
    const converted=await json();
    assert.deepEqual(converted.content.slice(0,4).map(node=>node.type),Array(4).fill("heading"));
    assert.deepEqual(converted.content.slice(0,4).map(node=>node.attrs.blockColor),["red","blue_background",null,"green"],"Each block retains its own colour, including default, when the group changes type");
    assert.deepEqual(converted.content.map(node=>node.content),original.content.map(node=>node.content),"Inline styles, text and neighbours survive conversion");
    const layout=await editor.evaluate(el=>({overflow:document.documentElement.scrollWidth>innerWidth+1,frames:[el,...el.querySelectorAll("h2")].map(node=>{const s=getComputedStyle(node);return [s.borderTopWidth,s.borderRightWidth,s.borderBottomWidth,s.borderLeftWidth,s.outlineStyle,s.boxShadow];})}));
    assert.equal(layout.overflow,false);for(const frame of layout.frames)assert.deepEqual(frame,["0px","0px","0px","0px","none","none"]);
    if(width===390 || width===1440)await page.screenshot({path:`/tmp/rollapp-mixed-conversion-${width}-${height}.png`,fullPage:true});
    await editor.press("ControlOrMeta+z");assert.deepEqual(await json(),original,"The entire group conversion is one Undo");
    await editor.press("ControlOrMeta+Shift+z");assert.deepEqual(await json(),converted);
    const colors=["red","blue_background",null,"green"];
    const paragraphs=(node,inherited=null)=>{const color=node.attrs?.blockColor||inherited;return [...(["paragraph","heading","codeBlock"].includes(node.type)?[{...node,effectiveColor:color}]:[]),...(node.content||[]).flatMap(child=>paragraphs(child,color))];};
    for(const type of ["text","bulleted","heading 4","quote","text","numbered","text","todo","text"]) {
      await convert(type);
      assert.deepEqual(await editor.evaluate(el=>el.editor.state.selection.positions?.map(pos=>el.editor.state.doc.nodeAt(pos).textContent)),["Красный текст","Синий фон","Обычный текст","Зелёный фрагмент"],`${type}: preserve all four selected block units`);
      const blocks=paragraphs(await json());
      assert.equal(blocks.length,5,`${type}: all selected blocks and neighbour survive`);
      assert.deepEqual(blocks.slice(0,4).map(node=>node.effectiveColor),colors,`${type}: independent colours survive wrapping/lifting`);
      if(["bulleted","numbered","todo"].includes(type))assert.deepEqual((await json()).content[0].content.map(node=>node.attrs.blockColor),colors,`${type}: the item owns its marker and background`);
      assert.deepEqual(blocks.map(node=>node.content),original.content.map(node=>node.content),`${type}: each block keeps its own rich text`);
    }
    const beforeCode=await json();await convert("code");
    const codes=paragraphs(await json());assert.deepEqual(codes.slice(0,4).map(node=>node.type),Array(4).fill("codeBlock"));
    assert.deepEqual(codes.slice(0,4).map(node=>node.effectiveColor),colors);
    await editor.press("ControlOrMeta+z");assert.deepEqual(await json(),beforeCode);
    const beforeToggles=await json();await convert("toggle");
    const toggles=await json();assert.deepEqual(toggles.content.slice(0,4).map(node=>node.type),Array(4).fill("details"));
    assert.deepEqual(toggles.content.slice(0,4).map(node=>node.attrs.blockColor),colors);
    assert.deepEqual(toggles.content.slice(0,4).map(node=>node.content[0].content),original.content.slice(0,4).map(node=>node.content));
    assert.deepEqual(toggles.content[4],original.content[4]);
    await editor.press("ControlOrMeta+z");assert.deepEqual(await json(),beforeToggles,"All selected toggles share one Undo");
    await convert("heading 2");const final=await json();
    const expected=await editor.evaluate(el=>el.editor.getMarkdown());
    await page.waitForFunction(value=>window.inlineTest.saved===value,expected);
    const saved=await page.evaluate(()=>window.inlineTest.saved);
    await page.goto(`${origin}/__text-edit?source=${encodeURIComponent(saved)}`);await editor.locator("h2").nth(3).waitFor();
    assert.deepEqual(await json(),final,"Each block style survives autosave and reload");
    const publicUrl=`${origin}/__text-edit?source=${encodeURIComponent(saved)}&public=1`;
    await page.goto(publicUrl);await page.locator('h2[data-block-color="blue_background"]').waitFor();
    assert.deepEqual(await page.locator("h2").evaluateAll(nodes=>nodes.map(node=>node.getAttribute("data-block-color"))),colors);
    assert.equal(await page.locator('[contenteditable="true"]').count(),0);
    const caretSource='<div data-inline-block="true"><p data-block-color="red">Начало конец</p></div>';
    for(const method of ["menu","slash"]) {
      await page.goto(`${origin}/__text-edit?source=${encodeURIComponent(caretSource)}`);await editor.locator("p").waitFor();
      await editor.locator("p").evaluate((el,method)=>{el.closest('[contenteditable]').focus();const text=el.firstChild,range=document.createRange();range.setStart(text,method==="menu"?7:text.textContent.length);range.collapse(true);const s=getSelection();s.removeAllRanges();s.addRange(range);},method);
      if(method==="menu")await convert("toggle");
      else {await editor.pressSequentially(" /toggle");await editor.press("Enter");}
      await editor.locator("summary").waitFor();
      assert.equal(await editor.evaluate(el=>el.editor.state.selection.$from.parentOffset),method==="menu"?7:13,`${method}: the caret remains at the original text position`);
      await editor.pressSequentially("X");assert.equal(await editor.locator("summary").textContent(),method==="menu"?"Начало Xконец":"Начало конец X");
      assert.equal(await editor.locator('[data-type="details"]').getAttribute("data-block-color"),"red");
    }
    const tableSource='<div data-inline-block="true"><table data-inline-table="true">'+[["red","purple"],["blue_background","green"]].map((row,index)=>'<tr>'+row.map((color,column)=>`<td><p data-block-color="${color}">${["A","B","C","D"][index*2+column]}</p></td>`).join('')+'</tr>').join('')+'</table></div>';
    await page.goto(`${origin}/__text-edit?source=${encodeURIComponent(tableSource)}`);await editor.locator("td").nth(3).waitFor();
    const beforeTable=await json();await editor.locator("td").first().click();await editor.press("ControlOrMeta+/");
    await menu.getByRole("button",{name:"Выделить столбец",exact:true}).click();await menu.waitFor({state:"hidden"});
    for(const type of ["heading 3","toggle"]) {
      await convert(type);const result=(await json()).content[0];
      for(const row of [0,1]) {
        assert.deepEqual(result.content[row].content[1],beforeTable.content[0].content[row].content[1],`${type}: intervening cells remain unchanged`);
        const node=result.content[row].content[0].content[0];assert.equal(node.type,type==="toggle"?"details":"heading");assert.equal(node.attrs.blockColor,["red","blue_background"][row]);
      }
      assert.equal(await editor.evaluate(el=>el.editor.state.selection.toJSON().type),"cell");
      await editor.press("ControlOrMeta+z");assert.deepEqual(await json(),beforeTable);
    }
    const questions={questions:IDENTITY_QUESTION_TITLES.map((title,index)=>({title,paragraphs:[source.split("\n\n")[index]]}))};
    await page.goto(`${origin}/__text-edit?four=1&questions=${encodeURIComponent(JSON.stringify(questions))}`);
    const four=page.getByRole("textbox",{name:"Ответы на четыре вопроса",exact:true});await four.locator('[data-question-body="3"]').waitFor();
    const beforeFour=await four.evaluate(el=>el.editor.getJSON());
    for(const backwards of [false,true]) {
    await four.evaluate((el,backwards)=>{const ps=el.querySelectorAll('[data-question-body] p');el.focus();const s=getSelection();s.removeAllRanges();if(backwards){const start=ps[0].querySelector("strong").firstChild,end=ps[1].firstChild;s.setBaseAndExtent(end,end.textContent.length,start,0);}else{const range=document.createRange();range.setStartBefore(ps[0]);range.setEndAfter(ps[1]);s.addRange(range);}},backwards);
    await four.press("ControlOrMeta+/");await search.fill("heading 2");await search.press("Enter");await menu.waitFor({state:"hidden"});
    const afterFour=await four.evaluate(el=>el.editor.getJSON());
    assert.deepEqual(afterFour.content.map(section=>section.content[0].attrs.blockColor),colors);
    assert.deepEqual(afterFour.content.map(section=>section.content[0].type),["heading","heading","paragraph","paragraph"]);
    assert.deepEqual(await four.locator('h3[contenteditable="false"]').allTextContents(),IDENTITY_QUESTION_TITLES);
    await four.press("ControlOrMeta+z");assert.deepEqual(await four.evaluate(el=>el.editor.getJSON()),beforeFour);
    }
    assert.deepEqual(errors,[]);await page.close();
    console.log(`PASS mixed block conversion ${width}×${height}: independent colours/default/inline marks, lists/quotes/code/toggles, disjoint cells, bidirectional answers, one Undo/Redo, exact save/reload/public read and no frames/API`);
  }
}
