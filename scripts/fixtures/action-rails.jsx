import React, { useState } from 'react';
import { PlanningDayRibbon } from '@/components/planning-day-ribbon';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Plus, ArrowRight } from 'lucide-react';
import { PageActionButton } from '@/components/page-action-button';
import { SphereBusinessControls } from '@/components/business-marketplace-page';
import { EducationListNavigation, EducationSectionHeader } from '@/components/education-lists';
import { ContactsProfileControls, WishesProfileControls, WishesPage, SessionContext, ToastContext } from '../../src/App.jsx?action-rails-export';
import { api } from '@/api';
import { WishListNavigation } from '@/components/wish-list-navigation';
import { ListTileContent } from '@/components/list-tile-content';
import { InlineDocument } from '@/components/inline-document';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import '../../src/styles.css';
import '../../src/index.css';

const variant=new URLSearchParams(location.search).get('variant')||'text';
if(variant==='wishlist-error'){
 // The production page requests preview maintenance on mount. Keep that
 // existing effect inert in this presentation-only fixture.
 api.post=async path=>{if(path==='/wishes/backfill-previews')return {updated:0};throw new Error('Unexpected fixture mutation');};
 api.get=async path=>{
 if(path==='/dashboard'){
  window.wishlistLoadAttempts=(window.wishlistLoadAttempts||0)+1;
  if(window.wishlistLoadAttempts<3)throw new Error('Нет соединения с сервером');
  return {wishes:[],lists:[],groups:[]};
 }
 return {suggestions:[]};
};
}
const wishlist=['wishlist','wishlist-real'].includes(variant);
const railClass=variant==='report'?'identity-report-manager__actions':'page-actions';
function Actions(){
 const [editing,setEditing]=useState(false);
 const icons=['icons','nested'].includes(variant)||(variant==='dynamic'&&editing);
 return <>
 <div className={`${railClass} ${['text','wishlist','narrow','icons','edit','dynamic'].includes(variant)?'wishes-page__hero-actions':''} horizontal-action-scroller`} aria-label="Действия">
  {!icons&&variant!=='edit'&&<PageActionButton>{variant==='icon-labels'&&<Plus data-icon="inline-start"/>}Добавить</PageActionButton>}
  {!icons&&variant!=='short'&&<PageActionButton variant="outline">Редактировать{variant==='icon-labels'&&<ArrowRight data-icon="inline-end"/>}</PageActionButton>}
  {variant!=='short'&&<SphereBusinessControls sphereId="career"/>}
 </div>
 {variant==='dynamic'&&<button onClick={()=>setEditing(!editing)} data-toggle-actions>Изменить набор действий</button>}
 </>;
}
function Fixture(){if(variant.startsWith('identity-document'))return <BrowserRouter><div className="app-layout app-layout--dark"><main className="app-main"><article className="app-page sphere-text-page page-stack"><InlineDocument scope="identity" documentKey="unsaved-identity-rail" label="Документ идентичности" value="Текст раздела" onSave={async value=>value} addBlock={variant==='identity-document-add'?[{type:'paragraph'}]:undefined}/></article></main></div></BrowserRouter>;if(variant==='wishlist-error')return <BrowserRouter><SessionContext.Provider value={{user:{id:'unsaved',username:'fixture'}}}><ToastContext.Provider value={()=>{}}><div className="app-layout app-layout--dark"><main className="app-main"><WishesPage onAdd={()=>{}} version={0}/></main></div></ToastContext.Provider></SessionContext.Provider></BrowserRouter>;return <BrowserRouter><div className="app-layout app-layout--dark"><main className={`app-main ${wishlist?'app-main--wishes':''}`}>
  <article className={`app-page ${wishlist?'wishes-page':'sphere-page--tabbed'}`}>
    <div className={wishlist?'wishes-page__profile-controls':'sphere-page__content tabbed-sphere'}>
      <div className={`sphere-tabs__content ${variant==='nested'?'page-stack':''}`}>
        {variant==='nested'&&<header className="not-typeset rollapp-body page-toolbar w-full justify-center"><Actions/></header>}
        <section className={variant==='narrow'?'mx-auto w-full max-w-(--layout-form-width)':variant==='report'?'identity-report-manager':variant==='text'?'sphere-text-page page-stack':'w-full'}>
          {variant==='collection'?<EducationSectionHeader title="Курсы" titleId="courses" selectedList={{id:'courses',title:'Курсы'}} onAdd={()=>{}} onEditList={()=>{}}/>
            :variant==='contacts-real'?<ContactsProfileControls onAdd={()=>{}}/>
            :variant==='wishlist-real'?<WishesProfileControls selectedList={{id:'personal',title:'Личный список'}} selectedSpace="products" onAdd={()=>{}} onEditList={()=>{}}/>
            :variant!=='nested'&&<header className="not-typeset rollapp-body page-toolbar w-full justify-center"><Actions/></header>}
          {variant==='collection'&&<EducationListNavigation items={[]} lists={[{id:'courses',title:'Очень длинное название списка курсов, которое занимает несколько строк'},{id:'archive',title:'Архив'}]} selectedListId="courses" ariaLabel="Списки курсов" onCreateList={()=>{}} onSelectList={()=>{}}/>}
          {variant==='wishlist-real'&&<WishListNavigation value="personal"><ToggleGroup className="contents" value={['personal']} aria-label="Списки желаний"><ToggleGroupItem data-list-tile value="personal" aria-label="Личный список, 999, приватный"><ListTileContent title="Очень длинное название личного списка желаний" count={999} privateList/></ToggleGroupItem><ToggleGroupItem data-list-tile value="archive" aria-label="Архив, 0"><ListTileContent title="Архив" count={0}/></ToggleGroupItem></ToggleGroup></WishListNavigation>}
          {variant==='wishlist-real'&&<div className="hidden md:block" data-day-tile-comparison><PlanningDayRibbon selected="2026-10-25" today="2026-10-25" onChange={()=>{}}/></div>}
          {variant==='nested'&&<article className="typeset typeset-rollapp typeset-document" data-nested-content><h3>Каков этот мир?</h3></article>}
          <p className="rollapp-body mt-6" data-content-copy>Содержимое страницы сохраняет стандартный отступ.</p>
          {Array.from({length:24},(_,index)=><p className="rollapp-body mt-6" key={index}>Проверка вертикальной прокрутки: действия перемещаются вместе с содержимым страницы.</p>)}
        </section>
      </div>
    </div>
  </article>
</main></div></BrowserRouter>;}
createRoot(document.getElementById('root')).render(<Fixture/>);
