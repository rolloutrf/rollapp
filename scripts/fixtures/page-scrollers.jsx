import React from 'react';
import { createRoot } from 'react-dom/client';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { ListTileContent } from '@/components/list-tile-content';
import { PlanningDayRibbon } from '@/components/planning-day-ribbon';
import { EducationListNavigation } from '@/components/education-lists';
import { IdentityReportNavigation } from '@/components/identity-reports-page';
import { WishListNavigation } from '@/components/wish-list-navigation';
import '../../src/styles.css';
import '../../src/index.css';

const variant = new URLSearchParams(location.search).get('variant');
const count = Number(new URLSearchParams(location.search).get('count') || 8);
const items = Array.from({ length: count }, (_, i) => String(i));
const tiles = items.map(i => <ToggleGroupItem key={i} value={i}><ListTileContent title={`Группа ${i}`} count={12}/></ToggleGroupItem>);
function Collection() {
  if (variant === 'reports') return <section data-report-navigation><Tabs defaultValue="0"><TabsList className="list-tabs mb-0 h-auto! min-w-0 w-full flex-nowrap gap-1 bg-transparent p-0" data-tab-scroller aria-label="Дата исследования">{items.map(i => <TabsTrigger data-report-tile value={i} key={i}><span data-slot="list-tile-label">10 августа 2025</span><span data-slot="list-tile-meta">ЕМЛ, Санкт-Петербург</span></TabsTrigger>)}</TabsList></Tabs></section>;
  if (variant === 'wishlist' || variant === 'public-wishlist') return <WishListNavigation value="0"><ToggleGroup className="contents" defaultValue={['0']}>{tiles}</ToggleGroup></WishListNavigation>;
  if (variant === 'groups') return <EducationListNavigation items={[]} lists={items.map(i=>({id:i,title:`Группа ${i}`}))} selectedListId="0" ariaLabel="Списки" onCreateList={()=>{}} onSelectList={()=>{}}/>;
  if (variant === 'identity') return <Tabs defaultValue="gallup"><IdentityReportNavigation tests={items.map(i=>({id:i,title:`Тест ${i}`}))} onAddTest={()=>{}}/></Tabs>;
  if (variant === 'days') return <PlanningDayRibbon selected="2026-10-25" today="2026-10-26" onChange={()=>{}}/>;
  return <nav className="page-edge-scroller not-typeset mt-6 p-1"><ToggleGroup defaultValue={['0']}>{items.map(i => <ToggleGroupItem key={i} value={i}>Талант {i}</ToggleGroupItem>)}</ToggleGroup></nav>;
}
createRoot(document.getElementById('root')).render(<div className="app-layout app-layout--dark"><main className="app-main"><article className={`app-page ${variant.includes('wishlist') ? `wishes-page ${variant==='public-wishlist'?'public-collection-page':''}` : 'sphere-page--tabbed'}`}><div className="sphere-tabs__content"><section className="mx-auto w-full max-w-(--layout-text-width)"><Collection/><p className="rollapp-body" data-copy>Содержимое страницы</p></section></div></article></main></div>);
