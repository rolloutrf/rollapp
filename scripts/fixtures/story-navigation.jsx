import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { PersistentProfileHero, ProfileEditorContext, ToastContext } from '@/App.jsx?story-navigation';
import { MobileFormPages } from '@/components/mobile-form-pages';
import { useVisualViewport } from '@/hooks/use-visual-viewport';
import '../../src/styles.css';
import '../../src/index.css';
function Fixture() {
  useVisualViewport();
  return <ToastContext.Provider value={()=>{}}><ProfileEditorContext.Provider value={{openProfileEditor:()=>{window.__profile=true;}}}><MobileFormPages>
    <main className="app-layout--dark"><PersistentProfileHero user={{id:'owner',name:'Владелец',username:'owner',accountType:'personal'}} /></main>
  </MobileFormPages></ProfileEditorContext.Provider></ToastContext.Provider>;
}
createRoot(document.getElementById('root')).render(<BrowserRouter><Fixture /></BrowserRouter>);
