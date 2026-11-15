import assert from "node:assert/strict";
import { test } from "node:test";
import { wishParticipantChanges } from "./wish-participants.js";

test("editing a wish sends only explicit additions and removals", () => {
  const previous = [{ id: "retained" }, { id: "removed" }];
  assert.deepEqual(wishParticipantChanges(previous, [
    { id: "added" },
    { id: "retained", name: "Updated profile name" },
  ]), { add: ["added"], remove: ["removed"] });
  assert.deepEqual(wishParticipantChanges(previous, [...previous].reverse()), { add: [], remove: [] });
});
