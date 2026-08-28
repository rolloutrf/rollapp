import assert from "node:assert/strict";
import test from "node:test";
import { normalizeSamokatBrowserMetadata, SamokatBrowserImportError } from "./samokat-browser-import.js";

test("normalizes product metadata returned by the Samokat browser helper", () => {
  assert.deepEqual(normalizeSamokatBrowserMetadata({
    title: "  Киви  ",
    description: "  Сочные киви  ",
    imageUrl: "https://damcdn.samokat.ru/dam-storage-ext-env-prod/2026/02/product-id",
    price: "199",
    currency: "rub",
  }), {
    title: "Киви",
    description: "Сочные киви",
    imageUrl: "https://damcdn.samokat.ru/dam-storage-ext-env-prod/2026/02/product-id",
    price: 199,
    currency: "RUB",
    previewFallback: false,
  });
});

test("rejects an image outside Samokat's product CDN", () => {
  assert.throws(
    () => normalizeSamokatBrowserMetadata({ imageUrl: "https://tracking.example/pixel.jpg" }),
    (error) => error instanceof SamokatBrowserImportError && error.code === "image_missing",
  );
});
