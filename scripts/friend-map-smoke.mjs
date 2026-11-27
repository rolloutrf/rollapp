import assert from "node:assert/strict";
import { chromium } from "playwright-core";
import { createServer } from "vite";
import { browserLaunchOptions } from "./browser-runtime.mjs";
import { listenSmokeServer, smokeOrigin, smokePort } from "./smoke-server.mjs";

const server = await createServer({
  cacheDir: "node_modules/.vite-friend-map-smoke",
  server: { host: "127.0.0.1", port: smokePort(), strictPort: true, hmr: false, watch: null },
  plugins: [{
    name: "friend-map-fixture",
    configureServer(vite) {
      vite.middlewares.use(async (request, response, next) => {
        if (request.url !== "/friend-map-smoke") return next();
        response.setHeader("Content-Type", "text/html");
        response.end(await vite.transformIndexHtml(request.url,
          '<!doctype html><html lang="ru" class="dark"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/scripts/fixtures/friend-map.jsx"></script></body></html>'));
      });
    },
  }],
});

await listenSmokeServer(server);
const origin = smokeOrigin(server);
const browser = await chromium.launch(browserLaunchOptions());
const yandexRuntime = `
  window.__friendMapMock = { locations: [], markers: [] };
  class YMap {
    constructor(container, options) { this.container = container; window.__friendMapMock.options = options; }
    addChild(entity) {
      if (entity.element) { this.container.append(entity.element); window.__friendMapMock.markers.push(entity); }
      return entity;
    }
    removeChild(entity) { entity.element?.remove(); }
    setLocation(location) { window.__friendMapMock.locations.push(location); }
    destroy() { this.container.replaceChildren(); }
  }
  class YMapMarker { constructor(properties, element) { this.properties = properties; this.element = element; } }
  class YMapDefaultSchemeLayer {}
  class YMapDefaultFeaturesLayer {}
  window.ymaps3 = { ready: Promise.resolve(), YMap, YMapMarker, YMapDefaultSchemeLayer, YMapDefaultFeaturesLayer };
`;
const mapPayload = {
  configured: true,
  mapsApiKey: "referer-restricted-browser-key",
  notificationsConfigured: true,
  preferences: { shareLocation: true, nearbyNotifications: true },
  selfLocation: { coordinates: [30.31, 59.94], accuracyMeters: 12, observedAt: "2026-11-26T12:00:00Z", expiresAt: "2026-11-26T12:10:00Z" },
  friends: [{ id: "friend", username: "anna", name: "Анна", avatarUrl: "", coordinates: [30.32, 59.945], accuracyMeters: 18, observedAt: "2026-11-26T12:00:00Z", expiresAt: "2026-11-26T12:10:00Z" }],
  favoritePlaces: [{ id: "catalog:place", title: "Аврора", subtitle: "Петроградская набережная, 2", url: "https://yandex.ru/maps/org/avrora/1089479202/", imageUrl: "", coordinates: [30.337, 59.955], source: "catalog" }],
  unmappedFavoriteCount: 1,
  locationTtlMinutes: 10,
};
const emptyMapPayload = {
  ...mapPayload, selfLocation: null, friends: [], favoritePlaces: [], unmappedFavoriteCount: 0,
};

try {
  for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) {
    const page = await browser.newPage({ viewport });
    const errors = [];
    const patches = [];
    const locations = [];
    let mapLoads = 0;
    let resolvePatch;
    const patchReceived = new Promise(resolve => { resolvePatch = resolve; });
    let resolveLocation;
    const locationReceived = new Promise(resolve => { resolveLocation = resolve; });
    let yandexRequest = "";
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "geolocation", { configurable: true, value: {
        watchPosition(success) {
          setTimeout(() => success({ coords: { longitude: 30.31, latitude: 59.94, accuracy: 12 } }), 0);
          return 7;
        },
        clearWatch() {},
      } });
    });
    await page.route("https://api-maps.yandex.ru/v3/**", route => {
      yandexRequest = route.request().url();
      return route.fulfill({ status: 200, contentType: "application/javascript", body: yandexRuntime });
    });
    await page.route("**/api/friend-map**", async route => {
      const pathname = new URL(route.request().url()).pathname;
      if (pathname === "/api/friend-map/status") return route.fulfill({ json: {
        preferences: mapPayload.preferences, notificationsConfigured: true, locationTtlMinutes: 10,
      } });
      if (pathname === "/api/friend-map/location") {
        locations.push(route.request().postDataJSON());
        resolveLocation();
        return route.fulfill({ json: { location: mapPayload.selfLocation, nearby: [] } });
      }
      if (route.request().method() === "GET") {
        mapLoads += 1;
        return route.fulfill({ json: mapLoads === 1 ? emptyMapPayload : mapPayload });
      }
      const preferences = route.request().postDataJSON();
      patches.push(preferences);
      resolvePatch();
      return route.fulfill({ json: { preferences } });
    });
    await page.goto(`${origin}/friend-map-smoke`);
    await page.getByRole("region", { name: "Карта друзей и мест" }).waitFor();
    const frame = page.frameLocator('iframe[title="Избранные места и друзья на Яндекс Картах"]');
    await frame.locator(".rollapp-map-marker").first().waitFor();
    await locationReceived;
    assert.equal(await frame.locator(".rollapp-map-marker").count(), 3);
    assert.equal(await frame.locator("body").evaluate(() => window.__friendMapMock.locations
      .some(location => Array.isArray(location.bounds))), true);
    assert.deepEqual(locations, [{ longitude: 30.31, latitude: 59.94, accuracyMeters: 12 }]);
    assert.match(yandexRequest, /[?&]apikey=referer-restricted-browser-key(?:&|$)/);
    assert.match(yandexRequest, /[?&]lang=ru_RU(?:&|$)/);
    assert.equal(await page.getByRole("list", { name: "Объекты на карте" }).getByRole("listitem").count(), 2);
    await page.getByText("Для 1 избранных мест пока нет подтверждённых координат Яндекс Карт.", { exact: true }).waitFor();
    await frame.getByRole("button", { name: "Анна", exact: true }).click();
    await page.locator('.friend-map-item[data-selected="true"]').getByText("Анна", { exact: true }).waitFor();
    const placeLink = page.getByRole("link", { name: "Открыть в Яндекс Картах", exact: true });
    assert.equal(await placeLink.getAttribute("href"), mapPayload.favoritePlaces[0].url);
    assert.equal(await placeLink.getAttribute("target"), "_blank");
    const alertSwitch = page.getByRole("switch", { name: /Оповещать, когда друг ближе километра/ });
    await alertSwitch.click();
    await patchReceived;
    assert.deepEqual(patches, [{ shareLocation: true, nearbyNotifications: false }]);
    await page.waitForFunction(() => [...document.querySelectorAll('[role="switch"]')]
      .some(element => element.getAttribute("aria-checked") === "false"));
    assert.equal(await alertSwitch.isChecked(), false);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
    assert.deepEqual(errors, []);
    console.log(`PASS ${viewport.width}x${viewport.height}: Yandex iframe, favorite place, friend marker, selection and proximity settings`);
    await page.close();
  }
} finally {
  await browser.close();
  await server.close();
}
