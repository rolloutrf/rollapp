import assert from "node:assert/strict";
import { productionProfileKey } from "./production-profile-key.mjs";
import { publicProfilePath } from "../shared/modules/profile/profile-links.js";

const origin = process.argv[2];
const username = await productionProfileKey(origin);
const request = (url, redirect = "manual") => fetch(new URL(url, origin), { redirect, signal: AbortSignal.timeout(10_000) });
const response = await request(`/api/profile/${encodeURIComponent(username)}`);
assert.equal(response.status, 200, "Existing profile API");
const { profile } = await response.json();
assert.match(profile.profileSlug, /^[а-яё0-9]+(?:-[а-яё0-9]+)*$/u);
const address = publicProfilePath(profile);
assert.equal((await request(address)).status, 200, "Canonical Russian page");
for (const [path, status] of [[publicProfilePath(username), 302], [`/u/${username}`, 301], [`/users/${username}`, 301]]) {
  const old = await request(`${path}?проверка=1`);
  assert.equal(old.status, status, "Legacy profile redirects");
  const target = new URL(old.headers.get("location"), origin);
  assert.equal(target.origin, origin);
  assert.equal(target.pathname, address);
  assert.equal(target.searchParams.get("проверка"), "1");
}
console.log("Production profile uses its Russian address and all three legacy routes resolve to it");
