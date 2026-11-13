import { createContext, useContext, useLayoutEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Bot, ChevronDown, CircleAlert, LoaderCircle, Mic, Plus, Square } from 'lucide-react';
import { ASSISTANT_CONTEXT_LIMIT, ASSISTANT_NAME, ASSISTANT_SECTIONS, ASSISTANT_WISH_EXAMPLE, ASSISTANT_WISH_SORT_PROMPT, parseAssistantAction } from '../../shared/messenger-assistant.js';
import { localDateKey } from '../../shared/planning.js';
import { api } from '../api.js';
import { AssistantWishAction } from './assistant-wish-action';
import { AssistantWishlistSort } from './assistant-wishlist-sort';
import { ControlBar } from './control-bar';
import { MessageComposer, MessageDrawer, MessageDrawerClose } from './messenger';
import { Button, buttonVariants } from './ui/button';
import { DrawerTitle } from './ui/drawer';
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from './ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { useAssistantDictation } from '@/hooks/use-assistant-dictation';
import './assistant-drawer.css';

const AssistantContext = createContext(null);
const assistantStarters = [
  ['Открыть календарь', 'Открой календарь Rollapp.'],
  ['Добавить желание', ASSISTANT_WISH_EXAMPLE],
  ['Разобрать «Не отсортированные»', ASSISTANT_WISH_SORT_PROMPT],
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

function useAssistantChats() {
  const [workspace, setWorkspace] = useState(() => ({ chats: [newChat(1)], selected: '1' }));
  const pending = useRef(new Map());
  const [sortReviews, setSortReviews] = useState({});
  function updateSortReview(key, change) {
    setSortReviews(previous => ({ ...previous, [key]: { ...previous[key], ...change } }));
  }

  useLayoutEffect(() => {
    const requests = pending.current;
    return () => {
      for (const controller of requests.values()) controller.abort();
      requests.clear();
    };
  }, []);

  const { chats, selected } = workspace;
  const chat = chats.find(item => item.id === selected);
  const { id, messages, draft } = chat;

  function updateChat(change) {
    setWorkspace(previous => ({
      ...previous,
      chats: previous.chats.map(item => item.id === id ? change(item, previous.selected) : item),
    }));
  }

  function createChat() {
    setWorkspace(previous => {
      const created = newChat(previous.chats.length + 1);
      return { ...previous, chats: [...previous.chats, created], selected: created.id };
    });
  }

  function selectChat(selectedId) {
    setWorkspace(previous => ({
      ...previous,
      selected: selectedId,
      chats: previous.chats.map(item => item.id === selectedId && item.hasNewReply ? { ...item, hasNewReply: false } : item),
    }));
  }

  async function submit(event) {
    event.preventDefault();
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
      updateChat((item, selectedId) => ({
        ...item,
        messages: [...item.messages, { role: 'user', content }, { role: 'assistant', content: reply, actions }],
        draft: '',
        sending: false,
        hasNewReply: selectedId !== id,
      }));
    } catch (err) {
      if (!controller.signal.aborted) updateChat(item => ({ ...item, sending: false, error: err.message }));
    } finally {
      if (pending.current.get(id) === controller) pending.current.delete(id);
    }
  }

  return {
    chats, chat, createChat, selectChat, submit, sortReviews, updateSortReview,
    setDraft: draft => updateChat(item => ({ ...item, draft: typeof draft === 'function' ? draft(item.draft) : draft })),
  };
}

export function AssistantProvider({ children }) {
  const workspace = useAssistantChats();
  return <AssistantContext.Provider value={workspace}>{children}</AssistantContext.Provider>;
}

function AssistantActions({ actions, onReviewWish, sortReviews, updateSortReview, messageKey, onWishlistChanged }) {
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
    if (type === 'review_wish_sort') {
      const key = `${messageKey}:${index}`;
      return <AssistantWishlistSort key={key} value={value} review={sortReviews[key]}
        onUpdate={change => updateSortReview(key, change)} onApplied={onWishlistChanged} />;
    }
    if (type === 'draft_wish') return <AssistantWishAction key={index} value={value} onReview={onReviewWish} />;
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

function AssistantChatPicker({ chats, chat, createChat, selectChat }) {
  const background = chats.filter(item => item.id !== chat.id);
  const ready = background.filter(item => item.hasNewReply).length;
  const sending = background.filter(item => item.sending).length;
  const failed = background.filter(item => item.error).length;
  const status = [ready && `Новые ответы: ${ready}`, sending && `Готовятся ответы: ${sending}`, failed && `Ошибки отправки: ${failed}`].filter(Boolean).join('. ');

  return <ControlBar as="nav" className="assistant-drawer__chats" aria-label="Чаты ассистента">
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" className="assistant-drawer__chat-trigger" />}
        aria-label={`Чаты ассистента. Текущий чат: ${chat.title}${status ? `. ${status}` : ''}`} title={chat.title}>
        <span className="min-w-0 flex-1 truncate text-start">{chat.title}</span>
        {ready ? <span className="assistant-drawer__unread" aria-hidden="true" />
          : failed ? <CircleAlert aria-hidden="true" className="text-destructive" />
            : sending ? <LoaderCircle aria-hidden="true" className="motion-safe:animate-spin" /> : null}
        <ChevronDown aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent sideOffset={8}>
        <DropdownMenuRadioGroup value={chat.id} onValueChange={selectChat}>
          {chats.map(item => {
            const caption = chatStatus(item);
            return <DropdownMenuRadioItem key={item.id} value={item.id} title={item.title} closeOnClick>
              <span className="min-w-0">
                <span className="block truncate">{item.title}</span>
                {caption && <span className="block text-xs text-muted-foreground">{caption}</span>}
              </span>
            </DropdownMenuRadioItem>;
          })}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
    <Button data-control-icon size="icon" variant="outline" aria-label="Новый чат" title="Новый чат" onClick={createChat}>
      <Plus aria-hidden="true" />
    </Button>
    <span className="sr-only" role="status">{status}</span>
  </ControlBar>;
}

export function AssistantDrawer({ open, onOpenChange, onAfterClose, onReviewWish, onWishlistChanged }) {
  const workspace = useContext(AssistantContext);
  const heading = useRef(null);
  return <MessageDrawer open={open} onOpenChange={onOpenChange} title={ASSISTANT_NAME} icon={Bot}
    triggerClassName="assistant-fab" initialFocus={heading} onAfterClose={onAfterClose}>
    <section className="messenger-conversation assistant-drawer">
      <ControlBar as="header" className="messenger-heading assistant-drawer__header">
        <DrawerTitle ref={heading} tabIndex={-1} className="text-2xl font-semibold outline-none">{ASSISTANT_NAME}</DrawerTitle>
        <MessageDrawerClose label="Закрыть ассистента" />
        <AssistantChatPicker {...workspace} />
      </ControlBar>
      <AssistantConversation key={workspace.chat.id} open={open} onReviewWish={onReviewWish} onWishlistChanged={onWishlistChanged} {...workspace} />
    </section>
  </MessageDrawer>;
}

function AssistantConversation({ chat, open, setDraft, submit, onReviewWish, onWishlistChanged, sortReviews, updateSortReview }) {
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
        <p>Помогу найти раздел, составить план или подготовить желание, задачу, событие или заметку.</p>
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
        data-wish-sort={actions?.some?.(action => action?.type === 'review_wish_sort') || undefined}
        aria-label={role === 'user' ? 'Ваше сообщение' : 'Ответ ассистента'}><p>{content}</p><AssistantActions actions={actions} onReviewWish={onReviewWish}
          sortReviews={sortReviews} updateSortReview={updateSortReview} messageKey={`${chat.id}:${index}`} onWishlistChanged={onWishlistChanged} /></article>)}
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
