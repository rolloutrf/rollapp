import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Toaster } from 'sonner';
import { PlanningKanban } from '@/components/planning-kanban';
import { movePlanningTask } from '../../shared/planning.js';
import '../../src/styles.css';
import '../../src/index.css';
import '../../src/components/planning-space.css';

function Fixture() {
  const params = new URLSearchParams(location.search);
  const [columns, setColumns] = useState(Array.from({ length: Number(params.get('columns') || 6) }, (_, i) => ({ id: `c${i}`, title: `Список ${i + 1}`, collapsed: i === 2, complete: false })));
  const [tasks, setTasks] = useState(params.has('empty') ? [] : Array.from({ length: 18 }, (_, i) => ({ id: `t${i}`, title: `Карточка ${i + 1}`, columnId: i < 15 ? 'c0' : 'c3', archived: false, completed: false })));
  const [calls, setCalls] = useState([]);
  // The persistence boundary returns presentation state only; every network API
  // request is rejected by the runner. No records are created or reordered.
  const api = { patch: async (path, payload) => {
    setCalls(previous => [...previous, { path, payload }]);
    await new Promise(resolve => setTimeout(resolve, Number(params.get('delay') || 150)));
    if (params.has('fail')) throw new Error('Не удалось сохранить порядок');
    const [, id, action] = path.split('/');
    if (path.startsWith('columns/') && action === 'move') {
      const ordered = columns.filter(column => column.id !== id);
      ordered.splice(payload.beforeId ? ordered.findIndex(column => column.id === payload.beforeId) : ordered.length, 0, columns.find(column => column.id === id));
      return { columns: ordered };
    }
    if (path.startsWith('tasks/') && action === 'move') return { tasks: movePlanningTask(tasks, id, payload.columnId, payload.beforeId), columns };
    throw new Error(`Unexpected fixture operation: ${path}`);
  } };
  return <><div className="app-layout app-layout--dark app-layout--planning"><main className="app-main"><section className="app-page planning-space planning-space--kanban"><div className="planning-tools"><PlanningKanban api={api} tasks={tasks} columns={columns} onColumnsChange={setColumns} onTasksChange={setTasks} onSave={() => { throw new Error('Unexpected save'); }} /></div></section></main></div><output hidden data-drag-calls>{JSON.stringify(calls)}</output><output hidden data-task-state>{JSON.stringify(tasks)}</output><Toaster /></>;
}
createRoot(document.getElementById('root')).render(<Fixture />);
