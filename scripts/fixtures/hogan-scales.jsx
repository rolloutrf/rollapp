import React from 'react';
import { createRoot } from 'react-dom/client';
import { IdentityGeneratedDocuments } from '@/components/identity-report-manager';
import '../../src/styles.css';
import '../../src/index.css';

const colors = ['#ffb000', '#ef1234', '#5a80b1'];
const synthetic = { pages: [{ number: 1, blocks: [
  { type: 'heading', level: 3, text: 'Шкалы отчёта' },
  { type: 'score-chart', rows: [
    { label: 'Нулевой результат', value: '0', color: colors[0] },
    { label: 'Промежуточный результат', value: '37', color: colors[1] },
    { label: 'Длинное название шкалы, которое должно полностью переноситься на узком экране ' + 'CliftonStrengthsДлиннаяПодпись'.repeat(5), value: '100', color: colors[2] },
  ] },
  { type: 'rank-chart', cells: Array.from({ length: 34 }, (_, index) => index === 16 ? colors[2] : '#d5d6db') },
  { type: 'subscale-charts', columns: ['HPI', 'HDS', 'MVPI'].map((code, index) => ({
    code, title: 'Баллы по субшкалам', sections: [{ title: 'Группа субшкал', rows: [
      { label: 'Частично заполненная шкала', cells: [colors[index], colors[index], '#d5d6db', '#d5d6db'] },
      { label: 'Полная шкала с длинным названием', cells: Array(5).fill(colors[index]) },
      { label: 'Незаполненная шкала', cells: Array(4).fill('#d5d6db') },
    ] }],
  })) },
  { type: 'paragraph', text: 'Конец графического отчёта.' },
] }] };
const layout = __HOGAN_SCALES_REVIEW__ || synthetic;
const report = { section: 'hogan', documents: [{ id: 'scales', filename: 'Hogan.pdf', layout }] };
const mode = new URLSearchParams(location.search).get('charts');
if (mode === 'multiple') report.documents = [
  { id: 'summary', filename: 'Summary.pdf', layout: { pages: [{ number: 1, blocks: Array.from({ length: 25 }, () => ({ type: 'paragraph', text: 'Длинное текстовое описание перед графиками.' })) }] } },
  ...['Первый', 'Второй'].map((label, index) => ({ ...report.documents[0], id: `scales-${index}`, filename: `${label}-${'ДлинноеИмяФайла'.repeat(9)}.pdf` })),
];
if (mode === 'none') report.documents[0].layout = { pages: [{ number: 1, blocks: [{ type: 'paragraph', text: 'В этом PDF только текст.' }] }] };
createRoot(document.getElementById('root')).render(
  <div className="app-layout app-layout--dark"><main className="app-main"><div className="app-page"><div className="identity-report-workspace">
    <IdentityGeneratedDocuments report={report} />
  </div></div></main></div>,
);
