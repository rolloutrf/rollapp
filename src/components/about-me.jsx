import { useEffect, useId, useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import aboutMeSource from "@/data/about-me.md?raw";
import { EditorDeleteAction } from "@/components/editor-delete-action";
import { InlineDocument } from "@/components/inline-document";
import {
  CareerContentError, useCareerContent,
} from "@/components/career-content";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle,
} from "@/components/form-surface";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { useIsMobile } from "@/hooks/use-mobile";
import { useSphereSharing } from "@/lib/sphere-sharing";

function AboutMeQuestionEditor({ entry, mode, onDelete, onOpenChange, onSave, open }) {
  const isMobile = useIsMobile();
  const questionId = useId();
  const descriptionId = useId();
  const [draft, setDraft] = useState({ question: "", description: "" });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const busy = saving || deleting;
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
    if (!busy) onOpenChange(nextOpen);
  };

  const submit = async (event) => {
    event.preventDefault();
    if (busy) return;
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
          render={<Button className="absolute top-2 right-2 z-10 size-12" variant="ghost" size="icon" type="button" disabled={busy} />}
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
            {editing && onDelete && <EditorDeleteAction
              label="Удалить вопрос"
              title="Удалить этот вопрос?"
              description="Вопрос и ответ будут удалены без возможности восстановления."
              disabled={saving}
              onBusyChange={setDeleting}
              onDelete={onDelete}
              onDeleted={() => onOpenChange(false)}
            />}
          </div>
          <DrawerFooter className="border-t pt-4">
            <Button className="min-h-12 text-base" type="submit" disabled={busy}>
              {saving && <Spinner data-icon="inline-start" aria-hidden="true" />}
              {saving ? "Сохраняем" : editing ? "Сохранить изменения" : "Добавить вопрос"}
            </Button>
            <DrawerClose render={<Button className="min-h-12 text-base" variant="outline" type="button" disabled={busy} />}>
              Отмена
            </DrawerClose>
          </DrawerFooter>
        </form>
      </DrawerContent>
    </Drawer>
  );
}

export function AboutMe() {
  const sharing = useSphereSharing();
  const careerContent = useCareerContent("about", aboutMeSource);
  const content = typeof careerContent.content === "string" ? careerContent.content : aboutMeSource;
  return <div className="sphere-text-page page-stack">
    <CareerContentError error={careerContent.error} onRetry={careerContent.retry} />
    {!careerContent.loading && !careerContent.error && <InlineDocument
      key={`about-${sharing.owner?.id || "self"}`} documentKey="career:about" scope="career"
      value={content} onSave={careerContent.save} label="О себе"
      readOnly={sharing.readOnly || sharing.loading || Boolean(sharing.error)}
      addBlock={[{ type: "heading", attrs: { level: 3 } }, { type: "paragraph" }]}
    />}
    {careerContent.loading && <span className="not-typeset text-muted-foreground" role="status">Загружаем…</span>}
  </div>;
}
