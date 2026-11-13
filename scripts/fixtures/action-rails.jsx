import React, { useState } from 'react';
import { PlanningDayRibbon } from '@/components/planning-day-ribbon';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Plus, ArrowRight } from 'lucide-react';
import { PageActionButton } from '@/components/page-action-button';
import { SphereBusinessControls } from '@/components/business-marketplace-page';
import { EducationListNavigation, EducationSectionHeader } from '@/components/education-lists';
import { ContactsProfileControls, WishesProfileControls, WishesPage, AppShell, ProfileEditorProvider, SessionContext, ToastContext } from '../../src/App.jsx?action-rails-export';
import { api } from '@/api';
import { WishListNavigation } from '@/components/wish-list-navigation';
import { InlineDocument } from '@/components/inline-document';
import { MobileFormPages } from '@/components/mobile-form-pages';
import { SphereSharingContext } from '@/lib/sphere-sharing';
import { Workouts } from '@/components/workouts';
import { Courses } from '@/components/courses';
import { Conferences } from '@/components/conferences';
import { CoachingSessions } from '@/components/coaching-sessions';
import { Medications } from '@/components/medications';
import { PerformanceReview } from '@/components/performance-review';
import '../../src/styles.css';
import '../../src/index.css';

const variant=new URLSearchParams(location.search).get('variant')||'text';
const collections = {
  sport: [Workouts, 'workouts'], courses: [Courses, 'courses'], conferences: [Conferences, 'conferences'],
  coaching: [CoachingSessions, 'sessions'], medications: [Medications, 'medications'], performance: [PerformanceReview, 'cycles'],
};

function CollectionFixture({ name }) {
  const [Collection, items] = collections[name];
  let lists = [{ id: 'first', title: 'Первый' }, { id: 'second', title: 'Второй' }];
  const cycles = lists.map((list, index) => ({ ...list, season: 'Осень', year: 2025 - index, projects: [], interaction: [] }));
  api.get = async () => name === 'performance' ? { content: { cycles } } : { [items]: [], lists, groups: lists };
  api.patch = async (path, value) => {
    window.collectionWrites = [...(window.collectionWrites || []), path];
    if (name === 'performance') return { content: value.content };
    const id = path.split('/').at(-1);
    const list = { id, ...value };
    lists = lists.map(item => item.id === id ? list : item);
    return { list, group: list };
  };
  return <BrowserRouter><SphereSharingContext.Provider value={{ owner: { id: 'fixture-owner' }, readOnly: new URLSearchParams(location.search).has('readonly') }}>
    <MobileFormPages><div className="app-layout app-layout--dark"><main className="app-main"><div className="app-page"><Collection /></div></main></div></MobileFormPages>
  </SphereSharingContext.Provider></BrowserRouter>;
}
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
  {variant==='overflow'&&Array.from({length:20},(_,i)=><PageActionButton key={i} variant="outline">Действие {i+1}</PageActionButton>)}
  {!icons&&variant!=='edit'&&<PageActionButton>{variant==='icon-labels'&&<Plus data-icon="inline-start"/>}Добавить</PageActionButton>}
  {!icons&&variant!=='short'&&<PageActionButton variant="outline">Редактировать{variant==='icon-labels'&&<ArrowRight data-icon="inline-end"/>}</PageActionButton>}
  {variant!=='short'&&<SphereBusinessControls sphereId="career"/>}
 </div>
 {variant==='dynamic'&&<button onClick={()=>setEditing(!editing)} data-toggle-actions>Изменить набор действий</button>}
 </>;
}
function Fixture(){if(variant.startsWith('identity-document'))return <BrowserRouter><div className="app-layout app-layout--dark"><main className="app-main"><article className="app-page sphere-text-page page-stack"><InlineDocument scope="identity" documentKey="unsaved-identity-rail" label="Документ идентичности" value="Текст раздела" onSave={async value=>value} addBlock={variant==='identity-document-add'?[{type:'paragraph'}]:undefined}/></article></main></div></BrowserRouter>;if(variant==='wishlist-error')return <BrowserRouter><SessionContext.Provider value={{user:{id:'unsaved',username:'fixture'}}}><ToastContext.Provider value={()=>{}}><ProfileEditorProvider><AppShell wishlistChrome><WishesPage onAdd={()=>{}} version={0}/></AppShell></ProfileEditorProvider></ToastContext.Provider></SessionContext.Provider></BrowserRouter>;return <BrowserRouter><div className="app-layout app-layout--dark"><main className={`app-main ${wishlist?'app-main--wishes':''}`}>
  <article className={`app-page ${wishlist?'wishes-page':'sphere-page--tabbed'}`}>
    <div className={wishlist?'wishes-page__profile-controls':'sphere-page__content tabbed-sphere'}>
      <div className={`sphere-tabs__content ${variant==='nested'?'page-stack':''}`}>
        {variant==='nested'&&<header className="not-typeset rollapp-body page-toolbar w-full justify-center"><Actions/></header>}
        <section className={variant==='narrow'?'mx-auto w-full max-w-(--layout-form-width)':variant==='report'?'identity-report-manager':variant==='text'?'sphere-text-page page-stack':'w-full'}>
          {variant==='collection'?<EducationSectionHeader title="Курсы" titleId="courses" addLabel="Добавить курс" onAdd={()=>{}}/>
            :variant==='contacts-real'?<ContactsProfileControls onAdd={()=>{}}/>
            :variant==='wishlist-real'?<SessionContext.Provider value={{user:{id:'unsaved',username:'fixture',accountType:'business',businessCategory:'seller'}}}><WishesProfileControls selectedSpace="products"/></SessionContext.Provider>
            :variant!=='nested'&&<header className="not-typeset rollapp-body page-toolbar w-full justify-center"><Actions/></header>}
          {variant==='collection'&&<EducationListNavigation items={[]} lists={[{id:'courses',title:'Очень длинное название списка курсов, которое занимает несколько строк'},{id:'archive',title:'Архив'}]} selectedListId="courses" ariaLabel="Списки курсов" onEditList={()=>{}} onSelectList={()=>{}}/>}
          {variant==='wishlist-real'&&<WishListNavigation value="personal" items={[{ id: "personal", title: "Очень длинное название личного списка желаний", count: 999, privateList: true }, { id: "archive", title: "Архив", count: 0 }]} />}
          {variant==='wishlist-real'&&<div className="hidden md:block" data-day-tile-comparison><PlanningDayRibbon selected="2026-10-25" today="2026-10-25" onChange={()=>{}}/></div>}
          {variant==='nested'&&<article className="typeset typeset-rollapp typeset-document" data-nested-content><h3>Каков этот мир?</h3></article>}
          <p className="rollapp-body mt-6" data-content-copy>Содержимое страницы сохраняет стандартный отступ.</p>
          {Array.from({length:24},(_,index)=><p className="rollapp-body mt-6" key={index}>Проверка вертикальной прокрутки: действия перемещаются вместе с содержимым страницы.</p>)}
        </section>
      </div>
    </div>
  </article>
</main></div></BrowserRouter>;}
createRoot(document.getElementById('root')).render(collections[variant] ? <CollectionFixture name={variant} /> : <Fixture />);
