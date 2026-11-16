import { Alert, AlertDescription } from "@/components/ui/alert";
import { PageActionButton } from "@/components/page-action-button";
import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Coins, PackageCheck } from "lucide-react";
import { CatCheckout, restoreCatPurchase } from "@/modules/checkout/cat-checkout.jsx";
import { OrdersDrawerContent } from "@/modules/history/orders-drawer.jsx";
import { Button as ShadcnButton } from "@/components/ui/button";
import { WishlistSnippet } from "@/modules/card/wishlist-snippet.jsx";
import { Drawer, DrawerTrigger } from "@/components/form-surface";
import { Empty, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { APP_ORDERS_PATH, APP_STORE_PATH } from "../shell/app-routing.js";
import { SPACES } from "../categories/wish-spaces.jsx";
import { useToast } from "../shell/toast.jsx";
import { CatalogPageHeader } from "../catalog-marketplace/catalog-page-header.jsx";
import { formatRolls } from "../../../shared/modules/payments/rolls.js";
import { STORE_CATS, STORE_CAT_PRICE } from "../catalog-marketplace/store-cats.jsx";

export function StorePage({ user, selectedSpace, ordersOpen }) {
  const location = useLocation();
  const navigate = useNavigate();
  function changeOrdersOpen(open) {
    if (open) navigate(APP_ORDERS_PATH, { state: { ordersFromStore: true } });
    else if (location.state?.ordersFromStore) navigate(-1);
    else navigate(APP_STORE_PATH, { replace: true });
  }
  const toast = useToast();
  const isProducts = selectedSpace === "products";
  const storageKey = `rollapp:pending-cat-purchase:${user.id}`;
  const [purchase, setPurchase] = useState(() => isProducts ? restoreCatPurchase(storageKey, STORE_CATS) : null);
  const deferredPurchase = isProducts && !purchase ? restoreCatPurchase(storageKey, STORE_CATS) : null;
  const beginPurchase = (cat) => {
    setPurchase(restoreCatPurchase(storageKey, STORE_CATS) || { cat, idempotencyKey: crypto.randomUUID() });
  };
  return <>
    <div className="app-page wish-catalog-page cat-store-page page-stack">
      <Drawer mobileDrawer open={ordersOpen} onOpenChange={changeOrdersOpen}>
        <CatalogPageHeader title={`Магазин · ${SPACES.find((space) => space.id === selectedSpace)?.label}`} action={isProducts && (
          <DrawerTrigger render={<PageActionButton variant="outline" />}>
            <PackageCheck aria-hidden="true" />Заказы
          </DrawerTrigger>
        )} />
        <OrdersDrawerContent products={STORE_CATS} userId={user.id} />
      </Drawer>
      {deferredPurchase && <Alert><AlertDescription className="flex flex-wrap items-center justify-between gap-2">
        <span>Ожидает проверки покупка · {formatRolls(deferredPurchase.expectedPrice)}</span>
        <PageActionButton variant="outline" onClick={() => setPurchase(deferredPurchase)}>Проверить покупку</PageActionButton>
      </AlertDescription></Alert>}
      {isProducts ? <div className="wish-grid catalog-wish-grid">
        {STORE_CATS.map((cat) => (
          <WishlistSnippet
            key={cat.id}
            className="cat-store-card"
            title={`${cat.name} кот${cat.mood ? ` — ${cat.mood}` : ""}`}
            imageUrl={cat.image}
            imageAlt={`${cat.name} кот${cat.mood ? ` — ${cat.mood.toLowerCase()}` : ""}`}
            imageLoading="lazy"
            price={<><Coins aria-hidden="true" />{STORE_CAT_PRICE}</>}
            mediaAction={(
              <ShadcnButton
                type="button"
                variant="outline"
                size="icon"
                className="!size-12 !rounded-full !border-black !bg-black !p-0 !text-white hover:!bg-black/85"
                aria-label={`Купить «${cat.name} кот» за ${STORE_CAT_PRICE}`}
                title="Купить"
                onClick={() => beginPurchase(cat)}
              >
                <Coins className="size-5 text-amber-300" aria-hidden="true" />
              </ShadcnButton>
            )}
          />
        ))}
      </div> : <Empty><EmptyHeader><EmptyTitle>В этом разделе магазина пока пусто</EmptyTitle></EmptyHeader></Empty>}
    </div>
    {!ordersOpen && purchase && <CatCheckout key={purchase.idempotencyKey} purchase={purchase} storageKey={storageKey} onClose={() => setPurchase(null)} onSuccess={(cat, amount) => toast(`${cat.name} кот куплен за ${formatRolls(amount)}`, "success")} />}
  </>;
}
