import React from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { WorkoutCard } from '../../src/components/workouts.jsx?snippet-badge-test';
import { CardDragHandle } from '../../src/components/card-drag-handle';
import '../../src/styles.css';
import '../../src/index.css';
const noop=()=>{};
const readOnly=new URLSearchParams(location.search).has('readonly');
createRoot(document.getElementById('root')).render(<MemoryRouter><main className="app-layout app-layout--dark"><div className="app-page"><ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">{['completed','planned','skipped'].map((status,index)=>{
 const workout={id:String(index),title:'Тренировка в бассейне',workoutType:'swimming',status,relatedItems:[]};
 return <li className="education-card min-w-0" key={status}>{!readOnly&&<CardDragHandle title={workout.title}/>}<WorkoutCard workout={workout} draggable={!readOnly} lists={[]} onCreateList={noop} onDelete={noop} onEdit={noop} onMove={noop} onMoveToList={noop}/></li>;
})}</ul></div></main></MemoryRouter>);
