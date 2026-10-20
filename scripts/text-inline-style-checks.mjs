import { writeFile } from "node:fs/promises";
import assert from "node:assert/strict";

export async function checkTextInlineStyles(browser, origin) {
  const source = "Обычный **жирный** текст и сосед.\n\nВторой абзац.";
  const firstText = "Обычный жирный текст и сосед.";
  for (const [width, height] of [[320,844],[390,844],[390,400],[768,844],[820,844],[1024,844],[1440,844],[1920,844]]) {
    const page = await browser.newPage({ viewport: { width, height } });
    page.setDefaultTimeout(20000);
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.route("**/api/**", route => { errors.push("Unexpected API request"); return route.abort(); });
    await page.goto(`${origin}/__text-edit?source=${encodeURIComponent(source)}`);
    const editor = page.getByRole("textbox", { name: "О себе", exact: true });
    const tools = page.getByRole("toolbar", { name: "Форматирование выделенного текста" });
    let keyboardChecked = false;
    let typeKeyboardChecked = false;
    const marks = () => editor.evaluate(el => {
      const rows = [];
      el.editor.state.doc.child(0).descendants(node => { if (node.isText) rows.push({ text: node.text, marks: node.marks.map(mark => ({ type: mark.type.name, attrs: mark.attrs })) }); });
      return rows;
    });
    const selectParagraph = async (at = 0) => {
      await editor.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      await editor.locator(":scope > p").nth(at).evaluate(el => {
        el.closest('[contenteditable]').focus();
        const range = document.createRange(); range.selectNodeContents(el);
        const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range);
      });
      await tools.waitFor();
    };
    const selectPrefix = async () => {
      await editor.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      await editor.locator(":scope > p").first().evaluate(el => {
        el.closest('[contenteditable]').focus();
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        const first = walker.nextNode();
        const range = document.createRange(); range.setStart(first, 0); range.setEnd(first, 7);
        const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range);
      });
      await tools.waitFor();
    };
    const markAll = async type => assert((await marks()).every(row => row.marks.some(mark => mark.type === type)), `Entire range must carry ${type}`);
    const openTypes = async () => {
      await tools.getByRole("button", { name: "Тип блока", exact: true }).click();
      const menu = page.getByRole("dialog", { name: "Выбрать тип блока", exact: true });
      await menu.waitFor();
      await tools.waitFor({ state: "hidden" });
      if (width === 390 && height === 400 && !typeKeyboardChecked) {
        typeKeyboardChecked = true;
        await page.evaluate(() => {
          Object.defineProperty(visualViewport, "height", { configurable: true, value: 220 });
          Object.defineProperty(visualViewport, "offsetTop", { configurable: true, value: 96 });
          visualViewport.dispatchEvent(new Event("resize")); visualViewport.dispatchEvent(new Event("scroll"));
        });
        await page.waitForFunction(() => {
          const menu = document.querySelector('.inline-editor__create-menu');
          const list = menu?.querySelector('.inline-editor__block-list');
          const box = menu?.getBoundingClientRect();
          return box && box.top >= 111 && box.bottom <= 301 && list.getBoundingClientRect().height >= 48;
        });
        await page.evaluate(() => {
          Object.defineProperty(visualViewport, "height", { configurable: true, value: 400 });
          Object.defineProperty(visualViewport, "offsetTop", { configurable: true, value: 0 });
          visualViewport.dispatchEvent(new Event("resize")); visualViewport.dispatchEvent(new Event("scroll"));
        });
        await page.waitForFunction(() => getComputedStyle(document.documentElement).getPropertyValue("--app-visual-height") === "400px");
      }
      return menu;
    };
    const applyMark = async label => {
      const owner = width >= 768 ? tools : await openTypes();
      try {
        await owner.getByRole("button", { name: label, exact: true }).click();
      } catch (error) {
        await writeFile(`/tmp/rollapp-inline-style-action-${width}-${height}.json`, JSON.stringify(await page.evaluate(() => ({
          active: document.activeElement?.outerHTML, selection: getSelection()?.toString(),
          viewport: { width: innerWidth, height: innerHeight, top: visualViewport?.offsetTop, visualHeight: visualViewport?.height, scroll: scrollY },
          fonts: document.fonts.status,
          popups: [...document.querySelectorAll('[data-slot="popover-content"]')].map(el => ({ box: el.getBoundingClientRect().toJSON(), side: el.dataset.side,
            positioner: el.parentElement?.getBoundingClientRect().toJSON(), available: getComputedStyle(el).getPropertyValue('--available-height'),
            animations: el.getAnimations().map(a => ({ playState: a.playState, currentTime: a.currentTime })),
            controls: [...el.querySelectorAll('button')].slice(0,5).map(button => ({ label: button.getAttribute('aria-label'), box: button.getBoundingClientRect().toJSON(), disabled: button.disabled })) }))
        })), null, 2));
        throw error;
      }
      await tools.waitFor();
      assert.equal(await page.evaluate(() => getSelection()?.toString()), firstText, "Formatting must preserve native text selection");
    };
    const openColors = async () => {
      const owner = width >= 768 ? tools : await openTypes();
      await owner.getByRole("button", { name: "Цвет текста и фона", exact: true }).click();
      const menu = page.getByRole("dialog", { name: "Цвет текста и фона", exact: true });
      await menu.waitFor();
      await tools.waitFor({ state: "hidden" });
      // Measure and click the completed popup, not its 95% entry transform.
      // This also keeps Playwright's reveal scroll from racing its positioner.
      await menu.evaluate(async element => {
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        await Promise.all(element.getAnimations({ subtree: true }).map(animation => animation.finished.catch(() => {})));
      });
      const box = await menu.boundingBox();
      assert(box.x >= 15 && box.y >= 15 && box.x + box.width <= width - 15 && box.y + box.height <= height - 15, "Color palette must fit the visible viewport");
      if (width === 390 && height === 400 && !keyboardChecked) {
        keyboardChecked = true;
        await page.evaluate(() => {
          Object.defineProperty(visualViewport, "height", { configurable: true, value: 220 });
          Object.defineProperty(visualViewport, "offsetTop", { configurable: true, value: 96 });
          visualViewport.dispatchEvent(new Event("resize")); visualViewport.dispatchEvent(new Event("scroll"));
        });
        await page.waitForFunction(() => getComputedStyle(document.documentElement).getPropertyValue("--app-visual-height") === "220px");
        await menu.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        const visible = await menu.boundingBox();
        assert(visible.y >= 111 && visible.y + visible.height <= 301, `Color palette must remain above the simulated keyboard: ${JSON.stringify(visible)}`);
        await page.evaluate(() => {
          Object.defineProperty(visualViewport, "height", { configurable: true, value: 400 });
          Object.defineProperty(visualViewport, "offsetTop", { configurable: true, value: 0 });
          visualViewport.dispatchEvent(new Event("resize")); visualViewport.dispatchEvent(new Event("scroll"));
        });
        await page.waitForFunction(() => getComputedStyle(document.documentElement).getPropertyValue("--app-visual-height") === "400px");
      }
      return menu;
    };
    const color = async (group, label) => {
      const menu = await openColors();
      await menu.getByRole("radio", { name: `${group}: ${label}`, exact: true }).click();
      await tools.waitFor();
    };
    await editor.waitFor();
    assert.equal(await page.getByRole("toolbar").count(), 0);
    await selectParagraph();
    assert.equal(await tools.getByRole("button", { name: "Жирный", exact: true }).getAttribute("aria-pressed"), "false", "Mixed bold selection must not appear fully bold");
    await tools.getByRole("button", { name: "Жирный", exact: true }).click();
    await markAll("bold");
    await tools.getByRole("button", { name: "Жирный", exact: true }).focus();
    assert.equal(await tools.getByRole("button", { name: "Жирный", exact: true }).getAttribute("aria-pressed"), "true");
    assert((await tools.getByRole("button", { name: "Жирный", exact: true }).getAttribute("class")).includes("bg-secondary"), "Active formatting stays visible while its toolbar has keyboard focus");
    await editor.press("ControlOrMeta+z");
    await selectParagraph();
    for (const [label, mark] of [["Подчёркнутый", "underline"], ["Зачёркнутый", "strike"], ["Код в строке", "code"]]) { await applyMark(label); await markAll(mark); }
    for (const [shortcut, mark] of [["ControlOrMeta+u", "underline"], ["ControlOrMeta+Shift+s", "strike"], ["ControlOrMeta+e", "code"]]) {
      await editor.press(shortcut);
      assert((await marks()).every(row => !row.marks.some(value => value.type === mark)), `Keyboard shortcut must unset ${mark}`);
      await editor.press(shortcut);
      await markAll(mark);
    }
    assert((await marks()).some(row => row.marks.some(mark => mark.type === "bold")), "Inline code must retain existing emphasis");
    await color("Цвет текста", "Красный");
    await color("Цвет фона", "Жёлтый");
    assert((await marks()).every(row => row.marks.some(mark => mark.type === "inlineStyle" && mark.attrs.color === "red" && mark.attrs.background === "yellow")), "Changing background must retain foreground and all inline marks");
    for (const mark of ["underline", "strike", "code"]) await markAll(mark);
    const samples = await editor.locator('[data-inline-color="red"]').evaluateAll(nodes => nodes.map(node => {
      const text = node.querySelector("code") || node;
      return { foreground: getComputedStyle(node).color, inner: getComputedStyle(text).color, parent: getComputedStyle(node.closest("p")).color, background: getComputedStyle(node).backgroundColor, codeBackground: getComputedStyle(text).backgroundColor };
    }));
    assert(samples.length && samples.every(sample => sample.foreground === sample.inner && sample.foreground !== sample.parent && !["transparent", "rgba(0, 0, 0, 0)"].includes(sample.background)), "Color must reach bold/code descendants and highlight must be visible");
    assert(samples.every(sample => ["transparent", "rgba(0, 0, 0, 0)"].includes(sample.codeBackground)), "Inline code must not cover the chosen highlight with an opaque default background");
    await editor.press("ControlOrMeta+z");
    assert((await marks()).every(row => row.marks.find(mark => mark.type === "inlineStyle")?.attrs.background === null), "One Undo reverses only the last color action");
    await editor.press("ControlOrMeta+Shift+z");
    await selectParagraph(1);
    await editor.press("ControlOrMeta+Shift+h");
    assert.equal(await editor.locator(":scope > p").nth(1).locator('[data-inline-background="yellow"]').count(), 1, "The last used highlight repeats on another paragraph");
    await editor.press("ControlOrMeta+z");
    assert.equal(await editor.locator(":scope > p").nth(1).locator('[data-inline-background]').count(), 0);
    await selectParagraph();
    await selectPrefix();
    await color("Цвет текста", "Синий");
    await selectParagraph();
    const mixedPalette = await openColors();
    assert.equal(await mixedPalette.getByRole("radiogroup", { name: "Цвет текста", exact: true }).locator('[aria-checked="true"]').count(), 0, `Mixed foreground must not report a single active color: ${JSON.stringify(await marks())}`);
    assert.equal(await mixedPalette.getByRole("radio", { name: "Цвет фона: Жёлтый", exact: true }).getAttribute("aria-checked"), "true");
    await mixedPalette.getByRole("radio", { name: "Цвет текста: Красный", exact: true }).click();
    await tools.waitFor();
    await selectParagraph(1);
    await color("Цвет фона", "Зелёный");
    await editor.evaluate(el => {
      el.focus(); const range = document.createRange(); range.selectNodeContents(el);
      const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range);
    });
    await tools.waitFor();
    await color("Цвет текста", "Красный");
    assert.equal(await editor.locator(":scope > p").first().locator('[data-inline-background="yellow"]').count() > 0, true);
    assert.equal(await editor.locator(":scope > p").nth(1).locator('[data-inline-color="red"][data-inline-background="green"]').count(), 1, "Updating a mixed foreground preserves each paragraph's different background");
    await selectParagraph();
    const palette = await openColors();
    assert.equal(await palette.getByRole("radio", { name: "Цвет фона: Жёлтый", exact: true }).getAttribute("aria-checked"), "true");
    await editor.evaluate(el => {
      const records=[];window.inlineStyleFocusProbe=records;
      const record=(kind,key)=>{const native=getSelection(),active=document.activeElement;records.push({kind,key,at:performance.now(),model:el.editor.state.selection.toJSON(),native:{collapsed:native?.isCollapsed,anchor:native?.anchorOffset,focus:native?.focusOffset,anchorText:native?.anchorNode?.textContent?.slice(0,40),focusText:native?.focusNode?.textContent?.slice(0,40)},active:{tag:active?.tagName,label:active?.getAttribute('aria-label'),role:active?.getAttribute('role')}});if(records.length>250)records.shift();};
      el.editor.on('transaction',()=>record('transaction'));document.addEventListener('selectionchange',()=>record('selectionchange'));document.addEventListener('focusin',()=>record('focusin'));document.addEventListener('keydown',event=>record('keydown',event.key),true);record('start');
    });
    await palette.getByRole("radio", { name: "Цвет текста: Красный", exact: true }).focus();
    await page.keyboard.press("Home");
    await page.keyboard.press("End");
    await page.keyboard.press("Enter");
    await tools.waitFor();
    const box = await tools.boundingBox();
    assert(box.x >= 15 && box.x + box.width <= width - 15 && box.y >= 15 && box.y + box.height <= height - 15);
    const collapseTo=await editor.evaluate(el=>el.editor.state.selection.to);
    await editor.press("ArrowRight");
    try {
      await tools.waitFor({ state: "hidden" });
      const frames=await editor.evaluate(el=>new Promise(resolve=>{const frames=[],start=performance.now();const frame=()=>{frames.push({selection:el.editor.state.selection.toJSON(),toolbar:document.querySelectorAll('[role="toolbar"]').length,collapsed:getSelection()?.isCollapsed});if(performance.now()-start>=650)resolve(frames);else requestAnimationFrame(frame);};frame();}));
      for(const frame of frames){assert.equal(frame.selection.anchor,frame.selection.head,"A collapsed caret must not be replaced by a delayed focus callback");assert.equal(frame.selection.head,collapseTo,"ArrowRight collapses at the original range endpoint without inserting or skipping characters");assert(frame.collapsed);assert.equal(frame.toolbar,0);}
    }catch(error){
      await writeFile(`/tmp/rollapp-inline-style-focus-${width}-${height}.json`,JSON.stringify(await editor.evaluate(el=>({records:window.inlineStyleFocusProbe,selection:el.editor.state.selection.toJSON(),doc:el.editor.getJSON(),html:el.innerHTML,style:{userSelect:getComputedStyle(el).userSelect,visibility:getComputedStyle(el).visibility,editable:el.contentEditable,classes:el.className}})),null,2));
      await page.screenshot({path:`/tmp/rollapp-inline-style-focus-${width}-${height}.png`});throw error;
    }
    await page.screenshot({ path: `/tmp/rollapp-inline-styles-${width}-${height}.png` });
    await selectParagraph();
    await editor.press("ControlOrMeta+s");
    await page.waitForFunction(() => window.inlineTest.saved?.includes('data-inline-color="red"') && window.inlineTest.saved.includes('data-inline-background="yellow"'));
    const saved = await page.evaluate(() => window.inlineTest.saved);
    await page.goto(`${origin}/__text-edit?source=${encodeURIComponent(saved)}`);
    await editor.locator("u").first().waitFor();
    assert.equal(await editor.locator(":scope > p").first().textContent(), firstText);
    assert.equal(await page.evaluate(() => window.inlineTest.saves.length), 0);
    await selectParagraph();
    // Reset foreground only. The independent background and text marks remain.
    await color("Цвет текста", "Обычный");
    assert((await marks()).every(row => row.marks.some(mark => mark.type === "inlineStyle" && mark.attrs.color === null && mark.attrs.background === "yellow")));
    const styleMenu = await openColors();
    await styleMenu.getByRole("button", { name: "Сбросить стили", exact: true }).click();
    assert((await marks()).every(row => !row.marks.length));
    await editor.press("ControlOrMeta+z");
    await markAll("underline");
    // The public renderer must show the saved styles without editable fields.
    await page.goto(`${origin}/__text-edit?public=1&source=${encodeURIComponent(saved)}`);
    const article = page.getByRole("article", { name: "Опубликованный текст", exact: true });
    await article.locator("u").first().waitFor();
    assert.equal(await article.locator("p").first().textContent(), firstText);
    for (const selector of ["s", "code", "strong", '[data-inline-color="red"][data-inline-background="yellow"]']) assert(await article.locator(selector).count());
    assert.equal(await page.locator("[contenteditable=true], [role=toolbar]").count(), 0);
    await page.goto(`${origin}/__text-edit?readonly=1&source=${encodeURIComponent(saved)}`);
    await editor.locator("u").first().waitFor();
    assert.equal(await editor.getAttribute("contenteditable"), "false");
    assert(await editor.locator('[data-inline-color="red"][data-inline-background="yellow"]').count());
    assert.equal(await page.getByRole("toolbar").count(), 0);
    assert.equal(await page.evaluate(() => window.inlineTest.saves.length), 0);
    // A selected trailing space owns its formatting just like every letter.
    await page.goto(`${origin}/__text-edit?source=${encodeURIComponent("before middle after")}`);
    await editor.locator("p").waitFor();
    await editor.locator("p").evaluate(el=>{el.closest('[contenteditable]').focus();getSelection().setBaseAndExtent(el.firstChild,7,el.firstChild,14);});
    await tools.waitFor();await editor.press("ControlOrMeta+i");
    const styledSpace=await editor.evaluate(el=>el.editor.getJSON());
    assert.equal(styledSpace.content[0].content.find(node=>node.marks?.some(mark=>mark.type==="italic"))?.text,"middle ","The selected trailing space is italic before save");
    await editor.press("ControlOrMeta+s");await page.locator('[data-save-status="saved"]').waitFor();const spaceSource=await page.evaluate(()=>window.inlineTest.saved);
    await page.goto(`${origin}/__text-edit?source=${encodeURIComponent(spaceSource)}`);await editor.locator("em").waitFor();assert.deepEqual(await editor.evaluate(el=>el.editor.getJSON()),styledSpace,"Saved formatting retains the exact selected trailing space");
    await page.goto(`${origin}/__text-edit?public=1&source=${encodeURIComponent(spaceSource)}`);await article.locator("em").waitFor();assert.equal(await article.locator("em").textContent(),"middle ","Public reading retains the same styled space");
    // Unlink through the actual link form; a reload cannot silently relink it.
    await page.goto(`${origin}/__text-edit?source=${encodeURIComponent("before https://example.test after")}`);await editor.locator("a").waitFor();
    const linked=await editor.evaluate(el=>el.editor.getJSON());
    await editor.locator("a").evaluate(el=>{el.closest('[contenteditable]').focus();const r=document.createRange();r.selectNodeContents(el);getSelection().removeAllRanges();getSelection().addRange(r);});await tools.waitFor();await tools.getByRole("button",{name:"Ссылка",exact:true}).click();
    const address=page.getByRole("textbox",{name:"Адрес ссылки",exact:true});await address.fill("");await address.press("Enter");await address.waitFor({state:"hidden"});
    assert.equal(await editor.locator("a").count(),0);const unlinked=await editor.evaluate(el=>el.editor.getJSON());
    await editor.press("ControlOrMeta+z");assert.deepEqual(await editor.evaluate(el=>el.editor.getJSON()),linked,"One Undo restores only unlink");await editor.press("ControlOrMeta+Shift+z");assert.deepEqual(await editor.evaluate(el=>el.editor.getJSON()),unlinked);
    await editor.press("ControlOrMeta+s");await page.locator('[data-save-status="saved"]').waitFor();const unlinkedSource=await page.evaluate(()=>window.inlineTest.saved);
    await page.goto(`${origin}/__text-edit?source=${encodeURIComponent(unlinkedSource)}`);await editor.locator("p").waitFor();assert.deepEqual(await editor.evaluate(el=>el.editor.getJSON()),unlinked,"An explicitly removed link stays removed after reload");
    await page.goto(`${origin}/__text-edit?public=1&source=${encodeURIComponent(unlinkedSource)}`);await article.locator("p").waitFor();assert.equal(await article.locator("a").count(),0);assert.equal(await article.locator("p").textContent(),"before https://example.test after");
    assert.equal(await page.evaluate(()=>window.inlineTest.saves.length),0,"Opening public saved prose never rewrites it");
    // Apply both styles with real keys; escaped literal stars remain letters.
    await page.goto(`${origin}/__text-edit?source=${encodeURIComponent("#### \\*\\*literal\\*\\*emoji")}`);await editor.locator("h4").waitFor();
    await editor.locator("h4").evaluate(el=>{el.closest('[contenteditable]').focus();getSelection().setBaseAndExtent(el.firstChild,0,el.firstChild,11);});await tools.waitFor();await editor.press("ControlOrMeta+b");
    const afterBold=await editor.evaluate(el=>el.editor.getJSON());
    await editor.locator("h4").evaluate(el=>{const walker=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);let text,last;while(text=walker.nextNode())last=text;el.closest('[contenteditable]').focus();getSelection().setBaseAndExtent(last,0,last,last.length);});await tools.waitFor();await editor.press("ControlOrMeta+i");
    const adjacent=await editor.evaluate(el=>el.editor.getJSON());assert.equal(adjacent.content[0].content[0].text,"**literal**");assert(adjacent.content[0].content[0].marks.some(mark=>mark.type==="bold"));assert(adjacent.content[0].content[1].marks.some(mark=>mark.type==="italic"));
    await editor.press("ControlOrMeta+z");assert.deepEqual(await editor.evaluate(el=>el.editor.getJSON()),afterBold,"Keyboard formatting actions keep separate Undo");await editor.press("ControlOrMeta+Shift+z");assert.deepEqual(await editor.evaluate(el=>el.editor.getJSON()),adjacent);
    await editor.press("ControlOrMeta+s");await page.locator('[data-save-status="saved"]').waitFor();const adjacentSource=await page.evaluate(()=>window.inlineTest.saved);
    await page.goto(`${origin}/__text-edit?source=${encodeURIComponent(adjacentSource)}`);await editor.locator("h4").waitFor();assert.deepEqual(await editor.evaluate(el=>el.editor.getJSON()),adjacent,"Adjacent Markdown delimiters cannot change text or styles on reload");
    await page.goto(`${origin}/__text-edit?public=1&source=${encodeURIComponent(adjacentSource)}`);await article.locator("h4").waitFor();assert.equal(await article.locator("strong").textContent(),"**literal**");assert.equal(await article.locator("em").textContent(),"emoji");
    await page.goto(`${origin}/__text-edit?source=${encodeURIComponent("\\+\\+literal\\+\\+")}`);await editor.locator("p").waitFor();await editor.locator("p").click();await editor.press("End");await page.keyboard.type("!");
    const plusLiteral=await editor.evaluate(el=>el.editor.getJSON());assert.equal(await editor.locator("u").count(),0);assert.equal(await editor.locator("p").textContent(),"++literal++!");
    await editor.press("ControlOrMeta+s");await page.locator('[data-save-status="saved"]').waitFor();const plusSource=await page.evaluate(()=>window.inlineTest.saved);
    await page.goto(`${origin}/__text-edit?source=${encodeURIComponent(plusSource)}`);await editor.locator("p").waitFor();assert.deepEqual(await editor.evaluate(el=>el.editor.getJSON()),plusLiteral,"Literal plus delimiters cannot become underline on reload");
    await page.goto(`${origin}/__text-edit?public=1&source=${encodeURIComponent(plusSource)}`);await article.locator("p").waitFor();assert.equal(await article.locator("u").count(),0);assert.equal(await article.locator("p").textContent(),"++literal++!");
    // Each list item can own separate blocks; a divider cannot become text.
    for(const kind of ["bullet","ordered","task"]){
      const item=kind==="task"?'<li data-type="taskItem" data-checked="true"><p>Parent</p><hr/></li>':'<li><p>Parent</p><hr/></li>';
      const list=kind==="ordered"?`<ol start="3" type="a">${item}</ol>`:kind==="task"?`<ul data-type="taskList">${item}</ul>`:`<ul>${item}</ul>`;
      const listSource=`<div data-inline-block="true">${list}</div>\n\nNeighbour`;
      await page.goto(`${origin}/__text-edit?source=${encodeURIComponent(listSource)}`);await editor.locator("li hr").waitFor();const beforeList=await editor.evaluate(el=>el.editor.getJSON());
      await editor.locator("li p").first().evaluate(el=>{el.closest('[contenteditable]').focus();const r=document.createRange();r.selectNodeContents(el);r.collapse(false);getSelection().removeAllRanges();getSelection().addRange(r);});await page.keyboard.type(" updated");
      const richList=await editor.evaluate(el=>el.editor.getJSON());assert.equal(richList.content[0].content[0].content[1].type,"horizontalRule");assert.deepEqual(richList.content[1],beforeList.content[1]);
      await editor.press("ControlOrMeta+z");assert.deepEqual(await editor.evaluate(el=>el.editor.getJSON()),beforeList);await editor.press("ControlOrMeta+Shift+z");assert.deepEqual(await editor.evaluate(el=>el.editor.getJSON()),richList);
      await editor.press("ControlOrMeta+s");await page.locator('[data-save-status="saved"]').waitFor();const richListSource=await page.evaluate(()=>window.inlineTest.saved);
      await page.goto(`${origin}/__text-edit?source=${encodeURIComponent(richListSource)}`);await editor.locator("li hr").waitFor();assert.deepEqual(await editor.evaluate(el=>el.editor.getJSON()),richList,"List child blocks retain exact ownership after save/reload");
      await page.goto(`${origin}/__text-edit?public=1&source=${encodeURIComponent(richListSource)}`);await article.locator("li hr").waitFor();assert.equal(await article.locator("li hr").count(),1);assert.equal(await article.getByText("Parent updated",{exact:true}).count(),1);assert.equal(await article.getByText("Neighbour",{exact:true}).count(),1);
    }
    // The portal follows its React owner even when two documents are dirty.
    await page.goto(`${origin}/__text-edit?source=First%20document&twins=1`);const otherEditor=page.getByRole("textbox",{name:"Второй документ",exact:true});await otherEditor.waitFor();
    await editor.locator("p").first().evaluate(el=>{el.closest('[contenteditable]').focus();const r=document.createRange();r.selectNodeContents(el);getSelection().removeAllRanges();getSelection().addRange(r);});await tools.waitFor();await tools.getByRole("button",{name:"Ссылка",exact:true}).click();await address.focus();await address.fill("https://pending.test");
    await page.evaluate(()=>{window.portalSaveEvents=[];window.addEventListener("keydown",event=>{if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==="s")setTimeout(()=>window.portalSaveEvents.push({prevented:event.defaultPrevented,label:event.target.getAttribute("aria-label")}),0);},true);for(const label of ["О себе","Второй документ"]){const root=[...document.querySelectorAll('[role="textbox"][contenteditable]')].find(el=>el.getAttribute("aria-label")===label);root.editor.view.dispatch(root.editor.state.tr.insert(root.editor.state.doc.content.size-1,root.editor.schema.text(label==="О себе"?" FIRST":" SECOND")));}});
    await page.keyboard.press("ControlOrMeta+s");await page.waitForFunction(()=>window.portalSaveEvents.length);const portalSaved=await page.evaluate(()=>({events:window.portalSaveEvents,first:window.inlineTest.saves,second:window.inlineTest.secondSaved??null}));
    assert.deepEqual(portalSaved.events,[{prevented:true,label:"Адрес ссылки"}],"Portalled Save must cancel the browser's Save Page command");assert.deepEqual(portalSaved.first,["First document FIRST"],"Only this editor's pending draft flushes immediately");assert.equal(portalSaved.second,null,"The other editor retains its independent pending queue");assert.equal(await address.inputValue(),"https://pending.test","Save preserves the unapplied link form and its focus");assert(await address.evaluate(el=>document.activeElement===el));
    await address.press("Enter");await address.waitFor({state:"hidden"});
    assert.deepEqual(await editor.locator("a").allTextContents(),["First document"],"A background append must not enlarge the captured link target");assert.equal(await editor.locator("a").getAttribute("href"),"https://pending.test");
    if(width===390&&height===400)await page.screenshot({path:"/tmp/rollapp-inline-storage-390-400.png"});

    assert.deepEqual(errors, []);
    await page.close();
    console.log(`PASS inline styles ${width}×${height}: mixed selection, keyboard focus, underline/strike/code, foreground/background, palette keys, undo/redo, reset, exact styled spaces/unlink/literal delimiters/list children and owner-scoped portal Save/reload/Undo/public reading`);
  }
  for (const width of [390, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 400 } });
    const errors = [];
    page.setDefaultTimeout(20000);
    page.on("pageerror", error => errors.push(error.message));
    await page.route("**/api/**", route => { errors.push("Unexpected API request"); return route.abort(); });
    const colors = ["gray", "brown", "orange", "yellow", "green", "blue", "purple", "pink", "red"];
    const colored = colors.map(color => `<span data-inline-color="${color}">**${color}**</span>`).join(" ");
    const backgrounds = colors.map(color => `<span data-inline-background="${color}">${color}</span>`).join(" ");
    const source = `#### Цвета и стили\n\n${colored}\n\n${backgrounds}\n\n<span data-inline-rich><code>До </code><strong><code>после &lt;span&gt;</code></strong></span>\n\n[Опасная](javascript:alert(1)) и [Ссылка](https://example.com/?x=1&y=2)\n\n##### Сохранённый h5\n\n###### Сохранённый h6`;
    await page.goto(`${origin}/__text-edit?public=1&light=1&source=${encodeURIComponent(source)}`);
    const article = page.getByRole("article", { name: "Опубликованный текст", exact: true });
    await article.getByRole("heading", { name: "Цвета и стили", level: 4 }).waitFor();
    await page.evaluate(() => document.fonts.ready);
    const typography = await article.locator("p").first().evaluate(el => { const s = getComputedStyle(el); return [s.fontFamily, s.fontSize, s.lineHeight, s.fontWeight]; });
    assert(typography[0].includes("Geist Variable"));
    assert.deepEqual(typography.slice(1), ["18px", "28px", "400"]);
    const rendered = await article.locator("[data-inline-color]").evaluateAll(nodes => nodes.map(el => ({ color: getComputedStyle(el).color, parent: getComputedStyle(el.closest("p")).color, bold: getComputedStyle(el.querySelector("strong")).color })));
    assert.equal(rendered.length, 9);
    assert.equal(new Set(rendered.map(row => row.color)).size, 9);
    assert(rendered.every(row => row.color !== row.parent && row.bold === row.color));
    assert.equal(await article.locator("[data-inline-background]").count(), 9);
    assert.equal(await article.locator("p").nth(2).textContent(), "До после <span>");
    assert(await article.locator("strong code").count());
    assert.equal(await article.locator('a[href^="javascript:"]').count(), 0);
    assert.equal(await article.getByRole("link", { name: "Ссылка", exact: true }).count(), 1);
    assert.equal(await article.getByRole("heading", { name: "Сохранённый h5", level: 5 }).count(), 1);
    assert.equal(await article.getByRole("heading", { name: "Сохранённый h6", level: 6 }).count(), 1);
    assert.equal(await page.locator("[contenteditable=true], [role=toolbar]").count(), 0);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    assert.deepEqual(errors, []);
    await page.screenshot({ path: `/tmp/rollapp-inline-styles-light-${width}.png` });
    await page.close();
    console.log(`PASS inline styles light ${width}×400: all nine colors and highlights, bold inheritance, rich code, heading 4, Geist 18/28 and public read-only rendering`);
  }
}
