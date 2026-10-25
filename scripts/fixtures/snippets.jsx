import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { CourseCard, COURSE_STATUS } from '@/components/courses.jsx?snippet-audit';
import { ConferenceCard, CONFERENCE_STATUS } from '@/components/conferences.jsx?snippet-audit';
import { CoachingSessionCard, SESSION_STATUS } from '@/components/coaching-sessions.jsx?snippet-audit';
import { WorkoutCard, WORKOUT_STATUS } from '@/components/workouts.jsx?snippet-audit';
import { MedicationCard, MEDICATION_STATUS } from '@/components/medications.jsx?snippet-audit';
import { CollectionSnippetMedia } from '@/components/collection-snippet-media';
import { useCardReorder } from '@/hooks/use-card-reorder';
import { CardDragHandle } from '@/components/card-drag-handle';
import { SphereSharingContext } from '@/lib/sphere-sharing';
import { Waves } from 'lucide-react';
import '../../src/styles.css';
import '../../src/index.css';

const kinds = {
 courses: { Card:CourseCard, prop:'course', statuses:COURSE_STATUS },
 conferences: { Card:ConferenceCard, prop:'conference', statuses:CONFERENCE_STATUS },
 coaching: { Card:CoachingSessionCard, prop:'session', statuses:SESSION_STATUS },
 workouts: { Card:WorkoutCard, prop:'workout', statuses:WORKOUT_STATUS },
 medications: { Card:MedicationCard, prop:'medication', statuses:MEDICATION_STATUS },
};
const long = 'ОченьДлинноеНазваниеБезПробелов'.repeat(5);
const calls = [];
const call = (action, id) => calls.push({action,id});
window.snippetAudit = { calls };
function Fixture() {
 const params = new URLSearchParams(location.search), kind = params.get('kind') || 'courses';
 const {Card,prop,statuses} = kinds[kind], readOnly = params.has('readonly'), busy=params.has('busy');
 const [overrides,setOverrides] = useState({});
 const [order,setOrder] = useState(null);
 const [sources,setSources] = useState(['/__snippet-assets/good-a.svg']);
 window.snippetAudit.changeMedia = (id,src) => setOverrides(current=>({...current,[id]:src}));
 window.snippetAudit.changeSources = setSources;
 const items = Object.entries(statuses).map(([status],i)=>{
  const image = i===0 ? '/__snippet-assets/good-a.svg' : i===1 ? '/__snippet-assets/broken.svg' : '';
  return {id:`${kind}-${i}`,status,title:i===0?'Go Practive':long,name:i===0?'Название препарата':long,provider:long,coach:long,location:long,
   logoUrl:overrides[`${kind}-${i}`] ?? image,imageUrl:overrides[`${kind}-${i}`] ?? image,
   url:kind==='courses'||kind==='coaching'?'/snippet-destination':'',description:'Описание '+long+' '+long,
   role:'attendee',format:'offline',startsOn:'2026-08-14',endsOn:'2026-10-25',startedOn:i===0?'':'2026-08-14',completedOn:'2026-10-25',
   sessionOn:'2026-10-25',sessionTime:'10:30',durationMinutes:60,workoutOn:'2026-10-25',workoutType:'swimming',
   medicationForm:'capsule',dosage:long,frequency:'custom',scheduleTimes:['08:00','20:00'],purpose:long,prescriber:long,instructions:'Инструкция '+long,notes:'Заметки '+long,...(i===0?{description:'',provider:'',coach:'',location:'',dosage:'',purpose:'',instructions:'',notes:''}:{})};
 });
 const orderedItems = order ? order.map(id=>items.find(item=>item.id===id)) : items;
 const drag = useCardReorder({items:orderedItems,onItemsChange:next=>setOrder(next.map(item=>item.id)),persistOrder:async ids=>call('persist',ids),getItemLabel:item=>item.title,collectionLabel:'сниппетов',disabled:readOnly||busy||kind==='medications',scopeKey:kind});
 const props = item => ({[prop]:item,lists:[],groups:[],draggable:!readOnly,moveDisabled:busy,moving:busy,
  onEdit:()=>call('open',item.id),onMove:drag.moveByOffset,onCreateList:()=>call('create-list',item.id),onCreateGroup:()=>call('create-group',item.id),onDelete:()=>call('delete',item.id),onMoveToList:()=>call('move',item.id),onMoveToGroup:()=>call('move',item.id)});
 return <MemoryRouter><SphereSharingContext.Provider value={{readOnly}}>
  <div className="app-layout app-layout--dark"><main className="app-main"><div className="app-page rollapp-body">
   <ul className="grid list-none grid-cols-2 gap-x-3 gap-y-7 lg:grid-cols-4" data-snippet-grid ref={drag.listRef}>
    {orderedItems.map(item=><li className={`education-card is-draggable min-w-0 rounded-xl ${drag.draggedId===item.id?"is-dragging":""}`} onPointerDown={event=>drag.beginPointerDrag(event,item.id)} data-sortable-card-id={item.id} key={item.id} data-audit-card={item.id} data-status={item.status}>
     {!readOnly && kind!=='medications' && <CardDragHandle title={item.title} disabled={busy} />}
     <Card {...props(item)} />
    </li>)}
   </ul>
   <div className="mt-6 w-40" data-media-runtime><CollectionSnippetMedia sources={sources} icon={Waves} /></div>
  </div></main></div>
 </SphereSharingContext.Provider></MemoryRouter>;
}
createRoot(document.getElementById('root')).render(<Fixture />);
