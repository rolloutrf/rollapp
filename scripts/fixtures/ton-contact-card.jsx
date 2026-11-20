import React from 'react';
import { createRoot } from 'react-dom/client';
import { ContactCardButton } from '../../src/modules/contacts/contact-card-dialog.jsx';
import { useVisualViewport } from '../../src/hooks/use-visual-viewport.js';
import '../../src/styles.css';
import '../../src/index.css';
window.walletTest = {mode:'success',signs:0,transactions:[]};
function Fixture() {
  useVisualViewport();
  const guest = new URLSearchParams(location.search).has('guest');
  const profile = { name: 'Тестовый 😀', username: 'synthetic-user', profileSlug: guest ? 'тестовый-профиль' : undefined };
  return <main className="app-page rollapp-body"><ContactCardButton profile={profile} canSign={!guest} /></main>;
}
createRoot(document.getElementById('root')).render(<Fixture />);
