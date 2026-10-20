import React from 'react';
import {createRoot} from 'react-dom/client';
import {BrowserRouter} from 'react-router-dom';
import '../../src/components/inline-rich-text-editor.jsx';
import {GlobalAppChrome,PlanningFab,SessionContext,ToastContext,CollectionNavigationContext} from '@/App.jsx?notes-smoke';
import {PlanningNotes} from '@/components/planning-notes';
import {SphereSharingProvider} from '@/lib/sphere-sharing';
import {MobileFormPages} from '@/components/mobile-form-pages';
import {useVisualViewport} from '@/hooks/use-visual-viewport';
import '../../src/styles.css';
import '../../src/index.css';
const params=new URLSearchParams(location.search);
const user={id:'notes-fixture-owner',canDiscoverSpheres:true,accountType:'personal'};
// Unsaved presentation props only. The runner rejects every real /api request.
const notes=params.has('empty')?[]:[{id:'first',title:'Мысли и идеи',content:'Первый абзац\n\n## План\n\n- [ ] Записать мысль\n\n'+Array.from({length:20},(_,i)=>`Абзац ${i+1}: заметки сохраняют обычную прокрутку страницы.`).join('\n\n')},{id:'second',title:'Другая заметка',content:'Второй документ'}];
window.notesTest={saves:[],deleted:[],fail:false,loadFail:params.has('error'),delay:false,pending:[]};
const client={
 async get(path){if(window.notesTest.loadFail)throw new Error('Не удалось загрузить заметки.');const id=path.split('/')[3];if(!id)return{notes:notes.map(({content,...note})=>note)};const note=notes.find(note=>note.id===id);if(!note)throw new Error('Заметка не найдена.');return{note:{...note}};},
 async post(path,body){if(window.notesTest.delayCreate)await new Promise(resolve=>{window.notesTest.finishCreate=resolve;});const note={id:'created',...body};notes.unshift(note);window.notesTest.createdDone=true;return{note};},
 async patch(path,body){window.notesTest.saves.push({...body});if(window.notesTest.delay)await new Promise(resolve=>window.notesTest.pending.push(resolve));if(window.notesTest.fail)throw new Error('Соединение потеряно. Текст остался в черновике.');const note=notes.find(note=>note.id===path.split('/')[3]);Object.assign(note,body);return{note:{...note}};},
 async delete(path){if(window.notesTest.delayDelete)await new Promise(resolve=>{window.notesTest.finishDelete=resolve;});const id=path.split('/')[3];window.notesTest.deleted.push(id);notes.splice(notes.findIndex(note=>note.id===id),1);window.notesTest.deletedDone=true;return{ok:true};}
};
function Fixture(){useVisualViewport();return <SessionContext.Provider value={{user}}><ToastContext.Provider value={()=>{}}><CollectionNavigationContext.Provider value={{collection:null}}><SphereSharingProvider currentUser={user} scope={null} search={location.search}><MobileFormPages><GlobalAppChrome/><PlanningFab/><div className="app-layout app-layout--dark"><main className="app-main app-main--with-profile"><div className="app-shell-chrome-spacer"/><PlanningNotes client={client}/></main></div></MobileFormPages></SphereSharingProvider></CollectionNavigationContext.Provider></ToastContext.Provider></SessionContext.Provider>;}
createRoot(document.getElementById('root')).render(<BrowserRouter><Fixture/></BrowserRouter>);
