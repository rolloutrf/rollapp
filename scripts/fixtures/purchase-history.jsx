import { useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { MobileFormPages } from "../../src/components/mobile-form-pages.jsx";
import { WishesProfileControls } from "../../src/App.jsx?purchase-history-smoke";
import { PurchaseHistoryImport } from "../../src/components/purchase-history-import.jsx";
import "../../src/styles.css";
import "../../src/index.css";

function Fixture() {
  const [open, setOpen] = useState(false);
  const trigger = useRef(null);
  return (
    <BrowserRouter>
      <MobileFormPages>
        <main className="app-layout--dark">
          <div className="app-page page-stack">
            <WishesProfileControls selectedSpace="products" selectedList={{ id: "fixture", title: "На потом" }}
              importButtonRef={trigger} onImport={() => setOpen(true)} />
            {open && <PurchaseHistoryImport listId="fixture" listTitle="На потом" space="products"
              onClose={() => setOpen(false)} onSaved={() => { throw new Error("Fixture cannot save"); }} returnFocusRef={trigger} />}
          </div>
        </main>
      </MobileFormPages>
    </BrowserRouter>
  );
}

createRoot(document.getElementById("root")).render(<Fixture />);
