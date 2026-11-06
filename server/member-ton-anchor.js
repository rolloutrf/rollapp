import { beginCell, Cell, external, internal, loadTransaction, SendMode, storeMessage } from "@ton/core";
import { mnemonicToPrivateKey } from "@ton/crypto";
import { TonClient, WalletContractV4 } from "@ton/ton";
import { TON_MAINNET } from "../shared/ton.js";
import { tonFetch } from "./ton-network.js";

export const memberTonComment = receiptHash => `rollapp-member-v1:${receiptHash}`;

export function memberTonConfig(env = process.env) {
  if (env.TON_MEMBERSHIP_ENABLED !== "true") return null;
  const words = String(env.TON_MEMBERSHIP_MNEMONIC || "").trim().split(/\s+/);
  if (words.length !== 24) throw new Error("TON membership mnemonic is missing or invalid");
  if (!String(env.TONCENTER_API_KEY || "").trim()) throw new Error("TONCENTER_API_KEY is required for membership anchoring");
  return { words, endpoint: "https://toncenter.com/api/v2/jsonRPC", apiKey: env.TONCENTER_API_KEY };
}

export function receiptFromTonTransaction(tx, walletAddress, receiptHash) {
  const info = tx.inMessage?.info;
  if (tx.description?.type !== "generic" || tx.description.aborted || info?.type !== "internal" || info.bounced
      || !info.src?.equals(walletAddress) || !info.dest?.equals(walletAddress)) return null;
  try {
    const body = tx.inMessage.body.beginParse();
    if (body.loadUint(32) !== 0 || body.loadStringTail() !== memberTonComment(receiptHash)) return null;
    return tx.hash().toString("hex");
  } catch { return null; }
}

export async function fetchMemberTransactions(address, apiKey, fetchImpl = tonFetch) {
  const url = new URL("https://toncenter.com/api/v2/getTransactions");
  url.searchParams.set("address", address.toRawString());
  url.searchParams.set("limit", "30");
  const response = await fetchImpl(url, { signal: AbortSignal.timeout(8_000), redirect: "error",
    headers: { Accept: "application/json", "X-API-Key": apiKey } });
  if (!response.ok) { await response.body?.cancel(); throw new Error("TON history unavailable"); }
  const body = await response.json();
  if (body.ok !== true || !Array.isArray(body.result)) throw new Error("Invalid TON history");
  return body.result.map(item => {
    const cell = Cell.fromBase64(item.data);
    if (cell.hash().toString("base64") !== item.transaction_id?.hash) throw new Error("TON transaction hash mismatch");
    return loadTransaction(cell.beginParse());
  });
}

export async function startMemberTonAnchor({ pool, env = process.env, clientFactory = config => new TonClient(config) }) {
  const config = memberTonConfig(env);
  if (!config) return { kick() {}, stop() {} };
  const keyPair = await mnemonicToPrivateKey(config.words);
  const wallet = WalletContractV4.create({ workchain: 0, publicKey: keyPair.publicKey });
  const client = clientFactory({ endpoint: config.endpoint, apiKey: config.apiKey, timeout: 8_000 });
  let stopped = false;
  let running = false;

  async function tick() {
    if (running || stopped) return;
    running = true;
    let lockClient;
    let locked = false;
    try {
      lockClient = await pool.connect();
      locked = (await lockClient.query("SELECT pg_try_advisory_lock(hashtextextended('rollapp-member-ton-v1',0)) AS locked")).rows[0].locked;
      if (!locked) return;
      const found = await lockClient.query("SELECT * FROM membership_receipts WHERE chain_status IN ('pending','submitting') ORDER BY created_at,user_id LIMIT 1");
      const receipt = found.rows[0];
      if (!receipt) return;
      if (!(await client.isContractDeployed(wallet.address))) throw new Error("TON membership wallet must be deployed and funded");
      const transactions = await fetchMemberTransactions(wallet.address, config.apiKey);
      const confirmed = transactions.map(tx => receiptFromTonTransaction(tx, wallet.address, receipt.receipt_hash)).find(Boolean);
      if (confirmed) {
        await lockClient.query("UPDATE membership_receipts SET chain=$3,chain_transaction=$2,chain_status='confirmed',chain_boc=NULL,chain_seqno=NULL,chain_valid_until=NULL WHERE user_id=$1 AND chain_status='submitting'", [receipt.user_id, confirmed, TON_MAINNET]);
        return;
      }
      if (receipt.chain_status === "pending") {
        if ((await client.getBalance(wallet.address)) < 50_000_000n) throw new Error("TON membership wallet balance is too low");
        const seqno = await wallet.getSeqno(client.provider(wallet.address));
        const transfer = wallet.createTransfer({
          seqno, secretKey: keyPair.secretKey, timeout: Math.floor(Date.now() / 1000) + 120,
          sendMode: SendMode.PAY_GAS_SEPARATELY,
          messages: [internal({ to: wallet.address, value: 10_000_000n, bounce: false,
            body: beginCell().storeUint(0, 32).storeStringTail(memberTonComment(receipt.receipt_hash)).endCell() })],
        });
        const boc = beginCell().store(storeMessage(external({ to: wallet.address, body: transfer }))).endCell().toBoc().toString("base64");
        await lockClient.query("UPDATE membership_receipts SET chain=$5,chain_status='submitting',chain_boc=$2,chain_seqno=$3,chain_valid_until=$4 WHERE user_id=$1 AND chain_status='pending'", [receipt.user_id, boc, seqno, new Date(Date.now() + 120_000), TON_MAINNET]);
        receipt.chain_boc = boc;
      } else if (new Date(receipt.chain_valid_until).getTime() < Date.now()) {
        const seqno = await wallet.getSeqno(client.provider(wallet.address));
        if (seqno !== Number(receipt.chain_seqno)) {
          await lockClient.query("UPDATE membership_receipts SET chain_status='failed' WHERE user_id=$1 AND chain_status='submitting'", [receipt.user_id]);
          console.error("[member-ton] Wallet seqno advanced without a verified receipt; manual review required.");
          return;
        }
        await lockClient.query("UPDATE membership_receipts SET chain_status='pending',chain_boc=NULL,chain_seqno=NULL,chain_valid_until=NULL WHERE user_id=$1 AND chain_status='submitting'", [receipt.user_id]);
        return;
      }
      await client.sendFile(Buffer.from(receipt.chain_boc, "base64"));
    } catch (error) {
      if (!stopped) console.error(`[member-ton] Anchor pending: ${error.message}`);
    } finally {
      let discard = false;
      if (locked) {
        try { await lockClient.query("SELECT pg_advisory_unlock(hashtextextended('rollapp-member-ton-v1',0))"); }
        catch { discard = true; }
      }
      lockClient?.release(discard);
      running = false;
    }
  }
  const timer = setInterval(tick, 10_000);
  timer.unref();
  void tick();
  return { kick() { void tick(); }, stop() { stopped = true; clearInterval(timer); } };
}
