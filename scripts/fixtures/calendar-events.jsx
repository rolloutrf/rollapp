import React, { useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { PlanningCalendar } from '@/components/planning-calendar';
import { TaskEditor } from '@/components/planning-space.jsx?calendar-events-export';
import { MobileFormPages } from '@/components/mobile-form-pages';
import { useVisualViewport } from '@/hooks/use-visual-viewport';
import { Toaster } from '@/components/ui/sonner';
import '../../src/styles.css';
import '../../src/index.css';
const columns=[{id:'todo',title:'Запланировано',complete:false}];
const initial=[
 {id:'long',title:'Встреча с командой',dueOn:'2026-10-02',startTime:'09:00',durationMinutes:135},
 {id:'short',title:'Короткая встреча',dueOn:'2026-10-02',startTime:'12:00',durationMinutes:15},
 {id:'overlap',title:'Пересечение',dueOn:'2026-10-02',startTime:'09:30',durationMinutes:30},
 {id:'untimed',title:'Без времени',dueOn:'2026-10-02',startTime:'',durationMinutes:60},
 {id:'series',title:'Повторение',dueOn:'2026-09-25',startTime:'14:00',durationMinutes:30,recurrence:{frequency:'weekly',until:'2026-10-30'}},
].map(t=>({...t,...(new URLSearchParams(location.search).has('large')&&t.id==='long'?{startTime:'00:00',durationMinutes:1440}:{}),columnId:'todo',description:'Детали события',completed:false}));
function Fixture(){
 useVisualViewport();
 const [tasks,setTasks]=useState(initial),[editor,setEditor]=useState(null),[writes,setWrites]=useState([]),[fail,setFail]=useState(false);
 const pending=useRef(null),hold=useRef(false);
 const save=async(id,patch)=>{if(hold.current)await new Promise(resolve=>{pending.current=resolve;});if(fail)throw Error('Не удалось сохранить событие');setWrites(w=>[...w,{id,patch}]);setTasks(ts=>id?ts.map(t=>t.id===id?{...t,...patch}:t):[...ts,{...patch,id:`new-${ts.length}`}]);};
 return <MobileFormPages><div className="app-layout app-layout--dark app-layout--planning"><main className="app-main"><section className="app-page planning-space planning-space--calendar"><div className="planning-tools"><PlanningCalendar tasks={tasks} columns={columns} onEdit={setEditor} onCreate={s=>setEditor({title:'',columnId:'todo',...s})} onSave={save}/></div></section></main></div>{editor&&<TaskEditor task={editor} columns={columns} onClose={()=>setEditor(null)} onSave={save} onDelete={async id=>{setTasks(ts=>ts.filter(t=>t.id!==id));setWrites(w=>[...w,{delete:id}]);}}/>}<button hidden data-fail onClick={()=>setFail(v=>!v)}/><button hidden data-shift-date onClick={()=>setTasks(ts=>ts.map(t=>t.id==='long'?{...t,dueOn:'2026-10-03'}:t))}/><button hidden data-update onClick={()=>setTasks(ts=>ts.map(t=>({...t})))}/><button hidden data-hold onClick={()=>{hold.current=true;}}/><button hidden data-release onClick={()=>{hold.current=false;pending.current?.();}}/><output hidden data-state>{JSON.stringify({tasks,writes})}</output><Toaster/></MobileFormPages>;
}
createRoot(document.getElementById('root')).render(<BrowserRouter><Fixture/></BrowserRouter>);
