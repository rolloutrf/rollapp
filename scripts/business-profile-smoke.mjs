import assert from "node:assert/strict";
import { createServer } from "vite";
import { chromium } from "playwright-core";
import { browserLaunchOptions } from "./browser-runtime.mjs";
import { listenSmokeServer, smokeOrigin } from "./smoke-server.mjs";

const server = await createServer({ cacheDir: "node_modules/.vite-business-profile", server: { host: "127.0.0.1", port: 0, hmr: false, watch: null }, plugins: [{
  name: "business-profile-fixture", configureServer(vite) {
    vite.middlewares.use(async (req, res, next) => {
      if (!req.url.startsWith("/__business-profile")) return next();
      res.setHeader("Content-Type", "text/html");
      res.end(await vite.transformIndexHtml(req.url, '<!doctype html><html class="dark"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/scripts/fixtures/gift-cards.jsx"></script></body></html>'));
    });
  },
}] });
await listenSmokeServer(server);
const browser = await chromium.launch(browserLaunchOptions());
try {
  for (const [width, height] of [[320,844],[390,844],[768,900],[820,450],[1024,900],[1440,900],[1920,900],[390,400]]) {
    for (const mode of ["owner", "guest", "buyer", "empty", "listing-error", "personal"]) {
      const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: width < 768 ? 3 : 1 });
      const errors = [];
      page.on("pageerror", error => errors.push(error.message));
      await page.route("**/api/**", route => { errors.push("Real API request forbidden"); return route.abort(); });
      const query = `public&offers&seller&${mode}${mode === "empty" || mode === "listing-error" ? "&guest" : ""}`;
      await page.goto(`${smokeOrigin(server)}/__business-profile?${query}`);
      await page.getByRole("heading", { level: 1 }).waitFor();
      await page.evaluate(() => document.fonts.ready);
      if (mode === "personal") {
        await page.getByText("Добавьте то, что действительно порадует.").or(page.getByText("Загляните чуть позже — новая мечта наверняка появится.")).waitFor();
        assert.equal(await page.getByText("Бизнес-аккаунт", { exact: true }).count(), 0);
      } else {
        await page.getByText("Бизнес-аккаунт", { exact: true }).waitFor();
        assert.equal(await page.getByText("В этом списке пока пусто", { exact: true }).count(), 0);
        assert.equal(await page.getByRole("button", { name: "Новый список", exact: true }).count(), 0);
        assert.equal(await page.getByRole("button", { name: "Добавить", exact: true }).count(), 0);
        if (mode === "empty") {
          await page.getByText("Товаров пока нет", { exact: true }).waitFor();
          assert.equal(await page.getByText("В магазине пока пусто", { exact: true }).count(), 0);
        } else if (mode === "listing-error") {
          await page.getByText("Товары временно недоступны", { exact: true }).waitFor();
          await page.getByRole("button", { name: "Повторить", exact: true }).click();
          await page.getByText("Товары временно недоступны", { exact: true }).waitFor();
        } else {
          await page.getByRole("button", { name: "Открыть «Товар мастерской»", exact: true }).waitFor();
        }
        const manage = page.getByRole("link", { name: "Управлять товарами", exact: true });
        if (mode === "owner") {
          assert.equal(await manage.getAttribute("href"), "/app/wishes/business?tab=products");
          const style = await manage.evaluate(node => { const css = getComputedStyle(node); return { height: node.getBoundingClientRect().height, left: css.paddingLeft, right: css.paddingRight }; });
          assert(style.height >= 48); assert.equal(style.left, "24px"); assert.equal(style.right, "24px");
        } else assert.equal(await manage.count(), 0);
      }
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${mode} ${width}: root overflow`);
      await page.screenshot({ path: `/tmp/rollapp-business-profile-${mode}-${width}-${height}.png`, fullPage: true });
      if (mode === "owner") {
        await page.getByRole("link", { name: "Управлять товарами", exact: true }).click();
        await page.getByRole("textbox", { name: "Название страницы", exact: true }).waitFor();
        assert.equal(new URL(page.url()).searchParams.get("tab"), "products");
        await page.getByRole("button", { name: "Добавить айтем", exact: true }).click();
        await page.getByLabel("Название", { exact: true }).waitFor();
        await page.getByLabel("Название", { exact: true }).fill("Несохранённый товар");
        await page.getByRole("button", { name: "Отмена", exact: true }).click();
        await page.getByRole("textbox", { name: "Название страницы", exact: true }).waitFor();
      }
      assert.deepEqual(await page.evaluate(() => giftHarness.calls), [], "Read/cancel must not save or purchase");
      assert.deepEqual(errors, []);
      await page.close();
      console.log(`PASS business profile ${mode} ${width}x${height}`);
    }
  }
} finally { await browser.close(); await server.close(); }
