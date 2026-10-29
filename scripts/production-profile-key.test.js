import assert from "node:assert/strict";
import test from "node:test";
import { productionProfileKey } from "./production-profile-key.mjs";

test("release profile checks discover an existing database-backed profile without a personal default", async () => {
  const fetchImpl = async url => {
    assert.equal(String(url), "https://example.test/api/people?scope=discover");
    return Response.json({ people: [{ username: "invalid/path" }, { username: "synthetic-profile" }] });
  };
  assert.equal(await productionProfileKey("https://example.test", fetchImpl), "synthetic-profile");
  await assert.rejects(productionProfileKey("https://example.test", async () => Response.json({ people: [] })), /No existing/);
  await assert.rejects(productionProfileKey("https://example.test", async () => new Response("", { status: 503 })), /Cannot read/);
});
