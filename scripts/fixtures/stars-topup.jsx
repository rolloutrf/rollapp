import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { RollsWallet } from "@/modules/payments/rolls-wallet.jsx";
import { api } from "@/modules/runtime/api.js";
import { ROLL_STAR_PACKAGES, ROLL_STAR_TERMS, ROLL_STAR_TERMS_VERSION } from "../../shared/modules/payments/roll-stars.js";
import "../../src/styles.css";
import "../../src/index.css";

const user = { id: "stars-buyer", name: "Покупатель" };
const serverKey = "stars-test-fixture";
const mode = new URLSearchParams(location.search).get("mode");
const state = JSON.parse(sessionStorage.getItem(serverKey)) ?? {
  posts: [], order: null, balance: 200, missing: mode === "missing", enabled: true,
};
const reads = [];
const invoiceOpens = [];
const save = () => sessionStorage.setItem(serverKey, JSON.stringify(state));
const invoiceUrl = "https://t.me/$fixture_invoice";
const ordersPath = "/rolls/stars/orders";
window.Telegram = { WebApp: { initData: "browser-only", openInvoice: (url, callback) => {
  invoiceOpens.push(url);
  callback("paid");
} } };
window.starsFixture = {
  state, reads, invoiceOpens,
  pause() { state.enabled = false; save(); },
  deliver() { state.order.invoiceUrl = invoiceUrl; save(); },
  settle() {
    state.order.status = "paid";
    state.balance += state.order.rolls;
    save();
  },
};

// UI transport only. All real API traffic is explicitly rejected by the runner.
api.get = async (path) => {
  reads.push(path);
  if (path === "/rolls") return { balance: state.balance, transactions: [], features: { starsPurchases: state.enabled } };
  if (path === "/personal-offers") return { offers: [] };
  if (path === "/rolls/stars") return { enabled: state.enabled, linked: true,
    packages: ROLL_STAR_PACKAGES,
    terms: ROLL_STAR_TERMS, termsVersion: ROLL_STAR_TERMS_VERSION, invoiceDelivery: mode === "direct" ? "direct" : "worker" };
  if (path.startsWith(`${ordersPath}/by-request/`)) {
    return { order: path.endsWith(state.posts[0]?.idempotencyKey) ? structuredClone(state.order) : null };
  }
  if (state.order && path === `${ordersPath}/${state.order.id}`) return { order: structuredClone(state.order) };
  throw new Error(`Unexpected UI fixture read ${path}`);
};
api.post = async (path, request) => {
  if (path !== ordersPath || !state.enabled) throw new Error(`Unexpected UI fixture write ${path}`);
  state.posts.push(request);
  const initial = state.posts.length === 1;
  if (state.missing) {
    state.missing = false;
    save();
    throw new Error("Ответ на запрос создания счёта потерян");
  }
  if (!state.order) {
    const pack = ROLL_STAR_PACKAGES.find(({ id }) => id === request.packageId);
    state.order = { id: crypto.randomUUID(), packageId: pack.id, termsVersion: request.termsVersion,
      rolls: pack.rolls, stars: pack.stars, invoiceUrl: mode === "direct" || mode === "worker-queue" ? null : invoiceUrl, status: "pending" };
  } else if (mode === "direct") state.order.invoiceUrl = invoiceUrl;
  save();
  if (initial) throw new Error("Ответ на запрос создания счёта потерян");
  return { order: structuredClone(state.order) };
};

createRoot(document.getElementById("root")).render(<BrowserRouter>
  <div className="app-layout app-layout--dark"><main className="app-main"><RollsWallet user={user} /></main></div>
</BrowserRouter>);
