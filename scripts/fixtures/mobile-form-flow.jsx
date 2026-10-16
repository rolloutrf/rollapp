import React, { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { MobileFormPages } from '@/components/mobile-form-pages';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerFooter } from '@/components/form-surface';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FullscreenDialog } from '@/components/fullscreen-dialog';
import { DialogTitle, DialogDescription } from '@/components/ui/dialog';
import '../../src/styles.css';
import '../../src/index.css';
function Flow() {
  const [group,setGroup]=useState(false),[open,setOpen]=useState(false),[nested,setNested]=useState(false),[busy,setBusy]=useState(false),[value,setValue]=useState(''),[saved,setSaved]=useState(0);
  const source = new URLSearchParams(location.search).has('source');
  return <>{source ? <main className="app-page page-stack">
    {Array.from({length:30},(_,i)=><p key={i}>Раздел документа {i+1}: текст для проверки возврата к месту редактирования.</p>)}
    <Button onClick={()=>setOpen(true)}>Редактировать документ</Button>
  </main> : <Button onClick={()=>setGroup(true)}>Открыть группу</Button>}<output data-saved={saved}>{saved}</output>
    {group&&<FullscreenDialog onClose={()=>setGroup(false)}><DialogTitle>Группа</DialogTitle><DialogDescription>Исходный экран</DialogDescription><Button onClick={()=>setOpen(true)}>Добавить запись</Button></FullscreenDialog>}
    <Drawer open={open} onOpenChange={v=>{if(!busy)setOpen(v)}}><DrawerContent><form onSubmit={e=>{e.preventDefault();setSaved(n=>n+1);setOpen(false)}}><DrawerHeader><DrawerTitle>Новая запись</DrawerTitle></DrawerHeader><div className="app-drawer-body p-4"><Input aria-label="Черновик" value={value} onChange={e=>setValue(e.target.value)} /><Button type="button" onClick={()=>setNested(true)}>Создать список</Button><Button type="button" onClick={()=>setBusy(v=>!v)}>{busy?'Разблокировать':'Заблокировать'}</Button></div><DrawerFooter><Button type="submit">Сохранить</Button></DrawerFooter></form></DrawerContent></Drawer>
    <Drawer open={nested} onOpenChange={setNested}><DrawerContent><DrawerHeader><DrawerTitle>Новый список</DrawerTitle></DrawerHeader><Input aria-label="Имя списка" /></DrawerContent></Drawer>
  </>;
}
createRoot(document.getElementById('root')).render(<StrictMode><BrowserRouter><MobileFormPages><Flow /></MobileFormPages></BrowserRouter></StrictMode>);
