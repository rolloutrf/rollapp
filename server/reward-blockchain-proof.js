import { createHash, randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

export const REWARD_PROOF_CALENDARS = [
  "https://alice.btc.calendar.opentimestamps.org",
  "https://bob.btc.calendar.opentimestamps.org",
];
const EXPLORERS = ["https://blockstream.info/api", "https://mempool.space/api"];
const HEX32 = /^[a-f0-9]{64}$/;
// An OTS pending node is a message, not necessarily a SHA256 digest: real
// calendars include nonce/prefix bytes before the eventual hash operation.
const OTS_MESSAGE = /^(?:[a-f0-9]{2}){1,4096}$/;
const sha256 = value => createHash("sha256").update(value).digest();
const codecPath = fileURLToPath(new URL("./reward-proof-codec.py", import.meta.url));

export function rewardReceipt({ offerId, businessId, recipientId, kind, amount, createdAt }, salt = randomBytes(32).toString("hex")) {
  if (!["reward", "refund"].includes(kind) || !Number.isSafeInteger(amount) || amount < 1 || amount > 1_000_000
      || !HEX32.test(salt) || ![offerId, businessId, recipientId].every(value => typeof value === "string" && value.length > 0 && value.length <= 200)
      || !Number.isFinite(new Date(createdAt).getTime())) throw new Error("Invalid reward receipt");
  // Fixed key order, explicit domain/version, immutable amounts and a private
  // 256-bit salt. Only the digest reaches calendars, never this preimage.
  const content = JSON.stringify({ domain: "rollapp:funded-need-receipt", version: 1, currency: "rolls",
    offerId, businessId, recipientId, kind, amount, createdAt: new Date(createdAt).toISOString(), salt }) + "\n";
  return { content, digest: sha256(content).toString("hex") };
}

export async function runRewardProofCodec(data, { python = process.env.ROLLAPP_OTS_PYTHON || "/opt/rollapp-ots/bin/python" } = {}) {
  if (!HEX32.test(data.digest)) throw new Error("Invalid receipt digest");
  const input = JSON.stringify(data);
  if (Buffer.byteLength(input) > 1_048_576) throw new Error("Proof request too large");
  return new Promise((resolve, reject) => {
    const child = spawn(python, [codecPath], { stdio: ["pipe", "pipe", "pipe"], env: { PATH: process.env.PATH, PYTHONNOUSERSITE: "1", PYTHONDONTWRITEBYTECODE: "1" } });
    const chunks = [];
    let size = 0;
    const timer = setTimeout(() => child.kill("SIGKILL"), 5000);
    child.stdout.on("data", chunk => { size += chunk.length; if (size > 524288) child.kill("SIGKILL"); else chunks.push(chunk); });
    // Bounded output is deliberately not copied to application logs.
    child.stderr.resume();
    child.stdin.on("error", () => {});
    child.once("error", () => { clearTimeout(timer); reject(new Error("Timestamp codec unavailable")); });
    child.once("close", code => {
      clearTimeout(timer);
      if (code !== 0 || size > 524288) return reject(new Error("Invalid timestamp proof"));
      try {
        const result = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        if (typeof result.proof !== "string" || !Array.isArray(result.pending) || !Array.isArray(result.bitcoin)) throw new Error();
        resolve(result);
      } catch { reject(new Error("Invalid timestamp proof")); }
    });
    child.stdin.end(input);
  });
}

async function boundedFetch(url, options, fetchImpl, maximum = 131072) {
  const response = await fetchImpl(url, { ...options, redirect: "error", signal: AbortSignal.timeout(8000) });
  if (!response.ok) { await response.body?.cancel(); throw new Error("Timestamp network unavailable"); }
  if (Number(response.headers.get("content-length")) > maximum) { await response.body?.cancel(); throw new Error("Timestamp response too large"); }
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.length;
      if (size > maximum) throw new Error("Timestamp response too large");
      chunks.push(Buffer.from(value));
    }
    return Buffer.concat(chunks);
  } finally { await reader.cancel().catch(() => {}); }
}

// Both configured independent explorers must agree on canonical block hash,
// exact header and six confirmations. This is explorer-backed verification,
// not a substitute for running Bitcoin Core; portable .ots proofs support it.
export async function verifyRewardBitcoin(attestations, { fetchImpl = fetch } = {}) {
  for (const item of attestations.slice(0, 8)) {
    if (!Number.isSafeInteger(item.height) || item.height < 0 || !HEX32.test(item.commitment)) continue;
    const read = async base => {
      const text = async path => (await boundedFetch(`${base}${path}`, {}, fetchImpl, 1024)).toString("utf8").trim();
      const [hash, tip] = await Promise.all([text(`/block-height/${item.height}`), text("/blocks/tip/height")]);
      if (!HEX32.test(hash) || !/^\d{1,10}$/.test(tip) || Number(tip) - item.height + 1 < 6) throw new Error("Bitcoin confirmation unavailable");
      const header = await text(`/block/${hash}/header`);
      if (!/^[a-f0-9]{160}$/.test(header)) throw new Error("Invalid Bitcoin header");
      return { hash, header };
    };
    try {
      const [first, second] = await Promise.all(EXPLORERS.map(read));
      if (first.hash !== second.hash || first.header !== second.header) continue;
      const header = Buffer.from(first.header, "hex");
      if (sha256(sha256(header)).reverse().toString("hex") !== first.hash || header.subarray(36, 68).toString("hex") !== item.commitment) continue;
      return { height: item.height, hash: first.hash, timestamp: header.readUInt32LE(68), verification: "two-explorer-headers" };
    } catch { /* A network failure or disagreement cannot become confirmation. */ }
  }
  return null;
}

export async function advanceRewardProof({ digest, proof = null }, { fetchImpl = fetch, codec = runRewardProofCodec, verifyBitcoin = verifyRewardBitcoin } = {}) {
  if (!HEX32.test(digest)) throw new Error("Invalid receipt digest");
  let parsed;
  if (!proof) {
    const results = await Promise.allSettled(REWARD_PROOF_CALENDARS.map(async calendar => ({
      commitment: digest,
      timestamp: (await boundedFetch(`${calendar}/digest`, { method: "POST", headers: { Accept: "application/vnd.opentimestamps.v1", "Content-Type": "application/octet-stream" }, body: Buffer.from(digest, "hex") }, fetchImpl)).toString("base64"),
    })));
    const additions = results.filter(result => result.status === "fulfilled").map(result => result.value);
    if (!additions.length) throw new Error("Timestamp calendars unavailable");
    parsed = await codec({ digest, additions });
  } else parsed = await codec({ digest, proof });
  const upgrades = await Promise.allSettled(parsed.pending.slice(0, 4).map(async pending => {
    // Never follow a URL supplied by a calendar: exact HTTPS origin only,
    // generated path, no redirects, no IP literals, no runtime URL overrides.
    if (!REWARD_PROOF_CALENDARS.includes(pending.calendar) || !OTS_MESSAGE.test(pending.commitment)) throw new Error("Untrusted timestamp calendar");
    return { commitment: pending.commitment, timestamp: (await boundedFetch(`${pending.calendar}/timestamp/${pending.commitment}`, { headers: { Accept: "application/vnd.opentimestamps.v1" } }, fetchImpl)).toString("base64") };
  }));
  const additions = upgrades.filter(result => result.status === "fulfilled").map(result => result.value);
  if (additions.length) parsed = await codec({ digest, proof: parsed.proof, additions });
  const bitcoin = await verifyBitcoin(parsed.bitcoin, { fetchImpl });
  return { proof: parsed.proof, bitcoin, status: bitcoin ? "confirmed" : "pending" };
}
