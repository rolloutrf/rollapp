import assert from "node:assert/strict";
import { createServer } from "vite";
import { chromium } from "playwright-core";
import { browserLaunchOptions } from "./browser-runtime.mjs";
import { listenSmokeServer, smokeOrigin, smokePort } from "./smoke-server.mjs";

const server = await createServer({
  cacheDir: "node_modules/.vite-booking-calendar-smoke",
  server: { host: "127.0.0.1", port: smokePort(), strictPort: true, hmr: false, watch: null },
  plugins: [{
    name: "booking-calendar-fixture",
    configureServer(vite) {
      vite.middlewares.use(async (req, res, next) => {
        if (!req.url.startsWith("/app/planning")) return next();
        res.setHeader("Content-Type", "text/html");
        res.end(await vite.transformIndexHtml(req.url, '<!doctype html><html class="dark"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/scripts/fixtures/booking-calendar.jsx"></script></body></html>'));
      });
    },
  }],
});
await listenSmokeServer(server);
const origin = smokeOrigin(server);
const browser = await chromium.launch(browserLaunchOptions());
try {
  const widths = (process.env.BOOKING_CALENDAR_WIDTHS || "390,1024").split(",").map(Number);
  for (const width of widths) {
    const page = await browser.newPage({ viewport: { width, height: 844 }, locale: "ru-RU", timezoneId: "Europe/Moscow" });
    page.setDefaultTimeout(60_000);
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/api/**", (route) => { errors.push(`Unexpected API ${route.request().url()}`); return route.abort(); });
    const preliminary = new Date();
    preliminary.setDate(preliminary.getDate() + 7);
    const day = `${preliminary.getFullYear()}-${String(preliminary.getMonth() + 1).padStart(2, "0")}-${String(preliminary.getDate()).padStart(2, "0")}`;
    await page.goto(`${origin}/app/planning?tab=calendar&space=booking&date=${day}&view=day&booking=request`);
    const requestDialog = page.getByRole("alertdialog");
    await requestDialog.getByRole("heading", { name: "Запрос на запись", exact: true }).waitFor();
    await requestDialog.getByText("Алексей хочет забронировать это время. Подтвердите или отклоните запрос.", { exact: true }).waitFor();
    await requestDialog.getByRole("button", { name: "Подтвердить", exact: true }).click();
    await page.getByText("Запись подтверждена", { exact: true }).waitFor();
    await page.locator('[data-calendar-event="requested"][data-booking-status="confirmed"]').waitFor();
    await requestDialog.waitFor({ state: "hidden" });
    assert.equal(new URL(page.url()).searchParams.has("booking"), false, "Handled notification intent stayed in the URL");

    try {
      await page.getByRole("button", { name: "Выбрать календарь: Календарь для бронирования", exact: true }).waitFor();
    } catch (cause) {
      cause.message += `\nPage errors: ${JSON.stringify(errors)}\nDialog count: ${await page.getByRole("alertdialog").count()}\nBody: ${(await page.locator("body").innerText()).slice(0, 2000)}`;
      throw cause;
    }
    await page.locator('[data-calendar-mode="booking"]').waitFor();
    await page.locator('[data-calendar-event="booked"][data-booked]').waitFor();
    assert.equal(await page.getByRole("button", { name: "Копировать ссылку на бронирование" }).count(), 1);
    assert.equal(await page.getByRole("link", { name: "Открыть страницу бронирования" }).getAttribute("href"), "/host/calendar/book");

    await page.locator('[data-calendar-event="booked"] .schedule-event').click();
    await page.getByRole("alertdialog").getByText("Светлана: после отмены это время снова смогут забронировать.", { exact: true }).waitFor();
    await page.getByRole("alertdialog").getByRole("button", { name: "Отменить запись", exact: true }).click();
    await page.locator('[data-calendar-event="booked"][data-booked]').waitFor({ state: "hidden" });
    assert.equal(await page.locator('[data-calendar-event="booked"]').count(), 1, "Cancelling a booking removed its slot");

    const dateLabel = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long" }).format(preliminary);
    await page.getByRole("button", { name: `Добавить слот ${dateLabel}, 14:00`, exact: true }).click();
    await page.getByText("Слот доступен для бронирования", { exact: true }).waitFor();
    const calls = await page.evaluate(() => window.bookingCalendarTransport.calls);
    const creation = calls.find(([method]) => method === "POST");
    assert.deepEqual(creation.slice(0, 2), ["POST", "/profile/host/calendar"]);
    assert.equal(creation[2].slots[0].title, "Встреча");
    assert.equal(creation[2].slots[0].duration, 60);
    const createdId = creation[2].slots[0].id;
    await page.locator(`[data-calendar-event="${createdId}"] .schedule-event`).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Убрать слот", exact: true }).click();
    await page.locator(`[data-calendar-event="${createdId}"]`).waitFor({ state: "hidden" });

    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log("PASS booking-calendar");
} finally {
  await browser.close();
  await server.close();
}
