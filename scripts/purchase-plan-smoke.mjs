import assert from "node:assert/strict";
import { createServer } from "vite";
import { chromium } from "playwright-core";
import { browserLaunchOptions } from "./browser-runtime.mjs";
import { listenSmokeServer, smokeOrigin, smokePort } from "./smoke-server.mjs";

const server = await createServer({
  cacheDir: "node_modules/.vite-purchase-plan",
  server: { host: "127.0.0.1", port: smokePort(), strictPort: true, hmr: false, watch: null },
  plugins: [{ name: "purchase-plan-fixture", enforce: "pre", configureServer(vite) {
    vite.middlewares.use(async (req, res, next) => {
      if (!req.url.startsWith("/__purchase-plan")) return next();
      res.setHeader("Content-Type", "text/html");
      res.end(await vite.transformIndexHtml(req.url, '<!doctype html><html class="dark"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/scripts/fixtures/purchase-plan.jsx"></script></body></html>'));
    });
  } }],
});
await listenSmokeServer(server);
const origin = smokeOrigin(server);
const browser = await chromium.launch(browserLaunchOptions());

try {
  for (const [width, height] of [[320, 844], [390, 844], [390, 400], [768, 844], [820, 844], [1024, 844], [1440, 844], [1920, 844]]) {
    const page = await browser.newPage({ viewport: { width, height } });
    page.setDefaultTimeout(12000);
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/api/**", (route) => { errors.push(`Unexpected API request: ${route.request().method()}`); return route.abort(); });
    await page.clock.setFixedTime(new Date("2026-12-01T12:00:00Z"));
    await page.goto(`${origin}/__purchase-plan`);
    const form = page.getByRole("heading", { name: "Запланировать покупку", exact: true });
    const budget = page.getByRole("textbox", { name: "Бюджет, ₽" });
    const save = page.getByRole("button", { name: "Сохранить", exact: true });
    const open = async () => {
      await page.getByRole("button", { name: "Опции желания «Очки для плавания»" }).click();
      await page.getByRole("menuitem", { name: "Запланировать покупку", exact: true }).click();
      await budget.waitFor();
    };
    const choose = async (date) => {
      await page.getByRole("button", { name: /^Дата пересмотра:/ }).click();
      const day = page.locator(`button[data-day="${date}"]`);
      await day.click();
      await day.waitFor({ state: "hidden" });
      await page.getByRole("button", { name: `Дата пересмотра: ${date}` }).waitFor();
    };
    await page.getByRole("button", { name: "Опции желания «Желание друга»" }).click();
    await page.getByRole("menu").waitFor();
    assert.equal(await page.getByRole("menuitem", { name: "Запланировать покупку" }).count(), 0);
    await page.keyboard.press("Escape");
    await page.getByRole("menu").waitFor({ state: "hidden" });

    await open();
    assert.equal(await save.isEnabled(), false);
    await budget.fill("3450,50");
    if (width < 768) {
      await page.getByRole("button", { name: /^Дата пересмотра:/ }).click();
      await page.locator('[data-mobile-form-page]:visible').getByRole("heading", { name: "Дата пересмотра", exact: true }).waitFor();
      await page.goBack();
      await budget.waitFor();
      assert.equal(await budget.inputValue(), "3450,50");
      assert.equal(await save.isEnabled(), false);
    }
    await choose("03.12.2026");
    await page.evaluate(() => document.fonts.ready);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    const bounds = await save.evaluate((button) => {
      const rect = button.getBoundingClientRect();
      const style = getComputedStyle(button);
      return { height: rect.height, bottom: rect.bottom, radius: parseFloat(style.borderTopLeftRadius), font: style.fontSize };
    });
    assert.equal(bounds.height, 48);
    assert.equal(bounds.radius, 24);
    assert.equal(bounds.font, "18px");
    assert(bounds.bottom <= height);
    if (width < 768) {
      assert.equal(await page.locator('[data-native-form-actions] button').count(), 2);
      await page.evaluate(() => scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" }));
      const hint = await page.getByText("Появится в основном списке To Do.", { exact: true }).boundingBox();
      const footer = await save.boundingBox();
      assert(hint.y + hint.height <= footer.y, "Form content must scroll above the actions");
    }
    await page.screenshot({ path: `/tmp/rollapp-purchase-plan-${width}-${height}.png` });

    await save.click();
    await page.getByText("Проверьте соединение и повторите", { exact: true }).waitFor();
    assert.equal(await budget.inputValue(), "3450,50");
    await save.click();
    await form.waitFor({ state: "hidden" });
    await page.getByText("Покупка в To Do на 03.12.2026", { exact: true }).waitFor();
    await page.getByRole("link", { name: "Открыть To Do" }).click();
    const task = page.getByRole("button", { name: "Пересмотреть покупку: Очки для плавания", exact: true });
    await task.waitFor();
    assert.match(await task.textContent(), /Бюджет 3\s450,50\s₽/);
    if (width < 768) await page.getByRole("button", { name: "Предыдущий день" }).click();
    else await page.locator('.daily-todo__day[aria-pressed="true"]').press("ArrowLeft");
    await task.waitFor({ state: "hidden" });

    await page.getByRole("link", { name: "Мои желания" }).click();
    await open();
    assert.equal(await budget.inputValue(), "3450,50");
    await page.getByRole("button", { name: "Дата пересмотра: 03.12.2026" }).waitFor();
    if (width < 768) await page.goBack();
    else await page.keyboard.press("Escape");
    await form.waitFor({ state: "hidden" });
    assert.equal(await page.getByLabel("Попытки сохранения").textContent(), "2");

    await page.getByRole("link", { name: "Открыть To Do" }).click();
    const review = page.getByRole("heading", { name: "Очки для плавания", exact: true });
    const bought = page.getByRole("button", { name: "Купил", exact: true });
    const more = page.getByRole("button", { name: "Другие действия с покупкой", exact: true });
    const confirm = page.getByRole("button", { name: "Подтвердить покупку", exact: true });
    const closeReview = async () => {
      if (width < 768) await page.goBack();
      else await page.keyboard.press("Escape");
      await review.waitFor({ state: "hidden" });
    };
    const chooseDecision = async (name) => {
      await more.click();
      await page.getByRole("menuitem", { name, exact: true }).click();
    };
    await task.click();
    await bought.waitFor();
    const offers = page.getByRole("region", { name: "Предложения" });
    assert.equal(await offers.locator('a[href="https://www.ozon.ru/product/goggles-123/"]').count(), 1);
    await page.getByText(/Бюджет 3\s450,50\s₽ · 03.12.2026/).waitFor();
    if (width < 768) {
      const actionRow = page.locator('[data-native-form-actions] button');
      assert.equal(await actionRow.count(), 3);
      const boxes = await actionRow.evaluateAll((buttons) => buttons.map((button) => {
        const rect = button.getBoundingClientRect();
        return { x: rect.x, y: rect.y, width: rect.width, bottom: rect.bottom, height: rect.height, radius: getComputedStyle(button).borderTopLeftRadius };
      }));
      assert(boxes.every(({ y, height: boxHeight, radius, bottom }) => y === boxes[0].y && boxHeight === 48 && radius === "24px" && bottom <= height));
      assert.equal(boxes[0].width, 48);
      assert.equal(boxes[2].width, 48);
      assert.equal(boxes[1].x - boxes[0].x - boxes[0].width, 8);
      assert.equal(boxes[2].x - boxes[1].x - boxes[1].width, 8);
    }
    await page.screenshot({ path: `/tmp/rollapp-purchase-review-${width}-${height}.png` });
    await closeReview();
    assert.equal(new URL(page.url()).searchParams.get("date"), "2026-12-03");
    await task.click();
    await chooseDecision("Перенести");
    const newDate = page.getByRole("button", { name: /^Новая дата пересмотра:/ });
    const saveDate = page.getByRole("button", { name: "Сохранить дату" });
    assert.equal(await saveDate.isEnabled(), false);
    await newDate.click();
    const nextDay = page.locator('button[data-day="04.12.2026"]');
    await nextDay.click();
    await nextDay.waitFor({ state: "hidden" });
    await saveDate.click();
    await review.waitFor({ state: "hidden" });
    await task.waitFor({ state: "hidden" });
    if (width < 768) await page.getByRole("button", { name: "Следующий день" }).click();
    else await page.locator('.daily-todo__day[aria-pressed="true"]').press("ArrowRight");
    await task.waitFor();
    await task.click();
    await chooseDecision("Отказаться");
    await page.getByRole("button", { name: "Подтвердить отказ" }).click();
    await task.filter({ hasText: "Отказ от покупки" }).waitFor();
    await task.click();
    await page.getByText("Отказ от покупки", { exact: true }).waitFor();
    assert.equal(await bought.count(), 0);
    await closeReview();

    await page.getByRole("link", { name: "Мои желания" }).click();
    await open();
    await save.click();
    await form.waitFor({ state: "hidden" });
    await page.getByRole("link", { name: "Открыть To Do" }).click();
    await task.click();
    await bought.click();
    const spent = page.getByRole("textbox", { name: "Фактическая сумма, ₽" });
    await spent.fill("3100,55");
    await confirm.click();
    await page.getByText("Не удалось записать покупку", { exact: true }).waitFor();
    assert.equal(await spent.inputValue(), "3100,55");
    await confirm.click();
    await task.filter({ hasText: "Куплено" }).waitFor();
    await task.click();
    await page.getByText(/Куплено · 3\s100,55\s₽/).waitFor();
    assert.equal(await bought.count(), 0);
    await closeReview();

    await page.clock.setFixedTime(new Date("2026-12-03T12:00:00Z"));
    await page.goto(`${origin}/__purchase-plan?todo&replenishment&date=2026-12-03`);
    await task.click();
    await bought.click();
    const schedule = page.getByRole("switch", { name: "Регулярная покупка" });
    const interval = page.getByRole("spinbutton", { name: "Интервал пополнения, дней" });
    await schedule.click();
    assert.equal(await interval.inputValue(), "30");
    await interval.fill("366");
    assert.equal(await confirm.isEnabled(), false);
    await interval.fill("14");
    const hint = page.getByText("Следующее пополнение 17.12.2026", { exact: true });
    await hint.waitFor();
    await hint.scrollIntoViewIfNeeded();
    const formGeometry = await hint.evaluate((element) => {
      const scroller = element.closest(".app-drawer-body");
      const footer = document.querySelector('[data-native-form-actions]') || element.closest("form").querySelector('[data-slot="drawer-footer"]');
      return document.documentElement.scrollWidth <= innerWidth + 1 && scroller.scrollWidth <= scroller.clientWidth + 1
        && element.getBoundingClientRect().bottom <= footer.getBoundingClientRect().top;
    });
    assert(formGeometry, "Interval field and preview must fit above the action row");
    const labelFits = (button) => button.evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      const label = [...element.querySelectorAll("span")].find((span) => span.getClientRects().length > 0);
      const textBounds = label.getBoundingClientRect();
      return textBounds.left >= bounds.left + 4 && textBounds.right <= bounds.right - 4;
    });
    assert(await labelFits(confirm), "Purchase confirmation label must fit inside its button");
    await page.screenshot({ path: `/tmp/rollapp-replenishment-${width}-${height}.png` });
    await confirm.click();
    await task.waitFor({ state: "hidden" });
    const openNext = async (date, title) => {
      await page.getByRole("link", { name: "Мои желания" }).click();
      await page.getByRole("link", { name: "Открыть To Do" }).click();
      assert.equal(new URL(page.url()).searchParams.get("date"), date);
      await page.getByRole("button", { name: `Пополнить запас: ${title}` }).click();
    };
    await openNext("2026-12-17", "Очки для плавания");
    await chooseDecision("Пропустить");
    await page.getByText("Следующее пополнение появится в To Do 31.12.2026.").waitFor();
    const skip = page.getByRole("button", { name: "Пропустить пополнение", exact: true });
    assert(await labelFits(skip), "Skip label must fit inside its button");
    await skip.click();
    await page.getByRole("heading", { name: "Очки для плавания", exact: true }).waitFor({ state: "hidden" });
    await openNext("2026-12-31", "Очки для плавания");
    await chooseDecision("Заменить");
    await page.getByRole("combobox", { name: "Товар из «Моих желаний»" }).click();
    assert.equal(await page.getByRole("option", { name: "Товар в евро" }).count(), 0);
    await page.getByRole("option", { name: "Фильтр для воды" }).click();
    const replace = page.getByRole("button", { name: "Заменить товар", exact: true });
    assert(await labelFits(replace), "Replace label must fit inside its button");
    await replace.click();
    await page.getByRole("heading", { name: "Фильтр для воды" }).waitFor();
    await offers.locator('a[href="https://www.ozon.ru/product/filter-321/"]').waitFor();
    assert.equal(new URL(page.url()).searchParams.get("date"), "2026-12-31");
    await page.clock.setFixedTime(new Date("2026-12-31T12:00:00Z"));
    await page.getByRole("button", { name: "Повторить", exact: true }).click();
    assert.equal(await interval.inputValue(), "14");
    await page.getByText("Следующее пополнение 14.01.2027", { exact: true }).waitFor();
    await confirm.click();
    await page.getByRole("heading", { name: "Фильтр для воды" }).waitFor({ state: "hidden" });
    await openNext("2027-01-14", "Фильтр для воды");

    await page.clock.setFixedTime(new Date("2026-12-03T12:00:00Z"));
    await page.goto(`${origin}/__purchase-plan?summary&finance=purchases${width === 320 ? "&month-error" : ""}`);
    const summary = page.getByRole("region", { name: "Покупки", exact: true });
    const totals = summary.getByLabel("Бюджет на месяц по валютам");
    const openWishes = async () => {
      await page.getByRole("link", { name: "Открыть Мои желания", exact: true }).click();
      await page.getByRole("button", { name: "Опции желания «Шапочка»" }).waitFor();
      assert.equal(await summary.count(), 0, "The Wishlist must not display the purchases panel");
    };
    const openFinance = async () => {
      await page.getByRole("link", { name: "К покупкам", exact: true }).click();
      await summary.waitFor();
    };
    await summary.getByRole("heading", { name: "Бюджет на декабрь 2026" }).waitFor();
    if (width === 320) {
      await summary.getByText("Не удалось загрузить бюджет и траты.").waitFor();
      await summary.getByRole("button", { name: "Повторить загрузку бюджета" }).click();
    }
    const currency = (code) => totals.getByRole("listitem").filter({ has: page.getByRole("heading", { name: code, exact: true }) });
    const planned = (code) => currency(code).locator("dd").first();
    const spentThisMonth = (code) => currency(code).locator("dd").last();
    await planned("RUB").getByText(/4\s410,60\s₽/).waitFor();
    assert.match(await spentThisMonth("RUB").textContent(), /1\s250\s₽/);
    await currency("RUB").getByText(/Осталось 3\s160,60\s₽/).waitFor();
    assert.match(await planned("EUR").textContent(), /100\s€/);
    assert.match(await spentThisMonth("EUR").textContent(), /120\s€/);
    await currency("EUR").getByText(/Перерасход 20\s€/).waitFor();
    await currency("GBP").getByText("Не указано", { exact: true }).waitFor();
    await currency("GBP").getByText("Сравнение неполное", { exact: true }).waitFor();
    await currency("CAD").getByText("1 без сохранённого бюджета", { exact: true }).waitFor();
    assert.equal(await currency("USD").count(), 0);
    const monthNavigation = summary.getByRole("group", { name: "Месяц бюджета" });
    const previousMonth = monthNavigation.getByRole("button", { name: "Предыдущий месяц" });
    const nextMonth = monthNavigation.getByRole("button", { name: "Следующий месяц" });
    assert.equal(await nextMonth.isDisabled(), true);
    assert.deepEqual(await monthNavigation.getByRole("button").evaluateAll((buttons) => buttons.map((button) => {
      const { width, height } = button.getBoundingClientRect();
      return [width, height, getComputedStyle(button).borderTopLeftRadius];
    })), [[48, 48, "24px"], [48, 48, "24px"]]);
    await previousMonth.focus();
    await page.keyboard.press("Enter");
    await summary.getByRole("heading", { name: "Бюджет на ноябрь 2026" }).waitFor();
    assert.equal(await previousMonth.evaluate((button) => document.activeElement === button), true);
    await spentThisMonth("RUB").getByText(/^От 1\s000\s₽$/).waitFor();
    await currency("RUB").getByText(/^Перерасход от 40\s₽$/).waitFor();
    await planned("EUR").getByText(/^От 99,90\s€$/).waitFor();
    await currency("EUR").getByText("Сравнение неполное", { exact: true }).waitFor();
    assert.equal(await currency("CAD").count(), 0);
    await nextMonth.click();
    await summary.getByRole("heading", { name: "Бюджет на декабрь 2026" }).waitFor();
    await currency("EUR").getByText(/Перерасход 20\s€/).waitFor();
    assert.equal(await nextMonth.isDisabled(), true);
    const planRow = (title) => summary.getByRole("button", { name: `Пересмотреть покупку: ${title}`, exact: true });
    assert.equal(await planRow("Чемодан").count(), 0);
    await summary.getByRole("button", { name: /Ещё 1.*Ближайшие планы/ }).click();
    await planRow("Чемодан").waitFor();
    const geometry = await summary.evaluate((element) => ({
      root: document.documentElement.scrollWidth <= innerWidth + 1,
      card: element.scrollWidth <= element.clientWidth + 1,
      rows: [...element.querySelectorAll('li button')].every((button) => button.scrollWidth <= button.clientWidth + 1 && button.getBoundingClientRect().height >= 48),
      inFinance: Boolean(element.closest(".rolls-page")),
      active: element.closest('[role="tabpanel"]')?.getBoundingClientRect().height > 0,
    }));
    assert.deepEqual(geometry, { root: true, card: true, rows: true, inFinance: true, active: true });
    assert(await totals.evaluate((list) => [...list.children].every((row) => row.scrollWidth <= row.clientWidth + 1)));
    await totals.evaluate((list) => list.scrollIntoView({ block: "start", behavior: "instant" }));
    await page.screenshot({ path: `/tmp/rollapp-monthly-budget-${width}-${height}.png` });
    await summary.evaluate((element) => element.scrollIntoView({ block: "start", behavior: "instant" }));
    await page.screenshot({ path: `/tmp/rollapp-purchase-summary-${width}-${height}.png` });
    const historyToggle = summary.getByRole("button", { name: "История покупок", exact: true });
    const historyList = summary.getByRole("list", { name: "Подтверждённые покупки" });
    assert.equal(await historyToggle.getAttribute("aria-expanded"), "false");
    await historyToggle.click();
    await summary.getByText("Не удалось загрузить историю покупок.").waitFor();
    await summary.getByRole("button", { name: "Повторить", exact: true }).click();
    await historyList.getByText(/На 250\s₽ дороже/).waitFor();
    assert.equal(await historyList.locator("time").first().getAttribute("datetime"), "2026-12-02");
    assert.equal(await historyList.getByRole("listitem").count(), 3);
    await summary.getByRole("button", { name: "Ещё покупки" }).click();
    await historyList.getByText(/На 50\s₽ дешевле/).waitFor();
    await historyList.getByText("Сумма без изменений").waitFor();
    await historyList.getByText("Дата не сохранена").waitFor();
    await historyList.getByRole("listitem").filter({ hasText: "Старая покупка" }).getByText("Сумма не указана").waitFor();
    assert.equal(await historyList.getByRole("listitem").count(), 8);
    assert(await historyList.evaluate((list) => document.documentElement.scrollWidth <= innerWidth + 1 && list.scrollWidth <= list.clientWidth + 1));
    await historyList.evaluate((list) => list.scrollIntoView({ block: "start", behavior: "instant" }));
    await page.screenshot({ path: `/tmp/rollapp-purchase-history-${width}-${height}.png` });
    if (!(width === 390 && height === 844 || width === 1440)) {
      await historyToggle.click();
      await historyList.waitFor({ state: "hidden" });
    }
    await planRow("Очки для плавания").click();
    await bought.waitFor();
    assert.equal(await offers.locator('a[href="https://www.ozon.ru/product/goggles-123/"]').count(), 1);
    await chooseDecision("Перенести");
    await newDate.click();
    const later = page.locator('button[data-day="05.12.2026"]');
    await later.click();
    await later.waitFor({ state: "hidden" });
    await saveDate.click();
    await summary.waitFor();
    assert.equal(await planRow("Очки для плавания").locator("time").getAttribute("datetime"), "2026-12-05");
    await planRow("Книга").click();
    await chooseDecision("Отказаться");
    await page.getByRole("button", { name: "Подтвердить отказ" }).click();
    await planRow("Книга").waitFor({ state: "hidden" });
    await currency("EUR").getByText(/Перерасход 70\s€/).waitFor();
    assert.match(await planned("EUR").textContent(), /50\s€/);
    assert.match(await spentThisMonth("EUR").textContent(), /120\s€/);

    if (width === 390 && height === 844 || width === 1440) {
      await openWishes();
      await page.getByRole("button", { name: "Опции желания «Шапочка»" }).click();
      await page.getByRole("menuitem", { name: "Запланировать покупку", exact: true }).click();
      await budget.fill("900");
      const priceSwitch = page.getByRole("switch", { name: "Сообщить, когда цена с доставкой уложится в бюджет" });
      await priceSwitch.click();
      await page.getByRole("combobox", { name: "Страна доставки" }).waitFor();
      await choose("03.12.2026");
      await save.click();
      await budget.waitFor({ state: "hidden" });
      await openFinance();
      await planRow("Шапочка").waitFor();
      await planned("RUB").getByText(/5\s310,60\s₽/).waitFor();
      await planRow("Шапочка").click();
      const priceStatus = page.getByRole("region", { name: "Отслеживание цены" });
      await priceStatus.getByText("Ожидается первая проверка цены").waitFor();
      await priceStatus.getByRole("button", { name: "Проверить цену" }).click();
      const verifyNotice = async (notice) => {
        await notice.getByText(/750\s₽.*с доставкой.*www.ozon.ru/).waitFor();
        assert.equal(await notice.locator("time").getAttribute("datetime"), "2026-12-03T12:00:00.000Z");
      };
      await verifyNotice(priceStatus.locator("[data-purchase-price-notice]"));
      await page.screenshot({ path: `/tmp/rollapp-purchase-price-${width}-${height}.png` });
      if (width < 768) await page.goBack();
      else await page.keyboard.press("Escape");
      await priceStatus.waitFor({ state: "hidden" });
      const priceNotice = summary.getByRole("region", { name: "Уведомления о цене" });
      await verifyNotice(priceNotice.locator("[data-purchase-price-notice]"));
      await priceNotice.getByRole("button", { name: "Пересмотреть предложение: Шапочка" }).click();
      await verifyNotice(priceStatus.locator("[data-purchase-price-notice]"));
      await bought.click();
      await spent.fill("875,55");
      await schedule.click();
      await interval.fill("14");
      await confirm.click();
      await planRow("Шапочка").locator('time[datetime="2026-12-17"]').waitFor();
      await planned("RUB").getByText(/6\s210,60\s₽/).waitFor();
      assert.match(await spentThisMonth("RUB").textContent(), /2\s125,55\s₽/);
      await historyToggle.click();
      const newest = historyList.getByRole("listitem").first();
      await newest.getByText("Шапочка", { exact: true }).waitFor();
      await newest.getByText(/875,55\s₽/).waitFor();
      assert.equal(await newest.locator("time").getAttribute("datetime"), "2026-12-03");
      await page.clock.setFixedTime(new Date("2027-01-01T12:00:00Z"));
      await page.evaluate(() => window.dispatchEvent(new Event("focus")));
      await summary.getByRole("heading", { name: "Бюджет на январь 2027" }).waitFor();
      await planned("USD").getByText(/120\s?\$/).waitFor();
      assert.equal(await currency("RUB").count(), 0);
      await previousMonth.click();
      await summary.getByRole("heading", { name: "Бюджет на декабрь 2026" }).waitFor();
      await spentThisMonth("RUB").getByText(/2\s125,55\s₽/).waitFor();
      assert.equal(await currency("USD").count(), 0);
      await nextMonth.click();
      await summary.getByRole("heading", { name: "Бюджет на январь 2027" }).waitFor();
      await planned("USD").getByText(/120\s?\$/).waitFor();
      await page.clock.setFixedTime(new Date("2026-12-03T12:00:00Z"));
      await page.goto(`${origin}/__purchase-plan?summary&finance=purchases&empty`);
      await summary.getByText("Запланируйте покупку из меню желания.").waitFor();
      await summary.getByText("На этот месяц пока нет планов и покупок.").waitFor();
      await historyToggle.click();
      await summary.getByText("Подтверждённые покупки появятся здесь.").waitFor();
    }
    await page.clock.setFixedTime(new Date("2026-12-03T12:00:00Z"));
    await page.goto(`${origin}/__purchase-plan?summary&finance=purchases`);
    await page.getByRole("button", { name: "Настроить лимит", exact: true }).click();
    const limitInput = page.getByRole("textbox", { name: "Сумма лимита", exact: true });
    await limitInput.fill("5500");
    await save.click();
    await page.getByRole("list", { name: "Лимиты месяца" }).getByText(/Свободно 839,40\s₽/).waitFor();
    await openWishes();
    await page.locator("[data-add-fab] button").click();
    await page.getByRole("menuitem", { name: "Новая потребность", exact: true }).click();
    const needForm = page.getByRole("heading", { name: "Новая потребность", exact: true });
    await needForm.waitFor();
    await page.getByRole("textbox", { name: "Что нужно" }).fill("Фильтр для кувшина");
    await page.getByRole("textbox", { name: "Требования к товару" }).fill("Модель А, объём 2 литра");
    await page.getByRole("textbox", { name: "Бюджет с доставкой" }).fill("1500");
    await page.getByRole("textbox", { name: "Уже отложили" }).fill("500");
    const chooseNeedDate = async (label, date) => {
      await page.getByRole("button", { name: new RegExp(`^${label}:`) }).click();
      const day = page.locator(`button[data-day="${date}"]`);
      await day.click();
      await day.waitFor({ state: "hidden" });
    };
    await chooseNeedDate("Дата пересмотра в To Do", "03.12.2026");
    await chooseNeedDate("Получить к дате", "04.12.2026");
    await page.getByText(/Превышение лимита 660,60\s₽ с учётом этой покупки/).waitFor();
    const addVariant = async (name) => {
      await page.getByRole("combobox", { name: "Варианты из «Моих желаний»" }).click();
      await page.getByRole("option", { name, exact: true }).click();
    };
    await addVariant("Фильтр");
    await addVariant("Шапочка");
    await save.click();
    await needForm.waitFor({ state: "hidden" });
    await openFinance();
    const needRow = planRow("Фильтр для кувшина");
    await needRow.waitFor();
    const forecast = summary.getByRole("region", { name: "Деньги на 30 дней", exact: true });
    await forecast.getByText(/^500\s₽$/).waitFor();
    await forecast.getByRole("button", { name: "Показать планы на 30 дней", exact: true }).click();
    await forecast.getByRole("button", { name: "Открыть из прогноза: Фильтр для кувшина" }).getByText(/отложено 500\s₽/).waitFor();
    await forecast.getByRole("button", { name: "Скрыть планы", exact: true }).click();
    await page.getByRole("button", { name: "Изменить потребность: Фильтр для кувшина" }).click();
    const criteria = page.getByRole("textbox", { name: "Требования к товару" });
    await criteria.fill("Модель А, объём 3 литра");
    await page.getByText(/Превышение лимита 660,60\s₽ с учётом этой покупки/).waitFor();
    await save.click();
    await criteria.waitFor({ state: "hidden" });

    await page.getByRole("button", { name: "Пригласить к покупке: Фильтр для кувшина", exact: true }).click();
    const invite = page.getByRole("button", { name: "Пригласить", exact: true });
    await page.getByRole("textbox", { name: "Имя пользователя", exact: true }).fill("member");
    await invite.click();
    const invited = page.getByRole("list", { name: "Приглашённые участники", exact: true });
    await invited.getByText("@member", { exact: true }).waitFor();
    await page.getByRole("combobox", { name: "Кого пригласить", exact: true }).click();
    await page.getByRole("option", { name: "Продавец", exact: true }).click();
    await page.getByRole("textbox", { name: "Имя бизнес-аккаунта", exact: true }).fill("seller");
    await page.getByRole("textbox", { name: "Город доставки", exact: true }).fill("Москва");
    await invite.click();
    await invited.getByText("@seller", { exact: true }).waitFor();
    const closeCollaboration = async () => {
      if (width < 768) await page.getByRole("button", { name: "Назад", exact: true }).click();
      else await page.getByRole("button", { name: "Закрыть", exact: true }).click();
    };
    await closeCollaboration();
    const collaborationRow = page.getByRole("button", { name: "Общая покупка: Фильтр для кувшина", exact: true });
    await page.getByRole("link", { name: "Сеанс участника", exact: true }).click();
    await collaborationRow.click();
    await page.getByRole("button", { name: "Взять покупку", exact: true }).click();
    await page.getByRole("textbox", { name: "Готов внести, RUB", exact: true }).fill("200");
    await page.getByRole("button", { name: "Сохранить долю", exact: true }).click();
    await page.getByText(/Участники готовы внести 200\s₽/).waitFor();
    await page.getByRole("button", { name: "Сообщить, что куплено", exact: true }).click();
    await page.getByText("Участник сообщил о покупке", { exact: true }).waitFor();
    await closeCollaboration();
    await page.getByRole("link", { name: "Сеанс продавца", exact: true }).click();
    await collaborationRow.click();
    await page.getByText("Город доставки: Москва", { exact: true }).waitFor();
    const sellerSurface = width < 768 ? page.locator("[data-mobile-form-page]:visible") : page.getByRole("dialog");
    assert.equal(await sellerSurface.getByText(/^Бюджет /).count(), 0);
    await page.getByRole("textbox", { name: "Товар", exact: true }).fill("Фильтр от продавца");
    await page.getByRole("textbox", { name: "Ссылка на товар", exact: true }).fill("https://example.test/filter");
    await chooseNeedDate("Дата доставки", "04.12.2026");
    await page.getByRole("textbox", { name: "Итого с доставкой, RUB", exact: true }).fill("1300");
    await page.getByRole("button", { name: "Сохранить предложение", exact: true }).click();
    await page.getByText("Предложение сохранено", { exact: true }).waitFor();
    await closeCollaboration();
    await page.getByRole("link", { name: "Сеанс владельца", exact: true }).click();
    await collaborationRow.click();
    const replies = page.getByRole("region", { name: "Ответы продавцов", exact: true });
    await replies.getByText("Фильтр от продавца", { exact: true }).waitFor();
    await replies.getByText("К нужной дате", { exact: true }).waitFor();
    await replies.getByText("В бюджете", { exact: true }).waitFor();
    await page.getByRole("button", { name: "К пересмотру покупки", exact: true }).waitFor();
    assert(await replies.evaluate((node) => node.scrollWidth <= node.clientWidth + 1 && document.documentElement.scrollWidth <= innerWidth + 1));
    await replies.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `/tmp/rollapp-purchase-collaboration-${width}-${height}.png` });
    await closeCollaboration();
    await page.getByRole("link", { name: "Открыть задачи потребностей" }).click();
    const needTask = page.getByRole("button", { name: "Пересмотреть покупку: Фильтр для кувшина", exact: true });
    await needTask.waitFor();
    assert.equal(await needTask.count(), 1);
    await needTask.click();
    await page.getByText("Модель А, объём 3 литра", { exact: true }).waitFor();
    await page.getByRole("button", { name: "Проверить цены и доставку" }).click();
    const options = page.getByRole("region", { name: "Варианты покупки" });
    await options.getByText("К нужной дате", { exact: true }).waitFor();
    await options.getByText("Позже нужной даты", { exact: true }).waitFor();
    assert.match(await options.getByRole("listitem").first().textContent(), /В бюджете/);
    assert(await options.evaluate((element) => document.documentElement.scrollWidth <= innerWidth + 1 && element.scrollWidth <= element.clientWidth + 1));
    await options.getByText("К нужной дате", { exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: `/tmp/rollapp-purchase-need-${width}-${height}.png` });
    await options.getByRole("button", { name: "Выбрать Фильтр", exact: true }).click();
    await bought.click();
    await spent.fill("1000");
    await page.getByRole("combobox", { name: "Товар подошёл?" }).click();
    await page.getByRole("option", { name: "Да, запомнить вариант" }).click();
    await confirm.click();
    await needTask.waitFor({ state: "hidden" });
    await page.getByRole("link", { name: "К покупкам" }).click();
    await historyToggle.click();
    const historyError = summary.getByText("Не удалось загрузить историю покупок.");
    await historyError.or(historyList).waitFor();
    if (await historyError.isVisible()) {
      await summary.getByRole("button", { name: "Повторить", exact: true }).click();
    }
    await historyList.getByText("Потребность · Фильтр для кувшина", { exact: true }).waitFor();
    await historyList.getByText("Подошёл", { exact: true }).waitFor();

    await openWishes();
    await page.locator("[data-add-fab] button").click();
    await page.getByRole("menuitem", { name: "Новая подписка", exact: true }).click();
    const newSubscription = page.getByRole("heading", { name: "Новая подписка", exact: true });
    await newSubscription.waitFor();
    await page.getByRole("textbox", { name: "Сервис", exact: true }).fill("Видеосервис");
    await page.getByRole("textbox", { name: "Ожидаемая сумма" }).fill("500");
    await chooseNeedDate("Дата списания", "06.12.2026");
    await page.getByRole("switch", { name: "Первое списание после пробного периода" }).click();
    const manageLink = page.getByRole("textbox", { name: "Ссылка на управление" });
    await manageLink.fill("https://example.test/manage");
    assert.deepEqual(await save.evaluate((button) => [button.getBoundingClientRect().height, getComputedStyle(button).borderTopLeftRadius]), [48, "24px"]);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    if (width < 768) {
      await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" }));
      const lastHint = await page.getByText("Необязательно. Например, страница подписки в сервисе.", { exact: true }).boundingBox();
      const footer = await save.boundingBox();
      assert(lastHint.y + lastHint.height <= footer.y, "The last subscription field must scroll above the action bar");
    }
    await page.screenshot({ path: `/tmp/rollapp-subscription-create-${width}-${height}.png` });
    await save.click();
    await newSubscription.waitFor({ state: "hidden" });
    await openFinance();
    const subscriptionRow = summary.getByRole("button", { name: "Открыть подписку: Видеосервис" });
    await subscriptionRow.getByText(/Первое списание.*500\s₽/).waitFor();
    await page.getByRole("link", { name: "Открыть основной To Do" }).click();
    const subscriptionTask = page.getByRole("button", { name: "Пересмотреть подписку: Видеосервис", exact: true });
    await subscriptionTask.getByText(/Первое списание.*500\s₽/).waitFor();
    await subscriptionTask.click();
    const service = page.getByRole("heading", { name: "Видеосервис", exact: true });
    await service.waitFor();
    assert.equal(await page.getByRole("link", { name: "Открыть сервис" }).getAttribute("href"), "https://example.test/manage");
    const recordCharge = page.getByRole("button", { name: "Записать списание", exact: true });
    assert(await recordCharge.evaluate((button) => {
      const style = getComputedStyle(button);
      return style.color !== style.backgroundColor && button.getBoundingClientRect().height >= 48;
    }));
    await page.screenshot({ path: `/tmp/rollapp-subscription-review-${width}-${height}.png` });
    await recordCharge.click();
    await page.getByRole("textbox", { name: "Списали, RUB" }).fill("600,50");
    await page.getByRole("button", { name: "Сохранить списание", exact: true }).click();
    await subscriptionTask.waitFor({ state: "hidden" });
    await page.getByRole("link", { name: "К покупкам" }).click();
    await subscriptionRow.getByText(/Списание 6 янв\..*500\s₽/).waitFor();
    await spentThisMonth("RUB").getByText(/2\s850,50\s₽/).waitFor();
    await historyToggle.click();
    await historyList.getByRole("listitem").filter({ hasText: "Видеосервис" }).getByText(/600,50\s₽/).waitFor();
    await subscriptionRow.click();
    await page.getByRole("button", { name: "Пропустить период", exact: true }).click();
    await service.waitFor({ state: "hidden" });
    await subscriptionRow.getByText(/Списание 6 февр?\./).waitFor();
    await subscriptionRow.click();
    await page.getByRole("button", { name: "Остановить напоминания" }).click();
    await page.getByRole("button", { name: "Остановить", exact: true }).click();
    await subscriptionRow.waitFor({ state: "hidden" });
    assert.equal(await historyList.getByRole("listitem").filter({ hasText: "Видеосервис" }).count(), 1);

    await historyList.getByRole("button", { name: "Открыть покупку: Фильтр", exact: true }).click();
    const careTitle = page.getByRole("heading", { name: "Фильтр", exact: true, level: width < 768 ? 1 : 2 });
    await careTitle.waitFor();
    const receiptInput = page.getByLabel("Выбрать файл чека", { exact: true });
    await receiptInput.setInputFiles({ name: "Кассовый чек.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\n%%EOF\n") });
    await page.getByRole("button", { name: "Загрузить чек", exact: true }).click();
    const receiptLink = page.getByRole("link", { name: "Скачать чек", exact: true });
    assert.equal(await receiptLink.getAttribute("href"), "/api/dashboard/purchase-history/need-purchase/receipt");
    assert.equal(await receiptLink.getAttribute("download"), "Кассовый чек.pdf");
    await chooseNeedDate("Гарантия до", "22.12.2026");
    await page.getByRole("button", { name: "Напомнить о гарантии: 08.12.2026", exact: true }).waitFor();
    await chooseNeedDate("Следующее обслуживание", "03.12.2026");
    const maintenanceNote = page.getByRole("textbox", { name: "Что нужно сделать", exact: true });
    await maintenanceNote.fill("Промыть корпус и заменить картридж");
    assert.deepEqual(await save.evaluate((button) => [button.getBoundingClientRect().height, getComputedStyle(button).borderTopLeftRadius]), [48, "24px"]);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    if (width < 768) {
      await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" }));
      const noteBounds = await maintenanceNote.boundingBox();
      const footerBounds = await save.boundingBox();
      assert(noteBounds.y + noteBounds.height <= footerBounds.y, "The last care field must scroll above fixed actions");
    }
    await page.screenshot({ path: `/tmp/rollapp-purchase-care-${width}-${height}.png` });
    await save.click();
    await careTitle.waitFor({ state: "hidden" });
    await page.getByRole("link", { name: "Открыть основной To Do" }).click();
    const maintenanceTask = page.getByRole("button", { name: "Обслуживание покупки: Фильтр", exact: true });
    await maintenanceTask.waitFor();
    assert.equal(await maintenanceTask.count(), 1);
    await maintenanceTask.click();
    await receiptLink.waitFor();
    assert.equal(await maintenanceNote.inputValue(), "Промыть корпус и заменить картридж");
    await page.getByRole("button", { name: "Отметить выполненным: Обслуживание покупки", exact: true }).click();
    await page.getByRole("button", { name: "Вернуть в To Do: Обслуживание покупки", exact: true }).waitFor();
    await page.getByRole("button", { name: "Удалить чек", exact: true }).click();
    await page.getByRole("button", { name: "Отмена", exact: true }).click();
    await receiptLink.waitFor();
    await page.getByRole("button", { name: "Удалить чек", exact: true }).click();
    await page.getByRole("button", { name: "Удалить", exact: true }).click();
    await receiptLink.waitFor({ state: "hidden" });
    if (width < 768) await page.getByRole("button", { name: "Назад", exact: true }).click();
    else await page.getByRole("button", { name: "Закрыть", exact: true }).click();
    await careTitle.waitFor({ state: "hidden" });
    assert.equal(await maintenanceTask.locator("..").getAttribute("data-completed"), "true");
    assert.deepEqual(errors, []);
    console.log(`PASS ${width}×${height}: plans, needs, subscriptions, budget, purchase history, private receipt and care in To Do`);
    await page.close();
  }
} finally {
  await browser.close();
  await server.close();
}
