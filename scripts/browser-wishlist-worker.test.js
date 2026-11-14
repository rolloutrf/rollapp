import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { runInNewContext } from "node:vm";

const worker = await readFile(new URL("../browser-extension/wishlist-worker.js", import.meta.url), "utf8");

function setup(destination) {
  const opened = [];
  const closed = [];
  const reads = [];
  const chrome = { tabs: {
    async create({ url, active }) { opened.push({ url, active }); return { id: 1 }; },
    async get() { return { url: destination || opened.at(-1).url, status: "complete" }; },
    async sendMessage(id, message) {
      reads.push({ id, ...message });
      return { ok: true, items: [{ title: "Товар" }], links: ["https://www.ozon.ru/selections/unrelated"] };
    },
    async remove(id) { closed.push(id); },
  } };
  const collect = runInNewContext(`${worker}\ncollectMarketplaceWishlist`, { chrome, URL });
  return { collect: (provider, url) => collect(provider, new AbortController().signal, url), opened, closed, reads };
}

test("saved marketplace links open only the requested list, including Ozon short links", async () => {
  for (const [provider, url, destination] of [
    ["ozon", "https://ozon.ru/t/example", "https://www.ozon.ru/selections/view/shared?short=example"],
    ["wb", "https://www.wildberries.ru/wishlist/example", null],
  ]) {
    const { collect, opened, reads, closed } = setup(destination);
    const result = await collect(provider, url);
    assert.equal(result.items.length, 1);
    assert.equal(result.listCount, 0);
    assert.deepEqual(opened, [{ url, active: false }]);
    assert.deepEqual(reads.map(({ kind }) => kind), ["linked-list"]);
    assert.deepEqual(closed, [1]);
  }
});

test("saved links reject unrelated destinations before reading a browser tab", async () => {
  const invalid = setup();
  for (const url of [
    "https://ozon.ru.example/t/test",
    "https://user@ozon.ru/t/test",
    "https://ozon.ru/product/test-123/",
    "https://ozon.ru/my/favorites",
    "https://www.ozon.ru/selections/list",
  ]) await assert.rejects(invalid.collect("ozon", url), /конкретный список/);
  assert.deepEqual(invalid.opened, []);
  for (const destination of ["https://www.ozon.ru/my/favorites", "https://www.wildberries.ru/wishlist/example"]) {
    const { collect, reads, closed } = setup(destination);
    await assert.rejects(collect("ozon", "https://ozon.ru/t/example"), /не открывает поддерживаемый список/);
    assert.deepEqual(reads, []);
    assert.deepEqual(closed, [1]);
  }
});
