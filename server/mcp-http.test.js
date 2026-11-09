import assert from "node:assert/strict";
import { once } from "node:events";
import { test } from "node:test";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import express from "express";
import { mcpHopHeader } from "./mcp-api.js";
import { createRollappMcpHttp } from "./mcp-http.js";
import { hashToken } from "./security.js";

test("HTTP MCP verifies scoped grants, preserves REST auth and rejects revoked tokens", async (t) => {
  const sessions = new Map();
  const taskWrites = [];
  const account = { id: "owner-id", username: "owner", name: "Owner", accountType: "personal" };
  const fixtureSession = "rw_session=browser-fixture";
  const mcp = createRollappMcpHttp({ trustedOrigins: new Set(), query: async (sql, [hash, value, expiresAt]) => {
    if (sql.startsWith("INSERT")) sessions.set(hash, { userId: value, expiresAt });
    if (sql.startsWith("DELETE")) sessions.delete(hash);
    if (sql.startsWith("SELECT")) return { rowCount: Number(sessions.get(hash)?.expiresAt > value) };
    return { rowCount: 1 };
  } });

  const app = express();
  app.use(express.json({ limit: "256kb" }));
  app.use("/api", (req, _res, next) => {
    const session = sessions.get(mcp.internalSessionHash(req));
    if (req.get("Cookie") === fixtureSession || (session?.userId === account.id && session.expiresAt > new Date())) req.user = account;
    next();
  });
  const requireAuth = (req, res, next) => req.user ? next() : res.status(401).json({ error: "Unauthorized" });
  mcp.registerRoutes(app, { requireAuth, asyncRoute: (handler) => handler });
  app.get("/api/me", requireAuth, (req, res) => res.json({ user: req.user }));
  app.post("/api/planning/tasks", requireAuth, (req, res) => {
    taskWrites.push({ userId: req.user.id, space: req.query.space, title: req.body.title });
    res.status(201).json({ task: { id: "new-task" } });
  });
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => { server.close(); server.closeAllConnections(); });
  const origin = `http://127.0.0.1:${server.address().port}`;

  const http = (path, options) => fetch(`${origin}${path}`, options);
  const issueToken = async (scope, cookie = fixtureSession) => http("/api/mcp/tokens", {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie }, body: JSON.stringify({ scope }),
  });
  const bearer = (token) => ({ Authorization: `Bearer ${token}` });
  const withClient = async (token, run) => {
    const client = new Client({ name: "rollapp-http-test", version: "1.0.0" });
    try {
      await client.connect(new StreamableHTTPClientTransport(new URL(`${origin}/mcp`), { requestInit: { headers: bearer(token) } }));
      await run(client);
    } finally {
      await client.close();
    }
  };

  assert.equal((await issueToken("write", "")).status, 401);
  assert.equal((await issueToken("admin")).status, 400);
  assert.equal((await http("/mcp", { headers: { Cookie: fixtureSession } })).status, 401);
  const issued = await issueToken(undefined);
  assert.equal(issued.status, 201);
  assert.equal(issued.headers.get("cache-control"), "no-store");
  const { token: readToken, scope, expiresAt } = await issued.json();
  assert.equal(scope, "read");
  assert(new Date(expiresAt) > new Date());
  assert.deepEqual([...sessions.keys()], [`mcp:${hashToken(readToken)}`]);
  assert.equal((await http("/mcp", { headers: { ...bearer(readToken), Origin: "https://attacker.test" } })).status, 403);
  assert.equal((await http("/mcp", { headers: bearer(readToken.replace("_read_", "_write_")) })).status, 401);
  assert.equal((await http("/api/me", { headers: { ...bearer(readToken), [mcpHopHeader]: "forged" } })).status, 401);

  const legacy = await http("/mcp", {
    method: "POST",
    headers: { ...bearer(readToken), Accept: "application/json, text/event-stream", "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {
      protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "legacy", version: "1.0.0" },
    } }),
  });
  assert.equal(legacy.status, 200);
  assert.match(await legacy.text(), /"protocolVersion":"2025-11-25"/);

  await withClient(readToken, async (client) => {
    const { tools } = await client.listTools();
    assert.equal(tools.length, 6);
    assert(tools.every((tool) => tool.annotations.readOnlyHint));
    const result = await client.callTool({ name: "get_account", arguments: {} });
    assert.deepEqual(result.structuredContent, { username: "owner", name: "Owner", accountType: "personal" });
  });
  const { token: writeToken } = await (await issueToken("write")).json();
  await withClient(writeToken, async (client) => {
    const { tools } = await client.listTools();
    assert.equal(tools.length, 10);
    const result = await client.callTool({ name: "create_task", arguments: { spaceId: "main", columnId: "todo", title: "MCP" } });
    assert.deepEqual(result.structuredContent, { task: { id: "new-task" } });
  });
  assert.deepEqual(taskWrites, [{ userId: account.id, space: "main", title: "MCP" }]);

  assert.equal((await http("/api/mcp/tokens/current", { method: "DELETE", headers: bearer(readToken) })).status, 200);
  assert.equal((await http("/mcp", { headers: bearer(readToken) })).status, 401);
  sessions.get(`mcp:${hashToken(writeToken)}`).expiresAt = new Date(0);
  assert.equal((await http("/mcp", { headers: bearer(writeToken) })).status, 401);
});
