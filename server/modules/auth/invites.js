import { createHash, createHmac, randomBytes, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import { userCredentialsConfigured } from "./user-credentials.js";

export const MEMBER_LIMIT = 30_000;
export const INVITE_LIFETIME_MS = 10 * 24 * 60 * 60 * 1000;
export const INVITE_DELIVERY_WINDOW_MS = 2 * 60 * 1000;

export const inviteSchema = `
  ALTER TABLE users ADD COLUMN IF NOT EXISTS member_number INTEGER;
  ALTER TABLE users ADD COLUMN IF NOT EXISTS can_invite BOOLEAN NOT NULL DEFAULT FALSE;
  CREATE UNIQUE INDEX IF NOT EXISTS users_member_number_unique ON users(member_number) WHERE member_number IS NOT NULL;
  CREATE TABLE IF NOT EXISTS account_invites (
    id TEXT PRIMARY KEY,
    token_hash TEXT NOT NULL UNIQUE,
    recipient_email TEXT NOT NULL,
    created_by TEXT NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMPTZ NOT NULL,
    delivery_status TEXT NOT NULL DEFAULT 'pending' CHECK (delivery_status IN ('pending','sent','failed')),
    consumed_by TEXT UNIQUE REFERENCES users(id),
    consumed_at TIMESTAMPTZ,
    CHECK (expires_at <= created_at + INTERVAL '10 days')
  );
  CREATE INDEX IF NOT EXISTS account_invites_creator_created ON account_invites(created_by,created_at DESC);
  CREATE TABLE IF NOT EXISTS membership_receipts (
    user_id TEXT PRIMARY KEY REFERENCES users(id),
    member_number INTEGER NOT NULL UNIQUE,
    nonce TEXT NOT NULL,
    receipt_hash TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    chain TEXT,
    chain_transaction TEXT,
    chain_status TEXT NOT NULL DEFAULT 'pending' CHECK (chain_status IN ('pending','submitting','confirmed','failed')),
    chain_boc TEXT,
    chain_seqno INTEGER,
    chain_valid_until TIMESTAMPTZ
  );
`;

export function inviteTokenHash(token) {
  return createHash("sha256").update(token).digest("hex");
}

const emailTokenPattern = /^[A-Za-z0-9_-]{43}$/;
const shareTokenPattern = /^v1\.([0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})\.[A-Za-z0-9_-]{43}$/;

export function isAccountInviteToken(token) {
  return typeof token === "string" && (emailTokenPattern.test(token) || shareTokenPattern.test(token));
}

export function accountInviteShareToken(id, env = process.env) {
  if (!userCredentialsConfigured(env)) return null;
  const signature = createHmac("sha256", env.USER_CREDENTIALS_SECRET)
    .update(`rollapp:account-invite-share:v1\0${id}`)
    .digest("base64url");
  return `v1.${id}.${signature}`;
}

export async function findActiveAccountInvite(query, token, env = process.env) {
  if (!isAccountInviteToken(token)) return null;
  const shareMatch = shareTokenPattern.exec(token);
  let column = "token_hash";
  let value = inviteTokenHash(token);
  if (shareMatch) {
    const id = shareMatch[1];
    const expected = accountInviteShareToken(id, env);
    if (!expected || !timingSafeEqual(Buffer.from(token), Buffer.from(expected))) return null;
    column = "id";
    value = id;
  }
  const result = await query(
    `SELECT token_hash,recipient_email,expires_at FROM account_invites WHERE ${column}=$1
     AND delivery_status='sent' AND consumed_by IS NULL AND expires_at>CURRENT_TIMESTAMP`,
    [value],
  );
  return result.rows[0] ?? null;
}

export function createInvite({ email, creatorId, now = new Date() }) {
  const token = randomBytes(32).toString("base64url");
  return {
    id: randomUUID(), token, tokenHash: inviteTokenHash(token),
    email: email.trim().toLowerCase(), creatorId,
    createdAt: now, expiresAt: new Date(now.getTime() + INVITE_LIFETIME_MS),
  };
}

export async function readRegistrationInvite(client, tokenHash) {
  const result = await client.query(
    `SELECT id FROM account_invites WHERE token_hash=$1
     AND delivery_status='sent' AND consumed_by IS NULL AND expires_at>CURRENT_TIMESTAMP FOR UPDATE`,
    [tokenHash],
  );
  const invite = result.rows[0];
  if (!invite) return { kind: "invite-invalid" };
  return { kind: "success", id: invite.id };
}

export async function prepareAccountInvite(client, { creatorId, email, previousId, isMemoryDatabase }) {
  await lockMembership(client, isMemoryDatabase);
  let previous;
  if (previousId) {
    const result = await client.query(
      `SELECT source.recipient_email,source.created_at,
         (source.consumed_by IS NOT NULL OR EXISTS (
           SELECT 1 FROM account_invites accepted WHERE accepted.created_by=source.created_by
           AND accepted.recipient_email=source.recipient_email AND accepted.consumed_at>=source.created_at
         )) AS accepted
       FROM account_invites source WHERE source.id=$1 AND source.created_by=$2`,
      [previousId, creatorId],
    );
    previous = result.rows[0];
    if (!previous) return { status: 404, error: "Приглашение не найдено" };
    if (previous.accepted) return { status: 409, error: "Приглашение уже принято" };
  }

  const recipient = previous?.recipient_email ?? email;
  const active = await client.query(
    `SELECT delivery_status FROM account_invites WHERE created_by=$1 AND recipient_email=$2
     AND consumed_by IS NULL AND expires_at>CURRENT_TIMESTAMP AND (
       (delivery_status='pending' AND created_at>CURRENT_TIMESTAMP - $4::int * INTERVAL '1 millisecond') OR
       (delivery_status='sent' AND ($3::timestamptz IS NULL OR created_at>$3))
     ) ORDER BY (delivery_status='pending') DESC LIMIT 1`,
    [creatorId, recipient, previous?.created_at ?? null, INVITE_DELIVERY_WINDOW_MS],
  );
  if (active.rows[0]?.delivery_status === "pending") return { status: 409, error: "Приглашение уже отправляется" };
  if (active.rowCount) {
    return { status: 409, error: previous ? "Более новое приглашение уже отправлено" : "Для этого email уже есть активный инвайт" };
  }

  const invite = createInvite({ email: recipient, creatorId });
  await client.query(
    `INSERT INTO account_invites (id,token_hash,recipient_email,created_by,created_at,expires_at)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [invite.id, invite.tokenHash, invite.email, invite.creatorId, invite.createdAt, invite.expiresAt],
  );
  return { invite, previousCreatedAt: previous?.created_at ?? null };
}

export async function confirmAccountInviteDelivery(client, invite, isMemoryDatabase, previousCreatedAt = null) {
  await lockMembership(client, isMemoryDatabase);
  // The original link can be accepted while the replacement email is in flight.
  const result = await client.query(
    `UPDATE account_invites AS invite SET delivery_status='sent', expires_at=CASE
       WHEN EXISTS (
         SELECT 1 FROM account_invites accepted WHERE accepted.created_by=invite.created_by
         AND accepted.recipient_email=invite.recipient_email AND accepted.consumed_at>=$3::timestamptz
       ) THEN LEAST(expires_at,CURRENT_TIMESTAMP)
       ELSE expires_at END
     WHERE id=$1 AND delivery_status='pending' AND created_at>CURRENT_TIMESTAMP - $2::int * INTERVAL '1 millisecond'
     RETURNING expires_at>CURRENT_TIMESTAMP AS active`,
    [invite.id, INVITE_DELIVERY_WINDOW_MS, previousCreatedAt],
  );
  if (!result.rowCount) return { status: 409, error: "Срок ожидания отправки истёк. Повторите попытку." };
  if (!result.rows[0].active) return { status: 409, error: "Приглашение уже принято" };

  await client.query(
    `UPDATE account_invites SET expires_at=CURRENT_TIMESTAMP WHERE created_by=$1 AND recipient_email=$2
     AND id<>$3 AND delivery_status='sent' AND consumed_by IS NULL AND expires_at>CURRENT_TIMESTAMP`,
    [invite.creatorId, invite.email, invite.id],
  );
  return { ok: true };
}

export function formatMemberNumber(number) {
  return number == null ? null : String(number).padStart(5, "0");
}

export async function canRegisterInvitedAccount(client, accountType) {
  if (accountType === "business") return true;
  const { rows } = await client.query("SELECT COUNT(*) AS count FROM users WHERE account_type='personal'");
  const current = Number(rows[0]?.count);
  return Number.isSafeInteger(current) && current >= 0 && current < MEMBER_LIMIT;
}

export function requireMemberNumberAccount(req, res, next) {
  if (req.user.account_type === "personal") return next();
  return res.status(403).json({ error: "Номер участника доступен личным аккаунтам", code: "MEMBER_NUMBER_PERSONAL_ONLY" });
}

// Call under the global membership advisory lock. Rejection sampling is uniform
// over the remaining free numbers, including when the range is almost full.
export function drawAvailableNumber(occupied, random = randomInt) {
  if (occupied.size >= MEMBER_LIMIT) return null;
  let number;
  do { number = random(1, MEMBER_LIMIT + 1); } while (occupied.has(number));
  return number;
}

export async function lockMembership(client, isMemoryDatabase) {
  if (!isMemoryDatabase) await client.query("SELECT pg_advisory_xact_lock(hashtextextended('rollapp-membership-v1',0))");
}
