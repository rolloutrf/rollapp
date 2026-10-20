import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { MemoryRouter } from 'react-router-dom';
import { Toaster } from 'sonner';
import { WishesPage, SessionContext, ToastContext, PublicWishGrid } from '../../src/App.jsx?drag-drop-test-export';
import { api } from '../../src/api.js';
import { CardDragHandle } from '../../src/components/card-drag-handle';
import { useCardReorder } from '../../src/hooks/use-card-reorder';
import { PlanningCalendar } from '../../src/components/planning-calendar';
import '../../src/styles.css';
import '../../src/index.css';
import '../../src/components/planning-space.css';

let params = new URLSearchParams(location.search);
let mode = params.get('mode') || 'wishes';
window.dragTest = { calls: [], errors: [] };
const wishes = Array.from({ length: 12 }, (_, i) => ({ id: `w${i}`, title: `Медиа ${i + 1} с длинным названием для проверки переноса текста`, space: 'media', listIds: ['general'], status: 'active', privacy: 'public', imageUrl: '', url: 'https://www.youtube.com/watch?v=dQw4w9WgXc' }));
const dashboard = { wishes, lists: [{ id: 'general', title: 'Мои желания', description: 'Всё, чему я буду рад' }], groups: params.has('groups') ? [{ id: 'g0', title: 'Группа', listId: 'general', space: 'media', wishIds: ['w2', 'w3'] }] : [] };
// Presentation boundary only. The runner rejects every network API request.
api.get = async path => {
  if (path === '/dashboard') return structuredClone(dashboard);
  if (path === '/gift-suggestions') return { items: [] };
  throw new Error(`Unexpected read: ${path}`);
};
api.post = async (path, payload) => {
  if (path === '/wishes/backfill-previews') return { updated: 0 };
  window.dragTest.calls.push({ path, payload });
  return { group: { id: 'new', listId: 'general', space: 'media', wishIds: payload.wishIds || [], title: 'Новая группа' } };
};
api.patch = async (path, payload) => {
  window.dragTest.calls.push({ path, payload });
  if (params.has('hold')) await new Promise((resolve, reject) => { window.dragTest.rejectPendingOrder = () => reject(new Error('Ошибка сохранения')); });
  if (params.has('fail')) throw new Error('Ошибка сохранения');
  if (path === '/wishes/reorder') dashboard.wishes = payload.wishIds.map(id => dashboard.wishes.find(wish => wish.id === id));
  return {};
};
function Collection() {
  const [items, setItems] = useState(wishes);
  const [disabled, setDisabled] = useState(false);
  const [scope, setScope] = useState('initial');
  window.dragTest.switchScope = () => { setScope('other'); setItems(wishes.slice(6)); };
  window.dragTest.disable = () => setDisabled(true);
  const drag = useCardReorder({ scopeKey: scope, items, onItemsChange: setItems, disabled, persistOrder: ids => api.patch('/collection/reorder', { ids }), getItemLabel: item => item.title, collectionLabel: 'карточек', groupingEnabled: true, onCreateGroup: (id, target) => api.post('/collection/groups', { id, target }) });
  return <div className="app-page"><div className="wish-grid" ref={drag.listRef}>{items.map(item => <article key={item.id} data-sortable-card-id={item.id} onPointerDown={event => drag.beginPointerDrag(event, item.id)} className={`education-card ${drag.draggedId === item.id ? 'is-dragging' : ''}`}><CardDragHandle title={item.title} disabled={disabled} /><button data-card-drag-trigger className="w-full touch-pan-y bg-muted p-8">{item.title}</button></article>)}</div><output hidden data-order-busy>{String(drag.orderBusy)}</output></div>;
}
function PublicCollection() {
  const [enabled, setEnabled] = useState(true);
  window.dragTest.disable = () => setEnabled(false);
  return <div className="app-page wishes-page"><PublicWishGrid wishes={wishes} allWishes={wishes} ownerCollection={enabled} onReorder={ids => api.patch('/public/reorder', { wishIds: ids })} onOpen={() => window.dragTest.calls.push({ path: 'open' })} profile={{ username: 'owner' }} lists={dashboard.lists} /></div>;
}
function Calendar() {
  const [tasks, setTasks] = useState([{ id: 't0', title: 'Событие', dueOn: '2026-10-19', startTime: '10:00', durationMinutes: 60, columnId: 'c0', completed: false }]);
  return <PlanningCalendar tasks={tasks} columns={[{ id: 'c0', title: 'Задачи' }]} onEdit={() => {}} onCreate={patch => window.dragTest.calls.push({ path: 'create', payload: patch })} onSave={async (id, patch) => { window.dragTest.calls.push({ path: 'schedule', payload: patch }); setTasks(items => items.map(item => item.id === id ? { ...item, ...patch } : item)); }} />;
}
const root = createRoot(document.getElementById('root'));
let generation = 0;
function render() { root.render(<MemoryRouter key={generation} initialEntries={[mode === 'calendar' ? '/?date=2026-10-19&view=day' : '/app/wishes?tab=media']}><SessionContext.Provider value={{ user: { id: 'owner', username: 'owner' } }}><ToastContext.Provider value={message => window.dragTest.errors.push(message)}><div className="app-layout app-layout--dark"><main className="app-main app-main--wishes">{mode === 'public' ? <PublicCollection /> : mode === 'collection' ? <Collection /> : mode === 'calendar' ? <Calendar /> : <WishesPage version={0} onAdd={() => {}} />}</main></div><Toaster /></ToastContext.Provider></SessionContext.Provider></MemoryRouter>); }
window.dragTest.reset = (query = location.search) => {
  history.replaceState(null, '', `/__drag-drop${query}`);
  params = new URLSearchParams(query); mode = params.get('mode') || 'wishes';
  dashboard.groups = params.has('groups') ? [{ id: 'g0', title: 'Группа', listId: 'general', space: 'media', wishIds: ['w2', 'w3'] }] : [];
  window.dragTest.calls = []; window.dragTest.errors = [];
  dashboard.wishes = [...wishes];
  generation++; flushSync(render); window.scrollTo({ top: 0, behavior: 'instant' });
};
render();
