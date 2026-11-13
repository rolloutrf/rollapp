import { AddFab } from "@/components/add-fab";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, Pencil, Trash2, X, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { OfferPaymentAction, durations } from "@/components/personal-offers";
import { publicSpacePath } from "../../shared/profile-links.js";
import { formatRolls } from "../../shared/rolls.js";
import { api } from "@/api";
import { APP_WISH_LISTINGS_PATH, APP_WISH_SALES_PATH } from "@/lib/app-routing";
import { WISHLIST_SPACES, canManageWishSales, canManageWishlistSpace } from "../../shared/wishlist-business.js";
import { ControlBar } from "@/components/control-bar";
import { Button, buttonVariants } from "@/components/ui/button";
import { WishlistSnippet } from "@/components/wishlist-snippet";
import { isVideoUrl } from "../../shared/video-links.js";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from "@/components/ui/empty";
import { Drawer, DrawerClose, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription, DrawerFooter } from "@/components/form-surface";
import { WishlistBusinessItemEditor } from "@/components/wishlist-business-item-editor";

export function wishlistSpace(search) { return WISHLIST_SPACES.find(item => item.id === new URLSearchParams(search).get("tab"))?.id || "products"; }
export function wishSalesPath(space, wishId) {
 const params = new URLSearchParams({ tab: space });
 if (wishId) params.set("wish", wishId);
 return `${APP_WISH_SALES_PATH}?${params}`;
}
const labelFor = space => WISHLIST_SPACES.find(item => item.id === space)?.label;
function useBusinessData(endpoint) {
 const [version,setVersion]=useState(0);
 const [state,setState]=useState({loading:true,error:"",data:null});
 useEffect(()=>{ let current=true;setState({loading:true,error:"",data:null});
 api.get(endpoint).then(data=>{if(current)setState({loading:false,error:"",data});}).catch(error=>{if(current)setState({loading:false,error:error.message,data:null});});
 return ()=>{current=false;}; },[endpoint,version]);
 const reload=useCallback(()=>setVersion(value=>value+1),[]);
 return {...state,reload};
}
function Status({state,children}) {
 if(state.loading)return <p role="status">Загружаем…</p>;
 if(state.error)return <Alert variant="destructive"><AlertDescription>{state.error}</AlertDescription><Button onClick={state.reload}>Повторить</Button></Alert>;
 return children;
}
function Blank({title,text}) {return <Empty><EmptyHeader><EmptyTitle>{title}</EmptyTitle><EmptyDescription>{text}</EmptyDescription></EmptyHeader></Empty>;}
function ErrorMessage({message}) {return message ? <Alert variant="destructive"><AlertDescription>{message}</AlertDescription></Alert>:null;}
function BusinessItem({ item, onOpen }) {
 const title = item.title || "Название";
 return (
   <WishlistSnippet
     title={title}
     imageUrl={item.imageUrl}
     imageLoading="lazy"
     video={isVideoUrl(item.actionUrl)}
     price={item.personalOffer ? formatRolls(item.personalOffer.priceRolls) : item.price}
     openButton={onOpen && {
       "aria-label": `Открыть «${title}»`,
       "aria-haspopup": "dialog",
       onClick: () => onOpen(item),
     }}
     details={<>
       <span>{item.brand || item.business.pageTitle || item.business.name}</span>
       {item.published === false && <span>Витрина не опубликована</span>}
       {!item.active && onOpen && <span>Скрыт</span>}
     </>}
   />
 );
}
function ItemDetails({item,space,onClose,owner,onEdit,onDismiss,open=true,onAfterClose,viewerId}) {
 const location = useLocation();
 const navigate = useNavigate();
 const [conversationId, setConversationId] = useState(null);
 const [price,setPrice]=useState(""),[hours,setHours]=useState("24");const pending=useRef(null),sendLock=useRef(false);
 const [buyers,setBuyers]=useState([]);const [buyerId,setBuyerId]=useState("");const [error,setError]=useState("");const [loading,setLoading]=useState(owner);const [busy,setBusy]=useState(false);
 useEffect(()=>{if(!owner)return;let current=true;api.get(`/wishlist-business/${space}/buyers`).then(data=>{if(current)setBuyers(data.buyers);}).catch(e=>{if(current)setError(e.message);}).finally(()=>{if(current)setLoading(false);});return()=>{current=false;};},[owner,space]);
 const send=async()=>{if(sendLock.current)return;sendLock.current=true;setBusy(true);setError("");const terms={buyerId,priceRolls:Number(price),durationHours:Number(hours)};const signature=JSON.stringify(terms);if(pending.current?.signature!==signature)pending.current={signature,payload:{...terms,idempotencyKey:crypto.randomUUID()}};try{const result=await api.post(`/wishlist-business/${space}/items/${item.id}/recommend`,pending.current.payload);toast.success(result.alreadySent?"Этот счёт уже создан":"Персональный счёт создан");onClose();}catch(e){setError(e.message);}finally{sendLock.current=false;setBusy(false);}};
 const dismiss=async()=>{setBusy(true);try{await api.delete(`/wishlist-business/${space}/offers/${item.offerId}`);onDismiss();onClose();}catch(e){setError(e.message);}finally{setBusy(false);}};
 const contact = async () => {
   if (sendLock.current) return;
   sendLock.current = true;
   setBusy(true);
   setError("");
   try {
     const { conversation } = await api.post("/messenger/conversations", { participantId: item.business.id });
     setConversationId(conversation.id);
   } catch (error) {
     setError(error.message);
   } finally {
     sendLock.current = false;
     setBusy(false);
   }
 };
 const afterClose = () => {
   if (conversationId) {
     onClose();
     navigate(location, { replace: true, state: { ...location.state, messengerOpen: true, messengerConversationId: conversationId } });
   } else onAfterClose?.();
 };
 return <Drawer open={open && !conversationId} onAfterClose={afterClose} onOpenChange={open=>{if(!open&&!busy)onClose();}}><DrawerContent className="rollapp-body app-drawer--form">
 <DrawerClose render={<Button type="button" variant="ghost" size="icon" className="absolute top-2 right-2 z-10" disabled={busy} />} aria-label="Закрыть"><X aria-hidden="true" /></DrawerClose>
 <DrawerHeader className="wrap-anywhere pr-16"><DrawerTitle>{item.personalOffer?.title||item.title}</DrawerTitle><DrawerDescription>{item.brand || item.business.pageTitle} · {labelFor(space)}</DrawerDescription></DrawerHeader>
 <div className="app-drawer-body flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto wrap-anywhere p-6">
 {item.imageUrl&&<img src={item.imageUrl} alt={item.title} className="max-h-96 w-full object-contain"/>}
 {item.description && <p className="whitespace-pre-wrap">{item.description}</p>}{(item.personalOffer||item.price)&&<p>{item.personalOffer?formatRolls(item.personalOffer.priceRolls):item.price}</p>}
 <Link to={publicSpacePath(item.business.username,space)} onClick={onClose}>Страница продавца · {item.business.name}</Link>
 {item.actionUrl&&<a href={item.actionUrl} target="_blank" rel="noopener noreferrer" className={buttonVariants({variant:"outline"})}>Открыть у продавца<ExternalLink aria-hidden="true"/></a>}
 {owner&&<Field><FieldLabel htmlFor="offer-buyer">Покупатель</FieldLabel>{loading?<p role="status">Загружаем покупателей…</p>:buyers.length?<Select value={buyerId||null} onValueChange={setBuyerId} disabled={busy}><SelectTrigger id="offer-buyer" className="w-full"><SelectValue placeholder="Выберите покупателя">{selected=>buyers.find(buyer=>buyer.id===selected)?.name}</SelectValue></SelectTrigger><SelectContent alignItemWithTrigger={false}>{buyers.map(buyer=><SelectItem key={buyer.id} value={buyer.id}>{buyer.name} · @{buyer.username}</SelectItem>)}</SelectContent></Select>:<p>Пока нет подписчиков или покупателей с открытым доступом к разделу.</p>}</Field>}
 {owner&&<><Field><FieldLabel htmlFor="wishlist-offer-price">Цена в роллах</FieldLabel><Input id="wishlist-offer-price" type="number" min="1" max="1000000" step="1" value={price} disabled={busy} onChange={e=>setPrice(e.target.value)} /></Field><Field><FieldLabel htmlFor="wishlist-offer-duration">Срок действия</FieldLabel><Select value={hours} onValueChange={setHours} disabled={busy}><SelectTrigger id="wishlist-offer-duration" className="w-full"><SelectValue>{()=>durations.find(([value])=>value===hours)?.[1]}</SelectValue></SelectTrigger><SelectContent alignItemWithTrigger={false}>{durations.map(([value,label])=><SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></Field></>}
 {item.personalOffer&&<p>Действует до <time dateTime={item.personalOffer.expiresAt}>{new Date(item.personalOffer.expiresAt).toLocaleString("ru-RU")}</time></p>}
 <ErrorMessage message={error}/></div>
 <DrawerFooter>
   {item.personalSale && viewerId && viewerId !== item.business.id && <Button type="button" disabled={busy} onClick={contact}>Написать продавцу</Button>}
   {owner && <>
     <Button type="button" disabled={!buyerId || busy || !item.active || !Number.isInteger(Number(price)) || Number(price) < 1 || Number(price) > 1000000} onClick={send}>Предложить</Button>
     <Button type="button" variant="outline" size="icon" data-control-icon aria-label={space === "products" ? "Редактировать товар" : "Редактировать позицию"} disabled={busy} onClick={() => onEdit(item)}><Pencil aria-hidden="true" /></Button>
   </>}
   {!owner && item.personalOffer && <OfferPaymentAction offer={item.personalOffer} onPaid={() => { onDismiss(); onClose(); }} />}
   {item.offerId && <Button type="button" variant="destructive" size="icon" data-control-icon aria-label="Отклонить предложение" title="Отклонить предложение" disabled={busy} onClick={dismiss}><Trash2 aria-hidden="true" /></Button>}
 </DrawerFooter>
 </DrawerContent></Drawer>;
}
export function WishlistBusinessManager({user,space}) {
 const state=useBusinessData(`/wishlist-business/${space}/page`);const [page,setPage]=useState(null);const [editor,setEditor]=useState(null);const [selected,setSelected]=useState(null);const [busy,setBusy]=useState(false);const [error,setError]=useState("");
 const [items, setItems] = useState([]);
 const [pendingEdit, setPendingEdit] = useState(null);
 const isProduct = space === "products";
 useEffect(() => {
   if (!state.data) return;
   setPage(state.data.page);
   setItems(state.data.items ?? []);
 }, [state.data]);
 const saveItem = (saved) => setItems((current) => current.some((item) => item.id === saved.id)
   ? current.map((item) => item.id === saved.id ? saved : item)
   : [saved, ...current]);
 if(!canManageWishlistSpace(user,space))return <Blank title="Выберите раздел продавца" text="Управление страницей доступно продавцу в его разделе Вишлиста."/>;
 const save=async event=>{event.preventDefault();setBusy(true);setError("");try{await api.post(`/wishlist-business/${space}/page`,page);toast.success("Страница сохранена");state.reload();}catch(e){setError(e.message);}finally{setBusy(false);}};
 return <Status state={state}>{page&&<div className="page-stack"><form onSubmit={save} className="flex flex-col gap-6">
 <Field><FieldLabel htmlFor="seller-page-title">Название страницы</FieldLabel><Input id="seller-page-title" required maxLength={160} value={page.title} disabled={busy} onChange={e=>setPage({...page,title:e.target.value})}/></Field>
 <Field><FieldLabel htmlFor="seller-page-description">Описание</FieldLabel><Textarea id="seller-page-description" maxLength={4000} value={page.description} disabled={busy} onChange={e=>setPage({...page,description:e.target.value})}/></Field>
 <label className="flex items-center gap-2"><Checkbox checked={page.published} disabled={busy} onCheckedChange={published=>setPage({...page,published:Boolean(published)})}/>Опубликовать витрину</label>
 <ErrorMessage message={error}/><ControlBar className="flex gap-2"><Button type="submit" disabled={busy}>{busy?"Сохраняем…":"Сохранить страницу"}</Button></ControlBar></form>
 <AddFab actions={[{ label: isProduct ? "Добавить товар" : "Добавить позицию", disabled: busy, onSelect: () => setEditor({}) }]} />
 {items.length ? (
   <div className="wish-grid catalog-wish-grid">{items.map((item) => <BusinessItem key={item.id} item={item} onOpen={setSelected} />)}</div>
 ) : (
   <Blank title={isProduct ? "Добавьте первый товар" : "Добавьте первую позицию"} text="Загрузите фото, укажите название и цену. Покупатели увидят карточку после публикации витрины." />
 )}
 {selected && (
   <ItemDetails
     key={selected.id} item={selected} space={space} owner
     open={!pendingEdit} onClose={() => setSelected(null)} onEdit={setPendingEdit}
     onAfterClose={() => {
       if (!pendingEdit) return;
       setSelected(null);
       setEditor(pendingEdit);
       setPendingEdit(null);
     }}
   />
 )}
 {editor && (
   <WishlistBusinessItemEditor
     key={editor.id || "new"} item={editor} space={space} spaceLabel={labelFor(space)}
     published={state.data.page.published}
     onClose={() => setEditor(null)} onSaved={saveItem}
     renderPreview={(draft) => (
       <div className="mx-auto w-full max-w-xs" aria-label="Предпросмотр карточки">
         <BusinessItem item={{ ...draft, title: draft.title.trim(), business: { name: state.data.page.title } }} />
       </div>
     )}
   />
 )}
 </div>}</Status>;
}
export function WishlistBusinessListing({space,offers=false,business="",publicProfile=false,viewerId}) {
 const state=useBusinessData(publicProfile ? `/wishlist-business/${space}/profiles/${encodeURIComponent(business)}` : `/wishlist-business/${space}/${offers?"offers":"store"}${business?`?business=${encodeURIComponent(business)}`:""}`);
 const [selected,setSelected]=useState(null);const [brand,setBrand]=useState("all");
 useEffect(()=>{setSelected(null);setBrand("all");},[space,business]);
 const brands=[...new Set((state.data?.items||[]).map(item=>item.brand).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"ru"));
 const items=(state.data?.items||[]).filter(item=>brand==="all"||item.brand===brand);
 return <Status state={state}><div className="page-stack">
 {brands.length>0&&<Field><FieldLabel htmlFor={`seller-brands-${offers?"offers":"store"}`}>Бренд</FieldLabel><Select value={brand} onValueChange={setBrand}><SelectTrigger id={`seller-brands-${offers?"offers":"store"}`}><SelectValue>{selected=>selected==="all"?"Все бренды":selected}</SelectValue></SelectTrigger><SelectContent alignItemWithTrigger={false}><SelectItem value="all">Все бренды</SelectItem>{brands.map(value=><SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select></Field>}
 {!offers&&state.data?.pages?.map(page=><article className="typeset typeset-rollapp" key={page.username}><h2>{publicProfile ? page.title : <Link to={`${APP_WISH_LISTINGS_PATH}?tab=${space}&business=${encodeURIComponent(page.username)}`}>{page.title}</Link>}</h2>{page.description&&<p className="whitespace-pre-wrap">{page.description}</p>}</article>)}
 {items.length?<div className="wish-grid catalog-wish-grid">{items.map(item=><BusinessItem key={item.id} item={item} onOpen={setSelected}/>)}</div>:<Blank title={offers?"Предложений пока нет":publicProfile?"Товаров пока нет":"Объявлений пока нет"} text={offers?"Здесь появятся рекомендации от продавцов, которым вы открыли доступ к этому пространству.":publicProfile?"Здесь появятся опубликованные товары этого бизнеса.":"Здесь появятся опубликованные объявления продавцов."}/>}
 {selected&&<ItemDetails key={selected.id} item={selected} space={space} onClose={()=>setSelected(null)} onDismiss={state.reload} viewerId={viewerId}/>}
 </div></Status>;
}
function WishSalesManager({ user, space, wishId }) {
 const navigate = useNavigate();
 const state = useBusinessData(`/wishlist-business/${space}/sales${wishId ? `?wish=${encodeURIComponent(wishId)}` : ""}`);
 const [editor, setEditor] = useState(null);
 const [editorOpen, setEditorOpen] = useState(false);
 const savedItem = useRef(null);
 const openEditor = useCallback((item) => {
   savedItem.current = null;
   setEditor(item);
   setEditorOpen(true);
 }, []);
 useEffect(() => {
   if (state.data?.editor) openEditor(state.data.editor);
 }, [state.data, openEditor]);
 const closeEditor = () => {
   setEditor(null);
   if (wishId) navigate(wishSalesPath(savedItem.current?.space || space), { replace: true });
   else if (savedItem.current) state.reload();
 };
 return <>
   <Status state={state}>
     <AddFab actions={[{ label: space === "products" ? "Добавить товар" : "Добавить позицию", onSelect: () => openEditor({ space, active: false }) }]} />
     {state.data?.items.length ? (
       <div className="wish-grid catalog-wish-grid">
         {state.data.items.map(item => <BusinessItem key={item.id} item={item} onOpen={openEditor} />)}
       </div>
     ) : <Blank title="Объявлений пока нет" text="Добавьте объявление здесь или выставьте на продажу исполненное желание." />}
   </Status>
   {editor && <WishlistBusinessItemEditor
     key={editor.id || wishId || "new"} item={editor} space={editor.space} spaceLabel={labelFor(editor.space)}
     sale={{ wishId }} published={state.data.published} open={editorOpen}
     onClose={() => setEditorOpen(false)} onAfterClose={closeEditor}
     onSaved={(item) => { savedItem.current = item; }}
     renderPreview={(draft) => (
       <div className="mx-auto w-full max-w-xs" aria-label="Предпросмотр объявления">
         <BusinessItem item={{ ...draft, business: { name: user.name } }} />
       </div>
     )}
   />}
 </>;
}

export function WishSalesPage({ user }) {
 const { search } = useLocation();
 const space = wishlistSpace(search);
 const wishId = new URLSearchParams(search).get("wish");
 return <section className="app-page page-stack rollapp-body" aria-label={`Мои продажи · ${labelFor(space)}`}>
   {canManageWishSales(user, space)
     ? <WishSalesManager key={`${user.id}:${space}:${wishId || ""}`} user={user} space={space} wishId={wishId} />
     : <Blank title="Продажи недоступны" text="Выберите раздел, в котором можете размещать объявления." />}
 </section>;
}

export function WishlistBusinessPage({user,manager=false}) {
 const location=useLocation();const space=wishlistSpace(location.search);
 return <section className="app-page page-stack rollapp-body" aria-label={`${manager?"Страница продавца":"Предложения"}: ${labelFor(space)}`}>
   {manager&&<>
     <ControlBar className="page-actions horizontal-action-scroller"><Link to={`/app/wishes?tab=${space}`} className={buttonVariants({variant:"outline",size:"icon"})} data-control-icon aria-label="Вернуться в Вишлист"><ArrowLeft aria-hidden="true"/></Link></ControlBar>
     <header className="typeset typeset-rollapp"><h1>Моя страница · {labelFor(space)}</h1></header>
   </>}
   {manager?<WishlistBusinessManager key={space} user={user} space={space}/>:<WishlistBusinessListing key={space} space={space} offers/>}
 </section>;
}
