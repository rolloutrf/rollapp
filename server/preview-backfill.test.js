import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyPreviewBackfillCandidate,
  PREVIEW_BACKFILL_KIND,
  previewBackfillPatch,
  resolvePreviewBackfillMetadata,
  RETAILER_PREVIEW_BACKFILL_BUDGET,
  selectPreviewBackfillCandidates,
  VK_VIDEO_PREVIEW_BACKFILL_BUDGET,
  YANDEX_MAPS_PREVIEW_BACKFILL_BUDGET,
} from "./preview-backfill.js";

test("place backfill adds a metadata address without replacing saved content", () => {
  const emptyPlace = {
    image_url: "https://avatars.mds.yandex.net/saved-place.jpg",
    description: "",
    previewBackfillKind: PREVIEW_BACKFILL_KIND.YANDEX_MAPS,
  };
  assert.deepEqual(
    previewBackfillPatch(emptyPlace, {
      description: "Москва, улица Примерная, 10 • 4,8 (256 оценок)",
      imageUrl: "https://avatars.mds.yandex.net/new-place.jpg",
    }),
    {
      imageUrl: "https://avatars.mds.yandex.net/saved-place.jpg",
      description: "Москва, улица Примерная, 10 • 4,8 (256 оценок)",
      changed: true,
    },
  );

  assert.deepEqual(
    previewBackfillPatch({
      image_url: "",
      description: "",
      previewBackfillKind: PREVIEW_BACKFILL_KIND.YANDEX_MAPS,
    }, { description: "Казань, улица Баумана, 12" }),
    { imageUrl: "", description: "Казань, улица Баумана, 12", changed: true },
  );

  const describedPlace = { ...emptyPlace, description: "Встречаемся у главного входа" };
  assert.deepEqual(
    previewBackfillPatch(describedPlace, { description: "Москва, другой адрес" }),
    {
      imageUrl: "https://avatars.mds.yandex.net/saved-place.jpg",
      description: "Встречаемся у главного входа",
      changed: false,
    },
  );
});

test("classifies only matching URLs with explicit food or place membership", () => {
  assert.equal(
    classifyPreviewBackfillCandidate({ url: "https://lavka.yandex.ru/good/coffee", isFood: true }),
    PREVIEW_BACKFILL_KIND.RETAILER,
  );
  assert.equal(
    classifyPreviewBackfillCandidate({ url: "https://yandex.ru/maps/org/coffee/123/", is_place: true }),
    PREVIEW_BACKFILL_KIND.YANDEX_MAPS,
  );
  assert.equal(
    classifyPreviewBackfillCandidate({ url: "https://vk.com/video-4829_456240230", is_media: true }),
    PREVIEW_BACKFILL_KIND.VK_VIDEO,
  );

  const rejected = [
    { url: "https://lavka.yandex.ru/good/coffee", isPlace: true },
    { url: "https://yandex.ru/maps/org/coffee/123/", isFood: true },
    { url: "https://vk.com/video-4829_456240230", isPlace: true },
    { url: "https://vkvideo.ru/@channel", isMedia: true },
    { url: "https://example.com/place", isPlace: true },
    { url: "https://lavka.yandex.ru/good/coffee", isFood: 1 },
    { url: "https://yandex.ru/maps/org/coffee/123/", isPlace: "true" },
  ];
  for (const row of rejected) assert.equal(classifyPreviewBackfillCandidate(row), "", row.url);
});

test("VK Video candidates have an independent backfill budget", () => {
  const rows = Array.from({ length: VK_VIDEO_PREVIEW_BACKFILL_BUDGET + 3 }, (_, index) => ({
    id: `vk-${index}`,
    url: `vk:${index}`,
    isMedia: true,
  }));
  const selected = selectPreviewBackfillCandidates(rows, {
    retailerSupportsAutomaticMetadata: () => false,
    isYandexMapsUrl: () => false,
    isVkVideoUrl: (url) => url.startsWith("vk:"),
  });

  assert.equal(selected.length, VK_VIDEO_PREVIEW_BACKFILL_BUDGET);
  assert(selected.every(({ previewBackfillKind }) => previewBackfillKind === PREVIEW_BACKFILL_KIND.VK_VIDEO));
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

test("VK Video metadata resolution uses the injected high-resolution resolver", async () => {
  const videoUrl = "https://vk.com/video-4829_456240230";
  const metadata = { imageUrl: "https://cdn.example/video.jpg", kind: "video" };
  const calls = [];
  const result = await resolvePreviewBackfillMetadata(
    { url: videoUrl, previewBackfillKind: PREVIEW_BACKFILL_KIND.VK_VIDEO },
    {
      resolveVkVideoMetadata: async (url) => {
        calls.push(["resolve", url]);
        return metadata;
      },
    },
  );

  assert.equal(result, metadata);
  assert.deepEqual(calls, [["resolve", videoUrl]]);
});

test("metadata resolution rejects an unclassified candidate", async () => {
  await assert.rejects(
    resolvePreviewBackfillMetadata({ url: "https://example.com" }, {}),
    /Unknown preview backfill candidate kind/,
  );
});
