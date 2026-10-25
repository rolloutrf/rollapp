import React from 'react';
import { createRoot } from 'react-dom/client';
import { ContactCardButton } from '../../src/components/contact-card-dialog.jsx';
import { useVisualViewport } from '../../src/hooks/use-visual-viewport.js';
import '../../src/styles.css';
import '../../src/index.css';
window.walletTest = {mode:'success',signs:0,transactions:[]};
function Fixture() {
  useVisualViewport();
  return <main className="app-page rollapp-body"><ContactCardButton profile={{name:'Михаил 😀',username:'mikhail'}} canSign={!location.search.includes('guest')} /></main>;
}
createRoot(document.getElementById('root')).render(<Fixture />);
