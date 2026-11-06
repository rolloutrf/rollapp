import assert from "node:assert/strict";
import test from "node:test";
import { readOhMyWishes, readYandexMarketWishlist } from "./external-wishlist-import.js";

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
