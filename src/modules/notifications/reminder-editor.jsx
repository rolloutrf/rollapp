import { useId, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { Drawer, DrawerClose, DrawerContent, DrawerFooter, DrawerSectionHeader } from '@/components/form-surface';
import { EditorDeleteAction } from '@/components/editor-delete-action';
import { Button } from '@/components/ui/button';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { PlanningDatePicker } from '@/modules/planning/planning-date-picker.jsx';
import { api } from '@/modules/runtime/api.js';

export function ReminderEditor({ reminder, timeZone, onAfterClose }) {
  const id = useId();
  const [requestId] = useState(() => reminder?.id ?? crypto.randomUUID());
  const heading = useRef(null);
  const today = new Intl.DateTimeFormat('sv-SE', { timeZone, dateStyle: 'short' }).format(new Date());
  const [open, setOpen] = useState(true);
  const [draft, setDraft] = useState(() => reminder ? {
    title: reminder.title, startOn: reminder.startOn, remindAt: reminder.remindAt, repeatsDaily: reminder.repeatsDaily,
  } : { title: '', startOn: today, remindAt: '', repeatsDaily: false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const path = reminder ? `/notifications/reminders/${reminder.id}` : '/notifications/reminders';
  const change = (name, value) => setDraft(current => ({ ...current, [name]: value }));

  async function save(event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      if (reminder) await api.patch(path, draft);
      else await api.post(path, { ...draft, id: requestId, timeZone });
      setOpen(false);
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  return <Drawer open={open} onOpenChange={value => { if (!busy) setOpen(value); }} onAfterClose={onAfterClose}>
      <DrawerContent className="app-drawer--form rollapp-body" aria-labelledby={`${id}-heading`} initialFocus={heading}>
        <DrawerSectionHeader title={reminder ? 'Редактировать напоминание' : 'Новое напоминание'} titleId={`${id}-heading`} titleRef={heading}
          endAction={<DrawerClose render={<Button data-control-icon type="button" variant="outline" size="icon" disabled={busy} />} aria-label="Закрыть редактор напоминания"><X aria-hidden="true" /></DrawerClose>} />
        <form className="flex min-h-0 flex-1 flex-col" onSubmit={save}>
          <div className="app-drawer-body">
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor={`${id}-title`}>О чём напомнить</FieldLabel>
                <Input id={`${id}-title`} value={draft.title} onChange={event => change('title', event.target.value)}
                  required maxLength={160} disabled={busy} placeholder="Например, полить цветы" />
              </Field>
              <Field>
                <FieldLabel htmlFor={`${id}-day`}>{draft.repeatsDaily ? 'Начать с даты' : 'Дата'}</FieldLabel>
                <PlanningDatePicker id={`${id}-day`} value={draft.startOn} label="Дата напоминания" disabled={busy}
                  min={reminder && reminder.startOn < today ? reminder.startOn : today} onChange={value => change('startOn', value)} className="w-full" />
              </Field>
              <Field>
                <FieldLabel htmlFor={`${id}-time`}>Время</FieldLabel>
                <Input id={`${id}-time`} type="time" value={draft.remindAt} onChange={event => change('remindAt', event.target.value)} required disabled={busy} />
                <p className="text-xs text-muted-foreground">Часовой пояс: {timeZone}</p>
              </Field>
              <label className="flex min-h-12 cursor-pointer items-center justify-between gap-3">
                <span>Повторять каждый день</span>
                <Switch checked={draft.repeatsDaily} disabled={busy} onCheckedChange={value => change('repeatsDaily', value)} />
              </label>
              {error && <p role="alert" className="text-destructive">{error}</p>}
            </FieldGroup>
          </div>
          <DrawerFooter>
            <Button type="submit" disabled={busy || !draft.title.trim() || !draft.remindAt}>Сохранить</Button>
            {reminder && <EditorDeleteAction label="Удалить напоминание" title="Удалить напоминание?"
              description={<span className="wrap-anywhere">{reminder.title}</span>} disabled={busy} onBusyChange={setBusy}
              onDelete={() => api.delete(path)} onDeleted={() => setOpen(false)} />}
          </DrawerFooter>
        </form>
      </DrawerContent>
    </Drawer>;
}
