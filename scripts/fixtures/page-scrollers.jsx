import React from 'react';
import { createRoot } from 'react-dom/client';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { PlanningDayRibbon } from '@/components/planning-day-ribbon';
import { EducationListNavigation } from '@/components/education-lists';
import { IdentityReportNavigation } from '@/components/identity-reports-page';
import { WishListNavigation } from '@/components/wish-list-navigation';
import '../../src/styles.css';
import '../../src/index.css';

const variant = new URLSearchParams(location.search).get('variant');
const count = Number(new URLSearchParams(location.search).get('count') || 8);
const items = Array.from({ length: count }, (_, i) => String(i));
const tiles = items.map(id => ({ id, title: `Группа ${id}`, count: 12 }));
function Collection() {
  if (variant === 'reports') return <WishListNavigation value="0" label="Дата исследования" items={items.map(id => ({ id, title: '10.08.2025', detail: 'ЕМЛ, Санкт-Петербург' }))} onSettings={() => {}} />;
  if (variant === 'wishlist' || variant === 'public-wishlist') return <WishListNavigation value="0" items={tiles} />;
  if (variant === 'groups') return <EducationListNavigation items={[]} lists={items.map(i=>({id:i,title:`Группа ${i}`}))} selectedListId="0" ariaLabel="Списки" onCreateList={()=>{}} onSelectList={()=>{}}/>;
  if (variant === 'identity') return <IdentityReportNavigation selected="gallup" tests={items.map(i=>({id:i,title:`Тест ${i}`}))} />;
  if (variant === 'days') return <PlanningDayRibbon selected="2026-10-25" today="2026-10-26" onChange={()=>{}}/>;
  return <nav className="page-edge-scroller not-typeset mt-6 p-1"><ToggleGroup defaultValue={['0']}>{items.map(i => <ToggleGroupItem key={i} value={i}>Талант {i}</ToggleGroupItem>)}</ToggleGroup></nav>;
}
createRoot(document.getElementById('root')).render(<div className="app-layout app-layout--dark"><main className="app-main"><article className={`app-page ${variant.includes('wishlist') ? `wishes-page ${variant==='public-wishlist'?'public-collection-page':''}` : 'sphere-page--tabbed'}`}><div className="sphere-tabs__content"><section className="mx-auto w-full max-w-(--layout-text-width)"><Collection/><p className="rollapp-body" data-copy>Содержимое страницы</p></section></div></article></main></div>);
