import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import { browserLaunchOptions, smokePort } from './browser-runtime.mjs';

const review = process.env.IDENTITY_REPORT_REVIEW_LAYOUT ? JSON.parse(await readFile(process.env.IDENTITY_REPORT_REVIEW_LAYOUT, 'utf8')) : null;
const server = await createServer({ define: { __IDENTITY_REPORT_REVIEW__: JSON.stringify(review) }, cacheDir: 'node_modules/.vite-identity-reports-smoke', server: { host: '127.0.0.1', port: smokePort(Number(process.env.IDENTITY_REPORT_TEST_PORT || 5297)), hmr: false, watch: null }, plugins: [{
  name: 'identity-report-fixture', configureServer(vite) { vite.middlewares.use(async (req, res, next) => {
    if (!req.url.startsWith('/__identity-reports')) return next();
    res.setHeader('Content-Type', 'text/html');
    res.end(await vite.transformIndexHtml(req.url, '<!doctype html><html class="dark"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/scripts/fixtures/identity-reports.jsx"></script></body></html>'));
  }); },
}] });
await server.listen();
const port = server.httpServer.address().port;
const browser = await chromium.launch(browserLaunchOptions());
try {
  for (const width of [320, 390, 768, 820, 1024, 1440, 1920]) {
   for (const section of (review ? [review.section] : ['hogan', 'gallup'])) {
    const page = await browser.newPage({ viewport: { width, height: 844 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/api/**', route => { errors.push('Unexpected API request'); return route.abort(); });
    await page.goto(`http://127.0.0.1:${port}/__identity-reports?section=${section}`);
    await page.locator('.identity-pdf-content h3').first().waitFor();
    await page.evaluate(() => document.fonts.ready);
    if (!review) {
    assert.equal(await page.locator('.identity-pdf-content h3').first().textContent(), 'СИЛЬНЫЕ СТОРОНЫ');
    assert.equal(await page.locator('.identity-pdf-content p').first().textContent(), 'Этот абзац извлечён из PDF. Переносы строк исходной страницы объединены, а слова сохранены.');
    assert.deepEqual(await page.locator('table').first().locator('tbody tr').allTextContents(), ['Адаптация5', 'Амбициозность84', 'Межличностная восприимчивость1']);
    assert.equal(await page.locator('ol').getAttribute('start'), '4');
    assert.equal(await page.locator('ol li').last().getAttribute('value'), '7');
    assert.equal(await page.locator('ul li').count(), 2);
    assert.equal(await page.locator('.identity-pdf-scale-table thead th').count(), 3);
    assert.equal(await page.locator('.identity-pdf-scale-table tbody tr').count(), 3);
    assert.equal(await page.locator('.identity-pdf-score__track').first().getAttribute('aria-label'), 'Амбициозность: 84');
    assert.equal(await page.locator('.identity-pdf-subscale__cells > span').count(), 24);
    assert.equal(await page.locator('.identity-pdf-subscale__cells').first().getAttribute('aria-label'), 'Исходное название подшкалы: 1 / 4');
    assert.equal(await page.locator('.identity-generated-document h2').textContent(), 'report-with-a-long-original-filename.pdf');
    }
    assert.equal(await page.locator('.identity-generated-documents [data-slot=card]').count(), 0);
    const geometry = await page.evaluate(() => {
      const article = document.querySelector('.identity-pdf-content');
      const paragraph = getComputedStyle(article.querySelector('p:not([data-typography])'));
      const heading = getComputedStyle(article.querySelector('h3'));
      const caption = getComputedStyle(article.querySelector('[data-typography="caption"]'));
      return {
        bodySize: paragraph.fontSize, leading: paragraph.lineHeight, weight: paragraph.fontWeight,
        family: paragraph.fontFamily, headingSize: heading.fontSize, captionSize: caption.fontSize,
        paragraphGap: parseFloat(getComputedStyle(article.querySelector('p + p')).marginTop),
        overflow: [...article.querySelectorAll('*')].filter(el => el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).display !== 'inline').map(el => el.tagName),
        rootOverflow: document.documentElement.scrollWidth > innerWidth + 1,
        documentBackground: getComputedStyle(document.querySelector('.identity-generated-document')).backgroundColor,
        documentShadow: getComputedStyle(document.querySelector('.identity-generated-document')).boxShadow,
      };
    });
    assert.equal(geometry.documentBackground, 'rgba(0, 0, 0, 0)');
    assert.equal(geometry.documentShadow, 'none');
    assert.equal(geometry.bodySize, '18px');
    assert.equal(geometry.leading, '28px');
    assert.equal(geometry.weight, '400');
    assert(geometry.family.includes('Geist'));
    assert.equal(geometry.headingSize, '24px');
    assert.equal(geometry.captionSize, '13px');
    assert(geometry.paragraphGap > 0);
    assert(!geometry.rootOverflow, `${section} ${width}px: root overflow`);
    assert.deepEqual(geometry.overflow, [], `${section} ${width}px: descendant overflow`);
    await page.locator('.identity-pdf-page').last().scrollIntoViewIfNeeded();
    if (!review) assert(await page.getByText('Конец исходного документа.').isVisible());
    assert.deepEqual(errors, []);
    if (!review && section === 'hogan' && (width === 390 || width === 1440)) {
      await page.locator('[data-pdf-page="3"]').screenshot({ path: `/tmp/rollapp-identity-table-${width}.png` });
      await page.locator('[data-pdf-page="4"]').screenshot({ path: `/tmp/rollapp-identity-charts-${width}.png` });
    }
    if (review && (width === 390 || width === 1440)) {
      for (const sourcePage of (process.env.IDENTITY_REPORT_REVIEW_PAGES || '1').split(',')) {
        await page.locator(`[data-pdf-page="${sourcePage}"]`).screenshot({ path: `/tmp/rollapp-identity-review-${section}-${sourcePage}-${width}.png` });
      }
    }
    console.log(`PASS ${section} ${width}px: source text, layout, no API`);
    await page.close();
   }
  }
} finally {
  await browser.close();
  await server.close();
}
