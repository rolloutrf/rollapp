import { useState } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { toUserFriendlyAddress } from "@tonconnect/sdk";
import { MobileFormPages } from "@/components/mobile-form-pages";
import { Button } from "@/components/ui/button";
import { RollsWallet } from "@/modules/payments/rolls-wallet.jsx";
import { TonTopup } from "@/modules/payments/ton-topup.jsx";
import { api } from "@/modules/runtime/api.js";
import { quoteTonRolls, TON_MAINNET } from "../../shared/modules/payments/ton.js";
import "../../src/styles.css";
import "../../src/index.css";

const userId = "ton-buyer";
const sender = `0:${"a".repeat(64)}`;
const recipient = `0:${"b".repeat(64)}`;
const wallet = { account: { address: sender, chain: TON_MAINNET } };
const mode = new URLSearchParams(location.search).get("mode");
const fixtureKey = "ton-test-remote";
const initial = { enabled: true, rate: 100, order: null, posts: [], attempts: [], missing: mode === "missing" };
const state = () => JSON.parse(localStorage.getItem(fixtureKey)) ?? initial;
const save = (next) => localStorage.setItem(fixtureKey, JSON.stringify(next));
const reads = [];
let walletResult;
window.tonFixture = {
  state, reads,
  disable() { save({ ...state(), enabled: false }); },
  settle() { const next = state(); next.order.status = "paid"; save(next); },
  finishWallet(mode) { walletResult?.(mode); },
};
const ordersPath = "/rolls/ton/orders";
api.get = async (path) => {
  reads.push(path);
  const next = state();
  if (path === "/rolls") return { balance: next.order?.status === "paid" ? 100 + next.order.rolls : 100,
    transactions: [], features: { tonWallet: false } };
  if (path === "/personal-offers") return { offers: [] };
  if (path === "/rolls/ton") return { enabled: next.enabled, rate: next.rate, recipient, packages: [100, 500, 1000] };
  if (path === ordersPath) return { orders: next.order ? [next.order] : [] };
  if (path.startsWith(`${ordersPath}/by-request/`)) {
    return { order: path.endsWith(next.posts.at(-1)?.idempotencyKey) ? next.order : null };
  }
  if (next.order && path === `${ordersPath}/${next.order.id}`) return { order: next.order };
  throw new Error(`Unexpected fixture read ${path}`);
};
api.post = async (path, request) => {
  const next = state();
  if (path !== ordersPath || !next.enabled) throw new Error(`Unexpected fixture write ${path}`);
  const first = !next.posts.length;
  next.posts.push(request);
  if (first && mode === "quote") {
    next.rate = 200;
    save(next);
    throw Object.assign(new Error("Сумма или получатель изменились. Проверьте обновлённые условия и подтвердите их снова."),
      { status: 409, code: "TON_QUOTE_CHANGED" });
  }
  if (next.missing) {
    next.missing = false;
    save(next);
    throw new Error("Ответ потерян до создания счёта");
  }
  if (!next.order) {
    const id = crypto.randomUUID();
    const nanotons = quoteTonRolls(request.rolls, next.rate);
    const transaction = { from: sender, network: TON_MAINNET, validUntil: Math.floor(Date.now() / 1000) + 600,
      messages: [{ address: toUserFriendlyAddress(recipient), amount: nanotons, payload: "fixture-payload" }] };
    next.order = { id, sender, recipient, chain: TON_MAINNET, nanotons, rolls: request.rolls, status: "pending",
      expiresAt: new Date(Date.now() + 600_000).toISOString(), transaction };
  }
  save(next);
  if (first && mode !== "parallel") throw new Error("Ответ потерян после создания счёта");
  return { order: next.order };
};
const connector = {
  async sendTransaction(transaction) {
    const next = state();
    next.attempts.push(transaction);
    save(next);
    const result = await new Promise((resolve) => { walletResult = resolve; });
    if (result === "reject") throw Object.assign(new Error("User rejected"), { name: "UserRejectsError" });
    if (result === "timeout") throw new Error("Wallet response lost");
    return { boc: "not-a-receipt" };
  },
};
function Fixture() {
  const [connected, setConnected] = useState(mode !== "disconnected");
  const [credits, setCredits] = useState(0);
  return <main className="app-page rollapp-body flex flex-col gap-4">
    <Button onClick={() => setConnected(!connected)}>{connected ? "Отключить тестовый кошелёк" : "Подключить тестовый кошелёк"}</Button>
    <TonTopup userId={userId} wallet={connected ? wallet : null} connector={connected ? connector : null} onPaid={() => setCredits((count) => count + 1)} />
    <p>Обновлений баланса · {credits}</p>
  </main>;
}
createRoot(document.getElementById("root")).render(<BrowserRouter><MobileFormPages>
  {mode === "wallet-status" ? <main className="app-layout app-layout--dark"><RollsWallet user={{ id: userId }} /></main> : <Fixture />}
</MobileFormPages></BrowserRouter>);
