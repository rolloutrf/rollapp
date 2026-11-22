import { EmptyState } from "@/modules/shell/page-feedback.jsx";
import { FileText, Package, Trash2 } from "lucide-react";
import { AddFab } from "@/components/add-fab";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/modules/runtime/api.js";
import { sphereLink } from "@/applications/location.js";
import { APP_WISH_OFFERS_PATH } from "@/modules/shell/app-routing.js";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PageActionButton } from "@/components/page-action-button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { fulfillmentLabel, PersonalOfferOperationDialog, readPendingPersonalOffers } from "@/modules/checkout/personal-offer-operation.jsx";
import { ControlBar } from "@/components/control-bar";
import { BUSINESS_CATEGORIES, canBusinessAccessSection } from "../../shared/modules/catalog-marketplace/business-accounts.js";
import { SPHERE_SECTIONS } from "../../shared/modules/access/sphere-sharing.js";
import { formatRolls } from "../../shared/modules/payments/rolls.js";
import { publicSpacePath } from "../../shared/modules/profile/profile-links.js";
import { formatEventDate } from "@/modules/wishlist/wish-form-data.jsx";

export const durations = [["1", "1 час"], ["24", "24 часа"], ["72", "3 дня"], ["168", "7 дней"], ["720", "30 дней"]];
const itemSpheres = BUSINESS_CATEGORIES.filter(({ sphere }) => sphere !== "wishlist").map(({ sphere, sphereLabel }) => [sphere, sphereLabel]);
const offerExpiryFormat = new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium", timeStyle: "short" });

export function RecipientPurchaseNeeds({ recipientId, client = api }) {
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState(null);
  useEffect(() => {
    let active = true;
    client.get(`/personal-offers/recipients/${encodeURIComponent(recipientId)}/needs`).then(({ needs }) => {
      if (active) setResult({ recipientId, revision, needs });
    }).catch(error => {
      if (active) setResult({ recipientId, revision, error });
    });
    return () => { active = false; };
  }, [recipientId, client, revision]);
  if (result?.recipientId !== recipientId || result.revision !== revision) return <p role="status">Загружаем потребности…</p>;
  if (result.error) return <Alert variant="destructive">
    <AlertDescription>{result.error.message}</AlertDescription>
    <Button type="button" variant="outline" onClick={() => setRevision(value => value + 1)}>Повторить</Button>
  </Alert>;
  if (!result.needs.length) return <p className="text-muted-foreground">Активных потребностей пока нет</p>;
  return <ul className="grid min-w-0 gap-2" aria-label="Активные потребности покупателя">
    {result.needs.map(need => <li key={need.id} className="grid gap-1 rounded-xl border p-3 wrap-anywhere">
      <strong>{need.title}</strong>
      {need.criteria && <span className="whitespace-pre-wrap">{need.criteria}</span>}
      {need.neededBy && <span className="text-muted-foreground">Получить к <time dateTime={need.neededBy}>{formatEventDate(need.neededBy)}</time></span>}
    </li>)}
  </ul>;
}

export function PersonalOfferComposer({ item, client = api }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [people, setPeople] = useState([]);
  const [recipient, setRecipient] = useState(null);
  const [price, setPrice] = useState(String(item.priceRolls || ""));
  const [hours, setHours] = useState("24");
  const [fulfillmentTerms, setFulfillmentTerms] = useState("");
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const pending = useRef(null);
  const lock = useRef(false);
  useEffect(() => {
    if (!open || recipient) return;
    let active = true;
    const timer = setTimeout(() => {
      client.get(`/personal-offers/recipients?search=${encodeURIComponent(search)}`).then(result => {
        if (active) { setPeople(result.people || []); setError(""); }
      }).catch(e => { if (active) setError(e.message); });
    }, 250);
    return () => { active = false; clearTimeout(timer); };
  }, [open, search, recipient, client]);
  const submit = async event => {
    event.preventDefault();
    if (!recipient || lock.current) return;
    lock.current = true; setBusy(true); setError("");
    const terms = { itemId: item.id, recipientId: recipient.id, priceRolls: Number(price), durationHours: Number(hours), fulfillmentTerms: fulfillmentTerms.trim() };
    const signature = JSON.stringify(terms);
    if (pending.current?.signature !== signature) pending.current = { signature, payload: { ...terms, idempotencyKey: crypto.randomUUID() } };
    try { await client.post("/personal-offers", pending.current.payload); setSent(true); }
    catch (e) { setError(e.message); }
    finally { lock.current = false; setBusy(false); }
  };
  if (!open) return <Button variant="outline" onClick={() => setOpen(true)}>Рекомендовать с оффером</Button>;
  if (sent) return <div className="flex flex-col gap-4"><p role="status">Предложение отправлено. Получатель увидит товар или услугу в разделе «Предложения».</p><ControlBar><Button variant="outline" onClick={() => { setSent(false); setRecipient(null); pending.current = null; }}>Новый оффер</Button></ControlBar></div>;
  return <form className="flex min-w-0 flex-col gap-4" onSubmit={submit} aria-label={`Оффер: ${item.title}`}>
    <Field><FieldLabel htmlFor={`offer-person-${item.id}`}>Получатель</FieldLabel>
      {recipient ? <div className="flex min-w-0 flex-wrap items-center gap-2"><span className="min-w-0 wrap-anywhere">{recipient.name} · @{recipient.username}</span><Button type="button" variant="outline" disabled={busy} onClick={() => setRecipient(null)}>Изменить</Button></div> : <>
        <Input id={`offer-person-${item.id}`} placeholder="Имя или username" value={search} onChange={e => { setSearch(e.target.value); setPeople([]); }} />
        <div className="flex max-h-60 min-w-0 flex-col gap-2 overflow-y-auto" role="group" aria-label="Пользователи">{people.map(person => <Button type="button" className="h-auto min-w-0 whitespace-normal wrap-anywhere" variant="outline" key={person.id} onClick={() => setRecipient(person)}>{person.name} · @{person.username}</Button>)}</div>
        {!people.length && !error && <p className="text-muted-foreground">Здесь появятся покупатели, которые разрешили предложения вашему бренду.</p>}
      </>}
    </Field>
    {recipient && <RecipientPurchaseNeeds recipientId={recipient.id} client={client} />}
    <Field><FieldLabel htmlFor={`offer-price-${item.id}`}>Цена в роллах</FieldLabel><Input id={`offer-price-${item.id}`} type="number" inputMode="numeric" min="1" max="1000000" step="1" required disabled={busy} value={price} onChange={e => setPrice(e.target.value)} /></Field>
    <Field><FieldLabel htmlFor={`offer-fulfillment-${item.id}`}>{fulfillmentLabel(item.itemType)}</FieldLabel><Input id={`offer-fulfillment-${item.id}`} value={fulfillmentTerms} maxLength={240} required disabled={busy} onChange={e => setFulfillmentTerms(e.target.value)} placeholder="Например, в течение 3 дней после оплаты" /></Field>
    <Field><FieldLabel htmlFor={`offer-hours-${item.id}`}>Срок действия цены</FieldLabel><Select value={hours} onValueChange={setHours} disabled={busy}><SelectTrigger id={`offer-hours-${item.id}`} className="w-full"><SelectValue>{() => durations.find(([value]) => value === hours)?.[1]}</SelectValue></SelectTrigger><SelectContent>{durations.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></Field>
    {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
    <ControlBar className="flex flex-wrap gap-2"><Button type="button" variant="outline" disabled={busy} onClick={() => setOpen(false)}>Отмена</Button><Button type="submit" disabled={!recipient || busy || !fulfillmentTerms.trim()}>{busy ? "Отправляем…" : "Отправить предложение"}</Button></ControlBar>
  </form>;
}

export function BusinessOfferItemForm({ onCreated, onCancel, client = api, spheres = itemSpheres }) {
  const [basePrice, setBasePrice] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [sphere, setSphere] = useState(spheres.some(([id])=>id==="education")?"education":spheres[0]?.[0]||"education");
  const [itemType, setItemType] = useState("product");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(null);
  const lock = useRef(false);
  const submit = async event => {
    event.preventDefault();
    if (lock.current) return;
    lock.current = true; setBusy(true); setError("");
    const terms = { title, description, sphere, itemType, priceRolls: Number(basePrice) };
    const signature = JSON.stringify(terms);
    if (pending.current?.signature !== signature) pending.current = { signature, payload: { ...terms, idempotencyKey: crypto.randomUUID() } };
    try { const result = await client.post("/personal-offers/items", pending.current.payload); onCreated(result.item.id); }
    catch (e) { setError(e.message); }
    finally { lock.current = false; setBusy(false); }
  };
  return <form className="flex min-w-0 flex-col gap-4" aria-label="Новый товар бизнеса" onSubmit={submit}>
    <Field><FieldLabel htmlFor="offer-item-title">Название</FieldLabel><Input id="offer-item-title" value={title} onChange={e => setTitle(e.target.value)} maxLength={160} required disabled={busy} /></Field>
    <Field><FieldLabel htmlFor="offer-item-base-price">Цена магазина в роллах</FieldLabel><Input id="offer-item-base-price" type="number" min="1" max="1000000" step="1" required value={basePrice} disabled={busy} onChange={e=>setBasePrice(e.target.value)} /></Field>
    <Field><FieldLabel htmlFor="offer-item-description">Описание</FieldLabel><Textarea id="offer-item-description" value={description} onChange={e => setDescription(e.target.value)} maxLength={1200} disabled={busy} /></Field>
    <Field><FieldLabel htmlFor="offer-item-type">Тип</FieldLabel><Select value={itemType} onValueChange={setItemType} disabled={busy}><SelectTrigger id="offer-item-type" className="w-full"><SelectValue>{() => itemType === "product" ? "Товар" : "Услуга"}</SelectValue></SelectTrigger><SelectContent><SelectItem value="product">Товар</SelectItem><SelectItem value="service">Услуга</SelectItem></SelectContent></Select></Field>
    <Field><FieldLabel htmlFor="offer-item-sphere">Сфера</FieldLabel><Select value={sphere} onValueChange={setSphere} disabled={busy}><SelectTrigger id="offer-item-sphere" className="w-full"><SelectValue>{() => itemSpheres.find(([value]) => value === sphere)?.[1]}</SelectValue></SelectTrigger><SelectContent>{spheres.map(([value,label]) => <SelectItem value={value} key={value}>{label}</SelectItem>)}</SelectContent></Select></Field>
    <p>Товар появится в магазине бизнеса. Персональную цену и срок вы укажете при создании оффера.</p>
    {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
    <ControlBar className="flex flex-wrap gap-2"><Button type="button" variant="outline" disabled={busy} onClick={onCancel}>Отмена</Button><Button type="submit" disabled={busy}>{busy ? "Сохраняем…" : "Сохранить товар"}</Button></ControlBar>
  </form>;
}

export function BusinessPersonalOffers({ client = api, user }) {
  const [items, setItems] = useState([]);
  const [selected, setSelected] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const [creatingItem, setCreatingItem] = useState(false);
  useEffect(() => {
    let active = true;
    client.get("/personal-offers/items").then(result => { if (active) { setItems(result.items); setError(""); } }).catch(e => { if (active) setError(e.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [revision, client]);
  const item = items.find(value => value.id === selected);
  const spheres = itemSpheres.filter(([id])=>!user||canBusinessAccessSection(user,id,SPHERE_SECTIONS[id]?.[0]));
  if(!spheres.length)return null;
  const empty = !loading && !error && !items.length && !creatingItem;
  return <section className="page-stack min-w-0" aria-labelledby="business-offers-title">
    {empty ? <h2 id="business-offers-title" className="sr-only">Рекомендовать товар</h2> : <header className="typeset typeset-rollapp"><h2 id="business-offers-title">Рекомендовать товар</h2>
      <p>Выберите товар, получателя, персональную цену и срок исполнения. Отправленные позиции доступны в <Link to={sphereLink(APP_WISH_OFFERS_PATH, window.location)}>разделе «Предложения»</Link>.</p></header>}
    {loading && <p role="status">Загружаем товары…</p>}
    {error && <Alert variant="destructive"><AlertDescription>{error}<Button variant="outline" onClick={() => setRevision(value => value + 1)}>Повторить</Button></AlertDescription></Alert>}
    {empty && <EmptyState compact icon={Package} title="У вашего бизнеса пока нет активных товаров или услуг." text="Добавьте товар, чтобы отправить персональное предложение." />}
    {!creatingItem && <AddFab actions={[{ label: "Добавить товар", disabled: loading || Boolean(error), onSelect: () => setCreatingItem(true) }]} />}
    {creatingItem && <BusinessOfferItemForm spheres={spheres} client={client} onCancel={() => setCreatingItem(false)} onCreated={id => { setSelected(id); setCreatingItem(false); setRevision(value => value + 1); }} />}
    {items.length > 0 && <Field><FieldLabel htmlFor="business-offer-item">Товар или услуга</FieldLabel><Select value={selected} onValueChange={setSelected}><SelectTrigger id="business-offer-item" className="w-full"><SelectValue placeholder="Выберите товар">{() => item?.title || "Выберите товар"}</SelectValue></SelectTrigger><SelectContent>{items.map(value => <SelectItem key={value.id} value={value.id}>{value.title}</SelectItem>)}</SelectContent></Select></Field>}
    {item && <PersonalOfferComposer key={item.id} item={item} client={client} />}
  </section>;
}

function OfferCard({ title, attribution, price, itemType, fulfillmentTerms, imageUrl, children }) {
  return <article className="relative flex min-w-0 flex-col gap-3 rounded-2xl border p-4">
    <div className="flex min-w-0 items-start gap-4">
      {imageUrl && <img src={imageUrl} alt="" loading="lazy" className="size-20 shrink-0 rounded-xl object-cover" />}
      <div className="grid min-w-0 flex-1 gap-2 wrap-anywhere">
        <header className="typeset typeset-rollapp"><h3>{title}</h3></header>
        <p className="text-muted-foreground">{attribution}</p>
        <p><strong>{price}</strong></p>
        <p>{fulfillmentLabel(itemType)}: {fulfillmentTerms || "уточняется у продавца"}</p>
      </div>
    </div>
    {children}
  </article>;
}

export function PersonalOffers({ user, sphere, wishlistSpace, client = api }) {
  const [offers, setOffers] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const [selected, setSelected] = useState(null);
  const [operationResult, setOperationResult] = useState(null);
  const operationOpener = useRef(null);
  const offerSection = useRef(null);
  const [now, setNow] = useState(Date.now());
  const [nextOffset, setNextOffset] = useState(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [legacy, setLegacy] = useState({ items: [], loading: Boolean(wishlistSpace), error: "" });
  const [dismissing, setDismissing] = useState(null);
  const paginated = useRef(false);
  const moreLock = useRef(false);
  const mounted = useRef(false);
  const owner = useRef(user.id);
  owner.current = user.id;
  const offerPath = (offset) => {
    const query = new URLSearchParams();
    if (sphere) query.set("sphere", sphere);
    if (offset != null) query.set("offset", offset);
    return query.size ? `/personal-offers?${query}` : "/personal-offers";
  };
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  useEffect(() => {
    if (paginated.current) return;
    let active = true;
    client.get(offerPath()).then(result => {
      if (active && !paginated.current) {
        setOffers(result.offers);
        setNextOffset(result.nextOffset ?? null);
        setError("");
      }
    }).catch(e => { if (active) setError(e.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [revision, user.id, sphere, client]);
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
      if (!paginated.current && !moreLock.current) setRevision(value => value + 1);
    }, 30000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!wishlistSpace) return;
    let active = true;
    client.get(`/wishlist-business/${wishlistSpace}/offers`).then(({ items }) => {
      if (active) setLegacy({ items: items.filter(item => !item.personalOffer), loading: false, error: "" });
    }).catch(e => {
      if (active) setLegacy(previous => ({ ...previous, loading: false, error: e.message }));
    });
    return () => { active = false; };
  }, [wishlistSpace, client, revision]);
  async function dismissRecommendation(item) {
    setDismissing(item.id);
    try {
      await client.delete(`/wishlist-business/${wishlistSpace}/offers/${encodeURIComponent(item.offerId)}`);
      setLegacy(previous => ({ ...previous, items: previous.items.filter(entry => entry.id !== item.id) }));
      setRevision(value => value + 1);
    } catch (e) {
      setLegacy(previous => ({ ...previous, error: e.message }));
    } finally {
      setDismissing(null);
    }
  }
  const loadMore = async () => {
    if (nextOffset == null || moreLock.current) return;
    const sourceUser = user.id;
    paginated.current = true;
    moreLock.current = true; setLoadingMore(true);
    try {
      const result = await client.get(offerPath(nextOffset));
      if (!mounted.current || owner.current !== sourceUser) return;
      setOffers(previous => [...new Map([...previous, ...result.offers].map(offer => [offer.id, offer])).values()]);
      setNextOffset(result.nextOffset ?? null);
      setError("");
    } catch (e) { if (mounted.current && owner.current === sourceUser) setError(e.message); }
    finally {
      moreLock.current = false;
      if (mounted.current && owner.current === sourceUser) setLoadingMore(false);
    }
  };
  const refreshOffers = () => {
    paginated.current = false;
    setOffers([]); setNextOffset(null); setLoading(true); setError("");
    setRevision(value => value + 1);
  };
  const pending = readPendingPersonalOffers(user.id).filter(({ offer }) => !sphere || offers.some((entry) => entry.id === offer.id));
  function openOperation(event, offer, action) {
    operationOpener.current = event.currentTarget;
    setOperationResult(null);
    setSelected({ offer, action, userId: user.id });
  }
  function completeOperation(purchase, offer) {
    setOffers(previous => previous.map(entry => entry.id === offer.id ? {
      ...entry, status: purchase.refundedAt ? "refunded" : "paid", purchaseId: purchase.id,
    } : entry));
    setOperationResult({ id: offer.id, title: offer.title, refunded: Boolean(purchase.refundedAt) });
    setSelected(null);
    setRevision(value => value + 1);
  }
  const empty = !loading && !legacy.loading && !error && !legacy.error && !offers.length && !legacy.items.length && !pending.length && !operationResult;
  const title = wishlistSpace ? "Предложения" : "Персональные офферы";
  return <section ref={offerSection} tabIndex={-1} className="flex min-w-0 flex-col gap-4" aria-label={empty ? title : undefined} aria-labelledby={empty ? undefined : "personal-offers-title"}>
    {!empty && <header className="typeset typeset-rollapp"><h2 id="personal-offers-title">{title}</h2></header>}
    {pending.filter(({ offer }) => !offers.some(({ id }) => id === offer.id)).map(({ offer, action }) => (
      <OfferCard key={`${offer.id}:${action}`} {...offer} price={formatRolls(offer.priceRolls)} attribution={offer.business.name}>
        <PageActionButton className="self-start" variant="outline" onClick={(event) => openOperation(event, offer, action)}>Открыть проверку</PageActionButton>
      </OfferCard>
    ))}
    {operationResult && !offers.some(({ id }) => id === operationResult.id) && <p role="status" className="wrap-anywhere">
      {operationResult.refunded ? `По счёту «${operationResult.title}» роллы возвращены.` : `Счёт «${operationResult.title}» оплачен.`}
    </p>}
    {(loading || legacy.loading) && <p role="status">{wishlistSpace ? "Загружаем предложения…" : "Загружаем счета…"}</p>}
    {error && <Alert variant="destructive"><AlertDescription>{error}<Button variant="outline" disabled={loadingMore} onClick={refreshOffers}>Повторить</Button></AlertDescription></Alert>}
    {legacy.error && <Alert variant="destructive"><AlertDescription>{legacy.error}<Button variant="outline" onClick={() => setRevision(value => value + 1)}>Повторить</Button></AlertDescription></Alert>}
    {empty && <EmptyState compact={!sphere && !wishlistSpace} icon={FileText} title={wishlistSpace ? "Предложений пока нет" : "Персональных предложений пока нет"} text={wishlistSpace ? "Здесь появятся товары и услуги, предложенные вам продавцами." : "Здесь появятся персональные счета от бизнеса."} />}
    {offers.map(offer => {
      const expired = offer.status === "expired" || new Date(offer.expiresAt).getTime() <= now;
      const outgoing = offer.business.id === user.id;
      const recovery = pending.find(entry => entry.offer.id === offer.id);
      return <OfferCard key={offer.id} {...offer} price={formatRolls(offer.priceRolls)} attribution={outgoing ? `Для: ${offer.recipient.name}` : offer.business.name}>
        {!expired && offer.status === "active" && <p className="text-muted-foreground">Цена действует до <time dateTime={offer.expiresAt}>{offerExpiryFormat.format(new Date(offer.expiresAt))}</time></p>}
        {recovery ? <ControlBar><Button variant="outline" aria-haspopup="dialog" onClick={(event) => openOperation(event, recovery.offer, recovery.action)}>Открыть проверку</Button></ControlBar>
          : offer.status === "refunded" ? <p role="status">Роллы возвращены</p>
          : offer.status === "paid" ? <>
            <p role="status">Оплачен</p>
            {outgoing && <ControlBar><Button variant="outline" onClick={(event) => openOperation(event, offer, "refund")}>Вернуть роллы</Button></ControlBar>}
          </> : expired ? <p>Срок истёк</p> : offer.status === "unavailable" ? <p role="status">Оплата сейчас недоступна</p> : outgoing ? <p>Ожидает оплаты</p>
            : <ControlBar><Button aria-haspopup="dialog" className={wishlistSpace ? "after:absolute after:inset-0 after:rounded-2xl" : undefined} onClick={(event) => openOperation(event, offer, "pay")}>{wishlistSpace ? "К оформлению" : "Оплатить"}</Button></ControlBar>}
      </OfferCard>;
    })}
    {legacy.items.map(item => (
      <OfferCard key={`recommendation:${item.id}`} {...item} price={item.price || "Цена по запросу"} attribution={item.business.name} itemType={wishlistSpace === "products" ? "product" : undefined}>
        <ControlBar className="flex flex-wrap gap-2">
          {item.actionUrl
            ? <Button variant="outline" nativeButton={false} render={<a href={item.actionUrl} target="_blank" rel="noopener noreferrer" />}>Открыть у продавца</Button>
            : <PageActionButton variant="outline" to={publicSpacePath(item.business, wishlistSpace)}>Страница продавца</PageActionButton>}
          <Button variant="destructive" size="icon" data-control-icon disabled={dismissing !== null} aria-label="Отклонить предложение" onClick={() => dismissRecommendation(item)}><Trash2 aria-hidden="true" /></Button>
        </ControlBar>
      </OfferCard>
    ))}
    {(nextOffset != null || paginated.current) && <ControlBar className="flex flex-wrap gap-2">
      {nextOffset != null && <Button variant="outline" disabled={loadingMore} onClick={loadMore}>{loadingMore ? "Загружаем…" : wishlistSpace ? "Показать ещё" : "Показать ещё счета"}</Button>}
      {paginated.current && <Button variant="outline" disabled={loadingMore} onClick={refreshOffers}>{wishlistSpace ? "Обновить предложения" : "Обновить счета"}</Button>}
    </ControlBar>}
    {selected?.userId === user.id && <PersonalOfferOperationDialog userId={user.id} offer={selected.offer} action={selected.action}
      client={client} returnFocus={() => operationOpener.current?.isConnected ? operationOpener.current : offerSection.current}
      onDone={completeOperation} onClose={() => setSelected(null)} />}
  </section>;
}
