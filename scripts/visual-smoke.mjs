import { chromium } from "playwright-core";

const baseUrl = (process.env.BASE_URL || "http://127.0.0.1:8080").replace(/\/$/, "");
const executablePath = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const browser = await chromium.launch({ executablePath, headless: true });

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sameMembers(actual, expected) {
  return actual.length === expected.length && expected.every((item) => actual.includes(item));
}

async function apiFromPage(page, path, { method = "GET", body } = {}) {
  return page.evaluate(async ({ requestPath, requestMethod, requestBody }) => {
    const response = await fetch(requestPath, {
      method: requestMethod,
      headers: requestBody === undefined ? undefined : { "Content-Type": "application/json" },
      body: requestBody === undefined ? undefined : JSON.stringify(requestBody),
    });
    const data = await response.json().catch(() => null);
    return { ok: response.ok, status: response.status, data };
  }, { requestPath: path, requestMethod: method, requestBody: body });
}

async function waitForStableLayout(page) {
  await page.evaluate(async () => {
    if (document.fonts?.ready) await document.fonts.ready;
    await Promise.all([...document.images].map(async (image) => {
      if (!image.complete) await new Promise((resolve) => {
        image.addEventListener("load", resolve, { once: true });
        image.addEventListener("error", resolve, { once: true });
      });
      if (image.decode) await image.decode().catch(() => {});
    }));
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
  await page.waitForTimeout(150);
}

async function expectNoRootOverflow(page, label) {
  await waitForStableLayout(page);
  const dimensions = await page.evaluate(() => ({
    viewportWidth: document.documentElement.clientWidth,
    documentWidth: document.documentElement.scrollWidth,
    bodyWidth: document.body?.scrollWidth || 0,
  }));
  const renderedWidth = Math.max(dimensions.documentWidth, dimensions.bodyWidth);
  assert(
    renderedWidth <= dimensions.viewportWidth + 1,
    `${label} has horizontal root overflow: ${renderedWidth}px rendered inside ${dimensions.viewportWidth}px`,
  );
}

async function expectDesktopUserAgent(page, label) {
  const userAgent = await page.evaluate(() => navigator.userAgent);
  assert(!/(Android|iPhone|iPad|Mobile)/i.test(userAgent), `${label} unexpectedly uses a mobile User-Agent: ${userAgent}`);
}

async function expectMobileAppShell(page, label) {
  const header = page.locator(".mobile-app-head");
  const navigation = page.locator(".mobile-bottom-nav");
  await header.waitFor({ state: "visible" });
  await navigation.waitFor({ state: "visible" });

  const items = navigation.locator("a");
  assert(await items.count() === 5, `${label} should expose five primary mobile navigation items`);
  for (let index = 0; index < 5; index += 1) {
    assert(await items.nth(index).isVisible(), `${label} mobile navigation item ${index + 1} is not visible`);
  }

  const geometry = await navigation.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return {
      position: getComputedStyle(element).position,
      left: rect.left,
      right: window.innerWidth - rect.right,
      bottom: window.innerHeight - rect.bottom,
    };
  });
  assert(geometry.position === "fixed", `${label} primary mobile navigation is not fixed`);
  assert(geometry.left > 4 && geometry.right > 4, `${label} primary mobile navigation is not floating inside the viewport`);
  assert(geometry.bottom >= 0, `${label} primary mobile navigation is outside the viewport`);
}

async function waitForAppRoute(page, pathname) {
  await page.goto(`${baseUrl}${pathname}`, { waitUntil: "domcontentloaded" });
  await page.locator(".app-page").waitFor({ state: "visible" });
  await page.waitForURL((url) => url.pathname === pathname);
}

async function expectPublicGrid(page, columns, label, { requireCards = true } = {}) {
  const grid = page.locator(".public-profile .wish-grid").first();
  await grid.waitFor({ state: "visible" });
  if (requireCards) assert(await grid.locator(".wish-card").count() >= columns, `${label} does not have enough cards to verify ${columns} columns`);
  await waitForStableLayout(page);
  const actualColumns = await grid.evaluate((element) => (
    getComputedStyle(element).gridTemplateColumns.split(/\s+/).filter(Boolean).length
  ));
  assert(actualColumns === columns, `${label} should render ${columns} wish columns, rendered ${actualColumns}`);
}

async function expectReferenceDesktopProfile(page, label) {
  await waitForStableLayout(page);
  const geometry = await page.evaluate(() => {
    const rect = (selector) => {
      const value = document.querySelector(selector)?.getBoundingClientRect();
      return value ? { x: value.x, y: value.y, width: value.width, height: value.height } : null;
    };
    return {
      layout: rect(".public-profile__layout"),
      rail: rect(".profile-list-rail"),
      main: rect(".public-profile__layout > main"),
      avatar: rect(".profile-cover .avatar--xl"),
      heading: rect(".public-wishes-head"),
      grid: rect(".public-profile .wish-grid"),
      card: rect(".public-profile .wish-card__image"),
      backDisplay: getComputedStyle(document.querySelector(".public-profile__back")).display,
      tabsDisplay: getComputedStyle(document.querySelector(".public-list-tabs")).display,
    };
  });
  const close = (actual, expected, tolerance = 2) => Math.abs(actual - expected) <= tolerance;
  assert(close(geometry.layout.x, 0) && close(geometry.layout.width, 1912), `${label} layout is not full width`);
  assert(close(geometry.rail.x, 16) && close(geometry.rail.width, 280), `${label} rail geometry differs from the reference`);
  assert(close(geometry.main.x, 312) && close(geometry.main.width, 1584), `${label} main geometry differs from the reference`);
  assert(close(geometry.avatar.x, 1004) && close(geometry.avatar.y, 116) && close(geometry.avatar.width, 200), `${label} avatar geometry differs from the reference`);
  assert(close(geometry.heading.x, 312) && close(geometry.heading.y, 534) && close(geometry.heading.height, 41), `${label} heading geometry differs from the reference`);
  assert(close(geometry.grid.x, 312) && close(geometry.grid.y, 605), `${label} grid geometry differs from the reference`);
  assert(close(geometry.card.width, 236) && close(geometry.card.height, 286), `${label} card geometry differs from the reference`);
  assert(geometry.backDisplay === "none", `${label} should hide the guest back control in the desktop list layout`);
  assert(geometry.tabsDisplay === "none", `${label} should keep desktop list navigation in the rail, not horizontal tiles`);
}

async function expectPublicMobileShell(page, label) {
  const dock = page.locator(".profile-header__dock");
  const menu = page.locator(".profile-mobile-menu");
  await dock.waitFor({ state: "visible" });
  await menu.waitFor({ state: "visible" });
  const geometry = await dock.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return {
      position: getComputedStyle(element).position,
      bottom: window.innerHeight - rect.bottom,
      left: rect.left,
      right: window.innerWidth - rect.right,
    };
  });
  assert(geometry.position === "fixed", `${label} profile dock is not fixed`);
  assert(geometry.bottom >= 0 && geometry.bottom <= 24, `${label} profile dock is not anchored to the viewport bottom`);
  assert(geometry.left > 4 && geometry.right > 4, `${label} profile dock is not floating inside the viewport`);
}

async function expectWishDetailsOpen(page, label, { fullscreen = false } = {}) {
  const card = page.locator(".wish-card").first();
  await card.waitFor({ state: "visible" });
  const title = (await card.locator("h3").innerText()).trim();
  const opener = card.getByRole("button", { name: `Открыть желание «${title}»` });
  await opener.click();
  const dialog = page.getByRole("dialog", { name: `Желание: ${title}` });
  await dialog.waitFor({ state: "visible" });
  if (!fullscreen) {
    assert((await dialog.getByRole("heading", { name: title }).count()) === 1, `${label} detail does not show the selected wish title`);
  }
  assert(await dialog.locator(".wish-detail__price").isVisible(), `${label} detail does not show the selected wish price`);
  if (fullscreen) {
    await page.waitForTimeout(300);
    const geometry = await dialog.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return { width: rect.width, height: rect.height, viewportWidth: window.innerWidth, viewportHeight: window.innerHeight };
    });
    assert(Math.abs(geometry.width - geometry.viewportWidth) <= 1, `${label} mobile detail is not full width (${geometry.width}px of ${geometry.viewportWidth}px)`);
    assert(geometry.height >= geometry.viewportHeight - 2, `${label} mobile detail is not full height (${geometry.height}px of ${geometry.viewportHeight}px)`);
  }
  return { card, title, opener, dialog };
}

try {
  const desktop = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  const landing = await desktop.newPage();
  await landing.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await landing.getByRole("heading", { name: /Дарите радость/ }).waitFor();
  assert(!(await landing.locator("body").innerText()).includes("Тайный Санта"), "Removed Secret Santa content is still visible on the landing page");
  await expectNoRootOverflow(landing, "Desktop landing page");
  await landing.screenshot({ path: "/tmp/rollapp-desktop-landing.png", fullPage: true });

  const loginResponse = await desktop.request.post(`${baseUrl}/api/auth/demo`, { data: {} });
  assert(loginResponse.ok(), `Demo login failed: ${loginResponse.status()}`);

  const dashboard = await desktop.newPage();
  await waitForAppRoute(dashboard, "/app");
  await dashboard.getByRole("heading", { name: /Привет, Алиса/ }).waitFor();
  assert(!(await dashboard.locator("body").innerText()).includes("Тайный Санта"), "Removed Secret Santa content is still visible in the authenticated app");
  assert(await dashboard.locator(".sidebar").isVisible(), "Desktop app sidebar is not visible");
  assert(await dashboard.locator(".mobile-bottom-nav a").count() === 5, "App navigation should contain the five primary sections");
  await expectNoRootOverflow(dashboard, "Desktop dashboard");
  await dashboard.screenshot({ path: "/tmp/rollapp-desktop-app.png", fullPage: true });

  await waitForAppRoute(dashboard, "/app/wishes");
  const desktopCard = dashboard.locator(".wish-card").first();
  await desktopCard.getByRole("button", { name: /Опции желания/ }).click();
  await desktopCard.locator(".card-menu").waitFor({ state: "visible" });
  assert((await dashboard.locator(".modal--wish-detail").count()) === 0, "Wish options must not open the detail dialog");
  await desktopCard.getByRole("button", { name: /Опции желания/ }).click();
  const desktopDetail = await expectWishDetailsOpen(dashboard, "Desktop owner wish");
  await waitForStableLayout(dashboard);
  await dashboard.screenshot({ path: "/tmp/rollapp-desktop-wish-detail.png" });
  await dashboard.keyboard.press("Escape");
  await desktopDetail.dialog.waitFor({ state: "detached" });
  assert(await desktopDetail.opener.evaluate((element) => document.activeElement === element), "Closing wish detail should restore focus to its card");

  await dashboard.goto(`${baseUrl}/app/santa`, { waitUntil: "domcontentloaded" });
  await dashboard.waitForURL((url) => url.pathname === "/app");
  await dashboard.getByRole("heading", { name: /Привет, Алиса/ }).waitFor();
  await desktop.close();

  // Deliberately keep Chromium's ordinary desktop User-Agent. Responsive behavior
  // must be driven by viewport/CSS, not a server-side mobile User-Agent branch.
  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  const mobilePage = await mobile.newPage();
  await mobilePage.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await mobilePage.getByRole("heading", { name: /Дарите радость/ }).waitFor();
  await expectDesktopUserAgent(mobilePage, "390px viewport");
  await expectNoRootOverflow(mobilePage, "390px landing page");
  await mobilePage.screenshot({ path: "/tmp/rollapp-mobile-landing.png", fullPage: true });

  await mobilePage.getByRole("button", { name: "Открыть меню" }).click();
  const landingMenu = mobilePage.locator("#landing-navigation.is-open");
  await landingMenu.waitFor({ state: "visible" });
  assert(await landingMenu.locator(".landing-nav__mobile-actions .button--primary").isVisible(), "Mobile landing menu CTA is not visible");
  await expectNoRootOverflow(mobilePage, "Open 390px landing menu");
  await waitForStableLayout(mobilePage);
  await mobilePage.screenshot({ path: "/tmp/rollapp-mobile-landing-menu.png", fullPage: true });
  await mobilePage.getByRole("button", { name: "Закрыть меню" }).click();
  await mobilePage.waitForFunction(() => !document.querySelector("#landing-navigation")?.classList.contains("is-open"));
  assert(!(await mobilePage.locator("body").evaluate((element) => element.classList.contains("nav-open"))), "Closing the landing menu should restore body scrolling");

  const mobileLoginResponse = await mobile.request.post(`${baseUrl}/api/auth/demo`, { data: {} });
  assert(mobileLoginResponse.ok(), `Mobile demo login failed: ${mobileLoginResponse.status()}`);

  const appRoutes = ["/app", "/app/wishes", "/app/ideas", "/app/friends", "/app/gifts", "/app/settings"];
  for (const pathname of appRoutes) {
    await waitForAppRoute(mobilePage, pathname);
    await expectMobileAppShell(mobilePage, pathname);
    await expectNoRootOverflow(mobilePage, `390px ${pathname}`);
    if (pathname === "/app/wishes") {
      await mobilePage.screenshot({ path: "/tmp/rollapp-mobile-wishes-390.png", fullPage: true });
      const mobileDetail = await expectWishDetailsOpen(mobilePage, "390px owner wish", { fullscreen: true });
      await expectNoRootOverflow(mobilePage, "390px wish detail");
      await mobilePage.screenshot({ path: "/tmp/rollapp-mobile-wish-detail.png" });
      await mobileDetail.dialog.getByRole("button", { name: "Закрыть диалог" }).click();
      await mobileDetail.dialog.waitFor({ state: "detached" });
    }
  }

  await waitForAppRoute(mobilePage, "/app");
  await expectMobileAppShell(mobilePage, "/app");
  await mobilePage.screenshot({ path: "/tmp/rollapp-mobile-app.png", fullPage: true });

  await mobilePage.getByRole("button", { name: "Открыть меню" }).click();
  const drawer = mobilePage.locator("#app-sidebar.is-open");
  await drawer.waitFor({ state: "visible" });
  await waitForStableLayout(mobilePage);
  await mobilePage.screenshot({ path: "/tmp/rollapp-mobile-app-drawer.png" });
  await drawer.getByRole("button", { name: "Закрыть меню" }).click();
  await mobilePage.waitForFunction(() => !document.querySelector("#app-sidebar")?.classList.contains("is-open"));

  await mobilePage.getByRole("button", { name: "Добавить мечту" }).click();
  const wishDialog = mobilePage.getByRole("dialog", { name: "Диалог Rollapp" });
  await wishDialog.waitFor({ state: "visible" });
  await wishDialog.getByRole("heading", { name: "Добавим мечту" }).waitFor();
  assert(await wishDialog.locator(".link-step input[type='url']").isVisible(), "Wish modal should open on the product-link step");
  assert(await wishDialog.getByRole("button", { name: "Продолжить" }).isVisible(), "Wish link step continue action is not visible");
  await waitForStableLayout(mobilePage);
  await mobilePage.screenshot({ path: "/tmp/rollapp-mobile-wish-link-modal.png" });
  await wishDialog.getByRole("button", { name: /заполнить вручную/i }).click();
  await wishDialog.getByRole("heading", { name: "Проверьте карточку" }).waitFor();
  const addWishAction = wishDialog.getByRole("button", { name: "Добавить желание" });
  await addWishAction.scrollIntoViewIfNeeded();
  assert(await addWishAction.isVisible(), "Wish details action is not reachable inside the mobile bottom sheet");
  await waitForStableLayout(mobilePage);
  await mobilePage.screenshot({ path: "/tmp/rollapp-mobile-wish-details-modal.png" });
  await wishDialog.getByRole("button", { name: "Закрыть диалог" }).click();
  await wishDialog.waitFor({ state: "detached" });
  await mobile.close();

  const narrow = await browser.newContext({ viewport: { width: 360, height: 800 }, deviceScaleFactor: 1 });
  const narrowPage = await narrow.newPage();
  await narrowPage.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await narrowPage.getByRole("heading", { name: /Дарите радость/ }).waitFor();
  await expectDesktopUserAgent(narrowPage, "360px viewport");
  await expectNoRootOverflow(narrowPage, "360px landing page");
  const narrowLoginResponse = await narrow.request.post(`${baseUrl}/api/auth/demo`, { data: {} });
  assert(narrowLoginResponse.ok(), `360px demo login failed: ${narrowLoginResponse.status()}`);
  for (const pathname of ["/app", "/app/wishes", "/app/settings"]) {
    await waitForAppRoute(narrowPage, pathname);
    await expectMobileAppShell(narrowPage, `360px ${pathname}`);
    await expectNoRootOverflow(narrowPage, `360px ${pathname}`);
  }
  await narrowPage.screenshot({ path: "/tmp/rollapp-mobile-settings-360.png", fullPage: true });
  await waitForAppRoute(narrowPage, "/app");
  await narrowPage.screenshot({ path: "/tmp/rollapp-mobile-app-360.png", fullPage: true });
  await narrowPage.goto(`${baseUrl}/u/alisa`, { waitUntil: "domcontentloaded" });
  await expectPublicGrid(narrowPage, 2, "360px public profile");
  await expectPublicMobileShell(narrowPage, "360px public profile");
  await expectNoRootOverflow(narrowPage, "360px public profile");
  await narrow.close();

  const compactPublic = await browser.newContext({ viewport: { width: 320, height: 700 }, deviceScaleFactor: 1 });
  const compactPublicPage = await compactPublic.newPage();
  await compactPublicPage.goto(`${baseUrl}/u/alisa`, { waitUntil: "domcontentloaded" });
  await expectPublicGrid(compactPublicPage, 2, "320px public profile");
  await expectPublicMobileShell(compactPublicPage, "320px public profile");
  await expectNoRootOverflow(compactPublicPage, "320px public profile");
  await compactPublicPage.screenshot({ path: "/tmp/rollapp-public-profile-320.png", fullPage: true });
  const compactPublicDetail = await expectWishDetailsOpen(compactPublicPage, "320px public wish", { fullscreen: true });
  await expectNoRootOverflow(compactPublicPage, "320px public wish detail");
  await compactPublicDetail.dialog.getByRole("button", { name: "Закрыть диалог" }).click();
  await compactPublic.close();

  const tabletApp = await browser.newContext({ viewport: { width: 768, height: 1024 }, deviceScaleFactor: 1 });
  const tabletAppPage = await tabletApp.newPage();
  const tabletLoginResponse = await tabletApp.request.post(`${baseUrl}/api/auth/demo`, { data: {} });
  assert(tabletLoginResponse.ok(), `768px demo login failed: ${tabletLoginResponse.status()}`);
  for (const pathname of ["/app", "/app/wishes"]) {
    await waitForAppRoute(tabletAppPage, pathname);
    await expectMobileAppShell(tabletAppPage, `768px ${pathname}`);
    await expectNoRootOverflow(tabletAppPage, `768px ${pathname}`);
  }
  await tabletAppPage.screenshot({ path: "/tmp/rollapp-tablet-wishes-768.png", fullPage: true });
  const tabletOwnerDetail = await expectWishDetailsOpen(tabletAppPage, "768px owner wish");
  await expectNoRootOverflow(tabletAppPage, "768px owner wish detail");
  await tabletAppPage.screenshot({ path: "/tmp/rollapp-tablet-owner-wish-detail-768.png" });
  await tabletOwnerDetail.dialog.getByRole("button", { name: "Закрыть диалог" }).click();
  await tabletOwnerDetail.dialog.waitFor({ state: "detached" });
  await waitForAppRoute(tabletAppPage, "/app");
  await tabletAppPage.screenshot({ path: "/tmp/rollapp-tablet-app-768.png", fullPage: true });
  await tabletApp.close();

  const publicMobile = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  const publicMobilePage = await publicMobile.newPage();
  await publicMobilePage.goto(`${baseUrl}/u/alisa`, { waitUntil: "domcontentloaded" });
  await expectDesktopUserAgent(publicMobilePage, "390px public profile");
  await expectPublicGrid(publicMobilePage, 2, "390px public profile");
  await expectPublicMobileShell(publicMobilePage, "390px public profile");
  await expectNoRootOverflow(publicMobilePage, "390px public profile");
  await publicMobilePage.screenshot({ path: "/tmp/rollapp-public-profile-390.png", fullPage: true });
  const publicDetail = await expectWishDetailsOpen(publicMobilePage, "390px public wish", { fullscreen: true });
  await publicMobilePage.screenshot({ path: "/tmp/rollapp-public-wish-detail-390.png" });
  await publicDetail.dialog.getByRole("button", { name: "Закрыть диалог" }).click();
  await publicDetail.dialog.waitFor({ state: "detached" });
  await publicMobilePage.locator(".profile-mobile-menu").click();
  const publicMenu = publicMobilePage.locator("#profile-mobile-navigation.is-open");
  await publicMenu.waitFor({ state: "visible" });
  await publicMobilePage.waitForFunction(() => {
    const rect = document.querySelector("#profile-mobile-navigation.is-open")?.getBoundingClientRect();
    return rect && Math.abs(window.innerHeight - rect.bottom) <= 1;
  });
  await waitForStableLayout(publicMobilePage);
  const publicMenuGeometry = await publicMenu.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { top: rect.top, bottom: window.innerHeight - rect.bottom, width: rect.width };
  });
  assert(publicMenuGeometry.top >= 50 && publicMenuGeometry.bottom <= 1 && Math.abs(publicMenuGeometry.width - 390) <= 1, "390px public profile menu is not a full-screen mobile sheet");
  await publicMobilePage.screenshot({ path: "/tmp/rollapp-public-profile-390-menu.png" });
  await publicMobilePage.locator(".profile-mobile-menu").click();
  await publicMenu.waitFor({ state: "hidden" });
  await publicMobilePage.evaluate(() => window.scrollTo(0, 300));
  await publicMobilePage.waitForFunction(() => document.querySelector(".profile-header")?.classList.contains("is-compact"));
  assert(await publicMobilePage.locator(".profile-header__compact").isVisible(), "390px public profile compact header is not visible after scrolling");
  await publicMobilePage.screenshot({ path: "/tmp/rollapp-public-profile-390-scrolled.png" });
  await publicMobile.close();

  const publicTablet = await browser.newContext({ viewport: { width: 768, height: 1024 }, deviceScaleFactor: 1 });
  const publicTabletLoginResponse = await publicTablet.request.post(`${baseUrl}/api/auth/demo`, { data: {} });
  assert(publicTabletLoginResponse.ok(), `768px public owner login failed: ${publicTabletLoginResponse.status()}`);
  const publicTabletPage = await publicTablet.newPage();
  await publicTabletPage.goto(`${baseUrl}/u/alisa`, { waitUntil: "domcontentloaded" });
  await publicTabletPage.locator(".public-profile.is-owner").waitFor({ state: "visible" });
  await expectDesktopUserAgent(publicTabletPage, "768px public profile");
  await expectPublicGrid(publicTabletPage, 2, "768px public profile");
  await expectPublicMobileShell(publicTabletPage, "768px public profile");
  const tabletOwnerSections = await publicTabletPage.evaluate(() => {
    const hero = document.querySelector(".profile-cover")?.getBoundingClientRect();
    const controls = document.querySelector(".profile-cover__controls")?.getBoundingClientRect();
    const tabs = document.querySelector(".public-list-tabs")?.getBoundingClientRect();
    return { heroBottom: hero?.bottom, controlsBottom: controls?.bottom, tabsTop: tabs?.top };
  });
  assert(tabletOwnerSections.controlsBottom <= tabletOwnerSections.heroBottom, "768px owner controls overflow the profile hero");
  assert(tabletOwnerSections.tabsTop >= tabletOwnerSections.heroBottom, "768px owner profile hero overlaps the list tabs");
  await expectNoRootOverflow(publicTabletPage, "768px public profile");
  await publicTabletPage.screenshot({ path: "/tmp/rollapp-public-profile-768.png", fullPage: true });
  const publicTabletDetail = await expectWishDetailsOpen(publicTabletPage, "768px public wish");
  await expectNoRootOverflow(publicTabletPage, "768px public wish detail");
  await publicTabletPage.screenshot({ path: "/tmp/rollapp-public-wish-detail-768.png" });
  await publicTabletDetail.dialog.getByRole("button", { name: "Закрыть диалог" }).click();
  await publicTabletDetail.dialog.waitFor({ state: "detached" });
  await publicTablet.close();

  const publicLandscape = await browser.newContext({ viewport: { width: 1024, height: 768 }, deviceScaleFactor: 1 });
  const publicLandscapePage = await publicLandscape.newPage();
  await publicLandscapePage.goto(`${baseUrl}/u/alisa`, { waitUntil: "domcontentloaded" });
  await expectPublicGrid(publicLandscapePage, 2, "1024px public profile");
  await expectNoRootOverflow(publicLandscapePage, "1024px public profile");
  const publicLandscapeDetail = await expectWishDetailsOpen(publicLandscapePage, "1024px public wish");
  await expectNoRootOverflow(publicLandscapePage, "1024px public wish detail");
  await publicLandscapePage.screenshot({ path: "/tmp/rollapp-public-wish-detail-1024.png" });
  await publicLandscapeDetail.dialog.getByRole("button", { name: "Закрыть диалог" }).click();
  await publicLandscape.close();

  const publicMedium = await browser.newContext({ viewport: { width: 1076, height: 800 }, deviceScaleFactor: 1 });
  const publicMediumPage = await publicMedium.newPage();
  await publicMediumPage.goto(`${baseUrl}/u/alisa`, { waitUntil: "domcontentloaded" });
  await expectPublicGrid(publicMediumPage, 3, "1076px public profile");
  await expectNoRootOverflow(publicMediumPage, "1076px public profile");
  await publicMedium.close();

  const publicWide = await browser.newContext({ viewport: { width: 1912, height: 991 }, deviceScaleFactor: 1 });
  const publicWidePage = await publicWide.newPage();
  await publicWidePage.goto(`${baseUrl}/u/alisa`, { waitUntil: "domcontentloaded" });
  await expectPublicGrid(publicWidePage, 6, "1912px public profile", { requireCards: false });
  await expectReferenceDesktopProfile(publicWidePage, "1912px public profile");
  await expectNoRootOverflow(publicWidePage, "1912px public profile");
  await publicWidePage.screenshot({ path: "/tmp/rollapp-public-profile-1912.png", fullPage: false });
  await publicWide.close();

  const ownerWide = await browser.newContext({ viewport: { width: 1912, height: 991 }, deviceScaleFactor: 1 });
  const ownerLoginResponse = await ownerWide.request.post(`${baseUrl}/api/auth/demo`, { data: {} });
  assert(ownerLoginResponse.ok(), `1912px owner demo login failed: ${ownerLoginResponse.status()}`);
  const ownerWidePage = await ownerWide.newPage();
  await ownerWidePage.goto(`${baseUrl}/u/alisa`, { waitUntil: "domcontentloaded" });
  await ownerWidePage.locator(".public-profile.is-owner").waitFor({ state: "visible" });
  await expectPublicGrid(ownerWidePage, 6, "1912px owner profile", { requireCards: false });
  await expectReferenceDesktopProfile(ownerWidePage, "1912px owner profile");
  assert(await ownerWidePage.getByRole("button", { name: "Загадать желание" }).isVisible(), "Owner profile does not expose the reference add-wish CTA");
  assert((await ownerWidePage.getByRole("button", { name: "Подписаться" }).count()) === 0, "Owner profile should not expose a follow action");
  await waitForStableLayout(ownerWidePage);
  await ownerWidePage.screenshot({ path: "/tmp/rollapp-owner-profile-1912.png", fullPage: false });
  await ownerWidePage.locator(".profile-desktop-menu").click();
  await ownerWidePage.locator(".profile-desktop-panel.is-open").waitFor({ state: "visible" });
  assert(!(await ownerWidePage.locator("body").evaluate((element) => element.classList.contains("profile-menu-open"))), "Desktop account menu should not lock page scrolling");
  await ownerWidePage.locator(".public-wishes-head h2").click();
  await ownerWidePage.waitForFunction(() => !document.querySelector(".profile-desktop-panel")?.classList.contains("is-open"));
  await ownerWidePage.getByRole("button", { name: "Создать новый список" }).click();
  const ownerListDialog = ownerWidePage.getByRole("dialog", { name: "Диалог Rollapp" });
  await ownerListDialog.getByRole("heading", { name: "Создать список" }).waitFor();
  await ownerListDialog.getByRole("button", { name: "Закрыть диалог" }).click();
  await ownerListDialog.waitFor({ state: "detached" });
  await ownerWidePage.getByRole("button", { name: "Загадать желание" }).click();
  const ownerWishDialog = ownerWidePage.getByRole("dialog", { name: "Диалог Rollapp" });
  await ownerWishDialog.getByRole("heading", { name: "Добавим мечту" }).waitFor();
  await ownerWishDialog.getByRole("button", { name: "Закрыть диалог" }).click();
  await ownerWishDialog.waitFor({ state: "detached" });

  const dashboardBeforeMoveResponse = await apiFromPage(ownerWidePage, "/api/dashboard");
  assert(dashboardBeforeMoveResponse.ok, `Owner dashboard before list move failed: ${dashboardBeforeMoveResponse.status}`);
  const dashboardBeforeMove = dashboardBeforeMoveResponse.data;
  const wishToMove = dashboardBeforeMove.wishes.find((wish) => wish.id === "demo-wish-camera");
  assert(wishToMove, "List move regression needs the seeded demo wish");
  assert(wishToMove.listIds.length === 1, "Seeded list move wish should initially belong to exactly one list");
  const originalListIds = [...wishToMove.listIds];
  const sourceList = dashboardBeforeMove.lists.find((list) => list.id === originalListIds[0]);
  const isVisibleProfileList = (list) => !(list.title === "Мои желания" && list.description === "Всё, чему я буду рад");
  const targetList = dashboardBeforeMove.lists.find((list) => list.title === "Когда-нибудь" && !originalListIds.includes(list.id))
    || dashboardBeforeMove.lists.find((list) => isVisibleProfileList(list) && !originalListIds.includes(list.id));
  assert(sourceList && targetList, "List move regression needs distinct source and target lists");

  try {
    const wishCard = ownerWidePage.locator(".wish-card").filter({ hasText: wishToMove.title }).first();
    await wishCard.waitFor({ state: "visible" });
    await wishCard.getByRole("button", { name: `Открыть желание «${wishToMove.title}»` }).click();
    const wishDetailsDialog = ownerWidePage.getByRole("dialog", { name: `Желание: ${wishToMove.title}` });
    await wishDetailsDialog.waitFor({ state: "visible" });
    const changeListsButton = wishDetailsDialog.getByRole("button", { name: /^Изменить списки желания\./ });
    assert(await changeListsButton.isVisible(), "Owner wish detail does not expose the editable list control");
    await changeListsButton.click();

    const editDialog = ownerWidePage.getByRole("dialog", { name: "Диалог Rollapp" });
    await editDialog.getByRole("heading", { name: "Изменить желание", exact: true }).waitFor();
    const sourceChoice = editDialog.locator(".list-choice > label").filter({ hasText: sourceList.title });
    const targetChoice = editDialog.locator(".list-choice > label").filter({ hasText: targetList.title });
    const sourceCheckbox = sourceChoice.locator("input[type='checkbox']");
    const targetCheckbox = targetChoice.locator("input[type='checkbox']");
    assert(await sourceCheckbox.isChecked(), "Wish editor should preselect the wish's current list");
    assert(!(await targetCheckbox.isChecked()), "Wish editor should not preselect an unrelated list");

    await sourceChoice.click();
    await targetChoice.click();
    assert(!(await sourceCheckbox.isChecked()), "Wish editor did not remove the source list selection");
    assert(await targetCheckbox.isChecked(), "Wish editor did not select the target list");

    const updateResponsePromise = ownerWidePage.waitForResponse((response) => (
      response.request().method() === "PATCH"
      && new URL(response.url()).pathname === `/api/wishes/${wishToMove.id}`
    ));
    await editDialog.getByRole("button", { name: "Сохранить изменения", exact: true }).click();
    const updateResponse = await updateResponsePromise;
    assert(updateResponse.ok(), `Wish list update failed: ${updateResponse.status()}`);
    await editDialog.waitFor({ state: "detached" });
    await ownerWidePage.locator(".public-profile.is-owner").waitFor({ state: "visible" });

    const dashboardAfterMoveResponse = await apiFromPage(ownerWidePage, "/api/dashboard");
    assert(dashboardAfterMoveResponse.ok, `Owner dashboard after list move failed: ${dashboardAfterMoveResponse.status}`);
    const dashboardAfterMove = dashboardAfterMoveResponse.data;
    const movedWish = dashboardAfterMove.wishes.find((wish) => wish.id === wishToMove.id);
    assert(movedWish && sameMembers(movedWish.listIds, [targetList.id]), "API did not persist the wish's new list membership");
    const sourceAfterMove = dashboardAfterMove.lists.find((list) => list.id === sourceList.id);
    const targetAfterMove = dashboardAfterMove.lists.find((list) => list.id === targetList.id);
    assert(sourceAfterMove.wishCount === sourceList.wishCount - 1, "Source list count did not decrease after moving the wish");
    assert(targetAfterMove.wishCount === targetList.wishCount + 1, "Target list count did not increase after moving the wish");

    if (isVisibleProfileList(sourceList)) {
      const sourceRailButton = ownerWidePage.locator(".profile-list-rail__lists > button").filter({ hasText: sourceList.title });
      await sourceRailButton.click();
      assert((await ownerWidePage.locator(".wish-card").filter({ hasText: wishToMove.title }).count()) === 0, "Moved wish is still rendered in its former list");
    }
    const targetRailButton = ownerWidePage.locator(".profile-list-rail__lists > button").filter({ hasText: targetList.title });
    await targetRailButton.click();
    await ownerWidePage.locator(".wish-card").filter({ hasText: wishToMove.title }).waitFor({ state: "visible" });

    await ownerWidePage.reload({ waitUntil: "domcontentloaded" });
    await ownerWidePage.locator(".public-profile.is-owner").waitFor({ state: "visible" });
    await ownerWidePage.locator(".profile-list-rail__lists > button").filter({ hasText: targetList.title }).click();
    const persistedCard = ownerWidePage.locator(".wish-card").filter({ hasText: wishToMove.title }).first();
    await persistedCard.waitFor({ state: "visible" });
    await persistedCard.getByRole("button", { name: `Опции желания «${wishToMove.title}»` }).click();
    await persistedCard.getByRole("button", { name: "Редактировать", exact: true }).click();
    const reloadedEditDialog = ownerWidePage.getByRole("dialog", { name: "Диалог Rollapp" });
    await reloadedEditDialog.getByRole("heading", { name: "Изменить желание", exact: true }).waitFor();
    assert(!(await reloadedEditDialog.locator(".list-choice > label").filter({ hasText: sourceList.title }).locator("input[type='checkbox']").isChecked()), "Source list became selected again after reload");
    assert(await reloadedEditDialog.locator(".list-choice > label").filter({ hasText: targetList.title }).locator("input[type='checkbox']").isChecked(), "Target list selection did not survive reload");
    await reloadedEditDialog.getByRole("button", { name: "Закрыть диалог" }).click();
    await reloadedEditDialog.waitFor({ state: "detached" });

    const dashboardAfterReloadResponse = await apiFromPage(ownerWidePage, "/api/dashboard");
    assert(dashboardAfterReloadResponse.ok, `Owner dashboard after reload failed: ${dashboardAfterReloadResponse.status}`);
    const dashboardAfterReload = dashboardAfterReloadResponse.data;
    const persistedWish = dashboardAfterReload.wishes.find((wish) => wish.id === wishToMove.id);
    assert(persistedWish && sameMembers(persistedWish.listIds, [targetList.id]), "API list membership changed after browser reload");
  } finally {
    const restoreResponse = await apiFromPage(ownerWidePage, `/api/wishes/${wishToMove.id}`, { method: "PATCH", body: { listIds: originalListIds } });
    assert(restoreResponse.ok, `Failed to restore seeded wish membership: ${restoreResponse.status}`);
  }
  await expectNoRootOverflow(ownerWidePage, "1912px owner profile");
  await ownerWide.close();

  console.log("Visual smoke passed: desktop/mobile wish details, owner list reassignment persistence, app routes, drawer/modal, and 2/4/6-column public profiles rendered without root overflow");
} finally {
  await browser.close();
}
