import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Bot, Mic, Plus, Square } from 'lucide-react';
import { ASSISTANT_CONTEXT_LIMIT, ASSISTANT_NAME, ASSISTANT_SECTIONS, parseAssistantAction } from '../../shared/messenger-assistant.js';
import { localDateKey } from '../../shared/planning.js';
import { api } from '../api.js';
import { ControlBar } from './control-bar';
import { MessageComposer, MessageDrawer, MessageDrawerBack, MessageDrawerClose, MessageListRow, MessengerAvatar } from './messenger';
import { Button, buttonVariants } from './ui/button';
import { DrawerTitle } from './ui/drawer';
import { cn } from '@/lib/utils';
import { useAssistantDictation } from '@/hooks/use-assistant-dictation';
import './assistant-drawer.css';

const assistantStarters = [
  ['Открыть календарь', 'Открой календарь Rollapp.'],
  ['Подготовить задачу', 'Подготовь задачу: собрать вопросы к встрече.'],
  ['Составить план', 'Помоги составить план на неделю.'],
];
const date = value => new Date(value).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });

function newChat(number) {
  return {
    id: String(number),
    title: `Чат ${number}`,
    messages: [],
    draft: '',
    sending: false,
    error: '',
    hasNewReply: false,
  };
}

function chatTitle(content) {
  const characters = Array.from(content.replace(/\s+/gu, ' '));
  return characters.length > 64 ? `${characters.slice(0, 63).join('')}…` : characters.join('');
}

function hasChatContent(chat) {
  return Boolean(chat.messages.length || chat.draft.trim() || chat.sending || chat.error);
}

export function useAssistantChats(open) {
  const [workspace, setWorkspace] = useState({ chats: [], selected: null });
  const pending = useRef(new Map());
  const visible = useRef(open);

  useLayoutEffect(() => {
    visible.current = open;
  }, [open]);

  useLayoutEffect(() => {
    const requests = pending.current;
    return () => {
      for (const controller of requests.values()) controller.abort();
      requests.clear();
    };
  }, []);

  const { chats, selected } = workspace;
  const chat = chats.find(item => item.id === selected);
  function updateChat(change) {
    setWorkspace(previous => ({
      ...previous,
      chats: previous.chats.map(item => item.id === chat.id ? change(item, previous.selected) : item),
    }));
  }

  function createChat() {
    setWorkspace(previous => {
      const blank = previous.chats.find(item => !hasChatContent(item));
      if (blank) return {
        selected: blank.id,
        chats: previous.chats.map(item => item === blank ? { ...item, draft: '' } : item),
      };
      const created = newChat(previous.chats.length + 1);
      return { ...previous, chats: [created, ...previous.chats], selected: created.id };
    });
  }

  const showList = useCallback(() => {
    setWorkspace(previous => previous.selected === null ? previous : { ...previous, selected: null });
  }, []);

  function selectChat(selectedId) {
    setWorkspace(previous => ({
      ...previous,
      selected: selectedId,
      chats: previous.chats.map(item => item.id === selectedId && item.hasNewReply ? { ...item, hasNewReply: false } : item),
    }));
  }

  async function submit(event) {
    event.preventDefault();
    const { id, messages, draft } = chat;
    const content = draft.trim();
    if (!content || chat.sending || pending.current.has(id)) return;
    const controller = new AbortController();
    pending.current.set(id, controller);
    updateChat(item => ({ ...item, title: messages.length ? item.title : chatTitle(content), sending: true, error: '' }));
    try {
      const context = messages.slice(-(ASSISTANT_CONTEXT_LIMIT - 1)).map(({ role, content }) => ({ role, content }));
      const { reply, actions } = await api.post('/messenger/assistant/reply', {
        messages: [...context, { role: 'user', content }],
        includePlanning: true,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      }, { signal: controller.signal });
      if (controller.signal.aborted) return;
      if (typeof reply !== 'string' || !reply.trim()) throw new Error('Ассистент не вернул ответ.');
      const wasVisible = visible.current;
      updateChat((item, selectedId) => ({
        ...item,
        messages: [...item.messages, { role: 'user', content }, { role: 'assistant', content: reply, actions }],
        draft: '',
        sending: false,
        hasNewReply: !wasVisible || selectedId !== id,
      }));
    } catch (err) {
      if (!controller.signal.aborted) updateChat(item => ({ ...item, sending: false, error: err.message }));
    } finally {
      if (pending.current.get(id) === controller) pending.current.delete(id);
    }
  }

  return {
    chats, chat, createChat, selectChat, showList, submit,
    setDraft: draft => updateChat(item => ({ ...item, draft: typeof draft === 'function' ? draft(item.draft) : draft })),
  };
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

function chatStatus(chat) {
  if (chat.sending) return 'Готовится ответ';
  if (chat.hasNewReply) return 'Новый ответ';
  if (chat.error) return 'Ошибка отправки';
  return '';
}

function AssistantChatList({ chats, createChat, selectChat }) {
  return <div className="messenger-directory-scroll" aria-label="Чаты ассистента" role="group">
    <MessageListRow title="Новый чат" avatar={<MessengerAvatar icon={Plus} />} onClick={createChat} />
    {chats.filter(hasChatContent).map(item => {
      const status = chatStatus(item);
      const preview = status || (item.draft.trim() ? `Черновик: ${item.draft}` : item.messages.at(-1)?.content);
      return <MessageListRow key={item.id} title={item.title} avatar={<MessengerAvatar icon={Bot} />} onClick={() => selectChat(item.id)}
        badge={item.hasNewReply && <span className="messenger-unread" aria-hidden="true">1</span>}>
        {preview && <span>{preview}</span>}
      </MessageListRow>;
    })}
  </div>;
}

export function AssistantDrawer({ open, onOpenChange, workspace }) {
  const { chat, showList } = workspace;
  const heading = useRef(null);
  const wasOpen = useRef(false);
  const chatId = chat?.id;
  useLayoutEffect(() => {
    if (open && wasOpen.current) heading.current?.focus({ preventScroll: true });
    wasOpen.current = open;
  }, [chatId, open]);

  return <MessageDrawer open={open} onOpenChange={onOpenChange} title={ASSISTANT_NAME} icon={Bot}
    triggerClassName="assistant-fab" initialFocus={heading}>
    <section className={chat ? 'messenger-conversation assistant-drawer' : 'messenger-directory'}>
      <ControlBar as="header" className="messenger-heading">
        <DrawerTitle ref={chat ? undefined : heading} tabIndex={chat ? undefined : -1}
          className={chat ? 'sr-only' : 'text-2xl font-semibold outline-none'}>{ASSISTANT_NAME}</DrawerTitle>
        {chat && <>
          <MessageDrawerBack onClick={showList} />
          <MessengerAvatar icon={Bot} />
          <h2 ref={heading} tabIndex={-1} title={chat.title} className="min-w-0 truncate text-lg font-semibold outline-none">{chat.title}</h2>
        </>}
        <MessageDrawerClose label="Закрыть ассистента" />
      </ControlBar>
      {chat ? <AssistantConversation key={chat.id} open={open} {...workspace} /> : <AssistantChatList {...workspace} />}
    </section>
  </MessageDrawer>;
}

function AssistantConversation({ chat, open, setDraft, submit }) {
  const voice = useAssistantDictation({ disabled: !open || chat.sending, setDraft });
  const voiceStatus = voice.status || (voice.supported ? '' : 'Диктовка недоступна в этом браузере');
  const history = useRef(null);
  const input = useRef(null);
  const atBottom = useRef(true);
  useLayoutEffect(() => {
    if (atBottom.current && (chat.messages.length || chat.sending || chat.error)) {
      history.current.scrollTop = history.current.scrollHeight;
    }
  }, [chat.messages, chat.sending, chat.error]);
  return <>
    <div className="messenger-history" ref={history} role="log" aria-live="polite" tabIndex={0} aria-label="История сообщений" onScroll={event => {
      const node = event.currentTarget;
      atBottom.current = node.scrollHeight - node.scrollTop - node.clientHeight < 48;
    }}>
      {!chat.messages.length && <div className="assistant-drawer__welcome typeset typeset-rollapp">
        <p>Помогу найти раздел, составить план или подготовить задачу, событие и заметку.</p>
        {!chat.draft && <div data-not-typeset role="group" aria-label="Примеры запросов" className="flex flex-wrap gap-2">
          {assistantStarters.map(([label, prompt]) => <Button key={label} type="button" variant="outline"
            className="min-h-12 rounded-full px-6" disabled={chat.sending || voice.active} onClick={() => {
              setDraft(prompt);
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
    <MessageComposer inputRef={input} placeholder="Сообщение…" draft={chat.draft} onDraftChange={setDraft}
      sending={chat.sending} disabled={voice.active} onSubmit={submit}
      extraAction={<Button type="button" data-control-icon size="icon" variant={voice.active ? 'default' : 'outline'}
        aria-label="Диктовка" aria-pressed={voice.active} aria-keyshortcuts={voice.supported ? 'Space' : undefined}
        aria-describedby={voiceStatus ? 'assistant-voice-status' : undefined} title={voice.active ? 'Остановить диктовку' : 'Начать диктовку'}
        disabled={!voice.supported || chat.sending || voice.stopping} onClick={voice.toggle}>
        {voice.active ? <Square aria-hidden="true" /> : <Mic aria-hidden="true" />}
      </Button>}
      status={<p id="assistant-voice-status" className={voiceStatus ? 'assistant-drawer__voice-status' : 'sr-only'} role="status">{voiceStatus}</p>} />
  </>;
}
