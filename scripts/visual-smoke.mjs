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

async function expectLargeAppControls(root, label) {
  await root.evaluate(async (scope) => {
    const finiteAnimations = scope.getAnimations({ subtree: true }).filter((animation) => {
      const iterations = animation.effect?.getTiming?.().iterations;
      return iterations !== Infinity;
    });
    await Promise.all(finiteAnimations.map((animation) => animation.finished.catch(() => {})));
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
  const controls = await root.evaluate((scope) => {
    const selector = [
      '[class~="group/button"]',
      '[data-slot="button"]',
      '[data-slot="input"]',
      '[data-slot="input-group"]',
      '[data-slot="input-otp-slot"]',
      '[data-slot="native-select"]',
      '[data-slot="select-trigger"]',
      '[data-slot="textarea"]',
      '[data-slot="toggle"]',
      '[data-slot="toggle-group-item"]',
      '[data-slot="tabs-trigger"]',
      '[data-slot="switch"]',
      '[data-slot="checkbox"]',
      '[data-slot="radio-group-item"]',
      '[data-slot="dialog-close"]',
      '[data-slot="dropdown-menu-trigger"]',
      '[data-slot="alert-dialog-action"]',
      '[data-slot="alert-dialog-cancel"]',
      '[data-slot="select-scroll-up-button"]',
      '[data-slot="select-scroll-down-button"]',
      '[role="menuitem"]',
      '[role="menuitemcheckbox"]',
      '[role="menuitemradio"]',
      '[role="option"]',
    ].join(", ");
    const candidates = [...new Set([
      ...(scope.matches(selector) ? [scope] : []),
      ...scope.querySelectorAll(selector),
    ])];
    const isVisible = (element) => {
      if (element.matches('input[type="file"], input[type="hidden"]')) return false;
      if (element.closest(".sr-only, .visually-hidden, [hidden]")) return false;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return rect.width > .5
        && rect.height > .5
        && style.display !== "none"
        && style.visibility !== "hidden"
        && Number(style.opacity) !== 0;
    };
    const visibleText = (element) => {
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      const parts = [];
      while (walker.nextNode()) {
        const parent = walker.currentNode.parentElement;
        const text = walker.currentNode.textContent.trim();
        if (!text || parent?.closest(".sr-only, .visually-hidden, [hidden]")) continue;
        const style = parent ? getComputedStyle(parent) : null;
        if (!style || (style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) !== 0)) parts.push(text);
      }
      return parts.join(" ");
    };
    const rectOf = (element) => {
      const rect = element.getBoundingClientRect();
      return { width: rect.width, height: rect.height };
    };
    return candidates.filter(isVisible).map((element) => {
      const slot = element.getAttribute("data-slot");
      const role = element.getAttribute("role");
      const thumb = element.querySelector(':scope > [data-slot="switch-thumb"]');
      const checkboxIndicator = element.querySelector(':scope > [data-slot="checkbox-indicator"]');
      const indicatorStyle = checkboxIndicator ? getComputedStyle(checkboxIndicator) : null;
      const indicatorRect = checkboxIndicator?.getBoundingClientRect();
      const indicatorVisible = Boolean(checkboxIndicator
        && indicatorStyle
        && indicatorRect
        && indicatorRect.width > .5
        && indicatorRect.height > .5
        && indicatorStyle.display !== "none"
        && indicatorStyle.visibility !== "hidden");
      return {
        slot,
        role,
        tag: element.tagName,
        label: element.getAttribute("aria-label") || visibleText(element).replace(/\s+/g, " ").trim().slice(0, 80),
        ...rectOf(element),
        iconOnly: element.querySelector("svg") !== null && visibleText(element).trim() === "",
        thumb: thumb ? rectOf(thumb) : null,
        checkboxIndicator: indicatorVisible ? rectOf(checkboxIndicator) : null,
      };
    });
  });

  for (const control of controls) {
    const identity = `${control.slot || control.role || control.tag}${control.label ? ` “${control.label}”` : ""}`;
    if (control.slot === "textarea") {
      assert(control.height >= 95, `${label} ${identity} is ${control.height}px tall instead of at least 96px`);
      continue;
    }
    if (control.slot === "switch") {
      assert(
        control.width >= 43 && control.width <= 45
          && control.height >= 23 && control.height <= 25
          && control.thumb
          && control.thumb.width >= 19 && control.thumb.width <= 21
          && control.thumb.height >= 19 && control.thumb.height <= 21,
        `${label} ${identity} is not the app-level 44x24 Switch with a 20px thumb (${JSON.stringify(control)})`,
      );
      continue;
    }
    if (control.slot === "checkbox" || control.slot === "radio-group-item") {
      assert(
        control.width >= 23 && control.width <= 25 && control.height >= 23 && control.height <= 25,
        `${label} ${identity} is not a 24px ${control.slot === "checkbox" ? "Checkbox" : "Radio"} (${control.width}x${control.height})`,
      );
      if (control.slot === "checkbox" && control.checkboxIndicator) {
        assert(
          control.checkboxIndicator.width >= 19 && control.checkboxIndicator.width <= 21
            && control.checkboxIndicator.height >= 19 && control.checkboxIndicator.height <= 21,
          `${label} ${identity} does not use a 20px Checkbox indicator (${JSON.stringify(control.checkboxIndicator)})`,
        );
      }
      continue;
    }
    if (["input", "input-group", "input-otp-slot", "native-select", "select-trigger", "toggle", "toggle-group-item", "tabs-trigger"].includes(control.slot)) {
      assert(
        control.height >= 47,
        `${label} ${identity} is ${control.height}px tall instead of at least the 48px Large size`,
      );
      continue;
    }
    assert(control.height >= 47, `${label} ${identity} is ${control.height}px tall instead of at least 48px`);
    if (control.iconOnly) {
      assert(
        control.width >= 47,
        `${label} icon control ${identity} is ${control.width}x${control.height} instead of at least 48x48`,
      );
    }
  }
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

async function expectTopbarShareIconButton(topbar, label) {
  const share = topbar.locator(":scope > .wishes-page__topbar-share");
  await share.waitFor({ state: "visible" });
  assert(
    await topbar.getByRole("button", { name: "Поделиться", exact: true }).count() === 1,
    `${label} is missing the accessible Share action`,
  );
  const contract = await share.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    return {
      tag: element.tagName,
      ariaLabel: element.getAttribute("aria-label"),
      title: element.getAttribute("title"),
      visibleText: element.innerText.trim(),
      iconCount: element.querySelectorAll(":scope > svg").length,
      width: rect.width,
      height: rect.height,
      borderRadii: [
        style.borderTopLeftRadius,
        style.borderTopRightRadius,
        style.borderBottomRightRadius,
        style.borderBottomLeftRadius,
      ].map(Number.parseFloat),
      hittable: hit === element || element.contains(hit),
    };
  });
  assert(contract.tag === "BUTTON", `${label} Share action is not a native button`);
  assert(
    contract.ariaLabel === "Поделиться" && contract.title === "Поделиться",
    `${label} icon-only Share action lost its accessible name or tooltip`,
  );
  assert(contract.visibleText === "", `${label} Share action still renders a visible text label`);
  assert(contract.iconCount === 1, `${label} Share action must render exactly one direct icon`);
  assert(
    Math.abs(contract.width - 48) <= 1 && Math.abs(contract.height - 48) <= 1,
    `${label} Share action is ${contract.width}x${contract.height} instead of 48x48`,
  );
  assert(
    contract.borderRadii.every((radius) => radius >= contract.height / 2 - 1),
    `${label} Share action is not circular`,
  );
  assert(contract.hittable, `${label} Share action is covered by another element`);
}

async function expectWishesProfileComposition(page, label) {
  const hero = page.locator(".wishes-page > .wishes-page__hero");
  await hero.waitFor({ state: "visible" });
  await page.mouse.move(0, 0);
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  });
  await waitForStableLayout(page);
  const contract = await hero.evaluate((element) => {
    const rect = (node) => {
      const value = node?.getBoundingClientRect();
      return value && { left: value.left, top: value.top, right: value.right, bottom: value.bottom, width: value.width, height: value.height, centerX: value.left + value.width / 2, centerY: value.top + value.height / 2 };
    };
    const topbar = element.previousElementSibling?.matches(".wishes-page__topbar") ? element.previousElementSibling : null;
    const logo = topbar?.querySelector(":scope > .app-shell-logo");
    const identity = element.querySelector(":scope > .wishes-page__identity");
    const avatar = identity?.querySelector('[data-slot="avatar"]');
    const heading = identity?.querySelector("h1");
    const usernameCount = identity?.querySelectorAll(".wishes-page__hero-username").length || 0;
    const share = topbar?.querySelector(":scope > .wishes-page__topbar-share");
    const friendLinks = element.querySelector(":scope > .wishes-page__friend-links");
    const actions = element.querySelector(":scope > .wishes-page__hero-actions");
    const heroRect = rect(element);
    const topbarRect = rect(topbar);
    const logoRect = rect(logo);
    const identityRect = rect(identity);
    const avatarRect = rect(avatar);
    const headingRect = rect(heading);
    const shareRect = rect(share);
    const shareStyle = share ? getComputedStyle(share) : null;
    const topbarStyle = topbar ? getComputedStyle(topbar) : null;
    const shareHit = shareRect ? document.elementFromPoint(shareRect.centerX, shareRect.top + shareRect.height / 2) : null;
    const friendLinksRect = rect(friendLinks);
    const actionsRect = rect(actions);
    const next = element.nextElementSibling;
    const buttons = [...actions?.querySelectorAll(":scope > button") || []].map((button) => {
      const bounds = rect(button);
      const style = getComputedStyle(button);
      const hit = document.elementFromPoint(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2);
      return {
        ...bounds,
        name: button.innerText.trim(),
        borderRadii: [style.borderTopLeftRadius, style.borderTopRightRadius, style.borderBottomRightRadius, style.borderBottomLeftRadius].map(Number.parseFloat),
        hittable: hit === button || button.contains(hit),
        clientWidth: button.clientWidth,
        scrollWidth: button.scrollWidth,
      };
    });
    const friendLinkItems = [...friendLinks?.querySelectorAll(":scope > a") || []].map((link) => {
      const bounds = rect(link);
      const style = getComputedStyle(link);
      const hit = document.elementFromPoint(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2);
      return {
        ...bounds,
        name: link.innerText.trim(),
        href: link.getAttribute("href"),
        tag: link.tagName,
        role: link.getAttribute("role"),
        slot: link.dataset.slot,
        current: link.getAttribute("aria-current"),
        iconCount: link.querySelectorAll(":scope > svg").length,
        iconHidden: [...link.querySelectorAll(":scope > svg")].every((icon) => icon.getAttribute("aria-hidden") === "true"),
        iconSizes: [...link.querySelectorAll(":scope > svg")].map((icon) => {
          const iconRect = icon.getBoundingClientRect();
          return { width: iconRect.width, height: iconRect.height };
        }),
        nestedInteractiveCount: link.querySelectorAll("a[href], button, input, select, textarea").length,
        fontSize: Number.parseFloat(style.fontSize),
        lineHeight: Number.parseFloat(style.lineHeight),
        fontWeight: style.fontWeight,
        color: style.color,
        backgroundColor: style.backgroundColor,
        backgroundImage: style.backgroundImage,
        borderWidths: ["Top", "Right", "Bottom", "Left"].map((side) => Number.parseFloat(style[`border${side}Width`])),
        borderRadius: Number.parseFloat(style.borderTopLeftRadius),
        paddingLeft: Number.parseFloat(style.paddingLeft),
        paddingRight: Number.parseFloat(style.paddingRight),
        boxShadow: style.boxShadow,
        textDecorationLine: style.textDecorationLine,
        hittable: hit === link || link.contains(hit),
        clientWidth: link.clientWidth,
        scrollWidth: link.scrollWidth,
      };
    });
    const friendLinksVisual = friendLinkItems.length ? {
      left: Math.min(...friendLinkItems.map(({ left }) => left)),
      right: Math.max(...friendLinkItems.map(({ right }) => right)),
    } : null;
    if (friendLinksVisual) friendLinksVisual.centerX = (friendLinksVisual.left + friendLinksVisual.right) / 2;
    const radius = avatar ? Number.parseFloat(getComputedStyle(avatar).borderTopLeftRadius) : 0;
    const visibleGlobalProfiles = [...document.querySelectorAll(".app-main__profile > .app-user-profile, .mobile-app-head > .app-user-profile")]
      .filter((node) => node.checkVisibility()).length;
    return {
      viewportWidth: window.innerWidth,
      hero: heroRect,
      topbar: topbarRect && {
        ...topbarRect,
        paddingLeft: Number.parseFloat(topbarStyle.paddingLeft),
        paddingRight: Number.parseFloat(topbarStyle.paddingRight),
      },
      logo: logoRect,
      identity: identityRect,
      avatar: avatarRect,
      heading: headingRect,
      usernameCount,
      share: shareRect && {
        ...shareRect,
        visibleText: share.innerText.trim(),
        ariaLabel: share.getAttribute("aria-label"),
        title: share.getAttribute("title"),
        iconCount: share.querySelectorAll(":scope > svg").length,
        borderRadii: [
          shareStyle.borderTopLeftRadius,
          shareStyle.borderTopRightRadius,
          shareStyle.borderBottomRightRadius,
          shareStyle.borderBottomLeftRadius,
        ].map(Number.parseFloat),
        tag: share.tagName,
        hittable: shareHit === share || share.contains(shareHit),
        clientWidth: share.clientWidth,
        scrollWidth: share.scrollWidth,
      },
      friendLinks: friendLinksRect,
      friendLinksVisual,
      friendLinkItems,
      actions: actionsRect,
      buttons,
      avatarRadius: radius,
      identityTag: identity?.tagName,
      identityHref: identity?.getAttribute("href"),
      identityLabel: identity?.getAttribute("aria-label"),
      headingText: heading?.childNodes[0]?.textContent.trim() || "",
      directIdentity: identity?.parentElement === element,
      directTopbar: topbar?.parentElement === element.parentElement,
      directShare: share?.parentElement === topbar,
      directFriendLinks: friendLinks?.parentElement === element,
      directActions: actions?.parentElement === element,
      topbarBeforeHero: topbar?.nextElementSibling === element,
      profileOrder: identity?.nextElementSibling === friendLinks && friendLinks?.nextElementSibling === actions,
      followedByLists: Boolean(next?.matches(".list-tabs")),
      globalProfiles: visibleGlobalProfiles,
      rootClientWidth: document.documentElement.clientWidth,
      rootScrollWidth: Math.max(document.documentElement.scrollWidth, document.body?.scrollWidth || 0),
    };
  });
  assert(contract.topbar && contract.logo && contract.hero && contract.identity && contract.avatar && contract.heading && contract.share && contract.friendLinks && contract.friendLinksVisual && contract.actions, `${label} is missing the wishes header or centered profile composition`);
  assert(contract.directTopbar && contract.directShare && contract.topbarBeforeHero && contract.directIdentity && contract.directFriendLinks && contract.directActions && contract.profileOrder && contract.followedByLists, `${label} header, profile, friend links, actions, and list carousel are out of order`);
  assert(
    contract.identityTag === "BUTTON" && contract.identityHref === null,
    `${label} centered profile is not an in-place edit button`,
  );
  assert(/^Редактировать профиль\s+/.test(contract.identityLabel || ""), `${label} centered profile has the wrong accessible name`);
  assert(contract.headingText.length > 0, `${label} centered profile identity is incomplete`);
  assert(contract.usernameCount === 0, `${label} still shows the profile username below the name`);
  assert(contract.globalProfiles === 0, `${label} still duplicates the profile in the global header`);
  const minimumAvatar = contract.viewportWidth <= 560 ? 92 : contract.viewportWidth <= 820 ? 108 : contract.viewportWidth <= 1180 ? 130 : 154;
  assert(contract.avatar.width >= minimumAvatar && Math.abs(contract.avatar.width - contract.avatar.height) <= 1, `${label} centered avatar is too small or not square`);
  assert(contract.avatarRadius >= contract.avatar.width / 2 - 2, `${label} centered avatar is not circular`);
  const centers = [contract.avatar.centerX, contract.heading.centerX, contract.friendLinksVisual.centerX, contract.actions.centerX];
  assert(Math.max(...centers) - Math.min(...centers) <= 2, `${label} profile elements are not centered on one axis (${centers.join(", ")})`);
  assert(contract.avatar.bottom <= contract.heading.top + 1 && contract.heading.bottom <= contract.friendLinks.top + 1 && contract.friendLinks.bottom <= contract.actions.top + 1, `${label} profile elements are not ordered avatar, name, friend links, actions`);
  assert(
    sameMembers(contract.friendLinkItems.map(({ name }) => name), ["Подписки", "Подписчики"]),
    `${label} should expose the subscriptions and followers links directly below the name`,
  );
  const expectedFriendPaths = {
    "Подписки": friendsRoutes.subscriptions,
    "Подписчики": friendsRoutes.followers,
  };
  for (const link of contract.friendLinkItems) {
    assert(link.tag === "A" && link.role === null && link.slot === undefined, `${label} ${link.name} still uses button semantics`);
    assert(new URL(link.href, baseUrl).pathname === expectedFriendPaths[link.name], `${label} ${link.name} points to the wrong route`);
    assert(link.current === null, `${label} ${link.name} is incorrectly marked current on the wishes page`);
    assert(link.iconCount === 1 && link.iconHidden, `${label} ${link.name} is missing its decorative relationship icon`);
    assert(
      link.iconSizes.every(({ width, height }) => Math.abs(width - 20) <= 1 && Math.abs(height - 20) <= 1),
      `${label} ${link.name} relationship icon has the wrong size`,
    );
    assert(link.fontSize >= 14 && link.lineHeight >= 19, `${label} ${link.name} lost its readable link typography`);
    assert(
      ["transparent", "rgba(0, 0, 0, 0)"].includes(link.backgroundColor)
        && link.backgroundImage === "none"
        && link.borderWidths.every((width) => width === 0)
        && link.borderRadius === 0
        && link.paddingLeft === 0
        && link.paddingRight === 0
        && link.boxShadow === "none"
        && link.textDecorationLine === "none",
      `${label} ${link.name} still renders button chrome`,
    );
    assert(link.nestedInteractiveCount === 0, `${label} ${link.name} contains a nested interactive control`);
    assert(link.height >= 44 && link.hittable, `${label} ${link.name} is too small or covered`);
    assert(link.scrollWidth <= link.clientWidth + 1, `${label} ${link.name} content overflows`);
  }
  assert(contract.actions.bottom <= contract.hero.bottom + 1, `${label} actions escape the profile composition`);
  assert(
    contract.share.tag === "BUTTON"
      && contract.share.ariaLabel === "Поделиться"
      && contract.share.title === "Поделиться",
    `${label} header share action has the wrong semantics or accessible label`,
  );
  assert(contract.share.visibleText === "", `${label} header share action still renders a visible text label`);
  assert(contract.share.iconCount === 1, `${label} header share action is not an icon-only shadcn button`);
  assert(
    Math.abs(contract.share.width - 48) <= 1
      && Math.abs(contract.share.height - 48) <= 1
      && contract.share.borderRadii.every((radius) => radius >= contract.share.height / 2 - 1)
      && contract.share.hittable,
    `${label} header share action is not a hittable circular 48px control`,
  );
  assert(
    Math.abs(contract.logo.centerY - contract.share.centerY) <= 2,
    `${label} logo and share action are not aligned on one horizontal line`,
  );
  assert(contract.logo.right <= contract.share.left - 8, `${label} logo and share action overlap`);
  assert(
    Math.abs(contract.logo.left - (contract.topbar.left + contract.topbar.paddingLeft)) <= 2
      && Math.abs(contract.share.right - (contract.topbar.right - contract.topbar.paddingRight)) <= 2,
    `${label} logo and share action are not aligned to the header edges`,
  );
  assert(contract.topbar.bottom <= contract.hero.top + 1, `${label} wishes header overlaps the centered profile`);
  assert(contract.share.scrollWidth <= contract.share.clientWidth + 1, `${label} share action content overflows`);
  assert(contract.buttons.length >= 1 && contract.buttons.some(({ name }) => name === "Добавить"), `${label} lost the add action`);
  assert(!contract.buttons.some(({ name }) => name === "Поделиться"), `${label} still renders the share action in the centered button group`);
  if (contract.buttons.length === 1) {
    assert(Math.abs(contract.buttons[0].centerX - contract.actions.centerX) <= 2, `${label} sole add action is not centered`);
  }
  for (const button of contract.buttons) {
    assert(button.height >= 47 && button.hittable, `${label} action ${button.name} is smaller than the 48px Large size or covered`);
    assert(button.borderRadii.every((radius) => radius >= button.height / 2 - 1), `${label} action ${button.name} is not fully rounded`);
    assert(button.left >= contract.hero.left - 1 && button.right <= contract.hero.right + 1, `${label} action ${button.name} escapes the profile composition`);
    assert(button.scrollWidth <= button.clientWidth + 1, `${label} action ${button.name} text overflows`);
  }
  assert(contract.rootScrollWidth <= contract.rootClientWidth + 1, `${label} centered composition causes horizontal page overflow`);
  await expectLargeAppControls(page.locator(".wishes-page"), `${label} app controls`);
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
    const hero = document.querySelector(".wishes-page > .wishes-page__hero");
    const actions = hero?.querySelector(".page-actions");
    const cards = [...document.querySelectorAll(".wishes-page .wish-card")].slice(0, 4).map((card) => {
      const bounds = card.getBoundingClientRect();
      return { left: bounds.left, right: bounds.right, top: bounds.top, width: bounds.width };
    });
    return {
      main: rect(".app-main"),
      page: rect(".wishes-page"),
      grid: rect(".wishes-page .wish-grid"),
      hero: rect(".wishes-page > .wishes-page__hero"),
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
  assert(geometry.hero && geometry.actions, `${label} is missing its profile composition or page actions`);
  assert(geometry.hero.left >= geometry.page.left - 1, `${label} profile composition escapes the page on the left`);
  assert(geometry.hero.right <= geometry.page.right + 1, `${label} profile composition escapes the page on the right`);
  assert(geometry.actions.left >= geometry.hero.left - 1, `${label} actions escape the profile composition on the left`);
  assert(geometry.actions.right <= geometry.hero.right + 1, `${label} actions escape the profile composition on the right`);
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
  await expectWishesProfileComposition(page, `${label} profile composition`);
}

async function expectWishCardsUnframed(page, label, selector = ".wish-card") {
  const cards = page.locator(selector);
  await cards.first().waitFor({ state: "visible" });
  assert(
    await cards.locator('.wish-card__image .priority, .wish-card__image [title^="Важность:"]').count() === 0,
    `${label} wish photos still render the unexplained priority indicator`,
  );
  assert(
    await cards.getByText(/^(?:Забронировать|Забронировано вами|Уже забронировано|Снять бронь)$/).count() === 0,
    `${label} wish snippets still expose reservation information`,
  );
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

async function expectWishActionsContained(page, label) {
  await waitForStableLayout(page);
  const geometry = await page.evaluate(() => {
    const hero = document.querySelector(".wishes-page > .wishes-page__hero");
    const actions = hero?.querySelector(".page-actions");
    const rect = (element) => {
      if (!element) return null;
      const bounds = element.getBoundingClientRect();
      return { left: bounds.left, right: bounds.right, top: bounds.top, bottom: bounds.bottom };
    };
    return {
      hero: rect(hero),
      actions: rect(actions),
      buttons: [...actions?.querySelectorAll("button") || []].map((button) => ({
        ...rect(button),
        name: button.innerText.trim(),
        height: button.getBoundingClientRect().height,
        borderRadii: (() => {
          const style = getComputedStyle(button);
          return [style.borderTopLeftRadius, style.borderTopRightRadius, style.borderBottomRightRadius, style.borderBottomLeftRadius].map(Number.parseFloat);
        })(),
        clientWidth: button.clientWidth,
        scrollWidth: button.scrollWidth,
      })),
    };
  });
  assert(geometry.hero && geometry.actions, `${label} is missing its page actions`);
  assert(geometry.actions.left >= geometry.hero.left - 1, `${label} actions escape the profile composition on the left`);
  assert(geometry.actions.right <= geometry.hero.right + 1, `${label} actions escape the profile composition on the right`);
  assert(geometry.buttons.map(({ name }) => name).join("|") === "Настройки списка|Добавить", `${label} selected-list actions have the wrong labels or order`);
  for (const button of geometry.buttons) {
    assert(button.left >= geometry.actions.left - 1, `${label} action button escapes its group on the left`);
    assert(button.right <= geometry.actions.right + 1, `${label} action button escapes its group on the right`);
    assert(button.borderRadii.every((radius) => radius >= button.height / 2 - 1), `${label} action ${button.name} is not fully rounded`);
    assert(button.scrollWidth <= button.clientWidth + 1, `${label} action button content overflows its bounds`);
  }
}

async function expectWishSummaryRemoved(page, label) {
  const hero = page.locator(".wishes-page > .wishes-page__hero");
  await hero.waitFor({ state: "visible" });
  assert(
    await page.getByText("Личная коллекция", { exact: true }).count() === 0,
    `${label} still renders the retired personal-collection eyebrow`,
  );
  assert(await page.locator(".wishes-page .eyebrow").count() === 0, `${label} still shows the wishes eyebrow`);
  assert(await page.getByText(/\d+\s+активн/, { exact: false }).count() === 0, `${label} still shows the active-wishes summary`);
  assert(await page.getByText(/\d+\s+исполнен/, { exact: false }).count() === 0, `${label} still shows the fulfilled-wishes summary`);
  await expectWishesProfileComposition(page, label);
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
    { pathname: "/forgot-password", ready: ".auth-form", surfaces: [".auth-page", ".auth-panel"] },
    { pathname: "/reset-password", ready: ".auth-form", surfaces: [".auth-page", ".auth-panel"] },
    { pathname: "/this-page/does-not/exist", ready: ".not-found", surfaces: [".not-found"] },
  ];
  for (const route of routes) {
    await page.goto(`${baseUrl}${route.pathname}`, { waitUntil: "domcontentloaded" });
    await page.locator(route.ready).waitFor({ state: "visible" });
    await expectDarkPage(page, `${label} ${route.pathname}`, route.surfaces);
    if (route.ready === ".auth-form") {
      await expectLargeAppControls(page.locator(route.ready), `${label} ${route.pathname} controls`);
    }
  }
}

async function expectDesktopUserAgent(page, label) {
  const userAgent = await page.evaluate(() => navigator.userAgent);
  assert(!/(Android|iPhone|iPad|Mobile)/i.test(userAgent), `${label} unexpectedly uses a mobile User-Agent: ${userAgent}`);
}

async function expectMobileAppShell(page, label) {
  const collectionHeader = page.locator(".wishes-page__topbar");
  const usesCollectionHeader = await collectionHeader.count() === 1;
  const header = page.locator(usesCollectionHeader ? ".wishes-page__topbar" : ".mobile-app-head");
  const navigation = page.locator(".mobile-bottom-nav");
  await header.waitFor({ state: "visible" });

  await expectSidebarRemoved(page, label);
  assert(await navigation.count() === 0, `${label} still renders the retired mobile bottom navigation`);
  assert(await header.locator(":scope > a:visible").count() === 1, `${label} mobile header exposes the wrong number of links`);
  assert(await header.locator(":scope > .app-user-profile:visible").count() === (usesCollectionHeader ? 0 : 1), `${label} mobile header has the wrong profile-action state`);
  assert(await header.locator(":scope > .app-shell-logo:visible").count() === 1, `${label} mobile header is missing the Rollapp logo`);
  assert(await header.getByRole("button", { name: "Поделиться", exact: true }).count() === (usesCollectionHeader ? 1 : 0), `${label} mobile header has the wrong share-action state`);
  await expectAppLogoPlacement(page, label);
}

const stableAppRoutes = ["/app/wishes", friendsRoutes.subscriptions];

async function expectSidebarRemoved(page, label) {
  const legacySidebar = page.locator('#app-sidebar, .sidebar, [data-sidebar], [data-slot^="sidebar"]');
  assert(await legacySidebar.count() === 0, `${label} still renders the retired application sidebar`);
  assert(await page.getByRole("button", { name: "Открыть меню", exact: true }).count() === 0, `${label} still renders the retired application menu trigger`);
  assert(await page.getByRole("dialog", { name: "Меню приложения", exact: true }).count() === 0, `${label} still renders the retired application drawer`);
}

async function expectAppLogoPlacement(page, label) {
  const logo = page.locator(".app-main .app-shell-logo:visible");
  const usesCollectionHeader = await page.locator(".app-main .wishes-page__topbar").count() === 1;
  const friendsContext = await page.locator(".app-layout--friends").count() === 1;
  assert(await page.locator(".app-main .app-wishes-link").count() === 0, `${label} still renders the retired My Wishes header button`);
  const wishesHeader = page.locator(".app-main .wishes-page__topbar");
  if (await wishesHeader.count()) {
    assert(await wishesHeader.locator(":scope > .app-shell-logo").count() === 1, `${label} wishes header is missing the Rollapp logo`);
    assert(await wishesHeader.locator(":scope > .wishes-page__topbar-share").count() === 1, `${label} wishes header is missing the Share action`);
    assert(await wishesHeader.locator(":scope > *").count() === 2, `${label} wishes header contains an unexpected extra action`);
    await expectTopbarShareIconButton(wishesHeader, `${label} wishes header`);
  }
  assert(await logo.count() === 1, `${label} should expose one visible Rollapp logo in the main content`);
  assert(await logo.evaluate((element) => element.tagName === "A"), `${label} Rollapp logo is not a native link`);
  assert(new URL(await logo.getAttribute("href"), baseUrl).pathname === "/app/wishes", `${label} Rollapp logo points to the wrong route`);
  assert(await logo.getAttribute("aria-label") === "Rollapp — в приложение", `${label} Rollapp logo has the wrong accessible name`);
  assert(await logo.locator("a[href], button, input, select, textarea").count() === 0, `${label} Rollapp logo contains a nested interactive control`);
  const geometry = await logo.evaluate((element) => {
    const main = element.closest(".app-main");
    const host = element.closest(".wishes-page__topbar, .app-main__profile, .friends-topbar, .mobile-app-head");
    const profile = host?.querySelector(".app-user-profile");
    const share = host?.querySelector(":scope > .wishes-page__topbar-share");
    const mark = element.querySelector(".logo__mark");
    const rect = element.getBoundingClientRect();
    const mainRect = main?.getBoundingClientRect();
    const hostRect = host?.getBoundingClientRect();
    const profileRect = profile?.getBoundingClientRect();
    const shareRect = share?.getBoundingClientRect();
    const markRect = mark?.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    const hostStyle = host ? getComputedStyle(host) : null;
    const hostKind = host?.classList.contains("mobile-app-head")
      ? "mobile-head"
      : host?.classList.contains("wishes-page__topbar")
        ? "wishes-topbar"
      : host?.classList.contains("friends-topbar")
        ? "friends-topbar"
        : host?.classList.contains("app-main__profile")
          ? "utility"
          : "unknown";
    return {
      hostKind,
      width: rect.width,
      height: rect.height,
      top: rect.top,
      bottom: rect.bottom,
      insideMain: Boolean(mainRect && rect.left >= mainRect.left - 1 && rect.right <= mainRect.right + 1 && rect.top >= mainRect.top - 1 && rect.bottom <= mainRect.bottom + 1),
      leftmost: Boolean(host && host.firstElementChild === element),
      rightmost: Boolean(host && host.lastElementChild === element),
      afterProfile: !profileRect || Boolean(profile?.nextElementSibling === element && profileRect.right <= rect.left + 1),
      profileOnRight: !profile || Boolean(host?.lastElementChild === profile || host?.lastElementChild?.contains(profile)),
      profileRightGap: hostRect && profileRect ? hostRect.right - profileRect.right : null,
      logoProfileSeparated: !profileRect || rect.right <= profileRect.left + 1,
      alignedWithProfile: !profileRect || Math.abs((profileRect.top + profileRect.height / 2) - (rect.top + rect.height / 2)) <= 1,
      alignedWithShare: !shareRect || Math.abs((shareRect.top + shareRect.height / 2) - (rect.top + rect.height / 2)) <= 1,
      containedByHost: Boolean(hostRect && rect.left >= hostRect.left - 1 && rect.right <= hostRect.right + 1),
      hostLeftGap: hostRect ? rect.left - hostRect.left : null,
      hostRightGap: hostRect ? hostRect.right - rect.right : null,
      hostPaddingLeft: hostStyle ? Number.parseFloat(hostStyle.paddingLeft) : null,
      hostPaddingRight: hostStyle ? Number.parseFloat(hostStyle.paddingRight) : null,
      hittable: hit === element || element.contains(hit),
      hitTarget: hit ? `${hit.tagName}.${hit.className || ""}` : null,
      mark: markRect ? { width: markRect.width, height: markRect.height } : null,
      markContract: mark ? {
        tagName: mark.tagName,
        viewBox: mark.getAttribute("viewBox"),
        ariaHidden: mark.getAttribute("aria-hidden"),
        focusable: mark.getAttribute("focusable"),
        rasterChildren: mark.querySelectorAll("img, image, foreignObject").length,
        evenOddShapes: mark.querySelectorAll('[fill-rule="evenodd"]').length,
      } : null,
      directChildren: element.children.length,
      visibleText: element.innerText.trim(),
      wordmarkNodes: element.querySelectorAll(':scope > span, .logo__word, svg text').length,
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
      viewportWidth: window.innerWidth,
    };
  });
  assert(geometry.width >= 44 && geometry.height >= 44, `${label} Rollapp logo link is smaller than 44px`);
  assert(geometry.insideMain && geometry.containedByHost && geometry.hittable, `${label} Rollapp logo is outside or covered in the main header: ${JSON.stringify(geometry)}`);
  assert(usesCollectionHeader ? geometry.alignedWithShare : geometry.alignedWithProfile, `${label} Rollapp logo is not vertically aligned with the header actions`);
  if (usesCollectionHeader || friendsContext) {
    assert(geometry.leftmost, `${label} Rollapp logo is not the leftmost item in its header`);
    assert(
      geometry.hostLeftGap >= -1 && Math.abs(geometry.hostLeftGap - geometry.hostPaddingLeft) <= 1,
      `${label} Rollapp logo is not aligned to the left edge of its header`,
    );
    if (friendsContext && !usesCollectionHeader) {
      assert(geometry.profileOnRight && geometry.logoProfileSeparated, `${label} friends profile action is not separated on the right side of the header`);
      assert(
        geometry.profileRightGap >= -1 && Math.abs(geometry.profileRightGap - geometry.hostPaddingRight) <= 1,
        `${label} friends profile action is not aligned to the right edge of its header`,
      );
    }
  } else {
    assert(geometry.rightmost && geometry.afterProfile, `${label} Rollapp logo is not the rightmost action after the profile`);
    assert(
      geometry.hostRightGap >= -1 && Math.abs(geometry.hostRightGap - geometry.hostPaddingRight) <= 1,
      `${label} Rollapp logo is not aligned to the right edge of its header`,
    );
  }
  assert(geometry.mark && geometry.mark.width > 0 && geometry.mark.height > 0, `${label} Rollapp logo mark is missing`);
  assert(
    geometry.markContract?.tagName === "svg"
      && geometry.markContract.viewBox === "0 0 364 364"
      && geometry.markContract.ariaHidden === "true"
      && geometry.markContract.focusable === "false"
      && geometry.markContract.rasterChildren === 0
      && geometry.markContract.evenOddShapes === 1,
    `${label} Rollapp logo is not the expected accessible vector mark: ${JSON.stringify(geometry.markContract)}`,
  );
  assert(geometry.mark.width >= 30 && Math.abs(geometry.mark.width - geometry.mark.height) <= 1, `${label} Rollapp vector mark is too small or distorted`);
  assert(
    geometry.directChildren === 1
      && geometry.visibleText === ""
      && geometry.wordmarkNodes === 0
      && geometry.scrollWidth <= geometry.clientWidth + 1,
    `${label} Rollapp logo must expose only its vector mark, without a visible wordmark`,
  );
  const expectedHost = usesCollectionHeader
    ? "wishes-topbar"
    : geometry.viewportWidth <= 820
      ? "mobile-head"
    : friendsContext
      ? "friends-topbar"
      : "utility";
  assert(geometry.hostKind === expectedHost, `${label} Rollapp logo is mounted in the wrong header (${geometry.hostKind})`);
  return logo;
}

async function expectMainFriendsLink(page, label) {
  const link = page.locator(".app-main .app-friends-link:visible");
  const viewport = page.viewportSize();
  const pathname = new URL(page.url()).pathname;
  const usesCollectionHeader = await page.locator(".app-main .wishes-page__topbar").count() === 1;
  const friendsContext = pathname.startsWith("/app/friends") || await page.locator(".app-layout--friends").count() === 1;
  if (viewport.width <= 820 || usesCollectionHeader || friendsContext) {
    assert(await link.count() === 0, `${label} still renders a Friends link outside the desktop utility header`);
    return null;
  }
  assert(await link.count() === 1, `${label} should expose one visible Friends link in the main content`);
  assert(await link.evaluate((element) => element.tagName === "A"), `${label} Friends action is not a native link`);
  assert(new URL(await link.getAttribute("href"), baseUrl).pathname === friendsRoutes.subscriptions, `${label} Friends action points to the wrong route`);
  assert(/Друзья/.test(await link.getAttribute("aria-label") || await link.innerText()), `${label} Friends action has the wrong accessible name`);
  assert(await link.locator("a[href], button, input, select, textarea").count() === 0, `${label} Friends action contains a nested interactive control`);
  const geometry = await link.evaluate((element) => {
    const main = element.closest(".app-main");
    const rect = element.getBoundingClientRect();
    const mainRect = main?.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    const toolbar = element.closest(".app-main__profile, .friends-topbar__account");
    const profile = toolbar?.querySelector(":scope > .app-user-profile");
    const profileRect = profile?.getBoundingClientRect();
    const iconRect = element.querySelector("svg")?.getBoundingClientRect();
    const host = element.closest(".friends-topbar__account")
        ? "friends-account"
        : element.closest(".app-main__profile")
          ? "utility"
          : "unknown";
    const overlapArea = profileRect
      ? Math.max(0, Math.min(rect.right, profileRect.right) - Math.max(rect.left, profileRect.left))
        * Math.max(0, Math.min(rect.bottom, profileRect.bottom) - Math.max(rect.top, profileRect.top))
      : 0;
    return {
      width: rect.width,
      height: rect.height,
      viewportWidth: window.innerWidth,
      host,
      insideMain: Boolean(mainRect && rect.left >= mainRect.left - 1 && rect.right <= mainRect.right + 1 && rect.top >= mainRect.top - 1 && rect.bottom <= mainRect.bottom + 1),
      hittable: hit === element || element.contains(hit),
      shadcn: element.classList.contains("group/button"),
      beforeProfile: !toolbar || !profileRect || (
        element.nextElementSibling === profile
          && rect.right <= profileRect.left + 1
          && Math.abs((rect.top + rect.height / 2) - (profileRect.top + profileRect.height / 2)) <= 1
      ),
      overlapArea,
      icon: iconRect ? { width: iconRect.width, height: iconRect.height } : null,
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
    };
  });
  assert(geometry.width >= 47 && geometry.height >= 47, `${label} Friends action is smaller than the 48px Large size`);
  assert(geometry.insideMain && geometry.hittable, `${label} Friends action is outside or covered in the main content`);
  assert(geometry.shadcn, `${label} desktop Friends action is not an official shadcn link-button`);
  assert(geometry.beforeProfile, `${label} Friends action is not aligned before the profile action`);
  assert(geometry.overlapArea <= 1, `${label} Friends and profile actions overlap`);
  assert(geometry.icon && geometry.icon.width > 0 && geometry.icon.height > 0, `${label} Friends action is missing its icon`);
  assert(geometry.scrollWidth <= geometry.clientWidth + 1, `${label} Friends action content overflows`);
  assert(geometry.host === "utility", `${label} desktop Friends action is outside the main utility row`);
  assert(await link.getAttribute("aria-current") === null, `${label} marks Friends current outside the section`);
  return link;
}

async function expectMainUserProfile(page, label) {
  const wishesRoute = new URL(page.url()).pathname.startsWith("/app/wishes");
  const profileButton = page.locator(wishesRoute ? ".app-main .wishes-page__identity:visible" : ".app-main .app-user-profile:visible");
  assert(await profileButton.count() === 1, `${label} should expose one visible user-profile action in the main content`);
  assert(
    await profileButton.evaluate((element, hero) => element.tagName === "BUTTON" && element.type === "button" && (hero || element.dataset.slot === "button"), wishesRoute),
    `${label} main user profile is not an in-place button`,
  );
  assert(await profileButton.getAttribute("href") === null, `${label} main user profile still navigates to a retired settings route`);
  assert(/^Редактировать профиль\s+/.test(await profileButton.getAttribute("aria-label") || ""), `${label} main user profile has the wrong accessible name`);
  assert(await profileButton.locator("a[href], button, input, select, textarea").count() === 0, `${label} main user profile contains a nested interactive control`);
  const geometry = await profileButton.evaluate((element, hero) => {
    const main = element.closest(".app-main");
    const avatar = element.querySelector('[data-slot="avatar"]');
    const copy = element.querySelector(hero ? ":scope > .wishes-page__hero-copy" : ":scope > .app-user-profile__copy");
    const bar = element.closest(".app-main__profile");
    const page = main?.querySelector(":scope > .app-page");
    const rect = element.getBoundingClientRect();
    const mainRect = main.getBoundingClientRect();
    const avatarRect = avatar.getBoundingClientRect();
    const pageRect = page?.getBoundingClientRect();
    const hit = document.elementFromPoint(avatarRect.left + avatarRect.width / 2, avatarRect.top + avatarRect.height / 2);
    return {
      hero,
      compact: element.classList.contains("app-user-profile--compact"),
      width: rect.width,
      height: rect.height,
      viewportWidth: window.innerWidth,
      insideMain: rect.left >= mainRect.left - 1 && rect.right <= mainRect.right + 1 && rect.top >= mainRect.top - 1 && rect.bottom <= mainRect.bottom + 1,
      avatar: { width: avatarRect.width, height: avatarRect.height, hittable: hit === element || element.contains(hit) },
      copy: copy ? { visible: copy.checkVisibility(), clientWidth: copy.clientWidth, scrollWidth: copy.scrollWidth } : null,
      positioned: hero
        ? Boolean(pageRect && rect.left >= pageRect.left - 1 && rect.right <= pageRect.right + 1 && rect.top >= pageRect.top - 1 && rect.bottom <= pageRect.bottom + 1)
        : !bar || !pageRect || rect.bottom <= pageRect.top + 1,
      duplicateHeaderProfiles: hero
        ? [...document.querySelectorAll(".app-main__profile > .app-user-profile, .mobile-app-head > .app-user-profile")].filter((node) => node.checkVisibility()).length
        : 0,
    };
  }, wishesRoute);
  assert(geometry.width >= 47 && geometry.height >= 47, `${label} main user profile is smaller than the 48px Large size`);
  assert(geometry.insideMain && geometry.avatar.hittable, `${label} main user profile is outside or covered in the content area`);
  if (geometry.hero) {
    const minimumAvatar = geometry.viewportWidth <= 560 ? 92 : geometry.viewportWidth <= 820 ? 108 : geometry.viewportWidth <= 1180 ? 130 : 154;
    assert(geometry.avatar.width >= minimumAvatar && Math.abs(geometry.avatar.width - geometry.avatar.height) <= 1, `${label} centered profile avatar has the wrong size`);
    assert(geometry.copy?.visible && geometry.copy.scrollWidth <= geometry.copy.clientWidth + 1, `${label} centered profile identity is hidden or overflows`);
    assert(geometry.duplicateHeaderProfiles === 0, `${label} centered profile is duplicated in the global header`);
  } else if (geometry.compact) assert(geometry.copy === null, `${label} compact main profile still renders overflowing identity text`);
  else assert(geometry.copy?.visible && geometry.copy.scrollWidth <= geometry.copy.clientWidth + 1, `${label} main profile identity is hidden or overflows`);
  assert(geometry.positioned, `${label} main user profile is mounted outside its intended content area`);
  return profileButton;
}

async function captureStableAppChrome(page, label) {
  await expectSidebarRemoved(page, label);
  await waitForStableLayout(page);
  await expectMainFriendsLink(page, label);
  await expectMainUserProfile(page, label);
  await expectAppLogoPlacement(page, label);
  const geometry = await page.evaluate(() => {
    const rect = (selector) => {
      const node = document.querySelector(selector);
      if (!node?.checkVisibility()) return null;
      const value = node.getBoundingClientRect();
      return { left: value.left, top: value.top, right: value.right, bottom: value.bottom, width: value.width, height: value.height };
    };
    const layout = document.querySelector(".app-layout--dark");
    const main = document.querySelector(".app-main");
    const page = main?.querySelector(":scope > .app-page");
    const header = [...document.querySelectorAll(".wishes-page__topbar, .mobile-app-head, .friends-topbar, .app-main__profile")]
      .find((node) => node.checkVisibility());
    const content = header?.classList.contains("friends-topbar")
      ? [...main.querySelectorAll(".friends-page .friends-directory > h1, .friend-profile-page > *")]
        .find((node) => node.checkVisibility())
      : header?.classList.contains("wishes-page__topbar")
        ? main.querySelector(".wishes-page__hero")
      : page;
    const layoutStyle = layout ? getComputedStyle(layout) : null;
    const pageRect = page?.getBoundingClientRect();
    const headerRect = header?.getBoundingClientRect();
    const contentRect = content?.getBoundingClientRect();
    return {
      viewportWidth: document.documentElement.clientWidth,
      rootScrollWidth: document.documentElement.scrollWidth,
      layout: rect(".app-layout--dark"),
      main: rect(".app-main"),
      page: pageRect ? { left: pageRect.left, top: pageRect.top, right: pageRect.right, bottom: pageRect.bottom, width: pageRect.width, height: pageRect.height } : null,
      header: headerRect ? { left: headerRect.left, top: headerRect.top, right: headerRect.right, bottom: headerRect.bottom, width: headerRect.width, height: headerRect.height } : null,
      headerPageOverlap: headerRect && contentRect
        ? Math.max(0, Math.min(headerRect.right, contentRect.right) - Math.max(headerRect.left, contentRect.left))
          * Math.max(0, Math.min(headerRect.bottom, contentRect.bottom) - Math.max(headerRect.top, contentRect.top))
        : 0,
      canvas: layoutStyle && {
        backgroundColor: layoutStyle.backgroundColor,
        backgroundImage: layoutStyle.backgroundImage,
        paddingLeft: Number.parseFloat(layoutStyle.paddingLeft),
        paddingRight: Number.parseFloat(layoutStyle.paddingRight),
      },
    };
  });
  assert(geometry.layout && geometry.main && geometry.page && geometry.header && geometry.canvas, `${label} is missing main application chrome`);
  assert(geometry.rootScrollWidth <= geometry.viewportWidth + 1, `${label} application chrome overflows horizontally`);
  assert(geometry.canvas.backgroundImage === "none", `${label} app canvas still has a decorative background: ${geometry.canvas.backgroundImage}`);
  assert(geometry.main.left >= geometry.layout.left - 1 && geometry.main.right <= geometry.layout.right + 1, `${label} main content escapes the app canvas`);
  assert(Math.abs((geometry.main.left - geometry.layout.left) - geometry.canvas.paddingLeft) <= 1, `${label} main content keeps an unexplained left rail`);
  assert(Math.abs((geometry.layout.right - geometry.main.right) - geometry.canvas.paddingRight) <= 1, `${label} main content keeps an unexplained right rail`);
  assert(geometry.headerPageOverlap <= 1, `${label} main header overlaps the page content`);
  return geometry;
}

async function expectMainUserSettingsNavigation(page, label, { mobile = false } = {}) {
  const originalUrl = new URL(page.url());
  const profileButton = await expectMainUserProfile(page, label);
  await profileButton.waitFor({ state: "visible" });
  if (mobile) {
    await profileButton.locator('[data-slot="avatar"]').click();
  } else {
    await profileButton.focus();
    assert(await profileButton.evaluate((element) => document.activeElement === element), `${label} user profile button cannot receive focus`);
    await profileButton.press("Enter");
  }
  const dialog = page.getByRole("dialog", { name: "Изменить профиль", exact: true });
  await dialog.waitFor({ state: "visible" });
  const currentUrl = new URL(page.url());
  assert(
    currentUrl.pathname === originalUrl.pathname && currentUrl.search === originalUrl.search && currentUrl.hash === originalUrl.hash,
    `${label} profile editor changed the current route`,
  );
  assert(await page.locator(".settings-page").count() === 0, `${label} mounted the retired settings page behind the editor`);
  const nameInput = dialog.getByLabel("Имя", { exact: true });
  if (mobile) {
    await page.waitForFunction(() => {
      const editor = document.querySelector('[data-slot="dialog-content"][data-open]');
      return editor?.contains(document.activeElement) && !document.activeElement.matches("input, textarea, select");
    });
  } else {
    await waitForFocused(page, nameInput, `${label} profile editor name field`);
  }
  await dialog.getByRole("button", { name: "Отмена", exact: true }).click();
  await dialog.waitFor({ state: "detached" });
  const closedUrl = new URL(page.url());
  assert(
    closedUrl.pathname === originalUrl.pathname && closedUrl.search === originalUrl.search && closedUrl.hash === originalUrl.hash,
    `${label} closing the profile editor changed the current route`,
  );
  await waitForFocused(page, profileButton, `${label} profile button after editor close`);
}

async function expectWishesFriendShortcutsNavigation(page, label) {
  const originalPathname = new URL(page.url()).pathname;
  assert(originalPathname === "/app/wishes", `${label} must start on the wishes page`);
  const destinations = [
    { name: "Подписки", tab: "subscriptions", keyboard: true },
    { name: "Подписчики", tab: "followers", keyboard: false },
  ];
  for (const destination of destinations) {
    const navigation = page.getByRole("navigation", { name: "Связи профиля" });
    await navigation.waitFor({ state: "visible" });
    const link = navigation.getByRole("link", { name: destination.name, exact: true });
    if (destination.keyboard) {
      await page.locator(".wishes-page__identity").focus();
      await page.keyboard.press("Tab");
      assert(await link.evaluate((element) => document.activeElement === element), `${label} ${destination.name} cannot receive focus`);
      assert(await link.evaluate((element) => element.matches(":focus-visible")), `${label} ${destination.name} has no visible keyboard-focus state`);
      await page.keyboard.press("Enter");
    } else {
      await link.click();
    }
    await page.waitForURL((url) => url.pathname === friendsRoutes[destination.tab]);
    await page.locator(".friends-page").waitFor({ state: "visible" });
    await page.getByRole("heading", { name: friendsLabels[destination.tab], exact: true }).waitFor({ state: "visible" });
    await expectFriendsNavigation(page, destination.tab, `${label} ${destination.name} destination`);
    await waitForAppRoute(page, originalPathname);
  }
}

async function expectStableDesktopChromeAcrossRoutes(page, label, viewport) {
  const originalViewport = page.viewportSize();
  await page.setViewportSize(viewport);
  try {
    for (const pathname of stableAppRoutes) {
      await waitForAppRoute(page, pathname);
      await captureStableAppChrome(page, `${label} ${pathname}`);
      if (pathname === "/app/wishes") {
        await expectWishListCarouselBleed(page, `${label} ${pathname} carousel`);
      }
    }
  } finally {
    if (originalViewport) await page.setViewportSize(originalViewport);
  }
}

async function expectCanonicalModalGeometry(dialog, label) {
  await dialog.waitFor({ state: "visible" });
  const geometry = await dialog.evaluate(async (element) => {
    await Promise.all(element.getAnimations({ subtree: true }).map((animation) => animation.finished.catch(() => {})));
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const rect = element.getBoundingClientRect();
    return {
      slot: element.getAttribute("data-slot"),
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
      width: rect.width,
      viewportWidth: window.innerWidth,
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
      rootClientWidth: document.documentElement.clientWidth,
      rootScrollWidth: Math.max(document.documentElement.scrollWidth, document.body?.scrollWidth || 0),
    };
  });
  assert(
    geometry.slot === "dialog-content" || geometry.slot === "alert-dialog-content",
    `${label} is not an official Dialog or AlertDialog surface (${geometry.slot})`,
  );
  const desktop = geometry.viewportWidth >= 640;
  const widthCap = geometry.slot === "alert-dialog-content"
    ? (desktop ? 384 : 320)
    : (desktop ? 384 : geometry.viewportWidth - 32);
  const expectedWidth = Math.min(geometry.viewportWidth, widthCap);
  assert(
    Math.abs(geometry.width - expectedWidth) <= 2
      && Math.abs((geometry.left + geometry.right) / 2 - geometry.viewportWidth / 2) <= 2
      && geometry.left >= -1
      && geometry.right <= geometry.viewportWidth + 1,
    `${label} does not use the canonical centered ${expectedWidth}px surface (${JSON.stringify(geometry)})`,
  );
  assert(
    geometry.scrollWidth <= geometry.clientWidth + 1
      && geometry.rootScrollWidth <= geometry.rootClientWidth + 1,
    `${label} causes horizontal overflow (${JSON.stringify(geometry)})`,
  );
  await expectLargeAppControls(dialog, `${label} controls`);
}

async function expectEdgeToEdgeWishDetailGeometry(dialog, label) {
  await dialog.waitFor({ state: "visible" });
  const geometry = await dialog.evaluate(async (element) => {
    await Promise.all(element.getAnimations({ subtree: true }).map((animation) => animation.finished.catch(() => {})));
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    const close = element.querySelector("[data-slot='dialog-close']");
    const closeStyle = close ? getComputedStyle(close) : null;
    const rectOf = (node) => {
      const bounds = node?.getBoundingClientRect();
      return bounds && {
        left: bounds.left,
        top: bounds.top,
        right: bounds.right,
        bottom: bounds.bottom,
        width: bounds.width,
        height: bounds.height,
      };
    };
    const closeBeforeScroll = rectOf(close);
    const previousScrollTop = element.scrollTop;
    const maxScroll = Math.max(0, element.scrollHeight - element.clientHeight);
    element.scrollTop = element.scrollHeight;
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const reachedScroll = element.scrollTop;
    const closeAfterScroll = rectOf(close);
    const closeHit = closeAfterScroll
      ? document.elementFromPoint(
        closeAfterScroll.left + closeAfterScroll.width / 2,
        closeAfterScroll.top + closeAfterScroll.height / 2,
      )
      : null;
    element.scrollTop = previousScrollTop;
    return {
      slot: element.getAttribute("data-slot"),
      fullscreenClass: element.classList.contains("wish-details-dialog"),
      position: style.position,
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
      width: rect.width,
      height: rect.height,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      maxWidth: style.maxWidth,
      maxHeight: style.maxHeight,
      overflowY: style.overflowY,
      radii: [
        style.borderTopLeftRadius,
        style.borderTopRightRadius,
        style.borderBottomRightRadius,
        style.borderBottomLeftRadius,
      ].map(Number.parseFloat),
      padding: [style.paddingTop, style.paddingRight, style.paddingBottom, style.paddingLeft].map(Number.parseFloat),
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
      maxScroll,
      reachedScroll,
      close: {
        position: closeStyle?.position || null,
        zIndex: Number.parseFloat(closeStyle?.zIndex || "0"),
        beforeScroll: closeBeforeScroll,
        afterScroll: closeAfterScroll,
        hittable: Boolean(close && (closeHit === close || close.contains(closeHit))),
      },
      rootClientWidth: document.documentElement.clientWidth,
      rootScrollWidth: Math.max(document.documentElement.scrollWidth, document.body?.scrollWidth || 0),
    };
  });
  assert(
    geometry.slot === "dialog-content" && geometry.fullscreenClass && geometry.position === "fixed",
    `${label} is not the local fullscreen shadcn Dialog variant (${JSON.stringify(geometry)})`,
  );
  assert(
    Math.abs(geometry.left) <= 1
      && Math.abs(geometry.top) <= 1
      && Math.abs(geometry.right - geometry.viewportWidth) <= 1
      && Math.abs(geometry.bottom - geometry.viewportHeight) <= 1
      && Math.abs(geometry.width - geometry.viewportWidth) <= 1
      && Math.abs(geometry.height - geometry.viewportHeight) <= 1,
    `${label} leaves a gap around the viewport (${JSON.stringify(geometry)})`,
  );
  assert(
    geometry.maxWidth === "none"
      && geometry.maxHeight === "none"
      && geometry.radii.every((radius) => Math.abs(radius) <= .5),
    `${label} retains a compact width cap or rounded outer corner (${JSON.stringify(geometry)})`,
  );
  assert(
    geometry.padding.every((value) => value === 16)
      && ["auto", "scroll"].includes(geometry.overflowY)
      && geometry.scrollWidth <= geometry.clientWidth + 1
      && geometry.rootScrollWidth <= geometry.rootClientWidth + 1
      && (geometry.maxScroll <= 1 || geometry.reachedScroll >= geometry.maxScroll - 2),
    `${label} content is not safely scrollable inside the edge-to-edge surface (${JSON.stringify(geometry)})`,
  );
  assert(
    geometry.close.position === "fixed"
      && geometry.close.zIndex >= 20
      && geometry.close.beforeScroll
      && geometry.close.afterScroll
      && Math.abs(geometry.close.beforeScroll.left - geometry.close.afterScroll.left) <= 1
      && Math.abs(geometry.close.beforeScroll.top - geometry.close.afterScroll.top) <= 1
      && geometry.close.afterScroll.top >= -1
      && geometry.close.afterScroll.right <= geometry.viewportWidth + 1
      && geometry.close.afterScroll.width >= 47
      && geometry.close.afterScroll.height >= 47
      && geometry.close.hittable,
    `${label} close action does not stay fixed and usable while the modal scrolls (${JSON.stringify(geometry.close)})`,
  );
  await expectLargeAppControls(dialog, `${label} controls`);
}

async function expectEdgeToEdgeProfileEditorGeometry(dialog, label) {
  await dialog.waitFor({ state: "visible" });
  const geometry = await dialog.evaluate(async (element) => {
    await Promise.all(element.getAnimations({ subtree: true }).map((animation) => animation.finished.catch(() => {})));
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    const close = element.querySelector("[data-slot='dialog-close']");
    const closeStyle = close ? getComputedStyle(close) : null;
    const scrollViewport = element.querySelector("[data-slot='scroll-area-viewport']");
    const rectOf = (node) => {
      const bounds = node?.getBoundingClientRect();
      return bounds && { left: bounds.left, top: bounds.top, right: bounds.right, bottom: bounds.bottom, width: bounds.width, height: bounds.height };
    };
    const closeBeforeScroll = rectOf(close);
    const previousScrollTop = scrollViewport?.scrollTop || 0;
    const maxScroll = scrollViewport ? Math.max(0, scrollViewport.scrollHeight - scrollViewport.clientHeight) : 0;
    if (scrollViewport) scrollViewport.scrollTop = scrollViewport.scrollHeight;
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const reachedScroll = scrollViewport?.scrollTop || 0;
    const closeAfterScroll = rectOf(close);
    const closeHit = closeAfterScroll
      ? document.elementFromPoint(closeAfterScroll.left + closeAfterScroll.width / 2, closeAfterScroll.top + closeAfterScroll.height / 2)
      : null;
    if (scrollViewport) scrollViewport.scrollTop = previousScrollTop;
    return {
      slot: element.getAttribute("data-slot"),
      fullscreenClass: element.classList.contains("profile-settings-dialog"),
      position: style.position,
      translate: style.translate,
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
      width: rect.width,
      height: rect.height,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      maxWidth: style.maxWidth,
      maxHeight: style.maxHeight,
      overflowY: style.overflowY,
      radii: [style.borderTopLeftRadius, style.borderTopRightRadius, style.borderBottomRightRadius, style.borderBottomLeftRadius].map(Number.parseFloat),
      padding: [style.paddingTop, style.paddingRight, style.paddingBottom, style.paddingLeft].map(Number.parseFloat),
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
      scroll: scrollViewport ? {
        overflowY: getComputedStyle(scrollViewport).overflowY,
        clientWidth: scrollViewport.clientWidth,
        scrollWidth: scrollViewport.scrollWidth,
        maxScroll,
        reachedScroll,
      } : null,
      close: {
        position: closeStyle?.position || null,
        zIndex: Number.parseFloat(closeStyle?.zIndex || "0"),
        beforeScroll: closeBeforeScroll,
        afterScroll: closeAfterScroll,
        hittable: Boolean(close && (closeHit === close || close.contains(closeHit))),
      },
      rootClientWidth: document.documentElement.clientWidth,
      rootScrollWidth: Math.max(document.documentElement.scrollWidth, document.body?.scrollWidth || 0),
    };
  });
  assert(
    geometry.slot === "dialog-content" && geometry.fullscreenClass && geometry.position === "fixed",
    `${label} is not the local fullscreen profile Dialog variant (${JSON.stringify(geometry)})`,
  );
  assert(
    Math.abs(geometry.left) <= 1
      && Math.abs(geometry.top) <= 1
      && Math.abs(geometry.right - geometry.viewportWidth) <= 1
      && Math.abs(geometry.bottom - geometry.viewportHeight) <= 1
      && Math.abs(geometry.width - geometry.viewportWidth) <= 1
      && Math.abs(geometry.height - geometry.viewportHeight) <= 1,
    `${label} leaves a gap around the viewport (${JSON.stringify(geometry)})`,
  );
  assert(
    geometry.maxWidth === "none"
      && geometry.maxHeight === "none"
      && geometry.translate === "none"
      && geometry.radii.every((radius) => Math.abs(radius) <= .5)
      && geometry.padding.every((value) => value === 16),
    `${label} retains compact Dialog geometry (${JSON.stringify(geometry)})`,
  );
  assert(
    geometry.overflowY === "hidden"
      && geometry.scroll
      && ["auto", "scroll"].includes(geometry.scroll.overflowY)
      && geometry.scroll.scrollWidth <= geometry.scroll.clientWidth + 1
      && (geometry.scroll.maxScroll <= 1 || geometry.scroll.reachedScroll >= geometry.scroll.maxScroll - 2)
      && geometry.scrollWidth <= geometry.clientWidth + 1
      && geometry.rootScrollWidth <= geometry.rootClientWidth + 1,
    `${label} does not keep one safe inner scrolling region (${JSON.stringify(geometry)})`,
  );
  assert(
    geometry.close.position === "fixed"
      && geometry.close.zIndex >= 20
      && geometry.close.beforeScroll
      && geometry.close.afterScroll
      && Math.abs(geometry.close.beforeScroll.left - geometry.close.afterScroll.left) <= 1
      && Math.abs(geometry.close.beforeScroll.top - geometry.close.afterScroll.top) <= 1
      && geometry.close.afterScroll.top >= -1
      && geometry.close.afterScroll.right <= geometry.viewportWidth + 1
      && geometry.close.afterScroll.width >= 47
      && geometry.close.afterScroll.height >= 47
      && geometry.close.hittable,
    `${label} close action does not stay fixed and usable while the profile form scrolls (${JSON.stringify(geometry.close)})`,
  );
  await expectLargeAppControls(dialog, `${label} controls`);
}

async function expectDarkAuthenticatedModal(dialog, label) {
  await dialog.waitFor({ state: "visible" });
  if (await dialog.evaluate((element) => element.classList.contains("wish-details-dialog"))) {
    await expectEdgeToEdgeWishDetailGeometry(dialog, label);
  } else if (await dialog.evaluate((element) => element.classList.contains("profile-settings-dialog"))) {
    await expectEdgeToEdgeProfileEditorGeometry(dialog, label);
  } else {
    await expectCanonicalModalGeometry(dialog, label);
  }
  assert(
    await dialog.locator('.modal-icon, [data-slot="alert-dialog-media"], .modal-heading > svg').count() === 0,
    `${label} still renders a decorative leading icon tile`,
  );
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
      ".link-input input",
      ".recognition-note",
      ".metadata-status",
      ".image-preview > label",
      ".priority-picker",
      ".wish-settings > label",
      ".wish-editor__field",
      "[data-slot='switch']",
      ".wish-editor__list-row",
      ".phone-settings__current",
      ".phone-settings__status",
      ".modal-actions",
      "[data-slot='dialog-footer']",
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
          allowedAccent: node.matches("[data-slot='switch'][role='switch'][aria-checked='true']"),
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
    const scroll = element.querySelector("[data-slot='scroll-area']");
    const scrollViewport = scroll?.querySelector("[data-slot='scroll-area-viewport']");
    const submit = element.querySelector(".wish-editor__submit");
    const close = element.querySelector("[data-slot='dialog-close']");
    const footer = element.querySelector("[data-slot='dialog-footer']");
    const header = element.querySelector("[data-slot='dialog-header']");
    const remove = element.querySelector(".wish-editor__delete");
    const title = element.querySelector("[data-slot='dialog-title']");
    const overlay = document.querySelector("[data-slot='dialog-overlay'][data-open]");
    const titleInput = element.querySelector(".wish-editor__field:not(.wish-editor__field--link):not(.wish-editor__field--description):not(.wish-editor__field--price) > input");
    const linkInput = element.querySelector(".wish-editor__field--link > input");
    const descriptionInput = element.querySelector(".wish-editor__field--description > textarea");
    const priceInput = element.querySelector(".wish-editor__field--price > input[type='number']");
    const currencyTrigger = element.querySelector(".wish-editor__field--price .wish-editor__currency[data-slot='select-trigger']");
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
      overlay: overlay ? {
        classes: overlay.className.split(/\s+/),
        role: overlay.getAttribute("role"),
        visible: getComputedStyle(overlay).visibility !== "hidden" && getComputedStyle(overlay).display !== "none",
      } : null,
      htmlOverflowY: getComputedStyle(document.documentElement).overflowY,
      dialog: {
        ...rectOf(element),
        classes: element.className.split(/\s+/),
        slot: element.getAttribute("data-slot"),
        position: getComputedStyle(element).position,
        borderRadius: Number.parseFloat(getComputedStyle(element).borderTopLeftRadius),
        padding: [
          getComputedStyle(element).paddingTop,
          getComputedStyle(element).paddingRight,
          getComputedStyle(element).paddingBottom,
          getComputedStyle(element).paddingLeft,
        ].map(Number.parseFloat),
      },
      media: rectOf(media),
      emptyUpload,
      panel: rectOf(panel),
      scroll: {
        ...rectOf(scroll),
        clientHeight: scrollViewport.clientHeight,
        clientWidth: scrollViewport.clientWidth,
        scrollHeight: scrollViewport.scrollHeight,
        scrollWidth: scrollViewport.scrollWidth,
        overflowY: getComputedStyle(scrollViewport).overflowY,
      },
      header: rectOf(header),
      footer: rectOf(footer),
      submit: { ...rectOf(submit), position: getComputedStyle(submit).position, hittable: hitContains(submit) },
      close: { ...rectOf(close), position: getComputedStyle(close).position, hittable: hitContains(close) },
      remove: remove ? { ...rectOf(remove), hittable: hitContains(remove) } : null,
      title: title ? { ...rectOf(title), hittable: hitContains(title) } : null,
      fieldCount: element.querySelectorAll(".wish-editor__field").length,
      switchCount: switchRows.length,
      roleSwitchCount: roleSwitches.length,
      switchRowsWithControl: switchRows.filter((row) => row.querySelector(":scope [role='switch']")).length,
      switchSemantics: roleSwitches.map((control) => ({
        ...rectOf(control),
        className: control.className,
        computedWidth: getComputedStyle(control).width,
        flex: getComputedStyle(control).flex,
        flexShrink: getComputedStyle(control).flexShrink,
        slot: control.getAttribute("data-slot"),
        size: control.getAttribute("data-size"),
        legacyClass: control.classList.contains("wish-editor__switch"),
        ariaChecked: control.getAttribute("aria-checked"),
        nativeChecked: control instanceof HTMLInputElement && control.type === "checkbox" ? control.checked : null,
        dataState: control.getAttribute("data-state"),
        dataChecked: control.hasAttribute("data-checked"),
        dataUnchecked: control.hasAttribute("data-unchecked"),
        thumbCount: control.querySelectorAll(":scope > [data-slot='switch-thumb']").length,
        thumb: control.querySelector(":scope > [data-slot='switch-thumb']")
          ? rectOf(control.querySelector(":scope > [data-slot='switch-thumb']"))
          : null,
      })),
      titleCount: element.querySelectorAll("[data-slot='dialog-title']").length,
      uploadCount: element.querySelectorAll("input[type='file'][accept*='image/jpeg']").length,
      legacyCreateCount: element.querySelectorAll(".link-step, .wish-form").length,
      legacyControlCount: element.querySelectorAll(".manual-link, .priority-picker, .wish-settings").length,
      listFieldsetCount: element.querySelectorAll("fieldset.wish-editor__lists").length,
      fieldSurfaces,
      currency: currencyTrigger ? {
        control: rectOf(currencyTrigger),
        role: currencyTrigger.getAttribute("role"),
        slot: currencyTrigger.getAttribute("data-slot"),
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
        currency: Boolean(currencyTrigger)
          && currencyTrigger.tagName === "BUTTON"
          && currencyTrigger.getAttribute("role") === "combobox"
          && currencyTrigger.getAttribute("data-slot") === "select-trigger",
      },
      submitType: submit.type,
      rootWidth: document.documentElement.scrollWidth,
    };
  });

  for (const className of ["fixed", "top-1/2", "left-1/2", "rounded-xl", "bg-popover", "p-4", "max-w-[calc(100%-2rem)]", "sm:max-w-sm"]) {
    assert(geometry.dialog.classes.includes(className), `${label} editor lost the native shadcn ${className} shell class`);
  }
  assert(
    geometry.dialog.slot === "dialog-content"
      && geometry.dialog.position === "fixed"
      && !geometry.dialog.classes.includes("modal")
      && !geometry.dialog.classes.includes("modal--wish-editor")
      && geometry.dialog.borderRadius > 0
      && geometry.dialog.padding.every((value) => value === 16),
    `${label} editor does not use the base shadcn DialogContent shell (${JSON.stringify(geometry.dialog)})`,
  );
  const expectedDialogWidth = geometry.viewport.width >= 640 ? 384 : geometry.viewport.width - 32;
  assert(Math.abs(geometry.dialog.width - expectedDialogWidth) <= 2, `${label} editor does not use the canonical ${expectedDialogWidth}px width (${geometry.dialog.width}px)`);
  assert(
    Math.abs((geometry.dialog.left + geometry.dialog.right) / 2 - geometry.viewport.width / 2) <= 2
      && geometry.dialog.top >= 15
      && geometry.dialog.left >= 15
      && geometry.dialog.right <= geometry.viewport.width - 15
      && geometry.dialog.bottom <= geometry.viewport.height - 15,
    `${label} native editor escapes the viewport (${JSON.stringify(geometry.dialog)})`,
  );
  assert(
    geometry.overlay?.visible
      && geometry.overlay.role === "presentation"
      && ["fixed", "inset-0", "bg-black/10", "supports-backdrop-filter:backdrop-blur-xs"].every((className) => geometry.overlay.classes.includes(className))
      && !geometry.overlay.classes.includes("modal-backdrop")
      && !geometry.overlay.classes.includes("!bg-transparent"),
    `${label} editor does not use the native shadcn overlay (${JSON.stringify(geometry.overlay)})`,
  );
  assert(geometry.htmlOverflowY === "hidden", `${label} editor did not lock page scrolling`);
  assert(
    geometry.header.bottom <= geometry.scroll.top + 1
      && geometry.scroll.bottom <= geometry.footer.top + 1
      && geometry.scroll.scrollWidth <= geometry.scroll.clientWidth + 1,
    `${label} editor header, scroll area and footer overlap or overflow (${JSON.stringify({ header: geometry.header, scroll: geometry.scroll, footer: geometry.footer })})`,
  );
  assert(geometry.submit.position === "static" && geometry.submit.top >= geometry.footer.top - 1 && geometry.submit.bottom <= geometry.footer.bottom + 1, `${label} submit action is not in the native DialogFooter`);
  assert(geometry.close.position === "absolute", `${label} editor close action is not the native DialogContent close`);
  assert(await dialog.locator("[data-slot='dialog-header']").count() === 1, `${label} editor is missing DialogHeader`);
  assert(await dialog.locator("[data-slot='dialog-description']").count() === 1, `${label} editor is missing DialogDescription`);
  assert(await dialog.locator("[data-slot='dialog-footer']").count() === 1, `${label} editor is missing DialogFooter`);
  assert(await dialog.getByRole("button", { name: "Close", exact: true }).getAttribute("data-slot") === "dialog-close", `${label} editor close action is not the official DialogClose`);

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
      && (expectedSlot === "textarea"
        ? control.height >= 95
        : control.height >= 47 && control.height <= 49)),
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
      && geometry.currency.role === "combobox"
      && geometry.currency.slot === "select-trigger"
      && Math.abs(geometry.currency.control.right - geometry.fieldSurfaces.find(({ name }) => name === "price").wrapper.right) <= 1
      && Math.abs(geometry.currency.control.bottom - geometry.fieldSurfaces.find(({ name }) => name === "price").wrapper.bottom) <= 1
      && geometry.currency.control.height >= 47
      && geometry.currency.control.height <= 49,
    `${label} currency control is not aligned beside price (${JSON.stringify({ currency: geometry.currency, price: geometry.fieldSurfaces.find(({ name }) => name === "price") })})`,
  );
  assert(geometry.switchCount === 2, `${label} should expose the two reference switch rows`);
  const switches = dialog.locator(".wish-editor__switch-row").getByRole("switch");
  assert(await switches.count() === 2, `${label} should expose exactly two setting role=switch controls`);
  assert(
    await dialog.locator(".wish-editor__switch-row strong > i, .wish-editor__switch-row [title]").count() === 0,
    `${label} still renders the removed question-mark help icons`,
  );
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
  assert(
    geometry.switchSemantics.every((control) => control.slot === "switch"
      && control.size === "default"
      && !control.legacyClass
      && control.width >= 43 && control.width <= 45
      && control.height >= 23 && control.height <= 25
      && control.thumbCount === 1
      && control.thumb
      && control.thumb.width >= 19 && control.thumb.width <= 21
      && control.thumb.height >= 19 && control.thumb.height <= 21
      && control.dataChecked !== control.dataUnchecked),
    `${label} setting toggles do not use the app-level 44x24 Large Switch geometry (${JSON.stringify(geometry.switchSemantics)})`,
  );
  for (const name of ["Секретное желание", "Многократное бронирование"]) {
    assert(await dialog.getByRole("switch", { name, exact: true }).count() === 1, `${label} does not expose the accessible “${name}” switch`);
  }
  assert(Object.values(geometry.supportedFields).every(Boolean), `${label} does not expose the supported title/link/description/price/currency fields`);
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
  assert(geometry.listRows.every((row) => row.row.height >= 48), `${label} list choices are smaller than the Large control target`);
  assert(geometry.listRows.every((row) => row.listSwitch && row.title), `${label} list choices are missing a switch or title`);
  assert(
    geometry.listRows.every((row) => (
      Math.abs((row.listSwitch.top + row.listSwitch.height / 2) - (row.row.top + row.row.height / 2)) <= 1
      && row.listSwitch.width >= 43
      && row.listSwitch.width <= 45
      && row.listSwitch.height >= 23
      && row.listSwitch.height <= 25
      && row.title.right < row.listSwitch.left
      && row.listSwitch.right <= row.row.right + 1
      && row.title.width > 0
    )),
    `${label} list choices are misaligned or overflow their rows`,
  );
  const firstListRow = dialog.locator(".wish-editor__list-row").first();
  const listRowBackground = await firstListRow.evaluate((element) => getComputedStyle(element).backgroundColor);
  await firstListRow.hover();
  await firstListRow.evaluate(() => new Promise((resolve) => window.setTimeout(resolve, 200)));
  const hoveredListRowBackground = await firstListRow.evaluate((element) => getComputedStyle(element).backgroundColor);
  assert(hoveredListRowBackground === listRowBackground, `${label} list choice adds a background on hover`);
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
  } else {
    assert(geometry.remove?.hittable, `${label} delete action is covered`);
    assert(geometry.titleCount === 1, `${label} edit dialog is missing its DialogTitle`);
  }
  assert(geometry.rootWidth <= geometry.viewport.width + 1, `${label} has horizontal overflow`);
  assert(geometry.media.top < geometry.panel.top, `${label} does not stack media above fields`);
  assert(Math.abs(geometry.media.left - geometry.panel.left) <= 1 && Math.abs(geometry.media.right - geometry.panel.right) <= 1, `${label} editor sections are not aligned`);
  assert(Math.abs((geometry.media.width / geometry.media.height) - (4 / 3)) <= .03, `${label} media does not use the canonical 4:3 dialog ratio`);
  assert(["auto", "scroll"].includes(geometry.scroll.overflowY), `${label} shadcn ScrollArea is not vertically scrollable`);
}

async function expectProfileEditorForm(page, label, { mobile = false } = {}) {
  const originalUrl = new URL(page.url());
  const profileButton = await expectMainUserProfile(page, label);
  await profileButton.waitFor({ state: "visible" });
  await profileButton.locator('[data-slot="avatar"]').click();

  const dialog = page.getByRole("dialog", { name: "Изменить профиль", exact: true });
  await dialog.waitFor({ state: "visible" });
  await dialog.getByRole("heading", { name: "Изменить профиль", exact: true }).waitFor();
  await dialog.evaluate(async (element) => {
    await Promise.all(element.getAnimations({ subtree: true }).map((animation) => animation.finished.catch(() => {})));
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
  const openedUrl = new URL(page.url());
  assert(
    openedUrl.pathname === originalUrl.pathname && openedUrl.search === originalUrl.search && openedUrl.hash === originalUrl.hash,
    `${label} profile editor navigated away from its source page`,
  );
  assert(await page.locator(".settings-page").count() === 0, `${label} mounted the retired settings page`);
  await expectDarkAuthenticatedModal(dialog, `${label} profile editor`);

  const name = dialog.getByLabel("Имя", { exact: true });
  const username = dialog.getByLabel("Адрес профиля", { exact: true });
  const bio = dialog.locator("textarea").first();
  const birthday = dialog.getByLabel("День рождения", { exact: true });
  const avatarUpload = dialog.getByLabel("Загрузить фото профиля", { exact: true });
  for (const [fieldLabel, field] of [
    ["name", name],
    ["username", username],
    ["bio", bio],
    ["birthday", birthday],
    ["avatar upload", avatarUpload],
  ]) {
    assert(await field.count() === 1, `${label} profile editor is missing the supported ${fieldLabel} field`);
  }
  assert(await dialog.locator("#settings-profile-avatar-url").count() === 0, `${label} profile editor still exposes the retired avatar URL control`);
  assert(await dialog.getByText("Ссылка на фото", { exact: true }).count() === 0, `${label} profile editor still exposes the retired avatar URL label`);
  if (mobile) {
    await page.waitForFunction(() => {
      const editor = document.querySelector('[data-slot="dialog-content"][data-open]');
      return editor?.contains(document.activeElement) && !document.activeElement.matches("input, textarea, select");
    });
  } else {
    await waitForFocused(page, name, `${label} profile editor name field`);
  }
  assert(await dialog.locator("input:not([type='file'])").count() === 3, `${label} profile editor exposes unsupported text inputs`);
  assert(await dialog.locator("textarea").count() === 1, `${label} profile editor exposes unsupported textareas`);
  assert(await dialog.locator("select").count() === 0, `${label} profile editor exposes an unsupported select`);
  assert(await dialog.locator("input[type='email'], input[type='password']").count() === 0, `${label} profile editor exposes an unsupported account field`);
  assert(await dialog.getByRole("switch").count() === 0, `${label} profile editor exposes a privacy switch unsupported by /api/me`);
  assert(await dialog.locator("input[type='checkbox'], input[type='radio'], .settings-switch").count() === 0, `${label} profile editor exposes a fake toggle`);
  assert(await avatarUpload.getAttribute("accept") === "image/jpeg,image/png,image/webp", `${label} profile editor accepts unsupported avatar formats`);
  assert(await username.getAttribute("pattern") === "[a-z0-9-]{3,32}", `${label} profile editor lost the username constraint`);
  assert(
    await birthday.evaluate((input) => input.max === new Date().toISOString().slice(0, 10)),
    `${label} profile editor allows a future birthday`,
  );

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
    const group = element.querySelector("[data-slot='input-group']");
    const control = group?.querySelector(":scope > [data-slot='input-group-control']");
    const addon = group?.querySelector(":scope > [data-slot='input-group-addon']");
    const field = group?.closest("[data-slot='field']");
    const nameInput = element.querySelector("#settings-profile-name");
    if (!group || !control || !addon || !field || !nameInput) return null;
    const groupStyle = getComputedStyle(group);
    const controlStyle = getComputedStyle(control);
    const addonStyle = getComputedStyle(addon);
    return {
      group: { ...rectOf(group), role: group.getAttribute("role"), clientWidth: group.clientWidth, scrollWidth: group.scrollWidth, background: groupStyle.backgroundColor, borderWidth: Number.parseFloat(groupStyle.borderLeftWidth) },
      control: { ...rectOf(control), slot: control.getAttribute("data-slot"), focused: document.activeElement === control, clientWidth: control.clientWidth, scrollWidth: control.scrollWidth, background: controlStyle.backgroundColor, borderWidth: Number.parseFloat(controlStyle.borderLeftWidth) },
      addon: { ...rectOf(addon), slot: addon.getAttribute("data-slot"), align: addon.getAttribute("data-align"), background: addonStyle.backgroundColor, borderWidth: Number.parseFloat(addonStyle.borderLeftWidth) },
      field: rectOf(field),
      name: rectOf(nameInput),
      nestedCardCount: group.querySelectorAll("[data-slot='card']").length,
    };
  });
  const transparentSurface = (value) => ["transparent", "rgba(0, 0, 0, 0)"].includes(value);
  assert(addressGeometry, `${label} profile address group geometry is unavailable`);
  assert(
    addressGeometry.group.role === "group"
      && !transparentSurface(addressGeometry.group.background)
      && addressGeometry.group.borderWidth >= 1
      && addressGeometry.group.height >= 47
      && addressGeometry.group.height <= 49,
    `${label} InputGroup does not own the profile-address surface (${JSON.stringify(addressGeometry)})`,
  );
  assert(
    addressGeometry.control.focused
      && addressGeometry.control.slot === "input-group-control"
      && transparentSurface(addressGeometry.control.background)
      && addressGeometry.control.borderWidth === 0,
    `${label} profile-address control renders a second focused surface`,
  );
  assert(
    addressGeometry.addon.slot === "input-group-addon"
      && addressGeometry.addon.align === "inline-start"
      && transparentSurface(addressGeometry.addon.background)
      && addressGeometry.addon.borderWidth === 0
      && addressGeometry.nestedCardCount === 0,
    `${label} profile-address addon renders nested chrome`,
  );
  assert(
    Math.abs(addressGeometry.group.left - addressGeometry.field.left) <= 1
      && Math.abs(addressGeometry.group.right - addressGeometry.field.right) <= 1
      && addressGeometry.addon.left >= addressGeometry.group.left - 1
      && addressGeometry.addon.right <= addressGeometry.control.left + 1
      && addressGeometry.control.right <= addressGeometry.group.right + 1,
    `${label} profile-address parts are misaligned`,
  );
  assert(
    addressGeometry.group.scrollWidth <= addressGeometry.group.clientWidth + 1
      && addressGeometry.control.scrollWidth <= addressGeometry.control.clientWidth + 1,
    `${label} profile-address value overflows`,
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

  const save = dialog.getByRole("button", { name: "Сохранить", exact: true });
  assert(await save.isDisabled(), `${label} profile save should be disabled before a supported field changes`);
  const initialName = await name.inputValue();
  await name.fill(`${initialName} ·`);
  assert(await save.isEnabled(), `${label} profile save did not enable for a dirty supported field`);
  await name.fill(initialName);
  assert(await save.isDisabled(), `${label} profile save did not disable after restoring the initial value`);

  const logoutButton = dialog.getByRole("button", { name: "Выйти из аккаунта", exact: true });
  assert(await logoutButton.count() === 1, `${label} profile editor is missing the account logout action`);
  const logoutGeometry = await logoutButton.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const sectionRect = element.parentElement?.getBoundingClientRect();
    const iconRect = element.querySelector(":scope > svg")?.getBoundingClientRect();
    return {
      tagName: element.tagName,
      type: element.type,
      slot: element.dataset.slot,
      height: rect.height,
      width: rect.width,
      left: rect.left,
      right: rect.right,
      sectionLeft: sectionRect?.left,
      sectionRight: sectionRect?.right,
      sectionWidth: sectionRect?.width,
      icon: iconRect ? { width: iconRect.width, height: iconRect.height } : null,
    };
  });
  assert(
    logoutGeometry.tagName === "BUTTON" && logoutGeometry.type === "button" && logoutGeometry.slot === "button",
    `${label} logout is not a native shadcn Button`,
  );
  assert(
    logoutGeometry.height >= 47
      && Math.abs(logoutGeometry.left - logoutGeometry.sectionLeft) <= 1
      && logoutGeometry.right < logoutGeometry.sectionRight - 8
      && logoutGeometry.width < logoutGeometry.sectionWidth - 8
      && logoutGeometry.icon
      && Math.abs(logoutGeometry.icon.width - 20) <= 1
      && Math.abs(logoutGeometry.icon.height - 20) <= 1,
    `${label} profile logout action is not a left-aligned Large button with the expected scale (${JSON.stringify(logoutGeometry)})`,
  );

  await waitForStableLayout(page);
  const modalGeometry = await dialog.evaluate((element) => {
    const rectOf = (node) => {
      const rect = node?.getBoundingClientRect();
      return rect && { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height };
    };
    const rect = rectOf(element);
    const style = getComputedStyle(element);
    const header = element.querySelector("[data-slot='dialog-header']");
    const scroll = element.querySelector("[data-slot='scroll-area']");
    const scrollViewport = scroll?.querySelector("[data-slot='scroll-area-viewport']");
    const footer = element.querySelector("[data-slot='dialog-footer']");
    const close = element.querySelector("[data-slot='dialog-close']");
    const cancel = [...element.querySelectorAll("[data-slot='dialog-footer'] button")].find((button) => button.textContent.trim() === "Отмена");
    const submit = [...element.querySelectorAll("[data-slot='dialog-footer'] button")].find((button) => button.textContent.trim() === "Сохранить");
    const overlay = document.querySelector("[data-slot='dialog-overlay'][data-open]");
    const hitContains = (node) => {
      const bounds = node.getBoundingClientRect();
      const hit = document.elementFromPoint(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2);
      return hit === node || node.contains(hit);
    };
    return {
      ...rect,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      scrollWidth: element.scrollWidth,
      clientWidth: element.clientWidth,
      slot: element.dataset.slot,
      classes: [...element.classList],
      position: style.position,
      maxWidth: style.maxWidth,
      maxHeight: style.maxHeight,
      overflowY: style.overflowY,
      radii: [style.borderTopLeftRadius, style.borderTopRightRadius, style.borderBottomRightRadius, style.borderBottomLeftRadius].map(Number.parseFloat),
      padding: [style.paddingTop, style.paddingRight, style.paddingBottom, style.paddingLeft].map(Number.parseFloat),
      header: rectOf(header),
      scroll: scroll && scrollViewport ? {
        ...rectOf(scroll),
        clientWidth: scrollViewport.clientWidth,
        scrollWidth: scrollViewport.scrollWidth,
        clientHeight: scrollViewport.clientHeight,
        scrollHeight: scrollViewport.scrollHeight,
        overflowY: getComputedStyle(scrollViewport).overflowY,
      } : null,
      footer: rectOf(footer),
      close: close ? { ...rectOf(close), hittable: hitContains(close) } : null,
      cancel: cancel ? { ...rectOf(cancel), type: cancel.type, slot: cancel.dataset.slot, hittable: hitContains(cancel) } : null,
      submit: submit ? { ...rectOf(submit), type: submit.type, slot: submit.dataset.slot, form: submit.getAttribute("form"), hittable: hitContains(submit) } : null,
      overlay: overlay ? { classes: [...overlay.classList], visible: overlay.checkVisibility() } : null,
      legacyCount: element.querySelectorAll(".modal, .modal-heading, .modal-actions, .settings-editor").length,
    };
  });
  const expectedRailWidth = Math.min(448, modalGeometry.viewportWidth - 32);
  for (const className of ["fixed", "top-0", "left-0", "profile-settings-dialog", "h-dvh", "max-h-none", "w-screen", "max-w-none", "translate-x-0", "translate-y-0", "overflow-hidden", "rounded-none", "bg-popover", "p-4", "sm:max-w-none"]) {
    assert(modalGeometry.classes.includes(className), `${label} profile editor lost the fullscreen ${className} shell class`);
  }
  assert(
    modalGeometry.slot === "dialog-content"
      && modalGeometry.position === "fixed"
      && modalGeometry.legacyCount === 0
      && modalGeometry.maxWidth === "none"
      && modalGeometry.maxHeight === "none"
      && modalGeometry.overflowY === "hidden"
      && modalGeometry.radii.every((radius) => Math.abs(radius) <= .5)
      && modalGeometry.padding.every((value) => value === 16),
    `${label} profile editor does not use the local edge-to-edge shadcn DialogContent shell`,
  );
  assert(
    Math.abs(modalGeometry.left) <= 1
      && Math.abs(modalGeometry.top) <= 1
      && Math.abs(modalGeometry.right - modalGeometry.viewportWidth) <= 1
      && Math.abs(modalGeometry.bottom - modalGeometry.viewportHeight) <= 1
      && Math.abs(modalGeometry.width - modalGeometry.viewportWidth) <= 1
      && Math.abs(modalGeometry.height - modalGeometry.viewportHeight) <= 1,
    `${label} profile editor leaves a gap around the viewport`,
  );
  assert(modalGeometry.scrollWidth <= modalGeometry.clientWidth + 1, `${label} profile editor has horizontal overflow`);
  assert(
    modalGeometry.header && modalGeometry.scroll && modalGeometry.footer
      && Math.abs(modalGeometry.header.width - expectedRailWidth) <= 2
      && Math.abs(modalGeometry.scroll.width - expectedRailWidth) <= 2
      && Math.abs(modalGeometry.footer.width - expectedRailWidth) <= 2
      && Math.abs(modalGeometry.header.left - modalGeometry.scroll.left) <= 1
      && Math.abs(modalGeometry.header.right - modalGeometry.scroll.right) <= 1
      && Math.abs(modalGeometry.scroll.left - modalGeometry.footer.left) <= 1
      && Math.abs(modalGeometry.scroll.right - modalGeometry.footer.right) <= 1
      && Math.abs((modalGeometry.header.left + modalGeometry.header.right) / 2 - modalGeometry.viewportWidth / 2) <= 1
      && modalGeometry.header.bottom <= modalGeometry.scroll.top + 1
      && modalGeometry.scroll.bottom <= modalGeometry.footer.top + 1
      && ["auto", "scroll"].includes(modalGeometry.scroll.overflowY)
      && modalGeometry.scroll.scrollWidth <= modalGeometry.scroll.clientWidth + 1,
    `${label} profile editor does not keep one centered 448px rail with a scrollable body`,
  );
  assert(modalGeometry.overlay?.visible && modalGeometry.overlay.classes.includes("fixed") && modalGeometry.overlay.classes.includes("inset-0") && !modalGeometry.overlay.classes.includes("modal-backdrop"), `${label} profile editor does not use the native shadcn overlay`);
  assert(modalGeometry.close?.width >= 47 && modalGeometry.close?.height >= 47 && modalGeometry.close?.hittable, `${label} native close action is smaller than 48px or covered`);
  assert(modalGeometry.cancel?.type === "button" && modalGeometry.cancel?.slot === "button" && modalGeometry.cancel?.hittable, `${label} cancel is not a native footer button`);
  assert(modalGeometry.submit?.type === "submit" && modalGeometry.submit?.slot === "button" && modalGeometry.submit?.form === "profile-editor-form" && modalGeometry.submit?.height >= 47, `${label} save is not the 48px native form submit in DialogFooter`);
  assert(await dialog.locator("[data-slot='dialog-header']").count() === 1, `${label} profile editor is missing DialogHeader`);
  assert(await dialog.locator("[data-slot='dialog-title']").count() === 1, `${label} profile editor is missing DialogTitle`);
  assert(await dialog.locator("[data-slot='dialog-description']").count() === 1, `${label} profile editor is missing DialogDescription`);
  assert(await dialog.locator("[data-slot='dialog-footer']").count() === 1, `${label} profile editor is missing DialogFooter`);
  await expectNoRootOverflow(page, `${label} profile editor`);

  await dialog.getByRole("button", { name: "Отмена", exact: true }).click();
  await dialog.waitFor({ state: "detached" });
  const closedUrl = new URL(page.url());
  assert(
    closedUrl.pathname === originalUrl.pathname && closedUrl.search === originalUrl.search && closedUrl.hash === originalUrl.hash,
    `${label} closing the profile editor changed its source route`,
  );
  await waitForFocused(page, profileButton, `${label} profile button after editor close`);
}
async function waitForAppRoute(page, pathname) {
  await page.goto(`${baseUrl}${pathname}`, { waitUntil: "domcontentloaded" });
  await page.locator(".app-page").waitFor({ state: "visible" });
  await page.waitForURL((url) => url.pathname === pathname);
}

async function expectRetiredSettingsRedirect(page, label) {
  for (const pathname of ["/app/settings", "/app/settings?edit=profile"]) {
    await page.goto(`${baseUrl}${pathname}`, { waitUntil: "domcontentloaded" });
    await page.waitForURL((url) => url.pathname === "/app/wishes" && url.search === "");
    await page.locator(".wishes-page").waitFor({ state: "visible" });
    assert(await page.locator(".settings-page").count() === 0, `${label} ${pathname} still renders a standalone settings page`);
    assert(
      await page.getByRole("dialog", { name: "Изменить профиль", exact: true }).count() === 0,
      `${label} ${pathname} auto-opens an editor that should only open from the avatar`,
    );
    assert(await page.locator('a[href^="/app/settings"]').count() === 0, `${label} ${pathname} leaves an internal settings link behind`);
  }
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
  assert(
    await page.locator('.wishes-page__friend-links, nav[aria-label="Связи профиля"]').count() === 0,
    `${label} duplicates the wishes-page friend shortcuts inside the Friends section`,
  );
  const links = navigation.getByRole("link");
  assert(await links.count() === 3, `${label} should expose three friend-section links`);
  for (const tab of Object.keys(friendsRoutes)) {
    const tabControl = navigation.getByRole("link", { name: friendsLabels[tab], exact: true });
    assert(await tabControl.evaluate((element) => element.tagName === "A"), `${label} ${friendsLabels[tab]} is not a native link`);
    assert(await tabControl.evaluate((element) => element.classList.contains("group/button")), `${label} ${friendsLabels[tab]} is not styled with buttonVariants`);
    assert(new URL(await tabControl.getAttribute("href"), baseUrl).pathname === friendsRoutes[tab], `${label} ${friendsLabels[tab]} points to the wrong route`);
    assert(
      await tabControl.getAttribute("aria-current") === (tab === activeTab ? "page" : null),
      `${label} exposes the wrong current state for ${friendsLabels[tab]}`,
    );
  }
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
    const profileNode = rowNode?.querySelector(":scope > .friend-row__profile");
    const avatarNode = profileNode?.querySelector(":scope > .avatar");
    const identityNode = profileNode?.querySelector(":scope > .friend-row__identity");
    const nameNode = identityNode?.querySelector(":scope > strong");
    const profileRect = profileNode?.getBoundingClientRect();
    const avatarRect = avatarNode?.getBoundingClientRect();
    const identityRect = identityNode?.getBoundingClientRect();
    const nameRect = nameNode?.getBoundingClientRect();
    const profileStyle = profileNode ? getComputedStyle(profileNode) : null;
    const linkRects = [...(navigationNode?.querySelectorAll(":scope > a") || [])].map((control) => {
      const rect = control.getBoundingClientRect();
      return { width: rect.width, height: rect.height };
    });
    return {
      viewportWidth: document.documentElement.clientWidth,
      navigation: navigationRect && { left: navigationRect.left, right: navigationRect.right, top: navigationRect.top, bottom: navigationRect.bottom, width: navigationRect.width },
      row: rowRect && { left: rowRect.left, right: rowRect.right, top: rowRect.top, width: rowRect.width },
      profile: profileRect && { left: profileRect.left, top: profileRect.top, right: profileRect.right, bottom: profileRect.bottom, width: profileRect.width, height: profileRect.height },
      avatar: avatarRect && { left: avatarRect.left, top: avatarRect.top, right: avatarRect.right, bottom: avatarRect.bottom, width: avatarRect.width, height: avatarRect.height, hidden: avatarNode.getAttribute("aria-hidden") },
      identity: identityRect && { left: identityRect.left, top: identityRect.top, right: identityRect.right, bottom: identityRect.bottom, width: identityRect.width, height: identityRect.height },
      name: nameRect && { left: nameRect.left, right: nameRect.right, width: nameRect.width },
      profileGap: profileStyle ? Number.parseFloat(profileStyle.columnGap) : null,
      linkRects,
    };
  }, ".friends-section-nav");
  assert(geometry.navigation && geometry.row, `${label} is missing its friend navigation or list geometry`);
  assert(geometry.profile && geometry.avatar && geometry.identity && geometry.name, `${label} is missing its friend profile geometry`);
  assert(geometry.linkRects.length === 3, `${label} is missing friend-section navigation targets`);
  assert(geometry.row.right <= geometry.viewportWidth + 1, `${label} friend rows extend beyond the viewport`);
  assert(geometry.navigation.bottom <= geometry.row.top + 1, `${label} friend navigation should sit above the list`);
  assert(Math.abs(geometry.avatar.width - 48) <= 1 && Math.abs(geometry.avatar.height - 48) <= 1, `${label} friend avatar is not 48px (${JSON.stringify(geometry.avatar)})`);
  assert(Math.abs(geometry.identity.left - geometry.avatar.right - 12) <= 1 && Math.abs(geometry.profileGap - 12) <= 1, `${label} avatar and name do not use the compact 12px gap`);
  assert(Math.abs((geometry.avatar.top + geometry.avatar.bottom) / 2 - (geometry.identity.top + geometry.identity.bottom) / 2) <= 1, `${label} avatar and identity are not vertically centered`);
  assert(geometry.profile.left <= geometry.avatar.left + 1 && geometry.profile.right >= geometry.identity.right - 1 && geometry.profile.height >= 48, `${label} profile link does not enclose the avatar and identity`);
  assert(geometry.name.left >= geometry.identity.left - 1 && geometry.name.right <= geometry.identity.right + 1, `${label} friend name escapes its identity column`);
  assert(geometry.avatar.hidden === "true", `${label} decorative avatar pollutes the profile link accessible name`);
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
    assert(geometry.linkRects.every((rect) => rect.height >= 47), `${label} mobile friend navigation has controls below the 48px Large size`);
    const pageHeight = await page.evaluate(() => ({ viewport: window.innerHeight, document: document.documentElement.scrollHeight }));
    assert(pageHeight.document <= pageHeight.viewport + 1, `${label} adds empty mobile scrolling (${pageHeight.document}px document inside ${pageHeight.viewport}px viewport)`);
  } else {
    assert(geometry.navigation.left >= geometry.row.left - 1, `${label} desktop friend navigation is not aligned with the directory`);
    assert(
      geometry.linkRects.every((rect) => rect.height >= 47),
      `${label} desktop friend navigation has undersized targets (${JSON.stringify(geometry.linkRects)})`,
    );
    const topbar = page.locator(".friends-topbar");
    await topbar.waitFor({ state: "visible" });
    assert(await topbar.locator(".app-friends-link").count() === 0, `${label} still renders the duplicate Friends action in the upper header`);
    assert(await topbar.locator(".friends-topbar__dock, .friends-topbar__search").count() === 0, `${label} still renders the retired floating navigation dock`);
    assert(await topbar.locator(".app-wishes-link").count() === 0, `${label} still renders the retired floating wishes shortcut`);
      assert(await topbar.getByRole("link", { name: "Найти друзей", exact: true }).count() === 0, `${label} still renders the retired floating search shortcut`);
  }
  await expectLargeAppControls(page.locator(".friends-page"), `${label} app controls`);
}

async function expectWideFriendsLayout(page, label) {
  try {
    const viewports = [
      { width: 390, height: 844 },
      { width: 820, height: 1000 },
      { width: 1024, height: 1000 },
      { width: 1440, height: 1000 },
      { width: 1912, height: 991 },
    ];
    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      await page.goto(`${baseUrl}/app/wishes`, { waitUntil: "domcontentloaded" });
      const wishesPage = page.locator(".app-page.wishes-page");
      await wishesPage.waitFor({ state: "visible" });
      const wishesRail = await wishesPage.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        const left = rect.left + parseFloat(style.borderLeftWidth) + parseFloat(style.paddingLeft);
        const right = rect.right - parseFloat(style.borderRightWidth) - parseFloat(style.paddingRight);
        return { left, right, width: right - left };
      });

      await page.goto(`${baseUrl}${friendsRoutes.subscriptions}`, { waitUntil: "domcontentloaded" });
      await page.locator(".friends-page").waitFor({ state: "visible" });
      await friendRow(page, "max").waitFor({ state: "visible" });
      const directoryGeometry = await page.evaluate(() => {
        const selectors = [".friends-directory", ".friends-directory__heading", ".friends-section-nav", ".friends-search", ".friends-list", ".friend-row"];
        const entries = Object.fromEntries(selectors.map((selector) => {
          const element = document.querySelector(selector);
          const rect = element?.getBoundingClientRect();
          return [selector, rect && { left: rect.left, right: rect.right, width: rect.width }];
        }));
        return { viewportWidth: document.documentElement.clientWidth, entries };
      });
      const viewportLabel = `${label} at ${viewport.width}px`;
      const directoryRect = directoryGeometry.entries[".friends-directory"];
      assert(directoryRect, `${viewportLabel} is missing its directory container`);
      assert(Math.abs(directoryRect.left - wishesRail.left) <= 1, `${viewportLabel} directory left edge differs from Wishes (${directoryRect.left}px vs ${wishesRail.left}px)`);
      assert(Math.abs(directoryRect.right - wishesRail.right) <= 1, `${viewportLabel} directory right edge differs from Wishes (${directoryRect.right}px vs ${wishesRail.right}px)`);
      assert(Math.abs(directoryRect.width - wishesRail.width) <= 1, `${viewportLabel} directory width differs from Wishes (${directoryRect.width}px vs ${wishesRail.width}px)`);
      assert(Math.abs(directoryRect.left - (directoryGeometry.viewportWidth - directoryRect.right)) <= 2, `${viewportLabel} directory is not centered in the viewport`);
      for (const selector of [".friends-directory__heading", ".friends-section-nav", ".friends-search", ".friends-list", ".friend-row"]) {
        const rect = directoryGeometry.entries[selector];
        assert(rect, `${viewportLabel} is missing ${selector} geometry`);
        assert(Math.abs(rect.left - directoryRect.left) <= 1 && Math.abs(rect.right - directoryRect.right) <= 1, `${viewportLabel} ${selector} is not aligned to the shared rail`);
      }
      await expectNoRootOverflow(page, viewportLabel);
    }
    await expectFriendsLayout(page, label, { mobile: false });
    await page.screenshot({ path: "/tmp/rollapp-wide-friends-1912.png", fullPage: true });
  } finally {
    await page.setViewportSize({ width: 1440, height: 1000 });
  }
}

async function expectFriendsMenus(page, label, { mobile = false } = {}) {
  const rowTrigger = friendRow(page, "max").getByRole("button", { name: "Действия для Макс Ветров", exact: true });
  await rowTrigger.click();
  const rowPopover = page.locator(".friend-row__menu");
  await rowPopover.waitFor({ state: "visible" });
  assert(await rowPopover.getAttribute("role") === "menu", `${label} row popup does not expose role=menu`);
  assert(await rowPopover.getAttribute("data-slot") === "dropdown-menu-content", `${label} row popup is not official DropdownMenu content`);
  assert(await rowTrigger.getAttribute("aria-controls") === await rowPopover.getAttribute("id"), `${label} row popup is not linked to its trigger`);
  assert(await rowPopover.getByRole("menuitem").count() === 2, `${label} row popup should expose two menu items`);
  await expectLargeAppControls(rowPopover, `${label} row menu controls`);
  await page.keyboard.press("Escape");
  await rowPopover.waitFor({ state: "detached" });
  assert(await rowTrigger.evaluate((element) => document.activeElement === element), `${label} row popover does not restore trigger focus after Escape`);

  const profileButton = await expectMainUserProfile(page, `${label} friends profile action`);
  assert(await page.getByRole("button", { name: "Открыть меню аккаунта", exact: true }).count() === 0, `${label} still exposes the retired account menu`);
  assert(await page.locator(".friends-topbar__panel").count() === 0, `${label} still renders the retired account popup`);
  const originalUrl = new URL(page.url());
  await profileButton.locator('[data-slot="avatar"]').click();
  const dialog = page.getByRole("dialog", { name: "Изменить профиль", exact: true });
  await dialog.waitFor({ state: "visible" });
  if (mobile) {
    await page.waitForFunction(() => {
      const editor = document.querySelector('[data-slot="dialog-content"][data-open]');
      return editor?.contains(document.activeElement) && !document.activeElement.matches("input, textarea, select");
    });
  } else {
    await waitForFocused(page, dialog.getByLabel("Имя", { exact: true }), `${label} friends profile editor name field`);
  }
  const openedUrl = new URL(page.url());
  assert(
    openedUrl.pathname === originalUrl.pathname && openedUrl.search === originalUrl.search && openedUrl.hash === originalUrl.hash,
    `${label} friends profile editor changed the active friends route`,
  );
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "detached" });
  await waitForFocused(page, profileButton, `${label} friends profile button after Escape`);
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
    await expectFriendsMenus(page, label, { mobile });
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

async function expectInAppFriendProfile(page, label, { mobile }) {
  await page.goto(`${baseUrl}/max`, { waitUntil: "domcontentloaded" });
  await page.waitForURL((url) => url.pathname === "/max");

  const profilePage = page.locator(".friend-profile-page");
  const topbar = profilePage.locator(":scope > .wishes-page__topbar");
  const hero = profilePage.locator(":scope > .wishes-page__hero[data-friend-profile]");
  await profilePage.waitFor({ state: "visible" });
  await topbar.waitFor({ state: "visible" });
  await hero.waitFor({ state: "visible" });

  assert(
    await page.locator(".app-layout.app-layout--friends").count() === 1,
    `${label} is not rendered inside the friends AppShell`,
  );
  assert(
    await page.locator(".app-main .friend-profile-page").count() === 1,
    `${label} profile content is not contained by the main application surface`,
  );
  await expectSidebarRemoved(page, label);
  assert(
    await page.locator(".public-profile, .profile-header, .profile-guest-rail, .profile-list-rail, .profile-header__dock, .profile-mobile-menu").count() === 0,
    `${label} still mounts the retired standalone profile shell`,
  );
  assert(
    await profilePage.locator(".friend-profile-summary, .friends-topbar, .mobile-app-head, [data-slot='badge'], .profile-handle").count() === 0,
    `${label} still renders the old friend-profile card or duplicate application header`,
  );
  assert(await topbar.locator(":scope > .app-shell-logo").count() === 1, `${label} is missing the personal-style Rollapp header`);
  assert(await topbar.getByRole("button", { name: "Поделиться", exact: true }).count() === 1, `${label} is missing the personal-style Share action`);
  assert(await topbar.locator(":scope > *").count() === 2, `${label} friend header contains an unexpected extra action`);
  assert(await hero.locator(":scope > .friend-profile-page__identity").evaluate((element) => element.tagName === "DIV" && !element.hasAttribute("role")), `${label} another user's identity is incorrectly interactive`);
  assert(await hero.locator("[data-slot='avatar']").count() === 1, `${label} hero does not use the shadcn Avatar`);
  await hero.getByRole("heading", { name: "Макс Ветров", exact: true }).waitFor();
  assert(await hero.getByText(/^@max$/).count() === 0, `${label} restores the removed username below the profile name`);
  assert(await hero.getByText("Здесь живут желания, которым пора сбыться.", { exact: true }).count() === 0, `${label} restores the old profile description`);
  const followButton = hero.getByRole("button", { name: /^(Подписаться|Отписаться)$/ });
  await followButton.waitFor({ state: "visible" });
  assert(["true", "false"].includes(await followButton.getAttribute("aria-pressed")), `${label} follow action does not expose its current state`);
  const stats = hero.locator(".friend-profile-page__stats");
  assert(await stats.locator(":scope > div").count() === 2, `${label} should expose following and follower counts below the name`);
  assert(await stats.getByText("Подписки", { exact: true }).count() === 1, `${label} is missing the following metric`);
  assert(await stats.getByText("Подписчики", { exact: true }).count() === 1, `${label} is missing the follower metric`);
  assert(await profilePage.locator(".friend-profile-tabs [data-slot='toggle-group']").count() === 1, `${label} list navigation does not use the shadcn ToggleGroup`);
  assert(await profilePage.locator(".wish-grid .wish-card").count() > 0, `${label} does not render the friend's wish cards`);

  const geometry = await page.evaluate(() => {
    const rect = (node) => {
      const value = typeof node === "string" ? document.querySelector(node)?.getBoundingClientRect() : node?.getBoundingClientRect();
      return value ? { left: value.left, top: value.top, right: value.right, bottom: value.bottom, width: value.width, height: value.height, centerX: value.left + value.width / 2 } : null;
    };
    const heading = document.querySelector(".friend-profile-page .wishes-page__hero h1");
    const headingStyle = heading ? getComputedStyle(heading) : null;
    const statsItems = [...document.querySelectorAll(".friend-profile-page__stats > div")];
    const statsRects = statsItems.map(rect);
    const statsVisual = statsRects.length ? {
      left: Math.min(...statsRects.map(({ left }) => left)),
      top: Math.min(...statsRects.map(({ top }) => top)),
      right: Math.max(...statsRects.map(({ right }) => right)),
      bottom: Math.max(...statsRects.map(({ bottom }) => bottom)),
    } : null;
    if (statsVisual) statsVisual.centerX = (statsVisual.left + statsVisual.right) / 2;
    const grid = document.querySelector(".friend-profile-page .wish-grid");
    return {
      viewportWidth: document.documentElement.clientWidth,
      rootScrollWidth: document.documentElement.scrollWidth,
      page: rect(".friend-profile-page"),
      topbar: rect(".friend-profile-page > .wishes-page__topbar"),
      hero: rect(".friend-profile-page > .wishes-page__hero"),
      avatar: rect(".friend-profile-page .wishes-page__hero-avatar"),
      heading: rect(heading),
      stats: statsVisual,
      follow: rect(".friend-profile-page__actions > button"),
      carousel: rect(".friend-profile-page > .list-tabs"),
      grid: rect(grid),
      gridColumns: grid ? getComputedStyle(grid).gridTemplateColumns.split(/\s+/).filter(Boolean).length : 0,
      headingBackground: headingStyle?.backgroundImage,
      headingColor: headingStyle?.color,
    };
  });
  assert(geometry.rootScrollWidth <= geometry.viewportWidth + 1, `${label} introduces horizontal page overflow`);
  for (const [name, rect] of [["page", geometry.page], ["hero", geometry.hero], ["grid", geometry.grid]]) {
    assert(rect && rect.left >= -1 && rect.right <= geometry.viewportWidth + 1, `${label} ${name} escapes the viewport (${JSON.stringify(rect)})`);
  }
  assert(geometry.topbar && geometry.carousel && geometry.avatar && geometry.heading && geometry.stats && geometry.follow, `${label} is missing part of the personal-style composition`);
  const minimumAvatar = geometry.viewportWidth <= 560 ? 92 : geometry.viewportWidth <= 820 ? 108 : geometry.viewportWidth <= 1180 ? 130 : 154;
  assert(geometry.avatar.width >= minimumAvatar && Math.abs(geometry.avatar.width - geometry.avatar.height) <= 1, `${label} friend avatar does not match the personal profile scale`);
  const centers = [geometry.avatar.centerX, geometry.heading.centerX, geometry.stats.centerX, geometry.follow.centerX];
  assert(Math.max(...centers) - Math.min(...centers) <= 2, `${label} friend profile elements are not centered on one axis (${centers.join(", ")})`);
  assert(geometry.avatar.bottom <= geometry.heading.top + 1 && geometry.heading.bottom <= geometry.stats.top + 1 && geometry.stats.bottom <= geometry.follow.top + 1, `${label} friend profile elements are out of order`);
  assert(geometry.follow.height >= 48, `${label} follow action is smaller than the personal page action`);
  const expectedColumns = geometry.viewportWidth <= 560 ? 2 : geometry.viewportWidth <= 1180 ? 3 : 4;
  assert(geometry.gridColumns === expectedColumns, `${label} friend grid has ${geometry.gridColumns} columns instead of ${expectedColumns}`);
  assert(geometry.headingBackground === "none", `${label} still applies the old gradient profile title`);
  assert(!/rgba\([^)]*,\s*0\)/.test(geometry.headingColor || ""), `${label} profile title is transparent`);

  await expectAppLogoPlacement(page, label);
  await expectMainFriendsLink(page, label);
  if (mobile) {
    await expectMobileAppShell(page, label);
  }

  await expectDarkPage(page, label, [".app-layout--dark", ".app-main", ".friend-profile-page", ".friend-profile-page__hero"]);
  await expectWishListTileButtonStates(page, `${label} list tiles`, { checkHover: !mobile });
  await expectWishListCarouselBleed(page, `${label} list carousel`);
  await expectWishCardsUnframed(page, label);
  await expectNoRootOverflow(page, label);
  await page.screenshot({
    path: mobile ? "/tmp/rollapp-mobile-friend-profile-390.png" : "/tmp/rollapp-desktop-friend-profile.png",
    fullPage: true,
  });

  if (!mobile) {
    const originalViewport = page.viewportSize();
    for (const width of [821, 820]) {
      await page.setViewportSize({ width, height: 900 });
      await page.evaluate(() => window.scrollTo(0, 0));
      await waitForStableLayout(page);
      await expectMainFriendsLink(page, `${label} ${width}px Friends action`);
      await expectAppLogoPlacement(page, `${label} ${width}px logo`);
      await expectSidebarRemoved(page, `${label} ${width}px shell`);
      await expectWishListCarouselBleed(page, `${label} ${width}px list carousel`);
      if (width === 820) await expectMobileAppShell(page, `${label} ${width}px mobile shell`);
      const responsive = await page.evaluate(() => {
        const heroNode = document.querySelector(".friend-profile-page__hero");
        const identityNode = document.querySelector(".friend-profile-page__identity");
        const pageNode = document.querySelector(".friend-profile-page");
        const heroRect = heroNode?.getBoundingClientRect();
        const identityRect = identityNode?.getBoundingClientRect();
        const pageRect = pageNode?.getBoundingClientRect();
        return {
          viewportWidth: document.documentElement.clientWidth,
          scrollWidth: document.documentElement.scrollWidth,
          hero: heroRect && { left: heroRect.left, right: heroRect.right },
          identityWidth: identityRect?.width || 0,
          pageTop: pageRect?.top,
        };
      });
      assert(responsive.scrollWidth <= responsive.viewportWidth + 1, `${label} overflows at ${width}px`);
      assert(responsive.hero?.left >= -1 && responsive.hero?.right <= responsive.viewportWidth + 1, `${label} hero escapes the viewport at ${width}px`);
      assert(responsive.identityWidth >= 150, `${label} profile identity collapses at ${width}px (${responsive.identityWidth}px)`);
      if (width === 820) assert(responsive.pageTop <= 1, `${label} keeps the desktop top offset in the mobile collection shell (${responsive.pageTop}px)`);
    }
    await page.setViewportSize(originalViewport);

    for (const invalidPath of ["/max/lists/not-there", "/max/wishes/not-there"]) {
      await page.goto(`${baseUrl}${invalidPath}`, { waitUntil: "domcontentloaded" });
      await page.locator("[data-public-collection-state] .empty-state").waitFor({ state: "visible" });
      assert(await page.locator(".app-layout.app-layout--friends").count() === 1, `${label} ${invalidPath} leaves the AppShell`);
      await expectSidebarRemoved(page, `${label} ${invalidPath}`);
      assert(await page.locator(".public-profile, .profile-header, .profile-guest-rail").count() === 0, `${label} ${invalidPath} falls back to the standalone profile shell`);
      assert(await page.locator(".app-main [data-public-collection-state]").count() === 1, `${label} ${invalidPath} does not use the shared collection state`);
    }
  }
}

async function expectPublicGrid(page, columns, label, { requireCards = true } = {}) {
  const grid = page.locator("[data-public-collection] > .wish-grid").first();
  await grid.waitFor({ state: "visible" });
  if (requireCards) assert(await grid.locator(".wish-card").count() >= columns, `${label} does not have enough cards to verify ${columns} columns`);
  await waitForStableLayout(page);
  const actualColumns = await grid.evaluate((element) => (
    getComputedStyle(element).gridTemplateColumns.split(/\s+/).filter(Boolean).length
  ));
  assert(actualColumns === columns, `${label} should render ${columns} wish columns, rendered ${actualColumns}`);
}

async function expectUnifiedPublicCollection(page, label, {
  owner = false,
  shared = false,
  authenticated = false,
  mobile = false,
} = {}) {
  await page.evaluate(() => window.scrollTo({ top: 0, left: 0, behavior: "instant" }));
  const root = page.locator("[data-public-collection]");
  const topbar = root.locator(":scope > .wishes-page__topbar");
  const hero = root.locator(":scope > .wishes-page__hero");
  const carousel = root.locator(":scope > .list-tabs");
  await root.waitFor({ state: "visible" });
  await topbar.waitFor({ state: "visible" });
  await hero.waitFor({ state: "visible" });
  await carousel.waitFor({ state: "visible" });
  await waitForStableLayout(page);

  assert(await page.locator("[data-public-collection]").count() === 1, `${label} renders more than one collection page`);
  assert(
    await page.locator(".public-profile, .profile-header, .profile-header__dock, .profile-mobile-menu, .profile-list-rail, .profile-guest-rail, .public-profile__layout, .profile-cover, .public-list-tabs, .public-wishes-head, .shared-list-head").count() === 0,
    `${label} still mounts part of the retired standalone public-profile shell`,
  );
  assert(await topbar.locator(":scope > .app-shell-logo").count() === 1, `${label} is missing the internal-style Rollapp header`);
  assert(await topbar.getByRole("button", { name: "Поделиться", exact: true }).count() === 1, `${label} is missing the internal-style Share action`);
  assert(await topbar.locator(":scope > *").count() === 2, `${label} collection header contains an unexpected extra action`);
  assert(await hero.locator('[data-slot="avatar"]').count() === 1, `${label} profile hero is missing its Avatar`);
  assert(await hero.getByRole("heading", { level: 1 }).count() === 1, `${label} profile hero is missing its name`);
  assert(await hero.locator(".profile-handle").count() === 0, `${label} restores the removed profile handle`);
  assert(await hero.locator(".profile-cover__bio, .profile-cover__birthday").count() === 0, `${label} restores retired profile metadata`);
  assert(await carousel.locator('[data-slot="toggle-group"]').count() === 1, `${label} list navigation does not use the internal ToggleGroup`);
  assert(await carousel.locator('[data-slot="toggle-group-item"][aria-pressed="true"]').count() === 1, `${label} does not expose exactly one selected list`);

  const identity = hero.locator(":scope > .wishes-page__identity");
  if (owner) {
    assert(await identity.evaluate((element) => element.tagName === "BUTTON"), `${label} owner identity is not the profile-editor action`);
    assert(/^Редактировать профиль\s+/.test(await identity.getAttribute("aria-label") || ""), `${label} owner identity has the wrong accessible name`);
    const relationshipLinks = hero.locator(".wishes-page__friend-links a");
    assert(await relationshipLinks.count() === 2, `${label} owner profile is missing its relationship links`);
    const relationshipIconContract = await relationshipLinks.evaluateAll((links) => links.map((link) => {
      const icon = link.querySelector(":scope > svg");
      const rect = icon?.getBoundingClientRect();
      return {
        name: link.innerText.trim(),
        iconCount: link.querySelectorAll(":scope > svg").length,
        iconHidden: icon?.getAttribute("aria-hidden"),
        iconWidth: rect?.width || 0,
        iconHeight: rect?.height || 0,
      };
    }));
    for (const link of relationshipIconContract) {
      assert(
        link.iconCount === 1
          && link.iconHidden === "true"
          && Math.abs(link.iconWidth - 20) <= 1
          && Math.abs(link.iconHeight - 20) <= 1,
        `${label} ${link.name} is missing its decorative 20px relationship icon`,
      );
    }
    if (shared) {
      assert(await hero.getByRole("button", { name: "Открыть мой список", exact: true }).count() === 1, `${label} owner share view is missing its canonical list action`);
      assert(await carousel.locator(".list-tabs__add").count() === 0, `${label} shared owner view exposes list creation`);
    } else {
      assert(await hero.getByRole("button", { name: "Добавить", exact: true }).count() === 1, `${label} owner profile is missing its Add action`);
      assert(await carousel.locator(".list-tabs__add").count() === 1, `${label} owner profile is missing list creation`);
    }
    assert(await hero.getByRole("button", { name: /^(Подписаться|Отписаться)$/ }).count() === 0, `${label} owner profile exposes a self-follow action`);
  } else {
    assert(await identity.evaluate((element) => element.tagName === "DIV" && !element.hasAttribute("role")), `${label} visitor identity is incorrectly interactive`);
    const stats = hero.locator(".friend-profile-page__stats");
    if (shared) {
      assert(await hero.locator(".wishes-page__friend-links").count() === 0, `${label} fabricates relationship data absent from the shared-list response`);
    } else {
      assert(await stats.locator(":scope > div").count() === 2, `${label} is missing following and follower counts`);
      assert(await stats.getByText("Подписки", { exact: true }).count() === 1, `${label} is missing the following metric`);
      assert(await stats.getByText("Подписчики", { exact: true }).count() === 1, `${label} is missing the follower metric`);
    }
    assert(await carousel.locator(".list-tabs__add").count() === 0, `${label} visitor profile exposes list creation`);
    const follow = hero.getByRole("button", { name: /^(Подписаться|Отписаться)$/ });
    assert(await follow.count() === 1, `${label} visitor profile is missing its follow action`);
    assert(["true", "false"].includes(await follow.getAttribute("aria-pressed")), `${label} follow action does not expose its current state`);
  }

  if (shared) {
    assert(await carousel.locator('[data-slot="toggle-group-item"]').count() === 1, `${label} shared list exposes unrelated collection tabs`);
  } else {
    assert(await carousel.locator('[data-slot="toggle-group-item"]').count() >= 2, `${label} profile does not expose its collection carousel`);
  }

  const composition = await root.evaluate((element) => {
    const rect = (node) => {
      const value = node?.getBoundingClientRect();
      return value ? { left: value.left, top: value.top, right: value.right, bottom: value.bottom, width: value.width, height: value.height, centerX: value.left + value.width / 2 } : null;
    };
    const children = [...element.children];
    const topbarNode = element.querySelector(":scope > .wishes-page__topbar");
    const heroNode = element.querySelector(":scope > .wishes-page__hero");
    const carouselNode = element.querySelector(":scope > .list-tabs");
    const identityNode = heroNode?.querySelector(":scope > .wishes-page__identity");
    const avatarNode = identityNode?.querySelector('[data-slot="avatar"]');
    const headingNode = identityNode?.querySelector("h1");
    const relationshipsNode = heroNode?.querySelector(":scope > .wishes-page__friend-links");
    const actionsNode = heroNode?.querySelector(":scope > .wishes-page__hero-actions");
    const gridNode = element.querySelector(":scope > .wish-grid");
    return {
      viewportWidth: document.documentElement.clientWidth,
      rootScrollWidth: Math.max(document.documentElement.scrollWidth, document.body?.scrollWidth ?? 0),
      main: rect(element.closest(".app-main")),
      root: rect(element),
      topbar: rect(topbarNode),
      hero: rect(heroNode),
      identity: rect(identityNode),
      avatar: rect(avatarNode),
      heading: rect(headingNode),
      relationships: rect(relationshipsNode),
      actions: rect(actionsNode),
      carousel: rect(carouselNode),
      grid: rect(gridNode),
      order: {
        topbar: children.indexOf(topbarNode),
        hero: children.indexOf(heroNode),
        carousel: children.indexOf(carouselNode),
        grid: children.indexOf(gridNode),
      },
    };
  });
  assert(composition.main && composition.root && composition.topbar && composition.hero && composition.identity && composition.avatar && composition.heading && (composition.relationships || (shared && !owner)) && composition.actions && composition.carousel, `${label} is missing part of the internal collection composition`);
  assert(composition.order.topbar === 0 && composition.order.hero === 1 && composition.order.carousel === 2, `${label} does not keep header, profile and carousel in the internal order`);
  if (composition.grid) assert(composition.order.grid > composition.order.carousel, `${label} renders wishes before the list carousel`);
  assert(composition.rootScrollWidth <= composition.viewportWidth + 1, `${label} causes horizontal page overflow`);
  assert(Math.abs(composition.topbar.top - composition.main.top) <= 2, `${label} starts below the internal collection header line`);
  for (const [name, rect] of [["page", composition.root], ["hero", composition.hero], ["profile identity", composition.identity], ["actions", composition.actions]]) {
    assert(rect.left >= -1 && rect.right <= composition.viewportWidth + 1 && rect.width > 0 && rect.height > 0, `${label} ${name} escapes or collapses`);
  }
  const centers = [composition.avatar.centerX, composition.heading.centerX, composition.relationships?.centerX, composition.actions.centerX].filter(Number.isFinite);
  assert(Math.max(...centers) - Math.min(...centers) <= 2, `${label} profile stack is not centered on one axis (${centers.join(", ")})`);
  assert(
    composition.avatar.bottom <= composition.heading.bottom + 1
      && (composition.relationships
        ? composition.identity.bottom <= composition.relationships.top + 1 && composition.relationships.bottom <= composition.actions.top + 1
        : composition.identity.bottom <= composition.actions.top + 1),
    `${label} profile stack is out of order`,
  );

  if (authenticated) {
    assert(await page.locator(".app-layout.app-layout--dark").count() === 1, `${label} is not rendered inside the authenticated AppShell`);
    assert(await page.locator(".app-main [data-public-collection]").count() === 1, `${label} collection escapes the application main surface`);
    await expectSidebarRemoved(page, label);
    if (mobile) await expectMobileAppShell(page, label);
  } else {
    assert(await page.locator(".public-collection-shell > .app-main > [data-public-collection]").count() === 1, `${label} anonymous collection does not use the internal main surface`);
    assert(await page.locator(".mobile-bottom-nav, .app-main__profile").count() === 0, `${label} anonymous collection exposes authenticated navigation`);
  }
  await expectDarkPage(page, label, [".app-layout--dark", ".app-main", "[data-public-collection]", ".public-collection-page__hero"]);
  await expectAppLogoPlacement(page, label);
  await expectWishListCarouselBleed(page, `${label} list carousel`);
  if (!shared) await expectWishListTileButtonStates(page, `${label} list tiles`, { checkHover: !mobile });
  if (await root.locator(":scope > .wish-grid .wish-card").count()) await expectWishCardsUnframed(page, label, "[data-public-collection] > .wish-grid .wish-card");
  await expectNoRootOverflow(page, label);
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
  assert(
    (await page.locator("[data-slot='dialog-content']:has([data-slot='wish-media'])").count()) === 0,
    `${label} unexpectedly opened the wish detail dialog`,
  );
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
      maxHeight: style.maxHeight,
      overflowY: style.overflowY,
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
      availableHeight: style.getPropertyValue("--available-height"),
      className: element.className,
      inlineStyle: element.getAttribute("style"),
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
  assert(
    geometry.bottom <= geometry.viewportHeight - margin + 1,
    `${label} extends beyond the viewport bottom edge (${geometry.bottom}px of ${geometry.viewportHeight}px): ${JSON.stringify(geometry)}`,
  );
  return geometry;
}

async function expectPopupMatchesTriggerWidth(trigger, popup, label) {
  await popup.waitFor({ state: "visible" });
  await popup.evaluate(async (element) => {
    await Promise.all(element.getAnimations({ subtree: true }).map((animation) => animation.finished.catch(() => {})));
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
  const triggerRect = await trigger.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { left: rect.left, right: rect.right, width: rect.width };
  });
  const popupRect = await popup.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return {
      left: rect.left,
      right: rect.right,
      width: rect.width,
      anchorWidth: Number.parseFloat(style.getPropertyValue("--anchor-width")),
    };
  });
  assert(
    Math.abs(popupRect.width - triggerRect.width) <= 1
      && Math.abs(popupRect.left - triggerRect.left) <= 1
      && Math.abs(popupRect.right - triggerRect.right) <= 1
      && Math.abs(popupRect.anchorWidth - triggerRect.width) <= 1,
    `${label} does not match its trigger width: ${JSON.stringify({ trigger: triggerRect, popup: popupRect })}`,
  );
}

async function expectOfficialDetailListCheckboxes(options, lists, selectedListIds, label) {
  await options.first().evaluate(async (item) => {
    const surface = item.closest("[role='menu']") || item;
    const finiteAnimations = surface.getAnimations({ subtree: true }).filter((animation) => {
      const iterations = animation.effect?.getTiming?.().iterations;
      return iterations !== Infinity;
    });
    await Promise.all(finiteAnimations.map((animation) => animation.finished.catch(() => {})));
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
  const states = await options.evaluateAll((items) => items.map((item) => {
    const checkboxes = item.querySelectorAll(":scope > [data-slot='checkbox']");
    const checkbox = checkboxes[0] || null;
    const indicator = checkbox?.querySelector("[data-slot='checkbox-indicator']") || null;
    const checkboxRect = checkbox?.getBoundingClientRect();
    const checkboxStyle = checkbox ? getComputedStyle(checkbox) : null;
    const indicatorRect = indicator?.getBoundingClientRect();
    const indicatorStyle = indicator ? getComputedStyle(indicator) : null;
    return {
      rowRole: item.getAttribute("role"),
      rowChecked: item.getAttribute("aria-checked"),
      checkboxCount: checkboxes.length,
      checkboxRole: checkbox?.getAttribute("role") || null,
      checkboxAriaHidden: checkbox?.getAttribute("aria-hidden") || null,
      checkboxTabIndex: checkbox?.tabIndex ?? null,
      checked: checkbox?.hasAttribute("data-checked") || false,
      unchecked: checkbox?.hasAttribute("data-unchecked") || false,
      width: checkboxRect?.width ?? null,
      height: checkboxRect?.height ?? null,
      borderRadius: checkboxStyle ? Number.parseFloat(checkboxStyle.borderRadius) : null,
      pointerEvents: checkboxStyle?.pointerEvents || null,
      indicatorVisible: Boolean(indicator
        && indicatorRect
        && indicatorStyle
        && indicatorRect.width > 0
        && indicatorRect.height > 0
        && indicatorStyle.display !== "none"
        && indicatorStyle.visibility !== "hidden"),
      legacyStateCount: item.querySelectorAll(":scope > .card-menu__list-state").length,
    };
  }));
  assert(states.length === lists.length, `${label} has ${states.length} checkbox rows instead of ${lists.length}`);
  states.forEach((state, index) => {
    const list = lists[index];
    const expectedChecked = selectedListIds.includes(list.id);
    assert(state.rowRole === "menuitemcheckbox", `${label} row "${list.title}" lost its menuitemcheckbox role`);
    assert(state.rowChecked === String(expectedChecked), `${label} row "${list.title}" has the wrong aria-checked state`);
    assert(state.checkboxCount === 1, `${label} row "${list.title}" must contain exactly one official Checkbox`);
    assert(state.checkboxRole === "presentation" && state.checkboxAriaHidden === "true", `${label} row "${list.title}" Checkbox is not presentational`);
    assert(state.checkboxTabIndex === -1 && state.pointerEvents === "none", `${label} row "${list.title}" Checkbox became a nested interactive target`);
    assert(state.width >= 23 && state.width <= 25 && state.height >= 23 && state.height <= 25, `${label} row "${list.title}" Checkbox is not the app-level 24px size (${state.width}x${state.height})`);
    assert(state.borderRadius !== null && state.borderRadius <= 5, `${label} row "${list.title}" Checkbox became circular (${state.borderRadius}px radius)`);
    assert(state.checked === expectedChecked && state.unchecked === !expectedChecked, `${label} row "${list.title}" Checkbox data state is wrong`);
    assert(state.indicatorVisible === expectedChecked, `${label} row "${list.title}" Checkbox indicator visibility is wrong`);
    assert(state.legacyStateCount === 0, `${label} row "${list.title}" restored the legacy circular plus/check state`);
  });
}

async function expectMobileTouchTargets(locator, label, { minHeight = 48 } = {}) {
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

async function expectCleanDestructiveMenuState(page, item, label, { checkHover = true } = {}) {
  const readChrome = () => item.evaluate((element) => {
    const toRgba = (color) => {
      const canvas = document.createElement("canvas");
      canvas.width = 1;
      canvas.height = 1;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      context.clearRect(0, 0, 1, 1);
      context.fillStyle = color;
      context.fillRect(0, 0, 1, 1);
      return [...context.getImageData(0, 0, 1, 1).data];
    };
    const style = getComputedStyle(element);
    const iconStyle = getComputedStyle(element.querySelector(":scope > svg"));
    const probe = document.createElement("span");
    probe.style.color = "var(--destructive)";
    document.body.append(probe);
    const destructive = toRgba(getComputedStyle(probe).color);
    const elementStyle = getComputedStyle(element);
    const surface = toRgba(elementStyle.getPropertyValue("--app-destructive-menu-surface"));
    const surfaceForeground = toRgba(elementStyle.getPropertyValue("--app-destructive-menu-surface-foreground"));
    probe.remove();
    return {
      active: document.activeElement === element,
      focusVisible: element.matches(":focus-visible"),
      opacity: Number.parseFloat(style.opacity),
      color: toRgba(style.color),
      iconColor: toRgba(iconStyle.color),
      destructive,
      surface,
      surfaceForeground,
      background: toRgba(style.backgroundColor),
      backgroundImage: style.backgroundImage,
      borderWidths: [style.borderTopWidth, style.borderRightWidth, style.borderBottomWidth, style.borderLeftWidth].map(Number.parseFloat),
      boxShadow: style.boxShadow,
      pseudoContent: [getComputedStyle(element, "::before").content, getComputedStyle(element, "::after").content],
    };
  });
  const closeColor = (actual, expected, tolerance = 3) => actual.slice(0, 3).every((value, index) => Math.abs(value - expected[index]) <= tolerance);
  const luminance = ([red, green, blue]) => {
    const linear = [red, green, blue].map((channel) => {
      const value = channel / 255;
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
    return (0.2126 * linear[0]) + (0.7152 * linear[1]) + (0.0722 * linear[2]);
  };
  const contrast = (first, second) => {
    const [lighter, darker] = [luminance(first), luminance(second)].sort((a, b) => b - a);
    return (lighter + 0.05) / (darker + 0.05);
  };
  const assertCleanChrome = (state, stateLabel) => {
    assert(state.opacity === 1, `${label} ${stateLabel} destructive action is unexpectedly muted`);
    assert(state.backgroundImage === "none" && state.borderWidths.every((value) => value === 0) && state.boxShadow === "none", `${label} ${stateLabel} destructive state has dirty extra chrome`);
    assert(state.pseudoContent.every((content) => !content || ["none", "normal", '""', "''"].includes(content)), `${label} ${stateLabel} destructive state restored a legacy pseudo-element`);
  };
  const assertActive = (state, stateLabel) => {
    assertCleanChrome(state, stateLabel);
    assert(closeColor(state.color, state.surfaceForeground) && closeColor(state.iconColor, state.surfaceForeground), `${label} ${stateLabel} destructive text or icon is not legible on the red surface: ${JSON.stringify({ color: state.color, iconColor: state.iconColor, expected: state.surfaceForeground })}`);
    assert(state.background[3] >= 254 && closeColor(state.background, state.surface, 3), `${label} ${stateLabel} destructive surface is not clean red: ${JSON.stringify(state.background)}`);
    assert(state.background[0] > state.background[1] * 1.35 && state.background[0] > state.background[2] * 1.15, `${label} ${stateLabel} destructive surface still reads as muddy gray: ${JSON.stringify(state.background)}`);
    assert(contrast(state.color, state.background) >= 4.5, `${label} ${stateLabel} destructive label contrast is below 4.5:1`);
  };

  const idle = await readChrome();
  assertCleanChrome(idle, "idle");
  assert(closeColor(idle.color, idle.destructive) && closeColor(idle.iconColor, idle.destructive), `${label} idle destructive text or icon lost its red token`);
  assert(idle.background[3] <= 1, `${label} idle destructive action has an unexpected background`);

  let hover = null;
  if (checkHover) {
    await item.hover();
    await page.waitForTimeout(180);
    await item.hover();
    await page.waitForTimeout(50);
    hover = await readChrome();
    assertActive(hover, "hover");
  }

  await page.mouse.move(0, 0);
  await page.keyboard.press("End");
  await waitForFocused(page, item, `${label} destructive keyboard state`);
  const focused = await readChrome();
  assertActive(focused, "focus");
  assert(focused.active && focused.focusVisible, `${label} destructive keyboard state is not visibly focused`);
  if (hover) {
    assert(hover.background.every((value, index) => Math.abs(value - focused.background[index]) <= 2), `${label} destructive hover and focus surfaces differ`);
    assert(hover.color.every((value, index) => Math.abs(value - focused.color[index]) <= 2), `${label} destructive hover and focus foregrounds differ`);
  }
  await page.keyboard.press("Home");
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
  const deleteItem = menu.getByRole("menuitem", { name: "Удалить", exact: true });
  assert(await deleteItem.getAttribute("data-variant") === "destructive", `${label} delete action is not the destructive DropdownMenu item`);
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
  await expectCleanDestructiveMenuState(page, deleteItem, `${label} delete action`, { checkHover: !mobile });
  await expectLargeAppControls(menu, `${label} root menu controls`);
  if (mobile) {
    const effectiveHitWidth = triggerGeometry.width - triggerGeometry.hitInset.left - triggerGeometry.hitInset.right;
    const effectiveHitHeight = triggerGeometry.height - triggerGeometry.hitInset.top - triggerGeometry.hitInset.bottom;
    assert(effectiveHitWidth >= 47 && effectiveHitHeight >= 47, `${label} menu trigger has no 48px Large touch area`);
    await expectMobileTouchTargets(rootItems, `${label} root menu`);
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
  const listIcons = options.locator(":scope > .wish-card-list-icon");
  assert(await listIcons.count() === categoryLists.length, `${label} list submenu is missing its neutral list icons`);
  const listIconStyles = await listIcons.evaluateAll((icons) => icons.map((icon) => {
    const style = getComputedStyle(icon);
    return {
      backgroundColor: style.backgroundColor,
      color: style.color,
      hidden: icon.getAttribute("aria-hidden") === "true",
      svgCount: icon.querySelectorAll(":scope > svg").length,
      legacyColorClass: [...icon.classList].some((className) => className.startsWith("list-dot--")),
    };
  }));
  assert(
    listIconStyles.every((icon) => icon.hidden && icon.svgCount === 1 && !icon.legacyColorClass),
    `${label} list submenu icons lost their decorative neutral treatment`,
  );
  assert(
    listIconStyles.every((icon) => icon.backgroundColor === listIconStyles[0].backgroundColor && icon.color === listIconStyles[0].color),
    `${label} list submenu icons use inconsistent foreground or background colors`,
  );
  assert(await listMenu.getByRole("menuitem", { name: "Новый список", exact: true }).isVisible(), `${label} list submenu does not expose list creation`);
  for (const list of categoryLists) {
    const option = listMenu.getByRole("menuitemcheckbox", { name: list.title, exact: true });
    assert(
      await option.getAttribute("aria-checked") === String(wish.listIds.includes(list.id)),
      `${label} list "${list.title}" has the wrong initial checked state`,
    );
  }
  await expectLargeAppControls(listMenu, `${label} list submenu controls`);
  if (mobile) {
    await expectMobileTouchTargets(options, `${label} list submenu`);
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
    await openOwnerWishListMenu(page, pointerMenu.menu, wish);
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
    const deleteDialog = page.getByRole("alertdialog", { name: `Удалить «${wish.title}»?`, exact: true });
    await deleteDialog.waitFor({ state: "visible" });
    await expectDarkAuthenticatedModal(deleteDialog, `${label} delete confirmation`);
    await deleteDialog.getByRole("button", { name: "Отмена", exact: true }).click();
    await deleteDialog.waitFor({ state: "detached" });
  }
}

async function expectBuyActionBelowToolbar(dialog, label, { required = false } = {}) {
  const toolbar = dialog.locator(":scope > [data-slot='wish-toolbar']");
  const buyAction = dialog.locator(":scope > .wish-buy-action");
  const buyActionCount = await buyAction.count();
  if (!buyActionCount) {
    assert(!required, `${label} is missing its buy action`);
    return null;
  }
  assert(buyActionCount === 1 && await toolbar.count() === 1, `${label} has duplicate buy actions or toolbars`);
  await buyAction.scrollIntoViewIfNeeded();
  await dialog.evaluate(async (element) => {
    await Promise.all(element.getAnimations({ subtree: true }).map((animation) => animation.finished.catch(() => {})));
  });
  const geometry = await dialog.evaluate((element) => {
    const toolbar = element.querySelector(":scope > [data-slot='wish-toolbar']");
    const buy = element.querySelector(":scope > .wish-buy-action");
    const select = toolbar.querySelector("[aria-label^='Изменить списки желания']");
    const toolbarRect = toolbar.getBoundingClientRect();
    const buyRect = buy.getBoundingClientRect();
    const selectRect = select?.getBoundingClientRect();
    const hit = document.elementFromPoint(buyRect.left + buyRect.width / 2, buyRect.top + buyRect.height / 2);
    return {
      direct: buy.parentElement === element,
      immediatelyAfterToolbar: toolbar.nextElementSibling === buy,
      toolbar: { left: toolbarRect.left, top: toolbarRect.top, right: toolbarRect.right, bottom: toolbarRect.bottom, width: toolbarRect.width },
      buy: { left: buyRect.left, top: buyRect.top, right: buyRect.right, bottom: buyRect.bottom, width: buyRect.width, height: buyRect.height },
      select: selectRect ? { left: selectRect.left, right: selectRect.right, bottom: selectRect.bottom } : null,
      hittable: hit === buy || buy.contains(hit),
    };
  });
  assert(geometry.direct && geometry.immediatelyAfterToolbar, `${label} buy button is not directly after the list selector in reading order`);
  assert(
    geometry.toolbar.bottom <= geometry.buy.top + 1
      && Math.abs(geometry.buy.left - geometry.toolbar.left) <= 1
      && Math.abs(geometry.buy.right - geometry.toolbar.right) <= 1
      && geometry.buy.height >= 47
      && geometry.hittable,
    `${label} buy button is not a full-width usable control below the list selector (${JSON.stringify(geometry)})`,
  );
  assert(
    !geometry.select || (
      geometry.select.bottom <= geometry.buy.top + 1
      && Math.abs(geometry.buy.left - geometry.select.left) <= 1
      && Math.abs(geometry.buy.right - geometry.select.right) <= 1
    ),
    `${label} buy button is not aligned directly below the owner list selector`,
  );
  return buyAction;
}

async function expectFluidWishMediaVariants(dialog, label) {
  const variants = await dialog.evaluate(async (element) => {
    const media = element.querySelector(":scope > [data-slot='wish-media']");
    const image = media?.querySelector(":scope > img");
    if (!media || !image) return null;
    await Promise.all(element.getAnimations({ subtree: true }).map((animation) => animation.finished.catch(() => {})));
    const originalSource = image.getAttribute("src");
    const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const loadFixture = async (width, height, color) => {
      const source = `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="${width}" height="${height}" fill="${color}"/></svg>`)}`;
      image.setAttribute("src", source);
      await image.decode();
      await nextFrame();
      const mediaRect = media.getBoundingClientRect();
      const imageRect = image.getBoundingClientRect();
      const dialogRect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      element.scrollTop = element.scrollHeight;
      const reachedScroll = element.scrollTop;
      element.scrollTop = 0;
      return {
        media: { left: mediaRect.left, right: mediaRect.right, width: mediaRect.width, height: mediaRect.height, clientWidth: media.clientWidth, clientHeight: media.clientHeight, aspectRatio: getComputedStyle(media).aspectRatio },
        image: { left: imageRect.left, right: imageRect.right, width: imageRect.width, height: imageRect.height, naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight },
        dialog: { top: dialogRect.top, bottom: dialogRect.bottom, clientHeight: element.clientHeight, scrollHeight: element.scrollHeight, overflowY: style.overflowY, reachedScroll },
        viewport: { width: window.innerWidth, height: window.innerHeight },
        rootScrollWidth: Math.max(document.documentElement.scrollWidth, document.body?.scrollWidth || 0),
      };
    };
    try {
      return {
        landscape: await loadFixture(1600, 900, "#456789"),
        portrait: await loadFixture(900, 1800, "#765432"),
      };
    } finally {
      image.setAttribute("src", originalSource);
      await image.decode().catch(() => {});
      await nextFrame();
      element.scrollTop = 0;
    }
  });
  assert(variants, `${label} has no image for the intrinsic-ratio probes`);
  for (const [kind, variant] of Object.entries(variants)) {
    const normalizedRatioError = Math.abs(
      ((variant.image.width * variant.image.naturalHeight) / (variant.image.height * variant.image.naturalWidth)) - 1,
    );
    assert(variant.media.aspectRatio === "auto", `${label} ${kind} photo is still inside a fixed-ratio media box`);
    assert(
      Math.abs(variant.image.width - variant.media.clientWidth) <= 1
        && Math.abs(variant.image.left - variant.media.left) <= 1
        && Math.abs(variant.image.right - variant.media.right) <= 1
        && Math.abs(variant.image.height - variant.media.clientHeight) <= 1,
      `${label} ${kind} photo does not fill the container width: ${JSON.stringify(variant)}`,
    );
    assert(normalizedRatioError <= .005, `${label} ${kind} photo does not preserve its intrinsic proportion`);
    assert(variant.rootScrollWidth <= variant.viewport.width + 1, `${label} ${kind} photo creates horizontal page overflow`);
  }
  assert(variants.landscape.image.height < variants.landscape.image.width, `${label} landscape photo is no longer landscape`);
  assert(variants.portrait.image.height > variants.portrait.image.width, `${label} portrait photo is no longer portrait`);
  assert(
    Math.abs(variants.portrait.dialog.top) <= 1
      && Math.abs(variants.portrait.dialog.bottom - variants.portrait.viewport.height) <= 1
      && variants.portrait.dialog.overflowY === "auto"
      && variants.portrait.dialog.scrollHeight > variants.portrait.dialog.clientHeight + 1
      && variants.portrait.dialog.reachedScroll > 1,
    `${label} tall portrait photo makes the Dialog controls unreachable`,
  );
}

async function expectWishDetailsOpen(page, label, { owner = false, checkHover = false, checkImageRatios = false } = {}) {
  const card = page.locator(".wish-card").first();
  await card.waitFor({ state: "visible" });
  const title = (await card.locator("h3").innerText()).trim();
  const opener = card.getByRole("button", { name: `Открыть желание «${title}»` });
  await opener.click();
  const dialog = page.getByRole("dialog", { name: `Желание: ${title}` });
  await dialog.waitFor({ state: "visible" });
  assert(await dialog.getAttribute("data-slot") === "dialog-content", `${label} detail does not use the official shadcn DialogContent`);
  const dialogHeader = dialog.locator("[data-slot='dialog-header']");
  const dialogTitle = dialogHeader.locator("[data-slot='dialog-title']");
  const dialogDescription = dialogHeader.locator("[data-slot='dialog-description']");
  const actionGroup = dialog.locator(":scope > [data-slot='wish-actions']");
  assert(await dialogHeader.count() === 1, `${label} detail is missing its official DialogHeader`);
  assert(await dialogTitle.count() === 1, `${label} detail is missing its official DialogTitle`);
  assert(await dialogDescription.count() === 1, `${label} detail is missing its official DialogDescription`);
  assert(await dialog.locator(":scope > [data-slot='dialog-footer']").count() === 0, `${label} detail restored the unwanted DialogFooter wrapper`);
  assert(await actionGroup.count() === 1, `${label} detail is missing its unwrapped action group`);

  const priceRow = dialog.locator("[data-slot='wish-price-row']");
  const price = priceRow.locator("[data-slot='wish-price']");
  assert(await priceRow.count() === 1 && await price.count() === 1, `${label} detail is missing its price row`);
  const priceOrder = await dialogHeader.evaluate((header) => {
    const title = header.querySelector(":scope > [data-slot='dialog-title']");
    const priceRowElement = header.querySelector(":scope > [data-slot='wish-price-row']");
    const priceElement = priceRowElement?.querySelector(":scope > [data-slot='wish-price']");
    const description = header.querySelector(":scope > [data-slot='dialog-description']");
    const titleRect = title.getBoundingClientRect();
    const priceRect = priceElement.getBoundingClientRect();
    const descriptionRect = description.getBoundingClientRect();
    const priceStyle = getComputedStyle(priceElement);
    const originalPrice = priceElement.textContent;
    const maxPriceCases = ["RUB", "USD", "EUR", "KZT", "BYN"].map((currency) => {
      priceElement.textContent = new Intl.NumberFormat("ru-RU", {
        style: "currency",
        currency,
        maximumFractionDigits: 0,
      }).format(999999999);
      const bounds = priceElement.getBoundingClientRect();
      return {
        currency,
        text: priceElement.textContent,
        oneLine: priceElement.getClientRects().length === 1,
        contained: bounds.left >= priceRowElement.getBoundingClientRect().left - 1
          && bounds.right <= priceRowElement.getBoundingClientRect().right + 1,
        noOverflow: priceRowElement.scrollWidth <= priceRowElement.clientWidth + 1,
      };
    });
    priceElement.textContent = originalPrice;
    return {
      immediateSequence: title.nextElementSibling === priceRowElement && priceRowElement.nextElementSibling === description,
      oneDirectPrice: priceRowElement.querySelectorAll(":scope > [data-slot='wish-price']").length === 1,
      visual: titleRect.bottom <= priceRect.top + 1 && priceRect.bottom <= descriptionRect.top + 1,
      priceVisible: priceRect.width > 0 && priceRect.height > 0,
      horizontallyUnder: Math.max(titleRect.left, priceRect.left) < Math.min(titleRect.right, priceRect.right),
      fontSize: Number.parseFloat(priceStyle.fontSize),
      fontWeight: Number.parseFloat(priceStyle.fontWeight),
      whiteSpace: priceStyle.whiteSpace,
      expectedFontSize: window.innerWidth >= 640 ? 36 : 30,
      maxPriceCases,
    };
  });
  assert(priceOrder.immediateSequence && priceOrder.oneDirectPrice, `${label} price is not directly below the title in reading order`);
  assert(priceOrder.visual && priceOrder.priceVisible && priceOrder.horizontallyUnder, `${label} price is not visually below the title`);
  assert(
    Math.abs(priceOrder.fontSize - priceOrder.expectedFontSize) <= 1
      && priceOrder.fontWeight >= 600
      && priceOrder.whiteSpace === "nowrap",
    `${label} price is not using the enlarged responsive typography (${JSON.stringify(priceOrder)})`,
  );
  assert(
    priceOrder.maxPriceCases.every((probe) => probe.oneLine && probe.contained && probe.noOverflow),
    `${label} enlarged maximum price overflows its content rail (${JSON.stringify(priceOrder.maxPriceCases)})`,
  );

  const media = dialog.locator("[data-slot='wish-media']");
  assert(await media.count() === 1, `${label} detail is missing its wish photo`);
  assert(
    await media.locator('.priority, [title^="Важность:"]').count() === 0,
    `${label} detail photo still renders the unexplained priority indicator`,
  );
  assert(
    await media.locator(':scope > [data-slot="badge"].top-2.left-2').count() === 0,
    `${label} detail photo retains an empty priority badge`,
  );
  const expectedImageCount = await card.locator(".wish-card__image > img").count();
  const expectedImageAlt = `Фото желания «${title}»`;
  const contentOrder = await dialog.evaluate((element) => {
    const mediaElement = element.querySelector(":scope > [data-slot='wish-media']");
    const headerElement = element.querySelector(":scope > [data-slot='dialog-header']");
    const titleElement = headerElement?.querySelector("[data-slot='dialog-title']");
    const imageElement = mediaElement?.querySelector(":scope > img");
    const fallbackElement = mediaElement?.querySelector(":scope > span");
    const fallbackIcon = mediaElement?.querySelector(":scope > span > svg");
    const mediaRect = mediaElement.getBoundingClientRect();
    const headerRect = headerElement.getBoundingClientRect();
    const imageRect = imageElement?.getBoundingClientRect();
    const fallbackRect = fallbackElement?.getBoundingClientRect();
    const mediaStyle = getComputedStyle(mediaElement);
    return {
      directChildren: mediaElement.parentElement === element && headerElement.parentElement === element,
      mediaBeforeTitle: Boolean(mediaElement.compareDocumentPosition(titleElement) & Node.DOCUMENT_POSITION_FOLLOWING),
      visuallyOrdered: mediaRect.width > 0
        && mediaRect.height > 0
        && headerRect.width > 0
        && headerRect.height > 0
        && mediaRect.bottom <= headerRect.top + 1,
      imageCount: mediaElement.querySelectorAll(":scope > img").length,
      imageAlt: imageElement?.getAttribute("alt") || null,
      mediaAspectRatio: mediaStyle.aspectRatio,
      mediaSize: { width: mediaRect.width, height: mediaRect.height },
      imageSize: imageRect ? { width: imageRect.width, height: imageRect.height } : null,
      naturalSize: imageElement ? { width: imageElement.naturalWidth, height: imageElement.naturalHeight } : null,
      imageClasses: imageElement?.className || "",
      fallbackSize: fallbackRect ? { width: fallbackRect.width, height: fallbackRect.height } : null,
      fallbackHidden: fallbackIcon?.getAttribute("aria-hidden") === "true",
    };
  });
  assert(contentOrder.directChildren && contentOrder.mediaBeforeTitle, `${label} wish photo is not before the title in reading order`);
  assert(contentOrder.visuallyOrdered, `${label} wish photo is not visually above the title`);
  assert(contentOrder.imageCount === expectedImageCount, `${label} detail photo does not match its source card`);
  if (expectedImageCount === 1) {
    assert(contentOrder.imageAlt === expectedImageAlt, `${label} wish photo lost its accessible name`);
    assert(await media.getByRole("img", { name: expectedImageAlt, exact: true }).count() === 1, `${label} wish photo is not exposed as one named image`);
    assert(contentOrder.mediaAspectRatio === "auto", `${label} wish photo is still forced into a fixed media aspect ratio`);
    assert(contentOrder.imageClasses.includes("w-full") && contentOrder.imageClasses.includes("h-auto"), `${label} wish photo lost its fluid intrinsic sizing`);
    assert(
      contentOrder.naturalSize.width > 0
        && contentOrder.naturalSize.height > 0
        && Math.abs(contentOrder.imageSize.width - contentOrder.mediaSize.width) <= 1
        && Math.abs(contentOrder.imageSize.height - contentOrder.mediaSize.height) <= 1,
      `${label} wish photo does not fill the media width`,
    );
    const renderedRatio = contentOrder.imageSize.width / contentOrder.imageSize.height;
    const naturalRatio = contentOrder.naturalSize.width / contentOrder.naturalSize.height;
    assert(Math.abs(renderedRatio - naturalRatio) <= .01, `${label} wish photo no longer preserves its intrinsic proportion`);
  } else {
    assert(contentOrder.fallbackHidden, `${label} decorative empty-photo fallback is exposed to assistive technology`);
    assert(
      contentOrder.fallbackSize
        && Math.abs(contentOrder.fallbackSize.width - contentOrder.mediaSize.width) <= 1
        && contentOrder.fallbackSize.height > 0,
      `${label} empty-photo fallback collapsed after removing the fixed media ratio`,
    );
  }
  if (checkImageRatios && expectedImageCount === 1) await expectFluidWishMediaVariants(dialog, label);

  assert(await dialog.locator(':scope > [data-slot="wish-author"]').count() === 0, `${label} detail still renders the retired author block`);
  assert(await dialog.locator(":scope > a:not(.wish-buy-action)").count() === 0, `${label} detail retains an unlabelled author link`);
  assert(
    await dialog.evaluate((element) => {
      const header = element.querySelector(':scope > [data-slot="dialog-header"]');
      const toolbar = element.querySelector(':scope > [data-slot="wish-toolbar"]');
      return header?.nextElementSibling === toolbar;
    }),
    `${label} detail retains an empty block between its header and controls`,
  );

  await expectBuyActionBelowToolbar(dialog, label);

  const optionsTrigger = actionGroup.getByRole("button", { name: `Опции желания «${title}»`, exact: true });
  const primaryAction = actionGroup.locator(':scope > [data-slot="button"]:not([aria-label^="Опции желания"])');
  assert(await optionsTrigger.count() === 1, `${label} options action is not in the wish action group`);
  assert(await primaryAction.count() === 1, `${label} wish action group does not expose exactly one primary action`);
  if (!owner) {
    const reservationLabel = (await primaryAction.innerText()).replace(/\s+/g, " ").trim();
    assert(
      /^(?:Забронировать|Забронировано вами|Уже забронировано)$/.test(reservationLabel),
      `${label} detail lost its reservation action (${reservationLabel || "empty"})`,
    );
  }
  assert(await optionsTrigger.getAttribute("data-slot") === "dropdown-menu-trigger", `${label} options action is not the official dropdown trigger`);
  assert(await optionsTrigger.getAttribute("title") === "Опции желания", `${label} options action lost its tooltip`);
  assert(await optionsTrigger.locator(":scope > svg").count() === 1 && (await optionsTrigger.textContent()).trim() === "", `${label} options action is no longer icon-only`);
  assert(
    await dialog.locator('[data-slot="wish-toolbar"] [aria-label^="Опции желания"]').count() === 0,
    `${label} options action still renders in the wish toolbar`,
  );
  await actionGroup.scrollIntoViewIfNeeded();
  await dialog.evaluate(async (element) => {
    await Promise.all(element.getAnimations({ subtree: true }).map((animation) => animation.finished.catch(() => {})));
  });
  await page.mouse.move(0, 0);
  await page.waitForTimeout(240);
  const actionGeometry = await actionGroup.evaluate((group, { optionsName, ownerView }) => {
    const options = [...group.querySelectorAll(":scope > button")].find((button) => button.getAttribute("aria-label") === optionsName);
    const primary = [...group.querySelectorAll(":scope > button")].find((button) => button !== options);
    const groupRect = group.getBoundingClientRect();
    const primaryRect = primary.getBoundingClientRect();
    const optionsRect = options.getBoundingClientRect();
    const groupStyle = getComputedStyle(group);
    const toolbar = group.parentElement.querySelector(":scope > [data-slot='wish-toolbar']");
    const buy = group.parentElement.querySelector(":scope > .wish-buy-action");
    const previous = buy || toolbar;
    const previousRect = previous.getBoundingClientRect();
    const notice = group.parentElement.querySelector(":scope > [data-slot='alert']");
    const noticeRect = notice?.getBoundingClientRect();
    const isHittable = (element, rect) => {
      const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      return hit === element || element.contains(hit);
    };
    const chrome = (element) => {
      const style = getComputedStyle(element);
      return {
        backgroundColor: style.backgroundColor,
        color: style.color,
        borderColors: [style.borderTopColor, style.borderRightColor, style.borderBottomColor, style.borderLeftColor],
        borderWidths: [style.borderTopWidth, style.borderRightWidth, style.borderBottomWidth, style.borderLeftWidth],
        borderStyles: [style.borderTopStyle, style.borderRightStyle, style.borderBottomStyle, style.borderLeftStyle],
        borderRadii: [style.borderTopLeftRadius, style.borderTopRightRadius, style.borderBottomRightRadius, style.borderBottomLeftRadius],
        boxShadow: style.boxShadow,
      };
    };
    return {
      direct: group.parentElement?.getAttribute("data-slot") === "dialog-content",
      sequence: previous.nextElementSibling === group && (ownerView ? !notice : group.nextElementSibling === notice),
      group: { left: groupRect.left, top: groupRect.top, right: groupRect.right, bottom: groupRect.bottom, clientWidth: group.clientWidth, scrollWidth: group.scrollWidth },
      previous: { left: previousRect.left, right: previousRect.right, bottom: previousRect.bottom },
      notice: noticeRect ? { left: noticeRect.left, top: noticeRect.top, right: noticeRect.right } : null,
      flexDirection: groupStyle.flexDirection,
      flexWrap: groupStyle.flexWrap,
      gap: Number.parseFloat(groupStyle.columnGap),
      chrome: {
        backgroundColor: groupStyle.backgroundColor,
        backgroundImage: groupStyle.backgroundImage,
        borderWidths: [groupStyle.borderTopWidth, groupStyle.borderRightWidth, groupStyle.borderBottomWidth, groupStyle.borderLeftWidth].map(Number.parseFloat),
        borderRadii: [groupStyle.borderTopLeftRadius, groupStyle.borderTopRightRadius, groupStyle.borderBottomRightRadius, groupStyle.borderBottomLeftRadius].map(Number.parseFloat),
        padding: [groupStyle.paddingTop, groupStyle.paddingRight, groupStyle.paddingBottom, groupStyle.paddingLeft].map(Number.parseFloat),
        boxShadow: groupStyle.boxShadow,
      },
      primary: { left: primaryRect.left, top: primaryRect.top, right: primaryRect.right, bottom: primaryRect.bottom, width: primaryRect.width, height: primaryRect.height, hittable: isHittable(primary, primaryRect), chrome: chrome(primary) },
      options: { left: optionsRect.left, top: optionsRect.top, right: optionsRect.right, bottom: optionsRect.bottom, width: optionsRect.width, height: optionsRect.height, hittable: isHittable(options, optionsRect), chrome: chrome(options) },
    };
  }, { optionsName: `Опции желания «${title}»`, ownerView: owner });
  assert(actionGeometry.direct && actionGeometry.sequence, `${label} actions are not directly below the buy action or list toolbar`);
  assert(
    actionGeometry.previous.bottom <= actionGeometry.group.top + 1
      && Math.abs(actionGeometry.previous.left - actionGeometry.group.left) <= 1
      && Math.abs(actionGeometry.previous.right - actionGeometry.group.right) <= 1
      && (!actionGeometry.notice || (
        actionGeometry.group.bottom <= actionGeometry.notice.top + 1
        && Math.abs(actionGeometry.notice.left - actionGeometry.group.left) <= 1
        && Math.abs(actionGeometry.notice.right - actionGeometry.group.right) <= 1
      )),
    `${label} actions are not aligned between the buy action and visitor notice`,
  );
  assert(
    ["transparent", "rgba(0, 0, 0, 0)"].includes(actionGeometry.chrome.backgroundColor)
      && actionGeometry.chrome.backgroundImage === "none"
      && actionGeometry.chrome.borderWidths.every((value) => value === 0)
      && actionGeometry.chrome.borderRadii.every((value) => value === 0)
      && actionGeometry.chrome.padding.every((value) => value === 0)
      && actionGeometry.chrome.boxShadow === "none",
    `${label} actions retain the removed footer wrapper chrome: ${JSON.stringify(actionGeometry.chrome)}`,
  );
  assert(actionGeometry.flexDirection === "row" && actionGeometry.flexWrap === "nowrap", `${label} actions are not kept in one row`);
  assert(Math.abs(actionGeometry.primary.top - actionGeometry.options.top) <= 1 && Math.abs(actionGeometry.primary.bottom - actionGeometry.options.bottom) <= 1, `${label} actions are not vertically aligned`);
  assert(actionGeometry.gap >= 7 && actionGeometry.gap <= 9 && actionGeometry.primary.right <= actionGeometry.options.left - 7, `${label} actions have the wrong horizontal gap`);
  assert(actionGeometry.primary.height >= 47 && actionGeometry.primary.width > actionGeometry.options.width * 2, `${label} primary action is not a usable 48px full-width control`);
  assert(actionGeometry.options.width >= 47 && actionGeometry.options.height >= 47 && Math.abs(actionGeometry.options.width - actionGeometry.options.height) <= 1, `${label} options action is not a square 48px Large touch target`);
  assert(actionGeometry.primary.hittable && actionGeometry.options.hittable, `${label} action is covered by another element`);
  assert(
    Math.abs(actionGeometry.primary.left - actionGeometry.group.left) <= 1
      && Math.abs(actionGeometry.options.right - actionGeometry.group.right) <= 1
      && actionGeometry.group.scrollWidth <= actionGeometry.group.clientWidth + 1,
    `${label} actions overflow their row`,
  );
  if (owner) {
    assert(JSON.stringify(actionGeometry.options.chrome) === JSON.stringify(actionGeometry.primary.chrome), `${label} options action does not match the neighboring outline button`);
  }
  if (owner && checkHover) {
    const readChrome = (locator) => locator.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        backgroundColor: style.backgroundColor,
        color: style.color,
        borderColors: [style.borderTopColor, style.borderRightColor, style.borderBottomColor, style.borderLeftColor],
        borderWidths: [style.borderTopWidth, style.borderRightWidth, style.borderBottomWidth, style.borderLeftWidth],
        borderStyles: [style.borderTopStyle, style.borderRightStyle, style.borderBottomStyle, style.borderLeftStyle],
        borderRadii: [style.borderTopLeftRadius, style.borderTopRightRadius, style.borderBottomRightRadius, style.borderBottomLeftRadius],
        boxShadow: style.boxShadow,
      };
    });
    await optionsTrigger.hover();
    await page.waitForTimeout(240);
    const optionsHover = await readChrome(optionsTrigger);
    await page.mouse.move(0, 0);
    await primaryAction.hover();
    await page.waitForTimeout(240);
    const primaryHover = await readChrome(primaryAction);
    assert(JSON.stringify(optionsHover) === JSON.stringify(primaryHover), `${label} options action hover does not match the neighboring outline button`);
    await page.mouse.move(0, 0);
  }
  const listSelectTrigger = dialog.locator('[data-slot="wish-toolbar"] [aria-label^="Изменить списки желания"]');
  if (await listSelectTrigger.count()) {
    const listSelectGeometry = await listSelectTrigger.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return {
        height: rect.height,
        width: rect.width,
        hittable: (() => {
          const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
          return hit === element || element.contains(hit);
        })(),
      };
    });
    assert(
      listSelectGeometry.height >= 47
        && Math.abs(listSelectGeometry.height - actionGeometry.primary.height) <= 1
        && listSelectGeometry.width >= 47
        && listSelectGeometry.hittable,
      `${label} list select is not the same usable height as the dialog buttons (${JSON.stringify({ listSelect: listSelectGeometry, buttonHeight: actionGeometry.primary.height })})`,
    );
  }
  assert(
    (await dialogTitle.textContent()).replace(/\s+/g, " ").trim() === `Желание: ${title}`,
    `${label} detail has the wrong DialogTitle`,
  );
  const titleId = await dialogTitle.getAttribute("id");
  const labelledBy = (await dialog.getAttribute("aria-labelledby") || "").split(/\s+/);
  assert(titleId && labelledBy.includes(titleId), `${label} detail is not labelled by its official DialogTitle`);
  const descriptionId = await dialogDescription.getAttribute("id");
  const describedBy = (await dialog.getAttribute("aria-describedby") || "").split(/\s+/);
  assert(descriptionId && describedBy.includes(descriptionId), `${label} detail is not described by its official DialogDescription`);
  const close = dialog.getByRole("button", { name: "Close", exact: true });
  assert(await close.count() === 1, `${label} detail must expose exactly one close action`);
  assert(await close.getAttribute("data-slot") === "dialog-close", `${label} detail close action is not the official DialogClose`);
  const overlays = page.locator("[data-slot='dialog-overlay'][data-open]");
  assert(await overlays.count() === 1 && await overlays.first().isVisible(), `${label} detail is missing the official Dialog overlay`);
  assert(await overlays.first().getAttribute("role") === "presentation", `${label} detail overlay is not the official presentation backdrop`);
  const overlayClasses = (await overlays.first().getAttribute("class") || "").split(/\s+/);
  for (const className of ["fixed", "inset-0", "bg-black/10", "supports-backdrop-filter:backdrop-blur-xs"]) {
    assert(overlayClasses.includes(className), `${label} detail overlay lost the native shadcn ${className} class`);
  }
  assert(!overlayClasses.includes("modal-backdrop") && !overlayClasses.includes("!bg-transparent"), `${label} detail still uses the legacy transparent backdrop`);
  const nativeShell = await dialog.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    const contentRails = [...element.children]
      .filter((child) => child.getAttribute("data-slot") !== "dialog-close")
      .map((child) => {
        const childRect = child.getBoundingClientRect();
        return { left: childRect.left, right: childRect.right, width: childRect.width };
      });
    return {
      classes: element.className.split(/\s+/),
      rect: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height },
      viewport: { width: window.innerWidth, height: window.innerHeight },
      position: style.position,
      backgroundColor: style.backgroundColor,
      borderRadius: Number.parseFloat(style.borderTopLeftRadius),
      padding: [style.paddingTop, style.paddingRight, style.paddingBottom, style.paddingLeft].map(Number.parseFloat),
      overflowY: style.overflowY,
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
      contentRails,
    };
  });
  for (const className of ["wish-details-dialog", "bg-popover", "p-4"]) {
    assert(nativeShell.classes.includes(className), `${label} detail lost the shadcn-based ${className} shell class`);
  }
  assert(!nativeShell.classes.includes("modal") && !nativeShell.classes.includes("modal--wish-detail"), `${label} detail still uses the legacy modal shell`);
  assert(nativeShell.position === "fixed", `${label} detail is not using the native fixed Dialog position`);
  assert(nativeShell.borderRadius === 0 && nativeShell.padding.every((value) => value === 16), `${label} detail does not use an edge-to-edge surface with a readable inner inset`);
  assert(nativeShell.overflowY === "auto", `${label} detail does not keep tall intrinsic photos scrollable`);
  const expectedRailWidth = Math.min(448, nativeShell.rect.width - nativeShell.padding[1] - nativeShell.padding[3]);
  const referenceRail = nativeShell.contentRails[0];
  assert(
    nativeShell.contentRails.length >= 4
      && nativeShell.contentRails.every((rail) => Math.abs(rail.width - expectedRailWidth) <= 2
        && Math.abs((rail.left + rail.right) / 2 - nativeShell.viewport.width / 2) <= 2
        && Math.abs(rail.left - referenceRail.left) <= 1
        && Math.abs(rail.right - referenceRail.right) <= 1),
    `${label} detail content is not aligned inside its ${expectedRailWidth}px rail: ${JSON.stringify(nativeShell)}`,
  );
  await expectEdgeToEdgeWishDetailGeometry(dialog, `${label} fullscreen detail`);
  if (nativeShell.scrollHeight > nativeShell.clientHeight + 1) {
    const scrollProbe = await dialog.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
      const reached = element.scrollTop;
      element.scrollTop = 0;
      return reached;
    });
    assert(scrollProbe > 1, `${label} tall intrinsic photo leaves the Dialog controls unreachable`);
  }
  await dialog.locator(":focus").waitFor({ state: "visible" });
  assert(await dialog.evaluate((element) => element.contains(document.activeElement)), `${label} detail did not move focus inside the Dialog`);
  assert(await page.locator("html").evaluate((element) => getComputedStyle(element).overflowY === "hidden"), `${label} detail did not lock page scrolling`);
  assert((await dialog.getByRole("heading", { name: `Желание: ${title}`, exact: true }).count()) === 1, `${label} detail does not show the selected wish title`);
  assert(await dialog.locator("[data-slot='wish-price']").isVisible(), `${label} detail does not show the selected wish price`);
  assert((await dialog.locator(".wish-detail__meta").count()) === 0, `${label} detail still shows the removed metadata pills`);
  return { card, title, opener, dialog };
}

async function expectStandaloneBuyAction(dialog, expectedUrl, label) {
  const buyLink = await expectBuyActionBelowToolbar(dialog, label, { required: true });
  const state = await buyLink.evaluate((link, url) => {
    const rect = link.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    return {
      isAnchor: link.tagName === "A",
      role: link.getAttribute("role"),
      slot: link.getAttribute("data-slot"),
      usesButtonVariants: link.classList.contains("inline-flex")
        && link.classList.contains("rounded-lg")
        && link.classList.contains("bg-primary"),
      href: link.href,
      expectedHref: new URL(url).href,
      target: link.target,
      rel: link.rel.split(/\s+/),
      width: rect.width,
      height: rect.height,
      hittable: hit === link || link.contains(hit),
      directDialogChild: link.parentElement?.getAttribute("data-slot") === "dialog-content",
      priceRowContainsBuyAction: Boolean(link.closest("[data-slot='wish-price-row']")),
    };
  }, expectedUrl);
  assert(
    state.isAnchor
      && state.role === null
      && state.slot === null
      && state.usesButtonVariants
      && state.href === state.expectedHref
      && state.target === "_blank"
      && state.rel.includes("noreferrer"),
    `${label} must remain a native link styled with shadcn buttonVariants`,
  );
  assert(state.width >= 47 && state.height >= 47 && state.hittable, `${label} is not a usable 48px Large touch target (${JSON.stringify({ width: state.width, height: state.height, hittable: state.hittable })})`);
  assert(
    state.directDialogChild && !state.priceRowContainsBuyAction,
    `${label} is still wrapped with the price instead of following the list selector`,
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
  await expectCleanDestructiveMenuState(page, deleteItem, `${label} delete action`, { checkHover: !mobile });
  await expectLargeAppControls(menu, `${label} root menu controls`);
  if (mobile) {
    assert(triggerGeometry.width >= 47 && triggerGeometry.height >= 47, `${label} trigger is smaller than the 48px Large touch size`);
    await expectMobileTouchTargets(rootItems, `${label} root menu`);
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
  await expectOfficialDetailListCheckboxes(options, categoryLists, wish.listIds, `${label} list submenu`);
  const listOptionGeometry = await options.evaluateAll((items) => items.map((item) => {
    const rect = item.getBoundingClientRect();
    const title = item.querySelector(":scope > .card-menu__list-title");
    const titleRect = title?.getBoundingClientRect();
    const state = item.querySelector(":scope > [data-slot='checkbox']");
    const stateRect = state?.getBoundingClientRect();
    const style = getComputedStyle(item);
    return {
      height: rect.height,
      titleLeft: titleRect?.left ?? null,
      titleRight: titleRect?.right ?? null,
      stateLeft: stateRect?.left ?? null,
      stateRight: stateRect?.right ?? null,
      rowLeft: rect.left,
      rowRight: rect.right,
      paddingLeft: Number.parseFloat(style.paddingLeft),
      paddingRight: Number.parseFloat(style.paddingRight),
      backgroundImage: style.backgroundImage,
    };
  }));
  assert(listOptionGeometry.every((item) => item.backgroundImage === "none"), `${label} list submenu renders a background image`);
  assert(
    listOptionGeometry.every((item) => item.titleLeft !== null && item.titleLeft >= item.rowLeft && item.titleRight <= item.rowRight + 1),
    `${label} list submenu titles overflow their choices`,
  );
  assert(
    listOptionGeometry.every((item) => (
      item.stateLeft !== null
      && item.titleRight <= item.stateLeft - 6
      && item.stateRight <= item.rowRight + 1
      && item.rowRight - item.stateRight >= 5
      && item.rowRight - item.stateRight <= 10
      && Math.abs(item.paddingLeft - item.paddingRight) <= 1
    )),
    `${label} list submenu keeps an asymmetric right inset`,
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
  await expectLargeAppControls(listMenu, `${label} list submenu controls`);
  if (mobile) {
    await expectMobileTouchTargets(options, `${label} list submenu`);
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
  await detail.dialog.locator("[data-slot='wish-media']").click({ position: { x: 32, y: 32 } });
  await pointerMenu.waitFor({ state: "detached" });
  await detail.dialog.waitFor({ state: "visible" });
  assert(await trigger.getAttribute("aria-expanded") === "false", `${label} outside dismissal left the trigger expanded`);

  await trigger.click();
  const deleteMenu = page.locator(`[id=${JSON.stringify(menuId)}]`);
  await deleteMenu.getByRole("menuitem", { name: "Удалить", exact: true }).click();
  await deleteMenu.waitFor({ state: "detached" });
  const deleteDialog = page.getByRole("alertdialog", { name: `Удалить «${wish.title}»?`, exact: true });
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
    const modal = element.closest("[data-slot='dialog-content']");
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
  const generalTile = page.locator(".wishes-page .list-tabs [data-slot='toggle-group-item']").first();
  await generalTile.waitFor({ state: "visible" });
  assert((await generalTile.innerText()).includes("Не отсортированные"), `${label} first list tile is not the unsorted wish list`);
  assert(await generalTile.locator(":scope > svg").count() === 0, `${label} first list tile still shows the heart icon`);

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

async function expectWishListTileButtonStates(page, label, { checkHover = false } = {}) {
  const tiles = page.locator('.wishes-page .list-tabs [data-slot="toggle-group-item"]');
  await tiles.first().waitFor({ state: "visible" });
  await page.mouse.move(0, 0);
  const states = await tiles.evaluateAll((elements) => elements.map((element) => {
    const style = getComputedStyle(element);
    return {
      pressed: element.getAttribute("aria-pressed"),
      backgroundColor: style.backgroundColor,
      backgroundImage: style.backgroundImage,
      color: style.color,
    };
  }));
  assert(states.length >= 2, `${label} needs at least two list tiles`);
  assert(states.filter((state) => state.pressed === "true").length === 1, `${label} does not expose exactly one selected list tile`);
  assert(
    states.every((state) => state.backgroundColor !== "transparent" && state.backgroundColor !== "rgba(0, 0, 0, 0)" && state.backgroundImage === "none"),
    `${label} still contains a transparent list tile: ${JSON.stringify(states)}`,
  );
  const selected = states.find((state) => state.pressed === "true");
  const idleStates = states.filter((state) => state.pressed === "false");
  assert(idleStates.every((state) => state.backgroundColor === idleStates[0].backgroundColor), `${label} idle list tiles do not share one button surface`);
  assert(
    selected.backgroundColor !== idleStates[0].backgroundColor || selected.color !== idleStates[0].color,
    `${label} selected list tile is not visually distinct from idle buttons`,
  );

  if (!checkHover) return;
  const hoverTarget = page.locator('.wishes-page .list-tabs [data-slot="toggle-group-item"][aria-pressed="false"]').first();
  const idleBackground = await hoverTarget.evaluate((element) => getComputedStyle(element).backgroundColor);
  await hoverTarget.hover();
  await page.waitForTimeout(240);
  const hoverState = await hoverTarget.evaluate((element) => ({
    hovered: element.matches(":hover"),
    backgroundColor: getComputedStyle(element).backgroundColor,
  }));
  assert(hoverState.hovered, `${label} list tile did not enter hover state`);
  assert(hoverState.backgroundColor !== idleBackground, `${label} list tile hover does not change its button surface`);
  await page.mouse.move(0, 0);
  await hoverTarget.press("Escape");
  await page.waitForTimeout(50);
  const focusState = await hoverTarget.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      focusVisible: element.matches(":focus-visible"),
      outlineStyle: style.outlineStyle,
      outlineWidth: Number.parseFloat(style.outlineWidth),
      boxShadow: style.boxShadow,
    };
  });
  assert(focusState.focusVisible, `${label} list tile has no keyboard focus-visible state`);
  assert(
    (focusState.outlineStyle !== "none" && focusState.outlineWidth >= 2) || focusState.boxShadow !== "none",
    `${label} list tile keyboard focus ring is missing`,
  );
  await page.evaluate(() => document.activeElement?.blur());
}

async function expectWishListTileContentGeometry(page, label) {
  const tiles = page.locator('.wishes-page .list-tabs [data-slot="toggle-group-item"]');
  await tiles.first().waitFor({ state: "visible" });
  const assertGeometry = (geometry, geometryLabel) => {
    assert(geometry.hasStructure, `${geometryLabel} does not expose separate title and count rows`);
    assert(geometry.titleText && geometry.countText, `${geometryLabel} lost its visible title or count`);
    assert(geometry.accessibleName.startsWith(geometry.titleText) && geometry.accessibleName.includes(geometry.countText), `${geometryLabel} accessible name does not preserve its full title and count`);
    assert(geometry.title.left >= geometry.tile.left + geometry.padding.left - 1 && geometry.title.right <= geometry.tile.right - geometry.padding.right + 1, `${geometryLabel} title escapes the tile horizontally`);
    assert(geometry.title.top >= geometry.tile.top + geometry.padding.top - 1, `${geometryLabel} title escapes the tile above`);
    assert(geometry.meta.left >= geometry.tile.left + geometry.padding.left - 1 && geometry.meta.right <= geometry.tile.right - geometry.padding.right + 1, `${geometryLabel} count row escapes the tile horizontally`);
    assert(
      geometry.meta.bottom <= geometry.tile.bottom - geometry.padding.bottom + 1,
      `${geometryLabel} count row escapes the tile below: ${JSON.stringify({ meta: geometry.meta, tile: geometry.tile, padding: geometry.padding })}`,
    );
    assert(geometry.title.bottom <= geometry.meta.top + 0.5, `${geometryLabel} title overlaps the count row: ${JSON.stringify({ title: geometry.title, meta: geometry.meta, tile: geometry.tile, padding: geometry.padding, lineHeight: geometry.titleLineHeight })}`);
    assert(geometry.title.height <= geometry.titleLineHeight * 2 + 1, `${geometryLabel} title exceeds its two-line budget`);
    assert(geometry.count.width > 0 && geometry.count.height > 0 && geometry.countFlexShrink === "0", `${geometryLabel} count can be clipped or collapsed`);
    assert(geometry.scrollWidth <= geometry.clientWidth + 1, `${geometryLabel} content overflows its tile`);
  };
  const geometries = await tiles.evaluateAll((elements) => elements.map((element) => {
    const title = element.querySelector(':scope > [data-slot="list-tile-label"]');
    const meta = element.querySelector(':scope > [data-slot="list-tile-meta"]');
    const count = meta?.querySelector('[data-slot="list-tile-count"]');
    const tileRect = element.getBoundingClientRect();
    const titleRect = title?.getBoundingClientRect();
    const metaRect = meta?.getBoundingClientRect();
    const countRect = count?.getBoundingClientRect();
    const tileStyle = getComputedStyle(element);
    const titleStyle = title ? getComputedStyle(title) : null;
    const countStyle = count ? getComputedStyle(count) : null;
    return {
      hasStructure: Boolean(title && meta && count),
      titleText: title?.textContent?.trim() || "",
      countText: count?.textContent?.trim() || "",
      accessibleName: element.getAttribute("aria-label") || "",
      tile: { left: tileRect.left, top: tileRect.top, right: tileRect.right, bottom: tileRect.bottom },
      title: titleRect ? { left: titleRect.left, top: titleRect.top, right: titleRect.right, bottom: titleRect.bottom, height: titleRect.height } : null,
      meta: metaRect ? { left: metaRect.left, top: metaRect.top, right: metaRect.right, bottom: metaRect.bottom } : null,
      count: countRect ? { width: countRect.width, height: countRect.height } : null,
      padding: {
        top: Number.parseFloat(tileStyle.paddingTop),
        right: Number.parseFloat(tileStyle.paddingRight),
        bottom: Number.parseFloat(tileStyle.paddingBottom),
        left: Number.parseFloat(tileStyle.paddingLeft),
      },
      titleLineHeight: titleStyle ? Number.parseFloat(titleStyle.lineHeight) : 0,
      countFlexShrink: countStyle?.flexShrink,
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
    };
  }));
  geometries.forEach((geometry, index) => assertGeometry(geometry, `${label} tile ${index + 1}`));

  const stressed = await tiles.first().evaluate(async (element) => {
    const title = element.querySelector(':scope > [data-slot="list-tile-label"]');
    const meta = element.querySelector(':scope > [data-slot="list-tile-meta"]');
    const previous = title.textContent;
    title.textContent = "Очень длинное название списка желаний";
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const titleRect = title.getBoundingClientRect();
    const metaRect = meta.getBoundingClientRect();
    const lineHeight = Number.parseFloat(getComputedStyle(title).lineHeight);
    const result = {
      titleBottom: titleRect.bottom,
      titleHeight: titleRect.height,
      metaTop: metaRect.top,
      lineHeight,
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
    };
    title.textContent = previous;
    await new Promise((resolve) => requestAnimationFrame(resolve));
    return result;
  });
  assert(stressed.titleBottom <= stressed.metaTop + 0.5, `${label} long title overlaps the count row`);
  assert(stressed.titleHeight <= stressed.lineHeight * 2 + 1, `${label} long title exceeds its two-line budget`);
  assert(stressed.scrollWidth <= stressed.clientWidth + 1, `${label} long title overflows its tile`);
}

async function expectWishListCarouselBleed(page, label) {
  const carousel = page.locator(".wishes-page > .list-tabs");
  await carousel.waitFor({ state: "visible" });
  await expectWishListTileContentGeometry(page, label);
  const geometry = await carousel.evaluate(async (element) => {
    const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));
    const settle = async () => {
      await nextFrame();
      await nextFrame();
    };
    const rect = (node) => {
      const value = node.getBoundingClientRect();
      return { left: value.left, right: value.right, width: value.width };
    };
    const initialScrollLeft = element.scrollLeft;
    const previousScrollBehavior = element.style.scrollBehavior;
    element.style.scrollBehavior = "auto";
    element.scrollLeft = 0;
    await settle();
    const content = document.querySelector(".wishes-page > .wish-grid")
      ?? document.querySelector(".wishes-page > .wishes-page__hero");
    const track = element.querySelector(":scope > .list-tabs__track");
    const firstTile = element.querySelector('[data-slot="toggle-group-item"]');
    const terminalTile = element.querySelector(".list-tabs__add")
      ?? [...element.querySelectorAll('[data-slot="toggle-group-item"]')].at(-1);
    const maxScroll = Math.max(0, element.scrollWidth - element.clientWidth);
    const elementRect = rect(element);
    const trackRect = track ? rect(track) : null;
    const firstTileRect = rect(firstTile);
    const initialTerminalTileRect = terminalTile ? rect(terminalTile) : null;
    const contentRect = rect(content);
    const leadingInset = firstTileRect.left - elementRect.left;
    const tileSpan = initialTerminalTileRect ? initialTerminalTileRect.right - firstTileRect.left : 0;
    const shouldCenter = tileSpan <= contentRect.width + 1;
    let leadingScroll = null;
    let leadingTileRect = null;
    if (!shouldCenter && leadingInset > 1 && maxScroll >= leadingInset - 1) {
      element.scrollLeft = Math.min(leadingInset, maxScroll);
      await settle();
      leadingScroll = element.scrollLeft;
      leadingTileRect = rect(firstTile);
    }
    element.scrollLeft = maxScroll;
    await settle();
    const reachedScroll = element.scrollLeft;
    const terminalTileRect = terminalTile ? rect(terminalTile) : null;
    const style = getComputedStyle(element);
    element.scrollLeft = initialScrollLeft;
    element.style.scrollBehavior = previousScrollBehavior;
    await settle();
    return {
      carousel: elementRect,
      track: trackRect,
      content: contentRect,
      firstTile: firstTileRect,
      initialTerminalTile: initialTerminalTileRect,
      leadingTile: leadingTileRect,
      terminalTile: terminalTileRect,
      overflowX: style.overflowX,
      paddingLeft: Number.parseFloat(style.paddingLeft),
      paddingRight: Number.parseFloat(style.paddingRight),
      initialScrollLeft,
      leadingInset,
      tileSpan,
      shouldCenter,
      leadingScroll,
      maxScroll,
      reachedScroll,
      rootClientWidth: document.documentElement.clientWidth,
      rootScrollWidth: Math.max(document.documentElement.scrollWidth, document.body?.scrollWidth ?? 0),
    };
  });
  assert(geometry.track, `${label} is missing its centered tile track`);
  assert(Math.abs(geometry.initialScrollLeft) <= 1, `${label} does not start at its leading edge (${geometry.initialScrollLeft}px)`);
  assert(Math.abs(geometry.carousel.left) <= 2, `${label} stops before the left viewport edge`);
  assert(Math.abs(geometry.carousel.right - geometry.rootClientWidth) <= 2, `${label} stops before the viewport edge`);
  assert(["auto", "scroll"].includes(geometry.overflowX), `${label} lost horizontal scrolling`);
  assert(geometry.paddingLeft <= 0.5 && geometry.paddingRight <= 0.5, `${label} still pads the viewport-wide scrollport`);
  assert(geometry.rootScrollWidth <= geometry.rootClientWidth + 1, `${label} causes page-level horizontal overflow`);
  if (geometry.shouldCenter) {
    const tileCenter = (geometry.firstTile.left + geometry.initialTerminalTile.right) / 2;
    const contentCenter = (geometry.content.left + geometry.content.right) / 2;
    assert(geometry.maxScroll <= 1, `${label} creates scrolling for a short tile row`);
    assert(Math.abs(tileCenter - contentCenter) <= 2, `${label} does not center its short tile row`);
    assert(geometry.firstTile.left >= geometry.carousel.left - 1, `${label} clips the first centered tile`);
    assert(geometry.initialTerminalTile.right <= geometry.carousel.right + 1, `${label} clips the last centered tile`);
  } else {
    assert(
      Math.abs(geometry.firstTile.left - geometry.content.left) <= 2,
      `${label} does not start on the content grid (${geometry.firstTile.left}px vs ${geometry.content.left}px)`,
    );
    assert(
      Math.abs(geometry.track.left - geometry.content.left) <= 2,
      `${label} long tile track no longer starts on the content grid`,
    );
  }
  if (geometry.leadingScroll !== null) {
    assert(
      Math.abs(geometry.leadingScroll - geometry.leadingInset) <= 2,
      `${label} cannot scroll its first tile through the leading content gutter`,
    );
    assert(
      geometry.leadingTile && Math.abs(geometry.leadingTile.left - geometry.carousel.left) <= 2,
      `${label} first tile stops before the left viewport edge`,
    );
  }
  if (geometry.maxScroll > 1) {
    assert(
      Math.abs(geometry.reachedScroll - geometry.maxScroll) <= 2,
      `${label} cannot reach its hidden trailing tiles`,
    );
    assert(geometry.terminalTile && Math.abs(geometry.carousel.right - geometry.terminalTile.right) <= 2, `${label} last tile stops before the viewport edge`);
  }
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

async function expectNoListHeadingIcon(dialog, label) {
  assert(
    (await dialog.locator('.modal-icon, [data-slot="alert-dialog-media"], .modal-heading > svg').count()) === 0,
    `${label} still renders the decorative leading icon`,
  );
  assert(
    (await dialog.getByText("Новая глава", { exact: true }).count()) === 0,
    `${label} still renders the retired new-chapter eyebrow`,
  );
  assert(
    (await dialog.locator(".modal-heading p").count()) === 0,
    `${label} still renders the retired heading description`,
  );
}

async function expectListControlSizing(dialog, label) {
  await dialog.evaluate(async (element) => {
    await Promise.all(element.getAnimations({ subtree: true }).map((animation) => animation.finished.catch(() => {})));
  });
  const geometry = await dialog.evaluate((element) => {
    const read = (control) => {
      if (!control) return null;
      const rect = control.getBoundingClientRect();
      const style = getComputedStyle(control);
      return {
        width: rect.width,
        height: rect.height,
        fontSize: Number.parseFloat(style.fontSize),
        radius: Number.parseFloat(style.borderTopLeftRadius),
        paddingLeft: Number.parseFloat(style.paddingLeft),
        paddingRight: Number.parseFloat(style.paddingRight),
        borderWidth: Number.parseFloat(style.borderTopWidth),
      };
    };
    return {
      name: read(element.querySelector('[data-slot="input"]')),
      description: read(element.querySelector('[data-slot="textarea"]')),
      secretRow: read(element.querySelector('[data-slot="switch"]')?.closest('[data-slot="field"]')),
    };
  });
  assert(geometry.name && geometry.description && geometry.secretRow, `${label} is missing a canonical form control`);
  assert(geometry.name.height >= 47 && geometry.name.height <= 49, `${label} Input lost the app-level 48px Large geometry`);
  assert(geometry.description.height >= 95, `${label} Textarea is shorter than the app-level 96px Large geometry`);
  assert(
    [geometry.description, geometry.secretRow].every((control) => Math.abs(control.width - geometry.name.width) <= 1),
    `${label} controls have different widths: ${JSON.stringify(geometry)}`,
  );
  assert(
    [geometry.name, geometry.description].every((control) => (
      control.fontSize >= 13.5
      && control.fontSize <= 16.5
      && Math.abs(control.fontSize - geometry.name.fontSize) <= .1
      && Math.abs(control.radius - geometry.name.radius) <= 1
      && Math.abs(control.paddingLeft - geometry.name.paddingLeft) <= 1
      && Math.abs(control.paddingRight - geometry.name.paddingRight) <= 1
      && Math.abs(control.borderWidth - geometry.name.borderWidth) <= .1
    )),
    `${label} controls do not share typography and chrome: ${JSON.stringify(geometry)}`,
  );
  assert(geometry.secretRow.height >= 48, `${label} secret-list row is shorter than its 48px touch target`);
}

async function expectListSecretSwitch(dialog, label, { checked = false, toggleTo = null } = {}) {
  const control = dialog.getByRole("switch", { name: "Секретный список", exact: true });
  await control.waitFor({ state: "visible" });
  assert(await control.getAttribute("data-slot") === "switch", `${label} does not use the official shadcn Switch`);
  assert(await control.evaluate((element) => element.getAttribute("role") === "switch" && element.tabIndex === 0), `${label} switch is not keyboard-operable`);
  assert(await control.getAttribute("aria-checked") === String(checked), `${label} has the wrong initial state`);
  const description = dialog.getByText("Все желания в этом списке будут видны только вам.", { exact: true });
  assert(await description.isVisible(), `${label} does not explain the effect of secrecy`);
  assert(await control.getAttribute("aria-describedby") === await description.getAttribute("id"), `${label} switch is not linked to its description`);
  assert(await dialog.getByText("Кто увидит", { exact: true }).count() === 0, `${label} still renders the retired privacy label`);
  assert(await dialog.getByRole("combobox", { name: "Кто увидит" }).count() === 0, `${label} still renders the retired privacy Select`);
  const geometry = await control.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    const rowBounds = element.closest("[data-slot='field']")?.getBoundingClientRect();
    const hit = document.elementFromPoint(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2);
    return {
      width: bounds.width,
      height: bounds.height,
      rowHeight: rowBounds?.height || 0,
      hittable: hit === element || element.contains(hit),
    };
  });
  assert(
    geometry.width >= 43 && geometry.width <= 45
      && geometry.height >= 23 && geometry.height <= 25,
    `${label} switch does not use the app-level 44x24 Large geometry: ${JSON.stringify(geometry)}`,
  );
  assert(geometry.rowHeight >= 55.5 && geometry.hittable, `${label} switch row is not a reliable touch target: ${JSON.stringify(geometry)}`);
  if (toggleTo !== null && toggleTo !== checked) {
    await control.focus();
    await control.press("Space");
    assert(await control.getAttribute("aria-checked") === String(toggleTo), `${label} did not toggle from the keyboard`);
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
  assert(visual.positionerZIndex >= 50, `${label} popup is layered under the modal`);
  assert(visual.options.every((option) => option.fontSize >= 15.5), `${label} options do not use readable Large-control typography`);
  assert(visual.options.every((option) => option.height >= 47), `${label} options are shorter than the 48px Large row height`);
  assert(visual.options.every((option) => option.contrast >= 4.5), `${label} contains an unreadable option`);
  assert(visual.options.every((option) => option.hittable), `${label} contains an option covered by another layer`);
  await expectLargeAppControls(listbox, `${label} option controls`);

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

async function expectWishCurrencySelect(page, dialog, label, { selectValue = null } = {}) {
  const currencyOptions = [
    { value: "RUB", symbol: "₽", label: "₽ RUB" },
    { value: "USD", symbol: "$", label: "$ USD" },
    { value: "EUR", symbol: "€", label: "€ EUR" },
    { value: "KZT", symbol: "₸", label: "₸ KZT" },
    { value: "BYN", symbol: "Br", label: "Br BYN" },
  ];
  const trigger = dialog.getByRole("combobox", { name: "Валюта", exact: true });
  await trigger.waitFor({ state: "visible" });
  assert(await trigger.evaluate((element) => element.tagName === "BUTTON" && element.dataset.slot === "select-trigger"), `${label} still uses a native currency select`);
  assert(Number.parseFloat(await trigger.evaluate((element) => getComputedStyle(element).fontSize)) >= 13, `${label} currency trigger text is smaller than 13px`);

  const initialSymbol = (await trigger.innerText()).trim();
  assert(currencyOptions.some(({ symbol }) => symbol === initialSymbol), `${label} has an unexpected selected currency: ${initialSymbol}`);
  await trigger.click();
  const listbox = page.getByRole("listbox");
  await listbox.waitFor({ state: "visible" });
  await listbox.evaluate(async (element) => {
    const popup = element.closest("[data-slot='select-content']");
    await Promise.all((popup?.parentElement || element).getAnimations({ subtree: true }).map((animation) => animation.finished.catch(() => {})));
  });
  const popup = listbox.locator("..");
  assert(await popup.getAttribute("data-slot") === "select-content", `${label} popup is not the official shadcn Select content`);
  assert(await trigger.getAttribute("aria-controls") === await listbox.getAttribute("id"), `${label} currency listbox is not linked to its trigger`);
  const options = listbox.getByRole("option");
  assert(await options.count() === currencyOptions.length, `${label} must expose all five currencies`);
  for (const currency of currencyOptions) {
    assert(await listbox.getByRole("option", { name: currency.label, exact: true }).count() === 1, `${label} is missing ${currency.label}`);
  }

  const geometry = await popup.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const triggerElement = document.querySelector(`[aria-controls=${JSON.stringify(element.querySelector("[role='listbox']")?.id)}]`);
    const triggerRect = triggerElement?.getBoundingClientRect();
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    context.fillStyle = getComputedStyle(element).backgroundColor;
    context.fillRect(0, 0, 1, 1);
    const [red, green, blue] = context.getImageData(0, 0, 1, 1).data;
    const channel = (value) => {
      const normalized = value / 255;
      return normalized <= .04045 ? normalized / 12.92 : ((normalized + .055) / 1.055) ** 2.4;
    };
    return {
      popup: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width },
      trigger: triggerRect && { left: triggerRect.left, right: triggerRect.right, width: triggerRect.width },
      viewport: { width: innerWidth, height: innerHeight },
      backgroundColor: getComputedStyle(element).backgroundColor,
      colorScheme: getComputedStyle(element).colorScheme,
      backgroundLuminance: (.2126 * channel(red)) + (.7152 * channel(green)) + (.0722 * channel(blue)),
      positionerZIndex: Number.parseFloat(getComputedStyle(element.parentElement).zIndex),
      editorZIndex: Number.parseFloat(getComputedStyle(document.querySelector("[data-slot='wish-editor-content']")).zIndex),
      optionMetrics: [...element.querySelectorAll("[role='option']")].map((option) => ({
        fontSize: Number.parseFloat(getComputedStyle(option).fontSize),
        height: option.getBoundingClientRect().height,
      })),
    };
  });
  assert(geometry.popup.left >= 4 && geometry.popup.right <= geometry.viewport.width - 4, `${label} popup escapes the viewport horizontally`);
  assert(geometry.popup.top >= 4 && geometry.popup.bottom <= geometry.viewport.height - 4, `${label} popup escapes the viewport vertically`);
  assert(
    geometry.trigger && Math.abs(geometry.popup.width - Math.max(geometry.trigger.width, 144)) <= 2,
    `${label} popup does not retain the official anchor width with min-w-36`,
  );
  assert(geometry.positionerZIndex > geometry.editorZIndex, `${label} popup is layered under the wish editor`);
  assert(
    geometry.optionMetrics.every(({ fontSize, height }) => fontSize >= 15.5 && height >= 47),
    `${label} currency options do not use the app-level Large geometry`,
  );
  assert(geometry.backgroundLuminance <= .2 && geometry.colorScheme === "dark", `${label} popup is not using the dark theme (${geometry.backgroundColor}, ${geometry.colorScheme})`);
  await expectLargeAppControls(popup, `${label} currency option controls`);

  if (selectValue) {
    const target = currencyOptions.find(({ value }) => value === selectValue);
    assert(target, `${label} requested an unsupported currency: ${selectValue}`);
    await listbox.getByRole("option", { name: target.label, exact: true }).click();
    await listbox.waitFor({ state: "detached" });
    assert((await trigger.innerText()).trim() === target.symbol, `${label} did not commit ${selectValue}`);
  } else {
    await page.keyboard.press("Escape");
    await listbox.waitFor({ state: "detached" });
    assert((await trigger.innerText()).trim() === initialSymbol, `${label} changed currency after Escape`);
  }
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

async function expectViewportCenteredPageLoader(browserInstance, viewport, label) {
  const context = await browserInstance.newContext({ viewport, deviceScaleFactor: 1, colorScheme: "light", reducedMotion: "reduce" });
  const page = await context.newPage();
  let releaseRequest;
  const requestGate = new Promise((resolve) => { releaseRequest = resolve; });
  await page.route("**/api/me", async (route) => {
    await requestGate;
    await route.continue();
  });
  try {
    await page.goto(`${baseUrl}/app/wishes`, { waitUntil: "domcontentloaded" });
    const loader = page.locator(".page-loader");
    await loader.waitFor({ state: "visible" });
    const geometry = await loader.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const children = [...element.children].filter((child) => child.checkVisibility());
      const childRects = children.map((child) => child.getBoundingClientRect());
      const group = {
        left: Math.min(...childRects.map((child) => child.left)),
        top: Math.min(...childRects.map((child) => child.top)),
        right: Math.max(...childRects.map((child) => child.right)),
        bottom: Math.max(...childRects.map((child) => child.bottom)),
      };
      const spinner = element.querySelector('[data-slot="spinner"]');
      const spinnerRect = spinner?.getBoundingClientRect();
      const textRect = element.querySelector(":scope > span")?.getBoundingClientRect();
      return {
        rect: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height },
        viewport: { width: innerWidth, height: innerHeight },
        groupCenter: { x: (group.left + group.right) / 2, y: (group.top + group.bottom) / 2 },
        spinnerCenterY: spinnerRect ? spinnerRect.top + spinnerRect.height / 2 : null,
        textCenterY: textRect ? textRect.top + textRect.height / 2 : null,
        position: getComputedStyle(element).position,
        role: element.getAttribute("role"),
        live: element.getAttribute("aria-live"),
        busy: element.getAttribute("aria-busy"),
        spinnerHidden: spinner?.getAttribute("aria-hidden"),
        tabbableChildren: element.querySelectorAll('a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])').length,
        rootWidth: document.documentElement.scrollWidth,
      };
    });
    assert(geometry.position === "fixed", `${label} loader is not attached to the viewport`);
    assert(Math.abs(geometry.rect.left) <= 1 && Math.abs(geometry.rect.top) <= 1, `${label} loader does not start at the viewport origin`);
    assert(Math.abs(geometry.rect.right - geometry.viewport.width) <= 1 && Math.abs(geometry.rect.bottom - geometry.viewport.height) <= 1, `${label} loader does not cover the viewport`);
    assert(Math.abs(geometry.groupCenter.x - geometry.viewport.width / 2) <= 1 && Math.abs(geometry.groupCenter.y - geometry.viewport.height / 2) <= 1, `${label} loader content is not centered in the viewport`);
    assert(Math.abs(geometry.spinnerCenterY - geometry.textCenterY) <= 1, `${label} loader icon and text are not vertically aligned`);
    assert(geometry.role === "status" && geometry.live === "polite" && geometry.busy === "true", `${label} loader does not expose one polite busy status`);
    assert(geometry.spinnerHidden === "true" && geometry.tabbableChildren === 0, `${label} loader exposes duplicate or focusable controls`);
    assert(geometry.rootWidth <= geometry.viewport.width + 1, `${label} loader creates horizontal page overflow`);
  } finally {
    releaseRequest?.();
    await context.close();
  }
}

try {
  await expectViewportCenteredPageLoader(browser, { width: 1440, height: 1000 }, "Desktop bootstrap");
  await expectViewportCenteredPageLoader(browser, { width: 390, height: 844 }, "Mobile bootstrap");
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
  const retiredNotificationsApi = await desktop.request.get(`${baseUrl}/api/notifications`);
  assert(retiredNotificationsApi.status() === 404, `Retired notifications API should return 404, received ${retiredNotificationsApi.status()}`);
  const retiredNotificationsReadApi = await desktop.request.post(`${baseUrl}/api/notifications/read`, { data: {} });
  assert(retiredNotificationsReadApi.status() === 404, `Retired notification-read API should return 404, received ${retiredNotificationsReadApi.status()}`);

  const dashboard = await desktop.newPage();
  await dashboard.goto(`${baseUrl}/app`, { waitUntil: "domcontentloaded" });
  await dashboard.waitForURL((url) => url.pathname === "/app/wishes");
  await dashboard.locator(".app-page").waitFor({ state: "visible" });
  await dashboard.locator(".wishes-page > .list-tabs").waitFor({ state: "visible" });
  await expectWishSummaryRemoved(dashboard, "Desktop wishes page");
  assert(
    await dashboard.locator(".wishes-page .page-actions").getByRole("button", { name: "Добавить", exact: true }).isVisible(),
    "Desktop wishes page lost its contextual add-wish action",
  );
  assert(!(await dashboard.locator("body").innerText()).includes("Тайный Санта"), "Removed Secret Santa content is still visible in the authenticated app");
  await expectSidebarRemoved(dashboard, "Desktop /app/wishes");
  await expectAppLogoPlacement(dashboard, "Desktop /app/wishes");
  assert(await dashboard.locator(".mobile-bottom-nav").count() === 0, "Desktop app should not render the retired mobile bottom navigation");
  await expectDarkPage(dashboard, "Desktop /app/wishes", [".app-layout--dark", ".app-main", ".app-page"]);
  await expectSquareAppMain(dashboard, "Desktop /app/wishes");
  await expectNoRootOverflow(dashboard, "Desktop dashboard");
  await expectNewListTile(dashboard, "Desktop new-list tile");
  await expectWishListTileButtonStates(dashboard, "Desktop list tiles", { checkHover: true });
  await expectWishCardsUnframed(dashboard, "Desktop owner wishes");
  await dashboard.screenshot({ path: "/tmp/rollapp-desktop-app.png", fullPage: true });
  await expectMainUserSettingsNavigation(dashboard, "Desktop main-content user settings");
  await expectProfileEditorForm(dashboard, "Desktop in-place profile editor");
  await expectWishesFriendShortcutsNavigation(dashboard, "Desktop wishes profile friend shortcuts");

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
  const desktopDetail = await expectWishDetailsOpen(dashboard, "Desktop owner wish", { owner: true, checkHover: true, checkImageRatios: true });
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
  const outsideDismissedDetail = await expectWishDetailsOpen(dashboard, "Desktop owner wish outside dismissal", { owner: true });
  const detailOverlay = dashboard.locator("[data-slot='dialog-overlay'][data-open]");
  assert(
    await outsideDismissedDetail.dialog.evaluate((element) => {
      const hit = document.elementFromPoint(4, 4);
      return hit === element || element.contains(hit);
    }),
    "Desktop wish detail does not cover the top-left viewport edge",
  );
  await dashboard.mouse.click(4, 4);
  assert(await outsideDismissedDetail.dialog.isVisible(), "Clicking the edge of a fullscreen wish detail unexpectedly dismissed it");
  assert(await detailOverlay.count() === 1, "Fullscreen wish detail lost its shadcn overlay");
  await outsideDismissedDetail.dialog.getByRole("button", { name: "Close", exact: true }).click();
  await outsideDismissedDetail.dialog.waitFor({ state: "detached" });
  assert(
    await outsideDismissedDetail.opener.evaluate((element) => document.activeElement === element),
    "Fullscreen close should restore focus to the wish card",
  );

  await dashboard.goto(`${baseUrl}/app/santa`, { waitUntil: "domcontentloaded" });
  await dashboard.waitForURL((url) => url.pathname === "/app/wishes");
  await dashboard.locator(".wishes-page > .list-tabs").waitFor({ state: "visible" });
  await expectFriendsRegression(dashboard, "Desktop friends", { mobile: false });
  await expectInAppFriendProfile(dashboard, "Desktop friend profile", { mobile: false });
  await expectWideFriendsLayout(dashboard, "1912px friends");
  await expectStableDesktopChromeAcrossRoutes(dashboard, "1440px stable app chrome", { width: 1440, height: 1000 });
  await expectStableDesktopChromeAcrossRoutes(dashboard, "1024px stable app chrome", { width: 1024, height: 900 });
  for (const pathname of stableAppRoutes) {
    await waitForAppRoute(dashboard, pathname);
    await expectDarkPage(dashboard, `Desktop ${pathname}`, [".app-layout--dark", ".app-main", ".app-page"]);
  }
  await expectRetiredSettingsRedirect(dashboard, "Desktop retired settings route");
  const logoutProfileButton = await expectMainUserProfile(dashboard, "Desktop logout profile entry");
  await logoutProfileButton.locator('[data-slot="avatar"]').click();
  const logoutDialog = dashboard.getByRole("dialog", { name: "Изменить профиль", exact: true });
  await logoutDialog.waitFor({ state: "visible" });
  await dashboard.screenshot({ path: "/tmp/rollapp-desktop-profile-editor.png", fullPage: true });
  const settingsLogout = logoutDialog.getByRole("button", { name: "Выйти из аккаунта", exact: true });
  const logoutResponsePromise = dashboard.waitForResponse((response) => (
    response.request().method() === "POST"
      && new URL(response.url()).pathname === "/api/auth/logout"
  ));
  await settingsLogout.click();
  const logoutResponse = await logoutResponsePromise;
  assert(logoutResponse.ok(), `Profile editor logout failed: ${logoutResponse.status()}`);
  await dashboard.waitForURL((url) => url.pathname === "/login");
  await dashboard.getByRole("heading", { name: "Войти в Rollapp", exact: true }).waitFor({ state: "visible" });
  const loggedOutSession = await desktop.request.get(`${baseUrl}/api/me`);
  assert(loggedOutSession.ok(), `Logged-out session lookup failed: ${loggedOutSession.status()}`);
  assert((await loggedOutSession.json()).user === null, "Profile editor logout did not invalidate the authenticated session");
  await dashboard.goto(`${baseUrl}/app/settings`, { waitUntil: "domcontentloaded" });
  await dashboard.waitForURL((url) => url.pathname === "/login");
  await dashboard.getByRole("heading", { name: "Войти в Rollapp", exact: true }).waitFor({ state: "visible" });
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
  await mobilePage.locator(".wishes-page > .list-tabs").waitFor({ state: "visible" });
  await mobilePage.goto(`${baseUrl}/app/gifts`, { waitUntil: "domcontentloaded" });
  await mobilePage.waitForURL((url) => url.pathname === "/app/wishes");
  await mobilePage.locator(".wishes-page > .list-tabs").waitFor({ state: "visible" });
  await expectWishSummaryRemoved(mobilePage, "390px wishes page");
  await expectMainUserSettingsNavigation(mobilePage, "390px main-content user settings", { mobile: true });
  await expectProfileEditorForm(mobilePage, "390px in-place profile editor", { mobile: true });
  await expectRetiredSettingsRedirect(mobilePage, "390px retired settings route");

  for (const pathname of stableAppRoutes) {
    await waitForAppRoute(mobilePage, pathname);
    await expectMobileAppShell(mobilePage, pathname);
    await expectDarkPage(mobilePage, `390px ${pathname}`, [".app-layout--dark", ".app-main", ".app-page"]);
    await expectNoRootOverflow(mobilePage, `390px ${pathname}`);
    await captureStableAppChrome(mobilePage, `390px app chrome ${pathname}`);
    if (pathname === "/app/wishes") {
      await expectNewListTile(mobilePage, "390px new-list tile");
      await expectWishListTileButtonStates(mobilePage, "390px list tiles");
      await expectWishListCarouselBleed(mobilePage, "390px list carousel");
      await mobilePage.screenshot({ path: "/tmp/rollapp-mobile-wishes-390.png", fullPage: true });
      const mobileMenuDashboardResponse = await apiFromPage(mobilePage, "/api/dashboard");
      assert(mobileMenuDashboardResponse.ok, `390px wish menu dashboard failed: ${mobileMenuDashboardResponse.status}`);
      const mobileListButtons = mobilePage.locator('.wishes-page .list-tabs [data-slot="toggle-group-item"]');
      if ((await mobileListButtons.count()) > 1) {
        await mobileListButtons.nth(1).click();
        await mobilePage.getByRole("button", { name: "Настройки списка", exact: true }).waitFor({ state: "visible" });
        await expectWishActionsContained(mobilePage, "390px selected-list actions");
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
      await mobileEditDialog.getByRole("button", { name: "Close" }).click();
      await mobileEditDialog.waitFor({ state: "detached" });
      await mobileMenuCard.waitFor({ state: "visible" });
      const mobileDetail = await expectWishDetailsOpen(mobilePage, "390px owner wish", { owner: true });
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
      await mobileDetail.dialog.getByRole("button", { name: "Close" }).click();
      await mobileDetail.dialog.waitFor({ state: "detached" });
    }
  }
  await expectFriendsRegression(mobilePage, "390px friends", { mobile: true });
  await expectInAppFriendProfile(mobilePage, "390px friend profile", { mobile: true });

  for (const retiredPath of ["/ideas", "/app/ideas", "/app/notifications"]) {
    await mobilePage.goto(`${baseUrl}${retiredPath}`, { waitUntil: "domcontentloaded" });
    await mobilePage.waitForURL((url) => url.pathname === "/app/wishes");
    await mobilePage.locator(".wishes-page > .list-tabs").waitFor({ state: "visible" });
    assert((await mobilePage.getByRole("link", { name: "Идеи", exact: true }).count()) === 0, `${retiredPath} left an Ideas navigation link behind`);
    assert((await mobilePage.getByRole("link", { name: /Уведомления/ }).count()) === 0, `${retiredPath} left a notifications navigation link behind`);
  }

  await waitForAppRoute(mobilePage, "/app/wishes");
  await expectMobileAppShell(mobilePage, "/app/wishes");
  await mobilePage.screenshot({ path: "/tmp/rollapp-mobile-app.png", fullPage: true });

  await expectSidebarRemoved(mobilePage, "390px application shell");

  await mobilePage.locator(".wishes-page .page-actions").getByRole("button", { name: "Добавить", exact: true }).click();
  const wishDialog = mobilePage.getByRole("dialog", { name: "Создание желания", exact: true });
  await wishDialog.waitFor({ state: "visible" });
  await wishDialog.getByRole("heading", { name: "Создание желания", exact: true }).waitFor();
  assert((await wishDialog.locator(".wish-editor-screen__header").count()) === 0, "Wish editor still renders the removed visual header");
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
  await wishDialog.getByRole("button", { name: "Закрыть" }).click();
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
    await expectUnifiedPublicCollection(mobilePage, "390px public owner profile", { owner: true, authenticated: true, mobile: true });
    await mobilePage.locator('.list-tabs [data-slot="toggle-group-item"]').filter({ hasText: mobileSourceList.title }).click();
    await mobilePage.waitForURL((url) => url.pathname === `/alisa/lists/${mobileSourceList.id}`);
    const mobileListOptions = mobilePage.getByRole("button", { name: "Настройки списка", exact: true });
    assert(await mobileListOptions.isVisible(), "Mobile owner profile does not expose list management");
    await mobileListOptions.click();
    const mobileListDialog = mobilePage.getByRole("dialog", { name: "Изменить список", exact: true });
    await mobileListDialog.waitFor({ state: "visible" });
    await expectDarkAuthenticatedModal(mobileListDialog, "390px list editor");
    await expectNoListEventDate(mobileListDialog, "390px list editor");
    await expectNoListCoverColor(mobileListDialog, "390px list editor");
    await expectNoListHeadingIcon(mobileListDialog, "390px list editor");
    await expectListControlSizing(mobileListDialog, "390px list editor");
    await expectListSecretSwitch(mobileListDialog, "390px secret-list switch", { checked: mobileSourceList.privacy === "private" });
    await mobileListDialog.getByRole("button", { name: "Close" }).click();
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
    const mobileListChoices = mobileListPicker.getByRole("menuitemcheckbox");
    assert((await mobileListChoices.count()) === mobileCategoryLists.length, "Quick list picker does not expose every themed list");
    assert((await mobileListPicker.getByRole("menuitemcheckbox", { name: "Мои желания", exact: true }).count()) === 0, "Quick list picker exposed the aggregate system list");
    const mobileSourceChoice = mobileListPicker.getByRole("menuitemcheckbox", { name: mobileSourceList.title, exact: true });
    const mobileTargetChoice = mobileListPicker.getByRole("menuitemcheckbox", { name: mobileTargetList.title, exact: true });
    assert(await mobileSourceChoice.getAttribute("aria-checked") === "true", "Current wish list is not checked in the quick picker");
    assert(await mobileTargetChoice.getAttribute("aria-checked") === "false", "Unselected wish list is incorrectly checked in the quick picker");
    await expectOfficialDetailListCheckboxes(mobileListChoices, mobileCategoryLists, mobileWishToMove.listIds, "390px wish quick-list picker");
    await expectMobileTouchTargets(mobileListChoices, "390px wish quick-list picker");
    await expectLargeAppControls(mobileListPicker, "390px wish quick-list picker controls");
    await expectFixedPopoverGeometry(mobileListPicker, "390px wish quick-list picker");
    await expectPopupMatchesTriggerWidth(mobileListTrigger, mobileListPicker, "390px wish quick-list picker");
    await mobilePage.setViewportSize({ width: 844, height: 390 });
    await waitForStableLayout(mobilePage);
    await mobileListPicker.waitFor({ state: "detached" });
    assert(await mobileListTrigger.getAttribute("aria-expanded") === "false", "Quick list picker remained expanded after the viewport changed");
    assert(await mobileOwnerDetail.isVisible(), "Changing orientation closed the wish detail instead of its transient list picker");
    await mobileListTrigger.scrollIntoViewIfNeeded();
    await mobileListTrigger.click();
    await mobileListPicker.waitFor({ state: "visible" });
    await expectFixedPopoverGeometry(mobileListPicker, "844x390 wish quick-list picker");
    await expectPopupMatchesTriggerWidth(mobileListTrigger, mobileListPicker, "844x390 wish quick-list picker");
    await mobilePage.setViewportSize({ width: 390, height: 844 });
    await mobileListPicker.waitFor({ state: "detached" });
    await mobileListTrigger.scrollIntoViewIfNeeded();
    await mobileListTrigger.click();
    await mobileListPicker.waitFor({ state: "visible" });
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
    await expectOfficialDetailListCheckboxes(mobileListChoices, mobileCategoryLists, [], "390px wish quick-list picker after removal");
    assert(await mobileOwnerDetail.getByRole("button", { name: /^Изменить списки желания\. Сейчас: Без списка$/ }).isVisible(), "Quick list trigger did not update to the empty-list state");
    assert(await mobileListPicker.isVisible(), "Quick list picker closed after an immediate removal");
    await mobilePage.waitForFunction(
      ({ wishId, listTitle }) => {
        const root = document.querySelector(`#wish-detail-lists-${CSS.escape(wishId)}`);
        const item = [...(root?.querySelectorAll('[role="menuitemcheckbox"]') || [])]
          .find((candidate) => candidate.textContent.includes(listTitle));
        return item && !item.hasAttribute("data-disabled") && item.getAttribute("aria-disabled") !== "true";
      },
      { wishId: mobileWishToMove.id, listTitle: mobileTargetList.title },
    );

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
    await expectOfficialDetailListCheckboxes(mobileListChoices, mobileCategoryLists, [mobileTargetList.id], "390px wish quick-list picker after addition");
    assert(await mobileListPicker.isVisible(), "Quick list picker closed after an immediate addition");
    await mobilePage.keyboard.press("Escape");
    await mobileListPicker.waitFor({ state: "detached" });
    assert(await mobileOwnerDetail.isVisible(), "Escape closed the wish detail instead of only the quick list picker");
    assert(await mobileListTrigger.getAttribute("aria-expanded") === "false", "Quick list trigger remained expanded after Escape");
    await waitForFocused(mobilePage, mobileListTrigger, "quick list trigger after Escape");

    await mobileListTrigger.press("Enter");
    await mobileListPicker.waitFor({ state: "visible" });
    assert(await mobileTargetChoice.getAttribute("aria-checked") === "true", "Persisted target list is not checked after reopening the quick picker");
    assert(await mobileSourceChoice.getAttribute("aria-checked") === "false", "Removed source list is checked after reopening the quick picker");
    await expectOfficialDetailListCheckboxes(mobileListChoices, mobileCategoryLists, [mobileTargetList.id], "390px reopened wish quick-list picker");
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
  await expectUnifiedPublicCollection(mobilePage, "390px shared owner profile", { owner: true, shared: true, authenticated: true, mobile: true });
  assert((await mobilePage.getByRole("button", { name: "Подписаться" }).count()) === 0, "Owner shared list exposes a self-follow action");
  assert(await mobilePage.getByRole("button", { name: "Открыть мой список" }).isVisible(), "Owner shared list does not expose its canonical list action");
  const sharedOwnerCard = mobilePage.locator(".wish-card").first();
  const sharedOwnerWishTitle = (await sharedOwnerCard.locator("h3").innerText()).trim();
  await sharedOwnerCard.getByRole("button", { name: `Открыть желание «${sharedOwnerWishTitle}»` }).click();
  const sharedOwnerDialog = mobilePage.getByRole("dialog", { name: `Желание: ${sharedOwnerWishTitle}` });
  await sharedOwnerDialog.waitFor({ state: "visible" });
  await expectDarkAuthenticatedModal(sharedOwnerDialog, "390px shared owner wish detail");
  assert(await sharedOwnerDialog.getByRole("button", { name: /^Изменить списки желания\./ }).isVisible(), "Owner shared wish does not expose editing");
  await sharedOwnerDialog.getByRole("button", { name: "Close" }).click();
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
  await waitForAppRoute(narrowPage, "/app/wishes");
  await expectMobileAppShell(narrowPage, "360px /app/wishes");
  await expectNoRootOverflow(narrowPage, "360px /app/wishes");
  await narrowPage.screenshot({ path: "/tmp/rollapp-mobile-app-360.png", fullPage: true });
  await narrowPage.goto(`${baseUrl}/alisa`, { waitUntil: "domcontentloaded" });
  await expectUnifiedPublicCollection(narrowPage, "360px public owner profile", { owner: true, authenticated: true, mobile: true });
  await expectPublicGrid(narrowPage, 2, "360px public profile");
  await expectNoRootOverflow(narrowPage, "360px public profile");
  await narrow.close();

  const compactPublic = await browser.newContext({ viewport: { width: 320, height: 700 }, deviceScaleFactor: 1, colorScheme: "light" });
  const compactPublicPage = await compactPublic.newPage();
  await compactPublicPage.goto(`${baseUrl}/alisa`, { waitUntil: "domcontentloaded" });
  await expectUnifiedPublicCollection(compactPublicPage, "320px public guest profile", { mobile: true });
  await expectPublicGrid(compactPublicPage, 2, "320px public profile");
  await expectNoRootOverflow(compactPublicPage, "320px public profile");
  await compactPublicPage.screenshot({ path: "/tmp/rollapp-public-profile-320.png", fullPage: true });
  const compactPublicDetail = await expectWishDetailsOpen(compactPublicPage, "320px public wish");
  await expectDarkAuthenticatedModal(compactPublicDetail.dialog, "320px public wish detail");
  await expectNoRootOverflow(compactPublicPage, "320px public wish detail");
  await compactPublicDetail.dialog.getByRole("button", { name: "Close" }).click();
  await compactPublic.close();

  const tabletApp = await browser.newContext({ viewport: { width: 768, height: 1024 }, deviceScaleFactor: 1, colorScheme: "light" });
  const tabletAppPage = await tabletApp.newPage();
  await expectUnauthenticatedDarkRoutes(tabletAppPage, "768px unauthenticated");
  await tabletAppPage.goto(`${baseUrl}/alisa`, { waitUntil: "domcontentloaded" });
  await expectUnifiedPublicCollection(tabletAppPage, "768px public guest profile");
  await tabletAppPage.goto(`${baseUrl}/s/${mobileSourceList.shareToken}`, { waitUntil: "domcontentloaded" });
  await expectUnifiedPublicCollection(tabletAppPage, "768px shared guest profile", { shared: true });
  const tabletLoginResponse = await tabletApp.request.post(`${baseUrl}/api/auth/demo`, { data: {} });
  assert(tabletLoginResponse.ok(), `768px demo login failed: ${tabletLoginResponse.status()}`);
  for (const pathname of stableAppRoutes) {
    await waitForAppRoute(tabletAppPage, pathname);
    await expectMobileAppShell(tabletAppPage, `768px ${pathname}`);
    await expectDarkPage(tabletAppPage, `768px ${pathname}`, [".app-layout--dark", ".app-main", ".app-page"]);
    await expectNoRootOverflow(tabletAppPage, `768px ${pathname}`);
    await captureStableAppChrome(tabletAppPage, `768px app chrome ${pathname}`);
  }
  await waitForAppRoute(tabletAppPage, "/app/wishes");
  await expectNewListTile(tabletAppPage, "768px new-list tile");
  await expectWishListTileButtonStates(tabletAppPage, "768px list tiles");
  await expectWishListCarouselBleed(tabletAppPage, "768px list carousel");
  await tabletAppPage.screenshot({ path: "/tmp/rollapp-tablet-wishes-768.png", fullPage: true });
  const tabletOwnerDetail = await expectWishDetailsOpen(tabletAppPage, "768px owner wish", { owner: true });
  await expectDarkAuthenticatedModal(tabletOwnerDetail.dialog, "768px owner wish detail");
  await expectNoRootOverflow(tabletAppPage, "768px owner wish detail");
  await tabletAppPage.screenshot({ path: "/tmp/rollapp-tablet-owner-wish-detail-768.png" });
  await tabletOwnerDetail.dialog.getByRole("button", { name: "Close" }).click();
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
  await expectUnifiedPublicCollection(publicMobilePage, "390px public guest profile", { mobile: true });
  await expectPublicGrid(publicMobilePage, 2, "390px public profile");
  await expectNoRootOverflow(publicMobilePage, "390px public profile");
  await publicMobilePage.screenshot({ path: "/tmp/rollapp-public-profile-390.png", fullPage: true });
  const publicDetail = await expectWishDetailsOpen(publicMobilePage, "390px public wish");
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
  assert(await reloadedPublicDetail.locator("[data-slot='wish-price']").isVisible(), "A public wish deep link did not survive reload");
  await reloadedPublicDetail.getByRole("button", { name: "Close" }).click();
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
  await publicMobilePage.locator('.list-tabs [data-slot="toggle-group-item"][aria-pressed="true"]').filter({ hasText: directList.title }).waitFor({ state: "visible" });
  assert(await publicMobilePage.locator(".wish-card").count() > 0, "A public list deep link did not render its wishes");
  await publicMobilePage.reload({ waitUntil: "domcontentloaded" });
  await publicMobilePage.locator('.list-tabs [data-slot="toggle-group-item"][aria-pressed="true"]').filter({ hasText: directList.title }).waitFor({ state: "visible" });
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
  await listWishDialog.locator(":focus").waitFor({ state: "visible" });
  await publicMobilePage.keyboard.press("Shift+Tab");
  await listWishDialog.locator(":focus").waitFor({ state: "visible" });
  assert(await listWishDialog.evaluate((dialog) => dialog.contains(document.activeElement)), "Reverse tab escaped the wish dialog");
  await publicMobilePage.keyboard.press("Escape");
  await listWishDialog.waitFor({ state: "detached" });
  await publicMobilePage.waitForURL((url) => url.pathname === listPath);
  const restoredListWishOpener = publicMobilePage.locator(".wish-card").first().getByRole("button", { name: `Открыть желание «${listWishTitle}»` });
  await publicMobilePage.waitForFunction((title) => (
    document.activeElement?.getAttribute("aria-label") === `Открыть желание «${title}»`
  ), listWishTitle);
  assert(await restoredListWishOpener.evaluate((element) => document.activeElement === element), "Closing a wish did not restore focus to its list card");
  await publicMobilePage.locator('.list-tabs [data-slot="toggle-group-item"][aria-pressed="true"]').filter({ hasText: directList.title }).waitFor({ state: "visible" });

  await publicMobilePage.goto(`${baseUrl}/alisa/wishes/not-a-real-wish`, { waitUntil: "domcontentloaded" });
  await publicMobilePage.getByRole("heading", { name: "Желание не найдено" }).waitFor({ state: "visible" });
  const invalidWishReturn = publicMobilePage.getByRole("link", { name: "Вернуться к профилю", exact: true });
  assert(
    await invalidWishReturn.evaluate((element) => element.tagName === "A")
    && await invalidWishReturn.evaluate((element) => element.classList.contains("group/button"))
    && await invalidWishReturn.getAttribute("href") === "/alisa",
    "Invalid wish return action is not a canonical link styled with buttonVariants",
  );
  await publicMobilePage.goto(`${baseUrl}/alisa/lists/not-a-real-list`, { waitUntil: "domcontentloaded" });
  await publicMobilePage.getByRole("heading", { name: "Список не найден" }).waitFor({ state: "visible" });
  const invalidListReturn = publicMobilePage.getByRole("link", { name: "Вернуться к профилю", exact: true });
  assert(
    await invalidListReturn.evaluate((element) => element.tagName === "A")
    && await invalidListReturn.evaluate((element) => element.classList.contains("group/button"))
    && await invalidListReturn.getAttribute("href") === "/alisa",
    "Invalid list return action is not a canonical link styled with buttonVariants",
  );
  await publicMobilePage.goto(`${baseUrl}/alisa`, { waitUntil: "domcontentloaded" });
  await expectUnifiedPublicCollection(publicMobilePage, "390px restored public guest profile", { mobile: true });
  assert(await publicMobilePage.locator('a[href^="/u/"], a[href^="/users/"]').count() === 0, "Public profile still renders legacy profile links");
  await publicMobilePage.evaluate(() => window.scrollTo(0, 300));
  assert(await publicMobilePage.locator(".profile-header, .profile-header__compact, .profile-mobile-menu").count() === 0, "390px public profile revived the retired compact header after scrolling");
  await publicMobilePage.screenshot({ path: "/tmp/rollapp-public-profile-390-scrolled.png" });
  await publicMobilePage.goto(`${baseUrl}/s/${mobileSourceList.shareToken}`, { waitUntil: "domcontentloaded" });
  await expectUnifiedPublicCollection(publicMobilePage, "390px shared guest profile", { shared: true, mobile: true });
  await publicMobile.close();

  const publicTablet = await browser.newContext({ viewport: { width: 768, height: 1024 }, deviceScaleFactor: 1, colorScheme: "light" });
  const publicTabletLoginResponse = await publicTablet.request.post(`${baseUrl}/api/auth/demo`, { data: {} });
  assert(publicTabletLoginResponse.ok(), `768px public owner login failed: ${publicTabletLoginResponse.status()}`);
  const publicTabletPage = await publicTablet.newPage();
  await publicTabletPage.goto(`${baseUrl}/alisa`, { waitUntil: "domcontentloaded" });
  await expectDesktopUserAgent(publicTabletPage, "768px public profile");
  await expectUnifiedPublicCollection(publicTabletPage, "768px public owner profile", { owner: true, authenticated: true, mobile: true });
  await expectPublicGrid(publicTabletPage, 2, "768px public profile");
  const tabletOwnerSections = await publicTabletPage.evaluate(() => {
    const hero = document.querySelector("[data-public-collection] > .wishes-page__hero")?.getBoundingClientRect();
    const controls = document.querySelector("[data-public-collection] .wishes-page__hero-actions")?.getBoundingClientRect();
    const tabs = document.querySelector("[data-public-collection] > .list-tabs")?.getBoundingClientRect();
    return { heroBottom: hero?.bottom, controlsBottom: controls?.bottom, tabsTop: tabs?.top };
  });
  assert(tabletOwnerSections.controlsBottom <= tabletOwnerSections.heroBottom, "768px owner controls overflow the profile hero");
  assert(tabletOwnerSections.tabsTop >= tabletOwnerSections.heroBottom, "768px owner profile hero overlaps the list tabs");
  await expectNoRootOverflow(publicTabletPage, "768px public profile");
  await publicTabletPage.screenshot({ path: "/tmp/rollapp-public-profile-768.png", fullPage: true });
  const publicTabletDetail = await expectWishDetailsOpen(publicTabletPage, "768px public wish", { owner: true });
  await expectDarkAuthenticatedModal(publicTabletDetail.dialog, "768px profile owner wish detail");
  await expectNoRootOverflow(publicTabletPage, "768px public wish detail");
  await publicTabletPage.screenshot({ path: "/tmp/rollapp-public-wish-detail-768.png" });
  await publicTabletDetail.dialog.getByRole("button", { name: "Close" }).click();
  await publicTabletDetail.dialog.waitFor({ state: "detached" });
  await publicTablet.close();

  const publicLandscape = await browser.newContext({ viewport: { width: 1024, height: 768 }, deviceScaleFactor: 1, colorScheme: "light" });
  const publicLandscapePage = await publicLandscape.newPage();
  await publicLandscapePage.goto(`${baseUrl}/alisa`, { waitUntil: "domcontentloaded" });
  await expectUnifiedPublicCollection(publicLandscapePage, "1024px public guest profile");
  await expectPublicGrid(publicLandscapePage, 3, "1024px public profile");
  await expectNoRootOverflow(publicLandscapePage, "1024px public profile");
  const publicLandscapeDetail = await expectWishDetailsOpen(publicLandscapePage, "1024px public wish");
  await expectDarkAuthenticatedModal(publicLandscapeDetail.dialog, "1024px public wish detail");
  await expectNoRootOverflow(publicLandscapePage, "1024px public wish detail");
  await publicLandscapePage.screenshot({ path: "/tmp/rollapp-public-wish-detail-1024.png" });
  await publicLandscapeDetail.dialog.getByRole("button", { name: "Close" }).click();
  await publicLandscape.close();

  const publicMedium = await browser.newContext({ viewport: { width: 1076, height: 800 }, deviceScaleFactor: 1, colorScheme: "light" });
  const publicMediumPage = await publicMedium.newPage();
  await publicMediumPage.goto(`${baseUrl}/alisa`, { waitUntil: "domcontentloaded" });
  await expectUnifiedPublicCollection(publicMediumPage, "1076px public guest profile");
  await expectPublicGrid(publicMediumPage, 3, "1076px public profile");
  await expectNoRootOverflow(publicMediumPage, "1076px public profile");
  await publicMedium.close();

  const publicWide = await browser.newContext({ viewport: { width: 1912, height: 991 }, deviceScaleFactor: 1, colorScheme: "light" });
  const publicWidePage = await publicWide.newPage();
  await publicWidePage.goto(`${baseUrl}/alisa`, { waitUntil: "domcontentloaded" });
  await expectUnifiedPublicCollection(publicWidePage, "1912px public guest profile");
  await expectPublicGrid(publicWidePage, 4, "1912px public profile", { requireCards: false });
  await expectNoRootOverflow(publicWidePage, "1912px public profile");
  await publicWidePage.screenshot({ path: "/tmp/rollapp-public-profile-1912.png", fullPage: false });
  await publicWidePage.goto(`${baseUrl}/s/${mobileSourceList.shareToken}`, { waitUntil: "domcontentloaded" });
  await expectUnifiedPublicCollection(publicWidePage, "Desktop shared guest profile", { shared: true });
  await publicWide.close();

  const ownerWide = await browser.newContext({ viewport: { width: 1912, height: 991 }, deviceScaleFactor: 1, colorScheme: "light" });
  const ownerLoginResponse = await ownerWide.request.post(`${baseUrl}/api/auth/demo`, { data: {} });
  assert(ownerLoginResponse.ok(), `1912px owner demo login failed: ${ownerLoginResponse.status()}`);
  const ownerWidePage = await ownerWide.newPage();
  await ownerWidePage.goto(`${baseUrl}/alisa`, { waitUntil: "domcontentloaded" });
  await expectUnifiedPublicCollection(ownerWidePage, "1912px public owner profile", { owner: true, authenticated: true });
  await expectPublicGrid(ownerWidePage, 4, "1912px owner profile", { requireCards: false });
  assert(await ownerWidePage.getByRole("button", { name: "Добавить", exact: true }).isVisible(), "Owner profile does not expose the internal Add CTA");
  assert((await ownerWidePage.getByRole("button", { name: "Подписаться" }).count()) === 0, "Owner profile should not expose a follow action");
  await waitForStableLayout(ownerWidePage);
  await ownerWidePage.screenshot({ path: "/tmp/rollapp-owner-profile-1912.png", fullPage: false });
  for (const viewport of [{ width: 1216, height: 832 }, { width: 1024, height: 768 }]) {
    await ownerWidePage.setViewportSize(viewport);
    await expectUnifiedPublicCollection(ownerWidePage, `${viewport.width}px owner profile`, { owner: true, authenticated: true });
    await expectNoRootOverflow(ownerWidePage, `${viewport.width}px owner profile`);
  }
  await ownerWidePage.setViewportSize({ width: 1912, height: 991 });
  const ownerProfileMenuDashboardResponse = await apiFromPage(ownerWidePage, "/api/dashboard");
  assert(ownerProfileMenuDashboardResponse.ok, `1912px owner detail menu dashboard failed: ${ownerProfileMenuDashboardResponse.status}`);
  const ownerProfileDetail = await expectWishDetailsOpen(ownerWidePage, "1912px owner profile wish", { owner: true, checkHover: true });
  const ownerProfileDetailWish = ownerProfileMenuDashboardResponse.data.wishes.find((wish) => wish.title === ownerProfileDetail.title);
  assert(ownerProfileDetailWish, "1912px owner detail menu wish is missing from the dashboard");
  await expectOwnerWishDetailMenu(
    ownerWidePage,
    ownerProfileDetail,
    ownerProfileDetailWish,
    ownerProfileMenuDashboardResponse.data.lists,
    "1912px owner profile wish detail menu",
  );
  await ownerProfileDetail.dialog.getByRole("button", { name: "Close" }).click();
  await ownerProfileDetail.dialog.waitFor({ state: "detached" });
  await ownerWidePage.goto(`${baseUrl}/s/${mobileSourceList.shareToken}`, { waitUntil: "domcontentloaded" });
  await expectUnifiedPublicCollection(ownerWidePage, "Desktop shared owner profile", { owner: true, shared: true, authenticated: true });
  await ownerWidePage.goto(`${baseUrl}/alisa`, { waitUntil: "domcontentloaded" });
  await expectUnifiedPublicCollection(ownerWidePage, "Desktop restored owner profile", { owner: true, authenticated: true });
  const publicOwnerIdentity = ownerWidePage.locator('[data-public-collection] > .wishes-page__hero > .wishes-page__identity');
  await publicOwnerIdentity.click();
  const publicProfileEditor = ownerWidePage.getByRole("dialog", { name: "Изменить профиль", exact: true });
  await publicProfileEditor.waitFor({ state: "visible" });
  assert(new URL(ownerWidePage.url()).pathname === "/alisa", "Opening the owner profile editor changed the public route");
  assert(await publicProfileEditor.getByLabel("Имя", { exact: true }).isVisible(), "Owner identity did not open the profile editor form");
  await publicProfileEditor.getByRole("button", { name: "Отмена", exact: true }).click();
  await publicProfileEditor.waitFor({ state: "detached" });
  await ownerWidePage.getByRole("button", { name: "Новый список", exact: true }).click();
  const ownerListDialog = ownerWidePage.getByRole("dialog", { name: "Создать список", exact: true });
  await ownerListDialog.getByRole("heading", { name: "Создать список" }).waitFor();
  await expectDarkAuthenticatedModal(ownerListDialog, "Desktop create-list modal");
  await expectNoListEventDate(ownerListDialog, "Desktop create-list modal");
  await expectNoListCoverColor(ownerListDialog, "Desktop create-list modal");
  await expectNoListHeadingIcon(ownerListDialog, "Desktop create-list modal");
  await expectListControlSizing(ownerListDialog, "Desktop create-list modal");
  await expectListSecretSwitch(ownerListDialog, "Desktop create-list secret switch");
  await ownerListDialog.getByLabel("Название").fill("Smoke list");
  await ownerListDialog.getByLabel("Описание").fill("Проверка полного цикла списка");
  const createListResponsePromise = ownerWidePage.waitForResponse((response) => (
    response.request().method() === "POST" && new URL(response.url()).pathname === "/api/lists"
  ));
  await ownerListDialog.getByRole("button", { name: "Создать список", exact: true }).click();
  const createListResponse = await createListResponsePromise;
  assert(createListResponse.ok(), `List creation failed: ${createListResponse.status()}`);
  const createdList = (await createListResponse.json()).list;
  assert(createdList.privacy === "public", `List creation sent the wrong default privacy: ${createdList.privacy}`);
  assert(createdList.color === "coral", `List creation did not retain the server default color: ${createdList.color}`);
  await ownerListDialog.waitFor({ state: "detached" });
  await ownerWidePage.waitForURL((url) => url.pathname === `/alisa/lists/${createdList.id}`);
  await ownerWidePage.locator('.list-tabs [data-slot="toggle-group-item"][aria-pressed="true"]').filter({ hasText: "Smoke list" }).waitFor({ state: "visible" });
  await ownerWidePage.getByRole("button", { name: "Настройки списка", exact: true }).click();
  const editListDialog = ownerWidePage.getByRole("dialog", { name: "Изменить список", exact: true });
  await editListDialog.getByRole("heading", { name: "Изменить список" }).waitFor();
  await expectDarkAuthenticatedModal(editListDialog, "Desktop edit-list modal");
  await expectNoListEventDate(editListDialog, "Desktop edit-list modal");
  await expectNoListCoverColor(editListDialog, "Desktop edit-list modal");
  await expectNoListHeadingIcon(editListDialog, "Desktop edit-list modal");
  await expectListControlSizing(editListDialog, "Desktop edit-list modal");
  await editListDialog.getByLabel("Название").fill("Smoke list edited");
  await expectListSecretSwitch(editListDialog, "Desktop edit-list secret switch", { toggleTo: true });
  const editListResponsePromise = ownerWidePage.waitForResponse((response) => (
    response.request().method() === "PATCH" && new URL(response.url()).pathname === `/api/lists/${createdList.id}`
  ));
  await editListDialog.getByRole("button", { name: "Сохранить изменения", exact: true }).click();
  const editListResponse = await editListResponsePromise;
  assert(editListResponse.ok(), `List editing failed: ${editListResponse.status()}`);
  const editedList = (await editListResponse.json()).list;
  assert(editedList.privacy === "private", `List editing did not make the list secret: ${editedList.privacy}`);
  assert(editedList.color === createdList.color, `List editing changed the preserved cover color from ${createdList.color} to ${editedList.color}`);
  await editListDialog.waitFor({ state: "detached" });
  await ownerWidePage.locator('.list-tabs [data-slot="toggle-group-item"][aria-pressed="true"]').filter({ hasText: "Smoke list edited" }).waitFor({ state: "visible" });
  await ownerWidePage.locator(".wishes-page__topbar-share").click();
  await ownerWidePage.getByText("Приватный список виден только вам", { exact: true }).waitFor({ state: "visible" });
  await ownerWidePage.getByRole("button", { name: "Настройки списка", exact: true }).click();
  const deleteListDialog = ownerWidePage.getByRole("dialog", { name: "Изменить список", exact: true });
  await deleteListDialog.getByRole("heading", { name: "Изменить список" }).waitFor();
  await expectDarkAuthenticatedModal(deleteListDialog, "Desktop delete-list modal");
  await expectNoListEventDate(deleteListDialog, "Desktop delete-list modal");
  await expectNoListCoverColor(deleteListDialog, "Desktop delete-list modal");
  await expectNoListHeadingIcon(deleteListDialog, "Desktop delete-list modal");
  await expectListControlSizing(deleteListDialog, "Desktop delete-list modal");
  await expectListSecretSwitch(deleteListDialog, "Desktop reopened secret-list switch", { checked: true });
  const deleteListDialogId = await deleteListDialog.getAttribute("id");
  assert(deleteListDialogId, "List editor Dialog does not expose a stable Base UI id");
  await deleteListDialog.getByRole("button", { name: "Удалить", exact: true }).click();
  const deleteListConfirmation = ownerWidePage.getByRole("alertdialog", { name: "Удалить «Smoke list edited»?", exact: true });
  await deleteListConfirmation.waitFor({ state: "visible" });
  await expectCanonicalModalGeometry(deleteListConfirmation, "Desktop delete-list confirmation");
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
  assert((await ownerWidePage.locator('.list-tabs [data-slot="toggle-group-item"]').filter({ hasText: "Smoke list edited" }).count()) === 0, "Deleted list is still visible in the owner carousel");
  await ownerWidePage.getByRole("button", { name: "Добавить", exact: true }).click();
  const ownerWishDialog = ownerWidePage.getByRole("dialog", { name: "Создание желания", exact: true });
  await ownerWishDialog.getByRole("heading", { name: "Создание желания", exact: true }).waitFor();
  await expectDarkAuthenticatedModal(ownerWishDialog, "Desktop profile add-wish editor");
  await expectWishEditorLayout(ownerWishDialog, "1912px profile add-wish editor", { mode: "create" });
  await ownerWishDialog.getByRole("button", { name: "Close" }).click();
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
      assert(await sourceOption.getAttribute("aria-checked") === "true", "Wish list picker should start with the source list selected");
      assert(await targetOption.getAttribute("aria-checked") === "false", "Wish list picker should start with the target list unselected");
      assert(await listMenu.getByRole("menuitem", { name: "Сохранить списки", exact: true }).count() === 0, "Wish list picker still exposes a redundant Save action");
      assert(await listMenu.getByRole("menuitem", { name: "Отменить изменения", exact: true }).count() === 0, "Wish list picker still exposes draft cancellation");

      const addResponsePromise = ownerWidePage.waitForResponse((response) => (
        response.request().method() === "PATCH"
        && new URL(response.url()).pathname === `/api/wishes/${wishToMove.id}`
      ));
      await targetOption.click();
      const addResponse = await addResponsePromise;
      assert(addResponse.ok(), `Immediate wish list addition failed: ${addResponse.status()}`);
      const addPayload = await addResponse.json();
      assert(addPayload.wish && sameMembers(addPayload.wish.listIds, [sourceList.id, targetList.id]), "Immediate wish list addition returned the wrong membership");
      assert(wishPatchRequests.length === 1, `Wish list addition should send one PATCH, sent ${wishPatchRequests.length}`);
      const addBody = wishPatchRequests[0].postDataJSON();
      assert(Array.isArray(addBody.listIds) && sameMembers(addBody.listIds, [sourceList.id, targetList.id]), "Wish list addition sent the wrong listIds payload");
      assert(await targetOption.getAttribute("aria-checked") === "true", "Wish list picker did not show the added target list");

      const removeResponsePromise = ownerWidePage.waitForResponse((response) => (
        response.request().method() === "PATCH"
        && new URL(response.url()).pathname === `/api/wishes/${wishToMove.id}`
      ));
      await sourceOption.click();
      const removeResponse = await removeResponsePromise;
      assert(removeResponse.ok(), `Immediate wish list removal failed: ${removeResponse.status()}`);
      const removePayload = await removeResponse.json();
      assert(removePayload.wish && sameMembers(removePayload.wish.listIds, [targetList.id]), "Immediate wish list removal returned the wrong membership");
      assert(wishPatchRequests.length === 2, `Two wish list choices should send two PATCH requests, sent ${wishPatchRequests.length}`);
      const removeBody = wishPatchRequests[1].postDataJSON();
      assert(Array.isArray(removeBody.listIds) && sameMembers(removeBody.listIds, [targetList.id]), "Wish list removal sent the wrong listIds payload");
      if (await listMenu.isVisible()) {
        assert(await sourceOption.getAttribute("aria-checked") === "false", "Wish list picker did not show the removed source list");
        await ownerWidePage.keyboard.press("Escape");
        await listMenu.waitFor({ state: "detached" });
        await ownerWidePage.keyboard.press("Escape");
        await portalMenu.menu.waitFor({ state: "detached" });
      }
      await expectNoWishDetail(ownerWidePage, "Desktop immediate list persistence");
    } finally {
      ownerWidePage.off("request", captureWishPatch);
    }
    await ownerWidePage.locator("[data-public-collection]").waitFor({ state: "visible" });

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
      const sourceListTile = ownerWidePage.locator('.list-tabs [data-slot="toggle-group-item"]').filter({ hasText: sourceList.title });
      await sourceListTile.click();
      assert((await ownerWidePage.locator(".wish-card").filter({ hasText: wishToMove.title }).count()) === 0, "Moved wish is still rendered in its former list");
    }
    const targetListTile = ownerWidePage.locator('.list-tabs [data-slot="toggle-group-item"]').filter({ hasText: targetList.title });
    await targetListTile.click();
    await ownerWidePage.locator(".wish-card").filter({ hasText: wishToMove.title }).waitFor({ state: "visible" });

    await ownerWidePage.reload({ waitUntil: "domcontentloaded" });
    await ownerWidePage.locator("[data-public-collection]").waitFor({ state: "visible" });
    await ownerWidePage.locator('.list-tabs [data-slot="toggle-group-item"]').filter({ hasText: targetList.title }).click();
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
    await ownerWidePage.locator("[data-public-collection]").waitFor({ state: "visible" });
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
    const nestedListDialog = ownerWidePage.getByRole("dialog", { name: "Создать список", exact: true });
    await nestedListDialog.waitFor({ state: "visible" });
    await expectCanonicalModalGeometry(nestedListDialog, "Nested create-list modal");
    await expectNoListCoverColor(nestedListDialog, "Nested create-list modal");
    await expectNoListHeadingIcon(nestedListDialog, "Nested create-list modal");
    await expectListControlSizing(nestedListDialog, "Nested create-list modal");
    await expectListSecretSwitch(nestedListDialog, "Nested create-list secret switch");
    assert(await mountedEditorDialog.isVisible(), "Opening list creation unmounted the wish editor");
    assert(await draftProbeInput.inputValue() === draftProbeTitle, "Opening list creation discarded the wish editor draft");
    await nestedListDialog.getByRole("button", { name: "Отмена", exact: true }).click();
    await nestedListDialog.waitFor({ state: "detached" });
    assert(await editorDialog.isVisible(), "Cancelling list creation did not return to the wish editor");
    assert(await draftProbeInput.inputValue() === draftProbeTitle, "Cancelling list creation discarded the wish editor draft");
    assert(
      await editorDialog.getAttribute("data-slot") === "wish-editor-content"
      && await editorDialog.getByRole("heading", { level: 2 }).count() === 1,
      "Wish editor does not remain mounted after closing its nested dialog",
    );
    assert(
      await ownerWidePage.locator("html").evaluate((element) => getComputedStyle(element).overflowY === "hidden"),
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
    const editedDescription = "Проверка редактора на временном желании";
    const editedUrl = "https://example.com/rollapp-editor-after";
    const editedPrice = 2345;
    const titleInput = editorDialog.getByLabel("Название", { exact: true });
    const urlInput = editorDialog.getByLabel("Ссылка", { exact: true });
    const descriptionInput = editorDialog.locator(".wish-editor__field--description > textarea");
    const priceInput = editorDialog.locator(".wish-editor__field--price > input[type='number']");
    const currencySelect = editorDialog.getByLabel("Валюта", { exact: true });
    const privateSwitch = editorDialog.getByRole("switch", { name: "Секретное желание", exact: true });
    const multipleSwitch = editorDialog.getByRole("switch", { name: "Многократное бронирование", exact: true });
    assert(await titleInput.inputValue() === draftProbeTitle, "Disposable editor did not preserve the title draft after list creation");
    assert(await urlInput.inputValue() === initialUrl, "Disposable editor did not prefill the wish URL");
    assert(await descriptionInput.inputValue() === initialDescription, "Disposable editor did not prefill the wish description");
    assert(Number(await priceInput.inputValue()) === 1234, "Disposable editor did not prefill the wish price");
    assert((await currencySelect.innerText()).trim() === "₽", "Disposable editor did not prefill the wish currency");
    assert(!(await privateSwitch.isChecked()), "Disposable editor wish unexpectedly started private");
    assert(!(await multipleSwitch.isChecked()), "Disposable editor wish unexpectedly allowed multiple reservations");

    await titleInput.fill(editedTitle);
    await urlInput.fill(editedUrl);
    await descriptionInput.fill(editedDescription);
    await priceInput.fill(String(editedPrice));
    await expectWishCurrencySelect(ownerWidePage, editorDialog, "Disposable wish editor currency", { selectValue: "EUR" });
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
    await ownerWidePage.waitForFunction(() => getComputedStyle(document.documentElement).overflowY !== "hidden");
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
    await ownerWidePage.locator("[data-public-collection]").waitFor({ state: "visible" });
    const updatedEditorCard = ownerWidePage.locator(".wish-card").filter({ hasText: editedTitle }).first();
    await updatedEditorCard.waitFor({ state: "visible" });
    await updatedEditorCard.getByRole("button", { name: `Открыть желание «${editedTitle}»`, exact: true }).click();
    const updatedEditorDetail = ownerWidePage.getByRole("dialog", { name: `Желание: ${editedTitle}`, exact: true });
    await updatedEditorDetail.waitFor({ state: "visible" });
    await expectStandaloneBuyAction(updatedEditorDetail, editedUrl, "1912px disposable wish buy action");
    await ownerWidePage.setViewportSize({ width: 390, height: 844 });
    await waitForStableLayout(ownerWidePage);
    await expectStandaloneBuyAction(updatedEditorDetail, editedUrl, "390px disposable wish buy action");
    await expectNoRootOverflow(ownerWidePage, "390px disposable wish detail");
    await ownerWidePage.setViewportSize({ width: 1912, height: 991 });
    await waitForStableLayout(ownerWidePage);
    await updatedEditorDetail.getByRole("button", { name: "Close" }).click();
    await updatedEditorDetail.waitFor({ state: "detached" });
    const updatedEditorMenu = await openOwnerWishCardMenu(ownerWidePage, updatedEditorCard, updatedEditorWish);
    await updatedEditorMenu.menu.getByRole("menuitem", { name: "Редактировать", exact: true }).click();
    const deleteEditorDialog = ownerWidePage.getByRole("dialog", { name: `Редактирование желания «${editedTitle}»`, exact: true });
    await deleteEditorDialog.waitFor({ state: "visible" });
    assert(await deleteEditorDialog.getByRole("switch", { name: "Секретное желание", exact: true }).isChecked(), "Saved privacy switch did not survive reopening");
    assert(await deleteEditorDialog.getByRole("switch", { name: "Многократное бронирование", exact: true }).isChecked(), "Saved multiple-reservation switch did not survive reopening");
    await deleteEditorDialog.getByRole("button", { name: "Удалить желание", exact: true }).click();

    const editorDeleteDialog = ownerWidePage.getByRole("alertdialog", { name: `Удалить «${editedTitle}»?`, exact: true });
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

  try {
    await ownerWidePage.goto(`${baseUrl}/alisa`, { waitUntil: "domcontentloaded" });
    await ownerWidePage.locator("[data-public-collection]").waitFor({ state: "visible" });
    const activeCard = ownerWidePage.locator(".wish-card").filter({ hasText: wishToMove.title }).first();
    await activeCard.waitFor({ state: "visible" });
    const activeDashboardResponse = await apiFromPage(ownerWidePage, "/api/dashboard");
    assert(activeDashboardResponse.ok, `Fulfilled action dashboard failed: ${activeDashboardResponse.status}`);
    const activeWish = activeDashboardResponse.data.wishes.find((wish) => wish.id === wishToMove.id);
    assert(activeWish?.status === "active", "Fulfilled action regression received a non-active wish");
    const activeMenu = await openOwnerWishCardMenu(ownerWidePage, activeCard, activeWish);
    const fulfillResponsePromise = ownerWidePage.waitForResponse((response) => (
      response.request().method() === "POST"
      && new URL(response.url()).pathname === `/api/wishes/${wishToMove.id}/fulfilled`
    ));
    await activeMenu.menu.getByRole("menuitem", { name: "Исполнено", exact: true }).click();
    const fulfillResponse = await fulfillResponsePromise;
    assert(fulfillResponse.ok(), `Fulfilling a wish failed: ${fulfillResponse.status()}`);
    assert((await fulfillResponse.json()).status === "fulfilled", "Fulfill action returned the wrong target status");
    await activeCard.locator(".fulfilled-badge").waitFor({ state: "visible" });
    assert(await activeCard.evaluate((card) => card.classList.contains("is-fulfilled")), "Fulfilled wish card did not receive its fulfilled state");
    const fulfilledOpacity = Number(await activeCard.evaluate((card) => getComputedStyle(card).opacity));
    assert(fulfilledOpacity > 0 && fulfilledOpacity < 1, `Fulfilled wish card is not translucent: opacity=${fulfilledOpacity}`);

    await ownerWidePage.goto(`${baseUrl}/app/wishes`, { waitUntil: "domcontentloaded" });
    const dashboardFulfilledCard = ownerWidePage.locator(".wish-card").filter({ hasText: wishToMove.title }).first();
    await dashboardFulfilledCard.locator(".fulfilled-badge").waitFor({ state: "visible" });
    const dashboardFulfilledOpacity = Number(await dashboardFulfilledCard.evaluate((card) => getComputedStyle(card).opacity));
    assert(dashboardFulfilledOpacity > 0 && dashboardFulfilledOpacity < 1, `Dashboard fulfilled wish card is not translucent: opacity=${dashboardFulfilledOpacity}`);
  } finally {
    const restoreStatusResponse = await apiFromPage(ownerWidePage, `/api/wishes/${wishToMove.id}/fulfilled`, {
      method: "POST",
      body: { fulfilled: false },
    });
    assert(restoreStatusResponse.ok && restoreStatusResponse.data?.status === "active", "Failed to restore seeded wish status");
  }
  await expectNoRootOverflow(ownerWidePage, "1912px owner wishes");
  await ownerWide.close();

  console.log("Visual smoke passed: desktop/mobile card menus, hover lists, fulfilled/delete actions, list persistence, wish details, app routes, friend directories, and unified public profiles");
} finally {
  await browser.close();
}
