import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { StoryAvatar } from '@/components/story-avatar';
import { MobileFormPages } from '@/components/mobile-form-pages';
import { useVisualViewport } from '@/hooks/use-visual-viewport';
import { api } from '@/api';
import '../../src/styles.css';
import '../../src/index.css';
// Explicit test-only transport; never invoked outside this fixture. No API/DB calls.
api.uploadStory = async blob => { window.__uploads = (window.__uploads || 0) + 1; window.__uploadedSize = blob.size; if (window.__uploadFails) throw new Error('Ошибка публикации'); return { id: 'fixture' }; };
function Fixture() {
  useVisualViewport();
  return <MobileFormPages><main className="app-page rollapp-body page-stack">
    <h1>Сторис</h1>
    <StoryAvatar user={{ username: 'owner', name: 'Владелец' }} own onEditProfile={() => { window.__profile = true; }}><span style={{ width: 72, height: 72, display: 'grid', placeItems: 'center', borderRadius: '50%', background: 'var(--muted)' }}>Я</span></StoryAvatar>
    <StoryAvatar user={{ username: 'visitor', name: 'Гость' }}><span>Гость</span></StoryAvatar>
  </main></MobileFormPages>;
}
createRoot(document.getElementById('root')).render(<BrowserRouter><Fixture /></BrowserRouter>);
