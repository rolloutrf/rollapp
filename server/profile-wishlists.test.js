import assert from "node:assert/strict";
import test from "node:test";
import { externalWishlistLinks } from "../shared/external-wishlists.js";
import { mergeProfileWishlistLinks, profileWishlistLinksPatchSchema } from "./profile-wishlists.js";

const links = {
  ohmywishes: "https://ohmywishes.com/users/example/lists/example",
  ozon: "https://ozon.ru/t/example?share=1",
  wb: "https://www.wildberries.ru/wishlist/example",
};

test("profile links preserve the share URL and only update the named services", () => {
  const initial = profileWishlistLinksPatchSchema.parse({ ...links, ozon: `  ${links.ozon}  ` });
  assert.deepEqual(mergeProfileWishlistLinks(undefined, initial), links);
  const updated = profileWishlistLinksPatchSchema.parse({ wb: "https://wb.ru/wishlist/next", ozon: null });
  assert.deepEqual(mergeProfileWishlistLinks(links, updated), {
    ohmywishes: links.ohmywishes,
    wb: updated.wb,
  });
  assert.deepEqual(mergeProfileWishlistLinks(links, {}), links);
});

test("write and public read reject invalid, mismatched and impersonating URLs", () => {
  for (const url of [
    links.wb, "https://ozon.ru", "https://ozon.ru.example/t/1", "https://fakeozon.ru/t/1",
    "https://example.com@ozon.ru/t/1", "https://ozon.ru:444/t/1",
    "http://ozon.ru/t/1", "javascript:alert(1)", "/t/1", "https://ozon.ru/t/" + "x".repeat(2048),
  ]) {
    assert.equal(profileWishlistLinksPatchSchema.safeParse({ ozon: url }).success, false, url);
    assert.deepEqual(externalWishlistLinks({ ozon: url }), {});
  }
  assert.equal(profileWishlistLinksPatchSchema.safeParse({ unknown: links.wb }).success, false);
  assert.deepEqual(externalWishlistLinks(null), {});
});
