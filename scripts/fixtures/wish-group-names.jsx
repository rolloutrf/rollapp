import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { WishGroupTile } from '../../src/App.jsx?wish-group-test-export';
import '../../src/styles.css';
import '../../src/index.css';

const titles = ['Джемпер', 'Зимние ботинки', 'Очень длинное название группы желаний для зимних путешествий', 'Сверхдлинноеназваниебезпробелов'.repeat(2), 'Йога, джемперы и уют'];
const readonly = new URLSearchParams(location.search).has('readonly');
function Fixture() {
  const [opened, setOpened] = useState('');
  return <div className="app-layout app-layout--dark"><main className="app-main app-main--wishes">
    <div className="app-page wishes-page">
      <div className="wish-grid">{titles.map((title, index) => <WishGroupTile
        key={title} group={{ id: String(index), title }}
        wishes={Array.from({ length: index + 1 }, (_, i) => ({ id: String(i), title: 'Желание' }))}
        onOpen={() => setOpened(title)}
        onRename={readonly ? undefined : () => { throw new Error('Rename must not save during this check'); }}
      />)}</div>
      <output aria-label="Открытая группа">{opened}</output>
    </div>
  </main></div>;
}
createRoot(document.getElementById('root')).render(<Fixture />);
