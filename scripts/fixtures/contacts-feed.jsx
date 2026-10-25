// Explicit UI transport: no requests reach the API or a database.
import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ContactsSpherePage, ToastProvider, SessionContext, ProfileEditorContext, PersistentProfileHero, PublicProfile, CollectionNavigationProvider } from '../../src/App.jsx?contacts-feed-test-export';
import { useVisualViewport } from '../../src/hooks/use-visual-viewport.js';
import { api } from '../../src/api.js';
import '../../src/styles.css';
import '../../src/index.css';
const contacts = Array.from({ length: 145 }, (_, i) => ({ id: String(i), name: `Контакт ${String(i).padStart(3, '0')}`, company: 'Компания', role: 'Дизайнер', favorite: false, links: [] }));
window.feedTest = { requests: [], failNext: false, delay: 0 };
api.get = async (path) => {
  if (path.startsWith('/profile/')) return { profile, lists: [], wishes: [], groups: [], isOwner: false, isFollowing: false, followersCount: 0, followingCount: 0 };
  const query = new URL(path, location.origin).searchParams;
  window.feedTest.requests.push(path);
  const delay = window.feedTest.delay;
  await new Promise((resolve) => setTimeout(resolve, delay || 40));
  if (window.feedTest.failNext) { window.feedTest.failNext = false; throw new Error('Ошибка загрузки'); }
  const matches = contacts.filter((item) => (!query.get('search') || item.name.includes(query.get('search'))) && (!query.get('favorite') || item.favorite));
  const page = Number(query.get('page')), pageSize = Number(query.get('pageSize'));
  return { contacts: matches.slice((page - 1) * pageSize, page * pageSize).map((item) => ({ ...item })), total: matches.length, favoriteTotal: contacts.filter((item) => item.favorite).length, page, pageSize, hasMore: page * pageSize < matches.length, facets: {} };
};
api.patch = async (path, body) => {
  await new Promise((resolve) => setTimeout(resolve, 80));
  if (window.feedTest.failPatch) throw new Error('Не удалось сохранить');
  contacts.find((item) => path === `/contacts/${item.id}/favorite`).favorite = body.favorite;
  return { ok: true };
};
const profile = { name: 'Тестовый Пользователь', username: 'synthetic-user', email: 'private@example.org', bio: 'PRIVATE-BIO', id: 'PRIVATE-ID', notes: 'PRIVATE-NOTES' };
function Fixture() {
  useVisualViewport();
  const publicView = location.pathname.includes('/public/');
  return <BrowserRouter><SessionContext.Provider value={{ user: publicView ? null : profile, loading: false }}><ProfileEditorContext.Provider value={{ openProfileEditor() {} }}><CollectionNavigationProvider><ToastProvider>
    <Routes><Route path="/__contacts-feed/public/:username" element={<PublicProfile />} /><Route path="*" element={<><PersistentProfileHero user={profile} /><ContactsSpherePage /></>} /></Routes>
  </ToastProvider></CollectionNavigationProvider></ProfileEditorContext.Provider></SessionContext.Provider></BrowserRouter>;
}
createRoot(document.getElementById('root')).render(<Fixture />);
