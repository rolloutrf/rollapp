import { useRef, useState } from "react";
import { CatCheckout } from "@/modules/checkout/cat-checkout.jsx";
import { STORE_CATS } from "@/modules/catalog-marketplace/store-cats.jsx";
import { Button } from "@/components/ui/button";
import { Page, Scenario, fixtureError, noop } from "../support.jsx";
import { cities, points } from "../samples.js";

export default { id: "rollapp-checkout", title: "РОЛЛАПП/Модули РОЛЛАУТ/09 Чекаут" };

function Checkout({ review, result }) {
  const [open, setOpen] = useState(true);
  const recorded = useRef(null);
  const purchase = { cat: STORE_CATS[0], pickupPoint: review ? points[0] : null, submitted: review };
  const routes = {
    "GET /delivery/cdek/cities": { cities },
    "GET /delivery/cdek/points": (path) => {
      const params = new URL(path, "http://storybook.local").searchParams;
      const selected = points.filter(point => point.cityCode === params.get("cityCode") && point.address.toLowerCase().includes((params.get("q") || "").toLowerCase()));
      return { points: selected, total: selected.length };
    },
    "POST /rolls/purchases": (_, body) => {
      if (result === "insufficient") throw fixtureError("Недостаточно роллов для покупки.", 409, "INSUFFICIENT_ROLLS");
      const point = points.find(item => item.code === body.pickupPointCode);
      const purchase = { id: "storybook-order", productId: body.productId, amount: body.expectedPrice, status: "placed", delivery: { point } };
      recorded.current = { key: body.idempotencyKey, purchase };
      if (result === "lost") throw fixtureError("Ответ об оплате потерян.");
      return { purchase };
    },
    "GET /rolls/purchases/*": (path) => ({ purchase: path.endsWith(recorded.current?.key) ? recorded.current.purchase : null }),
  };
  return <Scenario routes={routes}><Page title="Покупка кота за роллы">
    <Button className="self-center" onClick={() => setOpen(true)}>Открыть покупку</Button>
    {open && <CatCheckout purchase={purchase} storageKey={`rollapp-storybook:cat-checkout:${result}`} onSuccess={noop} onClose={() => setOpen(false)} />}
  </Page></Scenario>;
}
export const Delivery = { name: "Шаг 1 · Пункт выдачи", render: Checkout, args: { review: false, result: "success" } };
export const Review = { name: "Шаг 2 · Подтверждение и успех", render: Checkout, args: { review: true, result: "success" } };
export const Insufficient = { name: "Недостаточно средств", render: Checkout, args: { review: true, result: "insufficient" } };
export const Recovery = { name: "Ответ потерян · проверка покупки", render: Checkout, args: { review: true, result: "lost" } };
