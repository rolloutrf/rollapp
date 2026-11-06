// UI-only fixture: APIs are forbidden by the smoke runner.
import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Link, Route, Routes, useNavigate } from 'react-router-dom';
import { ContentPage } from '../../src/components/content-page';
import { AppShell, CatalogBusinessDirectoryScope, CatalogWishDetailsContent, CollectionNavigationProvider, GlobalAppChrome, SessionContext, WishCatalogPage } from '../../src/App.jsx?mobile-page-test-export';
import { api } from '../../src/api.js';
import { buttonVariants } from '../../src/components/ui/button';
import { APP_WISH_CATALOG_PATH } from '../../src/lib/app-routing.js';
import '../../src/styles.css';
import '../../src/index.css';
const base = '/__mobile-page-smoke';
const item = {id:'fixture',space:'places',title:'Карточка места',description:Array(80).fill('Описание карточки для проверки обычной прокрутки страницы.').join(' '),price:100,currency:'RUB',owners:[]};
function Detail() {
  const navigate=useNavigate();
  return <ContentPage title="Каталог" onBack={()=>navigate(-1)} className="catalog-item-page"><CatalogWishDetailsContent screen item={item} onToggleWishlist={()=>{}} /></ContentPage>;
}

const feed = window.catalogFeedTest = { requests: [], holdNext: false, release: null, failNext: false, emptyNext: false };
const directory = window.businessDirectoryTest = { requests: [] };
api.get = async (path) => {
  const url = new URL(path, location.origin);
  if (url.pathname.startsWith('/wishlist-business/')) {
    directory.requests.push(path);
    if (path === '/wishlist-business/products/accounts') {
      return { accounts: [{ username: 'seller-fixture', name: 'Аккаунт продавца', avatarUrl: '', storefrontTitle: null }] };
    }
    if (path === '/wishlist-business/events/accounts') return { accounts: [] };
    if (path === '/wishlist-business/food/accounts') throw new Error('Временная ошибка списка продавцов');
  }
  if (url.pathname !== '/catalog') throw new Error(`Unexpected fixture request: ${url.pathname}`);
  const query = url.searchParams;
  const offset = Number(query.get('offset'));
  const limit = Number(query.get('limit'));
  const brand = query.get('brand');
  feed.requests.push({ offset, brand });
  if (feed.holdNext) {
    feed.holdNext = false;
    await new Promise((resolve) => { feed.release = resolve; });
  }
  if (feed.failNext) {
    feed.failNext = false;
    throw new Error('Временная ошибка каталога');
  }
  const total = brand ? 1 : 103;
  const items = feed.emptyNext ? [] : Array.from({ length: Math.min(limit, total - offset) }, (_, index) => ({
    id: `${brand || 'community'}-${offset + index}`,
    title: brand ? 'Карточка бренда' : `Карточка каталога ${offset + index + 1}`,
    space: 'products',
    source: brand ? 'ohmywishes' : undefined,
    price: 100,
    currency: 'RUB',
    owners: [{ id: 'owner', name: 'Участник', username: 'owner' }],
    ownerCount: 1,
  }));
  feed.emptyNext = false;
  return { items, total };
};

function Feed() {
  return <SessionContext.Provider value={{ user: { id: 'viewer' } }}>
    <div className="app-layout app-layout--dark">
      <main className="app-main app-main--with-profile app-main--wishes">
        <Link to="?source=brands&brand=fixture">Открыть бренд</Link>
        <WishCatalogPage />
      </main>
    </div>
  </SessionContext.Provider>;
}

function Directory() {
  return <SessionContext.Provider value={{ user: { id: 'viewer' } }}>
    <CollectionNavigationProvider>
      <CatalogBusinessDirectoryScope>
        <GlobalAppChrome />
        <AppShell><WishCatalogPage /></AppShell>
      </CatalogBusinessDirectoryScope>
    </CollectionNavigationProvider>
  </SessionContext.Provider>;
}

createRoot(document.getElementById('root')).render(<BrowserRouter><Routes><Route path={base} element={<Link className={buttonVariants()} to={`${base}/item/fixture`}>Открыть карточку</Link>} /><Route path={`${base}/item/:id`} element={<Detail />} /><Route path={`${base}/feed`} element={<Feed />} /><Route path={APP_WISH_CATALOG_PATH} element={<Directory />} /><Route path="/seller-fixture/products" element={<h1>Профиль продавца</h1>} /></Routes></BrowserRouter>);
