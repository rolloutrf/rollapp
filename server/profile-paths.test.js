import assert from "node:assert/strict";
import test from "node:test";
import {
  isReservedProfileUsername,
  legacyProfileTarget,
  profileUsernameCandidates,
  publicListPath,
  publicProfilePath,
  publicWishPath,
} from "./profile-paths.js";

test("public profile paths use a clean top-level username", () => {
  assert.equal(publicProfilePath("example-owner"), "/example-owner");
  assert.equal(publicListPath("example-owner", "list id"), "/example-owner/lists/list%20id");
  assert.equal(publicWishPath("колосков", "wish/id"), "/%D0%BA%D0%BE%D0%BB%D0%BE%D1%81%D0%BA%D0%BE%D0%B2/wishes/wish%2Fid");
});

test("legacy profile targets preserve queries and remove the namespace", () => {
  assert.equal(legacyProfileTarget({ username: "alisa" }, "/u/alisa?view=fulfilled"), "/alisa?view=fulfilled");
  assert.equal(legacyProfileTarget({ username: "alisa", listId: "list-1" }, "/users/alisa/lists/list-1"), "/alisa/lists/list-1");
  assert.equal(legacyProfileTarget({ username: "alisa", wishId: "wish-1" }, "/u/alisa/wishes/wish-1?from=share"), "/alisa/wishes/wish-1?from=share");
});

test("system routes are reserved", () => {
  for (const username of ["api", "app", "login", "register", "forgot-password", "reset-password", "ideas", "s", "u", "users", "assets", "art", "avatars"]) {
    assert.equal(isReservedProfileUsername(username), true, `${username} must stay reserved`);
  }
  assert.equal(isReservedProfileUsername("example-owner"), false);
  assert.deepEqual(profileUsernameCandidates("app", 3), ["app-2", "app-3"]);
  assert.deepEqual(profileUsernameCandidates("example-owner", 3), ["example-owner", "example-owner-2", "example-owner-3"]);
});
