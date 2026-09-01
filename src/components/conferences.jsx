import { useEffect, useId, useState } from "react";
import {
  AlertTriangle, CalendarDays, CheckCircle2, Clock3, ExternalLink,
  RotateCcw, TicketCheck, Ungroup, Users, X,
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
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { useCardReorder } from "@/hooks/use-card-reorder";
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

const EMPTY_CONFERENCE = {
  title: "",
  status: "planned",
  role: "attendee",
  format: "offline",
  location: "",
  url: "",
  description: "",
  startsOn: "",
  endsOn: "",
  listId: "",
};

const CONFERENCE_STATUS = {
  planned: { label: "Планирую", variant: "outline", icon: Clock3 },
  registered: { label: "Зарегистрирован", variant: "default", icon: TicketCheck },
  attended: { label: "Участвовал", variant: "secondary", icon: CheckCircle2 },
};

const CONFERENCE_ROLE = {
  attendee: "Участник",
  speaker: "Спикер",
  organizer: "Организатор",
};

const CONFERENCE_FORMAT = {
  offline: "Офлайн",
  online: "Онлайн",
  hybrid: "Гибрид",
};

const STATUS_ORDER = ["registered", "planned", "attended"];

function sortConferences(conferences) {
  return [...conferences].sort((left, right) => (
    savedOrder(left) - savedOrder(right)
    || STATUS_ORDER.indexOf(left.status) - STATUS_ORDER.indexOf(right.status)
    || String(right.startsOn || right.endsOn || "").localeCompare(String(left.startsOn || left.endsOn || ""))
    || String(right.updatedAt || "").localeCompare(String(left.updatedAt || ""))
  ));
}

function formatDate(value) {
  if (!value) return "";
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return "";
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" })
    .format(new Date(Date.UTC(year, month - 1, day)))
    .replace(" г.", "");
}

function conferenceDateLabel(conference) {
  if (!conference.startsOn && !conference.endsOn) return "Дата не указана";
  if (!conference.startsOn) return `До ${formatDate(conference.endsOn)}`;
  if (!conference.endsOn || conference.endsOn === conference.startsOn) return formatDate(conference.startsOn);
  return `${formatDate(conference.startsOn)} — ${formatDate(conference.endsOn)}`;
}

const conferenceCountLabel = (count) => russianCountLabel(count, "конференция", "конференции", "конференций");

function conferenceFormValues(conference, initialListId = "") {
  if (!conference) return { ...EMPTY_CONFERENCE, listId: initialListId };
  return Object.fromEntries(
    Object.keys(EMPTY_CONFERENCE).map((field) => [field, conference[field] || EMPTY_CONFERENCE[field]]),
  );
}

function ConferenceCard({
  conference, dragDescriptionId, lists, moveDisabled, moving, onCreateList, onEdit, onMove, onMoveToList,
  onRemoveFromGroup, removeBusy = false, draggable = true,
}) {
  const status = CONFERENCE_STATUS[conference.status] || CONFERENCE_STATUS.planned;
  const StatusIcon = status.icon;
  return (
    <div className="relative h-full min-w-0">
      <Button
        className={`peer absolute inset-0 z-10 h-full w-full touch-pan-y rounded-xl bg-transparent p-0 hover:bg-transparent active:translate-y-0 ${draggable ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"}`}
        variant="ghost"
        type="button"
        data-card-drag-trigger={draggable ? "" : undefined}
        aria-describedby={dragDescriptionId || undefined}
        aria-haspopup="dialog"
        aria-label={draggable ? `Открыть и переместить конференцию «${conference.title}»` : `Открыть конференцию «${conference.title}»`}
        title={draggable ? "Нажмите, чтобы редактировать. Для группы перетащите на центр другой конференции и дождитесь подсветки" : "Нажмите, чтобы редактировать"}
        onClick={() => onEdit(conference)}
        onKeyDown={(event) => {
          if (!draggable) return;
          if (["ArrowLeft", "ArrowUp"].includes(event.key)) {
            event.preventDefault();
            onMove(conference.id, -1);
          }
          if (["ArrowRight", "ArrowDown"].includes(event.key)) {
            event.preventDefault();
            onMove(conference.id, 1);
          }
        }}
      >
        <span className="sr-only">Открыть или переместить конференцию «{conference.title}»</span>
      </Button>
      <Card className="pointer-events-none h-full min-w-0 transition-colors peer-hover:bg-muted/40">
        <CardHeader>
          <CardTitle><h3 className="m-0 font-heading text-base leading-snug font-medium">{conference.title}</h3></CardTitle>
          {conference.location && <CardDescription className="truncate">{conference.location}</CardDescription>}
          <CardAction className="pointer-events-auto relative z-20 flex items-center gap-1">
            <Badge variant={status.variant}>
              <StatusIcon data-icon="inline-start" aria-hidden="true" />
              {status.label}
            </Badge>
            <EducationItemListMenu
              currentListId={conference.listId}
              disabled={moveDisabled}
              itemLabel="конференцию"
              itemTitle={conference.title}
              lists={lists}
              moving={moving}
              onCreateList={onCreateList}
              onMove={(listId) => onMoveToList(conference, listId)}
            />
            {onRemoveFromGroup && (
              <Button
                className="pointer-events-auto relative z-20 size-9 rounded-full"
                variant="ghost"
                size="icon-lg"
                type="button"
                disabled={removeBusy}
                aria-label={`Убрать конференцию «${conference.title}» из группы`}
                title="Убрать из группы"
                onClick={() => onRemoveFromGroup(conference)}
              >
                {removeBusy ? <Spinner aria-hidden="true" /> : <Ungroup aria-hidden="true" />}
              </Button>
            )}
          </CardAction>
        </CardHeader>
        <CardContent className="flex flex-1 flex-col gap-4">
          {conference.description && <p className="m-0 text-sm text-muted-foreground text-pretty">{conference.description}</p>}
          <div className="mt-auto flex flex-col gap-2 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <CalendarDays className="size-4" aria-hidden="true" />
              <span>{conferenceDateLabel(conference)}</span>
            </div>
            <div className="flex items-center gap-2">
              <Users className="size-4" aria-hidden="true" />
              <span>{CONFERENCE_ROLE[conference.role]} · {CONFERENCE_FORMAT[conference.format]}</span>
            </div>
          </div>
        </CardContent>
        {conference.url && (
          <CardFooter className="justify-end">
            <a
              className={buttonVariants({ variant: "outline", size: "default", className: "pointer-events-auto relative z-20 min-h-12 px-4 text-base" })}
              href={conference.url}
              target="_blank"
              rel="noreferrer"
            >
              <ExternalLink data-icon="inline-start" aria-hidden="true" />
              Открыть сайт
            </a>
          </CardFooter>
        )}
      </Card>
    </div>
  );
}

function ConferenceDrawer({ conference, initialListId = "", lists = [], open, onOpenChange, onSaved }) {
  const isMobile = useIsMobile();
  const formId = useId();
  const [form, setForm] = useState(EMPTY_CONFERENCE);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const editing = Boolean(conference);
  const datesInvalid = Boolean(form.startsOn && form.endsOn && form.endsOn < form.startsOn);

  useEffect(() => {
    if (!open) return;
    setForm(conferenceFormValues(conference, initialListId));
    setSaving(false);
    setError("");
  }, [conference, initialListId, open]);

  const update = (field, value) => setForm((current) => ({ ...current, [field]: value }));

  async function submit(event) {
    event.preventDefault();
    if (datesInvalid) return;
    setSaving(true);
    setError("");
    try {
      const path = editing
        ? `/education/conferences/${encodeURIComponent(conference.id)}`
        : "/education/conferences";
      const result = editing ? await api.patch(path, form) : await api.post(path, form);
      onSaved(result.conference, result.groupChange || null);
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
          aria-label="Закрыть форму конференции"
        >
          <X aria-hidden="true" />
        </DrawerClose>
        <form className="flex min-h-0 min-w-0 flex-1 flex-col" onSubmit={submit}>
          <DrawerHeader className="pr-16 text-left!">
            <DrawerTitle>{editing ? "Редактировать конференцию" : "Добавить конференцию"}</DrawerTitle>
            <DrawerDescription>
              {editing
                ? "Измените сведения о событии, формате участия и материалах."
                : "Сохраните событие, формат участия и ссылку на материалы."}
            </DrawerDescription>
          </DrawerHeader>

          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
            {error && (
              <Alert variant="destructive">
                <AlertTriangle aria-hidden="true" />
                <AlertTitle>Не удалось сохранить конференцию</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <FieldGroup className="gap-4">
              <Field>
                <FieldLabel htmlFor={`${formId}-title`}>Название</FieldLabel>
                <Input
                  className="min-h-12 text-base"
                  id={`${formId}-title`}
                  required
                  maxLength={160}
                  autoFocus
                  placeholder="Например, Fintech Design Conf"
                  value={form.title}
                  onChange={(event) => update("title", event.target.value)}
                />
              </Field>
            <div className="flex flex-col gap-4">
              <Field>
                <FieldLabel htmlFor={`${formId}-status`}>Статус</FieldLabel>
                <Select value={form.status} onValueChange={(value) => update("status", value)}>
                  <SelectTrigger className="min-h-12 w-full text-base" id={`${formId}-status`}>
                    <SelectValue>{(value) => CONFERENCE_STATUS[value]?.label || "Выберите статус"}</SelectValue>
                  </SelectTrigger>
                  <SelectContent align="start" alignItemWithTrigger={false}>
                    <SelectItem value="planned">Планирую</SelectItem>
                    <SelectItem value="registered">Зарегистрирован</SelectItem>
                    <SelectItem value="attended">Участвовал</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel htmlFor={`${formId}-role`}>Роль</FieldLabel>
                <Select value={form.role} onValueChange={(value) => update("role", value)}>
                  <SelectTrigger className="min-h-12 w-full text-base" id={`${formId}-role`}>
                    <SelectValue>{(value) => CONFERENCE_ROLE[value] || "Выберите роль"}</SelectValue>
                  </SelectTrigger>
                  <SelectContent align="start" alignItemWithTrigger={false}>
                    <SelectItem value="attendee">Участник</SelectItem>
                    <SelectItem value="speaker">Спикер</SelectItem>
                    <SelectItem value="organizer">Организатор</SelectItem>
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
                <SelectContent align="start" alignItemWithTrigger={false}>
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
                    <SelectValue>{(value) => CONFERENCE_FORMAT[value] || "Выберите формат"}</SelectValue>
                  </SelectTrigger>
                  <SelectContent align="start" alignItemWithTrigger={false}>
                    <SelectItem value="offline">Офлайн</SelectItem>
                    <SelectItem value="online">Онлайн</SelectItem>
                    <SelectItem value="hybrid">Гибрид</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel htmlFor={`${formId}-location`}>Место</FieldLabel>
                <Input
                  className="min-h-12 text-base"
                  id={`${formId}-location`}
                  maxLength={240}
                  placeholder="Москва или онлайн-платформа"
                  value={form.location}
                  onChange={(event) => update("location", event.target.value)}
                />
              </Field>
            </div>
            <div className="flex flex-col gap-4">
              <Field>
                <FieldLabel htmlFor={`${formId}-starts-on`}>Дата начала</FieldLabel>
                <Input
                  className="min-h-12 text-base"
                  id={`${formId}-starts-on`}
                  type="date"
                  value={form.startsOn}
                  onChange={(event) => update("startsOn", event.target.value)}
                />
              </Field>
              <Field data-invalid={datesInvalid}>
                <FieldLabel htmlFor={`${formId}-ends-on`}>Дата завершения</FieldLabel>
                <Input
                  className="min-h-12 text-base"
                  id={`${formId}-ends-on`}
                  type="date"
                  min={form.startsOn || undefined}
                  aria-invalid={datesInvalid || undefined}
                  value={form.endsOn}
                  onChange={(event) => update("endsOn", event.target.value)}
                />
                {datesInvalid && <FieldError>Дата завершения должна быть не раньше даты начала.</FieldError>}
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
              <FieldLabel htmlFor={`${formId}-description`}>Заметки</FieldLabel>
              <Textarea
                className="min-h-20 text-base"
                id={`${formId}-description`}
                rows={3}
                maxLength={4000}
                placeholder="Тема выступления, полезные контакты и выводы"
                value={form.description}
                onChange={(event) => update("description", event.target.value)}
              />
            </Field>
            </FieldGroup>
          </div>

          <DrawerFooter className="border-t bg-muted/50 pt-4 sm:flex-row sm:justify-end">
            <Button className="min-h-12 px-4 text-base" variant="outline" type="button" onClick={() => onOpenChange(false)} disabled={saving}>
              Отмена
            </Button>
            <Button className="min-h-12 px-4 text-base" type="submit" disabled={saving || datesInvalid}>
              {saving && <Spinner aria-hidden="true" />}
              {saving ? "Сохраняем" : editing ? "Сохранить изменения" : "Добавить конференцию"}
            </Button>
          </DrawerFooter>
        </form>
      </DrawerContent>
    </Drawer>
  );
}

export function Conferences() {
  const [drawer, setDrawer] = useState({ open: false, conference: null });
  const [selectedListId, setSelectedListId] = useState(UNLISTED_EDUCATION_LIST_ID);
  const [openedGroupId, setOpenedGroupId] = useState("");
  const [listDrawer, setListDrawer] = useState({ open: false, list: null, moveItem: null });
  const [moveState, setMoveState] = useState({ itemId: "", error: "", announcement: "" });
  const [groupState, setGroupState] = useState({ busy: false, itemId: "", error: "", announcement: "" });
  const [requestVersion, setRequestVersion] = useState(0);
  const [requestState, setRequestState] = useState({ loading: true, conferences: [], lists: [], groups: [], error: null });
  const resolvedListId = educationListSelection(selectedListId, requestState.lists, requestState.conferences);
  const selectedList = requestState.lists.find((list) => list.id === resolvedListId) || null;
  const visibleConferences = educationItemsInList(requestState.conferences, resolvedListId);
  const visibleListId = educationApiListId(resolvedListId) || null;
  const visibleGroups = requestState.groups.filter((group) => group.listId === visibleListId && group.itemIds?.length >= 2);
  const groupedConferenceIds = new Set(visibleGroups.flatMap((group) => group.itemIds || []));
  const ungroupedConferences = visibleConferences.filter((conference) => !groupedConferenceIds.has(conference.id));
  const openedGroup = requestState.groups.find((group) => group.id === openedGroupId) || null;
  const openedGroupConferences = openedGroup
    ? (openedGroup.itemIds || []).map((id) => requestState.conferences.find((conference) => conference.id === id)).filter(Boolean)
    : [];
  const cardOrder = useCardReorder({
    items: visibleConferences,
    onItemsChange: (conferences) => setRequestState((state) => ({
      ...state,
      conferences: mergeEducationListOrder(state.conferences, conferences, resolvedListId),
    })),
    persistOrder: (conferenceIds) => api.patch("/education/conferences/reorder", {
      conferenceIds,
      listId: educationApiListId(resolvedListId),
    }),
    getItemLabel: (conference) => `Конференция «${conference.title}»`,
    collectionLabel: "конференций",
    movedVerb: "перемещена",
    groupingEnabled: visibleConferences.length > 1 && !groupState.busy,
    onCreateGroup: createConferenceGroup,
    onAddToGroup: addConferenceToGroup,
  });

  useEffect(() => {
    let current = true;
    setRequestState((state) => ({ ...state, loading: true, error: null }));
    api.get("/education/conferences").then(({ conferences, lists, groups }) => {
      if (current) setRequestState({ loading: false, conferences: sortConferences(conferences || []), lists: lists || [], groups: groups || [], error: null });
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

  const saveConference = (conference, groupChange = null) => {
    setRequestState((state) => {
      const exists = state.conferences.some((current) => current.id === conference.id);
      const conferences = exists
        ? state.conferences.map((current) => current.id === conference.id ? conference : current)
        : [conference, ...state.conferences];
      return { ...state, conferences: sortConferences(conferences), groups: applyEducationGroupChange(state.groups, groupChange) };
    });
    if (groupChange?.dissolved && openedGroupId === groupChange.groupId) setOpenedGroupId("");
  };

  const setDrawerOpen = (open) => {
    setDrawer((current) => ({ ...current, open }));
  };

  const openCreateDrawer = () => setDrawer({ open: true, conference: null });
  const openEditDrawer = (conference) => {
    if (cardOrder.shouldSuppressClick()) return;
    setDrawer({ open: true, conference });
  };

  const saveList = (list) => {
    setRequestState((state) => ({
      ...state,
      lists: state.lists.some((current) => current.id === list.id)
        ? state.lists.map((current) => current.id === list.id ? list : current)
        : [...state.lists, list],
    }));
    setSelectedListId(list.id);
    if (listDrawer.moveItem) void moveConferenceToList(listDrawer.moveItem, list.id, list.title);
  };

  const deleteList = () => {
    const deletedListId = listDrawer.list?.id;
    setRequestState((state) => ({
      ...state,
      lists: state.lists.filter((list) => list.id !== deletedListId),
      conferences: state.conferences.map((conference) => conference.listId === deletedListId ? { ...conference, listId: null } : conference),
      groups: state.groups.filter((group) => group.listId !== deletedListId),
    }));
    setOpenedGroupId("");
    setSelectedListId(UNLISTED_EDUCATION_LIST_ID);
  };

  const moveConferenceToList = async (conference, targetListId, targetTitleOverride = "") => {
    const listId = educationApiListId(targetListId);
    if ((conference.listId || "") === listId || moveState.itemId) return;
    setMoveState({ itemId: conference.id, error: "", announcement: "" });
    try {
      const result = await api.patch(`/education/conferences/${encodeURIComponent(conference.id)}/list`, { listId });
      saveConference(result.conference, result.groupChange || null);
      const targetTitle = targetListId === UNLISTED_EDUCATION_LIST_ID
        ? "Не отсортированные"
        : targetTitleOverride || requestState.lists.find((list) => list.id === targetListId)?.title || "выбранный список";
      setMoveState({ itemId: "", error: "", announcement: `Конференция «${conference.title}» перемещена в список «${targetTitle}».` });
    } catch (error) {
      setMoveState({ itemId: "", error: error.message, announcement: "" });
    }
  };

  async function createConferenceGroup(sourceId, targetId) {
    if (groupState.busy || sourceId === targetId) return false;
    setGroupState({ busy: true, itemId: sourceId, error: "", announcement: "" });
    try {
      const result = await api.post("/education/conferences/groups", {
        itemIds: [sourceId, targetId],
        listId: educationApiListId(resolvedListId),
      });
      setRequestState((state) => ({
        ...state,
        groups: [...state.groups.filter((group) => group.id !== result.group.id), result.group],
      }));
      setGroupState({ busy: false, itemId: "", error: "", announcement: "Группа конференций создана." });
      return true;
    } catch (error) {
      setGroupState({ busy: false, itemId: "", error: error.message, announcement: "" });
      return false;
    }
  }

  async function addConferenceToGroup(itemId, groupId) {
    if (groupState.busy) return false;
    setGroupState({ busy: true, itemId, error: "", announcement: "" });
    try {
      const result = await api.post(`/education/conferences/groups/${encodeURIComponent(groupId)}/items`, { itemId });
      setRequestState((state) => ({
        ...state,
        groups: state.groups.map((group) => group.id === groupId ? { ...group, ...result.group } : group),
      }));
      setGroupState({ busy: false, itemId: "", error: "", announcement: "Конференция добавлена в группу." });
      return true;
    } catch (error) {
      setGroupState({ busy: false, itemId: "", error: error.message, announcement: "" });
      return false;
    }
  }

  const renameConferenceGroup = async (group, title) => {
    setGroupState({ busy: true, itemId: "", error: "", announcement: "" });
    try {
      const result = await api.patch(`/education/conferences/groups/${encodeURIComponent(group.id)}`, { title });
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

  const moveConferenceGroup = async (group, targetList) => {
    setGroupState({ busy: true, itemId: "", error: "", announcement: "" });
    try {
      const result = await api.patch(`/education/conferences/groups/${encodeURIComponent(group.id)}/list`, {
        listId: educationApiListId(targetList.id),
      });
      const movedIds = new Set(result.group.itemIds || []);
      setRequestState((state) => ({
        ...state,
        conferences: state.conferences.map((conference) => movedIds.has(conference.id) ? { ...conference, listId: result.group.listId } : conference),
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

  const disbandConferenceGroup = async (group) => {
    setGroupState({ busy: true, itemId: "", error: "", announcement: "" });
    try {
      await api.delete(`/education/conferences/groups/${encodeURIComponent(group.id)}`);
      setRequestState((state) => ({ ...state, groups: state.groups.filter((current) => current.id !== group.id) }));
      setOpenedGroupId("");
      setGroupState({ busy: false, itemId: "", error: "", announcement: "Группа расформирована." });
      return true;
    } catch (error) {
      setGroupState({ busy: false, itemId: "", error: error.message, announcement: "" });
      return false;
    }
  };

  const removeConferenceFromGroup = async (conference) => {
    if (!openedGroup || groupState.busy) return false;
    setGroupState({ busy: true, itemId: conference.id, error: "", announcement: "" });
    try {
      const result = await api.delete(`/education/conferences/groups/${encodeURIComponent(openedGroup.id)}/items/${encodeURIComponent(conference.id)}`);
      setRequestState((state) => ({ ...state, groups: applyEducationGroupChange(state.groups, result) }));
      if (result.dissolved) setOpenedGroupId("");
      setGroupState({ busy: false, itemId: "", error: "", announcement: result.dissolved ? "Конференция убрана, группа расформирована." : "Конференция убрана из группы." });
      return true;
    } catch (error) {
      setGroupState({ busy: false, itemId: "", error: error.message, announcement: "" });
      return false;
    }
  };

  return (
    <article className="not-typeset rollapp-body mx-auto flex w-full max-w-5xl min-w-0 flex-col gap-6 pb-12" aria-labelledby="conferences-title">
      <EducationSectionHeader
        title="Конференции"
        titleId="conferences-title"
        selectedList={selectedList}
        onAdd={openCreateDrawer}
        onEditList={(list) => setListDrawer({ open: true, list, moveItem: null })}
      />

      {requestState.error && (
        <Alert variant="destructive">
          <AlertTriangle aria-hidden="true" />
          <AlertTitle>Не удалось загрузить конференции</AlertTitle>
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
          <AlertTitle>Не удалось изменить порядок конференций</AlertTitle>
          <AlertDescription>{cardOrder.orderError}</AlertDescription>
        </Alert>
      )}

      {moveState.error && (
        <Alert variant="destructive">
          <AlertTriangle aria-hidden="true" />
          <AlertTitle>Не удалось переместить конференцию</AlertTitle>
          <AlertDescription>{moveState.error}</AlertDescription>
        </Alert>
      )}

      {groupState.error && (
        <Alert variant="destructive">
          <AlertTriangle aria-hidden="true" />
          <AlertTitle>Не удалось изменить группу конференций</AlertTitle>
          <AlertDescription>{groupState.error}</AlertDescription>
        </Alert>
      )}

      {!requestState.loading && !requestState.error && (
        <EducationListNavigation
          items={requestState.conferences}
          lists={requestState.lists}
          selectedListId={resolvedListId}
          ariaLabel="Списки конференций"
          onSelectList={(listId) => { setOpenedGroupId(""); setSelectedListId(listId); }}
          onCreateList={() => setListDrawer({ open: true, list: null, moveItem: null })}
        />
      )}

      {requestState.loading && (
        <Card>
          <CardContent className="flex min-h-48 flex-col items-center justify-center gap-3 text-center" aria-live="polite">
            <Spinner className="size-5" aria-label="Загружаем конференции" />
            <span className="text-sm text-muted-foreground">Загружаем конференции</span>
          </CardContent>
        </Card>
      )}

      {!requestState.loading && visibleConferences.length > 0 && (
        <ul ref={cardOrder.listRef} className="grid list-none gap-4 sm:grid-cols-2" aria-label="Порядок и группы конференций" aria-busy={cardOrder.orderBusy}>
          {visibleGroups.map((group) => (
            <EducationItemGroupTile
              key={group.id}
              group={group}
              items={(group.itemIds || []).map((id) => requestState.conferences.find((conference) => conference.id === id)).filter(Boolean)}
              lists={requestState.lists}
              isDropTarget={cardOrder.groupTarget === `group:${group.id}`}
              ItemIcon={TicketCheck}
              countLabel={conferenceCountLabel}
              itemsStayLabel="Конференции"
              onOpen={() => setOpenedGroupId(group.id)}
              onRename={(title) => renameConferenceGroup(group, title)}
              onMove={(list) => moveConferenceGroup(group, list)}
              onDisband={() => disbandConferenceGroup(group)}
            />
          ))}
          {ungroupedConferences.map((conference) => (
            <li
              className={`education-card is-draggable min-w-0 rounded-xl ${cardOrder.draggedId === conference.id ? "is-dragging" : ""} ${cardOrder.groupTarget === `card:${conference.id}` ? "is-group-target" : ""}`}
              data-sortable-card-id={conference.id}
              key={conference.id}
              onPointerDown={(event) => cardOrder.beginPointerDrag(event, conference.id)}
            >
              <ConferenceCard
                conference={conference}
                dragDescriptionId={cardOrder.descriptionId}
                lists={requestState.lists}
                moveDisabled={Boolean(moveState.itemId) || cardOrder.orderBusy}
                moving={moveState.itemId === conference.id}
                onCreateList={() => setListDrawer({ open: true, list: null, moveItem: conference })}
                onEdit={openEditDrawer}
                onMove={cardOrder.moveByOffset}
                onMoveToList={moveConferenceToList}
              />
            </li>
          ))}
        </ul>
      )}

      <p className="sr-only" id={cardOrder.descriptionId}>
        Нажмите, чтобы редактировать. Для группировки удерживайте карточку на центре другой конференции или на группе до появления подсветки, затем отпустите. Перетаскивайте по краям или используйте клавиши со стрелками, чтобы изменить порядок.
      </p>
      <p className="sr-only" aria-live="polite">{cardOrder.announcement}</p>
      <p className="sr-only" aria-live="polite">{moveState.announcement}</p>
      <p className="sr-only" aria-live="polite">{groupState.announcement}</p>

      <ConferenceDrawer
        conference={drawer.conference}
        initialListId={educationApiListId(resolvedListId)}
        lists={requestState.lists}
        open={drawer.open}
        onOpenChange={setDrawerOpen}
        onSaved={saveConference}
      />
      <EducationListDrawer
        list={listDrawer.list}
        open={listDrawer.open}
        section="conferences"
        itemPlural="конференции"
        onOpenChange={(open) => setListDrawer((current) => open
          ? { ...current, open: true }
          : { open: false, list: null, moveItem: null })}
        onSaved={saveList}
        onDeleted={deleteList}
      />
      {openedGroup && (
        <EducationItemGroupOverlay
          group={openedGroup}
          items={openedGroupConferences}
          lists={requestState.lists}
          countLabel={conferenceCountLabel}
          itemsStayLabel="Конференции"
          moveItemId={moveState.itemId || groupState.itemId}
          onClose={() => setOpenedGroupId("")}
          onRename={(title) => renameConferenceGroup(openedGroup, title)}
          onMove={(list) => moveConferenceGroup(openedGroup, list)}
          onDisband={() => disbandConferenceGroup(openedGroup)}
          renderItem={(conference, { busy, removeBusy }) => (
            <ConferenceCard
              conference={conference}
              draggable={false}
              lists={requestState.lists}
              moveDisabled={Boolean(moveState.itemId) || busy}
              moving={moveState.itemId === conference.id}
              removeBusy={removeBusy}
              onCreateList={() => setListDrawer({ open: true, list: null, moveItem: conference })}
              onEdit={openEditDrawer}
              onMove={() => {}}
              onMoveToList={moveConferenceToList}
              onRemoveFromGroup={removeConferenceFromGroup}
            />
          )}
        />
      )}
    </article>
  );
}
