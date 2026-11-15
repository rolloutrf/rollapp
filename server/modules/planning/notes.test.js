import assert from "node:assert/strict";
import test from "node:test";
import { noteInputSchema, notesSchema, registerNotesRoutes } from "./notes.js";
import { noteLayoutInput } from "./note-groups.js";

const noteId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const groupId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const layout = { revision: 0, groups: [{ id: groupId, title: "Семья", noteIds: [noteId] }], order: [groupId] };

test("notes preserve authored whitespace and canonical rich Markdown", () => {
  const content = "  code  \n\n<div data-type=\"columns\">содержимое</div>\n";
  assert.deepEqual(noteInputSchema.parse({ title: "  Мысли  ", content }), { title: "Мысли", content });
  assert.equal(noteInputSchema.parse({ title: " ", content: "" }).title, "Без названия");
  for (const value of [{ title: "x".repeat(201), content: "" }, { title: "x", content: "x".repeat(200001) }, { title: "x", content: "", user_id: "other" }]) assert.equal(noteInputSchema.safeParse(value).success, false);
  assert.match(notesSchema, /REFERENCES users\(id\) ON DELETE CASCADE/);
});

function fixture(result = { rows: [], rowCount: 0 }) {
  const routes = [], calls = [];
  const auth = () => {};
  const app = Object.fromEntries(["get", "post", "patch", "delete"].map(method => [method, (path, middleware, handler) => routes.push({ method, path, middleware, handler })]));
  registerNotesRoutes(app, { requireAuth: auth, asyncRoute: fn => fn, query: async (sql, params) => {
    calls.push({ sql, params });
    if (sql.includes("AS notes")) return { rows: [{ notes: [], revision: 0 }] };
    if (sql.startsWith("\n    WITH valid")) return { rows: [{ valid: true, revision: 1 }] };
    return result;
  } });
  return { routes, calls, auth };
}
const response = () => ({ statusCode: 200, status(code) { this.statusCode = code; return this; }, set() { return this; }, json(body) { this.body = body; return this; } });

test("every notes route requires auth and scopes reads/writes/deletion to the session owner", async () => {
  const { routes, calls, auth } = fixture();
  assert.equal(routes.length, 6);
  for (const route of routes) {
    assert.equal(route.middleware, auth);
    const res = response();
    const body = route.path.endsWith("/layout") ? layout : { title: "Note", content: "Text" };
    await route.handler({ user: { id: "owner" }, params: { id: "another-note" }, body, query: { owner: "other" } }, res);
    const { sql, params } = calls.at(-1);
    assert(params.includes("owner")); assert(!params.includes("other"));
    if (route.path.endsWith(":id")) { assert.match(sql, /WHERE id=\$1 AND user_id=\$2/); assert.equal(res.statusCode, 404); }
  }
});

test("note layouts require unique cards and groups and cannot include nested or duplicate membership", () => {
  assert(noteLayoutInput.safeParse(layout).success);
  for (const invalid of [
    { ...layout, order: [] },
    { ...layout, order: [groupId, groupId] },
    { ...layout, order: [groupId, noteId] },
    { ...layout, groups: [{ ...layout.groups[0], noteIds: [noteId, noteId] }] },
    { ...layout, groups: [{ ...layout.groups[0], noteIds: [groupId] }] },
    { ...layout, userId: "other" },
  ]) assert(!noteLayoutInput.safeParse(invalid).success);
});
test("invalid create/update requests do not reach SQL", async () => {
  const { routes, calls } = fixture();
  for (const route of routes.filter(({ method }) => ["post", "patch"].includes(method))) {
    const res = response();
    await route.handler({ user: { id: "owner" }, params: { id: "note" }, body: { content: null } }, res);
    assert.equal(res.statusCode, 400);
  }
  assert.equal(calls.length, 0);
});
test("storage errors remain visible and never become empty notes", async () => {
  const app = { get(path, auth, handler) { this.handler = handler; }, post() {}, patch() {}, delete() {} };
  registerNotesRoutes(app, { requireAuth() {}, asyncRoute: fn => fn, query: async () => { throw new Error("database unavailable"); } });
  await assert.rejects(app.handler({ user: { id: "owner" }, params: { id: "note" } }, response()), /database unavailable/);
});
