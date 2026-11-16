import { useSession } from "../auth/session.jsx";
import { NOTE_TASKS_REQUEST_EVENT } from "@/modules/assistant/planning-assistant.js";
import { AssistantNoteTasks, createNoteTaskRows } from "@/modules/assistant/assistant-note-tasks.jsx";
import { AssistantDrawer, useAssistantChats } from "@/modules/assistant/assistant-drawer.jsx";
import { MessengerDrawer } from "@/components/messenger";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, Columns3, X } from "lucide-react";
import { ControlBar } from "@/components/control-bar";
import { PlanningSpaceSwitcher } from "@/modules/planning/planning-space-switcher.jsx";
import { PLANNING_TABS } from "@/modules/planning/planning-space.jsx";
import { cn } from "@/lib/utils";
import { Button as ShadcnButton, buttonVariants } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";
import { useIsMobile } from "@/hooks/use-mobile";
import { canAccessPrivateSpheres } from "../shell/service-navigation.js";
import { isPublicWishDetailPath, APP_WISH_CATALOG_PATH } from "../shell/app-routing.js";
import { publicWishPath } from "../../../shared/modules/profile/profile-links.js";
import { APP_HOME } from "../shell/home-path.jsx";
import { useProfileEditor } from "../profile/profile-editor.jsx";
import { PLANNING_SERVICE, isAssistantPath } from "../shell/service-menu.jsx";
import { WishModal } from "../wishlist/wish-editor.jsx";

export function PlanningFab() {
  const { user } = useSession();
  return user ? <PlanningControls key={user.id} user={user} /> : null;
}

function PlanningControls({ user }) {
  const location = useLocation();
  const isMobile = useIsMobile();
  const returnPath = useRef(APP_HOME);
  useEffect(() => {
    if (location.pathname !== PLANNING_SERVICE.path && !isAssistantPath(location.pathname)) {
      returnPath.current = `${location.pathname}${location.search}${location.hash}`;
    }
  }, [location.pathname, location.search, location.hash]);
  const [open, setOpen] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const assistant = useAssistantChats(assistantOpen);
  const { showList: showAssistantList } = assistant;
  const profileEditor = useProfileEditor();
  const { noteReviews, updateNoteReview } = assistant;
  const [noteRequest, setNoteRequest] = useState(null);
  const [noteTaskReview, setNoteTaskReview] = useState(null);
  const pendingNoteReview = useRef(null);
  const noteReviewLocation = useRef(null);
  const noteReviewReturning = useRef(false);
  const pageParams = new URLSearchParams(location.search);
  pageParams.delete("formScreen");
  const pageLocation = `${location.pathname}?${pageParams}`;
  const openNoteId = location.pathname === PLANNING_SERVICE.path && pageParams.get("tab") === "notes" ? pageParams.get("note") : null;
  const [messagesOpen, setMessagesOpen] = useState(false);
  const [initialConversationId, setInitialConversationId] = useState(null);
  const [assistantWish, setAssistantWish] = useState(null);
  const assistantWishSource = useRef(null);
  const pendingAssistantWish = useRef(null);
  const assistantWishActive = useRef(false);
  const assistantWishResult = useRef(null);
  const navigate = useNavigate();
  const finishAssistantWish = () => {
    if (!assistantWishActive.current) return;
    assistantWishActive.current = false;
    const saved = assistantWishResult.current;
    assistantWishResult.current = null;
    const source = assistantWishSource.current;
    assistantWishSource.current = null;
    if (saved?.id) navigate(publicWishPath(user, saved.id));
    else if (source === location.pathname) setAssistantOpen(true);
  };
  const closeAssistantWish = (saved) => {
    if (!assistantWishActive.current) return;
    assistantWishResult.current = saved || null;
    setAssistantWish(null);
    if (!isMobile) finishAssistantWish();
  };
  useLayoutEffect(() => {
    if (noteTaskReview && noteReviewLocation.current === pageLocation) return;
    if (noteTaskReview) {
      noteReviewLocation.current = null;
      noteReviewReturning.current = false;
      setNoteTaskReview(null);
    }
    if (assistantWishActive.current && assistantWishSource.current === location.pathname) return;
    if (assistantWishActive.current) {
      assistantWishActive.current = false;
      assistantWishResult.current = null;
      assistantWishSource.current = null;
      setAssistantWish(null);
    }
    pendingAssistantWish.current = null;
    pendingNoteReview.current = null;
    setNoteRequest(null);
    const showMessages = Boolean(location.state?.messengerOpen);
    const showAssistant = !showMessages && Boolean(location.state?.assistantOpen);
    setOpen(false);
    if (showAssistant) showAssistantList();
    setAssistantOpen(showAssistant);
    setMessagesOpen(showMessages);
    setInitialConversationId(location.state?.messengerConversationId || null);
  }, [location, showAssistantList]);
  const setMessengerDrawerOpen = (value) => {
    setMessagesOpen(value);
    if (value) {
      setOpen(false);
      setAssistantOpen(false);
    }
    else setInitialConversationId(null);
  };
  const setAssistantDrawerOpen = (value) => {
    setAssistantOpen(value);
    if (value) {
      showAssistantList();
      setOpen(false);
      setMessengerDrawerOpen(false);
    }
  };
  useEffect(() => {
    if (!openNoteId) return;
    const openTasks = event => {
      if (event.detail?.noteId !== openNoteId) return;
      setNoteRequest(event.detail);
      setOpen(false);
      setMessagesOpen(false);
      setInitialConversationId(null);
      setAssistantOpen(true);
    };
    window.addEventListener(NOTE_TASKS_REQUEST_EVENT, openTasks);
    return () => window.removeEventListener(NOTE_TASKS_REQUEST_EVENT, openTasks);
  }, [openNoteId]);
  if (isAssistantPath(location.pathname) || location.pathname.startsWith("/app/messenger") || location.pathname.startsWith(`${APP_WISH_CATALOG_PATH}/item/`) || (isMobile && isPublicWishDetailPath(location.pathname))) return null;
  const inPlanning = location.pathname === PLANNING_SERVICE.path;
  const search = new URLSearchParams(location.search);
  const requestedTab = search.get("tab");
  const currentTab = PLANNING_TABS.some(({ id }) => id === requestedTab) ? requestedTab : "kanban";
  const noteGroupId = search.get("noteGroup");
  const backToNotes = inPlanning && currentTab === "notes" && Boolean(search.get("note") || noteGroupId);
  const backNotesSearch = new URLSearchParams({ tab: "notes" });
  if (search.get("note") && noteGroupId) backNotesSearch.set("noteGroup", noteGroupId);
  const backLabel = backToNotes ? "Назад к заметкам" : "Назад в приложение";
  return (
    <ControlBar className="planning-fab-controls" data-has-back={inPlanning || undefined} data-daily-todo={inPlanning && currentTab === "todo" || undefined}>
      <AssistantDrawer workspace={assistant} canDiscoverSpheres={canAccessPrivateSpheres(user)} noteId={openNoteId} noteRequest={noteRequest}
        onReviewNoteTasks={draft => {
          if (pendingNoteReview.current || pendingAssistantWish.current || noteTaskReview) return;
          pendingNoteReview.current = draft;
          setAssistantDrawerOpen(false);
        }} open={assistantOpen} onOpenChange={setAssistantDrawerOpen} onWishlistChanged={profileEditor?.refreshWishlist} onReviewWish={(draft) => {
        if (pendingAssistantWish.current || assistantWishActive.current) return;
        pendingAssistantWish.current = draft;
        setAssistantDrawerOpen(false);
      }} onAfterClose={() => {
        if (pendingNoteReview.current) {
          const draft = pendingNoteReview.current;
          pendingNoteReview.current = null;
          noteReviewLocation.current = pageLocation;
          noteReviewReturning.current = true;
          updateNoteReview(draft.batchId, current => current ?? { rows: createNoteTaskRows(draft.tasks) });
          setNoteTaskReview(draft);
          return;
        }
        if (!pendingAssistantWish.current) return;
        assistantWishActive.current = true;
        assistantWishSource.current = location.pathname;
        setAssistantWish(pendingAssistantWish.current);
        pendingAssistantWish.current = null;
      }} />
      {noteTaskReview && <AssistantNoteTasks key={noteTaskReview.batchId} value={noteTaskReview} review={noteReviews[noteTaskReview.batchId]}
        onUpdate={change => updateNoteReview(noteTaskReview.batchId, change)} onAfterClose={() => {
          if (!noteReviewReturning.current) return;
          noteReviewReturning.current = false;
          noteReviewLocation.current = null;
          setNoteTaskReview(null);
          setAssistantOpen(true);
        }} />}
      {assistantWish && <WishModal initialDraft={assistantWish} onClose={() => closeAssistantWish()}
        onSaved={closeAssistantWish} onAfterClose={finishAssistantWish} />}
      <MessengerDrawer user={user} open={messagesOpen} onOpenChange={setMessengerDrawerOpen} initialConversationId={initialConversationId} />
      {inPlanning && <Link
        data-control-icon
        to={backToNotes ? `${PLANNING_SERVICE.path}?${backNotesSearch}` : returnPath.current}
        className={cn(buttonVariants({ variant: "outline", size: "icon" }), "planning-fab planning-fab--back rounded-full")}
        aria-label={backLabel}
        title={backLabel}
      ><ArrowLeft aria-hidden="true" /></Link>}
      {inPlanning && isMobile && <div className="planning-fab-space"><PlanningSpaceSwitcher /></div>}
    <Popover open={open} onOpenChange={value => {
      setOpen(value);
      if (value) {
        setAssistantOpen(false);
        setMessengerDrawerOpen(false);
      }
    }}>
      <PopoverTrigger
        render={<ShadcnButton data-control-icon className="planning-fab planning-fab--launcher" variant="outline" size="icon" type="button" />}
        aria-label="Открыть планирование"
        title="Планирование"
      >
        {open ? <X aria-hidden="true" /> : <Columns3 aria-hidden="true" />}
      </PopoverTrigger>
      <PopoverContent className="planning-fab__panel app-navigation-popup rollapp-body w-80 max-w-(--available-width) !rounded-2xl !p-2" side="top" align="end" sideOffset={12}>
        <PopoverTitle className="sr-only">Планирование</PopoverTitle>
        <nav className="flex flex-col gap-1" aria-label="Инструменты планирования">
          {PLANNING_TABS.map(({ id, label, icon: Icon }) => (
            <Link key={id} to={`${PLANNING_SERVICE.path}?tab=${id}`}
              className={buttonVariants({ variant: inPlanning && currentTab === id ? "secondary" : "ghost", className: "!h-auto !min-h-12 !justify-start !gap-3 !rounded-xl !px-3 !py-3" })}
              aria-current={inPlanning && currentTab === id ? "page" : undefined}
              onClick={() => setOpen(false)}
            ><Icon aria-hidden="true" /><span>{label}</span></Link>
          ))}
        </nav>
      </PopoverContent>
    </Popover>
    </ControlBar>
  );
}
