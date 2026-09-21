import { useEffect, useId, useState } from "react";
import { AlertTriangle, Pencil, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import aboutMeSource from "@/data/about-me.md?raw";
import { CareerIconAction } from "@/components/career-icon-action";
import {
  CareerContentError, CareerEditAction, useCareerContent,
} from "@/components/career-content";
import { MarkdownDocument } from "@/components/life-strategy";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle,
} from "@/components/ui/drawer";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { useIsMobile } from "@/hooks/use-mobile";
import { parseAboutMeMarkdown, serializeAboutMeMarkdown } from "@/lib/about-me";
import { useSphereSharing } from "@/lib/sphere-sharing";

function AboutMeQuestionEditor({ entry, mode, onOpenChange, onSave, open }) {
  const isMobile = useIsMobile();
  const questionId = useId();
  const descriptionId = useId();
  const [draft, setDraft] = useState({ question: "", description: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const editing = mode === "edit";

  useEffect(() => {
    if (!open) return;
    setDraft({
      question: entry?.question || "",
      description: entry?.description || "",
    });
    setSaving(false);
    setError("");
  }, [entry, open]);

  const changeOpen = (nextOpen) => {
    if (!saving) onOpenChange(nextOpen);
  };

  const submit = async (event) => {
    event.preventDefault();
    const nextEntry = {
      question: draft.question.trim(),
      description: draft.description.trim(),
    };
    if (!nextEntry.question || !nextEntry.description) {
      setError("Заполните вопрос и описание.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      await onSave(nextEntry);
      onOpenChange(false);
    } catch (saveError) {
      setError(saveError.message);
      setSaving(false);
    }
  };

  return (
    <Drawer open={open} showSwipeHandle swipeDirection={isMobile ? "down" : "right"} onOpenChange={changeOpen}>
      <DrawerContent
        className="rollapp-body app-drawer--document"
      >
        <DrawerClose
          render={<Button className="absolute top-2 right-2 z-10 size-12" variant="ghost" size="icon" type="button" disabled={saving} />}
          aria-label="Закрыть редактор вопроса"
        >
          <X aria-hidden="true" />
        </DrawerClose>
        <form className="flex min-h-0 min-w-0 flex-1 flex-col" onSubmit={submit}>
          <DrawerHeader className="pr-16 text-left!">
            <DrawerTitle>{editing ? "Редактировать вопрос" : "Новый вопрос"}</DrawerTitle>
            <DrawerDescription>Добавьте формулировку вопроса и развёрнутое описание.</DrawerDescription>
          </DrawerHeader>
          <div className="app-drawer-body flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
            {error && (
              <Alert variant="destructive">
                <AlertTriangle aria-hidden="true" />
                <AlertTitle>Не удалось сохранить вопрос</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor={questionId}>Вопрос</FieldLabel>
                <Input
                  id={questionId}
                  maxLength={500}
                  required
                  value={draft.question}
                  onChange={(event) => setDraft((current) => ({ ...current, question: event.target.value }))}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor={descriptionId}>Описание</FieldLabel>
                <Textarea
                  className="min-h-[50vh] resize-y text-base"
                  id={descriptionId}
                  maxLength={100_000}
                  required
                  value={draft.description}
                  onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))}
                />
                <FieldDescription>Оставьте пустую строку между абзацами. Ссылки можно добавлять в формате Markdown.</FieldDescription>
              </Field>
            </FieldGroup>
          </div>
          <DrawerFooter className="border-t pt-4">
            <Button className="min-h-12 text-base" type="submit" disabled={saving}>
              {saving && <Spinner data-icon="inline-start" aria-hidden="true" />}
              {saving ? "Сохраняем" : editing ? "Сохранить изменения" : "Добавить вопрос"}
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

export function AboutMe() {
  const { readOnly } = useSphereSharing();
  const [editor, setEditor] = useState(null);
  const [deleteIndex, setDeleteIndex] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const careerContent = useCareerContent("about", aboutMeSource);
  const content = typeof careerContent.content === "string" ? careerContent.content : aboutMeSource;
  const parsed = parseAboutMeMarkdown(content);
  const editingIndex = editor?.mode === "edit" ? editor.index : null;

  const saveQuestion = (entry) => {
    const questions = editingIndex === null
      ? [...parsed.questions, entry]
      : parsed.questions.map((question, index) => (index === editingIndex ? entry : question));
    return careerContent.save(serializeAboutMeMarkdown({ ...parsed, questions }));
  };

  const removeQuestion = async () => {
    if (deleteIndex === null) return;
    setDeleting(true);
    try {
      const questions = parsed.questions.filter((_, index) => index !== deleteIndex);
      await careerContent.save(serializeAboutMeMarkdown({ ...parsed, questions }));
      setDeleteIndex(null);
      toast.success("Вопрос удалён");
    } catch (error) {
      toast.error(error.message);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="sphere-text-page page-stack">
      <CareerEditAction
        label="Добавить"
        loading={careerContent.loading}
        showLabel
        onClick={() => setEditor({ mode: "add" })}
      />
      <CareerContentError error={careerContent.error} onRetry={careerContent.retry} />

      <section className="about-me-questions" aria-label="Вопросы обо мне">
        {parsed.preamble && (
          <MarkdownDocument source={parsed.preamble} label="О себе — введение" className="about-me-question__document career-action-copy" />
        )}
        {parsed.questions.map((entry, index) => (
          <article className="about-me-question" key={`${index}-${entry.question}`}>
            <MarkdownDocument
              source={`### ${entry.question}\n\n${entry.description}`}
              label={entry.question}
              className="about-me-question__document career-action-copy"
            />
            {!readOnly && (
              <div className="not-typeset flex shrink-0 items-center gap-1">
                <CareerIconAction
                  disabled={careerContent.loading}
                  label={`Редактировать вопрос «${entry.question}»`}
                  onClick={() => setEditor({ mode: "edit", index })}
                >
                  <Pencil aria-hidden="true" />
                </CareerIconAction>
                <CareerIconAction
                  disabled={careerContent.loading}
                  label={`Удалить вопрос «${entry.question}»`}
                  onClick={() => setDeleteIndex(index)}
                >
                  <Trash2 className="text-destructive" aria-hidden="true" />
                </CareerIconAction>
              </div>
            )}
          </article>
        ))}
      </section>

      <AboutMeQuestionEditor
        entry={editingIndex === null ? null : parsed.questions[editingIndex]}
        mode={editor?.mode || "add"}
        open={Boolean(editor)}
        onOpenChange={(open) => {
          if (!open) setEditor(null);
        }}
        onSave={saveQuestion}
      />
      {!readOnly && <AlertDialog open={deleteIndex !== null} onOpenChange={(open) => !deleting && !open && setDeleteIndex(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить этот вопрос?</AlertDialogTitle>
            <AlertDialogDescription>Вопрос и ответ будут удалены без возможности восстановления.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Отмена</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={deleting} onClick={removeQuestion}>
              {deleting ? <Spinner data-icon="inline-start" aria-hidden="true" /> : <Trash2 data-icon="inline-start" aria-hidden="true" />}
              Удалить вопрос
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>}
    </div>
  );
}
