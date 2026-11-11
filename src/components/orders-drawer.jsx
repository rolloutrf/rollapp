import { useCallback, useEffect, useMemo, useState } from "react";
import { Coins, MapPin, PackageOpen, RotateCcw, ShoppingBag, Truck, X } from "lucide-react";
import { api } from "@/api";
import { DrawerClose, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/form-surface";
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
import { formatRolls } from "../../shared/rolls.js";

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
        {refunded && <span>возвращены на баланс</span>}
      </div>
    </div>
    {point && <section className="orders-card__delivery" aria-label="Пункт выдачи CDEK">
      <MapPin aria-hidden="true" />
      <div className="min-w-0"><strong>CDEK · {point.city}</strong><span>{point.address}</span><small>{point.code}{point.workTime ? ` · ${point.workTime}` : ""}</small></div>
    </section>}
    {!refunded && <Button variant="outline" className="col-span-full justify-self-start" disabled={busy} onClick={() => onRefund(order)}><RotateCcw aria-hidden="true" />Вернуть товар</Button>}
  </article>;
}

export function OrdersDrawerContent({ products }) {
  return <DrawerContent className="orders-drawer rollapp-body app-drawer--form">
    <DrawerHeader className="flex-row items-center justify-between gap-2 border-b p-4">
      <DrawerTitle className="text-2xl font-semibold">Заказы</DrawerTitle>
      <DrawerClose render={<Button type="button" variant="outline" size="icon" />} aria-label="Закрыть заказы">
        <X aria-hidden="true" />
      </DrawerClose>
    </DrawerHeader>
    <OrderList products={products} />
  </DrawerContent>;
}

function OrderList({ products }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refundTarget, setRefundTarget] = useState(null);
  const [refunding, setRefunding] = useState(false);
  const [refundError, setRefundError] = useState("");
  const productById = useMemo(() => new Map(products.map((product) => [`cat:${product.id}`, product])), [products]);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { setOrders((await api.get("/rolls/orders")).orders); }
    catch (failure) { setError(failure.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

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

  return <div className="orders-drawer__body app-drawer-body flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4" role="region" aria-label="Список заказов" tabIndex={0}>
    {error && <Alert variant="destructive"><AlertDescription className="flex flex-wrap items-center justify-between gap-3">{error}<Button variant="outline" onClick={load}>Попробовать снова</Button></AlertDescription></Alert>}
    {loading ? <div className="flex flex-col gap-4" role="status" aria-label="Загрузка заказов"><OrderSkeleton /><OrderSkeleton /></div>
      : !error && orders.length === 0 ? <Empty className="border">
        <EmptyHeader><EmptyMedia variant="icon"><ShoppingBag aria-hidden="true" /></EmptyMedia><EmptyTitle>Заказов пока нет</EmptyTitle><EmptyDescription>Купленные в магазине коты появятся здесь вместе с данными доставки.</EmptyDescription></EmptyHeader>
        <EmptyContent><DrawerClose render={<PageActionButton />}><ShoppingBag aria-hidden="true" />В магазин</DrawerClose></EmptyContent>
      </Empty>
        : orders.map((order) => <OrderCard key={order.id} order={order} product={productById.get(order.productId)} busy={refunding} onRefund={(next) => { setRefundError(""); setRefundTarget(next); }} />)}

    <AlertDialog open={Boolean(refundTarget)} onOpenChange={(open) => { if (!open && !refunding) setRefundTarget(null); }}>
      <AlertDialogContent className="rollapp-body w-[calc(100%-2rem)] overflow-y-auto">
        <AlertDialogHeader><AlertDialogTitle>Вернуть «{refundTarget?.productTitle}»?</AlertDialogTitle><AlertDialogDescription>{refundTarget ? `${formatRolls(refundTarget.amount)} вернутся на ваш баланс. Заказ будет отмечен как возвращённый.` : ""}</AlertDialogDescription></AlertDialogHeader>
        {refundError && <Alert variant="destructive"><AlertDescription>{refundError}</AlertDescription></Alert>}
        <AlertDialogFooter><AlertDialogCancel disabled={refunding}>Оставить заказ</AlertDialogCancel><AlertDialogAction disabled={refunding} onClick={refund}>{refunding ? <Spinner /> : <RotateCcw aria-hidden="true" />}{refunding ? "Возвращаем…" : "Вернуть товар"}</AlertDialogAction></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>;
}
