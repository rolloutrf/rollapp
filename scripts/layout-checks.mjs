// Read-only browser checks. Evaluate in an authenticated session; this module
// never starts a browser or modifies application data.
export function measureApplicationLayout() {
  const box = (element) => {
    if (!element) return null;
    const { top, right, bottom, left, width, height } = element.getBoundingClientRect();
    return { top, right, bottom, left, width, height };
  };
  const visible = (element) => {
    const rect = box(element);
    const style = getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && !element.closest(".sr-only, [hidden]") && style.display !== "none"
      && style.visibility !== "hidden" && !["absolute", "fixed"].includes(style.position);
  };
  const header = document.querySelector(".global-app-chrome");
  const backdrop = header && getComputedStyle(header, "::before");
  const controls = header ? [...header.children].filter(visible).map(box) : [];
  const page = document.querySelector(".app-page");
  const firstSurface = document.querySelector(".persistent-profile-hero .sphere-share-avatars, .public-collection-page__hero .wishes-page__hero-avatar, .auth-form")
    || (page && [...page.children].find((element) => !element.classList.contains("app-shell-chrome-spacer") && visible(element)));
  return {
    width: innerWidth,
    scrollY,
    overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    headerOverlap: controls.some((a, index) => controls.slice(index + 1).some((b) =>
      a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top)),
    backdropBottom: backdrop ? Number.parseFloat(backdrop.top) + Number.parseFloat(backdrop.height) : 0,
    firstSurface: box(firstSurface),
    tabNavigation: [...document.querySelectorAll('[data-slot="tabs-list"], .list-tabs, .public-list-tabs')].filter(visible).map((element) => {
      const bounds = box(element);
      const style = getComputedStyle(element);
      const items = [...element.querySelectorAll('[data-slot="tabs-trigger"], [data-slot="toggle-group-item"], .list-tabs__add')].map(box);
      const tiles = [...element.querySelectorAll('[data-slot="toggle-group-item"]')].map(box);
      return {
        label: element.getAttribute("aria-label") || element.className,
        horizontalList: element.hasAttribute("data-wishlist-list-navigation"),
        singleRow: tiles.every((tile) => Math.abs(tile.top - tiles[0].top) <= 1),
        verticalOverflow: element.scrollHeight > element.clientHeight + 1 || items.some((rect) => rect.top < bounds.top - 1 || rect.bottom > bounds.bottom + 1),
        scrollable: [style.overflowX, style.overflowY].some((value) => /^(auto|scroll)$/.test(value)),
        clipped: items.some((rect) => rect.left < bounds.left - 1 || rect.right > bounds.right + 1 || rect.top < bounds.top - 1 || rect.bottom > bounds.bottom + 1),
      };
    }),
    emptyAccordions: [...document.querySelectorAll(".document-accordion")]
      .filter((element) => !element.querySelector('[data-slot="accordion-item"]')).length,
    stacks: [...document.querySelectorAll(".page-stack, .wishes-page__profile-controls, .public-collection-page__hero, .auth-form")].filter(visible).map((element) => {
      const children = [...element.children].filter(visible).map(box);
      return {
        className: element.className,
        expectedGap: Number.parseFloat(getComputedStyle(element).rowGap),
        gaps: children.slice(1).map((child, index) => child.top - children[index].bottom),
      };
    }),
    documentStarts: [...document.querySelectorAll(".sphere-text-page > .life-strategy-source")].map((element) => ({
      leadingGap: box(element.firstElementChild)?.top - box(element).top,
    })),
    nestedBottomPadding: [...document.querySelectorAll(".sphere-text-page, .tabbed-sphere")]
      .map((element) => Number.parseFloat(getComputedStyle(element).paddingBottom)),
    fullscreenEditors: [...document.querySelectorAll(".app-fullscreen-dialog.wish-editor-screen")].map((element) => ({
      viewportHeight: innerHeight,
      viewportWidth: innerWidth,
      close: box(element.querySelector(".wish-editor-screen__close")),
      content: box(element.querySelector(".wish-editor-screen__content")),
      footer: box(element.querySelector(".wish-editor-screen__footer")),
    })),
    contactDrawers: [...document.querySelectorAll(".contact-detail-drawer")].map((element) => ({
      close: box(element.querySelector(".contact-detail__close")),
      content: box(element.querySelector('[data-slot="scroll-area-viewport"]')),
    })),
  };
}

export function assertApplicationLayout(result, label = "Application layout") {
  const errors = [];
  if (result.overflow) errors.push("horizontal page overflow");
  if (result.headerOverlap) errors.push("overlapping header controls");
  for (const navigation of result.tabNavigation || []) {
    if (navigation.horizontalList) {
      if (!navigation.singleRow || navigation.verticalOverflow) errors.push("wrapped or vertically clipped wishlist lists: " + navigation.label);
    } else if (navigation.scrollable || navigation.clipped) errors.push("scrollable or clipped tab navigation: " + navigation.label);
  }
  if (result.scrollY === 0 && result.firstSurface?.top < result.backdropBottom - 1) errors.push("first content underneath the header backdrop");
  if (result.emptyAccordions) errors.push("empty document accordion reserving layout space");
  for (const stack of result.stacks) {
    if (stack.gaps.some((gap) => Math.abs(gap - stack.expectedGap) > 1)) errors.push("stack gap differs from its token: " + stack.className + " (" + stack.gaps.join(", ") + ")");
  }
  if (result.documentStarts.some(({ leadingGap }) => leadingGap > 1)) errors.push("extra leading gap inside a text document");
  if (result.nestedBottomPadding.some((padding) => padding > 0)) errors.push("duplicated page-end padding");
  for (const editor of result.fullscreenEditors || []) {
    for (const control of [editor.close, editor.footer]) {
      if (control && (control.top < -1 || control.left < -1 || control.bottom > editor.viewportHeight + 1 || control.right > editor.viewportWidth + 1)) errors.push("fullscreen editor actions outside the viewport");
    }
    if (editor.content && editor.footer && editor.content.bottom > editor.footer.top + 1) errors.push("fullscreen editor footer overlapping its scroll content");
    if (editor.content && editor.close && editor.content.top < editor.close.bottom - 1) errors.push("fullscreen editor close action overlapping its scroll content");
  }
  for (const drawer of result.contactDrawers || []) {
    if (drawer.content && drawer.close && drawer.content.top < drawer.close.bottom - 1) errors.push("contact close action overlapping its scroll content");
  }
  if (errors.length) throw new Error(label + " at " + result.width + "px: " + errors.join("; "));
  return result;
}
