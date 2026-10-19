import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';

export async function checkIdentityChartNavigation(page, width, expectedLinks = 2) {
  const links = page.getByRole('navigation', { name: 'Графики отчёта', exact: true }).getByRole('link');
  assert.equal(await links.count(), expectedLinks);
  const before = await page.locator('.identity-generated-documents__list').textContent();
  const targets = [];
  for (const link of await links.all()) {
    const href = await link.getAttribute('href');
    const id = href.slice(1);
    targets.push(id);
    const control = await link.evaluate(node => {
      const style = getComputedStyle(node), box = node.getBoundingClientRect();
      return { height: box.height, left: box.left, right: box.right, padding: [style.paddingLeft, style.paddingRight] };
    });
    assert(control.height >= 48, `${width}: chart navigation touch target`);
    assert(control.left >= 0 && control.right <= width + 1, `${width}: chart link stays reachable`);
    assert.deepEqual(control.padding, ['24px', '24px']);
    await link.focus();
    await link.press('Enter');
    await page.waitForFunction(id => location.hash === `#${id}` && document.activeElement?.id === id, id);
    await page.evaluate(()=>document.fonts.ready);
    try { await page.waitForFunction(id => {
      const node = document.getElementById(id), box = node.getBoundingClientRect();
      const margin = parseFloat(getComputedStyle(node).scrollMarginBlockStart);
      return box.top >= 0 && box.top < innerHeight && (box.top <= margin + 2 || (scrollY + innerHeight >= document.documentElement.scrollHeight - 2 && box.bottom <= innerHeight + 1));
    }, id); } catch(error) {
      const diagnostic=await page.evaluate(id=>{const n=document.getElementById(id),r=n?.getBoundingClientRect();return {id,hash:location.hash,active:document.activeElement?.id,fonts:document.fonts.status,scrollY,scrollHeight:document.documentElement.scrollHeight,height:innerHeight,target:r&&{top:r.top,bottom:r.bottom},margin:n&&getComputedStyle(n).scrollMarginBlockStart,events:window.reportAnchorTrace||[]};},id);
      const file=`/tmp/rollapp-report-anchor-${width}-${id.replace(/[^a-zA-Z0-9_-]/g,'_')}`;
      await writeFile(file+'.json',JSON.stringify(diagnostic,null,2));await page.screenshot({path:file+'.png'});
      throw new Error(`Chart navigation did not settle: ${JSON.stringify(diagnostic)}`,{cause:error});
    }
    // Native focus normalization can finish after initial fragment alignment.
    await page.waitForTimeout(650);
    const target = await page.evaluate(id => {
      const node = document.getElementById(id), box = node.getBoundingClientRect();
      return { top: box.top, bottom: box.bottom, height: innerHeight, atEnd: scrollY + innerHeight >= document.documentElement.scrollHeight - 2, margin: parseFloat(getComputedStyle(node).scrollMarginBlockStart), focus: document.activeElement === node, chart: node.matches('.identity-pdf-scores,.identity-pdf-subscale-columns') };
    }, id);
    // A short final chart can already fit while the document reaches its scroll limit.
    assert(target.top >= 0 && target.top < target.height, `${width}: chart destination visible`);
    assert(target.top <= target.margin + 2 || (target.atEnd && target.bottom <= target.height + 1), `${width}: chart aligned or fully visible at document end`);
    assert(target.focus && target.chart);
  }
  assert.equal(new Set(targets).size, expectedLinks, `${width}: independent scale/subscale destinations`);
  assert.equal(await page.locator('.identity-generated-documents__list').textContent(), before, 'jump keeps source order and text');
}

export async function checkIdentityReportCharts(browser, origin, {navigationOnly=false,slowFonts=false}={}) {
  for (const [width, height] of (navigationOnly?[]:[[320,844],[390,844],[390,400],[768,844],[820,844],[1024,844],[1440,844],[1920,844]])) {
    const page = await browser.newPage({ viewport: { width, height } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/api/**', route => { errors.push('Unexpected API request'); return route.abort(); });
    await page.goto(`${origin}/__hogan-scales`);
    await page.locator('.identity-pdf-score__track').last().waitFor();
    await page.evaluate(() => document.fonts.ready);
    assert.deepEqual(await page.locator('.identity-pdf-score__value').allTextContents(), ['0','37','100']);
    for (const meter of await page.locator('.identity-pdf-score__track').all()) {
      const geometry = await meter.evaluate(node => ({ value: Number(node.parentElement.querySelector('.identity-pdf-score__value').textContent), width: node.getBoundingClientRect().width, fill: node.firstElementChild.getBoundingClientRect().width }));
      assert(Math.abs(geometry.fill - geometry.width * geometry.value / 100) < 1, `${width}: exact source score geometry`);
    }
    assert.equal(await page.getByRole('img', { name: /2 \/ 4$/ }).count(), 3);
    assert.equal(await page.getByRole('img', { name: /5 \/ 5$/ }).count(), 3);
    assert.equal(await page.getByRole('img', { name: /0 \/ 4$/ }).count(), 3);
    const rank = page.getByRole('img', { name: '17 / 34', exact: true });
    assert.equal(await rank.locator(':scope > span').count(), 34);
    const rankGeometry = await rank.evaluate(node => {
      const box = node.getBoundingClientRect(), style = getComputedStyle(node);
      const cells = [...node.children].map(cell => { const r = cell.getBoundingClientRect(); return { left: r.left, right: r.right, width: r.width, color: getComputedStyle(cell).backgroundColor }; });
      return { left: box.left, right: box.right, columns: style.gridTemplateColumns.split(' ').length, cells };
    });
    assert.equal(rankGeometry.columns, 34);
    assert(rankGeometry.cells.every(cell => cell.width > 0));
    assert(rankGeometry.cells[0].left >= rankGeometry.left - 1 && rankGeometry.cells.at(-1).right <= rankGeometry.right + 1, `${width}: all 34 source rank cells fit`);
    assert.equal(rankGeometry.cells[16].color, 'rgb(90, 128, 177)');
    const label = await page.locator('.identity-pdf-score').last().locator(':scope > span').first().evaluate(node => {
      const style = getComputedStyle(node);
      return { text: node.textContent, overflowWrap: style.overflowWrap, textOverflow: style.textOverflow, height: node.clientHeight, scrollHeight: node.scrollHeight };
    });
    assert(label.text.endsWith('CliftonStrengthsДлиннаяПодпись'.repeat(5)));
    assert.equal(label.overflowWrap, 'anywhere');
    assert.notEqual(label.textOverflow, 'ellipsis');
    assert(label.scrollHeight <= label.height + 1, `${width}: the full unbroken label remains visible`);
    const geometry = await page.evaluate(() => {
      const chart = document.querySelector('.identity-pdf-subscale-columns');
      const text = getComputedStyle(chart.querySelector('.identity-pdf-subscale > span'));
      return {
        rootOverflow: document.documentElement.scrollWidth > innerWidth + 1,
        overflow: [...document.querySelectorAll('.identity-pdf-content *')].filter(el => el.clientWidth && el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).display !== 'inline').map(el => el.className),
        columns: getComputedStyle(chart).gridTemplateColumns.split(' ').length,
        family: text.fontFamily, size: text.fontSize, lineHeight: text.lineHeight,
        segmentColors: [...chart.querySelector('.identity-pdf-subscale__cells').children].map(el => getComputedStyle(el).backgroundColor),
      };
    });
    assert(!geometry.rootOverflow, `${width}: root overflow`);
    assert.deepEqual(geometry.overflow, [], `${width}: descendant overflow`);
    assert.equal(geometry.columns, width > 820 ? 3 : 1, `${width}: source profile columns`);
    assert(geometry.family.includes('Geist'));
    assert.equal(geometry.size, '18px');
    assert.equal(geometry.lineHeight, '28px');
    assert.deepEqual(geometry.segmentColors.slice(0,2), ['rgb(255, 176, 0)','rgb(255, 176, 0)']);
    assert.equal(geometry.segmentColors[2], geometry.segmentColors[3]);
    assert.notEqual(geometry.segmentColors[2], 'rgba(0, 0, 0, 0)');
    await checkIdentityChartNavigation(page, width);
    await page.getByText('Конец графического отчёта.').scrollIntoViewIfNeeded();
    assert(await page.getByText('Конец графического отчёта.').isVisible());
    await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
    if (width === 390 || width === 1440) await page.screenshot({ path: `/tmp/rollapp-hogan-charts-${width}-${height}.png`, fullPage: true });
    assert.deepEqual(errors, []);
    console.log(`PASS Hogan charts ${width}×${height}: exact 0/37/100 bars, all 34 source rank cells, full unbroken labels, source segment colors/counts, responsive columns, Geist 18/28 and no API`);
    await page.close();
  }
  for (const width of [320, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 844 } });
    if(slowFonts) await page.route('**/*.woff2*',async route=>{await new Promise(resolve=>setTimeout(resolve,1000));await route.continue();});
    await page.addInitScript(()=>{window.reportAnchorTrace=[];for(const name of ['loading','loadingdone'])document.fonts.addEventListener(name,()=>window.reportAnchorTrace.push({event:name,time:performance.now(),scrollY,fonts:document.fonts.status}));window.addEventListener('scrollend',()=>window.reportAnchorTrace.push({event:'scrollend',time:performance.now(),scrollY,fonts:document.fonts.status}));document.addEventListener('click',event=>{const link=event.target.closest('a[href^="#"]');if(link)window.reportAnchorTrace.push({event:'click',time:performance.now(),href:link.hash,scrollY,fonts:document.fonts.status});},true);});
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/api/**', route => { errors.push('Unexpected API request'); return route.abort(); });
    await page.goto(`${origin}/__hogan-scales?charts=multiple`);
    await page.getByRole('navigation', { name: 'Графики отчёта', exact: true }).waitFor();
    if (!slowFonts) await page.evaluate(()=>document.fonts.ready);
    await checkIdentityChartNavigation(page, width, 4);
    if(navigationOnly) await writeFile(`/tmp/rollapp-report-anchor-trace-${width}.json`,JSON.stringify(await page.evaluate(()=>window.reportAnchorTrace),null,2));
    assert.equal(await page.locator('.identity-generated-document').count(), 3);
    assert.equal(await page.locator('.identity-generated-document h2').first().textContent(), 'Summary.pdf');
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await page.goto(`${origin}/__hogan-scales?charts=none`);
    await page.getByText('В этом PDF только текст.', { exact: true }).waitFor();
    assert.equal(await page.getByRole('navigation', { name: 'Графики отчёта', exact: true }).count(), 0);
    assert.deepEqual(errors, []);
    console.log(`PASS Hogan chart navigation ${width}: two chart files after long summary, unique keyboard destinations, full filenames and text-only state without API`);
    await page.close();
  }
}


export async function checkIdentityChartStability(browser, origin) {
  for (const [width,height] of [[1024,844],[1440,400]]) {
    const page = await browser.newPage({viewport:{width,height}}), errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.route('**/api/**',route=>{errors.push('Unexpected API request');return route.abort();});
    for (let attempt=0;attempt<10;attempt++) {
      await page.goto(`${origin}/__hogan-scales`);
      await page.locator('.identity-pdf-score__track').last().waitFor();
      await page.evaluate(()=>document.fonts.ready);
      await checkIdentityChartNavigation(page,width);
      const hashes = await page.getByRole('navigation',{name:'Графики отчёта',exact:true}).getByRole('link').evaluateAll(nodes=>nodes.map(node=>node.getAttribute('href')));
      await page.goBack();await page.waitForFunction(hash=>location.hash===hash,hashes[0]);
      await page.goForward();await page.waitForFunction(hash=>location.hash===hash,hashes[1]);
    }
    assert.deepEqual(errors,[]);await page.close();
    console.log(`PASS Hogan anchor stability ${width}×${height}: ten repeated native keyboard/focus jumps, 650ms stable alignment, original href/history and no API`);
  }
}
