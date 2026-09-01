import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  AlertTriangle, CalendarDays, CheckCircle2, Clock3, ExternalLink, FolderInput, GraduationCap,
  ImagePlus, Layers3, MoreHorizontal, Pencil, PlayCircle, RotateCcw, Trash2, Ungroup, X,
} from "lucide-react";
import { api } from "@/api";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card, CardAction, CardContent, CardFooter, CardHeader, CardTitle,
} from "@/components/ui/card";
import {
  Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle,
} from "@/components/ui/drawer";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuSub,
  DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { useIsMobile } from "@/hooks/use-mobile";
import { useCardReorder } from "@/hooks/use-card-reorder";
import { sortCourses } from "@/lib/course-order";
import {
  EducationItemListMenu, EducationListDrawer, EducationListNavigation, EducationSectionHeader,
} from "@/components/education-lists";
import {
  educationApiListId, educationItemsInList, educationListSelection,
  mergeEducationListOrder, UNLISTED_EDUCATION_LIST_ID,
} from "@/lib/education-lists";

const EMPTY_COURSE = {
  title: "",
  provider: "",
  status: "planned",
  logoUrl: "",
  url: "",
  description: "",
  startedOn: "",
  completedOn: "",
  listId: "",
};

const COURSE_STATUS = {
  planned: { label: "Запланирован", variant: "outline", icon: Clock3 },
  in_progress: { label: "В процессе", variant: "default", icon: PlayCircle },
  completed: { label: "Завершён", variant: "secondary", icon: CheckCircle2 },
};

const uploadedImageIdFromUrl = (value = "") => /^\/api\/media\/([0-9a-f-]{36})$/i.exec(value)?.[1] || "";

function formatDate(value) {
  if (!value) return "";
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return "";
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" })
    .format(new Date(Date.UTC(year, month - 1, day)))
    .replace(" г.", "");
}

function courseDateLabel(course) {
  if (course.status === "completed") return course.completedOn ? `Завершён ${formatDate(course.completedOn)}` : "Курс завершён";
  if (course.startedOn) return course.status === "planned" ? `Старт ${formatDate(course.startedOn)}` : `Начат ${formatDate(course.startedOn)}`;
  return course.status === "planned" ? "Дата начала не указана" : "Идёт сейчас";
}

function courseFormValues(course, initialListId = "") {
  if (!course) return { ...EMPTY_COURSE, listId: initialListId };
  return Object.fromEntries(
    Object.keys(EMPTY_COURSE).map((field) => [field, course[field] || EMPTY_COURSE[field]]),
  );
}

function CourseLogo({ course, size = "card" }) {
  const className = size === "form"
    ? "size-20 shrink-0 rounded-xl"
    : "size-10 shrink-0 rounded-lg";
  return (
    <div className={`flex items-center justify-center overflow-hidden border bg-muted text-muted-foreground ${className}`}>
      {course.logoUrl ? (
        <img className="size-full object-contain" src={course.logoUrl} alt="" />
      ) : (
        <GraduationCap className={size === "form" ? "size-8" : "size-5"} aria-hidden="true" />
      )}
    </div>
  );
}

function CourseCard({
  course, dragDescriptionId, lists, moveDisabled, moving, onCreateList, onEdit, onMove, onMoveToList,
  onRemoveFromGroup, removeBusy = false, draggable = true,
}) {
  const status = COURSE_STATUS[course.status] || COURSE_STATUS.planned;
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
        aria-label={draggable ? `Открыть и переместить курс «${course.title}»` : `Открыть курс «${course.title}»`}
        title={draggable ? "Нажмите, чтобы редактировать. Для группы перетащите на центр другого курса и дождитесь подсветки" : "Нажмите, чтобы редактировать"}
        onClick={() => onEdit(course)}
        onKeyDown={(event) => {
          if (!draggable) return;
          if (["ArrowLeft", "ArrowUp"].includes(event.key)) {
            event.preventDefault();
            onMove(course.id, -1);
          }
          if (["ArrowRight", "ArrowDown"].includes(event.key)) {
            event.preventDefault();
            onMove(course.id, 1);
          }
        }}
      >
        <span className="sr-only">Открыть или переместить курс «{course.title}»</span>
      </Button>
      <Card className="pointer-events-none h-full min-w-0 transition-colors peer-hover:bg-muted/40">
        <CardHeader>
          <CardTitle className="flex min-w-0 items-start gap-3 pr-2">
            <CourseLogo course={course} />
            <div className="min-w-0">
              <h3 className="m-0 truncate font-heading text-base leading-snug font-medium">{course.title}</h3>
              <Badge className="mt-2 w-fit" variant={status.variant}>
                <StatusIcon data-icon="inline-start" aria-hidden="true" />
                {status.label}
              </Badge>
              {course.provider && <span className="mt-1 block truncate text-sm font-normal text-muted-foreground">{course.provider}</span>}
            </div>
          </CardTitle>
          <CardAction className="pointer-events-auto relative z-20 flex items-center gap-1">
            <EducationItemListMenu
              currentListId={course.listId}
              disabled={moveDisabled}
              itemLabel="курс"
              itemTitle={course.title}
              lists={lists}
              moving={moving}
              onCreateList={onCreateList}
              onMove={(listId) => onMoveToList(course, listId)}
            />
            {onRemoveFromGroup && (
              <Button
                className="pointer-events-auto relative z-20 size-9 rounded-full"
                variant="ghost"
                size="icon-lg"
                type="button"
                disabled={removeBusy}
                aria-label={`Убрать курс «${course.title}» из группы`}
                title="Убрать из группы"
                onClick={() => onRemoveFromGroup(course)}
              >
                {removeBusy ? <Spinner aria-hidden="true" /> : <Ungroup aria-hidden="true" />}
              </Button>
            )}
          </CardAction>
        </CardHeader>
        <CardContent className="flex flex-1 flex-col gap-4">
          {course.description && <p className="m-0 text-sm text-muted-foreground text-pretty">{course.description}</p>}
          <div className="mt-auto flex items-center gap-2 text-sm text-muted-foreground">
            <CalendarDays className="size-4" aria-hidden="true" />
            <span>{courseDateLabel(course)}</span>
          </div>
        </CardContent>
        {course.url && (
          <CardFooter className="justify-end">
            <a
              className={buttonVariants({ variant: "outline", size: "default", className: "pointer-events-auto relative z-20 min-h-12 px-4 text-base" })}
              href={course.url}
              target="_blank"
              rel="noreferrer"
            >
              <ExternalLink data-icon="inline-start" aria-hidden="true" />
              Открыть курс
            </a>
          </CardFooter>
        )}
      </Card>
    </div>
  );
}

function courseCountLabel(count) {
  const mod100 = count % 100;
  const mod10 = count % 10;
  if (mod100 >= 11 && mod100 <= 14) return `${count} курсов`;
  if (mod10 === 1) return `${count} курс`;
  if (mod10 >= 2 && mod10 <= 4) return `${count} курса`;
  return `${count} курсов`;
}

function applyCourseGroupChange(groups = [], change) {
  if (!change?.groupId) return groups;
  return groups.flatMap((group) => {
    if (group.id !== change.groupId) return [group];
    if (change.dissolved) return [];
    return [{ ...group, courseIds: change.courseIds || group.courseIds }];
  });
}

function CourseGroupMoveSubmenu({ currentListId, lists, busy, onMove }) {
  const targets = [
    { id: UNLISTED_EDUCATION_LIST_ID, title: "Не отсортированные" },
    ...lists.map((list) => ({ id: list.id, title: list.title })),
  ].filter((list) => educationApiListId(list.id) !== (currentListId || ""));
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger className="min-h-12 gap-3 rounded-xl px-3 text-base" disabled={busy || targets.length === 0}>
        <FolderInput aria-hidden="true" />
        Переместить в список
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="rollapp-body w-72 max-w-[calc(100vw-24px)] rounded-2xl p-2">
        {targets.map((list) => (
          <DropdownMenuItem className="min-h-12 rounded-xl px-3 text-base" key={list.id} disabled={busy} onClick={() => onMove(list)}>
            {list.title}
          </DropdownMenuItem>
        ))}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}

function CourseGroupActions({ group, lists, busy, onBeginRename, onDisband, onMove }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button className="pointer-events-auto relative z-20 size-9 rounded-full" variant="ghost" size="icon-lg" type="button" disabled={busy} />}
        aria-label={`Опции группы «${group.title}»`}
      >
        {busy ? <Spinner aria-hidden="true" /> : <MoreHorizontal aria-hidden="true" />}
      </DropdownMenuTrigger>
      <DropdownMenuContent className="rollapp-body w-72 max-w-[calc(100vw-24px)] rounded-2xl p-2" align="end" sideOffset={8}>
        <DropdownMenuItem className="min-h-12 gap-3 rounded-xl px-3 text-base" disabled={busy} onClick={onBeginRename}>
          <Pencil aria-hidden="true" />
          Переименовать
        </DropdownMenuItem>
        <CourseGroupMoveSubmenu currentListId={group.listId} lists={lists} busy={busy} onMove={onMove} />
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" className="app-destructive-menu-item min-h-12 gap-3 rounded-xl px-3 text-base" disabled={busy} onClick={onDisband}>
          <Ungroup aria-hidden="true" />
          Расформировать
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function CourseGroupTile({ group, courses, lists, isDropTarget, onOpen, onRename, onMove, onDisband }) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(group.title);
  const [busy, setBusy] = useState(false);
  const [disbandOpen, setDisbandOpen] = useState(false);

  useEffect(() => { if (!editing) setTitle(group.title); }, [editing, group.title]);

  const saveTitle = async () => {
    const nextTitle = title.trim();
    if (!nextTitle || nextTitle === group.title) {
      setTitle(group.title);
      setEditing(false);
      return;
    }
    setBusy(true);
    const saved = await onRename(nextTitle);
    setBusy(false);
    if (saved) setEditing(false);
  };
  const move = async (list) => {
    setBusy(true);
    await onMove(list);
    setBusy(false);
  };
  const disband = async () => {
    setBusy(true);
    const removed = await onDisband();
    setBusy(false);
    if (removed) setDisbandOpen(false);
  };

  return (
    <>
      <li
        className={`education-course-group min-w-0 ${isDropTarget ? "is-drop-target" : ""}`}
        data-sortable-group-id={group.id}
      >
        <Card className="relative h-full min-h-44 overflow-hidden transition-colors">
          <Button
            className="absolute inset-0 z-10 h-full w-full rounded-xl bg-transparent p-0 hover:bg-transparent active:translate-y-0"
            variant="ghost"
            type="button"
            aria-label={`Открыть группу «${group.title}», ${courseCountLabel(courses.length)}`}
            onClick={onOpen}
          />
          <CardHeader className="gap-3">
            <div className="flex h-20 items-center gap-4 overflow-hidden pr-12" aria-hidden="true">
              {courses.slice(0, 4).map((course) => (
                <span className="grid size-14 shrink-0 place-items-center overflow-hidden text-muted-foreground" key={course.id}>
                  {course.logoUrl ? <img className="max-h-full max-w-full object-contain" src={course.logoUrl} alt="" /> : <GraduationCap className="size-7" />}
                </span>
              ))}
            </div>
            <CardTitle className="relative z-20 min-w-0 pr-10">
              {editing ? (
                <Input
                  autoFocus
                  className="pointer-events-auto min-h-10 text-base"
                  maxLength={60}
                  aria-label="Название группы курсов"
                  disabled={busy}
                  value={title}
                  onFocus={(event) => event.currentTarget.select()}
                  onChange={(event) => setTitle(event.target.value)}
                  onBlur={saveTitle}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.nativeEvent.isComposing) { event.preventDefault(); event.currentTarget.blur(); }
                    if (event.key === "Escape") { event.preventDefault(); setTitle(group.title); setEditing(false); }
                  }}
                />
              ) : <h3 className="m-0 truncate font-heading text-base leading-snug font-medium">{group.title}</h3>}
            </CardTitle>
            {!editing && (
              <CardAction className="pointer-events-auto relative z-20">
                <CourseGroupActions
                  group={group}
                  lists={lists}
                  busy={busy}
                  onBeginRename={() => { setTitle(group.title); setEditing(true); }}
                  onMove={move}
                  onDisband={() => setDisbandOpen(true)}
                />
              </CardAction>
            )}
          </CardHeader>
          <CardContent className="mt-auto text-sm text-muted-foreground">{courseCountLabel(courses.length)}</CardContent>
        </Card>
      </li>
      {disbandOpen && (
        <AlertDialog open onOpenChange={(open) => !busy && setDisbandOpen(open)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Расформировать группу «{group.title}»?</AlertDialogTitle>
              <AlertDialogDescription>Курсы останутся в списке и снова будут показаны отдельно.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={busy}>Отмена</AlertDialogCancel>
              <AlertDialogAction variant="destructive" disabled={busy} aria-busy={busy || undefined} onClick={disband}>
                {busy ? <Spinner data-icon="inline-start" /> : <Ungroup data-icon="inline-start" aria-hidden="true" />}
                Расформировать
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </>
  );
}

function CourseGroupOpen({
  group, courses, lists, moveState, onClose, onEditCourse, onMoveCourse, onCreateList,
  onRemoveCourse, onRename, onMove, onDisband,
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(group.title);
  const [busy, setBusy] = useState(false);
  const [disbandOpen, setDisbandOpen] = useState(false);

  useEffect(() => { if (!editing) setTitle(group.title); }, [editing, group.title]);
  useEffect(() => {
    const closeOnEscape = (event) => {
      if (event.key === "Escape" && !editing && !disbandOpen) onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [disbandOpen, editing, onClose]);

  const saveTitle = async () => {
    const nextTitle = title.trim();
    if (!nextTitle || nextTitle === group.title) {
      setTitle(group.title);
      setEditing(false);
      return;
    }
    setBusy(true);
    const saved = await onRename(nextTitle);
    setBusy(false);
    if (saved) setEditing(false);
  };
  const move = async (list) => {
    setBusy(true);
    await onMove(list);
    setBusy(false);
  };
  const disband = async () => {
    setBusy(true);
    const removed = await onDisband();
    setBusy(false);
    if (removed) setDisbandOpen(false);
  };

  return createPortal(
    <section className="education-group-overlay rollapp-body" role="dialog" aria-modal="true" aria-label={`Группа курсов «${group.title}»`}>
      <header className="mx-auto flex min-h-24 w-full max-w-5xl items-center justify-between gap-4 py-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground"><Layers3 className="size-5" aria-hidden="true" /></span>
          <span className="grid min-w-0 gap-0.5">
            {editing ? (
              <Input
                autoFocus
                className="min-h-10 w-[min(24rem,55vw)] text-base font-semibold"
                maxLength={60}
                aria-label="Название группы курсов"
                disabled={busy}
                value={title}
                onFocus={(event) => event.currentTarget.select()}
                onChange={(event) => setTitle(event.target.value)}
                onBlur={saveTitle}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.nativeEvent.isComposing) { event.preventDefault(); event.currentTarget.blur(); }
                  if (event.key === "Escape") { event.preventDefault(); setTitle(group.title); setEditing(false); }
                }}
              />
            ) : <strong className="truncate text-base font-semibold">{group.title}</strong>}
            <small className="text-sm text-muted-foreground">{courseCountLabel(courses.length)}</small>
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {!editing && (
            <CourseGroupActions
              group={group}
              lists={lists}
              busy={busy}
              onBeginRename={() => { setTitle(group.title); setEditing(true); }}
              onMove={move}
              onDisband={() => setDisbandOpen(true)}
            />
          )}
          <Button className="size-11 rounded-full" variant="ghost" size="icon" type="button" disabled={busy} aria-label="Закрыть группу" onClick={onClose}>
            <X aria-hidden="true" />
          </Button>
        </div>
      </header>
      <ul className="mx-auto grid w-full max-w-5xl list-none gap-4 sm:grid-cols-2" aria-label={`Курсы группы «${group.title}»`}>
        {courses.map((course) => (
          <li className="min-w-0" key={course.id}>
            <CourseCard
              course={course}
              draggable={false}
              lists={lists}
              moveDisabled={Boolean(moveState.itemId) || busy}
              moving={moveState.itemId === course.id}
              removeBusy={moveState.itemId === course.id}
              onCreateList={() => onCreateList(course)}
              onEdit={onEditCourse}
              onMove={() => {}}
              onMoveToList={onMoveCourse}
              onRemoveFromGroup={onRemoveCourse}
            />
          </li>
        ))}
      </ul>
      {disbandOpen && (
        <AlertDialog open onOpenChange={(open) => !busy && setDisbandOpen(open)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Расформировать группу «{group.title}»?</AlertDialogTitle>
              <AlertDialogDescription>Курсы останутся в списке и снова будут показаны отдельно.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={busy}>Отмена</AlertDialogCancel>
              <AlertDialogAction variant="destructive" disabled={busy} aria-busy={busy || undefined} onClick={disband}>
                {busy ? <Spinner data-icon="inline-start" /> : <Ungroup data-icon="inline-start" aria-hidden="true" />}
                Расформировать
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </section>,
    document.body,
  );
}

function CourseDrawer({ course, initialListId = "", lists = [], open, onOpenChange, onSaved }) {
  const isMobile = useIsMobile();
  const formId = useId();
  const imageFileRef = useRef(null);
  const uploadedImageIdsRef = useRef(new Set());
  const [form, setForm] = useState(EMPTY_COURSE);
  const [saving, setSaving] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoError, setLogoError] = useState("");
  const [error, setError] = useState("");
  const editing = Boolean(course);
  const datesInvalid = Boolean(form.startedOn && form.completedOn && form.completedOn < form.startedOn);

  const cleanupUploadedImages = async (keepUrl = "") => {
    const keepId = uploadedImageIdFromUrl(keepUrl);
    const ids = [...uploadedImageIdsRef.current].filter((id) => id !== keepId);
    ids.forEach((id) => uploadedImageIdsRef.current.delete(id));
    await Promise.allSettled(ids.map((id) => api.delete(`/uploads/images/${encodeURIComponent(id)}`)));
  };

  useEffect(() => {
    if (!open) return;
    setForm(courseFormValues(course, initialListId));
    setSaving(false);
    setLogoUploading(false);
    setLogoError("");
    setError("");
  }, [course, initialListId, open]);

  useEffect(() => () => {
    const ids = [...uploadedImageIdsRef.current];
    uploadedImageIdsRef.current.clear();
    ids.forEach((id) => {
      fetch(`/api/uploads/images/${encodeURIComponent(id)}`, {
        method: "DELETE",
        credentials: "include",
        keepalive: true,
      }).catch(() => {});
    });
  }, []);

  const update = (field, value) => setForm((current) => ({ ...current, [field]: value }));

  const changeOpen = (nextOpen) => {
    if (saving || logoUploading) return;
    if (!nextOpen) void cleanupUploadedImages();
    onOpenChange(nextOpen);
  };

  const uploadLogo = async (file) => {
    if (!file || logoUploading || saving) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setLogoError("Подойдёт изображение JPG, PNG или WEBP.");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setLogoError("Изображение должно быть не больше 8 МБ.");
      return;
    }
    setLogoUploading(true);
    setLogoError("");
    try {
      const result = await api.uploadImage(file);
      uploadedImageIdsRef.current.add(result.id);
      update("logoUrl", result.imageUrl);
    } catch (uploadError) {
      setLogoError(uploadError.message || "Не удалось загрузить логотип.");
    } finally {
      setLogoUploading(false);
      if (imageFileRef.current) imageFileRef.current.value = "";
    }
  };

  async function submit(event) {
    event.preventDefault();
    if (datesInvalid || logoUploading) return;
    setSaving(true);
    setError("");
    try {
      const path = editing
        ? `/education/courses/${encodeURIComponent(course.id)}`
        : "/education/courses";
      const result = editing ? await api.patch(path, form) : await api.post(path, form);
      const savedLogoUrl = result.course?.logoUrl || "";
      const savedUploadId = uploadedImageIdFromUrl(savedLogoUrl);
      if (savedUploadId) uploadedImageIdsRef.current.delete(savedUploadId);
      await cleanupUploadedImages(savedLogoUrl);

      const previousLogoId = uploadedImageIdFromUrl(course?.logoUrl);
      if (previousLogoId && previousLogoId !== savedUploadId) {
        await api.delete(`/uploads/images/${encodeURIComponent(previousLogoId)}`).catch(() => {});
      }

      onSaved(result.course, result.groupChange || null);
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
      onOpenChange={changeOpen}
    >
      <DrawerContent
        className="rollapp-body"
        style={isMobile ? undefined : { "--drawer-content-width": "min(40rem, calc(100vw - 2rem))" }}
      >
        <DrawerClose
          render={<Button className="absolute top-2 right-2 z-10 size-12" variant="ghost" size="icon" type="button" disabled={saving || logoUploading} />}
          aria-label="Закрыть форму курса"
        >
          <X aria-hidden="true" />
        </DrawerClose>
        <form className="flex min-h-0 min-w-0 flex-1 flex-col" onSubmit={submit}>
          <DrawerHeader className="pr-16 text-left!">
            <DrawerTitle>{editing ? "Редактировать курс" : "Добавить курс"}</DrawerTitle>
            <DrawerDescription>
              {editing
                ? "Измените сведения о курсе, логотип, статус и материалы."
                : "Сохраните программу обучения, логотип, статус и ссылку на материалы."}
            </DrawerDescription>
          </DrawerHeader>

          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
            {error && (
              <Alert variant="destructive">
                <AlertTriangle aria-hidden="true" />
                <AlertTitle>Не удалось сохранить курс</AlertTitle>
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
                  placeholder="Например, Product Strategy"
                  value={form.title}
                  onChange={(event) => update("title", event.target.value)}
                />
              </Field>

              <Field data-invalid={Boolean(logoError)}>
                <FieldLabel htmlFor={`${formId}-logo`}>Логотип</FieldLabel>
                <div className="flex flex-wrap items-center gap-4">
                  <Button
                    className="group relative size-20 shrink-0 overflow-hidden rounded-xl p-0"
                    variant="ghost"
                    size="icon"
                    type="button"
                    disabled={saving || logoUploading}
                    aria-label={form.logoUrl ? "Заменить логотип курса" : "Загрузить логотип курса"}
                    title={form.logoUrl ? "Заменить логотип" : "Загрузить логотип"}
                    onClick={() => imageFileRef.current?.click()}
                  >
                    <CourseLogo course={form} size="form" />
                    <span
                      className={`pointer-events-none absolute inset-0 flex items-center justify-center rounded-xl bg-black/60 text-white transition-opacity ${logoUploading ? "opacity-100" : "opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100"}`}
                      aria-hidden="true"
                    >
                      {logoUploading ? <Spinner /> : <ImagePlus className="size-6" />}
                    </span>
                  </Button>
                  <div className="flex min-w-0 flex-1 flex-col items-start gap-2">
                    <Input
                      className="sr-only"
                      id={`${formId}-logo`}
                      ref={imageFileRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      tabIndex={-1}
                      onChange={(event) => uploadLogo(event.target.files?.[0])}
                    />
                    <div className="flex flex-wrap gap-2">
                      <Button
                        className="min-h-12 px-4 text-base"
                        variant="outline"
                        type="button"
                        disabled={saving || logoUploading}
                        onClick={() => imageFileRef.current?.click()}
                      >
                        {logoUploading ? <Spinner aria-hidden="true" /> : <ImagePlus data-icon="inline-start" aria-hidden="true" />}
                        {logoUploading ? "Загружаем" : form.logoUrl ? "Заменить" : "Загрузить"}
                      </Button>
                      {form.logoUrl && (
                        <Button
                          className="min-h-12 px-4 text-base"
                          variant="ghost"
                          type="button"
                          disabled={saving || logoUploading}
                          onClick={() => {
                            update("logoUrl", "");
                            setLogoError("");
                          }}
                        >
                          <Trash2 data-icon="inline-start" aria-hidden="true" />
                          Удалить
                        </Button>
                      )}
                    </div>
                    <p className="m-0 text-sm text-muted-foreground">JPG, PNG или WEBP, до 8 МБ.</p>
                  </div>
                </div>
                {logoError && <FieldError>{logoError}</FieldError>}
              </Field>

              <div className="flex flex-col gap-4">
                <Field>
                  <FieldLabel htmlFor={`${formId}-provider`}>Платформа или школа</FieldLabel>
                  <Input
                    className="min-h-12 text-base"
                    id={`${formId}-provider`}
                    maxLength={160}
                    placeholder="Coursera, Bang Bang Education"
                    value={form.provider}
                    onChange={(event) => update("provider", event.target.value)}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor={`${formId}-status`}>Статус</FieldLabel>
                  <Select value={form.status} onValueChange={(value) => update("status", value)}>
                    <SelectTrigger className="min-h-12 w-full text-base" id={`${formId}-status`}>
                      <SelectValue>{(value) => COURSE_STATUS[value]?.label || "Выберите статус"}</SelectValue>
                    </SelectTrigger>
                    <SelectContent align="start" alignItemWithTrigger={false}>
                      <SelectItem value="planned">Запланирован</SelectItem>
                      <SelectItem value="in_progress">В процессе</SelectItem>
                      <SelectItem value="completed">Завершён</SelectItem>
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

              <Field>
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

              <div className="flex flex-col gap-4">
                <Field>
                  <FieldLabel htmlFor={`${formId}-started-on`}>Дата начала</FieldLabel>
                  <Input
                    className="min-h-12 text-base"
                    id={`${formId}-started-on`}
                    type="date"
                    value={form.startedOn}
                    onChange={(event) => update("startedOn", event.target.value)}
                  />
                </Field>
                <Field data-invalid={datesInvalid}>
                  <FieldLabel htmlFor={`${formId}-completed-on`}>Дата завершения</FieldLabel>
                  <Input
                    className="min-h-12 text-base"
                    id={`${formId}-completed-on`}
                    type="date"
                    min={form.startedOn || undefined}
                    aria-invalid={datesInvalid || undefined}
                    value={form.completedOn}
                    onChange={(event) => update("completedOn", event.target.value)}
                  />
                  {datesInvalid && <FieldError>Дата завершения должна быть не раньше даты начала.</FieldError>}
                </Field>
              </div>

              <Field>
                <FieldLabel htmlFor={`${formId}-description`}>Заметки</FieldLabel>
                <Textarea
                  className="min-h-24 text-base"
                  id={`${formId}-description`}
                  rows={4}
                  maxLength={4000}
                  placeholder="Зачем проходите курс, материалы и результат"
                  value={form.description}
                  onChange={(event) => update("description", event.target.value)}
                />
              </Field>
            </FieldGroup>
          </div>

          <DrawerFooter className="border-t bg-popover pt-4 sm:flex-row sm:justify-end">
            <DrawerClose
              render={<Button className="min-h-12 px-4 text-base" variant="outline" type="button" disabled={saving || logoUploading} />}
            >
              Отмена
            </DrawerClose>
            <Button className="min-h-12 px-4 text-base" type="submit" disabled={saving || logoUploading || datesInvalid}>
              {saving && <Spinner aria-hidden="true" />}
              {saving ? "Сохраняем" : editing ? "Сохранить изменения" : "Добавить курс"}
            </Button>
          </DrawerFooter>
        </form>
      </DrawerContent>
    </Drawer>
  );
}

export function Courses() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedCourse, setSelectedCourse] = useState(null);
  const [selectedListId, setSelectedListId] = useState(UNLISTED_EDUCATION_LIST_ID);
  const [openedGroupId, setOpenedGroupId] = useState("");
  const [listDrawer, setListDrawer] = useState({ open: false, list: null, moveItem: null });
  const [moveState, setMoveState] = useState({ itemId: "", error: "", announcement: "" });
  const [groupState, setGroupState] = useState({ busy: false, itemId: "", error: "", announcement: "" });
  const [requestVersion, setRequestVersion] = useState(0);
  const [requestState, setRequestState] = useState({ loading: true, courses: [], lists: [], groups: [], error: null });
  const resolvedListId = educationListSelection(selectedListId, requestState.lists, requestState.courses);
  const selectedList = requestState.lists.find((list) => list.id === resolvedListId) || null;
  const visibleCourses = educationItemsInList(requestState.courses, resolvedListId);
  const visibleListId = educationApiListId(resolvedListId) || null;
  const visibleGroups = requestState.groups.filter((group) => group.listId === visibleListId && group.courseIds?.length >= 2);
  const groupedCourseIds = new Set(visibleGroups.flatMap((group) => group.courseIds || []));
  const ungroupedCourses = visibleCourses.filter((course) => !groupedCourseIds.has(course.id));
  const openedGroup = requestState.groups.find((group) => group.id === openedGroupId) || null;
  const openedGroupCourses = openedGroup
    ? (openedGroup.courseIds || []).map((id) => requestState.courses.find((course) => course.id === id)).filter(Boolean)
    : [];
  const cardOrder = useCardReorder({
    items: visibleCourses,
    onItemsChange: (courses) => setRequestState((state) => ({
      ...state,
      courses: mergeEducationListOrder(state.courses, courses, resolvedListId),
    })),
    persistOrder: (courseIds) => api.patch("/education/courses/reorder", {
      courseIds,
      listId: educationApiListId(resolvedListId),
    }),
    getItemLabel: (course) => `Курс «${course.title}»`,
    collectionLabel: "курсов",
    groupingEnabled: visibleCourses.length > 1 && !groupState.busy,
    onCreateGroup: createCourseGroup,
    onAddToGroup: addCourseToGroup,
  });

  useEffect(() => {
    let current = true;
    setRequestState((state) => ({ ...state, loading: true, error: null }));
    api.get("/education/courses").then(({ courses, lists, groups }) => {
      if (current) setRequestState({ loading: false, courses: sortCourses(courses || []), lists: lists || [], groups: groups || [], error: null });
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

  const openNewCourse = () => {
    setSelectedCourse(null);
    setDrawerOpen(true);
  };

  const openCourse = (course) => {
    if (cardOrder.shouldSuppressClick()) return;
    setSelectedCourse(course);
    setDrawerOpen(true);
  };

  const saveCourse = (course, groupChange = null) => {
    setRequestState((state) => ({
      ...state,
      courses: sortCourses(state.courses.some((item) => item.id === course.id)
        ? state.courses.map((item) => (item.id === course.id ? course : item))
        : [...state.courses, course]),
      groups: applyCourseGroupChange(state.groups, groupChange),
    }));
    if (groupChange?.dissolved && openedGroupId === groupChange.groupId) setOpenedGroupId("");
    setSelectedCourse(course);
  };

  const saveList = (list) => {
    setRequestState((state) => ({
      ...state,
      lists: state.lists.some((current) => current.id === list.id)
        ? state.lists.map((current) => current.id === list.id ? list : current)
        : [...state.lists, list],
    }));
    setSelectedListId(list.id);
    if (listDrawer.moveItem) void moveCourseToList(listDrawer.moveItem, list.id, list.title);
  };

  const deleteList = () => {
    const deletedListId = listDrawer.list?.id;
    setRequestState((state) => ({
      ...state,
      lists: state.lists.filter((list) => list.id !== deletedListId),
      courses: state.courses.map((course) => course.listId === deletedListId ? { ...course, listId: null } : course),
      groups: state.groups.filter((group) => group.listId !== deletedListId),
    }));
    setOpenedGroupId("");
    setSelectedListId(UNLISTED_EDUCATION_LIST_ID);
  };

  const moveCourseToList = async (course, targetListId, targetTitleOverride = "") => {
    const listId = educationApiListId(targetListId);
    if ((course.listId || "") === listId || moveState.itemId) return;
    setMoveState({ itemId: course.id, error: "", announcement: "" });
    try {
      const result = await api.patch(`/education/courses/${encodeURIComponent(course.id)}/list`, { listId });
      saveCourse(result.course, result.groupChange || null);
      const targetTitle = targetListId === UNLISTED_EDUCATION_LIST_ID
        ? "Не отсортированные"
        : targetTitleOverride || requestState.lists.find((list) => list.id === targetListId)?.title || "выбранный список";
      setMoveState({ itemId: "", error: "", announcement: `Курс «${course.title}» перемещён в список «${targetTitle}».` });
    } catch (error) {
      setMoveState({ itemId: "", error: error.message, announcement: "" });
    }
  };

  async function createCourseGroup(sourceCourseId, targetCourseId) {
    if (groupState.busy || sourceCourseId === targetCourseId) return false;
    setGroupState({ busy: true, itemId: sourceCourseId, error: "", announcement: "" });
    try {
      const result = await api.post("/education/courses/groups", {
        courseIds: [sourceCourseId, targetCourseId],
        listId: educationApiListId(resolvedListId),
      });
      setRequestState((state) => ({
        ...state,
        groups: [...state.groups.filter((group) => group.id !== result.group.id), result.group],
      }));
      setGroupState({ busy: false, itemId: "", error: "", announcement: "Группа курсов создана." });
      return true;
    } catch (error) {
      setGroupState({ busy: false, itemId: "", error: error.message, announcement: "" });
      return false;
    }
  }

  async function addCourseToGroup(courseId, groupId) {
    if (groupState.busy) return false;
    setGroupState({ busy: true, itemId: courseId, error: "", announcement: "" });
    try {
      const result = await api.post(`/education/courses/groups/${encodeURIComponent(groupId)}/courses`, { courseId });
      setRequestState((state) => ({
        ...state,
        groups: state.groups.map((group) => group.id === groupId ? { ...group, ...result.group } : group),
      }));
      setGroupState({ busy: false, itemId: "", error: "", announcement: "Курс добавлен в группу." });
      return true;
    } catch (error) {
      setGroupState({ busy: false, itemId: "", error: error.message, announcement: "" });
      return false;
    }
  }

  const renameCourseGroup = async (group, title) => {
    setGroupState({ busy: true, itemId: "", error: "", announcement: "" });
    try {
      const result = await api.patch(`/education/courses/groups/${encodeURIComponent(group.id)}`, { title });
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

  const moveCourseGroup = async (group, targetList) => {
    setGroupState({ busy: true, itemId: "", error: "", announcement: "" });
    try {
      const result = await api.patch(`/education/courses/groups/${encodeURIComponent(group.id)}/list`, {
        listId: educationApiListId(targetList.id),
      });
      const movedIds = new Set(result.group.courseIds || []);
      setRequestState((state) => ({
        ...state,
        courses: state.courses.map((course) => movedIds.has(course.id) ? { ...course, listId: result.group.listId } : course),
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

  const disbandCourseGroup = async (group) => {
    setGroupState({ busy: true, itemId: "", error: "", announcement: "" });
    try {
      await api.delete(`/education/courses/groups/${encodeURIComponent(group.id)}`);
      setRequestState((state) => ({ ...state, groups: state.groups.filter((current) => current.id !== group.id) }));
      setOpenedGroupId("");
      setGroupState({ busy: false, itemId: "", error: "", announcement: "Группа расформирована." });
      return true;
    } catch (error) {
      setGroupState({ busy: false, itemId: "", error: error.message, announcement: "" });
      return false;
    }
  };

  const removeCourseFromGroup = async (course) => {
    if (!openedGroup || groupState.busy) return false;
    setGroupState({ busy: true, itemId: course.id, error: "", announcement: "" });
    try {
      const result = await api.delete(`/education/courses/groups/${encodeURIComponent(openedGroup.id)}/courses/${encodeURIComponent(course.id)}`);
      setRequestState((state) => ({
        ...state,
        groups: applyCourseGroupChange(state.groups, {
          groupId: result.groupId,
          dissolved: result.dissolved,
          courseIds: result.courseIds,
        }),
      }));
      if (result.dissolved) setOpenedGroupId("");
      setGroupState({ busy: false, itemId: "", error: "", announcement: result.dissolved ? "Курс убран, группа расформирована." : "Курс убран из группы." });
      return true;
    } catch (error) {
      setGroupState({ busy: false, itemId: "", error: error.message, announcement: "" });
      return false;
    }
  };

  return (
    <article className="not-typeset rollapp-body mx-auto flex w-full max-w-5xl min-w-0 flex-col gap-6 pb-12" aria-labelledby="courses-title">
      <EducationSectionHeader
        title="Курсы"
        titleId="courses-title"
        selectedList={selectedList}
        onAdd={openNewCourse}
        onEditList={(list) => setListDrawer({ open: true, list, moveItem: null })}
      />

      {requestState.error && (
        <Alert variant="destructive">
          <AlertTriangle aria-hidden="true" />
          <AlertTitle>Не удалось загрузить курсы</AlertTitle>
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
          <AlertTitle>Не удалось изменить порядок курсов</AlertTitle>
          <AlertDescription>{cardOrder.orderError}</AlertDescription>
        </Alert>
      )}

      {moveState.error && (
        <Alert variant="destructive">
          <AlertTriangle aria-hidden="true" />
          <AlertTitle>Не удалось переместить курс</AlertTitle>
          <AlertDescription>{moveState.error}</AlertDescription>
        </Alert>
      )}

      {groupState.error && (
        <Alert variant="destructive">
          <AlertTriangle aria-hidden="true" />
          <AlertTitle>Не удалось изменить группу курсов</AlertTitle>
          <AlertDescription>{groupState.error}</AlertDescription>
        </Alert>
      )}

      {!requestState.loading && !requestState.error && (
        <EducationListNavigation
          items={requestState.courses}
          lists={requestState.lists}
          selectedListId={resolvedListId}
          ariaLabel="Списки курсов"
          onSelectList={(listId) => { setOpenedGroupId(""); setSelectedListId(listId); }}
          onCreateList={() => setListDrawer({ open: true, list: null, moveItem: null })}
        />
      )}

      {requestState.loading && (
        <Card>
          <CardContent className="flex min-h-48 flex-col items-center justify-center gap-3 text-center" aria-live="polite">
            <Spinner className="size-5" aria-label="Загружаем курсы" />
            <span className="text-sm text-muted-foreground">Загружаем курсы</span>
          </CardContent>
        </Card>
      )}

      {!requestState.loading && visibleCourses.length > 0 && (
        <ul ref={cardOrder.listRef} className="grid list-none gap-4 sm:grid-cols-2" aria-label="Порядок и группы курсов" aria-busy={cardOrder.orderBusy}>
          {visibleGroups.map((group) => (
            <CourseGroupTile
              key={group.id}
              group={group}
              courses={(group.courseIds || []).map((id) => requestState.courses.find((course) => course.id === id)).filter(Boolean)}
              lists={requestState.lists}
              isDropTarget={cardOrder.groupTarget === `group:${group.id}`}
              onOpen={() => setOpenedGroupId(group.id)}
              onRename={(title) => renameCourseGroup(group, title)}
              onMove={(list) => moveCourseGroup(group, list)}
              onDisband={() => disbandCourseGroup(group)}
            />
          ))}
          {ungroupedCourses.map((course) => (
            <li
              className={`education-card is-draggable min-w-0 rounded-xl ${cardOrder.draggedId === course.id ? "is-dragging" : ""} ${cardOrder.groupTarget === `card:${course.id}` ? "is-group-target" : ""}`}
              data-sortable-card-id={course.id}
              key={course.id}
              onPointerDown={(event) => cardOrder.beginPointerDrag(event, course.id)}
            >
              <CourseCard
                course={course}
                dragDescriptionId={cardOrder.descriptionId}
                lists={requestState.lists}
                moveDisabled={Boolean(moveState.itemId) || cardOrder.orderBusy}
                moving={moveState.itemId === course.id}
                onCreateList={() => setListDrawer({ open: true, list: null, moveItem: course })}
                onEdit={openCourse}
                onMove={cardOrder.moveByOffset}
                onMoveToList={moveCourseToList}
              />
            </li>
          ))}
        </ul>
      )}

      <p className="sr-only" id={cardOrder.descriptionId}>
        Нажмите, чтобы редактировать. Для группировки удерживайте карточку на центре другого курса или на группе до появления подсветки, затем отпустите. Перетаскивайте по краям или используйте клавиши со стрелками, чтобы изменить порядок.
      </p>
      <p className="sr-only" aria-live="polite">{cardOrder.announcement}</p>
      <p className="sr-only" aria-live="polite">{moveState.announcement}</p>
      <p className="sr-only" aria-live="polite">{groupState.announcement}</p>

      <CourseDrawer
        course={selectedCourse}
        initialListId={educationApiListId(resolvedListId)}
        lists={requestState.lists}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        onSaved={saveCourse}
      />
      <EducationListDrawer
        list={listDrawer.list}
        open={listDrawer.open}
        section="courses"
        itemPlural="курсы"
        onOpenChange={(open) => setListDrawer((current) => open
          ? { ...current, open: true }
          : { open: false, list: null, moveItem: null })}
        onSaved={saveList}
        onDeleted={deleteList}
      />
      {openedGroup && (
        <CourseGroupOpen
          group={openedGroup}
          courses={openedGroupCourses}
          lists={requestState.lists}
          moveState={{ ...moveState, itemId: moveState.itemId || groupState.itemId }}
          onClose={() => setOpenedGroupId("")}
          onEditCourse={openCourse}
          onMoveCourse={moveCourseToList}
          onCreateList={(course) => setListDrawer({ open: true, list: null, moveItem: course })}
          onRemoveCourse={removeCourseFromGroup}
          onRename={(title) => renameCourseGroup(openedGroup, title)}
          onMove={(list) => moveCourseGroup(openedGroup, list)}
          onDisband={() => disbandCourseGroup(openedGroup)}
        />
      )}
    </article>
  );
}
