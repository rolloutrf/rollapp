import assert from "node:assert/strict";
import { stat } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright-core";
import { internalPageUrl, localizedPageUrl } from "../shared/page-urls.js";
import { PLATFORM_HOST, SPHERE_APPLICATIONS } from "../shared/applications.js";
import { browserLaunchOptions } from "./browser-runtime.mjs";

const dist = path.resolve(import.meta.dirname, "../dist");
const hostApplications = new Map(Object.entries(SPHERE_APPLICATIONS).map(([id, def]) => [def.host, id]));
const routes = {
  identity: { tab: "values", display: "идентичность", section: "ценности", api: "/api/identity/content/values" },
  health: { tab: "sleep", display: "здоровье", section: "сон", api: "/api/health/trackers/sleep" },
  career: { tab: "about", display: "карьера", section: "о-себе", api: "/api/career/content/about" },
  education: { tab: "courses", display: "образование", section: "курсы", api: "/api/education/courses" },
  wishlist: { tab: "products", display: "желания", section: "товары", api: "/api/dashboard" },
};
const account = { id: "sphere-smoke", name: "Проверка сфер", username: "sphere-smoke", canDiscoverSpheres: true, accountType: "personal" };
const browser = await chromium.launch(browserLaunchOptions());

try {
  const viewports = [320, 390, 768, 820, 1024, 1440, 1920].map(width => ({ width, height: 844 }));
  viewports.push({ width: 390, height: 400 });
  for (const viewport of viewports) {
    const page = await browser.newPage({ viewport });
    const errors = [];
    const requests = [];
    let authenticated = true;
    page.on("pageerror", error => errors.push(error.message));
    await page.route("**/*", async route => {
      const target = new URL(route.request().url());
      const application = hostApplications.get(target.hostname);
      if (!application && target.hostname !== PLATFORM_HOST) return route.abort();
      const { pathname } = target;
      if (pathname.startsWith("/api/")) {
        requests.push([target.hostname, pathname]);
        if (pathname === "/api/me") return route.fulfill({ json: { user: authenticated ? account : null } });
        if (pathname === "/api/auth/sphere-session") {
          assert.equal(target.hostname, PLATFORM_HOST);
          assert.equal(authenticated, false);
          const next = target.searchParams.get("next");
          const destination = JSON.stringify(localizedPageUrl(`/login?next=${encodeURIComponent(next)}`));
          return route.fulfill({ contentType: "text/html", body: `<script>location.replace(${destination})</script>` });
        }
        if (pathname === "/api/auth/yandex/config") return route.fulfill({ json: { enabled: true, legacySignInEnabled: false } });
        if (pathname === "/api/sphere-shares/context") return route.fulfill({ json: { owner: account, isOwner: true } });
        if (pathname === "/api/planning/spaces") return route.fulfill({ json: { spaces: [] } });
        if (pathname === "/api/dashboard") return route.fulfill({ json: { wishes: [], lists: [], groups: [] } });
        if (pathname === "/api/wishes/backfill-previews") return route.fulfill({ json: { updated: 0 } });
        return route.fulfill({ status: 503, json: { error: "Проверка ошибки загрузки" } });
      }
      const asset = path.join(dist, pathname);
      if (asset.startsWith(`${dist}/`) && await stat(asset).then(file => file.isFile(), () => false)) {
        return route.fulfill({ path: asset });
      }
      if (!route.request().isNavigationRequest()) return route.abort();
      return route.fulfill({ path: path.join(dist, `${application || "index"}.html`) });
    });
    try {
      for (const [id, { host, home }] of Object.entries(SPHERE_APPLICATIONS)) {
        const { tab, display, section, api } = routes[id];
        const query = `?tab=${tab}&owner=${account.username}#focus`;
        const roleRequest = page.waitForRequest(request => {
          const url = new URL(request.url());
          if (url.hostname !== host || url.pathname !== api) return false;
          if (id !== "wishlist") assert.equal(url.searchParams.get("owner"), account.username);
          return true;
        });
        await page.goto(`https://${host}/${query}`);
        const localized = localizedPageUrl(home + query);
        await page.waitForURL(`https://${host}${localized}`);
        const current = new URL(page.url());
        assert.equal(decodeURI(current.pathname), `/приложение/${id === "wishlist" ? "" : "сферы/"}${display}`);
        assert.equal(current.searchParams.get("раздел"), section);
        assert.equal(current.searchParams.get("владелец"), account.username);
        assert.equal(current.hash, "#focus");
        await roleRequest;
        assert.equal(await page.locator('meta[name="rollapp-application"]').getAttribute("content"), id);
        const controls = page.getByRole("button", { name: "Открыть переключатель сфер", exact: true });
        await controls.waitFor();
        assert.equal(await controls.count(), 1);
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      }

      await page.getByRole("button", { name: "Открыть переключатель сфер", exact: true }).click();
      const link = page.getByRole("link", { name: "Здоровье", exact: true });
      const { host, home } = SPHERE_APPLICATIONS.health;
      assert.equal(await link.getAttribute("href"), `https://${host}${localizedPageUrl(home)}`);
      await link.click();
      await page.waitForURL(`https://${host}${localizedPageUrl(home)}`);
      await page.goBack();
      await page.waitForURL((url) => url.hostname === SPHERE_APPLICATIONS.wishlist.host);
      await page.goto(`https://${PLATFORM_HOST}/app/spheres/health?tab=sleep#focus`);
      await page.waitForURL(`https://${host}${localizedPageUrl(`${home}?tab=sleep#focus`)}`);
      const sleepTab = page.getByRole("combobox", { name: "Раздел сервиса Здоровье" });
      await sleepTab.waitFor();
      assert.match(await sleepTab.innerText(), /Сон/);
      await page.reload();
      await sleepTab.waitFor();
      assert.match(await sleepTab.innerText(), /Сон/);

      authenticated = false;
      await page.goto(`https://${PLATFORM_HOST}${home}?tab=sleep#focus`);
      await page.waitForURL(url => url.hostname === PLATFORM_HOST && decodeURI(url.pathname) === "/вход");
      assert.equal(internalPageUrl(new URL(page.url()).searchParams.get("далее")), `${home}?tab=sleep#focus`);
      await page.getByRole("link", { name: /Яндекс ID/ }).waitFor();
      assert(requests.some(([host, api]) => host === PLATFORM_HOST && api === "/api/auth/sphere-session"));
      assert.deepEqual(errors, []);
      console.log(`PASS ${viewport.width}×${viewport.height}: Russian links, five entrypoints, owner scope, switch, Back, reload, auth handoff`);
    } catch (error) {
      console.error(page.url(), requests, errors);
      throw error;
    } finally {
      await page.close();
    }
  }
} finally {
  await browser.close();
}
