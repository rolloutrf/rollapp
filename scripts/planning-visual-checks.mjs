import assert from "node:assert/strict";
import { chromium } from "playwright-core";
import { checkMacCalendar, openCalendarList, searchCalendar } from "./calendar-macos-checks.mjs";
import { localDateKey } from "../shared/planning.js";

export async function runPlanningVisualChecks({ origin, token }) {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
  try {
    for (const width of [1440, 390]) {
      const context = await browser.newContext({ viewport: { width, height: 1000 }, hasTouch: width === 390 });
      const baseUrl = process.env.BASE_URL || "http://127.0.0.1:5172";
      await context.addCookies([{ name: "rw_session", value: token, url: baseUrl }]);
      // All task and board reads/writes use the real production database transaction.
      await context.route("**/api/me", async (route) => route.fulfill({ response: await route.fetch({ url: `${origin}/api/me` }) }));
      await context.route("**/api/planning/**", async (route) => {
        const url = new URL(route.request().url());
        const response = await route.fetch({ url: `${origin}${url.pathname}${url.search}` });
        try { await route.fulfill({ response }); }
        catch (error) {
          // Reloading/navigating can cancel an in-flight read after its real DB response.
          if (!error.message.includes("Route is already handled")) throw error;
        }
      });
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      const mutation = async (action, method = "PATCH", part = "/api/planning/") => {
        const saved = page.waitForResponse((response) => response.request().method() === method && response.url().includes(part));
        const [response] = await Promise.all([saved, action()]);
        assert(response.ok(), await response.text());
        await page.locator('.kanban-workspace[aria-busy="true"]').waitFor({ state: "hidden" });
      };
      const menu = async (title, option) => {
        await page.getByRole("button", { name: `Меню карточки ${title}`, exact: true }).click();
        await page.getByRole("menuitem", { name: option, exact: true }).click();
      };
      await page.goto(`${baseUrl}/app/planning`);
      await page.getByRole("heading", { name: "Планирование", exact: true }).waitFor();
      const chooseBoard = page.getByRole("button", { name: "Выбрать доску", exact: true });
      await page.getByText("Основная доска", { exact: true }).waitFor();
      await chooseBoard.click();
      assert.equal(await page.getByRole("menuitem", { name: "Календарь", exact: true }).count(), 0);
      await page.getByRole("menuitem", { name: "Создать доску", exact: true }).click();
      await page.getByLabel("Название", { exact: true }).fill(`Проекты ${width}`);
      await mutation(() => page.getByRole("button", { name: "Создать доску", exact: true }).click(), "POST", "/spaces");
      await page.getByPlaceholder("Например, Личные проекты").waitFor({ state: "hidden" });
      await page.locator(".planning-board").waitFor();
      const createdSpace = new URL(page.url()).searchParams.get("space");
      assert(createdSpace);
      assert.equal(await page.locator(".kanban-card").count(), 0);
      await page.locator('.planning-column[data-status="todo"]').getByRole("button", { name: "Добавить карточку", exact: true }).click();
      await page.getByLabel("Новая карточка", { exact: true }).fill(`Отдельная карточка ${width}`);
      await mutation(() => page.getByLabel("Новая карточка", { exact: true }).press("Enter"), "POST", "/tasks");
      await page.reload();
      await page.getByRole("button", { name: `Отдельная карточка ${width}`, exact: true }).waitFor();
      await chooseBoard.click();
      await page.screenshot({ path: `/tmp/rollapp-board-variants-${width}.png`, fullPage: true, animations: "disabled" });
      await page.getByRole("menuitem", { name: "Основная доска", exact: true }).click();
      await page.locator('.planning-column[data-status="doing"] .kanban-card').waitFor();
      assert.equal(await page.getByRole("button", { name: `Отдельная карточка ${width}`, exact: true }).count(), 0);
      await page.getByRole("button", { name: "Открыть переключатель сфер" }).click();
      assert.equal(await page.locator(".sphere-switcher__panel").getByRole("link", { name: "Планирование", exact: true }).count(), 0);
      await page.keyboard.press("Escape");
      await page.locator(".sphere-switcher__panel").waitFor({ state: "hidden" });
      const fab = page.getByRole("button", { name: "Открыть планирование", exact: true });
      const fabBox = await fab.boundingBox();
      assert.equal(Math.round(width - fabBox.x - fabBox.width), width < 560 ? 16 : 24);
      assert.equal(Math.round(1000 - fabBox.y - fabBox.height), width < 560 ? 16 : 24);
      await fab.click();
      const fabPanel = page.locator(".planning-fab__panel");
      await fabPanel.getByRole("link", { name: "Календарь", exact: true }).waitFor();
      await page.screenshot({ path: `/tmp/rollapp-planning-fab-${width}.png`, fullPage: true });
      const panelBox = await fabPanel.boundingBox();
      assert(panelBox.y + panelBox.height <= fabBox.y, "Planning menu should open above the FAB");
      await fabPanel.getByRole("link", { name: "Календарь", exact: true }).click();
      await page.locator(".schedule").waitFor();
      assert.equal(new URL(page.url()).searchParams.get("tab"), "calendar");
      const chooseCalendar = page.getByRole("button", { name: "Выбрать календарь", exact: true });
      await page.getByText("Основной календарь", { exact: true }).waitFor();
      await chooseCalendar.click();
      assert.equal(await page.getByRole("menuitem", { name: `Проекты ${width}`, exact: true }).count(), 0);
      await page.getByRole("menuitem", { name: "Создать календарь", exact: true }).click();
      await page.getByLabel("Название", { exact: true }).fill(`События ${width}`);
      await mutation(() => page.getByRole("button", { name: "Создать календарь", exact: true }).click(), "POST", "/spaces");
      await page.getByPlaceholder("Например, Работа").waitFor({ state: "hidden" });
      await page.locator(".schedule").waitFor();
      await page.getByRole("button", { name: "Новое событие", exact: true }).click();
      await page.getByLabel("Название", { exact: true }).fill(`Отдельное событие ${width}`);
      await mutation(() => page.getByRole("button", { name: "Сохранить", exact: true }).click(), "POST", "/tasks");
      await page.reload();
      await page.locator(".schedule").waitFor();
      await chooseCalendar.click();
      await page.screenshot({ path: `/tmp/rollapp-calendar-variants-${width}.png`, fullPage: true, animations: "disabled" });
      await page.getByRole("menuitem", { name: "Основной календарь", exact: true }).click();
      await page.locator(".schedule").waitFor();
      await page.getByText(`Отдельное событие ${width}`, { exact: true }).first().waitFor({ state: "hidden" });
      await page.locator(".schedule").waitFor();

      await fabPanel.waitFor({ state: "hidden" });
      await page.locator(".schedule").waitFor();
      await fab.click();
      await fabPanel.getByRole("link", { name: "Kanban-доска", exact: true }).click();
      await fabPanel.waitFor({ state: "hidden" });
      assert.equal(new URL(page.url()).searchParams.get("tab"), "kanban");
      await page.locator('.planning-column[data-status="doing"] .kanban-card').waitFor();
      await page.getByRole("button", { name: "Добавить список", exact: true }).click();
      await page.getByLabel("Название списка", { exact: true }).fill(`Идеи ${width}`);
      await mutation(() => page.getByRole("button", { name: "Добавить список", exact: true }).click(), "POST", "/columns");
      const column = page.locator(".planning-column").filter({ has: page.getByRole("button", { name: `Меню списка Идеи ${width}`, exact: true }) });
      await column.waitFor();
      const columnId = await column.getAttribute("data-kanban-column");
      await column.getByRole("button", { name: "Добавить карточку", exact: true }).click();
      await page.getByLabel("Новая карточка", { exact: true }).fill(`Обсудить план ${width}`);
      await mutation(() => page.getByLabel("Новая карточка", { exact: true }).press("Enter"), "POST", "/tasks");
      await page.getByLabel("Новая карточка", { exact: true }).fill(`Собрать **идеи** #проект ${width}`);
      await mutation(() => page.getByRole("button", { name: "Добавить", exact: true }).click(), "POST", "/tasks");
      await page.getByRole("button", { name: "Отменить ввод", exact: true }).click();
      await column.getByRole("button", { name: `Обсудить план ${width}`, exact: true }).click();
      await page.getByLabel("Описание карточки", { exact: true }).fill("**Подготовка**\n- [ ] Собрать вопросы\n- [x] Выбрать время\n[Материалы](https://example.com)");
      await mutation(() => page.getByRole("button", { name: "Сохранить", exact: true }).click());
      const first = column.locator(".kanban-card").filter({ hasText: `Обсудить план ${width}` });
      await mutation(() => first.getByRole("checkbox", { name: "Собрать вопросы", exact: true }).click());
      await mutation(() => first.getByRole("checkbox", { name: `Выполнено: Обсудить план ${width}`, exact: true }).click());
      if (width === 1440) {
        const second = column.locator(".kanban-card").filter({ hasText: `Собрать идеи #проект ${width}` });
        await mutation(() => second.dragTo(first, { targetPosition: { x: 40, y: 5 } }), "PATCH", "/move");
        assert((await column.locator(".kanban-card").first().innerText()).includes("Собрать идеи"));
      } else {
        // Touch pointer events exercise the dedicated handle; no browser drag API fallback.
        const handle = first.getByRole("button", { name: `Перетащить карточку Обсудить план ${width}`, exact: true });
        const target = column.locator(".kanban-card").filter({ hasText: `Собрать идеи #проект ${width}` });
        await handle.scrollIntoViewIfNeeded();
        const box = await handle.boundingBox();
        const dest = await target.boundingBox();
        const cdp = await context.newCDPSession(page);
        await mutation(async () => {
          await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: box.x + 12, y: box.y + 12 }] });
          await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: dest.x + 60, y: dest.y + dest.height - 2 }] });
          await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
        }, "PATCH", "/move");
        await cdp.detach();
      }
      await page.getByRole("button", { name: `Меню списка Идеи ${width}`, exact: true }).click();
      await page.getByRole("menuitem", { name: "Переименовать", exact: true }).click();
      await page.getByLabel("Название списка", { exact: true }).fill(`Обсуждение ${width}`);
      await mutation(() => page.getByRole("button", { name: "Сохранить", exact: true }).click());
      await page.getByRole("button", { name: `Меню списка Обсуждение ${width}`, exact: true }).click();
      await mutation(() => page.getByRole("menuitem", { name: "Сдвинуть влево", exact: true }).click());
      await page.reload();
      const reloadedColumn = page.locator(`[data-kanban-column="${columnId}"]`);
      await reloadedColumn.getByRole("checkbox", { name: `Выполнено: Обсудить план ${width}`, exact: true }).waitFor();
      assert.equal(await reloadedColumn.getByRole("checkbox", { name: `Выполнено: Обсудить план ${width}`, exact: true }).isChecked(), true);
      await page.getByLabel("Поиск карточек", { exact: true }).fill(`Обсудить план ${width}`);
      assert.equal(await page.locator(".kanban-card").count(), 1);
      await page.getByRole("button", { name: "Сбросить поиск", exact: true }).click();
      await mutation(() => menu(`Обсудить план ${width}`, "В архив"));
      await page.getByRole("button", { name: /^Архив/ }).click();
      await page.locator(".kanban-archive .kanban-card").filter({ hasText: `Обсудить план ${width}` }).waitFor();
      await mutation(() => menu(`Обсудить план ${width}`, "Вернуть на доску"));
      await page.getByRole("button", { name: /^Архив/ }).click();
      const downloadEvent = page.waitForEvent("download");
      await page.getByRole("button", { name: "Скачать Markdown", exact: true }).click();
      assert.equal((await downloadEvent).suggestedFilename(), "Планирование.md");
      await page.getByRole("button", { name: "Новая задача", exact: true }).click();
      await page.getByLabel("Название", { exact: true }).fill(`Встреча ${width}`);
      await page.getByLabel("Дата", { exact: true }).fill(localDateKey(new Date()));
      await mutation(() => page.getByRole("button", { name: "Сохранить", exact: true }).click(), "POST", "/tasks");
      await page.getByRole("dialog").waitFor({ state: "hidden" });
      await fab.click();
      await fabPanel.getByRole("link", { name: "Календарь", exact: true }).click();
      await fabPanel.waitFor({ state: "hidden" });
      // A month cell fits as many summaries as its height permits; find any remaining event through search.
      await searchCalendar(page, `Встреча ${width}`);
      await page.locator(".schedule-search-results").getByRole("button", { name: new RegExp(`Встреча ${width}`) }).waitFor();
      await page.reload();
      await page.locator(".schedule").waitFor();
      await searchCalendar(page, `Встреча ${width}`);
      await page.locator(".schedule-search-results").getByRole("button", { name: new RegExp(`Встреча ${width}`) }).waitFor();
      await page.screenshot({ path: `/tmp/rollapp-obsidian-calendar-${width}.png`, fullPage: true });
      await page.locator(".schedule-search-results").getByRole("button", { name: new RegExp(`Встреча ${width}`) }).click();
      await page.locator(".schedule-preview").getByRole("button", { name: "Изменить", exact: true }).click();
      await page.getByRole("switch", { name: "Весь день", exact: true }).click();
      await page.getByLabel("Начало", { exact: true }).fill("09:30");
      await page.getByLabel("Длительность, минут", { exact: true }).fill("90");
      await mutation(() => page.getByRole("button", { name: "Сохранить", exact: true }).click());
      await page.getByRole("dialog").waitFor({ state: "hidden" });
      await page.getByRole("tab", { name: "Неделя", exact: true }).click();
      const appointment = page.locator(".schedule-time-column").getByRole("button", { name: `Встреча ${width}, 09:30–11:00`, exact: true });
      await appointment.waitFor();
      await appointment.scrollIntoViewIfNeeded();
      await page.screenshot({ path: `/tmp/rollapp-calendar-week-${width}.png`, fullPage: true });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await page.reload();
      await appointment.waitFor();
      assert.equal(new URL(page.url()).searchParams.get("view"), "week");
      await page.getByRole("tab", { name: "День", exact: true }).click();
      await page.waitForURL(/view=day/);
      const lunchTime = width === 1440 ? "12:00" : "14:00";
      const lunchEnd = width === 1440 ? "13:00" : "15:00";
      await page.locator(".schedule-timegrid:not(.schedule-timegrid--week) .schedule-time-column").getByRole("button", { name: new RegExp(`Добавить задачу .*${lunchTime}$`) }).click();
      assert.equal(await page.getByLabel("Начало", { exact: true }).inputValue(), lunchTime);
      await page.getByLabel("Название", { exact: true }).fill(`Обед ${width}`);
      await mutation(() => page.getByRole("button", { name: "Сохранить", exact: true }).click(), "POST", "/tasks");
      await page.getByRole("dialog").waitFor({ state: "hidden" });
      await page.locator(".schedule-time-column").getByRole("button", { name: `Обед ${width}, ${lunchTime}–${lunchEnd}`, exact: true }).waitFor();
      await page.screenshot({ path: `/tmp/rollapp-calendar-day-${width}.png`, fullPage: true });
      await openCalendarList(page, width);
      await page.waitForURL(/view=list/);
      await searchCalendar(page, `Обед ${width}`);
      await page.locator(".schedule-agenda__task").filter({ hasText: `Обед ${width}` }).waitFor();
      assert.equal(await page.locator(".schedule-agenda__task").count(), 1);
      await searchCalendar(page, "");
      await page.getByRole("button", { name: "Следующий период", exact: true }).click();
      await page.locator(".schedule-empty").waitFor();
      assert.equal(await page.locator(".schedule-agenda__task").count(), 0);
      await page.getByRole("button", { name: "Сегодня", exact: true }).click();
      await page.getByRole("tab", { name: "Месяц", exact: true }).click();
      await page.screenshot({ path: `/tmp/rollapp-calendar-month-${width}.png`, fullPage: true });
      await checkMacCalendar({ page, width, mutation });
      await fab.click();
      await fabPanel.getByRole("link", { name: "Kanban-доска", exact: true }).click();
      await fabPanel.waitFor({ state: "hidden" });
      await page.locator(".planning-board").evaluate((element) => { element.scrollLeft = 0; });
      await page.screenshot({ path: `/tmp/rollapp-obsidian-kanban-${width}.png`, fullPage: true });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      assert.deepEqual(errors, []);
      await context.unrouteAll({ behavior: "wait" });
      await context.close();
    }
    return browser;
  } catch (error) {
    console.error("Planning UI check failed:", error.message);
    for (const context of browser.contexts()) {
      for (const page of context.pages()) await page.screenshot({ path: "/tmp/rollapp-kanban-failure.png", fullPage: true }).catch(() => {});
      await context.unrouteAll({ behavior: "ignoreErrors" });
    }
    await browser.close(); throw error;
  }
}
