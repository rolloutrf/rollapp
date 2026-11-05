import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowUpRight, Bot, MessageCircle, Search, Send, X } from 'lucide-react';
import { ASSISTANT_CONTEXT_LIMIT, ASSISTANT_MESSAGE_LIMIT, ASSISTANT_NAME, ASSISTANT_SECTIONS, parseAssistantAction } from '../../shared/messenger-assistant.js';
import { localDateKey } from '../../shared/planning.js';
import { api } from '../api.js';
import { ControlBar } from './control-bar';
import { Button, buttonVariants } from './ui/button';
import { Checkbox } from './ui/checkbox';
import { cn } from '@/lib/utils';
import { Drawer, DrawerClose, DrawerContent, DrawerTitle, DrawerTrigger } from '@/components/ui/drawer';
import { useIsMobile } from '@/hooks/use-mobile';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import './messenger.css';

const base = '/messenger';
const assistantId = Symbol('messenger-assistant');
const assistantStarters = [
  ['Открыть календарь', 'Открой календарь Rollapp.'],
  ['Подготовить задачу', 'Подготовь задачу: собрать вопросы к встрече.'],
  ['Составить план', 'Помоги составить план на неделю.'],
];
const time = value => new Date(value).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
const date = value => new Date(value).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
function MessengerAvatar({ user }) {
  const [failed, setFailed] = useState(false);
  return <span className="messenger-avatar" aria-hidden="true">{user?.avatarUrl && !failed
    ? <img src={user.avatarUrl} alt="" onError={() => setFailed(true)} />
    : user?.name?.trim().slice(0, 1).toUpperCase() || <MessageCircle />}</span>;
}
function ErrorNotice({ error, retry }) {
  return <div className="messenger-error" role="alert"><p>{error}</p>{retry && <Button variant="outline" onClick={retry}>Повторить</Button>}</div>;
}
export function MessengerDrawer({ user, assistant, open, onOpenChange, initialConversationId }) {
  const isMobile = useIsMobile();
  const [presentation, setPresentation] = useState({ open, revision: 0 });
  // The closing popup can still be mounted while the next form opens or closes.
  // A new presentation starts from the directory even if that animation was interrupted.
  if (open !== presentation.open) {
    setPresentation({ open, revision: presentation.revision + Number(open) });
  }
  return <Drawer open={open} swipeDirection={isMobile ? 'down' : 'right'} onOpenChange={onOpenChange}>
    <DrawerTrigger render={<Button data-control-icon variant="outline" size="icon" className="messenger-fab" />} aria-label="Открыть сообщения" title="Сообщения">
      <MessageCircle aria-hidden="true" />
    </DrawerTrigger>
    <DrawerContent className="messenger-drawer app-drawer--form rollapp-body">
      <DrawerTitle className="sr-only">Сообщения</DrawerTitle>
      <Messenger key={presentation.revision} user={user} initialConversationId={initialConversationId} assistant={assistant} />
    </DrawerContent>
  </Drawer>;
}

function CloseMessages() {
  return <DrawerClose render={<Button data-control-icon variant="outline" size="icon" className="ml-auto" />} aria-label="Закрыть сообщения"><X aria-hidden="true" /></DrawerClose>;
}

function ParticipantEntry({ peer, disabled, onSelect }) {
  return <Button variant="ghost" className="messenger-person" disabled={disabled} onClick={() => onSelect(peer)}>
    <MessengerAvatar user={peer} />
    <span className="messenger-person-copy"><strong>{peer.name}</strong><small>@{peer.username}</small></span>
  </Button>;
}

function Messenger({ user, assistant, transport = api, initialConversationId = null }) {
  const [conversationId, setSelectedId] = useState(initialConversationId);
  const [conversations, setConversations] = useState([]);
  const [subscriptions, setSubscriptions] = useState(null);
  const [subscriptionsError, setSubscriptionsError] = useState('');
  const [openError, setOpenError] = useState('');
  const [subscriptionsReload, setSubscriptionsReload] = useState(0);
  const [query, setQuery] = useState('');
  const [users, setUsers] = useState([]);
  const [error, setError] = useState('');
  const [searchError, setSearchError] = useState('');
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [opening, setOpening] = useState(false);
  const [reload, setReload] = useState(0);
  const drafts = useRef(new Map());
  const mounted = useRef(true);
  const assistantEntry = useRef(null);
  const restoreAssistantFocus = useRef(false);
  useLayoutEffect(() => {
    if (conversationId === null && restoreAssistantFocus.current) {
      restoreAssistantFocus.current = false;
      assistantEntry.current?.focus({ preventScroll: true });
    }
  }, [conversationId]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const refresh = useCallback(() => setReload(value => value + 1), []);
  useEffect(() => {
    let alive = true, timer;
    async function load() {
      try {
        const data = await transport.get(`${base}/conversations`);
        if (alive) { setConversations(data.conversations); setError(''); }
      } catch (err) { if (alive) setError(err.message); }
      finally { if (alive) { setLoading(false); timer = setTimeout(load, 10000); } }
    }
    void load();
    return () => { alive = false; clearTimeout(timer); };
  }, [transport, reload]);
  useEffect(() => {
    let alive = true;
    setUsers([]); setSearchError('');
    const search = query.trim();
    setSearching(search.length >= 2);
    if (search.length < 2) return;
    const timer = setTimeout(async () => {
      try { const data = await transport.get(`${base}/participants?search=${encodeURIComponent(search)}`); if (alive) setUsers(data.users); }
      catch (err) { if (alive) setSearchError(err.message); }
      finally { if (alive) setSearching(false); }
    }, 300);
    return () => { alive = false; clearTimeout(timer); };
  }, [query, transport, reload]);
  useEffect(() => {
    let alive = true;
    setSubscriptionsError('');
    transport.get(`${base}/subscriptions`).then(data => {
      if (alive) setSubscriptions(data.users);
    }).catch(err => {
      if (alive) setSubscriptionsError(err.message);
    });
    return () => { alive = false; };
  }, [transport, subscriptionsReload]);

  async function start(peer) {
    if (opening) return;
    setOpenError('');
    const existing = conversations.find(item => item.peer.id === peer.id);
    if (existing) {
      setQuery('');
      setSelectedId(existing.id);
      return;
    }
    setOpening(true);
    try {
      const { conversation } = await transport.post(`${base}/conversations`, { participantId: peer.id });
      if (!mounted.current) return;
      setConversations(items => items.some(item => item.id === conversation.id) ? items : [conversation, ...items]);
      setQuery(''); setSelectedId(conversation.id); refresh();
    } catch (err) { if (mounted.current) setOpenError(err.message); }
    finally { if (mounted.current) setOpening(false); }
  }
  const peersWithConversations = new Set(conversations.map(item => item.peer.id));
  const contacts = subscriptions?.filter(peer => !peersWithConversations.has(peer.id)) ?? [];
  return <div className="messenger-layout">
    {conversationId === assistantId
      ? <AssistantConversation chat={assistant} onBack={() => { restoreAssistantFocus.current = true; setSelectedId(null); }} />
      : conversationId
      ? <Conversation key={`${user.id}:${conversationId}`} id={conversationId} user={user} peer={conversations.find(item => item.id === conversationId)?.peer} transport={transport} drafts={drafts.current} onChanged={refresh} onBack={() => setSelectedId(null)} />
      : <section className="messenger-directory" aria-label="Диалоги и подписки">
        <ControlBar as="header" className="messenger-heading">
          <h2 className="text-2xl font-semibold">Сообщения</h2>
          <CloseMessages />
        </ControlBar>
        <div className="messenger-search"><Search aria-hidden="true" /><Input type="search" aria-label="Найти участника" placeholder="Имя или username" value={query} maxLength={100} onChange={event => { setQuery(event.target.value); setOpenError(''); }} /></div>
        <div className="messenger-directory-scroll">
          {!query.trim() && <Button ref={assistantEntry} variant="ghost" className="messenger-person" disabled={opening} onClick={() => { setQuery(''); setOpenError(''); setSelectedId(assistantId); }}>
            <AssistantAvatar />
            <span className="messenger-person-copy"><strong>{ASSISTANT_NAME}</strong><span>{assistant.messages.at(-1)?.content || 'Задайте вопрос или обсудите идею'}</span></span>
          </Button>}
          {openError && <ErrorNotice error={openError} />}
          {query.trim() ? <>
            <p className="messenger-note">{query.trim().length < 2 ? 'Введите хотя бы два символа' : searching ? 'Ищем участников…' : 'Участники сервиса'}</p>
            {searchError && <ErrorNotice error={searchError} retry={refresh} />}
            {!searching && query.trim().length >= 2 && !searchError && !users.length && <p className="messenger-note">Участники не найдены</p>}
            {users.map(peer => <ParticipantEntry key={peer.id} peer={peer} disabled={opening} onSelect={start} />)}
          </> : <>
            {error && <ErrorNotice error={error} retry={refresh} />}
            {loading && <p className="messenger-note" role="status">Загружаем диалоги…</p>}
            {conversations.map(item => <Button variant="ghost" className="messenger-person" key={item.id} disabled={opening} onClick={() => { setOpenError(''); setSelectedId(item.id); }}>
              <MessengerAvatar user={item.peer} /><span className="messenger-person-copy"><strong>{item.peer.name}</strong><span>{item.lastMessage?.body || 'Пока нет сообщений'}</span></span>
              {item.unread > 0 && <span className="messenger-unread" aria-label={`${item.unread} непрочитанных`}>{item.unread > 99 ? '99+' : item.unread}</span>}
            </Button>)}
            {subscriptionsError && <ErrorNotice error={subscriptionsError} retry={() => setSubscriptionsReload(value => value + 1)} />}
            {!subscriptions && !subscriptionsError && <p className="messenger-note" role="status">Загружаем подписки…</p>}
            {!loading && contacts.length > 0 && <section aria-labelledby="messenger-subscriptions">
              <h3 id="messenger-subscriptions" className="messenger-section-label text-xs font-semibold uppercase">Подписки</h3>
              {contacts.map(peer => <ParticipantEntry key={peer.id} peer={peer} disabled={opening} onSelect={start} />)}
            </section>}
            {!loading && !error && !subscriptionsError && subscriptions?.length === 0 && !conversations.length && <div className="messenger-empty"><MessageCircle aria-hidden="true" /><h3 className="text-xl font-medium">Начните разговор</h3><p>Найдите участника по имени или username и напишите ему.</p></div>}
          </>}
        </div>
      </section>}
  </div>;
}

export function useMessengerAssistant() {
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [includePlanning, setIncludePlanning] = useState(false);
  const pending = useRef(null);
  useEffect(() => () => pending.current?.abort(), []);

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
      const { reply, actions } = await api.post(`${base}/assistant/reply`, {
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
      pending.current = null;
      if (!controller.signal.aborted) setSending(false);
    }
  }
  return { messages, draft, setDraft, sending, error, submit, includePlanning, setIncludePlanning };
}

function AssistantAvatar() {
  return <span className="messenger-avatar" aria-hidden="true"><Bot className="size-5" /></span>;
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

function AssistantConversation({ chat, onBack }) {
  const back = useRef(null);
  const history = useRef(null);
  const input = useRef(null);
  const atBottom = useRef(true);
  useLayoutEffect(() => { back.current?.focus({ preventScroll: true }); }, []);
  useLayoutEffect(() => {
    if (atBottom.current && (chat.messages.length || chat.sending || chat.error)) {
      history.current.scrollTop = history.current.scrollHeight;
    }
  }, [chat.messages, chat.sending, chat.error]);
  return <section className="messenger-conversation messenger-assistant-conversation" aria-label={ASSISTANT_NAME}>
    <ControlBar as="header" className="messenger-heading">
      <Button ref={back} data-control-icon variant="outline" size="icon" onClick={onBack} aria-label="Все диалоги"><ArrowLeft aria-hidden="true" /></Button>
      <AssistantAvatar />
      <span className="messenger-person-copy"><strong>{ASSISTANT_NAME}</strong></span>
      <CloseMessages />
    </ControlBar>
    <div className="messenger-history" ref={history} role="log" aria-live="polite" tabIndex={0} aria-label="История сообщений" onScroll={event => {
      const node = event.currentTarget;
      atBottom.current = node.scrollHeight - node.scrollTop - node.clientHeight < 48;
    }}>
      <p className="messenger-note">Помогу найти раздел, составить план или подготовить задачу, событие и заметку. Сообщения этого чата обрабатывает OpenRouter.</p>
      {!chat.messages.length && !chat.draft && <div role="group" aria-label="Примеры запросов" className="flex shrink-0 flex-wrap justify-center gap-2">
        {assistantStarters.map(([label, prompt]) => <Button key={label} type="button" variant="outline" className="min-h-12 rounded-full px-6" onClick={() => {
          chat.setDraft(prompt);
          input.current?.focus();
        }}>{label}</Button>)}
      </div>}
      {chat.messages.map(({ role, content, actions }, index) => <article key={index} className="messenger-message messenger-assistant-message" data-own={role === 'user' || undefined}
        aria-label={role === 'user' ? 'Ваше сообщение' : 'Ответ ассистента'}><p>{content}</p><AssistantActions actions={actions} /></article>)}
      {chat.sending && <p className="messenger-note" role="status">Ассистент готовит ответ…</p>}
      {chat.error && <div className="messenger-send-error" role="alert">{chat.error} Черновик остался в поле ввода.</div>}
    </div>
    <MessageComposer inputRef={input} draft={chat.draft} onDraftChange={chat.setDraft} sending={chat.sending} onSubmit={chat.submit}>
      <label className="messenger-planning-option">
        <Checkbox aria-labelledby="messenger-planning-label" aria-describedby="messenger-planning-description"
          checked={chat.includePlanning} onCheckedChange={chat.setIncludePlanning} disabled={chat.sending} />
        <span><span id="messenger-planning-label">Учесть моё планирование</span><small id="messenger-planning-description">Передать OpenRouter задачи и события на 7 дней</small></span>
      </label>
    </MessageComposer>
  </section>;
}

function Conversation({ id, user, peer: initialPeer, transport, drafts, onChanged, onBack }) {
  const [peer, setPeer] = useState(initialPeer);
  const [messages, setMessages] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [olderBusy, setOlderBusy] = useState(false);
  const [error, setError] = useState('');
  const [sendError, setSendError] = useState('');
  const [draft, setDraft] = useState(drafts.get(id)?.body || '');
  const [sending, setSending] = useState(false);
  const [reload, setReload] = useState(0);
  const alive = useRef(true), list = useRef(null), bottom = useRef(true), initial = useRef(true), sendingLock = useRef(false), readId = useRef('');
  const scrollRestore = useRef(null), latest = useRef(null);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  function merge(incoming) {
    for (const item of incoming) if (!latest.current || BigInt(item.id) > BigInt(latest.current)) latest.current = item.id;
    setMessages(previous => [...new Map([...previous, ...incoming].map(item => [item.id, item])).values()].sort((a,b) => BigInt(a.id) < BigInt(b.id) ? -1 : 1));
  }
  useEffect(() => {
    let active = true, timer;
    async function load() {
      if (document.visibilityState === 'hidden') { timer = setTimeout(load, 5000); return; }
      try {
        let more;
        do {
          const after = latest.current;
          const data = await transport.get(`${base}/conversations/${id}/messages${after ? `?after=${after}` : ''}`);
          if (!active) return;
          setPeer(data.peer); merge(data.messages); setError('');
          if (!after) setHasMore(data.hasMore);
          more = Boolean(after && data.hasMore && data.messages.length);
        } while (more && active);
      } catch (err) { if (active) setError(err.message); }
      finally { if (active) { setLoading(false); timer = setTimeout(load, 5000); } }
    }
    void load();
    return () => { active = false; clearTimeout(timer); };
  }, [id, transport, reload]);
  const lastId = messages.at(-1)?.id;
  const acknowledge = useCallback(async () => {
    if (!lastId || !bottom.current || document.visibilityState !== 'visible' || !document.hasFocus() || readId.current === lastId) return;
    readId.current = lastId;
    try { await transport.post(`${base}/conversations/${id}/read`, { lastId }); if (alive.current) onChanged(); }
    catch { if (alive.current) readId.current = ''; }
  }, [lastId, id, transport, onChanged]);
  useEffect(() => {
    void acknowledge();
    const timer = setInterval(acknowledge, 5000);
    window.addEventListener('focus', acknowledge); document.addEventListener('visibilitychange', acknowledge);
    return () => { clearInterval(timer); window.removeEventListener('focus', acknowledge); document.removeEventListener('visibilitychange', acknowledge); };
  }, [acknowledge]);
  useLayoutEffect(() => {
    const node = list.current; if (!node || loading) return;
    if (scrollRestore.current) { node.scrollTop += node.scrollHeight - scrollRestore.current.height; scrollRestore.current = null; }
    else if (bottom.current || initial.current) node.scrollTop = node.scrollHeight;
    initial.current = false;
  }, [messages, loading]);
  async function older() {
    if (olderBusy || !messages.length) return;
    setOlderBusy(true);
    try {
      const data = await transport.get(`${base}/conversations/${id}/messages?before=${messages[0].id}`);
      if (!alive.current) return;
      scrollRestore.current = { height: list.current.scrollHeight }; bottom.current = false;
      merge(data.messages); setHasMore(data.hasMore); setError('');
    } catch (err) { if (alive.current) setError(err.message); }
    finally { if (alive.current) setOlderBusy(false); }
  }
  async function submit(event) {
    event.preventDefault();
    if (!draft.trim() || sendingLock.current || loading || !peer) return;
    const saved = drafts.get(id);
    const pending = saved?.body === draft && saved?.clientId ? saved : { body: draft, clientId: crypto.randomUUID() };
    drafts.set(id, pending); sendingLock.current = true; setSending(true); setSendError('');
    try {
      const data = await transport.post(`${base}/conversations/${id}/messages`, pending);
      // Preserve an ambiguous failed send's clientId across navigation for safe retry.
      // An offscreen completion must keep the UUID for a restored draft.
      // Its next retry can safely resolve the already committed message.
      if (!alive.current) return;
      if (drafts.get(id) === pending) drafts.delete(id);
      bottom.current = true; merge([data.message]); setDraft(''); onChanged();
    } catch (err) { if (alive.current) setSendError(err.message); }
    finally { sendingLock.current = false; if (alive.current) setSending(false); }
  }
  return <section className="messenger-conversation" aria-label={peer ? `Переписка с ${peer.name}` : 'Переписка'}>
    <ControlBar as="header" className="messenger-heading">
      <Button data-control-icon variant="outline" size="icon" onClick={onBack} aria-label="Все диалоги"><ArrowLeft aria-hidden="true" /></Button>
      {peer && <><MessengerAvatar user={peer} /><span className="messenger-person-copy"><strong>{peer.name}</strong><small>@{peer.username}</small></span></>}
      <CloseMessages />
    </ControlBar>
    <div className="messenger-history" ref={list} role="log" aria-live="polite" tabIndex={0} aria-label="История сообщений" onScroll={() => {
      const node = list.current; bottom.current = node.scrollHeight - node.scrollTop - node.clientHeight < 48; void acknowledge();
    }}>
      {error && <ErrorNotice error={error} retry={() => setReload(value => value + 1)} />}
      {loading && <p className="messenger-note" role="status">Загружаем сообщения…</p>}
      {hasMore && <Button variant="outline" className="rounded-full" disabled={olderBusy} onClick={older}>{olderBusy ? 'Загружаем…' : 'Предыдущие сообщения'}</Button>}
      {!loading && !error && !messages.length && <p className="messenger-note">Здесь начинается ваш разговор.</p>}
      {messages.map((item, index) => <div className="messenger-message-group" key={item.id}>
        {(!index || date(messages[index - 1].createdAt) !== date(item.createdAt)) && <p className="messenger-day">{date(item.createdAt)}</p>}
        <article className="messenger-message" data-own={item.senderId === user.id || undefined} aria-label={item.senderId === user.id ? 'Ваше сообщение' : `Сообщение от ${peer?.name || 'собеседника'}`}><p>{item.body}</p><time dateTime={item.createdAt}>{time(item.createdAt)}</time></article>
      </div>)}
    </div>
    <MessageComposer draft={draft} sending={sending} sendError={sendError} disabled={loading || !peer} onSubmit={submit}
      onDraftChange={value => { setDraft(value); drafts.set(id, { body: value }); }} />
  </section>;
}

function MessageComposer({ inputRef, draft, sending, sendError, disabled, onSubmit, onDraftChange, children }) {
  return <form className="messenger-composer" onSubmit={onSubmit} aria-label="Новое сообщение">
      {children}
      {sendError && <div className="messenger-send-error" role="alert">{sendError} Текст сохранён — попробуйте отправить снова.</div>}
      <label htmlFor="messenger-text" className="sr-only">Сообщение</label>
      <Textarea ref={inputRef} id="messenger-text" placeholder="Напишите сообщение…" rows={1} maxLength={ASSISTANT_MESSAGE_LIMIT} value={draft} readOnly={sending} aria-busy={sending} onChange={event => onDraftChange(event.target.value)} onKeyDown={event => {
        if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing && (event.ctrlKey || event.metaKey)) { event.preventDefault(); event.currentTarget.form.requestSubmit(); }
      }} />
      <ControlBar><Button type="submit" data-control-icon size="icon" aria-label={sending ? 'Отправляем сообщение' : 'Отправить сообщение'} disabled={sending || disabled || !draft.trim()}><Send aria-hidden="true" /></Button></ControlBar>
      <p className="messenger-composer-hint">{draft.length}/{ASSISTANT_MESSAGE_LIMIT} · Ctrl/⌘ + Enter — отправить</p>
  </form>;
}
