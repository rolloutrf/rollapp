import assert from 'node:assert/strict';

export async function runPlanningResultChecks(browser, origin) {
 for (const [width,height] of [[320,844],[390,844],[390,400],[768,844],[820,844],[1024,844],[1440,844],[1920,844],[1440,400]]) {
  const page=await browser.newPage({viewport:{width,height}}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/api/**',route=>{errors.push('Unexpected production API request');return route.abort();});
  try {
   await page.goto(`${origin}/__todo-ribbon?outcomes`);
   const reopen=page.getByRole('button',{name:'Открыть тестовую задачу',exact:true});
   await reopen.click();
   const title=page.getByRole('textbox',{name:'Название',exact:true});
   const description=page.getByRole('textbox',{name:'Описание',exact:true});
   const expected=page.getByRole('textbox',{name:'Ожидаемый результат',exact:true});
   const actual=page.getByRole('textbox',{name:'Факт',exact:true});
   const save=page.getByRole('button',{name:'Сохранить',exact:true});
   const close=()=>page.getByRole('button',{name:width<768?'Назад':'Закрыть задачу',exact:true}).click();
   const payload=async()=>JSON.parse(await page.locator('[data-saved-outcomes]').textContent());
   await expected.waitFor();await page.evaluate(()=>document.fonts.ready);
   assert.equal(await expected.inputValue(),'');assert.equal(await actual.inputValue(),'');
   const boxes=await Promise.all([description,expected,actual].map(field=>field.boundingBox()));
   assert(boxes[0].y+boxes[0].height<boxes[1].y&&boxes[1].y+boxes[1].height<boxes[2].y,'Result fields must follow Description in order');
   assert(boxes.every(box=>box.x>=0&&box.x+box.width<=width+1&&box.width===boxes[0].width),'Text fields overflow or use inconsistent widths');
   for (const field of [expected,actual]) {
    assert.equal(await field.getAttribute('maxlength'),'5000');
    assert.equal(await field.getAttribute('rows'),'4');
   }
   await expected.fill('Несохранённый план');await actual.fill('Несохранённый факт');
   await close();await expected.waitFor({state:'hidden'});assert.equal(await payload(),null,'Cancel persisted a draft');
   await reopen.click();await expected.waitFor();assert.equal(await expected.inputValue(),'');
   await title.fill('Ошибка сохранения');
   await expected.fill('  План\n🎯  ');await actual.fill('  Факт\n✅  ');
   await save.click();await page.getByRole('alert').waitFor();
   assert.equal(await expected.inputValue(),'  План\n🎯  ');assert.equal(await actual.inputValue(),'  Факт\n✅  ');assert.equal(await payload(),null);
   await title.fill('Результаты задачи');await save.click();await expected.waitFor({state:'hidden'});
   assert.deepEqual([(await payload()).expectedResult,(await payload()).actualResult],['План\n🎯','Факт\n✅']);
   assert.equal((await payload()).description,'Описание без новых полей');
   await reopen.click();await expected.waitFor();
   assert.equal(await expected.inputValue(),'План\n🎯');assert.equal(await actual.inputValue(),'Факт\n✅');
   await actual.scrollIntoViewIfNeeded();
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Root horizontal overflow');
   await page.screenshot({path:`/tmp/rollapp-todo-results-${width}-${height}.png`});
   await expected.fill('Новый план');await save.click();await expected.waitFor({state:'hidden'});
   assert.deepEqual([(await payload()).expectedResult,(await payload()).actualResult],['Новый план','Факт\n✅']);
   await reopen.click();await expected.waitFor();await expected.fill('');await actual.fill('');await save.click();await expected.waitFor({state:'hidden'});
   assert.deepEqual([(await payload()).expectedResult,(await payload()).actualResult],['','']);
   assert.deepEqual(errors,[]);
   console.log(`PASS ${width}x${height} task outcomes: legacy defaults, cancel, retry draft, independent save/reopen/clear, multiline Unicode, matching fields and no API writes`);
  } finally {await page.close();}
 }
}
