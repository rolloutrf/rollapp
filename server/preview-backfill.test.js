import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyPreviewBackfillCandidate,
  PREVIEW_BACKFILL_KIND,
  resolvePreviewBackfillMetadata,
  RETAILER_PREVIEW_BACKFILL_BUDGET,
  selectPreviewBackfillCandidates,
  YANDEX_MAPS_PREVIEW_BACKFILL_BUDGET,
} from "./preview-backfill.js";

test("classifies only matching URLs with explicit food or place membership", () => {
  assert.equal(
    classifyPreviewBackfillCandidate({ url: "https://lavka.yandex.ru/good/coffee", isFood: true }),
    PREVIEW_BACKFILL_KIND.RETAILER,
  );
  assert.equal(
    classifyPreviewBackfillCandidate({ url: "https://yandex.ru/maps/org/coffee/123/", is_place: true }),
    PREVIEW_BACKFILL_KIND.YANDEX_MAPS,
  );

  const rejected = [
    { url: "https://lavka.yandex.ru/good/coffee", isPlace: true },
    { url: "https://yandex.ru/maps/org/coffee/123/", isFood: true },
    { url: "https://example.com/place", isPlace: true },
    { url: "https://lavka.yandex.ru/good/coffee", isFood: 1 },
    { url: "https://yandex.ru/maps/org/coffee/123/", isPlace: "true" },
  ];
  for (const row of rejected) assert.equal(classifyPreviewBackfillCandidate(row), "", row.url);
});

test("candidate selection keeps source order while enforcing independent budgets", () => {
  const rows = [];
  const total = Math.max(
    RETAILER_PREVIEW_BACKFILL_BUDGET,
    YANDEX_MAPS_PREVIEW_BACKFILL_BUDGET,
  ) + 3;
  for (let index = 0; index < total; index += 1) {
    rows.push({ id: `retailer-${index}`, url: `retailer:${index}`, isFood: true });
    rows.push({ id: `maps-${index}`, url: `maps:${index}`, isPlace: true });
  }
  rows.splice(7, 0, { id: "unsupported", url: "unsupported", isFood: true, isPlace: true });

  const selected = selectPreviewBackfillCandidates(rows, {
    retailerSupportsAutomaticMetadata: (url) => url.startsWith("retailer:"),
    isYandexMapsUrl: (url) => url.startsWith("maps:"),
  });

  assert.equal(
    selected.filter(({ previewBackfillKind }) => previewBackfillKind === PREVIEW_BACKFILL_KIND.RETAILER).length,
    RETAILER_PREVIEW_BACKFILL_BUDGET,
  );
  assert.equal(
    selected.filter(({ previewBackfillKind }) => previewBackfillKind === PREVIEW_BACKFILL_KIND.YANDEX_MAPS).length,
    YANDEX_MAPS_PREVIEW_BACKFILL_BUDGET,
  );
  assert.deepEqual(
    selected.map(({ id }) => id),
    rows
      .filter(({ url }) => url.startsWith("retailer:") || url.startsWith("maps:"))
      .filter(({ url }) => {
        const index = Number(url.split(":")[1]);
        return url.startsWith("retailer:")
          ? index < RETAILER_PREVIEW_BACKFILL_BUDGET
          : index < YANDEX_MAPS_PREVIEW_BACKFILL_BUDGET;
      })
      .map(({ id }) => id),
  );
});

test("retailer metadata resolution uses only the injected retailer resolver", async () => {
  const calls = [];
  const metadata = { imageUrl: "https://cdn.example/coffee.jpg" };
  const result = await resolvePreviewBackfillMetadata(
    {
      url: "https://lenta.com/product/coffee/",
      previewBackfillKind: PREVIEW_BACKFILL_KIND.RETAILER,
    },
    {
      resolveRetailerMetadata: async (url, options) => {
        calls.push(["retailer", url, options]);
        return metadata;
      },
      fetchPublicHtml: async () => assert.fail("retailer resolution must not fetch generic HTML"),
      parseYandexMapsMetadata: () => assert.fail("retailer resolution must not parse Yandex Maps"),
    },
  );

  assert.equal(result, metadata);
  assert.deepEqual(calls, [[
    "retailer",
    "https://lenta.com/product/coffee/",
    { allowBrowser: false },
  ]]);
});

test("Yandex Maps metadata resolution parses fetched HTML against the final URL", async () => {
  const originalUrl = "https://yandex.ru/maps/-/short-link";
  const finalUrl = "https://yandex.ru/maps/org/coffee/123/";
  const metadata = { imageUrl: "https://avatars.mds.yandex.net/place.jpg" };
  const calls = [];
  const result = await resolvePreviewBackfillMetadata(
    { url: originalUrl, previewBackfillKind: PREVIEW_BACKFILL_KIND.YANDEX_MAPS },
    {
      resolveRetailerMetadata: async () => assert.fail("Yandex resolution must not use a retailer resolver"),
      fetchPublicHtml: async (url) => {
        calls.push(["fetch", url]);
        return { html: "<meta property=\"og:image\" content=\"place.jpg\">", url: finalUrl };
      },
      parseYandexMapsMetadata: (html, url) => {
        calls.push(["parse", html, url]);
        return metadata;
      },
    },
  );

  assert.equal(result, metadata);
  assert.deepEqual(calls, [
    ["fetch", originalUrl],
    ["parse", "<meta property=\"og:image\" content=\"place.jpg\">", finalUrl],
  ]);
});

test("metadata resolution rejects an unclassified candidate", async () => {
  await assert.rejects(
    resolvePreviewBackfillMetadata({ url: "https://example.com" }, {}),
    /Unknown preview backfill candidate kind/,
  );
});
