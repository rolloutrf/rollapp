import { definePrimitive } from '@ui-sdk/core';
import { createAgent } from '@ui-sdk/react/agent';
import { createParts } from '@ui-sdk/react/primitive';
import { FileText, X } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { noteTaskEdit, noteTaskFields, noteTaskRevisions, planningNotePath } from '../../shared/assistant-note-tasks.js';
import { localDateKey } from '../../shared/planning.js';
import { api } from '../api';
import { useIsMobile } from '@/hooks/use-mobile';
import { PlanningDatePicker } from './planning-date-picker';
import { Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from './form-surface';
import { Button, buttonVariants } from './ui/button';
import { Checkbox } from './ui/checkbox';
import { Field, FieldLabel } from './ui/field';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import './assistant-note-tasks.css';

const taskRow = definePrimitive({
  name: 'rollapp-note-task-row',
  options: { rowKey: 'string', onRevise: 'callback' },
  state: options => ({ value: options.rowKey }),
  api: context => ({
    reviseTask(change) {
      const parsed = noteTaskEdit.safeParse(change);
      if (!parsed.success) throw new Error('Некорректная правка задачи.');
      context.options().onRevise(parsed.data);
    },
  }),
  slots: slot => ({ root: slot({}) }),
  agent: { actions: ['reviseTask'] },
});
const { Root: TaskRow } = createParts(taskRow, { root: 'li' });
const noteTaskAgent = createAgent({
  allow: ({ component, action }) => component === 'rollapp-note-task-row' && action === 'reviseTask',
});

export function createNoteTaskRows(tasks) {
  return tasks.map((task, index) => ({ ...task, row: index + 1, checked: true }));
}

export function AssistantNoteTasks({ value, review, onUpdate, onAfterClose }) {
  const [open, setOpen] = useState(true);
  const [instruction, setInstruction] = useState('');
  const [busy, setBusy] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const lock = useRef(false);
  const revisionRequest = useRef(null);
  const heading = useRef(null);
  const id = useId();
  const location = useLocation();
  const mobile = useIsMobile();
  const onSource = location.pathname === '/app/planning' && new URLSearchParams(location.search).get('note') === value.noteId;
  const rows = review.rows;
  const { saved, attempted, stale } = review;
  const rowKey = row => `${id}:${row}`;
  const selected = rows.filter(row => row.checked);
  const canSave = selected.length > 0 && selected.every(row => row.title.trim());
  const date = saved && (selected.some(task => !task.dueOn) ? localDateKey(new Date()) : selected[0]?.dueOn);
  useEffect(() => () => revisionRequest.current?.abort(), []);

  function updateRow(row, change) {
    onUpdate(current => ({
      ...current,
      rows: current.rows.map(item => item.row === row ? { ...item, ...change } : item),
    }));
  }

  function close(nextOpen, details) {
    if (lock.current && !nextOpen) { details?.cancel?.(); return; }
    setOpen(nextOpen);
  }

  async function revise() {
    const content = instruction.trim();
    if (lock.current || attempted || saved || stale || !content) return;
    const controller = new AbortController();
    revisionRequest.current = controller;
    lock.current = true;
    setBusy('revise'); setError(''); setStatus('');
    try {
      const result = await api.post('/messenger/assistant/reply', {
        messages: [{ role: 'user', content }],
        noteTaskRevision: { instruction: content, rows: rows.map(({ excerpt: _excerpt, ...row }) => row) },
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      }, { signal: controller.signal });
      if (controller.signal.aborted) return;
      const parsed = noteTaskRevisions.parse(result);
      const changes = parsed.changes.filter(({ row, change }) => {
        const current = rows.find(item => item.row === row);
        return current && Object.entries(change).some(([key, next]) => current[key] !== next);
      });
      if (!changes.length) {
        setStatus('Уточните номер задачи и что нужно изменить.');
        return;
      }
      const targets = new Map(noteTaskAgent.snapshot()
        .filter(item => item.component === 'rollapp-note-task-row' && !item.offPage)
        .map(item => [item.value, item.ref]));
      const steps = changes.map(({ row, change }) => ({ ref: targets.get(rowKey(row)), action: 'reviseTask', args: [change] }));
      if (steps.some(step => !step.ref)) throw new Error('Черновик больше не открыт.');
      const resultOfActions = await noteTaskAgent.act({ steps });
      if (!resultOfActions.ok) throw new Error('Не удалось применить правки. Проверьте строки.');
      setStatus(`Обновлены строки ${changes.map(({ row }) => row).join(', ')}.`);
      setInstruction('');
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause.message);
    } finally {
      revisionRequest.current = null;
      lock.current = false;
      setBusy('');
    }
  }

  async function apply(event) {
    event.preventDefault();
    if (lock.current || saved || stale || !canSave) return;
    const tasks = attempted || selected.map(({ row, title, description, dueOn }) =>
      ({ row, ...noteTaskFields.parse({ title, description, dueOn }) }));
    lock.current = true;
    setBusy('save'); setError(''); setStatus('');
    onUpdate(current => ({ ...current, attempted: tasks }));
    try {
      const result = await api.post('/planning/tasks/from-note', {
        noteId: value.noteId, revision: value.revision, batchId: value.batchId, tasks,
      });
      if (result?.saved !== tasks.length) throw new Error('Не удалось подтвердить сохранение. Повторите попытку.');
      onUpdate(current => ({ ...current, saved: result.saved }));
    } catch (cause) {
      if ([400, 404, 409].includes(cause.status)) onUpdate(current => ({
        ...current, attempted: null, stale: cause.status === 400 ? null : cause.message,
      }));
      setError(cause.message);
    } finally {
      lock.current = false;
      setBusy('');
    }
  }

  return <Drawer open={open} onOpenChange={close} onAfterClose={onAfterClose}>
    <DrawerContent className="rollapp-body app-drawer--form" aria-labelledby={`${id}-heading`} initialFocus={heading}>
      <DrawerClose render={<Button variant="outline" size="icon" className="absolute top-2 right-2 z-10" disabled={Boolean(busy)} />} aria-label="Закрыть разбор заметки"><X aria-hidden="true" /></DrawerClose>
      <form className="flex min-h-0 flex-1 flex-col" onSubmit={apply}>
        <DrawerHeader className="pr-16 text-left!">
          <DrawerTitle id={`${id}-heading`} tabIndex={-1} ref={heading}>Задачи из заметки</DrawerTitle>
          <DrawerDescription className="flex min-w-0 items-start gap-2 break-words">
            <FileText className="mt-1 size-5 shrink-0" aria-hidden="true" /><span className="min-w-0">{onSource ? value.title : <Link className="underline underline-offset-4" to={planningNotePath(value.noteId)}>{value.title}</Link>} → Основной To Do-лист</span>
          </DrawerDescription>
        </DrawerHeader>
        <div className="app-drawer-body assistant-note-tasks">
          {saved ? <p role="status">Сохранено задач: {saved}.</p> : <>
            {value.truncated && <p className="text-muted-foreground">Ассистент обработал начало длинной заметки.</p>}
            <ol className="assistant-note-tasks__rows" aria-label="Черновики задач">
              {rows.map(({ row, title, description, dueOn, excerpt, checked }) => <TaskRow
                key={row} rowKey={rowKey(row)} onRevise={change => updateRow(row, change)}
                className="assistant-note-tasks__row">
                <label className="flex min-h-12 items-center gap-2">
                  <Checkbox aria-labelledby={`${id}-row-${row}`} checked={checked} disabled={Boolean(busy || attempted || stale)}
                    onCheckedChange={next => updateRow(row, { checked: next === true })} />
                  <span id={`${id}-row-${row}`} className="font-semibold">Задача {row}</span>
                </label>
                {excerpt && <blockquote className="assistant-note-tasks__excerpt">{excerpt}</blockquote>}
                <Field>
                  <FieldLabel htmlFor={`${id}-title-${row}`}>Название</FieldLabel>
                  <Input id={`${id}-title-${row}`} aria-label={`Название задачи ${row}`} maxLength={200} value={title} disabled={Boolean(busy || attempted || stale)}
                    onChange={event => updateRow(row, { title: event.target.value })} />
                </Field>
                <Field>
                  <FieldLabel htmlFor={`${id}-description-${row}`}>Описание</FieldLabel>
                  <Textarea id={`${id}-description-${row}`} maxLength={1000} rows={2} value={description} disabled={Boolean(busy || attempted || stale)}
                    onChange={event => updateRow(row, { description: event.target.value })} />
                </Field>
                <PlanningDatePicker value={dueOn} clearable label={`Срок задачи ${row}`} disabled={Boolean(busy || attempted || stale)}
                  className="min-h-12 justify-self-start" onChange={next => updateRow(row, { dueOn: next })}>
                  <span>{dueOn ? dueOn.split('-').reverse().join('.') : 'Без срока'}</span>
                </PlanningDatePicker>
              </TaskRow>)}
            </ol>
            <Field>
              <FieldLabel htmlFor={`${id}-instruction`}>Что изменить в черновике?</FieldLabel>
              <Input id={`${id}-instruction`} value={instruction} maxLength={500} disabled={Boolean(busy || attempted || stale)}
                placeholder="У второй задачи поставь срок на пятницу" onChange={event => setInstruction(event.target.value)}
                onKeyDown={event => {
                  if (event.key !== 'Enter' || event.nativeEvent.isComposing || event.keyCode === 229) return;
                  event.preventDefault();
                  void revise();
                }} />
              <Button type="button" variant="outline" disabled={Boolean(busy || attempted || stale) || !instruction.trim()} onClick={revise} className="min-h-12 self-start rounded-full">
                {busy === 'revise' ? 'Уточняем…' : 'Уточнить через ассистента'}
              </Button>
            </Field>
            {status && <p role="status">{status}</p>}
          </>}
          {(stale || error) && <p role="alert" className="text-destructive">{stale || error}</p>}
        </div>
        <DrawerFooter>
          {saved ? <Link to={`/app/planning?tab=todo&date=${date}`} data-slot="button" className={buttonVariants()}>Открыть To Do</Link>
            : <Button type="submit" aria-label={!busy && !attempted ? `Сохранить выбранные (${selected.length})` : undefined} disabled={Boolean(busy) || stale || !canSave}>
              {busy === 'save' ? 'Сохраняем…' : attempted ? 'Повторить сохранение' : `${mobile ? 'Сохранить' : 'Сохранить выбранные'} (${selected.length})`}
            </Button>}
        </DrawerFooter>
      </form>
    </DrawerContent>
  </Drawer>;
}

export function NoteTasksSource({ value, saved, onReview }) {
  return <div className="messenger-assistant-action">
    <Link className="underline underline-offset-4" to={planningNotePath(value.noteId)}>{value.title}</Link>
    {onReview && <Button type="button" variant="outline" className="min-h-12 max-w-full rounded-full px-6" onClick={onReview}>
      {saved ? `Сохранено задач: ${saved}` : `Проверить задачи (${value.tasks.length})`}
    </Button>}
  </div>;
}
