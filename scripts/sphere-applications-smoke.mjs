import { spherePageUrl } from "../shared/modules/shell/sphere-page-urls.js";
import assert from "node:assert/strict";
import { stat } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright-core";
import { internalPageUrl, localizedPageUrl } from "../shared/modules/shell/page-urls.js";
import { PLATFORM_HOST, SPHERE_APPLICATIONS } from "../shared/modules/shell/applications.js";
import { businessMarketplacePath } from "../shared/modules/catalog-marketplace/business-marketplace.js";
import { sphereBusinessCatalogPath } from "../shared/modules/catalog-marketplace/business-accounts.js";
import { browserLaunchOptions } from "./browser-runtime.mjs";

const dist = path.resolve(import.meta.dirname, "../dist");
const hostApplications = new Map(Object.entries(SPHERE_APPLICATIONS).map(([id, def]) => [def.host, id]));
const routes = {
  identity: { tab: "values", display: "/ценности", api: "/api/identity/content/values" },
  health: { tab: "sleep", display: "/сон", api: "/api/health/trackers/sleep" },
  career: { tab: "about", display: "/", api: "/api/career/content/about" },
  education: { tab: "courses", display: "/", api: "/api/education/courses" },
  wishlist: { tab: "products", display: "/", api: "/api/dashboard" },
};
const account = { id: "sphere-smoke", name: "Проверка сфер", username: "sphere-smoke", canDiscoverSpheres: true, accountType: "personal" };
const browser = await chromium.launch(browserLaunchOptions());

async function assertCollectionWidth(page, content) {
  await content.waitFor();
  const sizes = await content.evaluate((element) => {
    const page = document.querySelector(".app-main > .app-page");
    const main = page.parentElement;
    const inset = parseFloat(getComputedStyle(page).paddingInlineStart);
    const mainStyle = getComputedStyle(main);
    const available = main.clientWidth - parseFloat(mainStyle.paddingInlineStart) - parseFloat(mainStyle.paddingInlineEnd) - 2 * inset;
    const bounds = element.getBoundingClientRect();
    return { width: bounds.width, expected: Math.min(1024, available), center: bounds.left + bounds.width / 2, screenCenter: document.documentElement.clientWidth / 2 };
  });
  assert(Math.abs(sizes.width - sizes.expected) <= 1, `${page.url()} width: ${JSON.stringify(sizes)}`);
  assert(Math.abs(sizes.center - sizes.screenCenter) <= 1, `${page.url()} center: ${JSON.stringify(sizes)}`);
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), page.url());
}

try {
  const viewports = [320, 390, 768, 820, 1024, 1440, 1920].map(width => ({ width, height: 844 }));
  viewports.push({ width: 390, height: 400 });
  for (const viewport of viewports) {
    const page = await browser.newPage({ viewport });
    const errors = [];
    const requests = [];
    let authenticated = true;
    let collectionState = null;
    let pendingLabResults;
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
        if (collectionState) {
          if (pathname.startsWith("/api/business-catalog/") || pathname === "/api/wishlist-business/media/accounts") {
            return route.fulfill({ json: { accounts: [] } });
          }
          if (pathname === "/api/personal-offers") return route.fulfill({ json: { offers: [] } });
          if (pathname === "/api/catalog" || /^\/api\/wishlist-business\/media\/(offers|sales|store)$/.test(pathname)) {
            return route.fulfill({ json: { items: [], total: 0 } });
          }
          if (pathname === "/api/profile/sphere-smoke/announcements") {
            return route.fulfill({ json: { profile: account, isOwner: true, announcements: [] } });
          }
          if (pathname === "/api/health/lab-results" && collectionState === "empty") {
            await pendingLabResults;
            return route.fulfill({ json: { reports: [] } });
          }
          if (/^\/api\/business-marketplace\/\w+\/store$/.test(pathname) && collectionState !== "error") {
            const items = collectionState === "filled" ? [{
              id: "test-item", itemType: "service", title: "Предложение магазина", priceRolls: 100,
              business: { id: "provider", name: "Бизнес", username: "provider" },
            }] : [];
            return route.fulfill({ json: { items } });
          }
        }
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
        const { tab, display, api } = routes[id];
        const query = `?tab=${tab}&owner=${account.username}#focus`;
        const roleRequest = page.waitForRequest(request => {
          const url = new URL(request.url());
          if (url.hostname !== host || url.pathname !== api) return false;
          if (id !== "wishlist") assert.equal(url.searchParams.get("owner"), account.username);
          return true;
        });
        await page.goto(`https://${host}${home}${query}`);
        const localized = spherePageUrl(home + query, id);
        await page.waitForURL(`https://${host}${localized}`);
        const current = new URL(page.url());
        assert.equal(decodeURI(current.pathname), display);
        assert.equal(current.searchParams.has("раздел"), false);
        assert.equal(current.searchParams.get("владелец"), account.username);
        assert.equal(current.hash, "#focus");
        await roleRequest;
        assert.equal(await page.locator('meta[name="rollapp-application"]').getAttribute("content"), id);
        const controls = page.getByRole("button", { name: "Открыть переключатель сфер", exact: true });
        await controls.waitFor();
        assert.equal(await controls.count(), 1);
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      }

      const feed = page.getByRole("link", { name: "Открыть ленту", exact: true });
      assert.equal(decodeURI(await feed.getAttribute("href")), "/каталог");
      await feed.click();
      await page.waitForURL(url => decodeURI(url.pathname) === "/каталог" && !url.search);
      const brands = page.getByRole("link", { name: "Открыть каталог брендов", exact: true });
      assert.equal(decodeURI(await brands.getAttribute("href")), "/каталог-брендов");
      await brands.click();
      await page.waitForURL(url => decodeURI(url.pathname) === "/каталог-брендов" && !url.search);
      await page.reload();
      await brands.waitFor();
      assert.equal(await brands.getAttribute("aria-current"), "page");
      await page.goBack();
      await page.waitForURL(url => decodeURI(url.pathname) === "/каталог");
      await page.goBack();
      await page.waitForURL(url => url.pathname === "/");

      await page.getByRole("button", { name: "Открыть переключатель сфер", exact: true }).click();
      const link = page.getByRole("link", { name: "Здоровье", exact: true });
      const { host, home } = SPHERE_APPLICATIONS.health;
      assert.equal(await link.getAttribute("href"), `https://${host}${spherePageUrl(home, "health")}`);
      await link.click();
      await page.waitForURL(`https://${host}${spherePageUrl(home, "health")}`);
      await page.goBack();
      await page.waitForURL((url) => url.hostname === SPHERE_APPLICATIONS.wishlist.host);
      await page.goto(`https://${PLATFORM_HOST}/app/spheres/health?tab=sleep#focus`);
      await page.waitForURL(`https://${host}${spherePageUrl(`${home}?tab=sleep#focus`, "health")}`);
      const sleepTab = page.getByRole("combobox", { name: "Раздел сервиса Здоровье" });
      await sleepTab.waitFor();
      assert.match(await sleepTab.innerText(), /Сон/);
      await page.reload();
      await sleepTab.waitFor();
      assert.match(await sleepTab.innerText(), /Сон/);

      async function openCollection(id, path, selector = "[data-empty-state]") {
        await page.goto(`https://${SPHERE_APPLICATIONS[id].host}${spherePageUrl(path, id)}`);
        await assertCollectionWidth(page, page.locator(selector));
      }
      collectionState = "empty";
      for (const [id, tab] of [["identity", "mission"], ["health", "lab-results"], ["career", "contacts"], ["education", "courses"]]) {
        const catalog = sphereBusinessCatalogPath(id, tab);
        await openCollection(id, catalog);
        await openCollection(id, `${catalog}&view=offers`);
        const store = businessMarketplacePath(id);
        if (store) await openCollection(id, `${store}?tab=${tab}`);
      }
      for (const path of [
        "/app/wishes/catalog?tab=media", "/app/wishes/catalog?source=brands&tab=media", "/app/store?tab=media",
        "/app/wishes/offers?tab=media", "/app/wishes/sales?tab=media", "/app/wishes?publication=announcements&tab=media",
        "/app/wishes/listings?tab=media",
      ]) await openCollection("wishlist", path);

      const labs = `${home}?tab=lab-results`;
      const healthStore = `${businessMarketplacePath("health")}?tab=lab-results`;
      const labsResponse = Promise.withResolvers();
      pendingLabResults = labsResponse.promise;
      try {
        await openCollection("health", labs, ".app-page [data-slot='card']");
      } finally {
        labsResponse.resolve();
        pendingLabResults = undefined;
      }
      await openCollection("health", labs);
      collectionState = "filled";
      await openCollection("health", healthStore, ".business-marketplace-grid");
      collectionState = "error";
      await openCollection("health", healthStore, ".app-page [role='alert']");
      await openCollection("health", labs, ".app-page [role='alert']");
      collectionState = null;

      authenticated = false;
      await page.goto(`https://${PLATFORM_HOST}${home}?tab=sleep#focus`);
      await page.waitForURL(url => url.hostname === PLATFORM_HOST && decodeURI(url.pathname) === "/вход");
      assert.equal(internalPageUrl(new URL(page.url()).searchParams.get("далее")), `${home}?tab=sleep#focus`);
      await page.getByRole("link", { name: /Яндекс ID/ }).waitFor();
      assert(requests.some(([host, api]) => host === PLATFORM_HOST && api === "/api/auth/sphere-session"));
      assert.deepEqual(errors, []);
      console.log(`PASS ${viewport.width}×${viewport.height}: sphere routes, collection widths, owner scope, Back, reload, auth handoff`);
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
