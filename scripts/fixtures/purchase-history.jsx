import { useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { MobileFormPages } from "../../src/components/mobile-form-pages.jsx";
import { SessionContext, WishesProfileControls } from "../../src/App.jsx?purchase-history-smoke";
import { PurchaseHistoryImport } from "../../src/components/purchase-history-import.jsx";
import "../../src/styles.css";
import "../../src/index.css";

function Fixture() {
  const [open, setOpen] = useState(false);
  const trigger = useRef(null);
  return (
    <BrowserRouter>
      <SessionContext.Provider value={{ user: { id: "purchase-history", username: "purchase-history" } }}>
        <MobileFormPages>
          <main className="app-layout--dark">
            <div className="app-page page-stack">
              <WishesProfileControls selectedSpace="products"
                importButtonRef={trigger} onImport={() => setOpen(true)} />
              {open && <PurchaseHistoryImport listId="fixture" listTitle="На потом" space="products"
                onClose={() => setOpen(false)} onSaved={() => { throw new Error("Fixture cannot save"); }} returnFocusRef={trigger} />}
            </div>
          </main>
        </MobileFormPages>
      </SessionContext.Provider>
    </BrowserRouter>
  );
}

createRoot(document.getElementById("root")).render(<Fixture />);
