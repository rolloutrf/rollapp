import { hashToken } from "./security.js";

export const sessionCookie = "rw_session";
export const savedSessionsCookie = "rw_saved_sessions";
export const maxSavedSessions = 4;

export function sessionTokens(value) {
  if (typeof value !== "string" || value.length > maxSavedSessions * 44) return [];
  return [...new Set(value.split(".").slice(0, maxSavedSessions).filter((token) => /^[A-Za-z0-9_-]{43}$/.test(token)))];
}

export async function readAccountSessions(query, { activeToken, savedTokens }, now = new Date()) {
  const tokens = [...new Set([activeToken, ...sessionTokens(savedTokens)].filter((token) =>
    typeof token === "string" && /^[A-Za-z0-9_-]{43}$/.test(token)))];
  if (!tokens.length) return [];
  const hashes = tokens.map(hashToken);
  const result = await query(
    `SELECT s.token_hash,s.expires_at,u.id,u.username,u.name,u.avatar_url,u.account_type
     FROM sessions s JOIN users u ON u.id=s.user_id
     WHERE s.token_hash=ANY($1::text[]) AND s.expires_at>$2`,
    [hashes, now],
  );
  const byHash = new Map(result.rows.map((row) => [row.token_hash, row]));
  const seen = new Set();
  return hashes.flatMap((hash, index) => {
    const row = byHash.get(hash);
    if (!row || seen.has(row.id)) return [];
    seen.add(row.id);
    return [{ user: row, token: tokens[index], expiresAt: new Date(row.expires_at) }];
  });
}

export function requireExpectedAccount(req, res, next) {
  const expectedAccount = req.get("X-Rollapp-Account");
  if (expectedAccount && expectedAccount !== req.user?.id) {
    return res.set("Cache-Control", "no-store").status(409).json({
      error: "Аккаунт изменился в другой вкладке",
      code: "ACTIVE_ACCOUNT_CHANGED",
    });
  }
  next();
}

export function createAccountSessions({ query, sessionCookieOptions, domainCookies = null }) {
  const activeName = domainCookies?.active || sessionCookie;
  const savedName = domainCookies?.saved || savedSessionsCookie;
  const cookieOptions = path => ({
    ...sessionCookieOptions(path),
    ...(domainCookies && { domain: domainCookies.domain }),
  });

  function clearLegacyCookies(res) {
    if (domainCookies) {
      res.clearCookie(sessionCookie, sessionCookieOptions("/"));
      res.clearCookie(savedSessionsCookie, sessionCookieOptions("/api/auth"));
    }
  }

  function clearActiveSession(res) {
    res.clearCookie(activeName, cookieOptions("/"));
    clearLegacyCookies(res);
  }
  function setSessionCookie(res, { token, expiresAt }) {
    res.cookie(activeName, token, { ...cookieOptions("/"), expires: expiresAt });
  }

  function writeSavedSessions(res, sessions) {
    const options = cookieOptions("/api/auth");
    if (!sessions.length) return res.clearCookie(savedName, options);
    return res.cookie(savedName, sessions.map(({ token }) => token).join("."), {
      ...options,
      expires: new Date(Math.max(...sessions.map(({ expiresAt }) => expiresAt.getTime()))),
    });
  }

  function browserAccountSessions(req) {
    return readAccountSessions(query, {
      activeToken: req.cookies[sessionCookie],
      savedTokens: req.cookies[savedSessionsCookie],
    });
  }

  async function setAuthenticatedSession(req, res, session, userId, { addAccount = false } = {}) {
    if (req.user?.id !== userId) {
      if (addAccount && req.user) {
        const sessions = await browserAccountSessions(req);
        writeSavedSessions(res, sessions.filter(({ user }) => user.id !== userId).slice(0, maxSavedSessions));
      } else if (req.cookies[savedSessionsCookie]) {
        writeSavedSessions(res, []);
      }
    } else if (domainCookies && !req.cookies[activeName] && req.cookies[savedSessionsCookie]) {
      const sessions = await browserAccountSessions(req);
      writeSavedSessions(res, sessions.filter(({ user }) => user.id !== userId).slice(0, maxSavedSessions));
    }
    setSessionCookie(res, session);
    clearLegacyCookies(res);
  }

  async function promoteLegacySession(req, res) {
    if (!domainCookies || req.cookies[activeName] || !req.user) return;
    const sessions = await browserAccountSessions(req);
    const active = sessions.find(entry => entry.token === req.cookies[sessionCookie]);
    if (!active) return;
    writeSavedSessions(res, sessions.filter(entry => entry !== active).slice(0, maxSavedSessions));
    setSessionCookie(res, active);
    clearLegacyCookies(res);
  }

  function registerAccountRoutes(app, { requireAuth, asyncRoute }) {
    app.use("/api/auth/accounts", (_req, res, next) => {
      res.set("Cache-Control", "private, no-store");
      next();
    }, requireAuth);

    app.get("/api/auth/accounts", asyncRoute(async (req, res) => {
      const sessions = await browserAccountSessions(req);
      res.json({
        accounts: sessions.map(({ user }) => ({
          id: user.id, username: user.username, name: user.name, avatarUrl: user.avatar_url,
          accountType: user.account_type || "personal", active: user.id === req.user.id,
        })),
        maxAccounts: maxSavedSessions + 1,
      });
    }));

    app.post("/api/auth/accounts/switch", asyncRoute(async (req, res) => {
      const accountId = req.body?.accountId;
      if (typeof accountId !== "string" || !accountId || accountId.length > 128) {
        return res.status(400).json({ error: "Выберите аккаунт" });
      }
      const sessions = await browserAccountSessions(req);
      const selected = sessions.find(({ user }) => user.id === accountId);
      if (!selected) return res.status(404).json({ error: "Сессия закончилась. Войдите в этот аккаунт ещё раз.", code: "SAVED_ACCOUNT_UNAVAILABLE" });
      if (accountId !== req.user.id) {
        writeSavedSessions(res, sessions.filter((entry) => entry !== selected));
        setSessionCookie(res, selected);
        clearLegacyCookies(res);
      }
      return res.json({ ok: true });
    }));

    app.delete("/api/auth/accounts/:accountId", asyncRoute(async (req, res) => {
      const accountId = req.params.accountId;
      if (accountId === req.user.id) return res.status(400).json({ error: "Нельзя убрать активный аккаунт" });
      const sessions = await browserAccountSessions(req);
      const selected = sessions.find(({ user }) => user.id === accountId);
      if (selected) await query("DELETE FROM sessions WHERE token_hash=$1", [hashToken(selected.token)]);
      writeSavedSessions(res, sessions.filter(({ user }) => user.id !== req.user.id && user.id !== accountId));
      return res.json({ ok: true });
    }));

    app.post("/api/auth/logout", asyncRoute(async (req, res) => {
      const tokens = [req.cookies[sessionCookie], ...sessionTokens(req.cookies[savedSessionsCookie])]
        .filter((token) => typeof token === "string" && token.length === 43);
      if (tokens.length) await query("DELETE FROM sessions WHERE token_hash=ANY($1::text[])", [tokens.map(hashToken)]);
      clearActiveSession(res);
      if (req.cookies[savedSessionsCookie]) writeSavedSessions(res, []);
      res.json({ ok: true });
    }));
  }

  return { setAuthenticatedSession, registerAccountRoutes, promoteLegacySession, clearActiveSession };
}
