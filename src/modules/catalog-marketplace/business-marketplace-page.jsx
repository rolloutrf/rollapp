import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Coins, Image as ImageIcon, Package, ShoppingBag, Store } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/modules/runtime/api.js";
import { APP_ORDERS_PATH, businessMarketplacePath } from "@/modules/shell/app-routing.js";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { ControlBar } from "@/components/control-bar";
import { WishlistSnippet } from "@/modules/card/wishlist-snippet.jsx";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { PersonalOfferComposer } from "@/components/personal-offers";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { publicProfilePath } from "../../../shared/modules/profile/profile-links.js";
import { MARKETPLACE_REVIEW_DAYS } from "../../../shared/modules/checkout/marketplace-settlements.js";
import { formatRolls } from "../../../shared/modules/payments/rolls.js";
import { Spinner } from "@/components/ui/spinner";

function initials(value = "") {
  return value.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

export function SphereBusinessControls({ sphereId, catalogPath }) {
  const storePath = businessMarketplacePath(sphereId);
  if (!storePath) return null;
  const controlClass = buttonVariants({ variant: "outline", size: "icon" });
  return (
    <ControlBar as="nav" className="sphere-business-controls horizontal-action-scroller" aria-label="Бизнес-разделы">
      {catalogPath && (
        <Link to={catalogPath} data-control-icon className={controlClass} aria-label="Открыть каталог брендов" title="Каталог брендов">
          <ShoppingBag aria-hidden="true" />
        </Link>
      )}
      <Link to={storePath} data-control-icon className={controlClass} aria-label="Открыть магазин за роллы" title="Магазин за роллы">
        <Store aria-hidden="true" />
      </Link>
    </ControlBar>
  );
}

function MarketplaceItem({ item, busy, onBuy, user }) {
  return (
    <WishlistSnippet
      title={item.title}
      imageUrl={item.imageUrl}
      imageLoading="lazy"
      icon={ImageIcon}
      price={<><Coins aria-hidden="true" />{formatRolls(item.priceRolls)}</>}
      mediaBadge={<Badge variant="secondary">{item.itemType === "product" ? "Товар" : "Услуга"}</Badge>}
      details={<>
        <Link to={publicProfilePath(item.business.username)} className="business-marketplace-card__business min-h-12" aria-label={`Открыть бизнес-профиль ${item.business.name}`}>
          <Avatar className="size-9">
            {item.business.avatarUrl && <AvatarImage src={item.business.avatarUrl} alt="" />}
            <AvatarFallback>{initials(item.business.name)}</AvatarFallback>
          </Avatar>
          <span><strong>{item.business.name}</strong><small>@{item.business.username}</small></span>
        </Link>
        {item.category && <span data-typography="label" className="font-semibold uppercase">{item.category}</span>}
        {item.description && <p className="m-0 text-pretty">{item.description}</p>}
        {user ? <Button className="min-h-12 w-full" disabled={busy || user.id === item.business.id} onClick={() => onBuy(item)}>{busy ? <Spinner /> : null}Купить</Button> : (
          <Link className={buttonVariants({ className: "min-h-12 w-full whitespace-normal" })} to={`/login?next=${encodeURIComponent(publicProfilePath(item.business.username))}`}>Войти для покупки</Link>
        )}
        {user?.accountType === "business" && user.id === item.business.id && <PersonalOfferComposer item={item} />}
      </>}
    />
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
  const navigate = useNavigate();
  const storageKey = `rollapp:business-purchase:${user?.id || "guest"}:${businessUsername || sphere.id}:${kind}`;
  const [pending, setPending] = useState(() => restoredPurchase(storageKey));
  const [giftCards, setGiftCards] = useState([]);
  const [giftCardId, setGiftCardId] = useState(() => restoredPurchase(storageKey)?.payload?.giftCardId || "wallet");
  const [giftError, setGiftError] = useState("");
  const [giftLoading, setGiftLoading] = useState(false);
  const [state, setState] = useState({ loading: true, error: "", items: [], protectedCheckout: false });
  const [revision, setRevision] = useState(0);
  const [purchaseError, setPurchaseError] = useState("");
  const [selected, setSelected] = useState(() => restoredPurchase(storageKey)?.item || null);
  const [busyId, setBusyId] = useState("");
  const busyRef = useRef(false);
  const title = businessUsername ? "Предложения бизнеса" : `Магазин · ${sphere.label}`;
  const endpoint = useMemo(() => businessUsername ? `/business-profiles/${encodeURIComponent(businessUsername)}/offers` : `/business-marketplace/${sphere.id}/${kind}`, [sphere?.id, kind, businessUsername]);

  useEffect(() => {
    let active = true;
    setState({ loading: true, error: "", items: [] });
    api.get(endpoint).then((result) => {
      if (active) setState({ loading: false, error: "", items: result.items || [], protectedCheckout: result.protectedCheckout === true });
    }).catch((error) => {
      if (active) setState({ loading: false, error: error.message, items: [] });
    });
    return () => { active = false; };
  }, [endpoint, revision]);

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
    setPurchaseError("");
    const intent = pending || { item: selected, path: `/business-marketplace/${selected.sphere}/purchases`, payload: { itemId: selected.id, expectedPrice: selected.priceRolls, idempotencyKey: crypto.randomUUID(), ...(giftCardId !== "wallet" ? { giftCardId } : {}) } };
    try { sessionStorage.setItem(storageKey, JSON.stringify(intent)); } catch { busyRef.current = false; toast.error("Разрешите хранение данных для безопасной оплаты"); return; }
    setPending(intent);
    setBusyId(selected.id);
    try {
      const { purchase } = await api.post(intent.path, intent.payload);
      if (!purchase?.id) throw new Error("Неполный ответ о покупке");
      sessionStorage.removeItem(storageKey); setPending(null);
      toast.success(purchase?.protected ? "Роллы зарезервированы" : "Покупка оформлена", {
        description: `${selected.title} · ${formatRolls(selected.priceRolls)}`,
        action: { label: "Заказы", onClick: () => navigate(APP_ORDERS_PATH, { state: { ordersFromStore: true } }) },
      });
      setSelected(null);
    } catch (error) {
      const rejected = error.code === "MARKETPLACE_SETTLEMENT_UNAVAILABLE" ||
        (error.status >= 400 && error.status < 500 && ![401, 403, 408, 429].includes(error.status));
      if (["PRICE_CHANGED", "PRICE_CONFIRMATION_REQUIRED"].includes(error.code)) {
        setSelected(null); setRevision((value) => value + 1);
      }
      if (rejected) { sessionStorage.removeItem(storageKey); setPending(null); }
      const message = rejected ? error.message : "Результат оплаты пока неизвестен. Повторная проверка сохранит исходную сумму и источник.";
      setPurchaseError(message);
      if (["PRICE_CHANGED", "PRICE_CONFIRMATION_REQUIRED"].includes(error.code)) toast.error(message);
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
        {state.items.map((item) => <MarketplaceItem key={item.id} item={item} user={user} kind={businessUsername ? item.kind : kind} busy={Boolean(busyId || pending)} onBuy={(item) => { setPurchaseError(""); setGiftCardId("wallet"); setSelected(item); }} />)}
      </section> : null}

      <AlertDialog open={Boolean(selected)} onOpenChange={(open) => { if (!open && !busyId) setSelected(null); }}>
        <AlertDialogContent className="rollapp-body flex w-[calc(100%-2rem)] flex-col overflow-hidden">
          <AlertDialogHeader className="shrink-0">
            <AlertDialogTitle>Купить за роллы?</AlertDialogTitle>
            <AlertDialogDescription className="wrap-anywhere">{selected && <>
              {selected.title} · {formatRolls(selected.priceRolls)}. {state.protectedCheckout
                ? `Роллы уйдут в резерв. После исполнения у вас будет ${MARKETPLACE_REVIEW_DAYS} дней для проверки заказа. Комиссия составляет 0 роллов.`
                : "Бизнес получит информацию о заказе."}
            </>}</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex min-h-0 min-w-0 flex-col gap-3 overflow-y-auto overscroll-contain px-px">
            {giftLoading && <p role="status">Загружаем способы оплаты…</p>}
            {giftError && <p role="alert">{giftError}</p>}
            <Select value={giftCardId} onValueChange={setGiftCardId} disabled={Boolean(busyId || pending)}>
              <SelectTrigger className="w-full" aria-label="Оплатить покупку"><SelectValue>{() => giftCardId === "wallet" ? "Мой баланс роллов" : `Подарочная карта · ${formatRolls(giftCards.find((card) => card.id === giftCardId)?.balance || 0)}`}</SelectValue></SelectTrigger>
              <SelectContent alignItemWithTrigger={false}><SelectItem value="wallet">Мой баланс роллов</SelectItem>{giftCards.map((card) => <SelectItem key={card.id} value={card.id} disabled={card.balance < (selected?.priceRolls || 0)}>Карта · {formatRolls(card.balance)}</SelectItem>)}</SelectContent>
            </Select>
            {pending && <p role="status">Результат оплаты нужно проверить. Сумма и способ оплаты сохранены.</p>}
          </div>
          {purchaseError && <Alert className="shrink-0" variant="destructive"><AlertDescription>{purchaseError}</AlertDescription></Alert>}
          <AlertDialogFooter className="shrink-0 flex-row flex-wrap justify-end">
            <AlertDialogCancel className="rounded-full" disabled={Boolean(busyId)}>{pending ? "Позже" : "Отмена"}</AlertDialogCancel>
            <AlertDialogAction className="rounded-full" disabled={Boolean(busyId)} onClick={(event) => { event.preventDefault(); buy(); }}>{busyId ? <Spinner /> : null}{pending ? "Проверить оплату" : "Подтвердить"}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
