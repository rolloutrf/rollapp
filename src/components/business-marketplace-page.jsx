import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { BriefcaseBusiness, Coins, ExternalLink, Image as ImageIcon, Package, ShoppingBag, Store } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/api.js";
import { businessMarketplacePath } from "@/lib/app-routing.js";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Spinner } from "@/components/ui/spinner";

function initials(value = "") {
  return value.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

export function SphereBusinessControls({ sphereId }) {
  return (
    <nav className="sphere-business-controls horizontal-action-scroller" aria-label="Бизнес-разделы">
      <Link className={buttonVariants({ variant: "outline", size: "icon", className: "!size-12 shrink-0 !rounded-full" })} to={businessMarketplacePath(sphereId, "catalog")} aria-label="Открыть предложения бизнеса" title="Предложения бизнеса">
        <ShoppingBag aria-hidden="true" />
      </Link>
      <Link className={buttonVariants({ variant: "outline", size: "icon", className: "!size-12 shrink-0 !rounded-full" })} to={businessMarketplacePath(sphereId, "store")} aria-label="Открыть магазин за роллы" title="Магазин за роллы">
        <Store aria-hidden="true" />
      </Link>
    </nav>
  );
}

function MarketplaceItem({ item, kind, busy, onBuy }) {
  const external = item.actionUrl && /^https?:\/\//i.test(item.actionUrl);
  return (
    <Card className="business-marketplace-card overflow-hidden p-0">
      <div className="business-marketplace-card__media">
        {item.imageUrl ? <img src={item.imageUrl} alt="" loading="lazy" /> : <ImageIcon aria-hidden="true" />}
        <Badge variant="secondary">{item.itemType === "product" ? "Товар" : "Услуга"}</Badge>
      </div>
      <div className="business-marketplace-card__content">
        <div className="business-marketplace-card__business">
          <Avatar className="size-9">
            {item.business.avatarUrl && <AvatarImage src={item.business.avatarUrl} alt="" />}
            <AvatarFallback>{initials(item.business.name)}</AvatarFallback>
          </Avatar>
          <span><strong>{item.business.name}</strong><small>@{item.business.username}</small></span>
        </div>
        <div className="business-marketplace-card__copy">
          {item.category && <p className="business-marketplace-card__category">{item.category}</p>}
          <h2>{item.title}</h2>
          {item.description && <p>{item.description}</p>}
        </div>
        <div className="business-marketplace-card__footer">
          {kind === "store" ? (
            <>
              <strong className="business-marketplace-card__price"><Coins aria-hidden="true" />{item.priceRolls.toLocaleString("ru-RU")} роллов</strong>
              <Button disabled={busy} onClick={() => onBuy(item)}>{busy ? <Spinner /> : null}Купить</Button>
            </>
          ) : external ? (
            <a className={buttonVariants({ variant: "outline" })} href={item.actionUrl} target="_blank" rel="noreferrer">Подробнее<ExternalLink aria-hidden="true" /></a>
          ) : <Badge variant="outline">Предложение бизнеса</Badge>}
        </div>
      </div>
    </Card>
  );
}

export function BusinessMarketplacePage({ sphere, kind }) {
  const [state, setState] = useState({ loading: true, error: "", items: [] });
  const [selected, setSelected] = useState(null);
  const [busyId, setBusyId] = useState("");
  const isStore = kind === "store";
  const title = isStore ? `Магазин · ${sphere.label}` : `Предложения · ${sphere.label}`;
  const endpoint = useMemo(() => `/business-marketplace/${sphere.id}/${kind}`, [sphere.id, kind]);

  useEffect(() => {
    let active = true;
    setState({ loading: true, error: "", items: [] });
    api.get(endpoint).then((result) => {
      if (active) setState({ loading: false, error: "", items: result.items || [] });
    }).catch((error) => {
      if (active) setState({ loading: false, error: error.message, items: [] });
    });
    return () => { active = false; };
  }, [endpoint]);

  const buy = async () => {
    if (!selected || busyId) return;
    setBusyId(selected.id);
    try {
      await api.post(`/business-marketplace/${sphere.id}/purchases`, { itemId: selected.id, idempotencyKey: crypto.randomUUID() });
      toast.success("Покупка оформлена", { description: `${selected.title} · ${selected.priceRolls.toLocaleString("ru-RU")} роллов` });
      setSelected(null);
    } catch (error) {
      toast.error(error.message);
    } finally {
      setBusyId("");
    }
  };

  return (
    <div className="app-page business-marketplace-page rollapp-body">
      {state.loading ? <div className="business-marketplace-page__status"><Spinner /><span>Загружаем предложения…</span></div> : null}
      {state.error ? <Alert variant="destructive"><AlertTitle>Не удалось загрузить раздел</AlertTitle><AlertDescription>{state.error}</AlertDescription></Alert> : null}
      {!state.loading && !state.error && !state.items.length ? (
        <Empty className="business-marketplace-page__empty border">
          <EmptyHeader>
            <EmptyMedia variant="icon">{isStore ? <Package aria-hidden="true" /> : <BriefcaseBusiness aria-hidden="true" />}</EmptyMedia>
            <EmptyTitle>{isStore ? "В магазине пока пусто" : "Предложений пока нет"}</EmptyTitle>
            <EmptyDescription>Здесь появятся предложения подтверждённых бизнес-аккаунтов.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : null}
      {state.items.length ? <section className="business-marketplace-grid" aria-label={title}>
        {state.items.map((item) => <MarketplaceItem key={item.id} item={item} kind={kind} busy={busyId === item.id} onBuy={setSelected} />)}
      </section> : null}

      <AlertDialog open={Boolean(selected)} onOpenChange={(open) => { if (!open && !busyId) setSelected(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Купить за роллы?</AlertDialogTitle>
            <AlertDialogDescription>{selected ? `${selected.title} — ${selected.priceRolls.toLocaleString("ru-RU")} роллов. Бизнес получит информацию о заказе.` : ""}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={Boolean(busyId)}>Отмена</AlertDialogCancel>
            <AlertDialogAction disabled={Boolean(busyId)} onClick={(event) => { event.preventDefault(); buy(); }}>{busyId ? <Spinner /> : null}Подтвердить</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
