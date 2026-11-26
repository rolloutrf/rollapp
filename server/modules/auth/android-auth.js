import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { createSessionToken, hashToken } from "./security.js";
import { sessionCookie } from "./account-sessions.js";

const route = "/api/auth/android";
const grantPurpose = "android-app";
const grantLifetimeMs = 2 * 60 * 1000;
const token = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
const authorizeSchema = z.object({
  challenge: token,
  state: token,
  client: z.enum(["release", "debug"]),
}).strict();
const approveSchema = authorizeSchema.extend({ proof: token });
const exchangeSchema = z.object({
  code: token,
  verifier: z.string().regex(/^[A-Za-z0-9_-]{43,128}$/),
}).strict();

export function androidChallenge(verifier) {
  return createHash("sha256").update(verifier).digest("base64url");
}

export function androidApprovalProof(browserSession, request) {
  return createHmac("sha256", browserSession)
    .update(`rollapp:android:approve:v1\0${request.client}\0${request.state}\0${request.challenge}`)
    .digest("base64url");
}

const escapeHtml = text => String(text ?? "").replace(/[&<>"']/g, character =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);

export function androidCallback(client, code, state) {
  const scheme = client === "debug" ? "ru.rollapp.android.debug" : "ru.rollapp.android";
  return `${scheme}:/authorize?${new URLSearchParams({ code, state })}`;
}

function page(title, content) {
  return `<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="dark light"><title>${title}</title><main><h1>${title}</h1>${content}</main></html>`;
}

function form(request, browserSession, username) {
  const values = { ...request, proof: androidApprovalProof(browserSession, request) };
  const hidden = Object.entries(values).map(([name, value]) =>
    `<input type="hidden" name="${name}" value="${escapeHtml(value)}">`).join("");
  return page("Подключить Rollapp для Android",
    `<p>Приложение получит доступ к вашему аккаунту <strong>@${escapeHtml(username)}</strong>. Продолжайте, только если вы сами начали вход из приложения Rollapp.</p><form method="post" action="${route}/approve">${hidden}<button type="submit">Разрешить вход</button></form>`);
}

export function registerAndroidAuthRoutes(app, {
  enabled, limit, asyncRoute, requireAuth, parseForm, query, transaction, createSessionRecord, setSession,
}) {
  app.use(route, (_req, res, next) => {
    res.set({ "Cache-Control": "no-store", "Referrer-Policy": "no-referrer",
      "Content-Security-Policy": "default-src 'none'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'" });
    next();
  });
  app.get(`${route}/config`, (_req, res) => res.json({ enabled }));
  if (!enabled) return;
  app.get(`${route}/authorize`, limit, asyncRoute(async (req, res) => {
    const request = authorizeSchema.safeParse(req.query);
    if (!request.success) return res.status(400).send(page("Неверный запрос", "<p>Начните вход заново из приложения.</p>"));
    const browserSession = req.cookies[sessionCookie];
    if (!req.user || !browserSession) {
      const next = `${route}/authorize?${new URLSearchParams(request.data)}`;
      return res.redirect(303, `/api/auth/yandex/start?${new URLSearchParams({ next })}`);
    }
    res.send(form(request.data, browserSession, req.user.username));
  }));
  app.post(`${route}/approve`, limit, requireAuth, parseForm, asyncRoute(async (req, res) => {
    const browserSession = req.cookies[sessionCookie];
    const request = approveSchema.safeParse(req.body);
    const origin = `${req.protocol}://${req.get("host")}`;
    if (!request.success || !browserSession || req.get("origin") !== origin ||
      !timingSafeEqual(Buffer.from(request.data.proof), Buffer.from(androidApprovalProof(browserSession, request.data)))) {
      return res.status(403).send(page("Вход не подтверждён", "<p>Начните вход заново из приложения.</p>"));
    }
    const { client, state, challenge } = request.data;
    const code = createSessionToken();
    await query(`INSERT INTO yandex_oauth_attempts
      (state_hash,code_verifier,next_path,purpose,user_id,expires_at) VALUES ($1,$2,$3,$4,$5,$6)`,
    [hashToken(code), challenge, "", grantPurpose, req.user.id, new Date(Date.now() + grantLifetimeMs)]);
    res.send(page("Вход разрешён",
      `<p><a href="${escapeHtml(androidCallback(client, code, state))}">Вернуться в Rollapp</a></p>`));
  }));
  app.post(`${route}/exchange`, limit, asyncRoute(async (req, res) => {
    const request = exchangeSchema.safeParse(req.body);
    if (!request.success || !req.is("application/json") || req.cookies[sessionCookie]) {
      return res.status(400).json({ error: "Неверный запрос входа" });
    }
    const result = await transaction(async client => {
      const grant = await client.query(`DELETE FROM yandex_oauth_attempts
        WHERE state_hash=$1 AND code_verifier=$2 AND purpose=$3 AND expires_at>CURRENT_TIMESTAMP RETURNING user_id`,
      [hashToken(request.data.code), androidChallenge(request.data.verifier), grantPurpose]);
      const userId = grant.rows[0]?.user_id;
      return userId ? { userId, session: await createSessionRecord(client, userId) } : null;
    });
    if (!result) return res.status(401).json({ error: "Код входа недействителен или истёк" });
    await setSession(req, res, result.session, result.userId);
    res.json({ ok: true });
  }));
}
