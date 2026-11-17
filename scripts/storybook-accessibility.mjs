import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { writeFile } from "node:fs/promises";
import { chromium } from "playwright-core";
import { browserLaunchOptions } from "./browser-runtime.mjs";
import { waitForStoryContent } from "./storybook-readiness.mjs";

// Isolated UI scenarios only; never send fixture actions to the application API.
const origin = new URL(process.env.ROLLAPP_STORYBOOK_URL || "http://127.0.0.1:6006/");
const response = await fetch(new URL("index.json", origin));
assert(response.ok, "Start Storybook or serve its static build first.");
const stories = Object.values((await response.json()).entries).filter(entry => entry.type === "story");
assert(stories.length > 0, "The Storybook index must contain stories.");
const axePath = createRequire(import.meta.url).resolve("axe-core/axe.min.js");
const checks = stories.flatMap(story => [
  { id: story.id, theme: "dark", width: 390, height: 844 },
  { id: story.id, theme: "light", width: 1440, height: 900 },
]);
const results = [];
const browser = await chromium.launch(browserLaunchOptions());
let next = 0;
try {
  await Promise.all(Array.from({ length: 2 }, async () => {
    for (let i = next++; i < checks.length; i = next++) {
      const check = checks[i];
      const page = await browser.newPage({ viewport: { width: check.width, height: check.height } });
      page.setDefaultTimeout(25000);
      page.setDefaultNavigationTimeout(60000);
      const errors = [];
      page.on("pageerror", error => errors.push(error.message));
      page.on("console", message => { if (message.type() === "error" && /Maximum update depth|Too many re-renders/.test(message.text())) errors.push(message.text()); });
      await page.route("**/*", route => {
        if (/^\/(?:api|mcp)(?:\/|$)/.test(new URL(route.request().url()).pathname)) {
          errors.push(`Unexpected API request: ${route.request().method()}`);
          return route.abort();
        }
        return route.continue();
      });
      try {
        const url = new URL("iframe.html", origin);
        url.search = new URLSearchParams({ id: check.id, viewMode: "story", globals: `theme:${check.theme}` });
        await page.goto(url.href, { waitUntil: "domcontentloaded" });
        await page.waitForFunction(() => document.querySelector("#storybook-root > *"));
        await waitForStoryContent(page, check.id);
        await page.evaluate(() => document.fonts.ready);
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        assert.equal(await page.locator(".sb-errordisplay:visible").count(), 0, "Story render error");
        await page.addScriptTag({ path: axePath });
        const { violations, incomplete } = await page.evaluate(() => window.axe.run(document, {
          runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] },
        }));
        assert.equal(await page.locator(".sb-errordisplay:visible").count(), 0, "Story failed while resolving its content");
        assert(await page.locator("#storybook-root > *").count(), "Story content disappeared during the scan");
        const geometry = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth }));
        if (geometry.scrollWidth > geometry.width + 1) errors.push(`Root overflow: ${JSON.stringify(geometry)}`);
        // A named generic wrapper is invalid in HTML ARIA even when axe requests manual review.
        const invalidNames = incomplete.filter(item => item.id === "aria-prohibited-attr");
        const manualReview = incomplete.filter(item => item.id !== "aria-prohibited-attr");
        violations.push(...invalidNames);
        const compact = items => items.map(({ id, impact, nodes }) => ({ id, impact, nodes: nodes.map(({ target, failureSummary }) => ({ target, failureSummary })) }));
        results.push({ ...check, errors, violations: compact(violations), manualReview: compact(manualReview) });
        console.log(`${errors.length || violations.length ? "FAIL" : "PASS"} ${check.id} ${check.theme}${violations.length ? ": " + violations.map(v => v.id).join(", ") : ""}`);
      } catch (error) {
        results.push({ ...check, errors: [...errors, error.message], violations: [] });
        console.error(`FAIL ${check.id} ${check.theme}: ${error.message}`);
      } finally {
        await page.close();
      }
    }
  }));
} finally {
  await browser.close();
}
if (process.env.ROLLAPP_A11Y_REPORT) await writeFile(process.env.ROLLAPP_A11Y_REPORT, JSON.stringify(results, null, 2) + "\n");
const failures = results.filter(result => result.errors.length || result.violations.length);
assert.equal(failures.length, 0, `${failures.length}/${checks.length} accessibility checks failed. Inspect the report and browser output.`);
console.log(`${checks.length} accessibility checks passed. Automated checks do not replace keyboard and visual review.`);
