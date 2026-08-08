import { chromium } from "playwright-core";

const baseUrl = (process.env.BASE_URL || "http://127.0.0.1:8080").replace(/\/$/, "");
const baseHostname = new URL(baseUrl).hostname.toLowerCase();
const loopbackHostnames = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1", "[::1]"]);
const allowedSslipTestEnvironment = baseHostname.endsWith(".sslip.io")
  && process.env.ROLLAPP_VISUAL_TEST_ENV === "1";
if (!loopbackHostnames.has(baseHostname) && !baseHostname.endsWith(".localhost") && !allowedSslipTestEnvironment) {
  throw new Error(
    `Refusing to run mutating visual smoke against ${baseHostname}. `
    + "Use localhost/127.0.0.1, or set ROLLAPP_VISUAL_TEST_ENV=1 for an isolated *.sslip.io test deployment.",
  );
}
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

async function expectMinimumReadableText(page, label, minimum = 13) {
  const undersized = await page.evaluate((minimumSize) => {
    const isActuallyVisible = (element, style) => {
      if (element.closest(".sr-only, .visually-hidden, [hidden]")) return false;
      if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) return false;
      if (style.clip !== "auto" && style.clip !== "rect(auto, auto, auto, auto)") return false;
      if (typeof element.checkVisibility === "function" && !element.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) return false;
      const rect = element.getBoundingClientRect();
      return rect.width > .5 && rect.height > .5;
    };
    const hasVisibleCopy = (element) => {
      if (["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(element.tagName)) return true;
      if ([...element.childNodes].some((node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim())) return true;
      return ["::before", "::after"].some((pseudo) => {
        const content = getComputedStyle(element, pseudo).content;
        return content && !["none", "normal", '""', "''"].includes(content);
      });
    };
    const selectorFor = (element) => {
      if (element.id) return `#${element.id}`;
      const slot = element.getAttribute("data-slot");
      if (slot) return `${element.tagName.toLowerCase()}[data-slot="${slot}"]`;
      const classes = [...element.classList].slice(0, 2).map((name) => `.${name}`).join("");
      return `${element.tagName.toLowerCase()}${classes}`;
    };
    return [...document.querySelectorAll("body *")].flatMap((element) => {
      const style = getComputedStyle(element);
      if (!isActuallyVisible(element, style) || !hasVisibleCopy(element)) return [];
      const size = Number.parseFloat(style.fontSize);
      if (!Number.isFinite(size) || size <= .1 || size + .01 >= minimumSize) return [];
      const directText = [...element.childNodes]
        .filter((node) => node.nodeType === Node.TEXT_NODE)
        .map((node) => node.textContent.trim())
        .filter(Boolean)
        .join(" ");
      return [{ selector: selectorFor(element), size, text: directText.slice(0, 80) }];
    }).slice(0, 20);
  }, minimum);
  assert(
    undersized.length === 0,
    `${label} renders text below ${minimum}px: ${undersized.map(({ selector, size, text }) => `${selector} ${size}px “${text}”`).join(", ")}`,
  );
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
  await expectMinimumReadableText(page, label);
}

async function expectSquareAppMain(page, label) {
  const radii = await page.locator(".app-main").evaluate((element) => {
    const style = getComputedStyle(element);
    return [
      style.borderTopLeftRadius,
      style.borderTopRightRadius,
      style.borderBottomRightRadius,
      style.borderBottomLeftRadius,
    ].map((value) => Number.parseFloat(value));
  });
  assert(radii.every((radius) => radius === 0), `${label} app main still has rounded corners: ${radii.join(", ")}`);
}

async function expectWishGridContained(page, label, expectedColumns) {
  await waitForStableLayout(page);
  const geometry = await page.evaluate(() => {
    const rect = (selector) => {
      const element = document.querySelector(selector);
      if (!element) return null;
      const bounds = element.getBoundingClientRect();
      return {
        left: bounds.left,
        right: bounds.right,
        top: bounds.top,
        bottom: bounds.bottom,
        width: bounds.width,
        height: bounds.height,
      };
    };
    const grid = document.querySelector(".wishes-page .wish-grid");
    const title = document.querySelector(".wishes-page .app-page-title");
    const actions = title?.querySelector(".page-actions");
    const cards = [...document.querySelectorAll(".wishes-page .wish-card")].slice(0, 4).map((card) => {
      const bounds = card.getBoundingClientRect();
      return { left: bounds.left, right: bounds.right, top: bounds.top, width: bounds.width };
    });
    return {
      main: rect(".app-main"),
      page: rect(".wishes-page"),
      grid: rect(".wishes-page .wish-grid"),
      title: rect(".wishes-page .app-page-title"),
      heading: title?.firstElementChild ? (() => {
        const bounds = title.firstElementChild.getBoundingClientRect();
        return { left: bounds.left, right: bounds.right, top: bounds.top, bottom: bounds.bottom };
      })() : null,
      actions: rect(".wishes-page .page-actions"),
      actionButtons: [...actions?.querySelectorAll("button") || []].map((button) => {
        const bounds = button.getBoundingClientRect();
        return {
          left: bounds.left,
          right: bounds.right,
          top: bounds.top,
          bottom: bounds.bottom,
          clientWidth: button.clientWidth,
          scrollWidth: button.scrollWidth,
        };
      }),
      cards,
      columns: grid ? getComputedStyle(grid).gridTemplateColumns.trim().split(/\s+/).filter(Boolean).length : 0,
    };
  });
  assert(geometry.main && geometry.page && geometry.grid, `${label} is missing the wishes layout`);
  assert(geometry.columns === expectedColumns, `${label} renders ${geometry.columns} columns instead of ${expectedColumns}`);
  assert(geometry.page.left >= geometry.main.left - 1, `${label} page escapes the app main on the left`);
  assert(geometry.page.right <= geometry.main.right + 1, `${label} page escapes the app main on the right`);
  assert(geometry.grid.left >= geometry.page.left - 1, `${label} grid escapes the page on the left`);
  assert(geometry.grid.right <= geometry.page.right + 1, `${label} grid escapes the page on the right`);
  assert(geometry.title && geometry.heading && geometry.actions, `${label} is missing its page actions`);
  assert(geometry.actions.left >= geometry.title.left - 1, `${label} actions escape the title on the left`);
  assert(geometry.actions.right <= geometry.title.right + 1, `${label} actions escape the title on the right`);
  const headingActionsOverlap = Math.max(0, Math.min(geometry.heading.right, geometry.actions.right) - Math.max(geometry.heading.left, geometry.actions.left))
    * Math.max(0, Math.min(geometry.heading.bottom, geometry.actions.bottom) - Math.max(geometry.heading.top, geometry.actions.top));
  assert(headingActionsOverlap <= 1, `${label} actions overlap the page heading`);
  for (const button of geometry.actionButtons) {
    assert(button.left >= geometry.actions.left - 1, `${label} action button escapes its group on the left`);
    assert(button.right <= geometry.actions.right + 1, `${label} action button escapes its group on the right`);
    assert(button.scrollWidth <= button.clientWidth + 1, `${label} action button content overflows its bounds`);
  }
  assert(geometry.cards.length >= expectedColumns, `${label} has too few cards for its first row`);
  for (const card of geometry.cards) {
    assert(card.left >= geometry.grid.left - 1, `${label} card escapes the grid on the left`);
    assert(card.right <= geometry.grid.right + 1, `${label} card escapes the grid on the right`);
  }
  const firstRow = geometry.cards.filter((card) => Math.abs(card.top - geometry.cards[0].top) <= 1);
  assert(firstRow.length === expectedColumns, `${label} first row contains ${firstRow.length} cards instead of ${expectedColumns}`);
}

async function expectWishCardsUnframed(page, label, selector = ".wish-card") {
  const cards = page.locator(selector);
  await cards.first().waitFor({ state: "visible" });
  const chrome = await cards.evaluateAll((nodes) => nodes.slice(0, 4).map((card) => {
    const style = getComputedStyle(card);
    const image = card.querySelector(".wish-card__image");
    const imageStyle = image ? getComputedStyle(image) : null;
    const imageRect = image?.getBoundingClientRect();
    return {
      background: style.backgroundColor,
      borderWidth: Number.parseFloat(style.borderTopWidth),
      borderStyle: style.borderTopStyle,
      borderRadius: Number.parseFloat(style.borderTopLeftRadius),
      ringShadow: style.getPropertyValue("--tw-ring-shadow"),
      imageRadius: imageStyle ? Number.parseFloat(imageStyle.borderTopLeftRadius) : 0,
      imageWidth: imageRect?.width || 0,
      imageHeight: imageRect?.height || 0,
    };
  }));
  assert(chrome.length > 0, `${label} has no wish cards to inspect`);
  assert(chrome.every((card) => card.background === "rgba(0, 0, 0, 0)"), `${label} wish cards still have an outer background`);
  assert(chrome.every((card) => card.borderWidth === 0), `${label} wish cards still have an outer border`);
  assert(chrome.every((card) => card.borderRadius === 0), `${label} wish cards still have an outer rounded container`);
  assert(chrome.every((card) => card.ringShadow.includes("calc(0px")), `${label} wish cards still have an outer ring`);
  assert(chrome.every((card) => card.imageRadius > 0 && card.imageWidth > 0 && card.imageHeight > 0), `${label} removed the image surface together with the card chrome`);

  const openAction = cards.first().locator(".wish-card__open");
  if (await openAction.count()) {
    await openAction.hover();
    const hoverChrome = await cards.first().evaluate((card) => {
      const open = card.querySelector(".wish-card__open");
      const body = card.querySelector(".wish-card__body");
      const read = (node) => {
        const style = getComputedStyle(node);
        return { background: style.backgroundColor, backgroundImage: style.backgroundImage, boxShadow: style.boxShadow };
      };
      return { card: read(card), open: read(open), body: read(body), hovered: open.matches(":hover") };
    });
    const isTransparent = (surface) => (
      ["transparent", "rgba(0, 0, 0, 0)"].includes(surface.background)
      && surface.backgroundImage === "none"
    );
    assert(
      hoverChrome.hovered && isTransparent(hoverChrome.card) && isTransparent(hoverChrome.open) && isTransparent(hoverChrome.body),
      `${label} wish card gains a background on hover (${JSON.stringify(hoverChrome)})`,
    );
    await page.mouse.move(0, 0);
    await openAction.press("Escape");
    const focusChrome = await openAction.evaluate((open) => {
      const style = getComputedStyle(open);
      return {
        active: document.activeElement === open,
        focusVisible: open.matches(":focus-visible"),
        background: style.backgroundColor,
        backgroundImage: style.backgroundImage,
        boxShadow: style.boxShadow,
        outlineStyle: style.outlineStyle,
        outlineWidth: Number.parseFloat(style.outlineWidth),
      };
    });
    assert(
      focusChrome.active
        && focusChrome.focusVisible
        && isTransparent(focusChrome)
        && ((focusChrome.outlineStyle !== "none" && focusChrome.outlineWidth >= 2)
          || focusChrome.boxShadow !== hoverChrome.open.boxShadow),
      `${label} card keyboard focus is not visible without a hover background (${JSON.stringify(focusChrome)})`,
    );
    await openAction.evaluate((open) => open.blur());
  }
}

async function expectWishHeaderActionsContained(page, label) {
  await waitForStableLayout(page);
  const geometry = await page.evaluate(() => {
    const title = document.querySelector(".wishes-page .app-page-title");
    const heading = title?.firstElementChild;
    const actions = title?.querySelector(".page-actions");
    const rect = (element) => {
      if (!element) return null;
      const bounds = element.getBoundingClientRect();
      return { left: bounds.left, right: bounds.right, top: bounds.top, bottom: bounds.bottom };
    };
    return {
      title: rect(title),
      heading: rect(heading),
      actions: rect(actions),
      buttons: [...actions?.querySelectorAll("button") || []].map((button) => ({
        ...rect(button),
        clientWidth: button.clientWidth,
        scrollWidth: button.scrollWidth,
      })),
    };
  });
  assert(geometry.title && geometry.heading && geometry.actions, `${label} is missing its page actions`);
  assert(geometry.actions.left >= geometry.title.left - 1, `${label} actions escape the title on the left`);
  assert(geometry.actions.right <= geometry.title.right + 1, `${label} actions escape the title on the right`);
  const overlap = Math.max(0, Math.min(geometry.heading.right, geometry.actions.right) - Math.max(geometry.heading.left, geometry.actions.left))
    * Math.max(0, Math.min(geometry.heading.bottom, geometry.actions.bottom) - Math.max(geometry.heading.top, geometry.actions.top));
  assert(overlap <= 1, `${label} actions overlap the page heading`);
  for (const button of geometry.buttons) {
    assert(button.left >= geometry.actions.left - 1, `${label} action button escapes its group on the left`);
    assert(button.right <= geometry.actions.right + 1, `${label} action button escapes its group on the right`);
    assert(button.scrollWidth <= button.clientWidth + 1, `${label} action button content overflows its bounds`);
  }
}

async function expectDarkPage(page, label, surfaceSelectors) {
  await waitForStableLayout(page);
  const theme = await page.evaluate((selectors) => {
    const parseColor = (value) => {
      const clamp = (number, min, max) => Math.min(max, Math.max(min, number));
      const parseAlpha = (token = "1") => {
        const number = Number.parseFloat(token);
        return Number.isFinite(number)
          ? clamp(token.trim().endsWith("%") ? number / 100 : number, 0, 1)
          : null;
      };
      const rgbMatch = value.trim().match(/^rgba?\((.*)\)$/i);
      if (rgbMatch) {
        const [channelsPart, slashAlpha] = rgbMatch[1].split(/\s*\/\s*/, 2);
        const channels = channelsPart.replaceAll(",", " ").trim().split(/\s+/);
        const legacyAlpha = channels.length === 4 ? channels.pop() : undefined;
        if (channels.length !== 3) return null;
        const rgb = channels.map((token) => {
          const number = Number.parseFloat(token);
          if (!Number.isFinite(number)) return null;
          return clamp(token.endsWith("%") ? number * 2.55 : number, 0, 255);
        });
        const alpha = parseAlpha(slashAlpha ?? legacyAlpha);
        return rgb.every((channel) => channel !== null) && alpha !== null
          ? { red: rgb[0], green: rgb[1], blue: rgb[2], alpha }
          : null;
      }

      const oklchMatch = value.trim().match(/^oklch\((.*)\)$/i);
      const oklabMatch = value.trim().match(/^oklab\((.*)\)$/i);
      if (!oklchMatch && !oklabMatch) return value.trim().toLowerCase() === "transparent"
        ? { red: 0, green: 0, blue: 0, alpha: 0 }
        : null;
      const [channelsPart, alphaPart] = (oklchMatch || oklabMatch)[1].split(/\s*\/\s*/, 2);
      const channels = channelsPart.trim().split(/\s+/);
      if (channels.length !== 3) return null;
      const lightnessNumber = Number.parseFloat(channels[0]);
      const secondNumber = Number.parseFloat(channels[1]);
      const thirdNumber = Number.parseFloat(channels[2]);
      const alpha = parseAlpha(alphaPart);
      if (![lightnessNumber, secondNumber, thirdNumber, alpha].every(Number.isFinite)) return null;
      const lightness = clamp(channels[0].endsWith("%") ? lightnessNumber / 100 : lightnessNumber, 0, 1);
      let labA;
      let labB;
      if (oklchMatch) {
        const chroma = Math.max(0, channels[1].endsWith("%") ? secondNumber * .004 : secondNumber);
        const hue = channels[2].endsWith("turn")
          ? thirdNumber * 360
          : channels[2].endsWith("rad")
            ? thirdNumber * (180 / Math.PI)
            : channels[2].endsWith("grad")
              ? thirdNumber * .9
              : thirdNumber;
        const angle = hue * (Math.PI / 180);
        labA = chroma * Math.cos(angle);
        labB = chroma * Math.sin(angle);
      } else {
        labA = channels[1].endsWith("%") ? secondNumber * .004 : secondNumber;
        labB = channels[2].endsWith("%") ? thirdNumber * .004 : thirdNumber;
      }
      const lRoot = lightness + (.3963377774 * labA) + (.2158037573 * labB);
      const mRoot = lightness - (.1055613458 * labA) - (.0638541728 * labB);
      const sRoot = lightness - (.0894841775 * labA) - (1.291485548 * labB);
      const l = lRoot ** 3;
      const m = mRoot ** 3;
      const s = sRoot ** 3;
      const toSrgb = (linear) => clamp(
        (linear <= .0031308 ? 12.92 * linear : (1.055 * (linear ** (1 / 2.4))) - .055) * 255,
        0,
        255,
      );
      return {
        red: toSrgb((4.0767416621 * l) - (3.3077115913 * m) + (.2309699292 * s)),
        green: toSrgb((-1.2684380046 * l) + (2.6097574011 * m) - (.3413193965 * s)),
        blue: toSrgb((-.0041960863 * l) - (.7034186147 * m) + (1.707614701 * s)),
        alpha,
      };
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
  assert(await items.count() === 2, `${label} should expose two primary mobile navigation items`);
  for (let index = 0; index < 2; index += 1) {
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

const stableAppRoutes = ["/app/wishes", friendsRoutes.subscriptions, "/app/notifications", "/app/settings"];
const stablePrimaryLinks = [
  { label: "Мои желания", pathname: "/app/wishes" },
  { label: "Друзья", pathname: friendsRoutes.subscriptions },
];

async function captureStableSidebar(page, label, { mobile = false } = {}) {
  let sidebar;
  if (mobile) {
    await page.getByRole("button", { name: "Открыть меню", exact: true }).click();
    sidebar = page.getByRole("dialog", { name: "Меню приложения", exact: true });
    await sidebar.waitFor({ state: "visible" });
    assert(await sidebar.getAttribute("data-mobile") === "true", `${label} does not use the mobile Sidebar Sheet`);
    await page.waitForTimeout(280);
  } else {
    sidebar = page.locator("#app-sidebar");
    await sidebar.waitFor({ state: "visible" });
    assert(await sidebar.getAttribute("data-slot") === "sidebar-container", `${label} does not use the desktop Sidebar container`);
  }

  const addButton = sidebar.getByRole("button", { name: "Добавить желание", exact: true });
  assert(await addButton.isVisible(), `${label} is missing the global add-wish action`);
  const primaryLinks = sidebar.locator(".sidebar__nav a");
  assert(await primaryLinks.count() === stablePrimaryLinks.length, `${label} should expose ${stablePrimaryLinks.length} primary sidebar links`);
  for (const expected of stablePrimaryLinks) {
    const link = sidebar.getByRole("link", { name: expected.label, exact: true });
    assert(await link.isVisible(), `${label} is missing the ${expected.label} link`);
    assert(new URL(await link.getAttribute("href"), baseUrl).pathname === expected.pathname, `${label} ${expected.label} points to the wrong route`);
  }
  for (const utility of ["Уведомления", "Настройки"]) {
    assert(await sidebar.getByRole("link", { name: new RegExp(`^${utility}`) }).isVisible(), `${label} is missing ${utility}`);
  }

  await waitForStableLayout(page);
  const geometry = await page.evaluate((isMobile) => {
    const rect = (selector) => {
      const value = document.querySelector(selector)?.getBoundingClientRect();
      return value ? { x: value.x, y: value.y, width: value.width, height: value.height } : null;
    };
    const rootSelector = isMobile ? "[data-sidebar='sidebar'][data-mobile='true']" : "#app-sidebar";
    const sidebarNode = document.querySelector(rootSelector);
    const sidebarStyle = sidebarNode ? getComputedStyle(sidebarNode) : null;
    const sidebarSurface = sidebarNode?.querySelector(".sidebar");
    const sidebarSurfaceStyle = sidebarSurface ? getComputedStyle(sidebarSurface) : null;
    return {
      sidebar: rect(rootSelector),
      head: rect(`${rootSelector} .sidebar__head`),
      add: rect(`${rootSelector} .sidebar__add`),
      navigation: rect(`${rootSelector} .sidebar__nav`),
      bottom: rect(`${rootSelector} .sidebar__bottom`),
      user: rect(`${rootSelector} .sidebar__user`),
      main: rect(".app-main"),
      style: sidebarStyle && {
        position: sidebarStyle.position,
        padding: [sidebarStyle.paddingTop, sidebarStyle.paddingRight, sidebarStyle.paddingBottom, sidebarStyle.paddingLeft],
        borderRadius: sidebarStyle.borderRadius,
        surfaceRadii: sidebarSurfaceStyle && [
          sidebarSurfaceStyle.borderTopLeftRadius,
          sidebarSurfaceStyle.borderTopRightRadius,
          sidebarSurfaceStyle.borderBottomRightRadius,
          sidebarSurfaceStyle.borderBottomLeftRadius,
        ].map((value) => Number.parseFloat(value)),
      },
    };
  }, mobile);
  assert(Object.values(geometry).every(Boolean), `${label} is missing sidebar geometry`);
  assert(
    geometry.style.surfaceRadii?.every((radius) => radius === 0),
    `${label} sidebar surface still has rounded corners: ${geometry.style.surfaceRadii?.join(", ")}`,
  );

  if (mobile) {
    await sidebar.locator(".sidebar-close").click();
    await sidebar.waitFor({ state: "detached" });
  }
  return geometry;
}

function expectSameSidebar(actual, expected, label) {
  const close = (left, right) => Math.abs(left - right) <= 1;
  for (const region of ["sidebar", "head", "add", "navigation", "bottom", "user"]) {
    for (const dimension of ["x", "y", "width", "height"]) {
      assert(close(actual[region][dimension], expected[region][dimension]), `${label} changed sidebar ${region}.${dimension}`);
    }
  }
  for (const dimension of ["x", "width"]) {
    assert(close(actual.main[dimension], expected.main[dimension]), `${label} shifted the app main ${dimension}`);
  }
  assert(actual.style.position === expected.style.position, `${label} changed sidebar positioning`);
  assert(actual.style.borderRadius === expected.style.borderRadius, `${label} changed sidebar rounding`);
  assert(actual.style.surfaceRadii.join("|") === expected.style.surfaceRadii.join("|"), `${label} changed sidebar surface rounding`);
  assert(actual.style.padding.join("|") === expected.style.padding.join("|"), `${label} changed sidebar padding`);
}

async function expectStableDesktopSidebarAcrossRoutes(page, label, viewport) {
  const originalViewport = page.viewportSize();
  await page.setViewportSize(viewport);
  try {
    let baseline = null;
    for (const pathname of stableAppRoutes) {
      await waitForAppRoute(page, pathname);
      const snapshot = await captureStableSidebar(page, `${label} ${pathname}`);
      if (!baseline) baseline = snapshot;
      else expectSameSidebar(snapshot, baseline, `${label} ${pathname}`);
    }
  } finally {
    if (originalViewport) await page.setViewportSize(originalViewport);
  }
}

async function expectDarkAuthenticatedModal(dialog, label) {
  await dialog.waitFor({ state: "visible" });
  const theme = await dialog.evaluate((element) => {
    const parseColor = (value) => {
      const clamp = (number, min, max) => Math.min(max, Math.max(min, number));
      const parseAlpha = (token = "1") => {
        const number = Number.parseFloat(token);
        return Number.isFinite(number)
          ? clamp(token.trim().endsWith("%") ? number / 100 : number, 0, 1)
          : null;
      };
      const rgbMatch = value.trim().match(/^rgba?\((.*)\)$/i);
      if (rgbMatch) {
        const [channelsPart, slashAlpha] = rgbMatch[1].split(/\s*\/\s*/, 2);
        const channels = channelsPart.replaceAll(",", " ").trim().split(/\s+/);
        const legacyAlpha = channels.length === 4 ? channels.pop() : undefined;
        if (channels.length !== 3) return null;
        const rgb = channels.map((token) => {
          const number = Number.parseFloat(token);
          if (!Number.isFinite(number)) return null;
          return clamp(token.endsWith("%") ? number * 2.55 : number, 0, 255);
        });
        const alpha = parseAlpha(slashAlpha ?? legacyAlpha);
        return rgb.every((channel) => channel !== null) && alpha !== null
          ? { red: rgb[0], green: rgb[1], blue: rgb[2], alpha }
          : null;
      }

      const oklchMatch = value.trim().match(/^oklch\((.*)\)$/i);
      const oklabMatch = value.trim().match(/^oklab\((.*)\)$/i);
      if (!oklchMatch && !oklabMatch) return value.trim().toLowerCase() === "transparent"
        ? { red: 0, green: 0, blue: 0, alpha: 0 }
        : null;
      const [channelsPart, alphaPart] = (oklchMatch || oklabMatch)[1].split(/\s*\/\s*/, 2);
      const channels = channelsPart.trim().split(/\s+/);
      if (channels.length !== 3) return null;
      const lightnessNumber = Number.parseFloat(channels[0]);
      const secondNumber = Number.parseFloat(channels[1]);
      const thirdNumber = Number.parseFloat(channels[2]);
      const alpha = parseAlpha(alphaPart);
      if (![lightnessNumber, secondNumber, thirdNumber, alpha].every(Number.isFinite)) return null;
      const lightness = clamp(channels[0].endsWith("%") ? lightnessNumber / 100 : lightnessNumber, 0, 1);
      let labA;
      let labB;
      if (oklchMatch) {
        const chroma = Math.max(0, channels[1].endsWith("%") ? secondNumber * .004 : secondNumber);
        const hue = channels[2].endsWith("turn")
          ? thirdNumber * 360
          : channels[2].endsWith("rad")
            ? thirdNumber * (180 / Math.PI)
            : channels[2].endsWith("grad")
              ? thirdNumber * .9
              : thirdNumber;
        const angle = hue * (Math.PI / 180);
        labA = chroma * Math.cos(angle);
        labB = chroma * Math.sin(angle);
      } else {
        labA = channels[1].endsWith("%") ? secondNumber * .004 : secondNumber;
        labB = channels[2].endsWith("%") ? thirdNumber * .004 : thirdNumber;
      }
      const lRoot = lightness + (.3963377774 * labA) + (.2158037573 * labB);
      const mRoot = lightness - (.1055613458 * labA) - (.0638541728 * labB);
      const sRoot = lightness - (.0894841775 * labA) - (1.291485548 * labB);
      const l = lRoot ** 3;
      const m = mRoot ** 3;
      const s = sRoot ** 3;
      const toSrgb = (linear) => clamp(
        (linear <= .0031308 ? 12.92 * linear : (1.055 * (linear ** (1 / 2.4))) - .055) * 255,
        0,
        255,
      );
      return {
        red: toSrgb((4.0767416621 * l) - (3.3077115913 * m) + (.2309699292 * s)),
        green: toSrgb((-1.2684380046 * l) + (2.6097574011 * m) - (.3413193965 * s)),
        blue: toSrgb((-.0041960863 * l) - (.7034186147 * m) + (1.707614701 * s)),
        alpha,
      };
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
      ".wish-editor__field",
      ".wish-editor__switch",
      ".wish-editor__list-switch",
      ".wish-editor__list-row",
      ".phone-settings__current",
      ".phone-settings__status",
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
        return {
          selector: node.className || node.tagName,
          luminance: luminance(effective),
          allowedAccent: node.matches("[data-slot='switch'][role='switch'][aria-checked='true']")
            || (node.matches(".wish-editor__switch")
              && node.previousElementSibling?.matches("input[type='checkbox']:checked")),
        };
      });
    return {
      background: modalBackground && luminance(modalBackground),
      foreground: modalForeground && luminance(modalForeground),
      prefersLight: matchMedia("(prefers-color-scheme: light)").matches,
      htmlColorScheme: getComputedStyle(document.documentElement).colorScheme,
      bodyColorScheme: getComputedStyle(document.body).colorScheme,
      modalColorScheme: modalStyle.colorScheme,
      lightSurfaces: surfaces.filter((surface) => (
        surface.luminance === null || (surface.luminance > 115 && !surface.allowedAccent)
      )),
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

async function expectWishEditorLayout(dialog, label, { mobile = false, mode = "edit" } = {}) {
  await dialog.waitFor({ state: "visible" });
  await dialog.locator(".wish-editor__list-row").first().waitFor({ state: "visible" });
  await dialog.evaluate(async () => {
    if (document.fonts?.ready) await document.fonts.ready;
    await new Promise((resolve) => setTimeout(resolve, 280));
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
  const geometry = await dialog.evaluate((element) => {
    const rectOf = (node) => {
      const rect = node.getBoundingClientRect();
      return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height };
    };
    const media = element.querySelector(".wish-editor__image");
    const mediaSection = element.querySelector(".wish-editor__media");
    const emptyUploadTrigger = media?.classList.contains("is-empty")
      ? media.querySelector(":scope > .wish-editor__image-empty")
      : null;
    const panel = element.querySelector(".wish-editor__panel");
    const scroll = element.querySelector(".wish-editor__scroll");
    const submit = element.querySelector(".wish-editor__submit");
    const close = element.querySelector(".modal__close");
    const remove = element.querySelector(".wish-editor__delete");
    const title = element.querySelector(".wish-editor__title");
    const titleInput = element.querySelector(".wish-editor__field:not(.wish-editor__field--link):not(.wish-editor__field--description):not(.wish-editor__field--price) > input");
    const linkInput = element.querySelector(".wish-editor__field--link > input");
    const descriptionInput = element.querySelector(".wish-editor__field--description > textarea");
    const priceInput = element.querySelector(".wish-editor__field--price > input");
    const currencySelect = element.querySelector(".wish-editor__field--price select[data-slot='native-select']");
    const roleSwitches = [...element.querySelectorAll(".wish-editor__switch-row [role='switch']")];
    const switchRows = [...element.querySelectorAll(".wish-editor__switch-row")];
    const listRows = [...element.querySelectorAll(".wish-editor__list-row")];
    titleInput?.focus({ preventScroll: true });
    const fieldSurfaces = [
      ["title", titleInput, "input"],
      ["link", linkInput, "input"],
      ["description", descriptionInput, "textarea"],
      ["price", priceInput, "input"],
    ].map(([name, control, expectedSlot]) => {
      const wrapper = control?.closest(".wish-editor__field");
      if (!control || !wrapper) return { name, expectedSlot, wrapper: null, control: null };
      const wrapperStyle = getComputedStyle(wrapper);
      const controlStyle = getComputedStyle(control);
      return {
        name,
        expectedSlot,
        wrapper: {
          ...rectOf(wrapper),
          background: wrapperStyle.backgroundColor,
          backgroundImage: wrapperStyle.backgroundImage,
          borderWidths: [wrapperStyle.borderTopWidth, wrapperStyle.borderRightWidth, wrapperStyle.borderBottomWidth, wrapperStyle.borderLeftWidth].map(Number.parseFloat),
          padding: [wrapperStyle.paddingTop, wrapperStyle.paddingRight, wrapperStyle.paddingBottom, wrapperStyle.paddingLeft].map(Number.parseFloat),
          boxShadow: wrapperStyle.boxShadow,
        },
        control: {
          ...rectOf(control),
          slot: control.getAttribute("data-slot"),
          background: controlStyle.backgroundColor,
          borderWidths: [controlStyle.borderTopWidth, controlStyle.borderRightWidth, controlStyle.borderBottomWidth, controlStyle.borderLeftWidth].map(Number.parseFloat),
          borderRadius: Number.parseFloat(controlStyle.borderTopLeftRadius),
        },
      };
    });
    const currencyWrapper = currencySelect?.closest("[data-slot='native-select-wrapper']");
    const hitContains = (node) => {
      const rect = node.getBoundingClientRect();
      const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      return hit === node || node.contains(hit);
    };
    const emptyUpload = media && emptyUploadTrigger ? (() => {
      const triggerStyle = getComputedStyle(emptyUploadTrigger);
      const textNodes = [...emptyUploadTrigger.querySelectorAll(":scope > strong, :scope > span")];
      const hasVisibleShadow = (value) => value !== "none"
        && (value.match(/-?(?:\d+\.?\d*|\.\d+)px/g) || [])
          .some((length) => Math.abs(Number.parseFloat(length)) > .01);
      const paintedDescendants = [...media.querySelectorAll("button, div, section, article, [data-slot='card']")]
        .filter((node) => {
          const style = getComputedStyle(node);
          const hasBackground = !["transparent", "rgba(0, 0, 0, 0)"].includes(style.backgroundColor)
            || style.backgroundImage !== "none";
          const hasBorder = [style.borderTopWidth, style.borderRightWidth, style.borderBottomWidth, style.borderLeftWidth]
            .some((width) => Number.parseFloat(width) > 0);
          return hasBackground || hasBorder || hasVisibleShadow(style.boxShadow);
        });
      return {
        outer: {
          ...rectOf(media),
          clientWidth: media.clientWidth,
          clientHeight: media.clientHeight,
          scrollWidth: media.scrollWidth,
          scrollHeight: media.scrollHeight,
        },
        section: mediaSection ? rectOf(mediaSection) : null,
        trigger: {
          ...rectOf(emptyUploadTrigger),
          tag: emptyUploadTrigger.tagName,
          type: emptyUploadTrigger.getAttribute("type"),
          slot: emptyUploadTrigger.getAttribute("data-slot"),
          background: triggerStyle.backgroundColor,
          backgroundImage: triggerStyle.backgroundImage,
          borderWidths: [triggerStyle.borderTopWidth, triggerStyle.borderRightWidth, triggerStyle.borderBottomWidth, triggerStyle.borderLeftWidth].map(Number.parseFloat),
          boxShadow: triggerStyle.boxShadow,
          hasVisibleShadow: hasVisibleShadow(triggerStyle.boxShadow),
          clientWidth: emptyUploadTrigger.clientWidth,
          clientHeight: emptyUploadTrigger.clientHeight,
          scrollWidth: emptyUploadTrigger.scrollWidth,
          scrollHeight: emptyUploadTrigger.scrollHeight,
        },
        text: textNodes.map((node) => ({
          ...rectOf(node),
          clientWidth: node.clientWidth,
          scrollWidth: node.scrollWidth,
        })),
        paintedDescendantCount: paintedDescendants.length,
      };
    })() : null;
    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      dialog: rectOf(element),
      media: rectOf(media),
      emptyUpload,
      panel: rectOf(panel),
      scroll: {
        ...rectOf(scroll),
        clientHeight: scroll.clientHeight,
        scrollHeight: scroll.scrollHeight,
        overflowY: getComputedStyle(scroll).overflowY,
      },
      submit: { ...rectOf(submit), position: getComputedStyle(submit).position, hittable: hitContains(submit) },
      close: { ...rectOf(close), position: getComputedStyle(close).position, hittable: hitContains(close) },
      remove: remove ? { ...rectOf(remove), hittable: hitContains(remove) } : null,
      title: title ? { ...rectOf(title), hittable: hitContains(title) } : null,
      fieldCount: element.querySelectorAll(".wish-editor__field").length,
      switchCount: switchRows.length,
      roleSwitchCount: roleSwitches.length,
      switchRowsWithControl: switchRows.filter((row) => row.querySelector(":scope [role='switch']")).length,
      switchSemantics: roleSwitches.map((control) => ({
        ariaChecked: control.getAttribute("aria-checked"),
        nativeChecked: control instanceof HTMLInputElement && control.type === "checkbox" ? control.checked : null,
        dataState: control.getAttribute("data-state"),
      })),
      titleCount: element.querySelectorAll(".wish-editor__title").length,
      uploadCount: element.querySelectorAll("input[type='file'][accept*='image/jpeg']").length,
      legacyCreateCount: element.querySelectorAll(".link-step, .wish-form").length,
      legacyControlCount: element.querySelectorAll(".manual-link, .priority-picker, .wish-settings").length,
      listFieldsetCount: element.querySelectorAll("fieldset.wish-editor__lists").length,
      fieldSurfaces,
      currency: currencySelect && currencyWrapper ? {
        wrapper: rectOf(currencyWrapper),
        control: rectOf(currencySelect),
      } : null,
      listRows: listRows.map((row) => {
        const listSwitch = row.querySelector(":scope > [data-slot='switch']");
        const rowTitle = row.querySelector(":scope > .wish-editor__list-title");
        const rowRect = rectOf(row);
        const switchRect = listSwitch ? rectOf(listSwitch) : null;
        const titleRect = rowTitle ? rectOf(rowTitle) : null;
        return {
          row: rowRect,
          listSwitch: switchRect,
          title: titleRect,
          imageCount: row.querySelectorAll("img").length,
          thumbnailCount: row.querySelectorAll(".wish-editor__list-thumb").length,
          backgroundImage: getComputedStyle(row).backgroundImage,
          switchSlot: listSwitch?.getAttribute("data-slot") || null,
          switchRole: listSwitch?.getAttribute("role") || null,
          ariaChecked: listSwitch?.getAttribute("aria-checked") || null,
          dataChecked: listSwitch?.hasAttribute("data-checked") || false,
          dataUnchecked: listSwitch?.hasAttribute("data-unchecked") || false,
          thumbCount: listSwitch?.querySelectorAll(":scope > [data-slot='switch-thumb']").length || 0,
          titleText: rowTitle?.textContent.trim() || "",
        };
      }),
      supportedFields: {
        title: Boolean(titleInput) && titleInput.tagName === "INPUT" && titleInput.required,
        link: Boolean(linkInput) && linkInput.tagName === "INPUT" && linkInput.type === "url",
        description: Boolean(descriptionInput) && descriptionInput.tagName === "TEXTAREA",
        price: Boolean(priceInput) && priceInput.tagName === "INPUT" && priceInput.type === "number" && priceInput.min === "0",
        currency: Boolean(currencySelect)
          && currencySelect.tagName === "SELECT"
          && currencySelect.parentElement?.getAttribute("data-slot") === "native-select-wrapper",
      },
      currencyValues: currencySelect ? [...currencySelect.options].map((option) => option.value) : [],
      submitType: submit.type,
      rootWidth: document.documentElement.scrollWidth,
    };
  });

  assert(geometry.fieldCount === 4, `${label} should expose the four field groups`);
  assert(
    geometry.fieldSurfaces.every(({ wrapper }) => wrapper
      && ["transparent", "rgba(0, 0, 0, 0)"].includes(wrapper.background)
      && wrapper.backgroundImage === "none"
      && wrapper.borderWidths.every((width) => width === 0)
      && wrapper.padding.every((value) => value <= .5)
      && wrapper.boxShadow === "none"),
    `${label} wish fields still render outer visual wrappers`,
  );
  assert(
    geometry.fieldSurfaces.every(({ control, expectedSlot }) => control
      && control.slot === expectedSlot
      && !["transparent", "rgba(0, 0, 0, 0)"].includes(control.background)
      && control.borderWidths.every((width) => width >= 1)
      && control.borderRadius > 0
      && control.height >= 44),
    `${label} shadcn controls do not own the visible field surfaces`,
  );
  assert(
    geometry.fieldSurfaces.every(({ name, wrapper, control }) => wrapper && control
      && Math.abs(control.left - wrapper.left) <= 1
      && (name === "price" || Math.abs(control.right - wrapper.right) <= 1)
      && Math.abs(control.bottom - wrapper.bottom) <= 1),
    `${label} wish controls remain inset inside redundant wrappers (${JSON.stringify(geometry.fieldSurfaces)})`,
  );
  assert(
    geometry.currency
      && Math.abs(geometry.currency.wrapper.right - geometry.fieldSurfaces.find(({ name }) => name === "price").wrapper.right) <= 1
      && Math.abs(geometry.currency.wrapper.bottom - geometry.fieldSurfaces.find(({ name }) => name === "price").wrapper.bottom) <= 1
      && geometry.currency.control.height >= 44,
    `${label} currency control is not aligned beside price`,
  );
  assert(geometry.switchCount === 2, `${label} should expose the two reference switch rows`);
  const switches = dialog.locator(".wish-editor__switch-row").getByRole("switch");
  assert(await switches.count() === 2, `${label} should expose exactly two setting role=switch controls`);
  assert(geometry.roleSwitchCount === 2, `${label} should render exactly two role=switch controls`);
  assert(geometry.switchRowsWithControl === 2, `${label} switch rows do not contain their role=switch controls`);
  assert(
    geometry.switchSemantics.every(({ ariaChecked }) => ariaChecked === "true" || ariaChecked === "false"),
    `${label} switches must expose boolean aria-checked state`,
  );
  assert(
    geometry.switchSemantics.every(({ ariaChecked, nativeChecked }) => nativeChecked === null || String(nativeChecked) === ariaChecked),
    `${label} native switch state disagrees with aria-checked`,
  );
  assert(
    geometry.switchSemantics.every(({ ariaChecked, dataState }) => (
      dataState === null || dataState === (ariaChecked === "true" ? "checked" : "unchecked")
    )),
    `${label} shadcn switch data-state disagrees with aria-checked`,
  );
  for (const name of ["Секретное желание", "Многократное бронирование"]) {
    assert(await dialog.getByRole("switch", { name, exact: true }).count() === 1, `${label} does not expose the accessible “${name}” switch`);
  }
  assert(Object.values(geometry.supportedFields).every(Boolean), `${label} does not expose the supported title/link/description/price/currency fields`);
  assert(
    JSON.stringify(geometry.currencyValues) === JSON.stringify(["RUB", "USD", "EUR", "KZT", "BYN"]),
    `${label} exposes an unsupported currency set: ${geometry.currencyValues.join(", ")}`,
  );
  assert(geometry.submitType === "submit", `${label} primary save action does not submit the editor form`);
  assert(geometry.submit.hittable, `${label} submit action is covered`);
  assert(geometry.close.hittable, `${label} close action is covered`);
  assert(geometry.uploadCount === 1, `${label} does not expose image upload`);
  assert(geometry.legacyCreateCount === 0, `${label} still renders the legacy create flow`);
  assert(geometry.legacyControlCount === 0, `${label} still exposes legacy manual-link, priority or wish-settings controls`);
  assert(geometry.listFieldsetCount === 1, `${label} does not expose one canonical list selector`);
  assert(geometry.listRows.length > 0, `${label} does not expose list choices`);
  assert(geometry.listRows.every((row) => row.imageCount === 0 && row.thumbnailCount === 0), `${label} renders wish imagery inside list choices`);
  assert(geometry.listRows.every((row) => row.backgroundImage === "none"), `${label} renders a background image inside list choices`);
  assert(
    geometry.listRows.every((row) => row.switchSlot === "switch" && row.switchRole === "switch" && row.thumbCount === 1),
    `${label} list choices do not use the official shadcn Switch`,
  );
  assert(
    geometry.listRows.every((row) => (
      (row.ariaChecked === "true" || row.ariaChecked === "false")
      && row.dataChecked === (row.ariaChecked === "true")
      && row.dataUnchecked === (row.ariaChecked === "false")
      && row.dataChecked !== row.dataUnchecked
    )),
    `${label} list switch state is not exposed consistently`,
  );
  for (let index = 0; index < geometry.listRows.length; index += 1) {
    const row = geometry.listRows[index];
    assert(
      row.titleText && await dialog.locator(".wish-editor__list-row").nth(index).getByRole("switch", { name: row.titleText, exact: true }).count() === 1,
      `${label} list switch does not expose the exact accessible name “${row.titleText}”`,
    );
  }
  assert(geometry.listRows.every((row) => row.row.height >= 44), `${label} list choices have undersized touch targets`);
  assert(geometry.listRows.every((row) => row.listSwitch && row.title), `${label} list choices are missing a switch or title`);
  assert(
    geometry.listRows.every((row) => (
      Math.abs((row.listSwitch.top + row.listSwitch.height / 2) - (row.row.top + row.row.height / 2)) <= 1
      && row.listSwitch.width >= 31
      && row.listSwitch.height >= 18
      && row.title.right < row.listSwitch.left
      && row.listSwitch.right <= row.row.right + 1
      && row.title.width > 0
    )),
    `${label} list choices are misaligned or overflow their rows`,
  );
  if (mode === "create") {
    assert(geometry.emptyUpload, `${label} does not expose one empty upload dropzone`);
    assert(
      geometry.emptyUpload.trigger.tag === "BUTTON"
        && geometry.emptyUpload.trigger.type === "button"
        && geometry.emptyUpload.trigger.slot === "button",
      `${label} empty upload action is not the official shadcn Button`,
    );
    assert(
      ["transparent", "rgba(0, 0, 0, 0)"].includes(geometry.emptyUpload.trigger.background)
        && geometry.emptyUpload.trigger.backgroundImage === "none"
        && geometry.emptyUpload.trigger.borderWidths.every((width) => width === 0)
        && !geometry.emptyUpload.trigger.hasVisibleShadow
        && geometry.emptyUpload.paintedDescendantCount === 0,
      `${label} empty upload dropzone still contains a nested visual card (${JSON.stringify(geometry.emptyUpload)})`,
    );
    assert(
      ["left", "top", "right", "bottom"].every((edge) => (
        Math.abs(geometry.emptyUpload.trigger[edge] - geometry.emptyUpload.outer[edge]) <= 1
      )),
      `${label} empty upload action does not cover the complete dropzone`,
    );
    assert(
      geometry.emptyUpload.outer.scrollWidth <= geometry.emptyUpload.outer.clientWidth + 1
        && geometry.emptyUpload.outer.scrollHeight <= geometry.emptyUpload.outer.clientHeight + 1
        && geometry.emptyUpload.trigger.scrollWidth <= geometry.emptyUpload.trigger.clientWidth + 1
        && geometry.emptyUpload.trigger.scrollHeight <= geometry.emptyUpload.trigger.clientHeight + 1
        && geometry.emptyUpload.text.every((node) => (
          node.scrollWidth <= node.clientWidth + 1
          && node.left >= geometry.emptyUpload.trigger.left - 1
          && node.right <= geometry.emptyUpload.trigger.right + 1
          && node.top >= geometry.emptyUpload.trigger.top - 1
          && node.bottom <= geometry.emptyUpload.trigger.bottom + 1
        )),
      `${label} empty upload content overflows its dropzone`,
    );
    assert(
      geometry.emptyUpload.section
        && Math.abs(geometry.emptyUpload.outer.left - geometry.emptyUpload.section.left) <= 1
        && Math.abs(geometry.emptyUpload.outer.right - geometry.emptyUpload.section.right) <= 1,
      `${label} empty upload dropzone does not fill its media column`,
    );
    assert(geometry.remove === null, `${label} exposes delete for an unsaved wish`);
    assert(geometry.titleCount === 1, `${label} does not expose the new-wish title`);
    assert(geometry.title?.hittable, `${label} new-wish title is covered`);
    assert(geometry.title.top >= 0 && geometry.title.bottom <= geometry.viewport.height, `${label} new-wish title is outside the viewport`);
    assert(geometry.title.right <= geometry.submit.left + 1, `${label} new-wish title overlaps the submit action`);
  } else {
    assert(geometry.remove?.hittable, `${label} delete action is covered`);
    assert(geometry.titleCount === 0, `${label} exposes the creation title while editing`);
  }
  assert(geometry.rootWidth <= geometry.viewport.width + 1, `${label} has horizontal overflow`);

  if (mobile) {
    assert(Math.abs(geometry.dialog.width - geometry.viewport.width) <= 1, `${label} is not full width (${geometry.dialog.width}px of ${geometry.viewport.width}px)`);
    assert(geometry.dialog.height >= geometry.viewport.height - 1, `${label} is not full height`);
    assert(geometry.media.top < geometry.panel.top, `${label} does not stack media above fields`);
    assert(Math.abs(geometry.media.left - geometry.panel.left) <= 1, `${label} mobile columns are not aligned`);
    if (mode === "create") assert(Math.abs(geometry.media.width - geometry.media.height) <= 2, `${label} mobile upload dropzone is not square`);
    assert(geometry.submit.position === "fixed", `${label} submit action is not fixed on mobile`);
    assert(geometry.close.position === "fixed", `${label} close action is not fixed on mobile`);
  } else {
    assert(geometry.dialog.width >= geometry.viewport.width - 50, `${label} is not viewport-wide`);
    assert(geometry.dialog.height >= geometry.viewport.height - 50, `${label} is not viewport-high`);
    assert(geometry.media.right < geometry.panel.left, `${label} does not keep media and fields in separate columns`);
    assert(Math.abs(geometry.media.top - geometry.submit.top) <= 2, `${label} does not align media with submit`);
    assert(Math.abs(geometry.media.width - geometry.panel.width) <= 24, `${label} editor columns are not balanced`);
    if (mode === "create") assert(geometry.media.height > geometry.media.width, `${label} create dropzone is not tall`);
    else assert(Math.abs(geometry.media.width - geometry.media.height) <= 2, `${label} media is not square`);
    assert(geometry.scroll.overflowY === "auto", `${label} right form rail is not independently scrollable`);
  }
}

async function expectWishEditorLandscape(dialog, label) {
  await dialog.waitFor({ state: "visible" });
  await dialog.evaluate(async () => {
    await new Promise((resolve) => setTimeout(resolve, 180));
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
  const geometry = await dialog.evaluate((element) => {
    const rectOf = (node) => {
      const rect = node.getBoundingClientRect();
      return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height };
    };
    const hitContains = (node) => {
      const rect = node.getBoundingClientRect();
      const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      return hit === node || node.contains(hit);
    };
    const media = element.querySelector(".wish-editor__image");
    const panel = element.querySelector(".wish-editor__panel");
    const submit = element.querySelector(".wish-editor__submit");
    const close = element.querySelector(".modal__close");
    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      dialog: rectOf(element),
      media: rectOf(media),
      panel: rectOf(panel),
      submit: { ...rectOf(submit), position: getComputedStyle(submit).position, hittable: hitContains(submit) },
      close: { ...rectOf(close), position: getComputedStyle(close).position, hittable: hitContains(close) },
      rootWidth: document.documentElement.scrollWidth,
    };
  });
  assert(Math.abs(geometry.dialog.width - geometry.viewport.width) <= 1, `${label} is not full width`);
  assert(geometry.dialog.height >= geometry.viewport.height - 1, `${label} is not full height`);
  assert(geometry.media.right < geometry.panel.left, `${label} does not use the compact landscape columns`);
  assert(geometry.media.bottom <= geometry.viewport.height + 1, `${label} clips the media below the landscape viewport`);
  assert(geometry.panel.right <= geometry.viewport.width + 1, `${label} pushes the form outside the viewport`);
  assert(geometry.rootWidth <= geometry.viewport.width + 1, `${label} has horizontal overflow`);
  assert(geometry.submit.position === "fixed" && geometry.submit.hittable, `${label} Update action is not fixed and reachable`);
  assert(geometry.close.position === "fixed" && geometry.close.hittable, `${label} close action is not fixed and reachable`);
}

async function expectSettingsScreen(page, label, { mobile = false, openEditor = true } = {}) {
  const settings = page.locator(".settings-page");
  await settings.waitFor({ state: "visible" });
  await waitForStableLayout(page);

  const sections = settings.locator(":scope > .settings-section");
  assert(await sections.count() === 3, `${label} should expose three settings sections`);
  const sectionTitles = (await sections.locator(":scope > h2").allInnerTexts()).map((value) => value.trim());
  assert(
    JSON.stringify(sectionTitles) === JSON.stringify(["Общие сведения", "Управление данными", "Приватность"]),
    `${label} section order differs: ${sectionTitles.join(" | ")}`,
  );
  assert(await settings.locator(":scope > .settings-section > .settings-profile-card").count() === 1, `${label} is missing the profile summary card`);
  assert(await settings.locator(":scope > .settings-section > .settings-card").count() === 2, `${label} should expose two grouped settings cards`);
  assert(await sections.nth(1).locator(".settings-row").count() === 4, `${label} data card should expose email, phone, birthday and profile address`);
  assert(await sections.nth(2).locator(".settings-row").count() === 2, `${label} privacy card should expose the two supported privacy destinations`);
  const rowLabels = (await settings.locator(".settings-row__copy > strong").allInnerTexts()).map((value) => value.trim());
  assert(
    JSON.stringify(rowLabels) === JSON.stringify([
      "demo@rollapp.test",
      "Номер телефона",
      "День рождения",
      "Адрес профиля",
      "Доступ к спискам",
      "Секретные желания",
    ]),
    `${label} settings rows differ: ${rowLabels.join(" | ")}`,
  );
  assert((await settings.locator(".settings-form").count()) === 0, `${label} still renders the legacy flat settings form`);
  assert((await settings.getByRole("switch").count()) === 0, `${label} exposes a privacy switch that is not backed by the profile API`);
  assert((await settings.locator("input[type='checkbox'], input[type='radio'], .settings-switch").count()) === 0, `${label} exposes a fake settings toggle`);

  const geometry = await settings.evaluate((element) => {
    const rectOf = (node) => {
      const rect = node.getBoundingClientRect();
      return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height };
    };
    const sectionNodes = [...element.querySelectorAll(":scope > .settings-section")];
    const cardNodes = sectionNodes.map((section) => section.querySelector(":scope > .settings-profile-card, :scope > .settings-card"));
    const rowNodes = [...element.querySelectorAll(".settings-row")];
    const rowLayouts = rowNodes.map((row) => {
      const style = getComputedStyle(row);
      return {
        display: style.display,
        paddingLeft: Number.parseFloat(style.paddingLeft),
        paddingRight: Number.parseFloat(style.paddingRight),
        icon: rectOf(row.querySelector(".settings-row__icon")),
        iconSvg: rectOf(row.querySelector(".settings-row__icon svg")),
        copy: rectOf(row.querySelector(".settings-row__copy")),
        trailing: rectOf(row.querySelector(".settings-row__badge, .settings-row__arrow")),
        arrowSvg: row.querySelector(".settings-row__arrow svg") ? rectOf(row.querySelector(".settings-row__arrow svg")) : null,
      };
    });
    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      page: rectOf(element),
      sections: sectionNodes.map(rectOf),
      headings: sectionNodes.map((section) => rectOf(section.querySelector(":scope > h2"))),
      cards: cardNodes.map(rectOf),
      rows: rowNodes.map(rectOf),
      rowLayouts,
      rootWidth: Math.max(document.documentElement.scrollWidth, document.body?.scrollWidth || 0),
    };
  });
  const close = (left, right, tolerance = 2) => Math.abs(left - right) <= tolerance;
  assert(geometry.sections.every((section) => section.width > 0 && section.height > 0), `${label} contains an empty settings section`);
  assert(geometry.cards.every((card) => card.width > 0 && card.height > 0), `${label} contains an empty settings card`);
  assert(
    geometry.sections.every((section) => close(section.left, geometry.sections[0].left) && close(section.width, geometry.sections[0].width)),
    `${label} settings sections do not share one content column`,
  );
  assert(
    geometry.cards.every((card, index) => close(card.left, geometry.sections[index].left) && close(card.width, geometry.sections[index].width)),
    `${label} settings cards do not fill their section width`,
  );
  assert(
    geometry.sections.every((section, index) => index === 0 || section.top > geometry.sections[index - 1].bottom),
    `${label} settings sections overlap`,
  );
  assert(
    geometry.headings.every((heading, index) => heading.bottom <= geometry.cards[index].top),
    `${label} a settings card overlaps its section heading`,
  );
  assert(geometry.rows.every((row) => row.width > 0 && row.height >= (mobile ? 52 : 48)), `${label} contains a collapsed settings row`);
  assert(geometry.rowLayouts.every((row) => row.display === "grid"), `${label} contains a settings row that is not a grid`);
  assert(
    geometry.rowLayouts.every((row) => row.paddingLeft <= 1 && row.paddingRight <= 1),
    `${label} contains a settings row with inconsistent horizontal padding`,
  );
  const rowAlignment = geometry.rowLayouts[0];
  assert(
    geometry.rowLayouts.every((row) => close(row.icon.left, rowAlignment.icon.left, 1) && close(row.copy.left, rowAlignment.copy.left, 1)),
    `${label} settings icons or labels do not share one column`,
  );
  assert(
    geometry.rowLayouts.every((row) => close(row.iconSvg.width, 24, 1) && close(row.iconSvg.height, 24, 1)),
    `${label} settings icons do not share the 24px size`,
  );
  assert(
    geometry.rowLayouts.every((row) => !row.arrowSvg || (close(row.arrowSvg.width, 24, 1) && close(row.arrowSvg.height, 24, 1))),
    `${label} settings arrows do not share the 24px size`,
  );
  assert(
    geometry.rowLayouts.every((row, index) => close(row.trailing.right, geometry.rows[index].right, 1)),
    `${label} settings actions do not align to the right edge`,
  );
  assert(geometry.rootWidth <= geometry.viewport.width + 1, `${label} has horizontal root overflow`);
  if (mobile) {
    const minimumWidth = geometry.viewport.width - (geometry.viewport.width <= 400 ? 48 : 80);
    assert(
      geometry.sections[0].width >= minimumWidth && geometry.sections[0].width <= geometry.viewport.width,
      `${label} settings content width is ${geometry.sections[0].width}px inside a ${geometry.viewport.width}px viewport`,
    );
  } else {
    assert(
      geometry.sections[0].width >= 700 && geometry.sections[0].width <= 780,
      `${label} settings card width differs from the 750px reference (${geometry.sections[0].width}px)`,
    );
  }
  await expectNoRootOverflow(page, label);

  const phoneRow = settings.locator("button.settings-row").filter({ hasText: "Номер телефона" });
  assert(await phoneRow.count() === 1, `${label} is missing the phone sign-in settings action`);
  assert(
    (await phoneRow.locator(".settings-row__copy > small").innerText()).trim() === "Не привязан",
    `${label} does not explain that the demo phone number is not linked`,
  );
  await phoneRow.click();
  const phoneDialog = page.getByRole("dialog", { name: "Привязать номер", exact: true });
  await phoneDialog.waitFor({ state: "visible" });
  assert(await phoneDialog.locator("[data-slot='dialog-title']").count() === 1, `${label} phone dialog is missing the official DialogTitle`);
  await phoneDialog.locator(".modal-heading").getByRole("heading", { name: "Привязать номер", exact: true }).waitFor();
  const unavailableStatus = phoneDialog.getByRole("status");
  await unavailableStatus.getByText("Вход по телефону временно недоступен", { exact: true }).waitFor();
  await unavailableStatus.getByText("Попробуйте снова немного позже.", { exact: true }).waitFor();
  assert(await phoneDialog.locator("input").count() === 0, `${label} exposes a phone input while the SMS provider is disabled`);
  assert(await phoneDialog.locator("form").count() === 0, `${label} exposes a phone form while the SMS provider is disabled`);
  const phoneClose = phoneDialog.getByRole("button", { name: "Закрыть диалог", exact: true });
  assert(await phoneClose.count() === 1, `${label} phone dialog is missing an accessible close action`);
  assert(
    await phoneDialog.evaluate((element) => element.contains(document.activeElement)),
    `${label} phone dialog did not receive keyboard focus`,
  );
  await expectDarkAuthenticatedModal(phoneDialog, `${label} disabled phone sign-in`);
  await expectNoRootOverflow(page, `${label} disabled phone sign-in`);
  await phoneClose.click();
  await phoneDialog.waitFor({ state: "detached" });

  if (!openEditor) return;
  await settings.getByRole("button", { name: "Редактировать общие сведения", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Редактирование общих сведений", exact: true });
  await dialog.waitFor({ state: "visible" });
  await dialog.getByRole("heading", { name: "Изменить профиль", exact: true }).waitFor();
  await expectDarkAuthenticatedModal(dialog, `${label} profile editor`);

  const avatarUrl = dialog.getByLabel("Ссылка на фото", { exact: true });
  const name = dialog.getByLabel("Имя", { exact: true });
  const username = dialog.getByLabel("Адрес профиля", { exact: true });
  const bio = dialog.locator("textarea").first();
  const birthday = dialog.getByLabel("День рождения", { exact: true });
  const avatarUpload = dialog.getByLabel("Загрузить фото профиля", { exact: true });
  for (const [fieldLabel, field] of [
    ["avatar URL", avatarUrl],
    ["name", name],
    ["username", username],
    ["bio", bio],
    ["birthday", birthday],
    ["avatar upload", avatarUpload],
  ]) {
    assert(await field.count() === 1, `${label} profile editor is missing the supported ${fieldLabel} field`);
  }
  assert(await dialog.locator("input:not([type='file'])").count() === 4, `${label} profile editor exposes unsupported text inputs`);
  assert(await dialog.locator("textarea").count() === 1, `${label} profile editor exposes unsupported textareas`);
  assert(await dialog.locator("select").count() === 0, `${label} profile editor exposes an unsupported select`);
  assert(await dialog.locator("input[type='email'], input[type='password']").count() === 0, `${label} profile editor exposes an unsupported account field`);
  assert(await dialog.getByRole("switch").count() === 0, `${label} profile editor exposes a privacy switch unsupported by /api/me`);
  assert(await dialog.locator("input[type='checkbox'], input[type='radio'], .settings-switch").count() === 0, `${label} profile editor exposes a fake toggle`);
  assert(await avatarUpload.getAttribute("accept") === "image/jpeg,image/png,image/webp", `${label} profile editor accepts unsupported avatar formats`);
  assert(await username.getAttribute("pattern") === "[a-z0-9-]{3,32}", `${label} profile editor lost the username constraint`);
  const addressGroup = dialog.locator("[data-slot='input-group']");
  const addressControl = addressGroup.locator(":scope > [data-slot='input-group-control']");
  const addressAddon = addressGroup.locator(":scope > [data-slot='input-group-addon'][data-align='inline-start']");
  assert(await dialog.locator(".input-prefix").count() === 0, `${label} profile address still uses the legacy prefix wrapper`);
  assert(await addressGroup.count() === 1, `${label} profile address does not use one canonical InputGroup`);
  assert(await addressControl.count() === 1, `${label} profile address does not use InputGroupInput`);
  assert(await addressAddon.count() === 1, `${label} profile address is missing InputGroupAddon`);
  assert((await addressAddon.innerText()).trim() === "роллапп.рф/", `${label} profile address prefix changed`);
  await username.evaluate((input) => input.focus({ preventScroll: true }));
  const addressGeometry = await dialog.evaluate((element) => {
    const rectOf = (node) => {
      const rect = node.getBoundingClientRect();
      return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height };
    };
    const styleOf = (node) => {
      const style = getComputedStyle(node);
      const hasVisibleShadow = style.boxShadow !== "none"
        && (style.boxShadow.match(/-?(?:\d+\.?\d*|\.\d+)px/g) || [])
          .some((length) => Math.abs(Number.parseFloat(length)) > .01);
      return {
        background: style.backgroundColor,
        backgroundImage: style.backgroundImage,
        borderWidths: [style.borderTopWidth, style.borderRightWidth, style.borderBottomWidth, style.borderLeftWidth].map(Number.parseFloat),
        borderRadius: Number.parseFloat(style.borderTopLeftRadius),
        hasVisibleShadow,
      };
    };
    const group = element.querySelector("[data-slot='input-group']");
    const control = group?.querySelector(":scope > [data-slot='input-group-control']");
    const addon = group?.querySelector(":scope > [data-slot='input-group-addon']");
    const prefix = addon?.querySelector(":scope > span");
    const field = group?.closest("[data-slot='field']");
    const name = element.querySelector("#settings-profile-name");
    if (!group || !control || !addon || !prefix || !field || !name) return null;
    return {
      group: {
        ...rectOf(group),
        ...styleOf(group),
        role: group.getAttribute("role"),
        clientWidth: group.clientWidth,
        scrollWidth: group.scrollWidth,
      },
      control: {
        ...rectOf(control),
        ...styleOf(control),
        slot: control.getAttribute("data-slot"),
        focused: document.activeElement === control,
        clientWidth: control.clientWidth,
        scrollWidth: control.scrollWidth,
      },
      addon: {
        ...rectOf(addon),
        ...styleOf(addon),
        slot: addon.getAttribute("data-slot"),
        align: addon.getAttribute("data-align"),
      },
      prefix: {
        ...rectOf(prefix),
        clientWidth: prefix.clientWidth,
        scrollWidth: prefix.scrollWidth,
      },
      field: rectOf(field),
      name: rectOf(name),
      nestedCardCount: group.querySelectorAll("[data-slot='card']").length,
    };
  });
  const transparentSurface = (value) => ["transparent", "rgba(0, 0, 0, 0)"].includes(value);
  assert(addressGeometry, `${label} profile address group geometry is unavailable`);
  assert(
    addressGeometry.group.role === "group"
      && !transparentSurface(addressGeometry.group.background)
      && addressGeometry.group.backgroundImage === "none"
      && addressGeometry.group.borderWidths.every((width) => width >= 1)
      && addressGeometry.group.borderRadius > 0
      && addressGeometry.group.height >= 50,
    `${label} InputGroup does not own the profile-address surface (${JSON.stringify(addressGeometry)})`,
  );
  assert(
    addressGeometry.control.focused
      && addressGeometry.control.slot === "input-group-control"
      && transparentSurface(addressGeometry.control.background)
      && addressGeometry.control.backgroundImage === "none"
      && addressGeometry.control.borderWidths.every((width) => width === 0)
      && !addressGeometry.control.hasVisibleShadow,
    `${label} profile-address control renders a second focused surface`,
  );
  assert(
    addressGeometry.addon.slot === "input-group-addon"
      && addressGeometry.addon.align === "inline-start"
      && transparentSurface(addressGeometry.addon.background)
      && addressGeometry.addon.backgroundImage === "none"
      && addressGeometry.addon.borderWidths.every((width) => width === 0)
      && !addressGeometry.addon.hasVisibleShadow
      && addressGeometry.nestedCardCount === 0,
    `${label} profile-address addon renders nested chrome`,
  );
  assert(
    Math.abs(addressGeometry.group.left - addressGeometry.field.left) <= 1
      && Math.abs(addressGeometry.group.right - addressGeometry.field.right) <= 1
      && addressGeometry.addon.left >= addressGeometry.group.left - 1
      && addressGeometry.addon.right <= addressGeometry.control.left + 1
      && addressGeometry.control.right <= addressGeometry.group.right + 1
      && addressGeometry.control.top >= addressGeometry.group.top - 1
      && addressGeometry.control.bottom <= addressGeometry.group.bottom + 1,
    `${label} profile-address parts are misaligned`,
  );
  assert(
    addressGeometry.group.scrollWidth <= addressGeometry.group.clientWidth + 1
      && addressGeometry.control.scrollWidth <= addressGeometry.control.clientWidth + 1
      && addressGeometry.prefix.scrollWidth <= addressGeometry.prefix.clientWidth + 1
      && addressGeometry.prefix.left >= addressGeometry.addon.left - 1
      && addressGeometry.prefix.right <= addressGeometry.addon.right + 1,
    `${label} profile-address prefix or value overflows`,
  );
  assert(
    Math.abs(addressGeometry.group.width - addressGeometry.name.width) <= 1
      && Math.abs(addressGeometry.group.height - addressGeometry.name.height) <= 1,
    `${label} profile-address and name controls use different dimensions`,
  );
  if (mobile) {
    assert(
      Math.abs(addressGeometry.group.left - addressGeometry.name.left) <= 1
        && Math.abs(addressGeometry.group.right - addressGeometry.name.right) <= 1
        && addressGeometry.group.top > addressGeometry.name.bottom,
      `${label} mobile profile fields do not share one column`,
    );
  } else {
    assert(Math.abs(addressGeometry.group.top - addressGeometry.name.top) <= 1, `${label} desktop profile row is vertically misaligned`);
  }
  assert(
    await birthday.evaluate((input) => input.max === new Date().toISOString().slice(0, 10)),
    `${label} profile editor allows a future birthday`,
  );

  const save = dialog.getByRole("button", { name: "Сохранить", exact: true });
  assert(await save.isDisabled(), `${label} profile save should be disabled before a supported field changes`);
  const initialName = await name.inputValue();
  await name.fill(`${initialName} ·`);
  assert(await save.isEnabled(), `${label} profile save did not enable for a dirty supported field`);
  await name.fill(initialName);
  assert(await save.isDisabled(), `${label} profile save did not disable after restoring the initial value`);
  await waitForStableLayout(page);

  const modalGeometry = await dialog.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return {
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
      width: rect.width,
      viewportWidth: window.innerWidth,
      scrollWidth: element.scrollWidth,
      clientWidth: element.clientWidth,
    };
  });
  assert(modalGeometry.left >= -1 && modalGeometry.right <= modalGeometry.viewportWidth + 1, `${label} profile editor escapes the viewport`);
  assert(modalGeometry.scrollWidth <= modalGeometry.clientWidth + 1, `${label} profile editor has horizontal overflow`);
  if (mobile) {
    assert(
      modalGeometry.width >= modalGeometry.viewportWidth - 2,
      `${label} profile editor is not full width on mobile (${modalGeometry.width}px of ${modalGeometry.viewportWidth}px)`,
    );
  } else {
    assert(modalGeometry.width >= 700 && modalGeometry.width <= 780, `${label} profile editor width differs from the wide-modal reference`);
  }
  await expectNoRootOverflow(page, `${label} profile editor`);
  await dialog.getByRole("button", { name: "Отмена", exact: true }).click();
  await dialog.waitFor({ state: "detached" });
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
  const menu = page.locator(".friend-row__menu");
  await menu.waitFor({ state: "visible" });
  assert(await menu.getAttribute("role") === "menu", `Actions for ${personName} do not use an official role=menu popup`);
  assert(await menuButton.getAttribute("aria-controls") === await menu.getAttribute("id"), `Actions for ${personName} are not linked to their trigger`);
  const item = menu.getByRole("menuitem", { name: action, exact: true });
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
  const toggleGroup = navigation.getByRole("group", { name: "Разделы друзей", exact: true });
  assert(await toggleGroup.getAttribute("data-slot") === "toggle-group", `${label} does not use the official ToggleGroup`);
  const toggles = toggleGroup.getByRole("button");
  assert(await toggles.count() === 3, `${label} should expose three official friend toggles`);
  for (const tab of Object.keys(friendsRoutes)) {
    const tabControl = toggleGroup.getByRole("button", { name: friendsLabels[tab], exact: true });
    assert(await tabControl.getAttribute("data-slot") === "toggle-group-item", `${label} ${friendsLabels[tab]} is not an official ToggleGroupItem`);
  }
  const activeControl = toggleGroup.getByRole("button", { name: friendsLabels[activeTab], exact: true });
  assert(await activeControl.getAttribute("aria-pressed") === "true", `${label} does not press ${friendsLabels[activeTab]} in the ToggleGroup`);
  return navigation;
}

async function openFriendsTab(page, tab, label) {
  const navigation = page.getByRole("navigation", { name: "Разделы друзей" });
  const link = navigation.getByRole("group", { name: "Разделы друзей", exact: true }).getByRole("button", { name: friendsLabels[tab], exact: true });
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
  const search = page.locator(".friends-search");
  await navigation.waitFor({ state: "visible" });
  await firstRow.waitFor({ state: "visible" });
  await search.waitFor({ state: "visible" });
  await waitForStableLayout(page);
  const geometry = await page.evaluate((navigationSelector) => {
    const navigationNode = document.querySelector(navigationSelector);
    const rowNode = document.querySelector(".friend-row");
    const navigationRect = navigationNode?.getBoundingClientRect();
    const rowRect = rowNode?.getBoundingClientRect();
    const linkRects = [...(navigationNode?.querySelectorAll("[data-slot='toggle-group-item']") || [])].map((control) => {
      const rect = control.getBoundingClientRect();
      return { width: rect.width, height: rect.height };
    });
    return {
      viewportWidth: document.documentElement.clientWidth,
      navigation: navigationRect && { left: navigationRect.left, right: navigationRect.right, top: navigationRect.top, bottom: navigationRect.bottom, width: navigationRect.width },
      row: rowRect && { left: rowRect.left, right: rowRect.right, top: rowRect.top, width: rowRect.width },
      linkRects,
    };
  }, ".friends-section-nav");
  assert(geometry.navigation && geometry.row, `${label} is missing its friend navigation or list geometry`);
  assert(geometry.linkRects.length === 3, `${label} is missing ToggleGroup navigation targets`);
  assert(geometry.row.right <= geometry.viewportWidth + 1, `${label} friend rows extend beyond the viewport`);
  assert(geometry.navigation.bottom <= geometry.row.top + 1, `${label} friend navigation should sit above the list`);
  const searchSurface = await search.evaluate((wrapper) => {
    const input = wrapper.querySelector("[data-slot='input']");
    const icon = wrapper.querySelector(":scope > svg");
    if (!input || !icon) return null;
    const wrapperRect = wrapper.getBoundingClientRect();
    const inputRect = input.getBoundingClientRect();
    const iconRect = icon.getBoundingClientRect();
    const inputStyle = getComputedStyle(input);
    return {
      inputCount: wrapper.querySelectorAll("[data-slot='input']").length,
      wrapper: { left: wrapperRect.left, right: wrapperRect.right, top: wrapperRect.top, bottom: wrapperRect.bottom },
      input: { left: inputRect.left, right: inputRect.right, top: inputRect.top, bottom: inputRect.bottom },
      iconCenterY: iconRect.top + (iconRect.height / 2),
      inputCenterY: inputRect.top + (inputRect.height / 2),
      background: inputStyle.backgroundColor,
      backgroundImage: inputStyle.backgroundImage,
      borders: [inputStyle.borderTopWidth, inputStyle.borderRightWidth, inputStyle.borderBottomWidth, inputStyle.borderLeftWidth].map(Number.parseFloat),
      shadow: inputStyle.boxShadow,
    };
  });
  assert(searchSurface?.inputCount === 1, `${label} search should contain one official shadcn Input`);
  for (const edge of ["left", "right", "top", "bottom"]) {
    assert(Math.abs(searchSurface.wrapper[edge] - searchSurface.input[edge]) <= 1, `${label} search Input does not fill its ${edge} edge`);
  }
  assert(Math.abs(searchSurface.iconCenterY - searchSurface.inputCenterY) <= 1, `${label} search icon is not vertically centered`);
  assert(["transparent", "rgba(0, 0, 0, 0)"].includes(searchSurface.background), `${label} search Input has a second background (${searchSurface.background})`);
  assert(searchSurface.backgroundImage === "none", `${label} search Input has a second background image`);
  assert(searchSurface.borders.every((width) => width === 0), `${label} search Input has a second border (${searchSurface.borders.join("/")})`);
  const shadowLengths = [...searchSurface.shadow.matchAll(/-?(?:\d+\.?\d*|\.\d+)px/g)].map((match) => Number(match[0].slice(0, -2)));
  assert(searchSurface.shadow === "none" || shadowLengths.every((length) => length === 0), `${label} search Input has a second shadow (${searchSurface.shadow})`);
  if (mobile) {
    assert(geometry.navigation.width <= geometry.viewportWidth + 1, `${label} mobile friend navigation overflows the viewport`);
    assert(geometry.linkRects.every((rect) => rect.height >= 40), `${label} mobile friend navigation has undersized touch targets`);
    const pageHeight = await page.evaluate(() => ({ viewport: window.innerHeight, document: document.documentElement.scrollHeight }));
    assert(pageHeight.document <= pageHeight.viewport + 1, `${label} adds empty mobile scrolling (${pageHeight.document}px document inside ${pageHeight.viewport}px viewport)`);
  } else {
    assert(geometry.navigation.left >= geometry.row.left - 1, `${label} desktop friend navigation is not aligned with the directory`);
    assert(
      geometry.linkRects.every((rect) => rect.height >= 40),
      `${label} desktop friend navigation has undersized targets (${JSON.stringify(geometry.linkRects)})`,
    );
    const dock = page.locator(".friends-topbar__dock");
    await dock.waitFor({ state: "visible" });
    assert(await dock.locator(":scope > a:not(.friends-topbar__search)").count() === 2, `${label} desktop top dock should expose the two primary sections`);
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
  const rowPopover = page.locator(".friend-row__menu");
  await rowPopover.waitFor({ state: "visible" });
  assert(await rowPopover.getAttribute("role") === "menu", `${label} row popup does not expose role=menu`);
  assert(await rowPopover.getAttribute("data-slot") === "dropdown-menu-content", `${label} row popup is not official DropdownMenu content`);
  assert(await rowTrigger.getAttribute("aria-controls") === await rowPopover.getAttribute("id"), `${label} row popup is not linked to its trigger`);
  assert(await rowPopover.getByRole("menuitem").count() === 2, `${label} row popup should expose two menu items`);
  await page.keyboard.press("Escape");
  await rowPopover.waitFor({ state: "detached" });
  assert(await rowTrigger.evaluate((element) => document.activeElement === element), `${label} row popover does not restore trigger focus after Escape`);

  const accountTrigger = page.getByRole("button", { name: "Открыть меню аккаунта", exact: true });
  if (!(await accountTrigger.isVisible())) return;
  await accountTrigger.click();
  const accountPanel = page.locator(".friends-topbar__panel");
  await accountPanel.waitFor({ state: "visible" });
  assert(await accountPanel.getAttribute("role") === "menu", `${label} account popup does not expose role=menu`);
  assert(await accountPanel.getAttribute("data-slot") === "dropdown-menu-content", `${label} account popup is not official DropdownMenu content`);
  assert(await accountTrigger.getAttribute("aria-controls") === await accountPanel.getAttribute("id"), `${label} account popup is not linked to its trigger`);
  await accountPanel.getByRole("menuitem", { name: /Уведомления/ }).waitFor();
  await accountPanel.getByRole("menuitem", { name: "Настройки", exact: true }).waitFor();
  await accountPanel.getByRole("menuitem", { name: "Выйти", exact: true }).waitFor();
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
  assert(
    close(geometry.avatar.x, 1004) && close(geometry.avatar.y, 116) && close(geometry.avatar.width, 200),
    `${label} avatar geometry differs from the reference (${JSON.stringify(geometry.avatar)})`,
  );
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
  assert(await dock.locator(":scope > a:not(.profile-header__search)").count() === 2, `${label} profile dock should expose the two primary sections`);
}

function isGeneralListRecord(list) {
  return list.title === "Мои желания" && list.description === "Всё, чему я буду рад";
}

function normalizeMenuLabel(value) {
  return value.replace(/\s+/g, " ").trim();
}

async function wishRecordForCard(card, dashboard, label) {
  await card.waitFor({ state: "visible" });
  const wishId = await card.locator(".wish-card__open").getAttribute("data-wish-id");
  const wish = dashboard.wishes.find((item) => item.id === wishId);
  assert(wish, `${label} cannot match the rendered wish card to dashboard data (${wishId || "missing id"})`);
  return wish;
}

async function expectNoWishDetail(page, label) {
  assert((await page.locator(".modal--wish-detail").count()) === 0, `${label} unexpectedly opened the wish detail dialog`);
}

async function expectFixedPopoverGeometry(locator, label, { margin = 6 } = {}) {
  await locator.waitFor({ state: "visible" });
  const geometry = await locator.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    const positioner = element.parentElement?.getAttribute("role") === "presentation"
      ? element.parentElement
      : element;
    return {
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
      width: rect.width,
      height: rect.height,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      position: style.position,
      positionerPosition: getComputedStyle(positioner).position,
      positionerRole: positioner.getAttribute("role"),
      visibility: style.visibility,
    };
  });
  assert(geometry.positionerRole === "presentation", `${label} is missing the Base UI positioner`);
  assert(
    geometry.positionerPosition === "absolute" || geometry.positionerPosition === "fixed",
    `${label} Base UI positioner is not anchored (${geometry.positionerPosition})`,
  );
  assert(geometry.visibility !== "hidden", `${label} remained hidden after positioning`);
  assert(geometry.width > 0 && geometry.height > 0, `${label} has empty geometry`);
  assert(geometry.left >= margin - 1, `${label} extends beyond the viewport left edge (${geometry.left}px)`);
  assert(geometry.top >= margin - 1, `${label} extends beyond the viewport top edge (${geometry.top}px)`);
  assert(geometry.right <= geometry.viewportWidth - margin + 1, `${label} extends beyond the viewport right edge (${geometry.right}px of ${geometry.viewportWidth}px)`);
  assert(geometry.bottom <= geometry.viewportHeight - margin + 1, `${label} extends beyond the viewport bottom edge (${geometry.bottom}px of ${geometry.viewportHeight}px)`);
  return geometry;
}

async function expectMobileTouchTargets(locator, label, { minHeight = 40 } = {}) {
  const targets = await locator.evaluateAll(async (roots) => {
    const animations = [...new Set(roots.flatMap((root) => (
      root.closest("[role='menu']")?.getAnimations({ subtree: true }) || []
    )))];
    await Promise.all(animations.map((animation) => animation.finished.catch(() => {})));
    return [...new Set(roots.flatMap((root) => {
      const selector = "button, a, [role='menuitem'], [role='menuitemcheckbox'], [role='menuitemradio']";
      return [
        ...(root.matches(selector) ? [root] : []),
        ...root.querySelectorAll(selector),
      ];
    }))]
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
      })
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          label: element.getAttribute("aria-label") || element.textContent.replace(/\s+/g, " ").trim(),
          width: rect.width,
          height: rect.height,
        };
      });
  });
  assert(targets.length > 0, `${label} has no visible interactive targets`);
  for (const target of targets) {
    assert(
      target.width >= minHeight && target.height >= minHeight,
      `${label} target "${target.label}" is smaller than ${minHeight}px (${target.width}x${target.height})`,
    );
  }
}

async function waitForFocused(page, locator, label) {
  const handle = await locator.elementHandle();
  assert(handle, `${label} focus target is missing`);
  await page.waitForFunction((element) => document.activeElement === element, handle);
  await handle.dispose();
}

async function expectMenuFocus(page, menu, label) {
  const focused = await menu.evaluate((element) => {
    const active = document.activeElement;
    return active && element.contains(active)
      ? { role: active.getAttribute("role"), focusVisible: active.matches(":focus-visible") }
      : null;
  });
  assert(focused, `${label} did not move keyboard focus into the menu`);
  assert(
    focused.role === "menuitem" || focused.role === "menuitemcheckbox" || focused.role === "menuitemradio",
    `${label} focused a non-menu element (${focused.role || "no role"})`,
  );
  assert(focused.focusVisible, `${label} focused item has no visible keyboard focus`);
}

async function openOwnerWishCardMenu(page, card, wish, { keyboard = false } = {}) {
  const trigger = card.getByRole("button", { name: `Опции желания «${wish.title}»`, exact: true });
  if (keyboard) {
    await trigger.focus();
    await page.keyboard.press("Enter");
  } else {
    await trigger.click();
  }
  const menuId = `wish-menu-${wish.id}`;
  const menu = page.locator(`[id=${JSON.stringify(menuId)}]`);
  await menu.waitFor({ state: "visible" });
  assert(await trigger.getAttribute("aria-haspopup") === "menu", `Wish menu trigger for "${wish.title}" does not advertise a menu`);
  assert(await trigger.getAttribute("aria-expanded") === "true", `Wish menu trigger for "${wish.title}" is not expanded`);
  const controlsId = await trigger.getAttribute("aria-controls");
  assert(
    controlsId === menuId,
    `Wish menu trigger for "${wish.title}" is not linked to ${menuId}`,
  );
  assert(await menu.getAttribute("role") === "menu", `Wish menu for "${wish.title}" does not expose role=menu`);
  assert(await menu.getAttribute("data-slot") === "dropdown-menu-content", `Wish menu for "${wish.title}" is not the official DropdownMenu content`);
  assert(await menu.getAttribute("aria-labelledby") === await trigger.getAttribute("id"), `Wish menu for "${wish.title}" is not labelled by its trigger`);
  assert(
    await page.getByRole("menu", { name: `Опции желания «${wish.title}»`, exact: true }).count() === 1,
    `Wish menu for "${wish.title}" has the wrong accessible name`,
  );
  assert((await card.locator(`[id=${JSON.stringify(menuId)}]`).count()) === 0, `Wish menu for "${wish.title}" is not rendered through the official portal`);
  return { trigger, menu };
}

async function openOwnerWishListMenu(page, menu, wish, { keyboard = false, menuId = `wish-lists-${wish.id}` } = {}) {
  const listTrigger = menu.getByRole("menuitem", { name: "Добавить в список", exact: true });
  assert(await listTrigger.getAttribute("role") === "menuitem", `List submenu trigger for "${wish.title}" is not a menu item`);
  assert(await listTrigger.getAttribute("aria-haspopup") === "menu", `List submenu trigger for "${wish.title}" does not advertise a menu`);
  if (!(await listTrigger.evaluate((element) => element.hasAttribute("data-popup-open")))) {
    if (keyboard) await page.keyboard.press("Enter");
    else {
      await menu.evaluate(async (element) => {
        await Promise.all(element.getAnimations({ subtree: true }).map((animation) => animation.finished.catch(() => {})));
      });
      await listTrigger.hover();
    }
  }
  const listMenu = page.locator(`[id=${JSON.stringify(menuId)}]`);
  await listMenu.waitFor({ state: "visible" });
  const listTriggerHandle = await listTrigger.elementHandle();
  assert(listTriggerHandle, `List submenu trigger for "${wish.title}" disappeared while opening`);
  await page.waitForFunction(
    (element) => element.hasAttribute("data-popup-open") && Boolean(element.getAttribute("aria-controls")),
    listTriggerHandle,
  );
  await listTriggerHandle.dispose();
  assert(await listTrigger.evaluate((element) => element.hasAttribute("data-popup-open")), `List submenu trigger for "${wish.title}" is not expanded`);
  const controlsId = await listTrigger.getAttribute("aria-controls");
  assert(
    controlsId === menuId,
    `List submenu trigger for "${wish.title}" is not linked to ${menuId}`,
  );
  assert(await listMenu.getAttribute("role") === "menu", `List submenu for "${wish.title}" does not expose role=menu`);
  assert(await listMenu.getAttribute("data-slot") === "dropdown-menu-sub-content", `List submenu for "${wish.title}" is not the official DropdownMenu sub-content`);
  assert(await listMenu.getAttribute("aria-labelledby") === await listTrigger.getAttribute("id"), `List submenu for "${wish.title}" is not labelled by its trigger`);
  assert(
    await page.getByRole("menu", { name: "Добавить в список", exact: true }).count() === 1,
    `List submenu for "${wish.title}" has the wrong accessible name`,
  );
  if (keyboard && !(await listMenu.evaluate((element) => element.contains(document.activeElement)))) {
    await page.keyboard.press("ArrowRight");
    await page.waitForFunction((id) => document.getElementById(id)?.contains(document.activeElement), menuId);
  }
  return { listTrigger, listMenu };
}

async function expectOwnerWishCardMenu(page, card, wish, lists, label, { mobile = false } = {}) {
  const categoryLists = lists.filter((list) => !isGeneralListRecord(list));
  const expectedRootLabels = wish.status === "fulfilled"
    ? ["Не исполнено", "Загадать ещё раз", "Редактировать", "Удалить"]
    : [
      "Исполнено",
      "Редактировать",
      wish.privacy === "private" ? "Сделать видимым" : "Сделать секретным",
      "Добавить в список",
      "Поделиться",
      "Удалить",
  ];
  const { trigger, menu } = await openOwnerWishCardMenu(page, card, wish, { keyboard: true });
  const rootItems = menu.getByRole("menuitem");
  const actualRootLabels = (await rootItems.allInnerTexts()).map(normalizeMenuLabel);
  assert(
    JSON.stringify(actualRootLabels) === JSON.stringify(expectedRootLabels),
    `${label} root menu order differs: ${actualRootLabels.join(" | ")}`,
  );
  assert((await menu.getByRole("menuitem", { name: "Забронировать", exact: true }).count()) === 0, `${label} owner menu exposes a reservation action`);
  assert((await menu.getByRole("menuitem", { name: "Сохранить к себе", exact: true }).count()) === 0, `${label} owner menu exposes a copy action`);
  assert(await menu.getByRole("menuitem", { name: "Редактировать", exact: true }).getAttribute("aria-haspopup") === "dialog", `${label} edit action does not advertise its dialog`);
  assert(await menu.getByRole("menuitem", { name: "Удалить", exact: true }).getAttribute("data-variant") === "destructive", `${label} delete action is not the destructive DropdownMenu item`);
  await expectNoWishDetail(page, `${label} root menu`);
  await expectFixedPopoverGeometry(menu, `${label} root menu`);
  const triggerGeometry = await trigger.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return {
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
      width: rect.width,
      height: rect.height,
      hitInset: {
        left: parseFloat(getComputedStyle(element, "::before").left) || 0,
        right: parseFloat(getComputedStyle(element, "::before").right) || 0,
        top: parseFloat(getComputedStyle(element, "::before").top) || 0,
        bottom: parseFloat(getComputedStyle(element, "::before").bottom) || 0,
      },
    };
  });
  await expectMenuFocus(page, menu, `${label} root menu`);
  if (mobile) {
    const effectiveHitWidth = triggerGeometry.width - triggerGeometry.hitInset.left - triggerGeometry.hitInset.right;
    const effectiveHitHeight = triggerGeometry.height - triggerGeometry.hitInset.top - triggerGeometry.hitInset.bottom;
    assert(effectiveHitWidth >= 44 && effectiveHitHeight >= 44, `${label} menu trigger has no 44px touch hit area`);
    await expectMobileTouchTargets(rootItems, `${label} root menu`, { minHeight: 44 });
    await expectNoRootOverflow(page, `${label} root menu`);
  }
  const menuScreenshot = wish.status === "fulfilled"
    ? mobile ? "/tmp/rollapp-mobile-fulfilled-wish-card-menu.png" : "/tmp/rollapp-desktop-fulfilled-wish-card-menu.png"
    : mobile ? "/tmp/rollapp-mobile-wish-card-menu.png" : "/tmp/rollapp-desktop-wish-card-menu.png";
  await page.screenshot({ path: menuScreenshot });

  if (wish.status === "fulfilled") {
    assert((await menu.getByRole("menuitem", { name: "Добавить в список", exact: true }).count()) === 0, `${label} fulfilled menu exposes list assignment`);
    assert((await menu.getByRole("menuitem", { name: "Поделиться", exact: true }).count()) === 0, `${label} fulfilled menu exposes sharing`);
    await page.keyboard.press("Escape");
    await menu.waitFor({ state: "detached" });
    await waitForFocused(page, trigger, `${label} fulfilled trigger`);
    assert(await trigger.getAttribute("aria-expanded") === "false", `${label} fulfilled trigger remained expanded after Escape`);
    assert(await trigger.evaluate((element) => element.matches(":focus-visible")), `${label} fulfilled trigger has no visible focus after Escape`);
    const pointerMenu = await openOwnerWishCardMenu(page, card, wish);
    await page.mouse.click(4, 4);
    await pointerMenu.menu.waitFor({ state: "detached" });
    assert(await pointerMenu.trigger.getAttribute("aria-expanded") === "false", `${label} fulfilled outside dismissal left the trigger expanded`);
    await expectNoWishDetail(page, `${label} fulfilled outside dismissal`);
    return;
  }

  const listTriggerIndex = expectedRootLabels.indexOf("Добавить в список");
  for (let index = 0; index < listTriggerIndex; index += 1) await page.keyboard.press("ArrowDown");
  const listTrigger = menu.getByRole("menuitem", { name: "Добавить в список", exact: true });
  assert(await listTrigger.evaluate((element) => document.activeElement === element), `${label} list submenu trigger is not keyboard reachable`);
  const { listMenu } = await openOwnerWishListMenu(page, menu, wish, { keyboard: true });
  await expectNoWishDetail(page, `${label} list submenu`);
  await expectFixedPopoverGeometry(listMenu, `${label} list submenu`);
  await expectMenuFocus(page, listMenu, `${label} list submenu`);
  const options = listMenu.getByRole("menuitemcheckbox");
  const actualListLabels = (await options.allInnerTexts()).map(normalizeMenuLabel);
  const expectedListLabels = categoryLists.map((list) => list.title);
  assert(
    JSON.stringify(actualListLabels) === JSON.stringify(expectedListLabels),
    `${label} list submenu differs: ${actualListLabels.join(" | ")}`,
  );
  assert(await listMenu.getByRole("menuitem", { name: "Новый список", exact: true }).isVisible(), `${label} list submenu does not expose list creation`);
  for (const list of categoryLists) {
    const option = listMenu.getByRole("menuitemcheckbox", { name: list.title, exact: true });
    assert(
      await option.getAttribute("aria-checked") === String(wish.listIds.includes(list.id)),
      `${label} list "${list.title}" has the wrong initial checked state`,
    );
  }
  if (mobile) {
    await expectMobileTouchTargets(options, `${label} list submenu`, { minHeight: 44 });
    await expectNoRootOverflow(page, `${label} list submenu`);
  }
  await page.screenshot({ path: mobile ? "/tmp/rollapp-mobile-wish-card-lists.png" : "/tmp/rollapp-desktop-wish-card-lists.png" });

  await page.keyboard.press("Escape");
  await listMenu.waitFor({ state: "detached" });
  await menu.waitFor({ state: "visible" });
  assert(await listTrigger.getAttribute("aria-expanded") === "false", `${label} first Escape did not collapse the list submenu`);
  await waitForFocused(page, listTrigger, `${label} list trigger after Escape`);
  assert(await listTrigger.evaluate((element) => element.matches(":focus-visible")), `${label} list trigger has no visible focus after Escape`);
  await page.keyboard.press("Escape");
  await menu.waitFor({ state: "detached" });
  assert(await trigger.getAttribute("aria-expanded") === "false", `${label} second Escape did not collapse the root menu`);
  await waitForFocused(page, trigger, `${label} card trigger after Escape`);
  assert(await trigger.evaluate((element) => element.matches(":focus-visible")), `${label} card trigger has no visible focus after Escape`);

  const pointerMenu = await openOwnerWishCardMenu(page, card, wish);
  if (!mobile) {
    await pointerMenu.menu.getByRole("menuitem", { name: "Добавить в список", exact: true }).hover();
    const hoverListMenu = page.locator(`[id=${JSON.stringify(`wish-lists-${wish.id}`)}]`);
    await hoverListMenu.waitFor({ state: "visible" });
  }
  await page.mouse.click(4, 4);
  await pointerMenu.menu.waitFor({ state: "detached" });
  await page.locator(`[id=${JSON.stringify(`wish-lists-${wish.id}`)}]`).waitFor({ state: "detached" });
  assert(await pointerMenu.trigger.getAttribute("aria-expanded") === "false", `${label} outside pointer dismissal left the trigger expanded`);
  await expectNoWishDetail(page, `${label} outside dismissal`);
  if (!mobile) {
    const deleteMenu = await openOwnerWishCardMenu(page, card, wish);
    await deleteMenu.menu.getByRole("menuitem", { name: "Удалить", exact: true }).click();
    await deleteMenu.menu.waitFor({ state: "detached" });
    const deleteDialog = page.getByRole("dialog", { name: `Удаление желания «${wish.title}»`, exact: true });
    await deleteDialog.waitFor({ state: "visible" });
    await expectDarkAuthenticatedModal(deleteDialog, `${label} delete confirmation`);
    await deleteDialog.getByRole("button", { name: "Отмена", exact: true }).click();
    await deleteDialog.waitFor({ state: "detached" });
  }
}

async function expectWishDetailsOpen(page, label, { fullscreen = false } = {}) {
  const card = page.locator(".wish-card").first();
  await card.waitFor({ state: "visible" });
  const title = (await card.locator("h3").innerText()).trim();
  const opener = card.getByRole("button", { name: `Открыть желание «${title}»` });
  await opener.click();
  const dialog = page.getByRole("dialog", { name: `Желание: ${title}` });
  await dialog.waitFor({ state: "visible" });
  assert(await dialog.getAttribute("data-slot") === "dialog-content", `${label} detail does not use the official shadcn DialogContent`);
  const dialogTitle = dialog.locator(":scope > [data-slot='dialog-title']");
  assert(await dialogTitle.count() === 1, `${label} detail is missing its direct official DialogTitle`);
  assert((await dialogTitle.innerText()).trim() === `Желание: ${title}`, `${label} detail has the wrong DialogTitle`);
  const titleId = await dialogTitle.getAttribute("id");
  const labelledBy = (await dialog.getAttribute("aria-labelledby") || "").split(/\s+/);
  assert(titleId && labelledBy.includes(titleId), `${label} detail is not labelled by its official DialogTitle`);
  const close = dialog.getByRole("button", { name: "Закрыть диалог", exact: true });
  assert(await close.count() === 1, `${label} detail must expose exactly one close action`);
  assert(await close.getAttribute("data-slot") === "dialog-close", `${label} detail close action is not the official DialogClose`);
  const overlays = page.locator("[data-slot='dialog-overlay'][data-open]");
  assert(await overlays.count() === 1 && await overlays.first().isVisible(), `${label} detail is missing the official Dialog overlay`);
  assert(await overlays.first().getAttribute("role") === "presentation", `${label} detail overlay is not the official presentation backdrop`);
  assert(await dialog.evaluate((element) => element.contains(document.activeElement)), `${label} detail did not move focus inside the Dialog`);
  assert(await page.locator("html").evaluate((element) => getComputedStyle(element).overflowY === "hidden"), `${label} detail did not lock page scrolling`);
  if (!fullscreen) {
    assert((await dialog.getByRole("heading", { name: title, exact: true }).count()) === 1, `${label} detail does not show the selected wish title`);
  }
  assert(await dialog.locator(".wish-detail__price").isVisible(), `${label} detail does not show the selected wish price`);
  assert((await dialog.locator(".wish-detail__meta").count()) === 0, `${label} detail still shows the removed metadata pills`);
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

async function expectStandaloneBuyAction(dialog, expectedUrl, label) {
  const buyLink = dialog.getByRole("button", { name: "Где купить", exact: true });
  await buyLink.waitFor({ state: "visible" });
  await dialog.evaluate(async (element) => {
    await Promise.all(element.getAnimations({ subtree: true }).map((animation) => animation.finished.catch(() => {})));
  });
  const state = await buyLink.evaluate((link, url) => {
    const rect = link.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    const shell = link.closest(".wish-detail__price-bar");
    const style = shell ? getComputedStyle(shell) : null;
    const backgroundAlpha = (() => {
      if (!style) return 0;
      const canvas = document.createElement("canvas");
      canvas.width = 1;
      canvas.height = 1;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      context.clearRect(0, 0, 1, 1);
      context.fillStyle = style.backgroundColor;
      context.fillRect(0, 0, 1, 1);
      return context.getImageData(0, 0, 1, 1).data[3] / 255;
    })();
    return {
      isAnchor: link.tagName === "A",
      isShadcnButton: link.getAttribute("data-slot") === "button",
      href: link.href,
      expectedHref: new URL(url).href,
      target: link.target,
      rel: link.rel.split(/\s+/),
      width: rect.width,
      height: rect.height,
      hittable: hit === link || link.contains(hit),
      shell: style && {
        backgroundAlpha,
        backgroundImage: style.backgroundImage,
        borderWidths: [style.borderTopWidth, style.borderRightWidth, style.borderBottomWidth, style.borderLeftWidth].map(Number.parseFloat),
        padding: [style.paddingTop, style.paddingRight, style.paddingBottom, style.paddingLeft].map(Number.parseFloat),
        boxShadow: style.boxShadow,
      },
    };
  }, expectedUrl);
  assert(
    state.isAnchor && state.isShadcnButton && state.href === state.expectedHref && state.target === "_blank" && state.rel.includes("noreferrer"),
    `${label} lost its official shadcn external-link button semantics`,
  );
  assert(state.width >= 44 && state.height >= 44 && state.hittable, `${label} is not a usable 44px touch target (${JSON.stringify({ width: state.width, height: state.height, hittable: state.hittable })})`);
  assert(
    !state.shell || (
      state.shell.backgroundAlpha === 0
      && state.shell.backgroundImage === "none"
      && state.shell.borderWidths.every((value) => value === 0)
      && state.shell.padding.every((value) => value === 0)
      && state.shell.boxShadow === "none"
    ),
    `${label} is still wrapped in a visible outer surface`,
  );
}

async function expectOwnerWishDetailMenu(page, detail, wish, lists, label, { mobile = false } = {}) {
  assert(wish?.status === "active", `${label} requires an active owner wish`);
  await page.waitForTimeout(280);
  const categoryLists = lists.filter((list) => !isGeneralListRecord(list));
  const trigger = detail.dialog.getByRole("button", { name: `Опции желания «${wish.title}»`, exact: true });
  await trigger.focus();
  await page.keyboard.press("ArrowDown");
  const menuId = `wish-detail-menu-${wish.id}`;
  const menu = page.locator(`[id=${JSON.stringify(menuId)}]`);
  await menu.waitFor({ state: "visible" });
  assert(await trigger.getAttribute("aria-haspopup") === "menu", `${label} trigger does not advertise a menu`);
  assert(await trigger.getAttribute("aria-expanded") === "true", `${label} trigger is not expanded`);
  assert(await trigger.getAttribute("aria-controls") === menuId, `${label} trigger is not linked to the action menu`);
  assert(await menu.getAttribute("role") === "menu", `${label} action popup does not expose role=menu`);
  assert(await menu.getAttribute("data-slot") === "dropdown-menu-content", `${label} action popup is not official DropdownMenu content`);
  assert(await menu.getAttribute("aria-labelledby") === await trigger.getAttribute("id"), `${label} action menu is not labelled by its trigger`);
  assert(
    await page.getByRole("menu", { name: `Опции желания «${wish.title}»`, exact: true }).count() === 1,
    `${label} action menu has the wrong accessible name`,
  );

  const rootItems = menu.getByRole("menuitem");
  const expectedRootLabels = [
    "Исполнено",
    "Редактировать",
    wish.privacy === "private" ? "Сделать видимым" : "Сделать секретным",
    "Добавить в список",
    "Поделиться",
    "Удалить",
  ];
  const actualRootLabels = (await rootItems.allInnerTexts()).map(normalizeMenuLabel);
  assert(
    JSON.stringify(actualRootLabels) === JSON.stringify(expectedRootLabels),
    `${label} action order differs: ${actualRootLabels.join(" | ")}`,
  );
  assert(await menu.getByRole("menuitem", { name: "Редактировать", exact: true }).getAttribute("aria-haspopup") === "dialog", `${label} edit action does not advertise its dialog`);
  const deleteItem = menu.getByRole("menuitem", { name: "Удалить", exact: true });
  assert(await deleteItem.getAttribute("aria-haspopup") === "dialog", `${label} delete action does not advertise its confirmation`);
  assert(await deleteItem.getAttribute("data-variant") === "destructive", `${label} delete action is not the destructive DropdownMenu item`);

  await expectFixedPopoverGeometry(menu, `${label} root menu`);

  const triggerGeometry = await trigger.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return {
      width: rect.width,
      height: rect.height,
    };
  });
  const menuSurface = await menu.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + Math.min(24, rect.height / 2));
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    context.fillStyle = getComputedStyle(element).backgroundColor;
    context.fillRect(0, 0, 1, 1);
    const channels = [...context.getImageData(0, 0, 1, 1).data].slice(0, 3);
    return {
      hittable: element.contains(hit),
      background: channels,
    };
  });
  assert(menuSurface.hittable, `${label} root menu is covered by another layer`);
  assert(menuSurface.background.length === 3 && Math.max(...menuSurface.background) <= 70, `${label} root menu leaked a light surface`);
  await expectMenuFocus(page, menu, `${label} root menu`);
  if (mobile) {
    assert(triggerGeometry.width >= 39 && triggerGeometry.height >= 39, `${label} trigger is too small for touch`);
    await expectMobileTouchTargets(rootItems, `${label} root menu`, { minHeight: 44 });
    await expectNoRootOverflow(page, `${label} root menu`);
  }
  await page.screenshot({ path: mobile ? "/tmp/rollapp-mobile-wish-detail-menu.png" : "/tmp/rollapp-desktop-wish-detail-menu.png" });

  const listTriggerIndex = expectedRootLabels.indexOf("Добавить в список");
  for (let index = 0; index < listTriggerIndex; index += 1) await page.keyboard.press("ArrowDown");
  const listTrigger = menu.getByRole("menuitem", { name: "Добавить в список", exact: true });
  assert(await listTrigger.evaluate((element) => document.activeElement === element), `${label} list submenu trigger is not keyboard reachable`);
  const { listMenu } = await openOwnerWishListMenu(page, menu, wish, {
    keyboard: true,
    menuId: `wish-detail-action-lists-${wish.id}`,
  });
  await expectFixedPopoverGeometry(listMenu, `${label} list submenu`);
  await expectMenuFocus(page, listMenu, `${label} list submenu`);
  const options = listMenu.getByRole("menuitemcheckbox");
  const actualListLabels = (await options.allInnerTexts()).map(normalizeMenuLabel);
  const expectedListLabels = categoryLists.map((list) => list.title);
  assert(await options.locator("img, .card-menu__list-thumb").count() === 0, `${label} list submenu renders wish imagery`);
  const listOptionGeometry = await options.evaluateAll((items) => items.map((item) => {
    const rect = item.getBoundingClientRect();
    const title = item.querySelector(":scope > .card-menu__list-title");
    const titleRect = title?.getBoundingClientRect();
    return {
      height: rect.height,
      titleLeft: titleRect?.left ?? null,
      titleRight: titleRect?.right ?? null,
      rowLeft: rect.left,
      rowRight: rect.right,
      backgroundImage: getComputedStyle(item).backgroundImage,
    };
  }));
  assert(listOptionGeometry.every((item) => item.backgroundImage === "none"), `${label} list submenu renders a background image`);
  assert(
    listOptionGeometry.every((item) => item.titleLeft !== null && item.titleLeft >= item.rowLeft && item.titleRight <= item.rowRight + 1),
    `${label} list submenu titles overflow their choices`,
  );
  assert(
    JSON.stringify(actualListLabels) === JSON.stringify(expectedListLabels),
    `${label} list submenu differs: ${actualListLabels.join(" | ")}`,
  );
  for (const list of categoryLists) {
    assert(
      await listMenu.getByRole("menuitemcheckbox", { name: list.title, exact: true }).getAttribute("aria-checked") === String(wish.listIds.includes(list.id)),
      `${label} list "${list.title}" has the wrong checked state`,
    );
  }
  if (mobile) {
    await expectMobileTouchTargets(options, `${label} list submenu`, { minHeight: 44 });
    await expectNoRootOverflow(page, `${label} list submenu`);
  }
  await page.screenshot({ path: mobile ? "/tmp/rollapp-mobile-wish-detail-lists.png" : "/tmp/rollapp-desktop-wish-detail-lists.png" });

  await page.keyboard.press("Escape");
  await listMenu.waitFor({ state: "detached" });
  await menu.waitFor({ state: "visible" });
  await waitForFocused(page, listTrigger, `${label} list trigger after Escape`);
  await page.keyboard.press("Escape");
  await menu.waitFor({ state: "detached" });
  await detail.dialog.waitFor({ state: "visible" });
  await waitForFocused(page, trigger, `${label} detail trigger after Escape`);

  await trigger.click();
  const pointerMenu = page.locator(`[id=${JSON.stringify(menuId)}]`);
  await pointerMenu.waitFor({ state: "visible" });
  if (mobile) {
    const viewport = page.viewportSize();
    await page.mouse.click(viewport.width - 8, viewport.height - 8);
  } else {
    await detail.dialog.locator(".wish-detail__media").click({ position: { x: 32, y: 32 } });
  }
  await pointerMenu.waitFor({ state: "detached" });
  await detail.dialog.waitFor({ state: "visible" });
  assert(await trigger.getAttribute("aria-expanded") === "false", `${label} outside dismissal left the trigger expanded`);

  await trigger.click();
  const deleteMenu = page.locator(`[id=${JSON.stringify(menuId)}]`);
  await deleteMenu.getByRole("menuitem", { name: "Удалить", exact: true }).click();
  await deleteMenu.waitFor({ state: "detached" });
  const deleteDialog = page.getByRole("dialog", { name: `Удаление желания «${wish.title}»`, exact: true });
  await deleteDialog.waitFor({ state: "visible" });
  await expectDarkAuthenticatedModal(deleteDialog, `${label} delete confirmation`);
  await deleteDialog.getByRole("button", { name: "Отмена", exact: true }).click();
  await deleteDialog.waitFor({ state: "detached" });
  await detail.dialog.waitFor({ state: "visible" });
  await waitForFocused(page, trigger, `${label} detail trigger after delete cancellation`);
}

async function expectFulfilledActionContrast(page, dialog, label) {
  const action = dialog.getByRole("button", { name: "Отметить исполненным", exact: true });
  await action.waitFor({ state: "visible" });
  assert(await action.isEnabled(), `${label} fulfilled action is disabled`);
  const readState = () => action.evaluate((element) => {
    const parse = (value) => {
      const canvas = document.createElement("canvas");
      canvas.width = 1;
      canvas.height = 1;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      context.clearRect(0, 0, 1, 1);
      context.fillStyle = value;
      context.fillRect(0, 0, 1, 1);
      const [red, green, blue, alpha] = context.getImageData(0, 0, 1, 1).data;
      return { red, green, blue, alpha: alpha / 255 };
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
      boxShadow: style.boxShadow,
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
  assert(
    (focusState.outlineStyle !== "none" && focusState.outlineWidth >= 2) || focusState.boxShadow !== "none",
    `${label} completion action focus ring is missing`,
  );
  assert(disabledState.disabled, `${label} completion action did not enter its disabled state`);
  await action.hover();
  await page.waitForTimeout(240);
}

async function expectNewListTile(page, label) {
  const tile = page.locator(".list-tabs__add");
  assert(await tile.count() === 1, `${label} should render one new-list tile`);
  await tile.waitFor({ state: "visible" });
  assert(await tile.getAttribute("aria-label") === "Новый список", `${label} lost its accessible name`);
  const geometry = await tile.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const iconRect = element.querySelector("svg")?.getBoundingClientRect();
    const hiddenLabel = element.querySelector(".visually-hidden");
    const hiddenRect = hiddenLabel?.getBoundingClientRect();
    const hiddenStyle = hiddenLabel ? getComputedStyle(hiddenLabel) : null;
    return {
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
      overflow: getComputedStyle(element).overflow,
      iconInside: Boolean(iconRect) && iconRect.left >= rect.left - 1 && iconRect.right <= rect.right + 1 && iconRect.top >= rect.top - 1 && iconRect.bottom <= rect.bottom + 1,
      iconCentered: Boolean(iconRect) && Math.abs((iconRect.left + iconRect.right) / 2 - (rect.left + rect.right) / 2) <= 1 && Math.abs((iconRect.top + iconRect.bottom) / 2 - (rect.top + rect.bottom) / 2) <= 1,
      hiddenLabel: Boolean(hiddenLabel) && hiddenRect.width <= 1 && hiddenRect.height <= 1 && hiddenStyle.position === "absolute" && hiddenStyle.clip !== "auto",
    };
  });
  assert(geometry.scrollWidth <= geometry.clientWidth + 1, `${label} content overflows its tile`);
  assert(geometry.overflow === "hidden", `${label} does not clip accidental overflow`);
  assert(geometry.iconInside && geometry.iconCentered, `${label} plus icon is not centered inside the tile`);
  assert(geometry.hiddenLabel, `${label} visual label is not safely hidden`);
}

async function expectNoListEventDate(dialog, label) {
  assert((await dialog.getByText("Дата события", { exact: true }).count()) === 0, `${label} still exposes the removed event-date field`);
  assert((await dialog.locator('input[type="date"]').count()) === 0, `${label} still renders an event-date input`);
}

async function expectNoListCoverColor(dialog, label) {
  assert((await dialog.getByText("Цвет обложки", { exact: true }).count()) === 0, `${label} still exposes cover-color copy`);
  assert((await dialog.locator(".color-picker").count()) === 0, `${label} still renders the removed cover-color picker`);
  for (const colorName of ["Коралловый", "Синий", "Лаймовый", "Солнечный", "Графитовый"]) {
    assert((await dialog.getByRole("button", { name: colorName, exact: true }).count()) === 0, `${label} still exposes the ${colorName.toLowerCase()} cover-color choice`);
  }
}

async function expectListPrivacySelect(page, dialog, label, { selectOption = null } = {}) {
  const trigger = dialog.getByRole("combobox", { name: "Кто увидит" });
  await trigger.waitFor({ state: "visible" });
  await dialog.evaluate(async (element) => {
    await Promise.all(element.getAnimations({ subtree: true }).map((animation) => animation.finished.catch(() => {})));
  });
  assert(await trigger.getAttribute("data-slot") === "select-trigger", `${label} does not use the official shadcn Select trigger`);
  assert(await trigger.evaluate((element) => element.tagName === "BUTTON"), `${label} still uses a native select`);
  const originalValue = (await trigger.innerText()).trim();
  assert(["Все", "Подписчики", "Только по ссылке", "Только я"].includes(originalValue), `${label} has an unexpected privacy value: ${originalValue}`);
  assert(Number.parseFloat(await trigger.evaluate((element) => getComputedStyle(element).fontSize)) >= 13, `${label} trigger text is smaller than 13px`);

  await trigger.focus();
  await trigger.press("Enter");
  const listbox = page.getByRole("listbox");
  await listbox.waitFor({ state: "visible" });
  await listbox.evaluate(async (element) => {
    const popup = element.closest("[data-slot='select-content']");
    await Promise.all((popup?.parentElement || element).getAnimations({ subtree: true }).map((animation) => animation.finished.catch(() => {})));
  });
  assert(await trigger.getAttribute("aria-expanded") === "true", `${label} trigger does not expose its expanded state`);
  assert(await trigger.getAttribute("aria-controls") === await listbox.getAttribute("id"), `${label} listbox is not linked to its trigger`);
  const options = listbox.getByRole("option");
  assert(await options.count() === 4, `${label} must expose all four privacy options`);
  assert(
    JSON.stringify(await options.allInnerTexts()) === JSON.stringify(["Все", "Подписчики", "Только по ссылке", "Только я"]),
    `${label} privacy options are missing or out of order`,
  );
  const visual = await listbox.evaluate((element) => {
    const popup = element.closest("[data-slot='select-content']");
    const positioner = popup?.parentElement;
    const triggerElement = document.querySelector(`[aria-controls=${JSON.stringify(element.id)}]`);
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    const resolveColor = (value) => {
      context.clearRect(0, 0, 1, 1);
      context.fillStyle = value;
      context.fillRect(0, 0, 1, 1);
      const [red, green, blue, alpha] = context.getImageData(0, 0, 1, 1).data;
      return { red, green, blue, alpha: alpha / 255 };
    };
    const blend = (foreground, background) => ({
      red: (foreground.red * foreground.alpha) + (background.red * (1 - foreground.alpha)),
      green: (foreground.green * foreground.alpha) + (background.green * (1 - foreground.alpha)),
      blue: (foreground.blue * foreground.alpha) + (background.blue * (1 - foreground.alpha)),
      alpha: 1,
    });
    const luminance = (color) => {
      const channel = (value) => {
        const normalized = value / 255;
        return normalized <= .04045 ? normalized / 12.92 : ((normalized + .055) / 1.055) ** 2.4;
      };
      return (.2126 * channel(color.red)) + (.7152 * channel(color.green)) + (.0722 * channel(color.blue));
    };
    const contrast = (foreground, background) => {
      const foregroundLuminance = luminance(foreground);
      const backgroundLuminance = luminance(background);
      return (Math.max(foregroundLuminance, backgroundLuminance) + .05) / (Math.min(foregroundLuminance, backgroundLuminance) + .05);
    };
    const rect = (node) => {
      const bounds = node.getBoundingClientRect();
      return { left: bounds.left, top: bounds.top, right: bounds.right, bottom: bounds.bottom, width: bounds.width, height: bounds.height };
    };
    const popupStyle = getComputedStyle(popup);
    const popupBackground = resolveColor(popupStyle.backgroundColor);
    return {
      popup: rect(popup),
      trigger: rect(triggerElement),
      viewport: { width: innerWidth, height: innerHeight },
      popupLuminance: luminance(popupBackground),
      positionerZIndex: Number.parseFloat(getComputedStyle(positioner).zIndex),
      options: [...element.querySelectorAll("[role='option']")].map((option) => {
        const style = getComputedStyle(option);
        const optionBackground = blend(resolveColor(style.backgroundColor), popupBackground);
        const bounds = option.getBoundingClientRect();
        const hit = document.elementFromPoint(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2);
        return {
          fontSize: Number.parseFloat(style.fontSize),
          height: bounds.height,
          contrast: contrast(resolveColor(style.color), optionBackground),
          hittable: hit === option || option.contains(hit),
        };
      }),
    };
  });
  assert(Math.abs(visual.popup.width - visual.trigger.width) <= 2, `${label} popup width does not match its trigger (${JSON.stringify({ popup: visual.popup, trigger: visual.trigger, viewport: visual.viewport })})`);
  assert(visual.popup.left >= 4 && visual.popup.right <= visual.viewport.width - 4, `${label} popup escapes the viewport horizontally`);
  assert(visual.popup.top >= 4 && visual.popup.bottom <= visual.viewport.height - 4, `${label} popup escapes the viewport vertically`);
  assert(visual.popupLuminance <= .2, `${label} popup is not using the dark theme`);
  assert(visual.positionerZIndex >= 250, `${label} popup is layered under the modal`);
  assert(visual.options.every((option) => option.fontSize >= 13), `${label} contains an option smaller than 13px`);
  assert(visual.options.every((option) => option.height >= 44), `${label} contains an option smaller than the 44px touch target`);
  assert(visual.options.every((option) => option.contrast >= 4.5), `${label} contains an unreadable option`);
  assert(visual.options.every((option) => option.hittable), `${label} contains an option covered by another layer`);

  if (selectOption) {
    await listbox.getByRole("option", { name: selectOption, exact: true }).click();
    await listbox.waitFor({ state: "detached" });
    assert((await trigger.innerText()).trim() === selectOption, `${label} did not commit ${selectOption}`);
  } else {
    await page.keyboard.press("Escape");
    await listbox.waitFor({ state: "detached" });
    assert((await trigger.innerText()).trim() === originalValue, `${label} changed its value after Escape`);
  }
  assert(await trigger.getAttribute("aria-expanded") === "false", `${label} trigger remains expanded after closing`);
}

async function expectCenteredAuthForm(page, label) {
  assert(await page.locator(".auth-art").count() === 0, `${label} still renders the removed promotional panel`);
  const geometry = await page.locator(".auth-form").evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return {
      centerX: rect.left + rect.width / 2,
      centerY: rect.top + rect.height / 2,
      viewportCenterX: window.innerWidth / 2,
      viewportCenterY: window.innerHeight / 2,
    };
  });
  assert(Math.abs(geometry.centerX - geometry.viewportCenterX) <= 1, `${label} is not horizontally centered`);
  assert(Math.abs(geometry.centerY - geometry.viewportCenterY) <= 1, `${label} is not vertically centered`);
}

try {
  const desktop = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1, colorScheme: "light" });
  const guestRoot = await desktop.newPage();
  await guestRoot.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await guestRoot.waitForURL((url) => url.pathname === "/login");
  await guestRoot.getByRole("heading", { name: "Войти в Rollapp" }).waitFor();
  assert(!(await guestRoot.locator("body").innerText()).includes("Тайный Санта"), "Removed Secret Santa content is still visible on the login page");
  await expectDarkPage(guestRoot, "Desktop login page", [".auth-page", ".auth-panel"]);
  await expectCenteredAuthForm(guestRoot, "Desktop login form");
  await expectNoRootOverflow(guestRoot, "Desktop login page");
  await guestRoot.screenshot({ path: "/tmp/rollapp-desktop-login.png", fullPage: true });
  await expectUnauthenticatedDarkRoutes(guestRoot, "Desktop unauthenticated");
  await guestRoot.goto(`${baseUrl}/ideas`, { waitUntil: "domcontentloaded" });
  await guestRoot.waitForURL((url) => url.pathname === "/login");
  await guestRoot.getByRole("heading", { name: "Войти в Rollapp" }).waitFor();

  const loginResponse = await desktop.request.post(`${baseUrl}/api/auth/demo`, { data: {} });
  assert(loginResponse.ok(), `Demo login failed: ${loginResponse.status()}`);
  const retiredIdeasApi = await desktop.request.get(`${baseUrl}/api/ideas`);
  assert(retiredIdeasApi.status() === 404, `Retired ideas API should return 404, received ${retiredIdeasApi.status()}`);
  const retiredIdeaSaveApi = await desktop.request.post(`${baseUrl}/api/ideas/idea-film/save`, { data: { listId: "retired" } });
  assert(retiredIdeaSaveApi.status() === 404, `Retired idea-save API should return 404, received ${retiredIdeaSaveApi.status()}`);

  const dashboard = await desktop.newPage();
  await dashboard.goto(`${baseUrl}/app`, { waitUntil: "domcontentloaded" });
  await dashboard.waitForURL((url) => url.pathname === "/app/wishes");
  await dashboard.locator(".app-page").waitFor({ state: "visible" });
  await dashboard.getByRole("heading", { name: "Мои желания" }).waitFor();
  assert(!(await dashboard.locator("body").innerText()).includes("Тайный Санта"), "Removed Secret Santa content is still visible in the authenticated app");
  assert(await dashboard.locator(".sidebar").isVisible(), "Desktop app sidebar is not visible");
  assert(await dashboard.locator(".sidebar__nav a").count() === 2, "Desktop app navigation should contain the two primary sections");
  assert(await dashboard.locator(".mobile-bottom-nav a").count() === 2, "Mobile app navigation should contain the two primary sections");
  await expectDarkPage(dashboard, "Desktop /app/wishes", [".app-layout--dark", ".app-main", ".app-page"]);
  await expectSquareAppMain(dashboard, "Desktop /app/wishes");
  await expectNoRootOverflow(dashboard, "Desktop dashboard");
  await expectNewListTile(dashboard, "Desktop new-list tile");
  await expectWishCardsUnframed(dashboard, "Desktop owner wishes");
  await dashboard.screenshot({ path: "/tmp/rollapp-desktop-app.png", fullPage: true });

  await waitForAppRoute(dashboard, "/app/wishes");
  const desktopCard = dashboard.locator(".wish-card").first();
  const desktopMenuDashboardResponse = await apiFromPage(dashboard, "/api/dashboard");
  assert(desktopMenuDashboardResponse.ok, `Desktop wish menu dashboard failed: ${desktopMenuDashboardResponse.status}`);
  const desktopMenuWish = await wishRecordForCard(desktopCard, desktopMenuDashboardResponse.data, "Desktop owner wish menu");
  await expectOwnerWishCardMenu(
    dashboard,
    desktopCard,
    desktopMenuWish,
    desktopMenuDashboardResponse.data.lists,
    "Desktop owner wish menu",
  );
  const desktopDetail = await expectWishDetailsOpen(dashboard, "Desktop owner wish");
  await expectDarkAuthenticatedModal(desktopDetail.dialog, "Desktop owner wish detail");
  await expectFulfilledActionContrast(dashboard, desktopDetail.dialog, "Desktop owner wish detail");
  await expectOwnerWishDetailMenu(
    dashboard,
    desktopDetail,
    desktopMenuWish,
    desktopMenuDashboardResponse.data.lists,
    "Desktop owner wish detail menu",
  );
  await waitForStableLayout(dashboard);
  await dashboard.screenshot({ path: "/tmp/rollapp-desktop-wish-detail.png" });
  await dashboard.keyboard.press("Escape");
  await desktopDetail.dialog.waitFor({ state: "detached" });
  assert(await desktopDetail.opener.evaluate((element) => document.activeElement === element), "Closing wish detail should restore focus to its card");
  const outsideDismissedDetail = await expectWishDetailsOpen(dashboard, "Desktop owner wish outside dismissal");
  const detailOverlay = dashboard.locator("[data-slot='dialog-overlay'][data-open]");
  assert(
    await detailOverlay.evaluate((element) => document.elementFromPoint(4, 4) === element),
    "Desktop wish detail overlay is not hittable outside the Dialog",
  );
  await dashboard.mouse.click(4, 4);
  await outsideDismissedDetail.dialog.waitFor({ state: "detached" });
  assert(
    await outsideDismissedDetail.opener.evaluate((element) => document.activeElement === element),
    "Outside dismissal should restore focus to the wish card",
  );

  await dashboard.goto(`${baseUrl}/app/santa`, { waitUntil: "domcontentloaded" });
  await dashboard.waitForURL((url) => url.pathname === "/app/wishes");
  await dashboard.getByRole("heading", { name: "Мои желания" }).waitFor();
  await expectFriendsRegression(dashboard, "Desktop friends", { mobile: false });
  await expectWideFriendsLayout(dashboard, "1912px friends");
  await expectStableDesktopSidebarAcrossRoutes(dashboard, "1440px stable sidebar", { width: 1440, height: 1000 });
  await expectStableDesktopSidebarAcrossRoutes(dashboard, "1024px stable sidebar", { width: 1024, height: 900 });
  for (const pathname of stableAppRoutes) {
    await waitForAppRoute(dashboard, pathname);
    await expectDarkPage(dashboard, `Desktop ${pathname}`, [".app-layout--dark", ".app-main", ".app-page"]);
  }
  await waitForAppRoute(dashboard, "/app/settings");
  await expectSettingsScreen(dashboard, "1440px settings");
  await dashboard.screenshot({ path: "/tmp/rollapp-desktop-settings.png", fullPage: true });
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
  await expectCenteredAuthForm(mobilePage, "390px login form");
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

  let mobileSidebarBaseline = null;
  for (const pathname of stableAppRoutes) {
    await waitForAppRoute(mobilePage, pathname);
    await expectMobileAppShell(mobilePage, pathname);
    await expectDarkPage(mobilePage, `390px ${pathname}`, [".app-layout--dark", ".app-main", ".app-page"]);
    await expectNoRootOverflow(mobilePage, `390px ${pathname}`);
    const mobileSidebar = await captureStableSidebar(mobilePage, `390px sidebar ${pathname}`, { mobile: true });
    if (!mobileSidebarBaseline) mobileSidebarBaseline = mobileSidebar;
    else expectSameSidebar(mobileSidebar, mobileSidebarBaseline, `390px sidebar ${pathname}`);
    if (pathname === "/app/wishes") {
      await expectNewListTile(mobilePage, "390px new-list tile");
      await mobilePage.screenshot({ path: "/tmp/rollapp-mobile-wishes-390.png", fullPage: true });
      const mobileMenuDashboardResponse = await apiFromPage(mobilePage, "/api/dashboard");
      assert(mobileMenuDashboardResponse.ok, `390px wish menu dashboard failed: ${mobileMenuDashboardResponse.status}`);
      const mobileListButtons = mobilePage.locator('.wishes-page .list-tabs [data-slot="toggle-group-item"]');
      if ((await mobileListButtons.count()) > 1) {
        await mobileListButtons.nth(1).click();
        await mobilePage.getByRole("button", { name: "Настройки списка", exact: true }).waitFor({ state: "visible" });
        await expectWishHeaderActionsContained(mobilePage, "390px selected-list actions");
        await mobileListButtons.first().click();
      }
      const mobileCards = mobilePage.locator(".wish-card");
      const mobileMenuCard = mobileCards.nth((await mobileCards.count()) > 1 ? 1 : 0);
      const mobileMenuWish = await wishRecordForCard(mobileMenuCard, mobileMenuDashboardResponse.data, "390px owner wish menu");
      await expectOwnerWishCardMenu(
        mobilePage,
        mobileMenuCard,
        mobileMenuWish,
        mobileMenuDashboardResponse.data.lists,
        "390px owner wish menu",
        { mobile: true },
      );
      const mobileEditMenu = await openOwnerWishCardMenu(mobilePage, mobileMenuCard, mobileMenuWish);
      await mobileEditMenu.menu.getByRole("menuitem", { name: "Редактировать", exact: true }).click();
      const mobileEditDialog = mobilePage.getByRole("dialog", { name: `Редактирование желания «${mobileMenuWish.title}»`, exact: true });
      await mobileEditDialog.waitFor({ state: "visible" });
      await expectDarkAuthenticatedModal(mobileEditDialog, "390px owner wish editor");
      await expectWishEditorLayout(mobileEditDialog, "390px owner wish editor", { mobile: true, mode: "edit" });
      await mobileEditDialog.getByRole("button", { name: "Закрыть диалог" }).click();
      await mobileEditDialog.waitFor({ state: "detached" });
      await mobileMenuCard.waitFor({ state: "visible" });
      const mobileDetail = await expectWishDetailsOpen(mobilePage, "390px owner wish", { fullscreen: true });
      await expectDarkAuthenticatedModal(mobileDetail.dialog, "390px owner wish detail");
      await expectFulfilledActionContrast(mobilePage, mobileDetail.dialog, "390px owner wish detail");
      const mobileDetailWish = mobileMenuDashboardResponse.data.wishes.find((wish) => wish.title === mobileDetail.title);
      assert(mobileDetailWish, "390px owner detail menu wish is missing from the dashboard");
      await expectOwnerWishDetailMenu(
        mobilePage,
        mobileDetail,
        mobileDetailWish,
        mobileMenuDashboardResponse.data.lists,
        "390px owner wish detail menu",
        { mobile: true },
      );
      await expectNoRootOverflow(mobilePage, "390px wish detail");
      await mobilePage.screenshot({ path: "/tmp/rollapp-mobile-wish-detail.png" });
      await mobileDetail.dialog.getByRole("button", { name: "Закрыть диалог" }).click();
      await mobileDetail.dialog.waitFor({ state: "detached" });
    }
  }
  await waitForAppRoute(mobilePage, "/app/settings");
  await expectSettingsScreen(mobilePage, "390px settings", { mobile: true });
  await mobilePage.screenshot({ path: "/tmp/rollapp-mobile-settings-390.png", fullPage: true });
  await expectFriendsRegression(mobilePage, "390px friends", { mobile: true });

  for (const retiredPath of ["/ideas", "/app/ideas"]) {
    await mobilePage.goto(`${baseUrl}${retiredPath}`, { waitUntil: "domcontentloaded" });
    await mobilePage.waitForURL((url) => url.pathname === "/app/wishes");
    await mobilePage.getByRole("heading", { name: "Мои желания" }).waitFor();
    assert((await mobilePage.getByRole("link", { name: "Идеи", exact: true }).count()) === 0, `${retiredPath} left an Ideas navigation link behind`);
  }

  await waitForAppRoute(mobilePage, "/app/wishes");
  await expectMobileAppShell(mobilePage, "/app/wishes");
  await mobilePage.screenshot({ path: "/tmp/rollapp-mobile-app.png", fullPage: true });

  await mobilePage.getByRole("button", { name: "Открыть меню" }).click();
  const drawer = mobilePage.getByRole("dialog", { name: "Меню приложения", exact: true });
  await drawer.waitFor({ state: "visible" });
  assert(await drawer.getAttribute("data-mobile") === "true", "390px application drawer is not the Sidebar Sheet");
  await expectDarkPage(mobilePage, "390px application drawer", [".app-layout--dark", ".app-main", "[data-sidebar='sidebar'][data-mobile='true']"]);
  await waitForStableLayout(mobilePage);
  await mobilePage.screenshot({ path: "/tmp/rollapp-mobile-app-drawer.png" });
  await drawer.getByRole("button", { name: "Закрыть меню" }).click();
  await drawer.waitFor({ state: "detached" });

  await mobilePage.getByRole("button", { name: "Добавить", exact: true }).click();
  const wishDialog = mobilePage.getByRole("dialog", { name: "Создание желания", exact: true });
  await wishDialog.waitFor({ state: "visible" });
  await wishDialog.getByRole("heading", { name: "Новое желание", exact: true }).waitFor();
  assert(await wishDialog.getByLabel("Ссылка", { exact: true }).isVisible(), "Wish editor does not expose the product link immediately");
  assert(await wishDialog.getByRole("button", { name: "Загадать желание", exact: true }).isVisible(), "Wish editor submit action is not visible");
  assert((await wishDialog.locator(".link-step, .wish-form").count()) === 0, "Wish editor still renders the legacy two-step flow");
  await expectDarkAuthenticatedModal(wishDialog, "390px add-wish editor");
  await expectWishEditorLayout(wishDialog, "390px add-wish editor", { mobile: true, mode: "create" });
  await waitForStableLayout(mobilePage);
  await mobilePage.screenshot({ path: "/tmp/rollapp-mobile-wish-editor.png" });
  await mobilePage.setViewportSize({ width: 320, height: 760 });
  await expectWishEditorLayout(wishDialog, "320px add-wish editor", { mobile: true, mode: "create" });
  await mobilePage.screenshot({ path: "/tmp/rollapp-mobile-wish-editor-320.png" });
  await mobilePage.setViewportSize({ width: 390, height: 844 });
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
    await mobilePage.getByRole("menuitem", { name: "Редактировать список", exact: true }).click();
    const mobileListDialog = mobilePage.getByRole("dialog", { name: `Настройки списка: ${mobileSourceList.title}` });
    await mobileListDialog.waitFor({ state: "visible" });
    await expectDarkAuthenticatedModal(mobileListDialog, "390px list editor");
    await expectNoListEventDate(mobileListDialog, "390px list editor");
    await expectNoListCoverColor(mobileListDialog, "390px list editor");
    await expectListPrivacySelect(mobilePage, mobileListDialog, "390px list privacy select");
    await mobileListDialog.getByRole("button", { name: "Закрыть диалог" }).click();
    await mobileListDialog.waitFor({ state: "detached" });
    const mobileOwnerCard = mobilePage.locator(".wish-card").filter({ hasText: mobileWishToMove.title }).first();
    await mobileOwnerCard.waitFor({ state: "visible" });
    await mobileOwnerCard.getByRole("button", { name: `Открыть желание «${mobileWishToMove.title}»` }).click();
    const mobileOwnerDetail = mobilePage.getByRole("dialog", { name: `Желание: ${mobileWishToMove.title}` });
    await mobileOwnerDetail.waitFor({ state: "visible" });
    await expectDarkAuthenticatedModal(mobileOwnerDetail, "390px profile owner wish detail");
    const mobileListTrigger = mobileOwnerDetail.getByRole("button", { name: /^Изменить списки желания\./ });
    await mobileListTrigger.click();
    const mobileListPicker = mobilePage.locator(`[id=${JSON.stringify(`wish-detail-lists-${mobileWishToMove.id}`)}]`);
    await mobileListPicker.waitFor({ state: "visible" });
    assert(await mobileListPicker.getAttribute("role") === "menu", "Quick list picker does not expose role=menu");
    assert(await mobileListPicker.getAttribute("data-slot") === "dropdown-menu-content", "Quick list picker is not official DropdownMenu content");
    assert(await mobileListTrigger.getAttribute("aria-controls") === await mobileListPicker.getAttribute("id"), "Quick list picker is not linked to its trigger");
    assert((await mobilePage.getByRole("dialog", { name: `Редактирование желания «${mobileWishToMove.title}»`, exact: true }).count()) === 0, "Quick list switch unexpectedly opened the full wish editor");
    assert(await mobileListTrigger.getAttribute("aria-expanded") === "true", "Quick list trigger did not expose its expanded state");
    assert(await mobileListPicker.getByRole("menuitem", { name: "Новый список", exact: true }).isVisible(), "Quick list picker does not expose new-list creation");
    assert((await mobileListPicker.getByRole("menuitemcheckbox").count()) === mobileCategoryLists.length, "Quick list picker does not expose every themed list");
    assert((await mobileListPicker.getByRole("menuitemcheckbox", { name: "Мои желания", exact: true }).count()) === 0, "Quick list picker exposed the aggregate system list");
    const mobileSourceChoice = mobileListPicker.getByRole("menuitemcheckbox", { name: mobileSourceList.title, exact: true });
    const mobileTargetChoice = mobileListPicker.getByRole("menuitemcheckbox", { name: mobileTargetList.title, exact: true });
    assert(await mobileSourceChoice.getAttribute("aria-checked") === "true", "Current wish list is not checked in the quick picker");
    assert(await mobileTargetChoice.getAttribute("aria-checked") === "false", "Unselected wish list is incorrectly checked in the quick picker");
    await expectMobileTouchTargets(mobileListPicker.getByRole("menuitemcheckbox"), "390px wish quick-list picker", { minHeight: 44 });
    await expectFixedPopoverGeometry(mobileListPicker, "390px wish quick-list picker");
    await mobilePage.setViewportSize({ width: 844, height: 390 });
    await waitForStableLayout(mobilePage);
    await expectFixedPopoverGeometry(mobileListPicker, "844x390 wish quick-list picker");
    await mobilePage.setViewportSize({ width: 390, height: 844 });
    const mobileRemoveResponsePromise = mobilePage.waitForResponse((response) => (
      response.request().method() === "PATCH"
      && new URL(response.url()).pathname === `/api/wishes/${mobileWishToMove.id}`
    ));
    await mobileSourceChoice.click();
    const mobileRemoveResponse = await mobileRemoveResponsePromise;
    assert(mobileRemoveResponse.ok(), `Mobile wish list removal failed: ${mobileRemoveResponse.status()}`);
    const mobileRemovePayload = await mobileRemoveResponse.json();
    assert(mobileRemovePayload.wish && sameMembers(mobileRemovePayload.wish.listIds, []), "Quick list removal returned the wrong membership");
    await mobilePage.waitForFunction((id) => document.querySelector(`#wish-detail-lists-${CSS.escape(id)} [role="menuitemcheckbox"][aria-checked="true"]`) === null, mobileWishToMove.id);
    assert(await mobileOwnerDetail.getByRole("button", { name: /^Изменить списки желания\. Сейчас: Без списка$/ }).isVisible(), "Quick list trigger did not update to the empty-list state");
    assert(await mobileListPicker.isVisible(), "Quick list picker closed after an immediate removal");

    const mobileAddResponsePromise = mobilePage.waitForResponse((response) => (
      response.request().method() === "PATCH"
      && new URL(response.url()).pathname === `/api/wishes/${mobileWishToMove.id}`
    ));
    await mobileTargetChoice.click();
    const mobileAddResponse = await mobileAddResponsePromise;
    assert(mobileAddResponse.ok(), `Mobile wish list addition failed: ${mobileAddResponse.status()}`);
    const mobileAddPayload = await mobileAddResponse.json();
    assert(mobileAddPayload.wish && sameMembers(mobileAddPayload.wish.listIds, [mobileTargetList.id]), "Quick list addition returned the wrong membership");
    await mobilePage.waitForFunction(
      ({ wishId, listTitle }) => document.querySelector(`#wish-detail-lists-${CSS.escape(wishId)} [role="menuitemcheckbox"][aria-checked="true"]`)?.textContent.includes(listTitle),
      { wishId: mobileWishToMove.id, listTitle: mobileTargetList.title },
    );
    assert(await mobileListPicker.isVisible(), "Quick list picker closed after an immediate addition");
    await mobilePage.keyboard.press("Escape");
    await mobileListPicker.waitFor({ state: "detached" });
    assert(await mobileOwnerDetail.isVisible(), "Escape closed the wish detail instead of only the quick list picker");
    assert(await mobileListTrigger.getAttribute("aria-expanded") === "false", "Quick list trigger remained expanded after Escape");
    await waitForFocused(mobilePage, mobileListTrigger, "quick list trigger after Escape");

    await mobileListTrigger.click();
    await mobileListPicker.waitFor({ state: "visible" });
    assert(await mobileTargetChoice.getAttribute("aria-checked") === "true", "Persisted target list is not checked after reopening the quick picker");
    assert(await mobileSourceChoice.getAttribute("aria-checked") === "false", "Removed source list is checked after reopening the quick picker");
    await mobileListTrigger.click();
    await mobileListPicker.waitFor({ state: "detached" });
    assert(await mobileOwnerDetail.isVisible(), "Closing the quick list picker closed the wish detail");

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
  await expectCenteredAuthForm(narrowPage, "360px login form");
  await expectNoRootOverflow(narrowPage, "360px login page");
  const narrowLoginResponse = await narrow.request.post(`${baseUrl}/api/auth/demo`, { data: {} });
  assert(narrowLoginResponse.ok(), `360px demo login failed: ${narrowLoginResponse.status()}`);
  for (const pathname of ["/app/wishes", "/app/settings"]) {
    await waitForAppRoute(narrowPage, pathname);
    await expectMobileAppShell(narrowPage, `360px ${pathname}`);
    await expectNoRootOverflow(narrowPage, `360px ${pathname}`);
  }
  await expectSettingsScreen(narrowPage, "360px settings", { mobile: true, openEditor: false });
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
  let tabletSidebarBaseline = null;
  for (const pathname of stableAppRoutes) {
    await waitForAppRoute(tabletAppPage, pathname);
    await expectMobileAppShell(tabletAppPage, `768px ${pathname}`);
    await expectDarkPage(tabletAppPage, `768px ${pathname}`, [".app-layout--dark", ".app-main", ".app-page"]);
    await expectNoRootOverflow(tabletAppPage, `768px ${pathname}`);
    const tabletSidebar = await captureStableSidebar(tabletAppPage, `768px sidebar ${pathname}`, { mobile: true });
    if (!tabletSidebarBaseline) tabletSidebarBaseline = tabletSidebar;
    else expectSameSidebar(tabletSidebar, tabletSidebarBaseline, `768px sidebar ${pathname}`);
  }
  await waitForAppRoute(tabletAppPage, "/app/settings");
  await expectSettingsScreen(tabletAppPage, "768px settings", { mobile: true, openEditor: false });
  await waitForAppRoute(tabletAppPage, "/app/wishes");
  await expectNewListTile(tabletAppPage, "768px new-list tile");
  await tabletAppPage.screenshot({ path: "/tmp/rollapp-tablet-wishes-768.png", fullPage: true });
  const tabletOwnerDetail = await expectWishDetailsOpen(tabletAppPage, "768px owner wish", { fullscreen: true });
  await expectDarkAuthenticatedModal(tabletOwnerDetail.dialog, "768px owner wish detail");
  await expectNoRootOverflow(tabletAppPage, "768px owner wish detail");
  await tabletAppPage.screenshot({ path: "/tmp/rollapp-tablet-owner-wish-detail-768.png" });
  await tabletOwnerDetail.dialog.getByRole("button", { name: "Закрыть диалог" }).click();
  await tabletOwnerDetail.dialog.waitFor({ state: "detached" });
  await waitForAppRoute(tabletAppPage, "/app/wishes");
  await tabletAppPage.screenshot({ path: "/tmp/rollapp-tablet-app-768.png", fullPage: true });
  await tabletAppPage.setViewportSize({ width: 814, height: 900 });
  await expectWishGridContained(tabletAppPage, "814px wishes grid", 2);
  await expectNoRootOverflow(tabletAppPage, "814px wishes grid");
  await tabletAppPage.setViewportSize({ width: 842, height: 900 });
  await expectWishGridContained(tabletAppPage, "842px wishes grid", 3);
  await expectSquareAppMain(tabletAppPage, "842px wishes grid");
  await expectNoRootOverflow(tabletAppPage, "842px wishes grid");
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
  await expectWishCardsUnframed(publicMobilePage, "390px public wishes");
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
  const invalidWishReturn = publicMobilePage.getByRole("button", { name: "Вернуться к профилю", exact: true });
  assert(
    await invalidWishReturn.evaluate((element) => element.tagName === "A")
    && await invalidWishReturn.getAttribute("data-slot") === "button"
    && await invalidWishReturn.getAttribute("href") === "/alisa",
    "Invalid wish return action is not a canonical link rendered with the official Button",
  );
  await publicMobilePage.goto(`${baseUrl}/alisa/lists/not-a-real-list`, { waitUntil: "domcontentloaded" });
  await publicMobilePage.getByRole("heading", { name: "Список не найден" }).waitFor({ state: "visible" });
  const invalidListReturn = publicMobilePage.getByRole("button", { name: "Вернуться к профилю", exact: true });
  assert(
    await invalidListReturn.evaluate((element) => element.tagName === "A")
    && await invalidListReturn.getAttribute("data-slot") === "button"
    && await invalidListReturn.getAttribute("href") === "/alisa",
    "Invalid list return action is not a canonical link rendered with the official Button",
  );
  await publicMobilePage.goto(`${baseUrl}/alisa`, { waitUntil: "domcontentloaded" });
  await publicMobilePage.locator(".public-profile.is-guest").waitFor({ state: "visible" });
  assert(await publicMobilePage.locator('a[href^="/u/"], a[href^="/users/"]').count() === 0, "Public profile still renders legacy profile links");
  await publicMobilePage.locator(".profile-mobile-menu").click();
  const publicMenu = publicMobilePage.getByRole("dialog", { name: "Меню профиля", exact: true });
  await publicMenu.waitFor({ state: "visible" });
  assert(await publicMenu.getAttribute("id") === "profile-mobile-navigation", "390px public profile menu lost its stable Sheet id");
  assert(await publicMenu.getAttribute("data-slot") === "sheet-content", "390px public profile menu is not official Sheet content");
  await expectDarkPage(publicMobilePage, "390px public profile menu", [".public-profile--dark", "#profile-mobile-navigation"]);
  await waitForStableLayout(publicMobilePage);
  const publicMenuGeometry = await publicMenu.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { top: rect.top, bottom: window.innerHeight - rect.bottom, width: rect.width };
  });
  assert(publicMenuGeometry.top <= 1 && publicMenuGeometry.bottom <= 1 && Math.abs(publicMenuGeometry.width - 390) <= 1, "390px public profile menu is not a full-screen mobile sheet");
  await publicMobilePage.screenshot({ path: "/tmp/rollapp-public-profile-390-menu.png" });
  const publicMenuClose = publicMenu.getByRole("button", { name: "Закрыть меню" });
  assert(await publicMenuClose.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    return hit === element || element.contains(hit);
  }), "390px public profile Sheet close action is covered");
  await publicMenuClose.click();
  await publicMenu.waitFor({ state: "detached" });
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
  const ownerProfileMenuDashboardResponse = await apiFromPage(ownerWidePage, "/api/dashboard");
  assert(ownerProfileMenuDashboardResponse.ok, `1912px owner detail menu dashboard failed: ${ownerProfileMenuDashboardResponse.status}`);
  const ownerProfileDetail = await expectWishDetailsOpen(ownerWidePage, "1912px owner profile wish");
  const ownerProfileDetailWish = ownerProfileMenuDashboardResponse.data.wishes.find((wish) => wish.title === ownerProfileDetail.title);
  assert(ownerProfileDetailWish, "1912px owner detail menu wish is missing from the dashboard");
  await expectOwnerWishDetailMenu(
    ownerWidePage,
    ownerProfileDetail,
    ownerProfileDetailWish,
    ownerProfileMenuDashboardResponse.data.lists,
    "1912px owner profile wish detail menu",
  );
  await ownerProfileDetail.dialog.getByRole("button", { name: "Закрыть диалог" }).click();
  await ownerProfileDetail.dialog.waitFor({ state: "detached" });
  await ownerWidePage.goto(`${baseUrl}/s/${mobileSourceList.shareToken}`, { waitUntil: "domcontentloaded" });
  await ownerWidePage.locator(".public-profile.is-owner").waitFor({ state: "visible" });
  await expectDarkPage(ownerWidePage, "Desktop shared owner profile", [".public-profile--dark", ".public-profile__layout > main"]);
  await ownerWidePage.goto(`${baseUrl}/alisa`, { waitUntil: "domcontentloaded" });
  await ownerWidePage.locator(".public-profile.is-owner").waitFor({ state: "visible" });
  const profileMenuTrigger = ownerWidePage.locator(".profile-desktop-menu");
  await profileMenuTrigger.click();
  const profileMenu = ownerWidePage.locator(".profile-desktop-panel");
  await profileMenu.waitFor({ state: "visible" });
  assert(await profileMenu.getAttribute("role") === "menu", "Desktop account popup does not expose role=menu");
  assert(await profileMenuTrigger.getAttribute("aria-controls") === await profileMenu.getAttribute("id"), "Desktop account popup is not linked to its trigger");
  assert(await ownerWidePage.locator("body").evaluate((element) => getComputedStyle(element).overflow !== "hidden"), "Desktop account menu should not lock page scrolling");
  await ownerWidePage.locator(".public-wishes-head h2").click();
  await profileMenu.waitFor({ state: "detached" });
  await ownerWidePage.getByRole("button", { name: "Создать новый список" }).click();
  const ownerListDialog = ownerWidePage.getByRole("dialog", { name: "Создание списка" });
  await ownerListDialog.getByRole("heading", { name: "Создать список" }).waitFor();
  await expectDarkAuthenticatedModal(ownerListDialog, "Desktop create-list modal");
  await expectNoListEventDate(ownerListDialog, "Desktop create-list modal");
  await expectNoListCoverColor(ownerListDialog, "Desktop create-list modal");
  await expectListPrivacySelect(ownerWidePage, ownerListDialog, "Desktop create-list privacy select");
  await ownerListDialog.getByLabel("Название").fill("Smoke list");
  await ownerListDialog.getByLabel("Описание").fill("Проверка полного цикла списка");
  const createListResponsePromise = ownerWidePage.waitForResponse((response) => (
    response.request().method() === "POST" && new URL(response.url()).pathname === "/api/lists"
  ));
  await ownerListDialog.getByRole("button", { name: "Создать список", exact: true }).click();
  const createListResponse = await createListResponsePromise;
  assert(createListResponse.ok(), `List creation failed: ${createListResponse.status()}`);
  const createdList = (await createListResponse.json()).list;
  assert(createdList.color === "coral", `List creation did not retain the server default color: ${createdList.color}`);
  await ownerListDialog.waitFor({ state: "detached" });
  await ownerWidePage.waitForURL((url) => url.pathname === `/alisa/lists/${createdList.id}`);
  await ownerWidePage.locator(".profile-list-rail__lists > button").filter({ hasText: "Smoke list" }).waitFor({ state: "visible" });
  await ownerWidePage.getByRole("button", { name: "Опции списка" }).click();
  await ownerWidePage.getByRole("menuitem", { name: "Редактировать список", exact: true }).click();
  const editListDialog = ownerWidePage.getByRole("dialog", { name: "Настройки списка: Smoke list" });
  await editListDialog.getByRole("heading", { name: "Изменить список" }).waitFor();
  await expectDarkAuthenticatedModal(editListDialog, "Desktop edit-list modal");
  await expectNoListEventDate(editListDialog, "Desktop edit-list modal");
  await expectNoListCoverColor(editListDialog, "Desktop edit-list modal");
  await editListDialog.getByLabel("Название").fill("Smoke list edited");
  await expectListPrivacySelect(ownerWidePage, editListDialog, "Desktop edit-list privacy select", { selectOption: "Только я" });
  const editListResponsePromise = ownerWidePage.waitForResponse((response) => (
    response.request().method() === "PATCH" && new URL(response.url()).pathname === `/api/lists/${createdList.id}`
  ));
  await editListDialog.getByRole("button", { name: "Сохранить изменения", exact: true }).click();
  const editListResponse = await editListResponsePromise;
  assert(editListResponse.ok(), `List editing failed: ${editListResponse.status()}`);
  const editedList = (await editListResponse.json()).list;
  assert(editedList.color === createdList.color, `List editing changed the preserved cover color from ${createdList.color} to ${editedList.color}`);
  await editListDialog.waitFor({ state: "detached" });
  await ownerWidePage.locator(".profile-list-rail__lists > button").filter({ hasText: "Smoke list edited" }).waitFor({ state: "visible" });
  await ownerWidePage.locator(".public-wishes-head .button").filter({ hasText: "Поделиться" }).click();
  await ownerWidePage.getByText("Приватный список виден только вам", { exact: true }).waitFor({ state: "visible" });
  await ownerWidePage.getByRole("button", { name: "Опции списка" }).click();
  await ownerWidePage.getByRole("menuitem", { name: "Редактировать список", exact: true }).click();
  const deleteListDialog = ownerWidePage.getByRole("dialog", { name: "Настройки списка: Smoke list edited" });
  await deleteListDialog.getByRole("heading", { name: "Изменить список" }).waitFor();
  await expectDarkAuthenticatedModal(deleteListDialog, "Desktop delete-list modal");
  await expectNoListEventDate(deleteListDialog, "Desktop delete-list modal");
  await expectNoListCoverColor(deleteListDialog, "Desktop delete-list modal");
  const deleteListDialogId = await deleteListDialog.getAttribute("id");
  assert(deleteListDialogId, "List editor Dialog does not expose a stable Base UI id");
  await deleteListDialog.getByRole("button", { name: "Удалить", exact: true }).click();
  const deleteListConfirmation = ownerWidePage.getByRole("alertdialog", { name: "Удалить «Smoke list edited»?", exact: true });
  await deleteListConfirmation.waitFor({ state: "visible" });
  assert(
    await deleteListConfirmation.getAttribute("data-slot") === "alert-dialog-content",
    "List deletion confirmation is not official AlertDialog content",
  );
  assert(
    await deleteListConfirmation.locator("[data-slot='alert-dialog-title']").getByText("Удалить «Smoke list edited»?", { exact: true }).count() === 1,
    "List deletion confirmation does not expose an official AlertDialogTitle",
  );
  assert(
    await deleteListConfirmation.locator("[data-slot='alert-dialog-description']").count() === 1,
    "List deletion confirmation does not expose an official AlertDialogDescription",
  );
  const mountedDeleteListDialog = ownerWidePage.locator(`[id=${JSON.stringify(deleteListDialogId)}]`);
  assert(await mountedDeleteListDialog.isVisible(), "Opening list deletion confirmation unmounted the list editor");
  const deleteListAction = deleteListConfirmation.getByRole("button", { name: "Удалить", exact: true });
  assert(
    await deleteListAction.getAttribute("data-slot") === "alert-dialog-action",
    "List deletion confirmation does not use the official AlertDialogAction",
  );
  const deleteListResponsePromise = ownerWidePage.waitForResponse((response) => (
    response.request().method() === "DELETE" && new URL(response.url()).pathname === `/api/lists/${createdList.id}`
  ));
  await deleteListAction.click();
  const deleteListResponse = await deleteListResponsePromise;
  assert(deleteListResponse.ok(), `List deletion failed: ${deleteListResponse.status()}`);
  await deleteListConfirmation.waitFor({ state: "detached" });
  await mountedDeleteListDialog.waitFor({ state: "detached" });
  await ownerWidePage.waitForURL((url) => url.pathname === "/alisa");
  assert((await ownerWidePage.locator(".profile-list-rail__lists > button").filter({ hasText: "Smoke list edited" }).count()) === 0, "Deleted list is still visible in the owner rail");
  await ownerWidePage.getByRole("button", { name: "Загадать желание" }).click();
  const ownerWishDialog = ownerWidePage.getByRole("dialog", { name: "Создание желания", exact: true });
  await ownerWishDialog.getByRole("heading", { name: "Новое желание", exact: true }).waitFor();
  await expectDarkAuthenticatedModal(ownerWishDialog, "Desktop profile add-wish editor");
  await expectWishEditorLayout(ownerWishDialog, "1912px profile add-wish editor", { mode: "create" });
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
    const wishPatchRequests = [];
    const captureWishPatch = (request) => {
      if (
        request.method() === "PATCH"
        && new URL(request.url()).pathname === `/api/wishes/${wishToMove.id}`
      ) wishPatchRequests.push(request);
    };
    ownerWidePage.on("request", captureWishPatch);
    try {
      const portalMenu = await openOwnerWishCardMenu(ownerWidePage, wishCard, wishToMove);
      const { listMenu } = await openOwnerWishListMenu(ownerWidePage, portalMenu.menu, wishToMove);
      const sourceOption = listMenu.getByRole("menuitemcheckbox", { name: sourceList.title, exact: true });
      const targetOption = listMenu.getByRole("menuitemcheckbox", { name: targetList.title, exact: true });
      assert(await sourceOption.getAttribute("aria-checked") === "true", "Wish list draft should start with the source list selected");
      assert(await targetOption.getAttribute("aria-checked") === "false", "Wish list draft should start with the target list unselected");

      await sourceOption.click();
      await targetOption.click();
      assert(await sourceOption.getAttribute("aria-checked") === "false", "Wish list draft did not remove the source list");
      assert(await targetOption.getAttribute("aria-checked") === "true", "Wish list draft did not add the target list");
      await ownerWidePage.waitForTimeout(100);
      assert(wishPatchRequests.length === 0, "Changing draft list rows sent a PATCH before Save");

      const saveDraft = listMenu.getByRole("menuitem", { name: "Сохранить списки", exact: true });
      await saveDraft.waitFor({ state: "visible" });
      const updateResponsePromise = ownerWidePage.waitForResponse((response) => (
        response.request().method() === "PATCH"
        && new URL(response.url()).pathname === `/api/wishes/${wishToMove.id}`
      ));
      await saveDraft.click();
      const updateResponse = await updateResponsePromise;
      assert(updateResponse.ok(), `Wish list update failed: ${updateResponse.status()}`);
      const updatePayload = await updateResponse.json();
      assert(updatePayload.wish && sameMembers(updatePayload.wish.listIds, [targetList.id]), "Wish list PATCH returned the wrong membership");
      await listMenu.waitFor({ state: "detached" });
      await portalMenu.menu.waitFor({ state: "detached" });
      assert(wishPatchRequests.length === 1, `Wish list Save should send exactly one PATCH, sent ${wishPatchRequests.length}`);
      const patchBody = wishPatchRequests[0].postDataJSON();
      assert(Array.isArray(patchBody.listIds) && sameMembers(patchBody.listIds, [targetList.id]), "Wish list Save sent the wrong listIds payload");
      assert(await portalMenu.trigger.getAttribute("aria-expanded") === "false", "Wish list Save left the root menu expanded");
      await expectNoWishDetail(ownerWidePage, "Desktop list draft persistence");
    } finally {
      ownerWidePage.off("request", captureWishPatch);
    }
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
    const persistedPortalMenu = await openOwnerWishCardMenu(ownerWidePage, persistedCard, wishToMove);
    const persistedLists = await openOwnerWishListMenu(ownerWidePage, persistedPortalMenu.menu, wishToMove);
    assert(
      await persistedLists.listMenu.getByRole("menuitemcheckbox", { name: sourceList.title, exact: true }).getAttribute("aria-checked") === "false",
      "Source list became selected again in the card menu after reload",
    );
    assert(
      await persistedLists.listMenu.getByRole("menuitemcheckbox", { name: targetList.title, exact: true }).getAttribute("aria-checked") === "true",
      "Target list selection did not survive reload in the card menu",
    );
    await ownerWidePage.keyboard.press("Escape");
    await persistedLists.listMenu.waitFor({ state: "detached" });
    await ownerWidePage.keyboard.press("Escape");
    await persistedPortalMenu.menu.waitFor({ state: "detached" });

    const dashboardAfterReloadResponse = await apiFromPage(ownerWidePage, "/api/dashboard");
    assert(dashboardAfterReloadResponse.ok, `Owner dashboard after reload failed: ${dashboardAfterReloadResponse.status}`);
    const dashboardAfterReload = dashboardAfterReloadResponse.data;
    const persistedWish = dashboardAfterReload.wishes.find((wish) => wish.id === wishToMove.id);
    assert(persistedWish && sameMembers(persistedWish.listIds, [targetList.id]), "API list membership changed after browser reload");
  } finally {
    const restoreResponse = await apiFromPage(ownerWidePage, `/api/wishes/${wishToMove.id}`, { method: "PATCH", body: { listIds: originalListIds } });
    assert(restoreResponse.ok, `Failed to restore seeded wish membership: ${restoreResponse.status}`);
    assert(
      restoreResponse.data?.wish && sameMembers(restoreResponse.data.wish.listIds, originalListIds),
      "Seeded wish membership restoration returned the wrong listIds",
    );
    const restoredDashboardResponse = await apiFromPage(ownerWidePage, "/api/dashboard");
    assert(restoredDashboardResponse.ok, `Restored owner dashboard failed: ${restoredDashboardResponse.status}`);
    const restoredWish = restoredDashboardResponse.data.wishes.find((wish) => wish.id === wishToMove.id);
    assert(restoredWish && sameMembers(restoredWish.listIds, originalListIds), "Seeded wish membership was not restored");
  }

  let editorSmokeWishId = null;
  try {
    const editorBaselineResponse = await apiFromPage(ownerWidePage, "/api/dashboard");
    assert(editorBaselineResponse.ok, `Editor smoke baseline dashboard failed: ${editorBaselineResponse.status}`);
    const editorBaseline = editorBaselineResponse.data;
    const baselineSourceCount = editorBaseline.lists.find((list) => list.id === sourceList.id)?.wishCount;
    const baselineTargetCount = editorBaseline.lists.find((list) => list.id === targetList.id)?.wishCount;
    assert(Number.isInteger(baselineSourceCount) && Number.isInteger(baselineTargetCount), "Editor smoke list counts are unavailable");

    const initialTitle = `Disposable editor smoke ${Date.now()}`;
    const initialDescription = "Temporary wish used only by the visual regression";
    const initialUrl = "https://example.com/rollapp-editor-before";
    const createEditorWishResponse = await apiFromPage(ownerWidePage, "/api/wishes", {
      method: "POST",
      body: {
        title: initialTitle,
        description: initialDescription,
        url: initialUrl,
        imageUrl: "/art/camera.svg",
        price: 1234,
        currency: "RUB",
        priority: 2,
        privacy: "inherit",
        allowMultiple: false,
        listIds: [sourceList.id],
      },
    });
    assert(createEditorWishResponse.ok, `Disposable editor wish creation failed: ${createEditorWishResponse.status}`);
    const editorSmokeWish = createEditorWishResponse.data?.wish;
    editorSmokeWishId = editorSmokeWish?.id || null;
    assert(editorSmokeWishId, "Disposable editor wish response did not include an id");

    const afterCreateResponse = await apiFromPage(ownerWidePage, "/api/dashboard");
    assert(afterCreateResponse.ok, `Editor smoke post-create dashboard failed: ${afterCreateResponse.status}`);
    assert(
      afterCreateResponse.data.lists.find((list) => list.id === sourceList.id)?.wishCount === baselineSourceCount + 1,
      "Creating the disposable editor wish did not increment its source list",
    );

    await ownerWidePage.goto(`${baseUrl}/alisa/lists/${sourceList.id}`, { waitUntil: "domcontentloaded" });
    await ownerWidePage.locator(".public-profile.is-owner").waitFor({ state: "visible" });
    const editorSmokeCard = ownerWidePage.locator(".wish-card").filter({ hasText: initialTitle }).first();
    await editorSmokeCard.waitFor({ state: "visible" });
    const editorSmokeMenu = await openOwnerWishCardMenu(ownerWidePage, editorSmokeCard, editorSmokeWish);
    await editorSmokeMenu.menu.getByRole("menuitem", { name: "Редактировать", exact: true }).click();

    const editorDialog = ownerWidePage.getByRole("dialog", { name: `Редактирование желания «${initialTitle}»`, exact: true });
    await editorDialog.waitFor({ state: "visible" });
    await expectDarkAuthenticatedModal(editorDialog, "Disposable desktop wish editor");
    await expectWishEditorLayout(editorDialog, "1912px disposable desktop wish editor");
    const createListFromEditor = editorDialog.getByRole("button", { name: "Новый список", exact: true });
    assert(await createListFromEditor.isVisible(), "Desktop wish editor does not expose list creation");
    const editorDialogId = await editorDialog.getAttribute("id");
    assert(editorDialogId, "Disposable wish editor Dialog does not expose a stable Base UI id");
    const mountedEditorDialog = ownerWidePage.locator(`[id=${JSON.stringify(editorDialogId)}]`);

    const draftProbeTitle = `${initialTitle} · draft`;
    const draftProbeInput = mountedEditorDialog.getByLabel("Название", { exact: true });
    assert(await draftProbeInput.inputValue() === initialTitle, "Disposable editor did not prefill the wish title");
    await draftProbeInput.fill(draftProbeTitle);
    await createListFromEditor.click();
    const nestedListDialog = ownerWidePage.getByRole("dialog", { name: "Создание списка", exact: true });
    await nestedListDialog.waitFor({ state: "visible" });
    await expectNoListCoverColor(nestedListDialog, "Nested create-list modal");
    assert(await mountedEditorDialog.isVisible(), "Opening list creation unmounted the wish editor");
    assert(await draftProbeInput.inputValue() === draftProbeTitle, "Opening list creation discarded the wish editor draft");
    await nestedListDialog.getByRole("button", { name: "Отмена", exact: true }).click();
    await nestedListDialog.waitFor({ state: "detached" });
    assert(await editorDialog.isVisible(), "Cancelling list creation did not return to the wish editor");
    assert(await draftProbeInput.inputValue() === draftProbeTitle, "Cancelling list creation discarded the wish editor draft");
    assert(
      await editorDialog.getAttribute("data-slot") === "dialog-content"
      && await editorDialog.locator("[data-slot='dialog-title']").count() === 1,
      "Wish editor does not remain official Dialog content after closing its nested dialog",
    );
    assert(
      await ownerWidePage.locator("body").evaluate((element) => getComputedStyle(element).overflow === "hidden"),
      "Closing a stacked list dialog unlocked the page while the wish editor remained open",
    );

    const sourceChoice = editorDialog.locator(".wish-editor__list-row").filter({ hasText: sourceList.title });
    const targetChoice = editorDialog.locator(".wish-editor__list-row").filter({ hasText: targetList.title });
    const sourceSwitch = sourceChoice.getByRole("switch", { name: sourceList.title, exact: true });
    const targetSwitch = targetChoice.getByRole("switch", { name: targetList.title, exact: true });
    assert(await sourceSwitch.count() === 1 && await targetSwitch.count() === 1, "Disposable editor list rows do not expose official switches");
    assert(
      await sourceSwitch.getAttribute("data-slot") === "switch"
      && await targetSwitch.getAttribute("data-slot") === "switch",
      "Disposable editor list rows do not use official Switch controls",
    );
    assert(await sourceSwitch.getAttribute("aria-checked") === "true", "Disposable editor wish did not preselect its source list");
    assert(await targetSwitch.getAttribute("aria-checked") === "false", "Disposable editor wish unexpectedly preselected its target list");
    await sourceSwitch.click();
    await targetChoice.locator(".wish-editor__list-title").click();
    assert(await sourceSwitch.getAttribute("aria-checked") === "false", "Disposable editor source list switch did not clear");
    assert(await targetSwitch.getAttribute("aria-checked") === "true", "Disposable editor target list switch did not select");
    await targetSwitch.press("Space");
    assert(await targetSwitch.getAttribute("aria-checked") === "false", "Disposable editor target list switch did not respond to Space");
    await targetSwitch.press("Space");
    assert(await targetSwitch.getAttribute("aria-checked") === "true", "Disposable editor target list switch did not restore via Space");

    assert(
      await editorDialog.locator("input[type='file'][accept*='image/jpeg']").count() === 1,
      "Editor does not expose the canonical image upload control",
    );
    assert(
      await editorDialog.locator(".wish-editor__image > img").getAttribute("src") === "/art/camera.svg",
      "Editor did not preserve the supported local image URL",
    );

    const editedTitle = `${initialTitle} · updated`;
    const editedDescription = "Проверка полноэкранного редактора на временном желании";
    const editedUrl = "https://example.com/rollapp-editor-after";
    const editedPrice = 2345;
    const titleInput = editorDialog.getByLabel("Название", { exact: true });
    const urlInput = editorDialog.getByLabel("Ссылка", { exact: true });
    const descriptionInput = editorDialog.locator(".wish-editor__field--description > textarea");
    const priceInput = editorDialog.locator(".wish-editor__field--price > input");
    const currencySelect = editorDialog.getByLabel("Валюта", { exact: true });
    const privateSwitch = editorDialog.getByRole("switch", { name: "Секретное желание", exact: true });
    const multipleSwitch = editorDialog.getByRole("switch", { name: "Многократное бронирование", exact: true });
    assert(await titleInput.inputValue() === draftProbeTitle, "Disposable editor did not preserve the title draft after list creation");
    assert(await urlInput.inputValue() === initialUrl, "Disposable editor did not prefill the wish URL");
    assert(await descriptionInput.inputValue() === initialDescription, "Disposable editor did not prefill the wish description");
    assert(Number(await priceInput.inputValue()) === 1234, "Disposable editor did not prefill the wish price");
    assert(await currencySelect.inputValue() === "RUB", "Disposable editor did not prefill the wish currency");
    assert(!(await privateSwitch.isChecked()), "Disposable editor wish unexpectedly started private");
    assert(!(await multipleSwitch.isChecked()), "Disposable editor wish unexpectedly allowed multiple reservations");

    await titleInput.fill(editedTitle);
    await urlInput.fill(editedUrl);
    await descriptionInput.fill(editedDescription);
    await priceInput.fill(String(editedPrice));
    await currencySelect.selectOption("EUR");
    await editorDialog.locator(".wish-editor__switch-row").filter({ hasText: "Секретное желание" }).click();
    await editorDialog.locator(".wish-editor__switch-row").filter({ hasText: "Многократное бронирование" }).click();
    assert(await privateSwitch.isChecked(), "Visible privacy switch did not toggle");
    assert(await multipleSwitch.isChecked(), "Visible multiple-reservation switch did not toggle");

    const editorUpdateResponsePromise = ownerWidePage.waitForResponse((response) => (
      response.request().method() === "PATCH"
      && new URL(response.url()).pathname === `/api/wishes/${editorSmokeWishId}`
    ));
    await editorDialog.getByRole("button", { name: "Обновить", exact: true }).click();
    const editorUpdateResponse = await editorUpdateResponsePromise;
    assert(editorUpdateResponse.ok(), `Disposable wish editor update failed: ${editorUpdateResponse.status()}`);
    const editorUpdateRequest = editorUpdateResponse.request().postDataJSON();
    assert(editorUpdateRequest.title === editedTitle, "Wish editor sent the wrong title");
    assert(editorUpdateRequest.description === editedDescription, "Wish editor sent the wrong description");
    assert(editorUpdateRequest.url === editedUrl, "Wish editor sent the wrong URL");
    assert(editorUpdateRequest.imageUrl === "/art/camera.svg", "Wish editor changed the supported local image URL");
    assert(editorUpdateRequest.price === editedPrice, "Wish editor sent the wrong price");
    assert(editorUpdateRequest.currency === "EUR", "Wish editor sent the wrong currency");
    assert(editorUpdateRequest.privacy === "private", "Wish editor sent the wrong privacy");
    assert(editorUpdateRequest.allowMultiple === true, "Wish editor sent the wrong multiple-reservation setting");
    assert(sameMembers(editorUpdateRequest.listIds, [targetList.id]), "Wish editor sent the wrong list membership");
    assert(editorUpdateRequest.priority === 2, "Wish editor changed the hidden priority");
    await editorDialog.waitFor({ state: "detached" });
    await editorSmokeCard.waitFor({ state: "detached" });

    const afterUpdateResponse = await apiFromPage(ownerWidePage, "/api/dashboard");
    assert(afterUpdateResponse.ok, `Disposable editor wish verification failed: ${afterUpdateResponse.status}`);
    const updatedEditorWish = afterUpdateResponse.data.wishes.find((wish) => wish.id === editorSmokeWishId);
    assert(
      updatedEditorWish
      && updatedEditorWish.title === editedTitle
      && updatedEditorWish.description === editedDescription
      && updatedEditorWish.url === editedUrl
      && updatedEditorWish.imageUrl === "/art/camera.svg"
      && Number(updatedEditorWish.price) === editedPrice
      && updatedEditorWish.currency === "EUR"
      && updatedEditorWish.privacy === "private"
      && updatedEditorWish.allowMultiple === true
      && updatedEditorWish.priority === 2
      && sameMembers(updatedEditorWish.listIds, [targetList.id]),
      "API did not persist the complete disposable wish editor payload",
    );
    assert(
      afterUpdateResponse.data.lists.find((list) => list.id === sourceList.id)?.wishCount === baselineSourceCount,
      "Editing the disposable wish did not restore the source list count",
    );
    assert(
      afterUpdateResponse.data.lists.find((list) => list.id === targetList.id)?.wishCount === baselineTargetCount + 1,
      "Editing the disposable wish did not increment the target list count",
    );

    await ownerWidePage.goto(`${baseUrl}/alisa/lists/${targetList.id}`, { waitUntil: "domcontentloaded" });
    await ownerWidePage.locator(".public-profile.is-owner").waitFor({ state: "visible" });
    const updatedEditorCard = ownerWidePage.locator(".wish-card").filter({ hasText: editedTitle }).first();
    await updatedEditorCard.waitFor({ state: "visible" });
    await updatedEditorCard.getByRole("button", { name: `Открыть желание «${editedTitle}»`, exact: true }).click();
    const updatedEditorDetail = ownerWidePage.getByRole("dialog", { name: `Желание: ${editedTitle}`, exact: true });
    await updatedEditorDetail.waitFor({ state: "visible" });
    await expectStandaloneBuyAction(updatedEditorDetail, editedUrl, "Disposable wish buy action");
    await updatedEditorDetail.getByRole("button", { name: "Закрыть диалог" }).click();
    await updatedEditorDetail.waitFor({ state: "detached" });
    const updatedEditorMenu = await openOwnerWishCardMenu(ownerWidePage, updatedEditorCard, updatedEditorWish);
    await updatedEditorMenu.menu.getByRole("menuitem", { name: "Редактировать", exact: true }).click();
    const deleteEditorDialog = ownerWidePage.getByRole("dialog", { name: `Редактирование желания «${editedTitle}»`, exact: true });
    await deleteEditorDialog.waitFor({ state: "visible" });
    assert(await deleteEditorDialog.getByRole("switch", { name: "Секретное желание", exact: true }).isChecked(), "Saved privacy switch did not survive reopening");
    assert(await deleteEditorDialog.getByRole("switch", { name: "Многократное бронирование", exact: true }).isChecked(), "Saved multiple-reservation switch did not survive reopening");
    await deleteEditorDialog.getByRole("button", { name: "Удалить желание", exact: true }).click();

    const editorDeleteDialog = ownerWidePage.getByRole("dialog", { name: `Удаление желания «${editedTitle}»`, exact: true });
    await editorDeleteDialog.waitFor({ state: "visible" });
    await expectDarkAuthenticatedModal(editorDeleteDialog, "Disposable editor delete confirmation");
    const editorDeleteResponsePromise = ownerWidePage.waitForResponse((response) => (
      response.request().method() === "DELETE"
      && new URL(response.url()).pathname === `/api/wishes/${editorSmokeWishId}`
    ));
    await editorDeleteDialog.getByRole("button", { name: "Удалить", exact: true }).click();
    const editorDeleteResponse = await editorDeleteResponsePromise;
    assert(editorDeleteResponse.ok(), `Disposable editor wish deletion failed: ${editorDeleteResponse.status()}`);
    await editorDeleteDialog.waitFor({ state: "detached" });
    await updatedEditorCard.waitFor({ state: "detached" });

    const afterDeleteResponse = await apiFromPage(ownerWidePage, "/api/dashboard");
    assert(afterDeleteResponse.ok, `Disposable editor delete verification failed: ${afterDeleteResponse.status}`);
    assert(!afterDeleteResponse.data.wishes.some((wish) => wish.id === editorSmokeWishId), "Deleted disposable wish remains in the dashboard API");
    assert(
      afterDeleteResponse.data.lists.find((list) => list.id === sourceList.id)?.wishCount === baselineSourceCount
      && afterDeleteResponse.data.lists.find((list) => list.id === targetList.id)?.wishCount === baselineTargetCount,
      "Deleting the disposable editor wish did not restore list counts",
    );
    const profileAfterDeleteResponse = await apiFromPage(ownerWidePage, "/api/profile/alisa");
    assert(profileAfterDeleteResponse.ok, `Profile API after disposable wish deletion failed: ${profileAfterDeleteResponse.status}`);
    assert(!profileAfterDeleteResponse.data.wishes.some((wish) => wish.id === editorSmokeWishId), "Deleted disposable wish remains in the profile API");
  } finally {
    if (editorSmokeWishId) {
      const cleanupEditorWishResponse = await apiFromPage(ownerWidePage, `/api/wishes/${editorSmokeWishId}`, { method: "DELETE" });
      assert(
        cleanupEditorWishResponse.ok || cleanupEditorWishResponse.status === 404,
        `Failed to clean up disposable editor wish: ${cleanupEditorWishResponse.status}`,
      );
    }
  }

  let repeatedWishId = null;
  try {
    const markFulfilledResponse = await apiFromPage(ownerWidePage, `/api/wishes/${wishToMove.id}/fulfilled`, {
      method: "POST",
      body: { fulfilled: true },
    });
    assert(markFulfilledResponse.ok && markFulfilledResponse.data?.status === "fulfilled", "Failed to prepare fulfilled wish menu regression");
    await ownerWidePage.goto(`${baseUrl}/alisa?view=fulfilled`, { waitUntil: "domcontentloaded" });
    await ownerWidePage.locator(".public-profile.is-owner").waitFor({ state: "visible" });
    const fulfilledCard = ownerWidePage.locator(".wish-card").filter({ hasText: wishToMove.title }).first();
    await fulfilledCard.waitFor({ state: "visible" });
    const fulfilledDashboardResponse = await apiFromPage(ownerWidePage, "/api/dashboard");
    assert(fulfilledDashboardResponse.ok, `Fulfilled menu dashboard failed: ${fulfilledDashboardResponse.status}`);
    const fulfilledWish = fulfilledDashboardResponse.data.wishes.find((wish) => wish.id === wishToMove.id);
    assert(fulfilledWish?.status === "fulfilled", "Fulfilled menu regression received an active wish");
    await expectOwnerWishCardMenu(
      ownerWidePage,
      fulfilledCard,
      fulfilledWish,
      fulfilledDashboardResponse.data.lists,
      "Desktop fulfilled owner wish menu",
    );

    const repeatMenu = await openOwnerWishCardMenu(ownerWidePage, fulfilledCard, fulfilledWish);
    const repeatResponsePromise = ownerWidePage.waitForResponse((response) => (
      response.request().method() === "POST"
      && new URL(response.url()).pathname === "/api/wishes"
    ));
    await repeatMenu.menu.getByRole("menuitem", { name: "Загадать ещё раз", exact: true }).click();
    const repeatResponse = await repeatResponsePromise;
    assert(repeatResponse.ok(), `Repeating a fulfilled wish failed: ${repeatResponse.status()}`);
    const repeatedWish = (await repeatResponse.json()).wish;
    repeatedWishId = repeatedWish?.id || null;
    assert(repeatedWish?.status === "active" && repeatedWish.id !== wishToMove.id, "Repeat action did not create a separate active wish");
    assert(repeatedWish.title === wishToMove.title, "Repeat action changed the wish title");
    assert(sameMembers(repeatedWish.listIds, originalListIds), "Repeat action changed the wish list membership");
    await repeatMenu.menu.waitFor({ state: "detached" });

    const unfulfillMenu = await openOwnerWishCardMenu(ownerWidePage, fulfilledCard, fulfilledWish);
    const unfulfillResponsePromise = ownerWidePage.waitForResponse((response) => (
      response.request().method() === "POST"
      && new URL(response.url()).pathname === `/api/wishes/${wishToMove.id}/fulfilled`
    ));
    await unfulfillMenu.menu.getByRole("menuitem", { name: "Не исполнено", exact: true }).click();
    const unfulfillResponse = await unfulfillResponsePromise;
    assert(unfulfillResponse.ok(), `Unfulfilling a wish failed: ${unfulfillResponse.status()}`);
    assert((await unfulfillResponse.json()).status === "active", "Unfulfill action returned the wrong target status");
    await fulfilledCard.waitFor({ state: "detached" });
  } finally {
    const restoreStatusResponse = await apiFromPage(ownerWidePage, `/api/wishes/${wishToMove.id}/fulfilled`, {
      method: "POST",
      body: { fulfilled: false },
    });
    assert(restoreStatusResponse.ok && restoreStatusResponse.data?.status === "active", "Failed to restore seeded wish status");
    if (repeatedWishId) {
      const cleanupResponse = await apiFromPage(ownerWidePage, `/api/wishes/${repeatedWishId}`, { method: "DELETE" });
      assert(cleanupResponse.ok, `Failed to remove repeated smoke wish ${repeatedWishId}: ${cleanupResponse.status}`);
    }
  }
  await expectNoRootOverflow(ownerWidePage, "1912px owner profile");
  await ownerWide.close();

  console.log("Visual smoke passed: desktop/mobile card menus, hover lists, fulfilled/repeat/delete actions, list persistence, wish details, app routes, friend directories, and public profiles");
} finally {
  await browser.close();
}
