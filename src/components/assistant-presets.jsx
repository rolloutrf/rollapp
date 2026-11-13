import { definePrimitive } from '@ui-sdk/core';
import { usePart, usePrimitive } from '@ui-sdk/react/primitive';
import { ListChecks } from 'lucide-react';
import { useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { ASSISTANT_MESSAGE_LIMIT, ASSISTANT_WISH_EXAMPLE } from '../../shared/messenger-assistant.js';
import { PageActionButton } from './page-action-button';
import { Button } from './ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from './ui/dropdown-menu';

const groups = [
  { label: 'Вишлист', items: [
    { id: 'wish', label: 'Добавить желание', prompt: ASSISTANT_WISH_EXAMPLE },
    { id: 'wishlist', label: 'Открыть вишлист', prompt: 'Открой мой вишлист в Rollapp.' },
  ] },
  { label: 'Планирование', items: [
    { id: 'task', label: 'Подготовить задачу', prompt: 'Подготовь задачу: собрать вопросы к встрече.' },
    { id: 'event', label: 'Подготовить событие', prompt: 'Подготовь событие «Созвон» на завтра в 14:00 на 45 минут.' },
    { id: 'calendar', label: 'Открыть календарь', prompt: 'Открой календарь Rollapp.' },
    { id: 'week', label: 'Составить план на неделю', prompt: 'Посмотри мои задачи и события на ближайшие семь дней. Помоги выбрать три приоритета и предложи, когда ими заняться. Если данных мало, задай вопрос.' },
    { id: 'kanban', label: 'Открыть Kanban-доску', prompt: 'Открой мою Kanban-доску в Rollapp.' },
  ] },
  { label: 'Заметки', items: [
    { id: 'note', label: 'Подготовить заметку', prompt: 'Подготовь заметку «Идеи для выходных»: прогулка, выставка и ужин с друзьями.' },
  ] },
];
const presets = new Map(groups.flatMap(({ items }) => items.map(item => [item.id, item])));

const presetPicker = definePrimitive({
  name: 'rollapp-assistant-presets',
  options: { enabled: 'boolean', onInsert: 'callback' },
  state: options => ({ enabled: options.enabled }),
  sync: options => ({ enabled: options.enabled }),
  api: context => ({
    insertPreset(id) {
      const { enabled, onInsert } = context.options();
      if (enabled && presets.has(id)) onInsert(presets.get(id).prompt);
    },
  }),
  slots: slot => ({ root: slot({}) }),
  agent: {
    actions: ['insertPreset'],
    shown: state => state.enabled,
    items: () => Array.from(presets.values(), ({ id, label }) => ({ value: id, label })),
    closed: true,
  },
});

function appendPrompt(draft, prompt) {
  return draft.trim() ? draft + '\n\n' + prompt : prompt;
}

export function AssistantPresets({ draft, disabled, setDraft, inputRef, children }) {
  const { pathname, search } = useLocation();
  const tab = new URLSearchParams(search).get('tab');
  const quick = pathname === '/app/planning'
    ? (tab === 'notes' ? ['note', 'task', 'week'] : ['task', 'event', 'week'])
    : ['wish', 'calendar', 'task'];
  const canInsert = prompt => !disabled && appendPrompt(draft, prompt).length <= ASSISTANT_MESSAGE_LIMIT;
  const enabled = Array.from(presets.values()).some(({ prompt }) => canInsert(prompt));
  const handle = usePrimitive(presetPicker, {
    enabled,
    onInsert(prompt) {
      if (!canInsert(prompt)) return;
      setDraft(current => {
        const next = appendPrompt(current, prompt);
        return next.length <= ASSISTANT_MESSAGE_LIMIT ? next : current;
      });
    },
  });
  const focusComposer = useRef(false);
  const menu = <DropdownMenu onOpenChange={open => { if (open) focusComposer.current = false; }}>
    <DropdownMenuTrigger render={<Button data-control-icon variant="outline" size="icon" />}
      disabled={!enabled} aria-label="Пресеты запросов" title="Пресеты запросов">
      <ListChecks aria-hidden="true" />
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" sideOffset={8} className="w-64"
      aria-label="Пресеты запросов" finalFocus={() => focusComposer.current ? inputRef.current : true}>
      {groups.map(({ label, items }) => <DropdownMenuGroup key={label}>
        <DropdownMenuLabel>{label}</DropdownMenuLabel>
        {items.map(item => <DropdownMenuItem key={item.id} disabled={!canInsert(item.prompt)} className="whitespace-normal"
          onClick={() => {
            focusComposer.current = true;
            handle.api.insertPreset(item.id);
          }}>{item.label}</DropdownMenuItem>)}
      </DropdownMenuGroup>)}
    </DropdownMenuContent>
  </DropdownMenu>;
  const suggestions = <div data-not-typeset role="group" aria-label="Примеры запросов" className="flex flex-wrap gap-2">
    {quick.map(id => <PageActionButton key={id} type="button" variant="outline" disabled={disabled} onClick={() => {
      handle.api.insertPreset(id);
      inputRef.current?.focus();
    }}>{presets.get(id).label}</PageActionButton>)}
  </div>;
  return usePart(handle, 'root', {}, {
    className: 'messenger-conversation assistant-drawer',
    children: children({ menu, suggestions }),
  }, 'section');
}
