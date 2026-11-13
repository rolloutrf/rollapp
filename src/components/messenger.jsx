import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowLeft, MessageCircle, Search, Send, X } from 'lucide-react';
import { ASSISTANT_MESSAGE_LIMIT } from '../../shared/messenger-assistant.js';
import { api } from '../api.js';
import { ControlBar } from './control-bar';
import { Button } from './ui/button';
import { Drawer, DrawerClose, DrawerContent, DrawerTitle, DrawerTrigger } from '@/components/ui/drawer';
import { useIsMobile } from '@/hooks/use-mobile';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import './messenger.css';

const base = '/messenger';
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
export function MessengerDrawer({ user, open, onOpenChange, initialConversationId }) {
  const [presentation, setPresentation] = useState({ open, revision: 0 });
  // The closing popup can still be mounted while the next form opens or closes.
  // A new presentation starts from the directory even if that animation was interrupted.
  if (open !== presentation.open) {
    setPresentation({ open, revision: presentation.revision + Number(open) });
  }
  return <MessageDrawer open={open} onOpenChange={onOpenChange} triggerClassName="messenger-fab"
    title="Сообщения" triggerLabel="Открыть сообщения" icon={MessageCircle}>
    <DrawerTitle className="sr-only">Сообщения</DrawerTitle>
    <Messenger key={presentation.revision} user={user} initialConversationId={initialConversationId} />
  </MessageDrawer>;
}

export function MessageDrawer({ open, onOpenChange, triggerClassName, title, triggerLabel = title, icon: Icon, initialFocus, onAfterClose, children }) {
  const isMobile = useIsMobile();
  return <Drawer open={open} swipeDirection={isMobile ? 'down' : 'right'} onOpenChange={onOpenChange}
    onOpenChangeComplete={nextOpen => { if (!nextOpen) onAfterClose?.(); }}>
    <DrawerTrigger render={<Button data-control-icon variant="outline" size="icon" className={triggerClassName} />} aria-label={triggerLabel} title={title}>
      <Icon aria-hidden="true" />
    </DrawerTrigger>
    <DrawerContent className="messenger-drawer app-drawer--form rollapp-body" initialFocus={initialFocus}>
      {children}
    </DrawerContent>
  </Drawer>;
}

export function MessageDrawerClose({ label = 'Закрыть сообщения' }) {
  return <DrawerClose render={<Button data-control-icon variant="outline" size="icon" className="ml-auto" />} aria-label={label}><X aria-hidden="true" /></DrawerClose>;
}

function ParticipantEntry({ peer, disabled, onSelect }) {
  return <Button variant="ghost" className="messenger-person" disabled={disabled} onClick={() => onSelect(peer)}>
    <MessengerAvatar user={peer} />
    <span className="messenger-person-copy"><strong>{peer.name}</strong><small>@{peer.username}</small></span>
  </Button>;
}

function Messenger({ user, transport = api, initialConversationId = null }) {
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
    {conversationId
      ? <Conversation key={`${user.id}:${conversationId}`} id={conversationId} user={user} peer={conversations.find(item => item.id === conversationId)?.peer} transport={transport} drafts={drafts.current} onChanged={refresh} onBack={() => setSelectedId(null)} />
      : <section className="messenger-directory" aria-label="Диалоги и подписки">
        <ControlBar as="header" className="messenger-heading">
          <h2 className="text-2xl font-semibold">Сообщения</h2>
          <MessageDrawerClose />
        </ControlBar>
        <div className="messenger-search"><Search aria-hidden="true" /><Input type="search" aria-label="Найти участника" placeholder="Имя или username" value={query} maxLength={100} onChange={event => { setQuery(event.target.value); setOpenError(''); }} /></div>
        <div className="messenger-directory-scroll">
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
      <MessageDrawerClose />
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
      status={<p className="messenger-composer-hint">{draft.length}/{ASSISTANT_MESSAGE_LIMIT} · Ctrl/⌘ + Enter — отправить</p>}
      onDraftChange={value => { setDraft(value); drafts.set(id, { body: value }); }} />
  </section>;
}

export function MessageComposer({ inputRef, placeholder = 'Напишите сообщение…', suggestedDraft, draft, sending, sendError, disabled, onSubmit, onDraftChange, extraAction, status }) {
  const showSuggestion = Boolean(suggestedDraft && !draft && !sending && !disabled);

  function handleKeyDown(event) {
    if (event.nativeEvent.isComposing || event.shiftKey) return;
    if (event.key === 'Tab' && showSuggestion && !event.altKey && !event.ctrlKey && !event.metaKey) {
      event.preventDefault();
      onDraftChange(suggestedDraft);
    } else if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      event.currentTarget.form.requestSubmit();
    }
  }

  return <form className="messenger-composer" onSubmit={event => {
    if (disabled) event.preventDefault();
    else onSubmit(event);
  }} aria-label="Новое сообщение">
      {sendError && <div className="messenger-send-error" role="alert">{sendError} Текст сохранён — попробуйте отправить снова.</div>}
      <label htmlFor="messenger-text" className="sr-only">Сообщение</label>
      {showSuggestion && <span id="messenger-suggestion-hint" className="sr-only">Нажмите Tab, чтобы вставить пример сообщения.</span>}
      <Textarea ref={inputRef} id="messenger-text" placeholder={showSuggestion ? suggestedDraft : placeholder} rows={1}
        maxLength={ASSISTANT_MESSAGE_LIMIT} value={draft} readOnly={sending} aria-busy={sending}
        aria-describedby={showSuggestion ? 'messenger-suggestion-hint' : undefined} aria-keyshortcuts={showSuggestion ? 'Tab' : undefined}
        onChange={event => onDraftChange(event.target.value)} onKeyDown={handleKeyDown} />
      <ControlBar className="messenger-composer-actions">{extraAction}<Button type="submit" data-control-icon size="icon" aria-label={sending ? 'Отправляем сообщение' : 'Отправить сообщение'} disabled={sending || disabled || !draft.trim()}><Send aria-hidden="true" /></Button></ControlBar>
      {status}
  </form>;
}
