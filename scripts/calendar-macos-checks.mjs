import assert from "node:assert/strict";
import { localDateKey } from "../shared/planning.js";

export async function searchCalendar(page, value) {
  await page.getByRole("button", { name: "Поиск событий", exact: true }).click();
  await page.getByLabel("Поиск в календаре", { exact: true }).fill(value);
  await page.keyboard.press("Escape");
  await page.locator(".schedule-search").waitFor({ state: "hidden" });
}
export async function openCalendarList(page, width) {
  if (width === 1440) {
    if (!await page.locator(".schedule-sidebar").isVisible()) await page.getByRole("button", { name: "Показать боковую панель", exact: true }).click();
    await page.locator(".schedule-sidebar").getByRole("button", { name: "Список событий", exact: true }).click();
    await page.getByRole("button", { name: "Скрыть боковую панель", exact: true }).click();
  } else {
    await page.getByRole("button", { name: "Фильтры календаря", exact: true }).click();
    await page.locator(".schedule-mobile-sidebar").getByRole("button", { name: "Список событий", exact: true }).click();
    await page.locator(".schedule-mobile-sidebar").waitFor({ state: "hidden" });
  }
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
  if (width === 1440) {
    await page.getByRole("button", { name: "Показать боковую панель", exact: true }).click();
    await page.locator(".schedule-sidebar").waitFor();
    await page.getByRole("button", { name: "Скрыть боковую панель", exact: true }).click();
    await page.locator(".schedule-sidebar").waitFor({ state: "hidden" });
  } else {
    await page.getByRole("button", { name: "Фильтры календаря", exact: true }).click();
    const panel = page.locator(".schedule-mobile-sidebar");
    await panel.locator(".schedule-mini").waitFor();
    await panel.getByRole("checkbox", { name: "Завершённые", exact: true }).click();
    await page.keyboard.press("Escape");
    await panel.waitFor({ state: "hidden" });
  }
  await page.getByRole("tab", { name: "День", exact: true }).click();
  const timeline = page.locator(".schedule-timegrid:not(.schedule-timegrid--week)");
  await timeline.waitFor();
  const event = timeline.locator(".schedule-event-wrap").filter({ has: page.getByRole("button", { name: new RegExp(`^Обед ${width},`) }) });
  if (width === 1440) {
    await page.locator(".schedule-inspector__empty").waitFor();
    const inspector = await page.locator(".schedule-inspector").boundingBox();
    const grid = await timeline.boundingBox();
    assert(inspector.x >= grid.x + grid.width - 1);
    assert.equal(await timeline.locator(".schedule-day-heading").count(), 0);
    await page.locator(".schedule-inspector .schedule-mini").waitFor();
  }
  await event.locator(".schedule-event").click();
  await page.locator(width === 1440 ? ".schedule-inspector__details" : ".schedule-preview").getByRole("button", { name: "Дублировать", exact: true }).click();
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
    // Use a tall viewport so this busy day has room for the event summary being dragged.
    await page.setViewportSize({ width, height: 1500 });
    const source = page.locator(`.schedule-month__cell[data-date="${today}"] .schedule-event`).filter({ hasText: `Встреча ${width}` });
    const next = new Date(`${today}T12:00:00`); next.setDate(next.getDate() + 1);
    const destination = localDateKey(next);
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    await source.hover();
    await mutation(() => source.dragTo(page.locator(`.schedule-month__cell[data-date="${destination}"]`), { targetPosition: { x: 20, y: 20 } }));
    await page.locator(`.schedule-month__cell[data-date="${destination}"] .schedule-event`).filter({ hasText: `Встреча ${width}` }).waitFor();
    await page.reload();
    await page.locator(`.schedule-month__cell[data-date="${destination}"] .schedule-event`).filter({ hasText: `Встреча ${width}` }).waitFor();
    await page.setViewportSize({ width, height: 1000 });
    // Search finds the moved event even while viewing a different month.
    await page.getByRole("button", { name: "Следующий период", exact: true }).click();
    await searchCalendar(page, `Встреча ${width}`);
    await page.locator(".schedule-search-results .schedule-agenda__task").filter({ hasText: `Встреча ${width}` }).waitFor();
    await page.getByRole("button", { name: "Закрыть поиск", exact: true }).click();
    await page.getByRole("button", { name: "Сегодня", exact: true }).click();
  }
  await page.getByRole("tab", { name: "Месяц", exact: true }).click();
  await page.locator(".schedule-month__grid").waitFor();
  await page.screenshot({ path: `/tmp/rollapp-macos-month-${width}.png`, fullPage: true });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  if (width === 1440) {
    // Match the supplied desktop references without changing any calendar data.
    await page.setViewportSize({ width: 2048, height: 1330 });
    await page.getByRole("button", { name: "Показать боковую панель", exact: true }).click();
    const sidebar = page.locator(".schedule-sidebar");
    await sidebar.getByLabel("Дата перехода", { exact: true }).fill("2026-11-05");
    for (const checkbox of await sidebar.getByRole("checkbox").all()) if (await checkbox.isChecked()) await checkbox.click();
    await page.getByRole("button", { name: "Скрыть боковую панель", exact: true }).click();
    for (const [view, name, selector] of [["year", "Год", ".schedule-year"], ["month", "Месяц", ".schedule-month__grid"], ["week", "Неделя", ".schedule-timegrid--week"], ["day", "День", ".schedule-inspector"]]) {
      await page.getByRole("tab", { name, exact: true }).click();
      await page.locator(selector).waitFor();
      if (view === "day") {
        const mini = await page.locator(".schedule-inspector__top .schedule-mini").boundingBox();
        const nav = await page.locator(".schedule-inspector__top .schedule-navigation").boundingBox();
        assert(Math.abs(mini.y - nav.y) < 2);
      }
      await page.locator(".schedule").screenshot({ path: `/tmp/rollapp-reference-${view}.png`, animations: "disabled" });
    }
    await page.setViewportSize({ width, height: 1000 });
  }
}
