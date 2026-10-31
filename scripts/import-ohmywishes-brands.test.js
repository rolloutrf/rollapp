import assert from "node:assert/strict";
import test from "node:test";
import { BRAND_SLUGS, validateSnapshot } from "./import-ohmywishes-brands.mjs";

function completeSnapshot() {
  return { version: 1, source: "ohmywishes", fetchedAt: "2026-09-10T15:00:00Z", brands: BRAND_SLUGS.map((slug) => ({
    id: slug, slug, total: 1, profile: { id: slug, username: slug, accountType: "brand", wishesCount: 1 },
    items: [{ id: `${slug}-idea`, title: "Товар", isIdea: true, creator: { id: slug } }],
  })) };
}

test("brand import refuses incomplete storefronts before opening a database", () => {
  const snapshot = completeSnapshot();
  assert.equal(validateSnapshot(snapshot), snapshot);
  snapshot.brands[0].items = [];
  assert.throws(() => validateSnapshot(snapshot), /Неполный каталог/);
});

test("brand import requires every requested brand and validates the provider identity", () => {
  const missing = completeSnapshot();
  missing.brands.pop();
  assert.throws(() => validateSnapshot(missing), /полный снимок разрешённых брендов/);
  const wrong = completeSnapshot();
  wrong.brands[0].items[0].creator.id = "different-brand";
  assert.throws(() => validateSnapshot(wrong), /Некорректная/);
});

test("brand import rejects repeated products and unavailable storefronts", () => {
  const duplicate = completeSnapshot();
  duplicate.brands[0].items.push(duplicate.brands[0].items[0]);
  duplicate.brands[0].total = duplicate.brands[0].profile.wishesCount = 2;
  assert.throws(() => validateSnapshot(duplicate), /повторная карточка/);
  const conflict = completeSnapshot();
  conflict.brands[0].slug = "removed-brand";
  conflict.brands[0].profile.username = "removed-brand";
  assert.throws(() => validateSnapshot(conflict), /Не удалось подтвердить бренд/);
});
