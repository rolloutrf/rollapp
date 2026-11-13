import { definePrimitive } from '@ui-sdk/core';
import { usePart, usePrimitive } from '@ui-sdk/react/primitive';
import { NOTE_TASKS_PROMPT } from '../../shared/assistant-note-tasks.js';
import { ListChecks } from 'lucide-react';
import { useRef } from 'react';
import { ASSISTANT_MESSAGE_LIMIT, ASSISTANT_SECTIONS, ASSISTANT_WISH_EXAMPLE, ASSISTANT_WISH_SORT_PROMPT } from '../../shared/messenger-assistant.js';
import { Button } from './ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from './ui/dropdown-menu';

const groups = [
  { label: 'Вишлист', items: [
    { id: 'wish', label: 'Добавить желание', prompt: ASSISTANT_WISH_EXAMPLE },
    { id: 'wish-link', label: 'Добавить товар по ссылке', prompt: 'Подготовь желание по ссылке на товар. Заполни название, цену, валюту и список, если я их укажу. Остальные данные подставь из карточки товара, когда я открою форму. Если ссылки пока нет, попроси её.' },
    { id: 'wish-batch', label: 'Добавить несколько желаний', prompt: 'Подготовь отдельные черновики для трёх желаний: весы за 1 800 ₽ в «Кухню», коврик за 2 500 ₽ в «Спорт» и настольная лампа за 3 500 ₽ в «Воркспейс».' },
    { id: 'wish-sort', label: 'Разобрать «Не отсортированные»', prompt: ASSISTANT_WISH_SORT_PROMPT },
  ] },
  { label: 'Планирование', items: [
    { id: 'task', label: 'Разбить цель на задачи', prompt: 'Разбей цель «Подготовить презентацию к пятнице» на три конкретных шага. Подготовь отдельный черновик задачи для каждого шага с описанием результата и сроком.' },
    { id: 'event', label: 'Встреча и подготовка', prompt: 'Подготовь событие «Созвон по проекту» на завтра в 14:00 на 45 минут с повесткой. Отдельно подготовь задачу на сегодня «Собрать вопросы к созвону».' },
    { id: 'week', label: 'Расставить приоритеты недели', prompt: 'По моему планированию на ближайшие семь дней выбери до трёх приоритетов. Для каждого предложи конкретный следующий шаг и подготовь черновик задачи, если такого шага ещё нет в списке.' },
  ] },
  { label: 'Заметки', items: [
    { id: 'note', label: 'Подготовить заметку', prompt: 'Подготовь заметку «Идеи для выходных». Сгруппируй идеи по темам: прогулка, выставка и ужин с друзьями. Добавь, что нужно решить заранее.' },
    { id: 'note-actions', label: 'Заметка и задачи из диктовки', prompt: 'По моему тексту подготовь итоговую заметку с решениями и до двух отдельных черновиков задач. Используй сроки из текста, отсутствующие даты оставь пустыми. Если я ещё не приложил текст или расшифровку, попроси их.' },
  ] },
];

const spherePresets = {
  identity: [
    { id: 'values', label: 'Ценности и действия на неделю', prompt: 'По моим примерам важных решений выдели ценности и подготовь заметку «Мои ценности» с объяснениями. Предложи до двух небольших действий на неделю и подготовь для них отдельные черновики задач. Если примеров ещё нет, попроси два примера.' },
    { id: 'identity-answer', label: 'Уточнить ответ из «4 вопросов»', prompt: 'Помоги доработать мой ответ из «4 вопросов». Сохрани смысл и голос, убери повторы и подготовь заметку с новой версией и одним вопросом для уточнения. Если я ещё не приложил ответ, попроси вставить его сюда.' },
  ],
  health: [
    { id: 'workouts', label: 'Поставить тренировки в календарь', prompt: 'Подготовь два черновика событий «Тренировка» на ближайшие вторник и четверг в 18:00, каждое на 45 минут. Добавь в описание то, что я укажу для подготовки.' },
    { id: 'health-notes', label: 'Собрать наблюдения и вопросы к приёму', prompt: 'Собери из моих записей черновик заметки к приёму: когда что произошло, что изменилось и какие вопросы я хочу задать. Используй только мои сведения. Если записей пока нет, попроси их.' },
  ],
  education: [
    { id: 'study', label: 'Разложить курс по календарю', prompt: 'Подготовь три отдельных черновика событий для занятий по курсу, каждое по 45 минут в 19:00 в ближайшие понедельник, среду и пятницу. Для каждого добавь цель занятия. Если название курса или темы не указаны, спроси.' },
    { id: 'education-notes', label: 'Выводы и задачи после обучения', prompt: 'По моим заметкам с курса, конференции или коучинга подготовь одну заметку с главными выводами и до двух отдельных черновиков задач, чтобы применить их на практике. Если заметок пока нет, попроси их.' },
  ],
  career: [
    { id: 'review', label: 'Собрать материалы к ревью', prompt: 'По моим результатам подготовь черновик заметки к ревью: достижения, эффект, подтверждения и следующие цели. Подготовь до двух отдельных черновиков задач на сбор недостающих материалов. Если результатов ещё нет, попроси их.' },
    { id: 'career-plan', label: 'Превратить пункт ИПР в задачи', prompt: 'По пункту моего ИПР подготовь до двух черновиков конкретных задач и один черновик события для проверки прогресса. Используй указанные даты и время. Если пункта или времени контрольной встречи ещё нет, уточни их.' },
  ],
};

const sphereGroups = Object.entries(spherePresets).map(([id, items]) => ({
  label: ASSISTANT_SECTIONS[id].title, items,
}));

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

export function AssistantPresets({ draft, disabled, setDraft, inputRef, canDiscoverSpheres, noteId, children }) {
  const visibleGroups = [
    ...groups,
    ...(noteId ? [{ label: 'Открытая заметка', items: [{ id: 'note-tasks', label: 'Задачи из заметки', prompt: NOTE_TASKS_PROMPT }] }] : []),
    ...(canDiscoverSpheres ? sphereGroups : []),
  ];
  const items = visibleGroups.flatMap(group => group.items);
  const canInsert = prompt => !disabled && (prompt !== NOTE_TASKS_PROMPT || !draft.trim())
    && appendPrompt(draft, prompt).length <= ASSISTANT_MESSAGE_LIMIT;
  const availableItems = items.filter(({ prompt }) => canInsert(prompt));
  const enabled = availableItems.length > 0;
  const handle = usePrimitive(presetPicker, {
    enabled,
    items: availableItems,
    onInsert(prompt) {
      if (!canInsert(prompt)) return;
      if (prompt === NOTE_TASKS_PROMPT) {
        setDraft(prompt, noteId);
        return;
      }
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
      {visibleGroups.map(({ label, items }) => <DropdownMenuGroup key={label}>
        <DropdownMenuLabel>{label}</DropdownMenuLabel>
        {items.map(renderItem)}
      </DropdownMenuGroup>)}
    </DropdownMenuContent>
  </DropdownMenu>;
  const suggestions = <div data-not-typeset role="group" aria-label="Примеры запросов" className="flex w-full min-w-0 flex-wrap gap-2">
    {items.map(item => <Button key={item.id} type="button" variant="outline"
      disabled={!canInsert(item.prompt)} className="h-auto min-h-(--layout-control-size) max-w-full rounded-full px-6 py-2 text-start whitespace-normal" onClick={() => {
        handle.api.insertPreset(item.id);
        inputRef.current?.focus();
      }}>{item.label}</Button>)}
  </div>;
  return usePart(handle, 'root', {}, {
    className: 'messenger-conversation assistant-drawer',
    children: children({ menu, suggestions }),
  }, 'section');
}
