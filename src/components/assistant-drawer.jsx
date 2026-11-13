import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Bot, Mic, Plus, Square } from 'lucide-react';
import { ASSISTANT_CONTEXT_LIMIT, ASSISTANT_NAME, ASSISTANT_SECTIONS, ASSISTANT_PRODUCT_EXAMPLE, parseAssistantAction } from '../../shared/messenger-assistant.js';
import { NOTE_TASKS_PROMPT } from '../../shared/assistant-note-tasks.js';
import { NoteTasksSource } from './assistant-note-tasks';
import { localDateKey } from '../../shared/planning.js';
import { api } from '../api.js';
import { AssistantPresets } from './assistant-presets';
import { AssistantWishAction } from './assistant-wish-action';
import { AssistantWishlistSort } from './assistant-wishlist-sort';
import { ControlBar } from './control-bar';
import { MessageComposer, MessageDrawer, MessageDrawerBack, MessageDrawerClose, MessageListRow, MessengerAvatar } from './messenger';
import { Button, buttonVariants } from './ui/button';
import { DrawerTitle } from './ui/drawer';
import { cn } from '@/lib/utils';
import { useAssistantDictation } from '@/hooks/use-assistant-dictation';
import './assistant-drawer.css';

const date = value => new Date(value).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });

function newChat(number) {
  return {
    id: String(number),
    title: `Чат ${number}`,
    messages: [],
    draft: '',
    noteDraftId: null,
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
  const nextChatNumber = useRef(1);
  const [sortReviews, setSortReviews] = useState({});
  const [noteReviews, setNoteReviews] = useState({});
  function updateNoteReview(batchId, change) {
    setNoteReviews(previous => ({ ...previous, [batchId]: change(previous[batchId]) }));
  }
  function updateSortReview(key, change) {
    setSortReviews(previous => ({ ...previous, [key]: { ...previous[key], ...change } }));
  }
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
  const id = chat?.id;

  function updateChat(change, chatId = id) {
    setWorkspace(previous => ({
      ...previous,
      chats: previous.chats.map(item => item.id === chatId ? change(item, previous.selected) : item),
    }));
  }

  function createChat(draft = '', noteDraftId = null) {
    const blank = !draft && !noteDraftId && chats.find(item => !hasChatContent(item));
    const created = blank || { ...newChat(nextChatNumber.current++), draft, noteDraftId };
    setWorkspace(previous => ({ ...previous, chats: [created, ...previous.chats.filter(hasChatContent)], selected: created.id }));
    return created;
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

  async function submit(event, target = chat) {
    const { id, draft, messages } = target;
    event?.preventDefault();
    const content = draft.trim();
    if (!content || target.sending || pending.current.has(id)) return;
    const noteId = content === NOTE_TASKS_PROMPT ? target.noteDraftId : null;
    const controller = new AbortController();
    pending.current.set(id, controller);
    updateChat(item => ({ ...item, title: messages.length ? item.title : chatTitle(content), sending: true, error: '' }), id);
    try {
      const context = messages.slice(-(ASSISTANT_CONTEXT_LIMIT - 1)).map(({ role, content }) => ({ role, content }));
      const { reply, actions } = await api.post('/messenger/assistant/reply', {
        messages: [...context, { role: 'user', content }],
        includePlanning: !noteId,
        ...(noteId && { noteId }),
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      }, { signal: controller.signal });
      if (controller.signal.aborted) return;
      if (typeof reply !== 'string' || !reply.trim()) throw new Error('Ассистент не вернул ответ.');
      const wasVisible = visible.current;
      updateChat((item, selectedId) => ({
        ...item,
        messages: [...item.messages, { role: 'user', content }, { role: 'assistant', content: reply, actions }],
        draft: '',
        noteDraftId: null,
        sending: false,
        hasNewReply: !wasVisible || selectedId !== id,
      }), id);
    } catch (err) {
      if (!controller.signal.aborted) updateChat(item => ({ ...item, sending: false, error: err.message }), id);
    } finally {
      if (pending.current.get(id) === controller) pending.current.delete(id);
    }
  }

  async function startNote(noteId) {
    return submit(null, createChat(NOTE_TASKS_PROMPT, noteId));
  }

  return {
    chats, chat, createChat, selectChat, showList, submit, sortReviews, updateSortReview, startNote, noteReviews, updateNoteReview,
    setDraft: (draft, noteDraftId = null) => updateChat(item => ({ ...item, draft: typeof draft === 'function' ? draft(item.draft) : draft, noteDraftId })),
  };
}

function AssistantActions({ actions, onReviewWish, sortReviews, updateSortReview, messageKey, onWishlistChanged, noteReviews, onReviewNoteTasks, canDiscoverSpheres }) {
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
    if (type === 'open_section' && ASSISTANT_SECTIONS[value.section].private && !canDiscoverSpheres) return null;
    if (type === 'review_note_tasks') {
      return <NoteTasksSource key={value.batchId} value={value} saved={noteReviews[value.batchId]?.saved}
        onReview={onReviewNoteTasks ? () => onReviewNoteTasks(value) : undefined} />;
    }
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

function AssistantChatList({ chats, createChat, selectChat }) {
  return <div className="messenger-directory-scroll" aria-label="Чаты ассистента" role="group">
    <MessageListRow title="Новый чат" avatar={<MessengerAvatar icon={Plus} />} onClick={() => createChat()} />
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

export function AssistantDrawer({ open, onOpenChange, onAfterClose, onReviewWish, onWishlistChanged, onReviewNoteTasks, noteId, noteRequest, canDiscoverSpheres, workspace }) {
  const { chat } = workspace;
  const heading = useRef(null);
  const wasOpen = useRef(false);
  const handledRequest = useRef(null);
  useLayoutEffect(() => {
    if (open && wasOpen.current) heading.current?.focus({ preventScroll: true });
    wasOpen.current = open;
  }, [chat?.id, open]);
  useLayoutEffect(() => {
    if (!open || !noteRequest || noteRequest.noteId !== noteId || handledRequest.current === noteRequest) return;
    handledRequest.current = noteRequest;
    void workspace.startNote(noteRequest.noteId);
  }, [open, noteId, noteRequest, workspace]);

  return <MessageDrawer open={open} onOpenChange={onOpenChange} title={ASSISTANT_NAME} icon={Bot}
    triggerClassName="assistant-fab" initialFocus={heading} onAfterClose={onAfterClose}>
    {chat ? <AssistantConversation key={chat.id} open={open} heading={heading} onReviewWish={onReviewWish}
      onWishlistChanged={onWishlistChanged} noteId={noteId} onReviewNoteTasks={onReviewNoteTasks}
      canDiscoverSpheres={canDiscoverSpheres} workspace={workspace} /> : <section className="messenger-directory">
      <ControlBar as="header" className="messenger-heading">
        <DrawerTitle ref={heading} tabIndex={-1} className="text-2xl font-semibold outline-none">{ASSISTANT_NAME}</DrawerTitle>
        <MessageDrawerClose label="Закрыть ассистента" />
      </ControlBar>
      <AssistantChatList {...workspace} />
    </section>}
  </MessageDrawer>;
}

function AssistantConversation({ workspace, open, heading, onReviewWish, onWishlistChanged, onReviewNoteTasks, noteId, canDiscoverSpheres }) {
  const { chat, setDraft, submit, sortReviews, updateSortReview, noteReviews } = workspace;
  const voice = useAssistantDictation({ disabled: !open || chat.sending, setDraft, chatId: chat.id });
  const voiceStatus = voice.status || (voice.supported ? '' : 'Диктовка недоступна в этом браузере');
  const history = useRef(null);
  const input = useRef(null);
  const atBottom = useRef(true);
  useLayoutEffect(() => {
    if (atBottom.current && (chat.messages.length || chat.sending || chat.error)) {
      history.current.scrollTop = history.current.scrollHeight;
    }
  }, [chat.messages, chat.sending, chat.error]);
  return <AssistantPresets draft={chat.draft} disabled={!open || chat.sending || voice.active} setDraft={setDraft} inputRef={input}
    canDiscoverSpheres={canDiscoverSpheres} noteId={noteId}>
    {({ menu, suggestions }) => <>
      <ControlBar as="header" className="messenger-heading assistant-drawer__header">
        <DrawerTitle className="sr-only">{ASSISTANT_NAME}</DrawerTitle>
        <MessageDrawerBack onClick={workspace.showList} />
        <h2 ref={heading} tabIndex={-1} title={chat.title} className="min-w-0 flex-1 truncate text-lg font-semibold outline-none">{chat.title}</h2>
        {menu}
        <MessageDrawerClose label="Закрыть ассистента" />
      </ControlBar>
      <div className="messenger-history" ref={history} role="log" aria-live="polite" tabIndex={0} aria-label="История сообщений" onScroll={event => {
        const node = event.currentTarget;
        atBottom.current = node.scrollHeight - node.scrollTop - node.clientHeight < 48;
      }}>
        {!chat.messages.length && <div className="assistant-drawer__welcome typeset typeset-rollapp">
          <p>Помогу найти раздел, составить план или подготовить желание, задачу, событие или заметку.</p>
          {!chat.draft && suggestions}
          <small className="text-muted-foreground">Сообщения обрабатывает модель Rollapp в Yandex Cloud или ваша модель OpenRouter.</small>
        </div>}
        {chat.messages.map(({ role, content, actions }, index) => <article key={index} className="messenger-message messenger-assistant-message" data-own={role === 'user' || undefined}
          data-wish-sort={actions?.some?.(action => action?.type === 'review_wish_sort') || undefined}
          aria-label={role === 'user' ? 'Ваше сообщение' : 'Ответ ассистента'}><p>{content}</p><AssistantActions actions={actions} onReviewWish={onReviewWish}
            sortReviews={sortReviews} updateSortReview={updateSortReview} messageKey={`${chat.id}:${index}`} onWishlistChanged={onWishlistChanged} noteReviews={noteReviews} onReviewNoteTasks={onReviewNoteTasks} canDiscoverSpheres={canDiscoverSpheres} /></article>)}
        {chat.sending && <p className="messenger-note" role="status">Ассистент готовит ответ…</p>}
        {chat.error && <div className="messenger-send-error" role="alert">{chat.error} Черновик остался в поле ввода.</div>}
      </div>
      <MessageComposer inputRef={input} placeholder="Сообщение…" draft={chat.draft} onDraftChange={setDraft}
        suggestedDraft={open && !chat.messages.length ? ASSISTANT_PRODUCT_EXAMPLE : undefined}
        sending={chat.sending} disabled={voice.active} onSubmit={submit}
        extraAction={<Button type="button" data-control-icon size="icon" variant={voice.active ? 'default' : 'outline'}
          aria-label="Диктовка" aria-pressed={voice.active} aria-keyshortcuts={voice.supported ? 'Space' : undefined}
          aria-describedby={voiceStatus ? 'assistant-voice-status' : undefined} title={voice.active ? 'Остановить диктовку' : 'Начать диктовку'}
          disabled={!voice.supported || chat.sending || voice.stopping} onClick={voice.toggle}>
          {voice.active ? <Square aria-hidden="true" /> : <Mic aria-hidden="true" />}
        </Button>}
        status={<p id="assistant-voice-status" className={voiceStatus ? 'assistant-drawer__voice-status' : 'sr-only'} role="status">{voiceStatus}</p>} />
    </>}
  </AssistantPresets>;
}
