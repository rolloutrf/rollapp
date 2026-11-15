import assert from "node:assert/strict";
import test from "node:test";
import { refreshMarketplaceOffers } from "./marketplace-offer-stream.js";

test("aborts a marketplace stream that never finishes", async () => {
  let fireDeadline;
  let requestSignal;
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('event: status\ndata: {"stage":"searching"}\n\n'));
    },
  });
  const result = refreshMarketplaceOffers("wish-1", {
    fetchImpl: async (_url, options) => {
      requestSignal = options.signal;
      return new Response(stream, { status: 200, headers: { "Content-Type": "text/event-stream" } });
    },
    timeoutMs: 10,
    setTimeoutImpl(callback) {
      fireDeadline = callback;
      return 1;
    },
    clearTimeoutImpl() {},
  });

  await Promise.resolve();
  fireDeadline();

  await assert.rejects(result, (error) => (
    error.code === "marketplace_offers_timeout"
    && /слишком много времени/.test(error.message)
  ));
  assert.equal(requestSignal.aborted, true);
});

test("parses a completed marketplace stream", async () => {
  const messages = [];
  const body = [
    'event: status\ndata: {"stage":"searching"}\n\n',
    'event: done\ndata: {"snapshot":{"offers":[]}}\n\n',
  ].join("");

  await refreshMarketplaceOffers("wish/2", {
    fetchImpl: async (url) => {
      assert.equal(url, "/api/wishes/wish%2F2/marketplace-offers/refresh");
      return new Response(body, { status: 200, headers: { "Content-Type": "text/event-stream" } });
    },
    onMessage: (message) => messages.push(message),
    setTimeoutImpl: globalThis.setTimeout,
    clearTimeoutImpl: globalThis.clearTimeout,
  });

  assert.deepEqual(messages.map(({ event }) => event), ["status", "done"]);
});
