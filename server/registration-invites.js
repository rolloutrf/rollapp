import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1_000;
const domain = "rollapp:registration-invite:v1\0";

function signature(payload, secret) {
  return createHmac("sha256", secret).update(domain).update(payload).digest("base64url");
}

export function createRegistrationInvite(issuerId, secret, now = Date.now()) {
  const expiresAt = now + INVITE_TTL_MS;
  // The new account's primary key also claims the invite in the signup transaction.
  const payload = Buffer.from(JSON.stringify([issuerId, randomUUID(), expiresAt])).toString("base64url");
  return { token: `${payload}.${signature(payload, secret)}`, expiresAt };
}

export function readRegistrationInvite(token, secret, now = Date.now()) {
  if (!secret || typeof token !== "string" || token.length > 512) return null;
  const match = /^([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]{43})$/.exec(token);
  if (match?.[0] !== token) return null;
  const [, payload, mac] = match;
  if (!timingSafeEqual(Buffer.from(mac), Buffer.from(signature(payload, secret)))) return null;
  const [issuerId, accountId, expiresAt] = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  return expiresAt > now ? { issuerId, accountId } : null;
}

export async function findRegistrationInvite(query, token, secret) {
  const invite = readRegistrationInvite(token, secret);
  if (!invite) return null;
  const found = await query(
    `SELECT 1 FROM users WHERE id=$1
     AND NOT EXISTS (SELECT 1 FROM users WHERE id=$2)`,
    [invite.issuerId, invite.accountId],
  );
  return found.rowCount ? invite : null;
}
