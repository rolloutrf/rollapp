import assert from "node:assert/strict";
import { chromium } from "playwright-core";
import { createServer } from "vite";
import { browserLaunchOptions } from "./browser-runtime.mjs";
import { smokeBaseUiDependencies } from "./smoke-dependencies.mjs";
import { listenSmokeServer, smokeOrigin, smokePort } from "./smoke-server.mjs";

const server = await createServer({
  cacheDir: "node_modules/.vite-membership-smoke",
  optimizeDeps: { include: smokeBaseUiDependencies },
  server: { host: "127.0.0.1", port: smokePort(), strictPort: true, hmr: false, watch: null },
});
await listenSmokeServer(server);
const origin = smokeOrigin(server);
const browser = await chromium.launch(browserLaunchOptions());
try {
  for (const [width, height, motion] of [[320, 568, "reduce"], [390, 400, "no-preference"], [1440, 900, "no-preference"]]) {
    const page = await browser.newPage({ viewport: { width, height }, reducedMotion: motion });
    const errors = [];
    let authenticated = false;
    let registerRequests = 0;
    page.on("pageerror", error => errors.push(error.message));
    await page.route("**/api/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      const send = (json, status = 200) => route.fulfill({ json, status });
      if (path === "/api/me") return send({
        user: authenticated ? { id: "smoke", username: "smoke", name: "Алиса", membershipNumber: "00017" } : null,
      });
      if (path === "/api/auth/yandex/config") return send({ enabled: false });
      if (path === "/api/auth/invite/validate") {
        const { invite } = route.request().postDataJSON();
        if (invite === "full") return send({ code: "MEMBERSHIP_FULL", error: "Все 30 000 номеров Rollapp уже выданы" }, 409);
        assert.equal(invite, "valid");
        return send({ valid: true, membershipDraw: true });
      }
      if (path === "/api/auth/register") {
        const data = route.request().postDataJSON();
        assert.equal(data.invite, "valid");
        assert.equal(data.email, "smoke@example.invalid");
        registerRequests++;
        authenticated = true;
        return send({ user: { accountType: "personal" }, membershipDraw: true }, 201);
      }
      errors.push(`Unexpected API: ${path}`);
      return route.abort();
    });
    await page.goto(`${origin}/register#invite=full`, { timeout: 90_000 });
    await page.getByRole("heading", { name: "Все номера выданы" }).waitFor();
    assert.equal(await page.getByRole("button", { name: "Крутить барабан" }).count(), 0);
    await page.goto(`${origin}/register#invite=valid`, { timeout: 90_000 });
    await page.getByLabel("Как вас зовут").fill("Алиса");
    await page.getByLabel("Email", { exact: true }).fill("smoke@example.invalid");
    await page.getByLabel("Пароль", { exact: true }).fill("smoke-password");
    await page.getByRole("button", { name: "Крутить барабан" }).click();
    try {
      await page.getByRole("heading", { name: "Ваш номер Rollapp" }).waitFor({ timeout: 10_000 });
    } catch (error) {
      const body = await page.locator("body").innerText();
      throw new Error(`No reveal at ${width}×${height}: ${page.url()}, submissions=${registerRequests}, page errors=${errors.join("; ")}, body=${body.slice(0, 900)}`, { cause: error });
    }
    assert.match(page.url(), /\/register\/number\?/);
    assert.equal(await page.getByText("Ваш номер Rollapp: 00017").count(), 1);
    assert.equal(registerRequests, 1);
    const dimensions = await page.locator(".membership-reel").evaluate(async (reel) => {
      const strips = [...reel.querySelectorAll(".membership-reel__strip")];
      const animations = strips.flatMap(strip => strip.getAnimations());
      await Promise.all(animations.map(animation => animation.finished));
      return {
        digit: strips.map(strip => strip.lastElementChild.textContent).join(""),
        animationCount: animations.length,
        viewport: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
        clipped: strips.some(strip => {
          const digit = strip.lastElementChild.getBoundingClientRect();
          const slot = strip.parentElement.getBoundingClientRect();
          return digit.top < slot.top - 1 || digit.bottom > slot.bottom + 1;
        }),
      };
    });
    assert.equal(dimensions.digit, "00017");
    assert.equal(dimensions.animationCount, motion === "reduce" ? 0 : 5);
    assert(dimensions.scrollWidth <= dimensions.viewport);
    assert.equal(dimensions.clipped, false);
    assert.equal(await page.getByRole("link", { name: "Открыть Rollapp" }).getAttribute("href"), "/app/wishes");
    assert.deepEqual(errors, []);
    if (width === 390) await page.screenshot({ path: "/tmp/rollapp-membership-reel.png" });
    await page.close();
  }
  console.log("Registration cap and number reveal verified at 320, 390 and 1440 px.");
} finally {
  await browser.close();
  await server.close();
}
