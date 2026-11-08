import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { createServer } from "vite";
import { chromium } from "playwright-core";
import { browserLaunchOptions } from "./browser-runtime.mjs";
import { listenSmokeServer, smokeOrigin, smokePort } from "./smoke-server.mjs";

const server = await createServer({
  cacheDir: "node_modules/.vite-private-notes",
  server: { host: "127.0.0.1", port: smokePort(), strictPort: true, hmr: false, watch: null },
  plugins: [{
    name: "private-notes-fixture",
    transform(source, id) {
      if (id.endsWith("/src/App.jsx?notes-chrome")) {
        return source + "\nexport { AppShell, CollectionNavigationContext, GlobalAppChrome, SessionContext, ToastContext };";
      }
    },
    configureServer(vite) {
      vite.middlewares.use(async (req, res, next) => {
        if (req.url.split("?")[0] !== "/app/private-notes") return next();
        res.setHeader("Content-Type", "text/html");
        res.end(await vite.transformIndexHtml(req.url, '<!doctype html><html class="dark"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/scripts/fixtures/private-notes.jsx"></script></body></html>'));
      });
    },
  }],
});
await listenSmokeServer(server);
const url = smokeOrigin(server) + "/app/private-notes";
const browser = await chromium.launch(browserLaunchOptions());
const screenshotDirectory = process.env.ROLLAPP_NOTES_SCREENSHOTS;
if (screenshotDirectory) await mkdir(screenshotDirectory, { recursive: true });
const viewports = [[320, 844], [390, 844], [390, 400], [768, 844], [820, 844], [1024, 844], [1440, 900], [1920, 1080]];
try {
  for (const [width, height] of viewports) {
    const errors = [];
    let enabled = true;
    let connected = false;
    let outage = false;
    let revoked = false;
    const reconnect = { code: "DISK_RECONNECT", error: "Подключите Яндекс Диск снова" };
    let revision = 0;
    let stored = { markdown: "", revision: "r0" };
    const handler = async (method, path, body) => {
      if (path === "/private-notes/connection") return { enabled, connected };
      if (path === "/private-notes/connection/start") {
        assert.equal(body.ownerId, "fixture-owner");
        connected = true;
        revoked = false;
        return { authorizationUrl: url + "?disk=connected" };
      }
      if (method === "GET") {
        assert.equal(path, "/private-notes?ownerId=fixture-owner");
        if (revoked) return reconnect;
        return outage ? { error: "Диск недоступен" } : stored;
      }
      assert.equal(method, "PATCH");
      assert.equal(body.ownerId, "fixture-owner");
      if (revoked) return reconnect;
      if (outage) return { error: "Диск недоступен" };
      if (body.revision !== stored.revision) return { code: "DISK_NOTE_CONFLICT", error: "На Диске уже есть другая версия" };
      stored = { markdown: body.markdown, revision: `r${++revision}` };
      return stored;
    };
    const openPage = async () => {
      const page = await browser.newPage({ viewport: { width, height } });
      page.on("pageerror", (error) => errors.push(error.message));
      await page.route("**/api/**", route => {
        errors.push("Unexpected API request");
        return route.abort();
      });
      await page.exposeFunction("noteFixtureRequest", handler);
      await page.goto(url);
      return page;
    };
    const a = await openPage();
    const checkGeometry = async () => {
      await a.evaluate(() => document.fonts.ready);
      assert(await a.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "page overflows");
      for (const button of await a.getByRole("button").all()) {
        assert(await button.evaluate(el => el.getBoundingClientRect().height >= 48), "control below 48px");
      }
    };
    const connect = a.getByRole("button", { name: "Подключить Яндекс Диск" });
    await connect.waitFor();
    const padding = await connect.evaluate(el => [getComputedStyle(el).paddingInlineStart, getComputedStyle(el).paddingInlineEnd]);
    assert.deepEqual(padding, ["24px", "24px"]);
    await checkGeometry();
    if (screenshotDirectory && [390, 1440].includes(width) && height > 400) {
      await a.screenshot({ path: `${screenshotDirectory}/connect-${width}.png` });
    }
    await connect.click();
    const editor = a.getByRole("textbox", { name: "Личные заметки" });
    await editor.waitFor();
    await editor.fill("Первая версия");
    await a.waitForFunction(() => document.querySelector("[data-save-status]")?.dataset.saveStatus === "saved");
    assert.equal(stored.markdown, "Первая версия");

    const b = await openPage();
    await b.getByRole("textbox", { name: "Личные заметки" }).waitFor();
    assert.equal(await b.getByRole("textbox", { name: "Личные заметки" }).textContent(), "Первая версия");
    await editor.fill("Свежая версия");
    await a.waitForFunction(() => document.querySelector("[data-save-status]")?.dataset.saveStatus === "saved");
    await b.getByRole("textbox", { name: "Личные заметки" }).fill("Черновик другого устройства");
    await b.getByText("На Диске уже есть другая версия").waitFor();
    assert.equal(stored.markdown, "Свежая версия");
    await b.reload();
    await b.getByText("На Диске другая версия.", { exact: false }).waitFor();
    assert.equal(await b.getByRole("textbox", { name: "Личные заметки" }).textContent(), "Черновик другого устройства");
    await b.getByRole("button", { name: "Повторить сохранение" }).click();
    await b.getByRole("link", { name: "Версия с Диска" }).waitFor();
    assert.equal(stored.markdown, "Свежая версия");
    await b.close();

    outage = true;
    await editor.fill("Изменения без связи");
    await a.getByText("Диск недоступен", { exact: true }).waitFor();
    assert.equal(await editor.textContent(), "Изменения без связи");
    await checkGeometry();
    outage = false;
    await a.getByRole("button", { name: "Повторить сохранение" }).click();
    await a.waitForFunction(() => document.querySelector("[data-save-status]")?.dataset.saveStatus === "saved");
    assert.equal(stored.markdown, "Изменения без связи");
    if (screenshotDirectory && [390, 1440].includes(width) && height > 400) {
      await a.screenshot({ path: `${screenshotDirectory}/note-${width}.png` });
    }
    await editor.fill("");
    await a.keyboard.type("/image");
    const menu = a.getByRole("group", { name: "Команды блока" });
    await menu.getByText("Ничего не найдено.", { exact: false }).waitFor();
    assert.equal(await menu.getByRole("button", { name: /Изображение/ }).count(), 0);
    outage = true;
    await a.reload();
    await a.getByRole("button", { name: "Повторить загрузку" }).waitFor();
    await a.getByRole("button", { name: "Скачать черновик" }).waitFor();
    const download = a.waitForEvent("download");
    await a.getByRole("button", { name: "Скачать черновик" }).click();
    assert.equal((await download).suggestedFilename(), "Личные заметки — черновик.md");
    await checkGeometry();
    outage = false;
    revoked = true;
    await a.reload();
    const reconnectButton = a.getByRole("button", { name: "Подключить Диск снова" });
    await reconnectButton.waitFor();
    await reconnectButton.click();
    await a.getByText("Восстановлен несохранённый черновик.", { exact: false }).waitFor();
    assert.equal(await editor.textContent(), "/image");
    assert.equal(stored.markdown, "Изменения без связи");
    enabled = false;
    await a.reload();
    await a.getByText("Подключение Яндекс Диска пока недоступно.").waitFor();
    assert.equal(await editor.count(), 0);
    assert.deepEqual(errors, []);
    await a.close();
    console.log(`PASS ${width}×${height}: connection, save, conflict after reload, outage, retry, reconnect, disabled and control geometry`);
  }
} finally {
  await browser.close();
  await server.close();
}
