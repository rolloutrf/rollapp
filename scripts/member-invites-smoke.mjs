import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { createServer } from "vite";
import { chromium } from "playwright-core";
import { listenSmokeServer, smokeOrigin } from "./smoke-server.mjs";
import { browserLaunchOptions } from "./browser-runtime.mjs";

const server = await createServer({ server: { host: "127.0.0.1", port: 0, strictPort: true, hmr: false, watch: null }, plugins: [{
  name: "member-invites-fixture", enforce: "pre",
  transform(source, id) {
    if (id.endsWith("/src/App.jsx?member-invites-smoke")) return `${source}\nexport { RegistrationForm, ProfileSettingsModal, SessionContext, ToastContext };`;
  },
  configureServer(vite) { vite.middlewares.use(async (req, res, next) => {
    if (!req.url.startsWith("/member-fixture")) return next();
    res.setHeader("Content-Type", "text/html");
    res.end(await vite.transformIndexHtml(req.url, '<!doctype html><html class="dark"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/scripts/fixtures/member-invites.jsx"></script></body></html>'));
  }); },
}] });
await listenSmokeServer(server);
const browser = await chromium.launch(browserLaunchOptions());
const origin = smokeOrigin(server);
await mkdir("/tmp/rollapp-member-invites", { recursive: true });
try {
  for (const width of [320, 390, 768, 820, 1024, 1440, 1920]) {
    for (const height of width === 390 ? [844, 400] : [844]) {
      for (const variant of ["", "&assigned=1", "&invites=1", `&auth=1&invite=${"a".repeat(43)}`, "&profile=1"]) {
        const page = await browser.newPage({ viewport: { width, height } });
        const errors = [];
        page.on("pageerror", error => errors.push(error.message));
        // These are presentation checks. API calls are rejected; no fake user
        // records, email delivery or number assignment reaches a database.
        await page.route("**/api/**", route => route.abort());
        await page.goto(`${origin}/member-fixture?screen=1${variant}`, { waitUntil: "domcontentloaded" });
        await page.locator(variant.includes("profile") ? ".profile-settings-dialog" : variant.includes("invites") ? "#account-invite-email" : variant.includes("auth") ? ".auth-form" : ".member-number-wheel").waitFor();
        if (variant.includes("auth")) {
          const submit = page.getByRole("button", { name: "Зарегистрироваться с Яндекс ID" });
          assert(await submit.isVisible());
          assert.equal(await page.locator("form button[type=submit]").count(), 1);
          assert.equal(await page.locator("form input[type=password], form input[type=email], .or, .member-number-wheel").count(), 0);
          assert(await page.getByText("invited@example.com").isVisible());
          const seller = width === 390 && height === 844;
          if (seller) {
            await page.getByRole("radio", { name: /^Бизнес/ }).check();
            await page.getByRole("combobox", { name: "Категория бизнеса" }).click();
            await page.getByRole("option", { name: /Продавец/ }).click();
            await page.getByRole("combobox", { name: "Раздел Вишлиста" }).click();
            await page.getByRole("option", { name: "Транспорт", exact: true }).click();
            await page.locator('[data-slot="select-content"]').filter({ hasText: "Транспорт" }).waitFor({ state: "hidden" });
          }
          if ((width === 390 || width === 1440) && height === 844) {
            await page.evaluate(() => document.fonts.ready);
            await page.screenshot({ path: `/tmp/rollapp-member-invites/${width}-yandex-registration.png`, fullPage: true, animations: "disabled" });
          }
          const [request] = await Promise.all([
            page.waitForRequest(request => new URL(request.url()).pathname.startsWith("/api/auth/")),
            submit.click(),
          ]);
          assert.equal(new URL(request.url()).pathname, "/api/auth/yandex/start");
          assert.equal(request.method(), "POST");
          assert.deepEqual(request.postDataJSON(), {
            invite: "a".repeat(43), next: "/app/wishes",
            accountType: seller ? "business" : "personal", businessCategory: seller ? "seller" : null, sellerSpace: seller ? "transport" : null,
          });
          await page.getByRole("alert").waitFor();
          assert(await submit.isEnabled());
        }
        if (variant.includes("profile")) await page.getByRole("button", { name: "Инвайты", exact: true }).click();
        await page.evaluate(() => document.fonts.ready);
        if (variant.includes("profile")) await page.locator("#account-invite-email").scrollIntoViewIfNeeded();
        const measured = await page.evaluate(() => {
          const controls = [...document.querySelectorAll("button, input, .member-number-wheel")].filter(node => getComputedStyle(node).display !== "none").map(node => {
            const box = node.getBoundingClientRect();
            return { name: node.textContent || node.getAttribute("aria-label") || node.tagName, left: box.left, right: box.right, top: box.top, bottom: box.bottom };
          }).filter(box => box.bottom >= 0 && box.top <= innerHeight);
          return { scrollWidth: document.documentElement.scrollWidth, controls };
        });
        assert(measured.scrollWidth <= width + 1, `${width}x${height} ${variant}: horizontal overflow`);
        for (const control of measured.controls) assert(control.left >= -1 && control.right <= width + 1, `${width}x${height} ${variant}: clipped ${control.name}`);
        if (variant.includes("profile")) {
          const invite = await page.locator("#account-invite-email").boundingBox();
          assert(invite && invite.y < height && invite.y + invite.height > 0, `${width}x${height}: invite field is unreachable`);
        }
        assert.equal(errors.length, 0, `${width}x${height} ${variant}: ${errors.join("; ")}`);
        if ((width === 390 || width === 1440) && height === 844) await page.screenshot({ path: `/tmp/rollapp-member-invites/${width}-${variant || "empty"}.png`, fullPage: true });
        console.log(`PASS ${width}x${height} ${variant || "empty"}`);
        await page.close();
      }
    }
  }
} finally { await browser.close(); await server.close(); }
