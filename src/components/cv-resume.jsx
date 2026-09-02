import { useEffect, useId, useMemo, useState } from "react";
import {
  AlertTriangle, BriefcaseBusiness, GraduationCap, MapPin, Pencil, Plus, Trash2, X,
} from "lucide-react";
import { toast } from "sonner";
import cvSource from "@/data/cv.md?raw";
import {
  CareerContentError, CareerEditAction, useCareerContent,
} from "@/components/career-content";
import { MarkdownDocument } from "@/components/life-strategy";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle,
} from "@/components/ui/drawer";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { useIsMobile } from "@/hooks/use-mobile";
import { cvHasStructuredContent, normalizeCvContent } from "@/lib/cv";
import { useSphereSharing } from "@/lib/sphere-sharing";

const EMPLOYMENT_OPTIONS = ["Полная занятость", "Частичная занятость", "Проектная работа", "Стажировка"];
const SCHEDULE_OPTIONS = ["Полный день", "Гибкий график", "Удалённая работа", "Сменный график"];

function newEntryId(prefix) {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;
}

function editorDraft(editor, cv) {
  if (editor?.kind === "profile") {
    return {
      desiredPosition: cv.desiredPosition,
      specialization: cv.specialization,
      city: cv.city,
      salary: cv.salary,
      employment: cv.employment,
      schedule: cv.schedule,
    };
  }
  if (editor?.kind === "about") {
    return { about: cv.about, skills: cv.skills.join("\n") };
  }
  if (editor?.kind === "experience") {
    return editor.index === undefined ? {
      id: "", company: "", position: "", startDate: "", endDate: "", current: false, description: "",
    } : { ...cv.experiences[editor.index] };
  }
  if (editor?.kind === "education") {
    return editor.index === undefined ? {
      id: "", institution: "", faculty: "", specialization: "", graduationYear: "",
    } : { ...cv.education[editor.index] };
  }
  return {};
}

function CvEditor({ cv, editor, onOpenChange, onSave }) {
  const isMobile = useIsMobile();
  const formId = useId();
  const [draft, setDraft] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const open = Boolean(editor);
  const editingEntry = editor?.index !== undefined;

  useEffect(() => {
    if (!open) return;
    setDraft(editorDraft(editor, cv));
    setSaving(false);
    setError("");
  }, [cv, editor, open]);

  const update = (field, value) => setDraft((current) => ({ ...current, [field]: value }));
  const changeOpen = (nextOpen) => {
    if (!saving) onOpenChange(nextOpen);
  };

  const submit = async (event) => {
    event.preventDefault();
    if (editor.kind === "profile" && !draft.desiredPosition?.trim()) {
      setError("Укажите желаемую должность.");
      return;
    }
    if (editor.kind === "experience" && (!draft.company?.trim() || !draft.position?.trim() || !draft.startDate)) {
      setError("Укажите компанию, должность и дату начала работы.");
      return;
    }
    if (editor.kind === "education" && !draft.institution?.trim()) {
      setError("Укажите учебное заведение.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      await onSave(editor, draft);
      onOpenChange(false);
    } catch (saveError) {
      setError(saveError.message);
      setSaving(false);
    }
  };

  const titles = {
    profile: "Основная информация",
    about: "Навыки и о себе",
    experience: editingEntry ? "Редактировать место работы" : "Добавить место работы",
    education: editingEntry ? "Редактировать образование" : "Добавить образование",
  };

  return (
    <Drawer open={open} showSwipeHandle swipeDirection={isMobile ? "down" : "right"} onOpenChange={changeOpen}>
      <DrawerContent
        className="rollapp-body"
        style={isMobile ? undefined : { "--drawer-content-width": "min(52rem, calc(100vw - 2rem))" }}
      >
        <DrawerClose
          render={<Button className="absolute top-2 right-2 z-10 size-12" variant="ghost" size="icon" type="button" disabled={saving} />}
          aria-label="Закрыть редактор CV"
        >
          <X aria-hidden="true" />
        </DrawerClose>
        <form className="flex min-h-0 min-w-0 flex-1 flex-col" onSubmit={submit}>
          <DrawerHeader className="pr-16 text-left!">
            <DrawerTitle>{titles[editor?.kind] || "Редактировать CV"}</DrawerTitle>
            <DrawerDescription>Заполните поля резюме — они сохранятся отдельными разделами.</DrawerDescription>
          </DrawerHeader>
          <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-4">
            {error && (
              <Alert variant="destructive">
                <AlertTriangle aria-hidden="true" />
                <AlertTitle>Не удалось сохранить CV</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {editor?.kind === "profile" && (
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor={`${formId}-position`}>Желаемая должность</FieldLabel>
                  <Input id={`${formId}-position`} maxLength={500} required value={draft.desiredPosition || ""} onChange={(event) => update("desiredPosition", event.target.value)} />
                </Field>
                <Field>
                  <FieldLabel htmlFor={`${formId}-specialization`}>Специализация</FieldLabel>
                  <Input id={`${formId}-specialization`} maxLength={500} value={draft.specialization || ""} onChange={(event) => update("specialization", event.target.value)} />
                </Field>
                <div className="grid gap-5 sm:grid-cols-2">
                  <Field>
                    <FieldLabel htmlFor={`${formId}-city`}>Город</FieldLabel>
                    <Input id={`${formId}-city`} maxLength={240} value={draft.city || ""} onChange={(event) => update("city", event.target.value)} />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor={`${formId}-salary`}>Желаемый доход</FieldLabel>
                    <Input id={`${formId}-salary`} maxLength={120} placeholder="Например, 450 000 ₽" value={draft.salary || ""} onChange={(event) => update("salary", event.target.value)} />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor={`${formId}-employment`}>Занятость</FieldLabel>
                    <Select value={draft.employment || EMPLOYMENT_OPTIONS[0]} onValueChange={(value) => update("employment", value)}>
                      <SelectTrigger className="min-h-12 w-full text-base" id={`${formId}-employment`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent align="start" alignItemWithTrigger={false}>
                        {EMPLOYMENT_OPTIONS.map((option) => <SelectItem value={option} key={option}>{option}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor={`${formId}-schedule`}>График работы</FieldLabel>
                    <Select value={draft.schedule || SCHEDULE_OPTIONS[0]} onValueChange={(value) => update("schedule", value)}>
                      <SelectTrigger className="min-h-12 w-full text-base" id={`${formId}-schedule`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent align="start" alignItemWithTrigger={false}>
                        {SCHEDULE_OPTIONS.map((option) => <SelectItem value={option} key={option}>{option}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </Field>
                </div>
              </FieldGroup>
            )}

            {editor?.kind === "about" && (
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor={`${formId}-about`}>О себе</FieldLabel>
                  <Textarea className="min-h-52 resize-y text-base" id={`${formId}-about`} maxLength={20_000} value={draft.about || ""} onChange={(event) => update("about", event.target.value)} />
                </Field>
                <Field>
                  <FieldLabel htmlFor={`${formId}-skills`}>Ключевые навыки</FieldLabel>
                  <Textarea className="min-h-36 resize-y text-base" id={`${formId}-skills`} maxLength={20_000} value={draft.skills || ""} onChange={(event) => update("skills", event.target.value)} />
                  <FieldDescription>Указывайте каждый навык с новой строки или разделяйте запятыми.</FieldDescription>
                </Field>
              </FieldGroup>
            )}

            {editor?.kind === "experience" && (
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor={`${formId}-company`}>Компания</FieldLabel>
                  <Input id={`${formId}-company`} maxLength={240} required value={draft.company || ""} onChange={(event) => update("company", event.target.value)} />
                </Field>
                <Field>
                  <FieldLabel htmlFor={`${formId}-job-position`}>Должность</FieldLabel>
                  <Input id={`${formId}-job-position`} maxLength={240} required value={draft.position || ""} onChange={(event) => update("position", event.target.value)} />
                </Field>
                <div className="grid gap-5 sm:grid-cols-2">
                  <Field>
                    <FieldLabel htmlFor={`${formId}-start`}>Начало работы</FieldLabel>
                    <Input id={`${formId}-start`} type="month" required value={draft.startDate || ""} onChange={(event) => update("startDate", event.target.value)} />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor={`${formId}-end`}>Окончание</FieldLabel>
                    <Input id={`${formId}-end`} type="month" disabled={Boolean(draft.current)} value={draft.endDate || ""} onChange={(event) => update("endDate", event.target.value)} />
                  </Field>
                </div>
                <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border px-4 py-3">
                  <Checkbox className="size-5" checked={Boolean(draft.current)} onCheckedChange={(checked) => update("current", Boolean(checked))} aria-label="Работаю сейчас" />
                  <span>Работаю здесь сейчас</span>
                </label>
                <Field>
                  <FieldLabel htmlFor={`${formId}-experience-description`}>Обязанности и результаты</FieldLabel>
                  <Textarea className="min-h-52 resize-y text-base" id={`${formId}-experience-description`} maxLength={20_000} value={draft.description || ""} onChange={(event) => update("description", event.target.value)} />
                </Field>
              </FieldGroup>
            )}

            {editor?.kind === "education" && (
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor={`${formId}-institution`}>Учебное заведение</FieldLabel>
                  <Input id={`${formId}-institution`} maxLength={500} required value={draft.institution || ""} onChange={(event) => update("institution", event.target.value)} />
                </Field>
                <Field>
                  <FieldLabel htmlFor={`${formId}-faculty`}>Факультет</FieldLabel>
                  <Input id={`${formId}-faculty`} maxLength={500} value={draft.faculty || ""} onChange={(event) => update("faculty", event.target.value)} />
                </Field>
                <Field>
                  <FieldLabel htmlFor={`${formId}-education-specialization`}>Специальность</FieldLabel>
                  <Input id={`${formId}-education-specialization`} maxLength={500} value={draft.specialization || ""} onChange={(event) => update("specialization", event.target.value)} />
                </Field>
                <Field>
                  <FieldLabel htmlFor={`${formId}-year`}>Год окончания</FieldLabel>
                  <Input id={`${formId}-year`} inputMode="numeric" maxLength={20} placeholder="Например, 2012" value={draft.graduationYear || ""} onChange={(event) => update("graduationYear", event.target.value)} />
                </Field>
              </FieldGroup>
            )}
          </div>
          <DrawerFooter className="border-t pt-4">
            <Button className="min-h-12 text-base" type="submit" disabled={saving}>
              {saving && <Spinner data-icon="inline-start" aria-hidden="true" />}
              {saving ? "Сохраняем" : "Сохранить"}
            </Button>
            <DrawerClose render={<Button className="min-h-12 text-base" variant="outline" type="button" disabled={saving} />}>
              Отмена
            </DrawerClose>
          </DrawerFooter>
        </form>
      </DrawerContent>
    </Drawer>
  );
}

function SectionAction({ children, label, onClick }) {
  return (
    <Button className="min-h-12 px-4 text-base" variant="outline" type="button" onClick={onClick}>
      {children}
      <span>{label}</span>
    </Button>
  );
}

function ItemActions({ editLabel, onDelete, onEdit }) {
  return (
    <div className="not-typeset flex shrink-0 items-center gap-1">
      <Button className="size-12 rounded-full" variant="ghost" size="icon" type="button" aria-label={editLabel} title={editLabel} onClick={onEdit}>
        <Pencil aria-hidden="true" />
      </Button>
      <Button className="size-12 rounded-full" variant="ghost" size="icon" type="button" aria-label="Удалить" title="Удалить" onClick={onDelete}>
        <Trash2 className="text-destructive" aria-hidden="true" />
      </Button>
    </div>
  );
}

function formatMonth(value) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})$/u);
  if (!match) return value || "Дата не указана";
  return new Intl.DateTimeFormat("ru-RU", { month: "long", year: "numeric", timeZone: "UTC" })
    .format(new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1)));
}

export function CvResume() {
  const { readOnly } = useSphereSharing();
  const [editor, setEditor] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const careerContent = useCareerContent("cv", normalizeCvContent(null, cvSource));
  const cv = useMemo(() => normalizeCvContent(careerContent.content, cvSource), [careerContent.content]);
  const hasStructuredContent = cvHasStructuredContent(cv);

  const saveEditor = (activeEditor, draft) => {
    let next = { ...cv };
    if (activeEditor.kind === "profile") {
      next = {
        ...next,
        desiredPosition: draft.desiredPosition.trim(),
        specialization: draft.specialization.trim(),
        city: draft.city.trim(),
        salary: draft.salary.trim(),
        employment: draft.employment,
        schedule: draft.schedule,
      };
    } else if (activeEditor.kind === "about") {
      const skills = draft.skills.split(/[\n,]+/u).map((skill) => skill.trim()).filter(Boolean);
      next = { ...next, about: draft.about.trim(), skills: [...new Set(skills)].slice(0, 100) };
    } else if (activeEditor.kind === "experience") {
      const experience = {
        ...draft,
        id: draft.id || newEntryId("experience"),
        company: draft.company.trim(),
        position: draft.position.trim(),
        endDate: draft.current ? "" : draft.endDate,
        description: draft.description.trim(),
      };
      next = {
        ...next,
        experiences: activeEditor.index === undefined
          ? [...next.experiences, experience]
          : next.experiences.map((item, index) => (index === activeEditor.index ? experience : item)),
      };
    } else if (activeEditor.kind === "education") {
      const education = {
        ...draft,
        id: draft.id || newEntryId("education"),
        institution: draft.institution.trim(),
        faculty: draft.faculty.trim(),
        specialization: draft.specialization.trim(),
        graduationYear: draft.graduationYear.trim(),
      };
      next = {
        ...next,
        education: activeEditor.index === undefined
          ? [...next.education, education]
          : next.education.map((item, index) => (index === activeEditor.index ? education : item)),
      };
    }
    return careerContent.save(next);
  };

  const removeItem = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const key = deleteTarget.kind === "experience" ? "experiences" : "education";
      await careerContent.save({ ...cv, [key]: cv[key].filter((_, index) => index !== deleteTarget.index) });
      setDeleteTarget(null);
    } catch (error) {
      toast.error(error.message);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <CareerEditAction
        label={hasStructuredContent ? "Редактировать основное" : "Заполнить CV"}
        loading={careerContent.loading}
        onClick={() => setEditor({ kind: "profile" })}
      />
      <CareerContentError error={careerContent.error} onRetry={careerContent.retry} />

      <article className="cv-builder rollapp-body" aria-label="CV">
        <header className="cv-builder__hero">
          <div className="cv-builder__hero-copy">
            <span className="cv-builder__eyebrow">Желаемая должность</span>
            <h1>{cv.desiredPosition || "Укажите желаемую должность"}</h1>
            {cv.specialization && <p>{cv.specialization}</p>}
            <div className="cv-builder__meta">
              {cv.city && <span><MapPin aria-hidden="true" />{cv.city}</span>}
              <span>{cv.employment}</span>
              <span>{cv.schedule}</span>
            </div>
          </div>
          {cv.salary && <strong className="cv-builder__salary">{cv.salary}</strong>}
        </header>

        <section className="cv-builder__section" aria-labelledby="cv-experience-title">
          <header className="cv-builder__section-header">
            <div>
              <span className="cv-builder__section-icon"><BriefcaseBusiness aria-hidden="true" /></span>
              <h2 id="cv-experience-title">Опыт работы</h2>
            </div>
            {!readOnly && <SectionAction label="Добавить" onClick={() => setEditor({ kind: "experience" })}><Plus aria-hidden="true" /></SectionAction>}
          </header>
          {cv.experiences.length ? (
            <div className="cv-builder__timeline">
              {cv.experiences.map((experience, index) => (
                <article className="cv-builder__entry" key={experience.id}>
                  <div className="cv-builder__entry-period">
                    <span>{formatMonth(experience.startDate)}</span>
                    <span>—</span>
                    <span>{experience.current ? "по настоящее время" : formatMonth(experience.endDate)}</span>
                  </div>
                  <div className="cv-builder__entry-copy">
                    <h3>{experience.position}</h3>
                    <strong>{experience.company}</strong>
                    {experience.description && <p>{experience.description}</p>}
                  </div>
                  {!readOnly && (
                    <ItemActions
                      editLabel={`Редактировать опыт в ${experience.company}`}
                      onEdit={() => setEditor({ kind: "experience", index })}
                      onDelete={() => setDeleteTarget({ kind: "experience", index })}
                    />
                  )}
                </article>
              ))}
            </div>
          ) : <p className="cv-builder__empty">Добавьте компании, должности, периоды работы и ключевые результаты.</p>}
        </section>

        <section className="cv-builder__section" aria-labelledby="cv-education-title">
          <header className="cv-builder__section-header">
            <div>
              <span className="cv-builder__section-icon"><GraduationCap aria-hidden="true" /></span>
              <h2 id="cv-education-title">Образование</h2>
            </div>
            {!readOnly && <SectionAction label="Добавить" onClick={() => setEditor({ kind: "education" })}><Plus aria-hidden="true" /></SectionAction>}
          </header>
          {cv.education.length ? (
            <div className="cv-builder__education-list">
              {cv.education.map((education, index) => (
                <article className="cv-builder__education" key={education.id}>
                  <span>{education.graduationYear || "—"}</span>
                  <div>
                    <h3>{education.institution}</h3>
                    {education.faculty && <p>{education.faculty}</p>}
                    {education.specialization && <p>{education.specialization}</p>}
                  </div>
                  {!readOnly && (
                    <ItemActions
                      editLabel={`Редактировать образование «${education.institution}»`}
                      onEdit={() => setEditor({ kind: "education", index })}
                      onDelete={() => setDeleteTarget({ kind: "education", index })}
                    />
                  )}
                </article>
              ))}
            </div>
          ) : <p className="cv-builder__empty">Добавьте учебное заведение, факультет и специальность.</p>}
        </section>

        <section className="cv-builder__section" aria-labelledby="cv-about-title">
          <header className="cv-builder__section-header">
            <div><h2 id="cv-about-title">Навыки и о себе</h2></div>
            {!readOnly && <SectionAction label="Редактировать" onClick={() => setEditor({ kind: "about" })}><Pencil aria-hidden="true" /></SectionAction>}
          </header>
          {cv.skills.length > 0 && <div className="cv-builder__skills">{cv.skills.map((skill) => <span key={skill}>{skill}</span>)}</div>}
          {cv.about ? <p className="cv-builder__about">{cv.about}</p> : <p className="cv-builder__empty">Расскажите о профессиональном фокусе и добавьте ключевые навыки.</p>}
        </section>

        {cv.legacyMarkdown && (
          <details className="cv-builder__legacy" open={!hasStructuredContent}>
            <summary>Исходный текст CV</summary>
            <MarkdownDocument source={cv.legacyMarkdown} label="Исходный текст CV" className="cv-builder__legacy-document" />
          </details>
        )}
      </article>

      <CvEditor cv={cv} editor={editor} onOpenChange={(open) => !open && setEditor(null)} onSave={saveEditor} />

      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => !deleting && !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить запись из CV?</AlertDialogTitle>
            <AlertDialogDescription>Запись будет удалена без возможности восстановления.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Отмена</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={deleting} onClick={removeItem}>
              {deleting ? <Spinner data-icon="inline-start" /> : <Trash2 data-icon="inline-start" aria-hidden="true" />}
              Удалить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
