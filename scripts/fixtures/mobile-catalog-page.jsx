// UI-only fixture: APIs are forbidden by the smoke runner.
import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Link, Route, Routes, useNavigate } from 'react-router-dom';
import { ContentPage } from '../../src/components/content-page';
import { CatalogWishDetailsContent } from '../../src/App.jsx?mobile-page-test-export';
import { buttonVariants } from '../../src/components/ui/button';
import '../../src/styles.css';
import '../../src/index.css';
const base = '/__mobile-page-smoke';
const item = {id:'fixture',space:'places',title:'Карточка места',description:Array(80).fill('Описание карточки для проверки обычной прокрутки страницы.').join(' '),price:100,currency:'RUB',owners:[]};
function Detail() {
  const navigate=useNavigate();
  return <ContentPage title="Каталог" onBack={()=>navigate(-1)} className="catalog-item-page"><CatalogWishDetailsContent screen item={item} onToggleWishlist={()=>{}} /></ContentPage>;
}
createRoot(document.getElementById('root')).render(<BrowserRouter><Routes><Route path={base} element={<Link className={buttonVariants()} to={`${base}/item/fixture`}>Открыть карточку</Link>} /><Route path={`${base}/item/:id`} element={<Detail />} /></Routes></BrowserRouter>);
