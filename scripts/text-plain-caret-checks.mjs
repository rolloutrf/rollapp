import assert from 'node:assert/strict';
import sharp from 'sharp';
const source=Array.from({length:70},(_,index)=>`Paragraph ${index+1}. A long structured text field for cursor navigation.`).join('\n\n');
const frames=page=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
async function caret(field){return field.evaluate(el=>{
 const s=getSelection(),r=document.createRange();r.setStart(s.focusNode,s.focusOffset);r.collapse(true);let b=r.getBoundingClientRect(),mode='collapsed';
 if(!b.height&&s.focusNode.nodeType===Node.TEXT_NODE){
  const text=s.focusNode.textContent,offset=s.focusOffset,lineHeight=parseFloat(getComputedStyle(el).lineHeight);let next=offset;
  while(next<text.length&&text[next]==='\n')next++;
  if(next<text.length){r.setStart(s.focusNode,next);r.setEnd(s.focusNode,next+1);const glyph=r.getBoundingClientRect(),shift=(next-offset)*lineHeight;b={top:glyph.top-shift,bottom:glyph.bottom-shift,height:glyph.height};}
  else {let previous=offset-1;while(previous>=0&&text[previous]==='\n')previous--;r.setStart(s.focusNode,previous);r.setEnd(s.focusNode,previous+1);const glyph=r.getBoundingClientRect(),shift=(offset-previous-1)*lineHeight;b={top:glyph.top+shift,bottom:glyph.bottom+shift,height:glyph.height};}
  mode='neighbour-line';
 }
 const header=document.querySelector('.global-app-chrome')?.getBoundingClientRect(),nav=document.querySelector('.mobile-app-navigation')?.getBoundingClientRect(),prefix=document.createRange();prefix.selectNodeContents(el);prefix.setEnd(s.focusNode,s.focusOffset);
 return {top:b.top,bottom:b.bottom,height:b.height,offset:prefix.toString().length,scrollY,headerBottom:header?.bottom||0,navTop:nav?.top||innerHeight,mode,left:el.getBoundingClientRect().left};
});}
async function paintBlankCaret(page,field){
 await place(field);await page.keyboard.press('ArrowUp');await frames(page);const c=await caret(field);assert.equal(c.mode,'neighbour-line');assert(c.top>=c.headerBottom+8&&c.bottom<=c.navTop-8);
 const clip={x:Math.floor(c.left)-3,y:Math.floor(c.top)-2,width:7,height:Math.ceil(c.height)+4};
 const buffer=await page.screenshot({caret:'initial',clip});
 const {data,info}=await sharp(buffer).removeAlpha().raw().toBuffer({resolveWithObject:true});let paintedRows=0;
 for(let y=0;y<info.height;y++){let bright=false;for(let x=0;x<info.width;x++){const pos=(y*info.width+x)*info.channels;if(data[pos]>150&&data[pos+1]>150&&data[pos+2]>150)bright=true;}if(bright)paintedRows++;}
 assert(paintedRows>=15,`native blank-line caret must actually paint: ${paintedRows} rows`);
}

async function place(field){await field.evaluate(el=>{el.focus({preventScroll:true});const text=el.firstChild,index=text.textContent.indexOf('Paragraph 36.'),range=document.createRange();range.setStart(text,index);range.collapse(true);getSelection().removeAllRanges();getSelection().addRange(range);window.scrollBy({top:range.getBoundingClientRect().top-innerHeight/2,behavior:'instant'});});}
export async function checkPlainCaret(browser,origin){
 const sizes=process.argv.includes('--plain-caret-diagnostic')?[[1024,844]]:[[320,844],[390,844],[768,844],[820,844],[1024,844],[1440,844],[1920,844],[390,400],[1440,400]];
 for(const [width,height] of sizes){
  const page=await browser.newPage({viewport:{width,height}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route('**/api/**',r=>{errors.push('Unexpected API request');return r.abort();});
  await page.goto(`${origin}/app/spheres/career?tab=about&__text_fixture=1&chrome=1&plain=1&source=${encodeURIComponent(source)}`);
  const field=page.getByRole('textbox',{name:'Описание блока',exact:true});await field.waitFor();await page.evaluate(()=>document.fonts.ready);await place(field);await frames(page);
  let hidden=null;for(let step=0;step<45;step++){await page.keyboard.press('ArrowUp');await frames(page);const c=await caret(field);if(c.height>0&&c.top<c.headerBottom+8){hidden={step,...c};break;}}
  await page.waitForTimeout(650);const settled=await caret(field);console.log('PLAIN CARET',width,height,JSON.stringify({hidden,settled}));await page.screenshot({path:`/tmp/rollapp-plain-caret-${width}-${height}.png`});
  assert(settled.height>0,'measurable native caret required');assert(settled.top>=settled.headerBottom+8,'plaintext native ArrowUp cursor must remain below app header');assert.equal(hidden,null,'plaintext cursor stays visible on each frame');
  for(const key of ['ArrowDown','Shift+ArrowDown','ArrowUp','Shift+ArrowUp']){
   await place(field);await frames(page);
   for(let step=0;step<45;step++){await page.keyboard.press(key);await frames(page);const c=await caret(field);assert(c.height>0&&c.top>=c.headerBottom+8&&c.bottom<=c.navTop-8,`${key} ${step}: ${JSON.stringify(c)}`);}
  }
  await paintBlankCaret(page,field);
  assert.equal(await field.textContent(),source);assert.deepEqual(await page.evaluate(()=>window.inlinePlainTest.inputs),[]);
  await page.evaluate(()=>scrollTo({top:0,behavior:'instant'}));await page.waitForTimeout(650);assert.equal(await page.evaluate(()=>scrollY),0,'manual scroll stays put');
  const look=await field.evaluate(el=>{const s=getComputedStyle(el);return {border:s.borderTopWidth,outline:s.outlineWidth,shadow:s.boxShadow};});assert.deepEqual(look,{border:'0px',outline:'0px',shadow:'none'});
  assert.deepEqual(errors,[]);await page.close();console.log(`PASS plaintext caret ${width}×${height}: native arrows/Shift stay visible, manual scroll preserved, unchanged text and no inputs/frames/API`);
 }
}
