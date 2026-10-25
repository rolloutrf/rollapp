import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { IdentityReportsPage } from '@/components/identity-reports-page';
import { MobileFormPages } from '@/components/mobile-form-pages';
import '../../src/styles.css';
import '../../src/index.css';

// UI-only callbacks. No database, fetch, or uploaded private documents.
const tests = Array.from({ length: 5 }, (_, index) => ({ id: `custom-fixture-${index}`, title: index === 4 ? 'Очень длинное название личностного теста с результатами' : `Тест ${index + 1}` }));
const states = new Map();
window.__identityCalls = [];
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
    if (path.endsWith('/test')) return { deleted: true };
    const section = path.split('/')[3];
    states.delete(section);
    return { mode: 'empty', report: null, files: [] };
  },
  async uploadIdentityReportPdf(section, file) {
    window.__identityCalls.push(['upload', section, file.name]);
    const state = { mode: 'generated', files: [{ id: 'file', filename: file.name, pdfUrl: '#source' }], report: { documents: [{ id: 'file', filename: file.name, layout: { pages: [{ number: 1, blocks: [{ type: 'heading', level: 3, text: 'Результаты теста' }, { type: 'paragraph', text: 'Исходное содержимое загруженного отчёта.' }] }] } }] } };
    states.set(section, state);
    return state;
  },
};
createRoot(document.getElementById('root')).render(<BrowserRouter><MobileFormPages><div className="app-layout app-layout--dark"><main className="app-main"><div className="app-page typeset typeset-rollapp"><IdentityReportsPage client={client} /></div></main></div></MobileFormPages></BrowserRouter>);
