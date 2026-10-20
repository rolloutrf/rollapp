import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, useSearchParams } from 'react-router-dom';
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
function Fixture(){
 useVisualViewport();
 const [saved,setSaved]=useState(null);
 const [editor,setEditor]=useState(null);
 const save=async(id,payload)=>{if(payload.title==='Ошибка сохранения')throw Error('Не удалось сохранить задачу');setSaved(payload);};
 const columns=[{id:'todo',title:'Запланировано',complete:false}];
 const [search,setSearch]=useSearchParams();
 const date=search.get('date')||localDateKey(new Date());
 const [spaces,setSpaces]=useState([{id:'main',kind:'todo',title:'Основной To Do-лист'},{id:'work',kind:'todo',title:'Рабочие дела'}]);
 const selectSpace=(id,options)=>setSearch(current=>{const next=new URLSearchParams(current);if(id==='main')next.delete('space');else next.set('space',id);if(options?.replace)next.delete('formScreen');return next;},options);
 const empty=search.has('empty');
 const tasks=empty?[]:Array.from({length:30},(_,i)=>({id:`task-${i}`,title:`Задача ${i+1}`,dueOn:date,completed:false}));
 const calendar=search.get('tab')==='calendar';
 return <><div className="app-layout app-layout--dark app-layout--planning"><output hidden data-saved-task>{JSON.stringify(saved)}</output><main className="app-main"><section className={`app-page planning-space planning-space--${calendar?'calendar':'todo'}`}><div className="planning-tools">{calendar?<PlanningCalendar tasks={tasks.slice(0,1)} columns={columns} onSave={save} onEdit={()=>{}} onCreate={()=>{}}/>:<PlanningDailyTodo tasks={tasks} columns={columns} onSave={save} onEdit={()=>{}} onCreate={dueOn=>setEditor({dueOn,columnId:'todo',completed:false})}/>}</div></section></main><div className="planning-fab-controls" data-has-back data-daily-todo><button className="planning-fab !size-(--layout-control-size)">Назад</button><div className="planning-fab-space"><PlanningSpaceMenu kind="todo" selected={search.get('space')||'main'} onSelect={selectSpace} spaces={spaces} setSpaces={setSpaces} loading={false} error="" reload={()=>{}} createSpace={async title=>{if(title==='Ошибка')throw Error('Не удалось создать список');return {id:'new-todo',kind:'todo',title};}}/></div><button className="planning-fab !size-(--layout-control-size)">Меню</button></div></div>{editor&&<TaskEditor task={editor} columns={columns} onClose={()=>setEditor(null)} onSave={save}/>}</>;
}
createRoot(document.getElementById('root')).render(<BrowserRouter><MobileFormPages><Fixture/></MobileFormPages></BrowserRouter>);
