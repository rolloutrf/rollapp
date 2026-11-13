import assert from "node:assert/strict";
import { createServer } from "vite";
import { chromium } from "playwright-core";
import { browserLaunchOptions } from "./browser-runtime.mjs";
import { listenSmokeServer, smokePort, smokeOrigin } from "./smoke-server.mjs";

const server = await createServer({
  cacheDir: "node_modules/.vite-profile-publications-smoke",
  optimizeDeps: { entries: ["scripts/fixtures/profile-publications.jsx"] },
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
const viewports = [[320,844],[390,844],[390,400],[768,844],[820,844],[1024,844],[1440,900],[1920,900]];
const selectedViewport = process.env.ROLLAPP_PUBLICATION_VIEWPORT;
try {
  for (const [width, height] of viewports) {
    if (selectedViewport && selectedViewport !== `${width}x${height}`) continue;
    const page = await browser.newPage({ viewport: { width, height }, locale: "ru-RU", timezoneId: "Europe/Moscow" });
    page.setDefaultTimeout(30_000);
    page.setDefaultNavigationTimeout(60_000);
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.route("**/api/**", route => { errors.push("Unexpected API request"); return route.abort(); });
    async function open(section, mode, query = "") {
      await page.goto(`${origin}/__profile-publications?section=${section}&mode=${mode}${query}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
      await page.getByRole("heading", { name: section === "calendar" ? "Календарь" : "Доска объявлений", exact: true }).waitFor();
    }
    async function geometry() {
      const result = await page.evaluate(() => {
        const main = document.querySelector(".app-page");
        const overflow = [...main.querySelectorAll("button,a,input,textarea,article,h1,h2,h3,p")].filter(element => {
          const rect = element.getBoundingClientRect();
          return rect.width > 0 && (rect.left < -1 || rect.right > innerWidth + 1 || element.scrollWidth > element.clientWidth + 1 && ["ARTICLE", "P", "H1", "H2", "H3"].includes(element.tagName));
        });
        const badControls = [...main.querySelectorAll("[data-page-action], .booking-month-nav [data-control-icon]")].filter(element => {
          const rect = element.getBoundingClientRect(), style = getComputedStyle(element);
          if (element.hasAttribute("data-control-icon")) return rect.width !== 48 || rect.height !== 48;
          return rect.width > 0 && (rect.height < 48 || style.paddingLeft !== "24px" || style.paddingRight !== "24px");
        });
        return { root: document.documentElement.scrollWidth, overflow: overflow.map(el => [el.tagName, el.textContent.trim().slice(0, 60), el.getBoundingClientRect().right]), badControls: badControls.map(el => ({name: el.textContent, height: el.getBoundingClientRect().height, left: getComputedStyle(el).paddingLeft, right: getComputedStyle(el).paddingRight, minHeight: getComputedStyle(el).minHeight, css: el.className})) };
      });
      assert(result.root <= width + 1 && !result.overflow.length && !result.badControls.length, JSON.stringify(result));
    }

    const availableDay = page.locator(".booking-day-available button").first();
    const time = label => page.getByRole("button", { name: `Выбрать время ${label}`, exact: true });
    const next = page.getByRole("button", { name: "Далее", exact: true });
    const confirm = page.getByRole("button", { name: "Подтвердить запись", exact: true });
    const book = async () => {
      await availableDay.click();
      await time("12:00").click();
      await next.click();
    };
    const screenshot = async stage => {
      if ((width === 390 && height === 844) || width === 1440) {
        await page.screenshot({ path: `/tmp/rollapp-booking-${stage}-${width}.png`, animations: "disabled", fullPage: true });
      }
    };

    await open("calendar", "guest");
    assert.equal(await page.getByText("Встреча по итогам недели").count(), 0);
    assert.equal(await page.getByRole("link", { name: "Войти для записи" }).count(), 0);
    const zone = page.getByRole("combobox", { name: "Часовой пояс" });
    await zone.click();
    await page.getByRole("option", { name: "UTC", exact: true }).click();
    await availableDay.click();
    await time("09:00").waitFor();
    await geometry();
    await screenshot("times");
    await time("09:00").click();
    await next.click();
    assert.equal(await page.getByRole("link", { name: "Войти для записи" }).getAttribute("href"), "/login?next=%2Fhost%2Fcalendar%2Fbook%3Fslot%3Dopen%26zone%3DUTC");
    assert.deepEqual(await page.evaluate(() => window.publicationTransport.calls), []);
    await open("calendar", "visitor", "&slot=open");
    await page.getByRole("heading", { name: "Данные участника" }).waitFor();
    await page.getByText("member@example.test").waitFor();
    await page.getByRole("button", { name: "Вернуться к выбору времени" }).click();
    await time("12:00").waitFor();
    await geometry();

    await open("calendar", "visitor");
    await page.getByText("Вы записаны", { exact: true }).waitFor();
    await page.getByRole("button", { name: /Отменить запись: Встреча/ }).click();
    await page.getByRole("alertdialog").getByRole("heading", { name: "Отменить запись?" }).waitFor();
    await page.getByRole("alertdialog").getByRole("button", { name: "Назад" }).click();
    await page.getByRole("alertdialog").waitFor({ state: "hidden" });
    await book();
    assert.deepEqual(await page.evaluate(() => window.publicationTransport.calls), []);
    await screenshot("details");
    await confirm.click();
    await page.getByRole("status").getByText("Вы записаны на сессию").waitFor();
    await screenshot("confirmed");
    await page.getByRole("button", { name: /Отменить запись: Первая встреча/ }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Отменить запись" }).click();
    await page.getByRole("status").getByText("Запись отменена").waitFor();
    await page.evaluate(() => { window.publicationTransport.conflictNextBooking = true; });
    await book();
    await confirm.click();
    await page.getByRole("alert").getByText("Это время больше недоступно. Выберите другой слот.").waitFor();
    await page.getByText("Сейчас нет доступных слотов.").waitFor();
    assert.deepEqual(await page.evaluate(() => window.publicationTransport.calls), [
      ["POST", "/profile/host/calendar/open/book", {}],
      ["DELETE", "/profile/host/calendar/open/bookings/open-booking"],
      ["POST", "/profile/host/calendar/open/book", {}],
    ]);
    await geometry();

    await open("calendar", "owner");
    await page.getByText("Записался участник: Светлана").waitFor();
    await page.getByRole("button", { name: "Предпросмотр", exact: true }).click();
    await book();
    await page.getByText("Предпросмотр страницы записи").waitFor();
    assert.equal(await confirm.count(), 0);
    assert.deepEqual(await page.evaluate(() => window.publicationTransport.calls), []);
    await page.getByRole("button", { name: "К управлению слотами", exact: true }).click();
    await page.getByRole("button", { name: "Добавить слот" }).click();
    const editorSlot = page.locator("[data-host-slot-editor]");
    const month = editorSlot.getByRole("grid");
    assert(await next.isDisabled());
    let times;
    if (width >= 1024) {
      const week = editorSlot.locator("[data-booking-host-week]");
      await week.getByRole("button", { name: "Следующая неделя" }).click();
      times = week.locator("section").first();
    } else {
      if (width >= 768) await editorSlot.getByText("Выбрать другую дату или время", { exact: true }).click();
      await month.getByRole("button").filter({ visible: true }).last().click();
      times = editorSlot.getByRole("region", { name: "Время начала" });
    }
    await times.getByRole("button", { name: "09:00", exact: true }).click();
    await times.getByRole("button", { name: "09:30", exact: true }).click();
    await geometry();
    await screenshot("host");
    await next.click();
    await page.getByLabel("Название сессии").fill("Планирование");
    const publishSlots = page.getByRole("button", { name: "Опубликовать", exact: true });
    await page.evaluate(() => { window.publicationTransport.loseNextSlotResponse = true; });
    await publishSlots.click();
    await page.getByRole("alert").getByText("Ответ сервера потерян").waitFor();
    assert.equal(await page.getByLabel("Название сессии").inputValue(), "Планирование");
    await publishSlots.click();
    await page.getByRole("status").getByText("Слоты опубликованы").waitFor();
    assert.equal(await page.getByRole("heading", { name: "Планирование", exact: true }).count(), 2);
    const [firstWrite, retry] = await page.evaluate(() => window.publicationTransport.calls);
    assert.deepEqual(firstWrite, retry);
    assert.deepEqual(firstWrite.slice(0, 2), ["POST", "/profile/host/calendar"]);
    const [{ id, title, duration, startsAt }, secondSlot] = firstWrite[2].slots;
    assert.match(id, /^[0-9a-f-]{36}$/);
    assert.equal(title, "Планирование");
    assert.equal(duration, 30);
    assert.match(startsAt, /T06:00:00.000Z$/);
    assert.match(secondSlot.startsAt, /T06:30:00.000Z$/);
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
    await open("calendar", "error");
    await page.getByRole("alert").getByText("Раздел пока недоступен").waitFor();
    await open("calendar", "loading");
    await page.getByRole("status").getByText("Загрузка…").waitFor();
    await page.goto(`${origin}/__profile-publications?routing=booking&section=calendar&mode=guest`);
    await page.getByRole("heading", { name: "Данные участника" }).waitFor();
    assert.match(await page.getByRole("link", { name: "Войти для записи" }).getAttribute("href"), /zone%3DUTC$/);
    assert.equal(await page.getByRole("group", { name: "Действия со списком желаний" }).count(), 0);
    assert.deepEqual(await page.evaluate(() => window.publicationTransport.calls), []);
    for (const routing of ["wishlist", "public"]) {
      await page.goto(`${origin}/__profile-publications?routing=${routing}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
      const actions = page.getByRole("group", { name: "Действия со списком желаний" });
      const rail = routing === "wishlist" ? page.getByRole("navigation", { name: "Разделы Вишлиста" }) : actions;
      const calendarLink = rail.getByRole("link", { name: "Календарь", exact: true });
      const boardLink = rail.getByRole("link", { name: "Доска объявлений", exact: true });
      const profileHeading = page.getByRole("heading", { name: "Участник", exact: true });
      const space = page.getByRole("combobox", { name: "Раздел сервиса Вишлист" });
      const listNavigation = page.locator("[data-wishlist-list-navigation]");
      const list = page.getByRole("button", { name: /^Медиатека/ });
      const wish = page.getByRole("button", { name: "Открыть желание «Фильм для вечера»" });
      if (routing === "wishlist") await list.click();
      await wish.waitFor();
      assert.equal(await list.getAttribute("aria-pressed"), "true");
      const original = await rail.elementHandle();
      const avatar = await profileHeading.elementHandle();
      const railTop = await rail.evaluate(node => node.getBoundingClientRect().top + scrollY);
      const assertShell = async () => {
        assert(await original.evaluate(node => node.isConnected), `${routing}: action row was replaced`);
        assert.equal(await profileHeading.count(), 1);
        assert(await avatar.evaluate(node => node.isConnected), `${routing}: profile hero was replaced`);
        assert.equal(await actions.getByRole("button", { name: "Добавить", exact: true }).count(), 1);
        assert.match(await space.innerText(), /Медиа/);
        assert(await rail.evaluate(node => [...node.children].every(child => child.getBoundingClientRect().top === node.firstElementChild.getBoundingClientRect().top)));
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      };
      const assertPublication = async () => {
        await assertShell();
        assert.equal(await listNavigation.count(), 0, `${routing}: publication must not render Wishlist tiles`);
        assert.equal(await wish.count(), 0);
      };
      await calendarLink.click();
      await page.getByRole("heading", { name: "Календарь", exact: true }).waitFor();
      await page.getByRole("heading", { name: "Первая встреча", exact: true }).waitFor();
      assert.equal(await calendarLink.getAttribute("aria-current"), "page");
      await page.waitForFunction(() => {
        const row = [...document.querySelectorAll("[data-control-bar]")].find(node => node.querySelector('[aria-label="Календарь"][aria-current="page"]'));
        const active = row?.querySelector('[aria-current="page"]');
        if (!active) return false;
        const inactive = row.querySelector('[aria-label="Доска объявлений"]');
        return getComputedStyle(active).backgroundColor !== getComputedStyle(inactive).backgroundColor;
      });
      await assertPublication();
      await boardLink.click();
      await page.getByRole("heading", { name: "Открыта запись на ноябрь", exact: true }).waitFor();
      assert.equal(await boardLink.getAttribute("aria-current"), "page");
      await assertPublication();
      if ((width === 390 && height === 844) || width === 1440) {
        await page.screenshot({ path: `/tmp/rollapp-publication-shell-${routing}-${width}.png`, animations: "disabled" });
      }
      await page.goBack();
      await page.getByRole("heading", { name: "Первая встреча", exact: true }).waitFor();
      await assertPublication();
      await page.goBack();
      await wish.waitFor();
      await assertShell();
      assert.equal(await list.getAttribute("aria-pressed"), "true");
      await page.goForward();
      await page.getByRole("heading", { name: "Первая встреча", exact: true }).waitFor();
      await assertPublication();
      await page.getByRole("link", { name: "К Вишлисту", exact: true }).click();
      await wish.waitFor();
      await assertShell();
      assert.equal(await listNavigation.count(), 1);
      assert.equal(await list.getAttribute("aria-pressed"), "true");
      if (routing === "wishlist") {
        const names = ["Открыть ленту", "Открыть каталог брендов", "Открыть магазин", "Открыть предложения", "Мои продажи", "Календарь", "Доска объявлений"];
        assert.deepEqual(await rail.getByRole("link").evaluateAll(links => links.map(link => link.getAttribute("aria-label"))), names);
        for (const [name, path, content] of [
          [names[0], "/app/wishes/catalog?tab=media", page.getByRole("heading", { name: "Лента · Медиа" })],
          [names[1], "/app/wishes/catalog?source=brands&tab=media", page.getByRole("heading", { name: "Бренды · Медиа" })],
          [names[2], "/app/store?tab=media", page.getByText("В этом разделе магазина пока пусто", { exact: true })],
          [names[3], "/app/wishes/offers?tab=media", page.getByText("Предложений пока нет", { exact: true })],
          [names[4], "/app/wishes/sales?tab=media", page.getByText("Объявлений пока нет", { exact: true })],
          [names[5], "/app/wishes?tab=media&publication=calendar", page.getByRole("heading", { name: "Первая встреча" })],
          [names[6], "/app/wishes?tab=media&publication=announcements", page.getByRole("heading", { name: "Открыта запись на ноябрь" })],
        ]) {
          const link = rail.getByRole("link", { name, exact: true });
          assert.equal(await link.getAttribute("href"), path);
          await link.click();
          await page.waitForURL(origin + path);
          await content.waitFor();
          assert(await original.evaluate(node => node.isConnected), `${name}: navigation was replaced`);
          assert(await avatar.evaluate(node => node.isConnected), `${name}: profile was replaced`);
          assert.deepEqual(await rail.locator('[aria-current="page"]').evaluateAll(links => links.map(link => link.getAttribute("aria-label"))), [name]);
          assert.equal(await rail.evaluate(node => node.getBoundingClientRect().top + scrollY), railTop);
          assert(await link.evaluate(node => {
            const control = node.getBoundingClientRect();
            const row = node.parentElement.getBoundingClientRect();
            return control.left >= row.left - 1 && control.right <= row.right + 1;
          }), `${name}: selected icon is clipped`);
          assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
        }
        const gap = await rail.evaluate(node => {
          const next = node.parentElement.nextElementSibling;
          return next.getBoundingClientRect().top - node.getBoundingClientRect().bottom;
        });
        assert.equal(gap, 24, "Wishlist navigation uses the shared page gap");
        const metrics = await rail.evaluate(node => {
          const rect = node.getBoundingClientRect();
          const links = [...node.querySelectorAll("a")];
          return {
            left: rect.left, right: rect.right, position: getComputedStyle(node).position,
            icons: links.map(link => {
              const glyph = link.querySelector("svg").getBoundingClientRect();
              return [link.offsetWidth, link.offsetHeight, glyph.width, glyph.height, getComputedStyle(link).borderRadius];
            }),
          };
        });
        assert.equal(metrics.position, "static");
        assert(Math.abs(metrics.left) <= 1 && Math.abs(metrics.right - width) <= 1, JSON.stringify(metrics));
        for (const icon of metrics.icons) assert.deepEqual(icon, [48, 48, 20, 20, "24px"]);
        await rail.evaluate(node => { node.scrollLeft = 0; });
        const edges = await rail.evaluate(node => {
          const first = node.firstElementChild.getBoundingClientRect().left;
          node.scrollLeft = node.scrollWidth;
          const last = node.lastElementChild.getBoundingClientRect().right;
          return { first, last, scrollLeft: node.scrollLeft };
        });
        if (edges.scrollLeft > 0) {
          const inset = width <= 640 ? 16 : 24;
          assert.equal(edges.first, inset);
          assert.equal(width - edges.last, inset);
        }
        if ((width === 390 && height === 844) || width === 1440) {
          await page.screenshot({ path: `/tmp/rollapp-wishlist-sections-${width}.png`, animations: "disabled" });
        }
        await page.goBack();
        await page.getByRole("heading", { name: "Первая встреча" }).waitFor();
        assert(await original.evaluate(node => node.isConnected));
      }
      assert.deepEqual(await page.evaluate(() => window.publicationTransport.calls), []);
    }
    assert.deepEqual(errors, []);
    console.log(`PASS ${width}×${height} · booking, confirmation, conflict, batch retry, preview, announcements, responsive geometry`);
    await page.close();
  }
} finally { await browser.close(); await server.close(); }
