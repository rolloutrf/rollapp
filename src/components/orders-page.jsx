import { useCallback, useEffect, useMemo, useState } from "react";
import { Coins, MapPin, PackageOpen, RotateCcw, ShoppingBag, Truck } from "lucide-react";
import { Link } from "react-router-dom";
import { api } from "@/api";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { APP_STORE_PATH } from "@/lib/app-routing";
import { formatRolls } from "../../shared/rolls.js";

const dateFormatter = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" });

function orderNumber(id) {
  return id.slice(0, 8).toUpperCase();
}

function OrderSkeleton() {
  return <div className="orders-card" aria-hidden="true">
    <Skeleton className="orders-card__image" />
    <div className="flex min-w-0 flex-1 flex-col gap-3"><Skeleton className="h-5 w-32" /><Skeleton className="h-7 w-3/4" /><Skeleton className="h-16 w-full" /><Skeleton className="h-12 w-full" /></div>
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
      <div className="orders-card__price"><Coins aria-hidden="true" /><strong>{formatRolls(order.amount)}</strong>{refunded && <span>возвращены на баланс</span>}</div>
      {point && <section className="orders-card__delivery" aria-label="Пункт выдачи CDEK">
        <MapPin aria-hidden="true" />
        <div className="min-w-0"><strong>CDEK · {point.city}</strong><span>{point.address}</span><small>{point.code}{point.workTime ? ` · ${point.workTime}` : ""}</small></div>
      </section>}
      {!refunded && <Button variant="outline" className="orders-card__return" disabled={busy} onClick={() => onRefund(order)}><RotateCcw aria-hidden="true" />Вернуть товар</Button>}
    </div>
  </article>;
}

export function OrdersPage({ products }) {
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

  const activeCount = orders.filter((order) => order.status !== "refunded").length;
  return <div className="app-page orders-page rollapp-body">
    {error && <Alert variant="destructive"><AlertDescription className="flex flex-wrap items-center justify-between gap-3">{error}<Button variant="outline" onClick={load}>Попробовать снова</Button></AlertDescription></Alert>}
    {loading ? <div className="orders-page__list" aria-label="Загрузка заказов"><OrderSkeleton /><OrderSkeleton /></div>
      : !error && orders.length === 0 ? <Empty className="orders-page__empty border min-h-80">
        <EmptyHeader><EmptyMedia variant="icon"><ShoppingBag aria-hidden="true" /></EmptyMedia><EmptyTitle>Заказов пока нет</EmptyTitle><EmptyDescription>Купленные в магазине коты появятся здесь вместе с данными доставки.</EmptyDescription></EmptyHeader>
        <EmptyContent><Link to={APP_STORE_PATH} className={cn(buttonVariants(), "min-w-44")}><ShoppingBag aria-hidden="true" />В магазин</Link></EmptyContent>
      </Empty>
        : <div className="orders-page__list">{orders.map((order) => <OrderCard key={order.id} order={order} product={productById.get(order.productId)} busy={refunding} onRefund={(next) => { setRefundError(""); setRefundTarget(next); }} />)}</div>}

    <AlertDialog open={Boolean(refundTarget)} onOpenChange={(open) => { if (!open && !refunding) setRefundTarget(null); }}>
      <AlertDialogContent className="rollapp-body">
        <AlertDialogHeader><AlertDialogTitle>Вернуть «{refundTarget?.productTitle}»?</AlertDialogTitle><AlertDialogDescription>{refundTarget ? `${formatRolls(refundTarget.amount)} вернутся на ваш баланс. Заказ будет отмечен как возвращённый.` : ""}</AlertDialogDescription></AlertDialogHeader>
        {refundError && <Alert variant="destructive"><AlertDescription>{refundError}</AlertDescription></Alert>}
        <AlertDialogFooter><AlertDialogCancel disabled={refunding}>Оставить заказ</AlertDialogCancel><AlertDialogAction disabled={refunding} onClick={refund}>{refunding ? <Spinner /> : <RotateCcw aria-hidden="true" />}{refunding ? "Возвращаем…" : "Вернуть товар"}</AlertDialogAction></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>;
}
