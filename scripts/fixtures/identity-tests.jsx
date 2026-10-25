import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { IdentityReportsPage } from '@/components/identity-reports-page';
import { MobileFormPages } from '@/components/mobile-form-pages';
import { SphereSharingContext } from '@/lib/sphere-sharing';
import '../../src/styles.css';
import '../../src/index.css';

// UI-only callbacks. No database, fetch, or uploaded private documents.
const tests = Array.from({ length: 5 }, (_, index) => ({ id: `custom-fixture-${index}`, title: index === 4 ? 'Очень длинное название личностного теста с результатами' : `Тест ${index + 1}` }));
const states = new Map();
if(new URLSearchParams(location.search).has('limit')) states.set('gallup',{mode:'generated',files:Array.from({length:8},(_,i)=>({id:`limit-${i}`,filename:`Отчёт ${i+1}.pdf`,pdfUrl:'#source'})),report:{documents:[]}});
window.__identityCalls = [];
window.__identityUploadFailures = 0;
const client = {
  async get(path) {
    if (path === '/identity/reports') return { tests: [...tests] };
    return states.get(path.split('/').at(-1)) || { mode: 'empty', report: null, files: [] };
  },
  async post(path, value) {
    window.__identityCalls.push(['create', value.title]);
    if (value.title === 'Ошибка') throw new Error('Не удалось сохранить: повторите попытку');
    const test = { id: `custom-fixture-${tests.length}`, title: value.title };
    tests.push(test);
    return { test };
  },
  async patch(path, value) {
    const test = tests.find(test => path.endsWith(test.id));
    test.title = value.title;
    return { test: { ...test } };
  },
  async delete(path) {
    window.__identityCalls.push(['delete', path]);
    if (path.endsWith('/test')) {
      if (window.__identityFailNextDelete) { window.__identityFailNextDelete = false; throw new Error('Не удалось удалить: повторите попытку'); }
      if (window.__identityHoldDelete) await new Promise(resolve => { window.__identityReleaseDelete = () => { window.__identityHoldDelete = false; window.__identityReleaseDelete = null; resolve(); }; });
      return { deleted: true };
    }
    const section = path.split('/')[3];
    const previous = states.get(section);
    if(path.includes('/files/')) { const id=path.split('/').at(-1);const state={...previous,files:previous.files.filter(file=>file.id!==id),report:{documents:previous.report.documents.filter(doc=>doc.id!==id)}};states.set(section,state);return state; }
    states.delete(section);return { mode: 'empty', report: null, files: [] };
  },
  async uploadIdentityReportPdf(section, file) {
    window.__identityCalls.push(['upload', section, file.name]);
    if(window.__identityFailNextUpload){window.__identityFailNextUpload=false;window.__identityUploadFailures++;throw new Error('Не удалось загрузить PDF');}
    if(window.__identityHoldUpload) await new Promise(resolve=>{window.__identityReleaseUpload=()=>{window.__identityHoldUpload=false;window.__identityReleaseUpload=null;resolve();};});
    const previous=states.get(section),id=`file-${previous?.files?.length||0}`;
    const state = { mode: 'generated', files: [...(previous?.files||[]),{ id, filename: file.name, pdfUrl: '#source' }], report: { documents: [...(previous?.report?.documents||[]),{ id, filename: file.name, layout: { pages: [{ number: 1, blocks: [{ type: 'heading', level: 3, text: 'Результаты теста' }, { type: 'paragraph', text: 'Исходное содержимое загруженного отчёта.' }] }] } }] } };
    states.set(section, state);
    return state;
  },
};
createRoot(document.getElementById('root')).render(<BrowserRouter><SphereSharingContext.Provider value={{readOnly:new URLSearchParams(location.search).has('readonly')}}><MobileFormPages><div className="app-layout app-layout--dark"><main className="app-main"><div className="app-page typeset typeset-rollapp"><IdentityReportsPage client={client} /></div></main></div></MobileFormPages></SphereSharingContext.Provider></BrowserRouter>);
