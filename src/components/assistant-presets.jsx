import { definePrimitive } from '@ui-sdk/core';
import { usePart, usePrimitive } from '@ui-sdk/react/primitive';
import { ListChecks } from 'lucide-react';
import { useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { ASSISTANT_MESSAGE_LIMIT, ASSISTANT_SECTIONS, ASSISTANT_WISH_EXAMPLE } from '../../shared/messenger-assistant.js';
import { SPHERE_TABS } from '../../shared/sphere-tabs.js';
import { PageActionButton } from './page-action-button';
import { Button } from './ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger } from './ui/dropdown-menu';

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
const sphereExamples = {
  identity: { label: 'Подготовить вопросы о ценностях', prompt: 'Подготовь заметку «Мои ценности». Включи три вопроса, которые помогут мне вспомнить важные решения и понять, на какие ценности я в них опирался.' },
  health: { label: 'Запланировать тренировку', prompt: 'Подготовь событие «Тренировка» на завтра в 18:00 на 45 минут.' },
  education: { label: 'Выделить время на курс', prompt: 'Подготовь событие «Занятие по курсу» на завтра в 19:00 на 60 минут.' },
  career: { label: 'Подготовиться к ревью', prompt: 'Подготовь заметку «К ревью». Добавь вопросы для подготовки по трём темам: результаты, обратная связь и следующие цели.' },
};

const sphereGroups = Object.entries(SPHERE_TABS).map(([id, tabs]) => {
  const label = ASSISTANT_SECTIONS[id].title;
  return {
    id, label,
    items: [
      ...tabs.map(tab => {
        const section = `${id}:${tab.id}`;
        return { id: section, label: `Открыть «${tab.label}»`, prompt: `Открой вкладку «${tab.label}» в сфере «${label}».` };
      }),
      { id: `${id}:example`, ...sphereExamples[id] },
    ],
  };
});

const presetPicker = definePrimitive({
  name: 'rollapp-assistant-presets',
  options: { enabled: 'boolean', items: 'list', onInsert: 'callback' },
  state: options => ({ enabled: options.enabled }),
  sync: options => ({ enabled: options.enabled }),
  api: context => ({
    availablePresets() {
      return context.options().items.map(({ id, label }) => ({ value: id, label }));
    },
    insertPreset(id) {
      const { enabled, items, onInsert } = context.options();
      const preset = items.find(item => item.id === id);
      if (enabled && preset) onInsert(preset.prompt);
    },
  }),
  slots: slot => ({ root: slot({}) }),
  agent: {
    actions: ['insertPreset'],
    shown: state => state.enabled,
    items: api => api.availablePresets(),
    closed: true,
  },
});

function appendPrompt(draft, prompt) {
  return draft.trim() ? draft + '\n\n' + prompt : prompt;
}

export function AssistantPresets({ draft, disabled, setDraft, inputRef, canDiscoverSpheres, children }) {
  const { pathname, search } = useLocation();
  const tab = new URLSearchParams(search).get('tab');
  const visibleSpheres = canDiscoverSpheres ? sphereGroups : [];
  const items = [...groups, ...visibleSpheres].flatMap(group => group.items);
  const activeSphere = visibleSpheres.find(({ id }) => pathname === ASSISTANT_SECTIONS[id].path);
  let quick = pathname === '/app/planning'
    ? (tab === 'notes' ? ['note', 'task', 'week'] : ['task', 'event', 'week'])
    : ['wish', 'calendar', 'task'];
  if (activeSphere) {
    const { id, items: sphereItems } = activeSphere;
    const currentTab = `${id}:${tab}`;
    const current = sphereItems.some(item => item.id === currentTab) ? currentTab : sphereItems[0].id;
    const nearby = sphereItems.find(item => item.id !== current);
    quick = [`${id}:example`, current, nearby.id];
  }
  const canInsert = prompt => !disabled && appendPrompt(draft, prompt).length <= ASSISTANT_MESSAGE_LIMIT;
  const availableItems = items.filter(({ prompt }) => canInsert(prompt));
  const enabled = availableItems.length > 0;
  const handle = usePrimitive(presetPicker, {
    enabled,
    items: availableItems,
    onInsert(prompt) {
      if (!canInsert(prompt)) return;
      setDraft(current => {
        const next = appendPrompt(current, prompt);
        return next.length <= ASSISTANT_MESSAGE_LIMIT ? next : current;
      });
    },
  });
  const focusComposer = useRef(false);
  const renderItem = item => <DropdownMenuItem key={item.id} disabled={!canInsert(item.prompt)} className="whitespace-normal"
    onClick={() => {
      focusComposer.current = true;
      handle.api.insertPreset(item.id);
    }}>{item.label}</DropdownMenuItem>;
  const finalFocus = () => focusComposer.current ? inputRef.current : true;
  const menu = <DropdownMenu onOpenChange={open => { if (open) focusComposer.current = false; }}
    onOpenChangeComplete={open => {
      if (!open && focusComposer.current) inputRef.current?.focus();
    }}>
    <DropdownMenuTrigger render={<Button data-control-icon variant="outline" size="icon" />}
      disabled={!enabled} aria-label="Пресеты запросов" title="Пресеты запросов">
      <ListChecks aria-hidden="true" />
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" sideOffset={8} className="w-64"
      aria-label="Пресеты запросов" finalFocus={finalFocus}>
      {visibleSpheres.length > 0 && <DropdownMenuGroup>
        <DropdownMenuLabel>Сферы</DropdownMenuLabel>
        {visibleSpheres.map(({ id, label, items }) => <DropdownMenuSub key={id}>
          <DropdownMenuSubTrigger disabled={!items.some(item => canInsert(item.prompt))}>{label}</DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-64 max-w-[calc(100vw-2rem)]" aria-label={label} finalFocus={finalFocus}>
            {items.map(renderItem)}
          </DropdownMenuSubContent>
        </DropdownMenuSub>)}
      </DropdownMenuGroup>}
      {groups.map(({ label, items }) => <DropdownMenuGroup key={label}>
        <DropdownMenuLabel>{label}</DropdownMenuLabel>
        {items.map(renderItem)}
      </DropdownMenuGroup>)}
    </DropdownMenuContent>
  </DropdownMenu>;
  const suggestions = <div data-not-typeset role="group" aria-label="Примеры запросов" className="flex flex-wrap gap-2">
    {quick.map(id => items.find(item => item.id === id)).map(item => <PageActionButton key={item.id} type="button" variant="outline" disabled={!canInsert(item.prompt)} className="max-w-full" title={item.label} onClick={() => {
      handle.api.insertPreset(item.id);
      inputRef.current?.focus();
    }}><span className="min-w-0 truncate">{item.label}</span></PageActionButton>)}
  </div>;
  return usePart(handle, 'root', {}, {
    className: 'messenger-conversation assistant-drawer',
    children: children({ menu, suggestions }),
  }, 'section');
}
