import { useState } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { api } from "../../src/api.js";
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
window.purchaseImportRequests = [];
window.wishlistRefreshes = 0;
api.get = async (path) => {
  if (path === "/auth/yandex/config") return { enabled: false };
  if (path === "/rolls") return { balance: 0, transactions: [] };
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
              <div className="app-page page-stack">
                <WishlistSectionNavigation user={user} />
                <button type="button" onClick={() => setOpen(true)}>Профиль</button>
                {open && <ProfileSettingsModal user={user} onClose={() => setOpen(false)}
                  onWishlistsImported={() => { window.wishlistRefreshes += 1; }} />}
              </div>
            </main>
          </MobileFormPages>
        </SessionContext.Provider>
      </ToastContext.Provider>
    </BrowserRouter>
  );
}

createRoot(document.getElementById("root")).render(<Fixture />);
