import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { runInNewContext } from "node:vm";

const source = (name) => readFile(new URL(`../browser-extension/${name}.js`, import.meta.url), "utf8");

test("Ozon reads the favorites, collections and wishlist indexes once and follows their items", async () => {
  const pages = [];
  const tabs = new Map();
  const firstPages = [
    "https://www.ozon.ru/selections/list",
    "https://www.ozon.ru/my/favorites",
    "https://www.ozon.ru/my/favorites/lists",
  ];
  const ownList = "https://www.ozon.ru/my/favorites/lists/example";
  const chrome = { tabs: {
    create: async ({ url }) => {
      const id = pages.push(url);
      tabs.set(id, url);
      return { id };
    },
    sendMessage: async (id) => ({
      ok: true,
      items: [],
      links: tabs.get(id) === firstPages[2] ? [...firstPages.slice(0, 1), firstPages[2], ownList] : [],
    }),
    remove: async (id) => tabs.delete(id),
  } };

  const collect = runInNewContext(`${await source("wishlist-worker")}\ncollectMarketplaceWishlist`, { chrome, URL });
  const result = await collect("ozon", new AbortController().signal);
  assert.deepEqual(pages, [...firstPages, ownList]);
  assert.equal(result.listCount, 1);
  assert.equal(tabs.size, 0);
});

test("the Ozon wishlist index asks for sign-in when the guest button sits outside its empty-state widget", async () => {
  let read;
  const document = {
    body: { innerText: "Вишлистов пока нет\nВойти в аккаунт" },
    title: "Ozon",
    querySelectorAll(selector) {
      if (selector === '[data-widget="statusWidget"]') return [{ innerText: "Вишлистов пока нет" }];
      if (selector === '[data-widget="buttonWidget"] button') return [{ innerText: "Войти в аккаунт" }];
      throw new Error(`Unexpected selector ${selector}`);
    },
  };
  runInNewContext(await source("wishlist-content"), {
    document,
    location: { pathname: "/my/favorites/lists" },
    chrome: { runtime: { onMessage: { addListener: (listener) => { read = listener; } } } },
  });

  const result = await new Promise((resolve) => {
    read({ type: "ROLLAPP_COLLECT_WISHLIST", provider: "ozon", kind: "lists", timeoutMs: 1000 }, null, resolve);
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, "marketplace_access_required");
});
