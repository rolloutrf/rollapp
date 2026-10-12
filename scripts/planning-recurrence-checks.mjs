import assert from "node:assert/strict";
import { chromium } from "playwright-core";

// Uses the integration server's real PostgreSQL transaction, rolled back by its caller.
export async function runRecurrenceChecks({ origin, token }) {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
  const baseUrl = process.env.BASE_URL || "http://127.0.0.1:5172";
  const errors = [];
  try {
    for (const width of [390, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: 900 } });
      await context.addCookies([{ name: "rw_session", value: token, url: baseUrl }]);
      await context.route("**/api/me", async (route) => route.fulfill({ response: await route.fetch({ url: `${origin}/api/me` }) }));
      await context.route("**/api/planning/**", async (route) => {
        const url = new URL(route.request().url());
        await route.fulfill({ response: await route.fetch({ url: `${origin}${url.pathname}${url.search}` }) });
      });
      const page = await context.newPage();
      page.on("pageerror", (error) => errors.push(error.message));
      const go = async (tab, date, view = "day") => {
        await page.goto(`${baseUrl}/app/planning?tab=${tab}&date=${date}&view=${view}`);
        await page.locator(tab === "todo" ? ".daily-todo" : ".schedule").waitFor();
      };
      const mutation = async (action, method) => {
        const [result] = await Promise.all([page.waitForResponse((r) => r.url().includes("/api/planning/tasks") && r.request().method() === method), action()]);
        assert(result.ok(), `Mutation failed: ${await result.text()}`);
        return result.json();
      };
      const title = `Повторение ${width}`;
      await go("calendar", "2026-10-07");
      await page.getByRole("button", { name: "Новое событие", exact: true }).click();
      await page.getByLabel("Название", { exact: true }).fill(title);
      await page.getByRole("combobox", { name: "Повторение", exact: true }).click();
      await page.getByRole("option", { name: "Каждую неделю", exact: true }).click();
      await page.getByRole("button", { name: "Окончание повторения: не выбрана", exact: true }).click();
      await page.getByRole("button", { name: "среда, 21 октября 2026 г.", exact: true }).click();
      await page.getByRole("switch", { name: "Весь день", exact: true }).uncheck();
      await page.getByLabel("Начало", { exact: true }).fill("08:15");
      const created = await mutation(() => page.getByRole("button", { name: "Сохранить", exact: true }).click(), "POST");
      assert.deepEqual(created.task.recurrence, { frequency: "weekly", until: "2026-10-21" });
      await page.getByRole("dialog").waitFor({ state: "hidden" });
      await go("calendar", "2026-10-14");
      const event = page.getByRole("button", { name: `${title}, 08:15–09:15`, exact: true });
      await event.waitFor();
      assert.equal(await event.getAttribute("draggable"), "false");
      await event.click();
      await page.getByRole("button", { name: "Изменить серию", exact: true }).click();
      assert.equal(await page.getByRole("button", { name: "Дата задачи: 07.10.2026", exact: true }).count(), 1);
      await page.getByLabel("Название", { exact: true }).fill(`${title} изменено`);
      await mutation(() => page.getByRole("button", { name: "Сохранить", exact: true }).click(), "PATCH");
      await page.getByRole("dialog").waitFor({ state: "hidden" });
      await go("calendar", "2026-10-07", "month");
      for (const date of ["2026-10-07", "2026-10-14", "2026-10-21"]) assert.match(await page.locator(`.schedule-month__cell[data-date="${date}"] .schedule-month__date`).getAttribute("aria-label"), /задач: 1$/);
      await page.screenshot({ path: `/tmp/rollapp-recurrence-month-${width}.png` });
      await go("todo", "2026-10-14");
      const checkbox = page.getByRole("checkbox", { name: `Выполнено: ${title} изменено`, exact: true });
      await mutation(() => checkbox.click(), "PATCH");
      await page.reload();
      await checkbox.waitFor();
      assert.equal(await checkbox.isChecked(), true);
      await go("todo", "2026-10-21");
      await checkbox.waitFor();
      assert.equal(await checkbox.isChecked(), false);
      await go("calendar", "2026-10-28");
      assert.equal(await page.getByRole("button", { name: `${title} изменено, 08:15–09:15`, exact: true }).count(), 0);
      await go("todo", "2026-10-21");
      await page.getByRole("button", { name: `${title} изменено 08:15`, exact: true }).click();
      await page.getByRole("button", { name: "Удалить всю серию", exact: true }).click();
      await mutation(() => page.getByRole("alertdialog").getByRole("button", { name: "Удалить", exact: true }).click(), "DELETE");
      await go("calendar", "2026-10-07", "month");
      for (const date of ["2026-10-07", "2026-10-14", "2026-10-21"]) assert.match(await page.locator(`.schedule-month__cell[data-date="${date}"] .schedule-month__date`).getAttribute("aria-label"), /задач: 0$/);
      console.log(`PASS recurrence ${width}: create, reload, expand, edit series, complete day, end date, delete series`);
      await context.close();
    }
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
}
