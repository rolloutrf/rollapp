import { useState } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { api } from "../../src/modules/runtime/api.js";
import { RollsWallet } from "../../src/modules/payments/rolls-wallet.jsx";
import { MobileFormPages } from "../../src/components/mobile-form-pages.jsx";
import { ProfileSettingsModal, SessionContext, ToastContext, WishlistSectionNavigation } from "../../src/App.jsx?purchase-history-smoke";
import "../../src/styles.css";
import "../../src/index.css";

const user = { id: "purchase-history", username: "purchase-history", name: "Профиль" };
const lists = [
  { id: "general", title: "Мои желания", description: "Всё, чему я буду рад" },
  { id: "books", title: "Книги" },
  { id: "snacks", title: "Перекусы", space: "food" },
  { id: "travel", title: "Поездки", space: "places" },
];
let dashboardReads = 0;
let failedReceipt = false;
const fixtureParams = new URLSearchParams(window.location.search);
const standalone = fixtureParams.has("wallet");
const transferFixtureKey = "purchase-history-transfer-fixture";
const transferRecipient = { id: "transfer-fixture-recipient", name: "Иван", username: "ivan" };
const transferFixture = () => JSON.parse(sessionStorage.getItem(transferFixtureKey) ?? '{"attempts":[],"checks":[],"transfer":null}');
window.readTransferFixture = transferFixture;
const refundCreatedAt = "2026-11-14T12:23:10.824521Z";
const transferCreatedAt = "2026-11-15T23:00:00.842461Z";

function walletFixture(offset = 0) {
  const { transfer } = transferFixture();
  const transactions = [{
    id: "transfer-wallet", direction: "incoming", amount: 28, kind: "transfer",
    person: { id: "fixture-sender", name: "Мария", username: "maria" }, createdAt: "2026-11-15T22:30:00Z",
  }];
  if (transfer) transactions.unshift({
    ...transfer, direction: "outgoing", kind: "transfer", person: transferRecipient,
  });
  transactions.push(
    { id: "refund:invoice", direction: "incoming", amount: 150, kind: "refund", productTitle: "Заказ A", createdAt: refundCreatedAt },
    { id: "purchase:invoice", direction: "outgoing", amount: 80, kind: "purchase", productTitle: "Книги для проекта", createdAt: "2026-11-13T20:50:00Z" },
  );
  const pageSize = 2;
  return {
    balance: 28 - (transfer?.amount ?? 0),
    transactions: transactions.slice(offset, offset + pageSize),
    nextOffset: offset + pageSize < transactions.length ? offset + pageSize : null,
  };
}
window.purchaseImportRequests = [];
window.wishlistRefreshes = 0;
api.get = async (path) => {
  if (path === "/auth/yandex/config") return { enabled: false };
  if (path === "/rolls") return walletFixture();
  if (path.startsWith("/rolls?offset=")) return walletFixture(Number(path.split("=").at(-1)));
  if (path === "/dashboard/purchases") return { purchasePlans: [], wishes: [], subscriptions: [], purchaseCollaborations: [] };
  if (path.startsWith("/dashboard/purchase-month?")) return { totals: [], openTotals: [], limits: [] };
  if (path.startsWith("/rolls/recipients?")) return { people: [transferRecipient] };
  if (path.startsWith("/rolls/transfers/")) {
    const state = transferFixture();
    const key = path.split("/").at(-1);
    state.checks.push(key);
    sessionStorage.setItem(transferFixtureKey, JSON.stringify(state));
    if (window.failTransferStatusOnce) {
      window.failTransferStatusOnce = false;
      throw Object.assign(new Error("Войдите снова"), { status: 401 });
    }
    return { transfer: window.transferStatusOverride ?? (key === state.attempts[0]?.idempotencyKey ? state.transfer : null) };
  }
  if (path === "/rolls/receipts/transfer/transfer-wallet") return { receipt: {
    id: "a12b3456-7890-4abc-8def-1234567890ab", kind: "transfer", status: "recorded", amount: "28", direction: "incoming",
    createdAt: "2026-11-15T22:30:00Z", participant: { name: "Мария", username: "maria" },
  } };
  if (path === "/rolls/receipts/refund/refund%3Ainvoice") {
    if (!failedReceipt) {
      failedReceipt = true;
      throw new Error("Квитанция временно недоступна");
    }
    return { receipt: {
      id: "refund:invoice", kind: "refund", status: "recorded", amount: "150",
      direction: "incoming", createdAt: refundCreatedAt, subject: "Заказ A", orderId: "invoice",
    } };
  }
  if (path === "/personal-offers") return { offers: [] };
  if (path === "/dashboard") {
    dashboardReads += 1;
    if (window.rejectDestinationLoad && dashboardReads === 1) throw new Error("Списки временно недоступны");
    return { lists: window.removedDestination ? lists.filter(({ id }) => id !== "books") : lists };
  }
  throw new Error(`Unexpected fixture read: ${path}`);
};
api.post = async (path, body) => {
  if (path === "/rolls/transfers") {
    const state = transferFixture();
    state.attempts.push(body);
    if (state.attempts.length > 1 || !fixtureParams.has("transferMiss")) state.transfer = {
      id: "transfer-posted", recipientId: body.recipientId, amount: body.amount, note: body.note, createdAt: transferCreatedAt,
    };
    sessionStorage.setItem(transferFixtureKey, JSON.stringify(state));
    if (state.attempts.length === 1) throw new Error("Соединение прервано");
    return { ...walletFixture(), transfer: { id: state.transfer.id, replayed: false } };
  }
  if (path !== "/wishes/import-history") throw new Error(`Unexpected fixture write: ${path}`);
  window.purchaseImportRequests.push(body);
  if (window.rejectPurchaseSave && !window.removedDestination) {
    window.removedDestination = true;
    throw Object.assign(new Error("Список для импорта больше недоступен"), { status: 404 });
  }
  return { created: body.items.length, skipped: 0 };
};

function Fixture() {
  const [open, setOpen] = useState(false);
  return (
    <BrowserRouter>
      <ToastContext.Provider value={() => {}}>
        <SessionContext.Provider value={{ user }}>
          <MobileFormPages>
            <main className="app-layout--dark">
              {standalone ? <RollsWallet user={user} /> : <div className="app-page page-stack">
                <WishlistSectionNavigation user={user} />
                <button type="button" onClick={() => setOpen(true)}>Профиль</button>
                {open && <ProfileSettingsModal user={user} onClose={() => setOpen(false)}
                  onWishlistsImported={() => { window.wishlistRefreshes += 1; }} />}
              </div>}
            </main>
          </MobileFormPages>
        </SessionContext.Provider>
      </ToastContext.Provider>
    </BrowserRouter>
  );
}

createRoot(document.getElementById("root")).render(<Fixture />);
