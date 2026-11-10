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
    const mobile = width < 768;
    const editor = page.locator("[data-profile-announcement-editor]");
    const titleInput = editor.getByLabel("Заголовок объявления");
    const bodyInput = editor.getByLabel("Текст объявления");
    const add = page.getByRole("button", { name: "Добавить объявление", exact: true });
    const publish = editor.getByRole("button", { name: "Опубликовать", exact: true });
    const waitForEditor = async name => {
      await editor.getByRole("heading", { name, exact: true }).waitFor();
      if (mobile) {
        await page.waitForFunction(() => new URLSearchParams(location.search).has("formScreen"));
        assert.equal(await editor.locator("xpath=ancestor::main[@data-mobile-form-page]").count(), 1);
        assert.equal(await page.locator("[data-form-page-background]").getAttribute("inert"), "");
      } else {
        assert.equal(await editor.getAttribute("data-swipe-axis"), "x");
        assert.equal(await editor.getAttribute("data-slot"), "drawer-popup");
        assert(!new URL(page.url()).searchParams.has("formScreen"));
      }
    };
    const waitForClose = async () => {
      await editor.waitFor({ state: "hidden" });
      await page.waitForFunction(() => !new URLSearchParams(location.search).has("formScreen"));
    };
    assert.equal(await page.getByLabel("Заголовок объявления").count(), 0);
    await page.getByRole("button", { name: /Редактировать: Открыта запись/ }).click();
    await waitForEditor("Редактировать объявление");
    assert.equal(await titleInput.inputValue(), "Открыта запись на ноябрь");
    await titleInput.fill("Черновик для отмены");
    await editor.getByRole("button", { name: mobile ? "Назад" : "Закрыть форму объявления", exact: true }).click();
    await waitForClose();
    await page.waitForFunction(() => document.activeElement?.getAttribute("aria-label")?.startsWith("Редактировать:"));
    assert.deepEqual(await page.evaluate(() => window.publicationTransport.calls), []);
    await page.getByRole("button", { name: /Редактировать: Открыта запись/ }).click();
    await waitForEditor("Редактировать объявление");
    await titleInput.fill("Обновлённое объявление");
    await bodyInput.fill("Новое время");
    await editor.getByRole("button", { name: "Сохранить", exact: true }).click();
    await waitForClose();
    await page.getByRole("heading", { name: "Обновлённое объявление", exact: true }).waitFor();
    await page.getByRole("button", { name: /Удалить объявление: Обновлённое объявление/ }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Удалить", exact: true }).click();
    await page.getByText("Здесь появятся ваши опубликованные объявления.").waitFor();
    await add.click();
    await waitForEditor("Добавить объявление");
    assert.equal(await publish.isDisabled(), true);
    await titleInput.fill("Черновик для отмены");
    if (mobile) await page.goBack();
    else await page.keyboard.press("Escape");
    await waitForClose();
    await page.waitForFunction(() => document.activeElement?.textContent.trim() === "Добавить объявление");
    assert.equal(await page.evaluate(() => window.publicationTransport.calls.length), 2);

    await add.click();
    await waitForEditor("Добавить объявление");
    assert.equal(await titleInput.inputValue(), "");
    await titleInput.fill("Новая публикация");
    await bodyInput.fill("Даты встреч");
    const actions = await publish.evaluate(node => {
      const footer = node.closest("[data-control-bar]");
      const bounds = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      const background = getComputedStyle(footer).backgroundColor;
      return { owned: node.form?.contains(footer), height: bounds.height, radius: style.borderTopLeftRadius,
        fits: bounds.left >= 0 && bounds.right <= innerWidth && bounds.bottom <= innerHeight,
        native: footer.hasAttribute("data-native-form-actions"), background };
    });
    assert.deepEqual(actions, { owned: true, height: 48, radius: "24px", fits: true, native: mobile, background: "rgba(0, 0, 0, 0)" });
    if (width === 390 && height === 400) {
      await page.evaluate(() => {
        Object.defineProperties(visualViewport, { height: { configurable: true, value: 260 }, offsetTop: { configurable: true, value: 50 } });
        visualViewport.dispatchEvent(new Event("resize"));
      });
      await page.waitForFunction(() => document.documentElement.hasAttribute("data-overlay-keyboard"));
      const back = await editor.getByRole("button", { name: "Назад", exact: true }).boundingBox();
      const submit = await publish.boundingBox();
      assert.equal(back.y, submit.y);
      assert(submit.y >= 50 && submit.y + submit.height <= 310);
      await page.evaluate(() => {
        delete visualViewport.height;
        delete visualViewport.offsetTop;
        visualViewport.dispatchEvent(new Event("resize"));
      });
    }
    if (width === 390 || width === 1440) await page.screenshot({ path: `/tmp/rollapp-profile-announcement-${width}-${height}.png` });
    await page.evaluate(() => { window.publicationTransport.loseNextAnnouncementResponse = true; });
    await titleInput.press("Enter");
    await editor.getByRole("alert").getByText("Ответ сервера потерян").waitFor();
    assert.equal(await titleInput.inputValue(), "Новая публикация");
    assert.equal(await bodyInput.inputValue(), "Даты встреч");
    await publish.click();
    await waitForClose();
    await page.getByRole("heading", { name: "Новая публикация", exact: true }).waitFor();
    assert.equal(await page.getByRole("heading", { name: "Новая публикация", exact: true }).count(), 1);
    const writes = await page.evaluate(() => window.publicationTransport.calls);
    assert.deepEqual(writes.slice(0, 2), [
      ["PATCH", "/profile/host/announcements/announcement", { title: "Обновлённое объявление", body: "Новое время" }],
      ["DELETE", "/profile/host/announcements/announcement"],
    ]);
    assert.deepEqual(writes[2].slice(0, 2), ["POST", "/profile/host/announcements"]);
    assert.equal(writes[2][2].body, "Даты встреч");
    assert.match(writes[2][2].id, /^[0-9a-f-]{36}$/);
    assert.deepEqual(writes[3], writes[2]);
    assert.equal(writes.length, 4);

    await open("announcements", "visitor");
    assert.equal(await page.getByRole("button", { name: /Добавить объявление|Удалить объявление|Редактировать:/ }).count(), 0);
    await geometry();
    await open("announcements", "empty");
    await page.getByText("Объявлений пока нет.").waitFor();
    await open("calendar", "empty");
    await page.getByText("Сейчас нет доступных слотов.").waitFor();
    await open("calendar", "loading");
    await page.getByRole("status").getByText("Загрузка…").waitFor();
    for (const routing of ["wishlist", "public"]) {
      await page.goto(`${origin}/__profile-publications?routing=${routing}`);
      const rail = page.getByRole("group", { name: "Действия со списком желаний" });
      const calendarLink = rail.getByRole("link", { name: "Календарь", exact: true });
      const boardLink = rail.getByRole("link", { name: "Доска объявлений", exact: true });
      const profileHeading = page.getByRole("heading", { name: "Участник", exact: true });
      const space = page.getByRole("combobox", { name: "Раздел сервиса Вишлист" });
      const list = page.getByRole("button", { name: /^Медиатека/ });
      const wish = page.getByRole("button", { name: "Открыть желание «Фильм для вечера»" });
      await wish.waitFor();
      const original = await rail.elementHandle();
      const assertShell = async () => {
        assert(await original.evaluate(node => node.isConnected), `${routing}: action row was replaced`);
        assert.equal(await profileHeading.count(), 1);
        assert.equal(await rail.getByRole("button", { name: "Добавить", exact: true }).count(), 1);
        assert.equal(await list.getAttribute("aria-pressed"), "true");
        assert.match(await space.innerText(), /Медиа/);
        assert(await rail.evaluate(node => [...node.children].every(child => child.getBoundingClientRect().top === node.firstElementChild.getBoundingClientRect().top)));
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      };
      await calendarLink.click();
      await page.getByRole("heading", { name: "Календарь", exact: true }).waitFor();
      await page.getByRole("heading", { name: "Первая встреча", exact: true }).waitFor();
      assert.equal(await calendarLink.getAttribute("aria-current"), "page");
      await page.waitForFunction(() => {
        const row = document.querySelector('[aria-label="Действия со списком желаний"]');
        const active = row.querySelector('[aria-current="page"]');
        const inactive = row.querySelector('[aria-label="Доска объявлений"]');
        return getComputedStyle(active).backgroundColor !== getComputedStyle(inactive).backgroundColor;
      });
      assert.equal(await wish.count(), 0);
      await assertShell();
      await boardLink.click();
      await page.getByRole("heading", { name: "Открыта запись на ноябрь", exact: true }).waitFor();
      assert.equal(await boardLink.getAttribute("aria-current"), "page");
      await assertShell();
      if ((width === 390 && height === 844) || width === 1440) {
        await page.screenshot({ path: `/tmp/rollapp-publication-shell-${routing}-${width}.png`, animations: "disabled" });
      }
      await page.goBack();
      await page.getByRole("heading", { name: "Первая встреча", exact: true }).waitFor();
      await assertShell();
      await page.getByRole("link", { name: "К Вишлисту", exact: true }).click();
      await wish.waitFor();
      await assertShell();
      assert.deepEqual(await page.evaluate(() => window.publicationTransport.calls), []);
    }
    assert.deepEqual(errors, []);
    console.log(`PASS ${width}×${height} · booking, cancellation, conflict, publications, guest, date picker, overflow`);
    await page.close();
  }
} finally { await browser.close(); await server.close(); }
