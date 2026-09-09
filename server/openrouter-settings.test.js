import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createOpenRouterModelCatalog,
  normalizeOpenRouterModels,
  resolveOpenRouterModel,
  validateOpenRouterKey,
  validateOpenRouterModel,
} from "./openrouter-settings.js";
import { fetchOpenRouterMarketplaceOffers } from "./openrouter-marketplace-offers.js";

const compatible = {
  id: "provider/model",
  name: "Provider: Model",
  architecture: { input_modalities: ["text", "image"], output_modalities: ["text"] },
  supported_parameters: ["tools", "structured_outputs", "max_tokens"],
  context_length: 100_000,
};
const ok = (data) => ({ ok: true, status: 200, json: async () => ({ data }) });

test("catalogue includes compatible synchronous models, deduplicates and sorts names", () => {
  const result = normalizeOpenRouterModels({ data: [
    compatible,
    compatible,
    { ...compatible, id: "a/first", name: "A: First" },
    { ...compatible, id: "image/only", architecture: { input_modalities: ["text"], output_modalities: ["image"] } },
    { ...compatible, id: "no/tools", supported_parameters: ["structured_outputs", "max_tokens"] },
    { ...compatible, id: "no/schema", supported_parameters: ["tools", "max_tokens"] },
    { ...compatible, id: "no/limit", supported_parameters: ["tools", "structured_outputs"] },
    { ...compatible, id: "provider/model:batch" },
    { ...compatible, id: "" },
    null,
  ] });
  assert.deepEqual(result, [
    { id: "a/first", name: "A: First", contextLength: 100_000 },
    { id: compatible.id, name: compatible.name, contextLength: 100_000 },
  ]);
});

test("catalogue coalesces concurrent loads, caches five minutes, and refreshes", async () => {
  let calls = 0;
  let now = 0;
  const list = createOpenRouterModelCatalog({
    now: () => now,
    fetchImpl: async (url, options) => {
      calls++;
      assert.equal(url, "https://openrouter.ai/api/v1/models");
      assert.equal(options.headers.Authorization, undefined);
      assert.equal(options.redirect, "error");
      return ok([compatible]);
    },
  });
  const [first, second] = await Promise.all([list(), list()]);
  assert.equal(calls, 1);
  assert.deepEqual(first, second);
  now = 299_999;
  await list();
  assert.equal(calls, 1);
  now = 300_001;
  await list();
  assert.equal(calls, 2);
});

test("a failed catalogue load can be retried, even after a synchronous transport error", async () => {
  let calls = 0;
  const list = createOpenRouterModelCatalog({ fetchImpl: () => {
    if (++calls === 1) throw new Error("private transport details");
    return ok([compatible]);
  } });
  await assert.rejects(list(), (error) => error.status === 503 && !error.message.includes("private"));
  assert.equal((await list())[0].id, compatible.id);
  assert.equal(calls, 2);
});

test("invalid catalogue payloads fail clearly instead of offering arbitrary model IDs", async () => {
  for (const payload of [{}, { data: [] }, { data: [null] }]) {
    const list = createOpenRouterModelCatalog({ fetchImpl: async () => ({ ok: true, json: async () => payload }) });
    await assert.rejects(list(), (error) => error.code === "openrouter_unavailable");
  }
  const options = { listModels: async () => [{ id: compatible.id }] };
  assert.equal(await validateOpenRouterModel(compatible.id, options), compatible.id);
  await assert.rejects(validateOpenRouterModel("unavailable/model", options), (error) => error.status === 400 && error.code === "openrouter_model_invalid");
});

test("key validation makes only a read-only request to the fixed OpenRouter endpoint", async () => {
  let calls = 0;
  await validateOpenRouterKey("test-key-not-a-real-secret", { fetchImpl: async (url, options) => {
    calls++;
    assert.equal(url, "https://openrouter.ai/api/v1/key");
    assert.equal(options.method, undefined);
    assert.equal(options.body, undefined);
    assert.equal(options.redirect, "error");
    assert.equal(options.headers.Authorization, "Bearer test-key-not-a-real-secret");
    return ok({ is_management_key: false });
  } });
  assert.equal(calls, 1);
});

test("key validation rejects invalid/management keys without exposing upstream errors", async () => {
  for (const response of [
    { ok: false, status: 401 },
    { ok: false, status: 403 },
    ok({ is_management_key: true }),
    ok({ is_provisioning_key: true }),
    { ok: true, json: async () => { throw new Error("malformed body"); } },
  ]) {
    await assert.rejects(validateOpenRouterKey("private-key", { fetchImpl: async () => response }), (error) => error.status === 400 && error.code === "openrouter_key_invalid" && !error.message.includes("private-key"));
  }
  for (const fetchImpl of [
    async () => ({ ok: false, status: 429 }),
    async () => { throw new Error("private-key"); },
  ]) {
    await assert.rejects(validateOpenRouterKey("private-key", { fetchImpl }), (error) => error.status === 503 && !error.message.includes("private-key"));
  }
});

test("personal model preferences never change the shared server model", () => {
  const credential = { model: "personal/chosen" };
  assert.equal(resolveOpenRouterModel(credential, { source: "user", defaultModel: "server/default" }), "personal/chosen");
  for (const source of ["server", "none"]) {
    assert.equal(resolveOpenRouterModel(credential, { source, defaultModel: "server/default" }), "server/default");
  }
  assert.equal(resolveOpenRouterModel({ model: "" }, { source: "user", defaultModel: "server/default" }), "server/default");
});

test("marketplace transport uses the chosen model and key, including models without temperature", async () => {
  let calls = 0;
  const model = resolveOpenRouterModel({ model: compatible.id }, { source: "user", defaultModel: "server/default" });
  await fetchOpenRouterMarketplaceOffers({ title: "Test product" }, {
    model,
    apiKey: "test-personal-key",
    fetchImpl: async (_url, options) => {
      calls++;
      assert.equal(options.headers.Authorization, "Bearer test-personal-key");
      const body = JSON.parse(options.body);
      assert.equal(body.model, compatible.id);
      assert.equal(body.temperature, undefined);
      assert.equal(body.max_tokens, 2000);
      assert.equal(body.response_format.type, "json_schema");
      return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ offers: [{
        marketplace: "Ozon", title: "Test product", price: 1000, currency: "RUB",
        url: "https://www.ozon.ru/product/test-product-123/", available: true, score: 95,
      }], summary: "Test result" }) } }] }) };
    },
  });
  assert.equal(calls, 1);
});
