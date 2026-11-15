import { createHash, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { rewardReceipt, advanceRewardProof } from "./reward-blockchain-proof.js";

export async function enqueueRewardReceipt(client, row, recipientId, kind) {
  const receipt = rewardReceipt({ offerId: row.id, businessId: row.business_id, recipientId, kind,
    amount: Number(row.reward), createdAt: (await client.query("SELECT CURRENT_TIMESTAMP AS now")).rows[0].now });
  await client.query("INSERT INTO reward_blockchain_receipts (offer_id,content,digest) VALUES ($1,$2,$3)", [row.id, receipt.content, receipt.digest]);
}

export async function checkRewardProofRuntime(env = process.env) {
  if (env.ROLLAPP_REWARD_PROOFS_ENABLED !== "true") return;
  if (env.ROLLAPP_NEED_REWARDS_ENABLED !== "true") throw new Error("Bitcoin receipts require enabled need rewards.");
  try {
    await promisify(execFile)(env.ROLLAPP_OTS_PYTHON || "/opt/rollapp-ots/bin/python", ["-c", "import opentimestamps.core.timestamp; import Cryptodome.Hash.SHA256"], { timeout: 5000, maxBuffer: 1024 });
  } catch { throw new Error("Bitcoin receipt runtime unavailable; install pinned OpenTimestamps dependencies or disable ROLLAPP_REWARD_PROOFS_ENABLED."); }
}

export async function processRewardProof({ transaction, advance = advanceRewardProof, offerId = null }) {
  const token = randomUUID();
  const row = await transaction(async client => {
    const found = await client.query("SELECT * FROM reward_blockchain_receipts WHERE status<>'confirmed' AND next_attempt_at<=CURRENT_TIMESTAMP AND ($1::uuid IS NULL OR offer_id=$1) ORDER BY next_attempt_at,offer_id FOR UPDATE SKIP LOCKED LIMIT 1", [offerId]);
    if (!found.rowCount) return null;
    await client.query("UPDATE reward_blockchain_receipts SET lease_token=$2,attempts=attempts+1,next_attempt_at=CURRENT_TIMESTAMP + INTERVAL '5 minutes' WHERE offer_id=$1", [found.rows[0].offer_id, token]);
    return found.rows[0];
  });
  if (!row) return false;
  try {
    if (createHash("sha256").update(row.content).digest("hex") !== row.digest) throw new Error("Receipt integrity failure");
    const result = await advance({ digest: row.digest, proof: row.proof ? row.proof.toString("base64") : null });
    await transaction(client => client.query(`UPDATE reward_blockchain_receipts SET proof=$3,status=$4,
      bitcoin_height=$5,bitcoin_hash=$6,verified_at=CASE WHEN $4='confirmed' THEN CURRENT_TIMESTAMP ELSE NULL END,
      lease_token=NULL,last_error=NULL,next_attempt_at=CURRENT_TIMESTAMP + INTERVAL '10 minutes'
      WHERE offer_id=$1 AND lease_token=$2`,
    [row.offer_id, token, Buffer.from(result.proof, "base64"), result.status, result.bitcoin?.height ?? null, result.bitcoin?.hash ?? null]));
  } catch {
    // Preserve any earlier portable proof; transport failures never become
    // confirmation and never roll back or repeat an application reward.
    await transaction(client => client.query(`UPDATE reward_blockchain_receipts SET lease_token=NULL,
      last_error='PROOF_RETRY_REQUIRED',next_attempt_at=CURRENT_TIMESTAMP + INTERVAL '5 minutes'
      WHERE offer_id=$1 AND lease_token=$2`, [row.offer_id, token]));
  }
  return true;
}

export function startRewardProofWorker({ transaction, env = process.env }) {
  if (env.ROLLAPP_REWARD_PROOFS_ENABLED !== "true") return { stop() {} };
  let running = false, stopped = false;
  const tick = async () => {
    if (running || stopped) return;
    running = true;
    try { await processRewardProof({ transaction }); }
    catch { if (!stopped) console.error("[reward-proofs] Receipt queue unavailable; retry scheduled."); }
    finally { running = false; }
  };
  const timer = setInterval(tick, 60_000); timer.unref(); tick();
  return { stop() { stopped = true; clearInterval(timer); } };
}
