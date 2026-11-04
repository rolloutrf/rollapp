import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Coins, Image as ImageIcon, Package, Store } from "lucide-react";
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
import { PersonalOfferComposer } from "@/components/personal-offers";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { publicProfilePath } from "../../shared/profile-links.js";
import { formatRolls } from "../../shared/rolls.js";
import { Spinner } from "@/components/ui/spinner";

function initials(value = "") {
  return value.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

export function SphereBusinessControls({ sphereId }) {
  const storePath = businessMarketplacePath(sphereId);
  if (!storePath) return null;
  return (
    <nav className="sphere-business-controls horizontal-action-scroller" aria-label="Бизнес-разделы">
      <Link className={buttonVariants({ variant: "outline", size: "icon", className: "!size-12 shrink-0 !rounded-full" })} to={storePath} aria-label="Открыть магазин за роллы" title="Магазин за роллы">
        <Store aria-hidden="true" />
      </Link>
    </nav>
  );
}

function MarketplaceItem({ item, busy, onBuy, user }) {
  return (
    <Card className="business-marketplace-card overflow-hidden p-0">
      <div className="business-marketplace-card__media">
        {item.imageUrl ? <img src={item.imageUrl} alt="" loading="lazy" /> : <ImageIcon aria-hidden="true" />}
        <Badge variant="secondary">{item.itemType === "product" ? "Товар" : "Услуга"}</Badge>
      </div>
      <div className="business-marketplace-card__content">
        <Link to={publicProfilePath(item.business.username)} className="business-marketplace-card__business min-h-12" aria-label={`Открыть бизнес-профиль ${item.business.name}`}>
          <Avatar className="size-9">
            {item.business.avatarUrl && <AvatarImage src={item.business.avatarUrl} alt="" />}
            <AvatarFallback>{initials(item.business.name)}</AvatarFallback>
          </Avatar>
          <span><strong>{item.business.name}</strong><small>@{item.business.username}</small></span>
        </Link>
        <div className="business-marketplace-card__copy">
          {item.category && <p className="business-marketplace-card__category">{item.category}</p>}
          <h2>{item.title}</h2>
          {item.description && <p>{item.description}</p>}
        </div>
        <div className="business-marketplace-card__footer">
          <strong className="business-marketplace-card__price"><Coins aria-hidden="true" />{item.priceRolls.toLocaleString("ru-RU")} роллов</strong>
          {user ? <Button disabled={busy} onClick={() => onBuy(item)}>{busy ? <Spinner /> : null}Купить</Button> : <Link className={buttonVariants({})} to={`/login?next=${encodeURIComponent(publicProfilePath(item.business.username))}`}>Войти для покупки</Link>}
        </div>
        {user?.accountType === "business" && user.id === item.business.id && <PersonalOfferComposer item={item} />}
      </div>
    </Card>
  );
}

function restoredPurchase(storageKey) {
  try {
    const value = JSON.parse(sessionStorage.getItem(storageKey));
    return value && typeof value.item?.id === "string" && value.payload?.itemId === value.item.id
      && typeof value.payload?.idempotencyKey === "string"
      && /^\/business-marketplace\/(identity|career|education|health|contacts)\/purchases$/.test(value.path) ? value : null;
  } catch { return null; }
}

export function BusinessMarketplacePage({ sphere, kind = "store", businessUsername, user, hideEmpty = false }) {
  const storageKey = `rollapp:business-purchase:${user?.id || "guest"}:${businessUsername || sphere.id}:${kind}`;
  const [pending, setPending] = useState(() => restoredPurchase(storageKey));
  const [giftCards, setGiftCards] = useState([]);
  const [giftCardId, setGiftCardId] = useState(() => restoredPurchase(storageKey)?.payload?.giftCardId || "wallet");
  const [giftError, setGiftError] = useState("");
  const [giftLoading, setGiftLoading] = useState(false);
  const [state, setState] = useState({ loading: true, error: "", items: [] });
  const [selected, setSelected] = useState(() => restoredPurchase(storageKey)?.item || null);
  const [busyId, setBusyId] = useState("");
  const busyRef = useRef(false);
  const title = businessUsername ? "Предложения бизнеса" : `Магазин · ${sphere.label}`;
  const endpoint = useMemo(() => businessUsername ? `/business-profiles/${encodeURIComponent(businessUsername)}/offers` : `/business-marketplace/${sphere.id}/${kind}`, [sphere?.id, kind, businessUsername]);

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

  useEffect(() => {
    if (!selected) return;
    let active = true;
    setGiftCards([]); setGiftError(""); setGiftLoading(true);
    api.get("/rolls/gift-cards").then((result) => {
      if (active) setGiftCards(result.cards.filter((card) => card.business.id === selected.business.id && card.balance > 0));
    }).catch((error) => { if (active) setGiftError(error.status === 401 ? "Войдите в аккаунт, чтобы оплатить покупку." : error.message); })
      .finally(() => { if (active) setGiftLoading(false); });
    return () => { active = false; };
  }, [selected?.id]);

  const buy = async () => {
    if (!selected || busyRef.current) return;
    busyRef.current = true;
    const intent = pending || { item: selected, path: `/business-marketplace/${selected.sphere}/purchases`, payload: { itemId: selected.id, idempotencyKey: crypto.randomUUID(), ...(giftCardId !== "wallet" ? { giftCardId } : {}) } };
    try { sessionStorage.setItem(storageKey, JSON.stringify(intent)); } catch { busyRef.current = false; toast.error("Разрешите хранение данных для безопасной оплаты"); return; }
    setPending(intent);
    setBusyId(selected.id);
    try {
      await api.post(intent.path, intent.payload);
      sessionStorage.removeItem(storageKey); setPending(null);
      toast.success("Покупка оформлена", { description: `${selected.title} · ${selected.priceRolls.toLocaleString("ru-RU")} роллов` });
      setSelected(null);
    } catch (error) {
      const rejected = error.status >= 400 && error.status < 500 && ![408, 429].includes(error.status);
      if (rejected) { sessionStorage.removeItem(storageKey); setPending(null); }
      toast.error(rejected ? error.message : "Ответ не получен. Повторная проверка не спишет роллы ещё раз.");
    } finally {
      busyRef.current = false;
      setBusyId("");
    }
  };

  if (hideEmpty && !state.loading && !state.error && !state.items.length && !pending && !selected) return null;

  return (
    <div className={`${businessUsername ? "" : "app-page"} business-marketplace-page rollapp-body`}>
      {pending && !selected && <Alert><AlertDescription className="flex flex-col gap-3">Остался платёж с неизвестным результатом. Повторная проверка не спишет роллы ещё раз.<Button variant="outline" onClick={() => setSelected(pending.item)}>Проверить оплату</Button></AlertDescription></Alert>}
      {state.loading ? <div className="business-marketplace-page__status"><Spinner /><span>Загружаем предложения…</span></div> : null}
      {state.error ? <Alert variant="destructive"><AlertTitle>Не удалось загрузить раздел</AlertTitle><AlertDescription>{state.error}</AlertDescription></Alert> : null}
      {!hideEmpty && !state.loading && !state.error && !state.items.length ? (
        <Empty className="business-marketplace-page__empty border">
          <EmptyHeader>
            <EmptyMedia variant="icon"><Package aria-hidden="true" /></EmptyMedia>
            <EmptyTitle>В магазине пока пусто</EmptyTitle>
            <EmptyDescription>Здесь появятся предложения подтверждённых бизнес-аккаунтов.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : null}
      {state.items.length ? <section className="business-marketplace-grid" aria-label={title}>
        {state.items.map((item) => <MarketplaceItem key={item.id} item={item} user={user} kind={businessUsername ? item.kind : kind} busy={Boolean(busyId || pending)} onBuy={(item) => { setGiftCardId("wallet"); setSelected(item); }} />)}
      </section> : null}

      <AlertDialog open={Boolean(selected)} onOpenChange={(open) => { if (!open && !busyId) setSelected(null); }}>
        <AlertDialogContent className="rollapp-body">
          <AlertDialogHeader>
            <AlertDialogTitle>Купить за роллы?</AlertDialogTitle>
            <AlertDialogDescription>{selected ? `${selected.title} — ${selected.priceRolls.toLocaleString("ru-RU")} роллов. Бизнес получит информацию о заказе.` : ""}</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex min-w-0 flex-col gap-3">
            {giftLoading && <p role="status">Загружаем способы оплаты…</p>}
            {giftError && <p role="alert">{giftError}</p>}
            <Select value={giftCardId} onValueChange={setGiftCardId} disabled={Boolean(busyId || pending)}>
              <SelectTrigger className="w-full" aria-label="Оплатить покупку"><SelectValue>{() => giftCardId === "wallet" ? "Мой баланс роллов" : `Подарочная карта · ${formatRolls(giftCards.find((card) => card.id === giftCardId)?.balance || 0)}`}</SelectValue></SelectTrigger>
              <SelectContent alignItemWithTrigger={false}><SelectItem value="wallet">Мой баланс роллов</SelectItem>{giftCards.map((card) => <SelectItem key={card.id} value={card.id} disabled={card.balance < (selected?.priceRolls || 0)}>Карта · {formatRolls(card.balance)}</SelectItem>)}</SelectContent>
            </Select>
            {pending && <p role="status">Результат оплаты нужно проверить. Сумма и способ оплаты сохранены.</p>}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={Boolean(busyId)}>{pending ? "Позже" : "Отмена"}</AlertDialogCancel>
            <AlertDialogAction disabled={Boolean(busyId)} onClick={(event) => { event.preventDefault(); buy(); }}>{busyId ? <Spinner /> : null}{pending ? "Проверить оплату" : "Подтвердить"}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
