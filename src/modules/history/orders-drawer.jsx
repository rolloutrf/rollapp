import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useSearchParams } from "react-router-dom";
import { Coins, MapPin, PackageOpen, RotateCcw, ShoppingBag, Truck, X } from "lucide-react";
import { api } from "@/modules/runtime/api.js";
import { DrawerClose, DrawerContent, DrawerSectionHeader } from "@/components/form-surface";
import { PageActionButton } from "@/components/page-action-button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { readPendingMarketplaceAction } from "../checkout/marketplace-action-dialog.jsx";
import { MarketplaceOrder } from "./marketplace-order.jsx";
import { OrderReceipt } from "./roll-receipt.jsx";
import { marketplaceOrderAttentionFilter, marketplaceOrderAttentionLabels } from "../../../shared/modules/history/marketplace-order-attention.js";
import { formatRolls } from "../../../shared/modules/payments/rolls.js";

const dateFormatter = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" });

function orderNumber(id) {
  return id.slice(0, 8).toUpperCase();
}

function OrderSkeleton() {
  return <div className="orders-card" aria-hidden="true">
    <Skeleton className="orders-card__image" />
    <div className="flex min-w-0 flex-col gap-3"><Skeleton className="h-5 w-3/4" /><Skeleton className="h-7 w-full" /><Skeleton className="h-6 w-3/5" /></div>
    <Skeleton className="col-span-full h-16" />
  </div>;
}

function OrderCard({ order, product, busy, onRefund }) {
  const point = order.delivery?.point;
  const refunded = order.status === "refunded";
  const gift = Boolean(order.delivery?.giftCardId);
  return <article className="orders-card" data-order-status={order.status}>
    <div className="orders-card__media">
      {product ? <img src={product.image} alt="" /> : <PackageOpen aria-hidden="true" />}
      <span className="orders-card__number" title={order.id}>№ {orderNumber(order.id)}</span>
    </div>
    <div className="orders-card__content">
      <div className="orders-card__heading">
        <div className="min-w-0">
          <p className="orders-card__date">Оформлен {dateFormatter.format(new Date(order.createdAt))}</p>
          <h2>{order.productTitle}</h2>
        </div>
        <Badge variant={refunded ? "secondary" : "outline"} className="orders-card__status">
          {refunded ? <RotateCcw aria-hidden="true" /> : <Truck aria-hidden="true" />}
          {refunded ? "Возвращён" : "Оформлен"}
        </Badge>
      </div>
      <div className="orders-card__price">
        <strong><Coins aria-hidden="true" />{formatRolls(order.amount)}</strong>
        {refunded && <span>{gift ? "возвращены на подарочную карту" : "возвращены на баланс"}</span>}
      </div>
    </div>
    {point && <section className="orders-card__delivery" aria-label="Пункт выдачи CDEK">
      <MapPin aria-hidden="true" />
      <div className="min-w-0"><strong>CDEK · {point.city}</strong><span>{point.address}</span><small>{point.code}{point.workTime ? ` · ${point.workTime}` : ""}</small></div>
    </section>}
    {!refunded && !order.delivery?.personalOfferId && <Button variant="outline" className="col-span-full justify-self-start" disabled={busy} onClick={() => onRefund(order)}><RotateCcw aria-hidden="true" />Вернуть товар</Button>}
    <OrderReceipt order={order} />
  </article>;
}

export function OrdersDrawerContent({ products, userId }) {
  return <DrawerContent className="orders-drawer rollapp-body app-drawer--form">
    <DrawerSectionHeader title="Заказы" endAction={
      <DrawerClose render={<Button type="button" variant="outline" size="icon" />} aria-label="Закрыть заказы">
        <X aria-hidden="true" />
      </DrawerClose>
    } />
    <OrderList key={userId} products={products} userId={userId} />
  </DrawerContent>;
}

function OrderList({ products, userId }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refundTarget, setRefundTarget] = useState(null);
  const [refunding, setRefunding] = useState(false);
  const [refundError, setRefundError] = useState("");
  const requestVersion = useRef(0);
  const list = useRef(null);
  const location = useLocation();
  const [search, setSearch] = useSearchParams();
  const filter = marketplaceOrderAttentionFilter(search.get("attention"));
  const visibleOrders = filter ? orders.filter((order) => order.settlement && (
    order.settlement.attention === filter || readPendingMarketplaceAction(userId, order.id)?.attention === filter
  )) : orders;
  const attention = new Set(orders.map((order) => order.settlement?.attention).filter(Boolean));
  const filters = Object.entries(marketplaceOrderAttentionLabels)
    .filter(([kind]) => attention.has(kind) || kind === filter);
  function selectFilter(kind) {
    const next = new URLSearchParams(search);
    if (kind) next.set("attention", kind);
    else next.delete("attention");
    setSearch(next, { replace: true, state: location.state });
  }
  const productById = useMemo(() => new Map(products.map((product) => [`cat:${product.id}`, product])), [products]);

  const load = useCallback(async (quiet = false, beforeUpdate) => {
    const version = ++requestVersion.current;
    if (!quiet) setLoading(true);
    setError("");
    try {
      const { orders } = await api.get("/rolls/orders");
      if (version === requestVersion.current) {
        beforeUpdate?.(orders);
        setOrders(orders);
      }
    } catch (failure) {
      if (version === requestVersion.current) setError(failure.message);
    } finally {
      if (version === requestVersion.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    return () => { requestVersion.current += 1; };
  }, [load]);
  const refreshOrders = () => load(true);
  const refreshMarketplaceOrder = (id) => load(true, (updated) => {
    const active = document.activeElement;
    const ownsFocus = active === document.body || active?.closest("[data-marketplace-order]")?.dataset.marketplaceOrder === id;
    if (filter && ownsFocus &&
        !updated.some((order) => order.id === id && order.settlement?.attention === filter)) {
      list.current?.focus({ preventScroll: true });
    }
  });

  async function refund() {
    if (!refundTarget || refunding) return;
    setRefunding(true); setRefundError("");
    try {
      const result = await api.post(`/rolls/orders/${encodeURIComponent(refundTarget.id)}/refund`, {});
      setOrders((current) => current.map((order) => order.id === result.order.id ? result.order : order));
      setRefundTarget(null);
    } catch (failure) { setRefundError(failure.message); }
    finally { setRefunding(false); }
  }

  return <div ref={list} className="orders-drawer__body app-drawer-body flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4" role="region" aria-label="Список заказов" tabIndex={0}>
    {error && <Alert variant="destructive"><AlertDescription className="flex flex-wrap items-center justify-between gap-3">{error}<Button variant="outline" onClick={() => load()}>Попробовать снова</Button></AlertDescription></Alert>}
    {!loading && filters.length > 0 && <div role="group" aria-label="Фильтр заказов" className="flex flex-wrap gap-2">
      <PageActionButton variant={filter ? "outline" : "default"} aria-pressed={!filter} onClick={() => selectFilter(null)}>Все заказы</PageActionButton>
      {filters.map(([kind, label]) => <PageActionButton key={kind} variant={filter === kind ? "default" : "outline"}
        aria-pressed={filter === kind} onClick={() => selectFilter(kind)}>{label}</PageActionButton>)}
    </div>}
    {!loading && orders.some((order) => order.settlement) && <div className="flex justify-start">
      <PageActionButton variant="outline" onClick={refreshOrders}>Обновить заказы</PageActionButton>
    </div>}
    {loading ? <div className="flex flex-col gap-4" role="status" aria-label="Загрузка заказов"><OrderSkeleton /><OrderSkeleton /></div>
      : !error && filter && visibleOrders.length === 0 ? <p role="status">В этой подборке сейчас нет заказов.</p>
      : !error && orders.length === 0 ? <Empty className="border">
        <EmptyHeader><EmptyMedia variant="icon"><ShoppingBag aria-hidden="true" /></EmptyMedia><EmptyTitle>Заказов пока нет</EmptyTitle><EmptyDescription>Здесь будут ваши покупки и продажи за роллы.</EmptyDescription></EmptyHeader>
        <EmptyContent><DrawerClose render={<PageActionButton />}><ShoppingBag aria-hidden="true" />В магазин</DrawerClose></EmptyContent>
      </Empty>
        : visibleOrders.map((order) => order.settlement ? <MarketplaceOrder key={order.id} order={order} userId={userId} filtered={Boolean(filter)} onReload={refreshMarketplaceOrder} fallbackFocus={() => list.current} /> : <OrderCard key={order.id} order={order} product={productById.get(order.productId)} busy={refunding} onRefund={(next) => { setRefundError(""); setRefundTarget(next); }} />)}

    <AlertDialog open={Boolean(refundTarget)} onOpenChange={(open) => { if (!open && !refunding) setRefundTarget(null); }}>
      <AlertDialogContent className="rollapp-body w-[calc(100%-2rem)] overflow-y-auto">
        <AlertDialogHeader><AlertDialogTitle>Вернуть «{refundTarget?.productTitle}»?</AlertDialogTitle><AlertDialogDescription>{refundTarget ? `${formatRolls(refundTarget.amount)} вернутся на ваш баланс. Заказ будет отмечен как возвращённый.` : ""}</AlertDialogDescription></AlertDialogHeader>
        {refundError && <Alert variant="destructive"><AlertDescription>{refundError}</AlertDescription></Alert>}
        <AlertDialogFooter><AlertDialogCancel disabled={refunding}>Оставить заказ</AlertDialogCancel><AlertDialogAction disabled={refunding} onClick={refund}>{refunding ? <Spinner /> : <RotateCcw aria-hidden="true" />}{refunding ? "Возвращаем…" : "Вернуть товар"}</AlertDialogAction></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>;
}
