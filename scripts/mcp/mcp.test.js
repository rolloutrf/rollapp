import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { once } from "node:events";
import { chmod, mkdir, mkdtemp, rm, rmdir, stat, symlink } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { createRollappApi, mcpConfig } from "../../server/mcp-api.js";
import { readSession, saveSession } from "./session.js";

const token = "a".repeat(43);
const commandPath = fileURLToPath(new URL("./server.mjs", import.meta.url));
const authPath = fileURLToPath(new URL("./auth.mjs", import.meta.url));
const run = promisify(execFile);

const clientEnvironment = (config) => ({ ROLLAPP_MCP_URL: config.origin, ROLLAPP_MCP_SESSION_FILE: config.sessionPath });

// An HTTP contract fixture, independent of the application server and database.
async function fixture(t, handler) {
  const directory = await mkdtemp(path.join(tmpdir(), "rollapp-mcp-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const requests = [];
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, "http://127.0.0.1");
    let input = "";
    for await (const chunk of req) input += chunk;
    const call = { method: req.method, path: url.pathname, query: Object.fromEntries(url.searchParams), cookie: req.headers.cookie };
    if (input) call.body = JSON.parse(input);
    requests.push(call);
    const { status = 200, data, headers } = handler(call);
    res.writeHead(status, { "Content-Type": "application/json", ...headers });
    res.end(JSON.stringify(data));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => { server.close(); server.closeAllConnections(); });
  const origin = `http://127.0.0.1:${server.address().port}`;
  return { origin, sessionPath: path.join(directory, "session.json"), requests };
}

async function withClient(config, options, run) {
  const client = new Client({ name: "rollapp-test", version: "1.0.0" });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [commandPath, ...options],
    env: clientEnvironment(config),
  });
  try {
    await client.connect(transport);
    return await run(client);
  } finally {
    await client.close();
  }
}

test("stdio defaults to read-only, isolates account data and paginates results", async (t) => {
  const config = await fixture(t, ({ path: endpoint }) => ({ data: {
    "/api/healthz": { ok: true, service: "rollapp", version: "test" },
    "/api/me": { user: { username: "owner", name: "Owner", email: "private", accountType: "personal" } },
    "/api/planning/spaces": { spaces: [{ id: "main", kind: "todo" }] },
    "/api/planning/tasks": { columns: [{ id: "todo" }], tasks: [
      { id: "first", title: "Позвонить", completed: false },
      { id: "archived", title: "Позвонить", archived: true, completed: false },
      { id: "second", title: "Позвонить ещё", completed: false },
    ] },
    "/api/dashboard": { lists: [{ id: "gifts", title: "Подарки", shareToken: "secret" }], wishes: [
      { id: "wish", listIds: ["gifts"], title: "Книга", status: "active" },
      { id: "other", listIds: [], title: "Книга", status: "active" },
    ], reservations: [{ private: true }] },
  }[endpoint] }));
  await saveSession(config, token);

  await withClient(config, [], async (client) => {
    const { tools } = await client.listTools();
    assert.equal(tools.length, 6);
    assert(tools.every((tool) => tool.annotations.readOnlyHint));
    const call = (name, args = {}) => client.callTool({ name, arguments: args });
    assert.equal((await call("get_service_status")).structuredContent.version, "test");
    assert.deepEqual((await call("get_account")).structuredContent, { username: "owner", name: "Owner", accountType: "personal" });
    await call("list_planning_spaces", { kind: "todo" });
    const { structuredContent: tasks } = await call("list_tasks", { spaceId: "team", search: "ПОЗВОНИТЬ", limit: 1 });
    assert.deepEqual(tasks, {
      spaceId: "team", columns: [{ id: "todo" }], items: [{ id: "first", title: "Позвонить", completed: false }], total: 2, nextOffset: 1,
    });
    const { structuredContent: lists } = await call("list_wishlists");
    assert.deepEqual(lists.items, [{ id: "gifts", title: "Подарки" }]);
    const { structuredContent: wishes } = await call("list_wishes", { listId: "gifts", status: "active" });
    assert.deepEqual(wishes.items.map(({ id }) => id), ["wish"]);
    await assert.rejects(call("create_task", { spaceId: "main", columnId: "todo", title: "Skipped" }), /not found/);
  });
  assert.deepEqual(config.requests.map(({ method, path, query }) => ({ method, path, query })), [
    { method: "GET", path: "/api/healthz", query: {} },
    { method: "GET", path: "/api/me", query: {} },
    { method: "GET", path: "/api/planning/spaces", query: { kind: "todo" } },
    { method: "GET", path: "/api/planning/tasks", query: { space: "team" } },
    { method: "GET", path: "/api/dashboard", query: {} },
    { method: "GET", path: "/api/dashboard", query: {} },
  ]);
  assert.equal(config.requests[0].cookie, undefined);
  assert(config.requests.slice(1).every((call) => call.cookie === `rw_session=${token}`));
});

test("write tools use scoped routes, strict validation and explicit state", async (t) => {
  const config = await fixture(t, ({ body }) => ({ data: { accepted: body } }));
  await saveSession(config, token);
  await withClient(config, ["--write"], async (client) => {
    const { tools } = await client.listTools();
    assert.equal(tools.length, 10);
    assert.deepEqual(tools.filter((tool) => !tool.annotations.readOnlyHint).map((tool) => tool.name).sort(),
      ["create_task", "create_wish", "set_wish_fulfilled", "update_task"]);
    const call = (name, args) => client.callTool({ name, arguments: args });
    assert.equal((await call("update_task", { spaceId: "main", taskId: "../spaces", patch: { completed: true } })).isError, true);
    assert.equal((await call("update_task", { spaceId: "main", taskId: "one", patch: {} })).isError, true);
    assert.equal((await call("create_task", { spaceId: "main", columnId: "todo", title: "X", dueOn: "2026-02-30" })).isError, true);
    const task = await call("create_task", { spaceId: "board", columnId: "next", title: "  Встреча ", dueOn: "2026-11-10", startTime: "15:30" });
    assert.equal(task.structuredContent.accepted.title, "Встреча");
    await call("update_task", { spaceId: "board", taskId: "one", patch: { occurrenceDate: "2026-11-10", completed: true } });
    await call("create_wish", { title: "Книга", listIds: ["gifts"] });
    await call("set_wish_fulfilled", { wishId: "wish", fulfilled: false });
  });
  assert.deepEqual(config.requests.map(({ method, path, query }) => ({ method, path, query })), [
    { method: "POST", path: "/api/planning/tasks", query: { space: "board" } },
    { method: "PATCH", path: "/api/planning/tasks/one", query: { space: "board" } },
    { method: "POST", path: "/api/wishes", query: {} },
    { method: "POST", path: "/api/wishes/wish/fulfilled", query: {} },
  ]);
  assert.equal(config.requests[0].body.columnId, "next");
  assert.equal(Object.hasOwn(config.requests[0].body, "spaceId"), false);
  assert.deepEqual(config.requests[1].body, { occurrenceDate: "2026-11-10", completed: true });
  assert.deepEqual(config.requests[2].body, { title: "Книга", listIds: ["gifts"], privacy: "private" });
  assert.deepEqual(config.requests[3].body, { fulfilled: false });
});

test("Rollapp sessions are private, origin-bound, and redirects are rejected", async (t) => {
  const config = await fixture(t, ({ path: endpoint }) => {
    if (endpoint === "/api/auth/login") {
      return { headers: { "Set-Cookie": `rw_session=${token}; Path=/; HttpOnly` }, data: { user: { username: "owner" } } };
    }
    if (endpoint === "/api/me") return { status: 302, headers: { Location: "/api/redirected" } };
    if (endpoint === "/api/auth/logout") return { data: { ok: true } };
    return { status: 401, data: { error: "expired" } };
  });
  assert.throws(() => mcpConfig({ ROLLAPP_MCP_URL: "http://example.com" }), /HTTPS/);
  assert.equal(await readSession(config), null);
  await withClient(config, [], async (client) => {
    const missing = await client.callTool({ name: "get_account", arguments: {} });
    assert.equal(missing.isError, true);
    assert.match(missing.content[0].text, /mcp:auth -- login/);
  });
  assert.deepEqual(config.requests, []);

  const session = await createRollappApi(config.origin).login("fixture@example.test", "test-password");
  assert.deepEqual(session, { token, username: "owner" });
  await saveSession(config, session.token);
  await assert.rejects(saveSession(config, "b".repeat(43)), { code: "EEXIST" });
  assert.equal((await stat(config.sessionPath)).mode & 0o777, 0o600);
  assert.equal(await readSession(config), token);
  await assert.rejects(readSession({ ...config, origin: "https://example.com" }), /адреса/);
  await chmod(config.sessionPath, 0o644);
  await assert.rejects(readSession(config), /0600/);
  await chmod(config.sessionPath, 0o600);
  await symlink(config.sessionPath, `${config.sessionPath}.link`);
  await assert.rejects(readSession({ ...config, sessionPath: `${config.sessionPath}.link` }), { code: "ELOOP" });

  await withClient(config, [], async (client) => {
    const redirect = await client.callTool({ name: "get_account", arguments: {} });
    assert.equal(redirect.isError, true);
    assert.match(redirect.content[0].text, /перенаправил/);
    const expired = await client.callTool({ name: "list_tasks", arguments: {} });
    assert.equal(expired.isError, true);
    assert.match(expired.content[0].text, /истекла/);
  });
  assert.deepEqual(config.requests.map((req) => req.path), ["/api/auth/login", "/api/me", "/api/planning/tasks"]);
  assert.equal(config.requests[0].cookie, undefined);

  const lock = `${config.sessionPath}.lock`;
  const logout = () => run(process.execPath, [authPath, "logout"], { env: clientEnvironment(config) });
  await mkdir(lock);
  await assert.rejects(logout(), /Дождитесь завершения другой команды/);
  assert.equal(config.requests.length, 3);
  await rmdir(lock);
  await logout();
  assert.equal(await readSession(config), null);
  assert.deepEqual(config.requests.at(-1), { method: "POST", path: "/api/auth/logout", query: {}, cookie: `rw_session=${token}` });
});
