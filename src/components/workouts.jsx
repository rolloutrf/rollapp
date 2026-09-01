import { useEffect, useId, useState } from "react";
import {
  Activity, AlertTriangle, Bike, CalendarDays, CheckCircle2, CircleMinus, Clock3,
  Dumbbell, Flame, Footprints, Gauge, RotateCcw, Route, Timer, Trophy, Waves, X,
} from "lucide-react";
import { api } from "@/api";
import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { useIsMobile } from "@/hooks/use-mobile";
import { useCardReorder } from "@/hooks/use-card-reorder";
import {
  EducationItemListMenu, EducationListDrawer, EducationListNavigation, EducationSectionHeader,
} from "@/components/education-lists";
import {
  educationApiListId, educationItemsInList, educationListSelection,
  mergeEducationListOrder, UNLISTED_EDUCATION_LIST_ID,
} from "@/lib/education-lists";
import { localDateInputValue, sortWorkouts } from "@/lib/workouts";

const WORKOUT_TYPES = {
  strength: { label: "Силовая", defaultTitle: "Силовая тренировка", icon: Dumbbell },
  running: { label: "Бег", defaultTitle: "Пробежка", icon: Activity },
  walking: { label: "Ходьба", defaultTitle: "Ходьба", icon: Footprints },
  cycling: { label: "Велосипед", defaultTitle: "Велотренировка", icon: Bike },
  swimming: { label: "Плавание", defaultTitle: "Тренировка в бассейне", icon: Waves },
  mobility: { label: "Мобильность", defaultTitle: "Мобильность и растяжка", icon: Activity },
  team_sport: { label: "Игровой спорт", defaultTitle: "Игровая тренировка", icon: Trophy },
  other: { label: "Другое", defaultTitle: "Тренировка", icon: Activity },
};

const WORKOUT_STATUS = {
  planned: { label: "Запланирована", variant: "default", icon: Clock3 },
  completed: { label: "Завершена", variant: "secondary", icon: CheckCircle2 },
  skipped: { label: "Пропущена", variant: "outline", icon: CircleMinus },
};

const WORKOUT_INTENSITY = {
  light: "Лёгкая",
  moderate: "Средняя",
  high: "Высокая",
};

function emptyWorkout(initialListId = "") {
  return {
    title: "",
    workoutType: "strength",
    status: "completed",
    workoutOn: localDateInputValue(),
    startTime: "",
    durationMinutes: "",
    intensity: "moderate",
    distanceKm: "",
    calories: "",
    notes: "",
    listId: initialListId,
  };
}

function workoutForm(workout, initialListId = "") {
  if (!workout) return emptyWorkout(initialListId);
  return {
    title: workout.title || "",
    workoutType: workout.workoutType || "strength",
    status: workout.status || "completed",
    workoutOn: workout.workoutOn || localDateInputValue(),
    startTime: workout.startTime || "",
    durationMinutes: workout.durationMinutes == null ? "" : String(workout.durationMinutes),
    intensity: workout.intensity || "moderate",
    distanceKm: workout.distanceKm == null ? "" : String(workout.distanceKm),
    calories: workout.calories == null ? "" : String(workout.calories),
    notes: workout.notes || "",
    listId: workout.listId || "",
  };
}

function formatDate(value) {
  const [year, month, day] = String(value || "").split("-").map(Number);
  if (!year || !month || !day) return "Дата не указана";
  return new Intl.DateTimeFormat("ru-RU", { weekday: "short", day: "numeric", month: "long" })
    .format(new Date(year, month - 1, day, 12))
    .replace(/^./, (letter) => letter.toUpperCase());
}

function formatDistance(value) {
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(Number(value) || 0);
}

function WorkoutCard({
  workout, dragDescriptionId, lists, moveDisabled, moving, onCreateList, onEdit, onMove, onMoveToList,
}) {
  const status = WORKOUT_STATUS[workout.status] || WORKOUT_STATUS.completed;
  const type = WORKOUT_TYPES[workout.workoutType] || WORKOUT_TYPES.other;
  const StatusIcon = status.icon;
  const TypeIcon = type.icon;
  return (
    <div className="relative h-full min-w-0">
      <Button
        className="peer absolute inset-0 z-10 h-full w-full cursor-grab touch-pan-y rounded-xl bg-transparent p-0 hover:bg-transparent active:cursor-grabbing active:translate-y-0"
        variant="ghost"
        type="button"
        data-card-drag-trigger
        aria-describedby={dragDescriptionId}
        aria-haspopup="dialog"
        aria-label={`Открыть и переместить тренировку «${workout.title}»`}
        title="Нажмите, чтобы редактировать. Перетащите, чтобы изменить порядок"
        onClick={() => onEdit(workout)}
        onKeyDown={(event) => {
          if (["ArrowLeft", "ArrowUp"].includes(event.key)) {
            event.preventDefault();
            onMove(workout.id, -1);
          }
          if (["ArrowRight", "ArrowDown"].includes(event.key)) {
            event.preventDefault();
            onMove(workout.id, 1);
          }
        }}
      >
        <span className="sr-only">Открыть или переместить тренировку «{workout.title}»</span>
      </Button>
      <Card className="pointer-events-none h-full min-w-0 transition-colors peer-hover:bg-muted/40">
        <CardHeader>
          <CardTitle><h4 className="m-0 font-heading text-base leading-snug font-medium">{workout.title}</h4></CardTitle>
          <CardDescription className="flex items-center gap-2">
            <TypeIcon className="size-4" aria-hidden="true" />
            {type.label}
          </CardDescription>
          <CardAction className="pointer-events-auto relative z-20 flex items-center gap-1">
            <Badge variant={status.variant}>
              <StatusIcon data-icon="inline-start" aria-hidden="true" />
              {status.label}
            </Badge>
            <EducationItemListMenu
              currentListId={workout.listId}
              disabled={moveDisabled}
              itemLabel="тренировку"
              itemTitle={workout.title}
              lists={lists}
              moving={moving}
              onCreateList={onCreateList}
              onMove={(listId) => onMoveToList(workout, listId)}
            />
          </CardAction>
        </CardHeader>
        <CardContent className="flex flex-1 flex-col gap-4">
          <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm text-muted-foreground">
            <span className="flex items-center gap-2">
              <CalendarDays className="size-4" aria-hidden="true" />
              {formatDate(workout.workoutOn)}{workout.startTime ? ` · ${workout.startTime}` : ""}
            </span>
            {workout.durationMinutes && (
              <span className="flex items-center gap-2">
                <Timer className="size-4" aria-hidden="true" />
                {workout.durationMinutes} мин
              </span>
            )}
            {workout.distanceKm && (
              <span className="flex items-center gap-2">
                <Route className="size-4" aria-hidden="true" />
                {formatDistance(workout.distanceKm)} км
              </span>
            )}
            {workout.calories && (
              <span className="flex items-center gap-2">
                <Flame className="size-4" aria-hidden="true" />
                {workout.calories} ккал
              </span>
            )}
            <span className="flex items-center gap-2">
              <Gauge className="size-4" aria-hidden="true" />
              {WORKOUT_INTENSITY[workout.intensity] || WORKOUT_INTENSITY.moderate}
            </span>
          </div>
          {workout.notes && <p className="m-0 text-sm text-muted-foreground text-pretty">{workout.notes}</p>}
        </CardContent>
      </Card>
    </div>
  );
}

function WorkoutDrawer({ initialListId = "", lists = [], open, workout, onOpenChange, onSaved }) {
  const isMobile = useIsMobile();
  const formId = useId();
  const [form, setForm] = useState(() => emptyWorkout());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setForm(workoutForm(workout, initialListId));
    setSaving(false);
    setError("");
  }, [initialListId, open, workout]);

  const update = (field, value) => setForm((current) => ({ ...current, [field]: value }));

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    const type = WORKOUT_TYPES[form.workoutType] || WORKOUT_TYPES.other;
    const payload = { ...form, title: form.title.trim() || type.defaultTitle };
    try {
      const path = workout ? `/health/workouts/${encodeURIComponent(workout.id)}` : "/health/workouts";
      const { workout: savedWorkout } = workout
        ? await api.patch(path, payload)
        : await api.post(path, payload);
      onSaved(savedWorkout);
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
          aria-label="Закрыть форму тренировки"
        >
          <X aria-hidden="true" />
        </DrawerClose>
        <form className="flex min-h-0 min-w-0 flex-1 flex-col" onSubmit={submit}>
          <DrawerHeader className="pr-16 text-left!">
            <DrawerTitle>{workout ? "Редактировать тренировку" : "Добавить тренировку"}</DrawerTitle>
            <DrawerDescription>Зафиксируйте тренировку или запланируйте следующую. Название можно не указывать.</DrawerDescription>
          </DrawerHeader>

          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
            {error && (
              <Alert variant="destructive">
                <AlertTriangle aria-hidden="true" />
                <AlertTitle>Не удалось сохранить тренировку</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

          <FieldGroup className="gap-4">
            <div className="flex flex-col gap-4">
              <Field>
                <FieldLabel htmlFor={`${formId}-type`}>Тип тренировки</FieldLabel>
                <Select value={form.workoutType} onValueChange={(value) => update("workoutType", value)}>
                  <SelectTrigger className="min-h-12 w-full text-base" id={`${formId}-type`}>
                    <SelectValue>{(value) => WORKOUT_TYPES[value]?.label || "Выберите тип"}</SelectValue>
                  </SelectTrigger>
                  <SelectContent align="start" alignItemWithTrigger={false}>
                    {Object.entries(WORKOUT_TYPES).map(([value, type]) => <SelectItem key={value} value={value}>{type.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel htmlFor={`${formId}-status`}>Статус</FieldLabel>
                <Select value={form.status} onValueChange={(value) => update("status", value)}>
                  <SelectTrigger className="min-h-12 w-full text-base" id={`${formId}-status`}>
                    <SelectValue>{(value) => WORKOUT_STATUS[value]?.label || "Выберите статус"}</SelectValue>
                  </SelectTrigger>
                  <SelectContent align="start" alignItemWithTrigger={false}>
                    {Object.entries(WORKOUT_STATUS).map(([value, status]) => <SelectItem key={value} value={value}>{status.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel htmlFor={`${formId}-list`}>Список</FieldLabel>
                <Select
                  value={form.listId || UNLISTED_EDUCATION_LIST_ID}
                  onValueChange={(value) => update("listId", educationApiListId(value))}
                >
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
            </div>

            <Field>
              <FieldLabel htmlFor={`${formId}-title`}>Название</FieldLabel>
              <Input
                className="min-h-12 text-base"
                id={`${formId}-title`}
                maxLength={160}
                autoFocus
                placeholder={WORKOUT_TYPES[form.workoutType]?.defaultTitle || "Тренировка"}
                value={form.title}
                onChange={(event) => update("title", event.target.value)}
              />
              <FieldDescription>Если оставить пустым, название подставится по типу тренировки.</FieldDescription>
            </Field>

            <div className="flex flex-col gap-4">
              <Field>
                <FieldLabel htmlFor={`${formId}-date`}>Дата</FieldLabel>
                <Input
                  className="min-h-12 text-base"
                  id={`${formId}-date`}
                  type="date"
                  required
                  value={form.workoutOn}
                  onChange={(event) => update("workoutOn", event.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor={`${formId}-time`}>Время</FieldLabel>
                <Input
                  className="min-h-12 text-base"
                  id={`${formId}-time`}
                  type="time"
                  value={form.startTime}
                  onChange={(event) => update("startTime", event.target.value)}
                />
              </Field>
            </div>

            <div className="flex flex-col gap-4">
              <Field>
                <FieldLabel htmlFor={`${formId}-duration`}>Длительность, мин</FieldLabel>
                <Input
                  className="min-h-12 text-base"
                  id={`${formId}-duration`}
                  type="number"
                  min={5}
                  max={720}
                  step={5}
                  inputMode="numeric"
                  placeholder="60"
                  value={form.durationMinutes}
                  onChange={(event) => update("durationMinutes", event.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor={`${formId}-intensity`}>Интенсивность</FieldLabel>
                <Select value={form.intensity} onValueChange={(value) => update("intensity", value)}>
                  <SelectTrigger className="min-h-12 w-full text-base" id={`${formId}-intensity`}>
                    <SelectValue>{(value) => WORKOUT_INTENSITY[value] || "Выберите интенсивность"}</SelectValue>
                  </SelectTrigger>
                  <SelectContent align="start" alignItemWithTrigger={false}>
                    {Object.entries(WORKOUT_INTENSITY).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
            </div>

            <div className="flex flex-col gap-4">
              <Field>
                <FieldLabel htmlFor={`${formId}-distance`}>Дистанция, км</FieldLabel>
                <Input
                  className="min-h-12 text-base"
                  id={`${formId}-distance`}
                  type="number"
                  min={0.01}
                  max={1000}
                  step={0.01}
                  inputMode="decimal"
                  placeholder="5,2"
                  value={form.distanceKm}
                  onChange={(event) => update("distanceKm", event.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor={`${formId}-calories`}>Энергия, ккал</FieldLabel>
                <Input
                  className="min-h-12 text-base"
                  id={`${formId}-calories`}
                  type="number"
                  min={1}
                  max={20000}
                  step={1}
                  inputMode="numeric"
                  placeholder="450"
                  value={form.calories}
                  onChange={(event) => update("calories", event.target.value)}
                />
              </Field>
            </div>

            <Field>
              <FieldLabel htmlFor={`${formId}-notes`}>Заметки</FieldLabel>
              <Textarea
                className="min-h-24 text-base"
                id={`${formId}-notes`}
                rows={4}
                maxLength={4000}
                placeholder="Упражнения, подходы, самочувствие и результат"
                value={form.notes}
                onChange={(event) => update("notes", event.target.value)}
              />
            </Field>
          </FieldGroup>
          </div>

          <DrawerFooter className="border-t bg-popover pt-4 sm:flex-row sm:justify-end">
            <DrawerClose render={<Button className="min-h-12 px-4 text-base" variant="outline" type="button" disabled={saving} />}>
              Отмена
            </DrawerClose>
            <Button className="min-h-12 px-4 text-base" type="submit" disabled={saving || !form.workoutOn}>
              {saving && <Spinner aria-hidden="true" />}
              {saving ? "Сохраняем" : workout ? "Сохранить изменения" : "Добавить тренировку"}
            </Button>
          </DrawerFooter>
        </form>
      </DrawerContent>
    </Drawer>
  );
}

function WorkoutSection({
  cardOrder, id, lists, moveState, onCreateList, onEdit, onMoveToList, title, workouts,
}) {
  if (!workouts.length) return null;
  return (
    <section className="flex min-w-0 flex-col gap-4" aria-labelledby={id}>
      <h3 className="m-0 font-heading text-lg leading-7 font-semibold" id={id}>{title}</h3>
      <ul className="grid list-none gap-4 sm:grid-cols-2">
        {workouts.map((workout) => (
          <li
            className={`education-card is-draggable min-w-0 rounded-xl ${cardOrder.draggedId === workout.id ? "is-dragging" : ""}`}
            data-sortable-card-id={workout.id}
            key={workout.id}
            onPointerDown={(event) => cardOrder.beginPointerDrag(event, workout.id)}
          >
            <WorkoutCard
              workout={workout}
              dragDescriptionId={cardOrder.descriptionId}
              lists={lists}
              moveDisabled={Boolean(moveState.itemId) || cardOrder.orderBusy}
              moving={moveState.itemId === workout.id}
              onCreateList={() => onCreateList(workout)}
              onEdit={onEdit}
              onMove={cardOrder.moveByOffset}
              onMoveToList={onMoveToList}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

export function Workouts() {
  const [drawerState, setDrawerState] = useState(null);
  const [selectedListId, setSelectedListId] = useState(UNLISTED_EDUCATION_LIST_ID);
  const [listDrawer, setListDrawer] = useState({ open: false, list: null, moveItem: null });
  const [moveState, setMoveState] = useState({ itemId: "", error: "", announcement: "" });
  const [requestVersion, setRequestVersion] = useState(0);
  const [requestState, setRequestState] = useState({ loading: true, workouts: [], lists: [], error: null });
  const resolvedListId = educationListSelection(selectedListId, requestState.lists, requestState.workouts);
  const selectedList = requestState.lists.find((list) => list.id === resolvedListId) || null;
  const visibleWorkouts = educationItemsInList(requestState.workouts, resolvedListId);
  const cardOrder = useCardReorder({
    items: visibleWorkouts,
    onItemsChange: (workouts) => setRequestState((state) => ({
      ...state,
      workouts: mergeEducationListOrder(state.workouts, workouts, resolvedListId),
    })),
    persistOrder: (workoutIds) => api.patch("/health/workouts/reorder", {
      workoutIds,
      listId: educationApiListId(resolvedListId),
    }),
    getItemLabel: (workout) => `Тренировка «${workout.title}»`,
    collectionLabel: "тренировок",
    movedVerb: "перемещена",
  });

  useEffect(() => {
    let current = true;
    setRequestState((state) => ({ ...state, loading: true, error: null }));
    api.get("/health/workouts").then(({ workouts, lists }) => {
      if (current) setRequestState({ loading: false, workouts: sortWorkouts(workouts || []), lists: lists || [], error: null });
    }).catch((error) => {
      if (current) setRequestState((state) => ({ ...state, loading: false, error }));
    });
    return () => { current = false; };
  }, [requestVersion]);

  useEffect(() => {
    if (selectedListId !== resolvedListId) setSelectedListId(resolvedListId);
  }, [resolvedListId, selectedListId]);

  const openNewWorkout = () => setDrawerState({ workout: null });

  const openWorkout = (workout) => {
    if (cardOrder.shouldSuppressClick()) return;
    setDrawerState({ workout });
  };

  const saveWorkout = (workout) => {
    setRequestState((state) => {
      const existing = state.workouts.some((item) => item.id === workout.id);
      const workouts = existing
        ? state.workouts.map((item) => item.id === workout.id ? workout : item)
        : [workout, ...state.workouts];
      return { ...state, workouts: sortWorkouts(workouts) };
    });
  };

  const saveList = (list) => {
    setRequestState((state) => ({
      ...state,
      lists: state.lists.some((current) => current.id === list.id)
        ? state.lists.map((current) => current.id === list.id ? list : current)
        : [...state.lists, list],
    }));
    setSelectedListId(list.id);
    if (listDrawer.moveItem) void moveWorkoutToList(listDrawer.moveItem, list.id, list.title);
  };

  const deleteList = () => {
    const deletedListId = listDrawer.list?.id;
    setRequestState((state) => ({
      ...state,
      lists: state.lists.filter((list) => list.id !== deletedListId),
      workouts: state.workouts.map((workout) => workout.listId === deletedListId ? { ...workout, listId: null } : workout),
    }));
    setSelectedListId(UNLISTED_EDUCATION_LIST_ID);
  };

  const moveWorkoutToList = async (workout, targetListId, targetTitleOverride = "") => {
    const listId = educationApiListId(targetListId);
    if ((workout.listId || "") === listId || moveState.itemId) return;
    setMoveState({ itemId: workout.id, error: "", announcement: "" });
    try {
      const result = await api.patch(`/health/workouts/${encodeURIComponent(workout.id)}/list`, { listId });
      saveWorkout(result.workout);
      const targetTitle = targetListId === UNLISTED_EDUCATION_LIST_ID
        ? "Не отсортированные"
        : targetTitleOverride || requestState.lists.find((list) => list.id === targetListId)?.title || "выбранный список";
      setMoveState({ itemId: "", error: "", announcement: `Тренировка «${workout.title}» перемещена в список «${targetTitle}».` });
    } catch (error) {
      setMoveState({ itemId: "", error: error.message, announcement: "" });
    }
  };

  const planned = visibleWorkouts.filter((workout) => workout.status === "planned");
  const history = visibleWorkouts.filter((workout) => workout.status !== "planned");
  return (
    <article className="not-typeset rollapp-body mx-auto flex w-full max-w-5xl min-w-0 flex-col gap-6 pb-12" aria-labelledby="workouts-title">
      <EducationSectionHeader
        title="Спорт"
        titleId="workouts-title"
        selectedList={selectedList}
        onAdd={openNewWorkout}
        onEditList={(list) => setListDrawer({ open: true, list, moveItem: null })}
      />

      {requestState.error && (
        <Alert variant="destructive">
          <AlertTriangle aria-hidden="true" />
          <AlertTitle>Не удалось загрузить тренировки</AlertTitle>
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
          <AlertTitle>Не удалось изменить порядок тренировок</AlertTitle>
          <AlertDescription>{cardOrder.orderError}</AlertDescription>
        </Alert>
      )}

      {moveState.error && (
        <Alert variant="destructive">
          <AlertTriangle aria-hidden="true" />
          <AlertTitle>Не удалось переместить тренировку</AlertTitle>
          <AlertDescription>{moveState.error}</AlertDescription>
        </Alert>
      )}

      {!requestState.loading && !requestState.error && (
        <EducationListNavigation
          items={requestState.workouts}
          lists={requestState.lists}
          selectedListId={resolvedListId}
          ariaLabel="Списки тренировок"
          onSelectList={setSelectedListId}
          onCreateList={() => setListDrawer({ open: true, list: null, moveItem: null })}
        />
      )}

      {requestState.loading && (
        <Card>
          <CardContent className="flex min-h-48 flex-col items-center justify-center gap-3 text-center" aria-live="polite">
            <Spinner className="size-5" aria-label="Загружаем тренировки" />
            <span className="text-sm text-muted-foreground">Загружаем тренировки</span>
          </CardContent>
        </Card>
      )}

      {!requestState.loading && visibleWorkouts.length > 0 && (
        <div ref={cardOrder.listRef} className="flex min-w-0 flex-col gap-6" aria-label="Порядок тренировок" aria-busy={cardOrder.orderBusy}>
          <WorkoutSection cardOrder={cardOrder} id="planned-workouts-title" lists={requestState.lists} moveState={moveState} title="Предстоящие" workouts={planned} onCreateList={(workout) => setListDrawer({ open: true, list: null, moveItem: workout })} onEdit={openWorkout} onMoveToList={moveWorkoutToList} />
          <WorkoutSection cardOrder={cardOrder} id="workout-history-title" lists={requestState.lists} moveState={moveState} title="История" workouts={history} onCreateList={(workout) => setListDrawer({ open: true, list: null, moveItem: workout })} onEdit={openWorkout} onMoveToList={moveWorkoutToList} />
        </div>
      )}

      <p className="sr-only" id={cardOrder.descriptionId}>
        Нажмите, чтобы редактировать. Перетащите карточку мышью, удерживайте её на сенсорном экране или используйте клавиши со стрелками, чтобы изменить порядок.
      </p>
      <p className="sr-only" aria-live="polite">{cardOrder.announcement}</p>
      <p className="sr-only" aria-live="polite">{moveState.announcement}</p>

      <WorkoutDrawer
        initialListId={educationApiListId(resolvedListId)}
        lists={requestState.lists}
        open={Boolean(drawerState)}
        workout={drawerState?.workout || null}
        onOpenChange={(open) => { if (!open) setDrawerState(null); }}
        onSaved={saveWorkout}
      />
      <EducationListDrawer
        list={listDrawer.list}
        open={listDrawer.open}
        section="workouts"
        itemPlural="тренировки"
        onOpenChange={(open) => setListDrawer((current) => open
          ? { ...current, open: true }
          : { open: false, list: null, moveItem: null })}
        onSaved={saveList}
        onDeleted={deleteList}
      />
    </article>
  );
}
