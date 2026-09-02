import { useEffect, useId, useState } from "react";
import {
  AlertTriangle, Ban, CalendarDays, CheckCircle2, Clock3, ExternalLink, MapPin,
  RotateCcw, Ungroup, Video, X,
} from "lucide-react";
import { api } from "@/api";
import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle,
} from "@/components/ui/card";
import {
  Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle,
} from "@/components/ui/drawer";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { useCardReorder } from "@/hooks/use-card-reorder";
import { useSphereSharing } from "@/lib/sphere-sharing";
import { useIsMobile } from "@/hooks/use-mobile";
import { savedOrder } from "@/lib/card-order";
import {
  EducationItemListMenu, EducationListDrawer, EducationListNavigation, EducationSectionHeader,
} from "@/components/education-lists";
import {
  applyEducationGroupChange, EducationItemGroupOverlay, EducationItemGroupTile, russianCountLabel,
} from "@/components/education-item-groups";
import {
  educationApiListId, educationItemsInList, educationListSelection,
  mergeEducationListOrder, UNLISTED_EDUCATION_LIST_ID,
} from "@/lib/education-lists";

const EMPTY_SESSION = {
  title: "",
  coach: "",
  status: "scheduled",
  format: "online",
  location: "",
  url: "",
  description: "",
  sessionOn: "",
  sessionTime: "",
  durationMinutes: "",
  listId: "",
};

const SESSION_STATUS = {
  scheduled: { label: "Запланирована", variant: "default", icon: Clock3 },
  completed: { label: "Проведена", variant: "secondary", icon: CheckCircle2 },
  cancelled: { label: "Отменена", variant: "outline", icon: Ban },
};

const SESSION_FORMAT = {
  online: "Онлайн",
  offline: "Офлайн",
};

const STATUS_ORDER = ["scheduled", "completed", "cancelled"];

function statusRank(status) {
  const rank = STATUS_ORDER.indexOf(status);
  return rank === -1 ? STATUS_ORDER.length : rank;
}

function sortSessions(sessions) {
  return [...sessions].sort((left, right) => {
    const savedOrderDifference = savedOrder(left) - savedOrder(right);
    if (savedOrderDifference) return savedOrderDifference;
    const statusDifference = statusRank(left.status) - statusRank(right.status);
    if (statusDifference) return statusDifference;
    const leftDate = String(left.sessionOn || "");
    const rightDate = String(right.sessionOn || "");
    if (left.status === "scheduled") {
      if (!leftDate) return 1;
      if (!rightDate) return -1;
      return leftDate.localeCompare(rightDate) || String(left.sessionTime || "").localeCompare(String(right.sessionTime || ""));
    }
    return rightDate.localeCompare(leftDate) || String(right.updatedAt || "").localeCompare(String(left.updatedAt || ""));
  });
}

function formatDate(value) {
  if (!value) return "";
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return "";
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" })
    .format(new Date(Date.UTC(year, month - 1, day)))
    .replace(" г.", "");
}

function sessionScheduleLabel(session) {
  const parts = [];
  if (session.sessionOn) parts.push(formatDate(session.sessionOn));
  if (session.sessionTime) parts.push(session.sessionTime);
  if (session.durationMinutes) parts.push(`${session.durationMinutes} мин`);
  return parts.length ? parts.join(" · ") : "Дата и время не указаны";
}

const sessionCountLabel = (count) => russianCountLabel(count, "сессия", "сессии", "сессий");

function coachingSessionFormValues(session, initialListId = "") {
  if (!session) return { ...EMPTY_SESSION, listId: initialListId };
  return Object.fromEntries(
    Object.keys(EMPTY_SESSION).map((field) => [
      field,
      field === "durationMinutes" && session[field] != null
        ? String(session[field])
        : session[field] ?? EMPTY_SESSION[field],
    ]),
  );
}

function CoachingSessionCard({
  session, dragDescriptionId, lists, moveDisabled, moving, onCreateList, onEdit, onMove, onMoveToList,
  onRemoveFromGroup, removeBusy = false, draggable = true,
}) {
  const status = SESSION_STATUS[session.status] || SESSION_STATUS.scheduled;
  const StatusIcon = status.icon;
  const FormatIcon = session.format === "online" ? Video : MapPin;
  return (
    <div className="relative h-full min-w-0">
      <Button
        className={`peer absolute inset-0 z-10 h-full w-full touch-pan-y rounded-xl bg-transparent p-0 hover:bg-transparent active:translate-y-0 ${draggable ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"}`}
        variant="ghost"
        type="button"
        data-card-drag-trigger={draggable ? "" : undefined}
        aria-describedby={dragDescriptionId || undefined}
        aria-haspopup="dialog"
        aria-label={draggable ? `Открыть и переместить коучинг-сессию «${session.title}»` : `Открыть коучинг-сессию «${session.title}»`}
        title={draggable ? "Нажмите, чтобы редактировать. Для группы перетащите на центр другой сессии и дождитесь подсветки" : "Нажмите, чтобы редактировать"}
        onClick={() => onEdit(session)}
        onKeyDown={(event) => {
          if (!draggable) return;
          if (["ArrowLeft", "ArrowUp"].includes(event.key)) {
            event.preventDefault();
            onMove(session.id, -1);
          }
          if (["ArrowRight", "ArrowDown"].includes(event.key)) {
            event.preventDefault();
            onMove(session.id, 1);
          }
        }}
      >
        <span className="sr-only">Открыть или переместить коучинг-сессию «{session.title}»</span>
      </Button>
      <Card className="pointer-events-none h-full min-w-0 transition-colors peer-hover:bg-muted/40">
        <CardHeader>
          <CardTitle><h3 className="m-0 font-heading text-base leading-snug font-medium">{session.title}</h3></CardTitle>
          {session.coach && <CardDescription className="truncate">{session.coach}</CardDescription>}
          <CardAction className="pointer-events-auto relative z-20 flex items-center gap-1">
            <Badge variant={status.variant}>
              <StatusIcon data-icon="inline-start" aria-hidden="true" />
              {status.label}
            </Badge>
            <EducationItemListMenu
              currentListId={session.listId}
              disabled={moveDisabled}
              itemLabel="коучинг-сессию"
              itemTitle={session.title}
              lists={lists}
              moving={moving}
              onCreateList={onCreateList}
              onMove={(listId) => onMoveToList(session, listId)}
            />
            {onRemoveFromGroup && (
              <Button
                className="pointer-events-auto relative z-20 size-9 rounded-full"
                variant="ghost"
                size="icon-lg"
                type="button"
                disabled={removeBusy}
                aria-label={`Убрать коучинг-сессию «${session.title}» из группы`}
                title="Убрать из группы"
                onClick={() => onRemoveFromGroup(session)}
              >
                {removeBusy ? <Spinner aria-hidden="true" /> : <Ungroup aria-hidden="true" />}
              </Button>
            )}
          </CardAction>
        </CardHeader>
        <CardContent className="flex flex-1 flex-col gap-4">
          {session.description && <p className="m-0 text-sm text-muted-foreground text-pretty">{session.description}</p>}
          <div className="mt-auto flex flex-col gap-2 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <CalendarDays className="size-4" aria-hidden="true" />
              <span>{sessionScheduleLabel(session)}</span>
            </div>
            <div className="flex items-center gap-2">
              <FormatIcon className="size-4" aria-hidden="true" />
              <span>{SESSION_FORMAT[session.format]}{session.location ? ` · ${session.location}` : ""}</span>
            </div>
          </div>
        </CardContent>
        {session.url && (
          <CardFooter className="justify-end">
            <a
              className={buttonVariants({ variant: "outline", size: "default", className: "pointer-events-auto relative z-20 min-h-12 px-4 text-base" })}
              href={session.url}
              target="_blank"
              rel="noreferrer"
            >
              <ExternalLink data-icon="inline-start" aria-hidden="true" />
              Открыть ссылку
            </a>
          </CardFooter>
        )}
      </Card>
    </div>
  );
}

function CoachingSessionDrawer({ initialListId = "", lists = [], open, session, onOpenChange, onSaved }) {
  const isMobile = useIsMobile();
  const formId = useId();
  const [form, setForm] = useState(EMPTY_SESSION);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const editing = Boolean(session);

  useEffect(() => {
    if (!open) return;
    setForm(coachingSessionFormValues(session, initialListId));
    setSaving(false);
    setError("");
  }, [initialListId, open, session]);

  const update = (field, value) => setForm((current) => ({ ...current, [field]: value }));

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const path = editing
        ? `/education/coaching-sessions/${encodeURIComponent(session.id)}`
        : "/education/coaching-sessions";
      const result = editing
        ? await api.patch(path, form)
        : await api.post(path, form);
      onSaved(result.session, result.groupChange || null);
      onOpenChange(false);
    } catch (requestError) {
      setError(requestError.message);
      setSaving(false);
    }
  }

  return (
    <Drawer
      open={open}
      showSwipeHandle
      swipeDirection={isMobile ? "down" : "right"}
      onOpenChange={(nextOpen) => !saving && onOpenChange(nextOpen)}
    >
      <DrawerContent
        className="rollapp-body"
        style={isMobile ? undefined : { "--drawer-content-width": "min(40rem, calc(100vw - 2rem))" }}
      >
        <DrawerClose
          render={<Button className="absolute top-2 right-2 z-10 size-12" variant="ghost" size="icon" type="button" disabled={saving} />}
          aria-label="Закрыть форму коучинг-сессии"
        >
          <X aria-hidden="true" />
        </DrawerClose>
        <form className="flex min-h-0 min-w-0 flex-1 flex-col" onSubmit={submit}>
          <DrawerHeader className="pr-16 text-left!">
            <DrawerTitle>{editing ? "Редактировать коучинг-сессию" : "Добавить коучинг-сессию"}</DrawerTitle>
            <DrawerDescription>
              {editing
                ? "Измените сведения о встрече, договорённостях и следующих шагах."
                : "Сохраните встречу, её цель и ключевые договорённости."}
            </DrawerDescription>
          </DrawerHeader>

          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
            {error && (
              <Alert variant="destructive">
                <AlertTriangle aria-hidden="true" />
                <AlertTitle>Не удалось сохранить сессию</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

          <FieldGroup className="gap-4">
            <Field>
              <FieldLabel htmlFor={`${formId}-title`}>Тема или цель</FieldLabel>
              <Input
                className="min-h-12 text-base"
                id={`${formId}-title`}
                required
                maxLength={160}
                autoFocus
                placeholder="Например, Карьерная стратегия"
                value={form.title}
                onChange={(event) => update("title", event.target.value)}
              />
            </Field>
            <div className="flex flex-col gap-4">
              <Field>
                <FieldLabel htmlFor={`${formId}-coach`}>Коуч</FieldLabel>
                <Input
                  className="min-h-12 text-base"
                  id={`${formId}-coach`}
                  maxLength={160}
                  placeholder="Имя коуча"
                  value={form.coach}
                  onChange={(event) => update("coach", event.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor={`${formId}-status`}>Статус</FieldLabel>
                <Select value={form.status} onValueChange={(value) => update("status", value)}>
                  <SelectTrigger className="min-h-12 w-full text-base" id={`${formId}-status`}>
                    <SelectValue>{(value) => SESSION_STATUS[value]?.label || "Выберите статус"}</SelectValue>
                  </SelectTrigger>
                  <SelectContent className="education-form-select-content rollapp-body" align="start" alignItemWithTrigger={false}>
                    <SelectItem value="scheduled">Запланирована</SelectItem>
                    <SelectItem value="completed">Проведена</SelectItem>
                    <SelectItem value="cancelled">Отменена</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <Field>
              <FieldLabel htmlFor={`${formId}-list`}>Список</FieldLabel>
              <Select value={form.listId || UNLISTED_EDUCATION_LIST_ID} onValueChange={(value) => update("listId", educationApiListId(value))}>
                <SelectTrigger className="min-h-12 w-full text-base" id={`${formId}-list`}>
                  <SelectValue>{(value) => value === UNLISTED_EDUCATION_LIST_ID
                    ? "Не отсортированные"
                    : lists.find((list) => list.id === value)?.title || "Выберите список"}</SelectValue>
                </SelectTrigger>
                <SelectContent className="education-form-select-content rollapp-body" align="start" alignItemWithTrigger={false}>
                  <SelectItem value={UNLISTED_EDUCATION_LIST_ID}>Не отсортированные</SelectItem>
                  {lists.map((list) => <SelectItem value={list.id} key={list.id}>{list.title}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <div className="flex flex-col gap-4">
              <Field>
                <FieldLabel htmlFor={`${formId}-format`}>Формат</FieldLabel>
                <Select value={form.format} onValueChange={(value) => update("format", value)}>
                  <SelectTrigger className="min-h-12 w-full text-base" id={`${formId}-format`}>
                    <SelectValue>{(value) => SESSION_FORMAT[value] || "Выберите формат"}</SelectValue>
                  </SelectTrigger>
                  <SelectContent className="education-form-select-content rollapp-body" align="start" alignItemWithTrigger={false}>
                    <SelectItem value="online">Онлайн</SelectItem>
                    <SelectItem value="offline">Офлайн</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel htmlFor={`${formId}-location`}>Место или сервис</FieldLabel>
                <Input
                  className="min-h-12 text-base"
                  id={`${formId}-location`}
                  maxLength={240}
                  placeholder="Zoom, офис или адрес"
                  value={form.location}
                  onChange={(event) => update("location", event.target.value)}
                />
              </Field>
            </div>
            <div className="flex flex-col gap-4">
              <Field className="md:col-span-2">
                <FieldLabel htmlFor={`${formId}-session-on`}>Дата</FieldLabel>
                <Input
                  className="min-h-12 text-base"
                  id={`${formId}-session-on`}
                  type="date"
                  value={form.sessionOn}
                  onChange={(event) => update("sessionOn", event.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor={`${formId}-session-time`}>Время</FieldLabel>
                <Input
                  className="min-h-12 text-base"
                  id={`${formId}-session-time`}
                  type="time"
                  value={form.sessionTime}
                  onChange={(event) => update("sessionTime", event.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor={`${formId}-duration`}>Минуты</FieldLabel>
                <Input
                  className="min-h-12 text-base"
                  id={`${formId}-duration`}
                  type="number"
                  min={15}
                  max={480}
                  step={15}
                  inputMode="numeric"
                  placeholder="60"
                  value={form.durationMinutes}
                  onChange={(event) => update("durationMinutes", event.target.value)}
                />
              </Field>
              <Field className="md:col-span-2">
                <FieldLabel htmlFor={`${formId}-url`}>Ссылка</FieldLabel>
                <Input
                  className="min-h-12 text-base"
                  id={`${formId}-url`}
                  type="url"
                  maxLength={2000}
                  inputMode="url"
                  placeholder="https://…"
                  value={form.url}
                  onChange={(event) => update("url", event.target.value)}
                />
              </Field>
            </div>
            <Field>
              <FieldLabel htmlFor={`${formId}-description`}>Договорённости и заметки</FieldLabel>
              <Textarea
                className="min-h-20 text-base"
                id={`${formId}-description`}
                rows={3}
                maxLength={4000}
                placeholder="Выводы, следующие действия и вопросы к новой сессии"
                value={form.description}
                onChange={(event) => update("description", event.target.value)}
              />
            </Field>
          </FieldGroup>
          </div>

          <DrawerFooter className="border-t bg-popover pt-4 sm:flex-row sm:justify-end">
            <DrawerClose render={<Button className="min-h-12 px-4 text-base" variant="outline" type="button" disabled={saving} />}>
              Отмена
            </DrawerClose>
            <Button className="min-h-12 px-4 text-base" type="submit" disabled={saving}>
              {saving && <Spinner aria-hidden="true" />}
              {saving ? "Сохраняем" : editing ? "Сохранить изменения" : "Добавить сессию"}
            </Button>
          </DrawerFooter>
        </form>
      </DrawerContent>
    </Drawer>
  );
}

export function CoachingSessions() {
  const { readOnly } = useSphereSharing();
  const [drawer, setDrawer] = useState({ open: false, session: null });
  const [selectedListId, setSelectedListId] = useState(UNLISTED_EDUCATION_LIST_ID);
  const [openedGroupId, setOpenedGroupId] = useState("");
  const [listDrawer, setListDrawer] = useState({ open: false, list: null, moveItem: null });
  const [moveState, setMoveState] = useState({ itemId: "", error: "", announcement: "" });
  const [groupState, setGroupState] = useState({ busy: false, itemId: "", error: "", announcement: "" });
  const [requestVersion, setRequestVersion] = useState(0);
  const [requestState, setRequestState] = useState({ loading: true, sessions: [], lists: [], groups: [], error: null });
  const resolvedListId = educationListSelection(selectedListId, requestState.lists, requestState.sessions);
  const selectedList = requestState.lists.find((list) => list.id === resolvedListId) || null;
  const visibleSessions = educationItemsInList(requestState.sessions, resolvedListId);
  const visibleListId = educationApiListId(resolvedListId) || null;
  const visibleGroups = requestState.groups.filter((group) => group.listId === visibleListId && group.itemIds?.length >= 2);
  const groupedSessionIds = new Set(visibleGroups.flatMap((group) => group.itemIds || []));
  const ungroupedSessions = visibleSessions.filter((session) => !groupedSessionIds.has(session.id));
  const openedGroup = requestState.groups.find((group) => group.id === openedGroupId) || null;
  const openedGroupSessions = openedGroup
    ? (openedGroup.itemIds || []).map((id) => requestState.sessions.find((session) => session.id === id)).filter(Boolean)
    : [];
  const cardOrder = useCardReorder({
    disabled: readOnly,
    items: visibleSessions,
    onItemsChange: (sessions) => setRequestState((state) => ({
      ...state,
      sessions: mergeEducationListOrder(state.sessions, sessions, resolvedListId),
    })),
    persistOrder: (sessionIds) => api.patch("/education/coaching-sessions/reorder", {
      sessionIds,
      listId: educationApiListId(resolvedListId),
    }),
    getItemLabel: (session) => `Коучинг-сессия «${session.title}»`,
    collectionLabel: "коучинг-сессий",
    movedVerb: "перемещена",
    groupingEnabled: !readOnly && visibleSessions.length > 1 && !groupState.busy,
    onCreateGroup: createSessionGroup,
    onAddToGroup: addSessionToGroup,
  });

  useEffect(() => {
    let current = true;
    setRequestState((state) => ({ ...state, loading: true, error: null }));
    api.get("/education/coaching-sessions").then(({ sessions, lists, groups }) => {
      if (current) setRequestState({ loading: false, sessions: sortSessions(sessions || []), lists: lists || [], groups: groups || [], error: null });
    }).catch((error) => {
      if (current) setRequestState((state) => ({ ...state, loading: false, error }));
    });
    return () => { current = false; };
  }, [requestVersion]);

  useEffect(() => {
    if (selectedListId !== resolvedListId) setSelectedListId(resolvedListId);
  }, [resolvedListId, selectedListId]);

  useEffect(() => {
    if (openedGroupId && !openedGroup) setOpenedGroupId("");
  }, [openedGroup, openedGroupId]);

  const saveSession = (session, groupChange = null) => {
    setRequestState((state) => {
      const existing = state.sessions.some((item) => item.id === session.id);
      const sessions = existing
        ? state.sessions.map((item) => item.id === session.id ? session : item)
        : [session, ...state.sessions];
      return { ...state, sessions: sortSessions(sessions), groups: applyEducationGroupChange(state.groups, groupChange) };
    });
    if (groupChange?.dissolved && openedGroupId === groupChange.groupId) setOpenedGroupId("");
  };
  const setDrawerOpen = (open) => setDrawer((current) => ({ ...current, open }));
  const openCreateDrawer = () => setDrawer({ open: true, session: null });
  const openEditDrawer = (session) => {
    if (readOnly) return;
    if (cardOrder.shouldSuppressClick()) return;
    setDrawer({ open: true, session });
  };

  const saveList = (list) => {
    setRequestState((state) => ({
      ...state,
      lists: state.lists.some((current) => current.id === list.id)
        ? state.lists.map((current) => current.id === list.id ? list : current)
        : [...state.lists, list],
    }));
    setSelectedListId(list.id);
    if (listDrawer.moveItem) void moveSessionToList(listDrawer.moveItem, list.id, list.title);
  };

  const deleteList = () => {
    const deletedListId = listDrawer.list?.id;
    setRequestState((state) => ({
      ...state,
      lists: state.lists.filter((list) => list.id !== deletedListId),
      sessions: state.sessions.map((session) => session.listId === deletedListId ? { ...session, listId: null } : session),
      groups: state.groups.filter((group) => group.listId !== deletedListId),
    }));
    setOpenedGroupId("");
    setSelectedListId(UNLISTED_EDUCATION_LIST_ID);
  };

  const moveSessionToList = async (session, targetListId, targetTitleOverride = "") => {
    const listId = educationApiListId(targetListId);
    if ((session.listId || "") === listId || moveState.itemId) return;
    setMoveState({ itemId: session.id, error: "", announcement: "" });
    try {
      const result = await api.patch(`/education/coaching-sessions/${encodeURIComponent(session.id)}/list`, { listId });
      saveSession(result.session, result.groupChange || null);
      const targetTitle = targetListId === UNLISTED_EDUCATION_LIST_ID
        ? "Не отсортированные"
        : targetTitleOverride || requestState.lists.find((list) => list.id === targetListId)?.title || "выбранный список";
      setMoveState({ itemId: "", error: "", announcement: `Коучинг-сессия «${session.title}» перемещена в список «${targetTitle}».` });
    } catch (error) {
      setMoveState({ itemId: "", error: error.message, announcement: "" });
    }
  };

  async function createSessionGroup(sourceId, targetId) {
    if (groupState.busy || sourceId === targetId) return false;
    setGroupState({ busy: true, itemId: sourceId, error: "", announcement: "" });
    try {
      const result = await api.post("/education/coaching-sessions/groups", {
        itemIds: [sourceId, targetId],
        listId: educationApiListId(resolvedListId),
      });
      setRequestState((state) => ({
        ...state,
        groups: [...state.groups.filter((group) => group.id !== result.group.id), result.group],
      }));
      setGroupState({ busy: false, itemId: "", error: "", announcement: "Группа коучинг-сессий создана." });
      return true;
    } catch (error) {
      setGroupState({ busy: false, itemId: "", error: error.message, announcement: "" });
      return false;
    }
  }

  async function addSessionToGroup(itemId, groupId) {
    if (groupState.busy) return false;
    setGroupState({ busy: true, itemId, error: "", announcement: "" });
    try {
      const result = await api.post(`/education/coaching-sessions/groups/${encodeURIComponent(groupId)}/items`, { itemId });
      setRequestState((state) => ({
        ...state,
        groups: state.groups.map((group) => group.id === groupId ? { ...group, ...result.group } : group),
      }));
      setGroupState({ busy: false, itemId: "", error: "", announcement: "Коучинг-сессия добавлена в группу." });
      return true;
    } catch (error) {
      setGroupState({ busy: false, itemId: "", error: error.message, announcement: "" });
      return false;
    }
  }

  const renameSessionGroup = async (group, title) => {
    setGroupState({ busy: true, itemId: "", error: "", announcement: "" });
    try {
      const result = await api.patch(`/education/coaching-sessions/groups/${encodeURIComponent(group.id)}`, { title });
      setRequestState((state) => ({
        ...state,
        groups: state.groups.map((current) => current.id === group.id ? { ...current, ...result.group } : current),
      }));
      setGroupState({ busy: false, itemId: "", error: "", announcement: "Группа переименована." });
      return true;
    } catch (error) {
      setGroupState({ busy: false, itemId: "", error: error.message, announcement: "" });
      return false;
    }
  };

  const moveSessionGroup = async (group, targetList) => {
    setGroupState({ busy: true, itemId: "", error: "", announcement: "" });
    try {
      const result = await api.patch(`/education/coaching-sessions/groups/${encodeURIComponent(group.id)}/list`, {
        listId: educationApiListId(targetList.id),
      });
      const movedIds = new Set(result.group.itemIds || []);
      setRequestState((state) => ({
        ...state,
        sessions: state.sessions.map((session) => movedIds.has(session.id) ? { ...session, listId: result.group.listId } : session),
        groups: state.groups.map((current) => current.id === group.id ? { ...current, ...result.group } : current),
      }));
      setOpenedGroupId("");
      setGroupState({ busy: false, itemId: "", error: "", announcement: `Группа перемещена в список «${targetList.title}».` });
      return true;
    } catch (error) {
      setGroupState({ busy: false, itemId: "", error: error.message, announcement: "" });
      return false;
    }
  };

  const disbandSessionGroup = async (group) => {
    setGroupState({ busy: true, itemId: "", error: "", announcement: "" });
    try {
      await api.delete(`/education/coaching-sessions/groups/${encodeURIComponent(group.id)}`);
      setRequestState((state) => ({ ...state, groups: state.groups.filter((current) => current.id !== group.id) }));
      setOpenedGroupId("");
      setGroupState({ busy: false, itemId: "", error: "", announcement: "Группа расформирована." });
      return true;
    } catch (error) {
      setGroupState({ busy: false, itemId: "", error: error.message, announcement: "" });
      return false;
    }
  };

  const removeSessionFromGroup = async (session) => {
    if (!openedGroup || groupState.busy) return false;
    setGroupState({ busy: true, itemId: session.id, error: "", announcement: "" });
    try {
      const result = await api.delete(`/education/coaching-sessions/groups/${encodeURIComponent(openedGroup.id)}/items/${encodeURIComponent(session.id)}`);
      setRequestState((state) => ({ ...state, groups: applyEducationGroupChange(state.groups, result) }));
      if (result.dissolved) setOpenedGroupId("");
      setGroupState({ busy: false, itemId: "", error: "", announcement: result.dissolved ? "Сессия убрана, группа расформирована." : "Сессия убрана из группы." });
      return true;
    } catch (error) {
      setGroupState({ busy: false, itemId: "", error: error.message, announcement: "" });
      return false;
    }
  };

  return (
    <article className="not-typeset rollapp-body mx-auto flex w-full max-w-5xl min-w-0 flex-col gap-6 pb-12" aria-labelledby="coaching-title">
      <EducationSectionHeader
        title="Коучинг"
        titleId="coaching-title"
        selectedList={selectedList}
        onAdd={openCreateDrawer}
        onEditList={(list) => setListDrawer({ open: true, list, moveItem: null })}
      />

      {requestState.error && (
        <Alert variant="destructive">
          <AlertTriangle aria-hidden="true" />
          <AlertTitle>Не удалось загрузить коучинг-сессии</AlertTitle>
          <AlertDescription>{requestState.error.message}</AlertDescription>
          <AlertAction>
            <Button variant="outline" size="sm" type="button" onClick={() => setRequestVersion((version) => version + 1)}>
              <RotateCcw data-icon="inline-start" aria-hidden="true" />
              Повторить
            </Button>
          </AlertAction>
        </Alert>
      )}

      {cardOrder.orderError && (
        <Alert variant="destructive">
          <AlertTriangle aria-hidden="true" />
          <AlertTitle>Не удалось изменить порядок коучинг-сессий</AlertTitle>
          <AlertDescription>{cardOrder.orderError}</AlertDescription>
        </Alert>
      )}

      {moveState.error && (
        <Alert variant="destructive">
          <AlertTriangle aria-hidden="true" />
          <AlertTitle>Не удалось переместить коучинг-сессию</AlertTitle>
          <AlertDescription>{moveState.error}</AlertDescription>
        </Alert>
      )}

      {groupState.error && (
        <Alert variant="destructive">
          <AlertTriangle aria-hidden="true" />
          <AlertTitle>Не удалось изменить группу коучинг-сессий</AlertTitle>
          <AlertDescription>{groupState.error}</AlertDescription>
        </Alert>
      )}

      {!requestState.loading && !requestState.error && (
        <EducationListNavigation
          items={requestState.sessions}
          lists={requestState.lists}
          selectedListId={resolvedListId}
          ariaLabel="Списки коучинг-сессий"
          onSelectList={(listId) => { setOpenedGroupId(""); setSelectedListId(listId); }}
          onCreateList={() => setListDrawer({ open: true, list: null, moveItem: null })}
        />
      )}

      {requestState.loading && (
        <Card>
          <CardContent className="flex min-h-48 flex-col items-center justify-center gap-3 text-center" aria-live="polite">
            <Spinner className="size-5" aria-label="Загружаем коучинг-сессии" />
            <span className="text-sm text-muted-foreground">Загружаем коучинг-сессии</span>
          </CardContent>
        </Card>
      )}

      {!requestState.loading && visibleSessions.length > 0 && (
        <ul ref={cardOrder.listRef} className="grid list-none gap-4 sm:grid-cols-2" aria-label="Порядок и группы коучинг-сессий" aria-busy={cardOrder.orderBusy}>
          {visibleGroups.map((group) => (
            <EducationItemGroupTile
              key={group.id}
              group={group}
              items={(group.itemIds || []).map((id) => requestState.sessions.find((session) => session.id === id)).filter(Boolean)}
              lists={requestState.lists}
              isDropTarget={cardOrder.groupTarget === `group:${group.id}`}
              ItemIcon={Video}
              countLabel={sessionCountLabel}
              itemsStayLabel="Коучинг-сессии"
              onOpen={() => setOpenedGroupId(group.id)}
              onRename={(title) => renameSessionGroup(group, title)}
              onMove={(list) => moveSessionGroup(group, list)}
              onDisband={() => disbandSessionGroup(group)}
            />
          ))}
          {ungroupedSessions.map((session) => (
            <li
              className={`education-card is-draggable min-w-0 rounded-xl ${cardOrder.draggedId === session.id ? "is-dragging" : ""} ${cardOrder.groupTarget === `card:${session.id}` ? "is-group-target" : ""}`}
              data-sortable-card-id={session.id}
              key={session.id}
              onPointerDown={(event) => cardOrder.beginPointerDrag(event, session.id)}
            >
              <CoachingSessionCard
                session={session}
                dragDescriptionId={cardOrder.descriptionId}
                lists={requestState.lists}
                moveDisabled={Boolean(moveState.itemId) || cardOrder.orderBusy}
                moving={moveState.itemId === session.id}
                onCreateList={() => setListDrawer({ open: true, list: null, moveItem: session })}
                onEdit={openEditDrawer}
                onMove={cardOrder.moveByOffset}
                onMoveToList={moveSessionToList}
                draggable={!readOnly}
              />
            </li>
          ))}
        </ul>
      )}

      <p className="sr-only" id={cardOrder.descriptionId}>
        Нажмите, чтобы редактировать. Для группировки удерживайте карточку на центре другой сессии или на группе до появления подсветки, затем отпустите. Перетаскивайте по краям или используйте клавиши со стрелками, чтобы изменить порядок.
      </p>
      <p className="sr-only" aria-live="polite">{cardOrder.announcement}</p>
      <p className="sr-only" aria-live="polite">{moveState.announcement}</p>
      <p className="sr-only" aria-live="polite">{groupState.announcement}</p>

      {!readOnly && <CoachingSessionDrawer
        open={drawer.open}
        session={drawer.session}
        initialListId={educationApiListId(resolvedListId)}
        lists={requestState.lists}
        onOpenChange={setDrawerOpen}
        onSaved={saveSession}
      />}
      {!readOnly && <EducationListDrawer
        list={listDrawer.list}
        open={listDrawer.open}
        section="coaching"
        itemPlural="коучинг-сессии"
        onOpenChange={(open) => setListDrawer((current) => open
          ? { ...current, open: true }
          : { open: false, list: null, moveItem: null })}
        onSaved={saveList}
        onDeleted={deleteList}
      />}
      {openedGroup && (
        <EducationItemGroupOverlay
          group={openedGroup}
          items={openedGroupSessions}
          lists={requestState.lists}
          countLabel={sessionCountLabel}
          itemsStayLabel="Коучинг-сессии"
          moveItemId={moveState.itemId || groupState.itemId}
          onClose={() => setOpenedGroupId("")}
          onRename={(title) => renameSessionGroup(openedGroup, title)}
          onMove={(list) => moveSessionGroup(openedGroup, list)}
          onDisband={() => disbandSessionGroup(openedGroup)}
          renderItem={(session, { busy, removeBusy }) => (
            <CoachingSessionCard
              session={session}
              draggable={false}
              lists={requestState.lists}
              moveDisabled={Boolean(moveState.itemId) || busy}
              moving={moveState.itemId === session.id}
              removeBusy={removeBusy}
              onCreateList={() => setListDrawer({ open: true, list: null, moveItem: session })}
              onEdit={openEditDrawer}
              onMove={() => {}}
              onMoveToList={moveSessionToList}
              onRemoveFromGroup={readOnly ? undefined : removeSessionFromGroup}
            />
          )}
        />
      )}
    </article>
  );
}
