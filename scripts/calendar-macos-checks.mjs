import assert from "node:assert/strict";
import { localDateKey } from "../shared/planning.js";

export async function openCalendarList(page) {
  const url = new URL(page.url());
  url.searchParams.set("view", "list");
  await page.goto(url.href);
  await page.locator(".schedule-list-panel").waitFor();
}

export async function checkMacCalendar({ page, width, mutation }) {
  const today = localDateKey(new Date());
  await page.getByRole("tab", { name: "Год", exact: true }).click();
  await page.locator(".schedule-year").waitFor();
  assert.equal(await page.locator(".schedule-year .schedule-mini").count(), 12);
  assert.equal(await page.getByRole("tablist", { name: "Вид календаря" }).getByRole("tab").count(), 4);
  assert.equal(await page.locator(".schedule-sidebar").count(), 0);
  if (width === 1440) {
    const months = await page.locator(".schedule-year .schedule-mini").evaluateAll((nodes) => nodes.map((node) => ({ x: node.getBoundingClientRect().x, y: node.getBoundingClientRect().y })));
    assert.equal(months[0].y, months[3].y);
    assert(months[4].y > months[0].y);
  }
  await page.screenshot({ path: `/tmp/rollapp-macos-year-${width}.png`, fullPage: true });
  await page.locator(".schedule-year .schedule-mini__title").first().click();
  await page.locator(".schedule-month__grid").waitFor();
  assert.equal(new URL(page.url()).searchParams.get("date").slice(5, 7), "01");
  await page.getByRole("button", { name: "Сегодня", exact: true }).click();
  await page.waitForURL((url) => url.searchParams.get("date") === today);
  await page.getByRole("tab", { name: "День", exact: true }).click();
  const timeline = page.locator(".schedule-timegrid:not(.schedule-timegrid--week)");
  await timeline.waitFor();
  const event = timeline.locator(".schedule-event-wrap").filter({ has: page.getByRole("button", { name: new RegExp(`^Обед ${width},`) }) });
  assert.equal(await page.locator(".schedule-inspector").count(), 0);
  const main = await page.locator(".schedule-main").boundingBox();
  const grid = await timeline.boundingBox();
  assert(Math.abs(grid.width - main.width) < 2);
  assert.equal(await timeline.locator(".schedule-day-heading").count(), 0);
  await event.locator(".schedule-event").click();
  await page.locator(".schedule-preview").getByRole("button", { name: "Дублировать", exact: true }).click();
  assert.equal(await page.getByLabel("Название", { exact: true }).inputValue(), `Обед ${width} — копия`);
  await page.getByRole("button", { name: "Закрыть задачу", exact: true }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  if (width === 1440) {
    const handle = event.getByRole("button", { name: `Изменить длительность: Обед ${width}`, exact: true });
    await mutation(() => handle.press("ArrowDown"));
    await event.getByRole("button", { name: `Обед ${width}, 12:00–13:15`, exact: true }).waitFor();
    await handle.scrollIntoViewIfNeeded();
    const box = await handle.boundingBox();
    await mutation(async () => {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 24, { steps: 6 });
      await page.mouse.up();
    });
    await event.getByRole("button", { name: `Обед ${width}, 12:00–13:30`, exact: true }).waitFor();
    await page.getByRole("button", { name: "Следующий период", exact: true }).click();
    await page.waitForURL((url) => url.searchParams.get("date") !== today);
    const selectedKey = new URL(page.url()).searchParams.get("date");
    const selectedLabel = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long" }).format(new Date(`${selectedKey}T12:00:00`));
    await page.locator(`.schedule-time-column[aria-label="${selectedLabel}"]`).waitFor();
    await page.locator('.schedule-timeline [data-slot="scroll-area-viewport"]').evaluate((node) => { node.scrollTop = 14 * 96; });
    const slot = timeline.getByRole("button", { name: /Добавить задачу .*15:00$/ });
    await slot.scrollIntoViewIfNeeded();
    const rangeBox = await slot.boundingBox();
    await page.mouse.move(rangeBox.x + 40, rangeBox.y + 24);
    await page.mouse.down();
    await page.mouse.move(rangeBox.x + 40, rangeBox.y + 120, { steps: 8 });
    await page.mouse.up();
    await page.getByLabel("Начало", { exact: true }).waitFor();
    assert.equal(await page.getByLabel("Начало", { exact: true }).inputValue(), "15:15");
    assert.equal(await page.getByLabel("Длительность, минут", { exact: true }).inputValue(), "60");
    await page.getByLabel("Название", { exact: true }).fill("Выделение времени");
    await mutation(() => page.getByRole("button", { name: "Сохранить", exact: true }).click(), "POST", "/tasks");
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    const created = timeline.getByRole("button", { name: "Выделение времени, 15:15–16:15", exact: true });
    await created.waitFor();
    await mutation(() => created.dragTo(timeline.getByRole("button", { name: /Добавить задачу .*16:30$/ }), { targetPosition: { x: 40, y: 1 } }));
    await timeline.getByRole("button", { name: "Выделение времени, 16:30–17:30", exact: true }).waitFor();
    await mutation(() => page.getByRole("button", { name: "Отменить", exact: true }).last().click());
    await created.waitFor();
    await page.getByRole("button", { name: "Сегодня", exact: true }).click();
    await page.getByRole("tab", { name: "Месяц", exact: true }).click();
    await page.locator(".schedule-month__grid").waitFor();
    const cell = page.locator(`.schedule-month__cell[data-date="${today}"]`);
    await cell.locator('.schedule-month__indicator[data-has-events]').waitFor();
    assert.equal(await cell.locator('.schedule-event, .schedule-more').count(), 0);
    await cell.locator('.schedule-month__date').click();
    await page.waitForURL((url) => url.searchParams.get("view") === "day" && url.searchParams.get("date") === today);
    await page.getByRole("button", { name: "Сегодня", exact: true }).click();
  }
  await page.getByRole("tab", { name: "Месяц", exact: true }).click();
  await page.locator(".schedule-month__grid").waitFor();
  await page.screenshot({ path: `/tmp/rollapp-macos-month-${width}.png`, fullPage: true });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  if (width === 1440) {
    // Match the supplied desktop references without changing any calendar data.
    await page.setViewportSize({ width: 2048, height: 1330 });
    const referenceUrl = new URL(page.url());
    referenceUrl.searchParams.set("date", "2026-11-05");
    await page.goto(referenceUrl.href);
    await page.locator(".schedule").waitFor();
    for (const [view, name, selector] of [["year", "Год", ".schedule-year"], ["month", "Месяц", ".schedule-month__grid"], ["week", "Неделя", ".schedule-timegrid--week"], ["day", "День", ".schedule-timegrid:not(.schedule-timegrid--week)"]]) {
      await page.getByRole("tab", { name, exact: true }).click();
      await page.locator(selector).waitFor();
      if (view === "day") {
        const controls = await page.locator(".schedule-toolbar").evaluate((toolbar) => {
          const center = (element) => { const box = element.getBoundingClientRect(); return box.y + box.height / 2; };
          return [toolbar.querySelector(".schedule-window-actions"), toolbar.querySelector('[data-slot="tabs-list"]'), toolbar.querySelector(".schedule-navigation")].map(center);
        });
        assert(controls.every((center) => Math.abs(center - controls[0]) < 2));
      }
      await page.locator(".schedule").screenshot({ path: `/tmp/rollapp-reference-${view}.png`, animations: "disabled" });
    }
    await page.setViewportSize({ width, height: 1000 });
  }
}
