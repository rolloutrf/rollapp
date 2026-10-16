import assert from "node:assert/strict";
import test from "node:test";
import { planningSpaceSchema } from "./planning.js";

test("planning spaces accept dedicated To Do lists alongside existing tools", () => {
  for (const kind of ["todo", "calendar", "kanban"]) {
    assert.deepEqual(planningSpaceSchema.parse({ kind, title: "  Личные дела  " }), { kind, title: "Личные дела" });
  }
});
test("planning space validation rejects blank titles, oversized titles and unknown types", () => {
  for (const value of [{ kind: "todo", title: "   " }, { kind: "todo", title: "я".repeat(101) }, { kind: "other", title: "Дела" }]) {
    assert.equal(planningSpaceSchema.safeParse(value).success, false);
  }
});
