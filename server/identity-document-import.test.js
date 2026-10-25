import assert from "node:assert/strict";
import test from "node:test";
import { importIdentityDocument } from "./identity-document-import.js";

function statements({ saved, owners = [{ id: "owner" }], concurrent = false } = {}) {
  const calls = [];
  return { calls, async query(sql, params) {
    calls.push({ sql, params });
    if (sql.startsWith("SELECT id")) return { rows: owners };
    if (sql.startsWith("SELECT content")) return { rows: saved === undefined ? [] : [{ content_json: JSON.stringify(saved) }] };
    if (sql.startsWith("INSERT")) return { rows: concurrent ? [] : [{ content_json: params[2] }] };
    return { rows: [] };
  } };
}
const document = { username: "author", section: "personal-development-plan", content: "\n## Plan\n\n  authored text  \n" };

test("document inspection is read-only and does not import missing text", async () => {
  const client = statements();
  assert.equal((await importIdentityDocument(client, document)).result, "missing");
  assert.equal(client.calls[0].sql, "SET TRANSACTION READ ONLY");
  assert(client.calls.every(call => !/INSERT|UPDATE|DELETE|ALTER|CREATE/.test(call.sql)));
});
test("explicit document import preserves every character and scopes the insert to its owner", async () => {
  const client = statements();
  assert.equal((await importIdentityDocument(client, { ...document, apply: true })).result, "inserted");
  const insert = client.calls.find(call => call.sql.startsWith("INSERT"));
  assert.deepEqual(insert.params, ["owner", document.section, JSON.stringify(document.content)]);
  assert.match(insert.sql, /ON CONFLICT .* DO NOTHING/);
});
test("existing and concurrently authored documents are never overwritten", async () => {
  for (const [config, result] of [[{ saved: "newer work" }, "preserved"], [{ concurrent: true }, "preserved-concurrent"]]) {
    const client = statements(config);
    assert.equal((await importIdentityDocument(client, { ...document, apply: true })).result, result);
    assert(client.calls.every(call => !/UPDATE|DELETE|ALTER|CREATE/.test(call.sql)));
  }
});
test("invalid sections, content and ambiguous owners fail without writes", async () => {
  for (const changes of [{ section: "unknown" }, { content: "x".repeat(200_001) }]) {
    const client = statements();
    await assert.rejects(importIdentityDocument(client, { ...document, ...changes, apply: true }));
    assert.equal(client.calls.length, 0);
  }
  for (const owners of [[], [{ id: "a" }, { id: "b" }]]) {
    const client = statements({ owners });
    await assert.rejects(importIdentityDocument(client, { ...document, apply: true }));
    assert(!client.calls.some(call => call.sql.startsWith("INSERT")));
  }
});
