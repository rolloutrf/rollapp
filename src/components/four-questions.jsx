import { lazy, Suspense, useEffect, useId, useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import { IDENTITY_QUESTION_TITLES } from "../../shared/identity-questions.js";
import { InlineSaveStatus, useDocumentDraft } from "@/components/inline-document";
import { CareerContentError, useCareerContent } from "@/components/career-content";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle,
} from "@/components/form-surface";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { useIsMobile } from "@/hooks/use-mobile";
import { useSphereSharing } from "@/lib/sphere-sharing";

const DEFAULT_CONTENT = {
  questions: IDENTITY_QUESTION_TITLES.map(title => ({ title, paragraphs: [] })),
};

const FourQuestionRichEditor = lazy(() => import("@/components/four-question-rich-editor"));

function FourQuestionEditor({ onOpenChange, onSave, open, question, questionIndex }) {
  const isMobile = useIsMobile();
  const formId = useId();
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const questionTitle = IDENTITY_QUESTION_TITLES[questionIndex] || "Вопрос";

  useEffect(() => {
    if (!open) return;
    setDraft(question?.paragraphs?.join("\n\n") || "");
    setSaving(false);
    setError("");
  }, [open, question]);

  const changeOpen = (nextOpen) => {
    if (!saving) onOpenChange(nextOpen);
  };

  const submit = async (event) => {
    event.preventDefault();
    const paragraphs = draft.split(/\n\s*\n/).map((paragraph) => paragraph.trim()).filter(Boolean);
    if (!paragraphs.length) {
      setError("Заполните ответ на вопрос.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await onSave(questionIndex, paragraphs);
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
          aria-label="Закрыть редактирование ответа"
        >
          <X aria-hidden="true" />
        </DrawerClose>
        <form className="flex min-h-0 min-w-0 flex-1 flex-col" onSubmit={submit}>
          <DrawerHeader className="pr-16 text-left!">
            <DrawerTitle>{questionTitle}</DrawerTitle>
            <DrawerDescription>Измените ответ на выбранный вопрос.</DrawerDescription>
          </DrawerHeader>
          <div className="app-drawer-body flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
            {error && (
              <Alert variant="destructive">
                <AlertTriangle aria-hidden="true" />
                <AlertTitle>Не удалось сохранить изменения</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor={formId}>Ответ</FieldLabel>
                <Textarea
                  className="min-h-52 resize-y text-base"
                  id={formId}
                  maxLength={60_000}
                  required
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                />
                <FieldDescription>Оставьте пустую строку между абзацами.</FieldDescription>
              </Field>
            </FieldGroup>
          </div>
          <DrawerFooter>
            <Button className="min-h-12 text-base" type="submit" disabled={saving}>
              {saving && <Spinner data-icon="inline-start" aria-hidden="true" />}
              {saving ? "Сохраняем" : "Сохранить изменения"}
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

function FourQuestionDocument({ content, onSave, readOnly }) {
  const autosave = useDocumentDraft(content, onSave, "identity:four-questions", !readOnly);
  return <>
    <article className="four-questions typeset typeset-rollapp typeset-document" aria-label="Четыре вопроса">
      <Suspense fallback={<span role="status">Загружаем текст…</span>}>
        <FourQuestionRichEditor value={readOnly ? content : autosave.draft} readOnly={readOnly} onBlur={autosave.flush} onChange={readOnly ? undefined : autosave.change} />
      </Suspense>
    </article>
    {!readOnly && <InlineSaveStatus autosave={autosave} />}
  </>;
}

export function FourQuestions() {
  const sharing = useSphereSharing();
  const document = useCareerContent("four-questions", DEFAULT_CONTENT, "identity");
  return <div className="sphere-text-page page-stack">
    <CareerContentError error={document.error} onRetry={document.retry} />
    {document.loading && <span role="status">Загружаем…</span>}
    {!document.loading && !document.error && <FourQuestionDocument key={`four-questions:${sharing.owner?.id || "self"}`}
      content={document.content} onSave={document.save} readOnly={sharing.readOnly || sharing.loading || Boolean(sharing.error)} />}
  </div>;
}
