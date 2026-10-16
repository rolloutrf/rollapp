import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { PageActionButton } from '@/components/page-action-button';
import { SphereBusinessControls } from '@/components/business-marketplace-page';
import '../../src/styles.css';
import '../../src/index.css';

const variant=new URLSearchParams(location.search).get('variant')||'text';
const wishlist=variant==='wishlist';
const railClass=variant==='report'?'identity-report-manager__actions':'page-actions';
function Actions(){
 const [editing,setEditing]=useState(false);
 const icons=variant==='icons'||(variant==='dynamic'&&editing);
 return <>
 <div className={`${railClass} ${['text','wishlist','narrow','icons','edit','dynamic'].includes(variant)?'wishes-page__hero-actions':''} horizontal-action-scroller`} aria-label="Действия">
  {!icons&&variant!=='edit'&&<PageActionButton>Добавить</PageActionButton>}
  {!icons&&variant!=='short'&&<PageActionButton variant="outline">Редактировать</PageActionButton>}
  {variant!=='short'&&<SphereBusinessControls sphereId="identity"/>}
 </div>
 {variant==='dynamic'&&<button onClick={()=>setEditing(!editing)} data-toggle-actions>Изменить набор действий</button>}
 </>;
}
function Fixture(){return <BrowserRouter><div className="app-layout app-layout--dark"><main className={`app-main ${wishlist?'app-main--wishes':''}`}>
  <article className={`app-page ${wishlist?'wishes-page':'sphere-page--tabbed'}`}>
    <div className={wishlist?'wishes-page__profile-controls':'sphere-page__content tabbed-sphere'}>
      <div className="sphere-tabs__content">
        <section className={variant==='narrow'?'mx-auto w-full max-w-(--layout-form-width)':variant==='report'?'identity-report-manager':variant==='text'?'sphere-text-page page-stack':'w-full'}>
          <header className="not-typeset rollapp-body page-toolbar w-full justify-center"><Actions/></header>
          <p className="rollapp-body mt-6" data-content-copy>Содержимое страницы сохраняет стандартный отступ.</p>
          {Array.from({length:24},(_,index)=><p className="rollapp-body mt-6" key={index}>Проверка вертикальной прокрутки: действия перемещаются вместе с содержимым страницы.</p>)}
        </section>
      </div>
    </div>
  </article>
</main></div></BrowserRouter>;}
createRoot(document.getElementById('root')).render(<Fixture/>);
