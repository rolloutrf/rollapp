import { toNodeHandler } from "@modelcontextprotocol/node";
import { createMcpHandler } from "@modelcontextprotocol/server";
import { z } from "zod";
import { createRollappApi, mcpHopHeader, mcpTokenPattern } from "./mcp-api.js";
import { createRollappMcp } from "./mcp-tools.js";
import { createRateLimit } from "./rate-limit.js";
import { createSessionToken, hashToken } from "./security.js";

const readRoutes = new Set(["/api/me", "/api/dashboard", "/api/planning/spaces", "/api/planning/tasks"]);
const createRoutes = new Set(["/api/planning/tasks", "/api/wishes"]);
const tokenRequest = z.strictObject({ scope: z.enum(["read", "write"]).default("read") });
const tokenLifetimeMs = 30 * 24 * 60 * 60 * 1000;

function readBearer(req) {
  const token = /^Bearer (\S+)$/i.exec(req.get("Authorization") || "")?.[1];
  const scope = mcpTokenPattern.exec(token ?? "")?.[1];
  // Browser session lookup accepts only plain SHA-256 hashes. The prefix makes
  // MCP grants a separate namespace in the existing sessions table.
  return scope ? { token, scope, hash: `mcp:${hashToken(token)}` } : null;
}

function allowedApiRoute(req, scope) {
  const path = req.originalUrl.split("?", 1)[0];
  if (req.method === "GET") return readRoutes.has(path);
  if (scope !== "write") return false;
  if (req.method === "PATCH") return /^\/api\/planning\/tasks\/[a-z0-9_-]{1,100}$/i.test(path);
  return req.method === "POST" && (createRoutes.has(path) || /^\/api\/wishes\/[a-z0-9_-]{1,100}\/fulfilled$/i.test(path));
}

function unauthorized(res) {
  return res.set({ "WWW-Authenticate": 'Bearer realm="Rollapp MCP"', "Cache-Control": "no-store" })
    .status(401).json({ error: "Требуется действующий токен Rollapp MCP" });
}

export function createRollappMcpHttp({ query, trustedOrigins, publicHost = "xn--80avakiab.xn--p1ai" }) {
  // The private hop is unique to this process. Only the MCP handler can make
  // scoped REST requests, even when the public reverse proxy uses loopback.
  const hop = createSessionToken();
  const serve = toNodeHandler(createMcpHandler(({ authInfo }) => {
    const { token, scopes, apiPort } = authInfo;
    const api = createRollappApi(`http://127.0.0.1:${apiPort}`, { bearer: token, hop });
    return createRollappMcp(api, { allowWrite: scopes.includes("write") });
  }));
  const rateLimit = createRateLimit({ windowMs: 60_000, max: 120 });
  const issueLimit = createRateLimit({ windowMs: 15 * 60_000, max: 10, key: (req) => req.user.id });

  function internalSessionHash(req) {
    if (req.get(mcpHopHeader) !== hop || !["127.0.0.1", "::ffff:127.0.0.1"].includes(req.socket.remoteAddress)) return null;
    const grant = readBearer(req);
    return grant && allowedApiRoute(req, grant.scope) ? grant.hash : null;
  }

  function registerRoutes(app, { asyncRoute, requireAuth }) {
    app.all("/mcp", rateLimit, asyncRoute(async (req, res) => {
      res.set("Cache-Control", "no-store");
      const origin = req.get("Origin");
      if (origin && origin !== `https://${publicHost}` && !trustedOrigins.has(origin)) {
        return res.status(403).json({ error: "Недоверенный источник запроса" });
      }
      const grant = readBearer(req);
      if (!grant) return unauthorized(res);
      const result = await query("SELECT 1 FROM sessions WHERE token_hash=$1 AND expires_at>$2", [grant.hash, new Date()]);
      if (!result.rowCount) return unauthorized(res);
      req.auth = { token: grant.token, scopes: [grant.scope], clientId: "rollapp-mcp", apiPort: req.socket.localPort };
      return serve(req, res, req.body);
    }));

    app.post("/api/mcp/tokens", requireAuth, issueLimit, asyncRoute(async (req, res) => {
      const parsed = tokenRequest.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "Укажите права read или write" });
      const { scope } = parsed.data;
      const token = `rwmcp_${scope}_${createSessionToken()}`;
      const expiresAt = new Date(Date.now() + tokenLifetimeMs);
      await query("INSERT INTO sessions (token_hash,user_id,expires_at) VALUES ($1,$2,$3)", [`mcp:${hashToken(token)}`, req.user.id, expiresAt]);
      return res.set("Cache-Control", "no-store").status(201).json({ token, scope, expiresAt });
    }));

    app.delete("/api/mcp/tokens/current", rateLimit, asyncRoute(async (req, res) => {
      const grant = readBearer(req);
      if (!grant) return unauthorized(res);
      await query("DELETE FROM sessions WHERE token_hash=$1", [grant.hash]);
      return res.set("Cache-Control", "no-store").json({ ok: true });
    }));
  }

  return { internalSessionHash, registerRoutes };
}
