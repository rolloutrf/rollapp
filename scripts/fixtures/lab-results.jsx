import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { LabReportPanel, LabResults } from '@/components/lab-results';
import { api } from '@/api';
import { SphereSharingContext } from '@/lib/sphere-sharing';
import '../../src/styles.css';
import '../../src/index.css';

const items = [
  { name: 'Гематокрит', code: 'HCT', value: '42.5', unit: '%', reference: '39 - 49', status: 'normal' },
  { name: 'Гемоглобин', code: 'HGB', value: '160', unit: 'г/л', reference: '120 - 150', status: 'high' },
  { name: 'Лейкоциты', code: 'WBC', value: '5.1', reference: '4 - 9', status: 'normal' },
];
const groups = [{ id: 'blood', title: 'Общий анализ крови', items }];
const params = new URLSearchParams(location.search);
let reports = ['2025-08-15', '2025-08-10', '2025-07-07'].map((date, index) => ({
  id: date,
  date,
  dateLabel: ['15 августа 2025', '10 августа 2025', '7 июля 2025'][index],
  lab: 'Лаборатория',
  groups: [{ ...groups[0], title: `Показатели ${index + 1}` }],
}));
window.labDeletes = [];
api.get = async path => {
  if (path !== '/health/lab-results') throw new Error(`Unexpected GET ${path}`);
  return { reports };
};
api.delete = async path => {
  window.labDeletes.push(path);
  if (window.failLabDelete) throw new Error('Повторите попытку');
  reports = reports.filter(report => path !== `/health/lab-results/${report.id}`);
  return { reports };
};

createRoot(document.getElementById('root')).render(params.has('history') ? (
  <BrowserRouter>
    <SphereSharingContext.Provider value={{ readOnly: params.has('readonly') }}>
      <div className="app-layout app-layout--dark"><main className="app-main"><div className="app-page"><LabResults /></div></main></div>
    </SphereSharingContext.Provider>
  </BrowserRouter>
) : <main className="app-page not-typeset rollapp-body"><LabReportPanel report={{ groups }} /></main>);
