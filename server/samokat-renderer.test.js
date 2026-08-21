import assert from "node:assert/strict";
import test from "node:test";
import { MetadataFetchError } from "./metadata-fetch.js";
import {
  canonicalSamokatProductUrl,
  isAllowedSamokatBrowserUrl,
  isInteractiveSamokatChallenge,
  isSamokatProductHead,
  renderLentaProductHtml,
  renderSamokatProductHtml,
} from "./samokat-renderer.js";

const productHead = `
  <head>
    <meta property="og:title" content="Репчатый лук, отборный 500 г">
    <script nonce="test" type="application/ld+json">
      {"@context":"https://schema.org","@type":"Product","name":"Репчатый лук"}
    </script>
  </head>`;

test("canonicalizes only exact Samokat product links and removes tracking data", () => {
  assert.equal(
    canonicalSamokatProductUrl("http://www.samokat.ru/product/repchatyy-luk-otbornyy-500-g/?utm_source=share#photo").href,
    "https://samokat.ru/product/repchatyy-luk-otbornyy-500-g",
  );

  for (const value of [
    "https://samokat.ru.evil.example/product/onion",
    "https://samokat.ru/category/vegetables",
    "ftp://samokat.ru/product/onion",
    "https://user:secret@samokat.ru/product/onion",
  ]) {
    assert.throws(
      () => canonicalSamokatProductUrl(value),
      (error) => error instanceof MetadataFetchError && error.code === "samokat_unsupported_url",
      value,
    );
  }
});

test("accepts Product JSON-LD heads and rejects challenge or oversized documents", () => {
  assert.equal(isSamokatProductHead(productHead), true);
  assert.equal(
    isSamokatProductHead('<script type="application/ld+json">{"@type":["https://schema.org/Product"]}</script>'),
    true,
  );
  assert.equal(isSamokatProductHead("<head><title>Forbidden</title></head>"), false);
  assert.equal(isSamokatProductHead(`${productHead}${" ".repeat(300_000)}`), false);
});

test("recognizes only the interactive Servicepipe verification copy", () => {
  assert.equal(isInteractiveSamokatChallenge("Пожалуйста, пройдите проверку, чтобы получить доступ к сайту."), true);
  assert.equal(isInteractiveSamokatChallenge("Разверните картинку горизонтально"), true);
  assert.equal(isInteractiveSamokatChallenge("Доставка продуктов от 15 минут"), false);
});

test("browser allowlist is limited to Samokat and its challenge provider", () => {
  for (const value of [
    "https://samokat.ru/product/onion",
    "https://api-web.samokat.ru/v2/showcases/list",
    "https://servicepipe.tech/static/check.js",
    "https://cdn.servicepipe.tech/challenge.js",
    "data:text/plain,ok",
  ]) assert.equal(isAllowedSamokatBrowserUrl(value), true, value);

  for (const value of [
    "http://samokat.ru/product/onion",
    "https://samokat.ru.evil.example/product/onion",
    "https://servicepipe.tech.evil.example/check.js",
    "wss://servicepipe.tech.evil.example/challenge",
    "https://analytics.example/collect",
    "wss://servicepipe.tech/challenge",
  ]) assert.equal(isAllowedSamokatBrowserUrl(value), false, value);
});

test("deduplicates concurrent renders of the same canonical product", async () => {
  let calls = 0;
  let release;
  const waiting = new Promise((resolve) => { release = resolve; });
  const renderPage = async (url, options) => {
    calls += 1;
    assert.equal(url.href, "https://samokat.ru/product/repchatyy-luk-otbornyy-500-g");
    assert.equal(options.timeoutMs, 2_000);
    await waiting;
    return { html: productHead, url };
  };

  const first = renderSamokatProductHtml("https://samokat.ru/product/repchatyy-luk-otbornyy-500-g?one=1", { timeoutMs: 100, renderPage });
  const second = renderSamokatProductHtml("https://www.samokat.ru/product/repchatyy-luk-otbornyy-500-g?two=2", { timeoutMs: 100, renderPage });
  release();
  const [left, right] = await Promise.all([first, second]);

  assert.equal(calls, 1);
  assert.equal(left.html, productHead);
  assert.equal(right.url.href, left.url.href);
});

test("gives a queued retailer job a fresh render deadline after it gets the slot", async () => {
  let secondRemainingMs = 0;
  const first = renderLentaProductHtml("https://lenta.com/product/first-111111", {
    timeoutMs: 2_000,
    renderPage: async (url) => {
      await new Promise((resolve) => setTimeout(resolve, 250));
      return { html: productHead, url };
    },
  });
  await new Promise((resolve) => setImmediate(resolve));
  const second = renderLentaProductHtml("https://lenta.com/product/second-222222", {
    timeoutMs: 2_000,
    renderPage: async (url, { deadline }) => {
      secondRemainingMs = deadline - Date.now();
      return { html: productHead, url };
    },
  });

  await Promise.all([first, second]);
  assert.ok(secondRemainingMs > 1_800, `queued render received only ${secondRemainingMs}ms`);
});

test("rejects rendered challenge pages and redirects to another product", async () => {
  await assert.rejects(
    renderSamokatProductHtml("https://samokat.ru/product/onion", {
      renderPage: async (url) => ({ html: "<title>Forbidden</title>", url }),
    }),
    (error) => error instanceof MetadataFetchError && error.code === "samokat_product_missing",
  );

  await assert.rejects(
    renderSamokatProductHtml("https://samokat.ru/product/onion", {
      renderPage: async () => ({ html: productHead, url: new URL("https://samokat.ru/product/garlic") }),
    }),
    (error) => error instanceof MetadataFetchError && error.code === "samokat_browser_redirected",
  );
});

test("accepts a Lenta canonical redirect with the same SKU and rejects another product", async () => {
  const sourceUrl = "https://lenta.com/item/short-name-888521/";
  const finalUrl = new URL("https://lenta.com/product/full-canonical-name-888521/");
  const html = `
    <body>
      <script type="application/ld+json">
        {"@type":"Product","name":"Молоко","sku":"888521"}
      </script>
    </body>`;

  const result = await renderLentaProductHtml(sourceUrl, {
    timeoutMs: 3_000,
    renderPage: async (url, options) => {
      assert.equal(url.href, "https://lenta.com/product/short-name-888521");
      assert.equal(options.retailerId, "lenta");
      return { html, url: finalUrl };
    },
  });
  assert.equal(result.url.href, "https://lenta.com/product/full-canonical-name-888521");

  await assert.rejects(
    renderLentaProductHtml(sourceUrl, {
      renderPage: async () => ({
        html,
        url: new URL("https://lenta.com/product/another-product-777777/"),
      }),
    }),
    (error) => error instanceof MetadataFetchError && error.code === "lenta_browser_redirected",
  );
});

test("expires queued renders without consuming the only browser slot", async () => {
  let releaseFirst;
  const firstGate = new Promise((resolve) => { releaseFirst = resolve; });
  const first = renderSamokatProductHtml("https://samokat.ru/product/first", {
    timeoutMs: 20_000,
    renderPage: async (url) => {
      await firstGate;
      return { html: productHead, url };
    },
  });

  await new Promise((resolve) => setImmediate(resolve));
  const startedAt = Date.now();
  await assert.rejects(
    renderSamokatProductHtml("https://samokat.ru/product/queued", {
      timeoutMs: 2_000,
      renderPage: async (url) => ({ html: productHead, url }),
    }),
    (error) => error instanceof MetadataFetchError && error.code === "samokat_render_timeout",
  );
  assert.ok(Date.now() - startedAt < 2_750);

  releaseFirst();
  await first;
  const final = await renderSamokatProductHtml("https://samokat.ru/product/final", {
    renderPage: async (url) => ({ html: productHead, url }),
  });
  assert.equal(final.url.href, "https://samokat.ru/product/final");
});

test("waits for an active renderer to stop before giving its slot to the next job", async () => {
  let active = 0;
  let maxActive = 0;
  const startedAt = Date.now();
  const timedOut = renderSamokatProductHtml("https://samokat.ru/product/timed-out", {
    timeoutMs: 2_000,
    renderPage: async (url, { signal }) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => signal.addEventListener("abort", () => setTimeout(resolve, 1_000), { once: true }));
      active -= 1;
      return { html: productHead, url };
    },
  });

  await assert.rejects(
    timedOut,
    (error) => error instanceof MetadataFetchError && error.code === "samokat_render_timeout",
  );
  assert.ok(Date.now() - startedAt < 2_700, "the public timeout must not wait for renderer cleanup");
  const final = await renderSamokatProductHtml("https://samokat.ru/product/after-timeout", {
    renderPage: async (url) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      active -= 1;
      return { html: productHead, url };
    },
  });

  assert.equal(final.url.href, "https://samokat.ru/product/after-timeout");
  assert.equal(maxActive, 1);
  assert.equal(active, 0);
});
