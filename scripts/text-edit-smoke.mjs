import { smokeBaseUiDependencies } from "./smoke-dependencies.mjs";
import { checkPlaceholders } from "./text-placeholder-checks.mjs";
import { instrumentSmokeBrowser, smokeBrowserDiagnostics } from "./smoke-browser-diagnostics.mjs";
import { checkImageAlignment } from "./text-image-alignment-checks.mjs";
import { checkImageCaptions } from "./text-image-caption-checks.mjs";
import { checkImageViewer } from "./text-image-viewer-checks.mjs";
import { smokeMode } from "./smoke-mode.mjs";
import { listenSmokeServer, smokePort, smokeOrigin } from "./smoke-server.mjs";
import {checkLinkIntent} from "./text-link-intent-checks.mjs";
import {checkQuoteStyles} from "./text-quote-style-checks.mjs";
import {blockTypes} from "../src/lib/inline-block-types.js";
import {checkImageTransfer} from "./text-image-transfer-checks.mjs";
import {checkImageResize} from "./text-image-resize-checks.mjs";
import {checkImages,checkImageLayout,checkImageReaders,checkImageContexts,imageFixturePNG} from "./text-image-checks.mjs";
import {checkCrossClipboard,checkPartialCrossClipboard,checkCellClipboard} from "./text-cross-clipboard-checks.mjs";
import {checkInsertOwnership} from "./text-insert-ownership-checks.mjs";
import {checkGutterAlignment} from "./text-gutter-alignment-checks.mjs";
import { checkCutHistory } from "./text-cut-history-checks.mjs";
import { checkNativePageKeys } from "./text-native-page-key-checks.mjs";
import { checkColumnPersistence } from "./text-column-persistence-checks.mjs";
import { checkDocumentColumns, checkDocumentColumnContexts } from "./text-columns-checks.mjs";
import { checkTableInsertCaret } from "./text-table-insert-caret-checks.mjs";
import { checkTableGrowthContexts } from "./text-table-growth-context-checks.mjs";
import { checkPlainCaret } from "./text-plain-caret-checks.mjs";
import { checkTableGrowth, checkTableGrowthGuards } from "./text-table-growth-checks.mjs";
import { checkTableDuplicate } from "./text-table-duplicate-checks.mjs";
import { checkCaretScroll } from "./text-caret-scroll-checks.mjs";
import { checkWideTable } from "./text-table-wide-checks.mjs";
import { checkTableChrome } from "./text-table-chrome-checks.mjs";
import { checkModEnter } from "./text-mod-enter-checks.mjs";
import { checkRelocationDepth } from "./text-relocation-depth-checks.mjs";
import { checkTableHandles, checkTableAxisGuards } from "./text-table-handles-checks.mjs";
import { checkListBlockMoves, checkListBlockDrag, checkBlockDragGuards } from "./text-list-block-move-checks.mjs";
import { checkFirstOffscreenSelection } from "./text-first-selection-checks.mjs";
import { checkQuestionBlockMoves } from "./text-question-move-checks.mjs";
import { checkLongQuestionAnswers } from "./text-long-answer-checks.mjs";
import { checkTextNativeCaret } from "./text-native-caret-checks.mjs";
import { checkTextDeepLists } from "./text-deep-list-checks.mjs";
import { checkTextNesting } from "./text-nesting-checks.mjs";
import { checkTextBlockBoundaries } from "./text-block-boundary-checks.mjs";
import { checkTextSparseBlocks } from "./text-sparse-block-checks.mjs";
import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import { chromium } from "playwright-core";
import { createServer } from "vite";

import { checkTextBasicBlocks } from "./text-basic-blocks-checks.mjs";
import { checkTextBlockSelection } from "./text-block-selection-checks.mjs";
import { checkTextInlineStyles } from "./text-inline-style-checks.mjs";
import { checkTextCodePaste } from "./text-code-paste-checks.mjs";
import { checkFourQuestionDocument } from "./text-four-document-checks.mjs";
import { checkTextTables } from "./text-table-checks.mjs";
import { checkTextSlashCommands } from "./text-slash-command-checks.mjs";
import { checkTextBlockColors } from "./text-block-color-checks.mjs";
import { checkTextSelectionPaint } from "./text-selection-paint-checks.mjs";
import { checkTextBlockConversion } from "./text-block-conversion-checks.mjs";
import { checkTextBlockMenu } from "./text-block-menu-checks.mjs";
import { checkTextSelectionPosition } from "./text-selection-position-checks.mjs";
import { checkTextSymbolShortcuts } from "./text-symbol-shortcuts-checks.mjs";
import { browserLaunchOptions } from "./browser-runtime.mjs";
const port = smokePort(process.env.TEXT_EDIT_PORT);
const only = smokeMode(process.argv.slice(2), ["--image-captions-only", "--image-alignment-only", "--paste-history-diagnostic", "--quote-styles-only", "--links-only", "--surface-only", "--image-resize-only", "--image-resize-diagnostic", "--image-context-only", "--image-context-diagnostic", "--image-reader-only", "--image-reader-diagnostic", "--image-layout-only", "--image-layout-diagnostic", "--images-only", "--images-diagnostic", "--cell-clipboard-only", "--partial-cross-clipboard-only", "--cross-clipboard-only", "--insert-ownership-only", "--cut-history-only", "--gutter-alignment-only", "--symbols-only", "--selection-only", "--basic-blocks-only", "--block-selection-only", "--styles-only", "--code-paste-only", "--four-document-only", "--tables-only", "--slash-only", "--block-colors-only", "--block-menu-only", "--conversion-only", "--paint-only", "--sparse-only", "--boundaries-only", "--nesting-only", "--deep-lists-only", "--native-caret-only", "--long-answers-only", "--question-moves-only", "--first-selection-only", "--list-moves-only", "--list-drag-only", "--drag-guards-only", "--mod-enter-only", "--relocation-depth-only", "--table-handles-only", "--table-axis-guards-only", "--table-wide-only", "--table-chrome-only", "--caret-scroll-only", "--table-duplicate-only", "--table-growth-only", "--table-growth-guards-only", "--plain-caret-only", "--table-growth-contexts-only", "--table-insert-caret-only", "--columns-only", "--column-contexts-only", "--column-persistence-only", "--native-page-keys-only"]);
const server = await createServer({ optimizeDeps: { entries: ["scripts/fixtures/text-edit.jsx", "scripts/fixtures/text-chrome-frame.jsx"], include: ["zod", ...smokeBaseUiDependencies, "date-fns/locale", "next-themes", "react-day-picker"] }, cacheDir: process.env.TEXT_EDIT_CACHE_DIR || "node_modules/.vite-text-edit", server: { host: "127.0.0.1", port, strictPort: true, hmr: false, watch: null }, plugins: [{
  name: "text-edit-fixture", enforce: "pre",
  transform(source, id) {
    if (id.endsWith('/src/api.js')) {
      const start=source.indexOf('  uploadImage: (file) => request('),end=source.indexOf('  resolveContactAvatar:',start);
      source=source.slice(0,start)+`  uploadImage: async file => {
        if (!window.inlineImageFixture) return request('/uploads/images',{method:'POST',headers:{'Content-Type':file.type},body:file});
        const fixture=window.inlineImageFixture;fixture.uploads.push({name:file.name,type:file.type,size:file.size});
        if(fixture.slow)await new Promise(resolve=>fixture.pending.push(resolve));
        if(fixture.fail)throw new Error('Не удалось загрузить изображение. Повторите попытку.');
        return{id:'00000000-0000-4000-8000-'+String(fixture.uploads.length).padStart(12,'0'),imageUrl:'/__inline-image.png'};
      },\n`+source.slice(end);
      return source.replace('delete: (path) => request(path, { method: "DELETE" }),',`delete: path => {if(window.inlineImageFixture&&path.startsWith('/uploads/images/')){window.inlineImageFixture.releases.push(path);return Promise.resolve({ok:true});}return request(path,{method:'DELETE'});},`);
    }

    if (id.endsWith("/src/App.jsx?text-chrome")) return `${source}\nexport { GlobalAppChrome, SessionContext, ToastContext, CollectionNavigationContext };`;
    if (id.endsWith("/src/components/career-content.jsx")) {
      const start = source.indexOf("export function useCareerContent(");
      const end = source.indexOf("export function CareerContentError", start);
      return source.slice(0, start) + `export function useCareerContent(section, fallback) {
        const [content, setContent] = useState(fallback);
        return { content, loading: false, error: "", retry() {}, save: async value => { window.inlineTest.saves.push(value); window.inlineTest.saved = value; setContent(value); return value; } };
      }\n` + source.slice(end);
    }
    if (id.endsWith("/src/lib/sphere-sharing.jsx")) return source.replace("owner: null,", 'owner: { id: "inline-fixture" },'); if (id.endsWith("/src/components/four-questions.jsx?text-edit")) return `${source}\nexport { FourQuestionDocument };`; },
  configureServer(vite) { vite.middlewares.use(async (req, res, next) => {
    if (req.url === "/__inline-image.png") { res.setHeader("Content-Type","image/png");res.end(imageFixturePNG);return; }
    if (!req.url.startsWith("/__text-edit") && !(req.url.startsWith("/app/spheres/career?") && new URL(req.url,"http://127.0.0.1").searchParams.has("__text_fixture"))) return next();
    res.setHeader("Content-Type", "text/html");
    const theme = new URL(req.url, "http://127.0.0.1").searchParams.has("light") ? "" : "dark";
    res.end(await vite.transformIndexHtml(req.url, `<!doctype html><html class="${theme}"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/scripts/fixtures/text-edit.jsx"></script></body></html>`));
  }); },
}] });
await listenSmokeServer(server);
const origin = smokeOrigin(server);
const browser = instrumentSmokeBrowser(await chromium.launch(browserLaunchOptions()));
try {
  if (!only || only === "--surface-only") await checkPlaceholders(browser, origin);
  if(!only || only === "--image-reader-only") await checkImageViewer(browser,origin);
  if(!only || only === "--image-captions-only") await checkImageCaptions(browser,origin);
  if(!only || only === "--image-alignment-only") await checkImageAlignment(browser,origin);
  if(only === "--paste-history-diagnostic") await checkCrossClipboard(browser,origin,true);
  if(!only || only === "--quote-styles-only") await checkQuoteStyles(browser,origin);
  if(!only || only === "--links-only") await checkLinkIntent(browser,origin);
  if(!only || only === "--images-only") await checkImageTransfer(browser,origin);
  if(!only || only === "--image-resize-only" || only === "--image-resize-diagnostic") await checkImageResize(browser,origin,only === "--image-resize-diagnostic");
  if(!only || only === "--image-context-only" || only === "--image-context-diagnostic") await checkImageContexts(browser,origin,only === "--image-context-diagnostic");
  if(!only || only === "--image-reader-only" || only === "--image-reader-diagnostic") await checkImageReaders(browser,origin,only === "--image-reader-diagnostic");
  if(!only || only === "--image-layout-only" || only === "--image-layout-diagnostic") await checkImageLayout(browser,origin,only === "--image-layout-diagnostic");
  if(!only || only === "--images-only" || only === "--images-diagnostic") await checkImages(browser,origin,only === "--images-diagnostic");
  if(!only || only === "--cell-clipboard-only") await checkCellClipboard(browser,origin);
  if(!only || only === "--partial-cross-clipboard-only") await checkPartialCrossClipboard(browser,origin);
  if(!only || only === "--cross-clipboard-only") await checkCrossClipboard(browser,origin);
  if(!only || only === "--insert-ownership-only") await checkInsertOwnership(browser,origin);
  if (!only || only === "--gutter-alignment-only") await checkGutterAlignment(browser,origin);
  if (!only || only === "--cut-history-only") await checkCutHistory(browser, origin);
  if (!only || only === "--surface-only") {
  for (const width of (process.env.TEXT_EDIT_WIDTHS || "320,390,768,820,1024,1440,1920").split(",").map(Number)) {
    for (const height of width === 390 ? [844, 400] : [844]) {
      const page = await browser.newPage({ viewport: { width, height } }), errors = [];
      page.on("pageerror", error => errors.push(error.message));
      await page.route("**/api/**", route => { errors.push("Unexpected API request"); return route.abort(); });
      await page.goto(`${origin}/__text-edit`);
      const textbox = page.getByRole("textbox", { name: "О себе", exact: true });
      await textbox.waitFor();
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(1000);
      assert.equal(await page.evaluate(() => window.inlineTest.saves.length), 0, "Opening a document must not save it");
      assert.equal(await page.locator('[data-mobile-form-page], [data-slot="drawer-popup"]').count(), 0);
      assert.equal(await page.locator(".inline-editor__tools").count(), 0, "No permanent formatting toolbar");
      assert.equal(await page.getByRole("toolbar").count(), 0, "No formatting toolbar on document open");
      const editorGap = await textbox.evaluate(el => el.getBoundingClientRect().top - el.closest(".inline-editor").getBoundingClientRect().top);
      assert.equal(editorGap, 0, "Hidden contextual tools must not reserve document space");
      const firstParagraph = textbox.locator("p").first();
      await firstParagraph.click();
      assert.equal(await page.getByRole("toolbar").count(), 0, "A caret alone must not show formatting");
      await firstParagraph.evaluate(el => {
        el.closest('[contenteditable]').focus();
        const range = document.createRange(); range.selectNodeContents(el);
        const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range);
      });
      const selectionTools = page.getByRole("toolbar", { name: "Форматирование выделенного текста" });
      await selectionTools.waitFor();
      assert.equal(await page.getByRole("toolbar").count(), 1, "Selection must show exactly one formatting toolbar");
      assert.equal(await page.getByRole("button", { name: "Жирный", exact: true }).count(), 1, "Formatting controls must not be duplicated");
      const selectionBox = await selectionTools.boundingBox();
      assert(selectionBox.x >= 0 && selectionBox.y >= 0 && selectionBox.x + selectionBox.width <= width + 1 && selectionBox.y + selectionBox.height <= height + 1, "Selection toolbar must fit the viewport");
      await page.screenshot({ path: `/tmp/rollapp-contextual-toolbar-${width}-${height}.png` });
      // The contextual block trigger must remain accessible on touch-sized layouts.
      await selectionTools.getByRole("button", { name: "Действия блока", exact: true }).click();
      const contextualBlockMenu = page.getByRole("dialog", { name: "Действия текстового блока", exact: true });
      await contextualBlockMenu.waitFor();
      await selectionTools.waitFor({ state: "hidden" });
      await contextualBlockMenu.press("Escape");
      await firstParagraph.click();
      await selectionTools.waitFor({ state: "hidden" });
      assert.equal(await page.getByRole("toolbar").count(), 0, "Collapsing selection must hide formatting");
      await page.waitForTimeout(900);
      assert.equal(await page.evaluate(() => window.inlineTest.saves.length), 0, "Selection and contextual menus must not save");
      assert.equal(await page.getByRole("heading", { name: "Что для меня важно?" }).count(), 1);
      assert.equal(await textbox.locator('[data-typography="statement"]').textContent(), "Важная мысль");
      assert.equal(await textbox.locator('a').getAttribute('href'), "https://example.com");
      // Explicit creation is deferred until a type is selected, including Alt+plus above.
      const originalMarkdown = await textbox.evaluate(el => el.editor.getMarkdown());
      const openCreator = async side => {
        await textbox.locator("p").first().click();
        await textbox.evaluate(el => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        if (width >= 1024) {
          await textbox.locator("p").first().hover();
          await textbox.evaluate(el => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
          await page.getByRole("button", { name: "Добавить блок ниже", exact: true }).click({ modifiers: side === "before" ? ["Alt"] : [] });
        } else {
          await textbox.press("ControlOrMeta+/");
          await page.getByRole("button", { name: side === "before" ? "Добавить блок выше" : "Добавить блок ниже", exact: true }).click();
        }
        return page.getByRole("dialog", { name: side === "before" ? "Создать блок выше" : "Создать блок ниже", exact: true });
      };
      const creator = await openCreator("after");
      const blockSearch = page.getByRole("searchbox", { name: "Поиск типа блока" });
      await blockSearch.waitFor();
      await page.waitForFunction(() => document.activeElement?.getAttribute("aria-label") === "Поиск типа блока");
      await creator.evaluate(el => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const fullPickerBox = await creator.boundingBox();
      assert(fullPickerBox.x >= 0 && fullPickerBox.y >= 0 && fullPickerBox.x + fullPickerBox.width <= width + 1 && fullPickerBox.y + fullPickerBox.height <= height + 1, `Unfiltered block picker must fit the viewport: ${JSON.stringify(fullPickerBox)}`);
      await blockSearch.fill("text");
      await blockSearch.fill("");
      await blockSearch.press("ArrowUp");
      await creator.evaluate(el => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const lastType=blockTypes.at(-1);
      assert.equal(await creator.locator('.inline-editor__block-list > button').count(),blockTypes.length,"The full block catalogue is rendered");
      const lastOption=creator.getByRole("button",{name:lastType.label,exact:true});
      await lastOption.waitFor();
      assert(await lastOption.evaluate(el => {
        const r = el.getBoundingClientRect(), list = el.parentElement.getBoundingClientRect();
        return el.getAttribute("aria-pressed") === "true" && r.top >= list.top - 1 && r.bottom <= list.bottom + 1;
      }), "Keyboard navigation must reach the last option in a scrolling picker");
      await blockSearch.fill("несуществующий тип");
      await creator.getByText("Ничего не найдено. Попробуйте другое название.").waitFor();
      await blockSearch.press("Enter");
      await blockSearch.press("Escape");
      await page.waitForTimeout(900);
      assert.equal(await page.evaluate(() => window.inlineTest.saves.length), 0, "Opening/searching/cancelling creation must not save");
      for (const side of ["before", "after"]) {
        const popup = await openCreator(side);
        await blockSearch.fill("heading 4");
        await popup.getByRole("button", { name: "Заголовок 4", exact: true }).waitFor();
        await popup.evaluate(el => Promise.all(el.getAnimations().map(animation => animation.finished.catch(() => {}))));
        const popupBox = await popup.boundingBox();
        assert(popupBox.x >= 0 && popupBox.y >= 0 && popupBox.x + popupBox.width <= width + 1 && popupBox.y + popupBox.height <= height + 1, "Block picker must fit the viewport");
        await page.screenshot({ path: `/tmp/rollapp-create-picker-${width}-${height}.png` });
        await blockSearch.press("Enter");
        await textbox.evaluate(el => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        const focusState = await textbox.evaluate(el => ({ active: document.activeElement?.outerHTML.slice(0, 100), from: el.editor.state.selection.from, parent: el.editor.state.selection.$from.parent.toJSON(), doc: el.editor.state.doc.toJSON() }));
        assert(await textbox.evaluate(el => document.activeElement === el && el.editor.state.selection.$from.parent.type.name === "heading" && el.editor.state.selection.$from.parent.attrs.level === 4), `Creation must focus the new heading before typing: ${width}×${height} ${side} ${JSON.stringify(focusState)}`);
        await textbox.pressSequentially("Новый блок");
        const createdHeading = textbox.getByRole("heading", { name: "Новый блок", level: 4 });
        await createdHeading.waitFor();
        assert.equal(await createdHeading.evaluate((el, side) => (side === "before" ? el.nextElementSibling : el.previousElementSibling)?.textContent, side), "Текст ответа можно выделять и копировать.");
        await page.waitForFunction(() => window.inlineTest.saved?.includes("#### Новый блок"));
        await textbox.press("ControlOrMeta+z");
        await textbox.press("ControlOrMeta+z");
        await page.waitForFunction(original => window.inlineTest.saved === original, originalMarkdown);
      }
      // Reorder a paragraph through the same accessible menu on every viewport.
      await textbox.locator("p").first().click();
      await textbox.evaluate(el => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      await textbox.press("ControlOrMeta+/");
      const blockMenu = page.getByRole("dialog", { name: "Действия текстового блока", exact: true });
      await blockMenu.waitFor();
      const menuBox = await blockMenu.boundingBox();
      assert(menuBox.x >= 0 && menuBox.y >= 0 && menuBox.x + menuBox.width <= width + 1 && menuBox.y + menuBox.height <= height + 1, "Block menu must fit the viewport");
      await page.getByRole("button", { name: "Переместить вверх", exact: true }).click();
      await page.waitForFunction(() => window.inlineTest.saved?.startsWith("Текст ответа"));
      assert.equal(await textbox.locator(":scope > :first-child").evaluate(el => el.tagName), "P");
      await textbox.press("ControlOrMeta+z");
      await page.waitForFunction(() => window.inlineTest.saved?.startsWith("### Что для меня важно?"));
      if (width >= 1024) {
        await textbox.locator("p").first().hover();
        const grip = page.getByRole("button", { name: "Переместить блок или открыть меню", exact: true });
        await grip.waitFor();
        const gripBox = await grip.boundingBox();
        assert.equal(gripBox.width, 48);
        assert.equal(gripBox.height, 48);
        assert(gripBox.x >= 0 && gripBox.x + gripBox.width <= width, "Drag handle must remain reachable in the desktop gutter");
        await page.screenshot({ path: `/tmp/rollapp-block-handle-${width}.png` });
        await grip.dragTo(textbox.locator("h3").first(), { targetPosition: { x: 20, y: 1 } });
        await page.waitForFunction(() => window.inlineTest.saved?.startsWith("Текст ответа"));
        assert.equal(await textbox.locator(":scope > :first-child").evaluate(el => el.tagName), "P");
        await textbox.press("ControlOrMeta+z");
        await page.waitForFunction(() => window.inlineTest.saved?.startsWith("### Что для меня важно?"));
        await textbox.locator("p").first().hover();
        await grip.waitFor();
        const cancelBox = await grip.boundingBox();
        const savedBeforeCancel = await page.evaluate(() => window.inlineTest.saves.length);
        await page.mouse.move(cancelBox.x + 24, cancelBox.y + 24);
        await page.mouse.down();
        await page.mouse.move(cancelBox.x + 80, cancelBox.y + 50, { steps: 10 });
        await page.keyboard.press("Escape");
        await page.mouse.up();
        await page.waitForTimeout(900);
        assert.equal(await page.evaluate(() => window.inlineTest.saves.length), savedBeforeCancel, "Cancelling a drag must not change/save the document");
      }
      await textbox.click();
      assert(await textbox.evaluate(el => {
        const style = getComputedStyle(el);
        return style.outlineStyle === "none" && style.boxShadow === "none" && ["Top", "Right", "Bottom", "Left"].every(side => parseFloat(style[`border${side}Width`]) === 0);
      }), "Inline editing must never draw a frame, including keyboard focus");
      await textbox.press(process.platform === "darwin" ? "Meta+ArrowDown" : "Control+End");
      await textbox.evaluate(el => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      await textbox.press("Enter");
      await textbox.pressSequentially("Новая мысль", { delay: 15 });
      await page.waitForFunction(() => window.inlineTest.saved?.includes("Новая мысль"));
      assert((await textbox.textContent()).includes("Новая мысль"));
      assert((await page.evaluate(() => window.inlineTest.saved)).includes(":::statement Важная мысль"));
      await textbox.press("ControlOrMeta+z");
      await page.waitForFunction(() => !window.inlineTest.saved?.includes("Новая мысль"));
      await textbox.press("ControlOrMeta+Shift+z");
      await page.waitForFunction(() => window.inlineTest.saved?.includes("Новая мысль"));
      await textbox.press(process.platform === "darwin" ? "Meta+ArrowDown" : "Control+End");
      await textbox.evaluate(el => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      await textbox.press("Enter");
      await textbox.press("Enter");
      await textbox.pressSequentially("/Заголовок 2");
      await textbox.press("Enter");
      await textbox.pressSequentially("Новый заголовок");
      await page.getByRole("heading", { name: "Новый заголовок", level: 2 }).waitFor();
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "Horizontal overflow");
      const metrics = await textbox.locator('p').first().evaluate(el => ({size:getComputedStyle(el).fontSize, line:getComputedStyle(el).lineHeight}));
      assert.deepEqual(metrics, { size: "18px", line: "28px" });
      await page.locator('[data-save-status="saved"]').waitFor();
      await page.screenshot({ path: `/tmp/rollapp-inline-${width}-${height}.png`, fullPage: true });
      for (const mode of ["readonly", "loading"]) {
        await page.goto(`${origin}/__text-edit?${mode}=1`);
        await textbox.waitFor();
        assert.equal(await textbox.getAttribute("contenteditable"), "false");
        assert.equal(await page.getByRole("toolbar").count(), 0);
        assert.equal(await page.evaluate(() => window.inlineTest.saves.length), 0);
      }
      assert.deepEqual(errors, []);
      console.log(`PASS ${width}×${height}: inline typing, Markdown, slash blocks, undo/redo, autosave, read-only/loading, geometry`);
      await page.close();
    }
  }
  const page = await browser.newPage();
  await page.route("**/api/**", route => route.abort());
  await page.goto(`${origin}/__text-edit?slow=1`);
  const textbox = page.getByRole("textbox", { name: "О себе", exact: true });
  await textbox.fill("Первая версия");
  await page.waitForFunction(() => window.inlineTest.pending.length === 1);
  await textbox.press("End"); await textbox.pressSequentially(" и продолжение");
  await page.evaluate(() => window.inlineTest.pending.shift()());
  await page.waitForFunction(() => window.inlineTest.pending.length === 1);
  assert.equal(await textbox.textContent(), "Первая версия и продолжение");
  await page.evaluate(() => window.inlineTest.pending.shift()());
  await page.waitForFunction(() => window.inlineTest.saved?.includes("Первая версия и продолжение"));
  assert.equal(await page.evaluate(() => window.inlineTest.saves.length), 2);
  await page.goto(`${origin}/__text-edit?error=1`);
  await textbox.fill("Сохранить мой черновик");
  await page.getByText("Соединение потеряно. Текст остался в черновике.").waitFor();
  assert.equal(await textbox.textContent(), "Сохранить мой черновик");
  assert(await page.evaluate(() => sessionStorage.getItem("rollapp:text:inline-fixture:fixture")), "Failed save must persist the owner-scoped draft");
  page.once("dialog", dialog => dialog.accept());
  await page.reload();
  await page.getByText("Восстановлен несохранённый черновик. Проверьте текст и повторите сохранение.").waitFor();
  assert.equal(await textbox.textContent(), "Сохранить мой черновик");
  assert.equal(await page.evaluate(() => window.inlineTest.saves.length), 0, "Recovered draft must not overwrite server content automatically");
  await page.evaluate(() => { window.inlineTest.fail = false; });
  await page.getByRole("button", { name: "Повторить сохранение" }).click();
  await page.waitForFunction(() => window.inlineTest.saved?.includes("Сохранить мой черновик"));
  await page.goto(`${origin}/__text-edit?four=1&slow=1`);
  const answers = page.locator('[data-question-body]');
  await answers.nth(0).locator('p').first().fill("Ответ один");
  await page.waitForFunction(() => window.inlineTest.pending.length === 1);
  await answers.nth(1).locator('p').first().fill("Ответ два");
  await page.evaluate(() => window.inlineTest.pending.shift()());
  await page.waitForFunction(() => window.inlineTest.pending.length === 1);
  await page.evaluate(() => window.inlineTest.pending.shift()());
  await page.waitForFunction(() => window.inlineTest.saved?.questions[1].paragraphs[0] === "Ответ два");
  assert.equal(await page.evaluate(() => window.inlineTest.saved.questions[0].paragraphs[0]), "Ответ один");
  await page.evaluate(() => { window.inlineTest.slow = false; });
  await answers.nth(0).locator('p').first().fill("");
  await page.waitForFunction(() => window.inlineTest.saved?.questions[0].paragraphs.length === 0);
  assert.equal(await page.evaluate(() => window.inlineTest.saved.questions[1].paragraphs[0]), "Ответ два");
  await page.goto(`${origin}/__text-edit?links=1`);
  await page.setViewportSize({ width: 390, height: 400 });
  await textbox.locator("p").first().evaluate(el => {
    const range = document.createRange(); range.selectNodeContents(el);
    el.closest('[contenteditable]').focus(); const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range);
  });
  const selectionToolbar = page.getByRole("toolbar", { name: "Форматирование выделенного текста" });
  await selectionToolbar.waitFor();
  await selectionToolbar.getByRole("button", { name: "Ссылка", exact: true }).click();
  const address = page.getByRole("textbox", { name: "Адрес ссылки" });
  await page.evaluate(() => {
    Object.defineProperty(visualViewport, "height", { configurable: true, value: 220 });
    visualViewport.dispatchEvent(new Event("resize"));
  });
  await page.waitForFunction(() => getComputedStyle(document.documentElement).getPropertyValue("--app-visual-height") === "220px");
  assert(await page.locator(".inline-editor__link-panel").evaluate(el => el.getBoundingClientRect().height <= 188), "Link panel must fit above the keyboard");
  assert(await address.evaluate(el => document.activeElement === el), "Link editor must receive keyboard focus");
  await page.waitForFunction(() => document.querySelector(".inline-editor__link-panel")?.style.position === "fixed");
  const linkBox = await page.locator(".inline-editor__link-panel").boundingBox();
  assert(linkBox.x >= 0 && linkBox.x + linkBox.width <= 391, "Link editor must fit the narrow viewport");
  await address.fill("javascript:alert(1)");
  await page.getByRole("button", { name: "Применить", exact: true }).click();
  await page.getByRole("alert").waitFor();
  await address.fill("https://example.org/notes");
  await page.getByRole("button", { name: "Применить", exact: true }).click();
  await page.waitForFunction(() => window.inlineTest.saved?.includes("https://example.org/notes"));
  assert.equal(await textbox.locator('a[href="https://example.org/notes"]').count(), 1);
  await textbox.press("ControlOrMeta+k");
  await address.waitFor();
  await address.press("Escape");
  assert.equal(await address.count(), 0);
  await textbox.press("ControlOrMeta+a");
  await textbox.press("ControlOrMeta+a");
  await textbox.press("Backspace");
  await textbox.evaluate(el => {
    const clipboardData = new DataTransfer();
    clipboardData.setData("text/plain", "## Из буфера\n\n- [ ] Проверить вставку\n- [x] Сохранить форматирование");
    el.dispatchEvent(new ClipboardEvent("paste", { clipboardData, bubbles: true, cancelable: true }));
  });
  await textbox.getByRole("heading", { name: "Из буфера", level: 2 }).waitFor();
  assert.equal(await textbox.locator('ul[data-type="taskList"] li').count(), 2);
  await page.waitForFunction(() => window.inlineTest.saved?.includes("- [x] Сохранить форматирование"));
  await textbox.getByRole("checkbox").first().check();
  await page.waitForFunction(() => window.inlineTest.saved?.includes("- [x] Проверить вставку"));
  await page.screenshot({ path: "/tmp/rollapp-inline-paste-mobile.png" });
  await page.goto(`${origin}/__text-edit?literal=1`);
  await textbox.fill("/несуществующаякоманда");
  await page.getByText("Ничего не найдено. Попробуйте другое название.").waitFor();
  await textbox.press("Enter");
  await textbox.pressSequentially("Продолжение");
  await page.waitForFunction(() => window.inlineTest.saved?.includes("/несуществующаякоманда\n\nПродолжение"));
  await textbox.press("ControlOrMeta+a");
  await textbox.press("ControlOrMeta+a");
  await textbox.press("Backspace");
  await textbox.evaluate(el => {
    const clipboardData = new DataTransfer();
    clipboardData.setData("text/plain", "```txt\n/команда\n```");
    el.dispatchEvent(new ClipboardEvent("paste", { clipboardData, bubbles: true, cancelable: true }));
  });
  await textbox.locator("pre code").filter({ hasText: "/команда" }).waitFor();
  assert.equal(await page.getByRole("group", { name: "Команды блока", exact: true }).count(), 0, "Slash in code must remain literal");
  await page.goto(`${origin}/__text-edit?development=1`);
  const planEditor = page.getByRole("textbox", { name: "Индивидуальный план развития", exact: true });
  await planEditor.waitFor();
  assert.equal(await page.getByRole("combobox").count(), 0, "Freeform plan has no category controls");
  assert.equal(await page.getByRole("button", { name: /Добавить пункт/ }).count(), 0);
  assert.equal(await page.locator('[contenteditable="plaintext-only"]').count(), 0);
  assert(await planEditor.evaluate(el => {
    const style = getComputedStyle(el);
    return style.outlineStyle === "none" && style.boxShadow === "none" && parseFloat(style.borderTopWidth) === 0;
  }), "Plan document must remain frameless");
  await planEditor.locator("h3").first().click();
  await page.keyboard.press("Home");
  await page.keyboard.insertText("Новое название блока ");
  await page.waitForFunction(() => window.inlineTest.saved?.includes("Новое название блока"));
  await planEditor.locator("li p").first().click();
  await page.keyboard.press("End");
  await page.keyboard.insertText(" Исправленный пункт");
  await page.keyboard.press("Enter");
  await page.keyboard.insertText("Новый пункт без формы");
  await page.waitForFunction(() => window.inlineTest.saved?.includes("Новый пункт без формы"));
  assert.equal(await page.locator('[data-mobile-form-page], [data-slot="drawer-popup"]').count(), 0);
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("contenteditable")), "true");
  assert((await planEditor.textContent()).includes("Исправленный пункт"));
  await page.goto(`${origin}/__text-edit?add=1`);
  await textbox.waitFor();
  await page.getByRole("button", { name: "Добавить", exact: true }).click();
  await page.waitForFunction(() => document.activeElement?.getAttribute("contenteditable") === "true");
  await page.keyboard.insertText("Новый вопрос");
  await textbox.getByRole("heading", { name: "Новый вопрос", level: 3 }).waitFor();
  await page.waitForFunction(() => window.inlineTest.saved?.includes("### Новый вопрос"));
  await page.goto(`${origin}/__text-edit?blocks=1`);
  await textbox.locator("p").first().click();
  await textbox.evaluate(el => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await textbox.press("ControlOrMeta+Shift+ArrowUp");
  await page.waitForFunction(() => window.inlineTest.saved?.startsWith("Текст ответа"));
  await textbox.press("ControlOrMeta+z");
  await page.waitForFunction(() => window.inlineTest.saved?.startsWith("### Что для меня важно?"));
  await textbox.locator("p").first().click();
  await textbox.press("ControlOrMeta+/");
  await page.getByRole("button", { name: "Дублировать блок", exact: true }).click();
  await page.waitForFunction(() => (window.inlineTest.saved?.match(/Текст ответа/g) || []).length === 2);
  await textbox.press("ControlOrMeta+z");
  await page.waitForFunction(() => (window.inlineTest.saved?.match(/Текст ответа/g) || []).length === 1);
  await textbox.locator("p").first().click();
  await textbox.press("ControlOrMeta+/");
  const removeBlock = page.getByRole("button", { name: "Удалить блок", exact: true });
  assert((await removeBlock.getAttribute("class")).includes("destructive"));
  await removeBlock.click();
  await page.waitForFunction(() => window.inlineTest.saved && !window.inlineTest.saved.includes("Текст ответа"));
  await textbox.press("ControlOrMeta+z");
  await page.waitForFunction(() => window.inlineTest.saved?.includes("Текст ответа"));
  await page.goto(`${origin}/__text-edit?long=1`);
  await textbox.locator("p").last().click();
  await page.waitForFunction(() => document.querySelector('[contenteditable="true"]')?.editor.state.selection.$from.parent.textContent.startsWith("Блок 24:"), undefined, { timeout: 5000 });
  assert(await page.evaluate(() => scrollY > 500), "Long-document scenario must be deeply scrolled");
  await textbox.press("ControlOrMeta+/");
  const cursorMenu = page.getByRole("dialog", { name: "Действия текстового блока", exact: true });
  await cursorMenu.waitFor();
  await cursorMenu.evaluate(el => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const cursorMenuBox = await cursorMenu.boundingBox();
  console.log("PASS deep-document block menu geometry", cursorMenuBox);
  assert(cursorMenuBox.y >= 0 && cursorMenuBox.y + cursorMenuBox.height <= 401, "Keyboard block menu must remain visible at the cursor deep in a document");
  await cursorMenu.press("Escape");
  assert.equal(await page.evaluate(() => window.inlineTest.saves.length), 0, "Opening or dismissing block actions must not save the document");
  await textbox.press("ControlOrMeta+/");
  await page.getByRole("button", { name: "Добавить блок ниже", exact: true }).click();
  const deepCreator = page.getByRole("dialog", { name: "Создать блок ниже", exact: true });
  await deepCreator.getByRole("searchbox", { name: "Поиск типа блока" }).waitFor();
  await deepCreator.evaluate(el => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const deepCreatorBox = await deepCreator.boundingBox();
  assert(deepCreatorBox.y >= 0 && deepCreatorBox.y + deepCreatorBox.height <= 401, "Creation picker must stay visible deep in a short-screen document");
  await deepCreator.getByRole("searchbox", { name: "Поиск типа блока" }).press("Escape");
  await textbox.evaluate(el => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  assert(await textbox.evaluate(el => document.activeElement === el && el.editor.state.selection.$from.parent.textContent.startsWith("Блок 24:")), "Cancelling creation must restore the source caret");
  assert.equal(await page.evaluate(() => window.inlineTest.saves.length), 0);
  // Create actual list/task/toggle structures, type immediately and reload saved Markdown.
  for (const [type, selector] of [["Список", "ul:not([data-type]) li"], ["Нумерованный список", "ol li"], ["Чек-лист", 'li[data-type="taskItem"]'], ["Раскрывающийся список", "summary"]]) {
    await page.goto(`${origin}/__text-edit`);
    await textbox.locator("p").first().click();
    await textbox.evaluate(el => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await textbox.press("ControlOrMeta+/");
    await page.getByRole("button", { name: "Добавить блок ниже", exact: true }).click();
    const search = page.getByRole("searchbox", { name: "Поиск типа блока" });
    if (type === "Список") {
      await page.evaluate(() => {
        Object.defineProperty(visualViewport, "height", { configurable: true, value: 220 });
        visualViewport.dispatchEvent(new Event("resize"));
      });
      await page.waitForFunction(() => getComputedStyle(document.documentElement).getPropertyValue("--app-visual-height") === "220px");
      const keyboardPicker = await page.locator(".inline-editor__create-menu").evaluate(el => ({ height: el.getBoundingClientRect().height, maxHeight: getComputedStyle(el).maxHeight, viewport: getComputedStyle(el).getPropertyValue("--app-visual-height") }));
      assert(keyboardPicker.height <= 188, `Creation picker must fit above a mobile keyboard: ${JSON.stringify(keyboardPicker)}`);
    }
    await search.fill(type);
    await page.getByRole("dialog", { name: "Создать блок ниже" }).getByRole("button", { name: type, exact: true }).click();
    await textbox.evaluate(el => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await textbox.pressSequentially("Созданный блок");
    await page.waitForFunction(() => window.inlineTest.saved?.includes("Созданный блок"));
    assert((await textbox.locator(selector).allTextContents()).some(text => text.includes("Созданный блок")), `${type} must receive immediate typing`);
    if (type === "Список") {
      await page.evaluate(() => { delete visualViewport.height; visualViewport.dispatchEvent(new Event("resize")); });
      await textbox.locator("summary, li p").filter({ hasText: "Созданный блок" }).last().evaluate(el => {
        el.closest('[contenteditable]').focus();
        const range = document.createRange(); range.selectNodeContents(el);
        const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range);
      });
      await page.getByRole("button", { name: "Тип блока", exact: true }).click();
      await page.getByRole("searchbox", { name: "Поиск типа блока" }).fill("Текст");
      await page.getByRole("dialog", { name: "Выбрать тип блока" }).getByRole("button", { name: "Текст", exact: true }).click();
      await textbox.locator(":scope > p").filter({ hasText: "Созданный блок" }).waitFor();
      await textbox.press("ControlOrMeta+z");
      await textbox.locator("ul:not([data-type]) li").filter({ hasText: "Созданный блок" }).waitFor();
    }
    if (type === "Раскрывающийся список") {
      await textbox.press("Enter");
      await textbox.pressSequentially("Текст внутри");
      await page.waitForFunction(() => window.inlineTest.saved?.includes("Текст внутри"));
      await textbox.getByRole("button", { name: "Свернуть блок", exact: true }).click();
      assert(await textbox.locator('[data-type="detailsContent"]').evaluate(el => el.hidden));
      await textbox.getByRole("button", { name: "Раскрыть блок", exact: true }).click();
      assert(await textbox.locator('[data-type="detailsContent"]').evaluate(el => !el.hidden));
      await page.locator('[data-save-status="saved"]').waitFor();
      await textbox.locator("summary").click();
      await textbox.locator("summary, li p").filter({ hasText: "Созданный блок" }).last().evaluate(el => {
        el.closest('[contenteditable]').focus();
        const range = document.createRange(); range.selectNodeContents(el);
        const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range);
      });
      await page.getByRole("button", { name: "Тип блока", exact: true }).click();
      await page.getByRole("searchbox", { name: "Поиск типа блока" }).fill("Текст");
      await page.getByRole("dialog", { name: "Выбрать тип блока" }).getByRole("button", { name: "Текст", exact: true }).click();
      await textbox.locator(":scope > p").filter({ hasText: "Созданный блок" }).waitFor();
      assert((await textbox.textContent()).includes("Текст внутри"), "Converting a toggle must preserve its body");
      await textbox.press("ControlOrMeta+z");
      await textbox.locator("summary").filter({ hasText: "Созданный блок" }).waitFor();
      await page.locator('[data-save-status="saved"]').waitFor();
      const saved = await page.evaluate(() => window.inlineTest.saved);
      await page.addInitScript(value => {
        const params = new URLSearchParams(location.search);
        const toggle = value.slice(value.indexOf(":::details"));
        window.inlineFixtureSource = params.has("toggleFirst") ? toggle : params.has("toggleHeading") ? `### Проверка ритма\n\n${toggle}` : value;
      }, saved);
      await page.reload();
      await textbox.locator("summary").filter({ hasText: "Созданный блок" }).waitFor();
      await textbox.locator('[data-type="detailsContent"]').getByText("Текст внутри", { exact: true }).waitFor();
      assert.equal(await page.evaluate(() => window.inlineTest.saves.length), 0, "Reloading a saved toggle must not rewrite it");
      await page.screenshot({ path: "/tmp/rollapp-created-toggle-mobile.png", fullPage: true });
      for (const width of [390, 1440]) {
        await page.setViewportSize({ width, height: 400 });
        for (const [mode, margin] of [["toggleHeading", "18px"], ["toggleFirst", "0px"]]) {
          await page.goto(`${origin}/__text-edit?readonly=1&${mode}=1`);
          const toggle = textbox.locator('[data-type="details"]').first();
          await toggle.waitFor();
          assert.equal(await toggle.evaluate(el => getComputedStyle(el).marginBlockStart), margin, "Toggle spacing must follow the shared typeset contract");
          await textbox.getByRole("button", { name: "Свернуть блок", exact: true }).click();
          assert(await textbox.locator('[data-type="detailsContent"]').evaluate(el => el.hidden));
          assert.equal(await page.evaluate(() => window.inlineTest.saves.length), 0, "Read-only expansion/collapse must never save");
        }
      }
    }
  }
  await page.close();
  console.log("PASS typed block creation, heading4, search/empty results, cancel without saving, Alt insertion, lists/tasks/toggles and saved Markdown reload");
  console.log("PASS block keyboard movement, duplication/deletion/undo, and save races, retry, draft recovery, four-question queue, clearing, mobile links, keyboard links, Markdown paste, checklists, development plan");
  }
  if (!only || only === "--selection-only") await checkTextSelectionPosition(browser, origin);
  if (!only || only === "--basic-blocks-only") await checkTextBasicBlocks(browser, origin);
  if (!only || only === "--symbols-only") await checkTextSymbolShortcuts(browser, origin);
  if (!only || only === "--block-selection-only") await checkTextBlockSelection(browser, origin);
  if (!only || only === "--native-caret-only") await checkTextNativeCaret(browser, origin);
  if (!only || only === "--styles-only") await checkTextInlineStyles(browser, origin);
  if (!only || only === "--code-paste-only") await checkTextCodePaste(browser, origin);
  if (!only || only === "--four-document-only") await checkFourQuestionDocument(browser, origin);
  if (!only || only === "--long-answers-only") await checkLongQuestionAnswers(browser, origin);
  if (!only || only === "--question-moves-only") await checkQuestionBlockMoves(browser, origin);
  if (!only || only === "--first-selection-only") await checkFirstOffscreenSelection(browser, origin);
  if (!only || only === "--list-moves-only") await checkListBlockMoves(browser, origin);
  if (!only || only === "--list-drag-only") await checkListBlockDrag(browser, origin);
  if (!only || only === "--drag-guards-only") await checkBlockDragGuards(browser, origin);
  if (!only || only === "--mod-enter-only") await checkModEnter(browser, origin);
  if (!only || only === "--relocation-depth-only") await checkRelocationDepth(browser, origin);
  if (!only || only === "--table-handles-only") await checkTableHandles(browser, origin);
  if (!only || only === "--table-axis-guards-only") await checkTableAxisGuards(browser, origin);
  if (!only || only === "--table-wide-only") await checkWideTable(browser, origin);
  if (!only || only === "--table-chrome-only") await checkTableChrome(browser, origin);
  if (!only || only === "--table-growth-guards-only") await checkTableGrowthGuards(browser, origin);
  if (!only || only === "--native-page-keys-only") await checkNativePageKeys(browser, origin);
  if (!only || only === "--column-persistence-only") await checkColumnPersistence(browser, origin);
  if (!only || only === "--column-contexts-only") await checkDocumentColumnContexts(browser, origin);
  if (!only || only === "--columns-only") await checkDocumentColumns(browser, origin);
  if (!only || only === "--table-insert-caret-only") await checkTableInsertCaret(browser, origin);
  if (!only || only === "--table-growth-contexts-only") await checkTableGrowthContexts(browser, origin);
  if (!only || only === "--table-growth-only") await checkTableGrowth(browser, origin);
  if (!only || only === "--table-duplicate-only") await checkTableDuplicate(browser, origin);
  if (!only || only === "--plain-caret-only") await checkPlainCaret(browser, origin);
  if (!only || only === "--caret-scroll-only") await checkCaretScroll(browser, origin);
  if (!only || only === "--tables-only") await checkTextTables(browser, origin);
  if (!only || only === "--slash-only") await checkTextSlashCommands(browser, origin);
  if (!only || only === "--block-colors-only") await checkTextBlockColors(browser, origin);
  if (!only || only === "--block-menu-only") await checkTextBlockMenu(browser, origin);
  if (!only || only === "--conversion-only") await checkTextBlockConversion(browser, origin);
  if (!only || only === "--sparse-only") await checkTextSparseBlocks(browser, origin);
  if (!only || only === "--deep-lists-only") await checkTextDeepLists(browser, origin);
  if (!only || only === "--nesting-only") await checkTextNesting(browser, origin);
  if (!only || only === "--boundaries-only") await checkTextBlockBoundaries(browser, origin);
  if (!only || only === "--paint-only") await checkTextSelectionPaint(browser, origin);
} catch (error) {
  for (const context of browser.contexts()) for (const page of context.pages()) {
    console.error("ORIGINAL ERROR", error);
    const details = await page.evaluate(() => ({url:location.href,ready:document.readyState,active:document.activeElement?.outerHTML?.slice(0,250),roots:[...document.querySelectorAll('[role="textbox"], [contenteditable]')].map(el=>({role:el.getAttribute('role'),label:el.getAttribute('aria-label'),hidden:el.getAttribute('aria-hidden'),inert:el.closest('[inert]')?.tagName,editable:el.getAttribute('contenteditable'),box:el.getBoundingClientRect().toJSON()})),body:document.body.innerText.slice(0,1200)})).catch(error=>String(error));
    console.error("FAILED PAGE",JSON.stringify(details));
    console.error("BROWSER NETWORK/CONSOLE", JSON.stringify(smokeBrowserDiagnostics(page)));
    console.error("FAILED LAYOUT", JSON.stringify(await page.evaluate(() => ({ fonts: document.fonts.status,
      nodes: [...document.querySelectorAll('hr, [data-slot="popover-content"]')].map(el => {
        const style = getComputedStyle(el);
        return { tag: el.tagName, box: el.getBoundingClientRect().toJSON(), display: style.display, visibility: style.visibility, opacity: style.opacity,
          borderTop: style.borderTopWidth, transform: style.transform, animations: el.getAnimations().map(a => ({ playState: a.playState, currentTime: a.currentTime })) };
      }) })).catch(error => String(error))));
    if (page.inlineDiagnosticTrail) console.error("PAGE NETWORK/CONSOLE", JSON.stringify(page.inlineDiagnosticTrail));
    await page.screenshot({ path: "/tmp/rollapp-text-edit-failure.png" });
  }
  throw error;
} finally { await browser.close(); await server.close(); }
