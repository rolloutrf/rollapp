import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {BrowserRouter} from 'react-router-dom';
import {GlobalAppChrome,PlanningFab,SessionContext,ToastContext,CollectionNavigationContext} from '@/App.jsx?navigation-smoke';
import {MobileFormPages} from '@/components/mobile-form-pages';
import {Drawer,DrawerContent,DrawerHeader,DrawerTitle,DrawerFooter} from '@/components/form-surface';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {useVisualViewport} from '@/hooks/use-visual-viewport';
import '../../src/styles.css';
import '../../src/index.css';
function Fixture(){
 useVisualViewport();const[form,setForm]=useState(false);
 // Presentation props only; no SessionProvider, API calls or persisted records.
 const user=new URLSearchParams(location.search).has('guest')?null:{canDiscoverSpheres:true,accountType:'personal'};
 return <SessionContext.Provider value={{user}}><ToastContext.Provider value={()=>{}}><CollectionNavigationContext.Provider value={{collection:null}}><MobileFormPages>
  <GlobalAppChrome/><PlanningFab/>
  <div className="app-layout app-layout--dark"><main className="app-main"><div className="app-shell-chrome-spacer"/><article className="app-page rollapp-body">
   <h1>Содержимое раздела</h1><Button onClick={()=>setForm(true)}>Открыть форму</Button>
   {Array.from({length:10},(_,i)=><p className="py-6" key={i}>Строка {i+1} — содержимое остаётся доступным при прокрутке.</p>)}
   <Button data-last-action>Последнее действие страницы</Button>
  </article></main></div>
  <Drawer open={form} onOpenChange={setForm}><DrawerContent><DrawerHeader><DrawerTitle>Новая запись</DrawerTitle></DrawerHeader><div className="app-drawer-body p-4"><Input aria-label="Название"/></div><DrawerFooter><Button onClick={()=>setForm(false)}>Готово</Button></DrawerFooter></DrawerContent></Drawer>
 </MobileFormPages></CollectionNavigationContext.Provider></ToastContext.Provider></SessionContext.Provider>;
}
createRoot(document.getElementById('root')).render(<BrowserRouter><Fixture/></BrowserRouter>);
