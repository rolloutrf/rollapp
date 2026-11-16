import { useState } from "react";
import { Drawer } from "@/components/form-surface";
import { Button } from "@/components/ui/button";
import { RollsHistory } from "@/modules/history/rolls-history.jsx";
import { OrdersDrawerContent } from "@/modules/history/orders-drawer.jsx";
import { STORE_CATS } from "@/modules/catalog-marketplace/store-cats.jsx";
import { Page, Scenario, owner, hold, fixtureError, noop } from "../support.jsx";
import { ledger, ledgerReceipts, points } from "../samples.js";

export default { id: "rollapp-history", title: "РОЛЛАПП/Модули РОЛЛАУТ/10 История операций" };

function History({ state }) {
  const rows = state === "ready" ? ledger : state === "empty" ? [] : null;
  return <Scenario routes={ledgerReceipts}><Page title="История операций">
    <RollsHistory transactions={rows} loading={state === "loading"} hasMore={false} onLoadMore={noop} />
  </Page></Scenario>;
}
const orders = [
  { id: "order-new", status: "placed", productId: "cat:" + STORE_CATS[0].id, productTitle: STORE_CATS[0].title, createdAt: "2026-11-15T09:00:00Z", amount: 1000, delivery: { point: points[0] } },
  { id: "order-refund", status: "refunded", productId: "cat:" + STORE_CATS[1].id, productTitle: STORE_CATS[1].title, createdAt: "2026-11-10T15:15:00Z", amount: 1000 },
];
function Orders({ state }) {
  const [open, setOpen] = useState(true);
  const [failed, setFailed] = useState(false);
  return <Scenario routes={{
    "GET /rolls/orders": () => {
      if (state === "loading") return hold();
      if (state === "error" && !failed) { setFailed(true); throw fixtureError("Не удалось загрузить заказы."); }
      return { orders: state === "empty" ? [] : orders };
    },
    "POST /rolls/orders/order-new/refund": { id: "order-new", status: "refunded" },
  }}><Page title="Заказы"><Button className="self-center" onClick={() => setOpen(true)}>Открыть заказы</Button>
    <Drawer open={open} onOpenChange={setOpen}><OrdersDrawerContent products={STORE_CATS} userId={owner.id} /></Drawer>
  </Page></Scenario>;
}
export const Entries = { name: "Лента операций и квитанции", render: History, args: { state: "ready" } };
export const Empty = { ...Entries, name: "Пустой журнал", args: { state: "empty" } };
export const Loading = { ...Entries, name: "Загрузка журнала", args: { state: "loading" } };
export const Failure = { ...Entries, name: "Ошибка журнала", args: { state: "error" } };
export const OrdersDrawer = { name: "Заказы и возврат", render: Orders, args: { state: "ready" } };
export const OrdersEmpty = { ...OrdersDrawer, name: "Заказов пока нет", args: { state: "empty" } };
export const OrdersRetry = { ...OrdersDrawer, name: "Загрузка заказов с повтором", args: { state: "error" } };
export const OrdersLoading = { ...OrdersDrawer, name: "Загрузка заказов", args: { state: "loading" } };
