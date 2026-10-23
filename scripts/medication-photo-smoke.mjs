import assert from "node:assert/strict";
import sharp from "sharp";
import { mkdir, writeFile } from "node:fs/promises";
import { createServer } from "vite";
import { chromium } from "playwright-core";
import { browserLaunchOptions } from "./browser-runtime.mjs";
import { listenSmokeServer, smokeOrigin } from "./smoke-server.mjs";
const out = "/tmp/rollapp-medication-photo";
await mkdir(out, { recursive: true });
const png = await sharp({ create: { width: 47, height: 69, channels: 4, background: "#dddddd" } }).png().toBuffer();
const server = await createServer({ cacheDir: "node_modules/.vite-medication-photo-smoke", server: { host: "127.0.0.1", port: 0, strictPort: true, hmr: false, watch: null }, plugins: [{ name: "medication-photo-fixture", enforce: "pre", transform(source, id) {
  if (id.endsWith("/src/components/medications.jsx?medication-photo-fixture")) return source + "\nexport { MedicationDrawer, MedicationCard };";
  if (id.endsWith("/src/lib/sphere-sharing.jsx")) return source + "\nexport { SphereSharingContext };";
  if (id.endsWith("/src/api.js")) return "export const api = new Proxy({}, { get: (_, key) => (...args) => { if (!window.medicationPhotoTransport?.[key]) throw Error('Unexpected fixture transport: '+key); return window.medicationPhotoTransport[key](...args); } });";
}, configureServer(vite) { vite.middlewares.use(async (req, res, next) => {
  if (req.url.startsWith("/__medication-photo.png")) { res.setHeader("Content-Type", "image/png"); res.end(png); return; }
  if (!req.url.startsWith("/__medication-photo")) return next();
  res.setHeader("Content-Type", "text/html");
  res.end(await vite.transformIndexHtml(req.url, '<!doctype html><html class="dark"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/scripts/fixtures/medication-photo.jsx"></script></body></html>'));
}); } }] });
await listenSmokeServer(server);
const browser = await chromium.launch(browserLaunchOptions());
const results = [];
let unexpectedApi = 0;
try {
 for (const [width, height] of [[320,900],[390,900],[768,900],[820,900],[1024,900],[1440,900],[1920,900],[390,400],[1024,400]]) {
  const page = await browser.newPage({ viewport: { width, height } });
  page.setDefaultTimeout(20000);
  const errors = []; page.on("pageerror", error => errors.push(error.message));
  // Authoring uses the explicit transport above; no real API/DB requests.
  await page.route("**/api/**", route => { if (route.request().resourceType() === "image") return route.fulfill({contentType:"image/png",body:png}); unexpectedApi++; return route.abort(); });
  await page.goto(`${smokeOrigin(server)}/__medication-photo`);
  const cardImage = page.locator(".collection-snippet__media img");
  await cardImage.waitFor();
  assert(await cardImage.evaluate(img => img.complete && img.naturalWidth > 0));
  assert(await cardImage.evaluate(img => {
    const r = img.getBoundingClientRect(), p = img.parentElement.getBoundingClientRect();
    return r.top >= p.top - 1 && r.left >= p.left - 1 && r.bottom <= p.bottom + 1 && r.right <= p.right + 1 && getComputedStyle(img).objectFit === "contain";
  }), "portrait packaging must fit entirely within the shared media frame");
  await page.getByRole("button", { name: "Открыть форму", exact: true }).click();
  const photo = page.getByRole("img", { name: /Фото препарата/ }); await photo.waitFor();
  assert.equal(await page.getByLabel("Ссылка на фото препарата").inputValue(), `${smokeOrigin(server)}/__medication-photo.png`);
  const imageBox = await photo.boundingBox(); assert(imageBox.width <= width && imageBox.width > 0);
  await page.getByLabel("Ссылка на фото препарата").fill(`${smokeOrigin(server)}/__medication-photo.png?changed`);
  await page.evaluate(() => { window.failMedicationSave = true; });
  await page.getByRole("button", { name: "Сохранить изменения", exact: true }).click();
  await page.getByText("Не удалось сохранить: повторите", { exact: true }).waitFor();
  assert((await page.getByLabel("Ссылка на фото препарата").inputValue()).endsWith("?changed"));
  await page.getByRole("button", { name: "Сохранить изменения", exact: true }).click();
  await page.getByRole("button", { name: "Открыть форму", exact: true }).waitFor();
  await page.waitForFunction(() => !document.querySelector('[data-slot="drawer-popup"]'));
  assert((await cardImage.getAttribute("src")).endsWith("?changed"));
  await page.getByRole("button", { name: "Открыть форму", exact: true }).click();
  await page.getByRole("button", { name: "Убрать фото", exact: true }).click();
  assert.equal(await page.getByRole("img", { name: /Фото препарата/ }).count(), 0);
  await page.getByRole("button", { name: /^(Отмена|Назад)$/ }).click();
  await page.waitForFunction(() => !document.querySelector('[data-slot="drawer-popup"]'));
  assert((await cardImage.getAttribute("src")).endsWith("?changed"), "cancel preserves authored photo");
  await page.getByRole("button", { name: "Открыть форму", exact: true }).click();
  await page.getByRole("button", { name: "Убрать фото", exact: true }).click();
  await page.getByRole("button", { name: "Сохранить изменения", exact: true }).click();
  await page.waitForFunction(() => !document.querySelector('[data-slot="drawer-popup"]'));
  assert.equal(await cardImage.count(), 0, "explicit removal persists on the card");
  await page.getByRole("button", { name: "Открыть форму", exact: true }).click();
  assert.equal(await page.getByLabel("Ссылка на фото препарата").inputValue(), "");
  await page.getByLabel("Файл фото препарата").setInputFiles({ name: "bad.svg", mimeType: "image/svg+xml", buffer: Buffer.from("<svg/>") });
  await page.getByText("Подойдёт JPG, PNG или WEBP до 8 МБ.", { exact: true }).waitFor();
  await page.getByLabel("Файл фото препарата").setInputFiles({ name: "photo.png", mimeType: "image/png", buffer: png });
  await page.waitForFunction(() => document.querySelector('img[alt^="Фото препарата"]')?.getAttribute('src')?.startsWith('/api/media/'));
  await page.getByRole("button", { name: "Сохранить изменения", exact: true }).click();
  await page.waitForFunction(() => !document.querySelector('[data-slot="drawer-popup"]'));
  assert.equal(await page.evaluate(() => window.medicationPhotoCalls.filter(call => call.method === "delete").length), 0, "saved upload must not be released");
  await page.getByRole("button", { name: "Открыть форму", exact: true }).click();
  const footer = page.locator('[data-control-bar]').last();
  for (const button of await footer.locator('button').all()) {
    const geometry = await button.evaluate(el => { const r = el.getBoundingClientRect(), s = getComputedStyle(el); return { height: r.height, radii: [s.borderTopLeftRadius,s.borderTopRightRadius,s.borderBottomLeftRadius,s.borderBottomRightRadius].map(parseFloat) }; });
    assert.equal(geometry.height,48); assert(geometry.radii.every(r => r >= 24));
  }
  await footer.evaluate(el => el.scrollIntoView({ block: "end", behavior: "instant" }));
  if (width >= 768) await page.locator('[data-slot="drawer-popup"]').evaluate(el => Promise.all(el.getAnimations({subtree:true}).map(animation => animation.finished.catch(() => {}))));
  await page.waitForFunction(() => { const el = document.querySelector('[data-slot="drawer-popup"]'); if (!el) return true; const r = el.getBoundingClientRect(); return r.x >= -1 && r.right <= innerWidth + 1; });
  await page.screenshot({ path: `${out}/${width}x${height}.png`, fullPage: true });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
  await page.getByRole("button", { name: /^(Отмена|Назад)$/ }).click();
  await page.waitForFunction(() => !document.querySelector('[data-slot="drawer-popup"]'));
  assert.equal(await page.evaluate(() => window.medicationPhotoCalls.filter(call => call.method === "delete").length), 0, "previously saved photo is not a pending asset");
  await page.getByRole("button", { name: "Открыть форму", exact: true }).click();
  await page.evaluate(() => { window.deferMedicationUpload = true; });
  await page.getByLabel("Файл фото препарата").setInputFiles({ name: "photo.png", mimeType: "image/png", buffer: png });
  await page.waitForFunction(() => !!window.resolveMedicationUpload);
  assert(await page.getByRole("button", { name: "Сохранить изменения", exact: true }).isDisabled());
  await page.evaluate(() => { window.closeMedicationOwner(); });
  await page.waitForFunction(() => !document.querySelector('[data-slot="drawer-popup"]'));
  await page.evaluate(() => window.resolveMedicationUpload());
  await page.waitForFunction(() => window.medicationPhotoCalls.some(call => call.method === "delete"));
  assert.deepEqual(errors, []);
  results.push({width,height,status:"passed"}); console.log(`PASS medication photo ${width}×${height}: edit/cancel/retry/upload/save/late owner/controls`);
  await page.close();
 }
 assert.equal(unexpectedApi,0);
} finally { await writeFile(`${out}/result.json`,JSON.stringify(results,null,2)); await browser.close(); await server.close(); }
