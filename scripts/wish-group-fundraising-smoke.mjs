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
    const open = async mode => {
      await page.goto(`${smokeOrigin(server)}/__fundraising?mode=${mode}`);
      await page.evaluate(() => document.fonts.ready);
      await page.getByRole("heading", { name: "Сбор роллов" }).waitFor();
    };
    const geometry = async () => {
      const result = await page.locator(".wish-group-fundraiser").evaluate(section => {
        const parent = section.closest(".app-group-dialog");
        const bounds = section.getBoundingClientRect();
        const header = parent.querySelector('.app-group-dialog__header').getBoundingClientRect();
        const grid = parent.querySelector('.wish-grid').getBoundingClientRect();
        return { fits: bounds.left >= 0 && bounds.right <= innerWidth, root: document.documentElement.scrollWidth <= innerWidth,
          gaps: [bounds.top - header.bottom + parent.scrollTop, grid.top - bounds.bottom],
          overflow: [...section.querySelectorAll("*")].filter(node => { const r = node.getBoundingClientRect(); return r.width > 0 && (r.left < bounds.left - 1 || r.right > bounds.right + 1); }).map(node => node.tagName),
          scroll: parent.scrollHeight > parent.clientHeight,
          body: [getComputedStyle(section).fontSize, getComputedStyle(section).lineHeight] };
      });
      assert(result.fits && result.root, `${width} section overflow`);
      assert.deepEqual(result.overflow, [], `${width} descendant overflow`);
      assert.deepEqual(result.body, ["18px", "28px"]);
      for (const gap of result.gaps) assert(Math.abs(gap - 24) < 1, `${width} group sibling gap ${gap}`);
      const controls = await page.locator(".wish-group-fundraiser button:visible").evaluateAll(nodes => nodes.map(node => {
        const css = getComputedStyle(node); return { height: node.getBoundingClientRect().height, radius: parseFloat(css.borderTopLeftRadius) };
      }));
      for (const control of controls) { assert(control.height >= 48); assert(control.radius >= 24); }
    };
    await open("empty");
    await page.getByRole("button", { name: "Организовать сбор" }).click();
    await page.getByLabel("Цель сбора, роллы", { exact: true }).fill("1000");
    await geometry();
    await page.getByRole("button", { name: "Открыть сбор", exact: true }).click();
    await page.getByRole("progressbar").waitFor();
    assert.equal(await page.getByRole("progressbar").getAttribute("aria-valuemax"), "1000");
    await open("owner");
    assert.equal(await page.getByRole("button", { name: "Выпустить виртуальную карту", exact: true }).count(), 0);
    await page.getByRole("button", { name: "Приостановить", exact: true }).click();
    await page.getByRole("button", { name: "Возобновить", exact: true }).waitFor();
    await page.getByRole("button", { name: "Возобновить", exact: true }).click();
    await page.getByRole("button", { name: "Изменить цель", exact: true }).click();
    await page.getByLabel("Цель сбора, роллы", { exact: true }).fill("200");
    assert(await page.getByRole("button", { name: "Сохранить", exact: true }).isDisabled());
    await page.getByLabel("Цель сбора, роллы", { exact: true }).fill("1500");
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
    // The group remains the sole scroller, and the last item is reachable.
    await page.locator(".app-group-dialog").evaluate(node => { node.scrollTop = node.scrollHeight; });
    const last = await page.getByText("Часы 6", { exact: true }).boundingBox();
    assert(last.y + last.height <= page.viewportSize().height + 1);
    for (const mode of ["guest", "closed", "completed"]) {
      await open(mode); await geometry();
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
    await page.getByRole("button", { name: "Эмулировать покупку", exact: true }).click();
    await geometry();
    await page.getByRole("button", { name: "Отмена", exact: true }).click();
    await page.getByRole("button", { name: "Эмулировать покупку", exact: true }).click();
    await page.getByRole("button", { name: "Подтвердить покупку", exact: true }).click();
    await page.getByRole("status").getByText("Тестовая покупка выполнена. Реальные средства не списаны.", { exact: true }).waitFor();
    await page.reload();
    await page.getByText("700 роллов · тестовый баланс", { exact: true }).waitFor();
    assert.equal(await page.getByRole("button", { name: "Выпустить виртуальную карту", exact: true }).count(), 0);
    assert.deepEqual(await page.evaluate(() => window.fundraisingCalls), []);
    await geometry();
    await page.screenshot({ path: `/tmp/rollapp-virtual-card-${width}.png`, fullPage: true });
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
    await page.getByRole("button", { name: "Проверить взнос", exact: true }).last().click();
    await page.getByRole("alertdialog").getByText("Доступ к группе изменился", { exact: true }).waitFor();
    assert(await page.evaluate(() => Boolean(sessionStorage.getItem("rollapp:group-contribution:fixture-user:fundraising-lost-denied"))), "A late access error must preserve the original unknown request key");
    await page.goto(`${smokeOrigin(server)}/__fundraising?mode=error`);
    await page.getByRole("alert").waitFor();
    assert(await page.getByRole("button", { name: "Повторить", exact: true }).isVisible());
    await page.goto(`${smokeOrigin(server)}/__fundraising?mode=hidden`);
    await page.getByText("Часы 1", { exact: true }).waitFor();
    assert.equal(await page.getByRole("heading", { name: "Сбор роллов" }).count(), 0);
    assert.deepEqual(errors, []);
    console.log(`PASS fundraising ${width}: create/edit/pause, balance validation, confirm/cancel, retry/reload, progress, guest/closed/completed/error, geometry and scroll`);
    await page.close();
  }
} finally { await browser.close(); await server.close(); }
