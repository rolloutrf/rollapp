import { createContext, useContext, useLayoutEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowUpRight, Mic, Square } from 'lucide-react';
import { ASSISTANT_CONTEXT_LIMIT, ASSISTANT_NAME, ASSISTANT_SECTIONS, parseAssistantAction } from '../../shared/messenger-assistant.js';
import { localDateKey } from '../../shared/planning.js';
import { api } from '../api.js';
import { ControlBar } from './control-bar';
import { MessageComposer } from './messenger';
import { Button, buttonVariants } from './ui/button';
import { Checkbox } from './ui/checkbox';
import { cn } from '@/lib/utils';
import { useAssistantDictation } from '@/hooks/use-assistant-dictation';
import './assistant-page.css';

const AssistantContext = createContext(null);
const assistantStarters = [
  ['Открыть календарь', 'Открой календарь Rollapp.'],
  ['Подготовить задачу', 'Подготовь задачу: собрать вопросы к встрече.'],
  ['Составить план', 'Помоги составить план на неделю.'],
];
const date = value => new Date(value).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });

function useMessengerAssistant(owner) {
  const [draftOwner, setDraftOwner] = useState(owner);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [includePlanning, setIncludePlanning] = useState(false);
  const pending = useRef(null);
  if (draftOwner !== owner) {
    setDraftOwner(owner);
    setMessages([]);
    setDraft('');
    setSending(false);
    setError('');
    setIncludePlanning(false);
  }
  useLayoutEffect(() => () => {
    pending.current?.abort();
    pending.current = null;
  }, [owner]);

  async function submit(event) {
    event.preventDefault();
    const content = draft.trim();
    if (!content || pending.current) return;
    const controller = new AbortController();
    pending.current = controller;
    setSending(true);
    setError('');
    try {
      const context = messages.filter(message => includePlanning || !message.includePlanning)
        .slice(-(ASSISTANT_CONTEXT_LIMIT - 1)).map(({ role, content }) => ({ role, content }));
      const { reply, actions } = await api.post('/messenger/assistant/reply', {
        messages: [...context, { role: 'user', content }],
        includePlanning,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      }, { signal: controller.signal });
      if (controller.signal.aborted) return;
      if (typeof reply !== 'string' || !reply.trim()) throw new Error('Ассистент не вернул ответ.');
      setMessages(previous => [...previous,
        { role: 'user', content, includePlanning },
        { role: 'assistant', content: reply, includePlanning, actions },
      ]);
      setDraft('');
      setIncludePlanning(false);
    } catch (err) {
      if (!controller.signal.aborted) setError(err.message);
    } finally {
      if (pending.current === controller) {
        pending.current = null;
        setSending(false);
      }
    }
  }
  return { messages, draft, setDraft, sending, error, submit, includePlanning, setIncludePlanning };
}

export function AssistantProvider({ owner, children }) {
  const chat = useMessengerAssistant(owner);
  return <AssistantContext.Provider value={chat}>{children}</AssistantContext.Provider>;
}

function AssistantActions({ actions }) {
  if (!Array.isArray(actions)) return null;
  const targets = {
    draft_task: ['todo', 'Проверить задачу'],
    draft_event: ['calendar', 'Проверить событие'],
    draft_note: ['notes', 'Проверить заметку'],
  };
  return actions.map((candidate, index) => {
    const action = parseAssistantAction(candidate?.type, candidate?.value);
    if (!action) return null;
    const { type, value } = action;
    const [section, label] = type === 'open_section'
      ? [value.section, `Открыть: ${ASSISTANT_SECTIONS[value.section].title}`]
      : targets[type];
    const draftDate = type === 'draft_task' ? value.dueOn || localDateKey(new Date()) : value.dueOn;
    const path = ASSISTANT_SECTIONS[section].path + (draftDate ? `&date=${draftDate}` : '');
    return <div key={index} className="messenger-assistant-action">
      {value.title && <p><strong>{value.title}</strong></p>}
      {draftDate && <p>{date(`${draftDate}T12:00:00`)}{value.startTime && ` · ${value.startTime} · ${value.durationMinutes} мин`}</p>}
      <Link to={path} state={type === 'open_section' ? undefined : { assistantDraft: draftDate ? { type, value: { ...value, dueOn: draftDate } } : action }}
        className={cn(buttonVariants({ variant: 'outline' }), 'h-auto min-h-12 rounded-full whitespace-normal text-start')}>
        {label}<ArrowUpRight aria-hidden="true" />
      </Link>
    </div>;
  });
}

export function AssistantPage({ onBack }) {
  const chat = useContext(AssistantContext);
  const voice = useAssistantDictation({ disabled: chat.sending, setDraft: chat.setDraft });
  const heading = useRef(null);
  const history = useRef(null);
  const input = useRef(null);
  const atBottom = useRef(true);
  useLayoutEffect(() => { heading.current?.focus({ preventScroll: true }); }, []);
  useLayoutEffect(() => {
    if (atBottom.current && (chat.messages.length || chat.sending || chat.error)) {
      history.current.scrollTop = history.current.scrollHeight;
    }
  }, [chat.messages, chat.sending, chat.error]);
  return <main className="assistant-page rollapp-body" aria-labelledby="assistant-title">
    <ControlBar as="header" className="assistant-page__header typeset typeset-rollapp">
      <Button data-not-typeset data-control-icon variant="outline" size="icon" onClick={onBack} aria-label="Назад"><ArrowLeft aria-hidden="true" /></Button>
      <h1 ref={heading} id="assistant-title" tabIndex={-1}>{ASSISTANT_NAME}</h1>
    </ControlBar>
    <div className="messenger-history" ref={history} role="log" aria-live="polite" tabIndex={0} aria-label="История сообщений" onScroll={event => {
      const node = event.currentTarget;
      atBottom.current = node.scrollHeight - node.scrollTop - node.clientHeight < 48;
    }}>
      {!chat.messages.length && <div className="assistant-page__welcome typeset typeset-rollapp">
        <p>Помогу найти раздел, составить план или подготовить задачу, событие и заметку.</p>
        {!chat.draft && <div data-not-typeset role="group" aria-label="Примеры запросов" className="flex flex-wrap gap-2">
          {assistantStarters.map(([label, prompt]) => <Button key={label} type="button" variant="outline"
            className="min-h-12 rounded-full px-6" disabled={chat.sending || voice.active} onClick={() => {
              chat.setDraft(prompt);
              input.current?.focus();
            }}>{label}</Button>)}
        </div>}
        <small className="text-muted-foreground">Сообщения обрабатывает модель Rollapp в Yandex Cloud или ваша модель OpenRouter.</small>
      </div>}
      {chat.messages.map(({ role, content, actions }, index) => <article key={index} className="messenger-message messenger-assistant-message" data-own={role === 'user' || undefined}
        aria-label={role === 'user' ? 'Ваше сообщение' : 'Ответ ассистента'}><p>{content}</p><AssistantActions actions={actions} /></article>)}
      {chat.sending && <p className="messenger-note" role="status">Ассистент готовит ответ…</p>}
      {chat.error && <div className="messenger-send-error" role="alert">{chat.error} Черновик остался в поле ввода.</div>}
    </div>
    <MessageComposer inputRef={input} placeholder="Сообщение…" draft={chat.draft} onDraftChange={chat.setDraft}
      sending={chat.sending} disabled={voice.active} onSubmit={chat.submit}
      extraAction={<Button type="button" data-control-icon size="icon" variant={voice.active ? 'default' : 'outline'}
        aria-label="Диктовка" aria-pressed={voice.active} aria-keyshortcuts={voice.supported ? 'Space' : undefined}
        aria-describedby="assistant-voice-hint" title={voice.active ? 'Остановить диктовку' : 'Начать диктовку'}
        disabled={!voice.supported || chat.sending || voice.stopping} onClick={voice.toggle}>
        {voice.active ? <Square aria-hidden="true" /> : <Mic aria-hidden="true" />}
      </Button>}
      status={<p id="assistant-voice-hint" className="assistant-page__voice-hint" role="status">
        {voice.status || (voice.supported ? 'Диктовка: микрофон или пробел вне поля ввода' : 'Диктовка недоступна в этом браузере')}
      </p>}>
      <label className="messenger-planning-option">
        <Checkbox aria-labelledby="messenger-planning-label" aria-describedby="messenger-planning-description"
          checked={chat.includePlanning} onCheckedChange={chat.setIncludePlanning} disabled={chat.sending} />
        <span><span id="messenger-planning-label">Учесть моё планирование</span><small id="messenger-planning-description">Передать выбранной модели задачи и события на 7 дней</small></span>
      </label>
    </MessageComposer>
  </main>;
}
