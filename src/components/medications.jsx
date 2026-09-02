import { useEffect, useId, useState } from "react";
import {
  AlertTriangle, CalendarDays, CheckCircle2, CirclePause, Clock3, Folder,
  ListPlus, MoreHorizontal, Pill, Plus, RotateCcw, Stethoscope, Trash2, X,
} from "lucide-react";
import { api } from "@/api";
import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useIsMobile } from "@/hooks/use-mobile";
import { localDateInputValue } from "@/lib/workouts";
import { normalizeMedicationTimes, sortMedications } from "@/lib/medications";
import { useSphereSharing } from "@/lib/sphere-sharing";

const MEDICATION_FORMS = {
  tablet: "Таблетки",
  capsule: "Капсулы",
  solution: "Раствор",
  drops: "Капли",
  spray: "Спрей",
  injection: "Инъекция",
  cream: "Крем или мазь",
  other: "Другая форма",
};

const MEDICATION_STATUS = {
  active: { label: "Принимаю", variant: "default", icon: Clock3 },
  planned: { label: "Запланирован", variant: "secondary", icon: CalendarDays },
  paused: { label: "Приостановлен", variant: "outline", icon: CirclePause },
  completed: { label: "Завершён", variant: "outline", icon: CheckCircle2 },
};

const MEDICATION_FREQUENCY = {
  once_daily: "1 раз в день",
  twice_daily: "2 раза в день",
  three_times_daily: "3 раза в день",
  weekly: "1 раз в неделю",
  as_needed: "По необходимости",
  custom: "Другая схема",
};

const DEFAULT_TIMES = {
  once_daily: ["08:00"],
  twice_daily: ["08:00", "20:00"],
  three_times_daily: ["08:00", "14:00", "20:00"],
  weekly: ["09:00"],
  custom: ["08:00"],
};

const UNGROUPED_ID = "ungrouped";

function emptyMedication(groupId = null) {
  return {
    name: "",
    groupId,
    medicationForm: "tablet",
    status: "active",
    dosage: "",
    frequency: "once_daily",
    scheduleTimes: ["08:00"],
    purpose: "",
    prescriber: "",
    instructions: "",
    startOn: localDateInputValue(),
    endOn: "",
    notes: "",
  };
}

function medicationForm(medication, groupId = null) {
  if (!medication) return emptyMedication(groupId);
  return {
    name: medication.name || "",
    groupId: medication.groupId || null,
    medicationForm: medication.medicationForm || "tablet",
    status: medication.status || "active",
    dosage: medication.dosage || "",
    frequency: medication.frequency || "once_daily",
    scheduleTimes: medication.scheduleTimes?.length ? medication.scheduleTimes : [],
    purpose: medication.purpose || "",
    prescriber: medication.prescriber || "",
    instructions: medication.instructions || "",
    startOn: medication.startOn || "",
    endOn: medication.endOn || "",
    notes: medication.notes || "",
  };
}

function formatDate(value) {
  const [year, month, day] = String(value || "").split("-").map(Number);
  if (!year || !month || !day) return "";
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", year: "numeric" })
    .format(new Date(year, month - 1, day, 12))
    .replace(" г.", "");
}

function courseLabel(medication) {
  if (medication.startOn && medication.endOn) return `${formatDate(medication.startOn)} — ${formatDate(medication.endOn)}`;
  if (medication.startOn) return `С ${formatDate(medication.startOn)}`;
  if (medication.endOn) return `До ${formatDate(medication.endOn)}`;
  return "Период не указан";
}

function scheduleLabel(medication) {
  const frequency = MEDICATION_FREQUENCY[medication.frequency] || MEDICATION_FREQUENCY.custom;
  const times = normalizeMedicationTimes(medication.scheduleTimes);
  return times.length ? `${frequency} · ${times.join(", ")}` : frequency;
}

function MedicationGroupMenu({ currentGroupId, disabled, groups, medicationName, moving, onCreateGroup, onMove }) {
  const { readOnly } = useSphereSharing();
  if (readOnly) return null;
  const selectedGroupId = currentGroupId || UNGROUPED_ID;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={(
          <Button
            className="pointer-events-auto relative z-20 size-9 rounded-full"
            variant="ghost"
            size="icon-lg"
            type="button"
            disabled={disabled}
          />
        )}
        aria-label={`Переместить препарат «${medicationName}» в другую группу`}
      >
        {moving ? <Spinner aria-hidden="true" /> : <MoreHorizontal aria-hidden="true" />}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="rollapp-body w-80 max-w-[calc(100vw-24px)] rounded-3xl p-3"
        align="end"
        sideOffset={8}
      >
        <DropdownMenuGroup>
          <DropdownMenuLabel className="px-2 py-2 text-base">Группы</DropdownMenuLabel>
          {onCreateGroup && (
            <DropdownMenuItem
              className="min-h-14 gap-3 rounded-2xl px-2 py-2 text-base"
              disabled={moving}
              onClick={onCreateGroup}
            >
              <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-muted text-muted-foreground" aria-hidden="true">
                <ListPlus className="size-6" />
              </span>
              Новая группа
            </DropdownMenuItem>
          )}
        </DropdownMenuGroup>
        {onCreateGroup && <DropdownMenuSeparator className="my-2" />}
        <DropdownMenuRadioGroup
          className="max-h-[22.75rem] overflow-y-auto overscroll-contain"
          value={selectedGroupId}
          onValueChange={(groupId) => groupId !== selectedGroupId && onMove(groupId)}
        >
          <DropdownMenuRadioItem
            className="min-h-14 gap-3 rounded-2xl px-2 py-2 pr-10 text-base"
            value={UNGROUPED_ID}
            disabled={moving}
          >
            <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-muted text-muted-foreground" aria-hidden="true">
              <Folder className="size-6" />
            </span>
            <span className="min-w-0 flex-1 truncate">Без группы</span>
          </DropdownMenuRadioItem>
          {groups.map((group) => (
            <DropdownMenuRadioItem
              className="min-h-14 gap-3 rounded-2xl px-2 py-2 pr-10 text-base"
              value={group.id}
              key={group.id}
              disabled={moving}
            >
              <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-muted text-muted-foreground" aria-hidden="true">
                <ListPlus className="size-6" />
              </span>
              <span className="min-w-0 flex-1 truncate">{group.title}</span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function MedicationCard({ groups, medication, moveDisabled, moving, onCreateGroup, onEdit, onMoveToGroup }) {
  const status = MEDICATION_STATUS[medication.status] || MEDICATION_STATUS.active;
  const StatusIcon = status.icon;
  return (
    <div className="relative h-full min-w-0">
      <Button
        className="peer absolute inset-0 z-10 h-full w-full cursor-pointer rounded-xl bg-transparent p-0 hover:bg-transparent active:translate-y-0"
        variant="ghost"
        type="button"
        aria-haspopup="dialog"
        aria-label={`Редактировать препарат «${medication.name}»`}
        title="Редактировать препарат"
        onClick={() => onEdit(medication)}
      >
        <span className="sr-only">Редактировать препарат «{medication.name}»</span>
      </Button>
      <Card className="pointer-events-none h-full min-w-0 transition-colors peer-hover:bg-muted/40">
        <CardHeader>
          <CardTitle><h4 className="m-0 font-heading text-base leading-snug font-medium">{medication.name}</h4></CardTitle>
          <CardDescription>{medication.purpose || MEDICATION_FORMS[medication.medicationForm]}</CardDescription>
          <CardAction className="pointer-events-auto relative z-20 flex items-center gap-1">
            <Badge variant={status.variant}>
              <StatusIcon data-icon="inline-start" aria-hidden="true" />
              {status.label}
            </Badge>
            <MedicationGroupMenu
              currentGroupId={medication.groupId}
              disabled={moveDisabled}
              groups={groups}
              medicationName={medication.name}
              moving={moving}
              onCreateGroup={onCreateGroup}
              onMove={(groupId) => onMoveToGroup(medication, groupId)}
            />
          </CardAction>
        </CardHeader>
        <CardContent className="flex flex-1 flex-col gap-4">
          <div className="flex flex-col gap-2 text-sm text-muted-foreground">
            {medication.dosage && <span className="flex items-center gap-2"><Pill className="size-4" aria-hidden="true" />{medication.dosage}</span>}
            <span className="flex items-center gap-2"><Clock3 className="size-4" aria-hidden="true" />{scheduleLabel(medication)}</span>
            <span className="flex items-center gap-2"><CalendarDays className="size-4" aria-hidden="true" />{courseLabel(medication)}</span>
            {medication.prescriber && <span className="flex items-center gap-2"><Stethoscope className="size-4" aria-hidden="true" />{medication.prescriber}</span>}
          </div>
          {medication.instructions && <p className="m-0 text-sm text-foreground text-pretty">{medication.instructions}</p>}
          {medication.notes && <p className="m-0 text-sm text-muted-foreground text-pretty">{medication.notes}</p>}
        </CardContent>
      </Card>
    </div>
  );
}

function MedicationDrawer({ open, medication, groups, initialGroupId, onOpenChange, onSaved }) {
  const isMobile = useIsMobile();
  const formId = useId();
  const [form, setForm] = useState(emptyMedication);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setForm(medicationForm(medication, initialGroupId));
    setSaving(false);
    setError("");
  }, [open, medication, initialGroupId]);

  const update = (field, value) => setForm((current) => ({ ...current, [field]: value }));
  const updateFrequency = (frequency) => {
    setForm((current) => ({
      ...current,
      frequency,
      scheduleTimes: frequency === "as_needed" ? [] : [...(DEFAULT_TIMES[frequency] || current.scheduleTimes || ["08:00"])],
    }));
  };
  const updateTime = (index, value) => {
    setForm((current) => ({
      ...current,
      scheduleTimes: current.scheduleTimes.map((time, timeIndex) => timeIndex === index ? value : time),
    }));
  };
  const addTime = () => setForm((current) => ({ ...current, scheduleTimes: [...current.scheduleTimes, ""] }));
  const removeTime = (index) => setForm((current) => ({
    ...current,
    scheduleTimes: current.scheduleTimes.filter((_, timeIndex) => timeIndex !== index),
  }));

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    const payload = { ...form, scheduleTimes: normalizeMedicationTimes(form.scheduleTimes) };
    try {
      const path = medication ? `/health/medications/${encodeURIComponent(medication.id)}` : "/health/medications";
      const { medication: savedMedication } = medication
        ? await api.patch(path, payload)
        : await api.post(path, payload);
      onSaved(savedMedication);
      onOpenChange(false);
    } catch (requestError) {
      setError(requestError.message);
      setSaving(false);
    }
  }

  const invalidDates = Boolean(form.startOn && form.endOn && form.endOn < form.startOn);

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
          aria-label="Закрыть форму препарата"
        >
          <X aria-hidden="true" />
        </DrawerClose>
        <form className="flex min-h-0 min-w-0 flex-1 flex-col" onSubmit={submit}>
          <DrawerHeader className="pr-16 text-left!">
            <DrawerTitle>{medication ? "Редактировать препарат" : "Добавить препарат"}</DrawerTitle>
            <DrawerDescription>Сохраните назначение, схему и период приёма. Медицинские решения согласуйте со специалистом.</DrawerDescription>
          </DrawerHeader>

          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
            {error && (
              <Alert variant="destructive">
                <AlertTriangle aria-hidden="true" />
                <AlertTitle>Не удалось сохранить препарат</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

          <FieldGroup className="gap-4">
            <Field>
              <FieldLabel htmlFor={`${formId}-group`}>Группа</FieldLabel>
              <Select value={form.groupId || UNGROUPED_ID} onValueChange={(value) => update("groupId", value === UNGROUPED_ID ? null : value)}>
                <SelectTrigger className="min-h-12 w-full text-base" id={`${formId}-group`}>
                  <SelectValue>{(value) => value === UNGROUPED_ID ? "Без группы" : groups.find((group) => group.id === value)?.title || "Выберите группу"}</SelectValue>
                </SelectTrigger>
                <SelectContent align="start" alignItemWithTrigger={false}>
                  <SelectItem value={UNGROUPED_ID}>Без группы</SelectItem>
                  {groups.map((group) => <SelectItem key={group.id} value={group.id}>{group.title}</SelectItem>)}
                </SelectContent>
              </Select>
              <FieldDescription>Группы помогают разделить постоянные препараты, курсы и добавки.</FieldDescription>
            </Field>

            <Field>
              <FieldLabel htmlFor={`${formId}-name`}>Название препарата</FieldLabel>
              <Input
                className="min-h-12 text-base"
                id={`${formId}-name`}
                required
                maxLength={160}
                autoFocus
                placeholder="Например, Витамин D3"
                value={form.name}
                onChange={(event) => update("name", event.target.value)}
              />
            </Field>

            <div className="flex flex-col gap-4">
              <Field>
                <FieldLabel htmlFor={`${formId}-form`}>Форма</FieldLabel>
                <Select value={form.medicationForm} onValueChange={(value) => update("medicationForm", value)}>
                  <SelectTrigger className="min-h-12 w-full text-base" id={`${formId}-form`}>
                    <SelectValue>{(value) => MEDICATION_FORMS[value] || "Выберите форму"}</SelectValue>
                  </SelectTrigger>
                  <SelectContent align="start" alignItemWithTrigger={false}>
                    {Object.entries(MEDICATION_FORMS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel htmlFor={`${formId}-status`}>Статус</FieldLabel>
                <Select value={form.status} onValueChange={(value) => update("status", value)}>
                  <SelectTrigger className="min-h-12 w-full text-base" id={`${formId}-status`}>
                    <SelectValue>{(value) => MEDICATION_STATUS[value]?.label || "Выберите статус"}</SelectValue>
                  </SelectTrigger>
                  <SelectContent align="start" alignItemWithTrigger={false}>
                    {Object.entries(MEDICATION_STATUS).map(([value, status]) => <SelectItem key={value} value={value}>{status.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
            </div>

            <div className="flex flex-col gap-4">
              <Field>
                <FieldLabel htmlFor={`${formId}-dosage`}>Дозировка</FieldLabel>
                <Input
                  className="min-h-12 text-base"
                  id={`${formId}-dosage`}
                  maxLength={160}
                  placeholder="1 таблетка, 500 мг"
                  value={form.dosage}
                  onChange={(event) => update("dosage", event.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor={`${formId}-purpose`}>Для чего назначен</FieldLabel>
                <Input
                  className="min-h-12 text-base"
                  id={`${formId}-purpose`}
                  maxLength={240}
                  placeholder="Цель или диагноз"
                  value={form.purpose}
                  onChange={(event) => update("purpose", event.target.value)}
                />
              </Field>
            </div>

            <Field>
              <FieldLabel htmlFor={`${formId}-frequency`}>Частота приёма</FieldLabel>
              <Select value={form.frequency} onValueChange={updateFrequency}>
                <SelectTrigger className="min-h-12 w-full text-base" id={`${formId}-frequency`}>
                  <SelectValue>{(value) => MEDICATION_FREQUENCY[value] || "Выберите частоту"}</SelectValue>
                </SelectTrigger>
                <SelectContent align="start" alignItemWithTrigger={false}>
                  {Object.entries(MEDICATION_FREQUENCY).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>

            {form.frequency !== "as_needed" && (
              <Field>
                <FieldLabel>Время приёма</FieldLabel>
                <div className="flex flex-col gap-2">
                  {form.scheduleTimes.map((time, index) => (
                    <div className="flex items-center gap-2" key={`${index}-${form.frequency}`}>
                      <Input
                        className="min-h-12 text-base"
                        type="time"
                        aria-label={`Время приёма ${index + 1}`}
                        required
                        value={time}
                        onChange={(event) => updateTime(index, event.target.value)}
                      />
                      {form.frequency === "custom" && form.scheduleTimes.length > 1 && (
                        <Button className="size-12 shrink-0" variant="ghost" size="icon" type="button" aria-label={`Удалить время приёма ${index + 1}`} onClick={() => removeTime(index)}>
                          <Trash2 aria-hidden="true" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
                {form.frequency === "custom" && form.scheduleTimes.length < 6 && (
                  <Button className="min-h-12 self-start px-4 text-base" variant="ghost" type="button" onClick={addTime}>
                    <Plus data-icon="inline-start" aria-hidden="true" />
                    Добавить время
                  </Button>
                )}
                <FieldDescription>Время используется для отображения схемы приёма внутри Rollapp.</FieldDescription>
              </Field>
            )}

            <div className="flex flex-col gap-4">
              <Field>
                <FieldLabel htmlFor={`${formId}-start`}>Начало курса</FieldLabel>
                <Input className="min-h-12 text-base" id={`${formId}-start`} type="date" value={form.startOn} onChange={(event) => update("startOn", event.target.value)} />
              </Field>
              <Field data-invalid={invalidDates}>
                <FieldLabel htmlFor={`${formId}-end`}>Окончание курса</FieldLabel>
                <Input
                  className="min-h-12 text-base"
                  id={`${formId}-end`}
                  type="date"
                  min={form.startOn || undefined}
                  aria-invalid={invalidDates ? true : undefined}
                  value={form.endOn}
                  onChange={(event) => update("endOn", event.target.value)}
                />
                {invalidDates && <FieldError>Окончание курса должно быть не раньше начала.</FieldError>}
              </Field>
            </div>

            <Field>
              <FieldLabel htmlFor={`${formId}-prescriber`}>Кто назначил</FieldLabel>
              <Input
                className="min-h-12 text-base"
                id={`${formId}-prescriber`}
                maxLength={240}
                placeholder="Врач или клиника"
                value={form.prescriber}
                onChange={(event) => update("prescriber", event.target.value)}
              />
            </Field>

            <Field>
              <FieldLabel htmlFor={`${formId}-instructions`}>Как принимать</FieldLabel>
              <Textarea
                className="min-h-20 text-base"
                id={`${formId}-instructions`}
                rows={3}
                maxLength={2000}
                placeholder="Например, после еды, запивая водой"
                value={form.instructions}
                onChange={(event) => update("instructions", event.target.value)}
              />
            </Field>

            <Field>
              <FieldLabel htmlFor={`${formId}-notes`}>Заметки</FieldLabel>
              <Textarea
                className="min-h-20 text-base"
                id={`${formId}-notes`}
                rows={3}
                maxLength={4000}
                placeholder="Самочувствие, результаты и вопросы к врачу"
                value={form.notes}
                onChange={(event) => update("notes", event.target.value)}
              />
            </Field>
          </FieldGroup>
          </div>

          <DrawerFooter className="border-t bg-popover pt-4 sm:flex-row sm:justify-end">
            <DrawerClose render={<Button className="min-h-12 px-4 text-base" variant="outline" type="button" disabled={saving} />}>Отмена</DrawerClose>
            <Button className="min-h-12 px-4 text-base" type="submit" disabled={saving || invalidDates || !form.name.trim()}>
              {saving && <Spinner aria-hidden="true" />}
              {saving ? "Сохраняем" : medication ? "Сохранить изменения" : "Добавить препарат"}
            </Button>
          </DrawerFooter>
        </form>
      </DrawerContent>
    </Drawer>
  );
}

function MedicationGroupDrawer({ open, group, onOpenChange, onSaved, onDeleted }) {
  const isMobile = useIsMobile();
  const formId = useId();
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [error, setError] = useState("");
  const busy = saving || deleting;

  useEffect(() => {
    if (!open) return;
    setTitle(group?.title || "");
    setSaving(false);
    setDeleting(false);
    setDeleteOpen(false);
    setError("");
  }, [open, group]);

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const path = group
        ? `/health/medication-groups/${encodeURIComponent(group.id)}`
        : "/health/medication-groups";
      const { group: savedGroup } = group
        ? await api.patch(path, { title })
        : await api.post(path, { title });
      onSaved(savedGroup);
      onOpenChange(false);
    } catch (requestError) {
      setError(requestError.message);
      setSaving(false);
    }
  }

  async function removeGroup() {
    if (!group) return;
    setDeleting(true);
    setError("");
    try {
      await api.delete(`/health/medication-groups/${encodeURIComponent(group.id)}`);
      setDeleteOpen(false);
      onDeleted(group.id);
      onOpenChange(false);
    } catch (requestError) {
      setDeleteOpen(false);
      setError(requestError.message);
      setDeleting(false);
    }
  }

  return (
    <>
      <Drawer
        open={open}
        showSwipeHandle
        swipeDirection={isMobile ? "down" : "right"}
        onOpenChange={(nextOpen) => !busy && onOpenChange(nextOpen)}
      >
        <DrawerContent
          className="rollapp-body"
          style={isMobile ? undefined : { "--drawer-content-width": "min(32rem, calc(100vw - 2rem))" }}
        >
          <DrawerClose
            render={<Button className="absolute top-2 right-2 z-10 size-12" variant="ghost" size="icon" type="button" disabled={busy} />}
            aria-label="Закрыть настройки группы"
          >
            <X aria-hidden="true" />
          </DrawerClose>
          <form className="flex min-h-0 min-w-0 flex-1 flex-col" onSubmit={submit}>
            <DrawerHeader className="pr-16 text-left!">
              <DrawerTitle>{group ? "Настройки группы" : "Новая группа"}</DrawerTitle>
              <DrawerDescription>Объедините препараты по курсу, назначению или удобному для вас признаку.</DrawerDescription>
            </DrawerHeader>
            <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
              {error && (
                <Alert variant="destructive">
                  <AlertTriangle aria-hidden="true" />
                  <AlertTitle>Не удалось сохранить группу</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              <Field>
                <FieldLabel htmlFor={`${formId}-title`}>Название группы</FieldLabel>
                <Input
                  className="min-h-12 text-base"
                  id={`${formId}-title`}
                  required
                  maxLength={60}
                  autoFocus
                  placeholder="Например, Витамины"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                />
              </Field>
            </div>
            <DrawerFooter className="border-t bg-popover pt-4 sm:flex-row sm:justify-end">
              {group && (
                <Button className="min-h-12 px-4 text-base sm:mr-auto" variant="destructive" type="button" disabled={busy} onClick={() => setDeleteOpen(true)}>
                  <Trash2 data-icon="inline-start" aria-hidden="true" />
                  Удалить группу
                </Button>
              )}
              <DrawerClose render={<Button className="min-h-12 px-4 text-base" variant="outline" type="button" disabled={busy} />}>Отмена</DrawerClose>
              <Button className="min-h-12 px-4 text-base" type="submit" disabled={busy || !title.trim()}>
                {saving && <Spinner aria-hidden="true" />}
                {saving ? "Сохраняем" : group ? "Сохранить" : "Создать группу"}
              </Button>
            </DrawerFooter>
          </form>
        </DrawerContent>
      </Drawer>

      <AlertDialog open={deleteOpen} onOpenChange={(nextOpen) => !deleting && setDeleteOpen(nextOpen)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить группу «{group?.title}»?</AlertDialogTitle>
            <AlertDialogDescription>Препараты останутся сохранены и переместятся в раздел «Без группы».</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Отмена</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={deleting} onClick={removeGroup}>
              {deleting && <Spinner data-icon="inline-start" aria-hidden="true" />}
              Удалить группу
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function medicationCountLabel(count) {
  const value = Math.abs(Number(count)) % 100;
  const last = value % 10;
  if (value > 10 && value < 20) return "препаратов";
  if (last === 1) return "препарат";
  if (last > 1 && last < 5) return "препарата";
  return "препаратов";
}

function MedicationGroupTabs({ groups, medications, value, onValueChange, onCreate }) {
  const { readOnly } = useSphereSharing();
  const countForGroup = (groupId) => medications.filter((medication) => (medication.groupId || UNGROUPED_ID) === groupId).length;
  const tiles = [{ id: UNGROUPED_ID, title: "Без группы" }, ...groups];
  return (
    <nav className="list-tabs mb-0 w-full" aria-label="Группы препаратов">
      <div className="flex w-max min-w-full items-stretch justify-center gap-1.5">
        <ToggleGroup className="contents" value={[value]} onValueChange={(values) => values[0] && onValueChange(values[0])} aria-label="Группы препаратов">
          {tiles.map((group) => {
            const count = countForGroup(group.id);
            return (
              <ToggleGroupItem key={group.id} value={group.id} aria-label={`${group.title}, ${count} ${medicationCountLabel(count)}`}>
                <strong data-slot="list-tile-label">{group.title}</strong>
                <span data-slot="list-tile-count">{count}</span>
              </ToggleGroupItem>
            );
          })}
        </ToggleGroup>
        {!readOnly && <Button variant="ghost" size="icon" className="list-tabs__add" type="button" aria-label="Новая группа" title="Новая группа" onClick={onCreate}>
          <Plus aria-hidden="true" />
        </Button>}
      </div>
    </nav>
  );
}

function MedicationSection({ groups, id, medications, moveState, onCreateGroup, onEdit, onMoveToGroup, title }) {
  if (!medications.length) return null;
  return (
    <section className="flex min-w-0 flex-col gap-4" aria-labelledby={id}>
      <h3 className="m-0 font-heading text-lg leading-7 font-semibold" id={id}>{title}</h3>
      <ul className="grid list-none gap-4 sm:grid-cols-2">
        {medications.map((medication) => (
          <li className="min-w-0" key={medication.id}>
            <MedicationCard
              groups={groups}
              medication={medication}
              moveDisabled={Boolean(moveState.itemId)}
              moving={moveState.itemId === medication.id}
              onCreateGroup={() => onCreateGroup(medication)}
              onEdit={onEdit}
              onMoveToGroup={onMoveToGroup}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

export function Medications() {
  const { readOnly } = useSphereSharing();
  const [drawerState, setDrawerState] = useState(null);
  const [groupDrawerState, setGroupDrawerState] = useState(null);
  const [selectedGroupId, setSelectedGroupId] = useState(UNGROUPED_ID);
  const [moveState, setMoveState] = useState({ itemId: "", error: "", announcement: "" });
  const [requestVersion, setRequestVersion] = useState(0);
  const [requestState, setRequestState] = useState({ loading: true, medications: [], groups: [], error: null });

  useEffect(() => {
    let current = true;
    setRequestState((state) => ({ ...state, loading: true, error: null }));
    api.get("/health/medications").then(({ medications, groups }) => {
      if (current) setRequestState({ loading: false, medications: sortMedications(medications || []), groups: groups || [], error: null });
    }).catch((error) => {
      if (current) setRequestState((state) => ({ ...state, loading: false, error }));
    });
    return () => { current = false; };
  }, [requestVersion]);

  useEffect(() => {
    if (selectedGroupId === UNGROUPED_ID) return;
    if (!requestState.groups.some((group) => group.id === selectedGroupId)) setSelectedGroupId(UNGROUPED_ID);
  }, [requestState.groups, selectedGroupId]);

  const saveMedication = (medication) => {
    setRequestState((state) => {
      const existing = state.medications.some((item) => item.id === medication.id);
      const medications = existing
        ? state.medications.map((item) => item.id === medication.id ? medication : item)
        : [medication, ...state.medications];
      return { ...state, medications: sortMedications(medications) };
    });
  };

  const saveGroup = (group) => {
    setRequestState((state) => {
      const existing = state.groups.some((item) => item.id === group.id);
      const groups = existing
        ? state.groups.map((item) => item.id === group.id ? group : item)
        : [...state.groups, group];
      return { ...state, groups };
    });
    setSelectedGroupId(group.id);
    if (groupDrawerState?.moveItem) void moveMedicationToGroup(groupDrawerState.moveItem, group.id, group.title);
  };

  const deleteGroup = (groupId) => {
    setRequestState((state) => ({
      ...state,
      groups: state.groups.filter((group) => group.id !== groupId),
      medications: state.medications.map((medication) => medication.groupId === groupId ? { ...medication, groupId: null } : medication),
    }));
    setSelectedGroupId(UNGROUPED_ID);
  };

  const moveMedicationToGroup = async (medication, targetGroupId, targetTitleOverride = "") => {
    const groupId = targetGroupId === UNGROUPED_ID ? null : targetGroupId;
    if ((medication.groupId || null) === groupId || moveState.itemId) return;
    setMoveState({ itemId: medication.id, error: "", announcement: "" });
    try {
      const result = await api.patch(`/health/medications/${encodeURIComponent(medication.id)}/group`, { groupId });
      saveMedication(result.medication);
      const targetTitle = groupId
        ? targetTitleOverride || requestState.groups.find((group) => group.id === groupId)?.title || "выбранную группу"
        : "Без группы";
      setMoveState({
        itemId: "",
        error: "",
        announcement: `Препарат «${medication.name}» перемещён в группу «${targetTitle}».`,
      });
    } catch (error) {
      setMoveState({ itemId: "", error: error.message, announcement: "" });
    }
  };

  const selectedGroup = requestState.groups.find((group) => group.id === selectedGroupId) || null;
  const visibleMedications = requestState.medications.filter((medication) => (
    selectedGroupId === UNGROUPED_ID ? !medication.groupId : medication.groupId === selectedGroupId
  ));
  const active = visibleMedications.filter((medication) => medication.status === "active");
  const planned = visibleMedications.filter((medication) => medication.status === "planned");
  const archived = visibleMedications.filter((medication) => ["paused", "completed"].includes(medication.status));
  const addMedication = () => setDrawerState({
    medication: null,
    initialGroupId: selectedGroupId === UNGROUPED_ID ? null : selectedGroupId,
  });

  return (
    <article className="not-typeset rollapp-body mx-auto flex w-full max-w-5xl min-w-0 flex-col gap-6 pb-12" data-group-navigation aria-labelledby="medications-title">
      {!readOnly && <header className="flex min-h-12 w-full items-center justify-center">
        <h2 className="sr-only" id="medications-title">Препараты</h2>
        <div className="page-actions wishes-page__hero-actions" role="group" aria-label="Действия раздела «Препараты»">
          {selectedGroup && (
            <Button className="h-12 px-5 text-base max-[560px]:flex-1" variant="outline" shape="pill" type="button" onClick={() => setGroupDrawerState({ group: selectedGroup, moveItem: null })}>
              Настройки группы
            </Button>
          )}
          <Button className="h-12 min-w-[180px] px-6 text-base max-[560px]:min-w-0" shape="pill" type="button" onClick={addMedication}>
            Добавить
          </Button>
        </div>
      </header>}

      {requestState.error && (
        <Alert variant="destructive">
          <AlertTriangle aria-hidden="true" />
          <AlertTitle>Не удалось загрузить препараты</AlertTitle>
          <AlertDescription>{requestState.error.message}</AlertDescription>
          <AlertAction>
            <Button variant="outline" size="sm" type="button" onClick={() => setRequestVersion((version) => version + 1)}>
              <RotateCcw data-icon="inline-start" aria-hidden="true" />
              Повторить
            </Button>
          </AlertAction>
        </Alert>
      )}

      {moveState.error && (
        <Alert variant="destructive">
          <AlertTriangle aria-hidden="true" />
          <AlertTitle>Не удалось переместить препарат</AlertTitle>
          <AlertDescription>{moveState.error}</AlertDescription>
        </Alert>
      )}

      {requestState.loading && (
        <Card>
          <CardContent className="flex min-h-48 flex-col items-center justify-center gap-3 text-center" aria-live="polite">
            <Spinner className="size-5" aria-label="Загружаем препараты" />
            <span className="text-sm text-muted-foreground">Загружаем препараты</span>
          </CardContent>
        </Card>
      )}

      {!requestState.loading && !requestState.error && (
        <MedicationGroupTabs
          groups={requestState.groups}
          medications={requestState.medications}
          value={selectedGroupId}
          onValueChange={setSelectedGroupId}
          onCreate={() => setGroupDrawerState({ group: null, moveItem: null })}
        />
      )}

      {!requestState.loading && !requestState.error && !requestState.medications.length && (
        <Empty className="min-h-64 border">
          <EmptyHeader>
            <EmptyMedia variant="icon"><Pill aria-hidden="true" /></EmptyMedia>
            <EmptyTitle><h3 className="m-0 text-sm font-medium">Препаратов пока нет</h3></EmptyTitle>
            <EmptyDescription>Добавьте текущее назначение или запланированный курс.</EmptyDescription>
          </EmptyHeader>
          {!readOnly && <EmptyContent>
            <Button className="min-h-12 px-4 text-base" type="button" onClick={addMedication}>
              <Plus data-icon="inline-start" aria-hidden="true" />
              Добавить первый препарат
            </Button>
          </EmptyContent>}
        </Empty>
      )}

      {!requestState.loading && !requestState.error && visibleMedications.length > 0 && (
        <>
          <MedicationSection groups={requestState.groups} id="active-medications-title" title="Принимаю сейчас" medications={active} moveState={moveState} onCreateGroup={(medication) => !readOnly && setGroupDrawerState({ group: null, moveItem: medication })} onEdit={(medication) => !readOnly && setDrawerState({ medication })} onMoveToGroup={moveMedicationToGroup} />
          <MedicationSection groups={requestState.groups} id="planned-medications-title" title="Запланировано" medications={planned} moveState={moveState} onCreateGroup={(medication) => !readOnly && setGroupDrawerState({ group: null, moveItem: medication })} onEdit={(medication) => !readOnly && setDrawerState({ medication })} onMoveToGroup={moveMedicationToGroup} />
          <MedicationSection groups={requestState.groups} id="archived-medications-title" title="Приостановлено и завершено" medications={archived} moveState={moveState} onCreateGroup={(medication) => !readOnly && setGroupDrawerState({ group: null, moveItem: medication })} onEdit={(medication) => !readOnly && setDrawerState({ medication })} onMoveToGroup={moveMedicationToGroup} />
        </>
      )}

      <p className="sr-only" aria-live="polite">{moveState.announcement}</p>

      {!readOnly && <MedicationDrawer
        open={Boolean(drawerState)}
        medication={drawerState?.medication || null}
        groups={requestState.groups}
        initialGroupId={drawerState?.initialGroupId || null}
        onOpenChange={(open) => { if (!open) setDrawerState(null); }}
        onSaved={saveMedication}
      />}
      {!readOnly && <MedicationGroupDrawer
        open={Boolean(groupDrawerState)}
        group={groupDrawerState?.group || null}
        onOpenChange={(open) => { if (!open) setGroupDrawerState(null); }}
        onSaved={saveGroup}
        onDeleted={deleteGroup}
      />}
    </article>
  );
}
