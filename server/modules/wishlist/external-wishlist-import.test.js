import assert from "node:assert/strict";
import test from "node:test";
import { readOhMyWishes, readOzonWishlist, readWildberriesWishlist, readYandexMarketWishlist } from "./external-wishlist-import.js";

const profileUrl = "https://ohmywishes.com/users/example";
const wish = (id) => ({
  id, title: "Наушники", price: { price: 2499, currency: "RUB" },
  photos: [{ image: { url: "https://cdn3.ohmywishes.com/images/example.webp" } }],
});

test("OhMyWishes imports successive pages and uses the same key for a profile and its specific list", async () => {
  const fetchJson = async (input, options) => {
    assert.equal(options.maxRedirects, 0);
    const url = new URL(input);
    assert.equal(url.origin, "https://ohmywishes.com");
    if (url.pathname.endsWith("/users/example")) return { json: { item: { id: "user1" } } };
    if (url.pathname.endsWith("/list1/wishes-v2")) return { json: { items: [wish("item0")] } };
    assert.ok(url.pathname.endsWith("/user1/wish-lists/all/wishes"));
    const offset = Number(url.searchParams.get("offset"));
    assert.ok([0, 20].includes(offset));
    return { json: { items: Array.from({ length: offset ? 1 : 20 }, (_, index) => wish(`item${offset + index}`)) } };
  };
  const all = await readOhMyWishes(profileUrl, { fetchJson });
  const [single] = await readOhMyWishes(`${profileUrl}/lists/list1`, { fetchJson });
  assert.equal(all.length, 21);
  assert.deepEqual(single, { ...all[0], url: `${profileUrl}/lists/list1/wishes/item0` });
  assert.equal(single.price, 2499);
  assert.match(single.image_url, /^https:\/\/cdn3\.ohmywishes\.com\//);
});

test("OhMyWishes rejects closed profiles and interrupted or repeated pages", async () => {
  await assert.rejects(readOhMyWishes(profileUrl, {
    fetchJson: async () => ({ json: { item: { id: "user1", isPrivate: true } } }),
  }), { status: 422 });
  await assert.rejects(readOhMyWishes(profileUrl, {
    fetchJson: async (url) => url.endsWith("/users/example") ? { json: { item: { id: "user1" } } }
      : { json: { items: Array.from({ length: 20 }, (_, index) => wish(`item${index}`)) } },
  }), { status: 502 });
});

const marketUrl = new URL("https://market.yandex.ru/wishlist/35ba3829-a112-41b0-b8a2-63ccc1cb7753");

test("Yandex Market reads only products within the list and reports further pages", async () => {
  const snippet = `<img src="https://avatars.mds.yandex.net/get-mpic/123/orig"/>
    <a href="/card/headphones/1234?offerid=one&amp;clid=two"><span data-auto="snippet-title" title="Наушники &amp; чехол">Наушники</span></a>
    <span data-auto="snippet-price-current"><span>2 499</span><span>₽</span></span>`;
  const html = `<div data-auto="wishlistLayout">${snippet}
    <!--BEGIN [@marketfront/SnippetConstructor] /widget/0-wishlist-item static-->${snippet}<!--END [@marketfront/SnippetConstructor] /widget/0-wishlist-item static-->
    <noframes>{"hasNextPage":true}</noframes></div>`;
  const result = await readYandexMarketWishlist("https://market.yandex.ru/cc/example", {
    fetchHtml: async (_url, { allowRedirect }) => {
      assert.ok(allowRedirect(marketUrl));
      assert.equal(allowRedirect(new URL("https://market.yandex.ru.other.example/wishlist/1")), false);
      return { html, url: marketUrl };
    },
  });
  assert.deepEqual(result, { partial: true, items: [{
    key: "wishlist-import:yandex-market:1234", title: "Наушники & чехол", url: "https://market.yandex.ru/card/headphones/1234",
    image_url: "https://avatars.mds.yandex.net/get-mpic/123/orig", price: 2499, currency: "RUB",
  }] });
});

test("Yandex Market rejects a share URL for an individual product and detects blocked list HTML", async () => {
  const shareUrl = "https://market.yandex.ru/cc/example";
  await assert.rejects(readYandexMarketWishlist(shareUrl, {
    fetchHtml: async () => ({ html: "", url: new URL("/card/headphones/1234", marketUrl) }),
  }), { status: 422 });
  await assert.rejects(readYandexMarketWishlist(shareUrl, {
    fetchHtml: async () => ({ html: "<title>Captcha</title>", url: marketUrl }),
  }), { status: 502 });
});

const wbShare = "https://www.wildberries.ru/wlg/example";
const wbProduct = { title: "Наушники", product: { id: 12345, price: 199900 }, collectedAmount: 500 };
const wbResponse = (overrides = {}) => ({ json: {
  error_code: "ERR_NONE",
  result: { status: "OPEN", sharingLink: wbShare, userPhone: "Private", collections: [wbProduct], ...overrides },
} });

test("WB reads the anonymous share endpoint and imports only deduplicated product fields", async () => {
  const result = await readWildberriesWishlist(`${wbShare}?utm_source=share`, {
    fetchJson: async (target, options) => {
      assert.equal(target, "https://wishlist.common.geo.paywb.com/wishlist/api/v2/wishlists/example");
      assert.equal(options.maxRedirects, 0);
      return wbResponse({ collections: [wbProduct, wbProduct, { title: "Сбор" }] });
    },
  });
  assert.deepEqual(result, { partial: false, items: [{
    key: "wishlist-import:wb:12345", title: "Наушники", url: "https://www.wildberries.ru/catalog/12345/detail.aspx",
    image_url: "", price: null, currency: "RUB",
  }] });
  assert.deepEqual(await readWildberriesWishlist(wbShare, {
    fetchJson: async () => wbResponse({ collections: [] }),
  }), { items: [], partial: false });
});

test("WB refuses unrelated, closed, truncated and malformed lists", async () => {
  for (const url of ["https://wildberries.ru.example/wlg/example", "https://wildberries.ru/wlg/example/else", "https://wildberries.ru/lk/favorites"]) {
    await assert.rejects(readWildberriesWishlist(url, { fetchJson: () => assert.fail("Invalid network target") }), { status: 422 });
  }
  for (const page of [
    wbResponse({ sharingLink: "https://www.wildberries.ru/wlg/different" }),
    wbResponse({ status: "CLOSED" }),
    wbResponse({ collections: [wbProduct, { product: { id: 12346 } }] }),
    { ...wbResponse(), truncated: true },
  ]) {
    await assert.rejects(readWildberriesWishlist(wbShare, { fetchJson: async () => page }), { status: 502 });
  }
});

const ozonShort = "https://ozon.ru/t/example";
const ozonShare = new URL("https://www.ozon.ru/my/favorites/shared?list=example");

test("Ozon imports products from the actual list widget, grouping image and title links by article", async () => {
  const html = `<div data-widget="wishlist">
      <a href="/product/headphones-1234/?tracking=1"><img src="https://ir.ozone.ru/example.jpg"></a>
      <a href="/product/1234/"><span>Наушники &amp; чехол</span></a>
      <a href="https://outside.example/product/124/"><span>Лишний товар</span></a>
      <a rel="next" href="?page=2">Ещё</a>
    </div><div data-widget="recommendations"><a href="/product/124/">Лишний товар</a></div>`;
  const result = await readOzonWishlist(ozonShort, {
    fetchHtml: async (input, { allowRedirect }) => {
      assert.equal(input, ozonShort);
      assert.equal(allowRedirect(ozonShare), true);
      return { html, url: ozonShare };
    },
  });
  assert.deepEqual(result, { partial: true, items: [{
    key: "wishlist-import:ozon:1234", title: "Наушники & чехол", url: "https://www.ozon.ru/product/headphones-1234/",
    image_url: "https://ir.ozone.ru/example.jpg", price: null, currency: "RUB",
  }] });
});

test("Ozon rejects home, other list identities and pages without a readable list", async () => {
  for (const target of [
    new URL("https://ozon.ru/"),
    new URL("https://www.ozon.ru/my/favorites/shared?list=different"),
  ]) {
    await assert.rejects(readOzonWishlist(ozonShare.href, {
      fetchHtml: async (_url, { allowRedirect }) => {
        assert.equal(allowRedirect(target), false);
        throw new Error("Redirect stopped");
      },
    }), { status: 422 });
  }
  await assert.rejects(readOzonWishlist(ozonShort, {
    fetchHtml: async () => ({ html: '<div data-widget="recommendations"><a href="/product/1234/">Товар</a></div>', url: ozonShare }),
  }), { status: 502 });
  await assert.rejects(readOzonWishlist(ozonShort, {
    fetchHtml: async () => ({ html: "", url: new URL("https://ozon.ru/") }),
  }), { status: 422 });
  await assert.rejects(readOzonWishlist("https://other.example/t/wrong", { fetchHtml: () => assert.fail("Invalid network target") }), { status: 422 });
});
