import assert from "node:assert/strict";
import { createServer } from "vite";
import { chromium } from "playwright-core";
import { browserLaunchOptions } from "./browser-runtime.mjs";
import { listenSmokeServer, smokePort, smokeOrigin } from "./smoke-server.mjs";

const server = await createServer({
  cacheDir: "node_modules/.vite-profile-publications-smoke",
  server: { host: "127.0.0.1", port: smokePort(), strictPort: true, hmr: false, watch: null },
  plugins: [{
    name: "profile-publications-fixture", configureServer(vite) {
      vite.middlewares.use(async (req, res, next) => {
        if (!req.url.startsWith("/__profile-publications")) return next();
        res.setHeader("Content-Type", "text/html");
        res.end(await vite.transformIndexHtml(req.url, '<!doctype html><html class="dark"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/scripts/fixtures/profile-publications.jsx"></script></body></html>'));
      });
    },
  }],
});
await listenSmokeServer(server);
const origin = smokeOrigin(server);
const browser = await chromium.launch(browserLaunchOptions());
try {
  for (const [width, height] of [[320,844],[390,844],[390,400],[768,844],[820,844],[1024,844],[1440,900],[1920,900]]) {
    const page = await browser.newPage({ viewport: { width, height }, locale: "ru-RU", timezoneId: "Europe/Moscow" });
    page.setDefaultTimeout(30_000);
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.route("**/api/**", route => { errors.push("Unexpected API request"); return route.abort(); });
    async function open(section, mode) {
      await page.goto(`${origin}/__profile-publications?section=${section}&mode=${mode}`);
      await page.getByRole("heading", { name: section === "calendar" ? "Календарь" : "Доска объявлений", exact: true }).waitFor();
    }
    async function geometry() {
      const result = await page.evaluate(() => {
        const main = document.querySelector(".app-page");
        const overflow = [...main.querySelectorAll("button,a,input,textarea,article,h1,h2,h3,p")].filter(element => {
          const rect = element.getBoundingClientRect();
          return rect.width > 0 && (rect.left < -1 || rect.right > innerWidth + 1 || element.scrollWidth > element.clientWidth + 1 && ["ARTICLE", "P", "H1", "H2", "H3"].includes(element.tagName));
        });
        const badControls = [...main.querySelectorAll("[data-slot=button]")].filter(element => {
          const rect = element.getBoundingClientRect(), style = getComputedStyle(element);
          return rect.width > 0 && (rect.height < 48 || (element.textContent.trim() && !element.getAttribute("aria-label")?.startsWith("Дата сессии:") && (style.paddingLeft !== "24px" || style.paddingRight !== "24px")));
        });
        return { root: document.documentElement.scrollWidth, overflow: overflow.map(el => el.tagName), badControls: badControls.map(el => ({name: el.textContent, height: el.getBoundingClientRect().height, left: getComputedStyle(el).paddingLeft, right: getComputedStyle(el).paddingRight, minHeight: getComputedStyle(el).minHeight, css: el.className})) };
      });
      assert(result.root <= width + 1 && !result.overflow.length && !result.badControls.length, JSON.stringify(result));
    }

    await open("calendar", "guest");
    assert.equal(await page.getByText("Войти для записи").getAttribute("href"), "/login?next=%2Fhost%2Fcalendar");
    assert.equal(await page.getByText("Встреча по итогам недели").count(), 0);
    await geometry();

    await open("calendar", "visitor");
    await page.getByRole("button", { name: /Записаться: Первая встреча/ }).waitFor();
    await page.getByText("Вы записаны", { exact: true }).waitFor();
    await page.getByRole("button", { name: /Отменить запись: Встреча/ }).click();
    await page.getByRole("alertdialog").getByRole("heading", { name: "Отменить запись?" }).waitFor();
    await page.getByRole("alertdialog").getByRole("button", { name: "Назад" }).click();
    await page.getByRole("alertdialog").waitFor({ state: "hidden" });
    assert.deepEqual(await page.evaluate(() => window.publicationTransport.calls), []);
    const book = page.getByRole("button", { name: /Записаться: Первая встреча/ });
    const booked = page.getByRole("button", { name: /Отменить запись: Первая встреча/ });
    await book.click();
    await page.getByRole("status").getByText("Вы записаны на сессию").waitFor();
    await booked.click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Отменить запись" }).click();
    await page.getByRole("status").getByText("Запись отменена").waitFor();
    await book.waitFor();
    await page.evaluate(() => { window.publicationTransport.conflictNextBooking = true; });
    await book.click();
    await page.getByRole("alert").getByText("Это время больше недоступно. Выберите другой слот.").waitFor();
    await book.waitFor({ state: "detached" });
    assert.deepEqual(await page.evaluate(() => window.publicationTransport.calls), [
      ["POST", "/profile/host/calendar/open/book", {}],
      ["DELETE", "/profile/host/calendar/open/bookings/open-booking"],
      ["POST", "/profile/host/calendar/open/book", {}],
    ]);
    await geometry();

    await open("calendar", "owner");
    await page.getByText("Записался участник: Светлана").waitFor();
    await page.getByRole("button", { name: "Добавить слот" }).click();
    await page.getByLabel("Название сессии").fill("Планирование");
    await page.getByRole("button", { name: /Дата сессии/ }).click();
    await page.getByRole("grid").waitFor();
    await page.getByRole("grid").getByRole("button").filter({ visible: true }).first().click();
    await page.getByRole("grid").waitFor({ state: "hidden" });
    await page.locator("button[type=submit]:enabled").waitFor();
    assert.equal(await page.getByLabel("Название сессии").inputValue(), "Планирование");
    await page.getByRole("button", { name: "Опубликовать", exact: true }).click();
    await page.getByRole("status").getByText("Слот опубликован").waitFor();
    await page.getByRole("heading", { name: "Планирование", exact: true }).waitFor();
    const [[slotMethod, slotPath, slotPayload]] = await page.evaluate(() => window.publicationTransport.calls);
    assert.equal(slotMethod, "POST");
    assert.equal(slotPath, "/profile/host/calendar");
    assert.match(slotPayload.id, /^[0-9a-f-]{36}$/);
    assert.equal(slotPayload.duration, 60);
    assert.equal(slotPayload.title, "Планирование");
    assert.match(slotPayload.startsAt, /T06:00:00.000Z$/); // 09:00 Europe/Moscow
    await geometry();

    await open("announcements", "owner");
    await page.getByRole("heading", { name: "Открыта запись на ноябрь" }).waitFor();
    await geometry();
    await page.getByRole("button", { name: /Редактировать: Открыта запись/ }).click();
    assert.equal(await page.getByLabel("Заголовок объявления").inputValue(), "Открыта запись на ноябрь");
    await geometry();
    await page.getByRole("button", { name: "Отмена", exact: true }).click();
    await page.getByRole("button", { name: /Редактировать: Открыта запись/ }).click();
    await page.getByLabel("Заголовок объявления").fill("Обновлённое объявление");
    await page.getByLabel("Текст объявления").fill("Новое время");
    await page.getByRole("button", { name: "Сохранить", exact: true }).click();
    await page.getByRole("heading", { name: "Обновлённое объявление", exact: true }).waitFor();
    await page.getByRole("button", { name: /Удалить объявление: Обновлённое объявление/ }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Удалить", exact: true }).click();
    await page.getByText("Здесь появятся ваши опубликованные объявления.").waitFor();
    await page.getByRole("button", { name: "Добавить объявление", exact: true }).click();
    await page.getByLabel("Заголовок объявления").fill("Новая публикация");
    await page.getByLabel("Текст объявления").fill("Даты встреч");
    await page.getByRole("button", { name: "Опубликовать", exact: true }).click();
    await page.getByRole("heading", { name: "Новая публикация", exact: true }).waitFor();
    const writes = await page.evaluate(() => window.publicationTransport.calls);
    assert.deepEqual(writes.slice(0, 2), [
      ["PATCH", "/profile/host/announcements/announcement", { title: "Обновлённое объявление", body: "Новое время" }],
      ["DELETE", "/profile/host/announcements/announcement"],
    ]);
    assert.deepEqual(writes[2].slice(0, 2), ["POST", "/profile/host/announcements"]);
    assert.equal(writes[2][2].body, "Даты встреч");
    assert.equal(writes.length, 3);

    await open("announcements", "visitor");
    assert.equal(await page.getByRole("button", { name: /Добавить объявление|Удалить объявление|Редактировать:/ }).count(), 0);
    await geometry();
    await open("announcements", "empty");
    await page.getByText("Объявлений пока нет.").waitFor();
    await open("calendar", "empty");
    await page.getByText("Сейчас нет доступных слотов.").waitFor();
    await open("calendar", "loading");
    await page.getByRole("status").getByText("Загрузка…").waitFor();
    assert.deepEqual(errors, []);
    console.log(`PASS ${width}×${height} · booking, cancellation, conflict, publications, guest, date picker, overflow`);
    await page.close();
  }
} finally { await browser.close(); await server.close(); }
