import React from 'react';
import { createRoot } from 'react-dom/client';
import { IdentityGeneratedDocuments } from '@/components/identity-report-manager';
import '../../src/styles.css';
import '../../src/index.css';

const section = new URLSearchParams(location.search).get('section') === 'gallup' ? 'gallup' : 'hogan';
const report = {
  section,
  documents: [{
    id: 'first', filename: 'report-with-a-long-original-filename.pdf',
    layout: { version: 1, pages: [{ number: 1, blocks: [
      { type: 'heading', level: 3, text: 'СИЛЬНЫЕ СТОРОНЫ' },
      { type: 'paragraph', text: 'Этот абзац извлечён из PDF. Переносы строк исходной страницы объединены, а слова сохранены.' },
      { type: 'paragraph', text: 'Следующий абзац остаётся самостоятельным блоком текста.' },
      { type: 'heading', level: 4, text: 'Результаты' },
      { type: 'table', rows: [['Адаптация', '5'], ['Амбициозность', '84'], ['Межличностная восприимчивость', '1']] },
      { type: 'heading', level: 4, text: 'Пункты исходного отчёта' },
      { type: 'list', ordered: true, items: [{ number: 4, marker: '4.', text: 'Первый показанный пункт.' }, { number: 7, marker: '7.', text: 'Номер из исходного PDF сохранён.' }] },
      { type: 'list', ordered: false, items: [{ marker: '•', text: 'Пункт маркированного списка.' }, { marker: '•', text: 'Ещё один пункт.' }] },
      { type: 'caption', text: 'Copyright из исходного PDF.' },
    ] }, { number: 2, blocks: [
      { type: 'heading', level: 3, text: 'Следующая страница исходного документа' },
      { type: 'paragraph', text: 'Длинная строка: ' + 'CliftonStrengths '.repeat(35) },
      { type: 'paragraph', text: 'https://example.test/' + 'longunbrokensourcetext'.repeat(20) },
    ] }, { number: 3, blocks: [
      { type: 'heading', level: 3, text: 'Обзор результатов по каждой шкале' },
      { type: 'table', headers: ['ШКАЛА', '%', 'ОПРЕДЕЛЕНИЯ ШКАЛ'], rows: [
        ['Hogan Personality Inventory'],
        ['Адаптация', '5', 'Описание первой шкалы из исходного документа.'],
        ['Межличностная восприимчивость', '1', 'Описание второй шкалы из исходного документа, которое занимает несколько строк на небольшом экране.'],
      ] },
    ] }, { number: 4, blocks: [
      { type: 'heading', level: 3, text: 'Оперативный отчёт' },
      { type: 'heading', level: 4, text: 'Hogan Personality Inventory' },
      { type: 'score-chart', rows: [{ label: 'Амбициозность', value: '84', color: '#ffb000' }, { label: 'Межличностная восприимчивость', value: '1', color: '#ffb000' }] },
      { type: 'subscale-charts', columns: ['HPI', 'HDS', 'MVPI'].map((code, index) => ({ code, title: 'Баллы по субшкалам', sections: [{ title: 'Подшкалы исходного документа', rows: [{ label: 'Исходное название подшкалы', cells: [ ['#ffb000', '#ee0030', '#6289b5'][index], '#e6e7e8', '#e6e7e8', '#e6e7e8' ] }, { label: 'Вторая подшкала', cells: Array(4).fill(['#ffb000', '#ee0030', '#6289b5'][index]) }] }] })) },
      { type: 'caption', text: 'Конец исходного документа.' },
    ] }] },
  }],
};

createRoot(document.getElementById('root')).render(
  <div className="app-layout app-layout--dark"><main className="app-main"><div className="app-page"><div className="identity-report-workspace">
    <IdentityGeneratedDocuments report={(typeof __IDENTITY_REPORT_REVIEW__ !== "undefined" && __IDENTITY_REPORT_REVIEW__) || report} />
  </div></div></main></div>,
);
