import { Address, Cell, loadTransaction } from "@ton/core";
import { TON_MAINNET } from "../../../shared/modules/payments/ton.js";
import { receiptFromTransaction, settleTonReceipt } from "./roll-ton.js";
import { tonFetch } from "./ton-network.js";

const pageSize = 100;
const receiverGroupsQuery = `SELECT recipient,chain,MIN(created_at) AS oldest FROM roll_ton_orders
  WHERE paid_at IS NULL GROUP BY recipient,chain ORDER BY MIN(created_at), recipient, chain`;

function readVerifiedTransaction(item, accountHash, cursor) {
  const cell = Cell.fromBase64(item.data);
  const tx = loadTransaction(cell.beginParse());
  const hash = cell.hash().toString("base64");
  const lt = tx.lt.toString();
  if (hash !== item.transaction_id?.hash || lt !== String(item.transaction_id.lt) || tx.address !== accountHash) {
    throw new Error("Invalid TON transaction identity");
  }
  if (cursor && (tx.lt > cursor.lt || (tx.lt === cursor.lt && hash !== cursor.hash))) {
    throw new Error("TON transaction is outside the requested history");
  }
  if (tx.lt <= tx.prevTransactionLt || (tx.prevTransactionLt > 0n && tx.prevTransactionHash === 0n)) {
    throw new Error("Invalid TON history predecessor");
  }
  return { tx, hash };
}

function predecessor(tx) {
  if (tx.prevTransactionLt === 0n) return null;
  return { lt: tx.prevTransactionLt, hash: Buffer.from(tx.prevTransactionHash.toString(16).padStart(64, "0"), "hex").toString("base64") };
}

function historyUrl(recipient, cursor) {
  const url = new URL("https://toncenter.com/api/v2/getTransactions");
  url.searchParams.set("address", recipient);
  url.searchParams.set("limit", String(pageSize));
  url.searchParams.set("archival", "true");
  if (cursor) {
    url.searchParams.set("lt", cursor.lt.toString());
    url.searchParams.set("hash", cursor.hash);
  }
  return url;
}

export function createTonPaymentPoller({ query, transaction, fetchImpl = tonFetch, apiKey }) {
  const backfill = new Map();
  let running = false;
  let stopped = false;
  let activeRequest;

  async function scanPage(group, cutoff, accountHash, cursor, summary) {
    let items;
    const controller = new AbortController();
    activeRequest = controller;
    try {
      const response = await fetchImpl(historyUrl(group.recipient, cursor), {
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(8_000)]), redirect: "error",
        headers: { Accept: "application/json", ...(apiKey ? { "X-API-Key": apiKey } : {}) },
      });
      if (!response.ok) {
        await response.body?.cancel();
        throw new Error("TON history unavailable");
      }
      const body = await response.json();
      if (body.ok !== true || !Array.isArray(body.result) || body.result.length > pageSize) {
        throw new Error("Invalid TON history page");
      }
      items = body.result;
    } catch {
      if (!stopped) summary.failedPages += 1;
      return cursor;
    } finally {
      activeRequest = null;
    }

    let oldest = null;
    let expected = cursor;
    const seen = new Set();
    for (const item of items) {
      if (stopped) return cursor;
      let receipt;
      try {
        const verified = readVerifiedTransaction(item, accountHash, cursor);
        if (seen.has(verified.hash)) continue;
        seen.add(verified.hash);
        const tx = verified.tx;
        if (expected && (tx.lt !== expected.lt || verified.hash !== expected.hash)) summary.incompleteHistory += 1;
        expected = predecessor(tx);
        if (!oldest || tx.lt < oldest.lt) oldest = tx;
        if (tx.now >= cutoff) receipt = receiptFromTransaction(tx, group.recipient);
      } catch {
        summary.rejectedRecords += 1;
        continue;
      }
      if (!receipt) continue;
      try { await transaction((client) => settleTonReceipt(client, receipt, group.chain)); }
      catch { if (!stopped) summary.failedSettlements += 1; }
    }
    // An empty or corrupt historical reply does not advance its cursor.
    // Starting a new sweep from the head after reaching the cutoff rechecks
    // earlier gaps, including a valid payment indexed late for an old invoice.
    if (!oldest) {
      if (cursor && items.length === 0) summary.incompleteHistory += 1;
      return cursor;
    }
    return oldest.now < cutoff ? null : predecessor(oldest);
  }

  async function tick() {
    if (running || stopped) return null;
    running = true;
    const summary = { failedGroups: 0, failedPages: 0, rejectedRecords: 0, incompleteHistory: 0, failedSettlements: 0 };
    try {
      const { rows: groups } = await query(receiverGroupsQuery);
      // Expired invoices remain eligible for indexing delayed past expiry.
      const activeKeys = new Set(groups.map((group) => `${group.chain}:${group.recipient}`));
      for (const key of backfill.keys()) if (!activeKeys.has(key)) backfill.delete(key);
      const historical = [];
      for (const group of groups) {
        if (stopped) break;
        try {
          const cutoff = Math.floor(new Date(group.oldest).getTime() / 1000) - 30;
          if (!Number.isFinite(cutoff) || group.chain !== TON_MAINNET) throw new Error("Invalid TON receiver group");
          const accountHash = BigInt(`0x${Address.parse(group.recipient).hash.toString("hex")}`);
          const key = `${group.chain}:${group.recipient}`;
          const head = await scanPage(group, cutoff, accountHash, null, summary);
          const older = backfill.get(key) ?? head;
          if (older) historical.push({ group, cutoff, accountHash, key, older });
        } catch { if (!stopped) summary.failedGroups += 1; }
      }
      for (const { group, cutoff, accountHash, key, older } of historical) {
        if (stopped) break;
        const next = await scanPage(group, cutoff, accountHash, older, summary);
        if (next) backfill.set(key, next);
        else backfill.delete(key);
      }
    } catch { if (!stopped) summary.failedGroups += 1; }
    finally { running = false; }
    return stopped ? null : summary;
  }

  return { tick, stop() { stopped = true; activeRequest?.abort(); } };
}

export function startTonPaymentPolling({ env = process.env, ...dependencies }) {
  if (env.TON_ROLLS_WORKER_ENABLED !== "true") return { stop() {} };
  const poller = createTonPaymentPoller({ ...dependencies, apiKey: env.TONCENTER_API_KEY });
  async function tick() {
    const result = await poller.tick();
    if (result && Object.values(result).some(Boolean)) console.error("[ton-payments] Incomplete blockchain verification; retrying.", result);
  }
  const timer = setInterval(tick, 30_000);
  timer.unref();
  void tick();
  return { stop() { clearInterval(timer); poller.stop(); } };
}
