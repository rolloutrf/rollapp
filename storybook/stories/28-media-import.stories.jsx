import { useState } from "react";
import { WishModal } from "@/modules/wishlist/wish-editor.jsx";
import { PurchaseHistoryImport } from "@/modules/history/purchase-history-import.jsx";
import { Button } from "@/components/ui/button";
import { Page, Scenario, fixtureError, hold } from "../support.jsx";
import { sampleWish } from "../samples.js";

export default { id: "rollapp-media-import", title: "РОЛЛАПП/Модули/28 Медиа и импорт" };

function Import({ mode, state }) {
  const [open, setOpen] = useState(true);
  const lists = [{ id: "sample-list", title: "Покупки для дома", space: "products" }];
  const routes = {
    "GET /dashboard": { lists, wishes: [] },
    "POST /metadata": state === "loading" ? hold : state === "error" ? () => { throw fixtureError("Источник не отдал описание товара."); } : {
      title: sampleWish.title, description: sampleWish.description, imageUrl: sampleWish.imageUrl, price: sampleWish.price, currency: "RUB",
    },
    "POST /wishes": (_, values) => ({ wish: { ...sampleWish, ...values } }),
    UPLOADIMAGE: { id: "storybook-media", url: sampleWish.imageUrl },
  };
  return <Scenario routes={routes}><Page title="Медиа и импорт">
    <Button className="self-center" onClick={() => setOpen(true)}>Открыть форму</Button>
    {open && (mode === "history" ? <PurchaseHistoryImport onClose={() => setOpen(false)} onSaved={() => setOpen(false)} /> :
      <WishModal space="products" initialDraft={{ url: "https://example.test/product" }} onClose={() => setOpen(false)} onSaved={() => setOpen(false)} />)}
  </Page></Scenario>;
}

export const Metadata = { name: "Распознавание карточки по ссылке", render: Import, args: { mode: "metadata", state: "ready" } };
export const MetadataLoading = { ...Metadata, name: "Распознавание в процессе после нажатия", args: { ...Metadata.args, state: "loading" } };
export const MetadataError = { ...Metadata, name: "Источник недоступен и ручной ввод", args: { ...Metadata.args, state: "error" } };
export const HistoryFile = { ...Metadata, name: "Импорт чека или выписки", args: { ...Metadata.args, mode: "history" } };
