import { useCallback, useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { ArrowLeft, ExternalLink, Image as ImageIcon, Plus, Send } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/api";
import { WISHLIST_SPACES, canManageWishlistSpace } from "../../shared/wishlist-business.js";
import { PageActionButton } from "@/components/page-action-button";
import { ControlBar } from "@/components/control-bar";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from "@/components/ui/empty";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription, DrawerFooter } from "@/components/ui/drawer";
import { MobileFormScreen, MobileFormFooter } from "@/components/mobile-form-pages";
import { useIsMobile } from "@/hooks/use-mobile";

export function wishlistSpace(search) { return WISHLIST_SPACES.find(item => item.id === new URLSearchParams(search).get("tab"))?.id || "products"; }
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
function BusinessItem({item,onOpen}) {
 return <Card className="overflow-hidden p-0"><button type="button" className="flex w-full min-w-0 flex-col gap-4 text-left" onClick={()=>onOpen(item)} aria-label={`Открыть «${item.title}»`}>
   <div className="flex aspect-square w-full items-center justify-center overflow-hidden bg-muted">{item.imageUrl?<img className="size-full object-cover" src={item.imageUrl} alt="" loading="lazy"/>:<ImageIcon aria-hidden="true"/>}</div>
   <div className="flex min-w-0 flex-col gap-2 p-4"><h3 className="break-words font-semibold">{item.title}</h3>{item.price&&<p>{item.price}</p>}<p className="text-muted-foreground">{item.brand || item.business.pageTitle || item.business.name}</p>{!item.active&&<p className="text-muted-foreground">Скрыт</p>}</div>
 </button></Card>;
}
function ItemDetails({item,space,onClose,owner,onEdit,onDismiss}) {
 const isMobile=useIsMobile();
 const [buyers,setBuyers]=useState([]);const [buyerId,setBuyerId]=useState("");const [error,setError]=useState("");const [loading,setLoading]=useState(owner);const [busy,setBusy]=useState(false);
 useEffect(()=>{if(!owner)return;let current=true;api.get(`/wishlist-business/${space}/buyers`).then(data=>{if(current)setBuyers(data.buyers);}).catch(e=>{if(current)setError(e.message);}).finally(()=>{if(current)setLoading(false);});return()=>{current=false;};},[owner,space]);
 const send=async()=>{setBusy(true);setError("");try{const result=await api.post(`/wishlist-business/${space}/items/${item.id}/recommend`,{buyerId});toast.success(result.alreadySent?"Это предложение уже отправлено":"Предложение отправлено");onClose();}catch(e){setError(e.message);}finally{setBusy(false);}};
 const dismiss=async()=>{setBusy(true);try{await api.delete(`/wishlist-business/${space}/offers/${item.offerId}`);onDismiss();onClose();}catch(e){setError(e.message);}finally{setBusy(false);}};
 return <Drawer open swipeDirection={isMobile?"down":"right"} onOpenChange={open=>{if(!open&&!busy)onClose();}}><DrawerContent className="rollapp-body app-drawer--form">
 <DrawerHeader><DrawerTitle>{item.title}</DrawerTitle><DrawerDescription>{item.brand || item.business.pageTitle} · {labelFor(space)}</DrawerDescription></DrawerHeader>
 <div className="app-drawer-body flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto p-6">
 {item.imageUrl&&<img src={item.imageUrl} alt={item.title} className="max-h-96 w-full object-contain"/>}
 <p className="whitespace-pre-wrap">{item.description}</p>{item.price&&<p>{item.price}</p>}
 <Link to={`/app/store?tab=${space}&business=${encodeURIComponent(item.business.username)}`} onClick={onClose}>Страница продавца · {item.business.name}</Link>
 {item.actionUrl&&<a href={item.actionUrl} target="_blank" rel="noopener noreferrer" className={buttonVariants({variant:"outline"})}>Открыть у продавца<ExternalLink aria-hidden="true"/></a>}
 {owner&&<Field><FieldLabel htmlFor="offer-buyer">Покупатель</FieldLabel>{loading?<p role="status">Загружаем покупателей…</p>:buyers.length?<Select value={buyerId||null} onValueChange={setBuyerId} disabled={busy}><SelectTrigger id="offer-buyer" className="w-full"><SelectValue placeholder="Выберите покупателя">{selected=>buyers.find(buyer=>buyer.id===selected)?.name}</SelectValue></SelectTrigger><SelectContent alignItemWithTrigger={false}>{buyers.map(buyer=><SelectItem key={buyer.id} value={buyer.id}>{buyer.name} · @{buyer.username}</SelectItem>)}</SelectContent></Select>:<p>Покупатели ещё не открыли доступ к этому пространству.</p>}</Field>}
 <ErrorMessage message={error}/></div>
 <DrawerFooter><ControlBar className="flex gap-2"><Button variant="outline" disabled={busy} onClick={onClose}>Закрыть</Button>{owner&&<><Button variant="outline" disabled={busy} onClick={()=>onEdit(item)}>Редактировать</Button><Button disabled={!buyerId||busy||!item.active} onClick={send}><Send aria-hidden="true"/>Предложить</Button></>}{item.offerId&&<Button variant="destructive" disabled={busy} onClick={dismiss}>Отклонить</Button>}</ControlBar></DrawerFooter>
 </DrawerContent></Drawer>;
}
const emptyItem={title:"",description:"",brand:"",imageUrl:"",actionUrl:"",price:"",active:true};
function ItemEditor({item,space,onClose,onSaved}) {
 const isMobile=useIsMobile();const [form,setForm]=useState(()=>({...emptyItem,...Object.fromEntries(Object.keys(emptyItem).map(key=>[key,item?.[key]??emptyItem[key]]))}));
 const [busy,setBusy]=useState(false);const [uploading,setUploading]=useState(false);const [error,setError]=useState("");
 const set=(key,value)=>setForm(current=>({...current,[key]:value}));
 const upload=async file=>{if(!file)return;setUploading(true);setError("");try{const result=await api.uploadImage(file);set("imageUrl",result.imageUrl);}catch(e){setError(e.message);}finally{setUploading(false);}};
 const save=async event=>{event.preventDefault();if(busy||uploading)return;setBusy(true);setError("");try{await (item?.id?api.patch(`/wishlist-business/${space}/items/${item.id}`,form):api.post(`/wishlist-business/${space}/items`,form));onSaved();onClose();}catch(e){setError(e.message);}finally{setBusy(false);}};
 const content=<form onSubmit={save} className="form-surface flex min-h-0 flex-1 flex-col gap-6"><div className="app-drawer-body flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto p-6">
 <h2>{item?.id?"Редактировать айтем":"Новый айтем"} · {labelFor(space)}</h2>
 {[["title","Название",160],["brand","Бренд",100],["price","Цена с валютой",80],["actionUrl","Ссылка на айтем",2000]].map(([key,label,max])=><Field key={key}><FieldLabel htmlFor={`item-${key}`}>{label}</FieldLabel><Input id={`item-${key}`} type={key==="actionUrl"?"url":"text"} required={key==="title"} maxLength={max} value={form[key]} disabled={busy} onChange={e=>set(key,e.target.value)}/></Field>)}
 <Field><FieldLabel htmlFor="item-description">Описание</FieldLabel><Textarea id="item-description" maxLength={4000} value={form.description} disabled={busy} onChange={e=>set("description",e.target.value)}/></Field>
 <Field><FieldLabel htmlFor="item-image">Изображение</FieldLabel><Input id="item-image" type="file" accept="image/jpeg,image/png,image/webp" disabled={busy||uploading} onChange={e=>upload(e.target.files?.[0])}/>{uploading&&<p role="status">Загружаем изображение…</p>}{form.imageUrl&&<img src={form.imageUrl} alt="Изображение айтема" className="max-h-60 object-contain"/>}</Field>
 <label className="flex items-center gap-2"><Checkbox checked={form.active} onCheckedChange={value=>set("active",Boolean(value))} disabled={busy}/>Показывать айтем</label><ErrorMessage message={error}/>
 </div><MobileFormFooter><Button type="button" variant="outline" onClick={onClose} disabled={busy||uploading}>Отмена</Button><Button type="submit" disabled={busy||uploading}>{busy?"Сохраняем…":"Сохранить"}</Button></MobileFormFooter></form>;
 if(isMobile)return <MobileFormScreen onOpenChange={open=>{if(!open&&!busy&&!uploading)onClose();}}>{content}</MobileFormScreen>;
 return <Drawer open swipeDirection="right" onOpenChange={open=>{if(!open&&!busy&&!uploading)onClose();}}><DrawerContent className="rollapp-body app-drawer--form"><DrawerHeader><DrawerTitle>{item?.id?"Редактирование":"Добавление айтема"}</DrawerTitle></DrawerHeader>{content}</DrawerContent></Drawer>;
}
export function WishlistBusinessManager({user,space}) {
 const state=useBusinessData(`/wishlist-business/${space}/page`);const [page,setPage]=useState(null);const [editor,setEditor]=useState(null);const [selected,setSelected]=useState(null);const [busy,setBusy]=useState(false);const [error,setError]=useState("");
 useEffect(()=>{setPage(state.data?.page||null);},[state.data]);
 if(!canManageWishlistSpace(user,space))return <Blank title="Выберите раздел продавца" text="Управление страницей доступно продавцу в его разделе Вишлиста."/>;
 const save=async event=>{event.preventDefault();setBusy(true);setError("");try{await api.post(`/wishlist-business/${space}/page`,page);toast.success("Страница сохранена");state.reload();}catch(e){setError(e.message);}finally{setBusy(false);}};
 return <Status state={state}>{page&&<div className="page-stack"><form onSubmit={save} className="flex flex-col gap-6">
 <Field><FieldLabel htmlFor="seller-page-title">Название страницы</FieldLabel><Input id="seller-page-title" required maxLength={160} value={page.title} disabled={busy} onChange={e=>setPage({...page,title:e.target.value})}/></Field>
 <Field><FieldLabel htmlFor="seller-page-description">Описание</FieldLabel><Textarea id="seller-page-description" maxLength={4000} value={page.description} disabled={busy} onChange={e=>setPage({...page,description:e.target.value})}/></Field>
 <label className="flex items-center gap-2"><Checkbox checked={page.published} disabled={busy} onCheckedChange={published=>setPage({...page,published:Boolean(published)})}/>Опубликовать страницу в каталоге и магазине</label>
 <ErrorMessage message={error}/><ControlBar className="flex gap-2"><Button type="submit" disabled={busy}>{busy?"Сохраняем…":"Сохранить страницу"}</Button></ControlBar></form>
 <div className="page-actions page-toolbar horizontal-action-scroller"><PageActionButton onClick={()=>setEditor({})}><Plus aria-hidden="true"/>Добавить айтем</PageActionButton></div>
 <div className="wish-grid catalog-wish-grid">{(state.data?.items || []).map(item=><BusinessItem key={item.id} item={item} onOpen={setSelected}/>)}</div>
 {!state.data?.items?.length&&<Blank title="Добавьте первый айтем" text="Загрузите изображение, укажите бренд и описание. После публикации айтем можно предложить покупателю."/>}
 {selected&&<ItemDetails key={selected.id} item={selected} space={space} owner onClose={()=>setSelected(null)} onEdit={item=>{setSelected(null);setEditor(item);}}/>}
 {editor&&<ItemEditor key={editor.id||"new"} item={editor} space={space} onClose={()=>setEditor(null)} onSaved={state.reload}/>}
 </div>}</Status>;
}
export function WishlistBusinessListing({space,offers=false,business=""}) {
 const state=useBusinessData(`/wishlist-business/${space}/${offers?"offers":"store"}${business?`?business=${encodeURIComponent(business)}`:""}`);
 const [selected,setSelected]=useState(null);const [brand,setBrand]=useState("all");
 useEffect(()=>{setSelected(null);setBrand("all");},[space,business]);
 const brands=[...new Set((state.data?.items||[]).map(item=>item.brand).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"ru"));
 const items=(state.data?.items||[]).filter(item=>brand==="all"||item.brand===brand);
 return <Status state={state}><div className="page-stack">
 {brands.length>0&&<Field><FieldLabel htmlFor={`seller-brands-${offers?"offers":"store"}`}>Бренд</FieldLabel><Select value={brand} onValueChange={setBrand}><SelectTrigger id={`seller-brands-${offers?"offers":"store"}`}><SelectValue>{selected=>selected==="all"?"Все бренды":selected}</SelectValue></SelectTrigger><SelectContent alignItemWithTrigger={false}><SelectItem value="all">Все бренды</SelectItem>{brands.map(value=><SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select></Field>}
 {!offers&&state.data?.pages?.map(page=><article className="typeset typeset-rollapp" key={page.username}><h2><Link to={`/app/store?tab=${space}&business=${encodeURIComponent(page.username)}`}>{page.title}</Link></h2>{page.description&&<p className="whitespace-pre-wrap">{page.description}</p>}</article>)}
 {items.length?<div className="wish-grid catalog-wish-grid">{items.map(item=><BusinessItem key={item.id} item={item} onOpen={setSelected}/>)}</div>:<Blank title={offers?"Предложений пока нет":"Айтемов продавцов пока нет"} text={offers?"Здесь появятся рекомендации от продавцов, которым вы открыли доступ к этому пространству.":"Продавцы ещё не опубликовали айтемы в этом пространстве."}/>}
 {selected&&<ItemDetails key={selected.id} item={selected} space={space} onClose={()=>setSelected(null)} onDismiss={state.reload}/>}
 </div></Status>;
}
export function WishlistBusinessPage({user,manager=false}) {
 const location=useLocation();const space=wishlistSpace(location.search);
 return <div className="app-page page-stack rollapp-body"><ControlBar className="page-actions horizontal-action-scroller"><Link to={`/app/wishes?tab=${space}`} className={buttonVariants({variant:"outline",size:"icon"})} data-control-icon aria-label="Вернуться в Вишлист"><ArrowLeft aria-hidden="true"/></Link></ControlBar><header className="typeset typeset-rollapp"><h1>{manager?"Моя страница":"Предложения"} · {labelFor(space)}</h1></header>{manager?<WishlistBusinessManager key={space} user={user} space={space}/>:<WishlistBusinessListing key={space} space={space} offers/>}</div>;
}
