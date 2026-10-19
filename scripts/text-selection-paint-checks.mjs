import assert from "node:assert/strict";
import sharp from "sharp";

const palette=["gray","brown","orange","yellow","green","blue","purple","pink","red"];
const wrap=block=>`<div data-inline-block="true">${block}</div>`;
const mixed=palette.map(color=>wrap(`<p data-block-color="green">Текст <span data-inline-color="${color}"><strong>Цветной текст</strong></span> <span data-inline-background="${color}">подсветка</span></p>`));
const backgrounds=palette.map(color=>wrap(`<p data-block-color="${color}_background">Фон ${color}</p>`));
const source=[...mixed,...backgrounds,wrap('<p>Обычный фон</p>')].join("\n\n");
const distance=(a,b)=>a.reduce((sum,value,index)=>sum+Math.abs(value-b[index]),0);
async function pixels(locator) {
  return sharp(await locator.screenshot({animations:"disabled"})).removeAlpha().raw().toBuffer({resolveWithObject:true});
}
async function corner(locator) {
  const {data,info}=await pixels(locator),offset=((info.height-5)*info.width+info.width-5)*info.channels;
  return [...data.subarray(offset,offset+3)];
}
async function glyphs(locator,color) {
  const {data,info}=await pixels(locator),rgb=color.match(/[\d.]+/g).slice(0,3).map(Number);let count=0;
  for(let offset=0;offset<data.length;offset+=info.channels)if(distance([...data.subarray(offset,offset+3)],rgb)<16)count+=1;
  return count;
}

export async function checkTextSelectionPaint(browser,origin) {
  const sizes=[[320,844],[390,844],[390,400],[768,844],[820,844],[1024,844],[1440,844],[1920,844]];
  for(const light of [false,true])for(const [width,height,dpr=1] of [...sizes,[390,844,3]]) {
    const page=await browser.newPage({viewport:{width,height},deviceScaleFactor:dpr}),errors=[];
    page.on("pageerror",error=>errors.push(error.message));
    await page.route("**/api/**",route=>{errors.push("Unexpected API request");return route.abort();});
    const url=value=>`${origin}/__text-edit?source=${encodeURIComponent(value)}${light?"&light=1":""}`;
    await page.goto(url(source));
    const editor=page.getByRole("textbox",{name:"О себе",exact:true});await editor.locator("p").nth(18).waitFor();await page.evaluate(()=>document.fonts.ready);
    const initial=await editor.evaluate(el=>el.editor.getJSON());
    const purple=editor.locator('[data-inline-color="purple"] strong');
    const purpleColor=await purple.evaluate(el=>getComputedStyle(el).color);
    const beforeGlyphs=await glyphs(purple,purpleColor);assert(beforeGlyphs>10,"The baseline must contain actual purple glyph pixels");
    const baseline=[];
    for(const color of palette) {const target=editor.locator(`[data-inline-color="${color}"] strong`),ink=await target.evaluate(el=>getComputedStyle(el).color);baseline.push({color,ink,pixels:await glyphs(target,ink)});}
    assert.equal(new Set(baseline.map(item=>item.ink)).size,9);assert(baseline.every(item=>item.pixels>10));
    const highlights=await editor.locator('[data-inline-background]').evaluateAll(nodes=>nodes.map(el=>getComputedStyle(el).backgroundColor));
    const blue=editor.locator('p[data-block-color="blue_background"]');
    const beforeBackground=await blue.evaluate(el=>getComputedStyle(el).backgroundColor);
    const bare=editor.locator("p").last(),beforeBare=await corner(bare);
    await editor.locator("p").first().click();await editor.press("Escape");await editor.press("ControlOrMeta+a");
    assert.equal(await editor.locator(".inline-editor__block-selected").count(),19);
    // Chromium's CSSOM can resolve every ::selection currentColor from the
    // first highlighted element. Actual glyph pixels are the paint authority.
    for(const item of baseline) {
      const actual=await glyphs(editor.locator(`[data-inline-color="${item.color}"] strong`),item.ink);
      assert(actual>=item.pixels*0.5,`${item.color}: selected glyph ink must survive (${item.pixels} -> ${actual})`);
    }
    assert.deepEqual(await editor.locator('[data-inline-background]').evaluateAll(nodes=>nodes.map(el=>getComputedStyle(el).backgroundColor)),highlights);
    assert.equal(await blue.evaluate(el=>getComputedStyle(el).backgroundColor),beforeBackground,"Block selection must not replace an authored background");
    assert(await blue.evaluate(el=>getComputedStyle(el).backgroundImage!=="none"),"Selection must remain visible on a separate paint layer");
    const afterGlyphs=await glyphs(purple,purpleColor);assert(afterGlyphs>=beforeGlyphs*0.5,`Purple glyph paint must survive native block selection: ${beforeGlyphs} -> ${afterGlyphs}`);
    const selectedBare=await corner(bare);assert(distance(beforeBare,selectedBare)>10,"A block without authored background must still have a visible selection");
    assert(distance(await corner(blue),selectedBare)>8,"The selected blue background must remain distinct from the selected default background");
    const frames=await editor.locator(".inline-editor__block-selected").evaluateAll(nodes=>nodes.map(el=>{const s=getComputedStyle(el);return [s.borderTopWidth,s.borderRightWidth,s.borderBottomWidth,s.borderLeftWidth,s.outlineWidth,s.boxShadow];}));
    for(const frame of frames)assert.deepEqual(frame,["0px","0px","0px","0px","0px","none"]);
    assert.deepEqual(await editor.evaluate(el=>el.editor.getJSON()),initial);
    await page.waitForTimeout(900);assert.equal(await page.evaluate(()=>window.inlineTest.saves.length),0,"Selection and its paint never save the document");
    // A real NodeSelection must share the same colour-preserving treatment.
    await editor.evaluate(el=>{const positions=[];el.editor.state.doc.forEach((node,pos)=>{if(node.attrs.blockColor==="blue_background")positions.push(pos);});el.editor.commands.setNodeSelection(positions[0]);});
    assert.equal(await editor.locator(".ProseMirror-selectednode").count(),1);
    assert.equal(await blue.evaluate(el=>getComputedStyle(el).backgroundColor),beforeBackground);
    assert(await blue.evaluate(el=>getComputedStyle(el).backgroundImage!=="none"));
    if((width===390&&height===400||width===1440)&&dpr===1) {
      await editor.locator("p").first().click();await editor.press("Escape");await editor.press("ControlOrMeta+a");
      await purple.scrollIntoViewIfNeeded();await page.screenshot({path:`/tmp/rollapp-selection-paint-${light?"light":"dark"}-${width}-${height}.png`});
    }
    // Whole-cell selection retains both authored cell and inline highlight colours.
    const table=wrap('<table data-inline-table="true"><tr><th data-block-color="orange_background"><p data-block-color="green"><span data-inline-color="purple"><strong>Цветной</strong></span></p></th><th><p>B</p></th></tr><tr><td data-block-color="blue_background"><p>C</p></td><td><p>D</p></td></tr></table>');
    await page.goto(url(table));await editor.locator("td").last().waitFor();
    const cellColors=await editor.locator("th,td").evaluateAll(nodes=>nodes.map(el=>getComputedStyle(el).backgroundColor));
    const tableBefore=await editor.evaluate(el=>el.editor.getJSON());
    await editor.locator("th").first().click();await editor.press("ControlOrMeta+/");
    const menu=page.getByRole("dialog",{name:"Действия текстового блока",exact:true});
    await menu.getByRole("button",{name:"Выделить столбец",exact:true}).click();await menu.waitFor({state:"hidden"});
    assert.equal(await editor.locator(".selectedCell").count(),2);
    assert.deepEqual(await editor.locator("th,td").evaluateAll(nodes=>nodes.map(el=>getComputedStyle(el).backgroundColor)),cellColors);
    const cellGlyph=editor.locator('[data-inline-color="purple"] strong');
    assert((await glyphs(cellGlyph,await cellGlyph.evaluate(el=>getComputedStyle(el).color)))>10);
    assert.deepEqual(await editor.evaluate(el=>el.editor.getJSON()),tableBefore);
    assert.equal(await page.evaluate(()=>window.inlineTest.saves.length),0);assert.deepEqual(errors,[]);
    await page.close();console.log(`PASS selection paint ${light?"light":"dark"} ${width}×${height} DPR${dpr}: fragment glyph pixels, authored backgrounds, block/node/cell selection, visible tint, no frames/data changes/API`);
  }
}
