import assert from "node:assert/strict";
import { createServer } from "vite";
import { chromium } from "playwright-core";
import { browserLaunchOptions } from "./browser-runtime.mjs";
import { listenSmokeServer, smokeOrigin } from "./smoke-server.mjs";

const server = await createServer({ cacheDir: "node_modules/.vite-fundraising-smoke", server: { host: "127.0.0.1", port: 0, strictPort: true, hmr: false, watch: null }, plugins: [{
  name: "fundraising-fixture", configureServer(vite) {
    vite.middlewares.use(async (req, res, next) => {
      if (!req.url.startsWith("/__fundraising")) return next();
      res.setHeader("Content-Type", "text/html");
      res.end(await vite.transformIndexHtml(req.url, '<!doctype html><html class="dark"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/scripts/fixtures/wish-group-fundraising.jsx"></script></body></html>'));
    });
  },
}] });
await listenSmokeServer(server);
const browser = await chromium.launch(browserLaunchOptions());
try {
  for (const width of [320, 390, 767, 768, 820, 1024, 1440, 1920]) {
    const page = await browser.newPage({ viewport: { width, height: width === 820 ? 450 : 844 }, deviceScaleFactor: width < 768 ? 3 : 1 });
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.route("**/api/**", route => { errors.push("Unexpected API request"); return route.abort(); });
    const group = page.locator(".app-group-dialog");
    const summary = group.locator(".app-group-dialog__header [role=status]");
    const trigger = group.getByRole("button", { name: "Открыть сбор группы «Часы для путешествий»" });
    const drawer = page.locator('[data-slot="drawer-popup"]').filter({ has: page.getByText("Сбор роллов", { exact: true }) });
    const close = drawer.getByRole("button", { name: "Закрыть сбор" });
    const openDrawer = async ({ keyboard = false } = {}) => {
      await trigger.waitFor();
      assert.equal(await drawer.count(), 0, "Fundraising must only open from the group icon");
      if (keyboard) await trigger.press("Enter");
      else await trigger.click();
      await drawer.waitFor();
      assert.equal(await drawer.getAttribute("data-swipe-direction"), width < 768 ? "down" : "right");
    };
    const open = async mode => {
      await page.goto(`${smokeOrigin(server)}/__fundraising?mode=${mode}`);
      await page.evaluate(() => document.fonts.ready);
      await page.waitForFunction(() => window.fundraisingReads?.length > 0);
      assert.equal(await drawer.count(), 0);
      assert.equal(await group.getByText("6 желаний", { exact: true }).count(), 0);
      assert.deepEqual(await page.evaluate(() => window.fundraisingReads), [`/wish-groups/fundraising-${mode}/fundraiser?shareToken=fixture%20token`]);
      await openDrawer({ keyboard: mode === "empty" });
      assert.equal(await page.evaluate(() => window.fundraisingReads.length), 1, "First drawer open reuses the group's read");
    };
    const geometry = async () => {
      await page.getByRole("dialog", { name: "Сбор роллов" }).waitFor();
      const popup = await drawer.elementHandle();
      try {
        // An open popup can still carry the closed transform at the start of its transition.
        await page.waitForFunction(node => {
          const transform = getComputedStyle(node).transform;
          const matrix = new DOMMatrixReadOnly(transform === "none" ? undefined : transform);
          return !node.hasAttribute("data-starting-style") && !node.hasAttribute("data-ending-style")
            && Math.abs(matrix.m41) < 0.1 && Math.abs(matrix.m42) < 0.1
            && node.getAnimations().every(animation => !animation.pending && animation.playState !== "running");
        }, popup, { timeout: 5_000 });
      } finally {
        await popup.dispose();
      }
      const result = await drawer.evaluate(node => {
        const body = node.querySelector(".app-drawer-body");
        const header = node.querySelector('[data-slot="drawer-header"]').getBoundingClientRect();
        const bounds = node.getBoundingClientRect();
        const bodyBounds = body.getBoundingClientRect();
        const footer = node.querySelector('[data-slot="drawer-footer"]');
        const footerBounds = footer?.getBoundingClientRect();
        const oldScroll = body.scrollTop;
        body.scrollTop = body.scrollHeight;
        const footerAfterScroll = footer?.getBoundingClientRect();
        body.scrollTop = oldScroll;
        const group = document.querySelector(".app-group-dialog");
        return {
          fits: bounds.left >= -1 && bounds.right <= innerWidth + 1 && bounds.top >= -1 && bounds.bottom <= innerHeight + 1,
          root: document.documentElement.scrollWidth <= innerWidth,
          dimensions: {
            bounds: bounds.toJSON(), viewport: [innerWidth, innerHeight],
            rootScrollWidth: document.documentElement.scrollWidth,
            transform: getComputedStyle(node).transform,
            opening: node.hasAttribute('data-starting-style'),
            closing: node.hasAttribute('data-ending-style'),
          },
          outsideGroup: !group.contains(node) && !group.querySelector(".wish-group-fundraiser"),
          gap: group.querySelector(".wish-grid").offsetTop - group.querySelector(".app-group-dialog__header").offsetHeight,
          overflow: [...body.querySelectorAll("*")].filter(element => { const r = element.getBoundingClientRect(); return r.width > 0 && (r.left < bounds.left - 1 || r.right > bounds.right + 1); }).map(element => element.tagName),
          body: [getComputedStyle(body).fontSize, getComputedStyle(body).lineHeight],
          bodyActions: body.querySelectorAll('button, a[href]:not([href="/app/rolls"])').length,
          scrollBody: getComputedStyle(body).overflowY === "auto" && bodyBounds.top >= header.bottom - 1,
          footerAtBottom: !footer || (footer.hasAttribute("data-control-bar") && !body.contains(footer)
            && Math.abs(footerBounds.bottom - bounds.bottom) <= 1
            && Math.abs(footerBounds.top - bodyBounds.bottom) <= 1
            && Math.abs(footerAfterScroll.top - footerBounds.top) <= 1),
        };
      });
      assert(result.fits && result.root, `${width} section overflow: ${JSON.stringify(result.dimensions)}`);
      assert(result.outsideGroup && result.scrollBody, `${width} drawer must own a separate scroller`);
      assert(result.footerAtBottom, `${width} footer must stay flush with the bottom of the drawer`);
      assert.equal(result.bodyActions, 0, `${width} actions belong in the footer`);
      assert.deepEqual(result.overflow, [], `${width} descendant overflow`);
      assert.deepEqual(result.body, ["18px", "28px"]);
      assert(Math.abs(result.gap - 24) < 1, `${width} group header/grid gap ${result.gap}`);
      const controls = await drawer.locator('[data-slot="drawer-footer"] [data-slot="button"]:visible').evaluateAll(nodes => nodes.map(node => {
        const css = getComputedStyle(node); return { height: node.getBoundingClientRect().height, radius: parseFloat(css.borderTopLeftRadius) };
      }));
      for (const control of controls) { assert(control.height >= 48); assert(control.radius >= 24); }
      assert.deepEqual(await close.evaluate(button => {
        const { width, height } = button.getBoundingClientRect();
        const glyph = button.querySelector("svg").getBoundingClientRect();
        return [width, height, getComputedStyle(button).borderRadius, glyph.width, glyph.height];
      }), [48, 48, "24px", 20, 20]);
    };
    const verifyCompactKeyboard = async () => {
      await page.evaluate(() => {
        Object.defineProperties(visualViewport, { height: { configurable: true, value: 220 }, offsetTop: { configurable: true, value: 96 } });
        visualViewport.dispatchEvent(new Event("resize"));
      });
      await page.waitForFunction(() => {
        const active = document.activeElement;
        if (!active?.matches("input")) return false;
        const popup = active.closest('[data-slot="drawer-popup"]');
        const bounds = popup.getBoundingClientRect();
        const field = active.getBoundingClientRect();
        const header = popup.querySelector('[data-slot="drawer-header"]').getBoundingClientRect();
        const footer = popup.querySelector('[data-slot="drawer-footer"]').getBoundingClientRect();
        return bounds.top >= 96 && bounds.bottom <= 317 && field.top >= header.bottom && field.bottom <= footer.top && Math.abs(bounds.bottom - footer.bottom) <= 1;
      }, undefined, { timeout: 4000 }).catch(async error => {
        const dimensions = await drawer.evaluate(node => Object.fromEntries(
          ["[data-slot=drawer-header]", ".app-drawer-body", "input", "[data-slot=drawer-footer]"].map(selector => {
            const { top, bottom } = node.querySelector(selector).getBoundingClientRect();
            return [selector, [top, bottom]];
          }),
        ));
        throw new Error(`Focused field must fit between header and footer: ${JSON.stringify(dimensions)}`, { cause: error });
      });
      await page.evaluate(() => {
        delete visualViewport.height;
        delete visualViewport.offsetTop;
        visualViewport.dispatchEvent(new Event("resize"));
      });
    };
    if (width === 390) {
      await page.addInitScript(() => {
        if (new URLSearchParams(location.search).get("mode") !== "loading") return;
        sessionStorage.setItem("rollapp:group-contribution:fixture-user:fundraising-loading", JSON.stringify({ amount: 100, idempotencyKey: crypto.randomUUID() }));
      });
      await open("loading");
      assert.equal(await summary.textContent(), "Загрузка сбора…");
      await drawer.getByText("Загрузка сбора…", { exact: true }).waitFor();
      assert.equal(await page.getByRole("alertdialog").count(), 0);
      await page.evaluate(() => window.releaseFundraisingRead());
      await summary.filter({ hasText: /^Собрано 250 роллов$/ }).waitFor();
      await page.getByRole("alertdialog", { name: "Проверить взнос?" }).getByRole("button", { name: "Назад" }).click();
      await drawer.getByRole("progressbar").waitFor();
      assert.deepEqual(await page.evaluate(() => window.fundraisingCalls), []);
    }
    await open("empty");
    await page.keyboard.press("Escape");
    await drawer.waitFor({ state: "detached" });
    await page.waitForFunction(() => document.activeElement?.getAttribute("aria-label") === "Открыть сбор группы «Часы для путешествий»");
    await summary.filter({ hasText: /^Собрано 0 роллов$/ }).waitFor();
    await openDrawer();
    const footer = drawer.locator('[data-slot="drawer-footer"]');
    const issueCard = footer.getByRole("button", { name: "Выпустить виртуальную карту", exact: true });
    await footer.getByRole("button", { name: "Организовать сбор" }).waitFor();
    await geometry();
    if ([320, 1440].includes(width)) await page.screenshot({ path: `/tmp/rollapp-fundraising-empty-footer-${width}.png` });
    await footer.getByRole("button", { name: "Организовать сбор" }).click();
    await page.getByLabel("Цель сбора, роллы", { exact: true }).fill("1000");
    await geometry();
    if (width === 320) await page.getByLabel("Цель сбора, роллы", { exact: true }).press("Enter");
    else await footer.getByRole("button", { name: "Открыть сбор", exact: true }).click();
    await page.getByRole("progressbar").waitFor();
    assert.equal(await page.getByRole("progressbar").getAttribute("aria-valuemax"), "1000");
    await issueCard.click();
    const card = drawer.getByRole("region", { name: "Виртуальная карта — эмулятор" });
    await card.getByText("0 роллов · тестовый баланс", { exact: true }).waitFor();
    const cardNumber = await card.getByText(/^Тестовая карта · /).textContent();
    assert.deepEqual(await page.evaluate(() => window.fundraisingCalls.map(call => call.input)), [{ target: 1000 }]);
    await geometry();
    await card.getByRole("link", { name: "Открыть «Финансы»" }).click();
    await drawer.waitFor({ state: "detached" });
    const cards = page.getByRole("region", { name: "Карты сборов" });
    const row = cards.getByRole("listitem").filter({ hasText: cardNumber });
    await row.getByText("Часы для путешествий", { exact: true }).waitFor();
    await row.getByText("0 роллов · тестовый баланс", { exact: true }).waitFor();
    assert(await cards.evaluate(node => node.scrollWidth <= node.clientWidth && document.documentElement.scrollWidth <= innerWidth));
    if ([320, 390, 1440].includes(width)) await page.screenshot({ path: `/tmp/rollapp-fundraiser-finance-${width}.png`, fullPage: true });
    await open("owner");
    await issueCard.waitFor();
    assert.equal(await footer.getByRole("button", { name: "Приостановить", exact: true }).count(), 0);
    await geometry();
    await page.screenshot({ path: `/tmp/rollapp-fundraising-owner-${width}.png`, fullPage: true });
    await open("closed-owner");
    await issueCard.waitFor();
    await page.evaluate(() => { window.holdFundraisingPatch = true; });
    await page.getByRole("button", { name: "Возобновить", exact: true }).click();
    await page.waitForFunction(() => typeof window.releaseFundraisingPatch === "function");
    assert(await close.isDisabled());
    assert(await issueCard.isDisabled());
    await page.keyboard.press("Escape");
    assert(await drawer.isVisible());
    await page.evaluate(() => { window.holdFundraisingPatch = false; window.releaseFundraisingPatch(); });
    await page.getByRole("button", { name: "Возобновить", exact: true }).waitFor({ state: "detached" });
    await drawer.getByText("Сбор открыт", { exact: true }).waitFor();
    await geometry();
    await page.getByRole("button", { name: "Изменить цель", exact: true }).click();
    const target = page.getByLabel("Цель сбора, роллы", { exact: true });
    await target.fill("200");
    assert(await page.getByRole("button", { name: "Сохранить", exact: true }).isDisabled());
    await target.fill("1500");
    if (width === 390) await verifyCompactKeyboard();
    await page.getByRole("button", { name: "Сохранить", exact: true }).click();
    await geometry();
    await open("member");
    await page.getByLabel("Сумма взноса, роллы", { exact: true }).fill("501");
    assert(await page.getByRole("button", { name: "Внести роллы", exact: true }).isDisabled());
    await page.getByLabel("Сумма взноса, роллы", { exact: true }).fill("100");
    await page.getByRole("button", { name: "Внести роллы", exact: true }).click();
    await page.getByRole("button", { name: "Назад", exact: true }).click();
    assert.deepEqual(await page.evaluate(() => window.fundraisingCalls), []);
    await page.getByRole("button", { name: "Внести роллы", exact: true }).click();
    await page.getByRole("button", { name: "Подтвердить взнос", exact: true }).click();
    await page.getByText("Взнос 100 роллов принят", { exact: true }).waitFor();
    await page.locator('[data-slot="alert-dialog-content"]').waitFor({ state: "detached" });
    assert.equal(await page.getByRole("progressbar").getAttribute("aria-valuenow"), "350");
    await geometry();
    await page.screenshot({ path: `/tmp/rollapp-fundraising-${width}.png`, fullPage: true });
    await close.click();
    await drawer.waitFor({ state: "detached" });
    await summary.filter({ hasText: /^Собрано 350 роллов$/ }).waitFor();
    await group.evaluate(node => { node.scrollTop = node.scrollHeight; });
    const last = await page.getByText("Часы 6", { exact: true }).boundingBox();
    assert(last.y + last.height <= page.viewportSize().height + 1);
    const groupScroll = await group.evaluate(node => node.scrollTop);
    await trigger.click();
    await close.click();
    await drawer.waitFor({ state: "detached" });
    assert.equal(await group.evaluate(node => node.scrollTop), groupScroll, "Returning from the drawer moved the group grid");
    for (const mode of ["guest", "closed", "completed"]) {
      await open(mode); await geometry();
      if (mode === "guest") await footer.getByRole("link", { name: "Войти", exact: true }).waitFor();
      assert.equal(await page.getByRole("button", { name: "Внести роллы", exact: true }).count(), 0);
      assert.equal(await page.getByRole("button", { name: "Выпустить виртуальную карту", exact: true }).count(), 0);
    }
    await open("completed-owner");
    await geometry();
    await page.getByRole("button", { name: "Выпустить виртуальную карту", exact: true }).click();
    await page.getByText("1 000 роллов · тестовый баланс", { exact: true }).waitFor();
    await page.getByLabel("Тестовый магазин", { exact: true }).fill("Тестовый магазин с длинным названием");
    await page.getByLabel("Сумма тестовой покупки, роллы", { exact: true }).fill("1001");
    assert(await page.getByRole("button", { name: "Эмулировать покупку", exact: true }).isDisabled());
    await page.getByLabel("Сумма тестовой покупки, роллы", { exact: true }).fill("300");
    if (width <= 390) await verifyCompactKeyboard();
    await page.getByRole("button", { name: "Эмулировать покупку", exact: true }).click();
    await geometry();
    await page.getByRole("button", { name: "Отмена", exact: true }).click();
    await page.getByRole("button", { name: "Эмулировать покупку", exact: true }).click();
    await page.getByRole("button", { name: "Подтвердить покупку", exact: true }).click();
    await page.getByRole("status").getByText("Тестовая покупка выполнена. Реальные средства не списаны.", { exact: true }).waitFor();
    await page.reload();
    await openDrawer();
    await page.getByText("700 роллов · тестовый баланс", { exact: true }).waitFor();
    assert.equal(await page.getByRole("button", { name: "Выпустить виртуальную карту", exact: true }).count(), 0);
    assert.deepEqual(await page.evaluate(() => window.fundraisingCalls), []);
    await geometry();
    await page.screenshot({ path: `/tmp/rollapp-virtual-card-${width}.png`, fullPage: true });
    const completedCardNumber = await card.getByText(/^Тестовая карта · /).textContent();
    await card.getByRole("link", { name: "Открыть «Финансы»" }).click();
    await cards.getByRole("listitem").filter({ hasText: completedCardNumber }).getByText("700 роллов · тестовый баланс", { exact: true }).waitFor();
    assert.equal(await cards.getByRole("listitem").count(), 2);
    await open("card-storage");
    await page.getByRole("button", { name: "Выпустить виртуальную карту", exact: true }).click();
    await page.getByRole("alert").waitFor();
    assert.equal(await page.getByLabel("Тестовый магазин", { exact: true }).count(), 0);
    assert.deepEqual(await page.evaluate(() => window.fundraisingCalls), []);
    await open("lost");
    await page.getByLabel("Сумма взноса, роллы", { exact: true }).fill("100");
    await page.getByRole("button", { name: "Внести роллы", exact: true }).click();
    await page.getByRole("button", { name: "Подтвердить взнос", exact: true }).click();
    await page.getByRole("button", { name: "Проверить взнос", exact: true }).last().waitFor();
    const firstKey = await page.evaluate(() => window.fundraisingCalls[0].input.idempotencyKey);
    await page.reload();
    await openDrawer();
    await page.getByRole("button", { name: "Проверить взнос", exact: true }).last().click();
    await page.getByText("Взнос 100 роллов принят", { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => window.fundraisingCalls[0].input.idempotencyKey), firstKey);
    assert.equal(await page.getByRole("progressbar").getAttribute("aria-valuenow"), "350");
    await open("storage");
    await page.getByLabel("Сумма взноса, роллы", { exact: true }).fill("100");
    await page.getByRole("button", { name: "Внести роллы", exact: true }).click();
    await page.getByRole("button", { name: "Подтвердить взнос", exact: true }).click();
    await page.getByRole("alertdialog").getByRole("alert").waitFor();
    assert.deepEqual(await page.evaluate(() => window.fundraisingCalls), [], "A transfer must not be sent without durable request storage");
    await open("lost-denied");
    await page.getByLabel("Сумма взноса, роллы", { exact: true }).fill("100");
    await page.getByRole("button", { name: "Внести роллы", exact: true }).click();
    await page.getByRole("button", { name: "Подтвердить взнос", exact: true }).click();
    await page.getByRole("button", { name: "Проверить взнос", exact: true }).last().waitFor();
    await page.reload();
    await openDrawer();
    await page.getByRole("button", { name: "Проверить взнос", exact: true }).last().click();
    await page.getByRole("alertdialog").getByText("Доступ к группе изменился", { exact: true }).waitFor();
    assert(await page.evaluate(() => Boolean(sessionStorage.getItem("rollapp:group-contribution:fixture-user:fundraising-lost-denied"))), "A late access error must preserve the original unknown request key");
    await open("error");
    await page.getByRole("alert").waitFor();
    assert.equal(await summary.textContent(), "Сумма недоступна");
    await page.getByRole("button", { name: "Повторить", exact: true }).click();
    await summary.filter({ hasText: /^Собрано 250 роллов$/ }).waitFor();
    await open("hidden");
    assert.equal(await summary.textContent(), "Собрано 0 роллов");
    await drawer.getByText("Для этой группы пока нет сбора.").waitFor();
    assert.equal(await drawer.getByRole("button", { name: "Организовать сбор" }).count(), 0);
    await close.click();
    await drawer.waitFor({ state: "detached" });
    await group.getByRole("button", { name: "Закрыть группу", exact: true }).click();
    await group.waitFor({ state: "detached" });
    await page.goto(`${smokeOrigin(server)}/__fundraising?mode=non-product`);
    await page.getByText("Часы 1", { exact: true }).waitFor();
    await group.getByText("6 желаний", { exact: true }).waitFor();
    assert.equal(await trigger.count(), 0);
    assert.equal(await drawer.count(), 0);
    assert.deepEqual(await page.evaluate(() => window.fundraisingReads), []);
    assert.deepEqual(errors, []);
    console.log(`PASS fundraising ${width}: focus, scroll, create/edit/resume, zero-balance issue, Finance, purchases, contributions, retry, access and geometry`);
    await page.close();
  }
} finally { await browser.close(); await server.close(); }
