// A mounted story shell is not proof that its lazy editor has loaded.
const selectors = {
  "rollapp-rich-documents--table": ".ProseMirror table",
  "rollapp-rich-documents--image": ".ProseMirror img",
  "rollapp-rich-documents--reader": "#storybook-root h1",
  "rollapp-identity--questions": ".four-questions .ProseMirror",
  "rollapp-career--about": ".ProseMirror[contenteditable='true']",
  "rollapp-career--read-only": ".ProseMirror",
  "rollapp-career--domain-story": ".ProseMirror",
  "rollapp-career--plan": ".ProseMirror",
  "rollapp-calendar--week": ".schedule-timegrid--week",
  "rollapp-catalog-marketplace--detail": "#storybook-root h1",
};

export function storyReadySelector(id) {
  return selectors[id] || (id.startsWith("rollapp-rich-documents--") ? ".ProseMirror" : null);
}

export async function waitForStoryContent(surface, id) {
  // fonts.ready can resolve before an asynchronously requested stylesheet exists.
  // Confirm the product CSS first, so an unstyled shell cannot pass a UI audit.
  await surface.waitForFunction(() => {
    const root = getComputedStyle(document.documentElement);
    return root.getPropertyValue("--font-sans").includes("Geist")
      && getComputedStyle(document.body).fontFamily.includes("Geist");
  });
  const selector = storyReadySelector(id);
  if (selector) await surface.locator(selector).first().waitFor({ state: "visible" });
  await surface.getByText("Загружаем текст…", { exact: true }).first().waitFor({ state: "hidden" });
  await surface.evaluate(() => document.fonts.ready);
}
