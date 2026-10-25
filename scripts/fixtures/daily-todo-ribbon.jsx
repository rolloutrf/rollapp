import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, useSearchParams } from 'react-router-dom';
import { RelatedChoiceCard } from '@/components/planning-related-card';
import { PlanningDailyTodo } from '@/components/planning-daily-todo';
import { PlanningCalendar } from '@/components/planning-calendar';
import { PlanningSpaceMenu } from '@/components/planning-space-switcher';
import { TaskEditor } from '@/components/planning-space.jsx?drawer-smoke-export=TaskEditor';
import { MobileFormPages } from '@/components/mobile-form-pages';
import { useVisualViewport } from '@/hooks/use-visual-viewport';
import { localDateKey } from '../../shared/planning.js';
import '../../src/styles.css';
import '../../src/index.css';
import '../../src/components/planning-space.css';
function RelatedCardsFixture(){
 const [selected,setSelected]=useState(true);
 const [previewIds,setPreviewIds]=useState(Array.from({length:12},(_,i)=>i));
 const imageUrl='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><rect width="300" height="300" fill="white"/><text x="150" y="185" text-anchor="middle" font-size="110" font-weight="bold" fill="black">GO</text></svg>');
 const item={kind:'course',id:'course-preview',title:'Go Practive',snippet:'Образование · курсы',imageUrl};
 return <div className="app-layout--dark" style={{padding:16,maxWidth:576}}><div className="planning-related__choices"><RelatedChoiceCard item={item} selected={selected} onToggle={()=>setSelected(v=>!v)}/></div><div className="daily-todo__composer-related planning-related__selected" style={{marginTop:24}}>{previewIds.map(id=><RelatedChoiceCard key={id} item={{...item,id:`preview-${id}`,title:`Go Practive ${id}`,imageUrl:id===11?undefined:imageUrl}} selected removable preview onToggle={()=>setPreviewIds(ids=>ids.filter(value=>value!==id))}/>)}</div></div>;
}
function OutcomeEditorFixture(){
 useVisualViewport();
 const [saved,setSaved]=useState(null),[open,setOpen]=useState(false);
 return <><button onClick={()=>setOpen(true)}>Открыть тестовую задачу</button><output hidden data-saved-outcomes>{JSON.stringify(saved)}</output>{open&&<TaskEditor task={saved?{id:'fixture-task',...saved}:{title:'Старая задача',description:'Описание без новых полей'}} columns={[{id:'todo',title:'Запланировано',complete:false}]} onClose={()=>setOpen(false)} onSave={async(_id,payload)=>{if(payload.title==='Ошибка сохранения')throw Error('Не удалось сохранить задачу');setSaved(payload);}} onDelete={async()=>{}}/>}</>;
}
function Fixture(){
 useVisualViewport();
 const [saved,setSaved]=useState(null);
 const [edited,setEdited]=useState(null);
 const [editor,setEditor]=useState(null);
 const save=async(id,payload)=>{window.todoSaveCalls ||= []; window.todoSaveCalls.push(structuredClone(payload)); if(payload.title==='Ошибка сохранения')throw Error('Не удалось сохранить задачу');setSaved(payload);};
 const columns=[{id:'todo',title:'Запланировано',complete:false}];
 const [search,setSearch]=useSearchParams();
 const date=search.get('date')||localDateKey(new Date());
 const [spaces,setSpaces]=useState([{id:'main',kind:'todo',title:'Основной To Do-лист'},{id:'work',kind:'todo',title:'Рабочие дела'}]);
 const selectSpace=(id,options)=>setSearch(current=>{const next=new URLSearchParams(current);if(id==='main')next.delete('space');else next.set('space',id);if(options?.replace)next.delete('formScreen');return next;},options);
 const empty=search.has('empty');
 const tasks=empty?[]:search.has('slots')?[
  {id:'untimed-a',title:'Без часа A',dueOn:date,startTime:'',durationMinutes:60,completed:false},
  {id:'untimed-b',title:'Без часа B',dueOn:date,startTime:'',durationMinutes:60,completed:false},
  {id:'early',title:'Утром',dueOn:date,startTime:'09:00',durationMinutes:60,completed:false},
  {id:'later',title:'Позже',dueOn:date,startTime:'10:00',durationMinutes:60,completed:false},
  {id:'done',title:'Готово',dueOn:date,startTime:'11:00',durationMinutes:60,completed:true},
 ]:Array.from({length:30},(_,i)=>({id:`task-${i}`,title:`Задача ${i+1}`,dueOn:date,completed:false}));
 const calendar=search.get("tab")==="calendar";
 return <><div className="app-layout app-layout--dark app-layout--planning"><output hidden data-saved-task>{JSON.stringify(saved)}</output><output hidden data-edited-task>{JSON.stringify(edited)}</output><main className="app-main"><section className="app-page planning-space planning-space--todo"><div className="planning-tools">{calendar?<PlanningCalendar tasks={tasks.slice(0,1)} columns={columns} onSave={save} onEdit={()=>{}} onCreate={()=>{}}/>:<PlanningDailyTodo tasks={tasks} columns={columns} onSave={save} onEdit={setEdited} onCreate={(dueOn,startTime,draft={})=>setEditor({...draft,dueOn,startTime:startTime||"",unscheduled:!startTime,durationMinutes:30,columnId:'todo',completed:false})}/>}</div></section></main><div className="planning-fab-controls" data-has-back data-daily-todo><button className="planning-fab !size-(--layout-control-size)">Назад</button><div className="planning-fab-space"><PlanningSpaceMenu kind="todo" selected={search.get('space')||'main'} onSelect={selectSpace} spaces={spaces} setSpaces={setSpaces} loading={false} error="" reload={()=>{}} createSpace={async title=>{if(title==='Ошибка')throw Error('Не удалось создать список');return {id:'new-todo',kind:'todo',title};}}/></div><button className="planning-fab !size-(--layout-control-size)">Меню</button></div></div>{editor&&<TaskEditor task={editor} columns={columns} onClose={()=>setEditor(null)} onSave={save}/>}</>;
}
createRoot(document.getElementById('root')).render(<BrowserRouter><MobileFormPages>{new URLSearchParams(location.search).has('outcomes')?<OutcomeEditorFixture/>:new URLSearchParams(location.search).has('relatedCards')?<RelatedCardsFixture/>:<Fixture/>}</MobileFormPages></BrowserRouter>);
