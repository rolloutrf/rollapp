import { createHash, randomBytes, randomInt, randomUUID } from "node:crypto";

export const MEMBER_LIMIT = 30_000;
export const INVITE_LIFETIME_MS = 10 * 24 * 60 * 60 * 1000;

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

export function createInvite({ email, creatorId, now = new Date() }) {
  const token = randomBytes(32).toString("base64url");
  return {
    id: randomUUID(), token, tokenHash: inviteTokenHash(token),
    email: email.trim().toLowerCase(), creatorId,
    createdAt: now, expiresAt: new Date(now.getTime() + INVITE_LIFETIME_MS),
  };
}

export function formatMemberNumber(number) {
  return number == null ? null : String(number).padStart(5, "0");
}

export function membershipHasCapacity(count) {
  const current = Number(count);
  return Number.isSafeInteger(current) && current >= 0 && current < MEMBER_LIMIT;
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
