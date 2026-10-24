import React from 'react';
import { createRoot } from 'react-dom/client';
import { LabReportPanel } from '@/components/lab-results';
import '../../src/styles.css';
import '../../src/index.css';

const items = [
  { name: 'Гематокрит', code: 'HCT', value: '42.5', unit: '%', reference: '39 - 49', status: 'normal' },
  { name: 'Гемоглобин', code: 'HGB', value: '160', unit: 'г/л', reference: '120 - 150', status: 'high' },
  { name: 'Лейкоциты', code: 'WBC', value: '5.1', reference: '4 - 9', status: 'normal' },
];
createRoot(document.getElementById('root')).render(
  <main className="app-page not-typeset rollapp-body">
    <LabReportPanel report={{ groups: [{ id: 'blood', title: 'Общий анализ крови', items }] }} />
  </main>,
);
