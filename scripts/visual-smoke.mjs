import { chromium } from "playwright-core";

const baseUrl = (process.env.BASE_URL || "http://127.0.0.1:8080").replace(/\/$/, "");
const executablePath = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const browser = await chromium.launch({ executablePath, headless: true });
const friendsRoutes = {
  subscriptions: "/app/friends/subscriptions",
  followers: "/app/friends/followers",
  search: "/app/friends/search",
};
const friendsLabels = {
  subscriptions: "Подписки",
  followers: "Подписчики",
  search: "Найти друзей",
};

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

async function expectDarkPage(page, label, surfaceSelectors) {
  await waitForStableLayout(page);
  const theme = await page.evaluate((selectors) => {
    const parseColor = (value) => {
      const match = value.match(/rgba?\(([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,/\s]+([\d.]+))?\)/);
      return match
        ? { red: Number(match[1]), green: Number(match[2]), blue: Number(match[3]), alpha: match[4] === undefined ? 1 : Number(match[4]) }
        : null;
    };
    const blend = (foreground, background) => {
      const alpha = foreground.alpha + (background.alpha * (1 - foreground.alpha));
      if (!alpha) return { red: 0, green: 0, blue: 0, alpha: 0 };
      return {
        red: ((foreground.red * foreground.alpha) + (background.red * background.alpha * (1 - foreground.alpha))) / alpha,
        green: ((foreground.green * foreground.alpha) + (background.green * background.alpha * (1 - foreground.alpha))) / alpha,
        blue: ((foreground.blue * foreground.alpha) + (background.blue * background.alpha * (1 - foreground.alpha))) / alpha,
        alpha,
      };
    };
    const luminance = ({ red, green, blue }) => (red * .2126) + (green * .7152) + (blue * .0722);
    const effectiveBackground = (element) => {
      const chain = [];
      for (let node = element; node; node = node.parentElement) chain.unshift(node);
      return chain.reduce((background, node) => {
        const color = parseColor(getComputedStyle(node).backgroundColor);
        return color ? blend(color, background) : background;
      }, { red: 255, green: 255, blue: 255, alpha: 1 });
    };
    const isVisible = (element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return rect.width > 1 && rect.height > 1 && style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) > .01;
    };
    const surfaces = selectors.map((selector) => {
      const element = [...document.querySelectorAll(selector)].find(isVisible);
      if (!element) return { selector, missing: true };
      const style = getComputedStyle(element);
      return {
        selector,
        background: luminance(effectiveBackground(element)),
        foreground: parseColor(style.color) ? luminance(parseColor(style.color)) : null,
        colorScheme: style.colorScheme,
      };
    });
    const controls = [...document.querySelectorAll("input, textarea, select")]
      .filter(isVisible)
      .map((element) => ({
        selector: element.getAttribute("name") || element.getAttribute("type") || element.tagName.toLowerCase(),
        background: luminance(effectiveBackground(element)),
        colorScheme: getComputedStyle(element).colorScheme,
      }));
    const htmlStyle = getComputedStyle(document.documentElement);
    const bodyStyle = getComputedStyle(document.body);
    return {
      prefersLight: matchMedia("(prefers-color-scheme: light)").matches,
      htmlColorScheme: htmlStyle.colorScheme,
      bodyColorScheme: bodyStyle.colorScheme,
      bodyBackground: luminance(effectiveBackground(document.body)),
      surfaces,
      controls,
    };
  }, surfaceSelectors);

  assert(theme.prefersLight, `${label} dark-default regression must run while the browser requests a light system theme`);
  assert(theme.htmlColorScheme === "dark", `${label} does not set the root color-scheme to dark (${theme.htmlColorScheme})`);
  assert(theme.bodyColorScheme === "dark", `${label} does not set the body color-scheme to dark (${theme.bodyColorScheme})`);
  assert(theme.bodyBackground <= 80, `${label} uses a light body surface (luminance ${theme.bodyBackground})`);
  const missingSurfaces = theme.surfaces.filter((surface) => surface.missing);
  assert(missingSurfaces.length === 0, `${label} is missing principal surfaces: ${missingSurfaces.map((surface) => surface.selector).join(", ")}`);
  const lightSurfaces = theme.surfaces.filter((surface) => surface.background > 100);
  assert(
    lightSurfaces.length === 0,
    `${label} contains light principal surfaces: ${lightSurfaces.map((surface) => `${surface.selector} (${surface.background})`).join(", ")}`,
  );
  const nonDarkSurfaces = theme.surfaces.filter((surface) => surface.colorScheme !== "dark");
  assert(
    nonDarkSurfaces.length === 0,
    `${label} contains surfaces without a dark color-scheme: ${nonDarkSurfaces.map((surface) => `${surface.selector} (${surface.colorScheme})`).join(", ")}`,
  );
  const lightControls = theme.controls.filter((control) => control.background > 110 || control.colorScheme !== "dark");
  assert(
    lightControls.length === 0,
    `${label} contains light native controls: ${lightControls.map((control) => `${control.selector} (${control.background}, ${control.colorScheme})`).join(", ")}`,
  );
}

async function expectUnauthenticatedDarkRoutes(page, label) {
  const routes = [
    { pathname: "/login", ready: ".auth-form", surfaces: [".auth-page", ".auth-panel"] },
    { pathname: "/register", ready: ".auth-form", surfaces: [".auth-page", ".auth-panel"] },
    { pathname: "/ideas", ready: ".public-ideas .ideas-hero", surfaces: [".public-ideas", ".public-ideas > main"] },
    { pathname: "/this-page/does-not/exist", ready: ".not-found", surfaces: [".not-found"] },
  ];
  for (const route of routes) {
    await page.goto(`${baseUrl}${route.pathname}`, { waitUntil: "domcontentloaded" });
    await page.locator(route.ready).waitFor({ state: "visible" });
    await expectDarkPage(page, `${label} ${route.pathname}`, route.surfaces);
  }
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
  assert(await items.count() === 3, `${label} should expose three primary mobile navigation items`);
  for (let index = 0; index < 3; index += 1) {
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

async function expectDarkAuthenticatedModal(dialog, label) {
  await dialog.waitFor({ state: "visible" });
  const theme = await dialog.evaluate((element) => {
    const parseColor = (value) => {
      const match = value.match(/rgba?\(([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,/\s]+([\d.]+))?\)/);
      return match
        ? { red: Number(match[1]), green: Number(match[2]), blue: Number(match[3]), alpha: match[4] === undefined ? 1 : Number(match[4]) }
        : null;
    };
    const luminance = ({ red, green, blue }) => (red * .2126) + (green * .7152) + (blue * .0722);
    const modalStyle = getComputedStyle(element);
    const modalBackground = parseColor(modalStyle.backgroundColor);
    const modalForeground = parseColor(modalStyle.color);
    const selectors = [
      ".modal-icon",
      ".link-input input",
      ".recognition-note",
      ".metadata-status",
      ".image-preview > label",
      ".priority-picker",
      ".wish-settings > label",
      ".modal-actions",
      "input:not([type='checkbox']):not([type='radio']):not([type='hidden'])",
      "textarea",
      "select",
    ];
    const surfaces = [...new Set(selectors.flatMap((selector) => [...element.querySelectorAll(selector)]))]
      .filter((node) => {
        const style = getComputedStyle(node);
        const rect = node.getBoundingClientRect();
        return rect.width > 1 && rect.height > 1 && style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) > .01;
      })
      .map((node) => {
        const color = parseColor(getComputedStyle(node).backgroundColor);
        if (!color || !modalBackground) return { selector: node.className || node.tagName, luminance: null };
        const effective = color.alpha >= 1
          ? color
          : {
              red: (color.red * color.alpha) + (modalBackground.red * (1 - color.alpha)),
              green: (color.green * color.alpha) + (modalBackground.green * (1 - color.alpha)),
              blue: (color.blue * color.alpha) + (modalBackground.blue * (1 - color.alpha)),
            };
        return { selector: node.className || node.tagName, luminance: luminance(effective) };
      });
    return {
      background: modalBackground && luminance(modalBackground),
      foreground: modalForeground && luminance(modalForeground),
      prefersLight: matchMedia("(prefers-color-scheme: light)").matches,
      htmlColorScheme: getComputedStyle(document.documentElement).colorScheme,
      bodyColorScheme: getComputedStyle(document.body).colorScheme,
      modalColorScheme: modalStyle.colorScheme,
      lightSurfaces: surfaces.filter((surface) => surface.luminance === null || surface.luminance > 115),
    };
  });
  assert(theme.prefersLight, `${label} dark-modal regression must run while the browser requests a light system theme`);
  assert(theme.htmlColorScheme === "dark", `${label} does not keep the root color-scheme dark`);
  assert(theme.bodyColorScheme === "dark", `${label} does not keep the body color-scheme dark`);
  assert(theme.modalColorScheme === "dark", `${label} does not set the modal color-scheme to dark`);
  assert(theme.background !== null && theme.background <= 80, `${label} uses a light modal surface (luminance ${theme.background})`);
  assert(theme.foreground !== null && theme.foreground >= 170, `${label} does not use light foreground text on its dark surface`);
  assert(
    theme.lightSurfaces.length === 0,
    `${label} contains light form surfaces: ${theme.lightSurfaces.map((surface) => `${surface.selector} (${surface.luminance})`).join(", ")}`,
  );
}

async function waitForAppRoute(page, pathname) {
  await page.goto(`${baseUrl}${pathname}`, { waitUntil: "domcontentloaded" });
  await page.locator(".app-page").waitFor({ state: "visible" });
  await page.waitForURL((url) => url.pathname === pathname);
}

function friendRow(page, username) {
  return page.locator(`.friend-row[data-username="${username}"]`);
}

function isPeopleSearchResponse(response, search) {
  if (response.request().method() !== "GET") return false;
  const url = new URL(response.url());
  return url.pathname === "/api/people" && url.searchParams.get("search") === search;
}

function isPeopleSectionResponse(response, section, search = "") {
  if (!isPeopleSearchResponse(response, search)) return false;
  const scope = section === "search" ? "discover" : section;
  return new URL(response.url()).searchParams.get("scope") === scope;
}

async function getLevFollowing(page, label) {
  const response = await apiFromPage(page, "/api/people?search=lev");
  assert(response.ok, `${label} could not read Lev's relationship state: ${response.status}`);
  const lev = response.data?.people?.find((person) => person.username === "lev");
  assert(lev, `${label} could not find the seeded Lev profile`);
  return Boolean(lev.isFollowing);
}

async function ensureLevFollowing(page, expected, label) {
  const current = await getLevFollowing(page, label);
  if (current === expected) return;
  const response = await apiFromPage(page, "/api/profile/lev/follow", { method: "POST", body: {} });
  assert(response.ok, `${label} could not restore Lev's relationship state: ${response.status}`);
  assert(response.data?.following === expected, `${label} restored Lev to the wrong relationship state`);
}

async function clickFriendMenuAction(page, row, personName, action) {
  const menuButton = row.getByRole("button", { name: `Действия для ${personName}`, exact: true });
  await menuButton.waitFor({ state: "visible" });
  await menuButton.click();
  const item = row.locator(".friend-row__menu").getByRole("button", { name: action, exact: true });
  await item.waitFor({ state: "visible" });
  await item.click();
}

async function waitForFriendsResults(page) {
  await page.locator(".friends-directory > .inline-loader").waitFor({ state: "detached" });
  await page.waitForFunction(() => (
    Boolean(document.querySelector(".friends-directory .friends-list"))
    || Boolean(document.querySelector(".friends-directory .friends-empty"))
  ));
}

async function waitForOnlyFriend(page, username) {
  await page.waitForFunction((expectedUsername) => {
    const rows = [...document.querySelectorAll(".friend-row")];
    return rows.length === 1 && rows[0].dataset.username === expectedUsername;
  }, username);
}

async function waitForFriendSet(page, usernames) {
  await page.waitForFunction((expectedUsernames) => {
    const actual = [...document.querySelectorAll(".friend-row")].map((row) => row.dataset.username).sort();
    return actual.length === expectedUsernames.length
      && expectedUsernames.every((username, index) => username === actual[index]);
  }, [...usernames].sort());
}

async function expectFriendsNavigation(page, activeTab, label) {
  const navigation = page.getByRole("navigation", { name: "Разделы друзей" });
  await navigation.waitFor({ state: "visible" });
  const links = navigation.getByRole("link");
  assert(await links.count() === 3, `${label} should expose three friend sections`);
  for (const [tab, pathname] of Object.entries(friendsRoutes)) {
    const link = navigation.getByRole("link", { name: friendsLabels[tab], exact: true });
    assert(await link.getAttribute("href") === pathname, `${label} ${friendsLabels[tab]} points to the wrong route`);
  }
  const activeLink = navigation.getByRole("link", { name: friendsLabels[activeTab], exact: true });
  assert(await activeLink.getAttribute("aria-current") === "page", `${label} does not identify ${friendsLabels[activeTab]} as the active section`);
  return navigation;
}

async function openFriendsTab(page, tab, label) {
  const navigation = page.getByRole("navigation", { name: "Разделы друзей" });
  const link = navigation.getByRole("link", { name: friendsLabels[tab], exact: true });
  const dataResponsePromise = page.waitForResponse((response) => isPeopleSectionResponse(response, tab));
  await link.click();
  await page.waitForURL((url) => url.pathname === friendsRoutes[tab]);
  await page.locator(".friends-page").waitFor({ state: "visible" });
  await page.getByRole("heading", { name: friendsLabels[tab], exact: true }).waitFor({ state: "visible" });
  const dataResponse = await dataResponsePromise;
  assert(dataResponse.ok(), `${label} data request failed: ${dataResponse.status()}`);
  await waitForFriendsResults(page);
  await expectFriendsNavigation(page, tab, label);
}

async function expectFriendsLayout(page, label, { mobile }) {
  const navigation = page.getByRole("navigation", { name: "Разделы друзей" });
  const firstRow = page.locator(".friend-row").first();
  await navigation.waitFor({ state: "visible" });
  await firstRow.waitFor({ state: "visible" });
  await waitForStableLayout(page);
  const geometry = await page.evaluate((navigationSelector) => {
    const navigationNode = document.querySelector(navigationSelector);
    const rowNode = document.querySelector(".friend-row");
    const navigationRect = navigationNode?.getBoundingClientRect();
    const rowRect = rowNode?.getBoundingClientRect();
    const linkRects = [...(navigationNode?.querySelectorAll("a") || [])].map((link) => {
      const rect = link.getBoundingClientRect();
      return { width: rect.width, height: rect.height };
    });
    return {
      viewportWidth: document.documentElement.clientWidth,
      navigation: navigationRect && { left: navigationRect.left, right: navigationRect.right, top: navigationRect.top, bottom: navigationRect.bottom, width: navigationRect.width },
      row: rowRect && { left: rowRect.left, right: rowRect.right, top: rowRect.top, width: rowRect.width },
      linkRects,
    };
  }, mobile ? ".friends-section-nav" : ".sidebar__friend-nav");
  assert(geometry.navigation && geometry.row, `${label} is missing its friend navigation or list geometry`);
  assert(geometry.row.right <= geometry.viewportWidth + 1, `${label} friend rows extend beyond the viewport`);
  if (mobile) {
    assert(geometry.navigation.bottom <= geometry.row.top + 1, `${label} friend navigation should sit above the mobile list`);
    assert(geometry.navigation.width <= geometry.viewportWidth + 1, `${label} mobile friend navigation overflows the viewport`);
    assert(geometry.linkRects.every((rect) => rect.height >= 40), `${label} mobile friend navigation has undersized touch targets`);
    const pageHeight = await page.evaluate(() => ({ viewport: window.innerHeight, document: document.documentElement.scrollHeight }));
    assert(pageHeight.document <= pageHeight.viewport + 1, `${label} adds empty mobile scrolling (${pageHeight.document}px document inside ${pageHeight.viewport}px viewport)`);
  } else {
    assert(geometry.navigation.right <= geometry.row.left + 1, `${label} friend navigation should form a desktop side rail`);
    assert(geometry.row.width > geometry.navigation.width, `${label} desktop friend list should be wider than its side rail`);
    const dock = page.locator(".friends-topbar__dock");
    await dock.waitFor({ state: "visible" });
    assert(await dock.locator(":scope > a:not(.friends-topbar__search)").count() === 3, `${label} desktop top dock should expose the three primary sections`);
  }
}

async function expectWideFriendsLayout(page, label) {
  await page.setViewportSize({ width: 1912, height: 991 });
  try {
    await page.goto(`${baseUrl}${friendsRoutes.subscriptions}`, { waitUntil: "domcontentloaded" });
    await page.locator(".friends-page").waitFor({ state: "visible" });
    await friendRow(page, "max").waitFor({ state: "visible" });
    await expectFriendsLayout(page, label, { mobile: false });
    await expectNoRootOverflow(page, label);
    const searchGeometry = await page.locator(".friends-search").evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return { width: rect.width, rightGap: window.innerWidth - rect.right };
    });
    assert(searchGeometry.width >= 1200, `${label} search remains capped on a wide viewport (${searchGeometry.width}px)`);
    assert(searchGeometry.rightGap <= 150, `${label} search is too far from the right edge (${searchGeometry.rightGap}px)`);
    await page.screenshot({ path: "/tmp/rollapp-wide-friends-1912.png", fullPage: true });
  } finally {
    await page.setViewportSize({ width: 1440, height: 1000 });
  }
}

async function expectFriendsMenus(page, label) {
  const rowTrigger = friendRow(page, "max").getByRole("button", { name: "Действия для Макс Ветров", exact: true });
  await rowTrigger.click();
  const rowPopover = friendRow(page, "max").locator(".friend-row__menu");
  await rowPopover.waitFor({ state: "visible" });
  await page.keyboard.press("Escape");
  await rowPopover.waitFor({ state: "detached" });
  assert(await rowTrigger.evaluate((element) => document.activeElement === element), `${label} row popover does not restore trigger focus after Escape`);

  const accountTrigger = page.getByRole("button", { name: "Открыть меню аккаунта", exact: true });
  if (!(await accountTrigger.isVisible())) return;
  await accountTrigger.click();
  const accountPanel = page.locator("#friends-account-menu");
  await accountPanel.waitFor({ state: "visible" });
  await accountPanel.getByRole("link", { name: /Уведомления/ }).waitFor();
  await accountPanel.getByRole("link", { name: "Настройки", exact: true }).waitFor();
  await accountPanel.getByRole("button", { name: "Выйти", exact: true }).waitFor();
  await page.keyboard.press("Escape");
  await accountPanel.waitFor({ state: "detached" });
  assert(await accountTrigger.evaluate((element) => document.activeElement === element), `${label} account menu does not restore trigger focus after Escape`);
}

async function expectFriendsRegression(page, label, { mobile }) {
  await page.goto(`${baseUrl}/app/friends`, { waitUntil: "domcontentloaded" });
  await page.waitForURL((url) => url.pathname === friendsRoutes.subscriptions);
  await page.locator(".friends-page").waitFor({ state: "visible" });
  const initialLevFollowing = await getLevFollowing(page, label);
  try {
    await ensureLevFollowing(page, false, label);
    await page.goto(`${baseUrl}${friendsRoutes.subscriptions}`, { waitUntil: "domcontentloaded" });
    await page.locator(".friends-page").waitFor({ state: "visible" });
    await friendRow(page, "max").waitFor({ state: "visible" });
    await friendRow(page, "sonya").waitFor({ state: "visible" });
    assert(await friendRow(page, "lev").count() === 0, `${label} subscriptions include an unfollowed profile`);
    await expectFriendsNavigation(page, "subscriptions", label);
    await expectFriendsLayout(page, label, { mobile });
    await expectFriendsMenus(page, label);
    await expectDarkPage(page, `${label} subscriptions`, [".app-layout--dark", ".app-main", ".friends-page"]);
    await expectNoRootOverflow(page, `${label} subscriptions`);
    if (mobile) await expectMobileAppShell(page, `${label} subscriptions`);
    await page.screenshot({
      path: mobile ? "/tmp/rollapp-mobile-friends-390.png" : "/tmp/rollapp-desktop-friends.png",
      fullPage: true,
    });

    const subscriptionsSearch = page.getByPlaceholder("Поиск по подпискам");
    const maxSearchResponse = page.waitForResponse((response) => isPeopleSearchResponse(response, "Макс"));
    await subscriptionsSearch.fill("Макс");
    assert((await maxSearchResponse).ok(), `${label} subscription search request failed`);
    await waitForFriendsResults(page);
    await waitForOnlyFriend(page, "max");
    await friendRow(page, "max").waitFor({ state: "visible" });
    assert(await page.locator(".friend-row").count() === 1, `${label} subscription search did not narrow the result list`);
    const clearSearchResponse = page.waitForResponse((response) => isPeopleSearchResponse(response, ""));
    await subscriptionsSearch.fill("");
    assert((await clearSearchResponse).ok(), `${label} subscription search reset request failed`);
    await friendRow(page, "sonya").waitFor({ state: "visible" });

    await openFriendsTab(page, "followers", `${label} followers`);
    await friendRow(page, "max").waitFor({ state: "visible" });
    await friendRow(page, "sonya").waitFor({ state: "visible" });
    assert(await friendRow(page, "lev").count() === 0, `${label} followers include a profile that does not follow the owner`);
    await expectNoRootOverflow(page, `${label} followers`);
    if (mobile) await expectMobileAppShell(page, `${label} followers`);
    const followersSearch = page.getByPlaceholder("Поиск по подписчикам");
    const sonyaSearchResponse = page.waitForResponse((response) => isPeopleSectionResponse(response, "followers", "Соня"));
    await followersSearch.fill("Соня");
    assert((await sonyaSearchResponse).ok(), `${label} follower search request failed`);
    await waitForOnlyFriend(page, "sonya");
    const clearFollowersResponse = page.waitForResponse((response) => isPeopleSectionResponse(response, "followers"));
    await followersSearch.fill("");
    assert((await clearFollowersResponse).ok(), `${label} follower search reset request failed`);
    await waitForFriendSet(page, ["max", "sonya"]);

    await openFriendsTab(page, "search", `${label} search`);
    const peopleSearch = page.locator(".friends-page input").first();
    await peopleSearch.waitFor({ state: "visible" });
    const levSearchResponse = page.waitForResponse((response) => isPeopleSearchResponse(response, "lev"));
    await peopleSearch.fill("lev");
    assert((await levSearchResponse).ok(), `${label} people search request failed`);
    await waitForFriendsResults(page);
    await waitForOnlyFriend(page, "lev");
    const levSearchRow = friendRow(page, "lev");
    await levSearchRow.waitFor({ state: "visible" });
    assert(await page.locator(".friend-row").count() === 1, `${label} people search did not isolate Lev`);
    assert(await levSearchRow.getByRole("link").first().getAttribute("href") === "/lev", `${label} Lev row does not open the canonical profile route`);
    await expectNoRootOverflow(page, `${label} search`);
    if (mobile) await expectMobileAppShell(page, `${label} search`);

    const followResponsePromise = page.waitForResponse((response) => (
      response.request().method() === "POST" && new URL(response.url()).pathname === "/api/profile/lev/follow"
    ));
    await clickFriendMenuAction(page, levSearchRow, "Лев Орлов", "Подписаться");
    const followResponse = await followResponsePromise;
    assert(followResponse.ok(), `${label} could not follow Lev: ${followResponse.status()}`);
    assert((await followResponse.json()).following === true, `${label} follow action returned the wrong state`);

    await openFriendsTab(page, "subscriptions", `${label} subscriptions after follow`);
    const followedLevRow = friendRow(page, "lev");
    await followedLevRow.waitFor({ state: "visible" });
    await waitForFriendSet(page, ["lev", "max", "sonya"]);
    await openFriendsTab(page, "followers", `${label} followers after follow`);
    await friendRow(page, "max").waitFor({ state: "visible" });
    await friendRow(page, "sonya").waitFor({ state: "visible" });
    assert(await friendRow(page, "lev").count() === 0, `${label} confuses outgoing subscriptions with incoming followers`);
    await openFriendsTab(page, "subscriptions", `${label} subscriptions before unfollow`);
    await followedLevRow.waitFor({ state: "visible" });

    const unfollowResponsePromise = page.waitForResponse((response) => (
      response.request().method() === "POST" && new URL(response.url()).pathname === "/api/profile/lev/follow"
    ));
    const subscriptionsRefreshPromise = page.waitForResponse((response) => isPeopleSectionResponse(response, "subscriptions"));
    await clickFriendMenuAction(page, followedLevRow, "Лев Орлов", "Отписаться");
    const unfollowResponse = await unfollowResponsePromise;
    assert(unfollowResponse.ok(), `${label} could not unfollow Lev: ${unfollowResponse.status()}`);
    assert((await unfollowResponse.json()).following === false, `${label} unfollow action returned the wrong state`);
    assert((await subscriptionsRefreshPromise).ok(), `${label} subscriptions did not reload after unfollowing Lev`);
    await waitForFriendsResults(page);
    await followedLevRow.waitFor({ state: "detached" });
    assert(await getLevFollowing(page, label) === false, `${label} did not persist Lev's unfollowed state`);
  } finally {
    await ensureLevFollowing(page, initialLevFollowing, `${label} cleanup`);
  }
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

async function expectReferenceDesktopProfile(page, label, { guest = false } = {}) {
  await waitForStableLayout(page);
  const geometry = await page.evaluate((isGuest) => {
    const rect = (selector) => {
      const value = document.querySelector(selector)?.getBoundingClientRect();
      return value ? { x: value.x, y: value.y, width: value.width, height: value.height } : null;
    };
    return {
      layout: rect(".public-profile__layout"),
      rail: rect(isGuest ? ".profile-guest-rail" : ".profile-list-rail"),
      main: rect(".public-profile__layout > main"),
      avatar: rect(".profile-cover .avatar--xl"),
      heading: rect(".public-wishes-head"),
      grid: rect(".public-profile .wish-grid"),
      card: rect(".public-profile .wish-card__image"),
      backDisplay: getComputedStyle(document.querySelector(".public-profile__back")).display,
      tabsDisplay: getComputedStyle(document.querySelector(".public-list-tabs")).display,
    };
  }, guest);
  const close = (actual, expected, tolerance = 2) => Math.abs(actual - expected) <= tolerance;
  assert(close(geometry.layout.x, 0) && close(geometry.layout.width, 1912), `${label} layout is not full width`);
  assert(close(geometry.rail.x, 16) && close(geometry.rail.width, 280), `${label} rail geometry differs from the reference`);
  assert(close(geometry.main.x, 312) && close(geometry.main.width, 1584), `${label} main geometry differs from the reference`);
  assert(close(geometry.avatar.x, 1004) && close(geometry.avatar.y, 116) && close(geometry.avatar.width, 200), `${label} avatar geometry differs from the reference`);
  assert(close(geometry.heading.x, 312) && close(geometry.heading.y, guest ? 612 : 534) && close(geometry.heading.height, 41), `${label} heading geometry differs from the reference`);
  assert(close(geometry.grid.x, 312) && close(geometry.grid.y, guest ? 683 : 605), `${label} grid geometry differs from the reference`);
  assert(close(geometry.card.width, 236) && close(geometry.card.height, 286), `${label} card geometry differs from the reference`);
  assert(geometry.backDisplay === (guest ? "flex" : "none"), `${label} desktop back control is in the wrong presentation mode`);
  assert(geometry.tabsDisplay === (guest ? "flex" : "none"), `${label} desktop list navigation is in the wrong presentation mode`);
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
  assert(geometry.left >= -10 && geometry.right > 4, `${label} profile dock does not match the compact reference placement`);
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

async function expectFulfilledActionContrast(page, dialog, label) {
  const action = dialog.getByRole("button", { name: "Отметить исполненным", exact: true });
  await action.waitFor({ state: "visible" });
  assert(await action.isEnabled(), `${label} fulfilled action is disabled`);
  const readState = () => action.evaluate((element) => {
    const parse = (value) => {
      const numbers = value.match(/[\d.]+/g)?.map(Number) || [];
      return { red: numbers[0] || 0, green: numbers[1] || 0, blue: numbers[2] || 0, alpha: numbers[3] ?? 1 };
    };
    const blend = (front, back) => ({
      red: front.red * front.alpha + back.red * (1 - front.alpha),
      green: front.green * front.alpha + back.green * (1 - front.alpha),
      blue: front.blue * front.alpha + back.blue * (1 - front.alpha),
      alpha: 1,
    });
    const channel = (value) => {
      const normalized = value / 255;
      return normalized <= .04045 ? normalized / 12.92 : ((normalized + .055) / 1.055) ** 2.4;
    };
    const luminance = (color) => .2126 * channel(color.red) + .7152 * channel(color.green) + .0722 * channel(color.blue);
    const style = getComputedStyle(element);
    const modal = element.closest(".modal--wish-detail");
    const modalBackground = parse(getComputedStyle(modal).backgroundColor);
    const opacity = Number(style.opacity);
    const opaqueBackground = blend(parse(style.backgroundColor), modalBackground);
    const opaqueForeground = blend(parse(style.color), opaqueBackground);
    const background = blend({ ...opaqueBackground, alpha: opacity }, modalBackground);
    const foreground = blend({ ...opaqueForeground, alpha: opacity }, modalBackground);
    const foregroundLuminance = luminance(foreground);
    const backgroundLuminance = luminance(background);
    return {
      hovered: element.matches(":hover"),
      focusVisible: element.matches(":focus-visible"),
      disabled: element.disabled,
      color: style.color,
      backgroundColor: style.backgroundColor,
      outlineStyle: style.outlineStyle,
      outlineWidth: parseFloat(style.outlineWidth),
      backgroundLuminance,
      contrast: (Math.max(foregroundLuminance, backgroundLuminance) + .05) / (Math.min(foregroundLuminance, backgroundLuminance) + .05),
    };
  });

  await page.mouse.move(1, 1);
  await page.waitForTimeout(240);
  const defaultState = await readState();
  await action.hover();
  await page.waitForTimeout(240);
  const hoverState = await readState();
  await page.mouse.move(1, 1);
  let keyboardFocused = await action.evaluate((element) => document.activeElement === element);
  for (let step = 0; step < 16 && !keyboardFocused; step += 1) {
    await page.keyboard.press("Tab");
    keyboardFocused = await action.evaluate((element) => document.activeElement === element);
  }
  assert(keyboardFocused, `${label} completion action is not keyboard reachable`);
  await page.waitForTimeout(240);
  const focusState = await readState();
  await action.evaluate((element) => { element.disabled = true; });
  await page.waitForTimeout(240);
  const disabledState = await readState();
  await action.evaluate((element) => { element.disabled = false; });
  for (const [stateLabel, state] of [["default", defaultState], ["hover", hoverState], ["focus", focusState], ["disabled", disabledState]]) {
    assert(state.contrast >= 4.5, `${label} ${stateLabel} completion action contrast is ${state.contrast.toFixed(2)} (${state.color} on ${state.backgroundColor})`);
    assert(state.backgroundLuminance <= .08, `${label} ${stateLabel} completion action leaked a light background (${state.backgroundColor})`);
  }
  assert(hoverState.hovered, `${label} completion action did not enter its hover state`);
  assert(focusState.focusVisible, `${label} completion action has no visible keyboard focus`);
  assert(focusState.outlineStyle !== "none" && focusState.outlineWidth >= 2, `${label} completion action focus outline is missing`);
  assert(disabledState.disabled, `${label} completion action did not enter its disabled state`);
  await action.hover();
  await page.waitForTimeout(240);
}

try {
  const desktop = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1, colorScheme: "light" });
  const guestRoot = await desktop.newPage();
  await guestRoot.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await guestRoot.waitForURL((url) => url.pathname === "/login");
  await guestRoot.getByRole("heading", { name: "Войти в Rollapp" }).waitFor();
  assert(!(await guestRoot.locator("body").innerText()).includes("Тайный Санта"), "Removed Secret Santa content is still visible on the login page");
  await expectDarkPage(guestRoot, "Desktop login page", [".auth-page", ".auth-art", ".auth-panel"]);
  await expectNoRootOverflow(guestRoot, "Desktop login page");
  await guestRoot.screenshot({ path: "/tmp/rollapp-desktop-login.png", fullPage: true });
  await expectUnauthenticatedDarkRoutes(guestRoot, "Desktop unauthenticated");

  const loginResponse = await desktop.request.post(`${baseUrl}/api/auth/demo`, { data: {} });
  assert(loginResponse.ok(), `Demo login failed: ${loginResponse.status()}`);

  const dashboard = await desktop.newPage();
  await dashboard.goto(`${baseUrl}/app`, { waitUntil: "domcontentloaded" });
  await dashboard.waitForURL((url) => url.pathname === "/app/wishes");
  await dashboard.locator(".app-page").waitFor({ state: "visible" });
  await dashboard.getByRole("heading", { name: "Мои желания" }).waitFor();
  assert(!(await dashboard.locator("body").innerText()).includes("Тайный Санта"), "Removed Secret Santa content is still visible in the authenticated app");
  assert(await dashboard.locator(".sidebar").isVisible(), "Desktop app sidebar is not visible");
  assert(await dashboard.locator(".sidebar__nav a").count() === 3, "Desktop app navigation should contain the three primary sections");
  assert(await dashboard.locator(".mobile-bottom-nav a").count() === 3, "Mobile app navigation should contain the three primary sections");
  await expectDarkPage(dashboard, "Desktop /app/wishes", [".app-layout--dark", ".app-main", ".app-page"]);
  await expectNoRootOverflow(dashboard, "Desktop dashboard");
  await dashboard.screenshot({ path: "/tmp/rollapp-desktop-app.png", fullPage: true });

  await waitForAppRoute(dashboard, "/app/wishes");
  const desktopCard = dashboard.locator(".wish-card").first();
  await desktopCard.getByRole("button", { name: /Опции желания/ }).click();
  await desktopCard.locator(".card-menu").waitFor({ state: "visible" });
  assert((await dashboard.locator(".modal--wish-detail").count()) === 0, "Wish options must not open the detail dialog");
  await desktopCard.getByRole("button", { name: /Опции желания/ }).click();
  const desktopDetail = await expectWishDetailsOpen(dashboard, "Desktop owner wish");
  await expectDarkAuthenticatedModal(desktopDetail.dialog, "Desktop owner wish detail");
  await expectFulfilledActionContrast(dashboard, desktopDetail.dialog, "Desktop owner wish detail");
  await waitForStableLayout(dashboard);
  await dashboard.screenshot({ path: "/tmp/rollapp-desktop-wish-detail.png" });
  await dashboard.keyboard.press("Escape");
  await desktopDetail.dialog.waitFor({ state: "detached" });
  assert(await desktopDetail.opener.evaluate((element) => document.activeElement === element), "Closing wish detail should restore focus to its card");

  await dashboard.goto(`${baseUrl}/app/santa`, { waitUntil: "domcontentloaded" });
  await dashboard.waitForURL((url) => url.pathname === "/app/wishes");
  await dashboard.getByRole("heading", { name: "Мои желания" }).waitFor();
  await expectFriendsRegression(dashboard, "Desktop friends", { mobile: false });
  await expectWideFriendsLayout(dashboard, "1912px friends");
  for (const pathname of ["/app/wishes", "/app/ideas", friendsRoutes.subscriptions, "/app/notifications", "/app/settings"]) {
    await waitForAppRoute(dashboard, pathname);
    await expectDarkPage(dashboard, `Desktop ${pathname}`, [".app-layout--dark", ".app-main", ".app-page"]);
  }
  await desktop.close();

  // Deliberately keep Chromium's ordinary desktop User-Agent. Responsive behavior
  // must be driven by viewport/CSS, not a server-side mobile User-Agent branch.
  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, colorScheme: "light" });
  const mobilePage = await mobile.newPage();
  await mobilePage.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await mobilePage.waitForURL((url) => url.pathname === "/login");
  await mobilePage.getByRole("heading", { name: "Войти в Rollapp" }).waitFor();
  await expectDesktopUserAgent(mobilePage, "390px viewport");
  await expectDarkPage(mobilePage, "390px login page", [".auth-page", ".auth-panel"]);
  await expectNoRootOverflow(mobilePage, "390px login page");
  await mobilePage.screenshot({ path: "/tmp/rollapp-mobile-login.png", fullPage: true });
  await expectUnauthenticatedDarkRoutes(mobilePage, "390px unauthenticated");

  const mobileLoginResponse = await mobile.request.post(`${baseUrl}/api/auth/demo`, { data: {} });
  assert(mobileLoginResponse.ok(), `Mobile demo login failed: ${mobileLoginResponse.status()}`);

  await mobilePage.goto(`${baseUrl}/app`, { waitUntil: "domcontentloaded" });
  await mobilePage.waitForURL((url) => url.pathname === "/app/wishes");
  await mobilePage.getByRole("heading", { name: "Мои желания" }).waitFor();
  await mobilePage.goto(`${baseUrl}/app/gifts`, { waitUntil: "domcontentloaded" });
  await mobilePage.waitForURL((url) => url.pathname === "/app/wishes");
  await mobilePage.getByRole("heading", { name: "Мои желания" }).waitFor();

  const appRoutes = ["/app/wishes", "/app/ideas", friendsRoutes.subscriptions, "/app/notifications", "/app/settings"];
  for (const pathname of appRoutes) {
    await waitForAppRoute(mobilePage, pathname);
    await expectMobileAppShell(mobilePage, pathname);
    await expectDarkPage(mobilePage, `390px ${pathname}`, [".app-layout--dark", ".app-main", ".app-page"]);
    await expectNoRootOverflow(mobilePage, `390px ${pathname}`);
    if (pathname === "/app/wishes") {
      await mobilePage.screenshot({ path: "/tmp/rollapp-mobile-wishes-390.png", fullPage: true });
      const mobileDetail = await expectWishDetailsOpen(mobilePage, "390px owner wish", { fullscreen: true });
      await expectDarkAuthenticatedModal(mobileDetail.dialog, "390px owner wish detail");
      await expectFulfilledActionContrast(mobilePage, mobileDetail.dialog, "390px owner wish detail");
      await expectNoRootOverflow(mobilePage, "390px wish detail");
      await mobilePage.screenshot({ path: "/tmp/rollapp-mobile-wish-detail.png" });
      await mobileDetail.dialog.getByRole("button", { name: "Закрыть диалог" }).click();
      await mobileDetail.dialog.waitFor({ state: "detached" });
    }
  }
  await expectFriendsRegression(mobilePage, "390px friends", { mobile: true });

  await mobilePage.goto(`${baseUrl}/ideas`, { waitUntil: "domcontentloaded" });
  const publicIdeaCard = mobilePage.locator(".public-ideas .idea-card").first();
  await publicIdeaCard.waitFor({ state: "visible" });
  await expectDarkPage(mobilePage, "390px public ideas", [".public-ideas", ".public-ideas > main"]);
  await publicIdeaCard.locator(".idea-card__image > button").click();
  const publicIdeaDialog = mobilePage.getByRole("dialog", { name: "Диалог Rollapp" });
  await expectDarkAuthenticatedModal(publicIdeaDialog, "390px public ideas save modal");
  await publicIdeaDialog.getByRole("button", { name: "Закрыть диалог" }).click();
  await publicIdeaDialog.waitFor({ state: "detached" });

  await waitForAppRoute(mobilePage, "/app/wishes");
  await expectMobileAppShell(mobilePage, "/app/wishes");
  await mobilePage.screenshot({ path: "/tmp/rollapp-mobile-app.png", fullPage: true });

  await mobilePage.getByRole("button", { name: "Открыть меню" }).click();
  const drawer = mobilePage.locator("#app-sidebar.is-open");
  await drawer.waitFor({ state: "visible" });
  await expectDarkPage(mobilePage, "390px application drawer", [".app-layout--dark", ".app-main", "#app-sidebar.is-open"]);
  await waitForStableLayout(mobilePage);
  await mobilePage.screenshot({ path: "/tmp/rollapp-mobile-app-drawer.png" });
  await drawer.getByRole("button", { name: "Закрыть меню" }).click();
  await mobilePage.waitForFunction(() => !document.querySelector("#app-sidebar")?.classList.contains("is-open"));

  await mobilePage.getByRole("button", { name: "Добавить", exact: true }).click();
  const wishDialog = mobilePage.getByRole("dialog", { name: "Диалог Rollapp" });
  await wishDialog.waitFor({ state: "visible" });
  await wishDialog.getByRole("heading", { name: "Добавим мечту" }).waitFor();
  assert(await wishDialog.locator(".link-step input[type='url']").isVisible(), "Wish modal should open on the product-link step");
  assert(await wishDialog.getByRole("button", { name: "Продолжить" }).isVisible(), "Wish link step continue action is not visible");
  await expectDarkAuthenticatedModal(wishDialog, "390px add-wish link step");
  await waitForStableLayout(mobilePage);
  await mobilePage.screenshot({ path: "/tmp/rollapp-mobile-wish-link-modal.png" });
  await wishDialog.getByRole("button", { name: /заполнить вручную/i }).click();
  await wishDialog.getByRole("heading", { name: "Проверьте карточку" }).waitFor();
  const addWishAction = wishDialog.getByRole("button", { name: "Добавить желание" });
  await addWishAction.scrollIntoViewIfNeeded();
  assert(await addWishAction.isVisible(), "Wish details action is not reachable inside the mobile bottom sheet");
  await expectDarkAuthenticatedModal(wishDialog, "390px add-wish details step");
  await waitForStableLayout(mobilePage);
  await mobilePage.screenshot({ path: "/tmp/rollapp-mobile-wish-details-modal.png" });
  await wishDialog.getByRole("button", { name: "Закрыть диалог" }).click();
  await wishDialog.waitFor({ state: "detached" });

  const mobileDashboardResponse = await apiFromPage(mobilePage, "/api/dashboard");
  assert(mobileDashboardResponse.ok, `Mobile category regression dashboard failed: ${mobileDashboardResponse.status}`);
  const mobileDashboard = mobileDashboardResponse.data;
  const mobileCategoryLists = mobileDashboard.lists.filter((list) => !(list.title === "Мои желания" && list.description === "Всё, чему я буду рад"));
  const mobileWishToMove = mobileDashboard.wishes.find((wish) => (
    wish.status === "active" && wish.listIds.length === 1 && mobileCategoryLists.some((list) => list.id === wish.listIds[0])
  ));
  const mobileSourceList = mobileCategoryLists.find((list) => list.id === mobileWishToMove?.listIds[0]);
  const mobileTargetList = mobileCategoryLists.find((list) => list.id !== mobileSourceList?.id);
  assert(mobileWishToMove && mobileSourceList && mobileTargetList, "Mobile category regression needs one wish and two themed lists");
  const mobileOriginalListIds = [...mobileWishToMove.listIds];
  try {
    await mobilePage.goto(`${baseUrl}/alisa`, { waitUntil: "domcontentloaded" });
    await mobilePage.locator(".public-profile.is-owner").waitFor({ state: "visible" });
    await expectDarkPage(mobilePage, "390px public owner profile", [".public-profile--dark", ".public-profile__layout > main"]);
    await mobilePage.locator(".public-list-tabs button").filter({ hasText: mobileSourceList.title }).click();
    await mobilePage.waitForURL((url) => url.pathname === `/alisa/lists/${mobileSourceList.id}`);
    const mobileListOptions = mobilePage.getByRole("button", { name: "Опции списка" });
    assert(await mobileListOptions.isVisible(), "Mobile owner profile does not expose list management");
    await mobileListOptions.click();
    await mobilePage.getByRole("button", { name: "Редактировать список" }).click();
    const mobileListDialog = mobilePage.getByRole("dialog", { name: `Настройки списка: ${mobileSourceList.title}` });
    await mobileListDialog.waitFor({ state: "visible" });
    await expectDarkAuthenticatedModal(mobileListDialog, "390px list editor");
    await mobileListDialog.getByRole("button", { name: "Закрыть диалог" }).click();
    await mobileListDialog.waitFor({ state: "detached" });
    const mobileOwnerCard = mobilePage.locator(".wish-card").filter({ hasText: mobileWishToMove.title }).first();
    await mobileOwnerCard.waitFor({ state: "visible" });
    await mobileOwnerCard.getByRole("button", { name: `Открыть желание «${mobileWishToMove.title}»` }).click();
    const mobileOwnerDetail = mobilePage.getByRole("dialog", { name: `Желание: ${mobileWishToMove.title}` });
    await mobileOwnerDetail.waitFor({ state: "visible" });
    await expectDarkAuthenticatedModal(mobileOwnerDetail, "390px profile owner wish detail");
    await mobileOwnerDetail.getByRole("button", { name: /^Изменить списки желания\./ }).click();
    const mobileEditDialog = mobilePage.getByRole("dialog", { name: "Диалог Rollapp" });
    await mobileEditDialog.getByRole("heading", { name: "Изменить желание", exact: true }).waitFor();
    await expectDarkAuthenticatedModal(mobileEditDialog, "390px wish editor");
    const mobileSourceChoice = mobileEditDialog.locator(".list-choice > label").filter({ hasText: mobileSourceList.title });
    const mobileTargetChoice = mobileEditDialog.locator(".list-choice > label").filter({ hasText: mobileTargetList.title });
    await mobileSourceChoice.click();
    await mobileTargetChoice.click();
    const mobileSaveButton = mobileEditDialog.getByRole("button", { name: "Сохранить изменения", exact: true });
    await mobileSaveButton.scrollIntoViewIfNeeded();
    const hitTargetIsSave = await mobileSaveButton.evaluate((button) => {
      const rect = button.getBoundingClientRect();
      const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      return hit === button || button.contains(hit);
    });
    assert(hitTargetIsSave, "Mobile wish save action is covered by another interface layer");
    const mobileUpdateResponsePromise = mobilePage.waitForResponse((response) => (
      response.request().method() === "PATCH"
      && new URL(response.url()).pathname === `/api/wishes/${mobileWishToMove.id}`
    ));
    await mobileSaveButton.click();
    const mobileUpdateResponse = await mobileUpdateResponsePromise;
    assert(mobileUpdateResponse.ok(), `Mobile wish category update failed: ${mobileUpdateResponse.status()}`);
    await mobileEditDialog.waitFor({ state: "detached" });
    const mobileAfterMoveResponse = await apiFromPage(mobilePage, "/api/dashboard");
    const mobileMovedWish = mobileAfterMoveResponse.data.wishes.find((wish) => wish.id === mobileWishToMove.id);
    assert(mobileMovedWish && sameMembers(mobileMovedWish.listIds, [mobileTargetList.id]), "Mobile wish category change was not persisted");
  } finally {
    const mobileRestoreResponse = await apiFromPage(mobilePage, `/api/wishes/${mobileWishToMove.id}`, { method: "PATCH", body: { listIds: mobileOriginalListIds } });
    assert(mobileRestoreResponse.ok, `Failed to restore mobile wish membership: ${mobileRestoreResponse.status}`);
  }
  await mobilePage.goto(`${baseUrl}/s/${mobileSourceList.shareToken}`, { waitUntil: "domcontentloaded" });
  await mobilePage.locator(".public-profile.is-owner").waitFor({ state: "visible" });
  await expectDarkPage(mobilePage, "390px shared owner profile", [".public-profile--dark", ".public-profile__layout > main"]);
  assert((await mobilePage.getByRole("button", { name: "Подписаться" }).count()) === 0, "Owner shared list exposes a self-follow action");
  assert(await mobilePage.getByRole("button", { name: "Открыть мой список" }).isVisible(), "Owner shared list does not expose its canonical list action");
  const sharedOwnerCard = mobilePage.locator(".wish-card").first();
  const sharedOwnerWishTitle = (await sharedOwnerCard.locator("h3").innerText()).trim();
  await sharedOwnerCard.getByRole("button", { name: `Открыть желание «${sharedOwnerWishTitle}»` }).click();
  const sharedOwnerDialog = mobilePage.getByRole("dialog", { name: `Желание: ${sharedOwnerWishTitle}` });
  await sharedOwnerDialog.waitFor({ state: "visible" });
  await expectDarkAuthenticatedModal(sharedOwnerDialog, "390px shared owner wish detail");
  assert(await sharedOwnerDialog.getByRole("button", { name: /^Изменить списки желания\./ }).isVisible(), "Owner shared wish does not expose editing");
  await sharedOwnerDialog.getByRole("button", { name: "Закрыть диалог" }).click();
  await sharedOwnerDialog.waitFor({ state: "detached" });
  await mobile.close();

  const narrow = await browser.newContext({ viewport: { width: 360, height: 800 }, deviceScaleFactor: 1, colorScheme: "light" });
  const narrowPage = await narrow.newPage();
  await narrowPage.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await narrowPage.waitForURL((url) => url.pathname === "/login");
  await narrowPage.getByRole("heading", { name: "Войти в Rollapp" }).waitFor();
  await expectDesktopUserAgent(narrowPage, "360px viewport");
  await expectNoRootOverflow(narrowPage, "360px login page");
  const narrowLoginResponse = await narrow.request.post(`${baseUrl}/api/auth/demo`, { data: {} });
  assert(narrowLoginResponse.ok(), `360px demo login failed: ${narrowLoginResponse.status()}`);
  for (const pathname of ["/app/wishes", "/app/settings"]) {
    await waitForAppRoute(narrowPage, pathname);
    await expectMobileAppShell(narrowPage, `360px ${pathname}`);
    await expectNoRootOverflow(narrowPage, `360px ${pathname}`);
  }
  await narrowPage.screenshot({ path: "/tmp/rollapp-mobile-settings-360.png", fullPage: true });
  await waitForAppRoute(narrowPage, "/app/wishes");
  await narrowPage.screenshot({ path: "/tmp/rollapp-mobile-app-360.png", fullPage: true });
  await narrowPage.goto(`${baseUrl}/alisa`, { waitUntil: "domcontentloaded" });
  await expectPublicGrid(narrowPage, 2, "360px public profile");
  await expectPublicMobileShell(narrowPage, "360px public profile");
  await expectNoRootOverflow(narrowPage, "360px public profile");
  await narrow.close();

  const compactPublic = await browser.newContext({ viewport: { width: 320, height: 700 }, deviceScaleFactor: 1, colorScheme: "light" });
  const compactPublicPage = await compactPublic.newPage();
  await compactPublicPage.goto(`${baseUrl}/alisa`, { waitUntil: "domcontentloaded" });
  await expectPublicGrid(compactPublicPage, 2, "320px public profile");
  await expectPublicMobileShell(compactPublicPage, "320px public profile");
  await expectNoRootOverflow(compactPublicPage, "320px public profile");
  await compactPublicPage.screenshot({ path: "/tmp/rollapp-public-profile-320.png", fullPage: true });
  const compactPublicDetail = await expectWishDetailsOpen(compactPublicPage, "320px public wish", { fullscreen: true });
  await expectDarkAuthenticatedModal(compactPublicDetail.dialog, "320px public wish detail");
  await expectNoRootOverflow(compactPublicPage, "320px public wish detail");
  await compactPublicDetail.dialog.getByRole("button", { name: "Закрыть диалог" }).click();
  await compactPublic.close();

  const tabletApp = await browser.newContext({ viewport: { width: 768, height: 1024 }, deviceScaleFactor: 1, colorScheme: "light" });
  const tabletAppPage = await tabletApp.newPage();
  await expectUnauthenticatedDarkRoutes(tabletAppPage, "768px unauthenticated");
  await tabletAppPage.goto(`${baseUrl}/alisa`, { waitUntil: "domcontentloaded" });
  await tabletAppPage.locator(".public-profile.is-guest").waitFor({ state: "visible" });
  await expectDarkPage(tabletAppPage, "768px public guest profile", [".public-profile--dark", ".public-profile__layout > main"]);
  await tabletAppPage.goto(`${baseUrl}/s/${mobileSourceList.shareToken}`, { waitUntil: "domcontentloaded" });
  await tabletAppPage.locator(".public-profile.is-guest").waitFor({ state: "visible" });
  await expectDarkPage(tabletAppPage, "768px shared guest profile", [".public-profile--dark", ".public-profile__layout > main"]);
  const tabletLoginResponse = await tabletApp.request.post(`${baseUrl}/api/auth/demo`, { data: {} });
  assert(tabletLoginResponse.ok(), `768px demo login failed: ${tabletLoginResponse.status()}`);
  for (const pathname of ["/app/wishes", "/app/ideas", friendsRoutes.subscriptions, "/app/notifications", "/app/settings"]) {
    await waitForAppRoute(tabletAppPage, pathname);
    await expectMobileAppShell(tabletAppPage, `768px ${pathname}`);
    await expectDarkPage(tabletAppPage, `768px ${pathname}`, [".app-layout--dark", ".app-main", ".app-page"]);
    await expectNoRootOverflow(tabletAppPage, `768px ${pathname}`);
  }
  await waitForAppRoute(tabletAppPage, "/app/wishes");
  await tabletAppPage.screenshot({ path: "/tmp/rollapp-tablet-wishes-768.png", fullPage: true });
  const tabletOwnerDetail = await expectWishDetailsOpen(tabletAppPage, "768px owner wish", { fullscreen: true });
  await expectDarkAuthenticatedModal(tabletOwnerDetail.dialog, "768px owner wish detail");
  await expectNoRootOverflow(tabletAppPage, "768px owner wish detail");
  await tabletAppPage.screenshot({ path: "/tmp/rollapp-tablet-owner-wish-detail-768.png" });
  await tabletOwnerDetail.dialog.getByRole("button", { name: "Закрыть диалог" }).click();
  await tabletOwnerDetail.dialog.waitFor({ state: "detached" });
  await waitForAppRoute(tabletAppPage, "/app/wishes");
  await tabletAppPage.screenshot({ path: "/tmp/rollapp-tablet-app-768.png", fullPage: true });
  await tabletApp.close();

  const publicMobile = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, colorScheme: "light" });
  const publicMobilePage = await publicMobile.newPage();
  const legacyProfileResponse = await publicMobilePage.request.get(`${baseUrl}/u/alisa?view=fulfilled`, { maxRedirects: 0 });
  assert(legacyProfileResponse.status() === 301, `Legacy profile route should permanently redirect, received ${legacyProfileResponse.status()}`);
  assert(legacyProfileResponse.headers().location === "/alisa?view=fulfilled", `Legacy profile redirect lost its clean path or query: ${legacyProfileResponse.headers().location}`);
  await publicMobilePage.goto(`${baseUrl}/alisa`, { waitUntil: "domcontentloaded" });
  await publicMobilePage.evaluate(() => {
    window.history.pushState({}, "", "/u/alisa?view=fulfilled");
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  await publicMobilePage.waitForURL((url) => url.pathname === "/alisa" && url.search === "?view=fulfilled");
  await publicMobilePage.goto(`${baseUrl}/alisa`, { waitUntil: "domcontentloaded" });
  await expectDesktopUserAgent(publicMobilePage, "390px public profile");
  await expectPublicGrid(publicMobilePage, 2, "390px public profile");
  await expectPublicMobileShell(publicMobilePage, "390px public profile");
  await expectDarkPage(publicMobilePage, "390px public guest profile", [".public-profile--dark", ".public-profile__layout > main"]);
  await expectNoRootOverflow(publicMobilePage, "390px public profile");
  await publicMobilePage.screenshot({ path: "/tmp/rollapp-public-profile-390.png", fullPage: true });
  const publicDetail = await expectWishDetailsOpen(publicMobilePage, "390px public wish", { fullscreen: true });
  await expectDarkAuthenticatedModal(publicDetail.dialog, "390px public guest wish detail");
  const publicWishPath = new URL(publicMobilePage.url()).pathname;
  assert(/^\/alisa\/wishes\/[^/]+$/.test(publicWishPath), `Opening a public wish did not create a clean deep link: ${publicWishPath}`);
  const legacyWishResponse = await publicMobilePage.request.get(`${baseUrl}/u${publicWishPath}`, { maxRedirects: 0 });
  assert(legacyWishResponse.status() === 301, `Legacy wish route should permanently redirect, received ${legacyWishResponse.status()}`);
  assert(legacyWishResponse.headers().location === publicWishPath, `Legacy wish redirect is not canonical: ${legacyWishResponse.headers().location}`);
  await publicMobilePage.screenshot({ path: "/tmp/rollapp-public-wish-detail-390.png" });
  await publicMobilePage.reload({ waitUntil: "domcontentloaded" });
  const reloadedPublicDetail = publicMobilePage.getByRole("dialog", { name: `Желание: ${publicDetail.title}` });
  await reloadedPublicDetail.waitFor({ state: "visible" });
  await expectDarkAuthenticatedModal(reloadedPublicDetail, "390px reloaded public guest wish detail");
  assert(await reloadedPublicDetail.locator(".wish-detail__price").isVisible(), "A public wish deep link did not survive reload");
  await reloadedPublicDetail.getByRole("button", { name: "Закрыть диалог" }).click();
  await reloadedPublicDetail.waitFor({ state: "detached" });
  await publicMobilePage.waitForURL((url) => url.pathname === "/alisa");

  const publicProfileResponse = await apiFromPage(publicMobilePage, "/api/profile/alisa");
  assert(publicProfileResponse.ok, `Public profile API failed during deep-link verification: ${publicProfileResponse.status}`);
  const directList = publicProfileResponse.data.lists.find((list) => (
    list.wishCount > 0 && !(list.title === "Мои желания" && list.description === "Всё, чему я буду рад")
  ));
  assert(directList, "Public list deep-link verification needs a non-empty themed list");
  const legacyListResponse = await publicMobilePage.request.get(`${baseUrl}/users/alisa/lists/${directList.id}`, { maxRedirects: 0 });
  assert(legacyListResponse.status() === 301, `Legacy list route should permanently redirect, received ${legacyListResponse.status()}`);
  assert(legacyListResponse.headers().location === `/alisa/lists/${directList.id}`, `Legacy list redirect is not canonical: ${legacyListResponse.headers().location}`);
  await publicMobilePage.goto(`${baseUrl}/alisa/lists/${directList.id}`, { waitUntil: "domcontentloaded" });
  await publicMobilePage.locator(".public-wishes-head h2").filter({ hasText: directList.title }).waitFor({ state: "visible" });
  assert(await publicMobilePage.locator(".wish-card").count() > 0, "A public list deep link did not render its wishes");
  await publicMobilePage.reload({ waitUntil: "domcontentloaded" });
  await publicMobilePage.locator(".public-wishes-head h2").filter({ hasText: directList.title }).waitFor({ state: "visible" });
  const listPath = `/alisa/lists/${directList.id}`;
  const listCard = publicMobilePage.locator(".wish-card").first();
  const listWishTitle = (await listCard.locator("h3").innerText()).trim();
  const listWishOpener = listCard.getByRole("button", { name: `Открыть желание «${listWishTitle}»` });
  await listWishOpener.focus();
  await listWishOpener.press("Enter");
  const listWishDialog = publicMobilePage.getByRole("dialog", { name: `Желание: ${listWishTitle}` });
  await listWishDialog.waitFor({ state: "visible" });
  await expectDarkAuthenticatedModal(listWishDialog, "390px public list wish detail");
  assert(/^\/alisa\/wishes\/[^/]+$/.test(new URL(publicMobilePage.url()).pathname), "Opening a wish from a list did not create a clean wish URL");
  await publicMobilePage.keyboard.press("Shift+Tab");
  assert(await listWishDialog.evaluate((dialog) => dialog.contains(document.activeElement)), "Reverse tab escaped the wish dialog");
  await publicMobilePage.keyboard.press("Escape");
  await listWishDialog.waitFor({ state: "detached" });
  await publicMobilePage.waitForURL((url) => url.pathname === listPath);
  const restoredListWishOpener = publicMobilePage.locator(".wish-card").first().getByRole("button", { name: `Открыть желание «${listWishTitle}»` });
  await publicMobilePage.waitForFunction((title) => (
    document.activeElement?.getAttribute("aria-label") === `Открыть желание «${title}»`
  ), listWishTitle);
  assert(await restoredListWishOpener.evaluate((element) => document.activeElement === element), "Closing a wish did not restore focus to its list card");
  await publicMobilePage.locator(".public-wishes-head h2").filter({ hasText: directList.title }).waitFor({ state: "visible" });

  await publicMobilePage.goto(`${baseUrl}/alisa/wishes/not-a-real-wish`, { waitUntil: "domcontentloaded" });
  await publicMobilePage.getByRole("heading", { name: "Желание не найдено" }).waitFor({ state: "visible" });
  assert(await publicMobilePage.getByRole("link", { name: "Вернуться к профилю" }).getAttribute("href") === "/alisa", "Invalid wish return link is not canonical");
  await publicMobilePage.goto(`${baseUrl}/alisa/lists/not-a-real-list`, { waitUntil: "domcontentloaded" });
  await publicMobilePage.getByRole("heading", { name: "Список не найден" }).waitFor({ state: "visible" });
  assert(await publicMobilePage.getByRole("link", { name: "Вернуться к профилю" }).getAttribute("href") === "/alisa", "Invalid list return link is not canonical");
  await publicMobilePage.goto(`${baseUrl}/alisa`, { waitUntil: "domcontentloaded" });
  await publicMobilePage.locator(".public-profile.is-guest").waitFor({ state: "visible" });
  assert(await publicMobilePage.locator('a[href^="/u/"], a[href^="/users/"]').count() === 0, "Public profile still renders legacy profile links");
  await publicMobilePage.locator(".profile-mobile-menu").click();
  const publicMenu = publicMobilePage.locator("#profile-mobile-navigation.is-open");
  await publicMenu.waitFor({ state: "visible" });
  await publicMobilePage.waitForFunction(() => {
    const rect = document.querySelector("#profile-mobile-navigation.is-open")?.getBoundingClientRect();
    return rect && Math.abs(window.innerHeight - rect.bottom) <= 1;
  });
  await expectDarkPage(publicMobilePage, "390px public profile menu", [".public-profile--dark", "#profile-mobile-navigation.is-open"]);
  await waitForStableLayout(publicMobilePage);
  const publicMenuGeometry = await publicMenu.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { top: rect.top, bottom: window.innerHeight - rect.bottom, width: rect.width };
  });
  assert(publicMenuGeometry.top <= 1 && publicMenuGeometry.bottom <= 1 && Math.abs(publicMenuGeometry.width - 390) <= 1, "390px public profile menu is not a full-screen mobile sheet");
  await publicMobilePage.screenshot({ path: "/tmp/rollapp-public-profile-390-menu.png" });
  await publicMenu.getByRole("button", { name: "Закрыть меню" }).click();
  await publicMenu.waitFor({ state: "hidden" });
  await publicMobilePage.evaluate(() => window.scrollTo(0, 300));
  await publicMobilePage.waitForFunction(() => document.querySelector(".profile-header")?.classList.contains("is-compact"));
  assert(await publicMobilePage.locator(".profile-header__compact").isVisible(), "390px public profile compact header is not visible after scrolling");
  await publicMobilePage.screenshot({ path: "/tmp/rollapp-public-profile-390-scrolled.png" });
  await publicMobilePage.goto(`${baseUrl}/s/${mobileSourceList.shareToken}`, { waitUntil: "domcontentloaded" });
  await publicMobilePage.locator(".public-profile.is-guest").waitFor({ state: "visible" });
  await expectDarkPage(publicMobilePage, "390px shared guest profile", [".public-profile--dark", ".public-profile__layout > main"]);
  await publicMobile.close();

  const publicTablet = await browser.newContext({ viewport: { width: 768, height: 1024 }, deviceScaleFactor: 1, colorScheme: "light" });
  const publicTabletLoginResponse = await publicTablet.request.post(`${baseUrl}/api/auth/demo`, { data: {} });
  assert(publicTabletLoginResponse.ok(), `768px public owner login failed: ${publicTabletLoginResponse.status()}`);
  const publicTabletPage = await publicTablet.newPage();
  await publicTabletPage.goto(`${baseUrl}/alisa`, { waitUntil: "domcontentloaded" });
  await publicTabletPage.locator(".public-profile.is-owner").waitFor({ state: "visible" });
  await expectDesktopUserAgent(publicTabletPage, "768px public profile");
  await expectPublicGrid(publicTabletPage, 4, "768px public profile");
  await expectPublicMobileShell(publicTabletPage, "768px public profile");
  await expectDarkPage(publicTabletPage, "768px public owner profile", [".public-profile--dark", ".public-profile__layout > main"]);
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
  const publicTabletDetail = await expectWishDetailsOpen(publicTabletPage, "768px public wish", { fullscreen: true });
  await expectDarkAuthenticatedModal(publicTabletDetail.dialog, "768px profile owner wish detail");
  await expectNoRootOverflow(publicTabletPage, "768px public wish detail");
  await publicTabletPage.screenshot({ path: "/tmp/rollapp-public-wish-detail-768.png" });
  await publicTabletDetail.dialog.getByRole("button", { name: "Закрыть диалог" }).click();
  await publicTabletDetail.dialog.waitFor({ state: "detached" });
  await publicTablet.close();

  const publicLandscape = await browser.newContext({ viewport: { width: 1024, height: 768 }, deviceScaleFactor: 1, colorScheme: "light" });
  const publicLandscapePage = await publicLandscape.newPage();
  await publicLandscapePage.goto(`${baseUrl}/alisa`, { waitUntil: "domcontentloaded" });
  await expectPublicGrid(publicLandscapePage, 2, "1024px public profile");
  await expectNoRootOverflow(publicLandscapePage, "1024px public profile");
  const publicLandscapeDetail = await expectWishDetailsOpen(publicLandscapePage, "1024px public wish");
  await expectDarkAuthenticatedModal(publicLandscapeDetail.dialog, "1024px public wish detail");
  await expectNoRootOverflow(publicLandscapePage, "1024px public wish detail");
  await publicLandscapePage.screenshot({ path: "/tmp/rollapp-public-wish-detail-1024.png" });
  await publicLandscapeDetail.dialog.getByRole("button", { name: "Закрыть диалог" }).click();
  await publicLandscape.close();

  const publicMedium = await browser.newContext({ viewport: { width: 1076, height: 800 }, deviceScaleFactor: 1, colorScheme: "light" });
  const publicMediumPage = await publicMedium.newPage();
  await publicMediumPage.goto(`${baseUrl}/alisa`, { waitUntil: "domcontentloaded" });
  await expectPublicGrid(publicMediumPage, 3, "1076px public profile");
  await expectNoRootOverflow(publicMediumPage, "1076px public profile");
  await publicMedium.close();

  const publicWide = await browser.newContext({ viewport: { width: 1912, height: 991 }, deviceScaleFactor: 1, colorScheme: "light" });
  const publicWidePage = await publicWide.newPage();
  await publicWidePage.goto(`${baseUrl}/alisa`, { waitUntil: "domcontentloaded" });
  await expectPublicGrid(publicWidePage, 6, "1912px public profile", { requireCards: false });
  await expectReferenceDesktopProfile(publicWidePage, "1912px public profile", { guest: true });
  await expectDarkPage(publicWidePage, "Desktop public guest profile", [".public-profile--dark", ".public-profile__layout > main"]);
  await expectNoRootOverflow(publicWidePage, "1912px public profile");
  await publicWidePage.screenshot({ path: "/tmp/rollapp-public-profile-1912.png", fullPage: false });
  await publicWidePage.goto(`${baseUrl}/s/${mobileSourceList.shareToken}`, { waitUntil: "domcontentloaded" });
  await publicWidePage.locator(".public-profile.is-guest").waitFor({ state: "visible" });
  await expectDarkPage(publicWidePage, "Desktop shared guest profile", [".public-profile--dark", ".public-profile__layout > main"]);
  await publicWide.close();

  const ownerWide = await browser.newContext({ viewport: { width: 1912, height: 991 }, deviceScaleFactor: 1, colorScheme: "light" });
  const ownerLoginResponse = await ownerWide.request.post(`${baseUrl}/api/auth/demo`, { data: {} });
  assert(ownerLoginResponse.ok(), `1912px owner demo login failed: ${ownerLoginResponse.status()}`);
  const ownerWidePage = await ownerWide.newPage();
  await ownerWidePage.goto(`${baseUrl}/alisa`, { waitUntil: "domcontentloaded" });
  await ownerWidePage.locator(".public-profile.is-owner").waitFor({ state: "visible" });
  await expectPublicGrid(ownerWidePage, 6, "1912px owner profile", { requireCards: false });
  await expectReferenceDesktopProfile(ownerWidePage, "1912px owner profile");
  await expectDarkPage(ownerWidePage, "Desktop public owner profile", [".public-profile--dark", ".public-profile__layout > main"]);
  assert(await ownerWidePage.getByRole("button", { name: "Загадать желание" }).isVisible(), "Owner profile does not expose the reference add-wish CTA");
  assert((await ownerWidePage.getByRole("button", { name: "Подписаться" }).count()) === 0, "Owner profile should not expose a follow action");
  await waitForStableLayout(ownerWidePage);
  await ownerWidePage.screenshot({ path: "/tmp/rollapp-owner-profile-1912.png", fullPage: false });
  await ownerWidePage.goto(`${baseUrl}/s/${mobileSourceList.shareToken}`, { waitUntil: "domcontentloaded" });
  await ownerWidePage.locator(".public-profile.is-owner").waitFor({ state: "visible" });
  await expectDarkPage(ownerWidePage, "Desktop shared owner profile", [".public-profile--dark", ".public-profile__layout > main"]);
  await ownerWidePage.goto(`${baseUrl}/alisa`, { waitUntil: "domcontentloaded" });
  await ownerWidePage.locator(".public-profile.is-owner").waitFor({ state: "visible" });
  await ownerWidePage.locator(".profile-desktop-menu").click();
  await ownerWidePage.locator(".profile-desktop-panel.is-open").waitFor({ state: "visible" });
  assert(!(await ownerWidePage.locator("body").evaluate((element) => element.classList.contains("profile-menu-open"))), "Desktop account menu should not lock page scrolling");
  await ownerWidePage.locator(".public-wishes-head h2").click();
  await ownerWidePage.waitForFunction(() => !document.querySelector(".profile-desktop-panel")?.classList.contains("is-open"));
  await ownerWidePage.getByRole("button", { name: "Создать новый список" }).click();
  const ownerListDialog = ownerWidePage.getByRole("dialog", { name: "Создание списка" });
  await ownerListDialog.getByRole("heading", { name: "Создать список" }).waitFor();
  await expectDarkAuthenticatedModal(ownerListDialog, "Desktop create-list modal");
  await ownerListDialog.getByLabel("Название").fill("Smoke list");
  await ownerListDialog.getByLabel("Описание").fill("Проверка полного цикла списка");
  const createListResponsePromise = ownerWidePage.waitForResponse((response) => (
    response.request().method() === "POST" && new URL(response.url()).pathname === "/api/lists"
  ));
  await ownerListDialog.getByRole("button", { name: "Создать список", exact: true }).click();
  const createListResponse = await createListResponsePromise;
  assert(createListResponse.ok(), `List creation failed: ${createListResponse.status()}`);
  const createdList = (await createListResponse.json()).list;
  await ownerListDialog.waitFor({ state: "detached" });
  await ownerWidePage.waitForURL((url) => url.pathname === `/alisa/lists/${createdList.id}`);
  await ownerWidePage.locator(".profile-list-rail__lists > button").filter({ hasText: "Smoke list" }).waitFor({ state: "visible" });
  await ownerWidePage.getByRole("button", { name: "Опции списка" }).click();
  await ownerWidePage.getByRole("button", { name: "Редактировать список" }).click();
  const editListDialog = ownerWidePage.getByRole("dialog", { name: "Настройки списка: Smoke list" });
  await editListDialog.getByRole("heading", { name: "Изменить список" }).waitFor();
  await expectDarkAuthenticatedModal(editListDialog, "Desktop edit-list modal");
  await editListDialog.getByLabel("Название").fill("Smoke list edited");
  await editListDialog.getByLabel("Кто увидит").selectOption("private");
  const editListResponsePromise = ownerWidePage.waitForResponse((response) => (
    response.request().method() === "PATCH" && new URL(response.url()).pathname === `/api/lists/${createdList.id}`
  ));
  await editListDialog.getByRole("button", { name: "Сохранить изменения", exact: true }).click();
  const editListResponse = await editListResponsePromise;
  assert(editListResponse.ok(), `List editing failed: ${editListResponse.status()}`);
  await editListDialog.waitFor({ state: "detached" });
  await ownerWidePage.locator(".profile-list-rail__lists > button").filter({ hasText: "Smoke list edited" }).waitFor({ state: "visible" });
  await ownerWidePage.locator(".public-wishes-head .button").filter({ hasText: "Поделиться" }).click();
  await ownerWidePage.getByText("Приватный список виден только вам", { exact: true }).waitFor({ state: "visible" });
  await ownerWidePage.getByRole("button", { name: "Опции списка" }).click();
  await ownerWidePage.getByRole("button", { name: "Редактировать список" }).click();
  const deleteListDialog = ownerWidePage.getByRole("dialog", { name: "Настройки списка: Smoke list edited" });
  await deleteListDialog.getByRole("heading", { name: "Изменить список" }).waitFor();
  await expectDarkAuthenticatedModal(deleteListDialog, "Desktop delete-list modal");
  ownerWidePage.once("dialog", (dialog) => dialog.accept());
  const deleteListResponsePromise = ownerWidePage.waitForResponse((response) => (
    response.request().method() === "DELETE" && new URL(response.url()).pathname === `/api/lists/${createdList.id}`
  ));
  await deleteListDialog.getByRole("button", { name: "Удалить", exact: true }).click();
  const deleteListResponse = await deleteListResponsePromise;
  assert(deleteListResponse.ok(), `List deletion failed: ${deleteListResponse.status()}`);
  await deleteListDialog.waitFor({ state: "detached" });
  await ownerWidePage.waitForURL((url) => url.pathname === "/alisa");
  assert((await ownerWidePage.locator(".profile-list-rail__lists > button").filter({ hasText: "Smoke list edited" }).count()) === 0, "Deleted list is still visible in the owner rail");
  await ownerWidePage.getByRole("button", { name: "Загадать желание" }).click();
  const ownerWishDialog = ownerWidePage.getByRole("dialog", { name: "Диалог Rollapp" });
  await ownerWishDialog.getByRole("heading", { name: "Добавим мечту" }).waitFor();
  await expectDarkAuthenticatedModal(ownerWishDialog, "Desktop profile add-wish link step");
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
    await expectDarkAuthenticatedModal(wishDetailsDialog, "Desktop profile owner wish detail");
    const changeListsButton = wishDetailsDialog.getByRole("button", { name: /^Изменить списки желания\./ });
    assert(await changeListsButton.isVisible(), "Owner wish detail does not expose the editable list control");
    await changeListsButton.click();

    const editDialog = ownerWidePage.getByRole("dialog", { name: "Диалог Rollapp" });
    await editDialog.getByRole("heading", { name: "Изменить желание", exact: true }).waitFor();
    await expectDarkAuthenticatedModal(editDialog, "Desktop wish editor");
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
    await expectDarkAuthenticatedModal(reloadedEditDialog, "Reloaded desktop wish editor");
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

  console.log("Visual smoke passed: desktop/mobile friend directories, wish details, owner list reassignment persistence, app routes, drawer/modal, and 2/4/6-column public profiles rendered without root overflow");
} finally {
  await browser.close();
}
