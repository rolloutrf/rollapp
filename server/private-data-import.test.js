import assert from "node:assert/strict";
import test from "node:test";
import { archivePrivateFile, materializeContacts, privateAssetId, sha256 } from "./private-data-import.js";

test("archive identities are deterministic and isolated between owners", () => {
  assert.equal(privateAssetId("a", "file"), privateAssetId("a", "file"));
  assert.notEqual(privateAssetId("a", "file"), privateAssetId("b", "file"));
  assert.notEqual(privateAssetId("a", "file"), privateAssetId("a", "changed"));
  assert.match(privateAssetId("a", "file"), /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-8[a-f0-9]{3}-[a-f0-9]{12}$/);
});

test("archive verifies stored bytes before considering a copy complete", async () => {
  const file = { path: "synthetic.txt", filename: "synthetic.txt", mimeType: "text/plain", body: Buffer.from("Synthetic bytes\n\0") };
  const calls = [];
  const client = { query: async (sql, params) => {
    calls.push({ sql, params });
    if (sql.startsWith("INSERT")) return { rowCount: 1, rows: [] };
    assert.deepEqual(params, ["owner", file.path, sha256(file.body), file.body.length]);
    assert.match(sql, /encode\(sha256\(file_data\),'hex'\)=\$3/);
    return { rowCount: 1, rows: [{ id: "verified" }] };
  } };
  assert.equal(await archivePrivateFile(client, "owner", file), "verified");
  assert.equal(calls[0].params[5], file.body);
  await assert.rejects(archivePrivateFile({ query: async () => ({ rowCount: 0, rows: [] }) }, "owner", file), /integrity/);
});

test("materialization cannot overwrite existing content or tombstones and fails closed on an incomplete import", async () => {
  const contact = { id: "synthetic", name: "Generated contact", links: [] };
  const calls = [];
  const client = { query: async (sql, params) => {
    calls.push(sql);
    assert.equal(params[0], "owner");
    return sql.startsWith("SELECT") ? { rows: [{ count: 1 }] } : { rowCount: 0 };
  } };
  assert.deepEqual(await materializeContacts(client, "owner", [contact]), { insertedContacts: 0, verifiedContacts: 1 });
  assert.match(calls[0], /ON CONFLICT \(user_id,contact_id\) DO NOTHING/);
  assert.match(calls[1], /SET source_order=c.source_order/);
  assert.doesNotMatch(calls[1], /SET.*(?:name|notes|deleted_at|updated_at)=/);
  await assert.rejects(materializeContacts(client, "owner", [contact, contact]), /Invalid contacts/);
  await assert.rejects(materializeContacts({ query: async () => ({ rowCount: 0, rows: [{ count: 0 }] }) }, "owner", [contact]), /incomplete/);
});
