import assert from "node:assert/strict";
import "dotenv/config";
import { createProductionDatabaseEnvironment, readTunnelConfig } from "./production-db-tunnel.mjs";
import { loadLockboxValue } from "../server/lockbox.js";
import { findProfileByUsername, lockProfileUsernames, preserveProfileUsername } from "../server/profile-aliases.js";

const origin = process.env.SHARING_CHECK_URL || "http://127.0.0.1:8188";
const username = process.env.SHARING_CHECK_USERNAME || "koloskof";
Object.assign(process.env, createProductionDatabaseEnvironment(process.env, readTunnelConfig()));
if (!process.env.PGPASSWORD && process.env.YC_LOCKBOX_SECRET_ID) {
  process.env.PGPASSWORD = await loadLockboxValue(process.env.YC_LOCKBOX_SECRET_ID, process.env.YC_LOCKBOX_SECRET_KEY || "postgresql_password");
}
const { pool, isMemoryDatabase } = await import("../server/db.js");
assert.equal(isMemoryDatabase, false, "Only the configured production database is allowed");
const client = await pool.connect();
try {
  const owner = (await findProfileByUsername(client, username)).rows[0];
  assert.ok(owner, "The verification profile must exist");
  const response = await fetch(`${origin}/api/profile/${username}`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get("cache-control"), /no-store/);
  const profile = await response.json();
  assert.equal(profile.profile.email, undefined);
  assert.equal(profile.profile.phoneMasked, undefined);
  assert.equal(profile.isOwner, false);
  assert.ok(profile.lists.every((list) => list.privacy === "public" && !list.shareToken));
  assert.ok(profile.wishes.every((wish) => wish.status === "active" && wish.privacy !== "private"));
  assert.ok(Array.isArray(profile.groups));
  const wishIds = new Set(profile.wishes.map((wish) => wish.id));
  const listIds = new Set(profile.lists.map((list) => list.id));
  for (const group of profile.groups) {
    assert.ok(listIds.has(group.listId));
    assert.ok(group.wishIds.length && group.wishIds.every((id) => wishIds.has(id)));
  }
  const hidden = await client.query(`SELECT DISTINCT w.id FROM wishes w LEFT JOIN wishlist_wishes ww ON ww.wish_id=w.id LEFT JOIN wishlists l ON l.id=ww.wishlist_id WHERE w.user_id=$1 AND (w.privacy='private' OR l.privacy='private')`, [owner.id]);
  assert.ok(hidden.rows.every(({ id }) => !wishIds.has(id)));
  const tokenLists = await client.query("SELECT id,privacy,share_token FROM wishlists WHERE user_id=$1", [owner.id]);
  for (const list of tokenLists.rows) {
    const result = await fetch(`${origin}/api/shared/${encodeURIComponent(list.share_token)}`);
    if (["private", "followers"].includes(list.privacy)) { assert.equal(result.status, 404); continue; }
    assert.equal(result.status, 200);
    const data = await result.json();
    assert.equal(data.list.id, list.id);
    assert.equal(data.profile.username, owner.username);
    const visibleIds = new Set(data.wishes.map((wish) => wish.id));
    assert.ok(data.groups.every((group) => group.listId === list.id && group.wishIds.every((id) => visibleIds.has(id))));
  }
  console.log(`Guest API: ${profile.lists.length} public lists, ${profile.wishes.length} wishes, ${profile.groups.length} groups; token access and private-data exclusion passed.`);

  // No COMMIT is used. The rename and aliases remain invisible to other sessions.
  if (process.argv.includes("--verify-rename-rollback")) {
    const temporary = `sharing-check-${Date.now().toString(36)}`;
    await client.query("BEGIN");
    try {
      await lockProfileUsernames(client);
      await client.query("SET LOCAL lock_timeout='3s'");
      await client.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [owner.id]);
      await preserveProfileUsername(client, owner.id, owner.username);
      await preserveProfileUsername(client, owner.id, temporary);
      await client.query("UPDATE users SET username=$1,name=$2 WHERE id=$3", [temporary, "Проверка переименования", owner.id]);
      for (const address of [owner.username, temporary]) {
        const resolved = (await findProfileByUsername(client, address)).rows[0];
        assert.equal(resolved.id, owner.id);
        assert.equal(resolved.username, temporary);
        assert.equal(resolved.name, "Проверка переименования");
      }
      const sharedOwner = await client.query("SELECT u.username FROM wishlists l JOIN users u ON u.id=l.user_id WHERE l.user_id=$1 LIMIT 1", [owner.id]);
      assert.equal(sharedOwner.rows[0]?.username, temporary);
      await assert.rejects(preserveProfileUsername(client, "different-user", owner.username), { code: "23505" });
    } finally { await client.query("ROLLBACK"); }
    const restored = (await findProfileByUsername(client, owner.username)).rows[0];
    assert.equal(restored.name, owner.name);
    assert.equal(restored.username, owner.username);
    assert.equal((await findProfileByUsername(client, temporary)).rowCount, 0);
    console.log("Rename, old-address resolution, token owner refresh and address ownership passed; transaction rolled back and original profile verified.");
  }
} finally { client.release(); await pool.end(); }
