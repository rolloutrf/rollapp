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
let failedActivityPage = false;
let failedActivitySummary = false;
let failedReceipt = false;
const standalone = new URLSearchParams(window.location.search).has("wallet");
const asOf = "2026-11-15T23:00:00.842461Z";
const periodFor = (days) => ({ days, startsOn: { 7: "2026-11-10", 30: "2026-10-18", 90: "2026-08-19" }[days], endsOn: "2026-11-16", timeZone: "Europe/Moscow", asOf });
const firstActivityCursor = { before: "2026-11-14T12:23:10.824521Z", beforeId: "refund:invoice" };
window.activityRequests = [];

window.purchaseImportRequests = [];
window.wishlistRefreshes = 0;
api.get = async (path) => {
  if (path === "/auth/yandex/config") return { enabled: false };
  if (path === "/rolls") return {
    balance: 28, features: { rollActivity: true },
    transactions: [{ id: "transfer-wallet", direction: "incoming", amount: 28, kind: "transfer",
      person: { id: "fixture-sender", name: "Мария", username: "maria" }, createdAt: "2026-11-15T22:30:00Z" }],
  };
  if (path === "/rolls/receipts/transfer/transfer-wallet") return { receipt: {
    id: "transfer-wallet", kind: "transfer", status: "recorded", amount: "28", direction: "incoming",
    createdAt: "2026-11-15T22:30:00Z", participant: { name: "Мария", username: "maria" },
  } };
  if (path === "/rolls/receipts/refund/refund%3Ainvoice") {
    if (!failedReceipt) {
      failedReceipt = true;
      throw new Error("Квитанция временно недоступна");
    }
    return { receipt: {
      id: "refund:invoice", kind: "refund", status: "recorded", amount: "150",
      direction: "incoming", createdAt: firstActivityCursor.before, subject: "Возврат заказа A", orderId: "invoice",
    } };
  }
  if (path.startsWith("/rolls/activity?")) {
    const q = new URLSearchParams(path.split("?")[1]);
    const days = Number(q.get("days"));
    window.activityRequests.push({ mode: "summary", days });
    if (days === 90 && !failedActivitySummary) {
      failedActivitySummary = true;
      throw new Error("Сводка временно недоступна");
    }
    const totals = days === 7 ? { count: 0, received: "0", debited: "0", change: "0" }
      : days === 90 ? { count: 61, received: "9007199254741003", debited: "9007199254740900", change: "103" }
        : { count: 2, received: "150", debited: "80", change: "70" };
    const summary = { period: periodFor(days), totals, groups: totals.count === 0 ? [] : [{ group: "payments", ...totals }] };
    if (days === 30 && window.delayRollActivity) return new Promise((resolve) => {
      window.finishRollActivity = () => resolve(summary);
    });
    return summary;
  }
  if (path.startsWith("/rolls/activity/entries?")) {
    const q = Object.fromEntries(new URLSearchParams(path.split("?")[1]));
    window.activityRequests.push({ mode: "detail", ...q });
    if (!failedActivityPage) {
      failedActivityPage = true;
      throw new Error("Выписка временно недоступна");
    }
    if (q.beforeId) return {
      transactions: [{ id: "purchase:invoice", direction: "outgoing", amount: 80, kind: "purchase", productTitle: "Книги для проекта", createdAt: "2026-11-13T20:50:00Z" }],
      next: null,
    };
    return {
      transactions: [{ id: "refund:invoice", direction: "incoming", amount: 150, kind: "refund", productTitle: "Возврат заказа A", createdAt: firstActivityCursor.before }],
      next: firstActivityCursor,
    };
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
