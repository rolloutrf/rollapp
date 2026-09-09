// Read-only checks for an authenticated browser. No database or browser setup.
export function measureContainers() {
  const css = getComputedStyle(document.documentElement);
  const pixels = (value) => Number.parseFloat(value) * (value.trim().endsWith("rem") ? Number.parseFloat(css.fontSize) : 1);
  const page = document.querySelector(".app-page");
  const contentWidth = page ? page.clientWidth - pixels(getComputedStyle(page).paddingLeft) - pixels(getComputedStyle(page).paddingRight) : innerWidth - 2 * pixels(css.getPropertyValue("--layout-page-inset"));
  const roles = [
    [".sphere-text-page", "text"],
    [".career-content-rail, .cv-builder", "document"],
    [".identity-report-workspace, .wish-grid, .sphere-tabs__content > [class~=\"max-w-(--layout-collection-width)\"]", "collection"],
    [".contacts-sphere", "wide"],
    [".friends-directory", "form"],
    [".auth-form", "compact"],
  ];
  const rails = roles.flatMap(([selector, role]) => [...document.querySelectorAll(selector)].filter((element) => element.getBoundingClientRect().width > 0).map((element) => {
    const rect = element.getBoundingClientRect();
    const limit = pixels(css.getPropertyValue(`--layout-${role}-width`));
    const available = element.closest(".app-fullscreen-dialog") ? innerWidth - 2 * pixels(css.getPropertyValue("--layout-page-inset")) : contentWidth;
    return { role, width: rect.width, expected: Math.min(limit, available), left: rect.left, right: rect.right };
  }));
  const drawers = [...document.querySelectorAll('[data-slot="drawer-popup"]:not([data-ending-style])')].map((element) => {
    const rect = element.getBoundingClientRect();
    const limit = pixels(getComputedStyle(element).getPropertyValue("--layout-panel-width") || css.getPropertyValue("--layout-form-width"));
    return { width: rect.width, expected: element.dataset.swipeAxis === "x" ? Math.min(limit, innerWidth - 2 * pixels(css.getPropertyValue("--layout-panel-inset"))) : innerWidth };
  });
  const editors = [...document.querySelectorAll(".app-fullscreen-dialog.wish-editor-screen .wish-editor__layout")].map((element) => {
    const style = getComputedStyle(element);
    const limit = pixels(css.getPropertyValue(innerWidth > 820 ? "--layout-document-width" : "--layout-form-width"));
    return { width: element.getBoundingClientRect().width, expected: Math.min(limit, innerWidth - 2 * pixels(css.getPropertyValue("--layout-item-gap"))), display: style.display, columns: style.gridTemplateColumns.split(" ").length, expectedColumns: innerWidth > 820 ? 2 : 1 };
  });
  return { viewport: innerWidth, path: location.pathname + location.search, overflow: document.documentElement.scrollWidth > innerWidth + 1, rails, drawers, editors };
}

export function assertContainers(result) {
  const failures = [];
  if (result.overflow) failures.push("horizontal overflow");
  for (const rail of result.rails) {
    if (!Number.isFinite(rail.expected) || Math.abs(rail.width - rail.expected) > 1) failures.push(`${rail.role} width ${rail.width}, expected ${rail.expected}`);
    if (Math.abs(rail.left - (result.viewport - rail.right)) > 1) failures.push(`${rail.role} rail is not centered`);
  }
  for (const drawer of result.drawers) {
    if (!Number.isFinite(drawer.expected) || Math.abs(drawer.width - drawer.expected) > 1) failures.push(`drawer width ${drawer.width}, expected ${drawer.expected}`);
  }
  for (const editor of result.editors) {
    if (Math.abs(editor.width - editor.expected) > 1 || editor.display !== "grid" || editor.columns !== editor.expectedColumns) failures.push("fullscreen editor has the wrong width or column count");
  }
  if (failures.length) throw new Error(`${result.path} at ${result.viewport}px: ${failures.join("; ")}`);
  return result;
}
