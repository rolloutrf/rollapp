import assert from "node:assert/strict";

// Real unsaved forms. Read effects are rejected without replacement; every
// mutation fails the check. Selection only changes the owning React draft.
export async function runDateFieldConsistencyChecks(browser, origin, widths) {
  const cases = [
    ['course',['Дата начала','Дата завершения']],
    ['conference',['Дата начала','Дата завершения']],
    ['coaching',['Дата']],
    ['medication',['Начало курса','Окончание курса']],
    ['workout',['Дата']],
    ['birthday',['День рождения']],
    ['event',['Дата события']],
  ];
  for(const width of widths) for(const [form,labels] of cases) {
    const page=await browser.newPage({viewport:{width,height:[390,1440].includes(width)?400:844}});
    page.setDefaultTimeout(10000);
    const errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.route('**/api/**',route=>{if(route.request().method()!=='GET')errors.push('Unexpected API mutation');return route.abort();});
    await page.goto(`${origin}/__date-page?form=${form}`);
    const trigger=label=>page.getByRole('button',{name:new RegExp(`^${label}: `)});
    await trigger(labels[0]).waitFor();
    assert.equal(await page.locator('input[type="date"]').count(),0,`${form}: native date input remains`);
    const draft=page.getByRole('textbox').first();
    await draft.fill('Черновик даты');
    const sourceUrl=page.url();
    await trigger(labels[0]).click();
    const calendar=page.locator('[data-slot="calendar"]:visible');
    await calendar.waitFor();
    if(width<768) { await page.waitForURL(url=>url.searchParams.get('formScreen')!==new URL(sourceUrl).searchParams.get('formScreen'));await page.goBack(); }
    else await page.keyboard.press('Escape');
    await calendar.waitFor({state:'hidden'});
    assert.equal(await draft.inputValue(),'Черновик даты',`${form}: cancel discarded parent draft`);
    for(const [index,label] of labels.entries()) {
      await trigger(label).click(); await calendar.waitFor();
      await calendar.getByRole('combobox',{name:'Год',exact:true}).click();
      await page.getByRole('option',{name:'2026',exact:true}).click();
      await calendar.getByRole('combobox',{name:'Месяц',exact:true}).click();
      await page.getByRole('option',{name:'окт.',exact:true}).click();
      if(index===1) assert(await calendar.locator('button[data-day="16.10.2026"]').isDisabled(),`${form}: end date permits a day before the start`);
      await calendar.locator(`button[data-day="${index===0?'17':'18'}.10.2026"]`).click();
      await calendar.waitFor({state:'hidden'});
      await trigger(label).filter({hasText:`${index===0?'17':'18'}.10.2026`}).waitFor();
      assert.equal(page.url(),sourceUrl,`${form}: selection left a nested history entry`);
      assert.equal(await draft.inputValue(),'Черновик даты',`${form}: selection discarded parent draft`);
    }
    // Every optional date can be cleared through the same picker. Required
    // workout dates deliberately have no clear action.
    await trigger(labels[0]).click();await calendar.waitFor();
    const clear=page.getByRole('button',{name:'Очистить дату',exact:true});
    if(form==='workout') { assert.equal(await clear.count(),0);if(width<768)await page.goBack();else await page.keyboard.press('Escape'); }
    else { await clear.click();await trigger(labels[0]).filter({hasText:'Выберите дату'}).waitFor(); }
    assert.equal(await draft.inputValue(),'Черновик даты');
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${form}: root overflow`);
    assert.deepEqual(errors,[],`${form}: browser errors`);
    console.log(`PASS date-field ${width} ${form}: shared picker, cancel/select/clear, parent draft, range and no writes`);
    await page.close();
  }
  for(const width of widths) {
    const page=await browser.newPage({viewport:{width,height:400}});
    const errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.route('**/api/**',route=>{errors.push('Unexpected API request');return route.abort();});
    const base=`${origin}/__date-page?date=2026-10-17&bounded`;
    await page.goto(base);
    const trigger=page.getByRole('button',{name:'Выбрать дату: 17.10.2026',exact:true});
    await trigger.focus();await page.keyboard.press('Enter');
    const calendar=page.locator('[data-slot="calendar"]:visible');await calendar.waitFor();
    for(const day of ['15','21'])assert(await calendar.locator(`button[data-day="${day}.10.2026"]`).isDisabled(),'Dates outside min/max must be disabled');
    for(const day of ['16','20'])assert(await calendar.locator(`button[data-day="${day}.10.2026"]`).isEnabled(),'Inclusive range endpoints must remain selectable');
    await calendar.locator('button[data-day="18.10.2026"]').click();
    await page.getByRole('button',{name:'Выбрать дату: 18.10.2026',exact:true}).waitFor();
    await page.goto(base+'&disabled');
    assert(await trigger.isDisabled(),'Disabled fields must not open a picker');
    assert.equal(await page.locator('[data-slot="calendar"]:visible').count(),0);
    assert.deepEqual(errors,[]);
    console.log(`PASS date-bounds ${width}: keyboard, inclusive min/max, disabled and no writes`);
    await page.close();
  }
}
