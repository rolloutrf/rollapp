import assert from "node:assert/strict";
import { test } from "node:test";
import { planningContacts, withPlanningContacts, contactMeetingNotes } from "./planning-contacts.js";
import { planningTaskSchema, planningPatchSchema } from "./planning.js";

test("task participants are unique, bounded and patchable without erasing them on unrelated edits", () => {
  assert.deepEqual(planningTaskSchema.parse({ title: "Встреча", contactIds: ["a", "a", "b"] }).contactIds, ["a", "b"]);
  assert.deepEqual(planningTaskSchema.parse({ title: "Встреча" }).contactIds, []);
  assert.deepEqual(planningPatchSchema.parse({ description: "Заметки" }), { description: "Заметки" });
  assert.deepEqual(planningPatchSchema.parse({ contactIds: [] }), { contactIds: [] });
  for (const contactIds of [[""], ["x".repeat(101)], Array(51).fill("a"), "a"]) assert.equal(planningTaskSchema.safeParse({ title: "Встреча", contactIds }).success, false);
});

test("participant resolution uses only owner overrides, rejects missing/deleted contacts and exposes summaries", async () => {
  const query = async (sql, params) => {
    if (sql.includes("default_follow_targets")) { assert.deepEqual(params, ["owner"]); return { rows: [{ user_id: "owner" }] }; }
    assert.match(sql, /WHERE user_id=\$1 AND contact_id=ANY\(\$2::text\[\]\)/);
    assert.deepEqual(params, ["owner", ["custom", "deleted", "missing"]]);
    return { rows: [{ contact_id: "custom", name: "Анна", company: "Компания", notes: "Личная заметка" }, { contact_id: "deleted", name: "Удалён", deleted_at: "2026-10-19" }] };
  };
  assert.deepEqual(await planningContacts(query, "owner", ["custom", "deleted", "missing", "custom"]), [{ id: "custom", name: "Анна", company: "Компания" }]);
  await assert.rejects(planningContacts(query, "owner", ["custom", "deleted", "missing"], { validate: true }), { planningStatus: 400 });
  assert.deepEqual(await withPlanningContacts(() => { throw Error("No query expected"); }, "owner", [{ id: "task" }]), [{ id: "task", contactIds: [], contacts: [] }]);
});

test("meeting notes read the owner's current descriptions, including archived history, without copying into personal notes", async () => {
  const note = { id: "meeting", title: "Встреча", description: "Договорились", dueOn: "2026-10-19", startTime: "10:00" };
  const result = await contactMeetingNotes(async (sql, params) => {
    assert.match(sql, /user_id=\$1 AND contact_ids \? \$2/);
    assert.match(sql, /btrim\(description\)<>''/);
    assert.doesNotMatch(sql, /UPDATE|INSERT|DELETE|archived=false/i);
    assert.deepEqual(params, ["owner", "contact"]);
    return { rows: [note] };
  }, "owner", "contact");
  assert.deepEqual(result, [note]);
});


test("planning cannot disclose imported contact names or link contacts after private-sphere access is revoked", async () => {
  const query = async (sql, params) => {
    assert.equal(sql, "SELECT user_id FROM default_follow_targets WHERE user_id=$1");
    assert.deepEqual(params, ["restricted"]);
    return { rows: [] };
  };
  assert.deepEqual(await planningContacts(query, "restricted", ["imported"]), []);
  await assert.rejects(planningContacts(query, "restricted", ["imported"], { validate: true }), { planningStatus: 403 });
  assert.deepEqual((await withPlanningContacts(query, "restricted", [{ id: "task", contactIds: ["imported"] }]))[0].contacts, []);
});
