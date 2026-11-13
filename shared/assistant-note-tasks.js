import { z } from 'zod';
import { isPlanningDate } from './planning.js';

export const NOTE_TASKS_PROMPT = 'Выдели задачи из открытой заметки';
export const NOTE_TASK_LIMIT = 8;
export const noteTaskId = z.string().min(1).max(200);
const rowNumber = z.number().int().min(1).max(NOTE_TASK_LIMIT);
const dueOn = z.string().refine(value => value === '' || isPlanningDate(value));
export const noteTaskFields = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(1000),
  dueOn,
}).strict();
const noteTaskSuggestion = noteTaskFields.extend({ excerpt: z.string().trim().max(350) });
export const noteTaskSuggestions = z.object({
  tasks: z.array(noteTaskSuggestion).max(NOTE_TASK_LIMIT),
}).strict();
export const noteTasksReview = z.object({
  noteId: noteTaskId,
  title: z.string().trim().min(1).max(200),
  revision: z.string().regex(/^[a-f0-9]{64}$/),
  batchId: z.uuid(),
  tasks: noteTaskSuggestions.shape.tasks.min(1),
  truncated: z.boolean(),
}).strict();

const distinctRows = rows => new Set(rows.map(({ row }) => row)).size === rows.length;
export const noteTaskEdit = noteTaskFields.partial().extend({ checked: z.boolean().optional() })
  .refine(change => Object.keys(change).length > 0);
export const noteTaskRevisionRequest = z.object({
  instruction: z.string().trim().min(1).max(500),
  rows: z.array(noteTaskFields.extend({
    row: rowNumber, checked: z.boolean(), title: z.string().trim().max(200),
  })).min(1).max(NOTE_TASK_LIMIT).refine(distinctRows),
}).strict();
export const noteTaskRevisions = z.object({
  changes: z.array(z.object({ row: rowNumber, change: noteTaskEdit }).strict())
    .max(NOTE_TASK_LIMIT).refine(distinctRows),
}).strict();
export const noteTasksApply = noteTasksReview.pick({ noteId: true, revision: true, batchId: true }).extend({
  tasks: z.array(noteTaskFields.extend({ row: rowNumber })).min(1).max(NOTE_TASK_LIMIT).refine(distinctRows),
});
export const planningNotePath = id => '/app/planning?' + new URLSearchParams({ tab: 'notes', note: id });
