import { createHash, randomUUID } from "node:crypto";
import { Address, beginCell, Cell, external, internal, loadMessage, SendMode, storeMessage, toNano } from "@ton/core";
import { mnemonicToPrivateKey, mnemonicValidate } from "@ton/crypto";
import { TonClient, WalletContractV4 } from "@ton/ton";

const opcode = 0x524c4d31; // RLM1: Rollapp membership v1
const messageValue = toNano("0.01");
const expiryGraceMs = 120_000;
const mainnetEndpoint = "https://toncenter.com/api/v2/jsonRPC";

export function membershipAnchorBody(digest) {
  if (!/^[a-f0-9]{64}$/.test(digest)) throw new Error("Invalid membership digest");
  return beginCell().storeUint(opcode, 32).storeBuffer(Buffer.from(digest, "hex")).endCell();
}

export function signMembershipAnchor({ wallet, secretKey, seqno, timeout, digest }) {
  // An already active wallet must be used: its first transfer is special and
  // Wallet V4's SDK encodes an unlimited expiry for seqno zero.
  if (!Number.isSafeInteger(seqno) || seqno < 1 || !Number.isSafeInteger(timeout) || timeout < 1) {
    throw new Error("Membership wallet must already be deployed and initialized");
  }
  const body = wallet.createTransfer({
    seqno, timeout, secretKey, sendMode: SendMode.PAY_GAS_SEPARATELY,
    messages: [internal({ to: wallet.address, value: messageValue, bounce: false, body: membershipAnchorBody(digest) })],
  });
  return beginCell().store(storeMessage(external({ to: wallet.address, body }))).endCell().toBoc();
}

export function inspectMembershipTransactions(transactions, { boc, digest, address }) {
  const message = loadMessage(Cell.fromBoc(boc)[0].beginParse());
  const expectedHash = membershipAnchorBody(digest).hash();
  for (const tx of transactions) {
    if (tx.address !== BigInt("0x" + address.hash.toString("hex"))
      || tx.inMessage?.info.type !== "external-in" || !tx.inMessage.info.dest.equals(address)
      || !tx.inMessage.body.equals(message.body)) continue;
    const phase = tx.description;
    const output = tx.outMessages.values().some(({ info, body }) => info.type === "internal"
      && !info.bounced && info.src.equals(address) && info.dest.equals(address) && body.hash().equals(expectedHash));
    if (phase.type !== "generic" || phase.aborted || phase.computePhase.type !== "vm"
      || !phase.computePhase.success || !phase.actionPhase?.success || !output) return { kind: "failed" };
    return { kind: "confirmed", hash: tx.hash().toString("hex"), lt: tx.lt.toString() };
  }
  return { kind: "missing" };
}

async function createMembershipTon(env) {
  const mnemonic = env.ROLLAPP_MEMBERSHIP_TON_MNEMONIC?.trim().split(/\s+/);
  if (mnemonic?.length !== 24 || !await mnemonicValidate(mnemonic)) throw new Error("Invalid membership TON mnemonic");
  const { publicKey, secretKey } = await mnemonicToPrivateKey(mnemonic);
  const wallet = WalletContractV4.create({ workchain: 0, publicKey });
  const expected = Address.parse(env.ROLLAPP_MEMBERSHIP_TON_ADDRESS || "");
  if (!wallet.address.equals(expected)) throw new Error("Membership wallet address does not match signer");
  const client = new TonClient({ endpoint: mainnetEndpoint, apiKey: env.TONCENTER_API_KEY || undefined, timeout: 7_000 });
  const contract = client.open(wallet);
  return {
    address: wallet.address.toRawString(),
    seqno: () => contract.getSeqno(),
    sign: (args) => signMembershipAnchor({ ...args, wallet, secretKey }),
    inspect: async (row) => inspectMembershipTransactions(
      await client.getTransactions(wallet.address, { limit: 32, archival: true }),
      { boc: row.boc, digest: row.digest, address: wallet.address },
    ),
    broadcast: (boc) => client.sendFile(boc),
  };
}

export async function advanceMembershipAnchor({ row, ton, persist, now = Date.now }) {
  if (createHash("sha256").update(row.receipt).digest("hex") !== row.digest) throw new Error("Membership receipt integrity mismatch");
  if (row.boc) {
    if (row.wallet !== ton.address) throw new Error("Resolve the existing membership anchor with its original wallet");
    const result = await ton.inspect(row);
    if (result.kind === "confirmed") return persist.confirm(result);
    if (result.kind === "failed") return persist.clear();
    const current = await ton.seqno();
    if (current !== row.seqno) return; // Never re-sign when a prior send may already be on-chain.
    if (now() >= Number(row.expires_at) + expiryGraceMs) return persist.clear();
    if (now() < Number(row.expires_at) - 10_000) await ton.broadcast(row.boc);
    return;
  }
  const seqno = await ton.seqno();
  const timeout = Math.floor(now() / 1000) + 120;
  const boc = ton.sign({ seqno, timeout, digest: row.digest });
  // Persist before broadcast. A process or provider failure can only replay this
  // exact BOC until it has either been observed on-chain or safely expired.
  if (await persist.signed({ wallet: ton.address, seqno, timeout, boc })) await ton.broadcast(boc);
}

export async function processMembershipTonAnchor({ transaction, ton, now }) {
  const token = randomUUID();
  const row = await transaction(async (client) => {
    const { rows: [next] } = await client.query(`
      SELECT *, next_attempt_at <= clock_timestamp() AS due
      FROM membership_ton_anchors WHERE tx_hash IS NULL
      ORDER BY (boc IS NOT NULL) DESC, number LIMIT 1 FOR UPDATE
    `);
    if (!next?.due) return null;
    await client.query(`
      UPDATE membership_ton_anchors SET lease_token=$2, next_attempt_at=clock_timestamp()+interval '90 seconds'
      WHERE number=$1`, [next.number, token]);
    return next;
  });
  if (!row) return false;
  const update = (set, params = []) => transaction(async (client) => (await client.query(
    `UPDATE membership_ton_anchors SET ${set} WHERE number=$1 AND lease_token=$2`,
    [row.number, token, ...params],
  )).rowCount === 1);
  try {
    await advanceMembershipAnchor({
      row, ton, now,
      persist: {
        signed: ({ wallet, seqno, timeout, boc }) => update(
          "wallet=$3,seqno=$4,expires_at=to_timestamp($5),boc=$6", [wallet, seqno, timeout, boc],
        ),
        confirm: ({ hash, lt }) => update("tx_hash=$3,tx_lt=$4,seqno=NULL,expires_at=NULL,boc=NULL", [hash, lt]),
        clear: () => update("wallet=NULL,seqno=NULL,expires_at=NULL,boc=NULL"),
      },
    });
  } finally {
    await update("lease_token=NULL,next_attempt_at=clock_timestamp()+interval '12 seconds'");
  }
  return true;
}

export async function startMembershipTonWorker({ transaction, enabled, env = process.env }) {
  if (!enabled) return { stop() {} };
  if (!env.ROLLAPP_MEMBERSHIP_TON_MNEMONIC) {
    if (env.NODE_ENV === "production") throw new Error("The dedicated membership TON signer is required in production.");
    return { stop() {} };
  }
  const ton = await createMembershipTon(env);
  let running = false;
  let stopped = false;
  const tick = async () => {
    if (stopped || running) return;
    running = true;
    try { await processMembershipTonAnchor({ transaction, ton }); }
    catch { if (!stopped) console.error("[membership-ton] Anchor not yet available; retry scheduled."); }
    finally { running = false; }
  };
  const timer = setInterval(tick, 5_000);
  timer.unref();
  tick();
  return { stop() { stopped = true; clearInterval(timer); } };
}
