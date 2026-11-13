import { AddFab } from "@/components/add-fab";
import { useEffect, useRef, useState } from "react";
import { api } from "@/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PageActionButton } from "@/components/page-action-button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { ControlBar } from "@/components/control-bar";
import { BUSINESS_CATEGORIES, canBusinessAccessSection } from "../../shared/business-accounts.js";
import { SPHERE_SECTIONS } from "../../shared/sphere-sharing.js";
import { formatRolls } from "../../shared/rolls.js";

export const durations = [["1", "1 час"], ["24", "24 часа"], ["72", "3 дня"], ["168", "7 дней"], ["720", "30 дней"]];
const itemSpheres = BUSINESS_CATEGORIES.filter(({ sphere }) => sphere !== "wishlist").map(({ sphere, sphereLabel }) => [sphere, sphereLabel]);

export function PersonalOfferComposer({ item, client = api }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [people, setPeople] = useState([]);
  const [recipient, setRecipient] = useState(null);
  const [price, setPrice] = useState(String(item.priceRolls || ""));
  const [hours, setHours] = useState("24");
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
    const terms = { itemId: item.id, recipientId: recipient.id, priceRolls: Number(price), durationHours: Number(hours) };
    const signature = JSON.stringify(terms);
    if (pending.current?.signature !== signature) pending.current = { signature, payload: { ...terms, idempotencyKey: crypto.randomUUID() } };
    try { await client.post("/personal-offers", pending.current.payload); setSent(true); }
    catch (e) { setError(e.message); }
    finally { lock.current = false; setBusy(false); }
  };
  if (!open) return <Button variant="outline" onClick={() => setOpen(true)}>Рекомендовать с оффером</Button>;
  if (sent) return <div className="flex flex-col gap-4"><p role="status">Персональный счёт создан. Получатель увидит его в разделе «Роллы».</p><ControlBar><Button variant="outline" onClick={() => { setSent(false); setRecipient(null); pending.current = null; }}>Новый оффер</Button></ControlBar></div>;
  return <form className="flex min-w-0 flex-col gap-4" onSubmit={submit} aria-label={`Оффер: ${item.title}`}>
    <Field><FieldLabel htmlFor={`offer-person-${item.id}`}>Получатель</FieldLabel>
      {recipient ? <div className="flex min-w-0 flex-wrap items-center gap-2"><span className="min-w-0 wrap-anywhere">{recipient.name} · @{recipient.username}</span><Button type="button" variant="outline" disabled={busy} onClick={() => setRecipient(null)}>Изменить</Button></div> : <>
        <Input id={`offer-person-${item.id}`} placeholder="Имя или username" value={search} onChange={e => { setSearch(e.target.value); setPeople([]); }} />
        <div className="flex max-h-60 min-w-0 flex-col gap-2 overflow-y-auto" aria-label="Пользователи">{people.map(person => <Button type="button" className="h-auto min-w-0 whitespace-normal wrap-anywhere" variant="outline" key={person.id} onClick={() => setRecipient(person)}>{person.name} · @{person.username}</Button>)}</div>
        {!people.length && !error && <p className="text-muted-foreground">Предложения можно отправить подписчикам вашего бизнеса.</p>}
      </>}
    </Field>
    <Field><FieldLabel htmlFor={`offer-price-${item.id}`}>Цена в роллах</FieldLabel><Input id={`offer-price-${item.id}`} type="number" inputMode="numeric" min="1" max="1000000" step="1" required disabled={busy} value={price} onChange={e => setPrice(e.target.value)} /></Field>
    <Field><FieldLabel htmlFor={`offer-hours-${item.id}`}>Срок с момента создания</FieldLabel><Select value={hours} onValueChange={setHours} disabled={busy}><SelectTrigger id={`offer-hours-${item.id}`} className="w-full"><SelectValue>{() => durations.find(([value]) => value === hours)?.[1]}</SelectValue></SelectTrigger><SelectContent>{durations.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></Field>
    {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
    <ControlBar className="flex flex-wrap gap-2"><Button type="button" variant="outline" disabled={busy} onClick={() => setOpen(false)}>Отмена</Button><Button type="submit" disabled={!recipient || busy}>{busy ? "Создаём…" : "Создать счёт"}</Button></ControlBar>
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
  return <section className="page-stack min-w-0" aria-labelledby="business-offers-title">
    <header className="typeset typeset-rollapp"><h2 id="business-offers-title">Рекомендовать товар</h2>
    <p>Выберите товар, получателя, персональную цену и срок. Созданные счета доступны в разделе «Роллы».</p></header>
    {loading && <p role="status">Загружаем товары…</p>}
    {error && <Alert variant="destructive"><AlertDescription>{error}<Button variant="outline" onClick={() => setRevision(value => value + 1)}>Повторить</Button></AlertDescription></Alert>}
    {!loading && !error && !items.length && <p>У вашего бизнеса пока нет активных товаров или услуг.</p>}
    {!creatingItem && <AddFab actions={[{ label: "Добавить товар", disabled: loading || Boolean(error), onSelect: () => setCreatingItem(true) }]} />}
    {creatingItem && <BusinessOfferItemForm spheres={spheres} client={client} onCancel={() => setCreatingItem(false)} onCreated={id => { setSelected(id); setCreatingItem(false); setRevision(value => value + 1); }} />}
    {items.length > 0 && <Field><FieldLabel htmlFor="business-offer-item">Товар или услуга</FieldLabel><Select value={selected} onValueChange={setSelected}><SelectTrigger id="business-offer-item" className="w-full"><SelectValue placeholder="Выберите товар">{() => item?.title || "Выберите товар"}</SelectValue></SelectTrigger><SelectContent>{items.map(value => <SelectItem key={value.id} value={value.id}>{value.title}</SelectItem>)}</SelectContent></Select></Field>}
    {item && <PersonalOfferComposer key={item.id} item={item} client={client} />}
  </section>;
}

export function PersonalOffers({ user, sphere, onPaid, client = api }) {
  const [offers, setOffers] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const [selected, setSelected] = useState(null);
  const [paymentError, setPaymentError] = useState("");
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [now, setNow] = useState(Date.now());
  const [nextOffset, setNextOffset] = useState(null);
  const [loadingMore, setLoadingMore] = useState(false);
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
  const pay = async () => {
    if (!selected || lock.current) return;
    lock.current = true; setBusy(true); setPaymentError("");
    try {
      const result = await client.post(`/personal-offers/${selected.id}/pay`, {});
      setOffers(previous => previous.map(offer => offer.id === selected.id ? { ...offer, status: "paid", purchaseId: result.purchase.id } : offer));
      setSelected(null); setRevision(value => value + 1); onPaid?.();
    }
    catch (e) { setPaymentError(e.message); setRevision(value => value + 1); }
    finally { lock.current = false; setBusy(false); }
  };
  return <section className="flex min-w-0 flex-col gap-4" aria-labelledby="personal-offers-title">
    <header className="typeset typeset-rollapp"><h2 id="personal-offers-title">Персональные офферы</h2></header>
    {loading && <p role="status">Загружаем счета…</p>}
    {error && <Alert variant="destructive"><AlertDescription>{error}<Button variant="outline" disabled={busy || loadingMore} onClick={refreshOffers}>Повторить</Button></AlertDescription></Alert>}
    {!loading && !error && !offers.length && <p className="text-muted-foreground">Здесь появятся персональные счета от бизнеса.</p>}
    {offers.map(offer => {
      const expired = offer.status === "expired" || new Date(offer.expiresAt).getTime() <= now;
      const outgoing = offer.business.id === user.id;
      return <article key={offer.id} className="flex min-w-0 flex-col gap-3 rounded-2xl border p-4">
        <div className="typeset typeset-rollapp"><h3 className="break-words">{offer.title}</h3>
        <p>{outgoing ? `Для: ${offer.recipient.name}` : `От: ${offer.business.name}`}</p>
        <p><strong>{formatRolls(offer.priceRolls)}</strong></p>
        <p className="text-muted-foreground">Действует до <time dateTime={offer.expiresAt}>{new Date(offer.expiresAt).toLocaleString("ru-RU")}</time></p></div>
        {offer.status === "paid" ? <p role="status">Оплачен</p> : expired ? <p>Срок истёк</p> : outgoing ? <p>Ожидает оплаты</p> : <ControlBar><Button onClick={() => { setPaymentError(""); setSelected(offer); }}>Оплатить</Button></ControlBar>}
      </article>;
    })}
    {(nextOffset != null || paginated.current) && <ControlBar className="flex flex-wrap gap-2">
      {nextOffset != null && <Button variant="outline" disabled={loadingMore || busy} onClick={loadMore}>{loadingMore ? "Загружаем…" : "Показать ещё счета"}</Button>}
      {paginated.current && <Button variant="outline" disabled={loadingMore || busy} onClick={refreshOffers}>Обновить счета</Button>}
    </ControlBar>}
    <AlertDialog open={Boolean(selected)} onOpenChange={open => { if (!open && !busy) setSelected(null); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Оплатить персональный счёт?</AlertDialogTitle><AlertDialogDescription>{selected && `${selected.title} · ${formatRolls(selected.priceRolls)}. Роллы будут переведены бизнесу ${selected.business.name}.`}</AlertDialogDescription></AlertDialogHeader>{paymentError && <Alert variant="destructive"><AlertDescription>{paymentError}</AlertDescription></Alert>}<AlertDialogFooter><AlertDialogCancel disabled={busy}>Отмена</AlertDialogCancel><AlertDialogAction disabled={busy} onClick={event => { event.preventDefault(); pay(); }}>{busy ? "Оплачиваем…" : "Подтвердить оплату"}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </section>;
}

export function OfferPaymentAction({ offer, onPaid }) {
  const [open,setOpen]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(""),[paid,setPaid]=useState(offer.status==="paid");
  const lock=useRef(false);
  const pay=async()=>{if(lock.current)return;lock.current=true;setBusy(true);setError("");try{await api.post(`/personal-offers/${offer.id}/pay`,{});setPaid(true);setOpen(false);onPaid?.();}catch(e){setError(e.message);}finally{lock.current=false;setBusy(false);}};
  if(paid)return <span role="status">Оплачен</span>;
  if(offer.status==="expired"||new Date(offer.expiresAt).getTime()<=Date.now())return <span>Срок истёк</span>;
  return <><Button className="min-w-0 flex-1" onClick={()=>setOpen(true)}>Оплатить</Button><AlertDialog open={open} onOpenChange={value=>{if(!busy)setOpen(value);}}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Оплатить персональный счёт?</AlertDialogTitle><AlertDialogDescription>{offer.title} · {formatRolls(offer.priceRolls)}. Роллы получит {offer.business.name}.</AlertDialogDescription></AlertDialogHeader>{error&&<Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}<AlertDialogFooter><AlertDialogCancel disabled={busy}>Отмена</AlertDialogCancel><AlertDialogAction disabled={busy} onClick={event=>{event.preventDefault();pay();}}>{busy?"Оплачиваем…":"Подтвердить оплату"}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog></>;
}
